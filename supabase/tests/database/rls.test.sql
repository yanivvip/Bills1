-- Database security tests (pgTAP). Run with: supabase test db
-- Everything runs in one transaction that is rolled back, so no data is left behind.
begin;
select plan(65);

-- ── Fixtures (as the postgres superuser) ─────────────────────────────────
insert into auth.users (id, email, email_confirmed_at, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'landlord-a@test.dev', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'landlord-b@test.dev', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'renter-1@test.dev',   now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'renter-2@test.dev',   now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@test.dev',      now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e1', 'newcomer@test.dev',   now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000d1');

insert into public.organizations (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Org A'),
  ('10000000-0000-0000-0000-00000000000b', 'Org B');
insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'owner');

insert into public.properties (id, org_id, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Building A'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Building B');
-- Org A: two units; renter-1 rents unit 1, renter-2 rents unit 2 (newcomer is invited on unit 2, not signed up yet).
insert into public.units (id, org_id, property_id, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Apt 1'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Apt 2'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'B Apt');
insert into public.contracts (id, org_id, unit_id, start_date) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '2026-01-01'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '2026-01-01');
insert into public.contract_renters (org_id, contract_id, email, user_id) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', 'renter-1@test.dev', '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000002', 'renter-2@test.dev', '00000000-0000-0000-0000-0000000000c2'),
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000002', 'newcomer@test.dev', null);
insert into public.meters (id, org_id, property_id, unit_id, kind, name) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'electricity', 'Unit 1 electricity'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', 'electricity', 'Unit 2 electricity'),
  ('50000000-0000-0000-0000-0000000000a0', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', null, 'water', 'Main water');

-- Impersonate a user the way PostgREST does: set the JWT claims, then switch to the authenticated role.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $fn$;
grant execute on function pg_temp.act_as(uuid) to public;

-- ── Landlord isolation ───────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.properties), 1, 'landlord A sees only their own property');
select is((select count(*)::int from public.units), 2, 'landlord A sees only their own units');
select is((select count(*)::int from public.meters), 3, 'landlord A sees all meters of their org');
select throws_ok(
  $q$insert into public.properties (org_id, name) values ('10000000-0000-0000-0000-00000000000b', 'Hijack')$q$,
  null, null, 'landlord A cannot create a property in org B');
select throws_ok(
  $q$insert into public.units (org_id, property_id, name) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', 'Cross')$q$,
  null, null, 'a unit cannot point at a property of another org (composite FK)');
select results_eq(
  $q$ with u as (update public.properties set name = 'Hacked' where id = '20000000-0000-0000-0000-00000000000b' returning 1) select count(*)::int from u $q$,
  $q$ values (0) $q$, 'landlord A cannot update org B data');

-- ── Renter isolation ─────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.units), 1, 'renter 1 sees only their own unit');
select is((select count(*)::int from public.contracts), 1, 'renter 1 sees only their own contract');
select is((select count(*)::int from public.meters), 1, 'renter 1 sees only their unit meter (not main, not other units)');
select throws_ok(
  $q$insert into public.properties (org_id, name) values ('10000000-0000-0000-0000-00000000000a', 'Renter property')$q$,
  null, null, 'a renter cannot add properties');
select results_eq(
  $q$ with u as (update public.contracts set rent_agorot = 1 where id = '40000000-0000-0000-0000-000000000001' returning 1) select count(*)::int from u $q$,
  $q$ values (0) $q$, 'a renter cannot edit the contract');

-- ── Readings: renter ─────────────────────────────────────────────────────
select lives_ok(
  $q$insert into public.readings (org_id, meter_id, period, value) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', '2026-10-01', 100)$q$,
  'renter can report a reading for their own unit meter');
select throws_ok(
  $q$insert into public.readings (org_id, meter_id, period, value) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002', '2026-10-01', 5)$q$,
  null, null, 'renter cannot report for another unit');
select throws_ok(
  $q$insert into public.readings (org_id, meter_id, period, value) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a0', '2026-10-01', 5)$q$,
  null, null, 'renter cannot report for the main meter');
select results_eq(
  $q$ with u as (update public.readings set value = 120 where meter_id = '50000000-0000-0000-0000-000000000001' returning 1) select count(*)::int from u $q$,
  $q$ values (1) $q$, 'renter can correct their reading while it is only submitted');
select throws_ok(
  $q$update public.readings set status = 'approved' where meter_id = '50000000-0000-0000-0000-000000000001'$q$,
  null, null, 'renter cannot approve their own reading');

-- ── Readings: landlord approves, then renter is locked out ───────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $q$insert into public.readings (org_id, meter_id, period, value) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a0', '2026-10-01', 55)$q$,
  'landlord can enter a main meter reading');
select lives_ok(
  $q$update public.readings set status = 'approved' where meter_id = '50000000-0000-0000-0000-000000000001'$q$,
  'landlord can approve a reading');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select results_eq(
  $q$ with u as (update public.readings set value = 999 where meter_id = '50000000-0000-0000-0000-000000000001' returning 1) select count(*)::int from u $q$,
  $q$ values (0) $q$, 'renter cannot change an approved reading');

-- ── Invitations ──────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is(public.claim_renter_invites(), 1, 'a new user is linked to the contract they were invited to');
select is((select count(*)::int from public.contracts), 1, 'after claiming, the renter sees that contract');

-- ── Super_User ───────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($q$select public.admin_set_super_user('00000000-0000-0000-0000-0000000000a1', true)$q$,
  null, 'forbidden', 'a landlord cannot make anyone a Super_User');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($q$select public.admin_set_super_user('00000000-0000-0000-0000-0000000000d1', false)$q$,
  null, 'cannot remove the last Super_User', 'the last Super_User cannot be removed');
select lives_ok($q$select public.admin_set_super_user('00000000-0000-0000-0000-0000000000a1', true)$q$,
  'a Super_User can grant Super_User to someone else');

-- ── A landlord cannot be a renter in their own organization ──────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($q$insert into public.contract_renters (org_id, contract_id, email) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', 'landlord-a@test.dev')$q$,
  null, 'landlord_cannot_be_renter', 'a landlord cannot add themselves as a renter of their own organization');
select lives_ok($q$insert into public.contract_renters (org_id, contract_id, email) values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', 'other@test.dev')$q$,
  'other emails can still be added as renters');

-- ── Super_User removes a renter ──────────────────────────────────────────
reset role;
select set_config('t.rid', (select id::text from public.contract_renters where user_id = '00000000-0000-0000-0000-0000000000c1'), false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($q$select public.admin_remove_renter(current_setting('t.rid')::uuid)$q$,
  null, 'forbidden', 'a landlord cannot use the admin renter removal');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($q$select public.admin_remove_renter(current_setting('t.rid')::uuid)$q$, 'a Super_User removes one renter from one rental');
reset role;
select is((select count(*)::int from public.contract_renters where user_id = '00000000-0000-0000-0000-0000000000c1'), 0, 'the user is no longer a renter there');

-- ── Super_User units overview ────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($q$select * from public.admin_list_units()$q$, null, 'forbidden', 'a landlord cannot list all units');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.admin_list_units()), 3, 'a Super_User sees the units of every organization');

-- ── Billing: tariffs, approval, statements ───────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$select public.approve_month('20000000-0000-0000-0000-00000000000a', '2026-10-01',
  '[{"unit_id":"30000000-0000-0000-0000-000000000001","total":1500,"lines":[{"type":"electricity","amount":1000},{"type":"community","amount":500}]},
    {"unit_id":"30000000-0000-0000-0000-000000000002","total":700,"lines":[{"type":"community","amount":700}]}]'::jsonb, '{"electricityRate":64}'::jsonb)$q$,
  'a landlord approves a month');
select throws_ok($q$select public.approve_month('20000000-0000-0000-0000-00000000000a', '2026-10-01',
  '[{"unit_id":"30000000-0000-0000-0000-000000000001","total":1,"lines":[{"type":"community","amount":1}]}]'::jsonb, '{}'::jsonb)$q$,
  null, 'month already approved', 'a month cannot be approved twice');
select throws_ok($q$select public.approve_month('20000000-0000-0000-0000-00000000000a', '2026-09-01',
  '[{"unit_id":"30000000-0000-0000-0000-000000000001","total":999,"lines":[{"type":"community","amount":1}]}]'::jsonb, '{}'::jsonb)$q$,
  null, 'statement total does not match its lines', 'a statement whose total does not match its lines is refused');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.statements), 0, 'another landlord sees no statements');
select throws_ok($q$select public.approve_month('20000000-0000-0000-0000-00000000000a', '2026-08-01',
  '[{"unit_id":"30000000-0000-0000-0000-000000000001","total":1,"lines":[{"type":"community","amount":1}]}]'::jsonb, '{}'::jsonb)$q$,
  null, 'forbidden', 'another landlord cannot approve a month for this property');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select sum(total_agorot)::int from public.statements), 700, 'a renter sees only the statement of their own contract');
select throws_ok($q$select public.set_statement_paid((select id from public.statements limit 1), '2026-10-05', 'cash')$q$,
  null, 'forbidden', 'a renter cannot mark a statement paid');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$select public.set_statement_paid((select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001'), '2026-10-05', 'bit')$q$,
  'a landlord marks a statement paid');
select throws_ok($q$select public.reopen_month((select id from public.billing_periods limit 1))$q$,
  null, 'month has paid statements', 'a month with a paid statement cannot be re-opened');
select lives_ok($q$select public.set_statement_paid((select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001'), null, null)$q$,
  'a statement can be marked unpaid again');
select lives_ok($q$select public.reopen_month((select id from public.billing_periods limit 1))$q$, 'an unpaid month can be re-opened');
select is((select count(*)::int from public.statements), 0, 're-opening removes the statements');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($q$insert into public.tariffs (property_id, org_id, electricity_rate) values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 64)$q$,
  '42501', null, 'another landlord cannot set tariffs on this property');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$insert into public.tariffs (property_id, org_id, electricity_rate) values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 64)$q$,
  'a landlord sets tariffs');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.tariffs), 0, 'a renter cannot read tariffs');

-- ── Partial payments and supplier bills ──────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$select public.approve_month('20000000-0000-0000-0000-00000000000a', '2026-07-01',
  '[{"unit_id":"30000000-0000-0000-0000-000000000001","total":1500,"lines":[{"type":"community","amount":1500}]}]'::jsonb, '{}'::jsonb)$q$, 'a month is approved for the payment tests');
select lives_ok($q$select public.add_payment((select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01'), 500, '2026-07-05', 'bit')$q$, 'a landlord records a partial payment');
select is((select paid_agorot::int from public.statements where id = (select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01')), 500, 'the statement shows what was paid so far');
select is((select paid_on from public.statements where id = (select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01')), null, 'a partly paid statement is not marked paid');
select throws_ok($q$select public.add_payment((select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01'), 1100, '2026-07-06', 'cash')$q$, null, 'payment exceeds the balance', 'a payment cannot exceed the balance');
select lives_ok($q$select public.add_payment((select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01'), 1000, '2026-07-06', 'cash')$q$, 'the remaining balance can be paid');
select is((select paid_on::text from public.statements where id = (select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01')), '2026-07-06', 'a fully paid statement is marked paid on the last payment date');
select lives_ok($q$select public.delete_payment((select id from public.payments where amount_agorot = 1000))$q$, 'a payment can be removed');
select is((select paid_on from public.statements where id = (select id from public.statements where unit_id = '30000000-0000-0000-0000-000000000001' and period = '2026-07-01')), null, 'removing a payment makes the statement unpaid again');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($q$select public.add_payment((select id from public.statements limit 1), 100, '2026-07-07', 'bit')$q$, null, 'forbidden', 'another landlord cannot record payments');
select throws_ok($q$insert into public.supplier_bills (org_id, property_id, period, kind, amount_agorot) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-07-01', 'water', 1000)$q$,
  '42501', null, 'another landlord cannot enter supplier bills for this property');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$insert into public.supplier_bills (org_id, property_id, period, kind, amount_agorot) values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-07-01', 'water', 1000)$q$, 'a landlord enters a supplier bill');

-- ── Replacing a tenant ───────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($q$select public.replace_tenant('30000000-0000-0000-0000-000000000001', '2026-10-31', '2026-11-01', array['new@test.dev'])$q$,
  null, 'forbidden', 'another landlord cannot replace the tenant of this unit');
select throws_ok($q$select public.replace_tenant('30000000-0000-0000-0000-0000000000b1', '2026-10-31', '2026-11-01', array['new@test.dev'])$q$,
  null, 'no active contract', 'a unit without an active contract cannot have its tenant replaced');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($q$select public.replace_tenant('30000000-0000-0000-0000-000000000002', '2026-10-31', '2026-11-01', array['landlord-a@test.dev'])$q$,
  null, 'landlord_cannot_be_renter', 'the landlord cannot become the new renter');
select lives_ok($q$select public.replace_tenant('30000000-0000-0000-0000-000000000001', '2026-10-31', '2026-11-01', array['New@Test.dev'])$q$, 'a landlord replaces the tenant of a unit');
select is((select count(*)::int from public.contracts where unit_id = '30000000-0000-0000-0000-000000000001' and status = 'active' and start_date = '2026-11-01'), 1, 'the new contract is the active one');
select is((select count(*)::int from public.contracts where unit_id = '30000000-0000-0000-0000-000000000001' and status = 'ended' and end_date = '2026-10-31'), 1, 'the old contract is ended on the handover date');
select is((select email from public.contract_renters where contract_id = (select id from public.contracts where unit_id = '30000000-0000-0000-0000-000000000001' and status = 'active')), 'new@test.dev', 'the new renter is on the new contract');

select * from finish();
rollback;
