import React, { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import useAppStore, { useEmployees, useUIActions } from '../store/useAppStore';

const CalendarView = () => {
  const scheduledAppraisals = useAppStore((s) => s.scheduledAppraisals);
  const employees = useEmployees();
  const uiActions = useUIActions();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const getEmployeeName = (empNumber) => {
    const emp = employees.find(e => e.employee_number === empNumber);
    return emp ? `${emp.employee_name} ${emp.employee_surname}` : 'Unknown';
  };

  const getScheduledForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return (scheduledAppraisals || []).filter(s => {
      const sd = s.scheduled_date;
      return (typeof sd === 'string' ? sd.slice(0, 10) : new Date(sd).toISOString().split('T')[0]) === dateStr;
    });
  };

  const navigateMonth = (dir) => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const generateCalendarDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const safe = scheduledAppraisals || [];
  const calendarDays = generateCalendarDays();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Appraisal Calendar</h2>
          <p className="text-gray-600">Schedule and view upcoming appraisals</p>
        </div>
        <button
          onClick={() => uiActions.setShowNewForm('schedule')}
          className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />Schedule Appraisal
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex space-x-2">
              <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setSelectedDate(new Date())} className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                Today
              </button>
              <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="p-2 text-center text-sm font-medium text-gray-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, idx) => {
              const scheduled = getScheduledForDate(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
              return (
                <div key={idx} className={`p-2 min-h-12 border rounded text-sm ${isToday ? 'bg-blue-100 border-blue-300' : 'border-gray-200'} ${!isCurrentMonth ? 'text-gray-400 bg-gray-50' : ''}`}>
                  <div className="font-medium">{date.getDate()}</div>
                  {scheduled.slice(0, 2).map((a, i) => (
                    <div key={i} className="text-xs bg-blue-100 text-blue-800 px-1 rounded mt-1 truncate">
                      {getEmployeeName(a.employee_number)}
                    </div>
                  ))}
                  {scheduled.length > 2 && <div className="text-xs text-blue-600">+{scheduled.length - 2}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Upcoming Appraisals</h3>
            <div className="space-y-3">
              {safe.length === 0 && <p className="text-sm text-gray-500">No scheduled appraisals.</p>}
              {[...safe]
                .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
                .slice(0, 6)
                .map(s => {
                  const isOverdue = new Date(s.scheduled_date) < new Date();
                  const isDueSoon = new Date(s.scheduled_date) <= new Date(Date.now() + 7 * 86400000);
                  return (
                    <div key={s.schedule_id} className={`border rounded-lg p-3 ${isOverdue ? 'border-red-200 bg-red-50' : isDueSoon ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900 text-sm">{getEmployeeName(s.employee_number)}</span>
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
                          {typeof s.scheduled_date === 'string' ? s.scheduled_date.slice(0, 10) : new Date(s.scheduled_date).toLocaleDateString()}
                        </span>
                      </div>
                      {s.notes && <p className="text-xs text-gray-600 mb-2">{s.notes}</p>}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isOverdue ? 'bg-red-100 text-red-800' : isDueSoon ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                        {isOverdue ? 'Overdue' : isDueSoon ? 'Due Soon' : s.status}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Stats</h3>
            <div className="space-y-3">
              {[
                { label: 'Total Scheduled', value: safe.length, cls: '' },
                { label: 'This Month', value: safe.filter(s => { const d = new Date(s.scheduled_date); return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear(); }).length, cls: '' },
                { label: 'Overdue', value: safe.filter(s => new Date(s.scheduled_date) < new Date()).length, cls: 'text-red-600' },
                { label: 'Due This Week', value: safe.filter(s => { const d = new Date(s.scheduled_date); const now = new Date(); return d >= now && d <= new Date(now.getTime() + 7*86400000); }).length, cls: 'text-yellow-600' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-gray-600 text-sm">{label}</span>
                  <span className={`font-medium ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
