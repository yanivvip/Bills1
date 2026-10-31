-- Step B: tariffs per property, one-off charges, monthly approval (with a frozen snapshot) and bill statements.
-- The bill itself is computed in the app by @bills/engine; the database stores what the landlord approved.

-- ── Per-unit billing settings ────────────────────────────────────────────
alter table public.units
  add column community_fee_agorot bigint  not null default 0 check (community_fee_agorot >= 0),
  add column water_quota          numeric(8, 3) not null default 0 check (water_quota >= 0), -- m3/month at tariff A
  add column is_residual          boolean not null default false;  -- consumption = main meter minus the other units
create unique index units_one_residual_per_property on public.units (property_id) where is_residual;

-- ── Tariffs (one row per property; the approved snapshot is kept with each month) ──
create table public.tariffs (
  property_id            uuid primary key,
  org_id                 uuid not null,
  electricity_rate       numeric(12, 4) not null default 0 check (electricity_rate >= 0),   -- agorot per kWh
  electricity_fixed      bigint         not null default 0 check (electricity_fixed >= 0),  -- agorot per month, whole property
  water_rate_a           numeric(12, 4) not null default 0 check (water_rate_a >= 0),       -- agorot per m3 within the quota
  water_rate_b           numeric(12, 4) not null default 0 check (water_rate_b >= 0),       -- agorot per m3 above the quota
  updated_at             timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade
);
create index tariffs_org_idx on public.tariffs (org_id);

-- ── One-off charges for a month (unit_id null = every billed unit) ───────
create table public.charges (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  property_id  uuid not null,
  unit_id      uuid,
  period       date not null check (extract(day from period) = 1),
  description  text not null check (length(trim(description)) between 1 and 200),
  amount       bigint not null check (amount <> 0),  -- agorot; negative = credit
  created_at   timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade,
  foreign key (unit_id, property_id) references public.units (id, property_id) on delete cascade
);
create index charges_property_period_idx on public.charges (property_id, period);

-- ── Approved months and their statements ─────────────────────────────────
create table public.billing_periods (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  property_id  uuid not null,
  period       date not null check (extract(day from period) = 1),
  tariff       jsonb not null,           -- snapshot: later tariff changes never alter this month
  approved_at  timestamptz not null default now(),
  approved_by  uuid default auth.uid() references auth.users (id) on delete set null,
  unique (property_id, period),
  unique (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade
);

create table public.statements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  billing_id    uuid not null,
  unit_id       uuid not null,
  contract_id   uuid not null,
  period        date not null,
  total_agorot  bigint not null check (total_agorot >= 0),
  lines         jsonb not null,
  paid_on       date,
  paid_method   text check (paid_method in ('bit', 'transfer', 'cash', 'other')),
  unique (billing_id, unit_id),
  foreign key (billing_id, org_id) references public.billing_periods (id, org_id) on delete cascade,
  foreign key (unit_id, org_id) references public.units (id, org_id) on delete cascade,
  foreign key (contract_id, org_id) references public.contracts (id, org_id),
  check ((paid_on is null) = (paid_method is null))
);
create index statements_org_idx      on public.statements (org_id);
create index statements_contract_idx on public.statements (contract_id);

-- ── Row Level Security ───────────────────────────────────────────────────
alter table public.tariffs         enable row level security;
alter table public.charges         enable row level security;
alter table public.billing_periods enable row level security;
alter table public.statements      enable row level security;

create policy tariffs_select on public.tariffs
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy tariffs_write on public.tariffs
  for all to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

create policy charges_select on public.charges
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy charges_write on public.charges
  for all to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- billing_periods and statements are written only by the functions below.
create policy billing_periods_select on public.billing_periods
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());

-- A renter sees only the statements of contracts they are on.
create policy statements_select on public.statements
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_contract_renter(contract_id) or public.is_platform_admin());

-- ── Functions ────────────────────────────────────────────────────────────

-- Approve a month: store the statements and the tariff snapshot, and lock the month's readings.
-- p_statements: [{unit_id, total, lines:[{type, amount, ...}]}]; the app computes them with @bills/engine.
create function public.approve_month(p_property uuid, p_period date, p_statements jsonb, p_tariff jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
  v_st jsonb;
  v_contract uuid;
  v_total bigint;
begin
  select org_id into v_org from public.properties where id = p_property;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'forbidden'; end if;
  if extract(day from p_period) <> 1 then raise exception 'period must be the first day of a month'; end if;
  if jsonb_typeof(p_statements) <> 'array' or jsonb_array_length(p_statements) = 0 then raise exception 'no statements'; end if;
  if exists (select 1 from public.billing_periods where property_id = p_property and period = p_period) then
    raise exception 'month already approved';
  end if;

  insert into public.billing_periods (org_id, property_id, period, tariff)
    values (v_org, p_property, p_period, p_tariff) returning id into v_id;

  for v_st in select * from jsonb_array_elements(p_statements) loop
    select c.id into v_contract
      from public.contracts c join public.units u on u.id = c.unit_id
     where c.unit_id = (v_st->>'unit_id')::uuid and c.status = 'active' and u.property_id = p_property;
    if v_contract is null then raise exception 'unit has no active contract'; end if;

    select coalesce(sum((l->>'amount')::bigint), 0) into v_total from jsonb_array_elements(v_st->'lines') l;
    if v_total <> (v_st->>'total')::bigint then raise exception 'statement total does not match its lines'; end if;

    insert into public.statements (org_id, billing_id, unit_id, contract_id, period, total_agorot, lines)
      values (v_org, v_id, (v_st->>'unit_id')::uuid, v_contract, p_period, v_total, v_st->'lines');
  end loop;

  update public.readings set status = 'approved'
   where org_id = v_org and period = p_period
     and meter_id in (select id from public.meters where property_id = p_property);

  insert into public.audit_log (actor_id, org_id, action, details)
    values ((select auth.uid()), v_org, 'billing.approve', jsonb_build_object('property', p_property, 'period', p_period));
  return v_id;
end $$;

-- Re-open an approved month (to correct a mistake). Refused once any statement has been paid.
create function public.reopen_month(p_billing uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.billing_periods;
begin
  select * into v from public.billing_periods where id = p_billing;
  if v.id is null or not public.can_manage_org(v.org_id) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.statements where billing_id = p_billing and paid_on is not null) then
    raise exception 'month has paid statements';
  end if;
  delete from public.billing_periods where id = p_billing;  -- statements cascade
  update public.readings set status = 'submitted'
   where org_id = v.org_id and period = v.period
     and meter_id in (select id from public.meters where property_id = v.property_id);
  insert into public.audit_log (actor_id, org_id, action, details)
    values ((select auth.uid()), v.org_id, 'billing.reopen', jsonb_build_object('property', v.property_id, 'period', v.period));
end $$;

-- Mark a statement paid (date + method) or unpaid (both null).
create function public.set_statement_paid(p_statement uuid, p_paid_on date, p_method text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.statements where id = p_statement;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'forbidden'; end if;
  if (p_paid_on is null) <> (p_method is null) then raise exception 'date and method go together'; end if;
  update public.statements set paid_on = p_paid_on, paid_method = p_method where id = p_statement;
end $$;

revoke execute on function public.approve_month(uuid, date, jsonb, jsonb), public.reopen_month(uuid),
  public.set_statement_paid(uuid, date, text) from public, anon;
grant  execute on function public.approve_month(uuid, date, jsonb, jsonb), public.reopen_month(uuid),
  public.set_statement_paid(uuid, date, text) to authenticated;
