import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearToken, getToken } from '../lib/api';

const REE_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/contacts', label: 'Import Kontak' },
  { to: '/outlets', label: 'Outlet' },
  { to: '/templates', label: 'Template Pesan' },
  { to: '/send', label: 'Kirim' },
  { to: '/schedules', label: 'Jadwal' },
];

// Decode JWT payload client-side (tidak verifikasi signature — hanya buat UI).
// Signature diverifikasi backend pada setiap request yang memerlukan auth.
function getTokenRole() {
  const token = getToken();
  if (!token) return 'ree';
  try {
    return JSON.parse(atob(token.split('.')[1])).role ?? 'ree';
  } catch {
    return 'ree';
  }
}

export default function Layout() {
  const role = getTokenRole();
  const links = role === 'admin'
    ? [...REE_LINKS, { to: '/admin', label: 'Admin' }]
    : REE_LINKS;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Reminder CITA</h1>
        <div className="subtitle">via WhatsApp</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="logout">
          <button
            className="secondary"
            style={{ width: '100%' }}
            onClick={() => {
              clearToken();
              window.location.href = '/login';
            }}
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
