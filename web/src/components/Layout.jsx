import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const loc = useLocation();
  const navItems = [
    { to: '/', label: 'Overview', icon: '⌂' },
    { to: '/reputation', label: 'Reputation', icon: '★' },
    { to: '/create', label: 'Issue IOU', icon: '＋' },
    { to: '/accept', label: 'Accept IOU', icon: '✓' },
    { to: '/ious', label: 'IOU Search', icon: '⇄' },
    { to: '/transfer', label: 'Transfer', icon: '⇆' },
    { to: '/market', label: 'Favor Market', icon: '⊡' },
    { to: '/dao', label: 'DAO Voting', icon: '◈' },
    {/* to: '/treasury', label: 'Treasury', icon: '◎' */},
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-name">IOUFi</div>
          <div className="logo-sub">Favor Economy</div>
        </div>

        <nav className="nav">
          <div className="nav-section">Main</div>
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
