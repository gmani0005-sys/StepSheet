import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Sliders,
  Filter,
} from 'lucide-react';
import { api } from '../../api/client';
import { Dataset, ColumnSchema } from '../../types';
import { StepDefinition } from '../../types/steps';

interface QualityModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset | null;
  steps: StepDefinition[];
  columns: ColumnSchema[];
}

export const QualityModal: React.FC<QualityModalProps> = ({
  isOpen,
  onClose,
  dataset,
  steps,
  columns,
}) => {
  const [activeTab, setActiveTab] = useState<'report' | 'builder'>('report');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'fail' | 'pass'>('all');

  // New rule form
  const [newRuleType, setNewRuleType] = useState('not_null');
  const [newColumn, setNewColumn] = useState(columns[0]?.name || '');
  const [newLabel, setNewLabel] = useState('');
  const [newSeverity, setNewSeverity] = useState<'error' | 'warning'>('error');
  const [minVal, setMinVal] = useState('');
  const [maxVal, setMaxVal] = useState('');
  const [allowedVals, setAllowedVals] = useState('');
  const [regexPattern, setRegexPattern] = useState('');

  useEffect(() => {
    if (columns.length > 0 && !newColumn) {
      setNewColumn(columns[0].name);
    }
  }, [columns]);

  useEffect(() => {
    if (isOpen && dataset && !report) {
      handleRunQuickAudit();
    }
  }, [isOpen, dataset]);

  if (!isOpen || !dataset) return null;

  const handleRunQuickAudit = async () => {
    setIsLoading(true);
    try {
      const res = await api.runQuickAudit(dataset.id);
      setReport(res);
      setRules(res.results.map((r: any) => ({
        id: r.rule_id,
        rule_type: r.rule_type,
        column: r.column,
        label: r.label,
        severity: r.severity,
      })));
      setActiveTab('report');
    } catch (err: any) {
      alert(err.message || 'Quick audit failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunCustomCheck = async () => {
    if (rules.length === 0) return;
    setIsLoading(true);
    try {
      const res = await api.runQualityCheck(dataset.id, rules, steps);
      setReport(res);
      setActiveTab('report');
    } catch (err: any) {
      alert(err.message || 'Quality audit failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRule = () => {
    if (!newColumn) return;
    const ruleId = `rule_${Date.now()}`;
    const params: Record<string, any> = {};

    if (newRuleType === 'range') {
      if (minVal !== '') params.min = parseFloat(minVal);
      if (maxVal !== '') params.max = parseFloat(maxVal);
    } else if (newRuleType === 'allowed_values') {
      params.allowed_values = allowedVals.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (newRuleType === 'regex') {
      params.pattern = regexPattern;
    }

    const autoLabel = newLabel.trim() || `${newColumn} ${newRuleType.replace('_', ' ')}`;

    const newR = {
      id: ruleId,
      rule_type: newRuleType,
      column: newColumn,
      label: autoLabel,
      severity: newSeverity,
      params,
    };

    setRules((prev) => [...prev, newR]);
    setNewLabel('');
    setMinVal('');
    setMaxVal('');
    setAllowedVals('');
    setRegexPattern('');
    setActiveTab('report');
    // Run evaluation with updated rule
    setTimeout(() => {
      api.runQualityCheck(dataset.id, [...rules, newR], steps)
        .then(setReport)
        .catch(() => {});
    }, 100);
  };

  const handleDownloadFailing = async (r: any) => {
    try {
      const blob = await api.downloadFailingRows(dataset.id, r, steps);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `failing_${r.rule_type}_${r.column}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to download failing records');
    }
  };

  const filteredResults = (report?.results || []).filter((r: any) => {
    if (filterStatus === 'fail') return r.status === 'fail';
    if (filterStatus === 'pass') return r.status === 'pass';
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Data Integrity & Quality Suite</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  DuckDB Audited
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automated validation rules, reconciliation checks, and audit reports for {dataset.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunQuickAudit}
              disabled={isLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <RotateCcw size={12} className={isLoading ? 'animate-spin' : ''} />
              <span>Quick Audit</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scorecard Hero Banner */}
        {report && (
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 grid grid-cols-4 gap-4 shrink-0">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                report.health_score >= 90
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : report.health_score >= 70
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {report.health_score}%
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Health Score</span>
                <span className="text-xs font-semibold text-slate-200">
                  {report.health_score >= 90 ? 'High Quality' : report.health_score >= 70 ? 'Fair Quality' : 'Action Required'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm">
                {report.total_rules}
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Rules Evaluated</span>
                <span className="text-xs font-semibold text-slate-200">Across {columns.length} Columns</span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Passed Rules</span>
                <span className="text-xs font-semibold text-emerald-400">{report.passed_count} Passed</span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-sm">
                <XCircle size={18} />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Violations</span>
                <span className="text-xs font-semibold text-rose-400">{report.failed_count} Failed</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('report')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'report'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Audit Results & Violations ({report?.results?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('builder')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'builder'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Custom Rule Builder (+ Add Check)
            </button>
          </div>

          {activeTab === 'report' && (
            <div className="flex items-center gap-1.5 pb-2 text-[11px]">
              <span className="text-slate-500 mr-1 flex items-center gap-1">
                <Filter size={11} /> Filter:
              </span>
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  filterStatus === 'all' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('fail')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  filterStatus === 'fail' ? 'bg-rose-950/80 text-rose-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Failed ({report?.failed_count || 0})
              </button>
              <button
                onClick={() => setFilterStatus('pass')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  filterStatus === 'pass' ? 'bg-emerald-950/80 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Passed ({report?.passed_count || 0})
              </button>
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'report' ? (
            <div className="space-y-3">
              {filteredResults.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  <ShieldCheck size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-xs">No quality rules match current filter.</p>
                </div>
              ) : (
                filteredResults.map((r: any) => {
                  const isPass = r.status === 'pass';
                  const isExpanded = expandedRuleId === r.rule_id;

                  return (
                    <div
                      key={r.rule_id}
                      className={`border rounded-xl transition-all ${
                        isPass
                          ? 'bg-slate-950/40 border-slate-800/80'
                          : 'bg-rose-950/10 border-rose-500/30'
                      }`}
                    >
                      <div className="p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {isPass ? (
                            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-slate-200">{r.label}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                                {r.rule_type.replace('_', ' ')}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                col: {r.column}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{r.message}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isPass && r.failed_rows_count > 0 && (
                            <button
                              onClick={() => handleDownloadFailing(r)}
                              title="Download failing rows CSV"
                              className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs flex items-center gap-1 font-medium transition-colors"
                            >
                              <Download size={12} />
                              <span>Export Failing ({r.failed_rows_count})</span>
                            </button>
                          )}

                          {r.sample_failing_rows && r.sample_failing_rows.length > 0 && (
                            <button
                              onClick={() => setExpandedRuleId(isExpanded ? null : r.rule_id)}
                              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Sample Failing Rows */}
                      {isExpanded && r.sample_failing_rows && r.sample_failing_rows.length > 0 && (
                        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 text-xs">
                          <span className="text-[11px] font-semibold text-rose-400 block mb-2">
                            Sample Violating Rows (Showing top {r.sample_failing_rows.length}):
                          </span>
                          <div className="overflow-x-auto rounded border border-slate-800">
                            <table className="w-full text-left font-mono text-[11px]">
                              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                                <tr>
                                  {Object.keys(r.sample_failing_rows[0]).map((h) => (
                                    <th key={h} className="p-2 border-r border-slate-800/80">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800 text-slate-200">
                                {r.sample_failing_rows.map((row: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-800/40">
                                    {Object.values(row).map((val: any, vIdx: number) => (
                                      <td key={vIdx} className="p-2 border-r border-slate-800/80 whitespace-nowrap">
                                        {val === null ? <span className="text-slate-600 italic">null</span> : String(val)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Custom Rule Builder Tab */
            <div className="space-y-4 max-w-xl mx-auto bg-slate-950/60 border border-slate-800 rounded-xl p-5">
              <h4 className="font-semibold text-xs text-slate-200">Add New Data Integrity Rule</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Target Column</label>
                  <select
                    value={newColumn}
                    onChange={(e) => setNewColumn(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.data_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Rule Type</label>
                  <select
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="not_null">Not Null / No Missing Values</option>
                    <option value="unique">Unique Key / No Duplicates</option>
                    <option value="range">Numeric Range (Min / Max)</option>
                    <option value="allowed_values">Allowed Values Set</option>
                    <option value="regex">Pattern Match (Regex)</option>
                  </select>
                </div>
              </div>

              {/* Conditional parameter inputs */}
              {newRuleType === 'range' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Min Value</label>
                    <input
                      type="number"
                      value={minVal}
                      onChange={(e) => setMinVal(e.target.value)}
                      placeholder="e.g. 0"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Max Value</label>
                    <input
                      type="number"
                      value={maxVal}
                      onChange={(e) => setMaxVal(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                </div>
              )}

              {newRuleType === 'allowed_values' && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Allowed Values (comma separated)</label>
                  <input
                    type="text"
                    value={allowedVals}
                    onChange={(e) => setAllowedVals(e.target.value)}
                    placeholder="e.g. Active, Pending, Closed"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                </div>
              )}

              {newRuleType === 'regex' && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Regular Expression Pattern</label>
                  <input
                    type="text"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    placeholder="e.g. ^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Custom Label (Optional)</label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Valid Order Price"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="error">Error (Critical)</option>
                    <option value="warning">Warning (Notice)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                >
                  <Plus size={14} />
                  <span>Add Rule & Re-audit</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Rules execute in DuckDB on dataset memory snapshot
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
