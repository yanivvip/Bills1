-- Replace the tenant of a unit in one step: end the active contract and start a new one with the new renters.
-- The outgoing renters keep their (ended) contract, so their old bills stay readable but they can no longer report readings.
create function public.replace_tenant(p_unit uuid, p_end_date date, p_start_date date, p_emails text[], p_rent bigint default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_old uuid;
  v_new uuid;
  v_email text;
begin
  select org_id into v_org from public.units where id = p_unit;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'forbidden'; end if;
  if p_emails is null or cardinality(p_emails) = 0 then raise exception 'at least one renter is required'; end if;
  if p_start_date < p_end_date then raise exception 'new contract cannot start before the old one ends'; end if;

  select id into v_old from public.contracts where unit_id = p_unit and status = 'active';
  if v_old is null then raise exception 'no active contract'; end if;

  update public.contracts set status = 'ended', end_date = p_end_date where id = v_old;

  insert into public.contracts (org_id, unit_id, start_date, rent_agorot)
    values (v_org, p_unit, p_start_date, p_rent) returning id into v_new;

  foreach v_email in array p_emails loop
    insert into public.contract_renters (org_id, contract_id, email) values (v_org, v_new, lower(trim(v_email)));
  end loop;

  insert into public.audit_log (actor_id, org_id, action, details)
    values ((select auth.uid()), v_org, 'contract.replace_tenant', jsonb_build_object('unit', p_unit, 'old', v_old, 'new', v_new));
  return v_new;
end $$;

revoke execute on function public.replace_tenant(uuid, date, date, text[], bigint) from public, anon;
grant  execute on function public.replace_tenant(uuid, date, date, text[], bigint) to authenticated;
