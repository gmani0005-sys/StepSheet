import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Trash2,
  Plus,
  Database,
  ChevronRight,
  FolderOpen,
  Sparkles,
  GitBranch,
  Copy,
  Pencil,
  Check,
  X,
  Link2,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

export const LeftPanel: React.FC = () => {
  const {
    datasets,
    selectedDataset,
    selectDataset,
    uploadDataset,
    loadSamples,
    deleteDataset,
    isLeftPanelOpen,
    queries,
    activeQueryId,
    datasetPipelines,
    addConnectionQuery,
    selectConnectionQuery,
    renameConnectionQuery,
    duplicateConnectionQuery,
    deleteConnectionQuery,
  } = useWorkbenchStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Rename state for Connection Queries
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  if (!isLeftPanelOpen) return null;

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadDataset(file);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const submitRename = (id: string, e?: React.FormEvent | React.MouseEvent) => {
    e?.stopPropagation();
    if (renameValue.trim()) {
      renameConnectionQuery(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none z-10 h-[calc(100vh-3.5rem)]">
      {/* Top Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Data & Connections
          </h2>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Upload new CSV or Excel file"
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors"
        >
          <Plus size={13} />
          <span>Upload</span>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".csv,.xlsx,.xls,.parquet"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* Compact Upload Drop Zone */}
      <div className="p-2.5 border-b border-slate-800/70">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <UploadCloud
              size={16}
              className={dragOver ? 'text-emerald-400' : 'text-slate-400'}
            />
            <span className="text-xs font-medium text-slate-200">
              {isUploading ? 'Ingesting...' : 'Drop CSV / XLSX or Browse'}
            </span>
          </div>
        </div>

        <button
          onClick={loadSamples}
          disabled={isUploading}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium transition-all"
        >
          <Sparkles size={12} />
          <span>Load Sample Orders & Customers</span>
        </button>
      </div>

      {/* Scrollable Content: Connections & Queries + Datasets & Sheets */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-4">
        {/* SECTION 1: CONNECTIONS & QUERIES */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1.5">
            <div className="flex items-center gap-1.5">
              <GitBranch size={13} className="text-sky-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Connections & Queries
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/15 text-sky-400 font-mono">
                {queries.length}
              </span>
            </div>
            {selectedDataset && (
              <button
                onClick={() => addConnectionQuery(selectedDataset.id)}
                title={`Add "${selectedDataset.name}" to Connections & Queries`}
                className="text-[10px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition-colors"
              >
                <Plus size={11} />
                <span>Add Query</span>
              </button>
            )}
          </div>

          {queries.length === 0 ? (
            <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Add tables to <span className="text-sky-300 font-medium">Connections & Queries</span> to keep applied transformation steps safe when switching tables.
              </p>
              {selectedDataset && (
                <button
                  onClick={() => addConnectionQuery(selectedDataset.id)}
                  className="mt-2 w-full py-1 px-2.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                >
                  <Link2 size={12} />
                  <span>Connect "{selectedDataset.name}"</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {queries.map((q) => {
                const isActive = activeQueryId === q.id;
                const enabledStepsCount = q.steps.filter((s) => s.enabled).length;
                return (
                  <div
                    key={q.id}
                    onClick={() => selectConnectionQuery(q.id)}
                    className={`group p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-100 shadow-sm'
                        : 'bg-slate-950/40 hover:bg-slate-800/60 border-slate-800/70 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <GitBranch
                          size={14}
                          className={`shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-500'}`}
                        />
                        {renamingId === q.id ? (
                          <div
                            className="flex items-center gap-1 flex-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename(q.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              autoFocus
                              className="w-full bg-slate-950 border border-sky-500/50 rounded px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none"
                            />
                            <button
                              onClick={(e) => submitRename(q.id, e)}
                              className="p-0.5 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(null);
                              }}
                              className="p-0.5 text-slate-400 hover:text-slate-200"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold truncate">{q.name}</span>
                        )}
                      </div>

                      {renamingId !== q.id && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={(e) => startRename(q.id, q.name, e)}
                            title="Rename query"
                            className="p-1 text-slate-400 hover:text-amber-400 rounded"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateConnectionQuery(q.id);
                            }}
                            title="Duplicate query with all steps"
                            className="p-1 text-slate-400 hover:text-sky-400 rounded"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConnectionQuery(q.id);
                            }}
                            title="Remove query connection"
                            className="p-1 text-slate-400 hover:text-rose-400 rounded"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-1 pl-5 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate max-w-[120px]" title={`Source: ${q.datasetName}`}>
                        Table: {q.datasetName}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded font-mono shrink-0 ${
                          enabledStepsCount > 0
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {enabledStepsCount} {enabledStepsCount === 1 ? 'step' : 'steps'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: DATASETS & SHEETS */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1.5">
            <div className="flex items-center gap-1.5">
              <Database size={13} className="text-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Datasets & Sheets
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 font-mono">
                {datasets.length}
              </span>
            </div>
          </div>

          {datasets.length === 0 ? (
            <div className="text-center py-6 px-3 text-slate-500 bg-slate-950/30 rounded-xl border border-slate-800/50">
              <FolderOpen size={28} className="mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">No datasets loaded yet.</p>
              <p className="text-[11px] mt-0.5 text-slate-600 mb-2.5">
                Upload a file or load sample data to begin.
              </p>
              <button
                onClick={loadSamples}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-600/30 transition-all"
              >
                <Sparkles size={12} />
                <span>Load Sample Data</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {datasets.map((ds) => {
                const isSelected = selectedDataset?.id === ds.id;
                const linkedQueries = queries.filter((q) => q.datasetId === ds.id);
                const savedPipeline = datasetPipelines[ds.id];
                const savedStepCount =
                  linkedQueries.length > 0
                    ? Math.max(...linkedQueries.map((q) => q.steps.length), 0)
                    : savedPipeline?.steps?.length || 0;

                return (
                  <div
                    key={ds.id}
                    onClick={() => selectDataset(ds.id)}
                    className={`group flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/60 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {ds.file_format === 'xlsx' || ds.file_format === 'xls' ? (
                        <FileSpreadsheet
                          size={15}
                          className={`shrink-0 ${
                            isSelected ? 'text-emerald-400' : 'text-emerald-500/70'
                          }`}
                        />
                      ) : (
                        <FileText
                          size={15}
                          className={`shrink-0 ${
                            isSelected ? 'text-emerald-400' : 'text-sky-400/70'
                          }`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">{ds.name}</p>
                          {savedStepCount > 0 && (
                            <span
                              title={`${savedStepCount} transformation step(s) saved`}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono shrink-0"
                            >
                              {savedStepCount} {savedStepCount === 1 ? 'step' : 'steps'}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {ds.row_count.toLocaleString()} rows • {ds.column_count} cols
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addConnectionQuery(ds.id);
                        }}
                        title="Add table to Connections & Queries"
                        className="p-1 hover:text-sky-400 text-slate-400 rounded transition-colors"
                      >
                        <Link2 size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete dataset "${ds.name}"?`)) {
                            deleteDataset(ds.id);
                          }
                        }}
                        title="Delete dataset"
                        className="p-1 hover:text-rose-400 text-slate-400 rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight
                        size={13}
                        className={isSelected ? 'text-emerald-400' : 'text-slate-500'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Engine: DuckDB In-Process</span>
        <span className="flex items-center gap-1 text-emerald-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Ready
        </span>
      </div>
    </aside>
  );
};
