create table public.tenant_product_delete_pins (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.tenant_product_delete_pins enable row level security;
revoke all on public.tenant_product_delete_pins from public, anon, authenticated;

create or replace function public.save_tenant_product_delete_pin(p_tenant_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_tenant uuid;
begin
  select tm.tenant_id into current_tenant
  from public.tenant_members tm
  where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
    and tm.role in ('owner', 'admin', 'manager');
  if current_tenant is null then
    raise exception 'Store manager access required';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{6}$' then
    raise exception 'The product deletion PIN must contain 6 digits';
  end if;
  insert into public.tenant_product_delete_pins (tenant_id, pin_hash)
  values (current_tenant, public.crypt(p_pin, public.gen_salt('bf')))
  on conflict (tenant_id) do update set
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked_at = null,
    updated_at = now();
end;
$$;
revoke all on function public.save_tenant_product_delete_pin(uuid, text) from public, anon;
grant execute on function public.save_tenant_product_delete_pin(uuid, text) to authenticated;

create or replace function public.delete_tenant_product_with_pin(p_product_id uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  current_tenant uuid;
  member_role text;
  pin_record public.tenant_product_delete_pins%rowtype;
begin
  select p.tenant_id into current_tenant
  from public.products p where p.id = p_product_id for update;
  if current_tenant is null then
    raise exception 'Product not found';
  end if;
  select tm.role::text into member_role
  from public.tenant_members tm
  where tm.tenant_id = current_tenant and tm.user_id = auth.uid();
  if member_role is null then
    raise exception 'Store membership required';
  end if;
  if exists (select 1 from public.inventory_receipts r where r.product_id = p_product_id) then
    raise exception 'Product has registered fiscal receipts and cannot be deleted';
  end if;
  if member_role = 'staff' then
    select * into pin_record from public.tenant_product_delete_pins
    where tenant_id = current_tenant for update;
    if not found or pin_record.locked_at is not null then return false; end if;
    if pin_record.pin_hash <> public.crypt(coalesce(p_pin, ''), pin_record.pin_hash) then
      update public.tenant_product_delete_pins
      set failed_attempts = failed_attempts + 1,
          locked_at = case when failed_attempts + 1 >= 5 then now() else null end,
          updated_at = now()
      where tenant_id = current_tenant;
      return false;
    end if;
  elsif member_role not in ('owner', 'admin', 'manager') then
    raise exception 'Product deletion is not allowed for this role';
  end if;
  delete from public.products where id = p_product_id and tenant_id = current_tenant;
  return found;
end;
$$;
revoke all on function public.delete_tenant_product_with_pin(uuid, text) from public, anon;
grant execute on function public.delete_tenant_product_with_pin(uuid, text) to authenticated;

create table public.order_delivery_pins (
  order_id uuid primary key references public.orders(id) on delete cascade,
  pin_code text not null check (pin_code ~ '^[0-9]{4}$'),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  verified_at timestamptz
);
alter table public.order_delivery_pins enable row level security;
revoke all on public.order_delivery_pins from public, anon, authenticated;

create or replace function public.generate_order_confirmation_pin()
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  random_bytes bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  random_value bigint;
begin
  random_value := get_byte(random_bytes, 0)::bigint * 16777216
    + get_byte(random_bytes, 1)::bigint * 65536
    + get_byte(random_bytes, 2)::bigint * 256
    + get_byte(random_bytes, 3)::bigint;
  return lpad((random_value % 10000)::text, 4, '0');
end;
$$;
revoke all on function public.generate_order_confirmation_pin() from public, anon, authenticated;

create or replace function public.create_order_delivery_pin()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_delivery_pins (order_id, pin_code)
  values (new.id, public.generate_order_confirmation_pin());
  return new;
end;
$$;
revoke all on function public.create_order_delivery_pin() from public, anon, authenticated;
create trigger orders_create_delivery_pin
  after insert on public.orders
  for each row execute function public.create_order_delivery_pin();

insert into public.order_delivery_pins (order_id, pin_code)
select o.id, public.generate_order_confirmation_pin()
from public.orders o
where o.status not in ('delivered', 'cancelled')
on conflict (order_id) do nothing;

create or replace function public.get_my_order_confirmation_pins(p_order_ids uuid[])
returns table (order_id uuid, pin_code text)
language sql stable security definer set search_path = '' as $$
  select pins.order_id, pins.pin_code
  from public.order_delivery_pins pins
  join public.orders o on o.id = pins.order_id
  where o.customer_id = auth.uid()
    and o.id = any(coalesce(p_order_ids, '{}'::uuid[]))
    and o.payment_status = 'paid'
    and pins.verified_at is null
    and pins.failed_attempts < 5
    and (o.status = 'delivery' or (o.is_pickup and o.status = 'awaiting_pickup'));
$$;
revoke all on function public.get_my_order_confirmation_pins(uuid[]) from public, anon;
grant execute on function public.get_my_order_confirmation_pins(uuid[]) to authenticated;

create or replace function public.consume_order_confirmation_pin(p_order_id uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  pin_record public.order_delivery_pins%rowtype;
begin
  select * into pin_record from public.order_delivery_pins
  where order_id = p_order_id for update;
  if not found or pin_record.verified_at is not null or pin_record.failed_attempts >= 5 then
    return false;
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' or pin_record.pin_code <> p_pin then
    update public.order_delivery_pins
    set failed_attempts = failed_attempts + 1
    where order_id = p_order_id;
    return false;
  end if;
  update public.order_delivery_pins set verified_at = now() where order_id = p_order_id;
  return true;
end;
$$;
revoke all on function public.consume_order_confirmation_pin(uuid, text) from public, anon, authenticated;

create or replace function public.update_store_order_status(p_order_id uuid, p_next_status public.order_status)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_order public.orders%rowtype;
begin
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = current_order.tenant_id and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'manager', 'staff')
  ) then raise exception 'Store team access required'; end if;
  if current_order.payment_status <> 'paid' then
    raise exception 'Payment must be confirmed before preparing the order';
  end if;
  if current_order.status = 'approved' and p_next_status = 'separating' then
    update public.orders set status = p_next_status where id = p_order_id;
  elsif current_order.status = 'separating' and p_next_status = 'checking' then
    update public.orders set status = p_next_status where id = p_order_id;
  elsif current_order.status = 'checking' and current_order.is_pickup and p_next_status = 'awaiting_pickup' then
    update public.orders set status = p_next_status where id = p_order_id;
  else
    raise exception 'Invalid order status transition';
  end if;
end;
$$;
revoke all on function public.update_store_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.update_store_order_status(uuid, public.order_status) to authenticated;

create or replace function public.complete_pickup_with_pin(p_order_id uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  current_order public.orders%rowtype;
begin
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = current_order.tenant_id and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'manager', 'staff')
  ) then raise exception 'Store team access required'; end if;
  if not current_order.is_pickup or current_order.status <> 'awaiting_pickup'
    or current_order.payment_status <> 'paid' then
    raise exception 'Order is not ready for paid counter pickup';
  end if;
  if not public.consume_order_confirmation_pin(p_order_id, p_pin) then return false; end if;
  update public.orders set status = 'delivered' where id = p_order_id;
  return true;
end;
$$;
revoke all on function public.complete_pickup_with_pin(uuid, text) from public, anon;
grant execute on function public.complete_pickup_with_pin(uuid, text) to authenticated;

drop function public.complete_delivery(uuid, text, numeric, text, text);
create or replace function public.complete_delivery(
  p_order_id uuid,
  p_note text,
  p_amount_received numeric,
  p_payment_method text,
  p_proof_path text,
  p_confirmation_pin text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  current_order public.orders%rowtype;
  current_user_id uuid := auth.uid();
  received_amount numeric(10,2) := coalesce(p_amount_received, 0);
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if current_user_id is null then raise exception 'Courier authentication required'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'Delivery note must contain at most 1000 characters'; end if;
  if received_amount < 0 then raise exception 'Received amount cannot be negative'; end if;
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = current_order.tenant_id and tm.user_id = current_user_id and tm.role = 'courier'
  ) or current_order.courier_id is distinct from current_user_id then
    raise exception 'Only the assigned courier can complete this delivery';
  end if;
  if current_order.status <> 'delivery' or current_order.is_pickup then raise exception 'Order is not in delivery'; end if;
  if received_amount > current_order.total then raise exception 'Received amount cannot exceed the order total'; end if;
  if current_order.payment_status = 'paid' and received_amount > 0 then raise exception 'This order is already paid through Asaas'; end if;
  if current_order.payment_status <> 'paid' and received_amount <> current_order.total then
    raise exception 'Record the full order total received before completing an unpaid order';
  end if;
  if received_amount > 0 and p_payment_method not in ('cash', 'card', 'pix') then
    raise exception 'Choose how the delivery amount was received';
  end if;
  if received_amount = 0 and p_payment_method is not null then
    raise exception 'Payment method must be empty when no amount was received';
  end if;
  if p_proof_path is not null and (
    p_proof_path !~ ('^tenants/' || current_order.tenant_id::text || '/delivery-proofs/' || p_order_id::text || '/[^/]+$')
    or not exists (select 1 from storage.objects so where so.bucket_id = 'delivery-proofs' and so.name = p_proof_path)
  ) then raise exception 'Delivery proof is invalid or unavailable'; end if;
  if not public.consume_order_confirmation_pin(p_order_id, p_confirmation_pin) then return false; end if;

  insert into public.delivery_completions (
    order_id, tenant_id, courier_id, note, amount_received, payment_method, proof_path
  ) values (
    p_order_id, current_order.tenant_id, current_user_id, normalized_note,
    received_amount, case when received_amount > 0 then p_payment_method else null end, p_proof_path
  );
  update public.orders set status = 'delivered' where id = p_order_id;
  update public.order_status_events set note = normalized_note
  where id = (
    select ose.id from public.order_status_events ose
    where ose.order_id = p_order_id and ose.status = 'delivered' and ose.actor_id = current_user_id
    order by ose.created_at desc, ose.id desc limit 1
  );
  return true;
end;
$$;
revoke all on function public.complete_delivery(uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.complete_delivery(uuid, text, numeric, text, text, text) to authenticated;

create or replace function public.accept_delivery(p_order_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_order public.orders%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Courier authentication required'; end if;
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = current_order.tenant_id and tm.user_id = current_user_id and tm.role = 'courier'
  ) then raise exception 'Courier is not assigned to this store'; end if;
  if current_order.is_pickup then raise exception 'Customer pickup orders cannot be assigned for delivery'; end if;
  if current_order.payment_status <> 'paid' or current_order.status <> 'checking' then
    raise exception 'The store must confirm payment and finish checking the order first';
  end if;
  if current_order.courier_id is not null and current_order.courier_id <> current_user_id then
    raise exception 'Order has already been accepted by another courier';
  end if;
  update public.orders set courier_id = current_user_id, status = 'delivery' where id = p_order_id;
end;
$$;
revoke all on function public.accept_delivery(uuid) from public, anon;
grant execute on function public.accept_delivery(uuid) to authenticated;