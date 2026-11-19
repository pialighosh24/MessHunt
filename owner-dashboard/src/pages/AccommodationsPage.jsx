import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { getMyAccommodations, deleteAccommodation } from '../services/api';

export default function AccommodationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setItems(await getMyAccommodations()); }
    catch (e) { setError(e.message || 'Failed to load listings.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this listing? This action cannot be undone.')) return;
    try {
      await deleteAccommodation(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert(e.message || 'Delete failed.');
    }
  };

  return (
    <Layout title="My Listings" subtitle="Create, view, edit, and manage your accommodations." actions={<Link className="btn btn-primary" to="/accommodations/new">Add Listing</Link>}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        {loading ? <p className="muted">Loading...</p> : items.length === 0 ? <p className="muted">No listings yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Location</th><th>Rent</th><th>Status</th><th>Availability</th><th>Actions</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div><strong>{i.name}</strong>{i.isDemo ? <span className="badge badge-demo">Demo</span> : null}</div>
                      {i.status === 'rejected' && i.rejectionReason ? <div className="muted small">Reason: {i.rejectionReason}</div> : null}
                    </td>
                    <td>{[i.location?.locality, i.location?.city].filter(Boolean).join(', ') || '—'}</td>
                    <td>₹{Number(i.pricing?.monthlyRent || 0).toLocaleString('en-IN')}</td>
                    <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                    <td>{i.availability?.status || '—'}</td>
                    <td className="actions-cell">
                      <Link className="btn btn-sm btn-secondary" to={`/accommodations/${i.id}`}>View/Edit</Link>
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(i.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
