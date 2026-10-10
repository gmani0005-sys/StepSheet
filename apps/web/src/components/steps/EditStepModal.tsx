import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  Pencil,
  Sliders,
  Code2,
  Trash2,
  Plus,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepDefinition } from '../../types/steps';

export const EditStepModal: React.FC = () => {
  const {
    isEditStepModalOpen,
    editingStep,
    columns,
    datasets,
    updateStep,
    closeEditStepModal,
  } = useWorkbenchStore();

  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [params, setParams] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<'visual' | 'raw'>('visual');
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (editingStep) {
      setLabel(editingStep.label || '');
      setEnabled(editingStep.enabled !== false);
      const clonedParams = JSON.parse(JSON.stringify(editingStep.params || {}));
      setParams(clonedParams);
      setRawJson(JSON.stringify(clonedParams, null, 2));
      setJsonError(null);
    }
  }, [editingStep]);

  if (!isEditStepModalOpen || !editingStep) return null;

  const handleParamChange = (key: string, value: any) => {
    const updated = { ...params, [key]: value };
    setParams(updated);
    setRawJson(JSON.stringify(updated, null, 2));
  };

  const handleRawJsonChange = (val: string) => {
    setRawJson(val);
    try {
      const parsed = JSON.parse(val);
      setParams(parsed);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON syntax');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jsonError && activeTab === 'raw') return;

    await updateStep(editingStep.id, {
      label: label.trim() || editingStep.label,
      enabled,
      params,
    });
  };

  const renderVisualEditor = () => {
    const type = editingStep.type;

    switch (type) {
      case 'change_type':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.data_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Data Type</label>
              <select
                value={params.target_type || 'text'}
                onChange={(e) => handleParamChange('target_type', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="text">Text / String</option>
                <option value="integer">Integer (Whole number)</option>
                <option value="float">Float / Decimal</option>
                <option value="date">Date (YYYY-MM-DD)</option>
                <option value="boolean">Boolean (TRUE/FALSE)</option>
              </select>
            </div>
          </div>
        );

      case 'rename_column':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Current Column Name</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">New Column Name</label>
              <input
                type="text"
                value={params.new_name || ''}
                onChange={(e) => handleParamChange('new_name', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        );

      case 'filter_rows':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Condition / Operator</label>
              <select
                value={params.operator || 'eq'}
                onChange={(e) => handleParamChange('operator', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="eq">Equals (=)</option>
                <option value="neq">Does not equal (≠)</option>
                <option value="gt">Greater than (&gt;)</option>
                <option value="gte">Greater or equal (≥)</option>
                <option value="lt">Less than (&lt;)</option>
                <option value="lte">Less or equal (≤)</option>
                <option value="contains">Contains text</option>
                <option value="starts_with">Starts with</option>
                <option value="ends_with">Ends with</option>
                <option value="is_null">Is blank / null</option>
                <option value="is_not_null">Is not blank</option>
              </select>
            </div>
            {!['is_null', 'is_not_null'].includes(params.operator) && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Filter Value</label>
                <input
                  type="text"
                  value={params.value ?? ''}
                  onChange={(e) => handleParamChange('value', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            )}
          </div>
        );

      case 'sort_rows':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Sort Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleParamChange('direction', 'asc')}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium transition-all ${
                    params.direction === 'asc'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Ascending (A → Z, 0 → 9)
                </button>
                <button
                  type="button"
                  onClick={() => handleParamChange('direction', 'desc')}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium transition-all ${
                    params.direction === 'desc'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Descending (Z → A, 9 → 0)
                </button>
              </div>
            </div>
          </div>
        );

      case 'math_transform':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Operation</label>
              <select
                value={params.operation || 'arithmetic'}
                onChange={(e) => handleParamChange('operation', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="arithmetic">Arithmetic (+, -, *, /)</option>
                <option value="round">Round</option>
                <option value="roundup">Round Up (Ceiling)</option>
                <option value="rounddown">Round Down (Floor)</option>
                <option value="abs">Absolute Value</option>
                <option value="percent_change">Percent Change</option>
                <option value="bin">Numeric Bins / Tiers</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Column 1</label>
                <select
                  value={params.column1 || ''}
                  onChange={(e) => handleParamChange('column1', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {params.operation === 'arithmetic' && (
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Operator</label>
                  <select
                    value={params.math_operator || '-'}
                    onChange={(e) => handleParamChange('math_operator', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="+">Plus (+)</option>
                    <option value="-">Minus (−)</option>
                    <option value="*">Multiply (×)</option>
                    <option value="/">Divide (/)</option>
                  </select>
                </div>
              )}
            </div>

            {params.operation === 'arithmetic' && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Column 2 (or Second Value)</label>
                <select
                  value={params.column2 || ''}
                  onChange={(e) => handleParamChange('column2', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Output Column Name</label>
              <input
                type="text"
                value={params.output_column || ''}
                onChange={(e) => handleParamChange('output_column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        );

      case 'replace_values':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Search For</label>
                <input
                  type="text"
                  value={params.search_value ?? ''}
                  onChange={(e) => handleParamChange('search_value', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Replace With</label>
                <input
                  type="text"
                  value={params.replace_value ?? ''}
                  onChange={(e) => handleParamChange('replace_value', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          </div>
        );

      case 'text_transform':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Operation</label>
              <select
                value={params.operation || 'trim'}
                onChange={(e) => handleParamChange('operation', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="trim">Trim whitespace</option>
                <option value="clean">Clean non-printable characters</option>
                <option value="upper">UPPERCASE</option>
                <option value="lower">lowercase</option>
                <option value="proper">Proper Case (Capitalize)</option>
                <option value="left">LEFT characters</option>
                <option value="right">RIGHT characters</option>
                <option value="length">Length (LEN)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Output Column Name</label>
              <input
                type="text"
                value={params.output_column || ''}
                onChange={(e) => handleParamChange('output_column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        );

      default:
        // Default parameter list for other step types
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Step Type: </span>
              <span className="font-mono text-emerald-400 uppercase">{type.replace('_', ' ')}</span>
              <p className="mt-1 text-[11px] text-slate-500">
                You can adjust parameters below or switch to the JSON tab for full configuration control.
              </p>
            </div>

            {Object.entries(params).map(([key, val]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-300 block mb-1 font-mono">
                  {key}
                </label>
                {typeof val === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) => handleParamChange(key, e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                    />
                    <span>{val ? 'Enabled' : 'Disabled'}</span>
                  </label>
                ) : typeof val === 'object' && val !== null ? (
                  <textarea
                    value={JSON.stringify(val)}
                    onChange={(e) => {
                      try {
                        handleParamChange(key, JSON.parse(e.target.value));
                      } catch {}
                    }}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500/50"
                  />
                ) : (
                  <input
                    type="text"
                    value={val ?? ''}
                    onChange={(e) => handleParamChange(key, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                )}
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 relative flex flex-col max-h-[90vh]">
        <button
          onClick={closeEditStepModal}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
            <Pencil size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Edit Applied Step</h3>
            <p className="text-xs text-slate-400">
              Modify step parameters in place — DuckDB will automatically recompute the pipeline.
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'visual'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders size={13} />
            <span>Parameters</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'raw'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 size={13} />
            <span>Raw JSON Config</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Step Label & Enabled */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Step Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                  placeholder="Step description / label"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Step Status:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 text-xs"
                  />
                  <span className={enabled ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    {enabled ? 'Active / Included in Pipeline' : 'Disabled (Bypassed)'}
                  </span>
                </label>
              </div>
            </div>

            {/* Editor Area */}
            {activeTab === 'visual' ? (
              renderVisualEditor()
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300 block">
                  JSON Parameters
                </label>
                <textarea
                  value={rawJson}
                  onChange={(e) => handleRawJsonChange(e.target.value)}
                  rows={10}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-amber-300/90 focus:outline-none focus:border-amber-500/50"
                />
                {jsonError && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{jsonError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between shrink-0 mt-3">
            <button
              type="button"
              onClick={closeEditStepModal}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!!jsonError && activeTab === 'raw'}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all disabled:opacity-40"
            >
              <Check size={14} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
