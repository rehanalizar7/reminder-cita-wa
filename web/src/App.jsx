import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn, api, clearToken } from './lib/api';
import { ToastProvider } from './lib/toast.jsx';
import { MeProvider, useMe } from './lib/me.jsx';
import Layout from './pages/Layout.jsx';
import Login from './pages/Login.jsx';
import OAuthCallback from './pages/OAuthCallback.jsx';
import PilihTsub from './pages/PilihTsub.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ContactsImport from './pages/ContactsImport.jsx';
import Outlets from './pages/Outlets.jsx';
import Templates from './pages/Templates.jsx';
import Send from './pages/Send.jsx';
import Schedules from './pages/Schedules.jsx';
import SpvDashboard from './pages/spv/SpvDashboard.jsx';
import SpvTeam from './pages/spv/SpvTeam.jsx';
import SpvOutlets from './pages/spv/SpvOutlets.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminTsub from './pages/admin/AdminTsub.jsx';
import AdminTemplates from './pages/admin/AdminTemplates.jsx';

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

// Urutan cek setelah login (data dari GET /auth/me, bukan dari isi JWT):
// 1. must_change_password → /change-password
// 2. REE yang belum punya TSUB → /pilih-tsub (SPV & admin gak perlu)
// 3. Lanjut ke halaman sesuai role
function RequireSetup({ children }) {
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.me();
      setMe(data);
      return data;
    } catch (err) {
      // 401 udah diurus api.js (balik ke /login + pesan). Sisanya (server/tunnel
      // lagi putus) ditampilin di sini -- jangan lanjut nebak role-nya.
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 380, width: '100%' }}>
          <div className="error-box">{error}</div>
          <div className="row">
            <button style={{ flex: 1 }} onClick={load}>
              Coba lagi
            </button>
            <button
              className="secondary"
              onClick={() => {
                clearToken();
                window.location.href = '/login';
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!me) return null;
  if (me.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (me.role === 'ree' && !me.tsubId) return <Navigate to="/pilih-tsub" replace />;

  return <MeProvider value={{ me, reloadMe: load }}>{children}</MeProvider>;
}

const ADMIN_LINKS = [
  { to: '/', label: 'Ringkasan', end: true },
  { to: '/akun', label: 'Akun' },
  { to: '/tsub', label: 'TSUB' },
  { to: '/template-bersama', label: 'Template Bersama' },
];

const SPV_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/tim', label: 'Tim REE' },
  { to: '/outlet-tim', label: 'Outlet Tim' },
  { to: '/templates', label: 'Template Pesan' },
  { to: '/send', label: 'Kirim' },
  { to: '/schedules', label: 'Jadwal' },
];

const REE_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/contacts', label: 'Import Kontak' },
  { to: '/outlets', label: 'Outlet' },
  { to: '/templates', label: 'Template Pesan' },
  { to: '/send', label: 'Kirim' },
  { to: '/schedules', label: 'Jadwal' },
];

function RoleRoutes() {
  return (
    <RequireSetup>
      <RoleSwitch />
    </RequireSetup>
  );
}

function RoleSwitch() {
  const { me } = useMe();

  if (me.role === 'admin') {
    return (
      <Routes>
        <Route element={<Layout links={ADMIN_LINKS} subtitle="Panel Admin" />}>
          <Route index element={<AdminOverview />} />
          <Route path="akun" element={<AdminUsers />} />
          <Route path="tsub" element={<AdminTsub />} />
          <Route path="template-bersama" element={<AdminTemplates />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  if (me.role === 'spv') {
    return (
      <Routes>
        <Route element={<Layout links={SPV_LINKS} subtitle="Supervisor" />}>
          <Route index element={<SpvDashboard />} />
          <Route path="tim" element={<SpvTeam />} />
          <Route path="outlet-tim" element={<SpvOutlets />} />
          <Route path="templates" element={<Templates />} />
          <Route path="send" element={<Send />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout links={REE_LINKS} subtitle="via WhatsApp" />}>
        <Route index element={<Dashboard />} />
        <Route path="contacts" element={<ContactsImport />} />
        <Route path="outlets" element={<Outlets />} />
        <Route path="templates" element={<Templates />} />
        <Route path="send" element={<Send />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
          <Route
            path="/change-password"
            element={
              <RequireAuth>
                <ChangePassword />
              </RequireAuth>
            }
          />
          <Route
            path="/pilih-tsub"
            element={
              <RequireAuth>
                <PilihTsub />
              </RequireAuth>
            }
          />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <RoleRoutes />
              </RequireAuth>
            }
          />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
