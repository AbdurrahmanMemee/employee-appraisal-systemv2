// =============================================================================
// FILE:    scripts/verify-db.js
// PURPOSE: Verifies the v2 schema was applied correctly.
//          Run after schema_v2.sql + seed_v2.js
// USAGE:   node scripts/verify-db.js
// =============================================================================

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mysql = require('mysql2/promise');

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅  ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌  ${msg}`); failed++; }

async function verify() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host:     DB_HOST     || 'localhost',
            port:     parseInt(DB_PORT) || 3306,
            user:     DB_USER,
            password: DB_PASSWORD || '',
            database: DB_NAME,
            charset:  'utf8mb4',
        });
        pass(`Connected to ${DB_NAME} as ${DB_USER}`);
    } catch (err) {
        fail(`Connection failed: ${err.message}`);
        process.exit(1);
    }

    console.log('\n--- Tables ─────────────────────────────────────────');
    const expectedTables = [
        'departments', 'job_titles', 'meeting_types', 'incident_types',
        'appraisal_section_templates', 'employees', 'users',
        'invalidated_tokens', 'meetings', 'appraisals', 'appraisal_sections',
        'incident_logs', 'scheduled_appraisals', 'audit_trail',
    ];

    for (const table of expectedTables) {
        try {
            const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
            pass(`Table '${table}' exists (${rows[0].cnt} rows)`);
        } catch (e) {
            fail(`Table '${table}' MISSING — ${e.message}`);
        }
    }

    console.log('\n--- Views ──────────────────────────────────────────');
    for (const view of ['employee_summary', 'department_stats']) {
        try {
            await connection.query(`SELECT 1 FROM \`${view}\` LIMIT 1`);
            pass(`View '${view}' accessible`);
        } catch (e) {
            fail(`View '${view}' MISSING — ${e.message}`);
        }
    }

    console.log('\n--- Seed data ──────────────────────────────────────');
    const seedChecks = [
        ['departments',               8,  'departments'],
        ['job_titles',                12, 'job titles'],
        ['meeting_types',             8,  'meeting types'],
        ['incident_types',            9,  'incident types'],
        ['appraisal_section_templates', 8, 'appraisal section templates'],
        ['users',                     2,  'seed users'],
    ];
    for (const [table, expected, label] of seedChecks) {
        const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
        rows[0].cnt >= expected
            ? pass(`${label}: ${rows[0].cnt} rows`)
            : fail(`${label}: expected ${expected}+, got ${rows[0].cnt}`);
    }

    console.log('\n--- Schema checks ──────────────────────────────────');

    // Check employees.manager_id is a self-referential FK
    const [fkRows] = await connection.query(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employees'
          AND COLUMN_NAME = 'manager_id'
          AND REFERENCED_TABLE_NAME = 'employees'
    `, [DB_NAME]);
    fkRows[0].cnt > 0
        ? pass('employees.manager_id -> employees.id (self-referential FK)')
        : fail('employees.manager_id FK missing or wrong');

    // Check users.employee_id FK
    const [userFkRows] = await connection.query(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'employee_id'
          AND REFERENCED_TABLE_NAME = 'employees'
    `, [DB_NAME]);
    userFkRows[0].cnt > 0
        ? pass('users.employee_id -> employees.id FK exists')
        : fail('users.employee_id FK missing');

    // Check users roles are correct ENUM values
    const [roleRows] = await connection.query(`
        SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
    `, [DB_NAME]);
    const roleType = roleRows[0]?.COLUMN_TYPE || '';
    roleType.includes('admin') && roleType.includes('manager') && roleType.includes('employee')
        ? pass(`users.role ENUM includes: admin, manager, employee`)
        : fail(`users.role ENUM wrong: ${roleType}`);

    // Check invalidated_tokens table structure
    const [invRows] = await connection.query(`
        SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'invalidated_tokens'
          AND COLUMN_NAME IN ('user_id', 'invalidated_at', 'reason', 'expires_at')
    `, [DB_NAME]);
    invRows[0].cnt === 4
        ? pass('invalidated_tokens has all required columns')
        : fail(`invalidated_tokens missing columns (found ${invRows[0].cnt}/4)`);

    // Check recursive CTE works (MySQL 8 feature)
    try {
        await connection.query(`
            WITH RECURSIVE test AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM test WHERE n < 5)
            SELECT COUNT(*) FROM test
        `);
        pass('MySQL recursive CTE (WITH RECURSIVE) works — hierarchy queries will function');
    } catch (e) {
        fail(`Recursive CTE not supported: ${e.message} — MySQL 8.0+ required`);
    }

    // Check admin user has correct role
    const [adminRows] = await connection.query(
        `SELECT role, employee_id FROM users WHERE username = 'admin'`
    );
    if (adminRows.length > 0) {
        adminRows[0].role === 'admin'
            ? pass(`Admin user role: ${adminRows[0].role}`)
            : fail(`Admin user has wrong role: ${adminRows[0].role}`);
    } else {
        fail('Admin user not found — run seed_v2.js');
    }

    await connection.end();

    console.log('\n========================================');
    console.log(` Verification Results`);
    console.log('========================================');
    console.log(`  ✅  Passed: ${passed}`);
    console.log(`  ❌  Failed: ${failed}`);
    console.log('========================================');

    if (failed === 0) {
        console.log('\n  Schema v2 is correct. Ready for Phase 3.\n');
    } else {
        console.log('\n  Fix failures before proceeding.\n');
        process.exit(1);
    }
}

verify().catch(err => {
    console.error('❌  Verify crashed:', err.message);
    process.exit(1);
});
