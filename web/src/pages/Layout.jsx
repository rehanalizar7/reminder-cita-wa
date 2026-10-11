import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearToken } from '../lib/api';
import { useMe, ROLE_LABEL } from '../lib/me.jsx';

// Kerangka halaman (sidebar + konten) yang dipakai semua role. Menu-nya
// dikirim dari App.jsx sesuai role akun yang lagi login.
export default function Layout({ links, subtitle }) {
  const { me } = useMe();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Reminder CITA</h1>
        <div className="subtitle">{subtitle}</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="logout">
          {me && (
            <div className="sidebar-account">
              <div className="sidebar-account-name">{me.name}</div>
              <div className="sidebar-account-role">
                {ROLE_LABEL[me.role] || me.role}
                {me.role === 'ree' && me.tsubCode ? ` · ${me.tsubCode}` : ''}
              </div>
            </div>
          )}
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
