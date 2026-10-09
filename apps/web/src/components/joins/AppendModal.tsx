import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Check,
  Code2,
  Copy,
  Info,
  ArrowDown,
  Columns,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface AppendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppendModal: React.FC<AppendModalProps> = ({ isOpen, onClose }) => {
  const { datasets, selectedDataset, columns: leftColumns, addStep } = useWorkbenchStore();

  const [appendDatasetId, setAppendDatasetId] = useState('');
  const [unionType, setUnionType] = useState<'all' | 'distinct'>('all');
  const [alignmentMode, setAlignmentMode] = useState<'by_name' | 'by_position'>('by_name');
  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  const otherDatasets = datasets.filter((d) => d.id !== selectedDataset?.id);
  const appendDataset = datasets.find((d) => d.id === appendDatasetId) || otherDatasets[0];
  const rightColumns = appendDataset?.schema_metadata || [];

  useEffect(() => {
    if (isOpen && otherDatasets.length > 0) {
      setAppendDatasetId(otherDatasets[0].id);
    }
  }, [isOpen, datasets, selectedDataset]);

  if (!isOpen || !selectedDataset) return null;

  // Analyze column overlap
  const leftColNames = new Set(leftColumns.map((c) => c.name));
  const rightColNames = new Set(rightColumns.map((c) => c.name));
  const sharedCols = rightColumns.filter((c) => leftColNames.has(c.name));
  const leftOnlyCols = leftColumns.filter((c) => !rightColNames.has(c.name));
  const rightOnlyCols = rightColumns.filter((c) => !leftColNames.has(c.name));

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appendDataset) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'append',
      label: `Append ${appendDataset.name} (${unionType === 'distinct' ? 'Distinct' : 'All'})`,
      enabled: true,
      params: {
        append_dataset_id: appendDataset.id,
        union_type: unionType,
        alignment_mode: alignmentMode,
      },
    });
    onClose();
  };

  const sqlCode = `SELECT * FROM ${selectedDataset.name}\n${
    unionType === 'distinct' ? 'UNION' : 'UNION ALL'
  }${alignmentMode === 'by_name' ? ' BY NAME' : ''}\nSELECT * FROM ${appendDataset?.name || 'AppendTable'};`;

  const mCode = `Table.Combine({${selectedDataset.name}, ${appendDataset?.name || 'AppendTable'}});`;
  const polarsCode = `pl.concat([df1, df2], how="${alignmentMode === 'by_name' ? 'diagonal' : 'vertical'}")`;
  const excelFormula = `=VSTACK(${selectedDataset.name}, ${appendDataset?.name || 'AppendTable'})`;

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Append / Union Tables</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Stack Vertically
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Stack rows from another table onto <span className="text-emerald-400 font-semibold">{selectedDataset.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Pick secondary dataset */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Select Table to Append
            </label>
            {otherDatasets.length === 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                <AlertCircle size={15} />
                <span>Upload at least one more dataset from the left panel to append tables.</span>
              </div>
            ) : (
              <select
                value={appendDatasetId}
                onChange={(e) => setAppendDatasetId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {otherDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count.toLocaleString()} rows, {d.column_count} columns)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Union Type */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5">
              <label className="text-xs font-semibold text-slate-200 block mb-2">
                Deduplication Mode
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                  <input
                    type="radio"
                    name="unionType"
                    value="all"
                    checked={unionType === 'all'}
                    onChange={() => setUnionType('all')}
                    className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Union All (Default)</span>
                    <span className="text-[11px] text-slate-400">Keep all rows, preserving duplicate rows</span>
                  </div>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                  <input
                    type="radio"
                    name="unionType"
                    value="distinct"
                    checked={unionType === 'distinct'}
                    onChange={() => setUnionType('distinct')}
                    className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Union Distinct</span>
                    <span className="text-[11px] text-slate-400">Eliminate duplicate rows across all columns</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Alignment Mode */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5">
              <label className="text-xs font-semibold text-slate-200 block mb-2">
                Column Alignment
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                  <input
                    type="radio"
                    name="alignmentMode"
                    value="by_name"
                    checked={alignmentMode === 'by_name'}
                    onChange={() => setAlignmentMode('by_name')}
                    className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Match by Column Name</span>
                    <span className="text-[11px] text-slate-400">Match matching header names; fill missing as null</span>
                  </div>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                  <input
                    type="radio"
                    name="alignmentMode"
                    value="by_position"
                    checked={alignmentMode === 'by_position'}
                    onChange={() => setAlignmentMode('by_position')}
                    className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Match by Position</span>
                    <span className="text-[11px] text-slate-400">Stack column 1 with column 1 regardless of name</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Visual Stacking Illustration & Schema Analysis */}
          {appendDataset && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Columns size={14} className="text-emerald-400" />
                  Column Alignment Preview
                </span>
                <span className="text-[11px] text-slate-400">
                  Combined estimated rows:{' '}
                  <span className="text-emerald-400 font-bold">
                    {(selectedDataset.row_count + appendDataset.row_count).toLocaleString()}
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                  <div className="font-bold text-emerald-300 text-sm">{sharedCols.length}</div>
                  <div className="text-slate-400 mt-0.5">Matching Columns</div>
                </div>
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-2">
                  <div className="font-bold text-sky-300 text-sm">{leftOnlyCols.length}</div>
                  <div className="text-slate-400 mt-0.5">{selectedDataset.name} only</div>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2">
                  <div className="font-bold text-purple-300 text-sm">{rightOnlyCols.length}</div>
                  <div className="text-slate-400 mt-0.5">{appendDataset.name} only</div>
                </div>
              </div>

              {rightOnlyCols.length > 0 && (
                <div className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-400 shrink-0" />
                  <span>
                    New columns from {appendDataset.name} (
                    {rightOnlyCols.map((c) => c.name).slice(0, 3).join(', ')}
                    {rightOnlyCols.length > 3 ? '...' : ''}) will be added with null values for existing rows.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Show Formula Drawer */}
          <div>
            <button
              type="button"
              onClick={() => setShowFormula(!showFormula)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Code2 size={13} className="text-emerald-400" />
              <span>{showFormula ? 'Hide equivalent formula code' : 'Show equivalent formula / code'}</span>
            </button>

            {showFormula && (
              <div className="mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
                  <span>DuckDB SQL</span>
                  <button
                    type="button"
                    onClick={() => copyCode(sqlCode)}
                    className="hover:text-emerald-400 flex items-center gap-1"
                  >
                    <Copy size={11} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="text-emerald-300 text-[11px] overflow-x-auto whitespace-pre-wrap">{sqlCode}</pre>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pt-2 pb-1">
                  <span>Excel Formula & Power Query M</span>
                </div>
                <div className="text-slate-300 text-[11px] space-y-1">
                  <div><span className="text-slate-500">Excel:</span> {excelFormula}</div>
                  <div><span className="text-slate-500">M:</span> {mCode}</div>
                  <div><span className="text-slate-500">Polars:</span> {polarsCode}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!appendDataset}
            className="px-5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
          >
            <Check size={14} />
            <span>Apply Append Step</span>
          </button>
        </div>
      </div>
    </div>
  );
};
