-- Employee Appraisal System - MySQL Database Schema
-- Run this on your existing MySQL server

-- Create the database
CREATE DATABASE IF NOT EXISTS employee_appraisals
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE employee_appraisals;

-- Create application user (optional - run as admin)
-- CREATE USER 'appraisal_app'@'localhost' IDENTIFIED BY 'your_secure_password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON employee_appraisals.* TO 'appraisal_app'@'localhost';
-- FLUSH PRIVILEGES;

-- Employees table
CREATE TABLE employees (
    employee_number INT PRIMARY KEY,
    employee_name VARCHAR(100) NOT NULL,
    employee_surname VARCHAR(100) NOT NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    department VARCHAR(100) NOT NULL,
    job_description VARCHAR(150) NOT NULL,
    manager VARCHAR(100) NOT NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_meeting_date DATE NULL,
    last_appraisal_date DATE NULL,
    next_scheduled_appraisal DATE NULL,
    average_employee_rating DECIMAL(3,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_employee_id (employee_id),
    INDEX idx_department (department),
    INDEX idx_manager (manager),
    INDEX idx_next_appraisal (next_scheduled_appraisal)
) ENGINE=InnoDB;

-- Configuration tables for dropdowns
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department_name VARCHAR(100) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE managers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manager_name VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE job_descriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_title VARCHAR(150) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE meeting_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_type VARCHAR(100) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE general_misconduct_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    misconduct_type VARCHAR(150) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE gross_misconduct_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    misconduct_type VARCHAR(150) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE achievement_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    achievement_type VARCHAR(150) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE incident_log_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_type VARCHAR(100) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Meetings table
CREATE TABLE meetings (
    meet_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number INT NOT NULL,
    meeting_date DATE NOT NULL,
    meeting_type VARCHAR(100) NOT NULL,
    people_present TEXT NULL,
    brief_note TEXT NULL,
    detailed_summary LONGTEXT NULL,
    pdf_attachment_path VARCHAR(500) NULL,
    meeting_conclusion TEXT NOT NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL,
    updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number) ON DELETE CASCADE,
    INDEX idx_employee_number (employee_number),
    INDEX idx_meeting_date (meeting_date),
    INDEX idx_meeting_type (meeting_type)
) ENGINE=InnoDB;

-- Appraisals table
CREATE TABLE appraisals (
    appr_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number INT NOT NULL,
    appraisal_date DATE NOT NULL,
    people_present TEXT NULL,
    employee_rating DECIMAL(3,2) NOT NULL,
    next_appraisal_date DATE NULL,
    appraisal_status ENUM('Draft', 'In Progress', 'Completed', 'Cancelled') DEFAULT 'Draft',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL,
    updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number) ON DELETE CASCADE,
    INDEX idx_employee_number (employee_number),
    INDEX idx_appraisal_date (appraisal_date),
    INDEX idx_status (appraisal_status)
) ENGINE=InnoDB;

-- Appraisal sections for detailed ratings
CREATE TABLE appraisal_sections (
    section_id INT AUTO_INCREMENT PRIMARY KEY,
    appr_id INT NOT NULL,
    section_name VARCHAR(150) NOT NULL,
    section_rating DECIMAL(3,2) NOT NULL,
    previous_rating DECIMAL(3,2) NULL,
    section_comments TEXT NULL,
    section_order INT DEFAULT 0,
    FOREIGN KEY (appr_id) REFERENCES appraisals (appr_id) ON DELETE CASCADE,
    INDEX idx_appr_id (appr_id),
    INDEX idx_section_order (section_order)
) ENGINE=InnoDB;

-- Incident logging table
CREATE TABLE incident_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number INT NOT NULL,
    incident_log_date DATE NOT NULL,
    incident_log_type VARCHAR(100) NOT NULL,
    incident_detail TEXT NOT NULL,
    severity ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
    logged_by VARCHAR(100) NOT NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number) ON DELETE CASCADE,
    INDEX idx_employee_number (employee_number),
    INDEX idx_incident_date (incident_log_date),
    INDEX idx_incident_type (incident_log_type)
) ENGINE=InnoDB;

-- Scheduled appraisals calendar
CREATE TABLE scheduled_appraisals (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number INT NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_by VARCHAR(100) NOT NULL,
    status ENUM('Scheduled', 'Completed', 'Cancelled', 'Postponed') DEFAULT 'Scheduled',
    notes TEXT NULL,
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_number) REFERENCES employees (employee_number) ON DELETE CASCADE,
    INDEX idx_employee_number (employee_number),
    INDEX idx_scheduled_date (scheduled_date),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Audit trail table (bonus - track all changes)
CREATE TABLE audit_trail (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INT NOT NULL,
    action ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    changed_by VARCHAR(100) NOT NULL,
    change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_table_record (table_name, record_id),
    INDEX idx_change_date (change_date)
) ENGINE=InnoDB;

-- Insert sample configuration data
INSERT INTO departments (department_name) VALUES 
    ('Engineering'),
    ('Marketing'),
    ('Sales'),
    ('Human Resources'),
    ('Finance'),
    ('Operations'),
    ('Customer Service'),
    ('Quality Assurance');

INSERT INTO managers (manager_name, email) VALUES 
    ('Mike Chen', 'mike.chen@company.com'),
    ('Lisa Wang', 'lisa.wang@company.com'),
    ('Alex Thompson', 'alex.thompson@company.com'),
    ('Jennifer Lee', 'jennifer.lee@company.com'),
    ('David Smith', 'david.smith@company.com'),
    ('Sarah Johnson', 'sarah.johnson@company.com');

INSERT INTO job_descriptions (job_title) VALUES 
    ('Senior Developer'),
    ('Marketing Manager'),
    ('Account Executive'),
    ('UX Designer'),
    ('Financial Analyst'),
    ('Operations Coordinator'),
    ('Customer Success Manager'),
    ('QA Engineer');

INSERT INTO meeting_types (meeting_type) VALUES 
    ('One-on-One'),
    ('Performance Review'),
    ('Goal Setting'),
    ('Disciplinary Meeting'),
    ('Career Development'),
    ('Project Review'),
    ('Probation Review'),
    ('Exit Interview');

INSERT INTO general_misconduct_types (misconduct_type) VALUES 
    ('Late Arrival'),
    ('Unprofessional Behavior'),
    ('Poor Work Quality'),
    ('Missed Deadline'),
    ('Communication Issues'),
    ('Dress Code Violation'),
    ('Attendance Issues');

INSERT INTO gross_misconduct_types (misconduct_type) VALUES 
    ('Harassment'),
    ('Theft'),
    ('Fraud'),
    ('Violence'),
    ('Serious Safety Violation'),
    ('Discrimination'),
    ('Breach of Confidentiality');

INSERT INTO achievement_types (achievement_type) VALUES 
    ('Exceeded Goals'),
    ('Innovation'),
    ('Leadership'),
    ('Teamwork'),
    ('Customer Service Excellence'),
    ('Process Improvement'),
    ('Mentoring'),
    ('Cost Savings Initiative');

INSERT INTO incident_log_types (incident_type) VALUES 
    ('General Misconduct'),
    ('Gross Misconduct'),
    ('Achievement Recognition'),
    ('Training Completion'),
    ('Goal Achievement'),
    ('Performance Issue'),
    ('Safety Incident'),
    ('Customer Complaint');

-- Insert sample employees
INSERT INTO employees (employee_number, employee_name, employee_surname, employee_id, department, job_description, manager) VALUES 
    (1001, 'Sarah', 'Johnson', 'EMP001', 'Engineering', 'Senior Developer', 'Mike Chen'),
    (1002, 'David', 'Rodriguez', 'EMP002', 'Marketing', 'Marketing Manager', 'Lisa Wang'),
    (1003, 'Emily', 'Chen', 'EMP003', 'Engineering', 'UX Designer', 'Alex Thompson'),
    (1004, 'Michael', 'Brown', 'EMP004', 'Sales', 'Account Executive', 'Jennifer Lee'),
    (1005, 'Jessica', 'Wilson', 'EMP005', 'Finance', 'Financial Analyst', 'David Smith');

-- Create views for common queries
CREATE VIEW employee_summary AS
SELECT 
    e.employee_number,
    e.employee_name,
    e.employee_surname,
    CONCAT(e.employee_name, ' ', e.employee_surname) as full_name,
    e.employee_id,
    e.department,
    e.job_description,
    e.manager,
    e.last_meeting_date,
    e.last_appraisal_date,
    e.next_scheduled_appraisal,
    e.average_employee_rating,
    CASE 
        WHEN e.next_scheduled_appraisal < CURDATE() THEN 'Overdue'
        WHEN e.next_scheduled_appraisal <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Due Soon'
        ELSE 'Scheduled'
    END as appraisal_status
FROM employees e
WHERE e.is_active = TRUE;

-- Create stored procedure to update employee ratings
DELIMITER //
CREATE PROCEDURE UpdateEmployeeAverageRating(IN emp_number INT)
BEGIN
    UPDATE employees 
    SET average_employee_rating = (
        SELECT COALESCE(AVG(employee_rating), 0)
        FROM appraisals 
        WHERE employee_number = emp_number 
        AND appraisal_status = 'Completed'
    )
    WHERE employee_number = emp_number;
END //
DELIMITER ;

-- Sample trigger to automatically update last appraisal date
DELIMITER //
CREATE TRIGGER update_last_appraisal_date
    AFTER UPDATE ON appraisals
    FOR EACH ROW
BEGIN
    IF NEW.appraisal_status = 'Completed' AND OLD.appraisal_status != 'Completed' THEN
        UPDATE employees 
        SET last_appraisal_date = NEW.appraisal_date
        WHERE employee_number = NEW.employee_number;
        
        -- Update average rating
        CALL UpdateEmployeeAverageRating(NEW.employee_number);
    END IF;
END //
DELIMITER ;

-- Display setup completion message
SELECT 
    'Database Setup Complete!' as message,
    COUNT(*) as sample_employees
FROM employees;

-- Show table sizes
SELECT 
    table_name,
    table_rows as 'Current Rows'
FROM information_schema.tables 
WHERE table_schema = 'employee_appraisals' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;