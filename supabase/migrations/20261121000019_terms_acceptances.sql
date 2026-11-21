-- Proof that a user accepted the legal disclaimer, and which version of it. Written only through accept_terms().

create table public.terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     text not null check (length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

alter table public.terms_acceptances enable row level security;
create policy terms_acceptances_select on public.terms_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
-- no insert/update/delete policies: nobody changes or removes a record of consent from the client

create function public.accept_terms(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if p_version is null or length(trim(p_version)) = 0 then raise exception 'version is required'; end if;
  insert into public.terms_acceptances (user_id, version) values ((select auth.uid()), trim(p_version))
    on conflict (user_id, version) do nothing;
end $$;

revoke execute on function public.accept_terms(text) from public, anon;
grant  execute on function public.accept_terms(text) to authenticated;
