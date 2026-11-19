import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/brand/mess-hunt-logo.jpg';
import { useAuth } from '../context/AuthContext';
import { logoutApi } from '../services/api';

export default function Layout({ title, subtitle, children, actions }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const onLogout = async () => { await logoutApi(); setUser(null); navigate('/login'); };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src={logo} alt="Mess Hunt logo" className="brand-logo" />
          <div>
            <div className="brand-name">Mess Hunt</div>
            <div className="brand-tagline">Admin Dashboard</div>
          </div>
        </div>
        <nav className="topnav">
          <Link to="/">Dashboard</Link>
          <Link to="/students">Students</Link>
          <Link to="/owners">Owners</Link>
          <Link to="/accommodations">Accommodations</Link>
          <Link to="/reviews">Reviews</Link>
          <span className="nav-user">{user?.name || 'Admin'}</span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>Logout</button>
        </nav>
      </header>
      <main className="page">
        {(title || actions) && (
          <div className="page-header">
            <div>{title && <h1 className="page-title">{title}</h1>}{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>
            {actions && <div className="page-actions">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
