-- Employee Appraisal System Database Schema
-- Save this as: create_appraisal_database.sql

-- Employees table
CREATE TABLE employees (
    employee_number INTEGER PRIMARY KEY,
    employee_name TEXT NOT NULL,
    employee_surname TEXT NOT NULL,
    employee_id TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    job_description TEXT NOT NULL,
    manager TEXT NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_meeting_date DATE,
    last_appraisal_date DATE,
    next_scheduled_appraisal DATE,
    average_employee_rating REAL DEFAULT 0.0
);

-- Configuration tables for dropdowns
CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_name TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_name TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE job_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE meeting_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_type TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE general_misconduct_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    misconduct_type TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE gross_misconduct_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    misconduct_type TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE achievement_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    achievement_type TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE incident_log_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_type TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT 1
);

-- Meetings table
CREATE TABLE meetings (
    meet_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number INTEGER NOT NULL,
    meeting_date DATE NOT NULL,
    meeting_type TEXT NOT NULL,
    people_present TEXT,
    brief_note TEXT,
    detailed_summary TEXT,
    pdf_attachment_path TEXT,
    meeting_conclusion TEXT NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number)
);

-- Appraisals table
CREATE TABLE appraisals (
    appr_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number INTEGER NOT NULL,
    appraisal_date DATE NOT NULL,
    people_present TEXT,
    employee_rating REAL NOT NULL,
    next_appraisal_date DATE,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number)
);

-- Appraisal sections for detailed ratings
CREATE TABLE appraisal_sections (
    section_id INTEGER PRIMARY KEY AUTOINCREMENT,
    appr_id INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    section_rating REAL NOT NULL,
    previous_rating REAL,
    section_comments TEXT,
    FOREIGN KEY (appr_id) REFERENCES appraisals (appr_id)
);

-- Incident logging table
CREATE TABLE incident_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number INTEGER NOT NULL,
    incident_log_date DATE NOT NULL,
    incident_log_type TEXT NOT NULL,
    incident_detail TEXT NOT NULL,
    logged_by TEXT NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number)
);

-- Scheduled appraisals calendar
CREATE TABLE scheduled_appraisals (
    schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number INTEGER NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_by TEXT NOT NULL,
    status TEXT DEFAULT 'Scheduled', -- Scheduled, Completed, Cancelled
    notes TEXT,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number)
);

-- Insert sample departments
INSERT INTO departments (department_name) VALUES 
    ('Engineering'),
    ('Marketing'),
    ('Sales'),
    ('Human Resources'),
    ('Finance'),
    ('Operations');

-- Insert sample managers
INSERT INTO managers (manager_name) VALUES 
    ('Mike Chen'),
    ('Lisa Wang'),
    ('Alex Thompson'),
    ('Jennifer Lee'),
    ('David Smith'),
    ('Sarah Johnson');

-- Insert sample job descriptions
INSERT INTO job_descriptions (job_title) VALUES 
    ('Senior Developer'),
    ('Marketing Manager'),
    ('Account Executive'),
    ('UX Designer'),
    ('Financial Analyst'),
    ('Operations Coordinator');

-- Insert sample meeting types
INSERT INTO meeting_types (meeting_type) VALUES 
    ('One-on-One'),
    ('Performance Review'),
    ('Goal Setting'),
    ('Disciplinary Meeting'),
    ('Career Development'),
    ('Project Review');

-- Insert sample misconduct types
INSERT INTO general_misconduct_types (misconduct_type) VALUES 
    ('Late Arrival'),
    ('Unprofessional Behavior'),
    ('Poor Work Quality'),
    ('Missed Deadline'),
    ('Communication Issues');

INSERT INTO gross_misconduct_types (misconduct_type) VALUES 
    ('Harassment'),
    ('Theft'),
    ('Fraud'),
    ('Violence'),
    ('Serious Safety Violation');

-- Insert sample achievement types
INSERT INTO achievement_types (achievement_type) VALUES 
    ('Exceeded Goals'),
    ('Innovation'),
    ('Leadership'),
    ('Teamwork'),
    ('Customer Service Excellence'),
    ('Process Improvement');

-- Insert sample incident log types
INSERT INTO incident_log_types (incident_type) VALUES 
    ('General Misconduct'),
    ('Gross Misconduct'),
    ('Achievement Recognition'),
    ('Training Completion'),
    ('Goal Achievement'),
    ('Performance Issue');

-- Insert sample employees
INSERT INTO employees (employee_number, employee_name, employee_surname, employee_id, department, job_description, manager) VALUES 
    (1001, 'Sarah', 'Johnson', 'EMP001', 'Engineering', 'Senior Developer', 'Mike Chen'),
    (1002, 'David', 'Rodriguez', 'EMP002', 'Marketing', 'Marketing Manager', 'Lisa Wang'),
    (1003, 'Emily', 'Chen', 'EMP003', 'Engineering', 'UX Designer', 'Alex Thompson'),
    (1004, 'Michael', 'Brown', 'EMP004', 'Sales', 'Account Executive', 'Jennifer Lee');

-- Create indexes for better performance
CREATE INDEX idx_employee_number ON meetings(employee_number);
CREATE INDEX idx_employee_number_appr ON appraisals(employee_number);
CREATE INDEX idx_employee_number_incidents ON incident_logs(employee_number);
CREATE INDEX idx_scheduled_date ON scheduled_appraisals(scheduled_date);
CREATE INDEX idx_appraisal_date ON appraisals(appraisal_date);
CREATE INDEX idx_meeting_date ON meetings(meeting_date);