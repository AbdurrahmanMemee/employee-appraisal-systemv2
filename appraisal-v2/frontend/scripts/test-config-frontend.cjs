// =============================================================================
// FILE:    frontend/scripts/test-config-frontend.cjs
// PURPOSE: Phase 9 — Config (Settings) module tests.
// GROUPS: 1 File existence | 2 App wiring | 3 Page structure | 4 Categories
//         5 API usage | 6 Inline edit | 7 Add row | 8 Deactivate/restore
//         9 Weight field | 10 Role guard | 11 Store refresh | 12 UX patterns
// =============================================================================
'use strict';
const fs = require('fs'), path = require('path');
const FRONTEND = path.resolve(__dirname, '..');
const SRC = path.join(FRONTEND, 'src');
const green = s=>`\x1b[32m${s}\x1b[0m`, red=s=>`\x1b[31m${s}\x1b[0m`;
const yellow=s=>`\x1b[33m${s}\x1b[0m`, bold=s=>`\x1b[1m${s}\x1b[0m`, dim=s=>`\x1b[2m${s}\x1b[0m`;
let passed=0,failed=0,skipped=0;
const ok=(id,d)=>{console.log(`  ${green('✅')} ${dim(id)} ${d}`);passed++;};
const fail=(id,d,r)=>{console.log(`  ${red('❌')} ${dim(id)} ${d}\n       ${red('→')} ${r}`);failed++;};
const group=t=>console.log(`\n${bold(t)}`);
const srcExists=rel=>fs.existsSync(path.join(SRC,rel));
const readSrc=rel=>{try{return fs.readFileSync(path.join(SRC,rel),'utf8');}catch{return '';}};
const has=(src,pat)=>typeof pat==='string'?src.includes(pat):pat.test(src);

console.log(bold('\n╔══════════════════════════════════════════════════════╗'));
console.log(bold(  '║   EAS v2 — Phase 9 Config Module Tests              ║'));
console.log(bold(  '╚══════════════════════════════════════════════════════╝'));
console.log(dim(`  Src: ${SRC}\n`));

group('1.  FILE EXISTENCE');
srcExists('pages/ConfigPage.jsx')?ok('1a','ConfigPage.jsx exists'):fail('1a','ConfigPage.jsx','File missing');
srcExists('App.jsx')?ok('1b','App.jsx exists'):fail('1b','App.jsx','File missing');

group('2.  APP.JSX WIRING');
const app=readSrc('App.jsx');
has(app,/import\s+ConfigPage\s+from\s+['"]\.\/pages\/ConfigPage['"]/)?ok('2a','ConfigPage imported directly'):fail('2a','ConfigPage import',"Expected: import ConfigPage from './pages/ConfigPage'");
const pb=app.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/pages\/Placeholder['"]/)?.[1]||'';
!pb.includes('ConfigPage')?ok('2b','ConfigPage NOT in Placeholder block'):fail('2b','Placeholder cleanup','ConfigPage still in Placeholder imports');
(has(app,'path="/config"')&&has(app,'<ConfigPage'))?ok('2c','/config route uses <ConfigPage />'):fail('2c','/config route','Route not wired');
['incidents','schedules','appraisals','meetings','employees'].every(r=>has(app,`path="/${r}"`))?ok('2d','All previous routes intact'):fail('2d','Previous routes','A route was removed');

group('3.  PAGE STRUCTURE');
const cfg=readSrc('pages/ConfigPage.jsx');
(has(cfg,'const ConfigPage')||has(cfg,'function ConfigPage'))?ok('3a','ConfigPage component defined'):fail('3a','ConfigPage','Root component not found');
has(cfg,'export default ConfigPage')?ok('3b','Default export is ConfigPage'):fail('3b','Export','Expected: export default ConfigPage');
(has(cfg,'const CategoryPanel')||has(cfg,'function CategoryPanel'))?ok('3c','CategoryPanel defined'):fail('3c','CategoryPanel','Per-tab panel missing');
(has(cfg,'const EditRow')||has(cfg,'function EditRow'))?ok('3d','EditRow defined'):fail('3d','EditRow','Inline edit row missing');
(has(cfg,'const AddRow')||has(cfg,'function AddRow'))?ok('3e','AddRow defined'):fail('3e','AddRow','Add row missing');
(has(cfg,'activeTab')&&has(cfg,'setActiveTab'))?ok('3f','Tab state: activeTab'):fail('3f','Tab state','activeTab not found');

group('4.  CATEGORY DEFINITIONS');
['departments','job_titles','meeting_types','incident_types','appraisal_sections'].every(c=>has(cfg,c))?ok('4a','All 5 categories present'):fail('4a','Categories','One or more missing');
(has(cfg,'const CATEGORIES')&&has(cfg,'hasWeight'))?ok('4b','CATEGORIES const with hasWeight'):fail('4b','CATEGORIES','hasWeight flag missing');
(has(cfg,'singular')||has(cfg,'label'))?ok('4c','Category has display label'):fail('4c','Label','Missing display label');
has(cfg,'hint')?ok('4d','Category has hint text'):fail('4d','Hint','hint field missing');

group('5.  API USAGE');
(has(cfg,'configAPI')&&has(cfg,"from '../services/api'"))?ok('5a','configAPI imported'):fail('5a','configAPI import','Not imported from services/api');
[['5b','configAPI.getCategory','fetch all inc inactive'],['5c','configAPI.create','add item'],['5d','configAPI.update','rename'],['5e','configAPI.deactivate','soft deactivate'],['5f','configAPI.restore','reactivate']].forEach(([id,m,d])=>{has(cfg,m)?ok(id,`Calls ${m}`):fail(id,m,`${m} missing — ${d} broken`);});

group('6.  INLINE EDITING');
(has(cfg,'editingId')&&has(cfg,'setEditingId'))?ok('6a','editingId state'):fail('6a','editingId','Missing');
(has(cfg,'editingId === item.id')||has(cfg,'editingId==='))?ok('6b','EditRow conditional on editingId'):fail('6b','EditRow condition','Conditional render missing');
has(cfg,'Enter')?ok('6c','Enter key saves edit'):fail('6c','Enter key','Keyboard shortcut missing');
has(cfg,'Escape')?ok('6d','Escape key cancels edit'):fail('6d','Escape key','Keyboard shortcut missing');
(has(cfg,'useRef')&&has(cfg,'focus'))?ok('6e','Input auto-focused'):fail('6e','Auto-focus','useRef+focus not found');

group('7.  ADD ROW');
(has(cfg,'adding')&&has(cfg,'setAdding'))?ok('7a','adding state present'):fail('7a','adding state','Missing');
(has(cfg,'disabled={adding}')||has(cfg,'disabled='))?ok('7b','Add button disabled while adding'):fail('7b','Disabled','Button not disabled while AddRow open');

group('8.  SOFT DEACTIVATE / RESTORE');
has(cfg,'is_active')?ok('8a','is_active field consumed'):fail('8a','is_active','Not referenced');
(has(cfg,'line-through')||has(cfg,'Inactive'))?ok('8b','Inactive items visually distinct'):fail('8b','Inactive style','No visual distinction');
(has(cfg,'EyeOff')&&has(cfg,'Eye'))?ok('8c','EyeOff/Eye icons present'):fail('8c','Eye icons','Icons missing');
(has(cfg,'handleDeactivate')||has(cfg,'deactivate'))?ok('8d','handleDeactivate defined'):fail('8d','handleDeactivate','Missing');
(has(cfg,'handleRestore')||has(cfg,'restore'))?ok('8e','handleRestore defined'):fail('8e','handleRestore','Missing');
(has(cfg,'inactiveCount')||has(cfg,'inactive'))?ok('8f','Inactive count shown'):fail('8f','Inactive count','User has no indication');

group('9.  APPRAISAL_SECTIONS WEIGHT');
has(cfg,'hasWeight')?ok('9a','hasWeight drives conditional column'):fail('9a','hasWeight','Missing');
has(cfg,'default_weight')?ok('9b','default_weight in data and form'):fail('9b','default_weight','Missing');
(has(cfg,'Weight %')||has(cfg,'weight'))?ok('9c','Weight column header present'):fail('9c','Weight column','Missing');
(has(cfg,'0–100')||has(cfg,'min="0"')||has(cfg,'max="100"'))?ok('9d','Weight constrained 0–100'):fail('9d','Weight range','Not constrained');

group('10. ROLE GUARD');
has(cfg,'useIsAdmin')?ok('10a','useIsAdmin imported'):fail('10a','useIsAdmin','Missing');
(has(cfg,'isAdmin')&&(has(cfg,'Access Restricted')||has(cfg,'Shield')))?ok('10b','Non-admin access denied screen'):fail('10b','Access denied','No UI for non-admins');
has(cfg,'Shield')?ok('10c','Shield icon on access denied'):fail('10c','Shield','Missing');

group('11. CONFIG STORE REFRESH');
has(cfg,'refreshConfig')?ok('11a','refreshConfig from store'):fail('11a','refreshConfig','Not pulled from store');
(has(cfg,'refreshConfig()')||has(cfg,'refreshConfig('))?ok('11b','refreshConfig() called after mutations'):fail('11b','refreshConfig called','Not invoked after mutations');

group('12. UX PATTERNS');
(has(cfg,'showToast')&&has(cfg,'success'))?ok('12a','Success toast'):fail('12a','showToast','Missing success toast');
(has(cfg,'showToast')&&has(cfg,'error'))?ok('12b','Error toast'):fail('12b','Error toast','Missing error toast');
(has(cfg,'opacity-0 group-hover:opacity-100')||has(cfg,'group-hover'))?ok('12c','Hover-only action buttons'):fail('12c','Hover actions','Buttons always visible');
(has(cfg,'sorted')&&has(cfg,'is_active')&&has(cfg,'localeCompare'))?ok('12d','Sorted active-first alphabetical'):fail('12d','Sort order','Not sorted correctly');
has(cfg,'key={activeTab}')?ok('12e','key={activeTab} on CategoryPanel'):fail('12e','Panel key','Forces remount on tab change');
const tc=(cfg.match(/try\s*\{/g)||[]).length;tc>=4?ok('12f',`try/catch: ${tc} found`):fail('12f','try/catch',`Only ${tc} — need 4+`);

const total=passed+failed+skipped;
console.log('\n'+bold('═'.repeat(54)));
console.log(bold('  RESULTS'));
console.log(bold('═'.repeat(54)));
console.log(`  ${green('Passed')}:  ${passed}`);
console.log(`  ${red('Failed')}:  ${failed}`);
console.log(`  ${yellow('Skipped')}: ${skipped}`);
console.log(`  Total:   ${total}`);
console.log(bold('═'.repeat(54)));
if(failed===0){console.log(green(bold('\n  ✅  All tests passed!\n')));}
else{console.log(red(bold(`\n  ❌  ${failed} failed\n`)));process.exit(1);}
