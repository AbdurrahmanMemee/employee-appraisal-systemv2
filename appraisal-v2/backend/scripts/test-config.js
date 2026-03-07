// =============================================================================
// FILE:    scripts/test-config.js
// PURPOSE: Full test suite for /api/config routes
//
// GROUPS:
//   1 — GET all / GET category  (reads)
//   2 — Create                  (POST /:category)
//   3 — Rename                  (PUT /:category/:id)
//   4 — Deactivate / Restore    (DELETE + POST /restore)
//   5 — RBAC                    (role enforcement)
//   6 — Edge cases              (duplicates, bad category, weight validation)
//
// USAGE:
//   node scripts/test-config.js
//   node scripts/test-config.js --group=2
//   node scripts/test-config.js --test=2a
// =============================================================================

const http   = require('http');
const mysql  = require('mysql2/promise');
const path   = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT = parseInt(process.env.PORT) || 5001;

let passed = 0, failed = 0, skipped = 0;
const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', RESET = '\x1b[0m';
const pass    = (m) => { console.log(`  ${GREEN}✅  ${m}${RESET}`); passed++; };
const fail    = (m) => { console.log(`  ${RED}❌  ${m}${RESET}`); failed++; };
const skip    = (m) => { console.log(`  ${YELLOW}⏭️   ${m}${RESET}`); skipped++; };
const info    = (m) => console.log(`  ℹ️   ${m}`);
const section = (t) => console.log(`\n${GREEN}--- ${t} ${'─'.repeat(Math.max(0,50-t.length))}${RESET}`);

const getArg  = (f) => { const a = process.argv.find(x => x.startsWith(`--${f}=`)||x===`--${f}`); return a?(a.includes('=')?a.split('=')[1]:process.argv[process.argv.indexOf(a)+1]):null; };
const groupFilter = getArg('group') ? getArg('group').split(',').map(Number) : null;
const testFilter  = getArg('test')  ? getArg('test').split(',').map(s=>s.trim().toLowerCase()) : null;
const runGroup    = (n)  => !groupFilter || groupFilter.includes(n);
const runTest     = (id) => !testFilter  || testFilter.includes(id.toLowerCase());

const request = (method, path, body=null, token=null) => new Promise((resolve,reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = { hostname:'localhost', port:PORT, path, method,
        headers: { ...(bodyStr?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bodyStr)}:{}), ...(token?{'Authorization':`Bearer ${token}`}:{}) } };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)})}catch{resolve({status:res.statusCode,body:d})} }); });
    req.setTimeout(8000, ()=>req.destroy(new Error('Timeout')));
    req.on('error',reject);
    if (bodyStr) req.write(bodyStr); req.end();
});

let db;
const getDb = async () => {
    if (!db) db = await mysql.createConnection({ host:process.env.DB_HOST||'localhost', port:parseInt(process.env.DB_PORT)||3306, user:process.env.DB_USER, password:process.env.DB_PASSWORD||'', database:process.env.DB_NAME, charset:'utf8mb4' });
    return db;
};

const login = async (u,p) => {
    const r = await request('POST','/api/auth/login',{username:u,password:p});
    if (r.status===200 && r.body.token) return r.body.token;
    throw new Error(`Login failed ${r.status}`);
};

const createTestUser = async (username, role) => {
    const conn = await getDb();
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('TestPass123!', 10);
    await conn.execute('DELETE FROM users WHERE username=?',[username]);
    const [r] = await conn.execute(
        `INSERT INTO users (username,email,password_hash,full_name,role,is_active) VALUES (?,?,?,?,?,TRUE)`,
        [username,`${username}@test.com`,hash,`Test ${username}`,role]
    );
    return r.insertId;
};
const deleteTestUser = async (u) => { const conn=await getDb(); await conn.execute('DELETE FROM users WHERE username=?',[u]); };

// Track items created during tests for cleanup
const createdItems = {}; // { category: [id, ...] }
const trackCreated = (category, id) => { if (!createdItems[category]) createdItems[category]=[];  createdItems[category].push(id); };

const cleanupCreated = async () => {
    const conn = await getDb();
    const tableMap = {
        departments: 'departments', job_titles: 'job_titles',
        meeting_types: 'meeting_types', incident_types: 'incident_types',
        appraisal_sections: 'appraisal_section_templates',
    };
    for (const [cat, ids] of Object.entries(createdItems)) {
        const table = tableMap[cat];
        if (!table) continue;
        for (const id of ids) {
            await conn.execute(`DELETE FROM \`${table}\` WHERE id=?`,[id]).catch(()=>{});
        }
    }
};

let adminToken, managerToken, employeeToken;

const setup = async () => {
    await createTestUser('cfg_admin',   'admin');
    await createTestUser('cfg_manager', 'manager');
    await createTestUser('cfg_employee','employee');
    adminToken    = await login('cfg_admin',   'TestPass123!');
    managerToken  = await login('cfg_manager', 'TestPass123!');
    employeeToken = await login('cfg_employee','TestPass123!');
};

const teardown = async () => {
    await cleanupCreated();
    await deleteTestUser('cfg_admin');
    await deleteTestUser('cfg_manager');
    await deleteTestUser('cfg_employee');
};

// =============================================================================
// GROUP 1: READS
// =============================================================================
async function testReads() {
    section('GROUP 1: Reads  GET /api/config');

    // 1a: GET all returns all 5 categories
    if (runTest('1a')) {
        info('1a. GET /api/config returns all categories');
        try {
            const r = await request('GET','/api/config',null,adminToken);
            const keys = Object.keys(r.body.data||{});
            const expected = ['departments','job_titles','meeting_types','incident_types','appraisal_sections'];
            const allPresent = expected.every(k => keys.includes(k));
            r.status===200 && allPresent
                ? pass(`200 — all 5 categories present: ${keys.join(', ')}`)
                : fail(`Missing categories. Got: ${keys.join(', ')}`);
        } catch(e) { fail(`1a crashed: ${e.message}`); }
    }

    // 1b: GET all only returns active items
    if (runTest('1b')) {
        info('1b. GET /api/config only returns active items');
        try {
            const r = await request('GET','/api/config',null,adminToken);
            const depts = r.body.data?.departments || [];
            const allActive = depts.every(d => d.is_active === 1 || d.is_active === true);
            allActive && depts.length > 0
                ? pass(`All ${depts.length} departments are active`)
                : fail(`Found inactive items in active-only response`);
        } catch(e) { fail(`1b crashed: ${e.message}`); }
    }

    // 1c: GET single category returns full detail including inactive
    if (runTest('1c')) {
        info('1c. GET /api/config/:category returns full detail with meta');
        try {
            const r = await request('GET','/api/config/departments',null,adminToken);
            r.status===200 && r.body.data && r.body.meta
                ? pass(`200 — ${r.body.data.length} items, meta: total=${r.body.meta.total}, active=${r.body.meta.active}`)
                : fail(`Expected 200 with data+meta, got ${r.status}`);
        } catch(e) { fail(`1c crashed: ${e.message}`); }
    }

    // 1d: appraisal_sections includes default_weight
    if (runTest('1d')) {
        info('1d. appraisal_sections includes default_weight field');
        try {
            const r = await request('GET','/api/config/appraisal_sections',null,adminToken);
            const hasWeight = r.body.data?.some(s => s.default_weight !== undefined);
            hasWeight
                ? pass('appraisal_sections items have default_weight field')
                : fail('default_weight missing from appraisal_sections');
        } catch(e) { fail(`1d crashed: ${e.message}`); }
    }

    // 1e: Unknown category returns 404
    if (runTest('1e')) {
        info('1e. Unknown category returns 404');
        try {
            const r = await request('GET','/api/config/unicorns',null,adminToken);
            r.status===404
                ? pass('Unknown category returns 404')
                : fail(`Expected 404, got ${r.status}`);
        } catch(e) { fail(`1e crashed: ${e.message}`); }
    }

    // 1f: All roles can read config
    if (runTest('1f')) {
        info('1f. All roles can read config (needed for dropdowns)');
        try {
            const results = await Promise.all([
                request('GET','/api/config',null,adminToken),
                request('GET','/api/config',null,managerToken),
                request('GET','/api/config',null,employeeToken),
            ]);
            results.every(r=>r.status===200)
                ? pass('admin, manager, employee all get 200 on GET /api/config')
                : fail(`Status codes: ${results.map(r=>r.status).join(', ')}`);
        } catch(e) { fail(`1f crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 2: CREATE
// =============================================================================
async function testCreate() {
    section('GROUP 2: Create  POST /api/config/:category');

    // 2a: Admin can add a department
    if (runTest('2a')) {
        info('2a. Admin can add a new department');
        try {
            const r = await request('POST','/api/config/departments',{name:'Test Department XYZ'},adminToken);
            r.status===201 && r.body.data?.id
                ? (pass(`201 — created id=${r.body.data.id}, name='${r.body.data.name}'`), trackCreated('departments',r.body.data.id))
                : fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`2a crashed: ${e.message}`); }
    }

    // 2b: Admin can add appraisal_section with weight
    if (runTest('2b')) {
        info('2b. Admin can add appraisal section with default_weight');
        try {
            const r = await request('POST','/api/config/appraisal_sections',{name:'Test Section Weight',default_weight:15},adminToken);
            r.status===201
                ? (pass(`201 — created with weight`), trackCreated('appraisal_sections',r.body.data?.id))
                : fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`2b crashed: ${e.message}`); }
    }

    // 2c: Missing name returns 400
    if (runTest('2c')) {
        info('2c. Missing name returns 400');
        try {
            const r = await request('POST','/api/config/departments',{},adminToken);
            r.status===400
                ? pass('Missing name returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`2c crashed: ${e.message}`); }
    }

    // 2d: Manager cannot add items
    if (runTest('2d')) {
        info('2d. Manager role cannot add config items');
        try {
            const r = await request('POST','/api/config/departments',{name:'Manager Test Dept'},managerToken);
            r.status===403
                ? pass('Manager gets 403 on POST /config')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`2d crashed: ${e.message}`); }
    }

    // 2e: Employee cannot add items
    if (runTest('2e')) {
        info('2e. Employee role cannot add config items');
        try {
            const r = await request('POST','/api/config/departments',{name:'Employee Test Dept'},employeeToken);
            r.status===403
                ? pass('Employee gets 403 on POST /config')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`2e crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 3: RENAME
// =============================================================================
async function testRename() {
    section('GROUP 3: Rename  PUT /api/config/:category/:id');

    // Create a fresh item to rename
    let testId;
    try {
        const r = await request('POST','/api/config/meeting_types',{name:'Rename Test Type Original'},adminToken);
        if (r.status===201) { testId=r.body.data.id; trackCreated('meeting_types',testId); }
        else { fail('Group 3 setup: could not create test item'); return; }
    } catch(e) { fail(`Group 3 setup crashed: ${e.message}`); return; }

    // 3a: Admin can rename
    if (runTest('3a')) {
        info('3a. Admin can rename a config item');
        try {
            const r = await request('PUT',`/api/config/meeting_types/${testId}`,{name:'Rename Test Type Updated'},adminToken);
            r.status===200 && r.body.data?.name==='Rename Test Type Updated'
                ? pass(`200 — renamed to '${r.body.data.name}'`)
                : fail(`Expected 200 with new name, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`3a crashed: ${e.message}`); }
    }

    // 3b: Rename to existing name returns 409
    if (runTest('3b')) {
        info('3b. Rename to existing name returns 409');
        try {
            // 'One-on-One' is a seeded meeting type
            const r = await request('PUT',`/api/config/meeting_types/${testId}`,{name:'One-on-One'},adminToken);
            r.status===409
                ? pass('Rename to duplicate name returns 409')
                : fail(`Expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`3b crashed: ${e.message}`); }
    }

    // 3c: Rename non-existent item returns 404
    if (runTest('3c')) {
        info('3c. Rename non-existent item returns 404');
        try {
            const r = await request('PUT','/api/config/meeting_types/999999',{name:'Ghost'},adminToken);
            r.status===404
                ? pass('Non-existent item returns 404')
                : fail(`Expected 404, got ${r.status}`);
        } catch(e) { fail(`3c crashed: ${e.message}`); }
    }

    // 3d: Manager cannot rename
    if (runTest('3d')) {
        info('3d. Manager cannot rename config items');
        try {
            const r = await request('PUT',`/api/config/meeting_types/${testId}`,{name:'Manager Rename Attempt'},managerToken);
            r.status===403
                ? pass('Manager gets 403 on PUT /config')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`3d crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 4: DEACTIVATE & RESTORE
// =============================================================================
async function testDeactivateRestore() {
    section('GROUP 4: Deactivate & Restore');

    // Create a fresh item for this group
    let testId;
    try {
        const r = await request('POST','/api/config/incident_types',{name:'Deact Test Incident Type'},adminToken);
        if (r.status===201) { testId=r.body.data.id; trackCreated('incident_types',testId); }
        else { fail('Group 4 setup: could not create test item'); return; }
    } catch(e) { fail(`Group 4 setup crashed: ${e.message}`); return; }

    // 4a: Admin can deactivate
    if (runTest('4a')) {
        info('4a. Admin can deactivate a config item');
        try {
            const r = await request('DELETE',`/api/config/incident_types/${testId}`,null,adminToken);
            r.status===200
                ? pass('200 — item deactivated')
                : fail(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`4a crashed: ${e.message}`); }
    }

    // 4b: Deactivated item absent from GET /api/config active list
    if (runTest('4b')) {
        info('4b. Deactivated item absent from active-only GET /api/config');
        try {
            const r = await request('GET','/api/config',null,adminToken);
            const names = (r.body.data?.incident_types||[]).map(i=>i.name);
            !names.includes('Deact Test Incident Type')
                ? pass('Deactivated item not in active list')
                : fail('Deactivated item still appears in active list');
        } catch(e) { fail(`4b crashed: ${e.message}`); }
    }

    // 4c: Deactivated item still visible in full GET /:category
    if (runTest('4c')) {
        info('4c. Deactivated item still visible in full GET /api/config/:category');
        try {
            const r = await request('GET','/api/config/incident_types',null,adminToken);
            const item = (r.body.data||[]).find(i=>i.id===testId);
            item && !item.is_active
                ? pass('Deactivated item present in full list with is_active=false')
                : fail('Deactivated item missing from full list or still active');
        } catch(e) { fail(`4c crashed: ${e.message}`); }
    }

    // 4d: Double deactivate returns 400
    if (runTest('4d')) {
        info('4d. Deactivating already inactive item returns 400');
        try {
            const r = await request('DELETE',`/api/config/incident_types/${testId}`,null,adminToken);
            r.status===400
                ? pass('Double-deactivate returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`4d crashed: ${e.message}`); }
    }

    // 4e: Admin can restore
    if (runTest('4e')) {
        info('4e. Admin can restore a deactivated item');
        try {
            const r = await request('POST',`/api/config/incident_types/${testId}/restore`,null,adminToken);
            r.status===200
                ? pass('200 — item restored')
                : fail(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
        } catch(e) { fail(`4e crashed: ${e.message}`); }
    }

    // 4f: Double restore returns 400
    if (runTest('4f')) {
        info('4f. Restoring already active item returns 400');
        try {
            const r = await request('POST',`/api/config/incident_types/${testId}/restore`,null,adminToken);
            r.status===400
                ? pass('Double-restore returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`4f crashed: ${e.message}`); }
    }

    // 4g: Manager cannot deactivate
    if (runTest('4g')) {
        info('4g. Manager cannot deactivate config items');
        try {
            const r = await request('DELETE',`/api/config/incident_types/${testId}`,null,managerToken);
            r.status===403
                ? pass('Manager gets 403 on DELETE /config')
                : fail(`Expected 403, got ${r.status}`);
        } catch(e) { fail(`4g crashed: ${e.message}`); }
    }
}

// =============================================================================
// GROUP 5: RBAC MATRIX
// =============================================================================
async function testRBAC() {
    section('GROUP 5: RBAC Matrix');

    if (runTest('5a')) {
        info('5a. Full RBAC matrix across methods and roles');
        const matrix = [
            ['admin GET all',      'GET',    '/api/config',                             adminToken,    200],
            ['manager GET all',    'GET',    '/api/config',                             managerToken,  200],
            ['employee GET all',   'GET',    '/api/config',                             employeeToken, 200],
            ['no token GET all',   'GET',    '/api/config',                             null,          401],
            ['admin GET cat',      'GET',    '/api/config/departments',                 adminToken,    200],
            ['manager GET cat',    'GET',    '/api/config/departments',                 managerToken,  200],
            ['employee GET cat',   'GET',    '/api/config/departments',                 employeeToken, 200],
            ['admin POST',         'POST',   '/api/config/departments',                 adminToken,    409], // 'Engineering' already exists
            ['manager POST',       'POST',   '/api/config/departments',                 managerToken,  403],
            ['employee POST',      'POST',   '/api/config/departments',                 employeeToken, 403],
            ['admin PUT',          'PUT',    '/api/config/departments/999999',          adminToken,    404],
            ['manager PUT',        'PUT',    '/api/config/departments/1',               managerToken,  403],
            ['admin DELETE',       'DELETE', '/api/config/departments/999999',          adminToken,    404],
            ['manager DELETE',     'DELETE', '/api/config/departments/1',               managerToken,  403],
        ];

        for (const [desc, method, path, token, expected] of matrix) {
            // For the admin POST test we send 'Engineering' which already exists → 409
            const body = method==='POST' ? {name:'Engineering'} : method==='PUT' ? {name:'x'} : null;
            try {
                const r = await request(method, path, body, token);
                r.status===expected
                    ? pass(`${desc}: ${expected} ✓`)
                    : fail(`${desc}: expected ${expected}, got ${r.status}`);
            } catch(e) { fail(`${desc}: crashed — ${e.message}`); }
        }
    }
}

// =============================================================================
// GROUP 6: EDGE CASES
// =============================================================================
async function testEdgeCases() {
    section('GROUP 6: Edge Cases');

    // 6a: Case-insensitive duplicate check
    if (runTest('6a')) {
        info('6a. Duplicate check is case-insensitive');
        try {
            // 'Engineering' already exists — 'engineering' should also be rejected
            const r = await request('POST','/api/config/departments',{name:'engineering'},adminToken);
            r.status===409
                ? pass("'engineering' rejected as duplicate of 'Engineering' (case-insensitive)")
                : fail(`Expected 409, got ${r.status}`);
        } catch(e) { fail(`6a crashed: ${e.message}`); }
    }

    // 6b: Name is trimmed before storage
    if (runTest('6b')) {
        info('6b. Name is trimmed before storage');
        try {
            const r = await request('POST','/api/config/meeting_types',{name:'  Trimmed Type  '},adminToken);
            const stored = r.body.data?.name;
            r.status===201 && stored==='Trimmed Type'
                ? (pass(`Name trimmed correctly: '${stored}'`), trackCreated('meeting_types',r.body.data.id))
                : fail(`Expected trimmed name, got '${stored}' (status ${r.status})`);
        } catch(e) { fail(`6b crashed: ${e.message}`); }
    }

    // 6c: Weight > 100 rejected
    if (runTest('6c')) {
        info('6c. default_weight > 100 rejected');
        try {
            const r = await request('POST','/api/config/appraisal_sections',{name:'Bad Weight',default_weight:150},adminToken);
            r.status===400
                ? pass('Weight > 100 returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`6c crashed: ${e.message}`); }
    }

    // 6d: Negative weight rejected
    if (runTest('6d')) {
        info('6d. Negative default_weight rejected');
        try {
            const r = await request('POST','/api/config/appraisal_sections',{name:'Neg Weight',default_weight:-5},adminToken);
            r.status===400
                ? pass('Negative weight returns 400')
                : fail(`Expected 400, got ${r.status}`);
        } catch(e) { fail(`6d crashed: ${e.message}`); }
    }

    // 6e: Audit trail created on add
    if (runTest('6e')) {
        info('6e. Audit trail entry created when item added');
        try {
            const r = await request('POST','/api/config/job_titles',{name:'Audit Trail Test Title'},adminToken);
            if (r.status===201) {
                trackCreated('job_titles',r.body.data.id);
                const conn = await getDb();
                const [rows] = await conn.execute(
                    `SELECT id FROM audit_trail WHERE table_name='job_titles' AND record_id=? AND action='INSERT'`,
                    [r.body.data.id]
                );
                rows.length>0
                    ? pass('Audit trail INSERT entry found')
                    : fail('No audit trail entry found');
            } else {
                fail(`Could not create item for audit test: ${r.status}`);
            }
        } catch(e) { fail(`6e crashed: ${e.message}`); }
    }

    // 6f: Unauthenticated request rejected on all methods
    if (runTest('6f')) {
        info('6f. Unauthenticated requests rejected on all write methods');
        try {
            const results = await Promise.all([
                request('POST',  '/api/config/departments',   {name:'x'}, null),
                request('PUT',   '/api/config/departments/1', {name:'x'}, null),
                request('DELETE','/api/config/departments/1', null,       null),
            ]);
            results.every(r=>r.status===401)
                ? pass('POST, PUT, DELETE all return 401 without token')
                : fail(`Status codes: ${results.map(r=>r.status).join(', ')}`);
        } catch(e) { fail(`6f crashed: ${e.message}`); }
    }
}

// =============================================================================
// MAIN
// =============================================================================
async function runAll() {
    console.log('\n========================================');
    console.log(' EAS v2 — Phase 3: Config Route Tests');
    console.log(`  Server: http://localhost:${PORT}`);
    if (groupFilter) console.log(`  Groups: ${groupFilter.join(', ')}`);
    if (testFilter)  console.log(`  Tests:  ${testFilter.join(', ')}`);
    console.log('========================================');

    try {
        const h = await request('GET','/health');
        if (h.status!==200) throw new Error(`${h.status}`);
        console.log('\n✅  Server is up.');
    } catch(e) { console.error(`\n❌  Server not reachable: ${e.message}`); process.exit(1); }

    try { await getDb(); console.log('✅  Database connected.'); }
    catch(e) { console.error(`\n❌  Database: ${e.message}`); process.exit(1); }

    try {
        await setup();
        console.log('✅  Test users set up.\n');
    } catch(e) {
        console.error(`\n❌  Setup failed: ${e.message}`);
        if (db) await db.end();
        process.exit(1);
    }

    try {
        if (runGroup(1)) await testReads();
        if (runGroup(2)) await testCreate();
        if (runGroup(3)) await testRename();
        if (runGroup(4)) await testDeactivateRestore();
        if (runGroup(5)) await testRBAC();
        if (runGroup(6)) await testEdgeCases();
    } finally {
        await teardown();
        if (db) await db.end();
        console.log('\n✅  Test data cleaned up.');
    }

    const total = passed+failed+skipped;
    console.log('\n========================================');
    console.log(' Config Route Test Results');
    console.log('========================================');
    console.log(`  ${GREEN}✅  Passed : ${passed}${RESET}`);
    console.log(`  ${RED}❌  Failed : ${failed}${RESET}`);
    console.log(`  ${YELLOW}⏭️   Skipped: ${skipped}${RESET}`);
    console.log(`      Total  : ${total}`);
    console.log('========================================\n');
    if (failed>0) process.exit(1);
}

runAll().catch(err => {
    console.error('\n❌  Test runner crashed:', err.message);
    if (db) db.end();
    process.exit(1);
});
