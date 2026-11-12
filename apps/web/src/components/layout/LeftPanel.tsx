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

  const handleFilesUpload = async (files: FileList | File[]) => {
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDataset(file);
      }
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
      handleFilesUpload(e.dataTransfer.files);
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
    // Shadowed on its right edge so the panel reads as sitting above the
    // grid on its own plane, matching the title bar/ribbon depth treatment.
    <aside
      className="w-64 bg-[#F3F3F3] border-r border-[#D4D4D4] flex flex-col shrink-0 select-none z-10 h-full"
      style={{ boxShadow: 'var(--shadow-panel-right)' }}
    >
      {/* Top Header */}
      <div className="h-8 px-3 bg-[#EBEBEB] border-b border-[#D4D4D4] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Database size={13} className="text-[#217346]" />
          <h2 className="text-[11.5px] font-bold text-[#212121] tracking-wide uppercase">
            Queries & Connections
          </h2>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Upload new CSV or Excel file"
          className="px-2 py-0.5 bg-[#217346] hover:bg-[#185C37] text-white rounded-[2px] text-[12px] font-semibold flex items-center gap-1 transition-colors"
          style={{ boxShadow: 'var(--shadow-xs)' }}
        >
          <Plus size={12} />
          <span>Upload</span>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".csv,.xlsx,.xls,.parquet"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesUpload(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Compact Upload Drop Zone */}
      <div className="p-2 border-b border-[#D4D4D4] bg-white">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-[2px] p-2 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-[#217346] bg-[#E6F2EB]'
              : 'border-[#8A8886] hover:border-[#217346] bg-[#F8F8F8] hover:bg-[#E6F2EB]/50'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <UploadCloud
              size={14}
              className={dragOver ? 'text-[#217346]' : 'text-[#605E5C]'}
            />
            <span className="text-[12px] font-medium text-[#212121]">
              {isUploading ? 'Ingesting...' : 'Drop CSV / XLSX or Browse'}
            </span>
          </div>
        </div>

        <button
          onClick={loadSamples}
          disabled={isUploading}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-[2px] bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346]/40 text-[12px] font-semibold transition-colors"
        >
          <Sparkles size={12} />
          <span>Load Sample Orders & Customers</span>
        </button>
      </div>

      {/* Scrollable Content: Connections & Queries + Datasets & Sheets */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3 bg-white">
        {/* SECTION 1: CONNECTIONS & QUERIES */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1">
            <div className="flex items-center gap-1.5">
              <GitBranch size={12} className="text-[#217346]" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#444444]">
                Connections & Queries
              </span>
              <span className="text-[11px] px-1.5 py-0.2 rounded-[2px] bg-[#E6F2EB] text-[#217346] font-mono border border-[#217346]/30">
                {queries.length}
              </span>
            </div>
            {selectedDataset && (
              <button
                onClick={() => addConnectionQuery(selectedDataset.id)}
                title={`Add "${selectedDataset.name}" to Connections & Queries`}
                className="text-[11px] font-medium text-[#217346] hover:bg-[#E6F2EB] flex items-center gap-0.5 px-1.5 py-0.5 rounded-[2px] border border-[#217346]/40 transition-colors"
              >
                <Plus size={11} />
                <span>Add Query</span>
              </button>
            )}
          </div>

          {queries.length === 0 ? (
            <div className="p-2 rounded-[2px] bg-[#F8F8F8] border border-[#D4D4D4] text-center">
              <p className="text-[12px] text-[#605E5C] leading-snug">
                Add tables to <span className="text-[#217346] font-semibold">Connections & Queries</span> to keep applied transformation steps safe when switching tables.
              </p>
              {selectedDataset && (
                <button
                  onClick={() => addConnectionQuery(selectedDataset.id)}
                  className="mt-1.5 w-full py-1 px-2 rounded-[2px] bg-white hover:bg-[#E6F2EB] text-[#217346] border border-[#217346] text-[12px] font-medium flex items-center justify-center gap-1 transition-colors"
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
                    className={`group p-2 rounded-[2px] text-[12px] cursor-pointer transition-colors border ${
                      isActive
                        ? 'bg-[#E6F2EB] border-[#217346] text-[#212121]'
                        : 'bg-[#F8F8F8] hover:bg-[#F3F3F3] border-[#D4D4D4] text-[#212121]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <GitBranch
                          size={13}
                          className={`shrink-0 ${isActive ? 'text-[#217346]' : 'text-[#605E5C]'}`}
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
                              className="w-full bg-white border border-[#217346] rounded-[2px] px-1.5 py-0.5 text-[12px] text-[#212121] focus:outline-none"
                            />
                            <button
                              onClick={(e) => submitRename(q.id, e)}
                              className="p-0.5 text-[#107C10]"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(null);
                              }}
                              className="p-0.5 text-[#605E5C]"
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
                            className="p-1 text-[#605E5C] hover:text-[#217346] rounded-[2px]"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateConnectionQuery(q.id);
                            }}
                            title="Duplicate query with all steps"
                            className="p-1 text-[#605E5C] hover:text-[#217346] rounded-[2px]"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConnectionQuery(q.id);
                            }}
                            title="Remove query connection"
                            className="p-1 text-[#605E5C] hover:text-[#C50F1F] rounded-[2px]"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-1 pl-5 flex items-center justify-between text-[11px] text-[#605E5C]">
                      <span className="truncate max-w-[120px]" title={`Source: ${q.datasetName}`}>
                        Table: {q.datasetName}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded-[2px] font-mono shrink-0 ${
                          enabledStepsCount > 0
                            ? 'bg-[#E6F2EB] text-[#217346] border border-[#217346]/30'
                            : 'bg-[#E6E6E6] text-[#605E5C]'
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
          <div className="flex items-center justify-between px-1 mb-1">
            <div className="flex items-center gap-1.5">
              <Database size={12} className="text-[#217346]" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#444444]">
                Datasets & Sheets
              </span>
              <span className="text-[11px] px-1.5 py-0.2 rounded-[2px] bg-[#E6F2EB] text-[#217346] font-mono border border-[#217346]/30">
                {datasets.length}
              </span>
            </div>
          </div>

          {datasets.length === 0 ? (
            <div className="text-center py-6 px-3 text-[#605E5C] bg-[#F8F8F8] rounded-[2px] border border-[#D4D4D4]">
              <FolderOpen size={24} className="mx-auto mb-1.5 text-[#605E5C]" />
              <p className="text-[12px] font-medium text-[#212121]">No datasets loaded yet.</p>
              <p className="text-[12px] mt-0.5 text-[#605E5C] mb-2.5">
                Upload a file or load sample data to begin.
              </p>
              <button
                onClick={loadSamples}
                className="inline-flex items-center gap-1.5 py-1 px-3 rounded-[2px] bg-[#217346] hover:bg-[#185C37] text-white text-[12px] font-semibold transition-colors"
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
                    className={`group flex items-center justify-between p-2 rounded-[2px] text-[12px] cursor-pointer transition-colors border ${
                      isSelected
                        ? 'bg-[#E6F2EB] border-[#217346] text-[#212121]'
                        : 'bg-white hover:bg-[#F3F3F3] border-[#D4D4D4] text-[#212121]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {ds.file_format === 'xlsx' || ds.file_format === 'xls' ? (
                        <FileSpreadsheet
                          size={14}
                          className="shrink-0 text-[#217346]"
                        />
                      ) : (
                        <FileText
                          size={14}
                          className="shrink-0 text-[#217346]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold truncate">{ds.name}</p>
                          {savedStepCount > 0 && (
                            <span
                              title={`${savedStepCount} transformation step(s) saved`}
                              className="text-[10px] px-1 py-0.2 rounded-[2px] bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 font-mono shrink-0"
                            >
                              {savedStepCount} {savedStepCount === 1 ? 'step' : 'steps'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#605E5C] font-mono mt-0.5">
                          {ds.row_count.toLocaleString()} rows • {ds.column_count} cols
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addConnectionQuery(ds.id);
                        }}
                        title="Add table to Connections & Queries"
                        className="p-1 hover:text-[#217346] text-[#605E5C] rounded-[2px] transition-colors"
                      >
                        <Link2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete dataset "${ds.name}"?`)) {
                            deleteDataset(ds.id);
                          }
                        }}
                        title="Delete dataset"
                        className="p-1 hover:text-[#C50F1F] text-[#605E5C] rounded-[2px] transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                      <ChevronRight
                        size={12}
                        className={isSelected ? 'text-[#217346]' : 'text-[#605E5C]'}
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
      <div className="p-2 border-t border-[#D4D4D4] bg-[#F3F3F3] text-[11px] text-[#605E5C] flex items-center justify-between">
        <span>Engine: DuckDB In-Process</span>
        <span className="flex items-center gap-1 text-[#107C10] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#107C10]"></span>
          Ready
        </span>
      </div>
    </aside>
  );
};
