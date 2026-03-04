// src/data/sampleData.js - Initial/Fallback Sample Data

export const sampleEmployees = [
  {
    employee_number: 1001,
    employee_name: 'Sarah',
    employee_surname: 'Johnson',
    employee_id: 'EMP001',
    department: 'Engineering',
    job_description: 'Senior Developer',
    manager: 'Mike Chen',
    is_active: true,
    email: 'sarah.johnson@company.com',
    created_date: '2022-01-15',
    last_meeting_date: '2024-11-15',
    last_appraisal_date: '2024-09-01',
    next_scheduled_appraisal: '2025-03-01',
    average_employee_rating: 4.2
  },
  {
    employee_number: 1002,
    employee_name: 'David',
    employee_surname: 'Rodriguez',
    employee_id: 'EMP002',
    department: 'Marketing',
    job_description: 'Marketing Manager',
    manager: 'Lisa Wang',
    is_active: true,
    email: 'david.rodriguez@company.com',
    created_date: '2021-06-20',
    last_meeting_date: '2024-10-28',
    last_appraisal_date: '2024-08-15',
    next_scheduled_appraisal: '2025-02-15',
    average_employee_rating: 3.8
  },
  {
    employee_number: 1003,
    employee_name: 'Emily',
    employee_surname: 'Chen',
    employee_id: 'EMP003',
    department: 'Engineering',
    job_description: 'UX Designer',
    manager: 'Alex Thompson',
    is_active: true,
    email: 'emily.chen@company.com',
    created_date: '2022-08-10',
    last_meeting_date: '2024-11-20',
    last_appraisal_date: '2024-10-01',
    next_scheduled_appraisal: '2025-04-01',
    average_employee_rating: 4.5
  },
  {
    employee_number: 1004,
    employee_name: 'Michael',
    employee_surname: 'Brown',
    employee_id: 'EMP004',
    department: 'Sales',
    job_description: 'Account Executive',
    manager: 'Jennifer Lee',
    is_active: true,
    email: 'michael.brown@company.com',
    created_date: '2020-03-01',
    last_meeting_date: '2024-11-05',
    last_appraisal_date: '2024-07-01',
    next_scheduled_appraisal: '2025-01-15',
    average_employee_rating: 3.5
  }
];

export const sampleMeetings = [
  {
    meet_id: 1,
    employee_number: 1001,
    meeting_date: '2024-11-15',
    meeting_type: 'One-on-One',
    people_present: 'Sarah Johnson, Mike Chen',
    brief_note: 'Monthly check-in',
    detailed_summary: 'Discussed Q4 project delivery. Sarah is on track with the API integration work.',
    meeting_conclusion: 'Continue current trajectory. Focus on documentation.',
    created_by: 'Mike Chen',
    created_date: '2024-11-15'
  },
  {
    meet_id: 2,
    employee_number: 1002,
    meeting_date: '2024-10-28',
    meeting_type: 'Performance Review',
    people_present: 'David Rodriguez, Lisa Wang',
    brief_note: 'Mid-year review',
    detailed_summary: 'Reviewed Q3 marketing campaigns. Discussed social media performance and upcoming Q4 strategy.',
    meeting_conclusion: 'Performance meets expectations. New objectives set for Q4.',
    created_by: 'Lisa Wang',
    created_date: '2024-10-28'
  }
];

export const sampleAppraisals = [
  {
    appr_id: 1,
    employee_number: 1001,
    appraisal_date: '2024-09-01',
    people_present: 'Sarah Johnson, Mike Chen',
    employee_rating: 4.2,
    next_appraisal_date: '2025-03-01',
    appraisal_status: 'Completed',
    created_by: 'Mike Chen',
    created_date: '2024-09-01',
    sections: [
      { section_name: 'Technical Skills', section_rating: 4.5, previous_rating: 4.0, section_comments: 'Excellent technical growth' },
      { section_name: 'Communication', section_rating: 4.0, previous_rating: 3.8, section_comments: 'Good improvement in presentations' },
      { section_name: 'Teamwork', section_rating: 4.2, previous_rating: 4.0, section_comments: 'Collaborative and supportive' }
    ]
  }
];

export const sampleIncidents = [
  {
    log_id: 1,
    employee_number: 1001,
    incident_log_date: '2024-10-15',
    incident_log_type: 'Achievement Recognition',
    incident_detail: 'Successfully delivered the API integration 2 weeks ahead of schedule.',
    severity: 'Low',
    logged_by: 'Mike Chen',
    created_date: '2024-10-15'
  }
];

export const sampleScheduledAppraisals = [
  {
    schedule_id: 1,
    employee_number: 1001,
    scheduled_date: '2025-03-01',
    scheduled_by: 'Mike Chen',
    status: 'Scheduled',
    notes: 'Annual performance review',
    created_date: '2024-11-01'
  },
  {
    schedule_id: 2,
    employee_number: 1002,
    scheduled_date: '2025-02-15',
    scheduled_by: 'Lisa Wang',
    status: 'Scheduled',
    notes: 'Mid-year appraisal',
    created_date: '2024-11-01'
  }
];

export const initialConfig = {
  departments: [
    { id: 1, name: 'Engineering', active: true },
    { id: 2, name: 'Marketing', active: true },
    { id: 3, name: 'Sales', active: true },
    { id: 4, name: 'Human Resources', active: true },
    { id: 5, name: 'Finance', active: true },
    { id: 6, name: 'Operations', active: true }
  ],
  managers: [
    { id: 1, name: 'Mike Chen', active: true },
    { id: 2, name: 'Lisa Wang', active: true },
    { id: 3, name: 'Alex Thompson', active: true },
    { id: 4, name: 'Jennifer Lee', active: true },
    { id: 5, name: 'David Smith', active: true },
    { id: 6, name: 'Sarah Johnson', active: true }
  ],
  jobDescriptions: [
    { id: 1, name: 'Senior Developer', active: true },
    { id: 2, name: 'Marketing Manager', active: true },
    { id: 3, name: 'Account Executive', active: true },
    { id: 4, name: 'UX Designer', active: true },
    { id: 5, name: 'Financial Analyst', active: true },
    { id: 6, name: 'Operations Coordinator', active: true }
  ],
  meetingTypes: [
    { id: 1, name: 'One-on-One', active: true },
    { id: 2, name: 'Performance Review', active: true },
    { id: 3, name: 'Goal Setting', active: true },
    { id: 4, name: 'Disciplinary Meeting', active: true },
    { id: 5, name: 'Career Development', active: true },
    { id: 6, name: 'Project Review', active: true }
  ],
  incidentTypes: [
    { id: 1, name: 'General Misconduct', active: true },
    { id: 2, name: 'Gross Misconduct', active: true },
    { id: 3, name: 'Achievement Recognition', active: true },
    { id: 4, name: 'Training Completion', active: true },
    { id: 5, name: 'Goal Achievement', active: true },
    { id: 6, name: 'Performance Issue', active: true }
  ],
  severityLevels: ['Low', 'Medium', 'High', 'Critical'],
  appraisalSections: [
    'Technical Skills',
    'Communication',
    'Teamwork',
    'Leadership',
    'Innovation',
    'Customer Focus',
    'Problem Solving',
    'Time Management'
  ]
};
