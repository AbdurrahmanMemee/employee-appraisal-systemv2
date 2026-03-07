// =============================================================================
// FILE:    src/store/useAppStore.js
// PURPOSE: Global application state via Zustand.
//
// SLICES:
//   auth     — current user, login/logout actions
//   config   — dropdown data (departments, job titles, etc.)
//   ui       — loading, error, toast notifications
//
// DESIGN NOTES:
//   - Data for employees, meetings, etc. lives in each page/component
//     via local state + API calls. We only put GLOBAL state here.
//   - Config is global because every form needs dropdowns.
//   - Auth is global because every route needs the current user + role.
//   - UI helpers (toast, loading) are global for use from anywhere.
// =============================================================================

import { create } from 'zustand';
import { authAPI, configAPI } from '../services/api';

const useAppStore = create((set, get) => ({

  // ── AUTH ──────────────────────────────────────────────────────────────────
  user: authAPI.getStoredUser(),   // hydrate from localStorage on load

  login: async (username, password) => {
    const user = await authAPI.login(username, password);
    set({ user });
    // Fetch config immediately after login so dropdowns are ready
    get().fetchConfig();
    return user;
  },

  logout: async () => {
    await authAPI.logout();
    set({ user: null, config: null });
  },

  setUser: (user) => set({ user }),

  // ── CONFIG (dropdowns) ────────────────────────────────────────────────────
  // Shape: { departments: [...], job_titles: [...], meeting_types: [...],
  //          incident_types: [...], appraisal_sections: [...] }
  config: null,

  fetchConfig: async () => {
    try {
      const res = await configAPI.getAll();
      set({ config: res.data });
    } catch (err) {
      get().showToast('Failed to load config: ' + err.message, 'error');
    }
  },

  // ── UI HELPERS ────────────────────────────────────────────────────────────
  // Global loading overlay (use sparingly — prefer local loading states)
  globalLoading: false,
  setGlobalLoading: (v) => set({ globalLoading: v }),

  // Toast notifications — components call showToast(), layout renders them
  toasts: [],

  showToast: (message, type = 'info', durationMs = 4000) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export default useAppStore;

// ── Convenience selectors ────────────────────────────────────────────────────
// Use these in components to avoid re-renders when unrelated state changes.
export const useUser      = ()  => useAppStore((s) => s.user);
export const useConfig    = ()  => useAppStore((s) => s.config);
export const useToasts    = ()  => useAppStore((s) => s.toasts);
export const useIsAdmin   = ()  => useAppStore((s) => s.user?.role === 'admin');
export const useIsManager = ()  => useAppStore((s) => ['admin','manager'].includes(s.user?.role));
