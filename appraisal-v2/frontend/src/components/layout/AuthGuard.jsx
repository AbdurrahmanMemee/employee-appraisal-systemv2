// =============================================================================
// FILE:    src/components/layout/AuthGuard.jsx
// PURPOSE: Wraps protected routes. Redirects to /login if not authenticated.
//          Also listens for the global 'eas:unauthorized' event (401 responses)
//          and redirects automatically.
// =============================================================================

import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../../store/useAppStore';
import useAppStore from '../../store/useAppStore';

const AuthGuard = ({ children, requiredRole }) => {
  const user     = useUser();
  const location = useLocation();
  const logout   = useAppStore((s) => s.logout);

  // Listen for 401 events dispatched by the API layer
  useEffect(() => {
    const handle = () => logout();
    window.addEventListener('eas:unauthorized', handle);
    return () => window.removeEventListener('eas:unauthorized', handle);
  }, [logout]);

  // Not logged in — redirect to login, preserve intended destination
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role check (optional — pass requiredRole prop to restrict a route)
  if (requiredRole) {
    const hierarchy = { admin: 3, manager: 2, employee: 1 };
    const userLevel     = hierarchy[user.role]     || 0;
    const requiredLevel = hierarchy[requiredRole]  || 0;
    if (userLevel < requiredLevel) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

export default AuthGuard;
