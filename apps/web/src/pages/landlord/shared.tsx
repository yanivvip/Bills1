import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { supabase } from '../../lib/supabase';

export interface Renter {
  id: string;
  email: string;
  full_name: string | null;
  user_id: string | null;
  invited_at: string | null;
  invite_channel: 'email' | 'whatsapp' | 'copy' | null;
}
export interface Contract {
  id: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'ended';
  rent_agorot: number | null;
  contract_renters: Renter[];
}

export const input = 'rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500';
export const primary = 'rounded-lg bg-violet-600 px-4 py-2 font-semibold';
export const card = 'flex flex-col gap-3 rounded-2xl bg-white/5 p-4';

const shekels = (agorot: number) => (agorot / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
const parseEmails = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
const today = () => new Date().toISOString().slice(0, 10);

export type Run = (op: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;

// Runs a write, remembers the error message, and reloads the page's data on success.
export function useWriter(reload: () => Promise<void>) {
  const [error, setError] = useState('');
  const run: Run = async (op) => {
    const { error } = await op;
    setError(error?.message ?? '');
    if (!error) await reload();
    return !error;
  };
  return { error, run };
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm text-slate-400">
      <span className="inline-block rtl:rotate-180">←</span> {children}
    </Link>
  );
}

// A toggled "+ Add …" button that opens a small form. `fields` render inside the form.
export function AddToggle({ label, title, onSubmit, children }: { label: string; title: string; onSubmit: () => Promise<boolean>; children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded-2xl border border-dashed border-white/20 py-3 text-slate-300">
        + {label}
      </button>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onSubmit()) setOpen(false);
  };
  return (
    <form onSubmit={submit} className={card}>
      <h3 className="font-semibold">{title}</h3>
      {children}
      <div className="flex gap-2">
        <button className={`${primary} flex-1`}>{t('common.save')}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-white/10 px-4 py-2">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export interface InviteContext {
  property: string;
  unit: string;
}

// Ready-made invitation (Hebrew, the pilot language) as a mail link and a WhatsApp link.
function inviteLinks(email: string, ctx: InviteContext, t: TFunction) {
  const base = (import.meta.env.VITE_APP_URL ?? window.location.origin).replace(/\/$/, '');
  // Keep "@" readable; it is valid in a query string and shortens the link.
  const link = `${base}/login?mode=signup&email=${encodeURIComponent(email).replace('%40', '@')}`;
  const vars = { lng: 'he', property: ctx.property, unit: ctx.unit, link };
  const subject = t('invite.subject', vars);
  const body = t('invite.body', vars);
  return {
    body,
    mail: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(body)}`,
  };
}

type Channel = 'email' | 'whatsapp' | 'copy';

// Invite actions for one unregistered renter. Gives immediate feedback and remembers the last attempt.
function InviteActions({ renter, invite, run }: { renter: Renter; invite: InviteContext; run: Run }) {
  const { t, i18n } = useTranslation();
  const [done, setDone] = useState<Channel | null>(null);
  const links = inviteLinks(renter.email, invite, t);

  const record = async (channel: Channel) => {
    setDone(channel);
    await run(supabase.from('contract_renters').update({ invited_at: new Date().toISOString(), invite_channel: channel }).eq('id', renter.id));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(links.body);
      await record('copy');
    } catch {
      setDone(null);
      window.prompt(t('landlord.copyManually'), links.body);
    }
  };

  const btn = 'rounded-md bg-white/10 px-2 py-1 transition active:scale-95 active:bg-violet-600';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2 text-xs">
        <a href={links.mail} onClick={() => void record('email')} className={btn}>
          ✉ {t('landlord.inviteEmail')}
        </a>
        <a href={links.whatsapp} target="_blank" rel="noreferrer" onClick={() => void record('whatsapp')} className={btn}>
          💬 {t('landlord.inviteWhatsapp')}
        </a>
        <button type="button" onClick={() => void copy()} className={btn}>
          📋 {t('landlord.inviteCopy')}
        </button>
      </div>
      {done && <p className="text-xs text-emerald-400">✓ {t(`landlord.invited.${done}`)}</p>}
      {!done && renter.invited_at && (
        <p className="text-xs text-slate-400">
          {t('landlord.lastInvite', {
            channel: t(`landlord.channel.${renter.invite_channel ?? 'email'}`),
            when: new Date(renter.invited_at).toLocaleString(i18n.language),
          })}
        </p>
      )}
    </div>
  );
}

export function ContractCard({ orgId, contract, run, invite }: { orgId: string; contract: Contract; run: Run; invite: InviteContext }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const addRenter = async (e: FormEvent) => {
    e.preventDefault();
    const [first] = parseEmails(email);
    if (first && (await run(supabase.from('contract_renters').insert({ org_id: orgId, contract_id: contract.id, email: first })))) setEmail('');
  };
  const end = () =>
    void run(supabase.from('contracts').update({ status: 'ended', end_date: contract.end_date ?? today() }).eq('id', contract.id));
  return (
    <div className={card}>
      <div>
        <strong>{t('landlord.status.active')}</strong> · {contract.start_date} → {contract.end_date ?? '…'}
        {contract.rent_agorot != null && ` · ₪${shekels(contract.rent_agorot)}`}
      </div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t('landlord.renters')}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {contract.contract_renters.map((r) => {
          return (
            <li key={r.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {r.full_name || r.email} {r.full_name && <span className="text-slate-400">({r.email})</span>}
                  <span className="ms-2 text-xs text-slate-400">{r.user_id ? t('landlord.registered') : t('landlord.pending')}</span>
                </span>
                {contract.contract_renters.length > 1 && (
                  <button className="text-red-400" onClick={() => void run(supabase.from('contract_renters').delete().eq('id', r.id))}>
                    {t('landlord.remove')}
                  </button>
                )}
              </div>
              {!r.user_id && <InviteActions renter={r} invite={invite} run={run} />}
            </li>
          );
        })}
      </ul>
      <form onSubmit={addRenter} className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('landlord.renterEmail')} className={`${input} flex-1`} />
        <button className={primary}>{t('landlord.addRenter')}</button>
      </form>
      <button className="self-start text-sm text-slate-400 underline" onClick={end}>
        {t('landlord.endContract')}
      </button>
    </div>
  );
}

export function ContractForm({ orgId, unitId, run }: { orgId: string; unitId: string; run: Run }) {
  const { t } = useTranslation();
  const [start, setStart] = useState(today());
  const [rent, setRent] = useState('');
  const [emails, setEmails] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const list = parseEmails(emails);
    if (list.length === 0) return setLocalError(t('landlord.needRenter'));
    setLocalError('');
    const { data, error } = await supabase
      .from('contracts')
      .insert({ org_id: orgId, unit_id: unitId, start_date: start, rent_agorot: rent ? Math.round(parseFloat(rent) * 100) : null })
      .select('id')
      .single();
    if (error) return setLocalError(error.message);
    const ok = await run(supabase.from('contract_renters').insert(list.map((email) => ({ org_id: orgId, contract_id: data.id, email }))));
    if (!ok) {
      // Don't leave a contract with no renters behind.
      await supabase.from('contracts').delete().eq('id', data.id);
      return;
    }
    setEmails('');
    setRent('');
  };

  return (
    <form onSubmit={submit} className={card}>
      <span className="text-slate-400">{t('landlord.noContract')}</span>
      <div className="flex gap-2">
        <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={`${input} flex-1`} />
        <input type="number" min="0" step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} placeholder={t('landlord.rent')} className={`${input} w-32`} />
      </div>
      <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder={t('landlord.renterEmails')} className={input} />
      {localError && <p className="text-sm text-red-400">{localError}</p>}
      <button className={primary}>{t('landlord.newContract')}</button>
    </form>
  );
}
