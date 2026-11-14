import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Check,
  Code2,
  Copy,
  Info,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronLeft,
  Columns,
  Sparkles,
  AlertCircle,
  Calendar,
  Tag,
  Key,
  Database,
  RefreshCw,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface AppendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppendModal: React.FC<AppendModalProps> = ({ isOpen, onClose }) => {
  const { datasets, selectedDataset, columns: leftColumns, addStep } = useWorkbenchStore();

  const [tableCountMode, setTableCountMode] = useState<'two' | 'multiple'>('two');
  const [appendDatasetId, setAppendDatasetId] = useState('');
  const [selectedMultiIds, setSelectedMultiIds] = useState<string[]>([]);
  const [highlightedAvailableId, setHighlightedAvailableId] = useState<string>('');
  const [highlightedMultiId, setHighlightedMultiId] = useState<string>('');

  const [incrementalMode, setIncrementalMode] = useState<'all' | 'distinct' | 'append_new_only' | 'upsert'>('all');
  const [keyColumn, setKeyColumn] = useState('');
  // Upsert: keep the version with the latest value in this column, so a
  // late-arriving older update cannot overwrite a newer one.
  const [newestBy, setNewestBy] = useState('');
  const [alignmentMode, setAlignmentMode] = useState<'by_name' | 'by_position'>('by_name');

  // Custom Provenance / Tracking Column (e.g. Month, Quarter, Batch)
  const [addCustomCol, setAddCustomCol] = useState(false);
  const [customColName, setCustomColName] = useState('Month');
  const [primaryVal, setPrimaryVal] = useState('January');
  const [appendVal, setAppendVal] = useState('February');

  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  const otherDatasets = datasets.filter((d) => d.id !== selectedDataset?.id);
  const appendDataset = datasets.find((d) => d.id === appendDatasetId) || otherDatasets[0];
  const rightColumns = appendDataset?.schema_metadata || [];

  const availableTables = otherDatasets.filter((d) => !selectedMultiIds.includes(d.id));

  useEffect(() => {
    if (isOpen && otherDatasets.length > 0) {
      if (!appendDatasetId || !otherDatasets.some((d) => d.id === appendDatasetId)) {
        setAppendDatasetId(otherDatasets[0].id);
      }
      if (selectedMultiIds.length === 0) {
        setSelectedMultiIds(otherDatasets.map((d) => d.id));
      }
    }
  }, [isOpen, datasets, selectedDataset]);

  // Analyze column overlap
  const leftColNames = new Set(leftColumns.map((c) => c.name));
  const rightColNames = new Set(rightColumns.map((c) => c.name));
  const sharedCols = rightColumns.filter((c) => leftColNames.has(c.name));
  const leftOnlyCols = leftColumns.filter((c) => !rightColNames.has(c.name));
  const rightOnlyCols = rightColumns.filter((c) => !leftColNames.has(c.name));

  // Auto-select a sensible key column for incremental modes
  useEffect(() => {
    if (sharedCols.length > 0 && !keyColumn) {
      const cand = sharedCols.find((c) => /id|key|code|sku|number|no/i.test(c.name)) || sharedCols[0];
      if (cand) setKeyColumn(cand.name);
    }
  }, [sharedCols, keyColumn]);

  if (!isOpen || !selectedDataset) return null;

  const targetIds =
    tableCountMode === 'two'
      ? appendDataset ? [appendDataset.id] : []
      : selectedMultiIds;
  const targetDatasets = targetIds
    .map((id) => datasets.find((d) => d.id === id))
    .filter(Boolean) as typeof datasets;

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetDatasets.length === 0) return;

    const labelSuffix = addCustomCol
      ? ` [${customColName || 'Month'}: ${primaryVal} + ${appendVal}]`
      : incrementalMode === 'append_new_only'
      ? ` (New Only by ${keyColumn || 'key'})`
      : incrementalMode === 'upsert'
      ? ` (Upsert by ${keyColumn || 'key'})`
      : incrementalMode === 'distinct'
      ? ' (Distinct)'
      : ' (All)';

    const targetNames = targetDatasets.map((d) => d.name);

    await addStep({
      id: crypto.randomUUID(),
      type: 'append',
      label:
        tableCountMode === 'two'
          ? `Append ${targetNames[0]}${labelSuffix}`
          : `Append ${targetIds.length} tables (${targetNames.join(', ')})${labelSuffix}`,
      enabled: true,
      params: {
        dataset_ids: targetIds,
        append_dataset_id: targetIds[0],
        append_dataset_name: targetNames.join(', '),
        table_count_mode: tableCountMode,
        union_type: incrementalMode === 'distinct' ? 'distinct' : 'all',
        alignment_mode: alignmentMode,
        add_custom_column: addCustomCol,
        custom_column_name: addCustomCol ? (customColName || 'Month') : undefined,
        primary_value: addCustomCol ? primaryVal : undefined,
        appended_value: addCustomCol ? appendVal : undefined,
        incremental_mode: incrementalMode,
        key_column: (incrementalMode === 'append_new_only' || incrementalMode === 'upsert') ? keyColumn : undefined,
        newest_by: incrementalMode === 'upsert' && newestBy ? newestBy : undefined,
      },
    });
    onClose();
  };

  const colSql = addCustomCol && customColName ? `, '${primaryVal}' AS "${customColName}"` : '';
  const appColSql = addCustomCol && customColName ? `, '${appendVal}' AS "${customColName}"` : '';
  const unionKw = incrementalMode === 'distinct' ? 'UNION' : 'UNION ALL';
  const alignByName = alignmentMode === 'by_name' ? ' BY NAME' : '';

  let sqlCode = '';
  if (targetDatasets.length === 1 && incrementalMode === 'append_new_only' && keyColumn) {
    sqlCode = `SELECT *${colSql} FROM ${selectedDataset.name}\n${unionKw}${alignByName}\nSELECT *${appColSql} FROM ${targetDatasets[0].name}\nWHERE "${keyColumn}" NOT IN (SELECT "${keyColumn}" FROM ${selectedDataset.name});`;
  } else if (targetDatasets.length === 1 && incrementalMode === 'upsert' && keyColumn) {
    sqlCode = `SELECT *${colSql} FROM ${selectedDataset.name}\nWHERE "${keyColumn}" NOT IN (SELECT "${keyColumn}" FROM ${targetDatasets[0].name})\n${unionKw}${alignByName}\nSELECT *${appColSql} FROM ${targetDatasets[0].name};`;
  } else {
    const baseSelect = `SELECT *${colSql} FROM ${selectedDataset.name}`;
    const otherSelects = targetDatasets.map((d) => `SELECT *${appColSql} FROM ${d.name}`);
    sqlCode = [baseSelect, ...otherSelects].join(`\n${unionKw}${alignByName}\n`) + ';';
  }

  const tableListStr = [selectedDataset.name, ...targetDatasets.map((d) => d.name)].join(', ');
  const mCode = addCustomCol && customColName
    ? `Table.Combine({Table.AddColumn(${selectedDataset.name}, "${customColName}", each "${primaryVal}"), ${targetDatasets.map((d) => `Table.AddColumn(${d.name}, "${customColName}", each "${appendVal}")`).join(', ')}});`
    : `Table.Combine({${tableListStr}});`;

  const polarsCode = addCustomCol && customColName
    ? `pl.concat([df1.with_columns(pl.lit("${primaryVal}").alias("${customColName}")), ${targetDatasets.map((d, i) => `df${i + 2}.with_columns(pl.lit("${appendVal}").alias("${customColName}"))`).join(', ')}])`
    : `pl.concat([df1, ${targetDatasets.map((_, i) => `df${i + 2}`).join(', ')}], how="${alignmentMode === 'by_name' ? 'diagonal' : 'vertical'}")`;

  const excelFormula = addCustomCol && customColName
    ? `=VSTACK(HSTACK(${selectedDataset.name}, "${primaryVal}"), ${targetDatasets.map((d) => `HSTACK(${d.name}, "${appendVal}")`).join(', ')})`
    : `=VSTACK(${tableListStr})`;

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
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
                  Power Query Style (1 or Multiple Tables)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Stack rows from one or multiple tables onto <span className="text-emerald-400 font-semibold">{selectedDataset.name}</span> with column alignment & incremental deduplication
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Power Query Mode Toggle: Two tables vs Three or more tables */}
          <div className="flex items-center gap-6 p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200">
              <input
                type="radio"
                name="tableCountMode"
                value="two"
                checked={tableCountMode === 'two'}
                onChange={() => setTableCountMode('two')}
                className="text-emerald-500 focus:ring-emerald-500/20"
              />
              <span>Two tables (1 table to append)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200">
              <input
                type="radio"
                name="tableCountMode"
                value="multiple"
                checked={tableCountMode === 'multiple'}
                onChange={() => setTableCountMode('multiple')}
                className="text-emerald-500 focus:ring-emerald-500/20"
              />
              <span>Three or more tables (Multiple tables to append)</span>
            </label>
          </div>

          {/* Table Selector Section */}
          {tableCountMode === 'two' ? (
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
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200 block">
                Tables to Append (Primary Sheet: <span className="text-emerald-400 font-bold">{selectedDataset.name}</span>)
              </label>
              <div className="grid grid-cols-12 gap-3 items-center">
                {/* Available Tables */}
                <div className="col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 pb-1 border-b border-slate-800">
                    Available Tables ({availableTables.length})
                  </div>
                  <div className="h-36 overflow-y-auto space-y-1">
                    {availableTables.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[11px] text-slate-500 italic">
                        All tables added
                      </div>
                    ) : (
                      availableTables.map((d) => (
                        <div
                          key={d.id}
                          onClick={() => setHighlightedAvailableId(d.id)}
                          className={`p-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-colors ${
                            highlightedAvailableId === d.id
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'text-slate-300 hover:bg-slate-900 border border-transparent'
                          }`}
                        >
                          <span className="truncate">{d.name}</span>
                          <span className="text-[10px] text-slate-500 shrink-0 ml-1">{d.row_count} rows</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Middle buttons */}
                <div className="col-span-2 flex flex-col items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={!highlightedAvailableId}
                    onClick={() => {
                      if (highlightedAvailableId) {
                        setSelectedMultiIds((prev) => [...prev, highlightedAvailableId]);
                        setHighlightedAvailableId('');
                      }
                    }}
                    className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-colors shadow-sm"
                  >
                    Add <ChevronRight size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={!highlightedMultiId || selectedMultiIds.length === 0}
                    onClick={() => {
                      if (highlightedMultiId) {
                        setSelectedMultiIds((prev) => prev.filter((id) => id !== highlightedMultiId));
                        setHighlightedMultiId('');
                      }
                    }}
                    className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <ChevronLeft size={13} /> Remove
                  </button>
                </div>

                {/* Tables to Append */}
                <div className="col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 pb-1 border-b border-slate-800 flex items-center justify-between">
                    <span>Tables to Append ({selectedMultiIds.length})</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!highlightedMultiId || selectedMultiIds.indexOf(highlightedMultiId) <= 0}
                        onClick={() => {
                          const idx = selectedMultiIds.indexOf(highlightedMultiId);
                          if (idx > 0) {
                            const next = [...selectedMultiIds];
                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                            setSelectedMultiIds(next);
                          }
                        }}
                        title="Move Up"
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        disabled={!highlightedMultiId || selectedMultiIds.indexOf(highlightedMultiId) >= selectedMultiIds.length - 1}
                        onClick={() => {
                          const idx = selectedMultiIds.indexOf(highlightedMultiId);
                          if (idx >= 0 && idx < selectedMultiIds.length - 1) {
                            const next = [...selectedMultiIds];
                            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                            setSelectedMultiIds(next);
                          }
                        }}
                        title="Move Down"
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded"
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                  </div>
                  <div className="h-36 overflow-y-auto space-y-1">
                    {selectedMultiIds.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[11px] text-amber-400/80 italic">
                        Select tables from left
                      </div>
                    ) : (
                      selectedMultiIds.map((id, index) => {
                        const d = datasets.find((x) => x.id === id);
                        return (
                          <div
                            key={id}
                            onClick={() => setHighlightedMultiId(id)}
                            className={`p-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-colors ${
                              highlightedMultiId === id
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'text-slate-300 hover:bg-slate-900 border border-transparent'
                            }`}
                          >
                            <span className="truncate">
                              <span className="text-[10px] text-emerald-400 font-mono mr-1.5">{index + 1}.</span>
                              {d?.name || id}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMultiIds((prev) => prev.filter((x) => x !== id));
                              }}
                              className="text-slate-500 hover:text-rose-400 p-0.5"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Feature 1: Custom Discriminator / Tracking Column (Month, Period, Batch) */}
          <div className="bg-slate-950/60 border border-emerald-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addCustomCol}
                  onChange={(e) => setAddCustomCol(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <Tag size={13} className="text-emerald-400" />
                  Add Custom Column (e.g. Month, Period, Batch ID)
                </span>
              </label>
              <span className="text-[11px] text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Recommended for Incremental Monthly Data
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              When stacking tables that have the same structure (e.g. monthly sales sheets), populate a new column with the month or batch name to distinguish records after appending.
            </p>

            {addCustomCol && (
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                {/* Preset quick buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
                  {[
                    { name: 'Month', pVal: 'January', aVal: 'February' },
                    { name: 'Quarter', pVal: 'Q1', aVal: 'Q2' },
                    { name: 'Year', pVal: '2023', aVal: '2024' },
                    { name: 'Batch_ID', pVal: 'Batch_01', aVal: 'Batch_02' },
                    { name: 'Source_Table', pVal: selectedDataset.name, aVal: appendDataset?.name || 'Appended' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setCustomColName(preset.name);
                        setPrimaryVal(preset.pVal);
                        setAppendVal(preset.aVal);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border border-slate-700 transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Column Name
                    </label>
                    <input
                      type="text"
                      value={customColName}
                      onChange={(e) => setCustomColName(e.target.value)}
                      placeholder="e.g. Month"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1 truncate" title={selectedDataset.name}>
                      Base Table Value ({selectedDataset.name})
                    </label>
                    <input
                      type="text"
                      value={primaryVal}
                      onChange={(e) => setPrimaryVal(e.target.value)}
                      placeholder="e.g. January"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1 truncate" title={appendDataset?.name}>
                      Appended Table Value ({appendDataset?.name || 'New Table'})
                    </label>
                    <input
                      type="text"
                      value={appendVal}
                      onChange={(e) => setAppendVal(e.target.value)}
                      placeholder="e.g. February"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 text-[11px] text-emerald-300 flex items-center gap-2">
                  <Sparkles size={13} className="shrink-0 text-emerald-400" />
                  <span>
                    Existing rows will have <span className="font-bold underline">{customColName || 'Month'} = "{primaryVal}"</span> and appended rows will have <span className="font-bold underline">{customColName || 'Month'} = "{appendVal}"</span>.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Feature 2: Incremental Stacking & Deduplication Mode */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <label className="text-xs font-semibold text-slate-200 block">
              Stacking & Incremental Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                <input
                  type="radio"
                  name="incrementalMode"
                  value="all"
                  checked={incrementalMode === 'all'}
                  onChange={() => setIncrementalMode('all')}
                  className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <div>
                  <span className="text-xs font-medium text-slate-200 block">Union All (Default)</span>
                  <span className="text-[11px] text-slate-400">Stack all rows, keeping all records</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                <input
                  type="radio"
                  name="incrementalMode"
                  value="distinct"
                  checked={incrementalMode === 'distinct'}
                  onChange={() => setIncrementalMode('distinct')}
                  className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <div>
                  <span className="text-xs font-medium text-slate-200 block">Union Distinct</span>
                  <span className="text-[11px] text-slate-400">Eliminate full row duplicates across all columns</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                <input
                  type="radio"
                  name="incrementalMode"
                  value="append_new_only"
                  checked={incrementalMode === 'append_new_only'}
                  onChange={() => setIncrementalMode('append_new_only')}
                  className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <div>
                  <span className="text-xs font-medium text-slate-200 block">Append New Records Only</span>
                  <span className="text-[11px] text-slate-400">Only add records whose key does not exist in base table</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 border border-transparent has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/5 transition-all">
                <input
                  type="radio"
                  name="incrementalMode"
                  value="upsert"
                  checked={incrementalMode === 'upsert'}
                  onChange={() => setIncrementalMode('upsert')}
                  className="mt-0.5 text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <div>
                  <span className="text-xs font-medium text-slate-200 block">Upsert / Replace by Key</span>
                  <span className="text-[11px] text-slate-400">Update existing records matching key; add new records</span>
                </div>
              </label>
            </div>

            {/* Key Column Selector for Incremental Modes */}
            {(incrementalMode === 'append_new_only' || incrementalMode === 'upsert') && (
              <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-amber-300 shrink-0 font-medium">
                  <Key size={13} />
                  <span>Deduplication Key Column:</span>
                </div>
                <select
                  value={keyColumn}
                  onChange={(e) => setKeyColumn(e.target.value)}
                  className="flex-1 bg-slate-900 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="">-- Select Key Column --</option>
                  {sharedCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.data_type})
                    </option>
                  ))}
                  {leftColumns
                    .filter((c) => !sharedCols.some((sc) => sc.name === c.name))
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.data_type})
                      </option>
                    ))}
                </select>
              </div>
            )}
            {incrementalMode === 'upsert' && (
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-300 shrink-0 font-medium" title="Use when updates can arrive late or out of order">
                  Newest version by:
                </div>
                <select
                  value={newestBy}
                  onChange={(e) => setNewestBy(e.target.value)}
                  aria-label="Newest version by"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="">Arrival order (later file wins)</option>
                  {leftColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      Latest {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Configuration Grid: Column Alignment */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5">
            <label className="text-xs font-semibold text-slate-200 block mb-2">
              Column Alignment
            </label>
            <div className="grid grid-cols-2 gap-2">
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
                  <span className="text-[11px] text-slate-400">Align matching headers; fill missing as null</span>
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

