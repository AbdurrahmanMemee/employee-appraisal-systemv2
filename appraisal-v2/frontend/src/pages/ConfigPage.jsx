// =============================================================================
// FILE:    src/pages/ConfigPage.jsx
// PURPOSE: Admin-only settings page — manage all dropdown/lookup tables.
//
// CATEGORIES:
//   departments          → departments.name
//   job_titles           → job_titles.name
//   meeting_types        → meeting_types.name
//   incident_types       → incident_types.name
//   appraisal_sections   → appraisal_section_templates.name + default_weight
//
// KEY RULES:
//   - Admin only — non-admins see an access denied screen
//   - GET /:category returns ALL items including inactive (for management view)
//   - DELETE = soft deactivate (not hard delete) — preserves history
//   - Rename propagates to string copies in employees/meetings/incident_logs
//   - After any mutation → call refreshConfig() to sync global useConfig store
//   - appraisal_sections has extra default_weight field (0–100)
//   - Uniqueness is case-insensitive on backend (409 if duplicate)
//
// ENDPOINTS used:
//   GET    /api/config/:category          — all items inc. inactive
//   POST   /api/config/:category          — add item
//   PUT    /api/config/:category/:id      — rename (+ weight for appraisal_sections)
//   DELETE /api/config/:category/:id      — soft deactivate
//   POST   /api/config/:category/:id/restore — reactivate
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, Plus, Edit2, EyeOff, Eye,
  Check, X, AlertTriangle, Shield,
  Briefcase, Users, MessageSquare, AlertCircle, ClipboardList,
} from 'lucide-react';

import {
  Button, Card, CardHeader, Alert, PageLoader,
} from '../components/ui';

import useAppStore, { useIsAdmin } from '../store/useAppStore';
import { configAPI } from '../services/api';

// =============================================================================
// CATEGORY DEFINITIONS
// =============================================================================

const CATEGORIES = [
  {
    key:       'departments',
    label:     'Departments',
    singular:  'Department',
    icon:      Users,
    color:     'blue',
    hasWeight: false,
    hint:      'Departments shown in employee profiles and filters.',
  },
  {
    key:       'job_titles',
    label:     'Job Titles',
    singular:  'Job Title',
    icon:      Briefcase,
    color:     'purple',
    hasWeight: false,
    hint:      'Job titles used in employee profiles.',
  },
  {
    key:       'meeting_types',
    label:     'Meeting Types',
    singular:  'Meeting Type',
    icon:      MessageSquare,
    color:     'teal',
    hasWeight: false,
    hint:      'Types available when logging a meeting.',
  },
  {
    key:       'incident_types',
    label:     'Incident Types',
    singular:  'Incident Type',
    icon:      AlertCircle,
    color:     'orange',
    hasWeight: false,
    hint:      'Categories available when logging an incident.',
  },
  {
    key:       'appraisal_sections',
    label:     'Appraisal Sections',
    singular:  'Appraisal Section',
    icon:      ClipboardList,
    color:     'green',
    hasWeight: true,
    hint:      'Section templates for appraisals. Default weight auto-fills when a section is selected in an appraisal.',
  },
];

const TAB_STYLES = {
  blue:   'bg-blue-50 text-blue-700 border-blue-300',
  purple: 'bg-purple-50 text-purple-700 border-purple-300',
  teal:   'bg-teal-50 text-teal-700 border-teal-300',
  orange: 'bg-orange-50 text-orange-700 border-orange-300',
  green:  'bg-green-50 text-green-700 border-green-300',
};

// =============================================================================
// EDIT ROW — inline rename for an existing item
// =============================================================================

const EditRow = ({ item, cat, onSave, onCancel }) => {
  const [name,   setName]   = useState(item.name);
  const [weight, setWeight] = useState(String(item.default_weight ?? ''));
  const [error,  setError]  = useState('');
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const validate = () => {
    if (!name.trim()) { setError('Name is required.'); return false; }
    if (cat.hasWeight && weight !== '') {
      const w = parseFloat(weight);
      if (isNaN(w) || w < 0 || w > 100) {
        setError('Weight must be 0–100.');
        return false;
      }
    }
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      name: name.trim(),
      ...(cat.hasWeight ? { default_weight: weight === '' ? undefined : parseFloat(weight) } : {}),
    });
  };

  const handleKey = (e) => {
    if (e.key === 'Enter')  handleSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <tr className="bg-blue-50 border-b border-blue-100">
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1">
          <input
            ref={nameRef}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={handleKey}
            className={`text-sm border rounded-lg px-3 py-1.5 w-full
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${error ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Item name…"
          />
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </div>
      </td>
      {cat.hasWeight && (
        <td className="px-4 py-2 w-36">
          <input
            type="number"
            value={weight}
            onChange={e => { setWeight(e.target.value); setError(''); }}
            onKeyDown={handleKey}
            min="0" max="100" step="0.5"
            placeholder="Weight %"
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-full
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-2 w-20 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave}
            className="p-1.5 rounded-lg bg-green-100 text-green-700
              hover:bg-green-200 transition-colors" title="Save (Enter)">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={onCancel}
            className="p-1.5 rounded-lg bg-gray-100 text-gray-500
              hover:bg-gray-200 transition-colors" title="Cancel (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// =============================================================================
// ADD ROW — appears at bottom of table when "Add" is clicked
// =============================================================================

const AddRow = ({ cat, onSave, onCancel }) => {
  const [name,   setName]   = useState('');
  const [weight, setWeight] = useState('');
  const [error,  setError]  = useState('');
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (cat.hasWeight && weight !== '') {
      const w = parseFloat(weight);
      if (isNaN(w) || w < 0 || w > 100) { setError('Weight must be 0–100.'); return; }
    }
    onSave({
      name: name.trim(),
      ...(cat.hasWeight ? { default_weight: weight === '' ? undefined : parseFloat(weight) } : {}),
    });
  };

  const handleKey = (e) => {
    if (e.key === 'Enter')  handleSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <tr className="bg-green-50 border-b border-green-100">
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1">
          <input
            ref={nameRef}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={handleKey}
            className={`text-sm border rounded-lg px-3 py-1.5 w-full
              focus:outline-none focus:ring-2 focus:ring-green-500
              ${error ? 'border-red-400' : 'border-gray-300'}`}
            placeholder={`New ${cat.singular.toLowerCase()} name…`}
          />
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </div>
      </td>
      {cat.hasWeight && (
        <td className="px-4 py-2 w-36">
          <input
            type="number"
            value={weight}
            onChange={e => { setWeight(e.target.value); setError(''); }}
            onKeyDown={handleKey}
            min="0" max="100" step="0.5"
            placeholder="Weight %"
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-full
              focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </td>
      )}
      <td className="px-4 py-2 w-20 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave}
            className="p-1.5 rounded-lg bg-green-500 text-white
              hover:bg-green-600 transition-colors" title="Add (Enter)">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={onCancel}
            className="p-1.5 rounded-lg bg-gray-100 text-gray-500
              hover:bg-gray-200 transition-colors" title="Cancel (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// =============================================================================
// CATEGORY PANEL — table + actions for a single category
// =============================================================================

const CategoryPanel = ({ cat, refreshConfig }) => {
  const showToast = useAppStore(s => s.showToast);

  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [editingId,  setEditingId]  = useState(null);
  const [adding,     setAdding]     = useState(false);
  const [actioning,  setActioning]  = useState(null); // id being toggled

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await configAPI.getCategory(cat.key);
      setItems(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cat.key]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async (payload) => {
    try {
      await configAPI.create(cat.key, payload);
      showToast(`"${payload.name}" added.`, 'success');
      setAdding(false);
      await fetchItems();
      refreshConfig();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEdit = async (id, payload) => {
    try {
      await configAPI.update(cat.key, id, payload);
      showToast(`Renamed to "${payload.name}".`, 'success');
      setEditingId(null);
      await fetchItems();
      refreshConfig();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeactivate = async (item) => {
    setActioning(item.id);
    try {
      await configAPI.deactivate(cat.key, item.id);
      showToast(`"${item.name}" deactivated — removed from dropdowns.`, 'success');
      await fetchItems();
      refreshConfig();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActioning(null);
    }
  };

  const handleRestore = async (item) => {
    setActioning(item.id);
    try {
      await configAPI.restore(cat.key, item.id);
      showToast(`"${item.name}" reactivated.`, 'success');
      await fetchItems();
      refreshConfig();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActioning(null);
    }
  };

  const activeCount   = items.filter(i => i.is_active).length;
  const inactiveCount = items.length - activeCount;

  // Active items first, then inactive — both alphabetical
  const sorted = [...items].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-3">
      {/* Sub-header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-gray-500">{cat.hint}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {activeCount} active
            {inactiveCount > 0 && ` · ${inactiveCount} inactive (kept for history)`}
          </p>
        </div>
        <Button icon={Plus} size="sm"
          onClick={() => { setAdding(true); setEditingId(null); }}
          disabled={adding}>
          Add {cat.singular}
        </Button>
      </div>

      {error && <Alert type="error" message={error} onDismiss={() => setError('')} />}

      <Card padding={false}>
        {loading ? (
          <div className="py-12"><PageLoader /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold
                    text-gray-500 uppercase tracking-wide">
                    Name
                  </th>
                  {cat.hasWeight && (
                    <th className="px-4 py-3 text-left text-xs font-semibold
                      text-gray-500 uppercase tracking-wide w-36">
                      Default Weight %
                    </th>
                  )}
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(item => {
                  if (editingId === item.id) {
                    return (
                      <EditRow key={item.id} item={item} cat={cat}
                        onSave={payload => handleEdit(item.id, payload)}
                        onCancel={() => setEditingId(null)} />
                    );
                  }
                  return (
                    <tr key={item.id}
                      className={`group transition-colors
                        ${item.is_active ? 'hover:bg-gray-50' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium
                            ${item.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                            {item.name}
                          </span>
                          {!item.is_active && (
                            <span className="text-xs px-1.5 py-0.5 rounded
                              bg-gray-200 text-gray-500 font-medium">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      {cat.hasWeight && (
                        <td className="px-4 py-3 w-36">
                          <span className="text-sm text-gray-600">
                            {item.default_weight != null
                              ? `${item.default_weight}%`
                              : <span className="text-gray-400 italic text-xs">not set</span>}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 w-20">
                        <div className="flex items-center justify-end gap-1
                          opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.is_active ? (
                            <>
                              <button
                                onClick={() => { setEditingId(item.id); setAdding(false); }}
                                className="p-1.5 rounded-lg text-gray-400
                                  hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="Rename">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeactivate(item)}
                                disabled={actioning === item.id}
                                className="p-1.5 rounded-lg text-gray-400
                                  hover:bg-red-50 hover:text-red-500 transition-colors
                                  disabled:opacity-40"
                                title="Deactivate">
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleRestore(item)}
                              disabled={actioning === item.id}
                              className="p-1.5 rounded-lg text-gray-400
                                hover:bg-green-50 hover:text-green-600 transition-colors
                                disabled:opacity-40"
                              title="Reactivate">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Add Row */}
                {adding && (
                  <AddRow cat={cat}
                    onSave={handleAdd}
                    onCancel={() => setAdding(false)} />
                )}

                {/* Empty state */}
                {items.length === 0 && !adding && (
                  <tr>
                    <td colSpan={cat.hasWeight ? 3 : 2}
                      className="px-4 py-10 text-center text-sm text-gray-400">
                      No {cat.label.toLowerCase()} configured yet.{' '}
                      <button onClick={() => setAdding(true)}
                        className="text-blue-600 hover:underline">
                        Add the first one.
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Inactive explanation */}
      {inactiveCount > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Inactive items are hidden from dropdowns but kept so existing records
          remain readable. Click the eye icon to reactivate.
        </p>
      )}
    </div>
  );
};

// =============================================================================
// ROOT — ConfigPage
// =============================================================================

const ConfigPage = () => {
  const isAdmin = useIsAdmin();

  // Attempt to grab a config refresh function from the store.
  // Handles different store versions gracefully.
  const refreshConfig = useAppStore(s => s.fetchConfig || s.loadConfig || s.refreshConfig || (() => {}));

  const [activeTab, setActiveTab] = useState(CATEGORIES[0].key);

  // Non-admins — hard block
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto mt-24 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center
            justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-gray-500 text-sm">
            The Settings page is only accessible to administrators.
          </p>
        </div>
      </div>
    );
  }

  const activeCat = CATEGORIES.find(c => c.key === activeTab);

  return (
    <div className="p-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">
            Manage dropdown options used throughout the system
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-4">
        {CATEGORIES.map(cat => {
          const Icon   = cat.icon;
          const active = activeTab === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border
                text-sm font-medium transition-all
                ${active
                  ? TAB_STYLES[cat.color] + ' shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Active category panel — key forces remount on tab change */}
      {activeCat && (
        <CategoryPanel
          key={activeTab}
          cat={activeCat}
          refreshConfig={refreshConfig}
        />
      )}
    </div>
  );
};

export default ConfigPage;
