import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearToken } from '../lib/api';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/contacts', label: 'Import Kontak' },
  { to: '/outlets', label: 'Outlet' },
  { to: '/templates', label: 'Template Pesan' },
  { to: '/send', label: 'Kirim' },
  { to: '/schedules', label: 'Jadwal' },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Reminder CITA</h1>
        <div className="subtitle">via WhatsApp</div>
        <nav>
          {LINKS.map((l) => (
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
