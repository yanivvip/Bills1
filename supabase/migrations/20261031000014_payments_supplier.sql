-- Partial payments (a statement can be paid in several installments) and supplier bills for reconciliation.

-- ── Payments ─────────────────────────────────────────────────────────────
alter table public.statements add column paid_agorot bigint not null default 0 check (paid_agorot >= 0);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  statement_id  uuid not null references public.statements (id) on delete cascade,
  amount_agorot bigint not null check (amount_agorot > 0),
  paid_on       date not null,
  method        text not null check (method in ('bit', 'transfer', 'cash', 'other')),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null
);
create index payments_statement_idx on public.payments (statement_id);
create index payments_org_idx on public.payments (org_id);

-- statements.paid_agorot / paid_on / paid_method are derived from the payments: fully paid = the payments cover the total.
create function public.statement_refresh_paid(p_statement uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint;
  v_paid bigint;
  v_last record;
begin
  select total_agorot into v_total from public.statements where id = p_statement;
  if v_total is null then return; end if;
  select coalesce(sum(amount_agorot), 0) into v_paid from public.payments where statement_id = p_statement;
  select paid_on, method into v_last from public.payments where statement_id = p_statement order by paid_on desc, created_at desc limit 1;
  update public.statements
     set paid_agorot = v_paid,
         paid_on     = case when v_paid >= v_total and v_total > 0 then v_last.paid_on end,
         paid_method = case when v_paid >= v_total and v_total > 0 then v_last.method end
   where id = p_statement;
end $$;

create function public.payments_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.statement_refresh_paid(coalesce(new.statement_id, old.statement_id));
  return null;
end $$;
create trigger payments_after_change after insert or update or delete on public.payments
  for each row execute function public.payments_after_change();

-- existing statements marked paid become one full payment
insert into public.payments (org_id, statement_id, amount_agorot, paid_on, method)
  select org_id, id, total_agorot, paid_on, paid_method from public.statements where paid_on is not null and total_agorot > 0;

alter table public.payments enable row level security;
create policy payments_select on public.payments
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin()
         or exists (select 1 from public.statements s where s.id = statement_id and public.is_contract_renter(s.contract_id)));
-- payments are written only through the functions below

create function public.add_payment(p_statement uuid, p_amount bigint, p_paid_on date, p_method text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_total bigint;
  v_paid bigint;
  v_id uuid;
begin
  select org_id, total_agorot, paid_agorot into v_org, v_total, v_paid from public.statements where id = p_statement;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if v_paid + p_amount > v_total then raise exception 'payment exceeds the balance'; end if;
  insert into public.payments (org_id, statement_id, amount_agorot, paid_on, method, note)
    values (v_org, p_statement, p_amount, p_paid_on, p_method, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;

create function public.delete_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.payments where id = p_payment;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'forbidden'; end if;
  delete from public.payments where id = p_payment;
end $$;

-- Compatibility: "mark paid" = pay the remaining balance on that date; "unpaid" (nulls) = remove all payments.
create or replace function public.set_statement_paid(p_statement uuid, p_paid_on date, p_method text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_remaining bigint;
begin
  select org_id, total_agorot - paid_agorot into v_org, v_remaining from public.statements where id = p_statement;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'forbidden'; end if;
  if (p_paid_on is null) <> (p_method is null) then raise exception 'date and method go together'; end if;
  if p_paid_on is null then
    delete from public.payments where statement_id = p_statement;
  elsif v_remaining > 0 then
    insert into public.payments (org_id, statement_id, amount_agorot, paid_on, method) values (v_org, p_statement, v_remaining, p_paid_on, p_method);
  end if;
end $$;

-- a month with any payment cannot be re-opened
create or replace function public.reopen_month(p_billing uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.billing_periods;
begin
  select * into v from public.billing_periods where id = p_billing;
  if v.id is null or not public.can_manage_org(v.org_id) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.statements where billing_id = p_billing and paid_agorot > 0) then
    raise exception 'month has paid statements';
  end if;
  delete from public.billing_periods where id = p_billing;  -- statements cascade
  update public.readings set status = 'submitted'
   where org_id = v.org_id and period = v.period
     and meter_id in (select id from public.meters where property_id = v.property_id);
  insert into public.audit_log (actor_id, org_id, action, details)
    values ((select auth.uid()), v.org_id, 'billing.reopen', jsonb_build_object('property', v.property_id, 'period', v.period));
end $$;

revoke execute on function public.add_payment(uuid, bigint, date, text, text), public.delete_payment(uuid),
  public.statement_refresh_paid(uuid), public.payments_after_change() from public, anon;
grant  execute on function public.add_payment(uuid, bigint, date, text, text), public.delete_payment(uuid) to authenticated;

-- ── Supplier bills (what the utility companies charged the landlord for the month) ──
create table public.supplier_bills (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  property_id   uuid not null,
  period        date not null check (extract(day from period) = 1),
  kind          text not null check (kind in ('electricity', 'water')),
  amount_agorot bigint not null check (amount_agorot >= 0),
  updated_at    timestamptz not null default now(),
  unique (property_id, period, kind),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade
);
create index supplier_bills_org_idx on public.supplier_bills (org_id);
alter table public.supplier_bills enable row level security;
create policy supplier_bills_select on public.supplier_bills
  for select to authenticated using (public.is_org_member(org_id) or public.is_platform_admin());
create policy supplier_bills_write on public.supplier_bills
  for all to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));
