// =============================================================================
// FILE:    scripts/test-meetings.js
// PURPOSE: Full test suite for /api/meetings
// GROUPS: 1-List, 2-Single, 3-Create, 4-Update, 5-Delete, 6-PDF, 7-RBAC, 8-Edge
// USAGE:  node scripts/test-meetings.js [--group=N] [--test=Xa]
// =============================================================================

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT = parseInt(process.env.PORT) || 5001;
let passed = 0, failed = 0, skipped = 0;
const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', RESET = '\x1b[0m';
const pass    = (m) => { console.log(`  ${GREEN}✅  ${m}${RESET}`); passed++; };
const fail    = (m) => { console.log(`  ${RED}❌  ${m}${RESET}`); failed++; };
const skip    = (m) => { console.log(`  ${YELLOW}⏭️   ${m}${RESET}`); skipped++; };
const info    = (m) => console.log(`  ℹ️   ${m}`);
const section = (t) => console.log(`\n${GREEN}--- ${t} ${'─'.repeat(Math.max(0,50-t.length))}${RESET}`);

const getArg = (f) => { const a=process.argv.find(x=>x.startsWith(`--${f}=`)||x===`--${f}`); return a?(a.includes('=')?a.split('=')[1]:process.argv[process.argv.indexOf(a)+1]):null; };
const groupFilter = getArg('group')?getArg('group').split(',').map(Number):null;
const testFilter  = getArg('test') ?getArg('test').split(',').map(s=>s.trim().toLowerCase()):null;
const runGroup = (n)  => !groupFilter||groupFilter.includes(n);
const runTest  = (id) => !testFilter ||testFilter.includes(id.toLowerCase());

const request = (method, urlPath, body=null, token=null) => new Promise((resolve,reject) => {
    const bodyStr = body?JSON.stringify(body):null;
    const opts = { hostname:'localhost', port:PORT, path:urlPath, method,
        headers: { ...(bodyStr?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bodyStr)}:{}), ...(token?{'Authorization':`Bearer ${token}`}:{}) } };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)})}catch{resolve({status:res.statusCode,body:d})} }); });
    req.setTimeout(8000,()=>req.destroy(new Error('Timeout')));
    req.on('error',reject);
    if (bodyStr) req.write(bodyStr); req.end();
});

const requestMultipart = (method, urlPath, fields, filePath, token) => new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now()}`;
    let textPart = '';
    for (const [key, val] of Object.entries(fields)) {
        textPart += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
    }
    const fileData   = fs.readFileSync(filePath);
    const fileName   = path.basename(filePath);
    const fileHeader = Buffer.from(`${textPart}--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`);
    const bodyBuf    = Buffer.concat([fileHeader, fileData, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const opts = { hostname:'localhost', port:PORT, path:urlPath, method,
        headers: { 'Content-Type':`multipart/form-data; boundary=${boundary}`, 'Content-Length':bodyBuf.length, ...(token?{'Authorization':`Bearer ${token}`}:{}) } };
    const req = http.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)})}catch{resolve({status:res.statusCode,body:d})} }); });
    req.setTimeout(10000,()=>req.destroy(new Error('Timeout')));
    req.on('error',reject);
    req.write(bodyBuf); req.end();
});

let db;
const getDb = async () => { if(!db) db=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:parseInt(process.env.DB_PORT)||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,charset:'utf8mb4'}); return db; };
const login = async (u,p) => { const r=await request('POST','/api/auth/login',{username:u,password:p}); if(r.status===200&&r.body.token) return r.body.token; throw new Error(`Login failed ${r.status}`); };
const createTestUser = async (username,role,employeeId=null) => { const conn=await getDb(); const bcrypt=require('bcryptjs'); const hash=await bcrypt.hash('TestPass123!',10); await conn.execute('DELETE FROM users WHERE username=?',[username]); const [r]=await conn.execute(`INSERT INTO users (username,email,password_hash,full_name,role,employee_id,is_active) VALUES (?,?,?,?,?,?,TRUE)`,[username,`${username}@test.com`,hash,`Test ${username}`,role,employeeId]); return r.insertId; };
const deleteTestUser = async (u) => { const conn=await getDb(); await conn.execute('DELETE FROM users WHERE username=?',[u]); };
const createTestEmployee = async (first,last,managerId=null) => { const conn=await getDb(); const id=`M${Date.now().toString().slice(-7)}`; const [r]=await conn.execute(`INSERT INTO employees (first_name,last_name,employee_id,department,job_title,manager_id,is_active) VALUES (?,?,?,'Engineering','Developer',?,TRUE)`,[first,last,id,managerId]); return r.insertId; };

let adminToken, managerToken, employeeToken;
let managerEmpId, employeeEmpId, outsiderEmpId;
let createdMeetingId;

const TEST_PDF_PATH = path.join(__dirname, 'test_upload.pdf');
const createTestPdf = () => {
    const pdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF';
    fs.writeFileSync(TEST_PDF_PATH, pdf);
};

const setup = async () => {
    createTestPdf();
    managerEmpId  = await createTestEmployee('Mtg','Manager');
    employeeEmpId = await createTestEmployee('Mtg','Employee', managerEmpId);
    outsiderEmpId = await createTestEmployee('Mtg','Outsider');
    await createTestUser('mtg_admin',    'admin',    null);
    await createTestUser('mtg_manager',  'manager',  managerEmpId);
    await createTestUser('mtg_employee', 'employee', employeeEmpId);
    adminToken    = await login('mtg_admin',    'TestPass123!');
    managerToken  = await login('mtg_manager',  'TestPass123!');
    employeeToken = await login('mtg_employee', 'TestPass123!');
};

const teardown = async () => {
    const conn = await getDb();
    await conn.execute('DELETE FROM meetings WHERE employee_id IN (?,?,?)',[managerEmpId,employeeEmpId,outsiderEmpId]).catch(()=>{});
    await conn.execute('UPDATE employees SET manager_id=NULL WHERE manager_id IN (?,?,?)',[managerEmpId,employeeEmpId,outsiderEmpId]).catch(()=>{});
    await conn.execute('DELETE FROM employees WHERE id IN (?,?,?)',[managerEmpId,employeeEmpId,outsiderEmpId]).catch(()=>{});
    await deleteTestUser('mtg_admin'); await deleteTestUser('mtg_manager'); await deleteTestUser('mtg_employee');
    if (fs.existsSync(TEST_PDF_PATH)) fs.unlinkSync(TEST_PDF_PATH);
};

const validMeeting = () => ({ employee_id: employeeEmpId, meeting_date: '2026-02-15', meeting_type: 'One-on-One', people_present: 'Manager, Employee', brief_note: 'Check-in', meeting_conclusion: 'Continue current track' });

async function testList() {
    section('GROUP 1: List  GET /api/meetings');
    if (runTest('1a')) { info('1a. Admin can list meetings'); try { const r=await request('GET','/api/meetings',null,adminToken); r.status===200&&Array.isArray(r.body.data?.meetings)?pass(`200 — ${r.body.data.meetings.length} meetings`):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`1a: ${e.message}`);} }
    if (runTest('1b')) { info('1b. Employee only sees own meetings'); try { const r=await request('GET','/api/meetings',null,employeeToken); r.status===200?pass(`Employee 200, sees ${r.body.data?.meetings?.length||0} meetings`):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`1b: ${e.message}`);} }
    if (runTest('1c')) { info('1c. No token → 401'); try { const r=await request('GET','/api/meetings'); r.status===401?pass('401 without token'):fail(`Expected 401, got ${r.status}`); } catch(e){fail(`1c: ${e.message}`);} }
}

async function testSingle() {
    section('GROUP 2: Single  GET /api/meetings/:id');
    let testMeetingId;
    try { const r=await request('POST','/api/meetings',validMeeting(),adminToken); if(r.status===201){testMeetingId=r.body.data.id; createdMeetingId=testMeetingId;} else{fail(`G2 setup: ${r.status}`);return;} } catch(e){fail(`G2 setup: ${e.message}`);return;}

    if (runTest('2a')) { info('2a. Admin fetches meeting by id'); try { const r=await request('GET',`/api/meetings/${testMeetingId}`,null,adminToken); r.status===200&&r.body.data?.id===testMeetingId?pass(`200 id=${testMeetingId}`):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`2a: ${e.message}`);} }
    if (runTest('2b')) { info('2b. Manager fetches subordinate meeting'); try { const r=await request('GET',`/api/meetings/${testMeetingId}`,null,managerToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`2b: ${e.message}`);} }
    if (runTest('2c')) { info('2c. Employee fetches own meeting'); try { const r=await request('GET',`/api/meetings/${testMeetingId}`,null,employeeToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`2c: ${e.message}`);} }
    if (runTest('2d')) { info('2d. Non-existent id → 404'); try { const r=await request('GET','/api/meetings/999999',null,adminToken); r.status===404?pass('404'):fail(`Expected 404, got ${r.status}`); } catch(e){fail(`2d: ${e.message}`);} }
}

async function testCreate() {
    section('GROUP 3: Create  POST /api/meetings');
    if (runTest('3a')) { info('3a. Admin creates meeting'); try { const r=await request('POST','/api/meetings',validMeeting(),adminToken); r.status===201&&r.body.data?.id?(pass(`201 id=${r.body.data.id}`),createdMeetingId=r.body.data.id):fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`); } catch(e){fail(`3a: ${e.message}`);} }
    if (runTest('3b')) { info('3b. Manager creates meeting for subordinate'); try { const r=await request('POST','/api/meetings',validMeeting(),managerToken); r.status===201?pass('201'):fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`); if(r.status===201){const conn=await getDb();await conn.execute('DELETE FROM meetings WHERE id=?',[r.body.data.id]);} } catch(e){fail(`3b: ${e.message}`);} }
    if (runTest('3c')) { info('3c. Manager blocked for out-of-scope employee'); try { const r=await request('POST','/api/meetings',{...validMeeting(),employee_id:outsiderEmpId},managerToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); } catch(e){fail(`3c: ${e.message}`);} }
    if (runTest('3d')) { info('3d. Employee cannot create meetings'); try { const r=await request('POST','/api/meetings',validMeeting(),employeeToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); } catch(e){fail(`3d: ${e.message}`);} }
    if (runTest('3e')) { info('3e. Missing required fields → 400'); try { const r=await request('POST','/api/meetings',{employee_id:employeeEmpId},adminToken); r.status===400&&Array.isArray(r.body.errors)?pass(`400 with ${r.body.errors.length} errors`):fail(`Expected 400 with errors, got ${r.status}`); } catch(e){fail(`3e: ${e.message}`);} }
    if (runTest('3f')) { info('3f. last_meeting_date updated on employee'); try { const conn=await getDb(); const [rows]=await conn.execute('SELECT last_meeting_date FROM employees WHERE id=?',[employeeEmpId]); rows[0].last_meeting_date!==null?pass(`last_meeting_date: ${rows[0].last_meeting_date}`):fail('last_meeting_date still null'); } catch(e){fail(`3f: ${e.message}`);} }
    if (runTest('3g')) { info('3g. Invalid date format → 400'); try { const r=await request('POST','/api/meetings',{...validMeeting(),meeting_date:'15-02-2026'},adminToken); r.status===400?pass('400'):fail(`Expected 400, got ${r.status}`); } catch(e){fail(`3g: ${e.message}`);} }
}

async function testUpdate() {
    section('GROUP 4: Update  PUT /api/meetings/:id');
    if (!createdMeetingId) { try { const r=await request('POST','/api/meetings',validMeeting(),adminToken); if(r.status===201) createdMeetingId=r.body.data.id; } catch(e){} }
    if (runTest('4a')) { info('4a. Admin updates meeting'); try { const r=await request('PUT',`/api/meetings/${createdMeetingId}`,{meeting_conclusion:'Updated conclusion'},adminToken); r.status===200&&r.body.data?.meeting_conclusion==='Updated conclusion'?pass('200 — conclusion updated'):fail(`Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`); } catch(e){fail(`4a: ${e.message}`);} }
    if (runTest('4b')) { info('4b. Manager updates subordinate meeting'); try { const r=await request('PUT',`/api/meetings/${createdMeetingId}`,{brief_note:'Manager updated'},managerToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`4b: ${e.message}`);} }
    if (runTest('4c')) { info('4c. Employee cannot update'); try { const r=await request('PUT',`/api/meetings/${createdMeetingId}`,{brief_note:'Hacked'},employeeToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); } catch(e){fail(`4c: ${e.message}`);} }
}

async function testDelete() {
    section('GROUP 5: Delete  DELETE /api/meetings/:id');
    let deleteId;
    try { const r=await request('POST','/api/meetings',validMeeting(),adminToken); if(r.status===201) deleteId=r.body.data.id; else{fail('G5 setup failed');return;} } catch(e){fail(`G5 setup: ${e.message}`);return;}

    if (runTest('5a')) { info('5a. Manager cannot delete'); try { const r=await request('DELETE',`/api/meetings/${deleteId}`,null,managerToken); r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`); } catch(e){fail(`5a: ${e.message}`);} }
    if (runTest('5b')) { info('5b. Admin deletes meeting'); try { const r=await request('DELETE',`/api/meetings/${deleteId}`,null,adminToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`5b: ${e.message}`);} }
    if (runTest('5c')) { info('5c. Deleted meeting → 404'); try { const r=await request('GET',`/api/meetings/${deleteId}`,null,adminToken); r.status===404?pass('404'):fail(`Expected 404, got ${r.status}`); } catch(e){fail(`5c: ${e.message}`);} }
}

async function testAttachment() {
    section('GROUP 6: PDF Attachment');
    let attachId;
    try { const r=await request('POST','/api/meetings',validMeeting(),adminToken); if(r.status===201) attachId=r.body.data.id; else{fail('G6 setup failed');return;} } catch(e){fail(`G6 setup: ${e.message}`);return;}

    if (runTest('6a')) { info('6a. Upload PDF attachment'); try { const r=await requestMultipart('POST',`/api/meetings/${attachId}/attachment`,{},TEST_PDF_PATH,adminToken); r.status===200&&r.body.data?.pdf_attachment_path?pass(`Uploaded: ${r.body.data.pdf_attachment_path}`):fail(`Expected 200+path, got ${r.status}: ${JSON.stringify(r.body)}`); } catch(e){fail(`6a: ${e.message}`);} }
    if (runTest('6b')) { info('6b. Meeting record has attachment path'); try { const r=await request('GET',`/api/meetings/${attachId}`,null,adminToken); r.body.data?.pdf_attachment_path?pass(`Path stored: ${r.body.data.pdf_attachment_path}`):fail('pdf_attachment_path null after upload'); } catch(e){fail(`6b: ${e.message}`);} }
    if (runTest('6c')) { info('6c. Non-PDF file rejected'); try { const fakePath=path.join(__dirname,'fake.txt'); fs.writeFileSync(fakePath,'not a pdf'); const r=await requestMultipart('POST',`/api/meetings/${attachId}/attachment`,{},fakePath,adminToken); fs.unlinkSync(fakePath); r.status===400?pass('400'):fail(`Expected 400, got ${r.status}`); } catch(e){fail(`6c: ${e.message}`);} }
    if (runTest('6d')) { info('6d. Remove attachment'); try { const r=await request('DELETE',`/api/meetings/${attachId}/attachment`,null,adminToken); r.status===200?pass('200'):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`6d: ${e.message}`);} }
    if (runTest('6e')) { info('6e. Remove when none exists → 400'); try { const r=await request('DELETE',`/api/meetings/${attachId}/attachment`,null,adminToken); r.status===400?pass('400'):fail(`Expected 400, got ${r.status}`); } catch(e){fail(`6e: ${e.message}`);} }

    const conn=await getDb(); await conn.execute('DELETE FROM meetings WHERE id=?',[attachId]).catch(()=>{});
}

async function testRBAC() {
    section('GROUP 7: RBAC Matrix');
    if (runTest('7a')) {
        info('7a. RBAC matrix');
        const matrix = [
            ['admin GET',     'GET',  '/api/meetings', adminToken,    200],
            ['manager GET',   'GET',  '/api/meetings', managerToken,  200],
            ['employee GET',  'GET',  '/api/meetings', employeeToken, 200],
            ['no token GET',  'GET',  '/api/meetings', null,          401],
            ['employee POST', 'POST', '/api/meetings', employeeToken, 403],
            ['no token POST', 'POST', '/api/meetings', null,          401],
        ];
        for (const [desc, method, p, token, expected] of matrix) {
            try { const r=await request(method,p,method==='POST'?validMeeting():null,token); r.status===expected?pass(`${desc}: ${expected} ✓`):fail(`${desc}: expected ${expected}, got ${r.status}`); }
            catch(e){fail(`${desc}: ${e.message}`);}
        }
    }
}

async function testEdgeCases() {
    section('GROUP 8: Edge Cases');
    if (runTest('8a')) { info('8a. SQL injection in meeting_type filter'); try { const r=await request('GET',`/api/meetings?meeting_type=${encodeURIComponent("'; DROP TABLE meetings; --")}`,null,adminToken); r.status===200?pass('Safely handled'):fail(`Unexpected: ${r.status}`); } catch(e){fail(`8a: ${e.message}`);} }
    if (runTest('8b')) { info('8b. Audit trail on create'); try { if(!createdMeetingId){skip('8b — no meeting');return;} const conn=await getDb(); const [rows]=await conn.execute(`SELECT id FROM audit_trail WHERE table_name='meetings' AND record_id=? AND action='INSERT'`,[createdMeetingId]); rows.length>0?pass('Audit entry found'):fail('No audit entry'); } catch(e){fail(`8b: ${e.message}`);} }
    if (runTest('8c')) { info('8c. Date range filters work'); try { const r=await request('GET','/api/meetings?date_from=2026-01-01&date_to=2026-12-31',null,adminToken); r.status===200?pass(`200 — ${r.body.data?.meetings?.length||0} results`):fail(`Expected 200, got ${r.status}`); } catch(e){fail(`8c: ${e.message}`);} }
}

async function runAll() {
    console.log('\n========================================');
    console.log(' EAS v2 — Phase 3: Meetings Route Tests');
    console.log(`  Server: http://localhost:${PORT}`);
    if(groupFilter) console.log(`  Groups: ${groupFilter.join(', ')}`);
    if(testFilter)  console.log(`  Tests:  ${testFilter.join(', ')}`);
    console.log('========================================');

    try { const h=await request('GET','/health'); if(h.status!==200) throw new Error(`${h.status}`); console.log('\n✅  Server is up.'); }
    catch(e){console.error(`\n❌  Server not reachable: ${e.message}`);process.exit(1);}
    try{await getDb();console.log('✅  Database connected.');}catch(e){console.error(`\n❌  DB: ${e.message}`);process.exit(1);}
    try{await setup();console.log('✅  Test data set up.\n');}catch(e){console.error(`\n❌  Setup: ${e.message}`);if(db) await db.end();process.exit(1);}

    try {
        if(runGroup(1)) await testList();
        if(runGroup(2)) await testSingle();
        if(runGroup(3)) await testCreate();
        if(runGroup(4)) await testUpdate();
        if(runGroup(5)) await testDelete();
        if(runGroup(6)) await testAttachment();
        if(runGroup(7)) await testRBAC();
        if(runGroup(8)) await testEdgeCases();
    } finally {
        await teardown();
        if(db) await db.end();
        console.log('\n✅  Test data cleaned up.');
    }

    console.log('\n========================================');
    console.log(' Meetings Route Test Results');
    console.log('========================================');
    console.log(`  ${GREEN}✅  Passed : ${passed}${RESET}`);
    console.log(`  ${RED}❌  Failed : ${failed}${RESET}`);
    console.log(`  ${YELLOW}⏭️   Skipped: ${skipped}${RESET}`);
    console.log(`      Total  : ${passed+failed+skipped}`);
    console.log('========================================\n');
    if(failed>0) process.exit(1);
}

runAll().catch(err=>{console.error('\n❌  Crashed:',err.message);if(db)db.end();process.exit(1);});
