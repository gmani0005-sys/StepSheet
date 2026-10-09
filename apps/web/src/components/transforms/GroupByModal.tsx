import React, { useState } from 'react';
import { X, Check, Plus, Trash2, Code2, Copy, Calculator, Layers } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface GroupByModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AggItem {
  column: string;
  agg_func: 'sum' | 'count' | 'distinct_count' | 'avg' | 'min' | 'max';
  output_column: string;
}

export const GroupByModal: React.FC<GroupByModalProps> = ({ isOpen, onClose }) => {
  const { columns, addStep } = useWorkbenchStore();

  const [selectedGroupCols, setSelectedGroupCols] = useState<string[]>([
    columns[0]?.name || '',
  ]);

  const [aggregations, setAggregations] = useState<AggItem[]>([
    {
      column: columns[1]?.name || columns[0]?.name || '',
      agg_func: 'sum',
      output_column: `total_${columns[1]?.name || 'val'}`,
    },
  ]);

  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const toggleGroupCol = (colName: string) => {
    if (selectedGroupCols.includes(colName)) {
      setSelectedGroupCols(selectedGroupCols.filter((c) => c !== colName));
    } else {
      setSelectedGroupCols([...selectedGroupCols, colName]);
    }
  };

  const handleAddAgg = () => {
    const col = columns[0]?.name || '';
    setAggregations([
      ...aggregations,
      {
        column: col,
        agg_func: 'sum',
        output_column: `sum_${col}_${aggregations.length + 1}`,
      },
    ]);
  };

  const handleRemoveAgg = (index: number) => {
    if (aggregations.length > 1) {
      setAggregations(aggregations.filter((_, i) => i !== index));
    }
  };

  const handleUpdateAgg = (index: number, field: keyof AggItem, val: string) => {
    const updated = [...aggregations];
    updated[index] = { ...updated[index], [field]: val };
    // Auto-update output name if user changes col or func
    if (field === 'column' || field === 'agg_func') {
      const col = field === 'column' ? val : updated[index].column;
      const func = field === 'agg_func' ? val : updated[index].agg_func;
      updated[index].output_column = `${func}_${col}`;
    }
    setAggregations(updated);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (aggregations.length === 0) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'group_by',
      label: `Group by ${selectedGroupCols.join(', ') || 'all rows'} (${aggregations.length} aggs)`,
      enabled: true,
      params: {
        group_by_columns: selectedGroupCols,
        aggregations,
      },
    });
    onClose();
  };

  const sqlCode = `SELECT\n  ${selectedGroupCols.map((c) => `"${c}"`).join(', ')}${
    selectedGroupCols.length ? ',\n  ' : ''
  }${aggregations
    .map((a) => `${a.agg_func.toUpperCase()}("${a.column}") AS "${a.output_column}"`)
    .join(',\n  ')}\nFROM table\n${
    selectedGroupCols.length ? `GROUP BY ${selectedGroupCols.map((c) => `"${c}"`).join(', ')}` : ''
  };`;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Calculator size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Group By & Aggregations</h3>
              <p className="text-xs text-slate-400">
                Group by dimensions and calculate SUM, COUNT, AVG, MIN, MAX
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Group By Columns */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              1. Group By Columns (Dimensions)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Select one or more columns to group rows by. Leave unselected to calculate grand totals across the entire table.
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-950/60 border border-slate-800 rounded-xl">
              {columns.map((c) => {
                const isChecked = selectedGroupCols.includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleGroupCol(c.name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isChecked
                        ? 'bg-sky-500/20 text-sky-200 border-sky-500/40 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {isChecked && '✓ '}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aggregations List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-200">
                2. Aggregations & Formulas
              </label>
              <button
                type="button"
                onClick={handleAddAgg}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
              >
                <Plus size={13} />
                <span>Add Aggregation</span>
              </button>
            </div>

            <div className="space-y-2">
              {aggregations.map((agg, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs"
                >
                  <select
                    value={agg.agg_func}
                    onChange={(e) => handleUpdateAgg(idx, 'agg_func', e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-sky-300 font-semibold shrink-0"
                  >
                    <option value="sum">SUM</option>
                    <option value="count">COUNT</option>
                    <option value="distinct_count">DISTINCT COUNT</option>
                    <option value="avg">AVERAGE</option>
                    <option value="min">MIN</option>
                    <option value="max">MAX</option>
                  </select>

                  <span className="text-slate-400 shrink-0">of</span>

                  <select
                    value={agg.column}
                    onChange={(e) => handleUpdateAgg(idx, 'column', e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-100 flex-1"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.data_type})
                      </option>
                    ))}
                  </select>

                  <span className="text-slate-400 shrink-0">as</span>

                  <input
                    type="text"
                    value={agg.output_column}
                    onChange={(e) => handleUpdateAgg(idx, 'output_column', e.target.value)}
                    placeholder="Output header name"
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-100 flex-1 font-mono text-[11px]"
                    required
                  />

                  {aggregations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAgg(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Formula Drawer */}
          <div>
            <button
              type="button"
              onClick={() => setShowFormula(!showFormula)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Code2 size={13} className="text-sky-400" />
              <span>{showFormula ? 'Hide equivalent SQL' : 'Show equivalent DuckDB SQL'}</span>
            </button>
            {showFormula && (
              <div className="mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
                  <span>DuckDB SQL</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(sqlCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="hover:text-sky-400 flex items-center gap-1"
                  >
                    <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="text-sky-300 text-[11px] whitespace-pre-wrap">{sqlCode}</pre>
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Group By & Summarize</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
