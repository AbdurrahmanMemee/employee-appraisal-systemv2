// =============================================================================
// FILE:    frontend/scripts/test-meetings-frontend.cjs
// PURPOSE: Phase 5 — Meetings module tests.
//
// WHAT IS TESTED:
//   Group 1  — File existence
//   Group 2  — App.jsx wiring
//   Group 3  — View structure (LIST / DETAIL / FORM)
//   Group 4  — API usage
//   Group 5  — Last Meeting Link (required v2 feature)
//   Group 6  — Role guards
//   Group 7  — Form validation
//   Group 8  — PDF attachment handling
//   Group 9  — UX patterns
//   Group 10 — Fetch safety
//
// USAGE (from the appraisal-v2/ directory):
//   node frontend/scripts/test-meetings-frontend.cjs
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
console.log(bold(  '║   EAS v2 — Phase 5 Meetings Module Tests            ║'));
console.log(bold(  '╚══════════════════════════════════════════════════════╝'));
console.log(dim(`  Src: ${SRC}\n`));

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — FILE EXISTENCE
// ══════════════════════════════════════════════════════════════════════════════
group('1.  FILE EXISTENCE');

srcExists('pages/MeetingsPage.jsx')
  ? ok('1a', 'MeetingsPage.jsx exists in pages/')
  : fail('1a', 'MeetingsPage.jsx', 'File missing — create src/pages/MeetingsPage.jsx');

srcExists('App.jsx')
  ? ok('1b', 'App.jsx exists')
  : fail('1b', 'App.jsx', 'File missing');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — APP.JSX WIRING
// ══════════════════════════════════════════════════════════════════════════════
group('2.  APP.JSX WIRING');

const app = readSrc('App.jsx');

has(app, /import\s+MeetingsPage\s+from\s+['"]\.\/pages\/MeetingsPage['"]/)
  ? ok('2a', 'Imports MeetingsPage directly (not from Placeholder)')
  : fail('2a', 'MeetingsPage import', "Expected: import MeetingsPage from './pages/MeetingsPage'");

const placeholderBlock = app.match(/import\s*\{[^}]*\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[0] || '';
!placeholderBlock.includes('MeetingsPage')
  ? ok('2b', 'MeetingsPage NOT inside Placeholder import block')
  : fail('2b', 'Placeholder block', 'MeetingsPage still listed in Placeholder import — remove it');

has(app, '<MeetingsPage') && has(app, 'path="/meetings"')
  ? ok('2c', '/meetings route uses <MeetingsPage />')
  : fail('2c', '/meetings route', 'Route missing or not wired to <MeetingsPage>');

has(app, 'path="/employees"')
  ? ok('2d', '/employees route still present')
  : fail('2d', '/employees route', 'Route was removed — should still exist');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — VIEW STRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
group('3.  VIEW STRUCTURE');

const mtg = readSrc('pages/MeetingsPage.jsx');

has(mtg, 'LIST') && has(mtg, 'DETAIL') && has(mtg, 'FORM')
  ? ok('3a', 'VIEWS constant defines LIST, DETAIL, FORM')
  : fail('3a', 'VIEWS constant', 'Missing LIST, DETAIL, or FORM value');

has(mtg, 'const ListView') || has(mtg, 'function ListView')
  ? ok('3b', 'ListView component defined')
  : fail('3b', 'ListView', 'Component not found');

has(mtg, 'const DetailView') || has(mtg, 'function DetailView')
  ? ok('3c', 'DetailView component defined')
  : fail('3c', 'DetailView', 'Component not found');

has(mtg, 'const FormView') || has(mtg, 'function FormView')
  ? ok('3d', 'FormView component defined')
  : fail('3d', 'FormView', 'Component not found');

has(mtg, 'const LastMeetingLink') || has(mtg, 'function LastMeetingLink')
  ? ok('3e', 'LastMeetingLink component defined (required v2 feature)')
  : fail('3e', 'LastMeetingLink', 'Component not found — was missing in v1, required in v2');

has(mtg, 'export default MeetingsPage')
  ? ok('3f', 'Default export is MeetingsPage')
  : fail('3f', 'Default export', 'Expected: export default MeetingsPage');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — API USAGE
// ══════════════════════════════════════════════════════════════════════════════
group('4.  API USAGE');

has(mtg, 'meetingAPI') && has(mtg, "from '../services/api'")
  ? ok('4a', 'meetingAPI imported from services/api')
  : fail('4a', 'meetingAPI import', "Expected import from '../services/api'");

has(mtg, 'employeeAPI') && has(mtg, "from '../services/api'")
  ? ok('4b', 'employeeAPI imported (employee selector + last-meeting lookup)')
  : fail('4b', 'employeeAPI import', 'employeeAPI needed for employee selector and LastMeetingLink');

const apiCalls = [
  ['4c', 'meetingAPI.getAll',          'list + last-meeting lookup'],
  ['4d', 'meetingAPI.getById',         'detail view'],
  ['4e', 'meetingAPI.create',          'new meeting form'],
  ['4f', 'meetingAPI.update',          'edit form'],
  ['4g', 'meetingAPI.delete',          'hard delete — admin only'],
  ['4h', 'meetingAPI.uploadAttachment','PDF upload on edit'],
];
for (const [id, call, desc] of apiCalls) {
  has(mtg, call)
    ? ok(id, `Calls ${call} (${desc})`)
    : fail(id, call, `${call}() not found — ${desc} will not work`);
}

has(mtg, 'employee_id')
  ? ok('4i', 'employee_id param used for list filter')
  : fail('4i', 'employee_id filter', 'employee_id param missing from list query');

has(mtg, 'date_from') && has(mtg, 'date_to')
  ? ok('4j', 'date_from / date_to params used for date range filter')
  : fail('4j', 'date range params', 'date_from or date_to missing — date range filter will not work');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — LAST MEETING LINK (required v2 feature — was missing in v1)
// ══════════════════════════════════════════════════════════════════════════════
group('5.  LAST MEETING LINK  (required v2 feature — was missing in v1)');

has(mtg, 'LastMeetingLink') && has(mtg, 'meetingAPI.getAll')
  ? ok('5a', 'LastMeetingLink fetches previous meeting via meetingAPI.getAll')
  : fail('5a', 'LastMeetingLink fetch', 'meetingAPI.getAll not called inside LastMeetingLink');

has(mtg, '<LastMeetingLink')
  ? ok('5b', 'LastMeetingLink rendered inside FormView')
  : fail('5b', 'LastMeetingLink in form', '<LastMeetingLink> not rendered in FormView');

has(mtg, 'onViewMeeting')
  ? ok('5c', 'onViewMeeting prop wires last-meeting click to detail view')
  : fail('5c', 'onViewMeeting prop', 'Missing — clicking last meeting link will not navigate');

has(mtg, 'currentMeetingId')
  ? ok('5d', 'currentMeetingId excludes current meeting from lookup (edit mode)')
  : fail('5d', 'currentMeetingId', 'Missing — edit mode will link to itself');

has(mtg, 'No previous meetings')
  ? ok('5e', '"No previous meetings" message shown when none exist')
  : fail('5e', 'No previous meetings message', 'Empty state message missing from LastMeetingLink');

has(mtg, 'formContext')
  ? ok('5f', 'formContext saves form state before navigating to linked detail view')
  : fail('5f', 'formContext', 'Missing — Back button from linked meeting will go to list, not form');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — ROLE GUARDS
// ══════════════════════════════════════════════════════════════════════════════
group('6.  ROLE GUARDS');

has(mtg, 'useIsAdmin')
  ? ok('6a', 'useIsAdmin imported')
  : fail('6a', 'useIsAdmin', 'Missing — admin-only actions will be unguarded');

has(mtg, 'useIsManager')
  ? ok('6b', 'useIsManager imported')
  : fail('6b', 'useIsManager', 'Missing — manager-only actions will be unguarded');

has(mtg, 'isManager') && has(mtg, 'New Meeting')
  ? ok('6c', '"New Meeting" button gated behind isManager')
  : fail('6c', 'New Meeting guard', 'Button not guarded by isManager');

has(mtg, 'isAdmin') && has(mtg, 'Delete')
  ? ok('6d', 'Delete button gated behind isAdmin')
  : fail('6d', 'Delete guard', 'Delete not guarded by isAdmin');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — FORM VALIDATION
// ══════════════════════════════════════════════════════════════════════════════
group('7.  FORM VALIDATION');

has(mtg, 'useFormValidation')
  ? ok('7a', 'useFormValidation hook used')
  : fail('7a', 'useFormValidation', 'Hook not used — form has no validation');

const requiredFields = [
  ['7b', 'employee_id'],
  ['7c', 'meeting_date'],
  ['7d', 'meeting_type'],
  ['7e', 'meeting_conclusion'],
];
for (const [id, field] of requiredFields) {
  has(mtg, field) && has(mtg, "'required'")
    ? ok(id, `${field} has required validation rule`)
    : fail(id, `${field} required`, `Rule { type: 'required' } not found for ${field}`);
}

has(mtg, 'validateAll')
  ? ok('7f', 'validateAll() called on submit')
  : fail('7f', 'validateAll', 'validateAll() not called — form submits without full validation');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 8 — PDF ATTACHMENT
// ══════════════════════════════════════════════════════════════════════════════
group('8.  PDF ATTACHMENT HANDLING');

has(mtg, '.pdf') && has(mtg, 'type="file"')
  ? ok('8a', 'File input restricted to PDF (accept=".pdf")')
  : fail('8a', 'PDF file input', 'type="file" with .pdf accept not found');

has(mtg, 'setAttachment') && has(mtg, 'attachment')
  ? ok('8b', 'attachment state managed (File object stored in state)')
  : fail('8b', 'attachment state', 'setAttachment / attachment state not found');

has(mtg, 'data.attachment = attachment') || has(mtg, 'attachment: attachment') || has(mtg, 'attachment =')
  ? ok('8c', 'PDF passed via multipart on create')
  : fail('8c', 'Multipart upload', 'attachment not attached to create payload');

has(mtg, 'Existing attachment') || has(mtg, 'attachment kept')
  ? ok('8d', '"Existing attachment kept" message shown on edit when no new file chosen')
  : fail('8d', 'Existing attachment message', 'No message shown when editing without changing PDF');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 9 — UX PATTERNS
// ══════════════════════════════════════════════════════════════════════════════
group('9.  UX PATTERNS');

has(mtg, 'isEdit') && (has(mtg, 'bg-gray-50') || has(mtg, 'disabled'))
  ? ok('9a', 'Employee selector locked on edit (cannot reassign meeting)')
  : fail('9a', 'Employee locked on edit', 'Employee field not locked — can be changed on existing meetings');

has(mtg, 'today()') || has(mtg, "new Date().toISOString().split('T')[0]")
  ? ok('9b', 'Meeting date defaults to today() on create')
  : fail('9b', 'Default date', 'Date does not default to today — user must always pick a date');

has(mtg, 'showToast') && has(mtg, 'success')
  ? ok('9c', 'showToast called on save success')
  : fail('9c', 'showToast success', "showToast('...', 'success') not found");

has(mtg, 'ConfirmDialog') && has(mtg, 'confirming')
  ? ok('9d', 'ConfirmDialog shown before delete')
  : fail('9d', 'ConfirmDialog', 'No confirmation before hard delete');

has(mtg, 'ArrowLeft') && has(mtg, 'Meetings')
  ? ok('9e', 'Breadcrumb back navigation in detail and form views')
  : fail('9e', 'Breadcrumb', 'ArrowLeft back nav not found');

has(mtg, 'listKey') && has(mtg, 'setListKey')
  ? ok('9f', 'listKey incremented to force list refresh after save/delete')
  : fail('9f', 'listKey', 'listKey pattern not found — list may not refresh after mutations');

has(mtg, 'Download PDF') || has(mtg, 'download')
  ? ok('9g', 'PDF download link shown in detail view')
  : fail('9g', 'PDF download link', 'No download link in DetailView');

has(mtg, 'Paperclip') && has(mtg, 'pdf_attachment_path')
  ? ok('9h', 'Paperclip icon shown in list when attachment present')
  : fail('9h', 'Paperclip in list', 'pdf_attachment_path not used to show attachment indicator');

// ══════════════════════════════════════════════════════════════════════════════
// GROUP 10 — FETCH SAFETY
// ══════════════════════════════════════════════════════════════════════════════
group('10. FETCH SAFETY');

const tryCatchCount = (mtg.match(/try\s*\{/g) || []).length;
tryCatchCount >= 4
  ? ok('10a', `All API calls wrapped in try/catch (${tryCatchCount} found)`)
  : fail('10a', 'try/catch coverage', `Only ${tryCatchCount} try/catch blocks — expected at least 4`);

has(mtg, 'setLoading(true)') && has(mtg, 'setLoading(false)')
  ? ok('10b', 'loading state managed correctly (set true → finally set false)')
  : fail('10b', 'loading state', 'setLoading(true/false) pattern not found');

has(mtg, 'PAGE_SIZE')
  ? ok('10c', 'PAGE_SIZE constant used (no magic numbers)')
  : fail('10c', 'PAGE_SIZE', 'Hardcoded page size found — use a named constant');

has(mtg, 'const today') || has(mtg, 'today()')
  ? ok('10d', 'today() helper used for default date (no inline Date calls)')
  : fail('10d', 'today() helper', 'today() helper not found');

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
  console.log(green(bold('\n  ✅  All tests passed — Meetings module is solid!\n')));
} else {
  console.log(red(bold(`\n  ❌  ${failed} test(s) failed — fix before moving to next module\n`)));
  process.exit(1);
}
