-- Keep the meter readings a statement was based on (previous and current, per kind), for the annual report.
alter table public.statements add column readings jsonb;

create or replace function public.approve_month(p_property uuid, p_period date, p_statements jsonb, p_tariff jsonb)
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

    insert into public.statements (org_id, billing_id, unit_id, contract_id, period, total_agorot, lines, readings)
      values (v_org, v_id, (v_st->>'unit_id')::uuid, v_contract, p_period, v_total, v_st->'lines', v_st->'readings');
  end loop;

  update public.readings set status = 'approved'
   where org_id = v_org and period = p_period
     and meter_id in (select id from public.meters where property_id = p_property);

  insert into public.audit_log (actor_id, org_id, action, details)
    values ((select auth.uid()), v_org, 'billing.approve', jsonb_build_object('property', p_property, 'period', p_period));
  return v_id;
end $$;
