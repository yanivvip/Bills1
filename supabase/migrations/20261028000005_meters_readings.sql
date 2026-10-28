-- Meters and monthly readings.
-- A meter belongs to a property: unit_id is null for a main (building) meter, set for a unit's sub-meter.
-- A reading is the meter's cumulative value for one month (period = first day of the month).
-- Renters (active contract on the unit) may report and edit readings of their unit's meters until approved;
-- the landlord manages everything. Approval/billing comes in a later step.

alter table public.units add constraint units_id_property_key unique (id, property_id);

create table public.meters (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  property_id uuid not null,
  unit_id     uuid,
  kind        text not null check (kind in ('electricity', 'water')),
  name        text not null check (length(trim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade,
  -- ignored when unit_id is null (main meter); otherwise the unit must belong to the same property
  foreign key (unit_id, property_id) references public.units (id, property_id) on delete cascade
);
create index meters_org_idx  on public.meters (org_id);
create index meters_unit_idx on public.meters (unit_id);

create table public.readings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  meter_id     uuid not null,
  period       date not null check (extract(day from period) = 1),
  value        numeric(12, 3) not null check (value >= 0),
  status       text not null default 'submitted' check (status in ('submitted', 'approved')),
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  note         text,
  photo_path   text,
  unique (meter_id, period),
  -- NO ACTION (not CASCADE): deleting a meter that has readings is refused instead of silently erasing history
  foreign key (meter_id, org_id) references public.meters (id, org_id)
);
create index readings_org_period_idx on public.readings (org_id, period);

-- Remember who last changed a reading's value, and when.
create function public.readings_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.value is distinct from old.value then
    new.submitted_by := auth.uid();
    new.submitted_at := now();
  end if;
  return new;
end $$;
create trigger readings_touch before update on public.readings
  for each row execute function public.readings_touch();

-- ── Helper functions ─────────────────────────────────────────────────────

-- True if the signed-in user is a renter on an ACTIVE contract of this unit.
create function public.is_active_unit_renter(p_unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_renters r
    join public.contracts c on c.id = r.contract_id
    where c.unit_id = p_unit and c.status = 'active' and r.user_id = (select auth.uid())
  );
$$;

create function public.is_meter_renter(p_meter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meters m
    where m.id = p_meter and m.unit_id is not null and public.is_active_unit_renter(m.unit_id)
  );
$$;

revoke execute on function public.is_active_unit_renter(uuid), public.is_meter_renter(uuid) from public, anon;
grant  execute on function public.is_active_unit_renter(uuid), public.is_meter_renter(uuid) to authenticated;

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.meters   enable row level security;
alter table public.readings enable row level security;

create policy meters_select on public.meters
  for select to authenticated
  using (public.is_org_member(org_id)
         or (unit_id is not null and public.is_active_unit_renter(unit_id))
         or public.is_platform_admin());
create policy meters_write on public.meters
  for all to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

create policy readings_select on public.readings
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_meter_renter(meter_id) or public.is_platform_admin());

create policy readings_write_landlord on public.readings
  for all to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- Renters: add and edit readings of their own unit's meters, only while not approved.
create policy readings_insert_renter on public.readings
  for insert to authenticated
  with check (status = 'submitted' and submitted_by = (select auth.uid()) and public.is_meter_renter(meter_id));
create policy readings_update_renter on public.readings
  for update to authenticated
  using (status = 'submitted' and public.is_meter_renter(meter_id))
  with check (status = 'submitted' and public.is_meter_renter(meter_id));
