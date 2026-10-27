-- Properties, units, rental contracts and renters.
-- Model: organization (landlord) -> property -> unit -> contract -> renters.
-- Only the landlord (org owner) manages data. Renters log in separately and see only their own contract's data.
-- Renters are NOT org memberships; they are linked through contract_renters, so they never see the whole org.
-- Note: org_role 'manager' and 'tenant' stay in the enum (Postgres cannot drop enum values) but are unused.

-- ── Tables ───────────────────────────────────────────────────────────────
-- (id, org_id) unique keys + composite FKs guarantee a child row always has the same org_id as its parent.

create table public.properties (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 120),
  address    text,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index properties_org_idx on public.properties (org_id);

create table public.units (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  property_id uuid not null,
  name        text not null check (length(trim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (property_id, name),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade
);
create index units_org_idx on public.units (org_id);

create table public.contracts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  unit_id      uuid not null,
  start_date   date not null,
  end_date     date,
  status       text not null default 'active' check (status in ('active', 'ended')),
  rent_agorot  bigint check (rent_agorot >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (id, org_id),
  foreign key (unit_id, org_id) references public.units (id, org_id) on delete cascade
);
create index contracts_org_idx on public.contracts (org_id);
-- A unit has at most one active contract; ended ones stay as history.
create unique index contracts_one_active_per_unit on public.contracts (unit_id) where status = 'active';

create table public.contract_renters (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  contract_id uuid not null,
  email       text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  full_name   text,
  user_id     uuid references auth.users (id) on delete set null, -- filled when the renter signs up with that email
  created_at  timestamptz not null default now(),
  unique (contract_id, email),
  foreign key (contract_id, org_id) references public.contracts (id, org_id) on delete cascade
);
create index contract_renters_org_idx  on public.contract_renters (org_id);
create index contract_renters_user_idx on public.contract_renters (user_id);

-- ── Helper functions (SECURITY DEFINER so policies can call them without recursion) ──

-- True if the signed-in user is a renter on any contract in the org.
create function public.is_org_renter(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_renters r
    where r.org_id = p_org and r.user_id = (select auth.uid())
  );
$$;

create function public.is_contract_renter(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_renters r
    where r.contract_id = p_contract and r.user_id = (select auth.uid())
  );
$$;

-- True if the user rents (has a contract on) this unit. Used by later tables (meters, readings).
create function public.is_unit_renter(p_unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_renters r
    join public.contracts c on c.id = r.contract_id
    where c.unit_id = p_unit and r.user_id = (select auth.uid())
  );
$$;

create function public.is_property_renter(p_property uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contract_renters r
    join public.contracts c on c.id = r.contract_id
    join public.units u on u.id = c.unit_id
    where u.property_id = p_property and r.user_id = (select auth.uid())
  );
$$;

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.properties       enable row level security;
alter table public.units            enable row level security;
alter table public.contracts        enable row level security;
alter table public.contract_renters enable row level security;

-- Renters can also read their organization's row (name only is needed by the UI).
drop policy orgs_select on public.organizations;
create policy orgs_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_org_renter(id) or public.is_platform_admin());

-- properties
create policy properties_select on public.properties
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_property_renter(id) or public.is_platform_admin());
create policy properties_write on public.properties
  for all to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- units
create policy units_select on public.units
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_unit_renter(id) or public.is_platform_admin());
create policy units_write on public.units
  for all to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- contracts
create policy contracts_select on public.contracts
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_contract_renter(id) or public.is_platform_admin());
create policy contracts_write on public.contracts
  for all to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- contract_renters: the landlord manages them; a renter sees the renters on their own contracts.
create policy contract_renters_select on public.contract_renters
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_contract_renter(contract_id) or public.is_platform_admin());
create policy contract_renters_write on public.contract_renters
  for all to authenticated
  using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- Renters may not change their own link (user_id / email); only the landlord can.
-- (No update/insert/delete policy exists for renters, so RLS already blocks it.)

-- ── RPC: link a signed-in user to the contracts they were invited to ─────
-- Call after every sign-in. Only works for a confirmed email, so nobody can claim
-- an invitation by signing up with someone else's address.

create function public.claim_renter_invites()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_count integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select lower(email) into v_email from auth.users
   where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  with claimed as (
    update public.contract_renters set user_id = v_uid
     where email = v_email and user_id is null
     returning org_id, contract_id
  ), logged as (
    insert into public.audit_log (actor_id, org_id, action, details)
    select v_uid, org_id, 'renter.claim', jsonb_build_object('contract', contract_id) from claimed
  )
  select count(*) into v_count from claimed;
  return v_count;
end $$;

-- ── Grants: new functions are callable by signed-in users only ───────────
revoke execute on function
  public.is_org_renter(uuid), public.is_contract_renter(uuid),
  public.is_unit_renter(uuid), public.is_property_renter(uuid),
  public.claim_renter_invites()
from public, anon;
grant execute on function
  public.is_org_renter(uuid), public.is_contract_renter(uuid),
  public.is_unit_renter(uuid), public.is_property_renter(uuid),
  public.claim_renter_invites()
to authenticated;
