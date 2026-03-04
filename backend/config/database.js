// backend/config/database.js - MySQL Database Configuration
const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'employee_appraisals',
  charset: 'utf8mb4',
  timezone: '+00:00',
  
  // Connection pool settings
  connectionLimit: 20,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  
  // Additional options
  multipleStatements: false,
  dateStrings: false,
  supportBigNumbers: true,
  bigNumberStrings: true,
  
  // SSL configuration (for production)
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    
    // Test query
    const [rows] = await connection.execute('SELECT VERSION() as version');
    console.log(`📊 MySQL Version: ${rows[0].version}`);
    
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Initialize database tables if they don't exist
const initializeTables = async () => {
  try {
    const connection = await pool.getConnection();
    
    // Check if tables exist
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${dbConfig.database}'
    `);
    
    const tableNames = tables.map(table => table.TABLE_NAME);
    
    if (tableNames.length === 0) {
      console.log('🔧 Creating database tables...');
      
      // Create tables (using the SQL from your MySQL schema)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS employees (
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
          email VARCHAR(150) NULL,
          phone VARCHAR(20) NULL,
          start_date DATE NULL,
          INDEX idx_employee_id (employee_id),
          INDEX idx_department (department),
          INDEX idx_manager (manager),
          INDEX idx_next_appraisal (next_scheduled_appraisal)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Create all other tables...
      await createUsersTables(connection);
      await createConfigTables(connection);
      await createMeetingTables(connection);
      await createAppraisalTables(connection);
      await createIncidentTables(connection);
      await createScheduleTables(connection);
      await createAuditTables(connection);
      await insertInitialData(connection);
      
      console.log('✅ Database tables created successfully');
    } else {
      console.log(`📋 Found ${tableNames.length} existing tables`);
    }
    
    connection.release();
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    throw error;
  }
};

// Helper function to create users table
const createUsersTables = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(150) UNIQUE NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'manager', 'user') DEFAULT 'user',
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMP NULL,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_username (username),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// Helper function to create config tables
const createConfigTables = async (connection) => {
  const configTables = [
    'departments', 'managers', 'job_descriptions', 'meeting_types',
    'general_misconduct_types', 'gross_misconduct_types', 'achievement_types', 'incident_log_types'
  ];
  
  for (const tableName of configTables) {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ${tableName.includes('job_') ? 'job_title' : 
          tableName.includes('meeting_') ? 'meeting_type' :
          tableName.includes('misconduct_') ? 'misconduct_type' :
          tableName.includes('achievement_') ? 'achievement_type' :
          tableName.includes('incident_') ? 'incident_type' :
          tableName.includes('manager') ? 'manager_name' :
          tableName.slice(0, -1) + '_name'
        } VARCHAR(150) UNIQUE NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
};

// Helper function to create meeting tables
const createMeetingTables = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS meetings (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// Helper function to create appraisal tables
const createAppraisalTables = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS appraisals (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS appraisal_sections (
      section_id INT AUTO_INCREMENT PRIMARY KEY,
      appr_id INT NOT NULL,
      section_name VARCHAR(150) NOT NULL,
      section_rating DECIMAL(3,2) NOT NULL,
      previous_rating DECIMAL(3,2) NULL,
      section_comments TEXT NULL,
      section_order INT DEFAULT 0,
      weight DECIMAL(5,2) DEFAULT 0.00,
      FOREIGN KEY (appr_id) REFERENCES appraisals (appr_id) ON DELETE CASCADE,
      INDEX idx_appr_id (appr_id),
      INDEX idx_section_order (section_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// Helper function to create incident tables
const createIncidentTables = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS incident_logs (
      log_id INT AUTO_INCREMENT PRIMARY KEY,
      employee_number INT NOT NULL,
      incident_log_date DATE NOT NULL,
      incident_log_type VARCHAR(100) NOT NULL,
      incident_detail TEXT NOT NULL,
      severity ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
      witnesses TEXT NULL,
      corrective_action TEXT NULL,
      follow_up_required BOOLEAN DEFAULT FALSE,
      follow_up_date DATE NULL,
      logged_by VARCHAR(100) NOT NULL,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_number) REFERENCES employees (employee_number) ON DELETE CASCADE,
      INDEX idx_employee_number (employee_number),
      INDEX idx_incident_date (incident_log_date),
      INDEX idx_incident_type (incident_log_type),
      INDEX idx_severity (severity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// Helper function to create schedule tables
const createScheduleTables = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_appraisals (
      schedule_id INT AUTO_INCREMENT PRIMARY KEY,
      employee_number INT NOT NULL,
      scheduled_date DATE NOT NULL,
      scheduled_by VARCHAR(100) NOT NULL,
      status ENUM('Scheduled', 'Completed', 'Cancelled', 'Postponed') DEFAULT 'Scheduled',
      appraisal_type VARCHAR(100) DEFAULT 'Annual Review',
      notes TEXT NULL,
      reminder_date DATE NULL,
      reminder_sent BOOLEAN DEFAULT FALSE,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_number) REFERENCES employees (employee_number) ON DELETE CASCADE,
      INDEX idx_employee_number (employee_number),
      INDEX idx_scheduled_date (scheduled_date),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// Helper function to create audit tables
const createAuditTables = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      audit_id INT AUTO_INCREMENT PRIMARY KEY,
      table_name VARCHAR(50) NOT NULL,
      record_id INT NOT NULL,
      action ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
      old_values JSON NULL,
      new_values JSON NULL,
      changed_by VARCHAR(100) NOT NULL,
      change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      INDEX idx_table_record (table_name, record_id),
      INDEX idx_change_date (change_date),
      INDEX idx_changed_by (changed_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// Insert initial configuration data
const insertInitialData = async (connection) => {
  // Insert departments
  await connection.execute(`
    INSERT IGNORE INTO departments (department_name) VALUES 
    ('Engineering'), ('Marketing'), ('Sales'), ('Human Resources'), 
    ('Finance'), ('Operations'), ('Customer Service'), ('Quality Assurance')
  `);
  
  // Insert managers
  await connection.execute(`
    INSERT IGNORE INTO managers (manager_name) VALUES 
    ('Mike Chen'), ('Lisa Wang'), ('Alex Thompson'), 
    ('Jennifer Lee'), ('David Smith'), ('Sarah Johnson')
  `);
  
  // Insert job titles
  await connection.execute(`
    INSERT IGNORE INTO job_descriptions (job_title) VALUES 
    ('Senior Developer'), ('Marketing Manager'), ('Account Executive'), 
    ('UX Designer'), ('Financial Analyst'), ('Operations Coordinator')
  `);
  
  // Insert meeting types
  await connection.execute(`
    INSERT IGNORE INTO meeting_types (meeting_type) VALUES 
    ('One-on-One'), ('Performance Review'), ('Goal Setting'), 
    ('Disciplinary Meeting'), ('Career Development'), ('Project Review')
  `);
  
  // Insert other configuration data...
  console.log('📝 Initial configuration data inserted');
};

// Database utility functions
const dbUtils = {
  // Execute query with error handling
  // NOTE: Uses pool.query() (not pool.execute()) so that LIMIT/OFFSET and other
  // numeric params passed as JS Numbers are accepted without type errors on OCI MySQL.
  // pool.execute() uses server-side prepared statements which are stricter about types.
  query: async (sql, params = []) => {
    try {
      // Ensure all numeric params are proper JS Numbers (not strings)
      const safeParams = params.map(p => {
        if (p === null || p === undefined) return p;
        if (typeof p === 'string' && p !== '' && !isNaN(p) && !isNaN(parseFloat(p))) {
          // Only coerce if it looks like a pure number with no meaningful string context
          // (dates like '2024-01-01' contain '-' so isNaN guards them correctly)
          return Number(p);
        }
        return p;
      });
      const [rows, fields] = await pool.query(sql, safeParams);
      return { rows, fields };
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },
  
  // Transaction support
  transaction: async (callback) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
  
  // Get connection from pool
  getConnection: () => pool.getConnection(),
  
  // Close pool
  close: () => pool.end()
};

// Initialize database on startup
if (require.main === module) {
  (async () => {
    await testConnection();
    await initializeTables();
  })();
}

module.exports = {
  pool,
  dbUtils,
  testConnection,
  initializeTables
};