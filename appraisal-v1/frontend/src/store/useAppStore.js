// frontend/src/store/useAppStore.js - Production Zustand Store
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { employeeAPI, meetingAPI, appraisalAPI, incidentAPI, scheduleAPI, configAPI, dashboardAPI } from '../services/api';

const initialConfig = { departments: [], managers: [], jobDescriptions: [], meetingTypes: [], generalMisconductTypes: [], grossMisconductTypes: [], achievementTypes: [], incidentLogTypes: [] };

const useAppStore = create(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          ui: { activeTab: 'dashboard', selectedEmployee: null, selectedAppraisal: null, selectedMeeting: null, showNewForm: null, searchTerm: '', filterStatus: 'all', loading: false, error: null, isOnline: true, lastSync: null },
          employees: [], meetings: [], appraisals: [], incidents: [], scheduledAppraisals: [],
          config: initialConfig,
          pagination: { employees: { page: 1, limit: 50, total: 0 } },
          cache: { dashboardStats: null, lastFetched: {} },

          setActiveTab: (tab) => set((s) => { s.ui.activeTab = tab; s.ui.selectedEmployee = null; s.ui.showNewForm = null; }),
          setSelectedEmployee: (e) => set((s) => { s.ui.selectedEmployee = e; }),
          setSelectedAppraisal: (a) => set((s) => { s.ui.selectedAppraisal = a; }),
          setSelectedMeeting: (m) => set((s) => { s.ui.selectedMeeting = m; }),
          setShowNewForm: (f) => set((s) => { s.ui.showNewForm = f; }),
          setSearchTerm: (t) => set((s) => { s.ui.searchTerm = t; }),
          setFilterStatus: (st) => set((s) => { s.ui.filterStatus = st; }),
          clearError: () => set((s) => { s.ui.error = null; }),
          setOnlineStatus: (v) => set((s) => { s.ui.isOnline = v; }),

          fetchEmployees: async (params = {}) => {
            set((s) => { s.ui.loading = true; s.ui.error = null; });
            try {
              const r = await employeeAPI.getAll({ page: get().pagination.employees.page, limit: get().pagination.employees.limit, ...params });
              set((s) => { s.employees = r.data.employees || r.data; if (r.data.pagination) s.pagination.employees = r.data.pagination; s.cache.lastFetched.employees = Date.now(); });
              return r;
            } catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },
          createEmployee: async (data) => {
            set((s) => { s.ui.loading = true; });
            try { const r = await employeeAPI.create(data); set((s) => { s.employees.unshift(r.data); }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },
          updateEmployee: async (id, data) => {
            set((s) => { s.ui.loading = true; });
            try {
              const r = await employeeAPI.update(id, data);
              set((s) => { const i = s.employees.findIndex(e => e.employee_number === id); if (i !== -1) s.employees[i] = r.data; if (s.ui.selectedEmployee?.employee_number === id) s.ui.selectedEmployee = r.data; });
              return r;
            } catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },
          deleteEmployee: async (id) => {
            set((s) => { s.ui.loading = true; });
            try { await employeeAPI.delete(id); set((s) => { const i = s.employees.findIndex(e => e.employee_number === id); if (i !== -1) s.employees[i].is_active = false; }); return { success: true }; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },

          fetchMeetings: async (params = {}) => {
            set((s) => { s.ui.loading = true; });
            try { const r = await meetingAPI.getAll(params); set((s) => { s.meetings = r.data.meetings || r.data; }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },
          createMeeting: async (data) => {
            try {
              const r = await meetingAPI.create(data);
              set((s) => { s.meetings.unshift(r.data); const emp = s.employees.find(e => e.employee_number === data.employee_number); if (emp) emp.last_meeting_date = data.meeting_date; });
              return r;
            } catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },

          fetchAppraisals: async (params = {}) => {
            set((s) => { s.ui.loading = true; });
            try { const r = await appraisalAPI.getAll(params); set((s) => { s.appraisals = r.data.appraisals || r.data; }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },
          createAppraisal: async (data) => {
            set((s) => { s.ui.loading = true; });
            try {
              const r = await appraisalAPI.create(data);
              set((s) => { s.appraisals.unshift(r.data); const emp = s.employees.find(e => e.employee_number === data.employee_number); if (emp) { emp.last_appraisal_date = data.appraisal_date; emp.next_scheduled_appraisal = data.next_appraisal_date; } });
              return r;
            } catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
            finally { set((s) => { s.ui.loading = false; }); }
          },
          updateAppraisal: async (id, data) => {
            try { const r = await appraisalAPI.update(id, data); set((s) => { const i = s.appraisals.findIndex(a => a.appr_id === id); if (i !== -1) s.appraisals[i] = r.data; }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },

          fetchIncidents: async (params = {}) => {
            try { const r = await incidentAPI.getAll(params); set((s) => { s.incidents = r.data.incidents || r.data; }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },
          createIncident: async (data) => {
            try { const r = await incidentAPI.create(data); set((s) => { s.incidents.unshift(r.data); }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },

          fetchScheduledAppraisals: async (params = {}) => {
            try { const r = await scheduleAPI.getAll(params); set((s) => { s.scheduledAppraisals = r.data.schedules || r.data; }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },
          createScheduledAppraisal: async (data) => {
            try {
              const r = await scheduleAPI.create(data);
              set((s) => { s.scheduledAppraisals.unshift(r.data); const emp = s.employees.find(e => e.employee_number === parseInt(data.employee_number)); if (emp) emp.next_scheduled_appraisal = data.scheduled_date; });
              return r;
            } catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },

          fetchConfig: async () => {
            try { const r = await configAPI.getAll(); set((s) => { s.config = r.data; }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },
          addConfigItem: async (category, value) => {
            try { await configAPI.addItem(category, value); set((s) => { if (!s.config[category]) s.config[category] = []; s.config[category].push(value); s.config[category].sort(); }); }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },
          removeConfigItem: async (category, id, value) => {
            try { await configAPI.deleteItem(category, id); set((s) => { if (s.config[category]) s.config[category] = s.config[category].filter(v => v !== value); }); }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },

          fetchDashboardStats: async () => {
            try { const r = await dashboardAPI.getStats(); set((s) => { s.cache.dashboardStats = r.data; s.cache.lastFetched.dashboard = Date.now(); }); return r; }
            catch (e) { set((s) => { s.ui.error = e.message; }); throw e; }
          },

          syncData: async () => {
            set((s) => { s.ui.loading = true; });
            try {
              await Promise.allSettled([get().fetchEmployees(), get().fetchMeetings(), get().fetchAppraisals(), get().fetchIncidents(), get().fetchScheduledAppraisals(), get().fetchConfig()]);
              set((s) => { s.ui.lastSync = new Date().toISOString(); });
              return { success: true };
            } finally { set((s) => { s.ui.loading = false; }); }
          },

          getEmployeeById: (n) => get().employees.find(e => e.employee_number === n),
          getFilteredEmployees: () => {
            const { employees, ui } = get();
            return employees.filter(emp => {
              if (ui.filterStatus === 'active' && !emp.is_active) return false;
              if (ui.filterStatus === 'inactive' && emp.is_active) return false;
              if (ui.searchTerm) { const t = ui.searchTerm.toLowerCase(); return emp.employee_name?.toLowerCase().includes(t) || emp.employee_surname?.toLowerCase().includes(t) || emp.employee_id?.toLowerCase().includes(t) || emp.department?.toLowerCase().includes(t); }
              return true;
            });
          },
          getEmployeeMeetings: (n) => get().meetings.filter(m => m.employee_number === n),
          getEmployeeAppraisals: (n) => get().appraisals.filter(a => a.employee_number === n),
          getEmployeeIncidents: (n) => get().incidents.filter(i => i.employee_number === n),
          getDashboardStats: () => {
            const { employees, meetings, appraisals, incidents, scheduledAppraisals } = get();
            const today = new Date();
            return {
              totalEmployees: employees.length, activeEmployees: employees.filter(e => e.is_active).length,
              totalMeetings: meetings.length, totalAppraisals: appraisals.length,
              completedAppraisals: appraisals.filter(a => a.appraisal_status === 'Completed').length,
              totalIncidents: incidents.length,
              overdueAppraisals: employees.filter(e => e.next_scheduled_appraisal && new Date(e.next_scheduled_appraisal) < today).length,
              upcomingAppraisals: scheduledAppraisals.filter(s => s.status === 'Scheduled' && new Date(s.scheduled_date) >= today).length,
              averageRating: employees.length ? (employees.reduce((sum, e) => sum + (parseFloat(e.average_employee_rating) || 0), 0) / employees.length).toFixed(2) : 0
            };
          },
          resetStore: () => set((s) => { s.employees = []; s.meetings = []; s.appraisals = []; s.incidents = []; s.scheduledAppraisals = []; s.config = initialConfig; s.ui = { activeTab: 'dashboard', selectedEmployee: null, selectedAppraisal: null, selectedMeeting: null, showNewForm: null, searchTerm: '', filterStatus: 'all', loading: false, error: null, isOnline: true, lastSync: null }; })
        }))
      ),
      { name: 'employee-appraisal-store', partialize: (s) => ({ config: s.config, ui: { activeTab: s.ui.activeTab } }) }
    )
  )
);

export const useUI = () => useAppStore((s) => s.ui);
export const useUIActions = () => useAppStore((s) => ({ setActiveTab: s.setActiveTab, setSelectedEmployee: s.setSelectedEmployee, setSelectedAppraisal: s.setSelectedAppraisal, setSelectedMeeting: s.setSelectedMeeting, setShowNewForm: s.setShowNewForm, setSearchTerm: s.setSearchTerm, setFilterStatus: s.setFilterStatus, clearError: s.clearError }));
export const useEmployees = () => useAppStore((s) => s.employees);
export const useEmployeeActions = () => useAppStore((s) => ({ fetchEmployees: s.fetchEmployees, createEmployee: s.createEmployee, updateEmployee: s.updateEmployee, deleteEmployee: s.deleteEmployee }));
export const useMeetings = () => useAppStore((s) => s.meetings);
export const useMeetingActions = () => useAppStore((s) => ({ fetchMeetings: s.fetchMeetings, createMeeting: s.createMeeting }));
export const useAppraisals = () => useAppStore((s) => s.appraisals);
export const useAppraisalActions = () => useAppStore((s) => ({ fetchAppraisals: s.fetchAppraisals, createAppraisal: s.createAppraisal, updateAppraisal: s.updateAppraisal }));
export const useIncidents = () => useAppStore((s) => s.incidents);
export const useIncidentActions = () => useAppStore((s) => ({ fetchIncidents: s.fetchIncidents, createIncident: s.createIncident }));
export const useSchedules = () => useAppStore((s) => s.scheduledAppraisals);
export const useScheduleActions = () => useAppStore((s) => ({ fetchScheduledAppraisals: s.fetchScheduledAppraisals, createScheduledAppraisal: s.createScheduledAppraisal }));
export const useConfig = () => useAppStore((s) => s.config);
export const useConfigActions = () => useAppStore((s) => ({ fetchConfig: s.fetchConfig, addConfigItem: s.addConfigItem, removeConfigItem: s.removeConfigItem }));
export const useLoading = () => useAppStore((s) => s.ui.loading);
export const useError = () => useAppStore((s) => s.ui.error);
export const useComputed = () => useAppStore((s) => ({ getEmployeeById: s.getEmployeeById, getFilteredEmployees: s.getFilteredEmployees, getEmployeeMeetings: s.getEmployeeMeetings, getEmployeeAppraisals: s.getEmployeeAppraisals, getEmployeeIncidents: s.getEmployeeIncidents, getDashboardStats: s.getDashboardStats }));

export default useAppStore;
