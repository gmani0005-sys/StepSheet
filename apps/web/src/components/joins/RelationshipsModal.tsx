import React, { useState } from 'react';
import {
  X,
  Database,
  GitBranch,
  Key,
  ArrowRight,
  Plus,
  Layers,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface RelationshipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenJoinBuilder: (leftId?: string, rightId?: string) => void;
}

export const RelationshipsModal: React.FC<RelationshipsModalProps> = ({
  isOpen,
  onClose,
  onOpenJoinBuilder,
}) => {
  const { datasets, selectedDataset, steps } = useWorkbenchStore();

  if (!isOpen) return null;

  // Extract join relationships from pipeline steps
  const joinSteps = steps.filter((s) => s.type === 'join' || s.type === 'xlookup');

  // Detect likely key matches across datasets
  const detectedKeys: Array<{
    leftTable: string;
    leftCol: string;
    rightTable: string;
    rightCol: string;
    type: string;
  }> = [];

  for (let i = 0; i < datasets.length; i++) {
    for (let j = i + 1; j < datasets.length; j++) {
      const d1 = datasets[i];
      const d2 = datasets[j];
      const cols1 = d1.schema_metadata || [];
      const cols2 = d2.schema_metadata || [];

      for (const c1 of cols1) {
        for (const c2 of cols2) {
          const n1 = c1.name.toLowerCase();
          const n2 = c2.name.toLowerCase();
          const isMatch =
            n1 === n2 ||
            (n1.includes('id') && n2.includes('id') && (n1.includes(n2) || n2.includes(n1)));

          if (isMatch) {
            detectedKeys.push({
              leftTable: d1.name,
              leftCol: c1.name,
              rightTable: d2.name,
              rightCol: c2.name,
              type: 'auto-detected',
            });
          }
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Multi-Table Relationships & ER Canvas</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Visual Canvas
                </span>
              </div>
              <p className="text-xs text-slate-400">
                View schemas, detected foreign keys, and multi-table join chains across your project
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Pipeline Chains */}
          {joinSteps.length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <GitBranch size={14} className="text-sky-400" />
                Active Pipeline Joins ({joinSteps.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {joinSteps.map((step) => {
                  const rId = step.params?.right_dataset_id || step.params?.lookup_dataset_id;
                  const rightDs = datasets.find((d) => d.id === rId);
                  return (
                    <div
                      key={step.id}
                      className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-100">{step.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Type: <span className="text-sky-400 font-mono">{step.type}</span> | Target:{' '}
                          <span className="text-emerald-400">{rightDs?.name || 'Dataset'}</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Active
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tables ER Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Database size={14} className="text-emerald-400" />
                Project Datasets ({datasets.length})
              </h4>
              <button
                onClick={() => {
                  onClose();
                  onOpenJoinBuilder();
                }}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-sky-500/20 transition-all"
              >
                <Plus size={13} />
                <span>New Join</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {datasets.map((ds) => {
                const isSelected = ds.id === selectedDataset?.id;
                const cols = ds.schema_metadata || [];

                return (
                  <div
                    key={ds.id}
                    className={`rounded-xl border bg-slate-950/70 p-4 flex flex-col transition-all ${
                      isSelected
                        ? 'border-emerald-500/50 shadow-md shadow-emerald-500/5'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/60 mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            isSelected
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Database size={14} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-100">{ds.name}</span>
                          {isSelected && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-400 font-medium">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {ds.row_count.toLocaleString()} rows
                      </span>
                    </div>

                    {/* Columns List */}
                    <div className="space-y-1.5 flex-1 max-h-48 overflow-y-auto pr-1">
                      {cols.map((col) => {
                        const isKey =
                          col.name.toLowerCase().includes('id') ||
                          col.name.toLowerCase().includes('key');
                        return (
                          <div
                            key={col.name}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-900/60 border border-slate-800/40 text-slate-300"
                          >
                            <span className="flex items-center gap-1.5 font-mono text-[11px] truncate">
                              {isKey && <Key size={11} className="text-amber-400 shrink-0" />}
                              <span>{col.name}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {col.data_type}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Table Actions */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">{cols.length} columns</span>
                      <button
                        onClick={() => {
                          onClose();
                          onOpenJoinBuilder(ds.id);
                        }}
                        className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 hover:underline"
                      >
                        <span>Join this table</span>
                        <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detected Relationships / Suggestions */}
          {detectedKeys.length > 0 && (
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                Detected Key Relationships & Auto-Suggestions
              </h4>
              <p className="text-[11px] text-slate-400 mb-3">
                StepSheet automatically identified candidate join keys across your datasets:
              </p>
              <div className="space-y-2">
                {detectedKeys.slice(0, 5).map((rel, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 font-mono text-slate-300">
                      <span className="text-emerald-400 font-semibold">{rel.leftTable}</span>.
                      <span>{rel.leftCol}</span>
                      <ArrowRight size={12} className="text-slate-500" />
                      <span className="text-sky-400 font-semibold">{rel.rightTable}</span>.
                      <span>{rel.rightCol}</span>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenJoinBuilder();
                      }}
                      className="px-2.5 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-medium transition-all"
                    >
                      Build Join
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            Chain up to 5+ tables into a single reproducible pipeline.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors"
          >
            Close Canvas
          </button>
        </div>
      </div>
    </div>
  );
};
