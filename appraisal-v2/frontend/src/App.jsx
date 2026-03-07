// =============================================================================
// FILE:    src/App.jsx
// PURPOSE: Root component. Defines all routes.
//          Protected routes are wrapped in AuthGuard + AppLayout.
//          As modules are built, swap Placeholder imports for real pages.
// =============================================================================

import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAppStore, { useUser } from './store/useAppStore';

// Layout
import AppLayout  from './components/layout/AppLayout';
import AuthGuard  from './components/layout/AuthGuard';

// Pages
import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import {
  EmployeesPage,
  SchedulesPage,
  IncidentsPage,
  ConfigPage,
} from './pages/Placeholder';

// Error boundary — catches unexpected render crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[EAS ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-red-50">
          <div className="max-w-lg w-full bg-white rounded-xl shadow border border-red-200 p-8">
            <h2 className="text-xl font-bold text-red-700 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-600 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Helper: a protected route — requires auth, wraps in layout
// ---------------------------------------------------------------------------
const Protected = ({ children, requiredRole }) => (
  <AuthGuard requiredRole={requiredRole}>
    <AppLayout>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppLayout>
  </AuthGuard>
);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const App = () => {
  const user        = useUser();
  const fetchConfig = useAppStore((s) => s.fetchConfig);

  // Load config dropdowns once when user is present (e.g. on page refresh)
  useEffect(() => {
    if (user) fetchConfig();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — all roles */}
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/employees" element={<Protected><EmployeesPage /></Protected>} />
      <Route path="/schedules" element={<Protected><SchedulesPage /></Protected>} />

      {/* Protected — admin + manager only */}
      <Route path="/incidents" element={<Protected requiredRole="manager"><IncidentsPage /></Protected>} />

      {/* Protected — admin only */}
      <Route path="/config" element={<Protected requiredRole="admin"><ConfigPage /></Protected>} />

      {/* Default redirects */}
      <Route path="/"   element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="*"   element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
};

export default App;

