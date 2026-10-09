import React, { useState } from 'react';
import { X, Check, Calendar, Code2 } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface DateTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DateTransformModal: React.FC<DateTransformModalProps> = ({ isOpen, onClose }) => {
  const { columns, addStep } = useWorkbenchStore();

  const dateCols = columns.filter((c) => c.data_type === 'date' || c.data_type === 'timestamp');
  const targetInitialCol = dateCols[0]?.name || columns[0]?.name || '';

  const [column, setColumn] = useState(targetInitialCol);
  const [operation, setOperation] = useState<
    'extract_part' | 'eomonth' | 'datedif' | 'add_time' | 'fiscal_year'
  >('extract_part');

  const [datePart, setDatePart] = useState('year');
  const [secondColumn, setSecondColumn] = useState(columns[1]?.name || columns[0]?.name || '');
  const [unit, setUnit] = useState('day');
  const [amount, setAmount] = useState(30);
  const [fiscalStartMonth, setFiscalStartMonth] = useState(4); // e.g. April
  const [outputColumn, setOutputColumn] = useState(`${targetInitialCol}_year`);

  if (!isOpen) return null;

  const handleOperationChange = (op: any) => {
    setOperation(op);
    switch (op) {
      case 'extract_part':
        setOutputColumn(`${column}_${datePart}`);
        break;
      case 'eomonth':
        setOutputColumn(`${column}_eom`);
        break;
      case 'datedif':
        setOutputColumn(`days_${column}_to_${secondColumn}`);
        break;
      case 'add_time':
        setOutputColumn(`${column}_plus_${amount}_${unit}s`);
        break;
      case 'fiscal_year':
        setOutputColumn(`fiscal_year_${column}`);
        break;
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!column) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'date_transform',
      label: `Date ${operation.toUpperCase()} on ${column}`,
      enabled: true,
      params: {
        column,
        operation,
        output_column: outputColumn || `${column}_${operation}`,
        date_part: datePart,
        second_column: secondColumn,
        unit,
        amount,
        fiscal_start_month: fiscalStartMonth,
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Date & Time Operations</h3>
              <p className="text-xs text-slate-400">
                Extract date parts, calculate durations, end of month, and fiscal years
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
          {/* Target Column */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Select Date Column
            </label>
            <select
              value={column}
              onChange={(e) => {
                setColumn(e.target.value);
                setOutputColumn(`${e.target.value}_${operation}`);
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

          {/* Operation Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Operation Type
            </label>
            <select
              value={operation}
              onChange={(e) => handleOperationChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-semibold"
            >
              <option value="extract_part">Extract Date Part (Year, Month, Quarter, Day)</option>
              <option value="eomonth">End of Month (EOMONTH)</option>
              <option value="datedif">Date Difference (DATEDIF between 2 dates)</option>
              <option value="add_time">Add / Subtract Time (N days, months)</option>
              <option value="fiscal_year">Fiscal Year / Period (Custom Start Month)</option>
            </select>
          </div>

          {/* Dynamic options */}
          {operation === 'extract_part' && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Date Component
              </label>
              <select
                value={datePart}
                onChange={(e) => {
                  setDatePart(e.target.value);
                  setOutputColumn(`${column}_${e.target.value}`);
                }}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                <option value="year">Year (e.g. 2024)</option>
                <option value="month">Month Number (1 to 12)</option>
                <option value="quarter">Quarter (1 to 4)</option>
                <option value="week">Week of Year (1 to 52)</option>
                <option value="day">Day of Month (1 to 31)</option>
                <option value="day_name">Day Name (Monday, Tuesday...)</option>
                <option value="weekday">Day of Week Number (0 to 6)</option>
              </select>
            </div>
          )}

          {operation === 'datedif' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Second Date Column (End Date)
                </label>
                <select
                  value={secondColumn}
                  onChange={(e) => setSecondColumn(e.target.value)}
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
                  Difference Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value="day">Days</option>
                  <option value="month">Months</option>
                  <option value="year">Years</option>
                </select>
              </div>
            </div>
          )}

          {operation === 'add_time' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Amount to Add (use negative to subtract)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Time Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value="day">Days</option>
                  <option value="month">Months</option>
                  <option value="year">Years</option>
                </select>
              </div>
            </div>
          )}

          {operation === 'fiscal_year' && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Fiscal Year Start Month
              </label>
              <select
                value={fiscalStartMonth}
                onChange={(e) => setFiscalStartMonth(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                <option value={1}>January (Calendar Year)</option>
                <option value={4}>April (UK / India / Japan Q1)</option>
                <option value={7}>July (Australia Q1)</option>
                <option value={10}>October (US Federal Q1)</option>
              </select>
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
              className="px-5 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg shadow-md shadow-cyan-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Date Transformation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
