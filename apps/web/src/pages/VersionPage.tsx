import { useNavigate } from 'react-router-dom';

// Hidden page (not linked anywhere; five quick taps on the bottom bar open it): the stamp of the build that is running.
export default function VersionPage() {
  const navigate = useNavigate();
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/', { replace: true }));
  return (
    <main dir="ltr" className="grid min-h-screen place-items-center bg-black/40 p-6" onClick={close}>
      <div role="dialog" aria-label="Version" onClick={(e) => e.stopPropagation()} className="w-full max-w-[320px] rounded-[22px] border border-line bg-card p-6 text-center shadow-xl">
        <img src="/brand/logo.svg" alt="BILLS-AI" width={150} height={54} className="mx-auto" />
        <div className="mt-5 text-[13px] uppercase tracking-wide text-faint">Version</div>
        <div className="mt-1 text-lg font-semibold text-ink">{__BUILD_TIME__}</div>
        <div className="mt-1 font-mono text-sm text-muted">{__BUILD_SHA__}</div>
        <button type="button" onClick={close} className="mt-6 h-12 w-full rounded-xl bg-primary font-semibold text-white">
          Close
        </button>
      </div>
    </main>
  );
}
