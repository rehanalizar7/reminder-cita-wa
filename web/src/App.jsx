import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn, api, getToken } from './lib/api';
import { ToastProvider } from './lib/toast.jsx';
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
import Admin from './pages/Admin.jsx';

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

// Decode JWT payload untuk role (tidak verifikasi signature — hanya guard UI).
function getTokenRole() {
  const token = getToken();
  if (!token) return 'ree';
  try {
    return JSON.parse(atob(token.split('.')[1])).role ?? 'ree';
  } catch {
    return 'ree';
  }
}

function RequireAdmin({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (getTokenRole() !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// Urutan cek setelah login:
// 1. must_change_password → /change-password
// 2. tsub belum dipilih → /pilih-tsub
// 3. Lanjut ke halaman yang diminta
function RequireSetup({ children }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (me.mustChangePassword) return setStatus('needs-password');
        if (!me.tsubId) return setStatus('needs-tsub');
        setStatus('ok');
      })
      .catch(() => setStatus('ok')); // gagal fetch — biarkan backend yang reject
  }, []);

  if (status === 'loading') return null;
  if (status === 'needs-password') return <Navigate to="/change-password" replace />;
  if (status === 'needs-tsub') return <Navigate to="/pilih-tsub" replace />;
  return children;
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
            path="/"
            element={
              <RequireAuth>
                <RequireSetup>
                  <Layout />
                </RequireSetup>
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<ContactsImport />} />
            <Route path="outlets" element={<Outlets />} />
            <Route path="templates" element={<Templates />} />
            <Route path="send" element={<Send />} />
            <Route path="schedules" element={<Schedules />} />
            <Route
              path="admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
