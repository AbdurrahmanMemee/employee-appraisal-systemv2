import React, { useState } from 'react';
import useAppStore from '../store/useAppStore';
import { ArrowLeft, Star, Download } from 'lucide-react';

const EmployeeDetail = ({ employee, onBack, onNewMeeting, onNewAppraisal, onNewIncident, onEditEmployee }) => {
  const allMeetings = useAppStore((s) => s.meetings);
  const allAppraisals = useAppStore((s) => s.appraisals);
  const allIncidents = useAppStore((s) => s.incidents);
  const meetings = (allMeetings || []).filter(m => m.employee_number === employee.employee_number);
  const appraisals = (allAppraisals || []).filter(a => a.employee_number === employee.employee_number);
  const incidents = (allIncidents || []).filter(i => i.employee_number === employee.employee_number);
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} className="mr-4 p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {employee.employee_name} {employee.employee_surname}
            </h2>
            <p className="text-gray-600">{employee.job_description} - {employee.department}</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={onNewMeeting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            New Meeting
          </button>
          <button 
            onClick={onNewAppraisal}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Schedule Appraisal
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'meetings', label: `Meetings (${meetings.length})` },
            { key: 'appraisals', label: `Appraisals (${appraisals.length})` },
            { key: 'incidents', label: `Incidents (${incidents.length})` }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeSection === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Employee Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Employee Number</label>
                  <p className="text-gray-900">{employee.employee_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Employee ID</label>
                  <p className="text-gray-900">{employee.employee_id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Department</label>
                  <p className="text-gray-900">{employee.department}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Manager</label>
                  <p className="text-gray-900">{employee.manager}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Meeting</label>
                  <p className="text-gray-900">{employee.last_meeting_date || 'No meetings yet'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Appraisal</label>
                  <p className="text-gray-900">{employee.last_appraisal_date || 'No appraisals yet'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Average Rating</span>
                  <div className="flex items-center">
                    <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                    <span className="font-medium">{employee.average_employee_rating || 'N/A'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total Meetings</span>
                  <span className="font-medium">{meetings.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total Appraisals</span>
                  <span className="font-medium">{appraisals.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Next Appraisal</span>
                  <span className="text-sm">{employee.next_scheduled_appraisal || 'Not scheduled'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'meetings' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Meeting History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brief Note</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {meetings.map((meeting) => (
                  <tr key={meeting.meet_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{meeting.meeting_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{meeting.meeting_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{meeting.brief_note}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button 
                        onClick={() => {}}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {meetings.length === 0 && (
              <div className="text-center py-8 text-gray-500">No meetings recorded</div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'appraisals' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Appraisal History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Review</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appraisals.map((appraisal) => (
                  <tr key={appraisal.appr_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appraisal.appraisal_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                        {appraisal.employee_rating}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appraisal.appraisal_status}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appraisal.next_appraisal_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button 
                        onClick={() => {}}
                        className="text-blue-600 hover:text-blue-900 mr-2"
                      >
                        View
                      </button>
                      <button className="text-green-600 hover:text-green-900">
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {appraisals.length === 0 && (
              <div className="text-center py-8 text-gray-500">No appraisals recorded</div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'incidents' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Incident Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Logged By</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {incidents.map((incident) => (
                  <tr key={incident.log_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{incident.incident_log_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{incident.incident_log_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        incident.severity === 'High' || incident.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                        incident.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {incident.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{incident.incident_detail}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{incident.logged_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {incidents.length === 0 && (
              <div className="text-center py-8 text-gray-500">No incidents recorded</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDetail;