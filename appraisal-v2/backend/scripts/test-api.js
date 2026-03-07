// =============================================================================
// FILE:    scripts/test-api.js
// PURPOSE: Tests the Phase 2 API endpoints to confirm the server is working.
//          Run this AFTER the server is started in a separate terminal.
// USAGE:   node scripts/test-api.js
// REQUIRES: Server must be running — npm start or npm run dev
// =============================================================================

const http = require('http');

const PORT      = parseInt(process.env.PORT) || 5001;
const BASE_URL  = `http://localhost:${PORT}`;
let   allPassed = true;

// ---- Helpers ----------------------------------------------------------------

const PASS = '✅ ';
const FAIL = '❌ ';

function pass(msg) { console.log(`  ${PASS} ${msg}`); }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); allPassed = false; }
function section(title) { console.log(`\n--- ${title} ${'─'.repeat(Math.max(0, 40 - title.length))}`); }

// Simple HTTP request helper — no external dependencies needed
const request = (method, path, body = null, token = null) => {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port:     PORT,
      path,
      method,
      headers: {
        // Only set Content-Type and Content-Length when there is a body.
        // Setting Content-Length with no body causes "Invalid count value" error.
        ...(bodyStr ? {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    // For POST/PUT/PATCH with no body, send an empty string to avoid
    // Node http module's "Invalid count value" error on certain versions
    if (bodyStr) {
      req.write(bodyStr);
    } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
      req.write('');
    }

    req.end();
  });
};

// ---- Tests ------------------------------------------------------------------

async function runTests() {
  console.log('\n========================================');
  console.log(' EAS v2 — Phase 2 API Tests');
  console.log(`  Server: ${BASE_URL}`);
  console.log('========================================');

  let adminToken = null;

  // ---- Test 1: Health check ------------------------------------------------
  section('1. Health Check');
  try {
    const res = await request('GET', '/health');
    if (res.status === 200 && res.body.success === true) {
      pass(`GET /health → 200 OK (${res.body.message})`);
    } else {
      fail(`GET /health → ${res.status} (expected 200)`);
    }
  } catch (e) {
    fail(`GET /health → FAILED (is the server running? ${e.message})`);
    console.log('\n  ⚠️  Cannot continue — server is not responding.');
    console.log('  Start the server first: npm start');
    process.exit(1);
  }

  // ---- Test 2: API info endpoint -------------------------------------------
  section('2. API Info');
  try {
    const res = await request('GET', '/api');
    if (res.status === 200) {
      pass(`GET /api → 200 OK`);
    } else {
      fail(`GET /api → ${res.status}`);
    }
  } catch (e) {
    fail(`GET /api → ${e.message}`);
  }

  // ---- Test 3: Login with valid credentials --------------------------------
  section('3. Login — Valid Credentials');
  try {
    const res = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: 'Admin123!',
    });

    if (res.status === 429) {
      fail(`Rate limit hit — too many login attempts. Wait 15 minutes and try again.`);
      console.log('  ℹ️   This is the rate limiter working correctly.');
      console.log('  ℹ️   It resets 15 minutes after the first attempt.');
      return; // stop the tests — no point continuing without a token
    } else if (res.status === 200 && res.body.success && res.body.token) {
      adminToken = res.body.token;
      pass(`POST /api/auth/login → 200 OK`);
      pass(`Token received (${adminToken.substring(0, 30)}...)`);
      pass(`User: ${res.body.user.username} (${res.body.user.role})`);
    } else {
      fail(`POST /api/auth/login → ${res.status}: ${res.body.message}`);
    }
  } catch (e) {
    fail(`POST /api/auth/login → ${e.message}`);
  }

  // ---- Test 4: Login with wrong password -----------------------------------
  section('4. Login — Wrong Password (should fail)');
  try {
    const res = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: 'wrongpassword',
    });

    if (res.status === 401) {
      pass(`POST /api/auth/login (wrong password) → 401 Unauthorized ✓`);
    } else {
      fail(`Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail(`Login wrong password test → ${e.message}`);
  }

  // ---- Test 5: Login with missing fields -----------------------------------
  section('5. Login — Missing Fields (should fail)');
  try {
    const res = await request('POST', '/api/auth/login', { username: 'admin' });
    if (res.status === 400) {
      pass(`POST /api/auth/login (no password) → 400 Bad Request ✓`);
    } else {
      fail(`Expected 400, got ${res.status}`);
    }
  } catch (e) {
    fail(`Login missing fields test → ${e.message}`);
  }

  // ---- Test 6: GET /auth/me with valid token --------------------------------
  section('6. GET /auth/me — Valid Token');
  if (adminToken) {
    try {
      const res = await request('GET', '/api/auth/me', null, adminToken);
      if (res.status === 200 && res.body.success) {
        pass(`GET /api/auth/me → 200 OK`);
        pass(`User data: ${res.body.data.username} (${res.body.data.role})`);
      } else {
        fail(`GET /api/auth/me → ${res.status}: ${res.body.message}`);
      }
    } catch (e) {
      fail(`GET /api/auth/me → ${e.message}`);
    }
  } else {
    fail('Skipped — no token available (login test failed)');
  }

  // ---- Test 7: GET /auth/me without token ----------------------------------
  section('7. GET /auth/me — No Token (should fail)');
  try {
    const res = await request('GET', '/api/auth/me');
    if (res.status === 401) {
      pass(`GET /api/auth/me (no token) → 401 Unauthorized ✓`);
    } else {
      fail(`Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail(`GET /api/auth/me no token → ${e.message}`);
  }

  // ---- Test 8: Protected route without token --------------------------------
  section('8. Protected Route — No Token (should fail)');
  try {
    const res = await request('GET', '/api/employees');
    if (res.status === 401 || res.status === 404) {
      // 401 = auth rejected, 404 = route not yet registered (Phase 3)
      // Both are acceptable at this stage
      pass(`GET /api/employees → ${res.status} (expected — route not yet in Phase 3)`);
    } else {
      fail(`Expected 401 or 404, got ${res.status}`);
    }
  } catch (e) {
    fail(`Protected route test → ${e.message}`);
  }

  // ---- Test 9: Logout -------------------------------------------------------
  section('9. Logout');
  if (adminToken) {
    try {
      const res = await request('POST', '/api/auth/logout', {}, adminToken);
      if (res.status === 200 && res.body.success) {
        pass(`POST /api/auth/logout → 200 OK`);
      } else {
        fail(`POST /api/auth/logout → ${res.status}`);
      }
    } catch (e) {
      fail(`POST /api/auth/logout → ${e.message}`);
    }
  } else {
    fail('Skipped — no token available');
  }

  // ---- Test 10: 404 for unknown route --------------------------------------
  section('10. Unknown Route (should return 404)');
  try {
    const res = await request('GET', '/api/doesnotexist');
    if (res.status === 404) {
      pass(`GET /api/doesnotexist → 404 Not Found ✓`);
    } else {
      fail(`Expected 404, got ${res.status}`);
    }
  } catch (e) {
    fail(`404 test → ${e.message}`);
  }

  // ---- Summary -------------------------------------------------------------
  console.log('\n========================================');
  if (allPassed) {
    console.log(' ✅  ALL TESTS PASSED — Phase 2 Complete!');
    console.log('');
    console.log(' The backend foundation is solid.');
    console.log(' Ready to start Phase 3: API Routes.');
  } else {
    console.log(' ❌  SOME TESTS FAILED — see details above.');
    console.log('');
    console.log(' Fix failures before moving to Phase 3.');
  }
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('\n❌  Test runner crashed:', err.message);
  process.exit(1);
});
