import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  Check,
  AlertTriangle,
  Info,
  Layers,
  ArrowRight,
  Database,
  Code2,
  Copy,
  Plus,
  Trash2,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { JoinType, JoinKeyPair, PreJoinHealthCheckResponse } from '../../types/joins';
import { api } from '../../api/client';

interface JoinBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinBuilderModal: React.FC<JoinBuilderModalProps> = ({ isOpen, onClose }) => {
  const { datasets, selectedDataset, columns: leftColumns, addStep } = useWorkbenchStore();

  const [rightDatasetId, setRightDatasetId] = useState('');
  const [joinType, setJoinType] = useState<JoinType>('left');
  const [keyPairs, setKeyPairs] = useState<JoinKeyPair[]>([]);
  const [selectedRightColumns, setSelectedRightColumns] = useState<string[]>([]);
  const [columnSearch, setColumnSearch] = useState('');
  const [dedupeRightFirst, setDedupeRightFirst] = useState(false);
  const [suffixLeft, setSuffixLeft] = useState('_left');
  const [suffixRight, setSuffixRight] = useState('_right');

  // Health check state
  const [healthReport, setHealthReport] = useState<PreJoinHealthCheckResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  // Available right datasets (exclude current dataset unless self join)
  const availableRightDatasets = datasets;
  const rightDataset = datasets.find((d) => d.id === rightDatasetId);
  const rightColumns = rightDataset?.schema_metadata || [];

  // Initialize right dataset and key pairs
  useEffect(() => {
    if (isOpen && datasets.length > 0) {
      const other = datasets.find((d) => d.id !== selectedDataset?.id) || datasets[0];
      setRightDatasetId(other.id);
    }
  }, [isOpen, datasets, selectedDataset]);

  // Auto-suggest keys and initialize columns when right dataset changes
  useEffect(() => {
    if (!selectedDataset || !rightDatasetId) return;

    const rDs = datasets.find((d) => d.id === rightDatasetId);
    if (!rDs) return;

    // Pick non-key columns by default
    const rCols = rDs.schema_metadata.map((c) => c.name);
    setSelectedRightColumns(rCols);

    // Call auto-suggest
    api
      .suggestJoinKeys(selectedDataset.id, rightDatasetId)
      .then((res) => {
        if (res.suggested_keys && res.suggested_keys.length > 0) {
          setKeyPairs(res.suggested_keys);
        } else if (leftColumns.length > 0 && rDs.schema_metadata.length > 0) {
          setKeyPairs([
            { left_col: leftColumns[0].name, right_col: rDs.schema_metadata[0].name },
          ]);
        }
      })
      .catch(() => {
        if (leftColumns.length > 0 && rDs.schema_metadata.length > 0) {
          setKeyPairs([
            { left_col: leftColumns[0].name, right_col: rDs.schema_metadata[0].name },
          ]);
        }
      });
  }, [selectedDataset, rightDatasetId, datasets]);

  // Run automatic health check whenever keys, right table, or join type change
  useEffect(() => {
    if (!selectedDataset || !rightDatasetId || keyPairs.length === 0) {
      setHealthReport(null);
      return;
    }

    setIsCheckingHealth(true);
    api
      .checkJoinHealth({
        left_dataset_id: selectedDataset.id,
        right_dataset_id: rightDatasetId,
        key_pairs: keyPairs,
        join_type: joinType,
      })
      .then((report) => {
        setHealthReport(report);
        setIsCheckingHealth(false);
      })
      .catch(() => {
        setIsCheckingHealth(false);
      });
  }, [selectedDataset, rightDatasetId, keyPairs, joinType, dedupeRightFirst]);

  if (!isOpen || !selectedDataset) return null;

  const joinTypesConfig: Array<{
    type: JoinType;
    label: string;
    desc: string;
    example: string;
  }> = [
    {
      type: 'inner',
      label: 'Inner Join',
      desc: 'Only keep rows that have matches in BOTH tables.',
      example: 'Orders with matching Customers only',
    },
    {
      type: 'left',
      label: 'Left Outer',
      desc: 'Keep ALL rows from left table, plus matching right columns.',
      example: 'All Orders, fill blanks if Customer not found',
    },
    {
      type: 'right',
      label: 'Right Outer',
      desc: 'Keep ALL rows from right table, plus matching left columns.',
      example: 'All Customers, with their Orders if any',
    },
    {
      type: 'full',
      label: 'Full Outer',
      desc: 'Keep EVERYTHING from both tables (matched and unmatched).',
      example: 'All Orders and all Customers combined',
    },
    {
      type: 'left_semi',
      label: 'Left Semi',
      desc: 'Keep left rows that have a match, WITHOUT adding right columns.',
      example: 'Filter Orders to only active Customers',
    },
    {
      type: 'left_anti',
      label: 'Left Anti',
      desc: 'Find missing records: keep left rows that have NO match in right.',
      example: 'Orders placed with invalid/deleted Customer IDs',
    },
    {
      type: 'cross',
      label: 'Cross Join',
      desc: 'Cartesian product: match every row with every row.',
      example: 'All Sizes × All Colors',
    },
  ];

  const handleAddKeyPair = () => {
    if (leftColumns.length > 0 && rightColumns.length > 0) {
      setKeyPairs([
        ...keyPairs,
        { left_col: leftColumns[0].name, right_col: rightColumns[0].name },
      ]);
    }
  };

  const handleRemoveKeyPair = (index: number) => {
    setKeyPairs(keyPairs.filter((_, i) => i !== index));
  };

  const handleUpdateKeyPair = (index: number, field: keyof JoinKeyPair, val: any) => {
    const updated = [...keyPairs];
    updated[index] = { ...updated[index], [field]: val };
    setKeyPairs(updated);
  };

  const toggleColumnSelection = (colName: string) => {
    if (selectedRightColumns.includes(colName)) {
      setSelectedRightColumns(selectedRightColumns.filter((c) => c !== colName));
    } else {
      setSelectedRightColumns([...selectedRightColumns, colName]);
    }
  };

  const handleApplyJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rightDataset) return;

    const label = `${joinType.replace('_', ' ').toUpperCase()} JOIN with ${rightDataset.name}`;
    await addStep({
      id: crypto.randomUUID(),
      type: 'join',
      label,
      enabled: true,
      params: {
        right_dataset_id: rightDatasetId,
        join_type: joinType,
        key_pairs: keyPairs,
        selected_right_columns: selectedRightColumns,
        suffix_left: suffixLeft,
        suffix_right: suffixRight,
        dedupe_right_first: dedupeRightFirst,
      },
    });
    onClose();
  };

  const getCardinalityBadgeClass = (verdict?: string) => {
    switch (verdict) {
      case 'one-to-one':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'many-to-one':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'one-to-many':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'many-to-many':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <GitBranch size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Join Builder</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  First-Class Feature
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Combine <span className="text-emerald-400 font-semibold">{selectedDataset.name}</span> with another dataset with automated pre-join health checks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuidance(!showGuidance)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              <HelpCircle size={14} className="text-sky-400" />
              <span>Joins vs Lookups?</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Guidance Banner */}
        {showGuidance && (
          <div className="p-3 bg-sky-950/40 border-b border-sky-500/30 text-xs text-slate-300 flex items-start gap-2.5">
            <Info size={16} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sky-200">Which should I use: Join or Lookup?</p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                • <strong>Use Lookup (XLOOKUP)</strong> when bringing 1–2 columns from a reference table where each key appears only once (e.g. bring Customer Region into Orders).
                <br />
                • <strong>Use Join</strong> when combining tables where keys may have multiple rows (1:N or N:N), or when you want Anti/Semi filters or cross joins.
              </p>
            </div>
          </div>
        )}

        {/* Body (2 columns: left config, right health check & preview) */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (Config): 7 cols */}
          <div className="lg:col-span-7 space-y-4">
            {/* 1. Pick Right Table */}
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                1. Select Table to Combine
              </label>
              <select
                value={rightDatasetId}
                onChange={(e) => setRightDatasetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500/50"
              >
                {availableRightDatasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.row_count.toLocaleString()} rows, {ds.column_count} cols)
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Visual Join Type Selector with Venn Diagrams */}
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                2. Choose Join Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {joinTypesConfig.map((jt) => {
                  const isSelected = joinType === jt.type;
                  return (
                    <div
                      key={jt.type}
                      onClick={() => setJoinType(jt.type)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-500/60 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Mini Venn Diagram SVG */}
                      <div className="h-8 flex items-center justify-center mb-1.5">
                        <svg width="48" height="24" viewBox="0 0 48 24" className="overflow-visible">
                          <circle
                            cx="18"
                            cy="12"
                            r="10"
                            className={`transition-colors ${
                              isSelected
                                ? ['inner', 'left', 'full', 'left_semi', 'left_anti', 'cross'].includes(jt.type)
                                  ? 'fill-sky-500/80'
                                  : 'fill-slate-800'
                                : 'fill-slate-800'
                            }`}
                            stroke="#334155"
                            strokeWidth="1.5"
                          />
                          <circle
                            cx="30"
                            cy="12"
                            r="10"
                            className={`transition-colors ${
                              isSelected
                                ? ['inner', 'right', 'full', 'cross'].includes(jt.type)
                                  ? 'fill-sky-500/80'
                                  : 'fill-slate-800'
                                : 'fill-slate-800'
                            }`}
                            stroke="#334155"
                            strokeWidth="1.5"
                          />
                          {/* Intersection highlight for inner */}
                          {jt.type === 'inner' && isSelected && (
                            <path
                              d="M 24 3.8 A 10 10 0 0 1 24 20.2 A 10 10 0 0 1 24 3.8 Z"
                              className="fill-sky-400"
                            />
                          )}
                        </svg>
                      </div>

                      <p
                        className={`text-xs font-bold text-center ${
                          isSelected ? 'text-sky-300' : 'text-slate-300'
                        }`}
                      >
                        {jt.label}
                      </p>
                      <p className="text-[10px] text-slate-400 text-center mt-0.5 line-clamp-2 leading-tight">
                        {jt.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Join Keys */}
            {joinType !== 'cross' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-200">
                    3. Join Keys (Left ↔ Right)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddKeyPair}
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium"
                  >
                    <Plus size={12} />
                    <span>Add Key Pair</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {keyPairs.map((kp, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        {/* Left Key */}
                        <div className="flex-1">
                          <span className="text-[10px] text-slate-500 block mb-0.5">
                            {selectedDataset.name}
                          </span>
                          <select
                            value={kp.left_col}
                            onChange={(e) => handleUpdateKeyPair(idx, 'left_col', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                          >
                            {leftColumns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <span className="text-slate-500 pt-3">↔</span>

                        {/* Right Key */}
                        <div className="flex-1">
                          <span className="text-[10px] text-slate-500 block mb-0.5">
                            {rightDataset?.name || 'Right Table'}
                          </span>
                          <select
                            value={kp.right_col}
                            onChange={(e) => handleUpdateKeyPair(idx, 'right_col', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                          >
                            {rightColumns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {keyPairs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyPair(idx)}
                            className="p-1 hover:text-rose-400 text-slate-500 pt-3"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Key Options */}
                      <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={kp.trim_whitespace}
                            onChange={(e) =>
                              handleUpdateKeyPair(idx, 'trim_whitespace', e.target.checked)
                            }
                            className="rounded border-slate-800 bg-slate-900 text-sky-500"
                          />
                          <span>Trim whitespace</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={kp.case_insensitive}
                            onChange={(e) =>
                              handleUpdateKeyPair(idx, 'case_insensitive', e.target.checked)
                            }
                            className="rounded border-slate-800 bg-slate-900 text-sky-500"
                          />
                          <span>Case-insensitive</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Column Selection from Right Table */}
            {!['left_semi', 'left_anti'].includes(joinType) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-200">
                    4. Columns to Bring In from {rightDataset?.name}
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {selectedRightColumns.length} of {rightColumns.length} selected
                  </span>
                </div>

                <div className="max-h-28 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                  {rightColumns.map((c) => {
                    const isChecked = selectedRightColumns.includes(c.name);
                    return (
                      <label
                        key={c.name}
                        className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleColumnSelection(c.name)}
                          className="rounded border-slate-800 bg-slate-900 text-sky-500"
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Health Check Report & Warnings): 5 cols */}
          <div className="lg:col-span-5 flex flex-col space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Pre-Join Health Check
                </span>
              </div>
              {isCheckingHealth && (
                <span className="text-[10px] text-sky-400 animate-pulse">Analyzing...</span>
              )}
            </div>

            {healthReport ? (
              <div className="space-y-3 flex-1 text-xs">
                {/* Cardinality Verdict Card */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Cardinality Verdict</span>
                    <span
                      className={`text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-full border ${getCardinalityBadgeClass(
                        healthReport.cardinality
                      )}`}
                    >
                      {healthReport.cardinality}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    {healthReport.cardinality_description}
                  </p>
                </div>

                {/* Match Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Estimated Matches</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {healthReport.estimated_match_rate}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Output Rows</span>
                    <span className="text-sm font-bold text-slate-200 font-mono">
                      ~{healthReport.estimated_result_rows.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Fan-Out Warning Banner */}
                {healthReport.fanout_warning && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] leading-tight font-medium">
                        {healthReport.fanout_warning}
                      </p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-[11px] text-amber-100 font-semibold bg-amber-500/20 p-2 rounded-lg">
                      <input
                        type="checkbox"
                        checked={dedupeRightFirst}
                        onChange={(e) => setDedupeRightFirst(e.target.checked)}
                        className="rounded border-amber-500/40 text-amber-500 bg-slate-950"
                      />
                      <span>Deduplicate right table first (Prevent inflation)</span>
                    </label>
                  </div>
                )}

                {/* Type Mismatch Warning */}
                {healthReport.type_mismatches.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px]">
                    <p className="font-semibold mb-1">Key Data-Type Mismatch:</p>
                    {healthReport.type_mismatches.map((tm, i) => (
                      <p key={i}>
                        '{tm.left_col}' ({tm.left_type}) ↔ '{tm.right_col}' ({tm.right_type})
                      </p>
                    ))}
                  </div>
                )}

                {/* Key Nulls / Blanks */}
                {(healthReport.left_key_nulls > 0 || healthReport.right_key_nulls > 0) && (
                  <div className="text-[11px] text-slate-400">
                    Null keys detected: {healthReport.left_key_nulls} in left table, {healthReport.right_key_nulls} in right table.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <p className="text-xs">Configure keys to run health check</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              DuckDB Hash Join Engine • Background preview
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyJoin}
              className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-xs font-semibold text-white rounded-lg transition-all shadow-md shadow-sky-600/20"
            >
              Apply Join Step
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
