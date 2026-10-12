import React, { useState, useEffect } from 'react';
import { X, TableProperties, Hash } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface VLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VLookupModal: React.FC<VLookupModalProps> = ({ isOpen, onClose }) => {
  const { datasets, selectedDataset, columns: leftColumns, addStep } = useWorkbenchStore();

  const [lookupDatasetId, setLookupDatasetId] = useState('');
  const [leftKey, setLeftKey] = useState('');
  const [rightKey, setRightKey] = useState('');
  const [colIndexNum, setColIndexNum] = useState<number>(2);
  const [returnColumn, setReturnColumn] = useState('');
  const [rangeLookup, setRangeLookup] = useState<boolean>(false); // FALSE = Exact Match, TRUE = Approximate Match
  const [ifNotFound, setIfNotFound] = useState('Not found');
  const [outputColName, setOutputColName] = useState('');

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
      // VLOOKUP searches the first/key column of the table_array
      const match = lookupColumns.find((c) => c.name.toLowerCase() === leftKey.toLowerCase());
      setRightKey(match ? match.name : lookupColumns[0].name);
      const defaultIdx = lookupColumns.length >= 2 ? 2 : 1;
      setColIndexNum(defaultIdx);
      const targetCol = lookupColumns[defaultIdx - 1]?.name || lookupColumns[0].name;
      setReturnColumn(targetCol);
      setOutputColName(targetCol);
    }
  }, [lookupDataset, leftKey, leftColumns]);

  if (!isOpen || !selectedDataset) return null;

  const handleSelectColIndex = (idx1Based: number, colName: string) => {
    setColIndexNum(idx1Based);
    setReturnColumn(colName);
    setOutputColName(colName);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupDataset || !returnColumn) return;

    const finalOutCol = outputColName.trim() || returnColumn;

    await addStep({
      id: crypto.randomUUID(),
      type: 'vlookup',
      label: `VLOOKUP Col #${colIndexNum} (${returnColumn}) from ${lookupDataset.name}`,
      enabled: true,
      params: {
        lookup_dataset_id: lookupDataset.id,
        left_key_col: leftKey,
        right_key_col: rightKey,
        col_index_num: colIndexNum,
        return_column: returnColumn,
        return_columns: [returnColumn],
        output_column: finalOutCol,
        range_lookup: rangeLookup,
        if_not_found: ifNotFound,
      },
    });
    onClose();
  };

  const lastColLetter = String.fromCharCode(64 + Math.min(26, Math.max(1, lookupColumns.length)));
  const rangeLookupLabel = rangeLookup ? 'TRUE' : 'FALSE';
  const rawVlookupExpr = `VLOOKUP(${leftKey}2, '${lookupDataset?.name || 'Table'}'!A:${lastColLetter}, ${colIndexNum}, ${rangeLookupLabel})`;
  const excelFormulaPreview =
    ifNotFound.trim() !== ''
      ? `=IFERROR(${rawVlookupExpr}, "${ifNotFound}")`
      : `=${rawVlookupExpr}`;

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
            <TableProperties size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">VLOOKUP Wizard</h3>
            <p className="text-xs text-slate-400">
              Vertical table lookup by Column Index Number (col_index_num) &amp; Exact/Approximate match
            </p>
          </div>
        </div>

        <form onSubmit={handleApply} className="space-y-4">
          {/* 1. Table Array (Reference Dataset) */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              1. Table Array (Lookup Reference Table)
            </label>
            <select
              value={lookupDatasetId}
              onChange={(e) => setLookupDatasetId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              {(otherDatasets.length > 0 ? otherDatasets : datasets).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.row_count} rows • {d.column_count} cols)
                </option>
              ))}
            </select>
          </div>

          {/* 2. Lookup Value & Key Column */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">
                2. Lookup Value ({selectedDataset.name})
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
                Table Key Column ({lookupDataset?.name})
              </span>
              <select
                value={rightKey}
                onChange={(e) => setRightKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              >
                {lookupColumns.map((c, idx) => (
                  <option key={c.name} value={c.name}>
                    Col #{idx + 1}: {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Column Index Number (col_index_num) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-300">
                3. Column Index Number (<code className="font-mono">col_index_num</code>)
              </label>
              <span className="text-[11px] font-mono font-semibold text-emerald-400">
                Selected: Col #{colIndexNum} ({returnColumn})
              </span>
            </div>
            <div className="max-h-36 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
              {lookupColumns.map((c, idx) => {
                const idx1 = idx + 1;
                const isSelected = colIndexNum === idx1;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => handleSelectColIndex(idx1, c.name)}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors border ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 text-slate-100 font-semibold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-mono text-[10px] font-bold shrink-0">
                        #{idx1}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">
                      {c.data_type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Range Lookup (Exact vs Approximate Match) */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              4. Range Lookup (<code className="font-mono">[range_lookup]</code>)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRangeLookup(false)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  !rangeLookup
                    ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold font-mono">FALSE (0) — Exact Match</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Matches exact key value only (Recommended)
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRangeLookup(true)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  rangeLookup
                    ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold font-mono">TRUE (1) — Approximate</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Closest match less than or equal to key
                </div>
              </button>
            </div>
          </div>

          {/* 5. Output Column Name & IFERROR Fallback */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Output Column Name
              </label>
              <input
                type="text"
                value={outputColName}
                onChange={(e) => setOutputColName(e.target.value)}
                placeholder={returnColumn || 'vlookup_result'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                IFERROR Fallback (If #N/A)
              </label>
              <input
                type="text"
                value={ifNotFound}
                onChange={(e) => setIfNotFound(e.target.value)}
                placeholder="e.g. Not found or 0"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>

          {/* Live Excel Formula Preview */}
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 font-mono break-all">
            {excelFormulaPreview}
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
              disabled={!returnColumn}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg shadow-sm"
            >
              Apply VLOOKUP Step
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
