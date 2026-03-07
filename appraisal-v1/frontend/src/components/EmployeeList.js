// frontend/src/components/EmployeeList.js
import React from 'react';
import { Search, Plus, User, Star } from 'lucide-react';
import useAppStore, { useEmployees, useUI, useUIActions } from '../store/useAppStore';

const EmployeeList = () => {
  const ui = useUI();
  const uiActions = useUIActions();
  const employees = useEmployees();
  const filtered = employees.filter(emp => {
    const active = emp.is_active || emp.is_active === 1;
    const ms = ui.filterStatus === 'active' ? active : ui.filterStatus === 'inactive' ? !active : true;
    const t = (ui.searchTerm||'').toLowerCase();
    return ms && (!t||(emp.employee_name+' '+emp.employee_surname).toLowerCase().includes(t)||(emp.employee_id||'').toLowerCase().includes(t)||(emp.department||'').toLowerCase().includes(t));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by name, ID, department..." value={ui.searchTerm} onChange={(e) => uiActions.setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div className="flex items-center gap-3">
          <select value={ui.filterStatus} onChange={(e) => uiActions.setFilterStatus(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
            <option value="all">All Employees</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <button onClick={() => uiActions.setShowNewForm('employee')} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            <Plus className="w-4 h-4 mr-2" /> Add Employee
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500">Showing {filtered.length} of {employees.length} employees</p>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Employee','ID','Department','Manager','Last Appraisal','Next Appraisal','Rating','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map(emp => {
                const overdue = emp.next_scheduled_appraisal && new Date(emp.next_scheduled_appraisal) < new Date();
                return (
                  <tr key={emp.employee_number} onClick={() => uiActions.setSelectedEmployee(emp)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0"><User className="w-4 h-4 text-blue-600" /></div>
                        <div><div className="text-sm font-medium text-gray-900">{emp.employee_name} {emp.employee_surname}</div><div className="text-xs text-gray-500">{emp.job_description}</div></div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">{emp.employee_id}</td>
                    <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">{emp.department}</td>
                    <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">{emp.manager}</td>
                    <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">{emp.last_appraisal_date ? new Date(emp.last_appraisal_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-4 text-sm whitespace-nowrap">
                      {emp.next_scheduled_appraisal ? <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-900'}>{new Date(emp.next_scheduled_appraisal).toLocaleDateString()}{overdue && ' ⚠'}</span> : '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center"><Star className="w-4 h-4 text-yellow-400 mr-1" /><span className="text-sm font-medium">{parseFloat(emp.average_employee_rating||0).toFixed(1)}</span></div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${emp.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{emp.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <User className="mx-auto w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">{ui.searchTerm ? `No results for "${ui.searchTerm}"` : 'No employees found'}</p>
            {ui.searchTerm && <button onClick={() => uiActions.setSearchTerm('')} className="mt-2 text-blue-600 text-sm hover:underline">Clear search</button>}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeList;
