alter table public.orders
  add column if not exists delivery_route_geometry jsonb,
  add column if not exists delivery_eta_seconds integer check (delivery_eta_seconds is null or delivery_eta_seconds >= 0);

create or replace function public.set_order_delivery_route_metadata()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  origin_cep text;
  destination_cep text;
begin
  if new.is_pickup or new.delivery_address is null then
    new.delivery_route_geometry := null;
    new.delivery_eta_seconds := null;
    return new;
  end if;

  select regexp_replace(coalesce(t.address ->> 'postal_code', ''), '\D', '', 'g')
  into origin_cep
  from public.tenants t
  where t.id = new.tenant_id;

  destination_cep := regexp_replace(coalesce(new.delivery_address ->> 'postal_code', ''), '\D', '', 'g');

  select route.geometry, route.duration_seconds::integer
  into new.delivery_route_geometry, new.delivery_eta_seconds
  from public.delivery_routes_cache route
  where route.tenant_id = new.tenant_id
    and route.origin_cep = origin_cep
    and route.destination_cep = destination_cep;

  return new;
end;
$$;

drop trigger if exists orders_delivery_route_metadata_before_insert on public.orders;
create trigger orders_delivery_route_metadata_before_insert
  before insert on public.orders
  for each row execute function public.set_order_delivery_route_metadata();

update public.orders current_order
set delivery_route_geometry = route.geometry,
    delivery_eta_seconds = route.duration_seconds::integer
from public.tenants tenant, public.delivery_routes_cache route
where current_order.tenant_id = tenant.id
  and route.tenant_id = current_order.tenant_id
  and route.origin_cep = regexp_replace(coalesce(tenant.address ->> 'postal_code', ''), '\D', '', 'g')
  and route.destination_cep = regexp_replace(coalesce(current_order.delivery_address ->> 'postal_code', ''), '\D', '', 'g')
  and not current_order.is_pickup
  and current_order.delivery_address is not null;