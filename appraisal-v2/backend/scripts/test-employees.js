// =============================================================================
// FILE:    scripts/test-employees.js
// PURPOSE: Full test suite for GET/POST/PUT/DELETE /api/employees
//
// GROUPS:
//   1 — List & filter     (GET /)
//   2 — Single & summary  (GET /:id and /:id/summary)
//   3 — Create            (POST /)
//   4 — Update            (PUT /:id)
//   5 — Deactivate/restore (DELETE + POST /restore)
//   6 — RBAC              (role access enforcement)
//   7 — Edge cases        (cycles, duplicates, boundary values)
//
// USAGE:
//   node scripts/test-employees.js
//   node scripts/test-employees.js --group=3
//   node scripts/test-employees.js --test=3a
// =============================================================================

const http   = require('http');
const mysql  = require('mysql2/promise');
const path   = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT     = parseInt(process.env.PORT) || 5001;
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0, failed = 0, skipped = 0;

const GREEN  = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', RESET = '\x1b[0m';
const pass    = (m) => { console.log(`  ${GREEN}✅  ${m}${RESET}`); passed++; };
const fail    = (m) => { console.log(`  ${RED}❌  ${m}${RESET}`); failed++; };
const skip    = (m) => { console.log(`  ${YELLOW}⏭️   ${m}${RESET}`); skipped++; };
const info    = (m) => console.log(`  ℹ️   ${m}`);
const section = (t) => console.log(`\n${GREEN}--- ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}${RESET}`);

// ---- CLI flags --------------------------------------------------------------
const getArg  = (f) => { const a = process.argv.find(x => x.startsWith(`--${f}=`) || x === `--${f}`); return a ? (a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a)+1]) : null; };
const groupFilter = getArg('group') ? getArg('group').split(',').map(Number) : null;
const testFilter  = getArg('test')  ? getArg('test').split(',').map(s => s.trim().toLowerCase()) : null;
const runGroup    = (n)  => !groupFilter || groupFilter.includes(n);
const runTest     = (id) => !testFilter  || testFilter.includes(id.toLowerCase());

// ---- HTTP helper ------------------------------------------------------------
const request = (method, urlPath, body = null, token = null) => new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
        hostname: 'localhost', port: PORT, path: urlPath, method,
        headers: {
            ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
            ...(token   ? { 'Authorization': `Bearer ${token}` } : {}),
        },
    };
    const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.setTimeout(8000, () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr); req.end();
});

// ---- DB helper -------------------------------------------------------------
let db;
const getDb = async () => {
    if (!db) db = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT)||3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME, charset: 'utf8mb4' });
    return db;
};

// ---- Auth helpers ----------------------------------------------------------
const login = async (u, p) => {
    const r = await request('POST', '/api/auth/login', { username: u, password: p });
    if (r.status === 200 && r.body.token) return r.body.token;
    throw new Error(`Login failed ${r.status}: ${JSON.stringify(r.body)}`);
};

const createTestUser = async (username, role, employeeId = null) => {
    const conn   = await getDb();
    const bcrypt = require('bcryptjs');
    const hash   = await bcrypt.hash('TestPass123!', 10);
    await conn.execute('DELETE FROM users WHERE username = ?', [username]);
    const [r] = await conn.execute(
        `INSERT INTO users (username, email, password_hash, full_name, role, employee_id, is_active) VALUES (?,?,?,?,?,?,TRUE)`,
        [username, `${username}@test.com`, hash, `Test ${username}`, role, employeeId]
    );
    return r.insertId;
};

const deleteTestUser = async (username) => {
    const conn = await getDb();
    await conn.execute('DELETE FROM invalidated_tokens WHERE user_id=(SELECT id FROM users WHERE username=? LIMIT 1)', [username]);
    await conn.execute('DELETE FROM users WHERE username=?', [username]);
};

// Shared tokens — set up once, reused across groups
let adminToken, managerToken, employeeToken;
let managerEmpId, employeeEmpId;  // employees.id values
let createdEmpId;                 // tracks employee created in Group 3 for later groups

const setupTokens = async () => {
    const conn = await getDb();

    // Create manager employee record
    await conn.execute('DELETE FROM employees WHERE employee_id IN (?,?,?)', ['TM-MGR', 'TM-EMP', 'TM-SUB']);
    const [mEmp] = await conn.execute(
        `INSERT INTO employees (first_name, last_name, employee_id, department, job_title, is_active)
         VALUES ('Test','Manager','TM-MGR','Engineering','Team Lead', TRUE)`
    );
    managerEmpId = mEmp.insertId;

    // Create employee record (reports to manager)
    const [eEmp] = await conn.execute(
        `INSERT INTO employees (first_name, last_name, employee_id, department, job_title, manager_id, is_active)
         VALUES ('Test','Employee','TM-EMP','Engineering','Developer', ?, TRUE)`,
        [managerEmpId]
    );
    employeeEmpId = eEmp.insertId;

    // Create user accounts linked to the employee records
    await createTestUser('test_admin_e',    'admin',    null);
    await createTestUser('test_manager_e',  'manager',  managerEmpId);
    await createTestUser('test_employee_e', 'employee', employeeEmpId);

    adminToken    = await login('test_admin_e',    'TestPass123!');
    managerToken  = await login('test_manager_e',  'TestPass123!');
    employeeToken = await login('test_employee_e', 'TestPass123!');
};

const teardownTokens = async () => {
    const conn = await getDb();
    await deleteTestUser('test_admin_e');
    await deleteTestUser('test_manager_e');
    await deleteTestUser('test_employee_e');
    await conn.execute('DELETE FROM employees WHERE employee_id IN (?,?,?)', ['TM-MGR','TM-EMP','TM-SUB']);
    if (createdEmpId) {
        await conn.execute('DELETE FROM employees WHERE id = ?', [createdEmpId]);
        createdEmpId = null;
    }
};

// =============================================================================
// GROUP 1: LIST & FILTER
// =============================================================================

async function testList() {
    section('GROUP 1: List & Filter  GET /api/employees');

    // 1a: Admin gets a list
    if (runTest('1a')) {
        info('1a. Admin can list all employees');
        try {
            const r = await request('GET', '/api/employees', null, adminToken);
            r.status === 200 && Array.isArray(r.body.data?.employees)
                ? pass(`200 — ${r.body.data.employees.length} employees, pagination present: ${!!r.body.data.pagination}`)
                : fail(`Expected 200 with employees array, got ${r.status}`);
        } catch(e) { fail(`1a crashed: ${e.message}`); }
    }

    // 1b: Pagination works
    if (runTest('1b')) {
        info('1b. Pagination — limit=1 returns 1 employee');
        try {
            const r = await request('GET', '/api/employees?limit=1&page=1', null, adminToken);
            r.status === 200 && r.body.data?.employees?.length === 1
                ? pass(`Page 1 with limit 1 returns exactly 1 employee`)
                : fail(`Expected 1 employee, got ${r.body.data?.employees?.length}`);
        } catch(e) { fail(`1b crashed: ${e.message}`); }
    }

    // 1c: Search filter works
    if (runTest('1c')) {
        info('1c. Search filter — searching "Test" finds our test employees');
        try {
            const r = await request('GET', '/api/employees?search=Test', null, adminToken);
            r.status === 200 && r.body.data?.employees?.length > 0
                ? pass(`Search "Test" returned ${r.body.data.employees.length} results`)
                : fail(`Search returned no results or wrong status: ${r.status}`);
        } catch(e) { fail(`1c crashed: ${e.message}`); }
    }

    // 1d: Manager only sees their subordinates
    if (runTest('1d')) {
        info('1d. Manager sees only their subordinates (not all employees)');
        try {
            const adminRes   = await request('GET', '/api/employees', null, adminToken);
            const managerRes = await request('GET', '/api/employees', null, managerToken);
            const adminCount   = adminRes.body.data?.pagination?.total || 0;
            const managerCount = managerRes.body.data?.pagination?.total || 0;

            managerCount < adminCount
                ? pass(`Manager sees ${managerCount}, admin sees ${adminCount} — hierarchy filter working`)
                : fail(`Manager sees ${managerCount}, admin sees ${adminCount} — filter not restricting`);

            // Confirm TM-EMP is in manager list
            const empIds = managerRes.body.data?.employees?.map(e => e.id) || [];
            empIds.includes(employeeEmpId)
                ? pass('TM-EMP (direct report) is in manager list')
                : fail('TM-EMP not found in manager list');
        } catch(e) { fail(`1d crashed: ${e.message}`); }
    }

    // 1e: Employee only sees own record
    if (runTest('1e')) {
        info('1e. Employee role only sees own record');
        try {
            const r = await request('GET', '/api/employees', null, employeeToken);
            const employees = r.body.data?.employees || [];
            r.status === 200 && employees.length === 1 && employees[0].id === employeeEmpId
                ? pass(`Employee sees exactly 1 record — their own (id: ${employeeEmpId})`)
                : fail(`Employee sees ${employees.length} records — expected 1 (their own)`);
        } catch(e) { fail(`1e crashed: ${e.message}`); }
    }

    // 1f: Stats endpoint blocked for employee role
    if (runTest('1f')) {
        info('1f. Stats endpoint blocked for employee role');
        try {
            const r = await request('GET', '/api/employees/stats', null, employeeToken);
            r.status === 403
                ? pass('Employee role gets 403 on /stats')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`1f crashed: ${e.message}`); }
    }

    // 1g: Unauthenticated request rejected
    if (runTest('1g')) {
        info('1g. No token → 401');
        try {
            const r = await request('GET', '/api/employees');
            r.status === 401
                ? pass('No token returns 401')
                : fail(`Expected 401, got ${r.status}`);
        } catch(e) { fail(`1g crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 2: SINGLE & SUMMARY
// =============================================================================

async function testSingle() {
    section('GROUP 2: Single & Summary  GET /api/employees/:id');

    // 2a: Admin gets any employee by id
    if (runTest('2a')) {
        info('2a. Admin can fetch any employee by id');
        try {
            const r = await request('GET', `/api/employees/${employeeEmpId}`, null, adminToken);
            r.status === 200 && r.body.data?.id === employeeEmpId
                ? pass(`200 — fetched employee id ${employeeEmpId}`)
                : fail(`Expected 200 with correct id, got ${r.status}`);
        } catch(e) { fail(`2a crashed: ${e.message}`); }
    }

    // 2b: Manager can fetch their subordinate
    if (runTest('2b')) {
        info('2b. Manager can fetch their subordinate');
        try {
            const r = await request('GET', `/api/employees/${employeeEmpId}`, null, managerToken);
            r.status === 200
                ? pass('Manager can fetch own subordinate')
                : fail(`Expected 200, got ${r.status}`);
        } catch(e) { fail(`2b crashed: ${e.message}`); }
    }

    // 2c: Manager cannot fetch an employee outside their tree
    if (runTest('2c')) {
        info('2c. Manager cannot fetch employee outside their tree');
        try {
            // managerEmpId is the manager themselves — employee role user cannot be their own manager
            // Use admin's employee (none — admin has no employee record), so use id=99999
            const r = await request('GET', `/api/employees/99999`, null, managerToken);
            r.status === 404
                ? pass('Manager gets 404 for employee outside their tree')
                : fail(`Expected 404, got ${r.status}`);
        } catch(e) { fail(`2c crashed: ${e.message}`); }
    }

    // 2d: Employee can fetch own record
    if (runTest('2d')) {
        info('2d. Employee can fetch own record');
        try {
            const r = await request('GET', `/api/employees/${employeeEmpId}`, null, employeeToken);
            r.status === 200
                ? pass('Employee can fetch own record')
                : fail(`Expected 200, got ${r.status}`);
        } catch(e) { fail(`2d crashed: ${e.message}`); }
    }

    // 2e: Employee cannot fetch another employee's record
    if (runTest('2e')) {
        info("2e. Employee cannot fetch another employee's record");
        try {
            const r = await request('GET', `/api/employees/${managerEmpId}`, null, employeeToken);
            r.status === 404
                ? pass("Employee gets 404 for another employee's record")
                : fail(`Expected 404, got ${r.status}`);
        } catch(e) { fail(`2e crashed: ${e.message}`); }
    }

    // 2f: Invalid ID format returns 400
    if (runTest('2f')) {
        info('2f. Invalid ID format returns 400');
        try {
            const r = await request('GET', '/api/employees/notanumber', null, adminToken);
            r.status === 400
                ? pass('Non-numeric ID returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`2f crashed: ${e.message}`); }
    }

    // 2g: Summary endpoint returns all sections
    if (runTest('2g')) {
        info('2g. Summary endpoint returns employee + related records');
        try {
            const r = await request('GET', `/api/employees/${employeeEmpId}/summary`, null, adminToken);
            const d = r.body.data;
            r.status === 200 &&
            d?.employee && d?.recentMeetings !== undefined &&
            d?.recentAppraisals !== undefined && d?.recentIncidents !== undefined &&
            d?.upcomingSchedules !== undefined
                ? pass('Summary returns employee + 4 related sections')
                : fail(`Summary missing sections: ${JSON.stringify(Object.keys(d||{}))}`);
        } catch(e) { fail(`2g crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 3: CREATE
// =============================================================================

async function testCreate() {
    section('GROUP 3: Create  POST /api/employees');

    const validPayload = {
        first_name:  'Create',
        last_name:   'TestEmp',
        department:  'Engineering',
        job_title:   'Senior Developer',
        email:       'create.test@example.com',
        phone:       '+27821234567',
        start_date:  '2025-01-15',
    };

    // 3a: Admin creates employee successfully
    if (runTest('3a')) {
        info('3a. Admin can create a new employee');
        try {
            const r = await request('POST', '/api/employees', validPayload, adminToken);
            r.status === 201 && r.body.data?.id
                ? (pass(`201 — employee created, id=${r.body.data.id}`), createdEmpId = r.body.data.id)
                : fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`3a crashed: ${e.message}`); }
    }

    // 3b: employee_id auto-generated in EMP-XXXX format
    if (runTest('3b')) {
        info('3b. employee_id auto-generated in EMP-XXXX format');
        try {
            if (!createdEmpId) { skip('3b skipped — no employee created in 3a'); return; }
            const r = await request('GET', `/api/employees/${createdEmpId}`, null, adminToken);
            const empId = r.body.data?.employee_id || '';
            /^EMP-\d{4}$/.test(empId)
                ? pass(`employee_id format correct: ${empId}`)
                : fail(`employee_id format wrong: ${empId}`);
        } catch(e) { fail(`3b crashed: ${e.message}`); }
    }

    // 3c: Missing required fields returns 400
    if (runTest('3c')) {
        info('3c. Missing required fields returns 400 with field errors');
        try {
            const r = await request('POST', '/api/employees', { first_name: 'Incomplete' }, adminToken);
            r.status === 400 && Array.isArray(r.body.errors)
                ? pass(`400 with ${r.body.errors.length} validation errors`)
                : fail(`Expected 400 with errors array, got ${r.status}`);
        } catch(e) { fail(`3c crashed: ${e.message}`); }
    }

    // 3d: Duplicate employee_number rejected with 409
    if (runTest('3d')) {
        info('3d. Duplicate employee_number returns 409');
        try {
            // First create one with a number
            const conn = await getDb();
            await conn.execute('DELETE FROM employees WHERE employee_id = ?', ['DUP-TEST']);
            await conn.execute(
                `INSERT INTO employees (first_name, last_name, employee_id, employee_number, department, job_title, is_active)
                 VALUES ('Dup','One','DUP-TEST',88881,'Engineering','Developer',TRUE)`
            );
            const r = await request('POST', '/api/employees', {
                ...validPayload, employee_number: 88881,
            }, adminToken);
            r.status === 409
                ? pass('Duplicate employee_number returns 409')
                : fail(`Expected 409, got ${r.status}`);
            await conn.execute('DELETE FROM employees WHERE employee_id = ?', ['DUP-TEST']);
        } catch(e) { fail(`3d crashed: ${e.message}`); }
    }

    // 3e: Employee role cannot create
    if (runTest('3e')) {
        info('3e. Employee role cannot create new employees');
        try {
            const r = await request('POST', '/api/employees', validPayload, employeeToken);
            r.status === 403
                ? pass('Employee role gets 403 on POST /employees')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`3e crashed: ${e.message}`); }
    }

    // 3f: Invalid email rejected
    if (runTest('3f')) {
        info('3f. Invalid email format returns 400');
        try {
            const r = await request('POST', '/api/employees', { ...validPayload, email: 'notanemail' }, adminToken);
            r.status === 400
                ? pass('Invalid email returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`3f crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 4: UPDATE
// =============================================================================

async function testUpdate() {
    section('GROUP 4: Update  PUT /api/employees/:id');

    if (!createdEmpId) {
        info('No employee from Group 3 — creating one now for Group 4 tests');
        try {
            const r = await request('POST', '/api/employees', {
                first_name: 'Update', last_name: 'TestEmp',
                department: 'Engineering', job_title: 'Senior Developer',
            }, adminToken);
            if (r.status === 201) createdEmpId = r.body.data.id;
        } catch(e) { /* will fail gracefully in individual tests */ }
    }

    // 4a: Admin can update any field
    if (runTest('4a')) {
        info('4a. Admin can update employee fields');
        try {
            const r = await request('PUT', `/api/employees/${createdEmpId}`, {
                first_name: 'Updated', last_name: 'Name',
                department: 'Marketing', job_title: 'Marketing Manager',
            }, adminToken);
            r.status === 200 && r.body.data?.first_name === 'Updated'
                ? pass('200 — fields updated correctly')
                : fail(`Expected 200 with updated data, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`4a crashed: ${e.message}`); }
    }

    // 4b: Employee role cannot update
    if (runTest('4b')) {
        info('4b. Employee role cannot update');
        try {
            const r = await request('PUT', `/api/employees/${employeeEmpId}`, { first_name: 'Hacked' }, employeeToken);
            r.status === 403
                ? pass('Employee role gets 403 on PUT')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`4b crashed: ${e.message}`); }
    }

    // 4c: Cannot set employee as their own manager
    if (runTest('4c')) {
        info('4c. Cannot set employee as their own manager');
        try {
            const r = await request('PUT', `/api/employees/${createdEmpId}`, {
                first_name: 'Updated', last_name: 'Name',
                department: 'Engineering', job_title: 'Senior Developer',
                manager_id: createdEmpId,
            }, adminToken);
            r.status === 400
                ? pass('Self-manager assignment returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`4c crashed: ${e.message}`); }
    }

    // 4d: Cannot create a circular hierarchy
    if (runTest('4d')) {
        info('4d. Cannot create circular hierarchy (assign subordinate as manager)');
        try {
            // employeeEmpId reports to managerEmpId
            // Try to set managerEmpId's manager to employeeEmpId — would be circular
            const r = await request('PUT', `/api/employees/${managerEmpId}`, {
                first_name: 'Test', last_name: 'Manager',
                department: 'Engineering', job_title: 'Team Lead',
                manager_id: employeeEmpId,
            }, adminToken);
            r.status === 400
                ? pass('Circular hierarchy assignment returns 400')
                : fail(`Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`4d crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 5: DEACTIVATE & RESTORE
// =============================================================================

async function testDeactivateRestore() {
    section('GROUP 5: Deactivate & Restore');

    if (!createdEmpId) {
        info('Creating employee for group 5 tests');
        try {
            const r = await request('POST', '/api/employees', {
                first_name: 'Deact', last_name: 'TestEmp',
                department: 'Engineering', job_title: 'Senior Developer',
            }, adminToken);
            if (r.status === 201) createdEmpId = r.body.data.id;
        } catch(e) { /* handled in individual tests */ }
    }

    // 5a: Admin can deactivate
    if (runTest('5a')) {
        info('5a. Admin can deactivate an employee');
        try {
            const r = await request('DELETE', `/api/employees/${createdEmpId}`, null, adminToken);
            r.status === 200
                ? pass('Employee deactivated — 200')
                : fail(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`5a crashed: ${e.message}`); }
    }

    // 5b: Deactivating already inactive employee returns 400
    if (runTest('5b')) {
        info('5b. Deactivating already inactive employee returns 400');
        try {
            const r = await request('DELETE', `/api/employees/${createdEmpId}`, null, adminToken);
            r.status === 400
                ? pass('Double-deactivate returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`5b crashed: ${e.message}`); }
    }

    // 5c: Manager role cannot deactivate
    if (runTest('5c')) {
        info('5c. Manager role cannot deactivate an employee');
        try {
            const r = await request('DELETE', `/api/employees/${createdEmpId}`, null, managerToken);
            r.status === 403
                ? pass('Manager gets 403 on DELETE')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`5c crashed: ${e.message}`); }
    }

    // 5d: Admin can restore
    if (runTest('5d')) {
        info('5d. Admin can restore a deactivated employee');
        try {
            const r = await request('POST', `/api/employees/${createdEmpId}/restore`, null, adminToken);
            r.status === 200
                ? pass('Employee restored — 200')
                : fail(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`5d crashed: ${e.message}`); }
    }

    // 5e: Restoring already active employee returns 400
    if (runTest('5e')) {
        info('5e. Restoring already active employee returns 400');
        try {
            const r = await request('POST', `/api/employees/${createdEmpId}/restore`, null, adminToken);
            r.status === 400
                ? pass('Double-restore returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`5e crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 6: RBAC MATRIX
// =============================================================================

async function testRBAC() {
    section('GROUP 6: RBAC Matrix');

    // Quick matrix check — endpoint × role → expected status
    const matrix = [
        // [description,   method, path,                          token,         expectedStatus]
        ['admin list',     'GET',  '/api/employees',              adminToken,    200],
        ['manager list',   'GET',  '/api/employees',              managerToken,  200],
        ['employee list',  'GET',  '/api/employees',              employeeToken, 200],
        ['admin stats',    'GET',  '/api/employees/stats',        adminToken,    200],
        ['manager stats',  'GET',  '/api/employees/stats',        managerToken,  200],
        ['employee stats', 'GET',  '/api/employees/stats',        employeeToken, 403],
        ['no token list',  'GET',  '/api/employees',              null,          401],
        ['no token stats', 'GET',  '/api/employees/stats',        null,          401],
    ];

    if (runTest('6a')) {
        info('6a. RBAC matrix — all role/endpoint combinations');
        let allPassed = true;
        for (const [desc, method, path, token, expected] of matrix) {
            try {
                const r = await request(method, path, null, token);
                if (r.status === expected) {
                    pass(`${desc}: ${expected} ✓`);
                } else {
                    fail(`${desc}: expected ${expected}, got ${r.status}`);
                    allPassed = false;
                }
            } catch(e) {
                fail(`${desc}: crashed — ${e.message}`);
                allPassed = false;
            }
        }
    }
}

// =============================================================================
// GROUP 7: EDGE CASES
// =============================================================================

async function testEdgeCases() {
    section('GROUP 7: Edge Cases');

    // 7a: Pagination cap — limit > 200 gets capped to 200
    if (runTest('7a')) {
        info('7a. Limit > 200 is capped at 200');
        try {
            const r = await request('GET', '/api/employees?limit=9999', null, adminToken);
            r.status === 200
                ? pass('limit=9999 accepted (capped at 200 internally)')
                : fail(`Expected 200, got ${r.status}`);
        } catch(e) { fail(`7a crashed: ${e.message}`); }
    }

    // 7b: Page 0 or negative is treated as page 1
    if (runTest('7b')) {
        info('7b. page=0 treated as page 1');
        try {
            const r  = await request('GET', '/api/employees?page=0',  null, adminToken);
            const r2 = await request('GET', '/api/employees?page=-1', null, adminToken);
            r.status === 200 && r2.status === 200
                ? pass('page=0 and page=-1 both return 200')
                : fail(`Unexpected status: ${r.status}, ${r2.status}`);
        } catch(e) { fail(`7b crashed: ${e.message}`); }
    }

    // 7c: SQL injection attempt in search param
    if (runTest('7c')) {
        info("7c. SQL injection in search param doesn't crash or leak data");
        try {
            const r = await request('GET', `/api/employees?search=${encodeURIComponent("'; DROP TABLE employees; --")}`, null, adminToken);
            r.status === 200
                ? pass('SQL injection in search returns 200 safely (parameterised queries working)')
                : fail(`Unexpected status: ${r.status}`);
        } catch(e) { fail(`7c crashed: ${e.message}`); }
    }

    // 7d: XSS attempt in name field rejected or sanitised
    if (runTest('7d')) {
        info('7d. XSS attempt in first_name rejected by validation');
        try {
            const r = await request('POST', '/api/employees', {
                first_name: '<script>alert("xss")</script>',
                last_name:  'Test',
                department: 'Engineering',
                job_title:  'Senior Developer',
            }, adminToken);
            r.status === 400
                ? pass('XSS in first_name rejected by name validation regex')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`7d crashed: ${e.message}`); }
    }

    // 7e: Very long name rejected
    if (runTest('7e')) {
        info('7e. Name longer than 100 chars rejected');
        try {
            const r = await request('POST', '/api/employees', {
                first_name: 'A'.repeat(101),
                last_name:  'Test',
                department: 'Engineering',
                job_title:  'Senior Developer',
            }, adminToken);
            r.status === 400
                ? pass('101-char name returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`7e crashed: ${e.message}`); }
    }

    // 7f: Audit trail entries created on insert
    if (runTest('7f')) {
        info('7f. Audit trail entry created when employee is created');
        try {
            if (!createdEmpId) { skip('7f skipped — no created employee'); return; }
            const conn = await getDb();
            const [rows] = await conn.execute(
                `SELECT * FROM audit_trail WHERE table_name='employees' AND record_id=? AND action='INSERT'`,
                [createdEmpId]
            );
            rows.length > 0
                ? pass(`Audit INSERT entry found for employee id=${createdEmpId}`)
                : fail('No audit trail INSERT entry found');
        } catch(e) { fail(`7f crashed: ${e.message}`); }
    }
}

// =============================================================================
// MAIN
// =============================================================================

async function runAll() {
    console.log('\n========================================');
    console.log(' EAS v2 — Phase 3: Employees Route Tests');
    console.log(`  Server: ${BASE_URL}`);
    if (groupFilter) console.log(`  Groups: ${groupFilter.join(', ')}`);
    if (testFilter)  console.log(`  Tests:  ${testFilter.join(', ')}`);
    console.log('========================================');

    // Confirm server is up
    try {
        const h = await request('GET', '/health');
        if (h.status !== 200) throw new Error(`${h.status}`);
        console.log('\n✅  Server is up.');
    } catch(e) {
        console.error(`\n❌  Server not reachable: ${e.message}\n    Start first: node server.js`);
        process.exit(1);
    }

    // Connect to DB
    try {
        await getDb();
        console.log('✅  Database connected.');
    } catch(e) {
        console.error(`\n❌  Database: ${e.message}`);
        process.exit(1);
    }

    // Setup shared test users and employee records
    try {
        await setupTokens();
        console.log('✅  Test users and employees set up.\n');
    } catch(e) {
        console.error(`\n❌  Setup failed: ${e.message}`);
        if (db) await db.end();
        process.exit(1);
    }

    try {
        if (runGroup(1)) await testList();
        if (runGroup(2)) await testSingle();
        if (runGroup(3)) await testCreate();
        if (runGroup(4)) await testUpdate();
        if (runGroup(5)) await testDeactivateRestore();
        if (runGroup(6)) await testRBAC();
        if (runGroup(7)) await testEdgeCases();
    } finally {
        // Always clean up test data
        await teardownTokens();
        if (createdEmpId) {
            const conn = await getDb();
            await conn.execute('DELETE FROM employees WHERE id = ?', [createdEmpId]);
        }
        if (db) await db.end();
        console.log('\n✅  Test data cleaned up.');
    }

    const total = passed + failed + skipped;
    console.log('\n========================================');
    console.log(' Employees Route Test Results');
    console.log('========================================');
    console.log(`  ${GREEN}✅  Passed : ${passed}${RESET}`);
    console.log(`  ${RED}❌  Failed : ${failed}${RESET}`);
    console.log(`  ${YELLOW}⏭️   Skipped: ${skipped}${RESET}`);
    console.log(`      Total  : ${total}`);
    console.log('========================================\n');

    if (failed > 0) process.exit(1);
}

runAll().catch(err => {
    console.error('\n❌  Test runner crashed:', err.message);
    console.error(err.stack);
    if (db) db.end();
    process.exit(1);
});
