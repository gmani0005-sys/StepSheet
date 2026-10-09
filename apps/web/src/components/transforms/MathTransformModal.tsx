import React, { useState } from 'react';
import { X, Check, Calculator, Plus, Trash2, Code2 } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface MathTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BinItem {
  max: number;
  label: string;
}

export const MathTransformModal: React.FC<MathTransformModalProps> = ({ isOpen, onClose }) => {
  const { columns, addStep } = useWorkbenchStore();

  const numCols = columns.filter((c) => c.data_type === 'integer' || c.data_type === 'float');
  const initialCol = numCols[0]?.name || columns[0]?.name || '';

  const [column1, setColumn1] = useState(initialCol);
  const [column2, setColumn2] = useState(numCols[1]?.name || columns[1]?.name || initialCol);
  const [operation, setOperation] = useState<
    'arithmetic' | 'round' | 'roundup' | 'rounddown' | 'abs' | 'percent_change' | 'bin'
  >('arithmetic');

  const [mathOperator, setMathOperator] = useState<'+' | '-' | '*' | '/'>('+');
  const [decimals, setDecimals] = useState(2);
  const [outputColumn, setOutputColumn] = useState('calc_result');
  const [bins, setBins] = useState<BinItem[]>([
    { max: 50, label: 'Low' },
    { max: 200, label: 'Medium' },
  ]);
  const [binOther, setBinOther] = useState('High');

  if (!isOpen) return null;

  const handleAddBin = () => {
    setBins([...bins, { max: 500, label: `Tier ${bins.length + 1}` }]);
  };

  const handleRemoveBin = (index: number) => {
    setBins(bins.filter((_, i) => i !== index));
  };

  const handleUpdateBin = (index: number, field: keyof BinItem, val: any) => {
    const updated = [...bins];
    updated[index] = { ...updated[index], [field]: val };
    setBins(updated);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!column1) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'math_transform',
      label: `Math ${operation.toUpperCase()} on ${column1}`,
      enabled: true,
      params: {
        operation,
        column1,
        column2,
        math_operator: mathOperator,
        decimals,
        output_column: outputColumn || `${column1}_calc`,
        bins,
        bin_other: binOther,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-violet-500/20">
              <Calculator size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Numeric & Math Operations</h3>
              <p className="text-xs text-slate-400">
                Arithmetic between columns, rounding, percent change, and binning
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
          {/* Operation Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Select Math Operation
            </label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-semibold"
            >
              <option value="arithmetic">Arithmetic between Columns (+, -, *, /)</option>
              <option value="round">Round to N Decimals</option>
              <option value="roundup">Round Up (CEIL)</option>
              <option value="rounddown">Round Down (FLOOR)</option>
              <option value="abs">Absolute Value (ABS)</option>
              <option value="percent_change">Percent Change (% difference)</option>
              <option value="bin">Numeric Bucketing (Band Ranges)</option>
            </select>
          </div>

          {/* Primary Column */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Primary Column
            </label>
            <select
              value={column1}
              onChange={(e) => setColumn1(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.data_type})
                </option>
              ))}
            </select>
          </div>

          {/* Arithmetic details */}
          {operation === 'arithmetic' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Operator
                </label>
                <select
                  value={mathOperator}
                  onChange={(e) => setMathOperator(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold"
                >
                  <option value="+">Addition (+)</option>
                  <option value="-">Subtraction (-)</option>
                  <option value="*">Multiplication (*)</option>
                  <option value="/">Division (/ with zero safeguard)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Second Column
                </label>
                <select
                  value={column2}
                  onChange={(e) => setColumn2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Percent change */}
          {operation === 'percent_change' && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Target / New Column (Change from Primary to Target)
              </label>
              <select
                value={column2}
                onChange={(e) => setColumn2(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Decimals */}
          {['round', 'arithmetic', 'percent_change'].includes(operation) && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Decimal Places
              </label>
              <input
                type="number"
                min="0"
                max="6"
                value={decimals}
                onChange={(e) => setDecimals(Number(e.target.value))}
                className="w-24 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>
          )}

          {/* Bins / Buckets */}
          {operation === 'bin' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200">
                  Numeric Ranges & Labels
                </label>
                <button
                  type="button"
                  onClick={handleAddBin}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                >
                  <Plus size={13} /> Add Band
                </button>
              </div>

              {bins.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 shrink-0">Up to &lt;=</span>
                  <input
                    type="number"
                    value={b.max}
                    onChange={(e) => handleUpdateBin(idx, 'max', Number(e.target.value))}
                    className="w-24 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                  <span className="text-slate-400 shrink-0">Label:</span>
                  <input
                    type="text"
                    value={b.label}
                    onChange={(e) => handleUpdateBin(idx, 'label', e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveBin(idx)}
                    className="p-1.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2 text-xs pt-1">
                <span className="text-slate-400 shrink-0">Above all else:</span>
                <input
                  type="text"
                  value={binOther}
                  onChange={(e) => setBinOther(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>
          )}

          {/* New Column Name */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Output Column Name
            </label>
            <input
              type="text"
              value={outputColumn}
              onChange={(e) => setOutputColumn(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
              required
            />
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
              className="px-5 py-2 text-xs font-semibold bg-violet-500 hover:bg-violet-400 text-slate-950 rounded-lg shadow-md shadow-violet-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Math Calculation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
