-- Landlord settings (alerts, photo retention) and the fixed charges that can change from month to month.

-- One row per organization; a missing row means the defaults below.
create table public.org_settings (
  org_id                 uuid primary key references public.organizations (id) on delete cascade,
  remind_monthly         boolean  not null default true,
  remind_day             smallint not null default 1  check (remind_day between 1 and 28),
  usage_alert            boolean  not null default true,
  usage_threshold_pct    smallint not null default 30 check (usage_threshold_pct between 5 and 500),
  contract_alert         boolean  not null default true,
  contract_alert_days    smallint not null default 60 check (contract_alert_days between 1 and 365),
  photo_retention_months smallint not null default 6  check (photo_retention_months between 0 and 120), -- 0 = keep forever
  updated_at             timestamptz not null default now()
);
alter table public.org_settings enable row level security;
create policy org_settings_select on public.org_settings
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy org_settings_write on public.org_settings
  for all to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

-- The electricity and water standing charges of one month. A month without a row uses the latest earlier row,
-- or the property tariff when there is none, so a change holds for the following months until it is changed again.
create table public.monthly_fixed (
  property_id       uuid not null,
  org_id            uuid not null,
  period            date not null check (extract(day from period) = 1),
  electricity_fixed bigint not null default 0 check (electricity_fixed >= 0),  -- agorot
  water_fixed       bigint not null default 0 check (water_fixed >= 0),        -- agorot
  updated_at        timestamptz not null default now(),
  primary key (property_id, period),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade
);
alter table public.monthly_fixed enable row level security;
create policy monthly_fixed_select on public.monthly_fixed
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy monthly_fixed_write on public.monthly_fixed
  for all to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));
