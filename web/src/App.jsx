import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn, api } from './lib/api';
import { ToastProvider } from './lib/toast.jsx';
import Layout from './pages/Layout.jsx';
import Login from './pages/Login.jsx';
import OAuthCallback from './pages/OAuthCallback.jsx';
import PilihTsub from './pages/PilihTsub.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ContactsImport from './pages/ContactsImport.jsx';
import Outlets from './pages/Outlets.jsx';
import Templates from './pages/Templates.jsx';
import Send from './pages/Send.jsx';
import Schedules from './pages/Schedules.jsx';

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

// REE yang belum state TSUB-nya diarahin ke halaman /pilih-tsub dulu sebelum
// bisa ke Dashboard/halaman lain -- dicek sekali pas masuk ke area utama app.
function RequireTsub({ children }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'needs-tsub'

  useEffect(() => {
    api
      .me()
      .then((me) => setStatus(me.tsubId ? 'ok' : 'needs-tsub'))
      .catch(() => setStatus('ok')); // gagal fetch (mis. sesi habis) -- biarin request() di api.js yang nanganin redirect ke /login
  }, []);

  if (status === 'loading') return null;
  if (status === 'needs-tsub') return <Navigate to="/pilih-tsub" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* ToastProvider di sini (luar <Routes>) biar popup notifikasi tetap kebaca
          meski halamannya langsung pindah abis suatu aksi (mis. klaim TSUB -> redirect). */}
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
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
                <RequireTsub>
                  <Layout />
                </RequireTsub>
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="contacts" element={<ContactsImport />} />
            <Route path="outlets" element={<Outlets />} />
            <Route path="templates" element={<Templates />} />
            <Route path="send" element={<Send />} />
            <Route path="schedules" element={<Schedules />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
