import React, { useState } from 'react';
import { X, Check, TrendingUp, Layers, Code2, Copy } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface WindowCalcModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WindowCalcModal: React.FC<WindowCalcModalProps> = ({ isOpen, onClose }) => {
  const { columns, addStep } = useWorkbenchStore();

  const [calcType, setCalcType] = useState<
    'running_total' | 'rank' | 'percent_of_total' | 'moving_avg' | 'lag' | 'lead'
  >('running_total');

  const [targetColumn, setTargetColumn] = useState(columns[0]?.name || '');
  const [selectedPartitionCols, setSelectedPartitionCols] = useState<string[]>([]);
  const [orderByColumn, setOrderByColumn] = useState(columns[0]?.name || '');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');
  const [windowSize, setWindowSize] = useState(3);
  const [offset, setOffset] = useState(1);
  const [outputColumn, setOutputColumn] = useState('running_total_col');
  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const togglePartitionCol = (colName: string) => {
    if (selectedPartitionCols.includes(colName)) {
      setSelectedPartitionCols(selectedPartitionCols.filter((c) => c !== colName));
    } else {
      setSelectedPartitionCols([...selectedPartitionCols, colName]);
    }
  };

  const handleCalcTypeChange = (type: any) => {
    setCalcType(type);
    switch (type) {
      case 'running_total':
        setOutputColumn(`cum_${targetColumn}`);
        break;
      case 'rank':
        setOutputColumn(`rank_${targetColumn}`);
        break;
      case 'percent_of_total':
        setOutputColumn(`pct_${targetColumn}`);
        break;
      case 'moving_avg':
        setOutputColumn(`moving_avg_${targetColumn}`);
        break;
      case 'lag':
        setOutputColumn(`prev_${targetColumn}`);
        break;
      case 'lead':
        setOutputColumn(`next_${targetColumn}`);
        break;
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetColumn) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'window_calc',
      label: `${calcType.replace('_', ' ').toUpperCase()} on ${targetColumn}`,
      enabled: true,
      params: {
        calc_type: calcType,
        target_column: targetColumn,
        output_column: outputColumn,
        partition_by: selectedPartitionCols,
        order_by: orderByColumn,
        order_direction: orderDirection,
        window_size: windowSize,
        offset: offset,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Window Calculation Wizard</h3>
              <p className="text-xs text-slate-400">
                Running totals, rank, moving averages, and lag/lead across rows
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
        <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Preset Buttons */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              1. Calculation Preset
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { type: 'running_total', label: 'Running Total', desc: 'Cumulative sum over rows' },
                { type: 'rank', label: 'Rank', desc: 'Dense rank (1st, 2nd, 3rd)' },
                { type: 'percent_of_total', label: '% of Total', desc: 'Row value divided by group sum' },
                { type: 'moving_avg', label: 'Moving Average', desc: 'Trailing N-row rolling mean' },
                { type: 'lag', label: 'Previous Row (Lag)', desc: 'Value from earlier row' },
                { type: 'lead', label: 'Next Row (Lead)', desc: 'Value from next row' },
              ].map((item) => (
                <div
                  key={item.type}
                  onClick={() => handleCalcTypeChange(item.type)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    calcType === item.type
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-xs">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Target Column */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Target Column
              </label>
              <select
                value={targetColumn}
                onChange={(e) => {
                  setTargetColumn(e.target.value);
                  setOutputColumn(`${calcType}_${e.target.value}`);
                }}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.data_type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                New Column Name
              </label>
              <input
                type="text"
                value={outputColumn}
                onChange={(e) => setOutputColumn(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                required
              />
            </div>
          </div>

          {/* Partition by (Within Group) */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1">
              Group / Reset Within (Partition By - Optional)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Restart calculation per group (e.g. running total resets per customer or department)
            </p>
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded-xl">
              {columns.map((c) => {
                const isChecked = selectedPartitionCols.includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => togglePartitionCol(c.name)}
                    className={`px-2 py-0.5 rounded text-xs border ${
                      isChecked
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {isChecked ? '✓ ' : ''}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order by */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Order Rows By
              </label>
              <select
                value={orderByColumn}
                onChange={(e) => setOrderByColumn(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Sort Direction
              </label>
              <select
                value={orderDirection}
                onChange={(e) => setOrderDirection(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                <option value="asc">Ascending (Smallest to Largest / Chronological)</option>
                <option value="desc">Descending (Largest to Smallest / Newest)</option>
              </select>
            </div>
          </div>

          {/* Conditional params for moving avg or lag */}
          {calcType === 'moving_avg' && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Rolling Window Size (Rows)
              </label>
              <input
                type="number"
                min="2"
                max="100"
                value={windowSize}
                onChange={(e) => setWindowSize(Number(e.target.value))}
                className="w-24 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>
          )}

          {(calcType === 'lag' || calcType === 'lead') && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Row Offset Count
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
                className="w-24 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>
          )}

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
              className="px-5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Window Calculation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
