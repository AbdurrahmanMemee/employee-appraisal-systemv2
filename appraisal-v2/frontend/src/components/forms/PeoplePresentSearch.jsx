import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { employeeAPI } from '../../services/api';

const MIN_SEARCH_LENGTH = 2;
const SEARCH_LIMIT = 20;
const MAX_PEOPLE_PRESENT_LENGTH = 500;
const DEBOUNCE_MS = 300;

const normaliseName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

const parseNames = (value) => String(value ?? '')
  .split(',')
  .map(normaliseName)
  .filter(Boolean);

const serialiseAttendees = (attendees) => attendees
  .map(attendee => normaliseName(attendee.name))
  .filter(Boolean)
  .join(', ');

const legacyAttendees = (value) => parseNames(value).map((name, index) => ({
  key: `legacy:${name.toLocaleLowerCase()}:${index}`,
  employeeId: null,
  name,
  employeeCode: '',
  department: '',
}));

const PeoplePresentSearch = ({ value = '', onChange, disabled = false }) => {
  const inputId = useId();
  const listboxId = useId();
  const rootRef = useRef(null);
  const requestSequenceRef = useRef(0);

  const [attendees, setAttendees] = useState(() => legacyAttendees(value));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lengthError, setLengthError] = useState('');

  const serialisedValue = useMemo(() => serialiseAttendees(attendees), [attendees]);
  const selectedNames = useMemo(
    () => new Set(attendees.map(attendee => attendee.name.toLocaleLowerCase())),
    [attendees]
  );
  const availableResults = useMemo(
    () => results.filter(employee => !selectedNames.has(normaliseName(employee.full_name).toLocaleLowerCase())),
    [results, selectedNames]
  );

  useEffect(() => {
    const incomingValue = parseNames(value).join(', ');
    if (incomingValue !== serialisedValue) {
      setAttendees(legacyAttendees(value));
    }
  }, [value, serialisedValue]);

  useEffect(() => {
    const handleOutsidePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = normaliseName(query);

    if (trimmedQuery.length < MIN_SEARCH_LENGTH) {
      requestSequenceRef.current += 1;
      setResults([]);
      setLoading(false);
      setSearchError('');
      setActiveIndex(-1);
      return undefined;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setSearchError('');

      try {
        const response = await employeeAPI.getAll({
          search: trimmedQuery,
          active: 'true',
          page: 1,
          limit: SEARCH_LIMIT,
        });

        if (requestSequenceRef.current !== requestSequence) return;

        const employees = response.data?.employees ?? response.employees ?? [];
        setResults(Array.isArray(employees) ? employees : []);
        setActiveIndex(employees.length > 0 ? 0 : -1);
      } catch (error) {
        if (requestSequenceRef.current !== requestSequence) return;
        setResults([]);
        setActiveIndex(-1);
        setSearchError(error.message || 'Employee search failed. Please try again.');
      } finally {
        if (requestSequenceRef.current === requestSequence) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const updateAttendees = (nextAttendees) => {
    const nextValue = serialiseAttendees(nextAttendees);

    if (nextValue.length > MAX_PEOPLE_PRESENT_LENGTH) {
      setLengthError(`People Present cannot exceed ${MAX_PEOPLE_PRESENT_LENGTH} characters.`);
      return false;
    }

    setLengthError('');
    setAttendees(nextAttendees);
    onChange(nextValue);
    return true;
  };

  const clearSearch = () => {
    requestSequenceRef.current += 1;
    setQuery('');
    setResults([]);
    setLoading(false);
    setSearchError('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const addEmployee = (employee) => {
    const name = normaliseName(employee.full_name);
    if (!name || selectedNames.has(name.toLocaleLowerCase())) return;

    const added = updateAttendees([
      ...attendees,
      {
        key: `employee:${employee.id}`,
        employeeId: employee.id,
        name,
        employeeCode: employee.employee_id || '',
        department: employee.department || '',
      },
    ]);

    if (added) clearSearch();
  };

  const addExternalAttendee = () => {
    const name = normaliseName(query).replace(/,+/g, '');
    if (!name || selectedNames.has(name.toLocaleLowerCase())) return;

    const added = updateAttendees([
      ...attendees,
      {
        key: `external:${name.toLocaleLowerCase()}:${Date.now()}`,
        employeeId: null,
        name,
        employeeCode: '',
        department: 'External attendee',
      },
    ]);

    if (added) clearSearch();
  };

  const removeAttendee = (key) => {
    if (disabled) return;
    updateAttendees(attendees.filter(attendee => attendee.key !== key));
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Backspace' && query === '' && attendees.length > 0) {
      removeAttendee(attendees[attendees.length - 1].key);
      return;
    }

    if (!isOpen) return;

    if (event.key === 'ArrowDown' && availableResults.length > 0) {
      event.preventDefault();
      setActiveIndex(index => index >= availableResults.length - 1 ? 0 : index + 1);
      return;
    }

    if (event.key === 'ArrowUp' && availableResults.length > 0) {
      event.preventDefault();
      setActiveIndex(index => index <= 0 ? availableResults.length - 1 : index - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && availableResults[activeIndex]) {
        addEmployee(availableResults[activeIndex]);
      } else if (normaliseName(query).length >= MIN_SEARCH_LENGTH) {
        addExternalAttendee();
      }
    }
  };

  const trimmedQuery = normaliseName(query);
  const canAddExternal = trimmedQuery.length >= MIN_SEARCH_LENGTH
    && !selectedNames.has(trimmedQuery.replace(/,+/g, '').toLocaleLowerCase());

  return (
    <div ref={rootRef} className="relative">
      {attendees.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-2" aria-label="Selected attendees">
          {attendees.map(attendee => (
            <li
              key={attendee.key}
              className="inline-flex items-center gap-1.5 max-w-full rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1 text-sm text-blue-800"
            >
              <span className="truncate">{attendee.name}</span>
              <button
                type="button"
                onClick={() => removeAttendee(attendee.key)}
                disabled={disabled}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-blue-500 hover:bg-blue-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Remove ${attendee.name}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 && availableResults[activeIndex]
            ? `${listboxId}-${availableResults[activeIndex].id}`
            : undefined}
          placeholder="Search employees or enter an external attendee..."
          className={`w-full rounded-lg border bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ${lengthError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(normaliseName(event.target.value).length >= MIN_SEARCH_LENGTH);
          }}
          onFocus={() => {
            if (trimmedQuery.length >= MIN_SEARCH_LENGTH) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" aria-hidden="true" />
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <ul id={listboxId} role="listbox" aria-label="Employee search results" className="max-h-64 overflow-y-auto p-1">
            {availableResults.map((employee, index) => (
              <li
                id={`${listboxId}-${employee.id}`}
                key={employee.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`cursor-pointer rounded-md px-3 py-2 ${index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addEmployee(employee);
                }}
              >
                <p className="text-sm font-medium text-gray-900">{employee.full_name}</p>
                <p className="text-xs text-gray-500">
                  {[employee.employee_id, employee.department].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}

            {!loading && !searchError && availableResults.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500" role="status">
                No matching employees found.
              </li>
            )}

            {searchError && (
              <li className="px-3 py-2 text-sm text-red-600" role="alert">
                {searchError}
              </li>
            )}

            {canAddExternal && (
              <li className="border-t border-gray-100 p-1">
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addExternalAttendee();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <UserPlus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">Add “{trimmedQuery.replace(/,+/g, '')}” as an external attendee</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-1 flex items-start justify-between gap-3">
        <p className={`text-xs ${lengthError ? 'text-red-600' : 'text-gray-500'}`} role={lengthError ? 'alert' : undefined}>
          {lengthError || `Type at least ${MIN_SEARCH_LENGTH} characters, then select a person.`}
        </p>
        <span className={`flex-shrink-0 text-xs ${serialisedValue.length > 450 ? 'text-amber-600' : 'text-gray-400'}`}>
          {serialisedValue.length}/{MAX_PEOPLE_PRESENT_LENGTH}
        </span>
      </div>
    </div>
  );
};

export default PeoplePresentSearch;
