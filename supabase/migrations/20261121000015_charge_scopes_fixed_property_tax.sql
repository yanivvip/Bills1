-- Calculation fixes from the PM's review: charges are split instead of billed in full to every unit, fixed charges for
-- water too and with a choice of who shares them, recurring charges, property tax (monthly or bimonthly) and sewage.

-- ── Charges: who pays, and whether the charge repeats every month ────────
alter table public.charges
  add column scope     text    not null default 'unit' check (scope in ('all', 'units', 'unit')),
  add column recurring boolean not null default false;
-- before this change a charge with no unit was billed in full to every unit; as a split total it becomes "the units share it"
update public.charges set scope = 'units' where unit_id is null;
alter table public.charges add constraint charges_scope_unit check ((scope = 'unit') = (unit_id is not null));

-- ── Tariffs: water fixed charge, who shares each fixed charge, sewage rate, property-tax schedule ──
alter table public.tariffs
  add column water_fixed             bigint  not null default 0 check (water_fixed >= 0),   -- agorot per month, whole property
  add column electricity_fixed_scope text    not null default 'units' check (electricity_fixed_scope in ('all', 'units', 'landlord')),
  add column water_fixed_scope       text    not null default 'units' check (water_fixed_scope in ('all', 'units', 'landlord')),
  add column sewage_rate             numeric(12, 4) not null default 0 check (sewage_rate >= 0),  -- agorot per m3
  add column property_tax_every      smallint not null default 1 check (property_tax_every in (1, 2)),  -- months between property-tax bills
  add column property_tax_anchor     date check (property_tax_anchor is null or extract(day from property_tax_anchor) = 1);

-- ── Units: property tax per bill (a different amount for each unit, not split) ──
alter table public.units add column property_tax_agorot bigint not null default 0 check (property_tax_agorot >= 0);

-- ── Sewage: the water quantity on the property-tax voucher, entered per unit and month ──
create table public.sewage_entries (
  property_id uuid not null,
  org_id      uuid not null,
  unit_id     uuid not null,
  period      date not null check (extract(day from period) = 1),
  qty         numeric(10, 3) not null check (qty >= 0),   -- m3
  updated_at  timestamptz not null default now(),
  primary key (unit_id, period),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade,
  foreign key (unit_id, property_id) references public.units (id, property_id) on delete cascade
);
create index sewage_entries_property_idx on public.sewage_entries (property_id, period);
alter table public.sewage_entries enable row level security;
create policy sewage_entries_select on public.sewage_entries
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy sewage_entries_write on public.sewage_entries
  for all to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));
