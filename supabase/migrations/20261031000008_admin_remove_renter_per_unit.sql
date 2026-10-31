-- Removing a renter is per rental (one unit), not per user.
drop function public.admin_remove_renter(uuid);
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  user_id           uuid,
  email             text,
  created_at        timestamptz,
  last_sign_in_at   timestamptz,
  email_confirmed   boolean,
  is_super_user     boolean,
  org_name          text,    -- organizations the user owns (landlord)
  renter_contracts  integer, -- rental contracts the user is a renter on
  renter_units      jsonb    -- [{id (contract_renters.id), unit, property, org}]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
  select u.id,
         u.email::text,
         u.created_at,
         u.last_sign_in_at,
         u.email_confirmed_at is not null,
         exists (select 1 from public.platform_admins a where a.user_id = u.id),
         (select string_agg(o.name, ', ' order by o.name)
            from public.memberships m join public.organizations o on o.id = m.org_id
           where m.user_id = u.id and m.role = 'owner'),
         (select count(*)::integer from public.contract_renters r where r.user_id = u.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'unit', un.name, 'property', p.name, 'org', o.name) order by o.name, p.name, un.name)
                     from public.contract_renters r
                     join public.contracts c on c.id = r.contract_id
                     join public.units un on un.id = c.unit_id
                     join public.properties p on p.id = un.property_id
                     join public.organizations o on o.id = r.org_id
                    where r.user_id = u.id), '[]'::jsonb)
    from auth.users u
   order by u.created_at;
end $$;

-- Remove one renter from one rental (contract_renters row).
create function public.admin_remove_renter(p_renter uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.contract_renters;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  delete from public.contract_renters where id = p_renter returning * into v_row;
  if v_row.id is null then raise exception 'renter not found'; end if;
  insert into public.audit_log (actor_id, org_id, action, details)
    values (v_uid, v_row.org_id, 'admin.renter.remove',
            jsonb_build_object('email', v_row.email, 'user', v_row.user_id, 'contract', v_row.contract_id));
end $$;

revoke execute on function public.admin_list_users(), public.admin_remove_renter(uuid) from public, anon;
grant  execute on function public.admin_list_users(), public.admin_remove_renter(uuid) to authenticated;
