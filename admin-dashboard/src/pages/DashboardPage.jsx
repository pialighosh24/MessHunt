import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { getDashboardStats } from '../services/api';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try { const s = await getDashboardStats(); if (mounted) setStats(s); }
      catch (e) { if (mounted) setError(e.message || 'Failed to load dashboard stats.'); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const Card = ({ title, value }) => (
    <div className="card stat"><h3>{title}</h3><p>{loading ? '...' : (value ?? 0)}</p></div>
  );

  return (
    <Layout title="Admin Overview" subtitle="Platform statistics and moderation summary.">
      {error && <div className="alert alert-error">{error}</div>}
      <section className="card-grid">
        <Card title="Total Students" value={stats?.students?.total} />
        <Card title="Total Owners" value={stats?.owners?.total} />
        <Card title="Total Accommodations" value={stats?.accommodations?.total} />
        <Card title="Pending Accommodations" value={stats?.accommodations?.pending} />
        <Card title="Approved Accommodations" value={stats?.accommodations?.approved} />
        <Card title="Rejected Accommodations" value={stats?.accommodations?.rejected} />
        <Card title="Total Reviews" value={stats?.reviews?.total} />
        <Card title="Pending Review Reports" value={stats?.reviews?.pendingReports} />
      </section>
      <div className="card">
        <h3>Details</h3>
        {loading ? <p className="muted">Loading...</p> : stats ? (
          <ul className="details-list">
            <li>Students: {stats.students.active} active, {stats.students.inactive} inactive</li>
            <li>Owners: {stats.owners.verified} verified, {stats.owners.unverified} unverified, {stats.owners.active} active</li>
            <li>Accommodations: {stats.accommodations.available} available, {stats.accommodations.full} full</li>
            <li>Reviews: {stats.reviews.reported} reported, {stats.reviews.removed} removed</li>
          </ul>
        ) : <p className="muted">No data.</p>}
      </div>
    </Layout>
  );
}
