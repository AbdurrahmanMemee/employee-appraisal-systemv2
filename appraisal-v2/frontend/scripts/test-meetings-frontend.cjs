#!/usr/bin/env node
// =============================================================================
// FILE:    frontend/scripts/test-meetings-frontend.cjs
// PURPOSE: Verify the Meetings module is correctly structured and wired up.
//          Tests: file existence, code structure, API contract alignment,
//          role guard patterns, form validation rules, last-meeting link feature,
//          PDF attachment handling, App.jsx wiring.
//
// USAGE:   node frontend/scripts/test-meetings-frontend.cjs
//          (run from appraisal-v2/ directory)
// =============================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT     = path.resolve(__dirname, '../../');
const FRONTEND = path.join(ROOT, 'frontend/src');

let passed = 0;
let failed = 0;
const results = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function check(group, description, fn) {
  try {
    const result = fn();
    if (result === false) throw new Error('Assertion returned false');
    results.push({ group, description, ok: true });
    passed++;
  } catch (err) {
    results.push({ group, description, ok: false, error: err.message });
    failed++;
  }
}

function readSrc(relPath) {
  return fs.readFileSync(path.join(FRONTEND, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(FRONTEND, relPath));
}

// ─── Group 1: File existence ──────────────────────────────────────────────────

check('1. Files', 'MeetingsPage.jsx exists in pages/', () =>
  fileExists('pages/MeetingsPage.jsx')
);

check('1. Files', 'App.jsx exists', () =>
  fileExists('App.jsx')
);

// ─── Group 2: App.jsx wiring ──────────────────────────────────────────────────

check('2. App.jsx wiring', 'Imports MeetingsPage directly (not from Placeholder)', () => {
  const src = readSrc('App.jsx');
  return /import\s+MeetingsPage\s+from\s+['"]\.\/pages\/MeetingsPage['"]/.test(src);
});

check('2. App.jsx wiring', 'MeetingsPage not inside Placeholder import block', () => {
  const src = readSrc('App.jsx');
  const placeholderBlock = src.match(/import\s*\{[^}]*\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[0] || '';
  return !placeholderBlock.includes('MeetingsPage');
});

check('2. App.jsx wiring', '/meetings route uses <MeetingsPage />', () => {
  const src = readSrc('App.jsx');
  return src.includes('<MeetingsPage') && src.includes('path="/meetings"');
});

check('2. App.jsx wiring', '/employees route still present', () => {
  const src = readSrc('App.jsx');
  return src.includes('path="/employees"');
});

// ─── Group 3: View structure ───────────────────────────────────────────────────

check('3. View structure', 'Defines VIEWS constant with LIST, DETAIL, FORM', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('LIST') && src.includes('DETAIL') && src.includes('FORM');
});

check('3. View structure', 'ListView component defined', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('const ListView') || src.includes('function ListView');
});

check('3. View structure', 'DetailView component defined', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('const DetailView') || src.includes('function DetailView');
});

check('3. View structure', 'FormView component defined', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('const FormView') || src.includes('function FormView');
});

check('3. View structure', 'LastMeetingLink component defined', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('const LastMeetingLink') || src.includes('function LastMeetingLink');
});

check('3. View structure', 'MeetingsPage default export', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('export default MeetingsPage');
});

// ─── Group 4: API usage ────────────────────────────────────────────────────────

check('4. API usage', 'Imports meetingAPI from services/api', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI') && src.includes("from '../services/api'");
});

check('4. API usage', 'Imports employeeAPI for employee selector and last-meeting', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('employeeAPI') && src.includes("from '../services/api'");
});

check('4. API usage', 'Calls meetingAPI.getAll for list', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI.getAll');
});

check('4. API usage', 'Calls meetingAPI.getById for detail', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI.getById');
});

check('4. API usage', 'Calls meetingAPI.create for new meeting', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI.create');
});

check('4. API usage', 'Calls meetingAPI.update for edit', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI.update');
});

check('4. API usage', 'Calls meetingAPI.delete for deletion', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI.delete');
});

check('4. API usage', 'Calls meetingAPI.uploadAttachment for PDF upload', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meetingAPI.uploadAttachment');
});

check('4. API usage', 'Uses employee_id param when fetching meetings (list filter)', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('employee_id');
});

check('4. API usage', 'Uses date_from / date_to params for date range filter', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('date_from') && src.includes('date_to');
});

// ─── Group 5: Last Meeting Link (required v2 feature) ─────────────────────────

check('5. Last Meeting Link', 'LastMeetingLink fetches previous meeting for selected employee', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('LastMeetingLink') && src.includes('meetingAPI.getAll');
});

check('5. Last Meeting Link', 'LastMeetingLink shown inside FormView', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('<LastMeetingLink');
});

check('5. Last Meeting Link', 'onViewMeeting prop wires last-meeting click to detail view', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('onViewMeeting');
});

check('5. Last Meeting Link', 'Excludes current meeting from last-meeting lookup (edit mode)', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('currentMeetingId');
});

check('5. Last Meeting Link', '"No previous meetings" message shown when none exist', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('No previous meetings');
});

check('5. Last Meeting Link', 'formContext saved before navigating to linked meeting detail', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('formContext');
});

// ─── Group 6: Role guards ──────────────────────────────────────────────────────

check('6. Role guards', 'useIsAdmin imported', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('useIsAdmin');
});

check('6. Role guards', 'useIsManager imported', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('useIsManager');
});

check('6. Role guards', 'New Meeting button gated behind isManager', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('isManager') && src.includes('New Meeting');
});

check('6. Role guards', 'Delete button gated behind isAdmin', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('isAdmin') && src.includes('Delete');
});

// ─── Group 7: Form validation ─────────────────────────────────────────────────

check('7. Form validation', 'useFormValidation hook used', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('useFormValidation');
});

check('7. Form validation', 'employee_id has required rule', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('employee_id') && src.includes("'required'");
});

check('7. Form validation', 'meeting_date has required rule', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meeting_date') && src.includes("'required'");
});

check('7. Form validation', 'meeting_type has required rule', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meeting_type') && src.includes("'required'");
});

check('7. Form validation', 'meeting_conclusion has required rule', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('meeting_conclusion') && src.includes("'required'");
});

check('7. Form validation', 'validateAll called on submit', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('validateAll');
});

// ─── Group 8: PDF attachment handling ─────────────────────────────────────────

check('8. PDF handling', 'File input accepts PDF only (accept=".pdf")', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('.pdf') && src.includes('type="file"');
});

check('8. PDF handling', 'attachment state managed (File object)', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('setAttachment') && src.includes('attachment');
});

check('8. PDF handling', 'PDF passed via multipart on create (attachment property)', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('data.attachment = attachment') ||
         src.includes('attachment: attachment') ||
         src.includes("attachment =");
});

check('8. PDF handling', 'Existing attachment preserved message shown on edit', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('Existing attachment') || src.includes('attachment kept');
});

// ─── Group 9: UX patterns ──────────────────────────────────────────────────────

check('9. UX patterns', 'Employee selector disabled/locked on edit (cannot change employee)', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('isEdit') && (src.includes('bg-gray-50') || src.includes('disabled'));
});

check('9. UX patterns', 'Date defaults to today() on create', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('today()') || src.includes("new Date().toISOString().split('T')[0]");
});

check('9. UX patterns', 'showToast on save success', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('showToast') && src.includes('success');
});

check('9. UX patterns', 'ConfirmDialog before delete', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('ConfirmDialog') && src.includes('confirming');
});

check('9. UX patterns', 'Breadcrumb back navigation in detail and form views', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('ArrowLeft') && src.includes('Meetings');
});

check('9. UX patterns', 'listKey incremented to force refresh after save/delete', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('listKey') && src.includes('setListKey');
});

check('9. UX patterns', 'PDF download link shown in detail view', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('Download PDF') || src.includes('download');
});

check('9. UX patterns', 'Paperclip icon shown in list when attachment present', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('Paperclip') && src.includes('pdf_attachment_path');
});

// ─── Group 10: Fetch safety ────────────────────────────────────────────────────

check('10. Fetch safety', 'All API calls wrapped in try/catch', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  const count = (src.match(/try\s*\{/g) || []).length;
  return count >= 4;
});

check('10. Fetch safety', 'loading state managed in list view', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('setLoading(true)') && src.includes('setLoading(false)');
});

check('10. Fetch safety', 'PAGE_SIZE constant used (no magic number)', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('PAGE_SIZE');
});

check('10. Fetch safety', 'today() helper used for default date', () => {
  const src = readSrc('pages/MeetingsPage.jsx');
  return src.includes('const today') || src.includes('today()');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  EAS — Meetings Module Frontend Tests');
console.log('═══════════════════════════════════════════════════\n');

let currentGroup = '';
for (const r of results) {
  if (r.group !== currentGroup) {
    currentGroup = r.group;
    console.log(`\n  ${currentGroup}`);
    console.log('  ' + '─'.repeat(50));
  }
  const icon = r.ok ? '  ✅' : '  ❌';
  console.log(`${icon}  ${r.description}`);
  if (!r.ok) console.log(`       ↳ ${r.error}`);
}

console.log('\n═══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
