import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

// text-base (16px) keeps iOS Safari from zooming into the field on focus.
const inputClass =
  'w-full rounded-xl border border-line bg-white px-4 py-3 text-base outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/40';

export default function LoginPage() {
  const { t } = useTranslation();
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
    <div className="relative min-h-dvh overflow-hidden bg-page">
      <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <h1>
            <img src="/brand/logo.svg" alt={t('app.name')} width={220} height={78} />
          </h1>
          <p className="text-ink-2">{t('auth.hero')}</p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-5 shadow-sm">
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
            className="rounded-xl bg-primary py-3 text-base font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? t('common.loading') : signIn ? t('auth.signIn') : t('auth.signUp')}
          </button>
        </form>

        <button type="button" className="text-sm text-ink-2 underline underline-offset-4" onClick={() => setMode(signIn ? 'signUp' : 'signIn')}>
          {signIn ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
      </main>
    </div>
  );
}
