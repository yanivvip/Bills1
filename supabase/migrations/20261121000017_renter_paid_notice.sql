-- A renter can tell the landlord "I paid". It is only a notice: the landlord still records the payment.

alter table public.statements add column renter_paid_notice_at timestamptz;

create function public.notify_paid(p_statement uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_contract uuid;
  v_total bigint;
  v_paid bigint;
begin
  select contract_id, total_agorot, paid_agorot into v_contract, v_total, v_paid from public.statements where id = p_statement;
  if v_contract is null or not public.is_contract_renter(v_contract) then raise exception 'forbidden'; end if;
  if v_paid >= v_total then raise exception 'already paid'; end if;
  update public.statements set renter_paid_notice_at = now() where id = p_statement;
end $$;

revoke execute on function public.notify_paid(uuid) from public, anon;
grant  execute on function public.notify_paid(uuid) to authenticated;
