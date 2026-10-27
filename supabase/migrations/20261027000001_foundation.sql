-- Foundation: organizations, memberships, platform admins, impersonation, audit log.
-- Every customer-owned table added later must carry org_id and use is_org_member()/can_manage_org().

create type public.org_role   as enum ('owner', 'manager', 'tenant');
create type public.org_status as enum ('pilot', 'active', 'suspended');

-- ── Tables ───────────────────────────────────────────────────────────────

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) between 1 and 120),
  status           public.org_status not null default 'pilot',
  cohort           text,
  retention_months integer not null default 6 check (retention_months >= 0), -- 0 = keep images forever
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.org_role not null,
  display_name text,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.impersonation_sessions (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references auth.users (id) on delete cascade,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  target_user_id uuid references auth.users (id) on delete set null,
  reason         text not null check (length(trim(reason)) >= 3),
  mode           text not null default 'read_only' check (mode in ('read_only', 'full')),
  started_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  ended_at       timestamptz
);
create index impersonation_active_idx on public.impersonation_sessions (admin_id, org_id) where ended_at is null;

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users (id) on delete set null,
  org_id     uuid references public.organizations (id) on delete set null,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, created_at desc);

-- ── Helper functions (SECURITY DEFINER so RLS policies can call them safely) ──

create function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

-- True for a super admin with a live impersonation session on the org.
-- p_write = true additionally requires the session to be in 'full' mode.
create function public.has_active_impersonation(p_org uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() and exists (
    select 1 from public.impersonation_sessions s
    where s.admin_id = (select auth.uid())
      and s.org_id = p_org
      and s.ended_at is null
      and s.expires_at > now()
      and (not p_write or s.mode = 'full')
  );
$$;

create function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  ) or public.has_active_impersonation(p_org, false);
$$;

-- Owner/manager of the org (or super admin impersonating in full mode).
create function public.can_manage_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role in ('owner', 'manager')
  ) or public.has_active_impersonation(p_org, true);
$$;

create function public.is_org_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) or public.has_active_impersonation(p_org, true);
$$;

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.platform_admins        enable row level security;
alter table public.organizations          enable row level security;
alter table public.memberships            enable row level security;
alter table public.impersonation_sessions enable row level security;
alter table public.audit_log              enable row level security;

-- platform_admins: you can only see your own row (lets the client know if it is a super admin). No client writes.
create policy platform_admins_self on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- organizations
create policy orgs_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());
create policy orgs_update on public.organizations
  for update to authenticated
  using (public.is_org_owner(id) or public.is_platform_admin())
  with check (public.is_org_owner(id) or public.is_platform_admin());
-- inserts/deletes only through RPCs / service role.

-- Non-admins may only rename their org; status, cohort and retention are admin-controlled.
create function public.protect_org_admin_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin()
     and (new.status, new.cohort, new.retention_months, new.created_by)
         is distinct from (old.status, old.cohort, old.retention_months, old.created_by) then
    raise exception 'only platform admins can change status, cohort or retention';
  end if;
  return new;
end $$;
create trigger organizations_protect before update on public.organizations
  for each row execute function public.protect_org_admin_columns();

-- memberships
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(org_id) or public.is_platform_admin());
create policy memberships_write on public.memberships
  for all to authenticated
  using (public.is_org_owner(org_id) or public.is_platform_admin())
  with check (public.is_org_owner(org_id) or public.is_platform_admin());

-- impersonation sessions: an admin sees only their own; writes through RPCs only.
create policy impersonation_own on public.impersonation_sessions
  for select to authenticated using (admin_id = (select auth.uid()) and public.is_platform_admin());

-- audit log: platform admins see all; owners see their org. Writes through RPCs only.
create policy audit_select on public.audit_log
  for select to authenticated
  using (public.is_platform_admin() or (org_id is not null and public.is_org_owner(org_id)));

-- ── RPCs ─────────────────────────────────────────────────────────────────

create function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.organizations (name, created_by) values (p_name, v_uid) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.audit_log (actor_id, org_id, action, details)
    values (v_uid, v_org, 'org.create', jsonb_build_object('name', p_name));
  return v_org;
end $$;

create function public.start_impersonation(
  p_org uuid, p_reason text, p_mode text default 'read_only',
  p_minutes integer default 60, p_target_user uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_mode not in ('read_only', 'full') then raise exception 'invalid mode'; end if;
  -- one live session per admin: end any previous ones
  update public.impersonation_sessions set ended_at = now() where admin_id = v_uid and ended_at is null;
  insert into public.impersonation_sessions (admin_id, org_id, target_user_id, reason, mode, expires_at)
    values (v_uid, p_org, p_target_user, p_reason, p_mode, now() + make_interval(mins => least(greatest(p_minutes, 5), 120)))
    returning id into v_id;
  insert into public.audit_log (actor_id, org_id, action, details)
    values (v_uid, p_org, 'impersonation.start',
            jsonb_build_object('session', v_id, 'reason', p_reason, 'mode', p_mode, 'target_user', p_target_user));
  return v_id;
end $$;

create function public.end_impersonation(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  update public.impersonation_sessions set ended_at = now()
   where id = p_session and admin_id = v_uid and ended_at is null
   returning org_id into v_org;
  if v_org is not null then
    insert into public.audit_log (actor_id, org_id, action, details)
      values (v_uid, v_org, 'impersonation.end', jsonb_build_object('session', p_session));
  end if;
end $$;

-- Only signed-in users may call the RPCs / helpers; never anonymous callers.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_platform_admin(), public.has_active_impersonation(uuid, boolean),
  public.is_org_member(uuid), public.can_manage_org(uuid), public.is_org_owner(uuid),
  public.create_organization(text),
  public.start_impersonation(uuid, text, text, integer, uuid),
  public.end_impersonation(uuid)
to authenticated;
