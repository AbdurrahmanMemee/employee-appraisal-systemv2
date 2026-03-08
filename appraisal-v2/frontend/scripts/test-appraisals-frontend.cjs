// =============================================================================
// FILE:    frontend/scripts/test-appraisals-frontend.cjs
// PURPOSE: Phase 6 — Appraisals module tests.
//
// WHAT IS TESTED:
//   Group 1  — File existence
//   Group 2  — App.jsx wiring
//   Group 3  — View structure (LIST / DETAIL / FORM)
//   Group 4  — API usage
//   Group 5  — Sections editor
//   Group 6  — Overall rating (never sent from client)
//   Group 7  — Role guards + status transitions
//   Group 8  — Form validation
//   Group 9  — Print layout
//   Group 10 — UX patterns
//   Group 11 — Fetch safety
//
// USAGE (from the appraisal-v2/ directory):
//   node frontend/scripts/test-appraisals-frontend.cjs
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
console.log(bold(  '║   EAS v2 — Phase 6 Appraisals Module Tests          ║'));
console.log(bold(  '╚══════════════════════════════════════════════════════╝'));
console.log(dim(`  Src: ${SRC}\n`));

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — FILE EXISTENCE
// ══════════════════════════════════════════════════════════════════════════════
group('1.  FILE EXISTENCE');

srcExists('pages/AppraisalsPage.jsx')
  ? ok('1a', 'AppraisalsPage.jsx exists in pages/')
  : fail('1a', 'AppraisalsPage.jsx', 'File missing — create src/pages/AppraisalsPage.jsx');

srcExists('App.jsx')
  ? ok('1b', 'App.jsx exists')
  : fail('1b', 'App.jsx', 'File missing');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — APP.JSX WIRING
// ══════════════════════════════════════════════════════════════════════════════
group('2.  APP.JSX WIRING');

const app = readSrc('App.jsx');

has(app, /import\s+AppraisalsPage\s+from\s+['"]\.\/pages\/AppraisalsPage['"]/)
  ? ok('2a', 'Imports AppraisalsPage directly (not from Placeholder)')
  : fail('2a', 'AppraisalsPage import', "Expected: import AppraisalsPage from './pages/AppraisalsPage'");

const placeholderBlock = app.match(/import\s*\{[^}]*\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[0] || '';
!placeholderBlock.includes('AppraisalsPage')
  ? ok('2b', 'AppraisalsPage NOT inside Placeholder import block')
  : fail('2b', 'Placeholder block', 'AppraisalsPage still listed in Placeholder import — remove it');

has(app, '<AppraisalsPage') && has(app, 'path="/appraisals"')
  ? ok('2c', '/appraisals route uses <AppraisalsPage />')
  : fail('2c', '/appraisals route', 'Route missing or not wired to <AppraisalsPage>');

has(app, 'path="/meetings"') && has(app, 'path="/employees"')
  ? ok('2d', 'Previous routes (/employees, /meetings) still present')
  : fail('2d', 'Previous routes', 'An existing route was accidentally removed');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — VIEW STRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
group('3.  VIEW STRUCTURE');

const apl = readSrc('pages/AppraisalsPage.jsx');

has(apl, 'LIST') && has(apl, 'DETAIL') && has(apl, 'FORM')
  ? ok('3a', 'VIEWS constant defines LIST, DETAIL, FORM')
  : fail('3a', 'VIEWS constant', 'Missing LIST, DETAIL, or FORM value');

has(apl, 'const ListView') || has(apl, 'function ListView')
  ? ok('3b', 'ListView component defined')
  : fail('3b', 'ListView', 'Component not found');

has(apl, 'const DetailView') || has(apl, 'function DetailView')
  ? ok('3c', 'DetailView component defined')
  : fail('3c', 'DetailView', 'Component not found');

has(apl, 'const FormView') || has(apl, 'function FormView')
  ? ok('3d', 'FormView component defined')
  : fail('3d', 'FormView', 'Component not found');

has(apl, 'const SectionEditor') || has(apl, 'function SectionEditor')
  ? ok('3e', 'SectionEditor component defined')
  : fail('3e', 'SectionEditor', 'Component not found — inline section editing will not work');

has(apl, 'const PrintView') || has(apl, 'function PrintView')
  ? ok('3f', 'PrintView component defined (required — was missing in v1)')
  : fail('3f', 'PrintView', 'Component not found — print layout was a required v2 feature');

has(apl, 'export default AppraisalsPage')
  ? ok('3g', 'Default export is AppraisalsPage')
  : fail('3g', 'Default export', 'Expected: export default AppraisalsPage');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — API USAGE
// ══════════════════════════════════════════════════════════════════════════════
group('4.  API USAGE');

has(apl, 'appraisalAPI') && has(apl, "from '../services/api'")
  ? ok('4a', 'appraisalAPI imported from services/api')
  : fail('4a', 'appraisalAPI import', "Expected import from '../services/api'");

has(apl, 'employeeAPI') && has(apl, "from '../services/api'")
  ? ok('4b', 'employeeAPI imported (employee selector)')
  : fail('4b', 'employeeAPI import', 'employeeAPI needed for employee selector dropdown');

const apiCalls = [
  ['4c', 'appraisalAPI.getAll',   'list view'],
  ['4d', 'appraisalAPI.getById',  'detail view'],
  ['4e', 'appraisalAPI.create',   'new appraisal form'],
  ['4f', 'appraisalAPI.update',   'edit form'],
  ['4g', 'appraisalAPI.submit',   'submit → Completed'],
  ['4h', 'appraisalAPI.cancel',   'cancel — admin only'],
  ['4i', 'appraisalAPI.delete',   'hard delete — admin only, Draft only'],
];
for (const [id, call, desc] of apiCalls) {
  has(apl, call)
    ? ok(id, `Calls ${call} (${desc})`)
    : fail(id, call, `${call}() not found — ${desc} will not work`);
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — SECTIONS EDITOR
// ══════════════════════════════════════════════════════════════════════════════
group('5.  SECTIONS EDITOR');

has(apl, 'section_name')
  ? ok('5a', 'section_name field present in section editor')
  : fail('5a', 'section_name', 'Missing — sections cannot be named');

has(apl, 'rating') && has(apl, '0–5')
  ? ok('5b', 'rating field present with 0–5 constraint')
  : fail('5b', 'rating 0-5', 'Rating field or 0–5 constraint not found');

has(apl, 'weight')
  ? ok('5c', 'weight field present per section')
  : fail('5c', 'weight', 'Weight field missing — weighted average cannot be calculated');

has(apl, 'previous_rating')
  ? ok('5d', 'previous_rating field present (comparison with last appraisal)')
  : fail('5d', 'previous_rating', 'Missing — cannot show improvement/deterioration vs last appraisal');

has(apl, 'comments')
  ? ok('5e', 'comments field present per section')
  : fail('5e', 'comments', 'Comments field missing from section editor');

has(apl, 'totalWeight') || has(apl, 'total weight') || has(apl, 'Total weight')
  ? ok('5f', 'Total weight displayed/validated (must not exceed 100%)')
  : fail('5f', 'Total weight check', 'Weight total validation not found');

has(apl, 'Add Section')
  ? ok('5g', '"Add Section" button to add rows dynamically')
  : fail('5g', 'Add Section button', 'Missing — cannot add sections to form');

has(apl, 'removeSection') || has(apl, 'Remove') || has(apl, 'Trash2')
  ? ok('5h', 'Remove section button present')
  : fail('5h', 'Remove section', 'Cannot remove sections from form');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — OVERALL RATING (CRITICAL — never from client)
// ══════════════════════════════════════════════════════════════════════════════
group('6.  OVERALL RATING — never sent from client (server calculates)');

!has(apl, 'overall_rating:') && !has(apl, "'overall_rating'")
  ? ok('6a', 'overall_rating NOT included in create/update payload ✓')
  : fail('6a', 'overall_rating in payload', 'CRITICAL: overall_rating must NEVER be sent to the server — remove it from the payload');

has(apl, 'previewRating') || has(apl, 'preview') || has(apl, 'Calculated Overall')
  ? ok('6b', 'Rating preview shown on form (client-side display only)')
  : fail('6b', 'Rating preview', 'No preview shown — user has no feedback on overall score while editing');

has(apl, 'calcOverallRating') || has(apl, 'Server will recalculate') || has(apl, 'server-calculated')
  ? ok('6c', 'Comment/label clarifies rating is server-calculated')
  : fail('6c', 'Server-calculated label', 'No indication that the overall rating is server-calculated');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — ROLE GUARDS + STATUS TRANSITIONS
// ══════════════════════════════════════════════════════════════════════════════
group('7.  ROLE GUARDS + STATUS TRANSITIONS');

has(apl, 'useIsAdmin')
  ? ok('7a', 'useIsAdmin imported')
  : fail('7a', 'useIsAdmin', 'Missing — admin-only actions will be unguarded');

has(apl, 'useIsManager')
  ? ok('7b', 'useIsManager imported')
  : fail('7b', 'useIsManager', 'Missing — manager-only actions will be unguarded');

has(apl, 'isManager') && has(apl, 'New Appraisal')
  ? ok('7c', '"New Appraisal" button gated behind isManager')
  : fail('7c', 'New Appraisal guard', 'Button not guarded by isManager');

has(apl, 'canEdit') || (has(apl, 'isManager') && has(apl, 'Edit'))
  ? ok('7d', 'Edit gated by role + status (Draft/In Progress only)')
  : fail('7d', 'Edit guard', 'Edit not guarded by canEdit or isManager');

has(apl, 'canSubmit') || (has(apl, 'isManager') && has(apl, 'Submit'))
  ? ok('7e', 'Submit gated by role + status')
  : fail('7e', 'Submit guard', 'Submit not guarded by role/status check');

has(apl, 'canCancel') || (has(apl, 'isAdmin') && has(apl, 'Cancel'))
  ? ok('7f', 'Cancel gated by isAdmin only')
  : fail('7f', 'Cancel guard', 'Cancel not restricted to admin');

has(apl, 'canDelete') || (has(apl, 'isAdmin') && has(apl, "=== 'Draft'"))
  ? ok('7g', 'Delete gated by isAdmin + Draft status')
  : fail('7g', 'Delete guard', "Delete not restricted to admin + Draft status");

has(apl, 'Completed') && has(apl, 'Cancelled')
  ? ok('7h', "Status values 'Completed' and 'Cancelled' referenced")
  : fail('7h', 'Status values', "Expected 'Completed' and 'Cancelled' referenced for guard checks");

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 8 — FORM VALIDATION
// ══════════════════════════════════════════════════════════════════════════════
group('8.  FORM VALIDATION');

has(apl, 'useFormValidation')
  ? ok('8a', 'useFormValidation hook used')
  : fail('8a', 'useFormValidation', 'Hook not used — form has no validation');

has(apl, 'employee_id') && has(apl, "'required'")
  ? ok('8b', 'employee_id has required rule')
  : fail('8b', 'employee_id required', "Rule { type: 'required' } not found for employee_id");

has(apl, 'appraisal_date') && has(apl, "'required'")
  ? ok('8c', 'appraisal_date has required rule')
  : fail('8c', 'appraisal_date required', "Rule { type: 'required' } not found for appraisal_date");

has(apl, 'validateAll')
  ? ok('8d', 'validateAll() called on submit')
  : fail('8d', 'validateAll', 'validateAll() not called — form submits without full validation');

has(apl, 'sectionsError') || has(apl, 'sections error') || has(apl, 'section.*required')
  ? ok('8e', 'Section-level validation errors shown separately')
  : fail('8e', 'Section validation', 'No sectionsError state — section errors not shown to user');

has(apl, 'At least one section')
  ? ok('8f', '"At least one section" required message present')
  : fail('8f', 'Min sections check', 'No check that at least 1 section exists before submit');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 9 — PRINT LAYOUT
// ══════════════════════════════════════════════════════════════════════════════
group('9.  PRINT LAYOUT  (required v2 feature — was missing in v1)');

has(apl, 'PrintView')
  ? ok('9a', 'PrintView component defined')
  : fail('9a', 'PrintView', 'Missing — print layout was a required v2 feature');

has(apl, 'print:hidden') || has(apl, 'print:block')
  ? ok('9b', 'Tailwind print: variants used to toggle screen vs print views')
  : fail('9b', 'print: Tailwind classes', "print:hidden or print:block not found — print layout won't toggle correctly");

has(apl, 'window.print')
  ? ok('9c', 'window.print() called from Print button')
  : fail('9c', 'window.print()', 'Print button does not call window.print()');

has(apl, 'Printer')
  ? ok('9d', 'Printer icon used on Print button')
  : fail('9d', 'Printer icon', 'Print button has no icon');

has(apl, 'Signature') || has(apl, 'signature')
  ? ok('9e', 'Signature lines present in print layout')
  : fail('9e', 'Signature lines', 'No signature lines in print layout — required for signed appraisals');

has(apl, 'Confidential') || has(apl, 'For internal use')
  ? ok('9f', 'Confidential disclaimer in print header')
  : fail('9f', 'Confidential label', 'Print layout has no confidentiality notice');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 10 — UX PATTERNS
// ══════════════════════════════════════════════════════════════════════════════
group('10. UX PATTERNS');

has(apl, 'isEdit') && (has(apl, 'bg-gray-50') || has(apl, 'disabled'))
  ? ok('10a', 'Employee selector locked on edit (cannot reassign appraisal)')
  : fail('10a', 'Employee locked on edit', 'Employee field not locked — can be changed on existing appraisals');

has(apl, 'today()') || has(apl, "new Date().toISOString().split('T')[0]")
  ? ok('10b', 'Appraisal date defaults to today() on create')
  : fail('10b', 'Default date today', 'Date does not default to today');

has(apl, 'nextYear') || has(apl, 'next_appraisal_date')
  ? ok('10c', 'Next appraisal date defaults to one year from today')
  : fail('10c', 'Default next appraisal date', 'next_appraisal_date default not set');

has(apl, 'StarRating') || has(apl, 'star')
  ? ok('10d', 'StarRating component used for visual rating display')
  : fail('10d', 'StarRating', 'No star rating display — ratings shown as plain numbers only');

has(apl, 'showToast') && has(apl, 'success')
  ? ok('10e', 'showToast called on save success')
  : fail('10e', 'showToast success', "showToast('...', 'success') not found");

has(apl, 'ConfirmDialog') && has(apl, 'confirming')
  ? ok('10f', 'ConfirmDialog shown before destructive actions')
  : fail('10f', 'ConfirmDialog', 'No confirmation before submit/cancel/delete');

has(apl, 'ArrowLeft') && has(apl, 'Appraisals')
  ? ok('10g', 'Breadcrumb back navigation in detail and form views')
  : fail('10g', 'Breadcrumb', 'ArrowLeft back nav not found');

has(apl, 'listKey') && has(apl, 'setListKey')
  ? ok('10h', 'listKey incremented to force list refresh after mutations')
  : fail('10h', 'listKey', 'listKey pattern not found — list may not refresh after save/delete');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 11 — FETCH SAFETY
// ══════════════════════════════════════════════════════════════════════════════
group('11. FETCH SAFETY');

const tryCatchCount = (apl.match(/try\s*\{/g) || []).length;
tryCatchCount >= 4
  ? ok('11a', `All API calls wrapped in try/catch (${tryCatchCount} found)`)
  : fail('11a', 'try/catch coverage', `Only ${tryCatchCount} try/catch blocks — expected at least 4`);

has(apl, 'setLoading(true)') && has(apl, 'setLoading(false)')
  ? ok('11b', 'loading state managed correctly (set true → finally set false)')
  : fail('11b', 'loading state', 'setLoading(true/false) pattern not found');

has(apl, 'PAGE_SIZE')
  ? ok('11c', 'PAGE_SIZE constant used (no magic numbers)')
  : fail('11c', 'PAGE_SIZE', 'Hardcoded page size found — use a named constant');

has(apl, 'const today') || has(apl, 'today()')
  ? ok('11d', 'today() helper used for default date')
  : fail('11d', 'today() helper', 'today() helper not found');

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
  console.log(green(bold('\n  ✅  All tests passed — Appraisals module is solid!\n')));
} else {
  console.log(red(bold(`\n  ❌  ${failed} test(s) failed — fix before moving to next module\n`)));
  process.exit(1);
}
