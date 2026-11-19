import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { listOwners, updateOwnerVerification, updateOwnerStatus } from '../services/api';

export default function OwnersPage() {
  const [data, setData] = useState({ owners: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const load = async (params = {}) => {
    setLoading(true); setError('');
    try { setData(await listOwners({ page: 1, limit: 20, search: search || undefined, ...params })); }
    catch (e) { setError(e.message || 'Failed to load owners.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleVerify = async (o) => {
    setBusy(`v-${o.id}`);
    try { await updateOwnerVerification(o.id, !o.isVerified); await load(); }
    catch (e) { alert(e.message || 'Update failed.'); }
    finally { setBusy(''); }
  };
  const toggleStatus = async (o) => {
    setBusy(`s-${o.id}`);
    try { await updateOwnerStatus(o.id, !o.isActive); await load(); }
    catch (e) { alert(e.message || 'Update failed.'); }
    finally { setBusy(''); }
  };

  return (
    <Layout title="Owners" subtitle="Manage owner accounts and verification status.">
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
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Verified</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.owners.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}{o.isDemo ? <span className="badge badge-demo">Demo</span> : null}</td>
                    <td>{o.email}</td>
                    <td>{o.phone || '—'}</td>
                    <td><span className={`badge ${o.isVerified ? 'badge-approved' : 'badge-pending'}`}>{o.isVerified ? 'Verified' : 'Unverified'}</span></td>
                    <td><span className={`badge ${o.isActive ? 'badge-approved' : 'badge-rejected'}`}>{o.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-secondary" disabled={busy===`v-${o.id}`} onClick={() => toggleVerify(o)}>{o.isVerified ? 'Unverify' : 'Verify'}</button>
                      <button className="btn btn-sm btn-secondary" disabled={busy===`s-${o.id}`} onClick={() => toggleStatus(o)}>{o.isActive ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                ))}
                {data.owners.length === 0 && <tr><td colSpan="6" className="muted">No owners found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Note: Owner verification does not automatically approve accommodation listings.</p>
      </div>
    </Layout>
  );
}
