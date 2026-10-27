import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

const inputClass = 'rounded-lg bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500';

export default function LoginPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Invitation links look like /login?mode=signup&email=renter@example.com
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'signIn' | 'signUp'>(params.get('mode') === 'signup' ? 'signUp' : 'signIn');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <header className="text-center">
        <h1 className="text-3xl font-bold">{t('app.name')}</h1>
        <p className="text-slate-400">{t('app.tagline')}</p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5">
        <label className="flex flex-col gap-1 text-sm">
          {t('auth.email')}
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('auth.password')}
          <input
            type="password"
            required
            minLength={8}
            value={password}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {info && <p className="text-sm text-emerald-400">{info}</p>}
        <button disabled={busy} className="rounded-lg bg-violet-600 py-2 font-semibold disabled:opacity-60">
          {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
        </button>
        <button
          type="button"
          className="text-sm text-slate-400 underline"
          onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        >
          {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
      </form>
    </main>
  );
}
