import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { listStudents, updateStudentStatus } from '../services/api';

export default function StudentsPage() {
  const [data, setData] = useState({ students: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const load = async (params = {}) => {
    setLoading(true); setError('');
    try { setData(await listStudents({ page: 1, limit: 20, search: search || undefined, ...params })); }
    catch (e) { setError(e.message || 'Failed to load students.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (s) => {
    setBusy(s.id);
    try {
      await updateStudentStatus(s.id, !s.isActive);
      await load();
    } catch (e) { alert(e.message || 'Update failed.'); }
    finally { setBusy(''); }
  };

  return (
    <Layout title="Students" subtitle="View and manage student accounts.">
      <div className="card toolbar">
        <input placeholder="Search by name or email" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={() => load({ search })}>Search</button>
        <button className="btn btn-secondary" onClick={() => { setSearch(''); load({ search: undefined }); }}>Reset</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        {loading ? <p className="muted">Loading...</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Demo</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    <td>{s.phone || '—'}</td>
                    <td><span className={`badge ${s.isActive ? 'badge-approved' : 'badge-rejected'}`}>{s.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>{s.isDemo ? <span className="badge badge-demo">Demo</span> : '—'}</td>
                    <td>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</td>
                    <td><button className="btn btn-sm btn-secondary" disabled={busy===s.id} onClick={() => toggleStatus(s)}>{s.isActive ? 'Deactivate' : 'Activate'}</button></td>
                  </tr>
                ))}
                {data.students.length === 0 && <tr><td colSpan="7" className="muted">No students found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
