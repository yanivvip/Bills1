import VersionPage from './pages/VersionPage';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RoleProvider, useRole } from './auth/RoleProvider';
import PropertyPage from './pages/landlord/PropertyPage';
import UnitPage from './pages/landlord/UnitPage';
import ReadingsPage from './pages/readings/ReadingsPage';
import ReportPage from './pages/readings/ReportPage';
import BillsPage from './pages/bills/BillsPage';
import MyBillPage from './pages/bills/MyBillPage';
import ReportsPage from './pages/bills/ReportsPage';
import BillDocument from './pages/bills/BillDocument';
import SendPage from './pages/bills/SendPage';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import AdminUnitsPage from './pages/AdminUnitsPage';
import DisclaimerPage from './pages/DisclaimerPage';
import { TERMS_VERSION } from './legal/terms';
import AlertsPage from './pages/landlord/AlertsPage';
import HistoryPage from './pages/landlord/HistoryPage';
import PropertiesPage from './pages/landlord/PropertiesPage';
import OnboardingPage from './pages/landlord/OnboardingPage';
import { useAlerts } from './pages/landlord/useAlerts';
import { PropertyProvider, PropertySwitcher } from './pages/landlord/PropertyContext';
import { BarsIcon, BellIcon, BuildingIcon, GaugeIcon, HomeIcon, ReceiptIcon, ShieldIcon } from './components/NavIcons';

// The bell in the header: a square button linking to the alerts centre, with a dot while something is unread.
function AlertsBell() {
  const { t } = useTranslation();
  const { unread } = useAlerts();
  return (
    <NavLink to="/alerts" aria-label={t('alerts.title')} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card text-ink-2">
      <BellIcon />
      {unread.length > 0 && <span data-testid="alerts-dot" className="absolute left-2.5 top-2 h-[9px] w-[9px] rounded-full border-2 border-white bg-danger" />}
    </NavLink>
  );
}

// One tab of the bottom bar: the icon sits in a pill that turns soft teal when the tab is active.
function Tab({ to, end, icon, label }: { to: string; end?: boolean; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs ${isActive ? 'font-semibold text-primary-dark' : 'text-muted hover:text-ink'}`}>
      {({ isActive }) => (
        <>
          <span className={`flex h-[30px] w-[52px] items-center justify-center rounded-full ${isActive ? 'bg-primary-soft' : ''}`}>{icon}</span>
          {label}
        </>
      )}
    </NavLink>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { isPlatformAdmin } = useAuth();
  const { role, reload: reloadRole } = useRole();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const taps = useRef<number[]>([]);
  // five quick taps on the bottom bar open the hidden version page (for support, on a phone)
  const countTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 2500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      navigate('/version');
    }
  };
  const subPage = pathname.startsWith('/alerts') || pathname.startsWith('/bill/') || pathname.startsWith('/property/new');
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {role?.kind === 'landlord' && role.impersonation && (
        <div className="flex items-center justify-between gap-3 bg-amber-soft px-[18px] py-2 text-[13px] text-amber-dark print:hidden">
          <span>{t(role.impersonation.mode === 'full' ? 'admin.workingAsFull' : 'admin.workingAsRead', { org: role.impersonation.orgName })}</span>
          <button
            className="h-8 rounded-lg bg-amber-dark px-3 font-semibold text-white"
            onClick={() => void supabase.rpc('end_impersonation', { p_session: role.impersonation!.sessionId }).then(async () => {
              await reloadRole();
              window.location.assign('/admin');
            })}
          >
            {t('admin.endWorkAs')}
          </button>
        </div>
      )}
      {role?.kind !== 'renter' && !subPage && (
      <header className="flex items-center justify-between px-[18px] pb-1 pt-4 print:hidden">
        {role?.kind === 'landlord' ? (
          <PropertySwitcher label={t('landlord.properties')} />
        ) : (
          <button className="h-11 rounded-xl px-2 text-sm text-muted" onClick={() => void supabase.auth.signOut()}>
            {t('auth.signOut')}
          </button>
        )}
        {role?.kind === 'landlord' && <AlertsBell />}
      </header>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      <nav onClick={countTap} aria-label={t('nav.label')} className="flex h-[78px] items-stretch justify-around border-t border-line bg-card px-1.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-1.5 print:hidden">
        <Tab to="/" end icon={<HomeIcon />} label={t('nav.home')} />
        {role?.kind === 'landlord' && <Tab to="/readings" icon={<GaugeIcon />} label={t('nav.readings')} />}
        {role?.kind === 'landlord' && <Tab to="/bills" icon={<ReceiptIcon />} label={t('nav.bills')} />}
        {role?.kind === 'landlord' && <Tab to="/history" icon={<BarsIcon />} label={t('nav.history')} />}
        {role?.kind === 'landlord' && <Tab to="/property" icon={<BuildingIcon />} label={t('nav.property')} />}
        {role?.kind === 'renter' && <Tab to="/report" icon={<GaugeIcon />} label={t('nav.report')} />}
        {role?.kind === 'renter' && <Tab to="/my-bill" icon={<ReceiptIcon />} label={t('nav.myBill')} />}
        {isPlatformAdmin && <Tab to="/admin" icon={<ShieldIcon />} label={t('nav.admin')} />}
      </nav>
    </div>
  );
}

// Nobody gets past this until they have accepted the current version of the legal disclaimer (stored per user and version).
function TermsGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<'loading' | 'needed' | 'ok'>('loading');
  useEffect(() => {
    if (!userId) return;
    setState('loading');
    void supabase
      .from('terms_acceptances')
      .select('id')
      .eq('user_id', userId)
      .eq('version', TERMS_VERSION)
      .maybeSingle()
      .then(({ data }) => setState(data ? 'ok' : 'needed'));
  }, [userId]);
  if (state === 'loading') return null;
  if (state === 'needed') return <DisclaimerPage onAccepted={() => setState('ok')} />;
  return <>{children}</>;
}

// the landlord's property list is shared by the header switcher and the pages
function PropertiesScope() {
  const { role } = useRole();
  return (
    <PropertyProvider enabled={role?.kind === 'landlord'} orgId={role?.kind === 'landlord' ? role.orgId : undefined}>
      <Shell />
    </PropertyProvider>
  );
}

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? (
    <TermsGate>
      <RoleProvider>
        <PropertiesScope />
      </RoleProvider>
    </TermsGate>
  ) : (
    <Navigate to="/login" replace />
  );
}

// Landlord-only pages: renters and new users are sent back to the root page.
function RequireLandlord() {
  const { role } = useRole();
  if (!role) return null;
  return role.kind === 'landlord' ? <Outlet context={role.orgId} /> : <Navigate to="/" replace />;
}

function LandlordRoute({ page: Page }: { page: ComponentType<{ orgId: string }> }) {
  const orgId = useOutletContext<string>();
  return <Page orgId={orgId} />;
}

// Renter-only pages.
function RequireRenter() {
  const { role } = useRole();
  if (!role) return null;
  return role.kind === 'renter' ? <Outlet /> : <Navigate to="/" replace />;
}

function RequireAdmin() {
  const { isPlatformAdmin } = useAuth();
  return isPlatformAdmin ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/version" element={<VersionPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<HomePage />} />
            <Route path="/bill/:id" element={<BillDocument />} />
            <Route element={<RequireLandlord />}>
              <Route path="/bill/:id/send" element={<SendPage />} />
              <Route path="/properties/:propertyId" element={<LandlordRoute page={PropertyPage} />} />
              <Route path="/units/:unitId" element={<LandlordRoute page={UnitPage} />} />
              <Route path="/readings" element={<ReadingsPage />} />
              <Route path="/bills" element={<LandlordRoute page={BillsPage} />} />
              <Route path="/property" element={<LandlordRoute page={PropertiesPage} />} />
              <Route path="/property/new" element={<LandlordRoute page={OnboardingPage} />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
            </Route>
            <Route element={<RequireRenter />}>
              <Route path="/report" element={<ReportPage />} />
              <Route path="/my-bill" element={<MyBillPage />} />
            </Route>
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/units" element={<AdminUnitsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
