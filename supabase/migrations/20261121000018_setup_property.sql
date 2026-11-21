-- One-step property setup (the onboarding wizard): the property, its units with their contracts and renters, the meters
-- with their opening readings, and the tariffs, all in one transaction. If anything is wrong nothing is created.
--
-- p_setup = {
--   property: {name, address},
--   units:    [{name, is_residual, community_fee, property_tax, water_quota, occupants,
--               contract: {start, end, rent, emails: [..]} | null}],
--   meters:   [{kind, name, unit_index (null = main meter), opening (reading of last month) | null}],
--   tariff:   {electricity_rate, electricity_fixed, ..., property_tax_anchor, electricity_layout, ...}
-- }  money in agorot, rates in agorot per unit

create function public.setup_property(p_org uuid, p_setup jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_prop uuid;
  v_unit uuid;
  v_contract uuid;
  v_meter uuid;
  v_units uuid[] := '{}';
  v_prev date := (date_trunc('month', current_date) - interval '1 month')::date;
  u jsonb;
  m jsonb;
  t jsonb := coalesce(p_setup -> 'tariff', '{}'::jsonb);
  v_email text;
begin
  if not public.can_manage_org(p_org) then raise exception 'forbidden'; end if;
  if nullif(trim(p_setup #>> '{property,name}'), '') is null then raise exception 'property name is required'; end if;
  if jsonb_typeof(p_setup -> 'units') <> 'array' or jsonb_array_length(p_setup -> 'units') = 0 then raise exception 'at least one unit is required'; end if;

  insert into public.properties (org_id, name, address)
    values (p_org, trim(p_setup #>> '{property,name}'), nullif(trim(p_setup #>> '{property,address}'), ''))
    returning id into v_prop;

  for u in select * from jsonb_array_elements(p_setup -> 'units') loop
    insert into public.units (org_id, property_id, name, community_fee_agorot, property_tax_agorot, water_quota, occupants, is_residual)
      values (p_org, v_prop, trim(u ->> 'name'),
              coalesce((u ->> 'community_fee')::bigint, 0), coalesce((u ->> 'property_tax')::bigint, 0),
              coalesce((u ->> 'water_quota')::numeric, 0), coalesce((u ->> 'occupants')::smallint, 1),
              coalesce((u ->> 'is_residual')::boolean, false))
      returning id into v_unit;
    v_units := v_units || v_unit;

    if jsonb_typeof(u -> 'contract') = 'object' and jsonb_array_length(coalesce(u #> '{contract,emails}', '[]'::jsonb)) > 0 then
      insert into public.contracts (org_id, unit_id, start_date, end_date, rent_agorot)
        values (p_org, v_unit, (u #>> '{contract,start}')::date, nullif(u #>> '{contract,end}', '')::date, nullif(u #>> '{contract,rent}', '')::bigint)
        returning id into v_contract;
      for v_email in select jsonb_array_elements_text(u #> '{contract,emails}') loop
        insert into public.contract_renters (org_id, contract_id, email) values (p_org, v_contract, lower(trim(v_email)));
      end loop;
    end if;
  end loop;

  for m in select * from jsonb_array_elements(coalesce(p_setup -> 'meters', '[]'::jsonb)) loop
    insert into public.meters (org_id, property_id, unit_id, kind, name)
      values (p_org, v_prop,
              case when m ->> 'unit_index' is null then null else v_units[(m ->> 'unit_index')::int + 1] end,
              m ->> 'kind', coalesce(nullif(trim(m ->> 'name'), ''), m ->> 'kind'))
      returning id into v_meter;
    if nullif(m ->> 'opening', '') is not null then
      insert into public.readings (org_id, meter_id, period, value) values (p_org, v_meter, v_prev, (m ->> 'opening')::numeric);
    end if;
  end loop;

  insert into public.tariffs (
    property_id, org_id, electricity_rate, electricity_fixed, electricity_fixed_scope, water_rate_a, water_rate_b, water_fixed, water_fixed_scope,
    sewage_rate, property_tax_every, property_tax_anchor,
    electricity_layout, electricity_difference, electricity_split, water_layout, water_difference, water_split)
  values (
    v_prop, p_org, coalesce((t ->> 'electricity_rate')::numeric, 0), coalesce((t ->> 'electricity_fixed')::bigint, 0), coalesce(t ->> 'electricity_fixed_scope', 'units'),
    coalesce((t ->> 'water_rate_a')::numeric, 0), coalesce((t ->> 'water_rate_b')::numeric, 0), coalesce((t ->> 'water_fixed')::bigint, 0), coalesce(t ->> 'water_fixed_scope', 'units'),
    coalesce((t ->> 'sewage_rate')::numeric, 0), coalesce((t ->> 'property_tax_every')::smallint, 1), nullif(t ->> 'property_tax_anchor', '')::date,
    coalesce(t ->> 'electricity_layout', 'main_sub'), coalesce(t ->> 'electricity_difference', 'landlord'), coalesce(t ->> 'electricity_split', 'heads'),
    coalesce(t ->> 'water_layout', 'main_sub'), coalesce(t ->> 'water_difference', 'landlord'), coalesce(t ->> 'water_split', 'heads'));

  insert into public.audit_log (actor_id, org_id, action, details)
    values ((select auth.uid()), p_org, 'property.setup', jsonb_build_object('property', v_prop, 'units', cardinality(v_units)));
  return v_prop;
end $$;

revoke execute on function public.setup_property(uuid, jsonb) from public, anon;
grant  execute on function public.setup_property(uuid, jsonb) to authenticated;
