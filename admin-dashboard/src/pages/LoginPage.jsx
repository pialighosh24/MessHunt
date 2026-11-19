import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../services/api';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/brand/mess-hunt-logo.jpg';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    try {
      const user = await adminLogin(email.trim(), password);
      setUser(user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img src={logo} alt="Mess Hunt" className="auth-logo" />
        <h1>Admin Login</h1>
        <p className="muted">Secure admin access. Public registration is not available.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit} className="form">
          <label>Email<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
        </form>
      </div>
    </div>
  );
}
