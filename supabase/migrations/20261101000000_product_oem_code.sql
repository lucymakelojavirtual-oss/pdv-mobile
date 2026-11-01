alter table public.products
  add column if not exists oem_code text not null default ''
    check (char_length(oem_code) <= 80);

grant select (oem_code) on public.products to anon, authenticated;