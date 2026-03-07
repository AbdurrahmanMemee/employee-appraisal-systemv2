import React, { useState } from 'react';
import { X, Save, Download, Upload, Star } from 'lucide-react';

const FormalAppraisalForm = ({ employee, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    employee_number: employee?.employee_number || '',
    appraisal_date: new Date().toISOString().split('T')[0],
    people_present: '',
    next_appraisal_date: '',
    appraisal_status: 'Draft',
    created_by: 'Current User'
  });

  const [sections, setSections] = useState([
    { section_name: 'Technical Skills', section_rating: 0, previous_rating: 0, section_comments: '', weight: 25 },
    { section_name: 'Communication', section_rating: 0, previous_rating: 0, section_comments: '', weight: 20 },
    { section_name: 'Leadership', section_rating: 0, previous_rating: 0, section_comments: '', weight: 15 },
    { section_name: 'Initiative', section_rating: 0, previous_rating: 0, section_comments: '', weight: 15 },
    { section_name: 'Problem Solving', section_rating: 0, previous_rating: 0, section_comments: '', weight: 15 },
    { section_name: 'Reliability', section_rating: 0, previous_rating: 0, section_comments: '', weight: 10 }
  ]);

  const calculateOverallRating = () => {
    const totalWeightedScore = sections.reduce((sum, section) => 
      sum + (section.section_rating * section.weight / 100), 0
    );
    return Math.round(totalWeightedScore * 100) / 100;
  };

  const getRatingColor = (rating) => {
    if (rating >= 4.5) return 'text-green-600 bg-green-100';
    if (rating >= 3.5) return 'text-blue-600 bg-blue-100';
    if (rating >= 2.5) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const handleSectionUpdate = (index, field, value) => {
    setSections(prev => prev.map((section, i) => 
      i === index ? { ...section, [field]: field === 'section_rating' ? parseFloat(value) || 0 : value } : section
    ));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const overallRating = calculateOverallRating();
    const newAppraisal = {
      appr_id: appraisals.length + 1,
      ...formData,
      employee_rating: overallRating,
      sections: sections
    };
    
    onSave(newAppraisal);
    onClose();
  };

  const selectedEmployee = employees.find(emp => emp.employee_number === parseInt(formData.employee_number));
  const lastAppraisal = appraisals.find(app => app.employee_number === parseInt(formData.employee_number));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Formal Appraisal Form</h2>
          <p className="text-gray-600">Comprehensive performance evaluation</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Appraisal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select
                value={formData.employee_number}
                onChange={(e) => setFormData({...formData, employee_number: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Employee</option>
                {employees.map(emp => (
                  <option key={emp.employee_number} value={emp.employee_number}>
                    {emp.employee_name} {emp.employee_surname} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appraisal Date</label>
              <input
                type="date"
                value={formData.appraisal_date}
                onChange={(e) => setFormData({...formData, appraisal_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Appraisal Date</label>
              <input
                type="date"
                value={formData.next_appraisal_date}
                onChange={(e) => setFormData({...formData, next_appraisal_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">People Present</label>
              <input
                type="text"
                value={formData.people_present}
                onChange={(e) => setFormData({...formData, people_present: e.target.value})}
                placeholder="Employee, Manager, HR Representative"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.appraisal_status}
                onChange={(e) => setFormData({...formData, appraisal_status: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="Draft">Draft</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Last Appraisal Reference */}
          {lastAppraisal && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Last Appraisal:</strong> {lastAppraisal.appraisal_date} - Rating: {lastAppraisal.employee_rating}/5
                <button className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs">
                  View Details
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Employee Information Display */}
        {selectedEmployee && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Employee Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Department:</span>
                <p>{selectedEmployee.department}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Job Title:</span>
                <p>{selectedEmployee.job_description}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Manager:</span>
                <p>{selectedEmployee.manager}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Current Avg Rating:</span>
                <p className="flex items-center">
                  <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                  {selectedEmployee.average_employee_rating || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Performance Rating Sections */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">Performance Evaluation</h3>
            <div className={`px-4 py-2 rounded-lg ${getRatingColor(calculateOverallRating())}`}>
              <span className="text-sm font-medium">Overall Rating: {calculateOverallRating()}/5</span>
            </div>
          </div>

          <div className="space-y-6">
            {sections.map((section, index) => (
              <div key={index} className="border rounded-lg p-4" style={{borderLeftWidth: '4px', borderLeftColor: 
                section.section_rating >= 4.5 ? '#10b981' : 
                section.section_rating >= 3.5 ? '#3b82f6' : 
                section.section_rating >= 2.5 ? '#f59e0b' : '#ef4444'
              }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-gray-900">{section.section_name}</h4>
                  <span className="text-sm text-gray-500">Weight: {section.weight}%</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Rating</label>
                    <select
                      value={section.section_rating}
                      onChange={(e) => handleSectionUpdate(index, 'section_rating', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value={0}>Select Rating</option>
                      <option value={1}>1 - Poor</option>
                      <option value={2}>2 - Below Average</option>
                      <option value={3}>3 - Average</option>
                      <option value={4}>4 - Good</option>
                      <option value={5}>5 - Excellent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Previous Rating</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={section.previous_rating}
                      onChange={(e) => handleSectionUpdate(index, 'previous_rating', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      placeholder="Previous"
                    />
                  </div>

                  <div className="flex items-end">
                    {section.previous_rating > 0 && (
                      <div className={`px-3 py-2 rounded-md text-sm font-medium ${
                        section.section_rating > section.previous_rating ? 'bg-green-100 text-green-800' :
                        section.section_rating < section.previous_rating ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {section.section_rating > section.previous_rating ? '↗ Improved' :
                         section.section_rating < section.previous_rating ? '↘ Declined' :
                         '→ Same'}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comments & Justification</label>
                  <textarea
                    value={section.section_comments}
                    onChange={(e) => handleSectionUpdate(index, 'section_comments', e.target.value)}
                    rows={3}
                    placeholder={`Provide specific examples and justification for the ${section.section_name} rating...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Rating Scale Reference */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Rating Scale Reference:</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
              <div className="text-center p-2 bg-red-100 text-red-800 rounded">1 - Poor</div>
              <div className="text-center p-2 bg-orange-100 text-orange-800 rounded">2 - Below Average</div>
              <div className="text-center p-2 bg-yellow-100 text-yellow-800 rounded">3 - Average</div>
              <div className="text-center p-2 bg-blue-100 text-blue-800 rounded">4 - Good</div>
              <div className="text-center p-2 bg-green-100 text-green-800 rounded">5 - Excellent</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-6 border-t">
          <div className="flex space-x-3">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md flex items-center"
            >
              <Save className="w-5 h-5 mr-2" />
              Save Appraisal
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-md"
            >
              Cancel
            </button>
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              className="bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-md flex items-center text-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Print Form
            </button>
            <button
              type="button"
              className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-md flex items-center text-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Attach File
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default FormalAppraisalForm;
            