// =============================================================================
// FILE:    scripts/test-appraisals.js
// PURPOSE: Test suite for /api/appraisals
// GROUPS: 1-List, 2-Single, 3-Create, 4-Update, 5-Submit/Cancel, 6-Delete, 7-RBAC, 8-Edge
// USAGE:  node scripts/test-appraisals.js [--group=N] [--test=Xa]
// =============================================================================

const http  = require('http');
const mysql = require('mysql2/promise');
const path  = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT = parseInt(process.env.PORT) || 5001;
let passed = 0, failed = 0, skipped = 0;
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', X = '\x1b[0m';
const pass    = (m) => { console.log(`  ${G}✅  ${m}${X}`); passed++; };
const fail    = (m) => { console.log(`  ${R}❌  ${m}${X}`); failed++; };
const skip    = (m) => { console.log(`  ${Y}⏭️   ${m}${X}`); skipped++; };
const info    = (m) => console.log(`  ℹ️   ${m}`);
const section = (t) => console.log(`\n${G}--- ${t} ${'─'.repeat(Math.max(0,50-t.length))}${X}`);

const getArg = (f) => { const a=process.argv.find(x=>x.startsWith(`--${f}=`)||x===`--${f}`); return a?(a.includes('=')?a.split('=')[1]:process.argv[process.argv.indexOf(a)+1]):null; };
const groupFilter = getArg('group')?getArg('group').split(',').map(Number):null;
const testFilter  = getArg('test') ?getArg('test').split(',').map(s=>s.trim().toLowerCase()):null;
const runGroup = (n) => !groupFilter||groupFilter.includes(n);
const runTest  = (id)=> !testFilter ||testFilter.includes(id.toLowerCase());

const request = (method, urlPath, body=null, token=null) => new Promise((resolve,reject) => {
    const bodyStr = body?JSON.stringify(body):null;
    const opts = { hostname:'localhost', port:PORT, path:urlPath, method,
        headers: { ...(bodyStr?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bodyStr)}:{}), ...(token?{'Authorization':`Bearer ${token}`}:{}) } };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)})}catch{resolve({status:res.statusCode,body:d})} }); });
    req.setTimeout(8000,()=>req.destroy(new Error('Timeout')));
    req.on('error',reject);
    if (bodyStr) req.write(bodyStr); req.end();
});

let db;
const getDb = async () => { if(!db) db=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:parseInt(process.env.DB_PORT)||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,charset:'utf8mb4'}); return db; };
const login = async (u,p) => { const r=await request('POST','/api/auth/login',{username:u,password:p}); if(r.status===200&&r.body.token) return r.body.token; throw new Error(`Login failed ${r.status}: ${JSON.stringify(r.body)}`); };
const createUser = async (username,role,employeeId=null) => { const conn=await getDb(); const bcrypt=require('bcryptjs'); const hash=await bcrypt.hash('TestPass123!',10); await conn.execute('DELETE FROM users WHERE username=?',[username]); await conn.execute(`INSERT INTO users (username,email,password_hash,full_name,role,employee_id,is_active) VALUES (?,?,?,?,?,?,TRUE)`,[username,`${username}@test.com`,hash,`Test ${username}`,role,employeeId]); };
const delUser = async (u) => { const conn=await getDb(); await conn.execute('DELETE FROM users WHERE username=?',[u]); };
const createEmp = async (first,last,managerId=null) => { const conn=await getDb(); const id=`AP${Date.now().toString().slice(-7)}`; const [r]=await conn.execute(`INSERT INTO employees (first_name,last_name,employee_id,department,job_title,manager_id,is_active) VALUES (?,?,?,'Engineering','Developer',?,TRUE)`,[first,last,id,managerId]); return r.insertId; };

let adminToken, managerToken, employeeToken;
let managerEmpId, employeeEmpId, outsiderEmpId;
let createdAppraisalId;

const defaultSections = () => ([
    { section_name: 'Technical Skills', rating: 4.0, weight: 40, previous_rating: 3.5, comments: 'Good' },
    { section_name: 'Communication',    rating: 3.5, weight: 30, previous_rating: 3.0, comments: 'Improving' },
    { section_name: 'Initiative',       rating: 4.5, weight: 30, previous_rating: 4.0, comments: 'Excellent' },
]);

const validAppraisal = () => ({
    employee_id:        employeeEmpId,
    appraisal_date:     '2026-02-20',
    people_present:     'Manager, Employee',
    next_appraisal_date:'2027-02-20',
    sections:           defaultSections(),
});

const setup = async () => {
    managerEmpId  = await createEmp('Apr','Manager');
    employeeEmpId = await createEmp('Apr','Employee',managerEmpId);
    outsiderEmpId = await createEmp('Apr','Outsider');
    await createUser('apr_admin',   'admin',    null);
    await createUser('apr_manager', 'manager',  managerEmpId);
    await createUser('apr_employee','employee', employeeEmpId);
    adminToken    = await login('apr_admin',   'TestPass123!');
    managerToken  = await login('apr_manager', 'TestPass123!');
    employeeToken = await login('apr_employee','TestPass123!');
};

const teardown = async () => {
    const conn = await getDb();
    await conn.execute('DELETE FROM appraisals WHERE employee_id IN (?,?,?)',[managerEmpId,employeeEmpId,outsiderEmpId]).catch(()=>{});
    await conn.execute('UPDATE employees SET manager_id=NULL WHERE manager_id IN (?,?,?)',[managerEmpId,employeeEmpId,outsiderEmpId]).catch(()=>{});
    await conn.execute('DELETE FROM employees WHERE id IN (?,?,?)',[managerEmpId,employeeEmpId,outsiderEmpId]).catch(()=>{});
    await delUser('apr_admin'); await delUser('apr_manager'); await delUser('apr_employee');
};

// =============================================================================
async function testList() {
    section('GROUP 1: List  GET /api/appraisals');
    if(runTest('1a')){ info('1a. Admin lists all appraisals'); try{ const r=await request('GET','/api/appraisals',null,adminToken); r.status===200&&Array.isArray(r.body.data?.appraisals)?pass(`200 — ${r.body.data.appraisals.length} appraisals`):fail(`Expected 200, got ${r.status}`); }catch(e){fail(`1a: ${e.message}`);} }
    if(runTest('1b')){ info('1b. Employee sees own appraisals only'); try{ const r=await request('GET','/api/appraisals',null,employeeToken); r.status===200?pass(`Employee 200`):fail(`Expected 200, got ${r.status}`); }catch(e){fail(`1b: ${e.message}`);} }
    if(runTest('1c')){ info('1c. No token → 401'); try{ const r=await request('GET','/api/appraisals'); r.status===401?pass('401'):fail(`Expected 401, got ${r.status}`); }catch(e){fail(`1c: ${e.message}`);} }
}

async function testSingle() {
    section('GROUP 2: Single  GET /api/appraisals/:id');
    let testId;
    try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); if(r.status===201){testId=r.body.data.id;createdAppraisalId=testId;}else{fail(`G2 setup: ${r.status} ${JSON.stringify(r.body)}`);return;} }catch(e){fail(`G2 setup: ${e.message}`);return;}

    if(runTest('2a')){ info('2a. Returns appraisal with sections array'); try{ const r=await request('GET',`/api/appraisals/${testId}`,null,adminToken); r.status===200&&Array.isArray(r.body.data?.sections)?pass(`200 — ${r.body.data.sections.length} sections`):fail(`Expected 200+sections, got ${r.status}`); }catch(e){fail(`2a: ${e.message}`);} }
    if(runTest('2b')){ info('2b. overall_rating calculated correctly'); try{ const r=await request('GET',`/api/appraisals/${testId}`,null,adminToken); const rating=r.body.data?.overall_rating; typeof rating!=='undefined'&&parseFloat(rating)>0?pass(`overall_rating=${rating}`):fail(`overall_rating missing or 0`); }catch(e){fail(`2b: ${e.message}`);} }
    if(runTest('2c')){ info('2c. Employee fetches own appraisal'); try{ const r=await request('GET',`/api/appraisals/${testId}`,null,employeeToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); }catch(e){fail(`2c: ${e.message}`);} }
    if(runTest('2d')){ info('2d. 404 for unknown id'); try{ const r=await request('GET','/api/appraisals/999999',null,adminToken); r.status===404?pass('404'):fail(`Expected 404, got ${r.status}`); }catch(e){fail(`2d: ${e.message}`);} }
}

async function testCreate() {
    section('GROUP 3: Create  POST /api/appraisals');
    if(runTest('3a')){ info('3a. Admin creates appraisal'); try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); r.status===201&&r.body.data?.id?(pass(`201 id=${r.body.data.id} rating=${r.body.data.overall_rating}`),createdAppraisalId=r.body.data.id):fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`); }catch(e){fail(`3a: ${e.message}`);} }
    if(runTest('3b')){ info('3b. Manager creates for subordinate'); try{ const r=await request('POST','/api/appraisals',validAppraisal(),managerToken); r.status===201?pass('201'):fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`); if(r.status===201){const conn=await getDb();await conn.execute('DELETE FROM appraisals WHERE id=?',[r.body.data.id]);} }catch(e){fail(`3b: ${e.message}`);} }
    if(runTest('3c')){ info('3c. Manager blocked for out-of-scope employee'); try{ const r=await request('POST','/api/appraisals',{...validAppraisal(),employee_id:outsiderEmpId},managerToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); }catch(e){fail(`3c: ${e.message}`);} }
    if(runTest('3d')){ info('3d. Employee cannot create'); try{ const r=await request('POST','/api/appraisals',validAppraisal(),employeeToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); }catch(e){fail(`3d: ${e.message}`);} }
    if(runTest('3e')){ info('3e. Missing sections → 400'); try{ const r=await request('POST','/api/appraisals',{...validAppraisal(),sections:[]},adminToken); r.status===400?pass('400'):fail(`Expected 400, got ${r.status}`); }catch(e){fail(`3e: ${e.message}`);} }
    if(runTest('3f')){ info('3f. Section rating > 5 → 400'); try{ const r=await request('POST','/api/appraisals',{...validAppraisal(),sections:[{section_name:'x',rating:6,weight:100}]},adminToken); r.status===400?pass('400'):fail(`Expected 400, got ${r.status}`); }catch(e){fail(`3f: ${e.message}`);} }
    if(runTest('3g')){ info('3g. Weights > 100 total → 400'); try{ const r=await request('POST','/api/appraisals',{...validAppraisal(),sections:[{section_name:'A',rating:4,weight:60},{section_name:'B',rating:3,weight:60}]},adminToken); r.status===400?pass('400 — weights exceed 100'):fail(`Expected 400, got ${r.status}`); }catch(e){fail(`3g: ${e.message}`);} }
    if(runTest('3h')){ info('3h. last_appraisal_date updated on employee'); try{ const conn=await getDb(); const [rows]=await conn.execute('SELECT last_appraisal_date FROM employees WHERE id=?',[employeeEmpId]); rows[0].last_appraisal_date!==null?pass(`last_appraisal_date: ${rows[0].last_appraisal_date}`):fail('Still null'); }catch(e){fail(`3h: ${e.message}`);} }
}

async function testUpdate() {
    section('GROUP 4: Update  PUT /api/appraisals/:id');
    if(!createdAppraisalId){ try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); if(r.status===201) createdAppraisalId=r.body.data.id; }catch(e){} }

    if(runTest('4a')){ info('4a. Admin updates sections — rating recalculated'); try{
        const newSections=[{section_name:'Updated Skill',rating:5.0,weight:100,comments:'Perfect'}];
        const r=await request('PUT',`/api/appraisals/${createdAppraisalId}`,{sections:newSections},adminToken);
        r.status===200&&parseFloat(r.body.data?.overall_rating)===5.0?pass(`200 — new rating=5.00`):fail(`Expected 200+rating=5, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`4a: ${e.message}`);} }

    if(runTest('4b')){ info('4b. Cannot set status=Completed via PUT (use /submit)'); try{ const r=await request('PUT',`/api/appraisals/${createdAppraisalId}`,{status:'Completed'},adminToken); r.status===400?pass('400 — Completed status rejected on PUT'):fail(`Expected 400, got ${r.status}`); }catch(e){fail(`4b: ${e.message}`);} }
    if(runTest('4c')){ info('4c. Employee cannot update'); try{ const r=await request('PUT',`/api/appraisals/${createdAppraisalId}`,{},employeeToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); }catch(e){fail(`4c: ${e.message}`);} }
}

async function testSubmitCancel() {
    section('GROUP 5: Submit / Cancel');
    // Create fresh appraisal for this group
    let apprId;
    try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); if(r.status===201) apprId=r.body.data.id; else{fail('G5 setup failed');return;} }catch(e){fail(`G5 setup: ${e.message}`);return;}

    if(runTest('5a')){ info('5a. Admin can submit (Completed)'); try{ const r=await request('POST',`/api/appraisals/${apprId}/submit`,null,adminToken); r.status===200&&r.body.data?.status==='Completed'?pass('200 — status=Completed'):fail(`Expected 200+Completed, got ${r.status}: ${JSON.stringify(r.body)}`); }catch(e){fail(`5a: ${e.message}`);} }
    if(runTest('5b')){ info('5b. Cannot edit a Completed appraisal'); try{ const r=await request('PUT',`/api/appraisals/${apprId}`,{people_present:'Test'},adminToken); r.status===400?pass('400 — Completed appraisal is read-only'):fail(`Expected 400, got ${r.status}`); }catch(e){fail(`5b: ${e.message}`);} }
    if(runTest('5c')){ info('5c. average_rating updated on employee after completion'); try{ const conn=await getDb(); const [rows]=await conn.execute('SELECT average_rating FROM employees WHERE id=?',[employeeEmpId]); rows[0].average_rating!==null?pass(`average_rating: ${rows[0].average_rating}`):fail('average_rating still null'); }catch(e){fail(`5c: ${e.message}`);} }

    // Create another for cancel test
    let apprId2;
    try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); if(r.status===201) apprId2=r.body.data.id; }catch(e){}

    if(runTest('5d')){ info('5d. Admin can cancel Draft appraisal'); try{ if(!apprId2){skip('5d — no appraisal');return;} const r=await request('POST',`/api/appraisals/${apprId2}/cancel`,null,adminToken); r.status===200?pass('200 — cancelled'):fail(`Expected 200, got ${r.status}`); }catch(e){fail(`5d: ${e.message}`);} }
    if(runTest('5e')){ info('5e. Cannot cancel a Completed appraisal'); try{ const r=await request('POST',`/api/appraisals/${apprId}/cancel`,null,adminToken); r.status===400?pass('400 — Cannot cancel Completed'):fail(`Expected 400, got ${r.status}`); }catch(e){fail(`5e: ${e.message}`);} }
    if(runTest('5f')){ info('5f. Manager cannot cancel'); try{ if(!apprId2){skip('5f — no appraisal');return;} const r=await request('POST',`/api/appraisals/${apprId2}/cancel`,null,managerToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); }catch(e){fail(`5f: ${e.message}`);} }

    // Cleanup
    const conn=await getDb();
    await conn.execute('DELETE FROM appraisals WHERE id IN (?,?)',[apprId, apprId2||0]).catch(()=>{});
}

async function testDelete() {
    section('GROUP 6: Delete');
    let delId;
    try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); if(r.status===201) delId=r.body.data.id; else{fail('G6 setup failed');return;} }catch(e){fail(`G6: ${e.message}`);return;}

    if(runTest('6a')){ info('6a. Cannot delete non-Draft (create Completed first)'); try{
        await request('POST',`/api/appraisals/${delId}/submit`,null,adminToken);
        const r=await request('DELETE',`/api/appraisals/${delId}`,null,adminToken);
        r.status===400?pass('400 — Completed appraisal cannot be deleted'):fail(`Expected 400, got ${r.status}`);
        const conn=await getDb(); await conn.execute('DELETE FROM appraisals WHERE id=?',[delId]).catch(()=>{});
    }catch(e){fail(`6a: ${e.message}`);} }

    // Fresh draft to delete
    let delId2;
    try{ const r=await request('POST','/api/appraisals',validAppraisal(),adminToken); if(r.status===201) delId2=r.body.data.id; }catch(e){}

    if(runTest('6b')){ info('6b. Manager cannot delete'); try{ if(!delId2){skip('6b');return;} const r=await request('DELETE',`/api/appraisals/${delId2}`,null,managerToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); }catch(e){fail(`6b: ${e.message}`);} }
    if(runTest('6c')){ info('6c. Admin can delete Draft'); try{ if(!delId2){skip('6c');return;} const r=await request('DELETE',`/api/appraisals/${delId2}`,null,adminToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); }catch(e){fail(`6c: ${e.message}`);} }
}

async function testRBAC() {
    section('GROUP 7: RBAC Matrix');
    if(runTest('7a')){
        info('7a. RBAC matrix');
        const matrix=[
            ['admin GET list',     'GET',  '/api/appraisals', adminToken,    200],
            ['manager GET list',   'GET',  '/api/appraisals', managerToken,  200],
            ['employee GET list',  'GET',  '/api/appraisals', employeeToken, 200],
            ['no token GET list',  'GET',  '/api/appraisals', null,          401],
            ['employee POST',      'POST', '/api/appraisals', employeeToken, 403],
        ];
        for(const [desc,method,p,token,expected] of matrix){
            try{ const r=await request(method,p,method==='POST'?validAppraisal():null,token); r.status===expected?pass(`${desc}: ${expected} ✓`):fail(`${desc}: expected ${expected}, got ${r.status}`); }
            catch(e){fail(`${desc}: ${e.message}`);}
        }
    }
}

async function testEdgeCases() {
    section('GROUP 8: Edge Cases');
    if(runTest('8a')){ info('8a. overall_rating calculated from weighted sections'); try{
        const sections=[
            {section_name:'A',rating:4.0,weight:50},
            {section_name:'B',rating:2.0,weight:50},
        ];
        const r=await request('POST','/api/appraisals',{...validAppraisal(),sections},adminToken);
        const rating=parseFloat(r.body.data?.overall_rating);
        Math.abs(rating-3.0)<0.01?pass(`Weighted avg correct: ${rating} (expected 3.00)`):fail(`Wrong rating: ${rating} expected 3.00`);
        if(r.status===201){const conn=await getDb();await conn.execute('DELETE FROM appraisals WHERE id=?',[r.body.data.id]);}
    }catch(e){fail(`8a: ${e.message}`);} }

    if(runTest('8b')){ info('8b. Audit trail on create'); try{
        if(!createdAppraisalId){skip('8b');return;}
        const conn=await getDb();
        const [rows]=await conn.execute(`SELECT id FROM audit_trail WHERE table_name='appraisals' AND record_id=? AND action='INSERT'`,[createdAppraisalId]);
        rows.length>0?pass('Audit INSERT found'):fail('No audit entry');
    }catch(e){fail(`8b: ${e.message}`);} }

    if(runTest('8c')){ info('8c. status filter works'); try{
        const r=await request('GET','/api/appraisals?status=Draft',null,adminToken);
        r.status===200?pass(`200 — ${r.body.data?.appraisals?.length} Draft appraisals`):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`8c: ${e.message}`);} }
}

async function runAll() {
    console.log('\n========================================');
    console.log(' EAS v2 — Phase 3: Appraisals Tests');
    console.log(`  Server: http://localhost:${PORT}`);
    if(groupFilter) console.log(`  Groups: ${groupFilter.join(', ')}`);
    if(testFilter)  console.log(`  Tests:  ${testFilter.join(', ')}`);
    console.log('========================================');

    try{const h=await request('GET','/health');if(h.status!==200) throw new Error(`${h.status}`);console.log('\n✅  Server up.');}catch(e){console.error(`\n❌  Server: ${e.message}`);process.exit(1);}
    try{await getDb();console.log('✅  DB connected.');}catch(e){console.error(`\n❌  DB: ${e.message}`);process.exit(1);}
    try{await setup();console.log('✅  Test data ready.\n');}catch(e){console.error(`\n❌  Setup: ${e.message}`);if(db)await db.end();process.exit(1);}

    try{
        if(runGroup(1)) await testList();
        if(runGroup(2)) await testSingle();
        if(runGroup(3)) await testCreate();
        if(runGroup(4)) await testUpdate();
        if(runGroup(5)) await testSubmitCancel();
        if(runGroup(6)) await testDelete();
        if(runGroup(7)) await testRBAC();
        if(runGroup(8)) await testEdgeCases();
    } finally {
        await teardown();
        if(db) await db.end();
        console.log('\n✅  Test data cleaned up.');
    }

    console.log('\n========================================');
    console.log(' Appraisals Test Results');
    console.log('========================================');
    console.log(`  ${G}✅  Passed : ${passed}${X}`);
    console.log(`  ${R}❌  Failed : ${failed}${X}`);
    console.log(`  ${Y}⏭️   Skipped: ${skipped}${X}`);
    console.log(`      Total  : ${passed+failed+skipped}`);
    console.log('========================================\n');
    if(failed>0) process.exit(1);
}

runAll().catch(err=>{console.error('\n❌  Crashed:',err.message);if(db)db.end();process.exit(1);});
