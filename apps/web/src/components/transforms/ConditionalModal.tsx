import React, { useState } from 'react';
import { X, Check, Plus, Trash2, Code2, Copy, Sparkles, HelpCircle } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface ConditionalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RuleRow {
  column: string;
  operator: string;
  value: string;
  result: string;
}

export const ConditionalModal: React.FC<ConditionalModalProps> = ({ isOpen, onClose }) => {
  const { columns, addStep } = useWorkbenchStore();

  const [newColumn, setNewColumn] = useState('status_tier');
  const [rules, setRules] = useState<RuleRow[]>([
    {
      column: columns[0]?.name || '',
      operator: 'gte',
      value: '100',
      result: 'High',
    },
  ]);
  const [elseValue, setElseValue] = useState('Standard');
  const [showFormula, setShowFormula] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleAddRule = () => {
    setRules([
      ...rules,
      {
        column: columns[0]?.name || '',
        operator: 'eq',
        value: '',
        result: '',
      },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    if (rules.length > 1) {
      setRules(rules.filter((_, i) => i !== index));
    }
  };

  const handleUpdateRule = (index: number, field: keyof RuleRow, val: string) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: val };
    setRules(updated);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColumn.trim()) return;

    await addStep({
      id: crypto.randomUUID(),
      type: 'conditional',
      label: `Conditional column: ${newColumn}`,
      enabled: true,
      params: {
        new_column: newColumn,
        rules: rules.map((r) => ({
          column: r.column,
          operator: r.operator,
          value: r.value,
          result: r.result,
        })),
        else_value: elseValue,
      },
    });
    onClose();
  };

  const sqlCode = `CASE\n${rules
    .map((r) => `  WHEN "${r.column}" ${r.operator} '${r.value}' THEN '${r.result}'`)
    .join('\n')}\n  ELSE '${elseValue}'\nEND AS "${newColumn}"`;

  const excelFormula = `=IFS(${rules
    .map((r) => `${r.column}2 > "${r.value}", "${r.result}"`)
    .join(', ')}, TRUE, "${elseValue}")`;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">IF / IFS / Conditional Column</h3>
              <p className="text-xs text-slate-400">
                Create new column with visual rule rows and fallback default
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
          {/* New Column Name */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              New Column Name
            </label>
            <input
              type="text"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder="e.g. tier, customer_segment, flag"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          {/* Rules List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-200">
                Rule Conditions (Evaluated in Order)
              </label>
              <button
                type="button"
                onClick={handleAddRule}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
              >
                <Plus size={13} />
                <span>Add Else If Rule</span>
              </button>
            </div>

            <div className="space-y-2">
              {rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs"
                >
                  <span className="font-mono text-amber-400 font-bold shrink-0">
                    {idx === 0 ? 'IF' : 'ELSE IF'}
                  </span>

                  <select
                    value={rule.column}
                    onChange={(e) => handleUpdateRule(idx, 'column', e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-100 shrink-0"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={rule.operator}
                    onChange={(e) => handleUpdateRule(idx, 'operator', e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1.5 text-slate-100 shrink-0"
                  >
                    <option value="eq">equals (=)</option>
                    <option value="neq">not equals (!=)</option>
                    <option value="gt">greater than (&gt;)</option>
                    <option value="gte">greater / equal (&gt;=)</option>
                    <option value="lt">less than (&lt;)</option>
                    <option value="lte">less / equal (&lt;=)</option>
                    <option value="contains">contains text</option>
                    <option value="is_null">is blank / null</option>
                    <option value="is_not_null">is not blank</option>
                  </select>

                  {!['is_null', 'is_not_null'].includes(rule.operator) && (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => handleUpdateRule(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1.5 text-slate-100 w-24 flex-1"
                    />
                  )}

                  <span className="text-slate-400 shrink-0">THEN</span>

                  <input
                    type="text"
                    value={rule.result}
                    onChange={(e) => handleUpdateRule(idx, 'result', e.target.value)}
                    placeholder="Result value"
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-amber-300 font-medium flex-1"
                    required
                  />

                  {rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Else Default */}
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl flex items-center gap-3 text-xs">
            <span className="font-mono text-slate-400 font-bold shrink-0">ELSE (Default)</span>
            <input
              type="text"
              value={elseValue}
              onChange={(e) => setElseValue(e.target.value)}
              placeholder="Fallback result if no rules match"
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-200 flex-1"
            />
          </div>

          {/* Formula Drawer */}
          <div>
            <button
              type="button"
              onClick={() => setShowFormula(!showFormula)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Code2 size={13} className="text-amber-400" />
              <span>{showFormula ? 'Hide equivalent formula' : 'Show equivalent formula / code'}</span>
            </button>
            {showFormula && (
              <div className="mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1">
                  <span>Excel Formula</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(excelFormula);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="hover:text-amber-400 flex items-center gap-1"
                  >
                    <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="text-amber-300 text-[11px] whitespace-pre-wrap">{excelFormula}</pre>
                <div className="text-[11px] text-slate-400 border-b border-slate-800 pt-1 pb-1">
                  <span>DuckDB SQL</span>
                </div>
                <pre className="text-slate-300 text-[11px] whitespace-pre-wrap">{sqlCode}</pre>
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
              className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Conditional Column</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
