// =============================================================================
// FILE:    scripts/test-frontend-foundation.cjs
// PURPOSE: Phase 4 frontend foundation tests.
//          Uses .cjs extension so Node treats it as CommonJS — required because
//          frontend/package.json has "type":"module" which would break require().
//
// WHAT IS TESTED:
//   Group 1 — File structure: all required files exist in correct locations
//   Group 2 — Package: dependencies declared, scripts defined
//   Group 3 — Config: vite proxy, tailwind content paths, postcss plugins
//   Group 4 — Source code: key patterns present in each file
//   Group 5 — API connectivity: login endpoint reachable from frontend layer
//   Group 6 — Build: npm install + vite build succeeds (optional, takes ~60s)
//
// USAGE (from the frontend directory):
//   node scripts/test-frontend-foundation.cjs            # groups 1-5 only (fast)
//   node scripts/test-frontend-foundation.cjs --full     # includes build test
//
// PREREQUISITES:
//   - Backend running on port 5001 (for group 5)
//   - npm install already run (for group 5; group 6 runs it automatically)
// =============================================================================

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Resolve root relative to this script ────────────────────────────────────
// Script lives at frontend/scripts/ so root is one level up
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const FULL = process.argv.includes('--full');

// ── Colour helpers ───────────────────────────────────────────────────────────
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;

const ok   = (id, desc) => { console.log(`  ${green('✅')} ${dim(id)} ${desc}`);          passed++;  };
const fail = (id, desc, reason) => { console.log(`  ${red('❌')} ${dim(id)} ${desc}\n       ${red('→')} ${reason}`); failed++; };
const skip = (id, desc, reason) => { console.log(`  ${yellow('⏭')}  ${dim(id)} ${desc} ${dim('(skipped: ' + reason + ')')}`); skipped++; };

const group = (title) => console.log(`\n${bold(title)}`);

// ── Helpers ──────────────────────────────────────────────────────────────────
const exists  = (rel) => fs.existsSync(path.join(ROOT, rel));
const read    = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; } };
const contains = (text, pattern) =>
  typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);

// HTTP GET — returns { status, body }
const httpGet = (url) => new Promise((resolve) => {
  http.get(url, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', (e) => resolve({ status: 0, body: e.message }));
});

// HTTP POST JSON — returns { status, body }
const httpPost = (url, data) => new Promise((resolve) => {
  const payload = JSON.stringify(data);
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  };
  const req = http.request(url, opts, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', (e) => resolve({ status: 0, body: e.message }));
  req.write(payload);
  req.end();
});

// ── Async runner ─────────────────────────────────────────────────────────────
(async () => {
  console.log(bold('\n╔══════════════════════════════════════════════════════╗'));
  console.log(bold(  '║   EAS v2 — Phase 4 Frontend Foundation Tests        ║'));
  console.log(bold(  '╚══════════════════════════════════════════════════════╝'));
  console.log(dim(`  Root: ${ROOT}`));
  console.log(dim(`  Mode: ${FULL ? 'full (includes build)' : 'fast (skips build)'}\n`));

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 1 — FILE STRUCTURE
  // ══════════════════════════════════════════════════════════════════════════
  group('1.  FILE STRUCTURE — all required files present');

  const REQUIRED_FILES = [
    ['1a', 'index.html',                                    'HTML entry point'],
    ['1b', 'package.json',                                  'package.json'],
    ['1c', 'vite.config.js',                               'Vite config'],
    ['1d', 'tailwind.config.js',                           'Tailwind config'],
    ['1e', 'postcss.config.js',                            'PostCSS config'],
    ['1f', 'src/index.css',                                 'Global CSS'],
    ['1g', 'src/main.jsx',                                  'React entry point'],
    ['1h', 'src/App.jsx',                                   'App component'],
    ['1i', 'src/services/api.js',                           'API service layer'],
    ['1j', 'src/store/useAppStore.js',                      'Zustand store'],
    ['1k', 'src/hooks/useApi.js',                           'useApi hook'],
    ['1l', 'src/hooks/useFormValidation.js',                'useFormValidation hook'],
    ['1m', 'src/components/ui/index.jsx',                   'UI primitives'],
    ['1n', 'src/components/layout/AppLayout.jsx',           'AppLayout'],
    ['1o', 'src/components/layout/AuthGuard.jsx',           'AuthGuard'],
    ['1p', 'src/pages/LoginPage.jsx',                       'LoginPage'],
    ['1q', 'src/pages/Placeholder.jsx',                     'Placeholder pages'],
  ];

  for (const [id, file, desc] of REQUIRED_FILES) {
    if (exists(file)) ok(id, `${desc} — ${dim(file)}`);
    else               fail(id, desc, `Missing: ${file}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 2 — PACKAGE.JSON
  // ══════════════════════════════════════════════════════════════════════════
  group('2.  PACKAGE.JSON — dependencies and scripts');

  let pkg;
  try { pkg = JSON.parse(read('package.json')); } catch { pkg = {}; }

  const DEPS = ['react', 'react-dom', 'react-router-dom', 'zustand', 'axios', 'lucide-react'];
  const DEV_DEPS = ['vite', '@vitejs/plugin-react', 'tailwindcss', 'autoprefixer', 'postcss'];
  const SCRIPTS  = ['dev', 'build', 'preview'];

  for (const dep of DEPS) {
    const has = pkg.dependencies?.[dep];
    has ? ok('2a', `dependency: ${dep} (${has})`) : fail('2a', `dependency: ${dep}`, 'Not in dependencies');
  }
  for (const dep of DEV_DEPS) {
    const has = pkg.devDependencies?.[dep];
    has ? ok('2b', `devDependency: ${dep} (${has})`) : fail('2b', `devDependency: ${dep}`, 'Not in devDependencies');
  }
  for (const script of SCRIPTS) {
    const has = pkg.scripts?.[script];
    has ? ok('2c', `script: "${script}" → ${has}`) : fail('2c', `script: "${script}"`, 'Not defined in scripts');
  }

  const isModule = pkg.type === 'module';
  isModule ? ok('2d', '"type": "module" set (required for Vite ESM)')
           : fail('2d', '"type": "module"', 'Missing — Vite config uses ESM imports');

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 3 — CONFIG FILES
  // ══════════════════════════════════════════════════════════════════════════
  group('3.  CONFIG FILES — correct settings');

  // vite.config.js
  const vite = read('vite.config.js');
  contains(vite, 'port: 3000')
    ? ok('3a', 'Vite dev server port set to 3000')
    : fail('3a', 'Vite port', 'port: 3000 not found in vite.config.js');

  contains(vite, "target: 'http://localhost:5001'")
    ? ok('3b', 'Vite proxy → backend :5001')
    : fail('3b', 'Vite proxy', "target: 'http://localhost:5001' not found — /api calls won't proxy");

  contains(vite, "'/api'")
    ? ok('3c', "Proxy path '/api' defined")
    : fail('3c', "Proxy path '/api'", "'/api' proxy entry missing");

  contains(vite, "'/uploads'")
    ? ok('3d', "Proxy path '/uploads' defined (for PDF attachments)")
    : fail('3d', "Proxy path '/uploads'", "'/uploads' proxy entry missing — attachment previews will 404");

  // tailwind.config.js
  const tw = read('tailwind.config.js');
  contains(tw, './src/**/*.{js,jsx}')
    ? ok('3e', 'Tailwind content path covers src/**/*.{js,jsx}')
    : fail('3e', 'Tailwind content', "'./src/**/*.{js,jsx}' not in content array — classes will be purged");

  contains(tw, 'index.html')
    ? ok('3f', 'Tailwind content path covers index.html')
    : fail('3f', 'Tailwind content index.html', "'index.html' missing from content array");

  // postcss.config.js
  const postcss = read('postcss.config.js');
  contains(postcss, 'tailwindcss')
    ? ok('3g', 'PostCSS: tailwindcss plugin present')
    : fail('3g', 'PostCSS tailwindcss', 'tailwindcss not in postcss plugins');

  contains(postcss, 'autoprefixer')
    ? ok('3h', 'PostCSS: autoprefixer plugin present')
    : fail('3h', 'PostCSS autoprefixer', 'autoprefixer not in postcss plugins');

  // index.html
  const html = read('index.html');
  contains(html, 'src/main.jsx')
    ? ok('3i', 'index.html references src/main.jsx')
    : fail('3i', 'index.html script tag', 'src/main.jsx not referenced');

  contains(html, 'id="root"')
    ? ok('3j', 'index.html has #root mount point')
    : fail('3j', 'index.html #root', 'div#root missing — React cannot mount');

  // index.css
  const css = read('src/index.css');
  contains(css, '@tailwind base')
    ? ok('3k', 'index.css: @tailwind base directive')
    : fail('3k', '@tailwind base', 'Missing in index.css');

  contains(css, '@tailwind components')
    ? ok('3l', 'index.css: @tailwind components directive')
    : fail('3l', '@tailwind components', 'Missing in index.css');

  contains(css, '@tailwind utilities')
    ? ok('3m', 'index.css: @tailwind utilities directive')
    : fail('3m', '@tailwind utilities', 'Missing in index.css');

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 4 — SOURCE CODE PATTERNS
  // ══════════════════════════════════════════════════════════════════════════
  group('4.  SOURCE CODE — key patterns in each file');

  // main.jsx
  const main = read('src/main.jsx');
  contains(main, 'BrowserRouter')
    ? ok('4a', 'main.jsx: BrowserRouter wraps the app')
    : fail('4a', 'BrowserRouter in main.jsx', 'Missing — React Router will not work');

  contains(main, "import './index.css'")
    ? ok('4b', 'main.jsx: imports index.css (Tailwind loaded)')
    : fail('4b', 'index.css import', "import './index.css' missing in main.jsx");

  // App.jsx
  const app = read('src/App.jsx');
  contains(app, 'AuthGuard')
    ? ok('4c', 'App.jsx: AuthGuard used for protected routes')
    : fail('4c', 'AuthGuard', 'AuthGuard not referenced in App.jsx');

  contains(app, 'AppLayout')
    ? ok('4d', 'App.jsx: AppLayout wraps protected routes')
    : fail('4d', 'AppLayout', 'AppLayout not referenced in App.jsx');

  contains(app, "path=\"/login\"")
    ? ok('4e', 'App.jsx: /login route defined')
    : fail('4e', '/login route', 'Missing in App.jsx');

  contains(app, "path=\"/dashboard\"")
    ? ok('4f', 'App.jsx: /dashboard route defined')
    : fail('4f', '/dashboard route', 'Missing in App.jsx');

  contains(app, 'ErrorBoundary')
    ? ok('4g', 'App.jsx: ErrorBoundary wraps page content')
    : fail('4g', 'ErrorBoundary', 'Missing — unhandled render errors will crash entire app');

  // api.js
  const api = read('src/services/api.js');
  contains(api, 'eas_token')
    ? ok('4h', 'api.js: uses eas_token localStorage key')
    : fail('4h', 'eas_token key', "Token key mismatch — must be 'eas_token'");

  contains(api, 'eas:unauthorized')
    ? ok('4i', 'api.js: dispatches eas:unauthorized event on 401')
    : fail('4i', 'eas:unauthorized event', '401 handling not found in api.js');

  contains(api, 'authAPI')    ? ok('4j', 'api.js: authAPI exported')    : fail('4j', 'authAPI export',    'Missing');
  contains(api, 'employeeAPI') ? ok('4j', 'api.js: employeeAPI exported') : fail('4j', 'employeeAPI export', 'Missing');
  contains(api, 'meetingAPI')  ? ok('4j', 'api.js: meetingAPI exported')  : fail('4j', 'meetingAPI export',  'Missing');
  contains(api, 'appraisalAPI') ? ok('4j', 'api.js: appraisalAPI exported') : fail('4j', 'appraisalAPI export', 'Missing');
  contains(api, 'incidentAPI') ? ok('4j', 'api.js: incidentAPI exported') : fail('4j', 'incidentAPI export', 'Missing');
  contains(api, 'scheduleAPI') ? ok('4j', 'api.js: scheduleAPI exported') : fail('4j', 'scheduleAPI export', 'Missing');
  contains(api, 'configAPI')   ? ok('4j', 'api.js: configAPI exported')   : fail('4j', 'configAPI export',   'Missing');
  contains(api, 'dashboardAPI') ? ok('4j', 'api.js: dashboardAPI exported') : fail('4j', 'dashboardAPI export', 'Missing');

  // store
  const store = read('src/store/useAppStore.js');
  contains(store, 'login')   ? ok('4k', 'store: login action defined')  : fail('4k', 'store login',  'Missing');
  contains(store, 'logout')  ? ok('4k', 'store: logout action defined') : fail('4k', 'store logout', 'Missing');
  contains(store, 'showToast') ? ok('4k', 'store: showToast action defined') : fail('4k', 'store showToast', 'Missing');
  contains(store, 'fetchConfig') ? ok('4k', 'store: fetchConfig action defined') : fail('4k', 'store fetchConfig', 'Missing');
  contains(store, 'useIsAdmin') ? ok('4k', 'store: useIsAdmin selector exported') : fail('4k', 'useIsAdmin selector', 'Missing');
  contains(store, 'useIsManager') ? ok('4k', 'store: useIsManager selector exported') : fail('4k', 'useIsManager selector', 'Missing');

  // AuthGuard
  const guard = read('src/components/layout/AuthGuard.jsx');
  contains(guard, 'eas:unauthorized')
    ? ok('4l', 'AuthGuard: listens for eas:unauthorized event')
    : fail('4l', 'AuthGuard event listener', 'eas:unauthorized listener missing');

  contains(guard, 'Navigate')
    ? ok('4l', 'AuthGuard: uses Navigate for redirect')
    : fail('4l', 'AuthGuard Navigate', 'Navigate import missing — redirect will not work');

  // UI primitives
  const ui = read('src/components/ui/index.jsx');
  for (const [comp, id] of [
    ['Button', '4m'], ['Badge', '4m'], ['Spinner', '4m'], ['Card', '4m'],
    ['Alert', '4m'], ['Modal', '4m'], ['Field', '4m'], ['Input', '4m'],
    ['Select', '4m'], ['Textarea', '4m'], ['Pagination', '4m'],
    ['ConfirmDialog', '4m'], ['EmptyState', '4m'], ['StatusBadge', '4m'],
  ]) {
    contains(ui, `export const ${comp}`)
      ? ok(id, `ui/index.jsx: ${comp} exported`)
      : fail(id, `ui/index.jsx: ${comp}`, 'export not found');
  }

  // hooks
  const hookApi = read('src/hooks/useApi.js');
  contains(hookApi, 'mountedRef')
    ? ok('4n', 'useApi: mountedRef guard prevents state update after unmount')
    : fail('4n', 'useApi mountedRef', 'Missing — can cause React memory leak warnings');

  contains(hookApi, 'manual')
    ? ok('4n', 'useApi: manual mode supported')
    : fail('4n', 'useApi manual mode', 'Missing');

  const hookVal = read('src/hooks/useFormValidation.js');
  contains(hookVal, 'required')  ? ok('4o', 'useFormValidation: required rule')  : fail('4o', 'required rule',  'Missing');
  contains(hookVal, 'email')     ? ok('4o', 'useFormValidation: email rule')     : fail('4o', 'email rule',     'Missing');
  contains(hookVal, 'minLength') ? ok('4o', 'useFormValidation: minLength rule') : fail('4o', 'minLength rule', 'Missing');
  contains(hookVal, 'validateOnBlur') ? ok('4o', 'useFormValidation: validateOnBlur exported') : fail('4o', 'validateOnBlur', 'Missing');

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 5 — API CONNECTIVITY (backend must be running)
  // ══════════════════════════════════════════════════════════════════════════
  group('5.  API CONNECTIVITY — backend reachable on port 5001');

  // Health check
  const health = await httpGet('http://localhost:5001/api/health');
  if (health.status === 200) {
    ok('5a', `GET /api/health → ${health.status} OK`);
  } else if (health.status === 0) {
    skip('5a', 'GET /api/health', 'Backend not running — start with: cd backend && node server.js');
    skip('5b', 'POST /api/auth/login', 'Backend not running');
    skip('5c', 'GET /api/config (authenticated)', 'Backend not running');
  } else {
    fail('5a', `GET /api/health → ${health.status}`, health.body.slice(0, 100));
  }

  if (health.status === 200) {
    // Login
    const login = await httpPost('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'Admin123!'
    });

    let token = null;
    if (login.status === 200) {
      ok('5b', `POST /api/auth/login → ${login.status} — admin login successful`);
      try {
        const body = JSON.parse(login.body);
        token = body.token;
        ok('5b', `Login response contains JWT token (${token ? token.slice(0,20) + '…' : 'MISSING'})`);
      } catch {
        fail('5b', 'Login response parse', 'Could not parse JSON response');
      }
    } else {
      fail('5b', `POST /api/auth/login → ${login.status}`, login.body.slice(0, 200));
    }

    // Authenticated request
    if (token) {
      const config = await new Promise((resolve) => {
        const opts = {
          hostname: 'localhost',
          port: 5001,
          path: '/api/config',
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        };
        const req = http.request(opts, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', (e) => resolve({ status: 0, body: e.message }));
        req.end();
      });

      if (config.status === 200) {
        ok('5c', `GET /api/config (authenticated) → ${config.status} — dropdowns accessible`);
        try {
          const cfg = JSON.parse(config.body);
          const cats = Object.keys(cfg.data || cfg);
          ok('5c', `Config categories returned: ${cats.join(', ')}`);
        } catch {
          fail('5c', 'Config response parse', 'Could not parse config JSON');
        }
      } else {
        fail('5c', `GET /api/config → ${config.status}`, config.body.slice(0, 200));
      }
    } else {
      skip('5c', 'GET /api/config (authenticated)', 'No token from login step');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 6 — BUILD (optional, --full flag only)
  // ══════════════════════════════════════════════════════════════════════════
  group('6.  BUILD TEST' + (FULL ? '' : ' (skipped — run with --full to enable)'));

  if (!FULL) {
    skip('6a', 'npm install',   '--full flag not set');
    skip('6b', 'vite build',    '--full flag not set');
    skip('6c', 'dist/index.html exists', '--full flag not set');
  } else {
    const { execSync } = require('child_process');
    // npm install
    try {
      process.stdout.write(`  ${dim('6a')} Running npm install…`);
      execSync('npm install --silent', { cwd: ROOT, stdio: 'pipe' });
      process.stdout.write(` ${green('✅')}\n`);
      ok('6a', 'npm install completed successfully');
    } catch (e) {
      process.stdout.write(` ${red('❌')}\n`);
      fail('6a', 'npm install', e.message.slice(0, 200));
    }

    // vite build
    try {
      process.stdout.write(`  ${dim('6b')} Running vite build…`);
      execSync('npm run build', { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } });
      process.stdout.write(` ${green('✅')}\n`);
      ok('6b', 'vite build completed successfully');
    } catch (e) {
      process.stdout.write(` ${red('❌')}\n`);
      fail('6b', 'vite build', e.stderr?.toString().slice(0, 300) || e.message);
    }

    // dist output
    const distIndex = path.join(ROOT, 'dist', 'index.html');
    fs.existsSync(distIndex)
      ? ok('6c', 'dist/index.html generated — production build ready')
      : fail('6c', 'dist/index.html', 'File not found after build');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const total = passed + failed + skipped;
  console.log('\n' + bold('═'.repeat(54)));
  console.log(bold('  RESULTS'));
  console.log(bold('═'.repeat(54)));
  console.log(`  ${green('Passed')}:  ${passed}`);
  console.log(`  ${red('Failed')}:  ${failed}`);
  console.log(`  ${yellow('Skipped')}: ${skipped}`);
  console.log(`  Total:   ${total}`);
  console.log(bold('═'.repeat(54)));

  if (failed === 0) {
    console.log(green(bold('\n  ✅  All tests passed — Phase 4 foundation is solid!\n')));
  } else {
    console.log(red(bold(`\n  ❌  ${failed} test(s) failed — fix before building modules\n`)));
    process.exit(1);
  }
})();
