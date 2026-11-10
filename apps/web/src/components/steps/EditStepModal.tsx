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
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

export const EditStepModal: React.FC = () => {
  const {
    isEditStepModalOpen,
    editingStep,
    columns,
    datasets,
    selectedDataset,
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
      setActiveTab('visual');
    }
  }, [editingStep]);

  if (!isEditStepModalOpen || !editingStep) return null;

  const updateParams = (patch: Record<string, any>) => {
    const updated = { ...params, ...patch };
    setParams(updated);
    setRawJson(JSON.stringify(updated, null, 2));
  };

  const handleParamChange = (key: string, value: any) => {
    updateParams({ [key]: value });
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

  const toggleArrayItem = (arr: string[], item: string): string[] => {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  };

  // Compute all available columns merging base dataset schema, current store columns, and step references
  const availableColumns = React.useMemo(() => {
    const map = new Map<string, { name: string; type?: string; data_type?: string }>();
    if (selectedDataset?.schema_metadata) {
      selectedDataset.schema_metadata.forEach((c) => {
        if (c.name && !map.has(c.name)) {
          map.set(c.name, { name: c.name, type: (c as any).type || c.data_type, data_type: c.data_type || (c as any).type });
        }
      });
    }
    columns.forEach((c) => {
      if (c.name && !map.has(c.name)) {
        map.set(c.name, { name: c.name, type: (c as any).type || c.data_type, data_type: c.data_type || (c as any).type });
      }
    });
    if (editingStep?.params) {
      const p = editingStep.params;
      if (p.column && !map.has(p.column)) map.set(p.column, { name: p.column });
      if (p.target_column && !map.has(p.target_column)) map.set(p.target_column, { name: p.target_column });
      if (p.value_column && !map.has(p.value_column)) map.set(p.value_column, { name: p.value_column });
      if (Array.isArray(p.group_by_columns)) {
        p.group_by_columns.forEach((c: string) => {
          if (c && !map.has(c)) map.set(c, { name: c });
        });
      }
      if (Array.isArray(p.group_columns)) {
        p.group_columns.forEach((c: string) => {
          if (c && !map.has(c)) map.set(c, { name: c });
        });
      }
      if (typeof p.group_by === 'string' && !map.has(p.group_by)) {
        map.set(p.group_by, { name: p.group_by });
      }
      if (Array.isArray(p.aggregations)) {
        p.aggregations.forEach((a: any) => {
          if (a.column && !map.has(a.column)) map.set(a.column, { name: a.column });
        });
      }
      if (Array.isArray(p.index_columns)) {
        p.index_columns.forEach((c: string) => {
          if (c && !map.has(c)) map.set(c, { name: c });
        });
      }
      if (p.pivot_column && !map.has(p.pivot_column)) map.set(p.pivot_column, { name: p.pivot_column });
      if (Array.isArray(p.partition_by)) {
        p.partition_by.forEach((c: string) => {
          if (c && !map.has(c)) map.set(c, { name: c });
        });
      }
      if (p.order_by && !map.has(p.order_by)) map.set(p.order_by, { name: p.order_by });
    }
    return Array.from(map.values());
  }, [selectedDataset, columns, editingStep]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jsonError && activeTab === 'raw') return;

    const finalParams = { ...params };
    if (editingStep.type === 'group_by' && Array.isArray(finalParams.aggregations)) {
      finalParams.aggregations = finalParams.aggregations.map((a: any) => {
        const fn = (a.agg_func || a.function || 'sum').toLowerCase();
        const col = a.column || (availableColumns[0]?.name || 'val');
        const out = a.output_column || a.alias || a.output_name || `${fn}_${col}`;
        return {
          ...a,
          column: col,
          agg_func: fn,
          function: fn,
          output_column: out,
          alias: out,
          output_name: out,
        };
      });
    }

    await updateStep(editingStep.id, {
      label: label.trim() || editingStep.label,
      enabled,
      params: finalParams,
    });
  };

  // Helper to resolve reference dataset & its columns for lookup/join steps
  const getReferenceDataset = (dsId?: string) => {
    const otherDatasets = datasets.filter((d) => d.id !== selectedDataset?.id);
    return (
      datasets.find((d) => d.id === dsId) ||
      otherDatasets[0] ||
      datasets[0] ||
      selectedDataset
    );
  };

  const renderVisualEditor = () => {
    const type = editingStep.type;

    switch (type) {
      case 'vlookup': {
        const refId = params.lookup_dataset_id || params.right_dataset_id || '';
        const refDs = getReferenceDataset(refId);
        const refCols = refDs?.schema_metadata || [];
        const leftKey = params.left_key_col || params.lookup_column || columns[0]?.name || '';
        const rightKey = params.right_key_col || refCols[0]?.name || '';
        const colIdx = Number(params.col_index_num ?? 2);
        const retCol =
          params.return_column ||
          refCols[colIdx - 1]?.name ||
          (Array.isArray(params.return_columns) ? params.return_columns[0] : '') ||
          refCols[0]?.name ||
          '';
        const rangeLookup = Boolean(params.range_lookup);

        return (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                1. Table Array (Lookup Reference Table)
              </label>
              <select
                value={refDs?.id || ''}
                onChange={(e) => {
                  const newDs = datasets.find((d) => d.id === e.target.value);
                  const newCols = newDs?.schema_metadata || [];
                  const newIdx = Math.min(colIdx, Math.max(1, newCols.length));
                  const newRetCol = newCols[newIdx - 1]?.name || '';
                  updateParams({
                    lookup_dataset_id: e.target.value,
                    right_key_col: newCols[0]?.name || '',
                    col_index_num: newIdx,
                    return_column: newRetCol,
                    return_columns: newRetCol ? [newRetCol] : [],
                  });
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count} rows • {d.column_count} cols)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  2. Lookup Value Column ({selectedDataset?.name || 'Active Sheet'})
                </label>
                <select
                  value={leftKey}
                  onChange={(e) => handleParamChange('left_key_col', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Reference Key Column ({refDs?.name || 'Lookup Table'})
                </label>
                <select
                  value={rightKey}
                  onChange={(e) => handleParamChange('right_key_col', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {refCols.map((c, idx) => (
                    <option key={c.name} value={c.name}>
                      Col #{idx + 1}: {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  3. Column Index Number (<code className="font-mono">col_index_num</code>) &amp; Return Column
                </label>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                  Col #{colIdx} ({retCol})
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {refCols.map((c, idx) => {
                  const idx1 = idx + 1;
                  const isSel = colIdx === idx1 || retCol === c.name;
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        updateParams({
                          col_index_num: idx1,
                          return_column: c.name,
                          return_columns: [c.name],
                          output_column: c.name,
                        });
                        setLabel(`VLOOKUP Col #${idx1} (${c.name}) from ${refDs?.name || 'Table'}`);
                      }}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs text-left border transition-colors ${
                        isSel
                          ? 'bg-emerald-500/15 border-emerald-500 text-slate-100 font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">
                        <strong className="font-mono text-emerald-400 mr-1">#{idx1}</strong>
                        {c.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        {c.data_type}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                4. Range Lookup (<code className="font-mono">[range_lookup]</code>)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleParamChange('range_lookup', false)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                    !rangeLookup
                      ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  FALSE (0) — Exact Match
                </button>
                <button
                  type="button"
                  onClick={() => handleParamChange('range_lookup', true)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                    rangeLookup
                      ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  TRUE (1) — Approximate Match
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Output Column Name
                </label>
                <input
                  type="text"
                  value={params.output_column ?? retCol}
                  onChange={(e) => handleParamChange('output_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  IFERROR Fallback Value
                </label>
                <input
                  type="text"
                  value={params.if_not_found ?? 'Not found'}
                  onChange={(e) => handleParamChange('if_not_found', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>
        );
      }

      case 'xlookup': {
        const refId = params.lookup_dataset_id || params.right_dataset_id || '';
        const refDs = getReferenceDataset(refId);
        const refCols = refDs?.schema_metadata || [];
        const leftKey = params.left_key_col || params.lookup_column || columns[0]?.name || '';
        const rightKey =
          params.right_key_col || params.right_Lookup_column || refCols[0]?.name || '';
        const returnCols: string[] = Array.isArray(params.return_columns)
          ? params.return_columns
          : params.return_column
          ? [params.return_column]
          : [];

        return (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Lookup Reference Table
              </label>
              <select
                value={refDs?.id || ''}
                onChange={(e) => {
                  const newDs = datasets.find((d) => d.id === e.target.value);
                  const newCols = newDs?.schema_metadata || [];
                  updateParams({
                    lookup_dataset_id: e.target.value,
                    right_key_col: newCols[0]?.name || '',
                    return_columns: newCols.length > 0 ? [newCols[newCols.length - 1].name] : [],
                  });
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count} rows • {d.column_count} cols)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Lookup Value ({selectedDataset?.name || 'Active Sheet'})
                </label>
                <select
                  value={leftKey}
                  onChange={(e) => handleParamChange('left_key_col', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Lookup Array ({refDs?.name || 'Reference Table'})
                </label>
                <select
                  value={rightKey}
                  onChange={(e) => handleParamChange('right_key_col', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {refCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Return Array (Columns to Bring Back)
              </label>
              <div className="max-h-32 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {refCols.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={returnCols.includes(c.name)}
                      onChange={() => {
                        const next = toggleArrayItem(returnCols, c.name);
                        handleParamChange('return_columns', next);
                        if (next.length > 0) {
                          setLabel(`XLOOKUP ${next.join(', ')} from ${refDs?.name || 'Table'}`);
                        }
                      }}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Match Mode (<code className="font-mono">[match_mode]</code>)
                </label>
                <select
                  value={params.match_mode ?? 0}
                  onChange={(e) => handleParamChange('match_mode', Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                >
                  <option value={0}>0 — Exact match</option>
                  <option value={-1}>-1 — Exact or next smaller</option>
                  <option value={1}>1 — Exact or next larger</option>
                  <option value={2}>2 — Wildcard match (*, ?)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Search Mode (<code className="font-mono">[search_mode]</code>)
                </label>
                <select
                  value={params.search_mode ?? 1}
                  onChange={(e) => handleParamChange('search_mode', Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                >
                  <option value={1}>1 — First-to-Last (Top down)</option>
                  <option value={-1}>-1 — Last-to-First (Bottom up)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                If Not Found Value (<code className="font-mono">[if_not_found]</code>)
              </label>
              <input
                type="text"
                value={params.if_not_found ?? 'Not found'}
                onChange={(e) => handleParamChange('if_not_found', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
        );
      }

      case 'join': {
        const rightId = params.right_dataset_id || params.lookup_dataset_id || '';
        const rightDs = getReferenceDataset(rightId);
        const rightCols = rightDs?.schema_metadata || [];
        const keyPairs: any[] =
          Array.isArray(params.key_pairs) && params.key_pairs.length > 0
            ? params.key_pairs
            : [
                {
                  left_col: params.left_key || columns[0]?.name || '',
                  right_col: params.right_key || rightCols[0]?.name || '',
                  trim_whitespace: true,
                  case_insensitive: false,
                },
              ];
        const selectedRightCols: string[] = Array.isArray(params.right_columns)
          ? params.right_columns
          : rightCols.map((c) => c.name);

        return (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Right Table to Join
                </label>
                <select
                  value={rightDs?.id || ''}
                  onChange={(e) => {
                    const newDs = datasets.find((d) => d.id === e.target.value);
                    const newCols = newDs?.schema_metadata || [];
                    updateParams({
                      right_dataset_id: e.target.value,
                      right_columns: newCols.map((c) => c.name),
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.row_count} rows)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Join Type</label>
                <select
                  value={params.join_type || 'left'}
                  onChange={(e) => handleParamChange('join_type', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="left">Left Join (Keep all left rows)</option>
                  <option value="inner">Inner Join (Matching rows only)</option>
                  <option value="full">Full Outer Join (All rows from both)</option>
                  <option value="right">Right Join (Keep all right rows)</option>
                  <option value="left_anti">Left Anti (Only in Left)</option>
                  <option value="right_anti">Right Anti (Only in Right)</option>
                  <option value="left_semi">Left Semi (Left with match)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">Join Key Mapping</label>
                <button
                  type="button"
                  onClick={() =>
                    handleParamChange('key_pairs', [
                      ...keyPairs,
                      {
                        left_col: columns[0]?.name || '',
                        right_col: rightCols[0]?.name || '',
                        trim_whitespace: true,
                        case_insensitive: false,
                      },
                    ])
                  }
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus size={12} /> Add Key
                </button>
              </div>
              <div className="space-y-2">
                {keyPairs.map((kp, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800"
                  >
                    <select
                      value={kp.left_col || kp.left_key || ''}
                      onChange={(e) => {
                        const next = [...keyPairs];
                        next[idx] = { ...next[idx], left_col: e.target.value };
                        handleParamChange('key_pairs', next);
                      }}
                      className="col-span-5 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {availableColumns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="col-span-1 text-center text-xs text-slate-500">=</span>
                    <select
                      value={kp.right_col || kp.right_key || ''}
                      onChange={(e) => {
                        const next = [...keyPairs];
                        next[idx] = { ...next[idx], right_col: e.target.value };
                        handleParamChange('key_pairs', next);
                      }}
                      className="col-span-5 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {rightCols.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {keyPairs.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleParamChange(
                            'key_pairs',
                            keyPairs.filter((_, i) => i !== idx)
                          )
                        }
                        className="col-span-1 text-slate-500 hover:text-rose-400 flex justify-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Right Table Columns to Include
              </label>
              <div className="max-h-28 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {rightCols.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRightCols.includes(c.name)}
                      onChange={() =>
                        handleParamChange('right_columns', toggleArrayItem(selectedRightCols, c.name))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Right Column Prefix
                </label>
                <input
                  type="text"
                  value={params.right_prefix ?? 'right_'}
                  onChange={(e) => handleParamChange('right_prefix', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 pt-4">
                <input
                  type="checkbox"
                  checked={Boolean(params.deduplicate_right)}
                  onChange={(e) => handleParamChange('deduplicate_right', e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Deduplicate right table first</span>
              </label>
            </div>
          </div>
        );
      }

      case 'append': {
        const currentIds: string[] = Array.isArray(params.dataset_ids)
          ? params.dataset_ids
          : params.append_dataset_id
          ? [params.append_dataset_id]
          : [];

        return (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Tables to Append / Stack
              </label>
              <div className="max-h-36 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
                {datasets
                  .filter((d) => d.id !== selectedDataset?.id)
                  .map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center justify-between p-2 rounded bg-slate-900 hover:bg-slate-800 text-xs text-slate-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={currentIds.includes(d.id)}
                          onChange={() => {
                            const next = toggleArrayItem(currentIds, d.id);
                            updateParams({
                              dataset_ids: next,
                              append_dataset_id: next[0] || '',
                            });
                          }}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                        />
                        <span className="font-medium">{d.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {d.row_count} rows • {d.column_count} cols
                      </span>
                    </label>
                  ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(params.remove_duplicates)}
                onChange={(e) => handleParamChange('remove_duplicates', e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500"
              />
              <span>Remove duplicate rows after union (UNION DISTINCT)</span>
            </label>
          </div>
        );
      }

      case 'change_type':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.data_type || c.type || 'text'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Data Type</label>
              <select
                value={params.target_type || 'text'}
                onChange={(e) => handleParamChange('target_type', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
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
                value={params.column || params.old_name || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
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
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
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
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
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

      case 'remove_duplicates': {
        const selCols: string[] = Array.isArray(params.columns)
          ? params.columns
          : params.column
          ? [params.column]
          : [];
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Columns to Check for Duplicates
              </label>
              <div className="max-h-36 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selCols.includes(c.name)}
                      onChange={() =>
                        handleParamChange('columns', toggleArrayItem(selCols, c.name))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Keep Occurrence</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleParamChange('keep', 'first')}
                  className={`py-2 px-2 text-xs rounded-lg border font-medium ${
                    (params.keep || 'first') === 'first'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Keep First
                </button>
                <button
                  type="button"
                  onClick={() => handleParamChange('keep', 'last')}
                  className={`py-2 px-2 text-xs rounded-lg border font-medium ${
                    params.keep === 'last'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Keep Last
                </button>
                <button
                  type="button"
                  onClick={() => handleParamChange('keep', 'duplicates_only')}
                  className={`py-2 px-2 text-xs rounded-lg border font-medium ${
                    params.keep === 'duplicates_only'
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Duplicates Only
                </button>
              </div>
            </div>
          </div>
        );
      }

      case 'fill_down':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Column</label>
              <select
                value={params.column || (Array.isArray(params.columns) ? params.columns[0] : '') || ''}
                onChange={(e) =>
                  updateParams({ column: e.target.value, columns: [e.target.value] })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Fill Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleParamChange('direction', 'down')}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium ${
                    (params.direction || 'down') === 'down'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Fill Down (Top → Bottom)
                </button>
                <button
                  type="button"
                  onClick={() => handleParamChange('direction', 'up')}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium ${
                    params.direction === 'up'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Fill Up (Bottom → Top)
                </button>
              </div>
            </div>
          </div>
        );

      case 'split_column':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Column to Split</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Delimiter</label>
              <input
                type="text"
                value={params.delimiter ?? ','}
                onChange={(e) => handleParamChange('delimiter', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                New Column Names (comma-separated)
              </label>
              <input
                type="text"
                value={
                  Array.isArray(params.new_column_names)
                    ? params.new_column_names.join(', ')
                    : params.new_column_names || ''
                }
                onChange={(e) =>
                  handleParamChange(
                    'new_column_names',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
        );

      case 'conditional': {
        const rules: any[] =
          Array.isArray(params.rules) && params.rules.length > 0
            ? params.rules
            : [
                {
                  column: params.column || columns[0]?.name || '',
                  operator: params.operator || 'gt',
                  value: params.value ?? '',
                  then_value: params.then_value ?? '',
                },
              ];

        return (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Output Column Name
              </label>
              <input
                type="text"
                value={params.output_column || params.new_column || params.target_column || ''}
                onChange={(e) => handleParamChange('output_column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">IF / ELSE IF Rules</label>
                <button
                  type="button"
                  onClick={() =>
                    handleParamChange('rules', [
                      ...rules,
                      {
                        column: columns[0]?.name || '',
                        operator: 'eq',
                        value: '',
                        then_value: '',
                      },
                    ])
                  }
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus size={12} /> Add Rule
                </button>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {rules.map((r, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                      <span>{idx === 0 ? 'IF' : 'ELSE IF'}</span>
                      {rules.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            handleParamChange(
                              'rules',
                              rules.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={r.column || ''}
                        onChange={(e) => {
                          const next = [...rules];
                          next[idx] = { ...next[idx], column: e.target.value };
                          handleParamChange('rules', next);
                        }}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        {availableColumns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={r.operator || 'eq'}
                        onChange={(e) => {
                          const next = [...rules];
                          next[idx] = { ...next[idx], operator: e.target.value };
                          handleParamChange('rules', next);
                        }}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="eq">Equals (=)</option>
                        <option value="neq">Not Equal (≠)</option>
                        <option value="gt">&gt;</option>
                        <option value="gte">&gt;=</option>
                        <option value="lt">&lt;</option>
                        <option value="lte">&lt;=</option>
                        <option value="contains">Contains</option>
                        <option value="is_null">Is Null</option>
                        <option value="is_not_null">Not Null</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Value"
                        value={r.value ?? ''}
                        onChange={(e) => {
                          const next = [...rules];
                          next[idx] = { ...next[idx], value: e.target.value };
                          handleParamChange('rules', next);
                        }}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">THEN →</span>
                      <input
                        type="text"
                        placeholder="Output value when true"
                        value={r.then_value ?? r.result ?? ''}
                        onChange={(e) => {
                          const next = [...rules];
                          next[idx] = {
                            ...next[idx],
                            then_value: e.target.value,
                            result: e.target.value,
                          };
                          handleParamChange('rules', next);
                        }}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                ELSE (Default Fallback Value)
              </label>
              <input
                type="text"
                value={params.else_value ?? ''}
                onChange={(e) => handleParamChange('else_value', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
        );
      }

      case 'group_by': {
        const groupCols: string[] = Array.isArray(params.group_by_columns)
          ? params.group_by_columns
          : Array.isArray(params.group_columns)
          ? params.group_columns
          : [];
        const aggs: any[] =
          Array.isArray(params.aggregations) && params.aggregations.length > 0
            ? params.aggregations
            : [{ column: availableColumns[0]?.name || 'val', agg_func: 'sum', function: 'sum', output_column: `sum_${availableColumns[0]?.name || 'val'}` }];

        return (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Group By Columns
              </label>
              <div className="max-h-28 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={groupCols.includes(c.name)}
                      onChange={() => {
                        const next = toggleArrayItem(groupCols, c.name);
                        updateParams({ group_by_columns: next, group_columns: next });
                        setLabel(`Group by ${next.join(', ') || 'all rows'} (${aggs.map((a) => `${a.agg_func || a.function || 'sum'}_${a.column || 'col'}`).join(', ')})`);
                      }}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">Summary Aggregations</label>
                <button
                  type="button"
                  onClick={() => {
                    const fallbackCol = availableColumns[0]?.name || 'val';
                    const nextAggs = [
                      ...aggs,
                      {
                        column: fallbackCol,
                        agg_func: 'sum',
                        function: 'sum',
                        output_column: `sum_${fallbackCol}`,
                        alias: `sum_${fallbackCol}`,
                      },
                    ];
                    handleParamChange('aggregations', nextAggs);
                    setLabel(`Group by ${groupCols.join(', ') || 'columns'} (${nextAggs.map((a) => `${a.agg_func || a.function || 'sum'}_${a.column || 'col'}`).join(', ')})`);
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus size={12} /> Add Aggregation
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {aggs.map((agg, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800"
                  >
                    <select
                      value={agg.column || ''}
                      onChange={(e) => {
                        const newCol = e.target.value;
                        const fn = agg.agg_func || agg.function || 'sum';
                        const currentOut = agg.output_column || agg.alias || agg.output_name || '';
                        let newOut = `${fn}_${newCol}`;
                        if (currentOut && !currentOut.startsWith(`${fn}_`) && !currentOut.endsWith(`_${agg.column}`)) {
                          newOut = currentOut;
                        }
                        const next = [...aggs];
                        next[idx] = {
                          ...next[idx],
                          column: newCol,
                          output_column: newOut,
                          alias: newOut,
                          output_name: newOut,
                        };
                        handleParamChange('aggregations', next);
                        setLabel(`Group by ${groupCols.join(', ') || 'columns'} (${next.map((a) => `${a.agg_func || a.function || 'sum'}_${a.column || 'col'}`).join(', ')})`);
                      }}
                      className="col-span-4 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {availableColumns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={agg.agg_func || agg.function || 'sum'}
                      onChange={(e) => {
                        const newFunc = e.target.value;
                        const oldFunc = agg.agg_func || agg.function || 'sum';
                        const col = agg.column || availableColumns[0]?.name || 'val';
                        const currentOut = agg.output_column || agg.alias || agg.output_name || '';

                        let newOut = `${newFunc}_${col}`;
                        if (
                          currentOut &&
                          !currentOut.startsWith(`${oldFunc}_`) &&
                          currentOut !== `total_${col}` &&
                          currentOut !== `${oldFunc}_col`
                        ) {
                          newOut = currentOut;
                        }

                        const next = [...aggs];
                        next[idx] = {
                          ...next[idx],
                          agg_func: newFunc,
                          function: newFunc,
                          output_column: newOut,
                          alias: newOut,
                          output_name: newOut,
                        };
                        handleParamChange('aggregations', next);
                        setLabel(`Group by ${groupCols.join(', ') || 'columns'} (${next.map((a) => `${a.agg_func || a.function || 'sum'}_${a.column || 'col'}`).join(', ')})`);
                      }}
                      className="col-span-3 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="sum">SUM</option>
                      <option value="count">COUNT</option>
                      <option value="distinct_count">DISTINCT</option>
                      <option value="avg">AVG</option>
                      <option value="min">MIN</option>
                      <option value="max">MAX</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Output alias"
                      value={agg.output_column || agg.output_name || agg.alias || ''}
                      onChange={(e) => {
                        const next = [...aggs];
                        next[idx] = {
                          ...next[idx],
                          output_column: e.target.value,
                          alias: e.target.value,
                          output_name: e.target.value,
                        };
                        handleParamChange('aggregations', next);
                      }}
                      className="col-span-4 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                    />
                    {aggs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = aggs.filter((_, i) => i !== idx);
                          handleParamChange('aggregations', next);
                          setLabel(`Group by ${groupCols.join(', ') || 'columns'} (${next.map((a) => `${a.agg_func || a.function || 'sum'}_${a.column || 'col'}`).join(', ')})`);
                        }}
                        className="col-span-1 text-slate-500 hover:text-rose-400 flex justify-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'window_calc': {
        const calcType = params.calc_type || params.function || 'running_total';
        const partCols: string[] = Array.isArray(params.partition_by) ? params.partition_by : [];
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Window Function
                </label>
                <select
                  value={calcType}
                  onChange={(e) =>
                    updateParams({ calc_type: e.target.value, function: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="running_total">Running Total (Cumulative Sum)</option>
                  <option value="running_avg">Running Average</option>
                  <option value="moving_avg">Moving Average (N-Row Window)</option>
                  <option value="rank">Rank (Dense Rank)</option>
                  <option value="row_number">Row Number</option>
                  <option value="lag">Lag (Previous Row Value)</option>
                  <option value="lead">Lead (Next Row Value)</option>
                  <option value="percent_of_total">% of Group Total</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Value Column
                </label>
                <select
                  value={params.value_column || params.target_column || columns[0]?.name || ''}
                  onChange={(e) =>
                    updateParams({ value_column: e.target.value, target_column: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Order By Column
                </label>
                <select
                  value={params.order_by || columns[0]?.name || ''}
                  onChange={(e) => handleParamChange('order_by', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Output Column Name
                </label>
                <input
                  type="text"
                  value={params.output_column || ''}
                  onChange={(e) => handleParamChange('output_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Partition By Columns (Optional Grouping)
              </label>
              <div className="max-h-24 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={partCols.includes(c.name)}
                      onChange={() =>
                        handleParamChange('partition_by', toggleArrayItem(partCols, c.name))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'date_transform': {
        const op = params.operation || 'extract_part';
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Date Column</label>
                <select
                  value={params.column || ''}
                  onChange={(e) => handleParamChange('column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Operation</label>
                <select
                  value={op}
                  onChange={(e) => handleParamChange('operation', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="extract_part">Extract Date Part (Year, Month, etc.)</option>
                  <option value="start_of_month">Start of Month</option>
                  <option value="end_of_month">End of Month (EOMONTH)</option>
                  <option value="date_add">Add / Subtract Time Interval</option>
                  <option value="date_diff">Date Difference (DATEDIF)</option>
                  <option value="fiscal_year">Fiscal Year</option>
                  <option value="age_days">Age in Days (vs Today)</option>
                </select>
              </div>
            </div>

            {op === 'extract_part' && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Date Part</label>
                <select
                  value={params.date_part || 'year'}
                  onChange={(e) => handleParamChange('date_part', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="year">Year (YYYY)</option>
                  <option value="quarter">Quarter (1–4)</option>
                  <option value="month">Month Number (1–12)</option>
                  <option value="month_name">Month Name</option>
                  <option value="day">Day of Month</option>
                  <option value="day_name">Day Name</option>
                </select>
              </div>
            )}

            {op === 'date_add' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Amount</label>
                  <input
                    type="number"
                    value={params.amount ?? 7}
                    onChange={(e) => handleParamChange('amount', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Unit</label>
                  <select
                    value={params.unit || 'days'}
                    onChange={(e) => handleParamChange('unit', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
              </div>
            )}

            {op === 'date_diff' && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  End Date Column
                </label>
                <select
                  value={params.end_date_column || ''}
                  onChange={(e) => handleParamChange('end_date_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Output Column Name
              </label>
              <input
                type="text"
                value={params.output_column || params.target_column || ''}
                onChange={(e) => handleParamChange('output_column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
        );
      }

      case 'math_transform': {
        const mode = params.mode || (params.expression ? 'formula' : 'two_col');
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Calculation Mode
              </label>
              <select
                value={mode}
                onChange={(e) => handleParamChange('mode', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="two_col">Two Columns (Col1 ± × ÷ Col2)</option>
                <option value="scalar">Column &amp; Constant Value</option>
                <option value="round">Round / Absolute Value</option>
                <option value="formula">Custom Formula Expression</option>
              </select>
            </div>

            {mode === 'formula' ? (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Formula Expression
                </label>
                <input
                  type="text"
                  value={params.expression || ''}
                  onChange={(e) => handleParamChange('expression', e.target.value)}
                  placeholder="e.g. amount - discount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">
                      Column 1
                    </label>
                    <select
                      value={params.column1 || params.column || columns[0]?.name || ''}
                      onChange={(e) =>
                        updateParams({ column1: e.target.value, column: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                    >
                      {availableColumns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {mode !== 'round' && (
                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1">
                        Operator
                      </label>
                      <select
                        value={params.math_operator || 'subtract'}
                        onChange={(e) => handleParamChange('math_operator', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                      >
                        <option value="add">Add (+)</option>
                        <option value="subtract">Subtract (−)</option>
                        <option value="multiply">Multiply (×)</option>
                        <option value="divide">Divide (÷)</option>
                        <option value="modulo">Modulo (%)</option>
                      </select>
                    </div>
                  )}
                </div>

                {mode === 'two_col' && (
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">
                      Column 2
                    </label>
                    <select
                      value={params.column2 || columns[1]?.name || columns[0]?.name || ''}
                      onChange={(e) => handleParamChange('column2', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                    >
                      {availableColumns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {mode === 'scalar' && (
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">
                      Constant Value
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={params.scalar_value ?? params.operand ?? 1}
                      onChange={(e) => handleParamChange('scalar_value', Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                    />
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Output Column Name
                </label>
                <input
                  type="text"
                  value={params.output_column || params.target_column || ''}
                  onChange={(e) =>
                    updateParams({ output_column: e.target.value, target_column: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Decimal Places
                </label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={params.round_digits ?? 2}
                  onChange={(e) => handleParamChange('round_digits', Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>
        );
      }

      case 'replace_values':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Column</label>
              <select
                value={params.column || ''}
                onChange={(e) => handleParamChange('column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Match Type</label>
              <select
                value={params.match_type || 'exact'}
                onChange={(e) => handleParamChange('match_type', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="exact">Exact Match</option>
                <option value="contains">Contains Substring</option>
                <option value="is_null">Null / Blank Cells</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Search For</label>
                <input
                  type="text"
                  value={params.search_value ?? params.old_value ?? ''}
                  onChange={(e) => handleParamChange('search_value', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Replace With</label>
                <input
                  type="text"
                  value={params.replace_value ?? params.new_value ?? ''}
                  onChange={(e) => handleParamChange('replace_value', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>
        );

      case 'text_transform': {
        const op = params.operation || 'trim';
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Column</label>
                <select
                  value={params.column || ''}
                  onChange={(e) => handleParamChange('column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Operation</label>
                <select
                  value={op}
                  onChange={(e) => handleParamChange('operation', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="trim">Trim whitespace</option>
                  <option value="clean">Clean non-printable</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="lower">lowercase</option>
                  <option value="proper">Proper Case (Title)</option>
                  <option value="substring">Substring (MID)</option>
                  <option value="replace">Replace Text</option>
                  <option value="concat">Concatenate Columns</option>
                  <option value="length">Length (LEN)</option>
                </select>
              </div>
            </div>

            {op === 'concat' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Second Column
                  </label>
                  <select
                    value={params.other_column || ''}
                    onChange={(e) => handleParamChange('other_column', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    {availableColumns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Separator</label>
                  <input
                    type="text"
                    value={params.delimiter ?? ' '}
                    onChange={(e) => handleParamChange('delimiter', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Output Column Name
              </label>
              <input
                type="text"
                value={params.output_column || params.target_column || params.column || ''}
                onChange={(e) => handleParamChange('output_column', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
        );
      }

      case 'pivot': {
        const idxCols: string[] = Array.isArray(params.index_columns) ? params.index_columns : [];
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Row Index Columns (Rows Zone)
              </label>
              <div className="max-h-24 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={idxCols.includes(c.name)}
                      onChange={() =>
                        handleParamChange('index_columns', toggleArrayItem(idxCols, c.name))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Pivot Column (Columns)
                </label>
                <select
                  value={params.pivot_column ?? ''}
                  onChange={(e) => handleParamChange('pivot_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200"
                >
                  <option value="">(None — Summary Only)</option>
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Value Column (Values)
                </label>
                <select
                  value={params.value_column || ''}
                  onChange={(e) => handleParamChange('value_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Aggregation</label>
                <select
                  value={params.agg_func || 'sum'}
                  onChange={(e) => handleParamChange('agg_func', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200"
                >
                  <option value="sum">SUM</option>
                  <option value="count">COUNT</option>
                  <option value="avg">AVG</option>
                  <option value="min">MIN</option>
                  <option value="max">MAX</option>
                  <option value="pct_total">% of Grand Total</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Report Filter Column (Optional)
                </label>
                <select
                  value={params.filter_column || ''}
                  onChange={(e) => handleParamChange('filter_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200"
                >
                  <option value="">(None)</option>
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Report Filter Value
                </label>
                <input
                  type="text"
                  value={params.filter_value || ''}
                  onChange={(e) => handleParamChange('filter_value', e.target.value)}
                  placeholder="e.g. Completed"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(params.include_row_totals)}
                  onChange={(e) => handleParamChange('include_row_totals', e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Include Row Totals (Row_Total)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(params.include_grand_total)}
                  onChange={(e) => handleParamChange('include_grand_total', e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Include Grand Total Row</span>
              </label>
            </div>
          </div>
        );
      }

      case 'unpivot': {
        const idCols: string[] = Array.isArray(params.id_columns) ? params.id_columns : [];
        const valCols: string[] = Array.isArray(params.value_columns) ? params.value_columns : [];
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Identifier Columns to Keep
              </label>
              <div className="max-h-24 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={idCols.includes(c.name)}
                      onChange={() =>
                        handleParamChange('id_columns', toggleArrayItem(idCols, c.name))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Value Columns to Unpivot
              </label>
              <div className="max-h-24 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={valCols.includes(c.name)}
                      onChange={() =>
                        handleParamChange('value_columns', toggleArrayItem(valCols, c.name))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Attribute Column Name
                </label>
                <input
                  type="text"
                  value={params.name_column || 'attribute'}
                  onChange={(e) => handleParamChange('name_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Value Column Name
                </label>
                <input
                  type="text"
                  value={params.value_column || 'value'}
                  onChange={(e) => handleParamChange('value_column', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>
        );
      }

      case 'custom_column': {
        const colName = params.new_column || params.column || params.target_column || 'custom_col';
        const isFormulaMode = Boolean(params.expression || params.formula);
        const colVal = params.value !== undefined ? String(params.value) : '';
        const expr = params.expression || params.formula || '';
        const dataType = params.data_type || 'string';

        return (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                New Column Name
              </label>
              <input
                type="text"
                value={colName}
                onChange={(e) => {
                  const val = e.target.value;
                  updateParams({ new_column: val, column: val, target_column: val });
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                placeholder="e.g. Total_Amount, Profit_Margin, Custom_Tag"
              />
            </div>

            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  updateParams({ expression: undefined, formula: undefined, value: params.value ?? '' });
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  !isFormulaMode
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Custom Static Value
              </button>
              <button
                type="button"
                onClick={() => {
                  updateParams({
                    expression: params.expression || `[${availableColumns[0]?.name || 'col'}]`,
                    value: undefined,
                  });
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  isFormulaMode
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Formula Expression
              </button>
            </div>

            {!isFormulaMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Static Value
                  </label>
                  <input
                    type="text"
                    value={colVal}
                    onChange={(e) => updateParams({ value: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                    placeholder="Enter manual value"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Data Type
                  </label>
                  <select
                    value={dataType}
                    onChange={(e) => updateParams({ data_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="string">Text / String</option>
                    <option value="integer">Integer Number</option>
                    <option value="float">Decimal / Float</option>
                    <option value="date">Date</option>
                    <option value="boolean">Boolean</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Custom Formula Expression
                </label>
                <textarea
                  rows={3}
                  value={expr}
                  onChange={(e) => updateParams({ expression: e.target.value, formula: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. [Price] * [Quantity] or UPPER([Status])"
                />
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Insert Column Token:</span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {availableColumns.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          const nextExpr = `${expr} [${c.name}]`.trim();
                          updateParams({ expression: nextExpr, formula: nextExpr });
                        }}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border border-slate-700"
                      >
                        [{c.name}]
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'remove_column': {
        const cols: string[] = Array.isArray(params.columns)
          ? params.columns
          : params.column
          ? [params.column]
          : [];
        const isKeep = Boolean(params.keep_selected);
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Operation Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateParams({ keep_selected: false })}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium ${
                    !isKeep
                      ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Drop Selected Columns
                </button>
                <button
                  type="button"
                  onClick={() => updateParams({ keep_selected: true })}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium ${
                    isKeep
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Keep Only Selected Columns
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Select Columns ({cols.length} selected)
              </label>
              <div className="max-h-48 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 gap-1.5">
                {availableColumns.map((c) => (
                  <label
                    key={c.name}
                    className="flex items-center gap-2 p-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={cols.includes(c.name)}
                      onChange={() =>
                        updateParams({ columns: toggleArrayItem(cols, c.name) })
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'reorder_columns': {
        const order: string[] = Array.isArray(params.column_order)
          ? params.column_order
          : availableColumns.map((c) => c.name);
        const moveCol = (index: number, dir: 'up' | 'down') => {
          const target = dir === 'up' ? index - 1 : index + 1;
          if (target < 0 || target >= order.length) return;
          const next = [...order];
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved);
          updateParams({ column_order: next });
        };
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Column Sequence (Order in result)
              </label>
              <button
                type="button"
                onClick={() =>
                  updateParams({ column_order: availableColumns.map((c) => c.name) })
                }
                className="text-[11px] text-emerald-400 hover:underline"
              >
                Reset to default
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
              {order.map((col, idx) => (
                <div
                  key={col}
                  className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500 text-[10px] w-4">{idx + 1}.</span>
                    <span>{col}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveCol(idx, 'up')}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 disabled:opacity-20"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === order.length - 1}
                      onClick={() => moveCol(idx, 'down')}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 disabled:opacity-20"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'promote_headers': {
        return (
          <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <Check size={14} /> Use First Row as Headers
            </div>
            <p className="text-xs text-slate-400">
              This step takes the values in row 1 of the dataset and assigns them as column headers, removing the first row from data rows.
            </p>
          </div>
        );
      }

      case 'remove_rows': {
        const mode = params.mode || 'top_n';
        const count = params.count ?? 1;
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Row Operation
              </label>
              <select
                value={mode}
                onChange={(e) => updateParams({ mode: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="top_n">Remove Top N Rows</option>
                <option value="bottom_n">Remove Bottom N Rows</option>
                <option value="keep_top_n">Keep Top N Rows</option>
                <option value="keep_bottom_n">Keep Bottom N Rows</option>
                <option value="blank_rows">Remove Blank / Empty Rows</option>
              </select>
            </div>
            {mode !== 'blank_rows' && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Number of Rows (N)
                </label>
                <input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => updateParams({ count: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                />
              </div>
            )}
          </div>
        );
      }

      case 'transpose': {
        return (
          <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <Check size={14} /> Transpose Matrix
            </div>
            <p className="text-xs text-slate-400">
              Rotates the table 90 degrees: columns become rows, and rows become columns. An 'Attribute' column will contain original headers.
            </p>
          </div>
        );
      }

      case 'standardize_values': {
        const col = params.column || availableColumns[0]?.name || '';
        const targetCol = params.output_column || col;
        const mapping = params.mapping || {};
        const entries = Object.entries(mapping);

        const setMappingEntry = (fromVal: string, toVal: string) => {
          const next = { ...mapping, [fromVal]: toVal };
          updateParams({ mapping: next });
        };
        const removeMappingEntry = (fromVal: string) => {
          const next = { ...mapping };
          delete next[fromVal];
          updateParams({ mapping: next });
        };

        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Source Column
                </label>
                <select
                  value={col}
                  onChange={(e) => updateParams({ column: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Output Column
                </label>
                <input
                  type="text"
                  value={targetCol}
                  onChange={(e) => updateParams({ output_column: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  Value Standardization Mappings ({entries.length})
                </label>
                <button
                  type="button"
                  onClick={() => setMappingEntry(`From_${entries.length + 1}`, `To_${entries.length + 1}`)}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Plus size={11} /> Add Mapping
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                {entries.map(([fromKey, toVal], idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={fromKey}
                      placeholder="Original value"
                      onChange={(e) => {
                        const newKey = e.target.value;
                        const next = { ...mapping };
                        delete next[fromKey];
                        next[newKey] = toVal;
                        updateParams({ mapping: next });
                      }}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    />
                    <span className="text-slate-500 text-xs">&rarr;</span>
                    <input
                      type="text"
                      value={String(toVal)}
                      placeholder="Clean standardized value"
                      onChange={(e) => setMappingEntry(fromKey, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-semibold text-emerald-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeMappingEntry(fromKey)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'impute_missing': {
        const col = params.column || availableColumns[0]?.name || '';
        const strategy = params.strategy || 'mean';
        const fillVal = params.value ?? '0';
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Column to Impute
              </label>
              <select
                value={col}
                onChange={(e) => updateParams({ column: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                {availableColumns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Imputation Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => updateParams({ strategy: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="mean">Mean (Average of column)</option>
                <option value="median">Median (Middle value)</option>
                <option value="mode">Mode (Most frequent)</option>
                <option value="fixed">Fixed Custom Value</option>
              </select>
            </div>
            {strategy === 'fixed' && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Replacement Value
                </label>
                <input
                  type="text"
                  value={fillVal}
                  onChange={(e) => updateParams({ value: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            )}
          </div>
        );
      }

      case 'flag_outliers': {
        const col = params.column || availableColumns[0]?.name || '';
        const mult = params.iqr_multiplier ?? 1.5;
        const outCol = params.output_column || `is_outlier_${col}`;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Numeric Column
                </label>
                <select
                  value={col}
                  onChange={(e) => updateParams({ column: e.target.value, output_column: `is_outlier_${e.target.value}` })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  IQR Multiplier (Default 1.5)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={mult}
                  onChange={(e) => updateParams({ iqr_multiplier: parseFloat(e.target.value) || 1.5 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Outlier Flag Column Name (TRUE / FALSE)
              </label>
              <input
                type="text"
                value={outCol}
                onChange={(e) => updateParams({ output_column: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
        );
      }

      case 'top_bottom_n': {
        const col = params.column || availableColumns[0]?.name || '';
        const mode = params.mode || 'top';
        const n = params.n ?? 10;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Direction
                </label>
                <select
                  value={mode}
                  onChange={(e) => updateParams({ mode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="top">Top (Highest)</option>
                  <option value="bottom">Bottom (Lowest)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Number (N)
                </label>
                <input
                  type="number"
                  min={1}
                  value={n}
                  onChange={(e) => updateParams({ n: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Rank Column
                </label>
                <select
                  value={col}
                  onChange={(e) => updateParams({ column: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {availableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      }

      default:
        return (
          <div className="space-y-3">
            {Object.entries(params).map(([key, val]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-300 block mb-1 font-mono">
                  {key}
                </label>
                <input
                  type="text"
                  value={typeof val === 'object' ? JSON.stringify(val) : (val ?? '')}
                  onChange={(e) => handleParamChange(key, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 relative flex flex-col max-h-[92vh]">
        <button
          onClick={closeEditStepModal}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
            <Pencil size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Edit Applied Step</h3>
            <p className="text-xs text-slate-400">
              Change columns, lookup keys, or parameters — pipeline updates automatically
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
            <span>Visual Parameters</span>
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-amber-300/90"
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
