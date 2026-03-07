// frontend/src/services/api.js - Centralized API service layer
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Attach JWT to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

const getMsg = (err) =>
  err.response?.data?.message || err.message || 'Unexpected error';

export const authAPI = {
  login: async (username, password) => {
    try {
      const res = await api.post('/auth/login', { username, password });
      const { token, user } = res.data.data;
      localStorage.setItem('authToken', token);
      localStorage.setItem('authUser', JSON.stringify(user));
      return res.data;
    } catch (err) { throw new Error(getMsg(err)); }
  },
  logout: async () => {
    try { await api.post('/auth/logout'); } finally {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
    }
  },
  getCurrentUser: async () => (await api.get('/auth/me')).data,
  changePassword: async (current_password, new_password) =>
    (await api.post('/auth/change-password', { current_password, new_password })).data,
  getStoredUser: () => { try { const s = localStorage.getItem('authUser'); return s ? JSON.parse(s) : null; } catch { return null; } },
  isAuthenticated: () => !!localStorage.getItem('authToken')
};

export const employeeAPI = {
  getAll: async (params = {}) => { try { return (await api.get('/employees', { params })).data; } catch (err) { throw new Error(getMsg(err)); } },
  getById: async (id) => (await api.get(`/employees/${id}`)).data,
  getSummary: async (id) => (await api.get(`/employees/${id}/summary`)).data,
  getStats: async () => (await api.get('/employees/stats/overview')).data,
  create: async (data) => { try { return (await api.post('/employees', data)).data; } catch (err) { throw new Error(getMsg(err)); } },
  update: async (id, data) => { try { return (await api.put(`/employees/${id}`, data)).data; } catch (err) { throw new Error(getMsg(err)); } },
  delete: async (id) => (await api.delete(`/employees/${id}`)).data,
  restore: async (id) => (await api.post(`/employees/${id}/restore`)).data
};

export const meetingAPI = {
  getAll: async (params = {}) => (await api.get('/meetings', { params })).data,
  getByEmployee: async (id) => (await api.get(`/meetings/employee/${id}`)).data,
  getById: async (id) => (await api.get(`/meetings/${id}`)).data,
  create: async (data) => { try { return (await api.post('/meetings', data)).data; } catch (err) { throw new Error(getMsg(err)); } },
  update: async (id, data) => (await api.put(`/meetings/${id}`, data)).data,
  delete: async (id) => (await api.delete(`/meetings/${id}`)).data
};

export const appraisalAPI = {
  getAll: async (params = {}) => (await api.get('/appraisals', { params })).data,
  getByEmployee: async (id) => (await api.get(`/appraisals/employee/${id}`)).data,
  getById: async (id) => (await api.get(`/appraisals/${id}`)).data,
  create: async (data) => { try { return (await api.post('/appraisals', data)).data; } catch (err) { throw new Error(getMsg(err)); } },
  update: async (id, data) => (await api.put(`/appraisals/${id}`, data)).data,
  submit: async (id) => (await api.post(`/appraisals/${id}/submit`)).data
};

export const incidentAPI = {
  getAll: async (params = {}) => (await api.get('/incidents', { params })).data,
  getByEmployee: async (id) => (await api.get(`/incidents/employee/${id}`)).data,
  create: async (data) => { try { return (await api.post('/incidents', data)).data; } catch (err) { throw new Error(getMsg(err)); } },
  update: async (id, data) => (await api.put(`/incidents/${id}`, data)).data
};

export const scheduleAPI = {
  getAll: async (params = {}) => (await api.get('/schedules', { params })).data,
  getById: async (id) => (await api.get(`/schedules/${id}`)).data,
  create: async (data) => { try { return (await api.post('/schedules', data)).data; } catch (err) { throw new Error(getMsg(err)); } },
  update: async (id, data) => (await api.put(`/schedules/${id}`, data)).data,
  cancel: async (id) => (await api.post(`/schedules/${id}/cancel`)).data
};

export const configAPI = {
  getAll: async () => (await api.get('/config')).data,
  getCategory: async (cat) => (await api.get(`/config/${cat}`)).data,
  addItem: async (cat, value) => (await api.post(`/config/${cat}`, { value })).data,
  updateItem: async (cat, id, data) => (await api.put(`/config/${cat}/${id}`, data)).data,
  deleteItem: async (cat, id) => (await api.delete(`/config/${cat}/${id}`)).data
};

export const dashboardAPI = {
  getStats: async () => (await api.get('/dashboard/stats')).data,
  getRecentActivities: async () => (await api.get('/dashboard/recent-activities')).data,
  getPerformanceTrends: async () => (await api.get('/dashboard/performance-trends')).data,
  getDepartmentStats: async () => (await api.get('/dashboard/department-stats')).data
};

export default api;
