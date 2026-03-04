import React from 'react';
import { Users, CalendarDays, AlertCircle, ClipboardList, Plus } from 'lucide-react';
import useAppStore, { useUIActions, useMeetings } from '../store/useAppStore';
const Dashboard = () => {
  const uiActions = useUIActions();
  const meetings = useMeetings();
  const scheduledAppraisals = useAppStore((s) => s.scheduledAppraisals);
  const employees = useAppStore((s) => s.employees);
  const stats = {
    totalEmployees: employees.filter(e => e.is_active || e.is_active === 1).length,
    scheduledAppraisals: scheduledAppraisals.filter(s => s.status === 'Scheduled').length,
    overdueAppraisals: scheduledAppraisals.filter(s => s.status === 'Scheduled' && new Date(s.scheduled_date) < new Date()).length,
    recentMeetings: meetings.length,
  };
  const getName = (n) => { const e = employees.find(e => e.employee_number === n); return e ? e.employee_name+' '+e.employee_surname : 'Unknown'; };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"><div className="flex items-center"><Users className="w-8 h-8 text-blue-500"/><div className="ml-4"><p className="text-sm text-gray-600">Total Employees</p><p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p></div></div></div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500"><div className="flex items-center"><CalendarDays className="w-8 h-8 text-green-500"/><div className="ml-4"><p className="text-sm text-gray-600">Scheduled Appraisals</p><p className="text-2xl font-bold text-gray-900">{stats.scheduledAppraisals}</p></div></div></div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500"><div className="flex items-center"><AlertCircle className="w-8 h-8 text-red-500"/><div className="ml-4"><p className="text-sm text-gray-600">Overdue Appraisals</p><p className="text-2xl font-bold text-gray-900">{stats.overdueAppraisals}</p></div></div></div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500"><div className="flex items-center"><ClipboardList className="w-8 h-8 text-purple-500"/><div className="ml-4"><p className="text-sm text-gray-600">Recent Meetings</p><p className="text-2xl font-bold text-gray-900">{stats.recentMeetings}</p></div></div></div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onClick={() => uiActions.setShowNewForm('meeting')} className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100"><Plus className="w-5 h-5 text-blue-600 mr-3"/><span className="text-blue-600 font-medium">New Meeting</span></button>
          <button onClick={() => uiActions.setShowNewForm('schedule')} className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100"><Plus className="w-5 h-5 text-green-600 mr-3"/><span className="text-green-600 font-medium">Schedule Appraisal</span></button>
          <button onClick={() => uiActions.setShowNewForm('incident')} className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100"><Plus className="w-5 h-5 text-purple-600 mr-3"/><span className="text-purple-600 font-medium">Log Incident</span></button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow"><div className="px-6 py-4 border-b"><h3 className="text-lg font-medium text-gray-900">Upcoming Appraisals</h3></div><div className="p-6">{scheduledAppraisals.slice(0,5).map(s=><div key={s.schedule_id} className="flex justify-between py-3 border-b last:border-b-0"><div><p className="font-medium">{getName(s.employee_number)}</p><p className="text-sm text-gray-500">{(s.scheduled_date||'').slice(0,10)}</p></div><span className="text-sm text-blue-600">{s.status}</span></div>)}{!scheduledAppraisals.length&&<p className="text-center py-4 text-gray-500">No upcoming appraisals</p>}</div></div>
        <div className="bg-white rounded-lg shadow"><div className="px-6 py-4 border-b"><h3 className="text-lg font-medium text-gray-900">Recent Meetings</h3></div><div className="p-6">{meetings.slice(0,5).map(m=><div key={m.meet_id} className="py-3 border-b last:border-b-0"><p className="font-medium">{getName(m.employee_number)}</p><p className="text-sm text-gray-500">{m.meeting_type} - {(m.meeting_date||'').slice(0,10)}</p></div>)}{!meetings.length&&<p className="text-center py-4 text-gray-500">No recent meetings</p>}</div></div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center"><div className="text-3xl font-bold text-green-600">{employees.filter(e=>parseFloat(e.average_employee_rating||0)>=4).length}</div><p className="text-sm text-gray-600 mt-1">High Performers (4+)</p></div>
          <div className="text-center"><div className="text-3xl font-bold text-yellow-600">{employees.filter(e=>parseFloat(e.average_employee_rating||0)>=3&&parseFloat(e.average_employee_rating||0)<4).length}</div><p className="text-sm text-gray-600 mt-1">Average Performers (3-4)</p></div>
          <div className="text-center"><div className="text-3xl font-bold text-red-600">{employees.filter(e=>parseFloat(e.average_employee_rating||0)>0&&parseFloat(e.average_employee_rating||0)<3).length}</div><p className="text-sm text-gray-600 mt-1">Needs Improvement</p></div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
