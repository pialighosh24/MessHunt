import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { getMyAccommodations } from '../services/api';

export default function DashboardPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getMyAccommodations();
        if (mounted) setItems(data);
      } catch (e) {
        if (mounted) setError(e.message || 'Failed to load listings.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const approved = items.filter((i) => i.status === 'approved').length;
    const pending = items.filter((i) => i.status === 'pending').length;
    const rejected = items.filter((i) => i.status === 'rejected').length;
    const available = items.filter((i) => i.availability?.status === 'Available').length;
    return { total, approved, pending, rejected, available };
  }, [items]);

  return (
    <Layout title="Owner Overview" subtitle="Summary of your accommodation listings and statuses." actions={<Link className="btn btn-primary" to="/accommodations/new">Add Listing</Link>}>
      {error && <div className="alert alert-error">{error}</div>}
      <section className="card-grid">
        <div className="card stat"><h3>Total Listings</h3><p>{loading ? '...' : stats.total}</p></div>
        <div className="card stat"><h3>Approved</h3><p>{loading ? '...' : stats.approved}</p></div>
        <div className="card stat"><h3>Pending</h3><p>{loading ? '...' : stats.pending}</p></div>
        <div className="card stat"><h3>Rejected</h3><p>{loading ? '...' : stats.rejected}</p></div>
        <div className="card stat"><h3>Available</h3><p>{loading ? '...' : stats.available}</p></div>
      </section>
      <div className="card">
        <h3>Recent listings</h3>
        {loading ? <p className="muted">Loading...</p> : items.length === 0 ? <p className="muted">No listings yet. Create your first accommodation.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>City</th><th>Rent</th><th>Status</th><th>Availability</th></tr></thead>
              <tbody>
                {items.slice(0, 8).map((i) => (
                  <tr key={i.id}>
                    <td><Link to={`/accommodations/${i.id}`}>{i.name}</Link></td>
                    <td>{i.accommodationType}</td>
                    <td>{i.location?.city || '—'}</td>
                    <td>₹{Number(i.pricing?.monthlyRent || 0).toLocaleString('en-IN')}</td>
                    <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                    <td>{i.availability?.status || '—'}</td>
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
