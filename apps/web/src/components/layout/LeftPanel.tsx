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
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

export const LeftPanel: React.FC = () => {
  const {
    datasets,
    selectedDataset,
    selectDataset,
    uploadDataset,
    deleteDataset,
    isLeftPanelOpen,
  } = useWorkbenchStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none z-10 h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Datasets & Sheets
          </h2>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Upload new file"
          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition-colors"
        >
          <Plus size={16} />
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

      {/* Upload Drop Zone */}
      <div className="p-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
          }`}
        >
          <UploadCloud
            size={24}
            className={`mx-auto mb-1.5 ${dragOver ? 'text-emerald-400' : 'text-slate-400'}`}
          />
          <p className="text-xs font-medium text-slate-200">
            {isUploading ? 'Ingesting with DuckDB...' : 'Upload CSV or XLSX'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Drag & drop or click to browse</p>
        </div>
      </div>

      {/* Datasets List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {datasets.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500">
            <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No datasets loaded yet.</p>
            <p className="text-[11px] mt-1 text-slate-600">
              Upload a file or choose a sample to start building steps.
            </p>
          </div>
        ) : (
          datasets.map((ds) => {
            const isSelected = selectedDataset?.id === ds.id;
            return (
              <div
                key={ds.id}
                onClick={() => selectDataset(ds.id)}
                className={`group flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {ds.file_format === 'xlsx' || ds.file_format === 'xls' ? (
                    <FileSpreadsheet
                      size={16}
                      className={isSelected ? 'text-emerald-400' : 'text-emerald-500/70'}
                    />
                  ) : (
                    <FileText
                      size={16}
                      className={isSelected ? 'text-emerald-400' : 'text-sky-400/70'}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ds.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {ds.row_count.toLocaleString()} rows • {ds.column_count} cols
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <ChevronRight size={14} className={isSelected ? 'text-emerald-400' : 'text-slate-500'} />
                </div>
              </div>
            );
          })
        )}
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
