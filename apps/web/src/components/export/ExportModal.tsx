import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  Copy,
  Check,
  Play,
  Layers,
  Sparkles,
  Database,
  Terminal,
  Settings2,
  Table,
} from 'lucide-react';
import { api } from '../../api/client';
import { Dataset } from '../../types';
import { StepDefinition } from '../../types/steps';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset | null;
  steps: StepDefinition[];
  initialTab?: 'files' | 'code' | 'run';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dataset,
  steps,
  initialTab = 'files',
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'code' | 'run'>(initialTab);
  const [codeLang, setCodeLang] = useState<'m' | 'sql' | 'polars' | 'excel'>('m');
  const [codeBundle, setCodeBundle] = useState<any | null>(null);
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // File export settings
  const [includeFormulas, setIncludeFormulas] = useState(true);
  const [includeDocs, setIncludeDocs] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // Run full state
  const [runFullResult, setRunFullResult] = useState<any | null>(null);
  const [isRunningFull, setIsRunningFull] = useState(false);

  useEffect(() => {
    if (isOpen && dataset && activeTab === 'code' && !codeBundle) {
      loadCodeBundle();
    }
  }, [isOpen, dataset, activeTab]);

  if (!isOpen || !dataset) return null;

  const loadCodeBundle = async () => {
    setIsLoadingCode(true);
    try {
      const res = await api.exportCode(dataset.id, steps);
      setCodeBundle(res);
    } catch (err: any) {
      alert(err?.message || 'Failed to generate code bundle');
    } finally {
      setIsLoadingCode(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsExporting('xlsx');
    try {
      const blob = await api.exportExcel(dataset.id, steps, includeFormulas, includeDocs);
      downloadBlob(blob, `${dataset.name}_export.xlsx`);
    } catch (err: any) {
      alert(err?.message || 'Failed to export Excel file');
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadCsv = async () => {
    setIsExporting('csv');
    try {
      const blob = await api.exportCsv(dataset.id, steps);
      downloadBlob(blob, `${dataset.name}_export.csv`);
    } catch (err: any) {
      alert(err?.message || 'Failed to export CSV file');
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadParquet = async () => {
    setIsExporting('parquet');
    try {
      const blob = await api.exportParquet(dataset.id, steps);
      downloadBlob(blob, `${dataset.name}_export.parquet`);
    } catch (err: any) {
      alert(err?.message || 'Failed to export Parquet file');
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadJson = async () => {
    setIsExporting('json');
    try {
      const blob = await api.exportJson(dataset.id, steps);
      downloadBlob(blob, `${dataset.name}_export.json`);
    } catch (err: any) {
      alert(err?.message || 'Failed to export JSON file');
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadPipelineSpec = async () => {
    setIsExporting('spec');
    try {
      const blob = await api.exportPipelineSpec(dataset.id, steps);
      downloadBlob(blob, `${dataset.name}_pipeline.json`);
    } catch (err: any) {
      alert(err?.message || 'Failed to export Pipeline JSON');
    } finally {
      setIsExporting(null);
    }
  };

  const handleRunFull = async () => {
    setIsRunningFull(true);
    try {
      const res = await api.runFullPipeline(dataset.id, steps);
      setRunFullResult(res);
    } catch (err: any) {
      alert(err?.message || 'Failed to execute full pipeline');
    } finally {
      setIsRunningFull(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Download size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Export & Output Suite</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {steps.length} Steps Applied
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Download spreadsheet files with live formulas, standalone code scripts, or run across full dataset
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

        {/* Tab Header */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/30 flex items-center gap-6 shrink-0">
          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'files'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>Files & Spreadsheets</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('code');
              if (!codeBundle) loadCodeBundle();
            }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode size={14} />
            <span>Code Exporters (M, SQL, Polars)</span>
          </button>

          <button
            onClick={() => setActiveTab('run')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'run'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play size={14} />
            <span>Full Dataset Background Run</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'files' && (
            <div className="space-y-4">
              {/* Excel Card (Featured) */}
              <div className="p-4 bg-gradient-to-br from-emerald-950/30 to-slate-950 border border-emerald-500/30 rounded-2xl relative overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">Excel Spreadsheet (.xlsx)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Sparkles size={11} /> Live Excel Formulas
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                      Exports actual Excel formulas (<code className="text-emerald-300 font-mono text-[11px]">=B2 - C2</code>, <code className="text-emerald-300 font-mono text-[11px]">=IF(...)</code>, <code className="text-emerald-300 font-mono text-[11px]">=ROUND(...)</code>) into transformed cells, plus an automated Documentation audit trail worksheet.
                    </p>

                    <div className="pt-2 flex items-center gap-4 text-xs text-slate-400">
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
                        <input
                          type="checkbox"
                          checked={includeFormulas}
                          onChange={(e) => setIncludeFormulas(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                        />
                        <span>Write Live Excel Formulas into Cells</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
                        <input
                          type="checkbox"
                          checked={includeDocs}
                          onChange={(e) => setIncludeDocs(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                        />
                        <span>Include "Documentation" Step Sheet</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadExcel}
                    disabled={isExporting === 'xlsx'}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 shrink-0 transition-all"
                  >
                    <Download size={15} />
                    <span>{isExporting === 'xlsx' ? 'Generating...' : 'Download XLSX'}</span>
                  </button>
                </div>
              </div>

              {/* Grid of Other Formats */}
              <div className="grid grid-cols-2 gap-4">
                {/* CSV */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-slate-200 block">Comma-Separated Values (.csv)</span>
                    <span className="text-[11px] text-slate-400">Standard UTF-8 encoded text export</span>
                  </div>
                  <button
                    onClick={handleDownloadCsv}
                    disabled={isExporting === 'csv'}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    <span>CSV</span>
                  </button>
                </div>

                {/* Parquet */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-slate-200 block">Apache Parquet (.parquet)</span>
                    <span className="text-[11px] text-slate-400">High performance ZSTD columnar format</span>
                  </div>
                  <button
                    onClick={handleDownloadParquet}
                    disabled={isExporting === 'parquet'}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    <span>Parquet</span>
                  </button>
                </div>

                {/* JSON */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-slate-200 block">JSON Array (.json)</span>
                    <span className="text-[11px] text-slate-400">Structured records list format</span>
                  </div>
                  <button
                    onClick={handleDownloadJson}
                    disabled={isExporting === 'json'}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    <span>JSON</span>
                  </button>
                </div>

                {/* Reusable Pipeline Template */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-slate-200 block">Pipeline Template (.json)</span>
                    <span className="text-[11px] text-slate-400">Save step recipe to apply to new files</span>
                  </div>
                  <button
                    onClick={handleDownloadPipelineSpec}
                    disabled={isExporting === 'spec'}
                    className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-500/40 flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    <span>Pipeline</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="space-y-3">
              {/* Code subtabs */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setCodeLang('m')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      codeLang === 'm' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Power Query M
                  </button>
                  <button
                    onClick={() => setCodeLang('sql')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      codeLang === 'sql' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    DuckDB / ANSI SQL
                  </button>
                  <button
                    onClick={() => setCodeLang('polars')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      codeLang === 'polars' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Python (Polars)
                  </button>
                  <button
                    onClick={() => setCodeLang('excel')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      codeLang === 'excel' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Excel Formulas
                  </button>
                </div>

                {codeBundle && (
                  <button
                    onClick={() => {
                      const text =
                        codeLang === 'm'
                          ? codeBundle.power_query_m
                          : codeLang === 'sql'
                          ? codeBundle.sql
                          : codeLang === 'polars'
                          ? codeBundle.polars
                          : JSON.stringify(codeBundle.excel_formulas, null, 2);
                      handleCopyCode(text);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                )}
              </div>

              {/* Code viewer */}
              {isLoadingCode ? (
                <div className="p-12 text-center text-slate-500 text-xs">Compiling code bundle...</div>
              ) : codeBundle ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-96">
                  {codeLang === 'm' && (
                    <pre className="text-sky-300 leading-relaxed whitespace-pre-wrap">{codeBundle.power_query_m}</pre>
                  )}
                  {codeLang === 'sql' && (
                    <pre className="text-emerald-300 leading-relaxed whitespace-pre-wrap">{codeBundle.sql}</pre>
                  )}
                  {codeLang === 'polars' && (
                    <pre className="text-amber-300 leading-relaxed whitespace-pre-wrap">{codeBundle.polars}</pre>
                  )}
                  {codeLang === 'excel' && (
                    <div className="space-y-2">
                      <span className="text-slate-400 block font-sans text-xs mb-2">Live row formulas mapped from transformation steps:</span>
                      {!Array.isArray(codeBundle.excel_formulas) || codeBundle.excel_formulas.length === 0 ? (
                        <p className="text-slate-500 italic">No formula-generating steps currently in pipeline.</p>
                      ) : (
                        codeBundle.excel_formulas.map((item: any, idx: number) => (
                          <div key={idx} className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center justify-between">
                            <span className="text-slate-300 font-sans font-medium">{item.step}:</span>
                            <span className="text-emerald-400 font-mono">{item.formula}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">Click to load code bundle</div>
              )}
            </div>
          )}

          {activeTab === 'run' && (
            <div className="space-y-4 max-w-xl mx-auto bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Play size={24} className="fill-emerald-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-100">Execute Full Pipeline Across Entire Dataset</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                The center grid computes on a fast sample for instant 60fps interactivity. Click below to execute all {steps.length} steps across 100% of rows in DuckDB.
              </p>

              <button
                onClick={handleRunFull}
                disabled={isRunningFull}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 mx-auto transition-all"
              >
                <Play size={14} className="fill-slate-950" />
                <span>{isRunningFull ? 'Executing in DuckDB...' : 'Run Full Dataset Now'}</span>
              </button>

              {runFullResult && (
                <div className="mt-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-left space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-medium">Status:</span>
                    <span className="text-emerald-400 font-bold uppercase">{runFullResult.status || 'completed'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-medium">Total Rows Processed:</span>
                    <span className="text-slate-100 font-mono font-bold">
                      {(runFullResult.total_rows ?? runFullResult.output_rows ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-medium">Total Columns:</span>
                    <span className="text-slate-100 font-mono">
                      {runFullResult.column_count ?? runFullResult.output_columns ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Execution Duration:</span>
                    <span className="text-emerald-400 font-mono font-bold">{runFullResult.execution_time_ms ?? 1} ms</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            All code and files generated locally without cloud dependency
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
