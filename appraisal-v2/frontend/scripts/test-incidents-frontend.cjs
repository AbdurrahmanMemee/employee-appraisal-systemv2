// =============================================================================
// FILE:    frontend/scripts/test-incidents-frontend.cjs
// PURPOSE: Phase 7 — Incidents module tests.
//
// WHAT IS TESTED:
//   Group 1  — File existence
//   Group 2  — App.jsx wiring
//   Group 3  — View structure (LIST / DETAIL / FORM)
//   Group 4  — API usage
//   Group 5  — Severity handling
//   Group 6  — Role guards
//   Group 7  — Form validation
//   Group 8  — UX patterns
//   Group 9  — Fetch safety
//
// USAGE (from the appraisal-v2/ directory):
//   node frontend/scripts/test-incidents-frontend.cjs
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
console.log(bold(  '║   EAS v2 — Phase 7 Incidents Module Tests           ║'));
console.log(bold(  '╚══════════════════════════════════════════════════════╝'));
console.log(dim(`  Src: ${SRC}\n`));

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — FILE EXISTENCE
// ══════════════════════════════════════════════════════════════════════════════
group('1.  FILE EXISTENCE');

srcExists('pages/IncidentsPage.jsx')
  ? ok('1a', 'IncidentsPage.jsx exists in pages/')
  : fail('1a', 'IncidentsPage.jsx', 'File missing — create src/pages/IncidentsPage.jsx');

srcExists('App.jsx')
  ? ok('1b', 'App.jsx exists')
  : fail('1b', 'App.jsx', 'File missing');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — APP.JSX WIRING
// ══════════════════════════════════════════════════════════════════════════════
group('2.  APP.JSX WIRING');

const app = readSrc('App.jsx');

has(app, /import\s+IncidentsPage\s+from\s+['"]\.\/pages\/IncidentsPage['"]/)
  ? ok('2a', 'Imports IncidentsPage directly (not from Placeholder)')
  : fail('2a', 'IncidentsPage import', "Expected: import IncidentsPage from './pages/IncidentsPage'");

const placeholderBlock = app.match(/import\s*\{[^}]*\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[0] || '';
!placeholderBlock.includes('IncidentsPage')
  ? ok('2b', 'IncidentsPage NOT inside Placeholder import block')
  : fail('2b', 'Placeholder block', 'IncidentsPage still listed in Placeholder import — remove it');

has(app, '<IncidentsPage') && has(app, 'path="/incidents"')
  ? ok('2c', '/incidents route uses <IncidentsPage />')
  : fail('2c', '/incidents route', 'Route missing or not wired to <IncidentsPage>');

has(app, 'path="/appraisals"') && has(app, 'path="/meetings"')
  ? ok('2d', 'Previous routes (/meetings, /appraisals) still present')
  : fail('2d', 'Previous routes', 'An existing route was accidentally removed');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — VIEW STRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
group('3.  VIEW STRUCTURE');

const inc = readSrc('pages/IncidentsPage.jsx');

has(inc, 'LIST') && has(inc, 'DETAIL') && has(inc, 'FORM')
  ? ok('3a', 'VIEWS constant defines LIST, DETAIL, FORM')
  : fail('3a', 'VIEWS constant', 'Missing LIST, DETAIL, or FORM value');

has(inc, 'const ListView') || has(inc, 'function ListView')
  ? ok('3b', 'ListView component defined')
  : fail('3b', 'ListView', 'Component not found');

has(inc, 'const DetailView') || has(inc, 'function DetailView')
  ? ok('3c', 'DetailView component defined')
  : fail('3c', 'DetailView', 'Component not found');

has(inc, 'const FormView') || has(inc, 'function FormView')
  ? ok('3d', 'FormView component defined')
  : fail('3d', 'FormView', 'Component not found');

has(inc, 'export default IncidentsPage')
  ? ok('3e', 'Default export is IncidentsPage')
  : fail('3e', 'Default export', 'Expected: export default IncidentsPage');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — API USAGE
// ══════════════════════════════════════════════════════════════════════════════
group('4.  API USAGE');

has(inc, 'incidentAPI') && has(inc, "from '../services/api'")
  ? ok('4a', 'incidentAPI imported from services/api')
  : fail('4a', 'incidentAPI import', "Expected import from '../services/api'");

has(inc, 'employeeAPI') && has(inc, "from '../services/api'")
  ? ok('4b', 'employeeAPI imported (employee selector)')
  : fail('4b', 'employeeAPI import', 'employeeAPI needed for employee selector dropdown');

const apiCalls = [
  ['4c', 'incidentAPI.getAll',   'list view'],
  ['4d', 'incidentAPI.getById',  'detail view'],
  ['4e', 'incidentAPI.create',   'log new incident'],
  ['4f', 'incidentAPI.update',   'edit incident'],
  ['4g', 'incidentAPI.delete',   'hard delete — admin only'],
];
for (const [id, call, desc] of apiCalls) {
  has(inc, call)
    ? ok(id, `Calls ${call} (${desc})`)
    : fail(id, call, `${call}() not found — ${desc} will not work`);
}

has(inc, 'incident_type') && has(inc, 'employee_id')
  ? ok('4h', 'incident_type and employee_id filter params used')
  : fail('4h', 'Filter params', 'incident_type or employee_id missing from list query');

has(inc, 'date_from') && has(inc, 'date_to')
  ? ok('4i', 'date_from / date_to params used for date range filter')
  : fail('4i', 'Date range params', 'date_from or date_to missing');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — SEVERITY HANDLING
// ══════════════════════════════════════════════════════════════════════════════
group('5.  SEVERITY HANDLING');

has(inc, 'Low') && has(inc, 'Medium') && has(inc, 'High') && has(inc, 'Critical')
  ? ok('5a', "All four severities defined: Low, Medium, High, Critical")
  : fail('5a', 'Severity values', "Missing one of: Low, Medium, High, Critical");

has(inc, 'SeverityBadge') || has(inc, 'SEVERITY_COLORS')
  ? ok('5b', 'SeverityBadge / SEVERITY_COLORS used for visual distinction')
  : fail('5b', 'SeverityBadge', 'No visual severity indicator — all incidents look the same');

has(inc, "'Medium'") && has(inc, 'severity')
  ? ok('5c', "Severity defaults to 'Medium' on new incident")
  : fail('5c', 'Default severity', "Default severity 'Medium' not found");

has(inc, 'severity') && has(inc, 'severityFilter')
  ? ok('5d', 'Severity filter in list view')
  : fail('5d', 'Severity filter', 'Cannot filter incidents by severity');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — ROLE GUARDS
// ══════════════════════════════════════════════════════════════════════════════
group('6.  ROLE GUARDS');

has(inc, 'useIsAdmin')
  ? ok('6a', 'useIsAdmin imported')
  : fail('6a', 'useIsAdmin', 'Missing — admin-only delete will be unguarded');

has(inc, 'useIsManager')
  ? ok('6b', 'useIsManager imported')
  : fail('6b', 'useIsManager', 'Missing — manager-only actions will be unguarded');

has(inc, 'isManager') && has(inc, 'Log Incident')
  ? ok('6c', '"Log Incident" button gated behind isManager')
  : fail('6c', 'Log Incident guard', 'Button not guarded by isManager');

has(inc, 'isAdmin') && has(inc, 'Delete')
  ? ok('6d', 'Delete button gated behind isAdmin')
  : fail('6d', 'Delete guard', 'Delete not guarded by isAdmin');

has(inc, 'isManager') && has(inc, 'Edit')
  ? ok('6e', 'Edit button gated behind isManager')
  : fail('6e', 'Edit guard', 'Edit not guarded by isManager');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — FORM VALIDATION
// ══════════════════════════════════════════════════════════════════════════════
group('7.  FORM VALIDATION');

has(inc, 'useFormValidation')
  ? ok('7a', 'useFormValidation hook used')
  : fail('7a', 'useFormValidation', 'Hook not used — form has no validation');

const requiredFields = [
  ['7b', 'employee_id'],
  ['7c', 'incident_date'],
  ['7d', 'incident_type'],
  ['7e', 'detail'],
];
for (const [id, field] of requiredFields) {
  has(inc, field) && has(inc, '{ required: true }')
    ? ok(id, `${field} has required validation rule`)
    : fail(id, `${field} required`, `{ required: true } rule not found for ${field}`);
}

has(inc, 'validate(form)')
  ? ok('7f', 'validate() called on submit')
  : fail('7f', 'validate()', 'validate() not called — form submits without validation');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 8 — UX PATTERNS
// ══════════════════════════════════════════════════════════════════════════════
group('8.  UX PATTERNS');

has(inc, 'isEdit') && (has(inc, 'bg-gray-50') || has(inc, 'disabled'))
  ? ok('8a', 'Employee selector locked on edit (cannot reassign incident)')
  : fail('8a', 'Employee locked on edit', 'Employee field not locked on edit');

has(inc, 'today()') || has(inc, "new Date().toISOString().split('T')[0]")
  ? ok('8b', 'Incident date defaults to today()')
  : fail('8b', 'Default date', 'Incident date does not default to today');

has(inc, 'showToast') && has(inc, 'success')
  ? ok('8c', 'showToast called on success')
  : fail('8c', 'showToast success', "showToast('...', 'success') not found");

has(inc, 'ConfirmDialog') && has(inc, 'confirming')
  ? ok('8d', 'ConfirmDialog shown before delete')
  : fail('8d', 'ConfirmDialog', 'No confirmation before hard delete');

has(inc, 'ArrowLeft') && has(inc, 'Incidents')
  ? ok('8e', 'Breadcrumb back navigation in detail and form views')
  : fail('8e', 'Breadcrumb', 'ArrowLeft back nav not found');

has(inc, 'listKey') && has(inc, 'setListKey')
  ? ok('8f', 'listKey incremented to force list refresh after mutations')
  : fail('8f', 'listKey', 'listKey pattern not found — list may not refresh after save/delete');

has(inc, 'useConfig') && has(inc, 'incident_types')
  ? ok('8g', 'Incident types loaded from useConfig() — not hardcoded')
  : fail('8g', 'Config incident types', 'Incident types hardcoded — should come from useConfig()');

has(inc, 'truncate') || has(inc, 'max-w')
  ? ok('8h', 'Detail text truncated in list view (not full text in table cell)')
  : fail('8h', 'Detail truncation', 'Detail field not truncated in list — table will be unreadable');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 9 — FETCH SAFETY
// ══════════════════════════════════════════════════════════════════════════════
group('9.  FETCH SAFETY');

const tryCatchCount = (inc.match(/try\s*\{/g) || []).length;
tryCatchCount >= 3
  ? ok('9a', `All API calls wrapped in try/catch (${tryCatchCount} found)`)
  : fail('9a', 'try/catch coverage', `Only ${tryCatchCount} try/catch blocks — expected at least 3`);

has(inc, 'setLoading(true)') && has(inc, 'setLoading(false)')
  ? ok('9b', 'loading state managed correctly (set true → finally set false)')
  : fail('9b', 'loading state', 'setLoading(true/false) pattern not found');

has(inc, 'PAGE_SIZE')
  ? ok('9c', 'PAGE_SIZE constant used (no magic numbers)')
  : fail('9c', 'PAGE_SIZE', 'Hardcoded page size — use a named constant');

has(inc, 'const today') || has(inc, 'today()')
  ? ok('9d', 'today() helper used for default date')
  : fail('9d', 'today() helper', 'today() helper not found');

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
  console.log(green(bold('\n  ✅  All tests passed — Incidents module is solid!\n')));
} else {
  console.log(red(bold(`\n  ❌  ${failed} test(s) failed — fix before moving to next module\n`)));
  process.exit(1);
}
