import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { listReviews, moderateReview, updateReportHandlingStatus } from '../services/api';

export default function ReviewsPage() {
  const [data, setData] = useState({ reviews: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportedOnly, setReportedOnly] = useState('true');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState({});

  const load = async (params = {}) => {
    setLoading(true); setError('');
    try {
      const p = { page: 1, limit: 20, ...params };
      if (reportedOnly === 'true') p.reported = 'true';
      if (reportedOnly === 'false') p.reported = 'false';
      if (status) p.status = status;
      setData(await listReviews(p));
    } catch (e) { setError(e.message || 'Failed to load reviews.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    const note = (notes[id] || '').trim();
    if (action === 'remove' && note.length < 5) { alert('A meaningful moderation note (>= 5 chars) is required to remove a review.'); return; }
    setBusy(id);
    try { await moderateReview(id, action, note || undefined); await load(); }
    catch (e) { alert(e.message || 'Moderation failed.'); }
    finally { setBusy(''); }
  };

  const handleReport = async (reviewId, reportIndex, newStatus) => {
    setBusy(`${reviewId}-${reportIndex}`);
    try { await updateReportHandlingStatus(reviewId, reportIndex, newStatus); await load(); }
    catch (e) { alert(e.message || 'Report update failed.'); }
    finally { setBusy(''); }
  };

  return (
    <Layout title="Reviews & Reports" subtitle="Moderate reviews and handle reported content.">
      <div className="card toolbar">
        <select value={reportedOnly} onChange={(e)=>setReportedOnly(e.target.value)}>
          <option value="">All reviews</option>
          <option value="true">Reported only</option>
          <option value="false">Not reported</option>
        </select>
        <select value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option value="">All moderation statuses</option>
          <option value="none">none</option>
          <option value="approved">approved</option>
          <option value="removed">removed</option>
          <option value="pending">pending</option>
        </select>
        <button className="btn btn-primary" onClick={() => load()}>Apply</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        {loading ? <p className="muted">Loading...</p> : data.reviews.length === 0 ? <p className="muted">No reviews found for the selected filters.</p> : (
          <div className="review-list">
            {data.reviews.map((r) => (
              <div key={r.id} className="review-admin-item">
                <div className="review-admin-head">
                  <div>
                    <strong>{r.reviewerDisplayName || r.student?.name || 'Student'}</strong> ({r.student?.email || '—'}) on <strong>{r.accommodation?.name || r.accommodation?.id}</strong>
                    <div className="muted small">Rating: {r.rating} ★ • Moderation: <span className={`badge badge-${r.moderationStatus || 'none'}`}>{r.moderationStatus || 'none'}</span> • Reported: {r.isReported ? 'Yes' : 'No'} ({r.reportCount || 0})</div>
                  </div>
                </div>
                <p className="review-comment">{r.comment}</p>
                {r.moderationNote ? <p className="muted small"><strong>Moderation note:</strong> {r.moderationNote}</p> : null}
                <div className="toolbar" style={{ padding: 0, border: 'none' }}>
                  <input placeholder="Moderation note (required to remove)" value={notes[r.id] || ''} onChange={(e)=>setNotes((p)=>({...p,[r.id]:e.target.value}))} style={{ flex: 1 }} />
                  <button className="btn btn-sm btn-primary" disabled={busy===r.id} onClick={() => act(r.id, 'approve')}>Approve/Retain</button>
                  <button className="btn btn-sm btn-danger" disabled={busy===r.id} onClick={() => act(r.id, 'remove')}>Remove</button>
                </div>
                {Array.isArray(r.reports) && r.reports.length > 0 && (
                  <div className="reports-box">
                    <strong>Reports</strong>
                    {r.reports.map((rep) => (
                      <div key={`${r.id}-${rep.index}`} className="report-item">
                        <div className="muted small">#{rep.index} • {rep.status || 'pending'} • {rep.reason}</div>
                        <div className="actions-cell" style={{ marginTop: 4 }}>
                          <button className="btn btn-sm btn-secondary" disabled={busy===`${r.id}-${rep.index}`} onClick={() => handleReport(r.id, rep.index, 'dismissed')}>Dismiss</button>
                          <button className="btn btn-sm btn-secondary" disabled={busy===`${r.id}-${rep.index}`} onClick={() => handleReport(r.id, rep.index, 'actioned')}>Mark actioned</button>
                          <button className="btn btn-sm btn-secondary" disabled={busy===`${r.id}-${rep.index}`} onClick={() => handleReport(r.id, rep.index, 'pending')}>Set pending</button>
                        </div>
                      </div>
                    ))}
                    <p className="muted small">Updating report handling status does not automatically change review moderation status.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
