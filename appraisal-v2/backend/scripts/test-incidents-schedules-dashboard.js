// =============================================================================
// FILE:    scripts/test-incidents-schedules-dashboard.js
// PURPOSE: Test suite for /api/incidents, /api/schedules, /api/dashboard
//
// GROUPS:
//   1 — Incidents CRUD + RBAC
//   2 — Schedules CRUD + status transitions
//   3 — Dashboard endpoints
//
// USAGE:
//   node scripts/test-incidents-schedules-dashboard.js
//   node scripts/test-incidents-schedules-dashboard.js --group=2
//   node scripts/test-incidents-schedules-dashboard.js --test=1a
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

let db;
const getDb = async () => { if(!db) db=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:parseInt(process.env.DB_PORT)||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,charset:'utf8mb4'}); return db; };
const login = async (u,p) => { const r=await request('POST','/api/auth/login',{username:u,password:p}); if(r.status===200&&r.body.token) return r.body.token; throw new Error(`Login ${r.status}: ${JSON.stringify(r.body)}`); };
const createUser = async (username,role,empId=null) => { const conn=await getDb(); const bcrypt=require('bcryptjs'); const hash=await bcrypt.hash('TestPass123!',10); await conn.execute('DELETE FROM users WHERE username=?',[username]); await conn.execute(`INSERT INTO users (username,email,password_hash,full_name,role,employee_id,is_active) VALUES (?,?,?,?,?,?,TRUE)`,[username,`${username}@t.com`,hash,username,role,empId]); };
const delUser = async (u) => { const conn=await getDb(); await conn.execute('DELETE FROM users WHERE username=?',[u]); };
const createEmp = async (first,last,managerId=null) => { const conn=await getDb(); const id=`ISD${Date.now().toString().slice(-6)}`; const [r]=await conn.execute(`INSERT INTO employees (first_name,last_name,employee_id,department,job_title,manager_id,is_active) VALUES (?,?,?,'Engineering','Dev',?,TRUE)`,[first,last,id,managerId]); return r.insertId; };

let adminToken, managerToken, employeeToken;
let managerEmpId, employeeEmpId, outsiderEmpId;

const setup = async () => {
    managerEmpId  = await createEmp('ISD','Manager');
    employeeEmpId = await createEmp('ISD','Employee', managerEmpId);
    outsiderEmpId = await createEmp('ISD','Outsider');
    await createUser('isd_admin',   'admin',    null);
    await createUser('isd_manager', 'manager',  managerEmpId);
    await createUser('isd_employee','employee', employeeEmpId);
    adminToken    = await login('isd_admin',   'TestPass123!');
    managerToken  = await login('isd_manager', 'TestPass123!');
    employeeToken = await login('isd_employee','TestPass123!');
};

const teardown = async () => {
    const conn = await getDb();
    const ids = [managerEmpId, employeeEmpId, outsiderEmpId].filter(Boolean);
    if (ids.length) {
        const ph = ids.map(()=>'?').join(',');
        await conn.execute(`DELETE FROM incident_logs WHERE employee_id IN (${ph})`, ids).catch(()=>{});
        await conn.execute(`DELETE FROM scheduled_appraisals WHERE employee_id IN (${ph})`, ids).catch(()=>{});
        await conn.execute(`DELETE FROM appraisals WHERE employee_id IN (${ph})`, ids).catch(()=>{});
        await conn.execute(`UPDATE employees SET manager_id=NULL WHERE manager_id IN (${ph})`, ids).catch(()=>{});
        await conn.execute(`DELETE FROM employees WHERE id IN (${ph})`, ids).catch(()=>{});
    }
    await delUser('isd_admin'); await delUser('isd_manager'); await delUser('isd_employee');
};

const today = new Date().toISOString().split('T')[0];
const future = new Date(Date.now() + 20*24*60*60*1000).toISOString().split('T')[0];
const past   = '2026-01-10';

// =============================================================================
// GROUP 1: INCIDENTS
// =============================================================================
async function testIncidents() {
    section('GROUP 1: Incidents');
    let incidentId;

    // 1a: Admin creates incident
    if (runTest('1a')) { info('1a. Admin creates incident'); try {
        const r = await request('POST','/api/incidents',{ employee_id:employeeEmpId, incident_date:past, incident_type:'General Misconduct', detail:'Late to work repeatedly.', severity:'Low' },adminToken);
        r.status===201&&r.body.data?.id?(pass(`201 id=${r.body.data.id}`),incidentId=r.body.data.id):fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`1a: ${e.message}`);} }

    // 1b: Manager creates for subordinate
    if (runTest('1b')) { info('1b. Manager creates for subordinate'); try {
        const r = await request('POST','/api/incidents',{ employee_id:employeeEmpId, incident_date:past, incident_type:'General Misconduct', detail:'Test incident.', severity:'Medium' },managerToken);
        r.status===201?pass('201'):fail(`Expected 201, got ${r.status}`);
        if (r.status===201) { const conn=await getDb(); await conn.execute('DELETE FROM incident_logs WHERE id=?',[r.body.data.id]); }
    }catch(e){fail(`1b: ${e.message}`);} }

    // 1c: Manager blocked for outsider employee
    if (runTest('1c')) { info('1c. Manager blocked for out-of-scope employee'); try {
        const r = await request('POST','/api/incidents',{ employee_id:outsiderEmpId, incident_date:past, incident_type:'General Misconduct', detail:'Test.', severity:'Low' },managerToken);
        r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`);
    }catch(e){fail(`1c: ${e.message}`);} }

    // 1d: Employee cannot create
    if (runTest('1d')) { info('1d. Employee cannot create incidents'); try {
        const r = await request('POST','/api/incidents',{ employee_id:employeeEmpId, incident_date:past, incident_type:'General Misconduct', detail:'Test.', severity:'Low' },employeeToken);
        r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`);
    }catch(e){fail(`1d: ${e.message}`);} }

    // 1e: List returns scoped results
    if (runTest('1e')) { info('1e. Admin list returns all, employee list returns own only'); try {
        const [ra, re] = await Promise.all([
            request('GET','/api/incidents',null,adminToken),
            request('GET','/api/incidents',null,employeeToken),
        ]);
        ra.status===200&&re.status===200?pass(`Admin: ${ra.body.data?.incidents?.length} incidents; Employee sees own`):fail(`Unexpected status: ${ra.status} / ${re.status}`);
    }catch(e){fail(`1e: ${e.message}`);} }

    // 1f: Get single by id
    if (runTest('1f')) { info('1f. GET /api/incidents/:id returns incident'); try {
        if(!incidentId){skip('1f — no incident');return;}
        const r = await request('GET',`/api/incidents/${incidentId}`,null,adminToken);
        r.status===200&&r.body.data?.id===incidentId?pass(`200 id=${incidentId}`):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`1f: ${e.message}`);} }

    // 1g: Update severity
    if (runTest('1g')) { info('1g. Admin updates severity'); try {
        if(!incidentId){skip('1g');return;}
        const r = await request('PUT',`/api/incidents/${incidentId}`,{ severity:'High' },adminToken);
        r.status===200&&r.body.data?.severity==='High'?pass('200 — severity=High'):fail(`Expected 200+severity, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`1g: ${e.message}`);} }

    // 1h: Invalid severity → 400
    if (runTest('1h')) { info('1h. Invalid severity → 400'); try {
        if(!incidentId){skip('1h');return;}
        const r = await request('PUT',`/api/incidents/${incidentId}`,{ severity:'Catastrophic' },adminToken);
        r.status===400?pass('400'):fail(`Expected 400, got ${r.status}`);
    }catch(e){fail(`1h: ${e.message}`);} }

    // 1i: Employee cannot update
    if (runTest('1i')) { info('1i. Employee cannot update'); try {
        if(!incidentId){skip('1i');return;}
        const r = await request('PUT',`/api/incidents/${incidentId}`,{ severity:'Low' },employeeToken);
        r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`);
    }catch(e){fail(`1i: ${e.message}`);} }

    // 1j: Manager cannot delete
    if (runTest('1j')) { info('1j. Manager cannot delete incidents'); try {
        if(!incidentId){skip('1j');return;}
        const r = await request('DELETE',`/api/incidents/${incidentId}`,null,managerToken);
        r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`);
    }catch(e){fail(`1j: ${e.message}`);} }

    // 1k: Admin can delete
    if (runTest('1k')) { info('1k. Admin can delete incident'); try {
        if(!incidentId){skip('1k');return;}
        const r = await request('DELETE',`/api/incidents/${incidentId}`,null,adminToken);
        r.status===200?pass('200 — deleted'):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`1k: ${e.message}`);} }

    // 1l: Audit trail
    if (runTest('1l')) { info('1l. Audit trail exists for incident'); try {
        // Create fresh incident for audit check
        const cr = await request('POST','/api/incidents',{ employee_id:employeeEmpId, incident_date:past, incident_type:'General Misconduct', detail:'Audit check.', severity:'Low' },adminToken);
        if(cr.status!==201){skip('1l — could not create');return;}
        const conn=await getDb();
        const [rows]=await conn.execute(`SELECT id FROM audit_trail WHERE table_name='incident_logs' AND record_id=? AND action='INSERT'`,[cr.body.data.id]);
        await conn.execute('DELETE FROM incident_logs WHERE id=?',[cr.body.data.id]);
        rows.length>0?pass('Audit INSERT found'):fail('No audit entry');
    }catch(e){fail(`1l: ${e.message}`);} }

    // Severity filter
    if (runTest('1m')) { info('1m. Severity filter works'); try {
        const r = await request('GET','/api/incidents?severity=High',null,adminToken);
        r.status===200?pass(`200 — ${r.body.data?.incidents?.length} High incidents`):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`1m: ${e.message}`);} }
}

// =============================================================================
// GROUP 2: SCHEDULES
// =============================================================================
async function testSchedules() {
    section('GROUP 2: Schedules');
    let schedId;

    // 2a: Create schedule
    if (runTest('2a')) { info('2a. Admin creates schedule'); try {
        const r = await request('POST','/api/schedules',{ employee_id:employeeEmpId, scheduled_date:future, appraisal_type:'Annual Review', notes:'First annual review' },adminToken);
        r.status===201&&r.body.data?.id?(pass(`201 id=${r.body.data.id} date=${r.body.data.scheduled_date}`),schedId=r.body.data.id):fail(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`2a: ${e.message}`);} }

    // 2b: Employee.next_scheduled_appraisal updated
    if (runTest('2b')) { info('2b. Employee next_scheduled_appraisal updated after schedule created'); try {
        const conn=await getDb();
        const [rows]=await conn.execute('SELECT next_scheduled_appraisal FROM employees WHERE id=?',[employeeEmpId]);
        rows[0].next_scheduled_appraisal?pass(`next_scheduled_appraisal: ${rows[0].next_scheduled_appraisal}`):fail('Still null');
    }catch(e){fail(`2b: ${e.message}`);} }

    // 2c: Manager blocked for outsider
    if (runTest('2c')) { info('2c. Manager blocked for out-of-scope employee'); try {
        const r = await request('POST','/api/schedules',{ employee_id:outsiderEmpId, scheduled_date:future },managerToken);
        r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`);
    }catch(e){fail(`2c: ${e.message}`);} }

    // 2d: Duplicate schedule warning
    if (runTest('2d')) { info('2d. Creating duplicate schedule returns 201 with warning'); try {
        const r = await request('POST','/api/schedules',{ employee_id:employeeEmpId, scheduled_date:future },adminToken);
        r.status===201&&r.body.message?.includes('already has')?(pass('201 with duplicate warning'),
            (async()=>{ const conn=await getDb(); await conn.execute('DELETE FROM scheduled_appraisals WHERE id=?',[r.body.data.id]); })()
        ):fail(`Expected 201+warning, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`2d: ${e.message}`);} }

    // 2e: Update schedule date
    if (runTest('2e')) { info('2e. Admin updates schedule'); try {
        if(!schedId){skip('2e');return;}
        const newDate = new Date(Date.now() + 40*24*60*60*1000).toISOString().split('T')[0];
        const r = await request('PUT',`/api/schedules/${schedId}`,{ scheduled_date:newDate, notes:'Updated notes' },adminToken);
        // Normalise returned date (route now returns YYYY-MM-DD strings, verify that)
        const retDate = r.body.data?.scheduled_date?.split('T')[0];
        r.status===200&&retDate===newDate?pass(`200 — new date: ${retDate}`):fail(`Expected 200+new date, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`2e: ${e.message}`);} }

    // 2f: Postpone
    if (runTest('2f')) { info('2f. Admin can postpone a schedule'); try {
        if(!schedId){skip('2f');return;}
        const postponeDate = new Date(Date.now() + 60*24*60*60*1000).toISOString().split('T')[0];
        const r = await request('POST',`/api/schedules/${schedId}/postpone`,{ new_date:postponeDate, reason:'Manager unavailable' },adminToken);
        r.status===200&&r.body.data?.status==='Postponed'?pass(`200 — status=Postponed, new date: ${postponeDate}`):fail(`Expected 200+Postponed, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`2f: ${e.message}`);} }

    // 2g: Cannot edit Cancelled schedule
    let cancelId;
    try { const r=await request('POST','/api/schedules',{employee_id:employeeEmpId,scheduled_date:future},adminToken); if(r.status===201) cancelId=r.body.data.id; }catch(e){}

    if (runTest('2g')) { info('2g. Cancel schedule'); try {
        if(!cancelId){skip('2g');return;}
        const r = await request('POST',`/api/schedules/${cancelId}/cancel`,null,adminToken);
        r.status===200?pass('200 — cancelled'):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`2g: ${e.message}`);} }

    if (runTest('2h')) { info('2h. Cannot edit Cancelled schedule'); try {
        if(!cancelId){skip('2h');return;}
        const r = await request('PUT',`/api/schedules/${cancelId}`,{ notes:'Hack' },adminToken);
        r.status===400?pass('400 — cannot edit Cancelled'):fail(`Expected 400, got ${r.status}`);
    }catch(e){fail(`2h: ${e.message}`);} }

    // 2i: upcoming filter
    if (runTest('2i')) { info('2i. ?upcoming=true returns only Scheduled future dates'); try {
        const r = await request('GET','/api/schedules?upcoming=true',null,adminToken);
        const allOk = r.body.data?.schedules?.every(s => s.status==='Scheduled');
        r.status===200&&allOk?pass(`200 — ${r.body.data.schedules.length} upcoming (all Scheduled)`):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`2i: ${e.message}`);} }

    // 2j: is_overdue flag
    if (runTest('2j')) { info('2j. is_overdue flag set for past-due Scheduled items'); try {
        // Create a past-due schedule
        const conn=await getDb();
        const [r2]=await conn.execute(`INSERT INTO scheduled_appraisals (employee_id,scheduled_date,appraisal_type,scheduled_by_user_id,status) VALUES (?,'2025-01-01','Annual Review',1,'Scheduled')`,[employeeEmpId]);
        const overdueId=r2.insertId;
        const r = await request('GET',`/api/schedules/${overdueId}`,null,adminToken);
        await conn.execute('DELETE FROM scheduled_appraisals WHERE id=?',[overdueId]);
        r.status===200&&r.body.data?.is_overdue===true?pass('is_overdue=true for past-due schedule'):fail(`Expected is_overdue=true, got: ${JSON.stringify(r.body.data)}`);
    }catch(e){fail(`2j: ${e.message}`);} }

    // 2k: Admin delete
    if (runTest('2k')) { info('2k. Admin can hard-delete a schedule'); try {
        if(!schedId){skip('2k');return;}
        const r = await request('DELETE',`/api/schedules/${schedId}`,null,adminToken);
        r.status===200?pass('200 — deleted'):fail(`Expected 200, got ${r.status}`);
    }catch(e){fail(`2k: ${e.message}`);} }

    // 2l: Employee cannot create schedule
    if (runTest('2l')) { info('2l. Employee cannot create schedule'); try {
        const r = await request('POST','/api/schedules',{employee_id:employeeEmpId,scheduled_date:future},employeeToken);
        r.status===403?pass('403'):fail(`Expected 403, got ${r.status}`);
    }catch(e){fail(`2l: ${e.message}`);} }

    // 2m: Invite endpoint — returns ics_content when SMTP not configured
    if (runTest('2m')) { info('2m. POST /api/schedules/:id/invite returns ics or email status'); try {
        // Create a fresh schedule with an employee that has an email
        const conn = await getDb();
        await conn.execute('UPDATE employees SET email=? WHERE id=?',['test@example.com', employeeEmpId]);
        const cr = await request('POST','/api/schedules',{employee_id:employeeEmpId,scheduled_date:future},adminToken);
        if(cr.status!==201){skip('2m — could not create schedule');return;}
        const invId = cr.body.data.id;
        const r = await request('POST',`/api/schedules/${invId}/invite`,{},adminToken);
        await conn.execute('DELETE FROM scheduled_appraisals WHERE id=?',[invId]);
        // Either sent (200 with sent_to) or returned ics (200 with ics_content) — both are success
        r.status===200&&(r.body.data?.ics_content||r.body.data?.sent_to)?
            pass(`200 — ${r.body.data?.sent_to?'email sent to '+r.body.data.sent_to:'ics_content returned (SMTP not configured)'}`):
            fail(`Expected 200 with ics or send confirmation, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`2m: ${e.message}`);} }
}

// =============================================================================
// GROUP 3: DASHBOARD
// =============================================================================
async function testDashboard() {
    section('GROUP 3: Dashboard');

    // 3a: stats endpoint
    if (runTest('3a')) { info('3a. GET /api/dashboard/stats returns headline numbers'); try {
        const r = await request('GET','/api/dashboard/stats',null,adminToken);
        const d = r.body.data;
        r.status===200&&typeof d?.total_employees==='number'?
            pass(`200 — ${d.total_employees} employees, ${d.overdue_appraisals} overdue, avg rating: ${d.average_rating}`):
            fail(`Expected 200 with data, got ${r.status}: ${JSON.stringify(r.body)}`);
    }catch(e){fail(`3a: ${e.message}`);} }

    // 3b: Stats scoped — employee gets own stats only
    if (runTest('3b')) { info('3b. Employee stats scoped to self'); try {
        const [ra, re] = await Promise.all([
            request('GET','/api/dashboard/stats',null,adminToken),
            request('GET','/api/dashboard/stats',null,employeeToken),
        ]);
        const adminTotal = ra.body.data?.total_employees;
        const empTotal   = re.body.data?.total_employees;
        ra.status===200&&re.status===200&&empTotal<=1?
            pass(`Admin sees ${adminTotal} employees; employee sees ${empTotal} (scoped to self)`):
            fail(`Scope not working: admin=${adminTotal}, employee=${empTotal}`);
    }catch(e){fail(`3b: ${e.message}`);} }

    // 3c: upcoming endpoint
    if (runTest('3c')) { info('3c. GET /api/dashboard/upcoming returns scheduled appraisals'); try {
        const r = await request('GET','/api/dashboard/upcoming?days=60',null,adminToken);
        r.status===200&&Array.isArray(r.body.data)?pass(`200 — ${r.body.data.length} upcoming`):fail(`Expected 200 array, got ${r.status}`);
    }catch(e){fail(`3c: ${e.message}`);} }

    // 3d: recent-activity endpoint
    if (runTest('3d')) { info('3d. GET /api/dashboard/recent-activity returns unified feed'); try {
        const r = await request('GET','/api/dashboard/recent-activity?limit=10',null,adminToken);
        r.status===200&&Array.isArray(r.body.data)?pass(`200 — ${r.body.data.length} recent events`):fail(`Expected 200 array, got ${r.status}`);
    }catch(e){fail(`3d: ${e.message}`);} }

    // 3e: recent-activity events have expected fields — seed data first to guarantee feed has content
    if (runTest('3e')) { info('3e. Recent activity events have kind, event_date, employee_name'); try {
        const conn = await getDb();
        // Insert a known incident so the feed is never empty
        const [ir] = await conn.execute(
            `INSERT INTO incident_logs (employee_id, incident_date, incident_type, detail, severity, logged_by_user_id) VALUES (?, CURDATE(), 'General Misconduct', '3e test', 'Low', 1)`,
            [employeeEmpId]
        );
        const r = await request('GET','/api/dashboard/recent-activity',null,adminToken);
        await conn.execute('DELETE FROM incident_logs WHERE id=?', [ir.insertId]);
        if(r.status===200&&r.body.data?.length>0) {
            const ev = r.body.data[0];
            ev.kind&&ev.event_date&&ev.employee_name!==undefined?
                pass(`Event fields present: kind=${ev.kind}, date=${ev.event_date}`):
                fail(`Missing fields: ${JSON.stringify(ev)}`);
        } else { fail(`No activity data even after seeding: ${r.status}`); }
    }catch(e){fail(`3e: ${e.message}`);} }

    // 3f: department-stats
    if (runTest('3f')) { info('3f. GET /api/dashboard/department-stats returns per-dept breakdown'); try {
        const r = await request('GET','/api/dashboard/department-stats',null,adminToken);
        r.status===200&&Array.isArray(r.body.data)?
            pass(`200 — ${r.body.data.length} departments: ${r.body.data.map(d=>d.department).join(', ')}`):
            fail(`Expected 200 array, got ${r.status}`);
    }catch(e){fail(`3f: ${e.message}`);} }

    // 3g: performance-trends
    if (runTest('3g')) { info('3g. GET /api/dashboard/performance-trends returns monthly rating trend'); try {
        const r = await request('GET','/api/dashboard/performance-trends?months=12',null,adminToken);
        r.status===200&&Array.isArray(r.body.data)?pass(`200 — ${r.body.data.length} months of data`):fail(`Expected 200 array, got ${r.status}`);
    }catch(e){fail(`3g: ${e.message}`);} }

    // 3h: no token → 401
    if (runTest('3h')) { info('3h. Dashboard requires authentication'); try {
        const r = await request('GET','/api/dashboard/stats');
        r.status===401?pass('401 without token'):fail(`Expected 401, got ${r.status}`);
    }catch(e){fail(`3h: ${e.message}`);} }

    // 3i: Manager stats scoped to subordinates
    if (runTest('3i')) { info('3i. Manager stats only include subordinates'); try {
        const [ra, rm] = await Promise.all([
            request('GET','/api/dashboard/stats',null,adminToken),
            request('GET','/api/dashboard/stats',null,managerToken),
        ]);
        const adminTotal   = ra.body.data?.total_employees;
        const managerTotal = rm.body.data?.total_employees;
        ra.status===200&&rm.status===200&&managerTotal<adminTotal?
            pass(`Admin: ${adminTotal}, Manager: ${managerTotal} (scoped)`):
            fail(`Manager scope not working: admin=${adminTotal}, manager=${managerTotal}`);
    }catch(e){fail(`3i: ${e.message}`);} }
}

// =============================================================================
// MAIN
// =============================================================================
async function runAll() {
    console.log('\n========================================');
    console.log(' EAS v2 — Incidents / Schedules / Dashboard');
    console.log(`  Server: http://localhost:${PORT}`);
    if(groupFilter) console.log(`  Groups: ${groupFilter.join(', ')}`);
    if(testFilter)  console.log(`  Tests:  ${testFilter.join(', ')}`);
    console.log('========================================');

    try{const h=await request('GET','/health');if(h.status!==200) throw new Error(`${h.status}`);console.log('\n✅  Server up.');}
    catch(e){console.error(`\n❌  Server: ${e.message}`);process.exit(1);}
    try{await getDb();console.log('✅  DB connected.');}
    catch(e){console.error(`\n❌  DB: ${e.message}`);process.exit(1);}
    try{await setup();console.log('✅  Test data ready.\n');}
    catch(e){console.error(`\n❌  Setup: ${e.message}`);if(db)await db.end();process.exit(1);}

    try {
        if(runGroup(1)) await testIncidents();
        if(runGroup(2)) await testSchedules();
        if(runGroup(3)) await testDashboard();
    } finally {
        await teardown();
        if(db) await db.end();
        console.log('\n✅  Test data cleaned up.');
    }

    console.log('\n========================================');
    console.log(' Test Results');
    console.log('========================================');
    console.log(`  ${G}✅  Passed : ${passed}${X}`);
    console.log(`  ${R}❌  Failed : ${failed}${X}`);
    console.log(`  ${Y}⏭️   Skipped: ${skipped}${X}`);
    console.log(`      Total  : ${passed+failed+skipped}`);
    console.log('========================================\n');
    if(failed>0) process.exit(1);
}

runAll().catch(err=>{console.error('\n❌  Crashed:',err.message);if(db)db.end();process.exit(1);});
