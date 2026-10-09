import React, { useState, useEffect } from 'react';
import {
  X,
  Code2,
  Check,
  Copy,
  Sliders,
  Filter,
  ArrowUpDown,
  Type,
  Split,
  CopyPlus,
  ArrowDownToLine,
  FileEdit,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepType, StepDefinition } from '../../types/steps';

export const StepBuilderModal: React.FC = () => {
  const {
    isStepWizardOpen,
    activeWizardStepType,
    editingStep,
    columns,
    addStep,
    closeStepWizard,
  } = useWorkbenchStore();

  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form states
  const [selectedColumn, setSelectedColumn] = useState('');
  const [targetType, setTargetType] = useState<'text' | 'integer' | 'float' | 'date' | 'boolean'>('text');
  const [newName, setNewName] = useState('');
  const [filterOp, setFilterOp] = useState<any>('eq');
  const [filterValue, setFilterValue] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [dedupCols, setDedupCols] = useState<string[]>([]);
  const [dedupKeep, setDedupKeep] = useState<'first' | 'last'>('first');
  const [fillDir, setFillDir] = useState<'down' | 'up'>('down');
  const [searchVal, setSearchVal] = useState('');
  const [replaceVal, setReplaceVal] = useState('');
  const [replaceMatchType, setReplaceMatchType] = useState<'exact' | 'contains' | 'is_null'>('exact');
  const [delimiter, setDelimiter] = useState(',');
  const [splitColNames, setSplitColNames] = useState('');
  const [keepOriginal, setKeepOriginal] = useState(false);

  useEffect(() => {
    if (columns.length > 0 && !selectedColumn) {
      setSelectedColumn(columns[0].name);
    }
  }, [columns]);

  if (!isStepWizardOpen || !activeWizardStepType) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let params: Record<string, any> = {};
    let label = '';

    switch (activeWizardStepType) {
      case 'change_type':
        params = { column: selectedColumn, target_type: targetType };
        label = `Change ${selectedColumn} to ${targetType}`;
        break;
      case 'rename_column':
        params = { column: selectedColumn, new_name: newName || `${selectedColumn}_renamed` };
        label = `Rename ${selectedColumn} to ${params.new_name}`;
        break;
      case 'filter_rows':
        params = { column: selectedColumn, operator: filterOp, value: filterValue };
        label = `Filter ${selectedColumn} ${filterOp} ${filterValue}`;
        break;
      case 'sort_rows':
        params = { column: selectedColumn, direction: sortDir };
        label = `Sort by ${selectedColumn} ${sortDir.toUpperCase()}`;
        break;
      case 'remove_duplicates':
        params = { columns: dedupCols.length > 0 ? dedupCols : [selectedColumn], keep: dedupKeep };
        label = `Remove duplicates (${params.columns.join(', ')})`;
        break;
      case 'fill_down':
        params = { column: selectedColumn, direction: fillDir };
        label = `Fill ${fillDir} on ${selectedColumn}`;
        break;
      case 'replace_values':
        params = {
          column: selectedColumn,
          search_value: searchVal,
          replace_value: replaceVal,
          match_type: replaceMatchType,
        };
        label = `Replace "${searchVal}" with "${replaceVal}" in ${selectedColumn}`;
        break;
      case 'split_column':
        const names = splitColNames
          ? splitColNames.split(',').map((s) => s.trim())
          : [`${selectedColumn}_1`, `${selectedColumn}_2`];
        params = {
          column: selectedColumn,
          delimiter,
          new_column_names: names,
          keep_original: keepOriginal,
        };
        label = `Split ${selectedColumn} by "${delimiter}"`;
        break;
    }

    const newStep: StepDefinition = {
      id: crypto.randomUUID(),
      type: activeWizardStepType,
      label,
      enabled: true,
      params,
    };

    await addStep(newStep);
    closeStepWizard();
  };

  const getStepTitle = () => {
    switch (activeWizardStepType) {
      case 'change_type':
        return 'Change Data Type';
      case 'rename_column':
        return 'Rename Column';
      case 'filter_rows':
        return 'Filter Rows';
      case 'sort_rows':
        return 'Sort Rows';
      case 'remove_duplicates':
        return 'Remove Duplicates';
      case 'fill_down':
        return 'Fill Down / Up';
      case 'replace_values':
        return 'Replace Values';
      case 'split_column':
        return 'Split Column by Delimiter';
    }
  };

  const handleCopyFormula = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 relative">
        <button
          onClick={closeStepWizard}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
            <Sliders size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">{getStepTitle()}</h3>
            <p className="text-xs text-slate-400">Configure parameters through guided UI controls</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Column Picker */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">Target Column</label>
            <select
              value={selectedColumn}
              onChange={(e) => setSelectedColumn(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.data_type})
                </option>
              ))}
            </select>
          </div>

          {/* Type Specific Fields */}
          {activeWizardStepType === 'change_type' && (
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">New Data Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="text">Text (VARCHAR)</option>
                <option value="integer">Integer (BIGINT)</option>
                <option value="float">Decimal / Float (DOUBLE)</option>
                <option value="date">Date (DATE)</option>
                <option value="boolean">Boolean (TRUE/FALSE)</option>
              </select>
            </div>
          )}

          {activeWizardStepType === 'rename_column' && (
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">New Column Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. customer_region"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          )}

          {activeWizardStepType === 'filter_rows' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Condition</label>
                <select
                  value={filterOp}
                  onChange={(e) => setFilterOp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="eq">Equals (=)</option>
                  <option value="neq">Not Equals (!=)</option>
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="gte">Greater or Equal (&gt;=)</option>
                  <option value="lt">Less Than (&lt;)</option>
                  <option value="lte">Less or Equal (&lt;=)</option>
                  <option value="contains">Contains text</option>
                  <option value="starts_with">Starts with</option>
                  <option value="ends_with">Ends with</option>
                  <option value="is_null">Is Null / Blank</option>
                  <option value="is_not_null">Is Not Null</option>
                </select>
              </div>
              {!['is_null', 'is_not_null'].includes(filterOp) && (
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Value</label>
                  <input
                    type="text"
                    required
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    placeholder="Filter value..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}
            </div>
          )}

          {activeWizardStepType === 'sort_rows' && (
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Sort Direction</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSortDir('asc')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    sortDir === 'asc'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Ascending (A → Z, 0 → 9)
                </button>
                <button
                  type="button"
                  onClick={() => setSortDir('desc')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    sortDir === 'desc'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Descending (Z → A, 9 → 0)
                </button>
              </div>
            </div>
          )}

          {activeWizardStepType === 'remove_duplicates' && (
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Keep Record</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setDedupKeep('first')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    dedupKeep === 'first'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Keep First Occurrence
                </button>
                <button
                  type="button"
                  onClick={() => setDedupKeep('last')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    dedupKeep === 'last'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Keep Last Occurrence
                </button>
              </div>
            </div>
          )}

          {activeWizardStepType === 'fill_down' && (
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Fill Direction</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFillDir('down')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    fillDir === 'down'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Fill Down (Propagate downward)
                </button>
                <button
                  type="button"
                  onClick={() => setFillDir('up')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    fillDir === 'up'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Fill Up (Propagate upward)
                </button>
              </div>
            </div>
          )}

          {activeWizardStepType === 'replace_values' && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Match Type</label>
                <select
                  value={replaceMatchType}
                  onChange={(e) => setReplaceMatchType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="exact">Exact Match</option>
                  <option value="contains">Contains substring</option>
                  <option value="is_null">Replace Null / Blank cells</option>
                </select>
              </div>
              {replaceMatchType !== 'is_null' && (
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Value to Find</label>
                  <input
                    type="text"
                    required
                    value={searchVal}
                    onChange={(e) => setSearchVal(e.target.value)}
                    placeholder="Search value..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Replace With</label>
                <input
                  type="text"
                  value={replaceVal}
                  onChange={(e) => setReplaceVal(e.target.value)}
                  placeholder="Replacement value..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          )}

          {activeWizardStepType === 'split_column' && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Delimiter</label>
                <input
                  type="text"
                  required
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  placeholder="Delimiter (e.g. , or - or space)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">
                  New Column Names (comma separated)
                </label>
                <input
                  type="text"
                  value={splitColNames}
                  onChange={(e) => setSplitColNames(e.target.value)}
                  placeholder="e.g. part_1, part_2"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={keepOriginal}
                  onChange={(e) => setKeepOriginal(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0"
                />
                <span>Keep original column</span>
              </label>
            </div>
          )}

          {/* Show Formula Toggle */}
          <div className="pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowFormula(!showFormula)}
              className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
            >
              <Code2 size={13} />
              <span>{showFormula ? 'Hide Formula Equivalent' : 'Show Formula Equivalent'}</span>
            </button>

            {showFormula && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>DuckDB SQL / M / Python</span>
                  <button
                    type="button"
                    onClick={() => handleCopyFormula('Generated code available upon step execution')}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-emerald-300 bg-slate-900/60 p-2 rounded overflow-x-auto">
                  -- Real-time SQL CTE and Polars script generated when step is applied
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={closeStepWizard}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white rounded-lg transition-colors shadow-sm shadow-emerald-600/30"
            >
              Apply Step
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
