-- Super_User removes a user's renter links (the user stays; they just stop being a renter anywhere).
create function public.admin_remove_renter(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  delete from public.contract_renters where user_id = p_user;
  get diagnostics v_count = row_count;
  insert into public.audit_log (actor_id, org_id, action, details)
    values (v_uid, null, 'admin.renter.remove', jsonb_build_object('user', p_user, 'links', v_count));
  return v_count;
end $$;

revoke execute on function public.admin_remove_renter(uuid) from public, anon;
grant  execute on function public.admin_remove_renter(uuid) to authenticated;
