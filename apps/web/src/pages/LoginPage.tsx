import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

// text-base (16px) keeps iOS Safari from zooming into the field on focus.
const inputClass =
  'h-[52px] w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/40';

export default function LoginPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Invitation links look like /login?mode=signup&email=renter@example.com
  const [params] = useSearchParams();
  const linkInvite = params.get('mode') === 'signup';
  // the opening screen comes first, unless an invitation link already says who the visitor is
  const [step, setStep] = useState<'intro' | 'form'>(linkInvite ? 'form' : 'intro');
  const [asRenter, setAsRenter] = useState(false);
  const invited = linkInvite || asRenter;
  const [mode, setMode] = useState<'signIn' | 'signUp'>(linkInvite ? 'signUp' : 'signIn');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const open = (m: 'signIn' | 'signUp', renter = false) => {
    setMode(m);
    setAsRenter(renter);
    setStep('form');
  };

  if (step === 'intro')
    return (
      <div className="min-h-dvh bg-page">
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-7 px-6 pb-8 pt-14">
          <h1 className="self-start">
            <img src="/brand/logo.svg" alt={t('app.name')} width={180} height={64} />
          </h1>
          <div className="flex flex-1 flex-col justify-center gap-7">
            <div className="flex h-[220px] items-end justify-center overflow-hidden rounded-[28px] bg-primary-soft pb-7" aria-hidden="true">
              <svg width="200" height="150" viewBox="0 0 200 150" fill="none">
                <path d="M30 70 100 18l70 52v72H30z" fill="#fff" stroke="#0E6B5E" strokeWidth="3" strokeLinejoin="round" />
                <rect x="84" y="96" width="32" height="46" rx="4" fill="#0E6B5E" />
                <rect x="44" y="84" width="28" height="24" rx="4" fill="#E4F0EC" stroke="#0E6B5E" strokeWidth="2" />
                <rect x="128" y="84" width="28" height="24" rx="4" fill="#E4F0EC" stroke="#0E6B5E" strokeWidth="2" />
                <circle cx="168" cy="36" r="18" fill="#fff" stroke="#B7791F" strokeWidth="3" />
                <path d="M170 26l-7 11h6l-2 9 8-12h-6z" fill="#B7791F" />
                <circle cx="30" cy="40" r="16" fill="#fff" stroke="#2B6CB0" strokeWidth="3" />
                <path d="M30 30s7 7 7 12a7 7 0 0 1-14 0c0-5 7-12 7-12z" fill="#2B6CB0" />
              </svg>
            </div>
            <div>
              <p className="mb-2.5 text-[28px] font-semibold leading-tight">{t('auth.hero')}</p>
              <p className="text-base leading-relaxed text-muted">{t('auth.heroSub')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => open('signUp')} className="h-14 rounded-2xl bg-primary text-[17px] font-medium text-white">
              {t('auth.introLandlord')}
            </button>
            <button type="button" onClick={() => open('signUp', true)} className="h-14 rounded-2xl border border-line-strong bg-white text-[17px] font-medium text-primary-dark">
              {t('auth.introInvited')}
            </button>
            <p className="mt-2 text-center text-[15px] text-muted">
              {t('auth.introRegistered')}{' '}
              <button type="button" onClick={() => open('signIn')} className="font-medium text-primary">
                {t('auth.introSignIn')}
              </button>
            </p>
          </div>
        </main>
      </div>
    );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-page">
      <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
        <header className="flex flex-col gap-5">
          <h1 className="self-start">
            <img src="/brand/logo.svg" alt={t('app.name')} width={180} height={64} />
          </h1>
          <div className="relative flex h-[190px] items-end justify-center overflow-hidden rounded-[28px] bg-primary-soft pb-6" aria-hidden="true">
            <svg width="190" height="140" viewBox="0 0 200 150" fill="none">
              <path d="M30 70 100 18l70 52v72H30z" fill="#fff" stroke="#0E6B5E" strokeWidth="3" strokeLinejoin="round" />
              <rect x="84" y="96" width="32" height="46" rx="4" fill="#0E6B5E" />
              <rect x="44" y="84" width="28" height="24" rx="4" fill="#E4F0EC" stroke="#0E6B5E" strokeWidth="2" />
              <rect x="128" y="84" width="28" height="24" rx="4" fill="#E4F0EC" stroke="#0E6B5E" strokeWidth="2" />
              <circle cx="168" cy="36" r="18" fill="#fff" stroke="#B7791F" strokeWidth="3" />
              <path d="M170 26l-7 11h6l-2 9 8-12h-6z" fill="#B7791F" />
              <circle cx="30" cy="40" r="16" fill="#fff" stroke="#2B6CB0" strokeWidth="3" />
              <path d="M30 30s7 7 7 12a7 7 0 0 1-14 0c0-5 7-12 7-12z" fill="#2B6CB0" />
            </svg>
          </div>
          <p className="text-[28px] font-semibold leading-tight">{t('auth.hero')}</p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-[22px] border border-line bg-card p-5">
          <div>
            <h2 className="text-xl font-semibold">{invited ? t('auth.invitedTitle') : signIn ? t('auth.welcomeBack') : t('auth.createTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{invited ? t('auth.invitedHint') : signIn ? t('auth.signInHint') : t('auth.signUpHint')}</p>
          </div>

          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
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
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
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
                className="absolute top-1/2 -translate-y-1/2 px-3 text-xs text-muted ltr:right-0 rtl:left-0"
              >
                {showPassword ? t('auth.hide') : t('auth.show')}
              </button>
            </div>
            {!signIn && <span className="text-xs text-faint">{t('auth.passwordHint')}</span>}
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          {info && <p className="rounded-lg bg-ok-soft p-3 text-sm text-ok">{info}</p>}

          <button
            disabled={busy}
            className="h-14 rounded-2xl bg-primary text-[17px] font-medium text-white active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? t('common.loading') : signIn ? t('auth.signIn') : t('auth.signUp')}
          </button>
        </form>

        <button type="button" className="h-14 rounded-2xl border border-line-strong bg-white text-[17px] font-medium text-primary-dark" onClick={() => setMode(signIn ? 'signUp' : 'signIn')}>
          {signIn ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
      </main>
    </div>
  );
}
