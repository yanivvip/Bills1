-- Users management for Super_Users (rows in platform_admins).
-- auth.users is not readable from the client, so these SECURITY DEFINER RPCs expose only what the admin page needs,
-- and only to Super_Users.

create function public.admin_list_users()
returns table (
  user_id           uuid,
  email             text,
  created_at        timestamptz,
  last_sign_in_at   timestamptz,
  email_confirmed   boolean,
  is_super_user     boolean,
  org_name          text,    -- organizations the user owns (landlord)
  renter_contracts  integer  -- rental contracts the user is a renter on
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
         (select count(*)::integer from public.contract_renters r where r.user_id = u.id)
    from auth.users u
   order by u.created_at;
end $$;

create function public.admin_set_super_user(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user not found'; end if;

  if p_value then
    insert into public.platform_admins (user_id) values (p_user) on conflict do nothing;
  else
    -- never lock everyone out
    if (select count(*) from public.platform_admins) <= 1 then
      raise exception 'cannot remove the last Super_User';
    end if;
    delete from public.platform_admins where user_id = p_user;
  end if;

  insert into public.audit_log (actor_id, org_id, action, details)
    values (v_uid, null, case when p_value then 'admin.super_user.grant' else 'admin.super_user.revoke' end,
            jsonb_build_object('user', p_user));
end $$;

revoke execute on function public.admin_list_users(), public.admin_set_super_user(uuid, boolean) from public, anon;
grant  execute on function public.admin_list_users(), public.admin_set_super_user(uuid, boolean) to authenticated;
