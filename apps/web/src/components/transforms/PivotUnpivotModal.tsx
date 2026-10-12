import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Columns,
  ArrowDownUp,
  Filter,
  Rows,
  Calculator,
  Table2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface PivotUnpivotModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'pivot' | 'unpivot';
}

type AggFuncType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'pct_total';

export const PivotUnpivotModal: React.FC<PivotUnpivotModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'pivot',
}) => {
  const { columns, rows, allRows, addStep } = useWorkbenchStore();
  const [mode, setMode] = useState<'pivot' | 'unpivot'>(initialMode);

  // Pivot 4-Zone State: Filters, Rows, Columns, Values
  const [selectedIdxCols, setSelectedIdxCols] = useState<string[]>([]);
  const [pivotCol, setPivotCol] = useState('');
  const [valCol, setValCol] = useState('');
  const [aggFunc, setAggFunc] = useState<AggFuncType>('sum');
  const [filterCol, setFilterCol] = useState('');
  const [filterVal, setFilterVal] = useState('__ALL__');
  const [includeRowTotals, setIncludeRowTotals] = useState(true);
  const [includeGrandTotal, setIncludeGrandTotal] = useState(true);

  // Unpivot State
  const [idCols, setIdCols] = useState<string[]>([]);
  const [unpivotCols, setUnpivotCols] = useState<string[]>([]);
  const [varName, setVarName] = useState('attribute');
  const [valName, setValName] = useState('value');

  // Sync mode when initialMode changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Auto-initialize smart default fields whenever columns become available or modal opens
  useEffect(() => {
    if (!isOpen || columns.length === 0) return;

    const colNames = columns.map((c) => c.name);
    const numericCols = columns.filter((c) =>
      ['integer', 'float', 'number', 'decimal', 'currency'].includes(
        String(c.data_type || '').toLowerCase()
      )
    );
    const textCols = columns.filter(
      (c) =>
        !['integer', 'float', 'number', 'decimal', 'currency'].includes(
          String(c.data_type || '').toLowerCase()
        )
    );

    // Default Row Index Column (prefer region / department / category / first text column)
    setSelectedIdxCols((prev) => {
      const validPrev = prev.filter((c) => colNames.includes(c));
      if (validPrev.length > 0) return validPrev;
      const preferredRow =
        textCols.find((c) => /region|dept|department|country|city|segment|customer/i.test(c.name)) ||
        textCols[0] ||
        columns[0];
      return preferredRow ? [preferredRow.name] : [];
    });

    // Default Pivot Column (prefer category / status / quarter / second text column)
    setPivotCol((prev) => {
      if (prev === '__NONE__') return prev;
      if (prev && colNames.includes(prev)) return prev;
      const preferredPivot =
        textCols.find((c) => /category|status|type|tier|channel|quarter|month/i.test(c.name)) ||
        textCols[1] ||
        columns[1] ||
        columns[0];
      return preferredPivot ? preferredPivot.name : '';
    });

    // Default Value Column (prefer amount / revenue / total / sales / price / first numeric column)
    setValCol((prev) => {
      if (prev && colNames.includes(prev)) return prev;
      const preferredVal =
        numericCols.find((c) => /amount|revenue|total|sales|price|cost|qty|quantity/i.test(c.name)) ||
        numericCols[0] ||
        columns[columns.length - 1];
      return preferredVal ? preferredVal.name : '';
    });

    // Default Unpivot columns if empty
    setIdCols((prev) => {
      const valid = prev.filter((c) => colNames.includes(c));
      return valid.length > 0 ? valid : columns[0] ? [columns[0].name] : [];
    });
    setUnpivotCols((prev) => {
      const valid = prev.filter((c) => colNames.includes(c));
      if (valid.length > 0) return valid;
      return columns.slice(1, 4).map((c) => c.name);
    });
  }, [isOpen, columns]);

  const sourceRows = useMemo(() => {
    return Array.isArray(allRows) && allRows.length > 0
      ? allRows
      : Array.isArray(rows)
      ? rows
      : [];
  }, [allRows, rows]);

  // Distinct values for the Report Filter column
  const distinctFilterValues = useMemo(() => {
    if (!filterCol) return [];
    const set = new Set<string>();
    sourceRows.forEach((r) => {
      const v = r[filterCol];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        set.add(String(v));
      }
    });
    return Array.from(set).sort();
  }, [sourceRows, filterCol]);

  // Compute Live PivotTable Matrix Preview
  const livePivotPreview = useMemo(() => {
    const activeValCol = valCol || columns[0]?.name || '';
    const activePivotCol = pivotCol === '__NONE__' ? '' : pivotCol;
    const idxCols = selectedIdxCols.length > 0 ? selectedIdxCols : [];

    // 1. Apply optional Report Filter
    const filtered = sourceRows.filter((r) => {
      if (!filterCol || filterVal === '__ALL__') return true;
      return String(r[filterCol] ?? '') === filterVal;
    });

    // 2. Collect distinct pivot column headers (up to 15 in preview)
    const pivotHeaders: string[] = activePivotCol
      ? Array.from(
          new Set(
            filtered.map((r) => {
              const v = r[activePivotCol];
              return v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
            })
          )
        ).slice(0, 15)
      : [`${aggFunc.toUpperCase()}(${activeValCol})`];

    // 3. Group rows by selectedIdxCols
    const groups = new Map<string, Record<string, any>[]>();
    filtered.forEach((r) => {
      const key =
        idxCols.length > 0
          ? idxCols.map((c) => String(r[c] ?? '(Blank)')).join('||')
          : 'All Rows';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });

    // Pre-calculate overall total for pct_total
    const overallTotalSum = filtered.reduce((acc, r) => {
      const n = Number(r[activeValCol]);
      return acc + (Number.isNaN(n) ? 0 : n);
    }, 0);

    const computeAgg = (subset: Record<string, any>[]): number => {
      if (subset.length === 0) return 0;
      if (aggFunc === 'count') return subset.length;
      const nums = subset
        .map((m) => Number(m[activeValCol]))
        .filter((n) => !Number.isNaN(n));
      if (nums.length === 0) return 0;
      const sum = nums.reduce((a, b) => a + b, 0);
      if (aggFunc === 'sum') return Number(sum.toFixed(2));
      if (aggFunc === 'avg') return Number((sum / nums.length).toFixed(2));
      if (aggFunc === 'min') return Math.min(...nums);
      if (aggFunc === 'max') return Math.max(...nums);
      if (aggFunc === 'pct_total') {
        return overallTotalSum !== 0 ? Number(((sum / overallTotalSum) * 100).toFixed(2)) : 0;
      }
      return Number(sum.toFixed(2));
    };

    const matrixRows: Array<{
      rowLabels: Record<string, string>;
      cells: Record<string, number>;
      rowTotal: number;
    }> = [];

    groups.forEach((gRows) => {
      const rowLabels: Record<string, string> = {};
      if (idxCols.length > 0) {
        idxCols.forEach((c) => {
          const raw = gRows[0]?.[c];
          rowLabels[c] = raw === null || raw === undefined || raw === '' ? '(Blank)' : String(raw);
        });
      } else {
        rowLabels['Summary'] = 'Total';
      }

      const cells: Record<string, number> = {};
      if (activePivotCol) {
        pivotHeaders.forEach((ph) => {
          const matching = gRows.filter((r) => {
            const v = r[activePivotCol];
            const norm = v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
            return norm === ph;
          });
          cells[ph] = computeAgg(matching);
        });
      } else {
        cells[pivotHeaders[0]] = computeAgg(gRows);
      }

      const rowTotal = computeAgg(gRows);
      matrixRows.push({ rowLabels, cells, rowTotal });
    });

    // Compute Column Grand Totals
    const colTotals: Record<string, number> = {};
    if (activePivotCol) {
      pivotHeaders.forEach((ph) => {
        const matching = filtered.filter((r) => {
          const v = r[activePivotCol];
          const norm = v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
          return norm === ph;
        });
        colTotals[ph] = computeAgg(matching);
      });
    } else if (pivotHeaders[0]) {
      colTotals[pivotHeaders[0]] = computeAgg(filtered);
    }

    const grandTotal = computeAgg(filtered);

    return {
      idxCols: idxCols.length > 0 ? idxCols : ['Summary'],
      pivotHeaders,
      matrixRows,
      colTotals,
      grandTotal,
      filteredCount: filtered.length,
    };
  }, [
    sourceRows,
    selectedIdxCols,
    pivotCol,
    valCol,
    aggFunc,
    filterCol,
    filterVal,
    columns,
  ]);

  if (!isOpen) return null;

  const toggleIdxCol = (col: string) => {
    setSelectedIdxCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const toggleIdCol = (col: string) => {
    setIdCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const toggleUnpivotCol = (col: string) => {
    setUnpivotCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const formatCellVal = (val: number) => {
    if (aggFunc === 'pct_total') return `${val.toFixed(1)}%`;
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleApply = async () => {
    if (mode === 'pivot') {
      const effectivePivotCol = pivotCol === '__NONE__' ? '' : pivotCol;
      const rowDesc = selectedIdxCols.length > 0 ? selectedIdxCols.join(', ') : 'All Rows';
      await addStep({
        id: `step_${Date.now()}`,
        type: 'pivot',
        label: effectivePivotCol
          ? `PivotTable: ${aggFunc.toUpperCase()}(${valCol}) by ${rowDesc} × ${effectivePivotCol}`
          : `PivotTable: ${aggFunc.toUpperCase()}(${valCol}) by ${rowDesc}`,
        enabled: true,
        params: {
          index_columns: selectedIdxCols,
          pivot_column: effectivePivotCol,
          value_column: valCol,
          agg_func: aggFunc,
          filter_column: filterCol || undefined,
          filter_value: filterCol && filterVal !== '__ALL__' ? filterVal : undefined,
          include_row_totals: includeRowTotals,
          include_grand_total: includeGrandTotal,
        },
      });
    } else {
      await addStep({
        id: `step_${Date.now()}`,
        type: 'unpivot',
        label: `Unpivot ${unpivotCols.length} columns into (${varName}, ${valName})`,
        enabled: true,
        params: {
          id_columns: idCols,
          value_columns: unpivotCols,
          name_column: varName,
          value_column: valName,
        },
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-400">
              {mode === 'pivot' ? (
                <Columns className="w-5 h-5" />
              ) : (
                <ArrowDownUp className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">
                  {mode === 'pivot'
                    ? 'Excel PivotTable Builder'
                    : 'Unpivot Columns (Wide → Tall)'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                  Interactive Matrix
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {mode === 'pivot'
                  ? 'Arrange Rows, Columns, Values, and Filters with live matrix aggregation and Grand Totals'
                  : 'Melt multiple wide value columns into attribute-value rows'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              onClick={() => setMode('pivot')}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                mode === 'pivot'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" /> PivotTable (Rows × Columns Matrix)
            </button>
            <button
              onClick={() => setMode('unpivot')}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                mode === 'unpivot'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDownUp className="w-3.5 h-3.5" /> Unpivot Columns (Wide → Tall)
            </button>
          </div>

          {mode === 'pivot' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Excel 4-Zone PivotTable Field Areas */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    PivotTable Field Areas
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {columns.length} fields available
                  </span>
                </div>

                {/* 2x2 Excel Pivot Zones Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* ZONE 1: FILTERS */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      <Filter className="w-3.5 h-3.5" /> 1. Filters
                    </div>
                    <select
                      aria-label="Report Filter Column"
                      value={filterCol}
                      onChange={(e) => {
                        setFilterCol(e.target.value);
                        setFilterVal('__ALL__');
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">(None — All Rows)</option>
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {filterCol && (
                      <select
                        aria-label="Report Filter Value"
                        value={filterVal}
                        onChange={(e) => setFilterVal(e.target.value)}
                        className="w-full bg-slate-900 border border-amber-500/40 rounded px-2.5 py-1.5 text-xs text-amber-200"
                      >
                        <option value="__ALL__">(All Values)</option>
                        {distinctFilterValues.map((v) => (
                          <option key={v} value={v}>
                            = {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* ZONE 2: COLUMNS */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-400">
                      <Columns className="w-3.5 h-3.5" /> 2. Columns
                    </div>
                    <select
                      aria-label="Pivot Column Header"
                      value={pivotCol}
                      onChange={(e) => setPivotCol(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="__NONE__">(None — Summary Only)</option>
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Distinct values of this field become column headers across the top.
                    </p>
                  </div>
                </div>

                {/* ZONE 3: ROWS */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      <Rows className="w-3.5 h-3.5" /> 3. Rows (Group By Keys)
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIdxCols(columns[0] ? [columns[0].name] : [])
                        }
                        className="text-emerald-400 hover:underline"
                      >
                        Reset 1st
                      </button>
                      <span className="text-slate-700">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedIdxCols([])}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-1.5 pt-1">
                    {columns.map((c) => {
                      const isChecked = selectedIdxCols.includes(c.name);
                      return (
                        <label
                          key={c.name}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-medium'
                              : 'bg-slate-900/70 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleIdxCol(c.name)}
                            className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* ZONE 4: VALUES & TOTALS */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-400">
                    <Calculator className="w-3.5 h-3.5" /> 4. Values (Metric &amp; Aggregation)
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        Value Column
                      </label>
                      <select
                        aria-label="Value Column"
                        value={valCol}
                        onChange={(e) => setValCol(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        {columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.data_type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        Summarize Values By
                      </label>
                      <select
                        aria-label="Aggregation Function"
                        value={aggFunc}
                        onChange={(e) => setAggFunc(e.target.value as AggFuncType)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-semibold"
                      >
                        <option value="sum">SUM (Total)</option>
                        <option value="count">COUNT (Rows)</option>
                        <option value="avg">AVERAGE (Mean)</option>
                        <option value="min">MIN (Smallest)</option>
                        <option value="max">MAX (Largest)</option>
                        <option value="pct_total">% of Grand Total</option>
                      </select>
                    </div>
                  </div>

                  {/* Totals Options */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeRowTotals}
                        onChange={(e) => setIncludeRowTotals(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <span>Show Row Totals</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeGrandTotal}
                        onChange={(e) => setIncludeGrandTotal(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <span>Show Grand Total Row</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Interactive PivotTable Matrix Preview */}
              <div className="lg:col-span-7 flex flex-col space-y-3">
                {/* Summary KPI Bar */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase text-slate-400">Row Groups</div>
                    <div className="text-sm font-bold text-white font-mono">
                      {livePivotPreview.matrixRows.length}
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase text-slate-400">Pivot Columns</div>
                    <div className="text-sm font-bold text-sky-400 font-mono">
                      {livePivotPreview.pivotHeaders.length}
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase text-slate-400">Source Rows</div>
                    <div className="text-sm font-bold text-slate-200 font-mono">
                      {livePivotPreview.filteredCount}
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-emerald-950/30 border border-emerald-500/30 rounded-lg">
                    <div className="text-[10px] uppercase text-emerald-300">Grand Total</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono">
                      {formatCellVal(livePivotPreview.grandTotal)}
                    </div>
                  </div>
                </div>

                {/* Live Matrix Table */}
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col min-h-[260px]">
                  <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <Table2 className="w-4 h-4 text-emerald-400" />
                      <span>Live PivotTable Preview</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">
                      {aggFunc.toUpperCase()}({valCol || 'value'})
                    </span>
                  </div>

                  <div className="overflow-auto max-h-[300px] flex-1">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300 border-b border-slate-800">
                        <tr>
                          {livePivotPreview.idxCols.map((ic) => (
                            <th
                              key={ic}
                              className="px-3 py-2 text-left font-bold text-emerald-300 bg-slate-900 border-r border-slate-800 whitespace-nowrap"
                            >
                              {ic}
                            </th>
                          ))}
                          {livePivotPreview.pivotHeaders.map((ph) => (
                            <th
                              key={ph}
                              className="px-3 py-2 text-right font-semibold text-sky-300 bg-slate-900 border-r border-slate-800/70 whitespace-nowrap"
                            >
                              {ph}
                            </th>
                          ))}
                          {includeRowTotals && (
                            <th className="px-3 py-2 text-right font-bold text-amber-300 bg-slate-900 whitespace-nowrap">
                              Row Total
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {livePivotPreview.matrixRows.slice(0, 25).map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="hover:bg-slate-900/60 transition-colors"
                          >
                            {livePivotPreview.idxCols.map((ic) => (
                              <td
                                key={ic}
                                className="px-3 py-1.5 font-medium text-slate-200 bg-slate-950/60 border-r border-slate-800 whitespace-nowrap"
                              >
                                {row.rowLabels[ic]}
                              </td>
                            ))}
                            {livePivotPreview.pivotHeaders.map((ph) => (
                              <td
                                key={ph}
                                className="px-3 py-1.5 text-right font-mono text-slate-300 border-r border-slate-800/40 whitespace-nowrap"
                              >
                                {formatCellVal(row.cells[ph] ?? 0)}
                              </td>
                            ))}
                            {includeRowTotals && (
                              <td className="px-3 py-1.5 text-right font-mono font-semibold text-amber-300 bg-amber-950/10 whitespace-nowrap">
                                {formatCellVal(row.rowTotal)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      {includeGrandTotal && (
                        <tfoot className="sticky bottom-0 bg-slate-900 border-t-2 border-emerald-500/40 font-bold">
                          <tr>
                            {livePivotPreview.idxCols.map((ic, idx) => (
                              <td
                                key={ic}
                                className="px-3 py-2 text-emerald-300 border-r border-slate-800 whitespace-nowrap"
                              >
                                {idx === 0 ? 'Grand Total' : ''}
                              </td>
                            ))}
                            {livePivotPreview.pivotHeaders.map((ph) => (
                              <td
                                key={ph}
                                className="px-3 py-2 text-right font-mono text-emerald-300 border-r border-slate-800/60 whitespace-nowrap"
                              >
                                {formatCellVal(livePivotPreview.colTotals[ph] ?? 0)}
                              </td>
                            ))}
                            {includeRowTotals && (
                              <td className="px-3 py-2 text-right font-mono text-emerald-400 bg-emerald-950/30 whitespace-nowrap">
                                {formatCellVal(livePivotPreview.grandTotal)}
                              </td>
                            )}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Excel Formula Equivalent Bar */}
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 block">
                      Excel 365 Dynamic Array Formula Equivalent
                    </span>
                    <code className="text-xs text-emerald-300 font-mono">
                      =PIVOTBY({selectedIdxCols.join(', ') || 'All'},{' '}
                      {pivotCol === '__NONE__' ? '""' : pivotCol || 'col'}, {valCol || 'val'},{' '}
                      {aggFunc.toUpperCase()})
                    </code>
                  </div>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Live Preview Active
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Identifier Columns to Keep Fixed
                </label>
                <div className="max-h-32 overflow-y-auto p-2.5 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {columns.map((c) => (
                    <label
                      key={c.name}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={idCols.includes(c.name)}
                        onChange={() => toggleIdCol(c.name)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Value Columns to Unpivot (Melt into Rows)
                </label>
                <div className="max-h-36 overflow-y-auto p-2.5 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {columns.map((c) => (
                    <label
                      key={c.name}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={unpivotCols.includes(c.name)}
                        onChange={() => toggleUnpivotCol(c.name)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    New Attribute Column Name
                  </label>
                  <input
                    type="text"
                    value={varName}
                    onChange={(e) => setVarName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    New Value Column Name
                  </label>
                  <input
                    type="text"
                    value={valName}
                    onChange={(e) => setValName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <div className="text-xs text-slate-400">
            {mode === 'pivot'
              ? 'Applying adds a reusable PivotTable step to your active sheet pipeline (editable anytime).'
              : 'Applying melts the selected columns into tall attribute/value rows.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
            >
              {mode === 'pivot' ? 'Apply PivotTable to Sheet' : 'Apply Unpivot Step'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
