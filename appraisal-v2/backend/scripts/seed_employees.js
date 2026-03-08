// =============================================================================
// FILE:    scripts/seed_employees.js
// PURPOSE: Seeds 15 test employees across departments with a realistic
//          org hierarchy. Safe to re-run — skips existing employee_ids.
//
// DEPARTMENTS (from schema):
//   1=Engineering  2=Marketing    3=Sales       4=Human Resources
//   5=Finance      6=Operations   7=Customer Service  8=Quality Assurance
//
// JOB TITLES (from schema):
//   1=Senior Developer   2=Junior Developer    3=Marketing Manager
//   4=Account Executive  5=UX Designer         6=Financial Analyst
//   7=Operations Coordinator  8=Customer Success Manager  9=QA Engineer
//   10=HR Manager        11=Team Lead           12=Director
//
// HIERARCHY:
//   Sarah Johnson (Director, no manager) — top of org
//   ├── James Nkosi       (Team Lead, Engineering)
//   │   ├── Emily Chen    (Senior Developer)
//   │   ├── David Patel   (Junior Developer)
//   │   └── Lisa Müller   (UX Designer)
//   ├── Michael Dlamini   (HR Manager)
//   │   └── Fatima Adams  (HR Coordinator → Operations Coordinator)
//   ├── Robert Botha      (Marketing Manager)
//   │   └── Priya Sharma  (Account Executive)
//   ├── Karen Williams    (Financial Analyst)
//   ├── Thomas Khumalo    (Operations Coordinator)
//   │   ├── Sipho Zulu    (Customer Success Manager)
//   │   └── Nomsa Dube    (QA Engineer)
//   └── Andre Steyn       (Team Lead, Sales)
//       └── Yusuf Hassan  (Account Executive)
//
// USAGE:
//   cd /var/www/appraisal-system/appraisal-v2/backend
//   node scripts/seed_employees.js
// =============================================================================

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mysql = require('mysql2/promise');

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

// ── Colour helpers ────────────────────────────────────────────────────────────
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;

// ── Employee definitions ──────────────────────────────────────────────────────
// manager_ref: employee_id string of their manager (resolved after insert)
// null manager_ref = top of org

const EMPLOYEES = [
  // Top level
  {
    employee_id: 'EMP-1001', employee_number: 1001,
    first_name: 'Sarah',   last_name: 'Johnson',
    email: 'sarah.johnson@company.com', phone: '011-555-0101',
    department_id: 12, department: 'Director',      // job_title_id 12 = Director
    job_title_id: 12,  job_title: 'Director',
    department_fk: null, dept_name: null,            // will use dept lookup
    dept_id: 6, dept_name2: 'Operations',
    start_date: '2018-03-01', manager_ref: null,
  },
  // Engineering team
  {
    employee_id: 'EMP-1002', employee_number: 1002,
    first_name: 'James',   last_name: 'Nkosi',
    email: 'james.nkosi@company.com', phone: '011-555-0102',
    job_title_id: 11, job_title: 'Team Lead',
    dept_id: 1, dept_name: 'Engineering',
    start_date: '2019-06-15', manager_ref: 'EMP-1001',
  },
  {
    employee_id: 'EMP-1003', employee_number: 1003,
    first_name: 'Emily',   last_name: 'Chen',
    email: 'emily.chen@company.com', phone: '011-555-0103',
    job_title_id: 1, job_title: 'Senior Developer',
    dept_id: 1, dept_name: 'Engineering',
    start_date: '2020-02-10', manager_ref: 'EMP-1002',
  },
  {
    employee_id: 'EMP-1004', employee_number: 1004,
    first_name: 'David',   last_name: 'Patel',
    email: 'david.patel@company.com', phone: '011-555-0104',
    job_title_id: 2, job_title: 'Junior Developer',
    dept_id: 1, dept_name: 'Engineering',
    start_date: '2022-08-01', manager_ref: 'EMP-1002',
  },
  {
    employee_id: 'EMP-1005', employee_number: 1005,
    first_name: 'Lisa',    last_name: 'Müller',
    email: 'lisa.muller@company.com', phone: '011-555-0105',
    job_title_id: 5, job_title: 'UX Designer',
    dept_id: 1, dept_name: 'Engineering',
    start_date: '2021-04-20', manager_ref: 'EMP-1002',
  },
  // HR team
  {
    employee_id: 'EMP-1006', employee_number: 1006,
    first_name: 'Michael', last_name: 'Dlamini',
    email: 'michael.dlamini@company.com', phone: '011-555-0106',
    job_title_id: 10, job_title: 'HR Manager',
    dept_id: 4, dept_name: 'Human Resources',
    start_date: '2017-09-01', manager_ref: 'EMP-1001',
  },
  {
    employee_id: 'EMP-1007', employee_number: 1007,
    first_name: 'Fatima',  last_name: 'Adams',
    email: 'fatima.adams@company.com', phone: '011-555-0107',
    job_title_id: 7, job_title: 'Operations Coordinator',
    dept_id: 4, dept_name: 'Human Resources',
    start_date: '2021-11-15', manager_ref: 'EMP-1006',
  },
  // Marketing team
  {
    employee_id: 'EMP-1008', employee_number: 1008,
    first_name: 'Robert',  last_name: 'Botha',
    email: 'robert.botha@company.com', phone: '011-555-0108',
    job_title_id: 3, job_title: 'Marketing Manager',
    dept_id: 2, dept_name: 'Marketing',
    start_date: '2019-01-07', manager_ref: 'EMP-1001',
  },
  {
    employee_id: 'EMP-1009', employee_number: 1009,
    first_name: 'Priya',   last_name: 'Sharma',
    email: 'priya.sharma@company.com', phone: '011-555-0109',
    job_title_id: 4, job_title: 'Account Executive',
    dept_id: 2, dept_name: 'Marketing',
    start_date: '2022-03-14', manager_ref: 'EMP-1008',
  },
  // Finance
  {
    employee_id: 'EMP-1010', employee_number: 1010,
    first_name: 'Karen',   last_name: 'Williams',
    email: 'karen.williams@company.com', phone: '011-555-0110',
    job_title_id: 6, job_title: 'Financial Analyst',
    dept_id: 5, dept_name: 'Finance',
    start_date: '2020-07-01', manager_ref: 'EMP-1001',
  },
  // Operations team
  {
    employee_id: 'EMP-1011', employee_number: 1011,
    first_name: 'Thomas',  last_name: 'Khumalo',
    email: 'thomas.khumalo@company.com', phone: '011-555-0111',
    job_title_id: 7, job_title: 'Operations Coordinator',
    dept_id: 6, dept_name: 'Operations',
    start_date: '2018-11-20', manager_ref: 'EMP-1001',
  },
  {
    employee_id: 'EMP-1012', employee_number: 1012,
    first_name: 'Sipho',   last_name: 'Zulu',
    email: 'sipho.zulu@company.com', phone: '011-555-0112',
    job_title_id: 8, job_title: 'Customer Success Manager',
    dept_id: 7, dept_name: 'Customer Service',
    start_date: '2021-06-01', manager_ref: 'EMP-1011',
  },
  {
    employee_id: 'EMP-1013', employee_number: 1013,
    first_name: 'Nomsa',   last_name: 'Dube',
    email: 'nomsa.dube@company.com', phone: '011-555-0113',
    job_title_id: 9, job_title: 'QA Engineer',
    dept_id: 8, dept_name: 'Quality Assurance',
    start_date: '2022-01-10', manager_ref: 'EMP-1011',
  },
  // Sales team
  {
    employee_id: 'EMP-1014', employee_number: 1014,
    first_name: 'Andre',   last_name: 'Steyn',
    email: 'andre.steyn@company.com', phone: '011-555-0114',
    job_title_id: 11, job_title: 'Team Lead',
    dept_id: 3, dept_name: 'Sales',
    start_date: '2019-08-05', manager_ref: 'EMP-1001',
  },
  {
    employee_id: 'EMP-1015', employee_number: 1015,
    first_name: 'Yusuf',   last_name: 'Hassan',
    email: 'yusuf.hassan@company.com', phone: '011-555-0115',
    job_title_id: 4, job_title: 'Account Executive',
    dept_id: 3, dept_name: 'Sales',
    start_date: '2023-02-20', manager_ref: 'EMP-1014',
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(bold('\n╔══════════════════════════════════════════════════════╗'));
  console.log(bold(  '║   EAS v2 — Employee Seed Script                     ║'));
  console.log(bold(  '╚══════════════════════════════════════════════════════╝\n'));

  let conn;
  try {
    conn = await mysql.createConnection({
      host:     DB_HOST     || 'localhost',
      port:     parseInt(DB_PORT) || 3306,
      user:     DB_USER,
      password: DB_PASSWORD || '',
      database: DB_NAME,
      charset:  'utf8mb4',
    });
    console.log(green('✅  Connected to MySQL as \'' + DB_USER + '\''));
  } catch (err) {
    console.error(red('❌  Connection failed: ' + err.message));
    process.exit(1);
  }

  // ── Step 1: Insert employees (without manager_id first) ───────────────────
  console.log(bold('\n  Step 1 — Inserting employees…\n'));

  const idMap = {}; // employee_id string → internal DB id

  for (const emp of EMPLOYEES) {
    // Check if already exists
    const [existing] = await conn.execute(
      'SELECT id FROM employees WHERE employee_id = ?', [emp.employee_id]
    );

    if (existing.length > 0) {
      idMap[emp.employee_id] = existing[0].id;
      console.log(`  ${yellow('⏭')}  ${dim(emp.employee_id)} ${emp.first_name} ${emp.last_name} — already exists, skipping`);
      continue;
    }

    const [result] = await conn.execute(
      `INSERT INTO employees
        (employee_id, employee_number, first_name, last_name, email, phone,
         department_id, department, job_title_id, job_title, start_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        emp.employee_id, emp.employee_number,
        emp.first_name, emp.last_name,
        emp.email, emp.phone,
        emp.dept_id, emp.dept_name,
        emp.job_title_id, emp.job_title,
        emp.start_date,
      ]
    );

    idMap[emp.employee_id] = result.insertId;
    console.log(`  ${green('✅')} ${dim(emp.employee_id)} ${emp.first_name} ${emp.last_name} — ${emp.job_title}, ${emp.dept_name}`);
  }

  // ── Step 2: Set manager_id links ──────────────────────────────────────────
  console.log(bold('\n  Step 2 — Setting manager relationships…\n'));

  for (const emp of EMPLOYEES) {
    if (!emp.manager_ref) continue;

    const managerId = idMap[emp.manager_ref];
    const empDbId   = idMap[emp.employee_id];

    if (!managerId || !empDbId) {
      console.log(`  ${red('❌')} Could not resolve manager for ${emp.employee_id}`);
      continue;
    }

    await conn.execute(
      'UPDATE employees SET manager_id = ? WHERE id = ?',
      [managerId, empDbId]
    );
    console.log(`  ${green('✅')} ${dim(emp.employee_id)} ${emp.first_name} ${emp.last_name} → reports to ${emp.manager_ref}`);
  }

  // ── Step 3: Link manager user account to EMP-1006 (Michael Dlamini, HR) ──
  // The 'manager' user account has employee_id = null — link it to a real employee
  console.log(bold('\n  Step 3 — Linking manager user account to employee record…\n'));

  const managerEmpId = idMap['EMP-1006'];
  if (managerEmpId) {
    await conn.execute(
      "UPDATE users SET employee_id = ? WHERE username = 'manager' AND employee_id IS NULL",
      [managerEmpId]
    );
    console.log(`  ${green('✅')} manager user linked to Michael Dlamini (EMP-1006, HR Manager)`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const [countRow] = await conn.execute('SELECT COUNT(*) as total FROM employees');
  const total = countRow[0].total;

  await conn.end();

  console.log('\n' + bold('═'.repeat(54)));
  console.log(bold('  SEED COMPLETE'));
  console.log(bold('═'.repeat(54)));
  console.log(`  ${green('Employees in DB')}: ${total}`);
  console.log(`  ${green('Departments')}: Engineering, Marketing, Sales, HR, Finance, Operations, Customer Service, QA`);
  console.log(`  ${green('Hierarchy')}: Sarah Johnson (Director) → 5 direct reports → subordinates`);
  console.log(bold('═'.repeat(54) + '\n'));
}

seed().catch(err => {
  console.error(red('❌  Seed failed: ' + err.message));
  process.exit(1);
});
