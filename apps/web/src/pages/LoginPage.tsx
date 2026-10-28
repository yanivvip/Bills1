import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { applyLanguage } from '../i18n';
import { supabase } from '../lib/supabase';

// text-base (16px) keeps iOS Safari from zooming into the field on focus.
const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-base outline-none placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/60';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  // Invitation links look like /login?mode=signup&email=renter@example.com
  const [params] = useSearchParams();
  const invited = params.get('mode') === 'signup';
  const [mode, setMode] = useState<'signIn' | 'signUp'>(invited ? 'signUp' : 'signIn');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleLang = () => {
    const next = i18n.language === 'he' ? 'en' : 'he';
    void i18n.changeLanguage(next);
    applyLanguage(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: err, data } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (err) setError(mode === 'signIn' ? t('auth.error') : err.message);
    else if (mode === 'signUp' && !data.session) setInfo(t('auth.checkEmail'));
  };

  // Already signed in (or just signed in): go to the app.
  if (session) return <Navigate to="/" replace />;

  const signIn = mode === 'signIn';

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-b from-violet-950 via-[#150f2e] to-[#0f0f1a]">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/30 blur-3xl" />
      <button
        onClick={toggleLang}
        className="absolute top-3 rounded-full bg-white/10 px-3 py-1.5 text-sm text-slate-200 ltr:right-3 rtl:left-3"
      >
        {i18n.language === 'he' ? 'EN' : 'עב'}
      </button>

      <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <img src="/icons/icon-192.png" alt="" width={88} height={88} className="rounded-[22px] shadow-xl shadow-violet-900/60" />
          <h1 className="text-3xl font-bold tracking-tight">{t('app.name')}</h1>
          <p className="text-slate-300">{t('auth.hero')}</p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
          <div>
            <h2 className="text-xl font-semibold">{invited ? t('auth.invitedTitle') : signIn ? t('auth.welcomeBack') : t('auth.createTitle')}</h2>
            <p className="mt-1 text-sm text-slate-400">{invited ? t('auth.invitedHint') : signIn ? t('auth.signInHint') : t('auth.signUpHint')}</p>
          </div>

          <label className="flex flex-col gap-1.5 text-sm text-slate-300">
            {t('auth.email')}
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-slate-300">
            {t('auth.password')}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                dir="ltr"
                value={password}
                autoComplete={signIn ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} ltr:pr-16 rtl:pl-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 -translate-y-1/2 px-3 text-xs text-slate-400 ltr:right-0 rtl:left-0"
              >
                {showPassword ? t('auth.hide') : t('auth.show')}
              </button>
            </div>
            {!signIn && <span className="text-xs text-slate-500">{t('auth.passwordHint')}</span>}
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}
          {info && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{info}</p>}

          <button
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-base font-semibold shadow-lg shadow-violet-900/50 active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? t('common.loading') : signIn ? t('auth.signIn') : t('auth.signUp')}
          </button>
        </form>

        <button type="button" className="text-sm text-slate-300 underline underline-offset-4" onClick={() => setMode(signIn ? 'signUp' : 'signIn')}>
          {signIn ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
      </main>
    </div>
  );
}
