// =============================================================================
// FILE:    src/pages/DashboardPage.jsx
// PURPOSE: Main dashboard — shows headline stats, upcoming appraisals,
//          recent activity feed, and department breakdown.
//          All data fetched from /api/dashboard/* endpoints.
//          Read-only — no forms. Visible to all roles (scoped by backend).
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { dashboardAPI } from '../services/api';
import { useUser } from '../store/useAppStore';
import {
  Spinner,
  PageLoader,
  Card,
  CardHeader,
  Alert,
  EmptyState,
  StatusBadge,
} from '../components/ui/index';

// =============================================================================
// HELPERS
// =============================================================================

/** Format a date string or JS Date to a readable short date e.g. "12 Mar 2026" */
function fmtDate(val) {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** How many days from today to a future date (negative = overdue) */
function daysFromToday(val) {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d)) return null;
  const diff = Math.round((d - Date.now()) / 86400000);
  return diff;
}

/** Return a human-readable "due in X days" / "overdue X days" label */
function dueBadge(val) {
  const days = daysFromToday(val);
  if (days === null) return { label: '—', variant: 'default' };
  if (days < 0)  return { label: `Overdue ${Math.abs(days)}d`, variant: 'danger' };
  if (days === 0) return { label: 'Due today', variant: 'warning' };
  if (days <= 7)  return { label: `Due in ${days}d`, variant: 'warning' };
  if (days <= 30) return { label: `Due in ${days}d`, variant: 'info' };
  return { label: fmtDate(val), variant: 'default' };
}

/** Map activity kind to a coloured dot + label */
function activityMeta(kind) {
  const map = {
    meeting:   { label: 'Meeting',   color: 'bg-blue-500' },
    appraisal: { label: 'Appraisal', color: 'bg-green-500' },
    incident:  { label: 'Incident',  color: 'bg-red-500' },
    schedule:  { label: 'Scheduled', color: 'bg-purple-500' },
  };
  return map[kind] || { label: kind, color: 'bg-gray-400' };
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ label, value, sub, icon, accent }) {
  const accentMap = {
    blue:   'border-blue-500 bg-blue-50',
    green:  'border-green-500 bg-green-50',
    red:    'border-red-500 bg-red-50',
    yellow: 'border-yellow-500 bg-yellow-50',
    purple: 'border-purple-500 bg-purple-50',
  };
  const iconBg = {
    blue:   'bg-blue-100 text-blue-600',
    green:  'bg-green-100 text-green-600',
    red:    'bg-red-100 text-red-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className={`rounded-xl border-l-4 p-5 shadow-sm ${accentMap[accent] || accentMap.blue}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-800">
            {value ?? <span className="text-gray-300">—</span>}
          </p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 text-xl ${iconBg[accent] || iconBg.blue}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UPCOMING APPRAISALS TABLE
// =============================================================================

function UpcomingAppraisals({ items, loading, error }) {
  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error)   return <Alert variant="error" message={error} />;
  if (!items?.length) return <EmptyState message="No upcoming appraisals scheduled." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="pb-3 pr-4">Employee</th>
            <th className="pb-3 pr-4">Department</th>
            <th className="pb-3 pr-4">Type</th>
            <th className="pb-3 pr-4">Scheduled</th>
            <th className="pb-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((row, i) => {
            const { label, variant } = dueBadge(row.scheduled_date);
            return (
              <tr key={row.id || i} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 pr-4 font-medium text-gray-800">
                  {row.employee_name || '—'}
                </td>
                <td className="py-3 pr-4 text-gray-500">{row.department || '—'}</td>
                <td className="py-3 pr-4 text-gray-500">{row.appraisal_type || '—'}</td>
                <td className="py-3 pr-4 text-gray-500">{fmtDate(row.scheduled_date)}</td>
                <td className="py-3">
                  <StatusBadge variant={variant} label={label} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// RECENT ACTIVITY FEED
// =============================================================================

function RecentActivity({ items, loading, error }) {
  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error)   return <Alert variant="error" message={error} />;
  if (!items?.length) return <EmptyState message="No recent activity to show." />;

  return (
    <ul className="space-y-3">
      {items.map((ev, i) => {
        const meta = activityMeta(ev.kind);
        return (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-1.5 flex-shrink-0">
              <span className={`block h-2.5 w-2.5 rounded-full ${meta.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{ev.employee_name || 'Unknown'}</span>
                {' — '}
                <span className="text-gray-500">{ev.description || meta.label}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{fmtDate(ev.event_date)}</p>
            </div>
            <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {meta.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// =============================================================================
// DEPARTMENT STATS TABLE
// =============================================================================

function DepartmentStats({ items, loading, error }) {
  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error)   return <Alert variant="error" message={error} />;
  if (!items?.length) return <EmptyState message="No department data available." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="pb-3 pr-4">Department</th>
            <th className="pb-3 pr-4 text-right">Employees</th>
            <th className="pb-3 pr-4 text-right">Avg Rating</th>
            <th className="pb-3 pr-4 text-right">Overdue</th>
            <th className="pb-3 text-right">Incidents</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              <td className="py-3 pr-4 font-medium text-gray-800">{row.department || '—'}</td>
              <td className="py-3 pr-4 text-right text-gray-600">{row.total_employees ?? '—'}</td>
              <td className="py-3 pr-4 text-right">
                {row.avg_rating != null
                  ? <span className="font-semibold text-gray-700">{Number(row.avg_rating).toFixed(1)}</span>
                  : <span className="text-gray-300">—</span>
                }
              </td>
              <td className="py-3 pr-4 text-right">
                {row.overdue_count > 0
                  ? <span className="font-semibold text-red-600">{row.overdue_count}</span>
                  : <span className="text-gray-400">0</span>
                }
              </td>
              <td className="py-3 text-right">
                {row.incident_count > 0
                  ? <span className="font-semibold text-yellow-600">{row.incident_count}</span>
                  : <span className="text-gray-400">0</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD PAGE
// =============================================================================

export default function DashboardPage() {
  const user = useUser();

  const [stats,      setStats]      = useState(null);
  const [upcoming,   setUpcoming]   = useState([]);
  const [activity,   setActivity]   = useState([]);
  const [deptStats,  setDeptStats]  = useState([]);

  const [statsLoading,    setStatsLoading]    = useState(true);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [deptLoading,     setDeptLoading]     = useState(true);

  const [statsError,    setStatsError]    = useState(null);
  const [upcomingError, setUpcomingError] = useState(null);
  const [activityError, setActivityError] = useState(null);
  const [deptError,     setDeptError]     = useState(null);

  // Fetch all dashboard data in parallel
  const fetchAll = useCallback(async () => {
    setStatsLoading(true);
    setUpcomingLoading(true);
    setActivityLoading(true);
    setDeptLoading(true);

    // Stats
    dashboardAPI.getStats()
      .then(res  => setStats(res?.data))
      .catch(err => setStatsError(err.response?.data?.message || 'Failed to load stats'))
      .finally(() => setStatsLoading(false));

    // Upcoming appraisals (next 60 days)
    dashboardAPI.getUpcoming({ days: 60 })
      .then(res  => setUpcoming(res?.data || []))
      .catch(err => setUpcomingError(err.response?.data?.message || 'Failed to load upcoming'))
      .finally(() => setUpcomingLoading(false));

    // Recent activity (last 20 events)
    dashboardAPI.getRecentActivity({ limit: 20 })
      .then(res  => setActivity(res?.data || []))
      .catch(err => setActivityError(err.response?.data?.message || 'Failed to load activity'))
      .finally(() => setActivityLoading(false));

    // Department stats (admin/manager only — employee will get empty array)
    dashboardAPI.getDepartmentStats()
      .then(res  => setDeptStats(res?.data || []))
      .catch(err => setDeptError(err.response?.data?.message || 'Failed to load department stats'))
      .finally(() => setDeptLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // If stats still loading show full page loader
  const allLoading = statsLoading && upcomingLoading && activityLoading && deptLoading;
  if (allLoading) return <PageLoader />;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting()}, {user?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Here's what's happening across your team today.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Stat Cards ── */}
      {statsError && <Alert variant="error" message={statsError} />}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Employees"
          value={statsLoading ? '…' : stats?.total_employees ?? '—'}
          sub="Active staff"
          icon="👥"
          accent="blue"
        />
        <StatCard
          label="Overdue Appraisals"
          value={statsLoading ? '…' : stats?.overdue_appraisals ?? '—'}
          sub="Need attention"
          icon="⚠️"
          accent="red"
        />
        <StatCard
          label="Due in 30 Days"
          value={statsLoading ? '…' : stats?.due_soon ?? '—'}
          sub="Upcoming appraisals"
          icon="📅"
          accent="yellow"
        />
        <StatCard
          label="Avg Rating"
          value={statsLoading ? '…' : stats?.average_rating != null ? Number(stats.average_rating).toFixed(1) : '—'}
          sub="Across all completed"
          icon="⭐"
          accent="green"
        />
      </div>

      {/* ── Incidents this month (if available) ── */}
      {!statsLoading && stats?.incidents_this_month != null && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StatCard
            label="Incidents This Month"
            value={stats.incidents_this_month}
            sub="Logged incidents"
            icon="🚨"
            accent="purple"
          />
        </div>
      )}

      {/* ── Upcoming Appraisals + Recent Activity ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Upcoming — takes 2/3 width on large screens */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Upcoming Appraisals"
              subtitle="Next 60 days"
              action={
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  {upcomingLoading ? '…' : upcoming.length}
                </span>
              }
            />
            <UpcomingAppraisals
              items={upcoming}
              loading={upcomingLoading}
              error={upcomingError}
            />
          </Card>
        </div>

        {/* Recent Activity — takes 1/3 width */}
        <div>
          <Card>
            <CardHeader title="Recent Activity" subtitle="Latest events" />
            <RecentActivity
              items={activity}
              loading={activityLoading}
              error={activityError}
            />
          </Card>
        </div>
      </div>

      {/* ── Department Stats (admin/manager only) ── */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
        <Card>
          <CardHeader title="Department Overview" subtitle="Performance by department" />
          <DepartmentStats
            items={deptStats}
            loading={deptLoading}
            error={deptError}
          />
        </Card>
      )}

    </div>
  );
}
