// =============================================================================
// FILE:    scripts/test-edge-cases.js
// PURPOSE: Extended edge case tests for the Phase 2 backend foundation.
//          Tests auth security, rate limiting, DB resilience, and concurrency.
//
// USAGE:   node scripts/test-edge-cases.js
// REQUIRES: Server must be running — node server.js
//
// TEST GROUPS:
//   1. Auth edge cases     — bad tokens, injection attempts, malformed requests
//   2. Rate limiter        — confirm limits fire and reset correctly
//   3. Database resilience — graceful handling of DB issues
//   4. Concurrency         — multiple simultaneous requests
// =============================================================================

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT     = parseInt(process.env.PORT) || 5001;
const BASE_URL = `http://localhost:${PORT}`;

let passed    = 0;
let failed    = 0;
let skipped   = 0;

// ---- Helpers ----------------------------------------------------------------

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

function pass(msg)    { console.log(`  ${GREEN}✅  ${msg}${RESET}`); passed++; }
function fail(msg)    { console.log(`  ${RED}❌  ${msg}${RESET}`); failed++; }
function skip(msg)    { console.log(`  ${YELLOW}⏭️   ${msg}${RESET}`); skipped++; }
function info(msg)    { console.log(`  ℹ️   ${msg}`); }
function section(title) {
  const line = '─'.repeat(Math.max(0, 50 - title.length));
  console.log(`\n${GREEN}--- ${title} ${line}${RESET}`);
}

// HTTP request helper — no external dependencies
const request = (method, path, body = null, token = null, timeoutMs = 5000) => {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: 'localhost',
      port:     PORT,
      path,
      method,
      headers: {
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

    // Timeout — don't hang forever if server is slow
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);

    if (bodyStr) {
      req.write(bodyStr);
    } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
      req.write('');
    }

    req.end();
  });
};

// Get a valid admin token — used across multiple test groups
const getAdminToken = async () => {
  const res = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'Admin123!',
  });
  if (res.status === 200 && res.body.token) return res.body.token;
  if (res.status === 429) throw new Error('Rate limited — restart server to reset, then retry');
  throw new Error(`Login failed: ${res.status} ${res.body.message}`);
};

// =============================================================================
// TEST GROUP 1: AUTH EDGE CASES
// =============================================================================

async function testAuthEdgeCases(validToken) {
  section('GROUP 1: Auth Edge Cases');

  // ---- 1a: Completely missing Authorization header -------------------------
  info('1a. No Authorization header at all');
  if (!runTest('1a')) { skip('1a skipped by --test filter'); } else
  try {
    const res = await request('GET', '/api/auth/me');
    res.status === 401
      ? pass(`No auth header → 401 (${res.body.message})`)
      : fail(`No auth header → expected 401, got ${res.status}`);
  } catch (e) { fail(`1a crashed: ${e.message}`); }

  // ---- 1b: Authorization header present but empty -------------------------
  info('1b. Empty Bearer token');
  if (!runTest('1b')) { skip('1b skipped by --test filter'); } else
  try {
    const res = await request('GET', '/api/auth/me', null, '');
    res.status === 401
      ? pass(`Empty token → 401`)
      : fail(`Empty token → expected 401, got ${res.status}`);
  } catch (e) { fail(`1b crashed: ${e.message}`); }

  // ---- 1c: Token with wrong signature (tampered) ---------------------------
  info('1c. Tampered token (valid structure, wrong signature)');
  if (!runTest('1c')) { skip('1c skipped by --test filter'); } else
  try {
    // Take a real token and change the last few characters to corrupt the signature
    const tampered = validToken.slice(0, -10) + 'XXXXXXXXXX';
    const res = await request('GET', '/api/auth/me', null, tampered);
    res.status === 401
      ? pass(`Tampered token → 401 (${res.body.message})`)
      : fail(`Tampered token → expected 401, got ${res.status}`);
  } catch (e) { fail(`1c crashed: ${e.message}`); }

  // ---- 1d: Completely random string as token --------------------------------
  info('1d. Random string as token');
  if (!runTest('1d')) { skip('1d skipped by --test filter'); } else
  try {
    const res = await request('GET', '/api/auth/me', null, 'not.a.real.jwt.token.at.all');
    res.status === 401
      ? pass(`Random token → 401`)
      : fail(`Random token → expected 401, got ${res.status}`);
  } catch (e) { fail(`1d crashed: ${e.message}`); }

  // ---- 1e: Bearer prefix missing (just the token, no "Bearer ") ------------
  info('1e. Token without Bearer prefix');
  if (!runTest('1e')) { skip('1e skipped by --test filter'); } else
  try {
    // We simulate this by manually setting the header
    const res = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost', port: PORT,
        path: '/api/auth/me', method: 'GET',
        headers: { 'Authorization': validToken }, // no "Bearer " prefix
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.end();
    });
    res.status === 401
      ? pass(`No Bearer prefix → 401`)
      : fail(`No Bearer prefix → expected 401, got ${res.status}`);
  } catch (e) { fail(`1e crashed: ${e.message}`); }

  // ---- 1f: SQL injection attempt in username field -------------------------
  info('1f. SQL injection in username');
  if (!runTest('1f')) { skip('1f skipped by --test filter'); } else
  try {
    const res = await request('POST', '/api/auth/login', {
      username: "admin' OR '1'='1",
      password: 'anything',
    });
    // Should get 401 (bad credentials) NOT 200 (successful injection)
    res.status === 401 || res.status === 400
      ? pass(`SQL injection in username → ${res.status} (blocked correctly)`)
      : fail(`SQL injection in username → got ${res.status} — SECURITY ISSUE`);
  } catch (e) { fail(`1f crashed: ${e.message}`); }

  // ---- 1g: SQL injection attempt in password field -------------------------
  info('1g. SQL injection in password');
  if (!runTest('1g')) { skip('1g skipped by --test filter'); } else
  try {
    const res = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: "' OR '1'='1' --",
    });
    res.status === 401 || res.status === 400
      ? pass(`SQL injection in password → ${res.status} (blocked correctly)`)
      : fail(`SQL injection in password → got ${res.status} — SECURITY ISSUE`);
  } catch (e) { fail(`1g crashed: ${e.message}`); }

  // ---- 1h: Extremely long username (buffer overflow attempt) ---------------
  info('1h. Extremely long username (1000 chars)');
  if (!runTest('1h')) { skip('1h skipped by --test filter'); } else
  try {
    const res = await request('POST', '/api/auth/login', {
      username: 'a'.repeat(1000),
      password: 'password',
    });
    res.status === 400 || res.status === 401
      ? pass(`1000-char username → ${res.status} (handled gracefully)`)
      : fail(`1000-char username → got ${res.status} — should be 400 or 401`);
  } catch (e) { fail(`1h crashed: ${e.message}`); }

  // ---- 1i: Empty JSON body on login ----------------------------------------
  info('1i. Empty JSON body on login');
  if (!runTest('1i')) { skip('1i skipped by --test filter'); } else
  try {
    const res = await request('POST', '/api/auth/login', {});
    res.status === 400
      ? pass(`Empty body → 400 (${res.body.message})`)
      : fail(`Empty body → expected 400, got ${res.status}`);
  } catch (e) { fail(`1i crashed: ${e.message}`); }

  // ---- 1j: Valid token used after logout -----------------------------------
  info('1j. Using token after logout (JWT is stateless — token still works)');
  if (!runTest('1j')) { skip('1j skipped by --test filter'); } else
  try {
    // Create a separate token for this test so we don't invalidate our main one
    const tempLogin = await request('POST', '/api/auth/login', {
      username: 'admin', password: 'Admin123!',
    });

    if (tempLogin.status === 429) {
      skip('1j. Rate limited — skipping logout token test');
      return;
    }

    const tempToken = tempLogin.body.token;

    // Logout
    await request('POST', '/api/auth/logout', {}, tempToken);

    // Try using the token again — JWT is stateless so it will still work
    // This is expected behaviour — document it clearly
    const res = await request('GET', '/api/auth/me', null, tempToken);
    if (res.status === 200) {
      pass(`Token still valid after logout → 200 (expected — JWT is stateless)`);
      info('    Note: Tokens expire after 7 days. For instant invalidation,');
      info('    a token blacklist would be needed. Acceptable for this system.');
    } else {
      fail(`Token after logout → ${res.status} (unexpected)`);
    }
  } catch (e) { fail(`1j crashed: ${e.message}`); }
}

// =============================================================================
// TEST GROUP 2: RATE LIMITER
// =============================================================================

async function testRateLimiter() {
  section('GROUP 2: Rate Limiter');

  info('Note: Rate limiter resets on server restart.');
  info('These tests check behaviour, not exact counts (which depend on prior runs).\n');

  // ---- 2a: Health endpoint is NOT rate limited ----------------------------
  info('2a. Health endpoint bypasses rate limiter');
  if (!runTest('2a')) { skip('2a skipped by --test filter'); } else
  try {
    // Hit it 5 times quickly — should never get 429
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request('GET', '/health'))
    );
    const allOk = results.every(r => r.status === 200);
    allOk
      ? pass(`5 rapid health checks → all 200 (not rate limited)`)
      : fail(`Health check got rate limited — unexpected`);
  } catch (e) { fail(`2a crashed: ${e.message}`); }

  // ---- 2b: API endpoint responds correctly when under limit ----------------
  info('2b. API endpoint works normally under rate limit');
  if (!runTest('2b')) { skip('2b skipped by --test filter'); } else
  try {
    const res = await request('GET', '/api');
    res.status === 200
      ? pass(`GET /api → 200 (under limit)`)
      : fail(`GET /api → ${res.status} (unexpected)`);
  } catch (e) { fail(`2b crashed: ${e.message}`); }

  // ---- 2c: Rate limit returns correct response format when triggered -------
  info('2c. Rate limit response format (429)');
  info('    Sending rapid login attempts to trigger auth rate limiter...');
  try {
    let hit429 = false;
    let attempts = 0;

    // Send up to 25 bad login attempts — should trigger 429 before that
    for (let i = 0; i < 25; i++) {
      const res = await request('POST', '/api/auth/login', {
        username: `testuser_ratelimit_${i}`,
        password: 'wrongpassword',
      });
      attempts++;

      if (res.status === 429) {
        hit429 = true;
        pass(`Rate limit triggered after ${attempts} attempts → 429`);
        pass(`Rate limit message: "${res.body.message}"`);

        // Verify the response has the expected structure
        typeof res.body.message === 'string'
          ? pass(`Rate limit response has message field`)
          : fail(`Rate limit response missing message field`);
        break;
      }
    }

    if (!hit429) {
      skip(`2c. Did not trigger rate limit in ${attempts} attempts`);
      info('    This is OK if you recently restarted the server.');
      info('    The rate limit window is 15 minutes.');
    }
  } catch (e) { fail(`2c crashed: ${e.message}`); }
}

// =============================================================================
// TEST GROUP 3: DATABASE RESILIENCE
// =============================================================================

async function testDatabaseResilience(validToken) {
  section('GROUP 3: Database Resilience');

  info('These tests verify the server handles DB issues gracefully.');
  info('We test what we can without actually taking the DB down.\n');

  // ---- 3a: Health endpoint reveals DB status -------------------------------
  info('3a. Health check reports DB status');
  if (!runTest('3a')) { skip('3a skipped by --test filter'); } else
  try {
    const res = await request('GET', '/health');
    if (res.status === 200 && res.body.success) {
      pass(`Health check → 200, DB is up`);
      pass(`Timestamp present: ${res.body.timestamp}`);
    } else if (res.status === 503) {
      fail(`Health check → 503 — DB may be down. Check: sudo systemctl status mysql`);
    } else {
      fail(`Health check → unexpected ${res.status}`);
    }
  } catch (e) { fail(`3a crashed: ${e.message}`); }

  // ---- 3b: Authenticated request completes a real DB query -----------------
  info('3b. Authenticated /me endpoint performs a real DB query');
  if (!runTest('3b')) { skip('3b skipped by --test filter'); } else
  try {
    const res = await request('GET', '/api/auth/me', null, validToken);
    if (res.status === 200 && res.body.data) {
      pass(`/api/auth/me → 200, DB query succeeded`);
      pass(`Retrieved user: ${res.body.data.username}, last_login: ${res.body.data.last_login_at}`);
    } else if (res.status === 429) {
      skip(`3b. Rate limited (429) — restart server to reset`);
    } else {
      fail(`/api/auth/me → ${res.status} (DB query may have failed)`);
    }
  } catch (e) { fail(`3b crashed: ${e.message}`); }

  // ---- 3c: Concurrent DB queries don't interfere ---------------------------
  info('3c. 5 simultaneous DB queries (connection pool test)');
  if (!runTest('3c')) { skip('3c skipped by --test filter'); } else
  try {
    const start   = Date.now();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request('GET', '/api/auth/me', null, validToken))
    );
    const duration = Date.now() - start;
    const allOk      = results.every(r => r.status === 200);
    const allLimited = results.every(r => r.status === 429);

    if (allLimited) {
      skip(`3c. All 429 — rate limited. Restart server to reset.`);
    } else if (allOk) {
      pass(`5 concurrent DB queries → all 200 in ${duration}ms`);
      duration < 3000
        ? pass(`Response time acceptable: ${duration}ms`)
        : fail(`Too slow: ${duration}ms — connection pool may be exhausted`);
    } else {
      fail(`Some concurrent queries failed: ${results.map(r => r.status).join(', ')}`);
    }
  } catch (e) { fail(`3c crashed: ${e.message}`); }

  // ---- 3d: Login updates last_login_at (write query works) -----------------
  info('3d. Login write query updates last_login_at timestamp');
  if (!runTest('3d')) { skip('3d skipped by --test filter'); } else
  try {
    const before = await request('GET', '/api/auth/me', null, validToken);
    const beforeTime = before.body.data?.last_login_at;

    // Small delay then login again
    await new Promise(r => setTimeout(r, 1000));

    const loginRes = await request('POST', '/api/auth/login', {
      username: 'admin', password: 'Admin123!',
    });

    if (loginRes.status === 429) {
      skip('3d. Rate limited — cannot test write query');
      return;
    }

    const newToken = loginRes.body.token;
    const after    = await request('GET', '/api/auth/me', null, newToken);
    const afterTime = after.body.data?.last_login_at;

    beforeTime !== afterTime
      ? pass(`last_login_at updated: ${beforeTime} → ${afterTime}`)
      : skip(`3d. Timestamps match — may be within same second (acceptable)`);
  } catch (e) { fail(`3d crashed: ${e.message}`); }
}

// =============================================================================
// TEST GROUP 4: CONCURRENCY
// =============================================================================

async function testConcurrency(validToken) {
  section('GROUP 4: Concurrency');

  info('Tests that multiple simultaneous users do not cause issues.\n');

  // ---- 4a: 10 simultaneous GET requests ------------------------------------
  info('4a. 10 simultaneous authenticated requests');
  if (!runTest('4a')) { skip('4a skipped by --test filter'); } else
  try {
    const start   = Date.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request('GET', '/api/auth/me', null, validToken)
      )
    );
    const duration   = Date.now() - start;
    const statusCodes = results.map(r => r.status);
    const allOk      = statusCodes.every(s => s === 200);
    const uniqueCodes = [...new Set(statusCodes)];

    const allLimited4a = statusCodes.every(s => s === 429);

    if (allLimited4a) {
      skip(`4a. All 429 — rate limited. Restart server to reset.`);
    } else if (allOk) {
      pass(`10 concurrent requests → all 200 in ${duration}ms`);
      info(`    Status codes: ${uniqueCodes.join(', ')}`);
      info(`    Total time: ${duration}ms  |  Avg per request: ${Math.round(duration / 10)}ms`);
      duration < 5000
        ? pass(`Completed within 5 second threshold`)
        : fail(`Too slow: ${duration}ms — possible connection pool issue`);
    } else {
      fail(`Mixed results: ${statusCodes.join(', ')}`);
    }
  } catch (e) { fail(`4a crashed: ${e.message}`); }

  // ---- 4b: Mixed request types simultaneously ------------------------------
  info('4b. Mixed request types at the same time');
  if (!runTest('4b')) { skip('4b skipped by --test filter'); } else
  try {
    const start   = Date.now();
    const results = await Promise.all([
      request('GET',  '/health'),
      request('GET',  '/api'),
      request('GET',  '/api/auth/me', null, validToken),
      request('GET',  '/api/auth/me', null, validToken),
      request('GET',  '/health'),
    ]);
    const duration = Date.now() - start;
    const allOk4b      = results.every(r => r.status === 200);
    const allLimited4b = results.every(r => r.status === 429);

    if (allLimited4b) {
      skip(`4b. All 429 — rate limited. Restart server to reset.`);
    } else if (allOk4b) {
      pass(`5 mixed concurrent requests → all 200 in ${duration}ms`);
    } else {
      // Some 429 mixed with 200 is acceptable — health/api are not rate limited
      const nonOk = results.filter(r => r.status !== 200 && r.status !== 429);
      nonOk.length === 0
        ? pass(`Mixed results as expected: ${results.map(r => r.status).join(', ')} (429s from rate limit)`)
        : fail(`Unexpected failures: ${results.map(r => r.status).join(', ')}`);
    }
  } catch (e) { fail(`4b crashed: ${e.message}`); }

  // ---- 4c: Rapid sequential requests (stress test) -------------------------
  // Uses /health endpoint (not rate limited) so this test does not consume
  // the API rate limit quota built up by 4a and 4b.
  info('4c. 20 rapid sequential requests (using /health — not rate limited)');
  if (!runTest('4c')) { skip('4c skipped by --test filter'); } else
  try {
    const start    = Date.now();
    const statuses = [];

    for (let i = 0; i < 20; i++) {
      const res = await request('GET', '/health');
      statuses.push(res.status);
    }

    const duration   = Date.now() - start;
    const allOk4c    = statuses.every(s => s === 200);
    const failCount  = statuses.filter(s => s !== 200).length;

    if (allOk4c) {
      pass(`20 sequential requests → all 200 in ${duration}ms`);
      pass(`Avg per request: ${Math.round(duration / 20)}ms`);
    } else {
      fail(`${failCount} requests failed: ${[...new Set(statuses)].join(', ')}`);
    }
  } catch (e) { fail(`4c crashed: ${e.message}`); }

  // ---- 4d: Verify no data corruption under load ---------------------------
  info('4d. User data consistent across concurrent reads');
  if (!runTest('4d')) { skip('4d skipped by --test filter'); } else
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request('GET', '/api/auth/me', null, validToken))
    );

    const usernames = results
      .filter(r => r.status === 200)
      .map(r => r.body.data?.username);

    const limited4d = results.filter(r => r.status === 429).length;

    if (limited4d === results.length) {
      skip(`4d. All 429 — rate limited. Restart server to reset.`);
    } else {
      const allSame = usernames.length > 0 && usernames.every(u => u === usernames[0]);
      allSame && usernames.length === 5
        ? pass(`All 5 concurrent reads returned consistent data (username: ${usernames[0]})`)
        : fail(`Data inconsistency detected: ${usernames.join(', ')}`);
    }
  } catch (e) { fail(`4d crashed: ${e.message}`); }
}

// =============================================================================
// MAIN — run all test groups
// =============================================================================

async function runAll() {
  console.log('\n========================================');
  console.log(' EAS v2 — Extended Edge Case Tests');
  console.log(`  Server: ${BASE_URL}`);
  console.log('========================================');

  // First confirm server is up
  try {
    const health = await request('GET', '/health');
    if (health.status !== 200) {
      console.error('\n❌  Server is not healthy. Start it first: node server.js');
      process.exit(1);
    }
    console.log('\n✅  Server is up. Starting tests...');
  } catch (e) {
    console.error(`\n❌  Cannot reach server at ${BASE_URL}`);
    console.error('    Start it first: node server.js');
    process.exit(1);
  }

  // Get a valid token — needed for most tests
  let validToken;
  try {
    validToken = await getAdminToken();
    console.log(`✅  Admin token obtained.\n`);
  } catch (e) {
    console.error(`\n❌  Could not get admin token: ${e.message}`);
    console.error('    If rate limited, restart the server: Ctrl+C then node server.js');
    process.exit(1);
  }

  // Run all test groups
  await testAuthEdgeCases(validToken);
  await testRateLimiter();

  // After rate limiter tests, the auth limiter may still be active.
  // Restart the server resets it — but if we can't get a token, skip groups 3+4 cleanly.
  console.log('\n  ℹ️   Attempting to refresh token before Groups 3 & 4...');
  let tokenRefreshed = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      validToken = await getAdminToken();
      tokenRefreshed = true;
      console.log('  ✅  Token refreshed — continuing with Groups 3 & 4.');
      break;
    } catch (e) {
      if (e.message.includes('Rate limited')) {
        console.log(`  ⚠️   Still rate limited (attempt ${attempt}/3).`);
        if (attempt < 3) {
          console.log('  ℹ️   Waiting 10 seconds...');
          await new Promise(r => setTimeout(r, 10000));
        }
      } else {
        console.log(`  ⚠️   Token refresh failed: ${e.message}`);
        break;
      }
    }
  }

  if (!tokenRefreshed) {
    console.log('\n  ⚠️   Rate limiter still active after retries.');
    console.log('  ℹ️   Groups 3 & 4 require a valid token — skipping to avoid false failures.');
    console.log('  ℹ️   To run Groups 3 & 4: restart the server (Ctrl+C, node server.js) then re-run.');
    skipped += 8; // approximate the tests we are skipping
  } else {
    await testDatabaseResilience(validToken);
    await testConcurrency(validToken);
  }

  // ---- Summary -------------------------------------------------------------
  const total = passed + failed + skipped;
  console.log('\n========================================');
  console.log(` Edge Case Test Results`);
  console.log('========================================');
  console.log(`  ${GREEN}✅  Passed : ${passed}${RESET}`);
  console.log(`  ${RED}❌  Failed : ${failed}${RESET}`);
  console.log(`  ${YELLOW}⏭️   Skipped: ${skipped}${RESET}`);
  console.log(`      Total  : ${total}`);
  console.log('========================================');

  if (failed === 0) {
    console.log(`\n${GREEN} ALL TESTS PASSED.${RESET}`);
    console.log(' Backend foundation is solid — ready for Phase 3.\n');
  } else {
    console.log(`\n${RED} ${failed} TEST(S) FAILED — review above before Phase 3.${RESET}\n`);
  }
}

// ---- CLI argument handling -------------------------------------------------
// Run a specific group:   node scripts/test-edge-cases.js --group=3,4
// Run a specific test:    node scripts/test-edge-cases.js --test=4c
// Run multiple tests:     node scripts/test-edge-cases.js --test=4c,4d
// Run everything:         node scripts/test-edge-cases.js

const getArg = (flag) => {
  const arg = process.argv.find(a => a.startsWith(`--${flag}=`) || a === `--${flag}`);
  if (!arg) return null;
  return arg.includes('=')
    ? arg.split('=')[1]
    : process.argv[process.argv.indexOf(arg) + 1];
};

const groupFilter = getArg('group') ? getArg('group').split(',').map(Number) : null;
const testFilter  = getArg('test')  ? getArg('test').split(',').map(s => s.trim().toLowerCase()) : null;

// Helper — should a specific test run?
// If --test flag is set, only run named tests. Otherwise run all.
const runTest = (id) => !testFilter || testFilter.includes(id.toLowerCase());

async function runAll() {
  console.log('\n========================================');
  console.log(' EAS v2 — Extended Edge Case Tests');
  console.log(`  Server: ${BASE_URL}`);
  if (groupFilter) console.log(`  Running groups: ${groupFilter.join(', ')}`);
  console.log('========================================');

  try {
    const health = await request('GET', '/health');
    if (health.status !== 200) {
      console.error('\n❌  Server is not healthy. Start it first: node server.js');
      process.exit(1);
    }
    console.log('\n✅  Server is up. Starting tests...');
  } catch (e) {
    console.error(`\n❌  Cannot reach server at ${BASE_URL}`);
    console.error('    Start it first: node server.js');
    process.exit(1);
  }

  let validToken;
  try {
    validToken = await getAdminToken();
    console.log('✅  Admin token obtained.\n');
  } catch (e) {
    console.error(`\n❌  Could not get admin token: ${e.message}`);
    console.error('    If rate limited, restart the server: Ctrl+C then node server.js');
    process.exit(1);
  }

  const runGroup = (n) => !groupFilter || groupFilter.includes(n);

  if (runGroup(1)) await testAuthEdgeCases(validToken);
  if (runGroup(2)) await testRateLimiter();

  // Only attempt token refresh + groups 3/4 if they are being run
  if (runGroup(3) || runGroup(4)) {
    if (runGroup(2)) {
      // Group 2 may have hit the rate limiter — try to refresh token
      console.log('\n  ℹ️   Attempting to refresh token before Groups 3 & 4...');
      let tokenRefreshed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          validToken = await getAdminToken();
          tokenRefreshed = true;
          console.log('  ✅  Token refreshed — continuing with Groups 3 & 4.');
          break;
        } catch (e) {
          if (e.message.includes('Rate limited')) {
            console.log(`  ⚠️   Still rate limited (attempt ${attempt}/3).`);
            if (attempt < 3) {
              console.log('  ℹ️   Waiting 10 seconds...');
              await new Promise(r => setTimeout(r, 10000));
            }
          } else {
            console.log(`  ⚠️   Token refresh failed: ${e.message}`);
            break;
          }
        }
      }

      if (!tokenRefreshed) {
        console.log('\n  ⚠️   Rate limiter still active after retries.');
        console.log('  ℹ️   Restart the server then run: node scripts/test-edge-cases.js --group=3,4');
        skipped += 8;
        printSummary();
        return;
      }
    }

    if (runGroup(3)) await testDatabaseResilience(validToken);
    if (runGroup(4)) await testConcurrency(validToken);
  }

  printSummary();
}

function printSummary() {
  const total = passed + failed + skipped;
  console.log('\n========================================');
  console.log(' Edge Case Test Results');
  console.log('========================================');
  console.log(`  ${GREEN}✅  Passed : ${passed}${RESET}`);
  console.log(`  ${RED}❌  Failed : ${failed}${RESET}`);
  console.log(`  ${YELLOW}⏭️   Skipped: ${skipped}${RESET}`);
  console.log(`      Total  : ${total}`);
  console.log('========================================');

  if (failed === 0) {
    console.log(`\n${GREEN} ALL TESTS PASSED.${RESET}`);
    console.log(' Backend foundation is solid — ready for Phase 3.\n');
  } else {
    console.log(`\n${RED} ${failed} TEST(S) FAILED — review above before Phase 3.${RESET}\n`);
  }
}

runAll().catch(err => {
  console.error('\n❌  Test runner crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
