import React, { useState } from 'react';
import { Plus, Edit, X, Save } from 'lucide-react';
import useAppStore, { useConfig } from '../store/useAppStore';

const ConfigurationTab = () => {
  const config = useConfig();
  const { addConfigItem, removeConfigItem } = useAppStore((s) => ({ addConfigItem: s.addConfigItem, removeConfigItem: s.removeConfigItem }));

  const [activeConfig, setActiveConfig] = useState('departments');
  const [editingIndex, setEditingIndex] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [editValue, setEditValue] = useState('');

  // Map store config keys to display labels
  const configOptions = [
    { key: 'departments',           label: 'Departments' },
    { key: 'managers',              label: 'Managers' },
    { key: 'jobDescriptions',       label: 'Job Titles' },
    { key: 'meetingTypes',          label: 'Meeting Types' },
    { key: 'generalMisconductTypes',label: 'General Misconduct' },
    { key: 'grossMisconductTypes',  label: 'Gross Misconduct' },
    { key: 'achievementTypes',      label: 'Achievement Types' },
    { key: 'incidentLogTypes',      label: 'Incident Types' },
  ];

  const currentList = config[activeConfig] || [];
  const currentOption = configOptions.find(o => o.key === activeConfig);

  const handleAdd = async () => {
    const val = newItem.trim();
    if (!val) return;
    await addConfigItem(activeConfig, val);
    setNewItem('');
  };

  const handleSaveEdit = async () => {
    const val = editValue.trim();
    if (!val || editingIndex === null) return;
    const old = currentList[editingIndex];
    // Remove old, add new
    await removeConfigItem(activeConfig, null, old);
    await addConfigItem(activeConfig, val);
    setEditingIndex(null);
    setEditValue('');
  };

  const handleRemove = async (item) => {
    if (!window.confirm(`Remove "${item}"?`)) return;
    await removeConfigItem(activeConfig, null, item);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configuration</h2>
        <p className="text-gray-600">Manage dropdown options and system settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar nav */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Options</h3>
          <nav className="space-y-1">
            {configOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => { setActiveConfig(opt.key); setEditingIndex(null); setNewItem(''); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeConfig === opt.key ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{opt.label}</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    {(config[opt.key] || []).length}
                  </span>
                </div>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-1">{currentOption?.label}</h3>
          <p className="text-sm text-gray-500 mb-5">
            Manage {currentOption?.label.toLowerCase()} available in dropdown selections.
          </p>

          {/* Add new */}
          <div className="flex space-x-2 mb-6 p-4 bg-gray-50 rounded-lg">
            <input
              type="text"
              placeholder={`Add new ${currentOption?.label.toLowerCase().replace(/s$/, '') || 'item'}...`}
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={!newItem.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md flex items-center text-sm"
            >
              <Plus className="w-4 h-4 mr-1" />Add
            </button>
          </div>

          {/* List */}
          <div className="text-sm font-medium text-gray-700 mb-3">
            {currentList.length} {currentOption?.label}
          </div>

          {currentList.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No items yet. Add one above.
            </div>
          ) : (
            <div className="space-y-2">
              {currentList.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                  {editingIndex === idx ? (
                    <div className="flex items-center space-x-2 flex-1">
                      <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingIndex(null); }}
                        className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 p-1"><Save className="w-4 h-4" /></button>
                      <button onClick={() => setEditingIndex(null)} className="text-gray-500 hover:text-gray-700 p-1"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-gray-900 text-sm flex-1">{item}</span>
                      <div className="flex space-x-1">
                        <button onClick={() => { setEditingIndex(idx); setEditValue(item); }} className="text-blue-600 hover:text-blue-800 p-1"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleRemove(item)} className="text-red-600 hover:text-red-800 p-1"><X className="w-4 h-4" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {currentList.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
              These {currentOption?.label.toLowerCase()} appear in dropdown menus throughout the app. Changes apply immediately.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfigurationTab;
