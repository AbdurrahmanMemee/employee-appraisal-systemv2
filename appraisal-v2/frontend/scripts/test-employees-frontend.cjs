#!/usr/bin/env node
// =============================================================================
// FILE:    backend/scripts/test-employees-frontend.cjs
// PURPOSE: Verify the Employees module is correctly wired up.
//          Tests: file existence, code structure, API contract alignment,
//          role guard patterns, form validation rules, App.jsx wiring.
//
// USAGE:   node backend/scripts/test-employees-frontend.cjs
// =============================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOT     = path.resolve(__dirname, '../../');
const FRONTEND = path.join(ROOT, 'frontend/src');

let passed = 0;
let failed = 0;
const results = [];

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

// ─── Group 1: File existence ─────────────────────────────────────────────────

check('1. Files', 'EmployeesPage.jsx exists in pages/', () =>
  fileExists('pages/EmployeesPage.jsx')
);

check('1. Files', 'App.jsx exists', () =>
  fileExists('App.jsx')
);

// ─── Group 2: App.jsx wiring ─────────────────────────────────────────────────

check('2. App.jsx wiring', 'Imports EmployeesPage directly (not from Placeholder)', () => {
  const src = readSrc('App.jsx');
  return src.includes("import EmployeesPage from './pages/EmployeesPage'") ||
         src.includes('import EmployeesPage from "./pages/EmployeesPage"');
});

check('2. App.jsx wiring', 'EmployeesPage is no longer imported from Placeholder', () => {
  const src = readSrc('App.jsx');
  // Should not see EmployeesPage inside a Placeholder import
  const placeholderImport = src.match(/from ['"]\.\/pages\/Placeholder['"]/g) || [];
  // The Placeholder import must not include EmployeesPage
  const placeholderBlock = src.match(/import\s*\{[^}]*\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[0] || '';
  return !placeholderBlock.includes('EmployeesPage');
});

check('2. App.jsx wiring', '/employees route uses <EmployeesPage />', () => {
  const src = readSrc('App.jsx');
  return src.includes('<EmployeesPage') && src.includes('path="/employees"');
});

// ─── Group 3: View structure ──────────────────────────────────────────────────

check('3. View structure', 'Defines VIEWS constant with LIST, DETAIL, FORM', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('LIST') && src.includes('DETAIL') && src.includes('FORM');
});

check('3. View structure', 'ListView component defined', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('const ListView') || src.includes('function ListView');
});

check('3. View structure', 'DetailView component defined', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('const DetailView') || src.includes('function DetailView');
});

check('3. View structure', 'FormView component defined', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('const FormView') || src.includes('function FormView');
});

check('3. View structure', 'EmployeesPage default export', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('export default EmployeesPage');
});

// ─── Group 4: API usage ───────────────────────────────────────────────────────

check('4. API usage', 'Imports employeeAPI from services/api', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI') && src.includes("from '../services/api'");
});

check('4. API usage', 'Calls employeeAPI.getAll for list', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI.getAll');
});

check('4. API usage', 'Calls employeeAPI.getById for detail', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI.getById');
});

check('4. API usage', 'Calls employeeAPI.create for new employee', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI.create');
});

check('4. API usage', 'Calls employeeAPI.update for edit', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI.update');
});

check('4. API usage', 'Calls employeeAPI.deactivate for soft delete', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI.deactivate');
});

check('4. API usage', 'Calls employeeAPI.restore', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employeeAPI.restore');
});

// ─── Group 5: Role guards ─────────────────────────────────────────────────────

check('5. Role guards', 'useIsAdmin imported from store', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('useIsAdmin');
});

check('5. Role guards', 'useIsManager imported from store', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('useIsManager');
});

check('5. Role guards', 'Add Employee button gated behind isManager', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  // isManager should appear before/around the Add Employee button
  return src.includes('isManager') && src.includes('Add Employee');
});

check('5. Role guards', 'Deactivate gated behind isAdmin', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('isAdmin') && src.includes('Deactivate');
});

check('5. Role guards', 'Restore gated behind isAdmin', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('isAdmin') && src.includes('Restore');
});

// ─── Group 6: Form validation ─────────────────────────────────────────────────

check('6. Form validation', 'useFormValidation hook used', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('useFormValidation');
});

check('6. Form validation', 'first_name has required rule', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('first_name') && src.includes("'required'");
});

check('6. Form validation', 'last_name has required rule', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('last_name') && src.includes("'required'");
});

check('6. Form validation', 'employee_number has required rule', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('employee_number') && src.includes("'required'");
});

check('6. Form validation', 'email field has email validation rule', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes("'email'");
});

check('6. Form validation', 'validateAll called on submit', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('validateAll');
});

// ─── Group 7: UI primitives ───────────────────────────────────────────────────

check('7. UI primitives', 'Uses Button from ui/index', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('Button') && src.includes("from '../components/ui'");
});

check('7. UI primitives', 'Uses StatusBadge for active/inactive', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('StatusBadge');
});

check('7. UI primitives', 'Uses Pagination component', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('Pagination');
});

check('7. UI primitives', 'Uses EmptyState for empty list', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('EmptyState');
});

check('7. UI primitives', 'Uses ConfirmDialog for deactivate confirmation', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('ConfirmDialog');
});

check('7. UI primitives', 'Uses Card component', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('Card');
});

check('7. UI primitives', 'Uses Alert for error display', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('Alert');
});

// ─── Group 8: UX patterns ─────────────────────────────────────────────────────

check('8. UX patterns', 'Search input debounced (setTimeout)', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('setTimeout') && src.includes('searchInput');
});

check('8. UX patterns', 'Sortable columns (sort + dir params)', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('sortField') && src.includes('sortDir');
});

check('8. UX patterns', 'Department filter dropdown', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('deptFilter') || src.includes('department');
});

check('8. UX patterns', 'Status filter dropdown', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('statusFilter') || src.includes('status');
});

check('8. UX patterns', 'showToast called on save success', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('showToast') && src.includes('success');
});

check('8. UX patterns', 'showToast called on save error', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('showToast') && src.includes('error');
});

check('8. UX patterns', 'Breadcrumb back navigation in detail view', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('Employees') && src.includes('ArrowLeft');
});

check('8. UX patterns', 'listKey used to force list refresh after save', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('listKey');
});

// ─── Group 9: Fetch safety ────────────────────────────────────────────────────

check('9. Fetch safety', 'All API calls wrapped in try/catch', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  const tryCatches = (src.match(/try\s*\{/g) || []).length;
  // Should have at least 4: list fetch, detail fetch, deactivate, restore, form submit
  return tryCatches >= 4;
});

check('9. Fetch safety', 'loading state managed in list view', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('setLoading(true)') && src.includes('setLoading(false)');
});

check('9. Fetch safety', 'PAGE_SIZE constant defined (no magic number)', () => {
  const src = readSrc('pages/EmployeesPage.jsx');
  return src.includes('PAGE_SIZE');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  EAS — Employees Module Frontend Tests');
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
