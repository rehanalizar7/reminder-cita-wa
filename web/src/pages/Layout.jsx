import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearToken } from '../lib/api';
import { useMe, ROLE_LABEL } from '../lib/me.jsx';

// Ikon garis sederhana per halaman (dipakai di sidebar laptop & menu bawah HP).
const ICON_PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  contacts: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  outlet: 'M4 9h16l-1-5H5zM5 9v11h14V9M10 20v-6h4v6',
  template: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  schedule: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5M16 3.5a4 4 0 0 1 0 7.5M18 15.5c2 .7 3.4 2.6 4 5.5',
  account: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  tsub: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
};

function NavIcon({ name, size = 20 }) {
  const d = ICON_PATHS[name] || ICON_PATHS.home;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function logout() {
  clearToken();
  window.location.href = '/login';
}

// Kerangka halaman yang dipakai semua role. Laptop: sidebar kiri. HP/tablet
// (di bawah 900px): bar atas tipis + menu utama di bawah layar. Menu dikirim
// dari App.jsx sesuai role akun yang lagi login.
export default function Layout({ links, subtitle }) {
  const { me } = useMe();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Reminder CITA</h1>
        <div className="subtitle">{subtitle}</div>
        <nav aria-label="Menu utama">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <NavIcon name={l.icon} />
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
                {me.role === 'ree' && me.tsubCode ? `, ${me.tsubCode}` : ''}
              </div>
            </div>
          )}
          <button className="secondary" style={{ width: '100%' }} onClick={logout}>
            Keluar
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Menu utama">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <NavIcon name={l.icon} size={22} />
            {l.short || l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
