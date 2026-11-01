create or replace function public.get_tenant_sales_analytics(
  p_tenant_id uuid,
  p_days integer default 14
)
returns table (
  sales_date date,
  paid_revenue numeric,
  pending_revenue numeric,
  paid_orders bigint,
  pending_orders bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  day_count integer := coalesce(p_days, 14);
  start_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_tenant_member(p_tenant_id) and not public.is_vancely_admin() then
    raise exception 'Store membership required';
  end if;
  if day_count < 7 or day_count > 90 then
    raise exception 'Analytics period must be between 7 and 90 days';
  end if;
  start_date := (now() at time zone 'UTC')::date - (day_count - 1);

  return query
  with days as (
    select series.day_value::date as day
    from generate_series(start_date::timestamp, (now() at time zone 'UTC')::date::timestamp, interval '1 day') as series(day_value)
  ), totals as (
    select (orders.created_at at time zone 'UTC')::date as day,
      coalesce(sum(orders.total) filter (where orders.payment_status = 'paid'), 0) as paid_revenue,
      coalesce(sum(orders.total) filter (where orders.payment_status = 'pending'), 0) as pending_revenue,
      count(*) filter (where orders.payment_status = 'paid') as paid_orders,
      count(*) filter (where orders.payment_status = 'pending') as pending_orders
    from public.orders orders
    where orders.tenant_id = p_tenant_id
      and orders.created_at >= start_date::timestamp at time zone 'UTC'
      and orders.created_at < ((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC'
      and orders.status <> 'cancelled'
    group by (orders.created_at at time zone 'UTC')::date
  )
  select days.day, coalesce(totals.paid_revenue, 0), coalesce(totals.pending_revenue, 0),
    coalesce(totals.paid_orders, 0), coalesce(totals.pending_orders, 0)
  from days left join totals on totals.day = days.day
  order by days.day;
end;
$$;

revoke all on function public.get_tenant_sales_analytics(uuid, integer) from public, anon;
grant execute on function public.get_tenant_sales_analytics(uuid, integer) to authenticated;