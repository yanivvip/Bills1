-- Units overview for Super_Users: every unit across all organizations with its active contract and renters.
create function public.admin_list_units()
returns table (
  unit_id        uuid,
  unit_name      text,
  property_name  text,
  org_name       text,
  contract_start date,
  renters        jsonb   -- [{id (contract_renters.id), email, linked}] of the active contract
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
  select un.id, un.name, p.name, o.name, c.start_date,
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email, 'linked', r.user_id is not null) order by r.email)
                     from public.contract_renters r where r.contract_id = c.id), '[]'::jsonb)
    from public.units un
    join public.properties p on p.id = un.property_id
    join public.organizations o on o.id = un.org_id
    left join public.contracts c on c.unit_id = un.id and c.status = 'active'
   order by o.name, p.name, un.name;
end $$;

revoke execute on function public.admin_list_units() from public, anon;
grant  execute on function public.admin_list_units() to authenticated;
