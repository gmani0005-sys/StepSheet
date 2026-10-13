import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  Share2,
  History,
  FileSpreadsheet,
  FileText,
  Presentation,
  Database,
  FileCode,
  Archive,
  BarChart2,
  Check,
  Copy,
  AlertTriangle,
  Loader2,
  Mail,
  Clock,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Dataset } from '../../types';
import { StepDefinition } from '../../types/steps';
import { exportShareApi, ExportJobStatus } from '../../api/exportShareApi';
import { api } from '../../api/client';

export interface ExportShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset | null;
  columns?: Array<{ name: string; type?: string; data_type?: string }>;
  steps: StepDefinition[];
  initialTab?: 'files' | 'link' | 'history';
  initialFormat?: string;
}

type TabType = 'files' | 'link' | 'history';

interface FormatOption {
  id: string;
  name: string;
  extension: string;
  description: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  badge?: string;
  category: 'document' | 'data' | 'bundle';
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'xlsx_values',
    name: 'Packaged Workbook',
    extension: '.xlsx',
    description: 'Clean data with formatted headers, auto-filter, and column summaries',
    icon: FileSpreadsheet,
    badge: 'Popular',
    category: 'document',
  },
  {
    id: 'csv',
    name: 'CSV File',
    extension: '.csv',
    description: 'Universal delimited text with formula injection security',
    icon: Database,
    badge: 'Fast',
    category: 'data',
  },
  {
    id: 'parquet',
    name: 'Apache Parquet',
    extension: '.parquet',
    description: 'High performance columnar binary format for data lakes & analytics',
    icon: Database,
    badge: 'Binary',
    category: 'data',
  },
  {
    id: 'json',
    name: 'JSON Records',
    extension: '.json',
    description: 'Standard array of record objects for APIs and modern web tools',
    icon: Database,
    category: 'data',
  },
  {
    id: 'pdf',
    name: 'PDF Executive Report',
    extension: '.pdf',
    description: 'Clean visual summary document with metadata and quality health',
    icon: FileText,
    category: 'document',
  },
  {
    id: 'pptx',
    name: 'Interactive PowerPoint',
    extension: '.pptx',
    description: 'Presentation slide deck ready for executive review',
    icon: Presentation,
    category: 'document',
  },
  {
    id: 'powerbi_starter',
    name: 'Power BI Starter Pack',
    extension: '.zip',
    description: 'Complete assets, M code, schema notes & sample ready for Power BI',
    icon: BarChart2,
    badge: 'New',
    category: 'bundle',
  },
  {
    id: 'share_pack',
    name: 'Complete Share Pack',
    extension: '.zip',
    description: 'All formats combined into one compressed archive for teammates',
    icon: Archive,
    category: 'bundle',
  },
  {
    id: 'code',
    name: 'Pipeline Code Bundle',
    extension: '.zip',
    description: 'Power Query M, SQL, and Python Polars code representations',
    icon: FileCode,
    category: 'bundle',
  },
];

export const ExportShareModal: React.FC<ExportShareModalProps> = ({
  isOpen,
  onClose,
  dataset,
  columns,
  steps,
  initialTab = 'files',
  initialFormat = 'xlsx_values',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedFormat, setSelectedFormat] = useState<string>(initialFormat);

  // Content selection options
  const [includeLineage, setIncludeLineage] = useState(true);
  const [includeQuality, setIncludeQuality] = useState(true);
  const [includeLookups, setIncludeLookups] = useState(true);
  const [includeDictionary, setIncludeDictionary] = useState(true);
  const [includeVisuals, setIncludeVisuals] = useState(true);

  // Row scope
  const [rowScope, setRowScope] = useState<'all' | 'preview' | 'custom'>('all');
  const [customRowLimit, setCustomRowLimit] = useState<number>(1000);

  // CSV specifics
  const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
  const [csvEncoding, setCsvEncoding] = useState<string>('utf-8');

  // Column exclusions
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [columnSearch, setColumnSearch] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastCompletedJob, setLastCompletedJob] = useState<ExportJobStatus | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Share Links state
  const [sharesList, setSharesList] = useState<any[]>([]);
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [shareExpiresDays, setShareExpiresDays] = useState<number>(7);
  const [enablePasscode, setEnablePasscode] = useState<boolean>(false);
  const [sharePasscode, setSharePasscode] = useState<string>('');
  const [showPasscode, setShowPasscode] = useState<boolean>(false);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [copiedShareToken, setCopiedShareToken] = useState<string | null>(null);

  // History state
  const [historyJobs, setHistoryJobs] = useState<ExportJobStatus[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialFormat) {
        setSelectedFormat(initialFormat);
      }
      setExcludedColumns([]);
      setLastCompletedJob(null);
      setIsProcessing(false);
      setJobProgress(0);
    }
  }, [isOpen, initialTab, initialFormat]);

  const projectId = dataset?.project_id || 'default-project';

  // Resolve available columns
  const availableColumns = useMemo(() => {
    if (columns && columns.length > 0) {
      return columns.map((c) => ({
        name: c.name,
        type: c.type || c.data_type || 'text',
      }));
    }
    if (dataset?.schema_metadata && dataset.schema_metadata.length > 0) {
      return dataset.schema_metadata.map((c) => ({
        name: c.name,
        type: c.data_type || c.physical_type || 'text',
      }));
    }
    return [];
  }, [columns, dataset]);

  const totalRowCount = dataset?.row_count ?? 1000;

  // Load shares when on Link tab
  useEffect(() => {
    if (isOpen && activeTab === 'link' && projectId) {
      loadShareLinks();
    }
  }, [isOpen, activeTab, projectId]);

  // Load history when on History tab
  useEffect(() => {
    if (isOpen && activeTab === 'history' && projectId) {
      loadHistory();
    }
  }, [isOpen, activeTab, projectId]);

  const loadShareLinks = async () => {
    try {
      const shares = await api.listShares(projectId);
      setSharesList(shares || []);
    } catch (e) {
      console.warn('Failed to load share links:', e);
    }
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await exportShareApi.getHistory(projectId);
      setHistoryJobs(history);
    } catch (e) {
      console.warn('Failed to load export history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Inspect dependencies in steps for excluded columns
  const columnDependencies = useMemo(() => {
    const deps: Record<string, string[]> = {};
    if (!steps) return deps;
    for (const step of steps) {
      const params = step.params || {};
      const formula = params.formula || params.expression || '';
      for (const key of Object.keys(params)) {
        const val = String(params[key]);
        if (availableColumns.some((c) => c.name === val)) {
          if (!deps[val]) deps[val] = [];
          deps[val].push(`${step.type} (${step.label || 'step'})`);
        }
      }
      // Check column name in formula strings
      for (const col of availableColumns) {
        if (formula.includes(`[${col.name}]`) || formula.includes(col.name)) {
          if (!deps[col.name]) deps[col.name] = [];
          if (!deps[col.name].includes(`${step.type}`)) {
            deps[col.name].push(`${step.type}`);
          }
        }
      }
    }
    return deps;
  }, [steps, availableColumns]);

  // Size estimate
  const estimatedSize = useMemo(() => {
    const totalCols = (availableColumns.length || 5) - excludedColumns.length;
    let rowCount = totalRowCount;
    if (rowScope === 'preview') rowCount = Math.min(rowCount, 500);
    if (rowScope === 'custom') rowCount = customRowLimit;

    let bytesPerRow = 45 * Math.max(1, totalCols);
    if (selectedFormat === 'parquet') bytesPerRow = 12 * Math.max(1, totalCols);
    if (selectedFormat === 'json') bytesPerRow = 70 * Math.max(1, totalCols);

    const totalBytes = rowCount * bytesPerRow;
    if (totalBytes < 1024) return `${totalBytes} B`;
    if (totalBytes < 1024 * 1024) return `~${(totalBytes / 1024).toFixed(1)} KB`;
    return `~${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [totalRowCount, availableColumns, excludedColumns, rowScope, customRowLimit, selectedFormat]);

  if (!isOpen || !dataset) return null;

  const handleToggleColumn = (colName: string) => {
    if (excludedColumns.includes(colName)) {
      setExcludedColumns(excludedColumns.filter((c) => c !== colName));
    } else {
      setExcludedColumns([...excludedColumns, colName]);
    }
  };

  const handleSelectAllColumns = () => {
    setExcludedColumns([]);
  };

  const handleDeselectAllColumns = () => {
    if (availableColumns.length > 0) {
      // Keep at least one column
      setExcludedColumns(availableColumns.slice(1).map((c) => c.name));
    }
  };

  const runExportJob = async (): Promise<ExportJobStatus> => {
    setIsProcessing(true);
    setJobProgress(10);
    setStatusMessage('Preparing snapshot & data pipeline...');

    const payload = {
      project_id: projectId,
      dataset_id: dataset.id,
      format: selectedFormat,
      row_scope: rowScope,
      row_limit: rowScope === 'custom' ? customRowLimit : undefined,
      excluded_columns: excludedColumns,
      include_lineage: includeLineage,
      include_quality: includeQuality,
      include_lookups: includeLookups,
      include_dictionary: includeDictionary,
      include_visuals: includeVisuals,
      options: {
        csv_delimiter: csvDelimiter,
        csv_encoding: csvEncoding,
      },
      steps,
    };

    const initial = await exportShareApi.createJob(payload);
    setJobProgress(30);
    setStatusMessage('Job queued, processing transformations...');

    const finished = await exportShareApi.pollJobUntilDone(
      initial.job_id,
      (update) => {
        setJobProgress(Math.max(30, update.progress_pct));
        if (update.message) setStatusMessage(update.message);
      }
    );

    setLastCompletedJob(finished);
    setIsProcessing(false);
    return finished;
  };

  const handleDownload = async () => {
    try {
      const job = await runExportJob();
      if (job.files && job.files.length > 0) {
        setStatusMessage('Downloading generated file...');
        const primaryFile = job.files[0];
        await exportShareApi.downloadFile(job.job_id, primaryFile.file_id, primaryFile.filename);
        setStatusMessage('Download complete!');
      }
    } catch (err: any) {
      setIsProcessing(false);
      alert(`Export error: ${err.message || 'Unknown error'}`);
    }
  };

  const handleCopyLink = async () => {
    try {
      let job = lastCompletedJob;
      if (!job) {
        job = await runExportJob();
      }
      if (job.files && job.files.length > 0) {
        const fileUrl = `${window.location.origin}${exportShareApi.getFileDownloadUrl(
          job.job_id,
          job.files[0].file_id
        )}`;
        await navigator.clipboard.writeText(fileUrl);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      }
    } catch (err: any) {
      alert(`Error copying link: ${err.message}`);
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`StepSheet Data Export: ${dataset.name}`);
    const body = encodeURIComponent(
      `Hi,\n\nI have generated an export of the "${dataset.name}" workbook with ${totalRowCount.toLocaleString()} rows in format ${selectedFormat}.\n\nShared via StepSheet.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleCreateShareLink = async () => {
    if (enablePasscode && !sharePasscode.trim()) {
      alert('Please enter a passcode or uncheck passcode protection');
      return;
    }
    setIsGeneratingShare(true);
    try {
      const expDays = shareExpiresDays === 0 ? null : shareExpiresDays;
      const pass = enablePasscode && sharePasscode.trim() ? sharePasscode.trim() : undefined;
      await api.createShare(projectId, shareRole, expDays, pass);
      setSharePasscode('');
      setEnablePasscode(false);
      await loadShareLinks();
    } catch (err: any) {
      alert(err.message || 'Failed to create share link');
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleRevokeShareLink = async (shareId: string) => {
    try {
      await api.revokeShare(projectId, shareId);
      await loadShareLinks();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke link');
    }
  };

  const filteredColumns = availableColumns.filter((c) =>
    c.name.toLowerCase().includes(columnSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-5xl h-[88vh] max-h-[820px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-3.5 bg-[#185C37] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/10 rounded-md">
              <Share2 size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold leading-none tracking-tight">Export & Share</h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-white/90">
                  {dataset.name}
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                Generate clean, shareable assets or collaborate with teammates without StepSheet
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white hover:bg-white/15 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center border-b border-gray-200 bg-[#F8F9FA] px-6 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'files'
                ? 'border-[#217346] text-[#217346] bg-white shadow-sm'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Download size={15} />
            <span>Files & Packages</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'link'
                ? 'border-[#217346] text-[#217346] bg-white shadow-sm'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Share2 size={15} />
            <span>Interactive Link</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-[#217346] text-[#217346] bg-white shadow-sm'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <History size={15} />
            <span>Export History</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto">
          {/* TAB 1: FILES & PACKAGES */}
          {activeTab === 'files' && (
            <div className="grid grid-cols-12 h-full divide-x divide-gray-200">
              {/* Left Column: Format Selection */}
              <div className="col-span-5 p-5 overflow-y-auto bg-gray-50/50 flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Select Target Format
                  </h3>
                  <div className="space-y-2">
                    {FORMAT_OPTIONS.map((fmt) => {
                      const Icon = fmt.icon;
                      const isSelected = selectedFormat === fmt.id;
                      return (
                        <div
                          key={fmt.id}
                          onClick={() => setSelectedFormat(fmt.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-white border-[#217346] ring-2 ring-[#217346]/20 shadow-sm'
                              : 'bg-white/70 border-gray-200 hover:border-gray-300 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`p-1.5 rounded-md ${
                                  isSelected
                                    ? 'bg-[#E8F3ED] text-[#217346]'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                <Icon size={18} />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-gray-900">
                                    {fmt.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-gray-500">
                                    {fmt.extension}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 line-clamp-1">
                                  {fmt.description}
                                </p>
                              </div>
                            </div>
                            {fmt.badge && (
                              <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                                {fmt.badge}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* CSV Format Settings if selected */}
                {selectedFormat === 'csv' && (
                  <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
                    <h4 className="text-xs font-bold text-gray-800">CSV Options</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[11px] text-gray-600 mb-1">Delimiter</label>
                        <select
                          value={csvDelimiter}
                          onChange={(e) => setCsvDelimiter(e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#217346]"
                        >
                          <option value=",">Comma (,)</option>
                          <option value=";">Semicolon (;)</option>
                          <option value="&#9;">Tab (\t)</option>
                          <option value="|">Pipe (|)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-600 mb-1">Encoding</label>
                        <select
                          value={csvEncoding}
                          onChange={(e) => setCsvEncoding(e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#217346]"
                        >
                          <option value="utf-8">UTF-8</option>
                          <option value="utf-8-sig">UTF-8 with BOM</option>
                          <option value="latin1">ISO-8859-1 (Latin1)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Customization & Exclusions */}
              <div className="col-span-7 p-6 overflow-y-auto flex flex-col gap-5">
                {/* Row Scope */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                  <h4 className="text-xs font-bold text-gray-800 mb-2.5 flex items-center justify-between">
                    <span>Row Scope & Sample</span>
                    <span className="text-[11px] font-normal text-gray-500">
                      Total: {totalRowCount.toLocaleString()} rows
                    </span>
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <label
                      className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer text-xs ${
                        rowScope === 'all'
                          ? 'border-[#217346] bg-white font-semibold text-[#217346]'
                          : 'border-gray-200 bg-white/60 text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rowScope"
                        checked={rowScope === 'all'}
                        onChange={() => setRowScope('all')}
                        className="text-[#217346] focus:ring-[#217346]"
                      />
                      <span>All 100% Rows</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer text-xs ${
                        rowScope === 'preview'
                          ? 'border-[#217346] bg-white font-semibold text-[#217346]'
                          : 'border-gray-200 bg-white/60 text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rowScope"
                        checked={rowScope === 'preview'}
                        onChange={() => setRowScope('preview')}
                        className="text-[#217346] focus:ring-[#217346]"
                      />
                      <span>Preview (500)</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer text-xs ${
                        rowScope === 'custom'
                          ? 'border-[#217346] bg-white font-semibold text-[#217346]'
                          : 'border-gray-200 bg-white/60 text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rowScope"
                        checked={rowScope === 'custom'}
                        onChange={() => setRowScope('custom')}
                        className="text-[#217346] focus:ring-[#217346]"
                      />
                      <span>Custom First N</span>
                    </label>
                  </div>
                  {rowScope === 'custom' && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-xs text-gray-600">Row limit:</span>
                      <input
                        type="number"
                        min="1"
                        max={totalRowCount}
                        value={customRowLimit}
                        onChange={(e) => setCustomRowLimit(Number(e.target.value) || 100)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs w-28 bg-white focus:outline-none focus:border-[#217346]"
                      />
                    </div>
                  )}
                </div>

                {/* Included Workbook Tabs / Content */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                  <h4 className="text-xs font-bold text-gray-800 mb-2">Content Included in Package</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeLineage}
                        onChange={(e) => setIncludeLineage(e.target.checked)}
                        className="rounded text-[#217346] focus:ring-[#217346]"
                      />
                      <span className="text-gray-700">Formula Lineage Sheet</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeQuality}
                        onChange={(e) => setIncludeQuality(e.target.checked)}
                        className="rounded text-[#217346] focus:ring-[#217346]"
                      />
                      <span className="text-gray-700">Data Quality Report</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeLookups}
                        onChange={(e) => setIncludeLookups(e.target.checked)}
                        className="rounded text-[#217346] focus:ring-[#217346]"
                      />
                      <span className="text-gray-700">Referenced Lookup Tables</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeDictionary}
                        onChange={(e) => setIncludeDictionary(e.target.checked)}
                        className="rounded text-[#217346] focus:ring-[#217346]"
                      />
                      <span className="text-gray-700">Data Dictionary & Types</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeVisuals}
                        onChange={(e) => setIncludeVisuals(e.target.checked)}
                        className="rounded text-[#217346] focus:ring-[#217346]"
                      />
                      <span className="text-gray-700">Dashboard & Visuals Snapshot</span>
                    </label>
                  </div>
                </div>

                {/* Column Exclusions & Lineage Dependency Warnings */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex-1 flex flex-col min-h-[160px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-gray-800">Column Exclusion Checklist</h4>
                      <span className="text-[11px] text-gray-500">
                        ({availableColumns.length - excludedColumns.length} of{' '}
                        {availableColumns.length} active)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllColumns}
                        className="text-[#217346] hover:underline"
                      >
                        All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllColumns}
                        className="text-gray-600 hover:underline"
                      >
                        Deselect
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Search columns..."
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    className="w-full text-xs px-2.5 py-1 mb-2 border border-gray-200 rounded bg-white focus:outline-none focus:border-[#217346]"
                  />

                  <div className="flex-1 overflow-y-auto max-h-36 border border-gray-200 rounded bg-white p-1 divide-y divide-gray-100">
                    {filteredColumns.map((col: { name: string; type?: string }) => {
                      const isExcluded = excludedColumns.includes(col.name);
                      const deps = columnDependencies[col.name];
                      const hasWarning = isExcluded && deps && deps.length > 0;

                      return (
                        <div
                          key={col.name}
                          className="flex items-center justify-between px-2 py-1 hover:bg-gray-50 text-xs"
                        >
                          <label className="flex items-center gap-2 cursor-pointer select-none min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => handleToggleColumn(col.name)}
                              className="rounded text-[#217346] focus:ring-[#217346]"
                            />
                            <span
                              className={`truncate font-mono text-[11px] ${
                                isExcluded ? 'text-gray-400 line-through' : 'text-gray-800'
                              }`}
                            >
                              {col.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-sans">
                              ({col.type || 'text'})
                            </span>
                          </label>

                          {hasWarning && (
                            <span
                              className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0"
                              title={`Referenced by steps: ${deps.join(', ')}`}
                            >
                              <AlertTriangle size={11} />
                              <span>Referenced in steps</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE SHARE LINK */}
          {activeTab === 'link' && (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-1">Create Shareable Project Link</h3>
                <p className="text-xs text-gray-600 mb-4">
                  Teammates can view transformed data, step lineage, and visual dashboards without an account.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Collaborator Role
                    </label>
                    <select
                      value={shareRole}
                      onChange={(e) => setShareRole(e.target.value as any)}
                      className="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#217346]"
                    >
                      <option value="viewer">Viewer (Read-only)</option>
                      <option value="editor">Editor (Can adjust steps)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Link Expiration
                    </label>
                    <select
                      value={shareExpiresDays}
                      onChange={(e) => setShareExpiresDays(Number(e.target.value))}
                      className="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#217346]"
                    >
                      <option value="1">1 Day</option>
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                      <option value="365">1 Year</option>
                      <option value="0">Never (Persistent)</option>
                    </select>
                  </div>
                </div>

                {/* Passcode Protection Toggle */}
                <div className="mb-4 pt-3 border-t border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={enablePasscode}
                      onChange={(e) => {
                        setEnablePasscode(e.target.checked);
                        if (!e.target.checked) setSharePasscode('');
                      }}
                      className="rounded text-[#217346] focus:ring-[#217346]"
                    />
                    <span className="flex items-center gap-1.5">
                      <Lock size={13} className="text-gray-600" />
                      Protect link with a passcode
                    </span>
                  </label>
                  {enablePasscode && (
                    <div className="mt-2.5 relative">
                      <input
                        type={showPasscode ? 'text' : 'password'}
                        placeholder="Enter secure passcode (e.g. Team2026!)"
                        value={sharePasscode}
                        onChange={(e) => setSharePasscode(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 pr-8 bg-white focus:outline-none focus:border-[#217346]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasscode(!showPasscode)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showPasscode ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Recipients must enter this passcode before accessing the shared workbook.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCreateShareLink}
                  disabled={isGeneratingShare}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-[#217346] hover:bg-[#185C37] text-white text-xs font-bold rounded shadow-sm transition-colors disabled:opacity-50"
                >
                  {isGeneratingShare ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Generating link...</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={14} />
                      <span>Generate New Share Link</span>
                    </>
                  )}
                </button>
              </div>

              {/* Active Shares List */}
              <div>
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Active Share Links ({sharesList.length})
                </h4>
                {sharesList.length === 0 ? (
                  <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-200 text-center">
                    No active share links. Create one above to share with collaborators.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sharesList.map((s) => {
                      const shareUrl = `${window.location.origin}?share=${s.token}`;
                      const isCopied = copiedShareToken === s.token;
                      return (
                        <div
                          key={s.id || s.token}
                          className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm"
                        >
                          <div className="min-w-0 flex-1 mr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-800 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                                {s.role || 'viewer'} Access
                              </span>
                              {s.has_passcode && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  <Lock size={10} />
                                  Passcode Protected
                                </span>
                              )}
                              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Clock size={10} />
                                {s.expires_at
                                  ? `Expires ${new Date(s.expires_at).toLocaleDateString()}`
                                  : 'Never expires'}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-gray-500 truncate mt-1">
                              {shareUrl}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(shareUrl);
                                setCopiedShareToken(s.token);
                                setTimeout(() => setCopiedShareToken(null), 2500);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                            >
                              {isCopied ? <Check size={13} className="text-[#217346]" /> : <Copy size={13} />}
                              <span>{isCopied ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const subject = encodeURIComponent(`Shared StepSheet Project: ${dataset?.name || 'Workbook'}`);
                                const body = encodeURIComponent(
                                  `Hi,\n\nI have shared the StepSheet project "${dataset?.name || 'Workbook'}" with you (${s.role || 'viewer'} access).\n\nAccess link: ${shareUrl}\n\n${s.has_passcode ? 'Note: This link requires a passcode to access.' : ''}`
                                );
                                window.location.href = `mailto:?subject=${subject}&body=${body}`;
                              }}
                              className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                              title="Email link to teammate"
                            >
                              <Mail size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeShareLink(s.id || s.token)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Revoke Link"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: EXPORT HISTORY */}
          {activeTab === 'history' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Past Export Deliverables</h3>
                  <p className="text-xs text-gray-500">
                    Snapshots generated previously for this workbook. Files remain stored for 7 days.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadHistory}
                  className="text-xs text-[#217346] font-semibold hover:underline"
                >
                  Refresh
                </button>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
                  <Loader2 size={16} className="animate-spin text-[#217346]" />
                  <span className="text-xs">Loading export records...</span>
                </div>
              ) : historyJobs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-xs">
                  No export deliverables yet. Use the Files tab to generate and download a package.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Format</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Rows</th>
                        <th className="py-2.5 px-3">Files</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {historyJobs.map((job) => (
                        <tr key={job.job_id} className="hover:bg-gray-50/70">
                          <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                            {new Date(job.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-semibold uppercase text-gray-800">
                            {job.format}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                job.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : job.status === 'processing'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-600">
                            {job.total_rows?.toLocaleString() || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">
                            {job.files?.map((f) => f.filename).join(', ') || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {job.files && job.files.length > 0 && job.status === 'completed' && (
                              <button
                                type="button"
                                onClick={() =>
                                  exportShareApi.downloadFile(
                                    job.job_id,
                                    job.files[0].file_id,
                                    job.files[0].filename
                                  )
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#217346] hover:underline"
                              >
                                <Download size={12} />
                                <span>Re-download</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium">Estimated deliverable:</span>
            <span className="text-xs font-mono font-bold text-gray-800 bg-white border border-gray-300 px-2 py-0.5 rounded">
              {estimatedSize}
            </span>
            {isProcessing && (
              <div className="flex items-center gap-2 text-xs text-[#217346] font-medium ml-2">
                <Loader2 size={14} className="animate-spin" />
                <span>
                  {statusMessage || 'Processing...'} ({jobProgress}%)
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEmailShare}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded shadow-sm transition-colors"
              title="Share file details via default email client"
            >
              <Mail size={14} />
              <span>Email</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded shadow-sm transition-colors disabled:opacity-50"
            >
              {copiedLink ? <Check size={14} className="text-[#217346]" /> : <Copy size={14} />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy File Link'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-[#217346] hover:bg-[#185C37] text-white rounded shadow-sm transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Download Deliverable</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
