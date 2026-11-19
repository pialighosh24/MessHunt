import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ownerRegister } from '../services/api';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/brand/mess-hunt-logo.jpg';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
      setError('Name, email, phone, and password are required.');
      return;
    }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const user = await ownerRegister({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password });
      setUser(user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img src={logo} alt="Mess Hunt" className="auth-logo" />
        <h1>Owner Registration</h1>
        <p className="muted">Create an owner account to list and manage accommodations.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit} className="form">
          <label>Full name<input value={form.name} onChange={set('name')} required /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
          <label>Phone<input value={form.phone} onChange={set('phone')} required /></label>
          <label>Password<input type="password" value={form.password} onChange={set('password')} required minLength={6} /></label>
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Register'}</button>
        </form>
        <p className="muted">Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
}
