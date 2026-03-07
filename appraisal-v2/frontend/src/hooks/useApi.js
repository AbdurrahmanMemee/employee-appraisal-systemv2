// =============================================================================
// FILE:    src/hooks/useApi.js
// PURPOSE: Generic hook for data fetching.
//          Handles loading, error, and data state in one place.
//
// USAGE:
//   const { data, loading, error, refetch } = useApi(employeeAPI.getAll, { page: 1 });
//
//   // Or with a manual trigger:
//   const { data, loading, execute } = useApi(employeeAPI.create, null, { manual: true });
//   await execute({ first_name: 'Jane', ... });
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

const useApi = (apiFn, params = null, options = {}) => {
  const { manual = false, onSuccess, onError } = options;

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(!manual);
  const [error,   setError]   = useState(null);

  // Track if component is still mounted — prevents state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (executeParams) => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFn(executeParams ?? params);
      if (mountedRef.current) {
        setData(result);
        onSuccess?.(result);
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
        onError?.(err);
      }
      throw err;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apiFn, params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch on mount unless manual mode
  useEffect(() => {
    if (!manual) execute();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refetch: execute, execute };
};

export default useApi;
