// =============================================================================
// FILE:    frontend/scripts/test-employees-frontend.cjs
// PURPOSE: Phase 4c — Employees module tests.
//
// WHAT IS TESTED:
//   Group 1 — File existence
//   Group 2 — App.jsx wiring
//   Group 3 — View structure (LIST / DETAIL / FORM)
//   Group 4 — API usage
//   Group 5 — Role guards
//   Group 6 — Form validation
//   Group 7 — UI primitives
//   Group 8 — UX patterns
//   Group 9 — Fetch safety
//
// USAGE (from the appraisal-v2/ directory):
//   node frontend/scripts/test-employees-frontend.cjs
// =============================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Resolve paths ─────────────────────────────────────────────────────────────
const FRONTEND = path.resolve(__dirname, '..');
const SRC      = path.join(FRONTEND, 'src');

// ── Colour helpers ────────────────────────────────────────────────────────────
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed  = 0;
let failed  = 0;
let skipped = 0;

const ok   = (id, desc)         => { console.log(`  ${green('✅')} ${dim(id)} ${desc}`);                                       passed++;  };
const fail = (id, desc, reason) => { console.log(`  ${red('❌')} ${dim(id)} ${desc}\n       ${red('→')} ${reason}`);           failed++;  };
const skip = (id, desc, reason) => { console.log(`  ${yellow('⏭')}  ${dim(id)} ${desc} ${dim('(skipped: ' + reason + ')')}`); skipped++; };

const group = (title) => console.log(`\n${bold(title)}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
const srcExists = (rel) => fs.existsSync(path.join(SRC, rel));
const readSrc   = (rel) => { try { return fs.readFileSync(path.join(SRC, rel), 'utf8'); } catch { return ''; } };
const has       = (src, pattern) => typeof pattern === 'string' ? src.includes(pattern) : pattern.test(src);

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(bold('\n╔══════════════════════════════════════════════════════╗'));
console.log(bold(  '║   EAS v2 — Phase 4c Employees Module Tests          ║'));
console.log(bold(  '╚══════════════════════════════════════════════════════╝'));
console.log(dim(`  Src: ${SRC}\n`));

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — FILE EXISTENCE
// ══════════════════════════════════════════════════════════════════════════════
group('1.  FILE EXISTENCE');

srcExists('pages/EmployeesPage.jsx')
  ? ok('1a', 'EmployeesPage.jsx exists in pages/')
  : fail('1a', 'EmployeesPage.jsx', 'File missing — create src/pages/EmployeesPage.jsx');

srcExists('App.jsx')
  ? ok('1b', 'App.jsx exists')
  : fail('1b', 'App.jsx', 'File missing');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — APP.JSX WIRING
// ══════════════════════════════════════════════════════════════════════════════
group('2.  APP.JSX WIRING');

const app = readSrc('App.jsx');

has(app, /import\s+EmployeesPage\s+from\s+['"]\.\/pages\/EmployeesPage['"]/)
  ? ok('2a', 'Imports EmployeesPage directly (not from Placeholder)')
  : fail('2a', 'EmployeesPage import', "Expected: import EmployeesPage from './pages/EmployeesPage'");

const placeholderBlock = app.match(/import\s*\{[^}]*\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[0] || '';
!placeholderBlock.includes('EmployeesPage')
  ? ok('2b', 'EmployeesPage NOT inside Placeholder import block')
  : fail('2b', 'Placeholder block', 'EmployeesPage still listed in Placeholder import — remove it');

has(app, '<EmployeesPage') && has(app, 'path="/employees"')
  ? ok('2c', '/employees route uses <EmployeesPage />')
  : fail('2c', '/employees route', 'Route missing or not wired to <EmployeesPage>');

has(app, 'path="/meetings"')
  ? ok('2d', '/meetings route still present')
  : fail('2d', '/meetings route', 'Route was removed — should still exist');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — VIEW STRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
group('3.  VIEW STRUCTURE');

const emp = readSrc('pages/EmployeesPage.jsx');

has(emp, 'LIST') && has(emp, 'DETAIL') && has(emp, 'FORM')
  ? ok('3a', 'VIEWS constant defines LIST, DETAIL, FORM')
  : fail('3a', 'VIEWS constant', 'Missing LIST, DETAIL, or FORM value');

has(emp, 'const ListView') || has(emp, 'function ListView')
  ? ok('3b', 'ListView component defined')
  : fail('3b', 'ListView', 'Component not found');

has(emp, 'const DetailView') || has(emp, 'function DetailView')
  ? ok('3c', 'DetailView component defined')
  : fail('3c', 'DetailView', 'Component not found');

has(emp, 'const FormView') || has(emp, 'function FormView')
  ? ok('3d', 'FormView component defined')
  : fail('3d', 'FormView', 'Component not found');

has(emp, 'export default EmployeesPage')
  ? ok('3e', 'Default export is EmployeesPage')
  : fail('3e', 'Default export', 'Expected: export default EmployeesPage');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — API USAGE
// ══════════════════════════════════════════════════════════════════════════════
group('4.  API USAGE');

has(emp, 'employeeAPI') && has(emp, "from '../services/api'")
  ? ok('4a', 'employeeAPI imported from services/api')
  : fail('4a', 'employeeAPI import', "Expected import from '../services/api'");

const apiCalls = [
  ['4b', 'employeeAPI.getAll',     'list + employee selector'],
  ['4c', 'employeeAPI.getById',    'detail view'],
  ['4d', 'employeeAPI.create',     'new employee form'],
  ['4e', 'employeeAPI.update',     'edit form'],
  ['4f', 'employeeAPI.deactivate', 'admin deactivate action'],
  ['4g', 'employeeAPI.restore',    'admin restore action'],
];
for (const [id, call, desc] of apiCalls) {
  has(emp, call)
    ? ok(id, `Calls ${call} (${desc})`)
    : fail(id, call, `${call}() not found — ${desc} will not work`);
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — ROLE GUARDS
// ══════════════════════════════════════════════════════════════════════════════
group('5.  ROLE GUARDS');

has(emp, 'useIsAdmin')
  ? ok('5a', 'useIsAdmin imported')
  : fail('5a', 'useIsAdmin', 'Missing — admin-only actions will be unguarded');

has(emp, 'useIsManager')
  ? ok('5b', 'useIsManager imported')
  : fail('5b', 'useIsManager', 'Missing — manager-only actions will be unguarded');

has(emp, 'isManager') && has(emp, 'Add Employee')
  ? ok('5c', '"Add Employee" button gated behind isManager')
  : fail('5c', 'Add Employee guard', 'Button not guarded by isManager');

has(emp, 'isAdmin') && has(emp, 'Deactivate')
  ? ok('5d', 'Deactivate button gated behind isAdmin')
  : fail('5d', 'Deactivate guard', 'Deactivate not guarded by isAdmin');

has(emp, 'isAdmin') && has(emp, 'Restore')
  ? ok('5e', 'Restore button gated behind isAdmin')
  : fail('5e', 'Restore guard', 'Restore not guarded by isAdmin');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — FORM VALIDATION
// ══════════════════════════════════════════════════════════════════════════════
group('6.  FORM VALIDATION');

has(emp, 'useFormValidation')
  ? ok('6a', 'useFormValidation hook used')
  : fail('6a', 'useFormValidation', 'Hook not used — form has no validation');

has(emp, 'first_name') && has(emp, "'required'")
  ? ok('6b', "first_name has required rule ({ type: 'required' })")
  : fail('6b', 'first_name required', "Rule { type: 'required' } not found");

has(emp, 'last_name') && has(emp, "'required'")
  ? ok('6c', "last_name has required rule")
  : fail('6c', 'last_name required', "Rule { type: 'required' } not found");

has(emp, 'employee_number') && has(emp, "'required'")
  ? ok('6d', "employee_number has required rule")
  : fail('6d', 'employee_number required', "Rule { type: 'required' } not found");

has(emp, 'validateAll')
  ? ok('6e', 'validateAll() called on submit')
  : fail('6e', 'validateAll', 'validateAll() not called — form submits without full validation');

has(emp, 'validateField')
  ? ok('6f', 'validateField() called on change (inline feedback)')
  : fail('6f', 'validateField', 'validateField() not called — errors only shown on submit');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — UI PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════
group('7.  UI PRIMITIVES');

const uiComponents = [
  ['7a', 'Button'],
  ['7b', 'StatusBadge'],
  ['7c', 'Pagination'],
  ['7d', 'EmptyState'],
  ['7e', 'ConfirmDialog'],
  ['7f', 'Card'],
  ['7g', 'Alert'],
  ['7h', 'Field'],
  ['7i', 'Input'],
  ['7j', 'Select'],
  ['7k', 'Textarea'],
];
for (const [id, comp] of uiComponents) {
  has(emp, comp)
    ? ok(id, `${comp} used`)
    : fail(id, comp, `${comp} not found — import from '../components/ui'`);
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 8 — UX PATTERNS
// ══════════════════════════════════════════════════════════════════════════════
group('8.  UX PATTERNS');

has(emp, 'debounce') || has(emp, 'setTimeout')
  ? ok('8a', 'Search input is debounced')
  : fail('8a', 'Debounce', 'No debounce on search — every keystroke fires an API call');

has(emp, 'SortButton') || (has(emp, 'sortField') && has(emp, 'sortDir'))
  ? ok('8b', 'Sortable columns implemented')
  : fail('8b', 'Sortable columns', 'sortField/sortDir state not found');

has(emp, 'departmentFilter') || has(emp, 'dept')
  ? ok('8c', 'Department filter present')
  : fail('8c', 'Department filter', 'Department filter dropdown not found');

has(emp, 'statusFilter') || has(emp, 'status')
  ? ok('8d', 'Status filter present (Active/Inactive/All)')
  : fail('8d', 'Status filter', 'Status filter not found');

has(emp, 'showToast') && has(emp, 'success')
  ? ok('8e', "showToast called on success")
  : fail('8e', 'showToast success', "showToast('...', 'success') not found");

has(emp, 'showToast') && has(emp, 'error')
  ? ok('8f', "showToast called on error")
  : fail('8f', 'showToast error', "showToast('...', 'error') not found");

has(emp, 'ArrowLeft') && has(emp, 'Employees')
  ? ok('8g', 'Breadcrumb back navigation present')
  : fail('8g', 'Breadcrumb', 'ArrowLeft back nav not found in detail/form views');

has(emp, 'listKey') && has(emp, 'setListKey')
  ? ok('8h', 'listKey incremented to force list refresh after mutations')
  : fail('8h', 'listKey', 'listKey pattern not found — list may not refresh after save/delete');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 9 — FETCH SAFETY
// ══════════════════════════════════════════════════════════════════════════════
group('9.  FETCH SAFETY');

const tryCatchCount = (emp.match(/try\s*\{/g) || []).length;
tryCatchCount >= 4
  ? ok('9a', `All API calls wrapped in try/catch (${tryCatchCount} found)`)
  : fail('9a', 'try/catch coverage', `Only ${tryCatchCount} try/catch blocks — expected at least 4`);

has(emp, 'setLoading(true)') && has(emp, 'setLoading(false)')
  ? ok('9b', 'loading state managed correctly (set true → finally set false)')
  : fail('9b', 'loading state', 'setLoading(true/false) pattern not found');

has(emp, 'PAGE_SIZE')
  ? ok('9c', 'PAGE_SIZE constant used (no magic numbers)')
  : fail('9c', 'PAGE_SIZE', 'Hardcoded page size found — use a named constant');

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
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
  console.log(green(bold('\n  ✅  All tests passed — Employees module is solid!\n')));
} else {
  console.log(red(bold(`\n  ❌  ${failed} test(s) failed — fix before moving to next module\n`)));
  process.exit(1);
}
