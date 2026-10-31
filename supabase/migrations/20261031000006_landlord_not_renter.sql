-- A landlord cannot also be a renter in their own organization.
create or replace function public.contract_renters_not_landlord()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if exists (
    select 1
    from auth.users u
    join public.memberships m on m.user_id = u.id
    where m.org_id = new.org_id
      and lower(u.email) = lower(new.email)
  ) then
    raise exception 'landlord_cannot_be_renter' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger contract_renters_not_landlord
  before insert or update of email, org_id on public.contract_renters
  for each row execute function public.contract_renters_not_landlord();
