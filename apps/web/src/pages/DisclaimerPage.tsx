import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { TERMS_FOOTER, TERMS_SECTIONS, TERMS_VERSION } from '../legal/terms';

// Shown once, before first use (and again when the wording changes): the key points, then the full text in a
// scroll box that must be read to the end before the confirmation can be ticked. The acceptance is stored with the version.
export default function DisclaimerPage({ onAccepted }: { onAccepted: () => void }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const check = () => {
    const el = box.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true);
  };
  useEffect(check, []);

  const accept = async () => {
    setBusy(true);
    const { error: err } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION });
    setBusy(false);
    if (err) return setError(err.message);
    onAccepted();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <strong>{t('app.name')}</strong>
        <button className="text-sm text-slate-400" onClick={() => void supabase.auth.signOut()}>
          {t('auth.signOut')}
        </button>
      </header>
      <div>
        <h1 className="text-2xl font-bold">{t('terms.title')}</h1>
        <p className="text-slate-300">{t('terms.intro')}</p>
      </div>
      <ul className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4 text-sm">
        {(t('terms.points', { returnObjects: true }) as string[]).map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden>•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-semibold text-slate-300">{t('terms.fullText')}</h2>
      <div ref={box} data-testid="terms-scroll" onScroll={check} tabIndex={0} role="region" aria-label={t('terms.fullText')} className="h-72 overflow-y-auto rounded-2xl bg-white/5 p-4 text-sm leading-relaxed">
        {TERMS_SECTIONS.map((s) => (
          <section key={s.title} className="mb-3">
            <h3 className="font-semibold">{s.title}</h3>
            <p className="text-slate-300">{s.body}</p>
          </section>
        ))}
        <p className="text-xs text-slate-400">{TERMS_FOOTER}</p>
      </div>
      {!atEnd && <p className="text-xs text-amber-300">{t('terms.scrollHint')}</p>}

      <label className={`flex items-start gap-2 text-sm ${atEnd ? '' : 'opacity-50'}`}>
        <input type="checkbox" disabled={!atEnd} checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
        {t('terms.agree')}
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={!agree || busy} onClick={() => void accept()} className="rounded-lg bg-violet-600 px-4 py-3 font-semibold disabled:opacity-50">
        {t('terms.accept')}
      </button>
    </div>
  );
}
