// =============================================================================
// FILE:    src/components/forms/AppraisalForm.jsx
// PURPOSE: Appraisal create/edit form with sectional ratings, weights, status workflow,
//          employee locked on edit, SectionEditor for dynamic add/remove sections,
//          weight total indicator, rating preview, and overall score calculation.
//          Extracted from AppraisalsPage.jsx FormView (lines 919-1174) + SectionEditor (lines 763-900)
//
// EXPORTS: default AppraisalForm
//
// FEATURES:
//   - Employee locked on edit (cannot reassign)
//   - Sections with ratings (0-5), weights (0-100), and custom names
//   - Add/remove sections dynamically via SectionEditor component
//   - Weight total bar with color-coded feedback (green/yellow/red)
//   - Overall score preview (weighted average, mirrors server formula)
//   - Previous rating comparison from last appraisal (read-only)
//   - Status workflow: Draft → In Progress only (Completed/Cancelled on detail view)
//   - Cannot edit if status is Completed or Cancelled
//   - All field validation via useFormValidation hook
//   - Full create/edit mode support
//   - Section comment fields for detailed notes
//   - Live rating preview showing what the overall will be
//   - StarRating component displays rating as filled stars + decimal value
//   - Breadcrumb navigation back to appraisals list
//
// API:     appraisalAPI.create / update
//          employeeAPI.getAll — for employee selector
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  Plus, ArrowLeft, ChevronRight, Trash2, Star, User, Info,
} from 'lucide-react';
import {
  Button, Card, CardHeader, Field, Input, Select, Textarea, Alert,
} from '../ui';
import useAppStore from '../../store/useAppStore';
import useFormValidation from '../../hooks/useFormValidation';
import { appraisalAPI, employeeAPI } from '../../services/api';

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────

/**
 * formatDate - Format a date value to ZA locale (DD MMM YYYY)
 * @param {Date|string|null} val
 * @returns {string} formatted date or '—'
 */
const formatDate = (val) => {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d)
    ? '—'
    : d.toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
};

/**
 * toInputDate - Convert date to YYYY-MM-DD format for input[type="date"]
 * @param {Date|string|null} val
 * @returns {string} date in YYYY-MM-DD or empty string
 */
const toInputDate = (val) => {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
};

/**
 * today - Get today's date in YYYY-MM-DD format
 * @returns {string} today's date
 */
const today = () => new Date().toISOString().split('T')[0];

/**
 * nextYear - Get one year from today in YYYY-MM-DD format
 * @returns {string} date one year from now
 */
const nextYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

// ─── STAR RATING COMPONENT (READ-ONLY) ─────────────────────────────────────

/**
 * StarRating - Display a 5-star rating visualization with numeric value
 * @param {number} value - rating value (0-5)
 * @param {number} max - max rating (default 5)
 * @returns {JSX.Element} 5 stars + decimal value
 */
const StarRating = ({ value, max = 5 }) => (
  <div className="flex items-center gap-1.5">
    <div className="flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i <= Math.round(value)
              ? 'text-yellow-400 fill-yellow-400'
              : 'text-gray-200 fill-gray-200'
          }`}
        />
      ))}
    </div>
    <span className="text-sm font-semibold text-gray-700">
      {parseFloat(value).toFixed(2)}
    </span>
  </div>
);

// ─── CONSTANTS & VALIDATION ───────────────────────────────────────────────

const VALIDATION_RULES = {
  employee_id: [{ required: true }],
  appraisal_date: [{ required: true }],
};

const EMPTY_FORM = {
  employee_id: '',
  appraisal_date: today(),
  next_appraisal_date: nextYear(),
  people_present: '',
  status: 'Draft',
};

const DEFAULT_SECTION = {
  section_name: '',
  rating: '',
  weight: '',
  previous_rating: null,
  comments: '',
};

// =============================================================================
// SECTION EDITOR COMPONENT — used inside AppraisalForm
// =============================================================================

/**
 * SectionEditor - Editable list of appraisal sections with add/remove/edit functionality
 * @param {Array} sections - array of section objects
 * @param {Function} onChange - callback when sections change
 * @returns {JSX.Element}
 */
const SectionEditor = ({ sections, onChange }) => {
  /**
   * addSection - Add a new empty section to the array
   */
  const addSection = () => onChange([...sections, { ...DEFAULT_SECTION }]);

  /**
   * updateSection - Update a single field in a section
   * @param {number} index - section index
   * @param {string} field - field name (section_name, rating, weight, previous_rating, comments)
   * @param {*} value - new value
   */
  const updateSection = (index, field, value) => {
    const updated = sections.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    onChange(updated);
  };

  /**
   * removeSection - Remove a section by index
   * @param {number} index - section index to remove
   */
  const removeSection = (index) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  // Calculate total weight for validation feedback
  const totalWeight = sections.reduce(
    (sum, s) => sum + (parseFloat(s.weight) || 0),
    0
  );
  const weightOk = totalWeight <= 100.01;

  return (
    <div className="space-y-3">
      {/* ── Weight summary indicator ── */}
      <div
        className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
          totalWeight === 0
            ? 'bg-gray-50 text-gray-500'
            : !weightOk
            ? 'bg-red-50 text-red-700 border border-red-200'
            : totalWeight < 99.9
            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}
      >
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>
          Total weight: <strong>{totalWeight.toFixed(1)}%</strong>
          {totalWeight === 0
            ? ' — weights optional (simple average will be used)'
            : !weightOk
            ? ' — must not exceed 100%'
            : totalWeight < 99.9
            ? ' — weights do not sum to 100% (that is allowed)'
            : ' — weights balanced ✓'}
        </span>
      </div>

      {/* ── Empty state ── */}
      {sections.length === 0 && (
        <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          No sections yet — click "Add Section" to begin
        </div>
      )}

      {/* ── Sections list ── */}
      {sections.map((s, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-xl overflow-hidden"
        >
          {/* ── Section header row with remove button ── */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {index + 1}
            </span>
            <input
              value={s.section_name}
              onChange={(e) =>
                updateSection(index, 'section_name', e.target.value)
              }
              placeholder="Section name (e.g. Communication, Technical Skills)"
              className="flex-1 text-sm font-medium bg-transparent border-none outline-none placeholder-gray-400 text-gray-800"
            />
            <button
              type="button"
              onClick={() => removeSection(index)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
              title="Remove section"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* ── Rating + Weight + Previous Rating inputs ── */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Rating field */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Rating (0–5) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={s.rating}
                onChange={(e) =>
                  updateSection(index, 'rating', e.target.value)
                }
                placeholder="0.0"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Weight field */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Weight %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={s.weight}
                onChange={(e) =>
                  updateSection(index, 'weight', e.target.value)
                }
                placeholder="0"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Previous Rating field (read-only reference) */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Previous Rating
              </label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={s.previous_rating ?? ''}
                onChange={(e) =>
                  updateSection(
                    index,
                    'previous_rating',
                    e.target.value === '' ? null : e.target.value
                  )
                }
                placeholder="— optional"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* ── Comments field ── */}
          <div className="px-4 pb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Comments
            </label>
            <textarea
              value={s.comments}
              onChange={(e) =>
                updateSection(index, 'comments', e.target.value)
              }
              placeholder="Optional notes for this section…"
              rows={2}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      ))}

      {/* ── Add Section button ── */}
      <button
        type="button"
        onClick={addSection}
        className="w-full py-2.5 border-2 border-dashed border-blue-300 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Add Section
      </button>
    </div>
  );
};

// =============================================================================
// APPRAISAL FORM — main component (create / edit)
// =============================================================================

/**
 * AppraisalForm - Complete appraisal creation and editing form
 * @param {Object} appraisal - existing appraisal object (null/undefined for create mode)
 * @param {Function} onBack - callback to return to list view
 * @param {Function} onSaved - callback after successful save
 * @returns {JSX.Element}
 */
export default function AppraisalForm({ appraisal, onBack, onSaved }) {
  const isEdit = !!appraisal;
  const showToast = useAppStore((s) => s.showToast);

  // ── Data fetch: active employees for selector ──────────────────────────
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI
      .getAll({ status: 'active', limit: 200 })
      .then((res) => {
        const list = res.data?.employees || res.data || [];
        setEmployees(list);
      })
      .catch(() => {
        /* non-critical */
      });
  }, []);

  // ── Form state ─────────────────────────────────────────────────────────
  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      employee_id: String(appraisal.employee_id ?? ''),
      appraisal_date: toInputDate(appraisal.appraisal_date),
      next_appraisal_date: toInputDate(appraisal.next_appraisal_date),
      people_present: appraisal.people_present || '',
      status: appraisal.status || 'Draft',
    };
  });

  // ── Sections state — separate from form because it's a complex array ────
  const [sections, setSections] = useState(() => {
    if (!isEdit || !appraisal.sections) return [];
    return appraisal.sections.map((s) => ({
      section_name: s.section_name || '',
      rating: s.rating != null ? String(s.rating) : '',
      weight: s.weight != null ? String(s.weight) : '',
      previous_rating:
        s.previous_rating != null ? String(s.previous_rating) : null,
      comments: s.comments || '',
    }));
  });

  // ── UI state ───────────────────────────────────────────────────────────
  const [sectionsError, setSectionsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const { errors, validate, validateField } = useFormValidation(
    VALIDATION_RULES
  );

  // ── Event handlers ─────────────────────────────────────────────────────

  /**
   * set - Update form field and run field validation
   * @param {string} field - field name
   * @param {*} value - new value
   */
  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  /**
   * previewRating - Calculate overall rating based on current sections
   * Mirrors the backend formula: SUM(rating × weight) / SUM(weights)
   * Falls back to simple average if no weights defined
   * @returns {number|null} calculated rating (0-5) or null if no valid sections
   */
  const previewRating = () => {
    const valid = sections.filter(
      (s) => s.rating !== '' && !isNaN(parseFloat(s.rating))
    );
    if (valid.length === 0) return null;

    const totalWeight = valid.reduce(
      (sum, s) => sum + (parseFloat(s.weight) || 0),
      0
    );

    if (totalWeight === 0) {
      // Simple average (no weights)
      return (
        valid.reduce((sum, s) => sum + parseFloat(s.rating), 0) /
        valid.length
      );
    }

    // Weighted average
    return (
      valid.reduce(
        (sum, s) =>
          sum + parseFloat(s.rating) * (parseFloat(s.weight) || 0),
        0
      ) / totalWeight
    );
  };

  const ratingPreview = previewRating();

  /**
   * handleSubmit - Validate and submit the form
   * Validates both form fields and sections array
   * Builds payload without overall_rating (server calculates it)
   */
  const handleSubmit = async () => {
    const formValid = validate(form);

    // ── Validate sections ──
    let secError = '';
    if (sections.length === 0) {
      secError = 'At least one section is required.';
    } else {
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];

        // Check section name
        if (!s.section_name.trim()) {
          secError = `Section ${i + 1}: name is required.`;
          break;
        }

        // Check rating exists and is 0-5
        if (s.rating === '' || isNaN(parseFloat(s.rating))) {
          secError = `Section ${i + 1}: rating is required.`;
          break;
        }
        if (parseFloat(s.rating) < 0 || parseFloat(s.rating) > 5) {
          secError = `Section ${i + 1}: rating must be 0–5.`;
          break;
        }

        // Check weight is 0-100
        const w = parseFloat(s.weight) || 0;
        if (w < 0 || w > 100) {
          secError = `Section ${i + 1}: weight must be 0–100.`;
          break;
        }
      }

      // Check total weight doesn't exceed 100
      const totalWeight = sections.reduce(
        (sum, s) => sum + (parseFloat(s.weight) || 0),
        0
      );
      if (!secError && totalWeight > 100.01) {
        secError = `Section weights total ${totalWeight.toFixed(
          1
        )}% — must not exceed 100%.`;
      }
    }

    setSectionsError(secError);
    if (!formValid || secError) return;

    setSubmitting(true);
    setServerError('');

    try {
      // ── Build section payload ──
      // NOTE: overall_rating is NEVER sent to the server
      // Backend calculates it from sections using the same formula
      const sectionPayload = sections.map((s, i) => ({
        section_name: s.section_name.trim(),
        rating: parseFloat(s.rating),
        weight: parseFloat(s.weight) || 0,
        previous_rating:
          s.previous_rating != null && s.previous_rating !== ''
            ? parseFloat(s.previous_rating)
            : null,
        comments: s.comments || null,
        sort_order: i,
      }));

      if (isEdit) {
        await appraisalAPI.update(appraisal.id, {
          appraisal_date: form.appraisal_date,
          next_appraisal_date: form.next_appraisal_date || null,
          people_present: form.people_present || null,
          status: form.status,
          sections: sectionPayload,
        });
        showToast('Appraisal updated successfully.', 'success');
      } else {
        await appraisalAPI.create({
          employee_id: parseInt(form.employee_id, 10),
          appraisal_date: form.appraisal_date,
          next_appraisal_date: form.next_appraisal_date || null,
          people_present: form.people_present || null,
          status: form.status,
          sections: sectionPayload,
        });
        showToast('Appraisal created successfully.', 'success');
      }
      onSaved();
    } catch (err) {
      setServerError(err.message || 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  const editEmployeeName = isEdit ? appraisal.employee_name : null;

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-2xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Appraisals
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {isEdit
            ? `Edit — ${editEmployeeName} · ${formatDate(
              appraisal.appraisal_date
            )}`
            : 'New Appraisal'}
        </span>
      </div>

      {/* ── Main form card ── */}
      <Card>
        <CardHeader
          title={isEdit ? 'Edit Appraisal' : 'New Appraisal'}
          subtitle={
            isEdit
              ? 'Update appraisal details. Overall rating is calculated from sections.'
              : 'Create a new appraisal. Overall rating is calculated automatically from section ratings.'
          }
        />

        {serverError && (
          <div className="mb-4">
            <Alert
              type="error"
              message={serverError}
              onDismiss={() => setServerError('')}
            />
          </div>
        )}

        {/* ── Employee + Appraisal Date ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Employee" required error={errors.employee_id}>
            {isEdit ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">{editEmployeeName}</span>
              </div>
            ) : (
              <Select
                value={form.employee_id}
                onChange={(e) => set('employee_id', e.target.value)}
                error={errors.employee_id}
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Appraisal Date" required error={errors.appraisal_date}>
            <Input
              type="date"
              value={form.appraisal_date}
              onChange={(e) => set('appraisal_date', e.target.value)}
              error={errors.appraisal_date}
            />
          </Field>
        </div>

        {/* ── Next Appraisal Date + People Present ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Next Appraisal Date" hint="Defaults to one year from today">
            <Input
              type="date"
              value={form.next_appraisal_date}
              onChange={(e) => set('next_appraisal_date', e.target.value)}
            />
          </Field>

          <Field label="People Present">
            <Input
              value={form.people_present}
              onChange={(e) => set('people_present', e.target.value)}
              placeholder="Names of all attendees"
            />
          </Field>
        </div>

        {/* ── Status ── */}
        <div className="mb-6">
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="Draft">Draft</option>
              <option value="In Progress">In Progress</option>
            </Select>
          </Field>
        </div>

        {/* ── Overall Rating Preview ── */}
        {ratingPreview !== null && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-blue-600 font-medium">
                Calculated Overall Rating (preview)
              </p>
              <StarRating value={ratingPreview} />
            </div>
            <p className="text-xs text-blue-500 ml-auto">
              Server will recalculate on save
            </p>
          </div>
        )}
      </Card>

      {/* ── Sections Editor Card ── */}
      <Card>
        <CardHeader
          title="Section Ratings"
          subtitle="Add one section per competency area. Overall rating is the weighted average."
        />
        {sectionsError && (
          <div className="mb-4">
            <Alert
              type="error"
              message={sectionsError}
              onDismiss={() => setSectionsError('')}
            />
          </div>
        )}
        <SectionEditor sections={sections} onChange={setSections} />
      </Card>

      {/* ── Action Buttons ── */}
      <Card>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
          >
            {isEdit ? 'Save Changes' : 'Save Appraisal'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
