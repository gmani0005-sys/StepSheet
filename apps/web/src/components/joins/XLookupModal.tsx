import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface XLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const XLookupModal: React.FC<XLookupModalProps> = ({ isOpen, onClose }) => {
  const { datasets, selectedDataset, columns: leftColumns, addStep } = useWorkbenchStore();

  const [lookupDatasetId, setLookupDatasetId] = useState('');
  const [leftKey, setLeftKey] = useState('');
  const [rightKey, setRightKey] = useState('');
  const [selectedReturnCols, setSelectedReturnCols] = useState<string[]>([]);
  const [ifNotFound, setIfNotFound] = useState('Not found');
  const [matchMode, setMatchMode] = useState<number>(0); // 0 = exact, -1 = exact or next smaller, 1 = exact or next larger, 2 = wildcard
  const [searchMode, setSearchMode] = useState<number>(1); // 1 = first-to-last, -1 = last-to-first

  const otherDatasets = datasets.filter((d) => d.id !== selectedDataset?.id);
  const lookupDataset =
    datasets.find((d) => d.id === lookupDatasetId) || otherDatasets[0] || selectedDataset;
  const lookupColumns = lookupDataset?.schema_metadata || [];

  useEffect(() => {
    if (isOpen && otherDatasets.length > 0) {
      setLookupDatasetId(otherDatasets[0].id);
    } else if (isOpen && selectedDataset) {
      setLookupDatasetId(selectedDataset.id);
    }
  }, [isOpen, datasets]);

  useEffect(() => {
    if (leftColumns.length > 0 && !leftKey) {
      setLeftKey(leftColumns[0].name);
    }
    if (lookupColumns.length > 0) {
      const match = lookupColumns.find((c) => c.name.toLowerCase() === leftKey.toLowerCase());
      setRightKey(match ? match.name : lookupColumns[0].name);
      setSelectedReturnCols([lookupColumns[lookupColumns.length - 1].name]);
    }
  }, [lookupDataset, leftKey, leftColumns]);

  if (!isOpen || !selectedDataset) return null;

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupDataset || selectedReturnCols.length === 0) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'xlookup',
      label: `XLOOKUP ${selectedReturnCols.join(', ')} from ${lookupDataset.name}`,
      enabled: true,
      params: {
        lookup_dataset_id: lookupDataset.id,
        left_key_col: leftKey,
        right_key_col: rightKey,
        return_columns: selectedReturnCols,
        if_not_found: ifNotFound,
        match_mode: matchMode,
        search_mode: searchMode,
      },
    });
    onClose();
  };

  const toggleReturnCol = (colName: string) => {
    if (selectedReturnCols.includes(colName)) {
      setSelectedReturnCols(selectedReturnCols.filter((c) => c !== colName));
    } else {
      setSelectedReturnCols([...selectedReturnCols, colName]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
            <Search size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">XLOOKUP Wizard</h3>
            <p className="text-xs text-slate-400">
              Flexible modern lookup in any column direction with multi-column return &amp; search modes
            </p>
          </div>
        </div>

        <form onSubmit={handleApply} className="space-y-4">
          {/* Reference Dataset */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Lookup Reference Table
            </label>
            <select
              value={lookupDatasetId}
              onChange={(e) => setLookupDatasetId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              {(otherDatasets.length > 0 ? otherDatasets : datasets).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.row_count} rows)
                </option>
              ))}
            </select>
          </div>

          {/* Key matching */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">
                Lookup Value ({selectedDataset.name})
              </span>
              <select
                value={leftKey}
                onChange={(e) => setLeftKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              >
                {leftColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">
                Lookup Array ({lookupDataset?.name})
              </span>
              <select
                value={rightKey}
                onChange={(e) => setRightKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              >
                {lookupColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Return Columns */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Return Array (Columns to Bring Back)
            </label>
            <div className="max-h-28 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
              {lookupColumns.map((c) => (
                <label
                  key={c.name}
                  className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedReturnCols.includes(c.name)}
                    onChange={() => toggleReturnCol(c.name)}
                    className="rounded border-slate-800 bg-slate-900 text-emerald-500"
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Match Mode & Search Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Match Mode (<code className="font-mono">[match_mode]</code>)
              </label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value={0}>0 — Exact match</option>
                <option value={-1}>-1 — Exact or next smaller</option>
                <option value={1}>1 — Exact or next larger</option>
                <option value={2}>2 — Wildcard match (*, ?)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Search Mode (<code className="font-mono">[search_mode]</code>)
              </label>
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value={1}>1 — First-to-Last (Top down)</option>
                <option value={-1}>-1 — Last-to-First (Bottom up)</option>
              </select>
            </div>
          </div>

          {/* Fallback */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              If Not Found Value (<code className="font-mono">[if_not_found]</code>)
            </label>
            <input
              type="text"
              value={ifNotFound}
              onChange={(e) => setIfNotFound(e.target.value)}
              placeholder="e.g. Not found or 0"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
            />
          </div>

          {/* Live Excel Formula Preview */}
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 font-mono break-all">
            =XLOOKUP({leftKey}2, {lookupDataset?.name}!{rightKey}:{rightKey}, {lookupDataset?.name}!
            {selectedReturnCols[0] || 'Result'}, &quot;{ifNotFound}&quot;, {matchMode}, {searchMode})
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedReturnCols.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg shadow-sm"
            >
              Apply XLOOKUP Step
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

