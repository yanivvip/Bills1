import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// The round-cornered back arrow at the start of a sub-page header (sub-pages have no top bar, as in the design).
export default function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <button type="button" aria-label={t('common.back')} onClick={() => (to ? navigate(to) : navigate(-1))} className="-me-2.5 flex h-11 w-11 items-center justify-center text-ink-2">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ltr:rotate-180">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}
