import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
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

// The bell in the header: a link to the alerts centre with the number of alerts not read yet.
function AlertsBell() {
  const { t } = useTranslation();
  const { unread } = useAlerts();
  return (
    <NavLink to="/alerts" aria-label={t('alerts.title')} className="relative px-1 text-lg">
      🔔
      {unread.length > 0 && (
        <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-black">{unread.length}</span>
      )}
    </NavLink>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { isPlatformAdmin } = useAuth();
  const { role } = useRole();
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-white/10 p-3 print:hidden">
        <strong>{t('app.name')}</strong>
        <div className="flex items-center gap-3 text-sm">
          {role?.kind === 'landlord' && <AlertsBell />}
          <button onClick={() => void supabase.auth.signOut()}>{t('auth.signOut')}</button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <nav className="flex justify-around border-t print:hidden border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <NavLink to="/" end>
          {t('nav.home')}
        </NavLink>
        {role?.kind === 'landlord' && <NavLink to="/readings">{t('nav.readings')}</NavLink>}
        {role?.kind === 'landlord' && <NavLink to="/bills">{t('nav.bills')}</NavLink>}
        {role?.kind === 'landlord' && <NavLink to="/history">{t('nav.history')}</NavLink>}
        {role?.kind === 'landlord' && <NavLink to="/property">{t('nav.property')}</NavLink>}
        {role?.kind === 'renter' && <NavLink to="/report">{t('nav.report')}</NavLink>}
        {role?.kind === 'renter' && <NavLink to="/my-bill">{t('nav.myBill')}</NavLink>}
        {isPlatformAdmin && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
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

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? (
    <TermsGate>
      <RoleProvider>
        <Shell />
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
          <Route element={<RequireAuth />}>
            <Route index element={<HomePage />} />
            <Route path="/bill/:id" element={<BillDocument />} />
            <Route element={<RequireLandlord />}>
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
