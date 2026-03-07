// =============================================================================
// FILE:    src/services/api.js
// PURPOSE: All HTTP calls to the backend API.
//          One named export per resource. Components never call axios directly.
//
// PATTERN:
//   - axios instance with base URL + JWT interceptor
//   - 401 responses auto-clear token and redirect to login
//   - Errors always throw an Error with a human-readable message
//   - multipart/form-data handled per-call (meetings with attachments)
// =============================================================================

import axios from 'axios';

// In dev, Vite proxies /api → http://localhost:5001 (vite.config.js)
// In prod, /api is served from the same origin as the frontend
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('eas_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally — token expired or revoked
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('eas_token');
      localStorage.removeItem('eas_user');
      // Let the app's auth state handle the redirect
      window.dispatchEvent(new Event('eas:unauthorized'));
    }
    return Promise.reject(error);
  }
);

// Extract the most useful error message from an axios error
const getMsg = (err) =>
  err.response?.data?.message || err.message || 'Unexpected error';

// Wrap every call so errors are always plain Error objects with good messages
const call = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    throw new Error(getMsg(err));
  }
};

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
export const authAPI = {
  login: async (username, password) => {
    const res = await call(() => api.post('/auth/login', { username, password }));
    const { token, user } = res.data.data || res.data;
    localStorage.setItem('eas_token', token);
    localStorage.setItem('eas_user', JSON.stringify(user));
    return user;
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ } finally {
      localStorage.removeItem('eas_token');
      localStorage.removeItem('eas_user');
    }
  },

  me: () => call(() => api.get('/auth/me')).then(r => r.data.data),

  changePassword: (current_password, new_password) =>
    call(() => api.put('/auth/change-password', { current_password, new_password }))
      .then(r => r.data),

  // Helpers used by the store / auth guard
  getStoredUser: () => {
    try {
      const s = localStorage.getItem('eas_user');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  },
  isAuthenticated: () => !!localStorage.getItem('eas_token'),
};

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------
export const employeeAPI = {
  getAll:   (params = {}) => call(() => api.get('/employees', { params })).then(r => r.data),
  getById:  (id)          => call(() => api.get(`/employees/${id}`)).then(r => r.data),
  getSummary: (id)        => call(() => api.get(`/employees/${id}/summary`)).then(r => r.data),
  getStats: ()            => call(() => api.get('/employees/stats')).then(r => r.data),

  create: (data) => call(() => api.post('/employees', data)).then(r => r.data),
  update: (id, data) => call(() => api.put(`/employees/${id}`, data)).then(r => r.data),
  deactivate: (id) => call(() => api.delete(`/employees/${id}`)).then(r => r.data),
  restore:    (id) => call(() => api.post(`/employees/${id}/restore`)).then(r => r.data),
};

// ---------------------------------------------------------------------------
// MEETINGS
// ---------------------------------------------------------------------------
export const meetingAPI = {
  getAll:  (params = {}) => call(() => api.get('/meetings', { params })).then(r => r.data),
  getById: (id)          => call(() => api.get(`/meetings/${id}`)).then(r => r.data),

  // Supports JSON body OR multipart/form-data (when attachment is a File object)
  create: (data) => {
    if (data.attachment instanceof File) {
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== null && v !== undefined) form.append(k, v);
      });
      return call(() => api.post('/meetings', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).then(r => r.data);
    }
    return call(() => api.post('/meetings', data)).then(r => r.data);
  },

  update: (id, data) => call(() => api.put(`/meetings/${id}`, data)).then(r => r.data),
  delete: (id)       => call(() => api.delete(`/meetings/${id}`)).then(r => r.data),

  uploadAttachment: (id, file) => {
    const form = new FormData();
    form.append('attachment', file);
    return call(() => api.post(`/meetings/${id}/attachment`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).then(r => r.data);
  },
  deleteAttachment: (id) =>
    call(() => api.delete(`/meetings/${id}/attachment`)).then(r => r.data),
};

// ---------------------------------------------------------------------------
// APPRAISALS
// ---------------------------------------------------------------------------
export const appraisalAPI = {
  getAll:  (params = {}) => call(() => api.get('/appraisals', { params })).then(r => r.data),
  getById: (id)          => call(() => api.get(`/appraisals/${id}`)).then(r => r.data),

  create: (data)     => call(() => api.post('/appraisals', data)).then(r => r.data),
  update: (id, data) => call(() => api.put(`/appraisals/${id}`, data)).then(r => r.data),
  submit: (id)       => call(() => api.post(`/appraisals/${id}/submit`)).then(r => r.data),
  cancel: (id)       => call(() => api.post(`/appraisals/${id}/cancel`)).then(r => r.data),
  delete: (id)       => call(() => api.delete(`/appraisals/${id}`)).then(r => r.data),
};

// ---------------------------------------------------------------------------
// INCIDENTS
// ---------------------------------------------------------------------------
export const incidentAPI = {
  getAll:  (params = {}) => call(() => api.get('/incidents', { params })).then(r => r.data),
  getById: (id)          => call(() => api.get(`/incidents/${id}`)).then(r => r.data),
  create: (data)     => call(() => api.post('/incidents', data)).then(r => r.data),
  update: (id, data) => call(() => api.put(`/incidents/${id}`, data)).then(r => r.data),
  delete: (id)       => call(() => api.delete(`/incidents/${id}`)).then(r => r.data),
};

// ---------------------------------------------------------------------------
// SCHEDULES
// ---------------------------------------------------------------------------
export const scheduleAPI = {
  getAll:    (params = {}) => call(() => api.get('/schedules', { params })).then(r => r.data),
  getById:   (id)          => call(() => api.get(`/schedules/${id}`)).then(r => r.data),
  getUpcoming: (days = 30) => call(() => api.get('/schedules', { params: { upcoming: true, days } })).then(r => r.data),

  create:   (data)     => call(() => api.post('/schedules', data)).then(r => r.data),
  update:   (id, data) => call(() => api.put(`/schedules/${id}`, data)).then(r => r.data),
  postpone: (id, data) => call(() => api.post(`/schedules/${id}/postpone`, data)).then(r => r.data),
  cancel:   (id)       => call(() => api.post(`/schedules/${id}/cancel`)).then(r => r.data),
  delete:   (id)       => call(() => api.delete(`/schedules/${id}`)).then(r => r.data),
  sendInvite: (id, data = {}) =>
    call(() => api.post(`/schedules/${id}/invite`, data)).then(r => r.data),
};

// ---------------------------------------------------------------------------
// CONFIG (dropdowns)
// ---------------------------------------------------------------------------
export const configAPI = {
  getAll:     ()             => call(() => api.get('/config')).then(r => r.data),
  getCategory: (category)   => call(() => api.get(`/config/${category}`)).then(r => r.data),
  create:  (category, name) => call(() => api.post(`/config/${category}`, { name })).then(r => r.data),
  update:  (category, id, name) =>
    call(() => api.put(`/config/${category}/${id}`, { name })).then(r => r.data),
  deactivate: (category, id) =>
    call(() => api.delete(`/config/${category}/${id}`)).then(r => r.data),
  restore: (category, id) =>
    call(() => api.post(`/config/${category}/${id}/restore`)).then(r => r.data),
};

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
export const dashboardAPI = {
  getStats:        ()             => call(() => api.get('/dashboard/stats')).then(r => r.data),
  getUpcoming:     (days = 30)   => call(() => api.get('/dashboard/upcoming', { params: { days } })).then(r => r.data),
  getRecentActivity: (limit = 15) => call(() => api.get('/dashboard/recent-activity', { params: { limit } })).then(r => r.data),
  getDepartmentStats: ()          => call(() => api.get('/dashboard/department-stats')).then(r => r.data),
  getPerformanceTrends: (months = 12) =>
    call(() => api.get('/dashboard/performance-trends', { params: { months } })).then(r => r.data),
};

export default api;
