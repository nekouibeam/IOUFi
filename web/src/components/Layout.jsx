import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const loc = useLocation();
  const navItems = [
    { to: '/', label: '總覽', icon: '⌂' },
    { to: '/create', label: '發放人情債', icon: '＋' },
    { to: '/market', label: 'Favor 市場', icon: '⊡' },
    { to: '/dao', label: 'DAO 投票', icon: '◈' },
    { to: '/treasury', label: 'Treasury', icon: '◎' },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-name">IOUFi</div>
          <div className="logo-sub">Favor Economy</div>
        </div>

        <nav className="nav">
          <div className="nav-section">主要</div>
          {navItems.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className={`nav-item ${loc.pathname === it.to ? 'active' : ''}`}
            >
              <span className="icon">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          ))}
        </nav>

        <div className="treasury-bar">
          <div className="treasury-label">DAO Treasury</div>
          <div className="treasury-val">— FAVOR</div>
        </div>
      </aside>

      <main className="main">
        {children}
      </main>
    </div>
  );
}
