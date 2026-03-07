// frontend/src/App.js
import React, { useEffect, useState } from 'react';
import { FileText, Home, Users, CalendarDays, Settings, LogOut, RefreshCw } from 'lucide-react';
import useAppStore, { useUI, useUIActions, useEmployees, useEmployeeActions, useMeetingActions, useAppraisalActions, useLoading, useError } from './store/useAppStore';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import EmployeeList from './components/EmployeeList';
import EmployeeDetail from './components/EmployeeDetail';
import CalendarView from './components/CalendarView';
import ConfigurationTab from './components/ConfigurationTab';
import FormalAppraisalForm from './components/forms/FormalAppraisalForm';
import IncidentLoggingForm from './components/forms/IncidentLoggingForm';
import ScheduleAppraisalForm from './components/forms/ScheduleAppraisalForm';
import EmployeeMasterForm from './components/forms/EmployeeMasterForm';
import NewMeetingForm from './components/forms/NewMeetingForm';
import { authAPI } from './services/api';


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ hasError: true, error, errorInfo });
    console.error('=== COMPONENT CRASH ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component tree:', errorInfo.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:'2rem',fontFamily:'monospace',background:'#fff1f0',minHeight:'100vh'}}>
          <h2 style={{color:'#c00',marginBottom:'1rem'}}>Component Error — Check Browser Console for Details</h2>
          <div style={{background:'#fff',padding:'1rem',borderRadius:'4px',border:'1px solid #fcc',marginBottom:'1rem'}}>
            <strong>Error:</strong> {this.state.error && this.state.error.message}
          </div>
          <div style={{background:'#fff',padding:'1rem',borderRadius:'4px',border:'1px solid #fcc',marginBottom:'1rem',whiteSpace:'pre-wrap',fontSize:'0.8rem'}}>
            <strong>Component Stack:</strong>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </div>
          <div style={{background:'#fff',padding:'1rem',borderRadius:'4px',border:'1px solid #fcc',whiteSpace:'pre-wrap',fontSize:'0.8rem'}}>
            <strong>JS Stack:</strong>
            {this.state.error && this.state.error.stack}
          </div>
          <button onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{marginTop:'1rem',padding:'0.5rem 1rem',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer'}}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const ui = useUI();
  const uiActions = useUIActions();
  const employees = useEmployees();
  const employeeActions = useEmployeeActions();
  const meetingActions = useMeetingActions();
  const appraisalActions = useAppraisalActions();
  const loading = useLoading();
  const error = useError();

  useEffect(() => {
    const storedUser = authAPI.getStoredUser();
    if (storedUser && authAPI.isAuthenticated()) setCurrentUser(storedUser);
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    if (currentUser) useAppStore.getState().syncData().catch(console.error);
  }, [currentUser]);

  useEffect(() => {
    const on = () => useAppStore.getState().setOnlineStatus(true);
    const off = () => useAppStore.getState().setOnlineStatus(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    setCurrentUser(null);
    useAppStore.getState().resetStore();
  };

  if (authLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;
  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;

  const renderContent = () => {
    if (ui.showNewForm === 'meeting') return <NewMeetingForm employee={ui.selectedEmployee} onClose={() => uiActions.setShowNewForm(null)} onSave={async (d) => { await meetingActions.createMeeting(d); uiActions.setShowNewForm(null); }} />;
    if (ui.showNewForm === 'appraisal') return <FormalAppraisalForm employee={ui.selectedEmployee} onClose={() => uiActions.setShowNewForm(null)} onSave={async (d) => { await appraisalActions.createAppraisal(d); uiActions.setShowNewForm(null); }} />;
    if (ui.showNewForm === 'incident') return <IncidentLoggingForm employee={ui.selectedEmployee} onClose={() => uiActions.setShowNewForm(null)} onSave={async (d) => { await useAppStore.getState().createIncident(d); uiActions.setShowNewForm(null); }} />;
    if (ui.showNewForm === 'schedule') return <ScheduleAppraisalForm employee={ui.selectedEmployee} onClose={() => uiActions.setShowNewForm(null)} onSave={async (d) => { await useAppStore.getState().createScheduledAppraisal(d); uiActions.setShowNewForm(null); }} />;
    if (ui.showNewForm === 'employee') return <EmployeeMasterForm employee={ui.selectedEmployee} onClose={() => uiActions.setShowNewForm(null)} onSave={async (d) => { if (ui.selectedEmployee) await employeeActions.updateEmployee(ui.selectedEmployee.employee_number, d); else await employeeActions.createEmployee(d); uiActions.setShowNewForm(null); }} />;
    if (ui.selectedEmployee) return <EmployeeDetail employee={ui.selectedEmployee} onBack={() => uiActions.setSelectedEmployee(null)} onNewMeeting={() => uiActions.setShowNewForm('meeting')} onNewAppraisal={() => uiActions.setShowNewForm('appraisal')} onNewIncident={() => uiActions.setShowNewForm('incident')} onEditEmployee={() => uiActions.setShowNewForm('employee')} />;
    switch (ui.activeTab) {
      case 'employees': return <EmployeeList />;
      case 'calendar': return <CalendarView />;
      case 'configuration': return <ConfigurationTab />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {error && <div className="bg-red-50 border-l-4 border-red-400 p-3 flex justify-between items-center"><p className="text-sm text-red-700">{error}</p><button onClick={uiActions.clearError} className="text-red-600 text-sm font-medium ml-4">Dismiss</button></div>}
      {loading && <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-50"><div className="bg-white p-5 rounded-lg shadow-xl flex items-center space-x-3"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div><p className="text-gray-600">Loading...</p></div></div>}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center"><FileText className="w-7 h-7 text-blue-600" /><h1 className="ml-3 text-xl font-bold text-gray-900">Employee Appraisal System</h1></div>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500 hidden sm:block">{employees.filter(e => e.is_active).length} Active</span>
              <button onClick={() => useAppStore.getState().syncData()} title="Refresh" className="text-gray-400 hover:text-gray-600 p-1"><RefreshCw className="w-4 h-4" /></button>
              <span className="text-sm text-gray-700 font-medium">{currentUser.username}</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">{currentUser.role}</span>
              <button onClick={handleLogout} className="flex items-center text-gray-500 hover:text-gray-700 text-sm"><LogOut className="w-4 h-4 mr-1" /><span className="hidden sm:inline">Logout</span></button>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 overflow-x-auto">
            {[{key:'dashboard',label:'Dashboard',icon:Home},{key:'employees',label:'Employees',icon:Users},{key:'calendar',label:'Calendar',icon:CalendarDays},{key:'configuration',label:'Settings',icon:Settings}].map(({key,label,icon:Icon}) => (
              <button key={key} onClick={() => { uiActions.setActiveTab(key); uiActions.setSelectedEmployee(null); uiActions.setShowNewForm(null); }} className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${ui.activeTab===key?'border-blue-500 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                <Icon className="w-4 h-4 mr-2" />{label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8"><ErrorBoundary key={ui.activeTab + (ui.showNewForm||"") + (ui.selectedEmployee?.employee_number||"")}>{renderContent()}</ErrorBoundary></main>
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-2 rounded text-xs opacity-75 hover:opacity-100">
          <div>Tab: {ui.activeTab} | Form: {ui.showNewForm||'None'}</div>
          <div>User: {currentUser.username} ({currentUser.role})</div>
          <button onClick={() => useAppStore.getState().resetStore()} className="mt-1 bg-red-600 px-2 py-1 rounded w-full">Reset Store</button>
        </div>
      )}
    </div>
  );
};

export default App;
