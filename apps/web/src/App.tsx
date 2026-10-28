import type { ComponentType } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RoleProvider, useRole } from './auth/RoleProvider';
import PropertyPage from './pages/landlord/PropertyPage';
import UnitPage from './pages/landlord/UnitPage';
import ReadingsPage from './pages/readings/ReadingsPage';
import ReportPage from './pages/readings/ReportPage';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';

function Shell() {
  const { t } = useTranslation();
  const { isPlatformAdmin } = useAuth();
  const { role } = useRole();
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-white/10 p-3">
        <strong>{t('app.name')}</strong>
        <div className="flex gap-3 text-sm">
          <button onClick={() => void supabase.auth.signOut()}>{t('auth.signOut')}</button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <nav className="flex justify-around border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <NavLink to="/" end>
          {t('nav.home')}
        </NavLink>
        {role?.kind === 'landlord' && <NavLink to="/readings">{t('nav.readings')}</NavLink>}
        {role?.kind === 'renter' && <NavLink to="/report">{t('nav.report')}</NavLink>}
        {isPlatformAdmin && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
      </nav>
    </div>
  );
}

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? (
    <RoleProvider>
      <Shell />
    </RoleProvider>
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
  return isPlatformAdmin ? <AdminPage /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<HomePage />} />
            <Route element={<RequireLandlord />}>
              <Route path="/properties/:propertyId" element={<LandlordRoute page={PropertyPage} />} />
              <Route path="/units/:unitId" element={<LandlordRoute page={UnitPage} />} />
              <Route path="/readings" element={<ReadingsPage />} />
            </Route>
            <Route element={<RequireRenter />}>
              <Route path="/report" element={<ReportPage />} />
            </Route>
            <Route path="/admin" element={<RequireAdmin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
