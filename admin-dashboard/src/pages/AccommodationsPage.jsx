import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { listAccommodations, decideAccommodation } from '../services/api';

export default function AccommodationsPage() {
  const [data, setData] = useState({ accommodations: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [rejectingId, setRejectingId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  const load = async (params = {}) => {
    setLoading(true); setError('');
    try { setData(await listAccommodations({ page: 1, limit: 20, status: status || undefined, search: search || undefined, ...params })); }
    catch (e) { setError(e.message || 'Failed to load accommodations.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    setBusy(id);
    try { await decideAccommodation(id, 'approve'); await load(); }
    catch (e) { alert(e.message || 'Approve failed.'); }
    finally { setBusy(''); }
  };

  const reject = async (id) => {
    const r = reason.trim();
    if (r.length < 5) { alert('Please provide a meaningful rejection reason (at least 5 characters).'); return; }
    setBusy(id);
    try { await decideAccommodation(id, 'reject', r); setRejectingId(''); setReason(''); await load(); }
    catch (e) { alert(e.message || 'Reject failed.'); }
    finally { setBusy(''); }
  };

  return (
    <Layout title="Accommodations" subtitle="Review, approve, or reject listings with reasons.">
      <div className="card toolbar">
        <input placeholder="Search name/city/locality" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <select value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="btn btn-primary" onClick={() => load({ status, search })}>Apply</button>
        <button className="btn btn-secondary" onClick={() => { setStatus(''); setSearch(''); load({ status: undefined, search: undefined }); }}>Reset</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        {loading ? <p className="muted">Loading...</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Owner</th><th>Location</th><th>Rent</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.accommodations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div><strong>{a.name}</strong>{a.isDemo ? <span className="badge badge-demo">Demo</span> : null}</div>
                      <div className="muted small">{a.accommodationType} • {a.genderType}</div>
                      {a.status === 'rejected' && a.rejectionReason ? <div className="muted small">Reason: {a.rejectionReason}</div> : null}
                    </td>
                    <td>{a.owner?.name || '—'}<div className="muted small">{a.owner?.email || ''}</div></td>
                    <td>{[a.location?.locality, a.location?.city].filter(Boolean).join(', ') || '—'}</td>
                    <td>₹{Number(a.pricing?.monthlyRent || 0).toLocaleString('en-IN')}</td>
                    <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                    <td>
                      <div className="actions-cell">
                        {a.status !== 'approved' && <button className="btn btn-sm btn-primary" disabled={busy===a.id} onClick={() => approve(a.id)}>Approve</button>}
                        {a.status !== 'rejected' && <button className="btn btn-sm btn-danger" disabled={busy===a.id} onClick={() => { setRejectingId(a.id); setReason(''); }}>Reject</button>}
                      </div>
                      {rejectingId === a.id && (
                        <div style={{ marginTop: 8 }}>
                          <textarea rows={2} placeholder="Rejection reason (required)" value={reason} onChange={(e)=>setReason(e.target.value)} style={{ width: '100%' }} />
                          <div className="actions-cell" style={{ marginTop: 6 }}>
                            <button className="btn btn-sm btn-danger" disabled={busy===a.id} onClick={() => reject(a.id)}>Confirm reject</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => { setRejectingId(''); setReason(''); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {data.accommodations.length === 0 && <tr><td colSpan="6" className="muted">No accommodations found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
