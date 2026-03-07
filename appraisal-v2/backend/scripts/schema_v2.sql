-- =============================================================================
-- FILE:    schema_v2.sql
-- PURPOSE: Complete database schema for Employee Appraisal System v2
--          Drop and recreate from scratch.
--
-- KEY CHANGES FROM ORIGINAL PHASE 1 SCHEMA:
--   1. employees.manager_id now references employees.id (self-referential FK)
--      enabling recursive org chart queries for manager hierarchy
--   2. users.employee_id links a login account to an employee record
--      enabling employee-role users to see their own data
--   3. users.role updated: admin / manager / employee (was viewer)
--   4. invalidated_tokens table for immediate token revocation on deactivation
--   5. meetings.pdf_attachment_path kept — multer handles uploads in Phase 3
--   6. All other Phase 1 decisions preserved
--
-- USAGE:
--   sudo mysql < scripts/schema_v2.sql
-- =============================================================================

-- Drop and recreate the database cleanly
DROP DATABASE IF EXISTS employee_appraisal_v2;
CREATE DATABASE employee_appraisal_v2
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE employee_appraisal_v2;

-- Grant access to app user (already exists from Phase 1 setup)
GRANT ALL PRIVILEGES ON employee_appraisal_v2.* TO 'appraisal_user'@'localhost';
FLUSH PRIVILEGES;

-- =============================================================================
-- CONFIGURATION / LOOKUP TABLES
-- These are the dropdown sources used throughout the app.
-- Managed by admin only via the /api/config routes.
-- =============================================================================

CREATE TABLE departments (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dept_name (name)
) ENGINE=InnoDB;

CREATE TABLE job_titles (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_job_name (name)
) ENGINE=InnoDB;

CREATE TABLE meeting_types (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_meeting_type (name)
) ENGINE=InnoDB;

CREATE TABLE incident_types (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_incident_type (name)
) ENGINE=InnoDB;

CREATE TABLE appraisal_section_templates (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    default_weight DECIMAL(5,2) DEFAULT 0,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_section_name (name)
) ENGINE=InnoDB;

-- =============================================================================
-- EMPLOYEES TABLE
-- Central table. All other records link here via employees.id.
--
-- HIERARCHY DESIGN:
--   manager_id is a self-referential FK — it points to another employees.id.
--   NULL = top of org chart (no manager above this person).
--   To find all subordinates of a manager: use recursive CTE (see views below).
--
-- IMPORT-SAFE DESIGN (preserved from Phase 1):
--   id             = internal primary key — never shown to users
--   employee_number = business/payroll number — manually entered now, importable later
--   employee_id    = display code e.g. EMP-1001 — auto-generated
-- =============================================================================

CREATE TABLE employees (
    -- Internal keys
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    employee_number         INT UNIQUE NULL,        -- payroll/HR number, importable later
    employee_id             VARCHAR(20) UNIQUE NOT NULL, -- display code e.g. EMP-1001

    -- Personal details
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(150) NULL,
    phone                   VARCHAR(30) NULL,
    start_date              DATE NULL,

    -- Work details — store names as strings AND FK ids
    -- String copies ensure reports remain readable even if config items are renamed
    department_id           INT NULL,
    department              VARCHAR(100) NULL,
    job_title_id            INT NULL,
    job_title               VARCHAR(150) NULL,

    -- HIERARCHY: manager_id points to another employee's internal id
    -- NULL = no manager (top of org chart)
    manager_id              INT NULL,

    -- Computed / cached fields — updated by application logic when appraisals complete
    last_meeting_date       DATE NULL,
    last_appraisal_date     DATE NULL,
    next_scheduled_appraisal DATE NULL,
    average_rating          DECIMAL(3,2) DEFAULT 0.00,

    -- Status
    is_active               BOOLEAN DEFAULT TRUE,

    -- Import tracking (empty until payroll system integration)
    external_system         VARCHAR(50) NULL,
    external_ref            VARCHAR(100) NULL,
    last_imported_at        TIMESTAMP NULL,

    -- Timestamps
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT fk_emp_department FOREIGN KEY (department_id)
        REFERENCES departments(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_emp_job_title FOREIGN KEY (job_title_id)
        REFERENCES job_titles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_emp_manager FOREIGN KEY (manager_id)
        REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE,

    -- Indexes
    INDEX idx_employee_number (employee_number),
    INDEX idx_employee_id     (employee_id),
    INDEX idx_department      (department),
    INDEX idx_manager_id      (manager_id),
    INDEX idx_is_active       (is_active),
    INDEX idx_next_appraisal  (next_scheduled_appraisal)
) ENGINE=InnoDB;

-- =============================================================================
-- USERS TABLE
-- Login accounts. Separate from employees — not every employee has a login,
-- and not every user (e.g. admin) is an employee.
--
-- employee_id (FK to employees.id) links a user account to an employee record.
-- NULL for admin/manager users who are not in the employee list.
-- Populated for employee-role users so they can see their own data.
--
-- ROLES:
--   admin    — full access to all data; edits flagged for manager approval (future)
--   manager  — access to own direct reports + all subordinates recursively
--   employee — read-only access to own record only
-- =============================================================================

CREATE TABLE users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(150) UNIQUE NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    role            ENUM('admin', 'manager', 'employee') DEFAULT 'employee',

    -- Link to employee record (NULL for admin users not in employee list)
    employee_id     INT NULL,

    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_employee FOREIGN KEY (employee_id)
        REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_username    (username),
    INDEX idx_role        (role),
    INDEX idx_employee_id (employee_id)
) ENGINE=InnoDB;

-- =============================================================================
-- INVALIDATED TOKENS TABLE
-- Enables immediate token revocation without checking the full users table.
--
-- HOW IT WORKS:
--   1. Every request: verify JWT signature (fast, no DB hit)
--   2. If signature valid: check if user_id is in this table (one lightweight lookup)
--   3. If found: reject the request even though the JWT is technically valid
--   4. When a deactivated user is reactivated: remove their row from this table
--
-- This table stays small — only deactivated users have rows here.
-- Rows are cleaned up when users are reactivated or tokens expire naturally.
-- =============================================================================

CREATE TABLE invalidated_tokens (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    invalidated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason          VARCHAR(100) NULL,  -- e.g. 'user_deactivated', 'admin_revoked'
    expires_at      TIMESTAMP NULL,     -- when to auto-clean (matches JWT expiry)

    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- =============================================================================
-- MEETINGS TABLE
-- =============================================================================

CREATE TABLE meetings (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    employee_id         INT NOT NULL,           -- FK to employees.id
    meeting_date        DATE NOT NULL,
    meeting_type_id     INT NULL,
    meeting_type        VARCHAR(100) NOT NULL,  -- string copy for reporting
    people_present      TEXT NULL,
    brief_note          TEXT NULL,
    detailed_summary    LONGTEXT NULL,
    meeting_conclusion  TEXT NOT NULL,
    pdf_attachment_path VARCHAR(500) NULL,      -- populated by multer file upload
    created_by_user_id  INT NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_meeting_employee FOREIGN KEY (employee_id)
        REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_meeting_type FOREIGN KEY (meeting_type_id)
        REFERENCES meeting_types(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_meeting_creator FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_employee_id  (employee_id),
    INDEX idx_meeting_date (meeting_date),
    INDEX idx_meeting_type (meeting_type)
) ENGINE=InnoDB;

-- =============================================================================
-- APPRAISALS TABLE
-- =============================================================================

CREATE TABLE appraisals (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    employee_id         INT NOT NULL,
    appraisal_date      DATE NOT NULL,
    people_present      TEXT NULL,
    overall_rating      DECIMAL(3,2) NOT NULL,
    next_appraisal_date DATE NULL,
    status              ENUM('Draft','In Progress','Completed','Cancelled') DEFAULT 'Draft',
    created_by_user_id  INT NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_appraisal_employee FOREIGN KEY (employee_id)
        REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_appraisal_creator FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_employee_id    (employee_id),
    INDEX idx_appraisal_date (appraisal_date),
    INDEX idx_status         (status)
) ENGINE=InnoDB;

-- Appraisal section ratings (e.g. Technical Skills: 4.5, Communication: 3.0)
CREATE TABLE appraisal_sections (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    appraisal_id    INT NOT NULL,
    section_name    VARCHAR(150) NOT NULL,
    rating          DECIMAL(3,2) NOT NULL,
    weight          DECIMAL(5,2) DEFAULT 0,
    previous_rating DECIMAL(3,2) NULL,
    comments        TEXT NULL,
    sort_order      INT DEFAULT 0,

    CONSTRAINT fk_section_appraisal FOREIGN KEY (appraisal_id)
        REFERENCES appraisals(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_appraisal_id (appraisal_id)
) ENGINE=InnoDB;

-- =============================================================================
-- INCIDENT LOGS TABLE
-- =============================================================================

CREATE TABLE incident_logs (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    employee_id         INT NOT NULL,
    incident_date       DATE NOT NULL,
    incident_type_id    INT NULL,
    incident_type       VARCHAR(150) NOT NULL,  -- string copy
    detail              TEXT NOT NULL,
    severity            ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
    logged_by_user_id   INT NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_incident_employee FOREIGN KEY (employee_id)
        REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_incident_type FOREIGN KEY (incident_type_id)
        REFERENCES incident_types(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_incident_logger FOREIGN KEY (logged_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_employee_id  (employee_id),
    INDEX idx_incident_date (incident_date),
    INDEX idx_incident_type (incident_type),
    INDEX idx_severity      (severity)
) ENGINE=InnoDB;

-- =============================================================================
-- SCHEDULED APPRAISALS TABLE
-- =============================================================================

CREATE TABLE scheduled_appraisals (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    employee_id         INT NOT NULL,
    scheduled_date      DATE NOT NULL,
    appraisal_type      VARCHAR(100) DEFAULT 'Annual Review',
    scheduled_by_user_id INT NOT NULL,
    status              ENUM('Scheduled','Completed','Cancelled','Postponed') DEFAULT 'Scheduled',
    notes               TEXT NULL,
    reminder_date       DATE NULL,
    reminder_sent       BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_schedule_employee FOREIGN KEY (employee_id)
        REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_schedule_creator FOREIGN KEY (scheduled_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_employee_id   (employee_id),
    INDEX idx_scheduled_date (scheduled_date),
    INDEX idx_status        (status),
    INDEX idx_reminder_date (reminder_date)
) ENGINE=InnoDB;

-- =============================================================================
-- AUDIT TRAIL TABLE
-- Append-only. Never update or delete rows here.
-- =============================================================================

CREATE TABLE audit_trail (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    table_name  VARCHAR(50) NOT NULL,
    record_id   INT NOT NULL,
    action      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    old_values  JSON NULL,
    new_values  JSON NULL,
    changed_by  VARCHAR(100) NOT NULL,
    ip_address  VARCHAR(45) NULL,
    user_agent  TEXT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_table_record (table_name, record_id),
    INDEX idx_changed_by   (changed_by),
    INDEX idx_created_at   (created_at)
) ENGINE=InnoDB;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- employee_summary: the main list view — shows status, manager name, rating
CREATE VIEW employee_summary AS
SELECT
    e.id,
    e.employee_number,
    e.employee_id,
    e.first_name,
    e.last_name,
    CONCAT(e.first_name, ' ', e.last_name)   AS full_name,
    e.email,
    e.department,
    e.job_title,
    CONCAT(m.first_name, ' ', m.last_name)   AS manager_name,
    e.manager_id,
    e.last_meeting_date,
    e.last_appraisal_date,
    e.next_scheduled_appraisal,
    e.average_rating,
    e.is_active,
    CASE
        WHEN e.next_scheduled_appraisal IS NULL           THEN 'Not Scheduled'
        WHEN e.next_scheduled_appraisal < CURDATE()       THEN 'Overdue'
        WHEN e.next_scheduled_appraisal <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Due Soon'
        ELSE 'Scheduled'
    END AS appraisal_status
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;

-- department_stats: used by the management dashboard
CREATE VIEW department_stats AS
SELECT
    e.department,
    COUNT(*)                                                              AS employee_count,
    ROUND(AVG(e.average_rating), 2)                                       AS avg_rating,
    SUM(CASE WHEN e.next_scheduled_appraisal < CURDATE() THEN 1 ELSE 0 END) AS overdue_appraisals,
    SUM(CASE WHEN e.last_meeting_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS meetings_last_30_days
FROM employees e
WHERE e.is_active = TRUE
GROUP BY e.department;

-- =============================================================================
-- SEED DATA — configuration dropdowns
-- =============================================================================

INSERT INTO departments (name) VALUES
    ('Engineering'), ('Marketing'), ('Sales'),
    ('Human Resources'), ('Finance'), ('Operations'),
    ('Customer Service'), ('Quality Assurance');

INSERT INTO job_titles (name) VALUES
    ('Senior Developer'), ('Junior Developer'), ('Marketing Manager'),
    ('Account Executive'), ('UX Designer'), ('Financial Analyst'),
    ('Operations Coordinator'), ('Customer Success Manager'), ('QA Engineer'),
    ('HR Manager'), ('Team Lead'), ('Director');

INSERT INTO meeting_types (name) VALUES
    ('One-on-One'), ('Performance Review'), ('Goal Setting'),
    ('Disciplinary Meeting'), ('Career Development'), ('Project Review'),
    ('Probation Review'), ('Exit Interview');

INSERT INTO incident_types (name) VALUES
    ('General Misconduct'), ('Gross Misconduct'), ('Achievement Recognition'),
    ('Training Completion'), ('Goal Achievement'), ('Performance Issue'),
    ('Safety Incident'), ('Customer Complaint'), ('Attendance Issue');

INSERT INTO appraisal_section_templates (name, default_weight) VALUES
    ('Technical Skills', 20),
    ('Communication', 15),
    ('Teamwork', 15),
    ('Leadership', 10),
    ('Innovation', 10),
    ('Customer Focus', 10),
    ('Problem Solving', 10),
    ('Time Management', 10);

-- =============================================================================
-- VERIFY SETUP
-- =============================================================================

SELECT
    table_name                              AS 'Table',
    table_rows                              AS 'Rows'
FROM information_schema.tables
WHERE table_schema = 'employee_appraisal_v2'
  AND table_type   = 'BASE TABLE'
ORDER BY table_name;
