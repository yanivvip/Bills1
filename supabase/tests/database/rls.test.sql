-- Database security tests (pgTAP). Run with: supabase test db
-- Everything runs in one transaction that is rolled back, so no data is left behind.
begin;
select plan(31);

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

select * from finish();
rollback;
