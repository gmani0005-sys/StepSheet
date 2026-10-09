import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  GitCommit,
  GitCompare,
  RotateCcw,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  PlusCircle,
  Clock,
  User,
  Layers,
} from 'lucide-react';
import { api } from '../../api/client';
import { StepDefinition } from '../../types/steps';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentSteps: StepDefinition[];
  datasetId?: string;
  onRestoreSteps: (steps: StepDefinition[]) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  projectId,
  currentSteps,
  datasetId,
  onRestoreSteps,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'diff' | 'save'>('timeline');
  const [versions, setVersions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New version form
  const [commitMessage, setCommitMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Diff state
  const [fromVer, setFromVer] = useState<number>(1);
  const [toVer, setToVer] = useState<number>(1);
  const [diffReport, setDiffReport] = useState<any | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Restore state
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isOpen && projectId) {
      loadVersions();
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const loadVersions = async () => {
    setIsLoading(true);
    try {
      const data = await api.listVersions(projectId);
      setVersions(data);
      if (data.length >= 2) {
        setFromVer(data[1].version_number);
        setToVer(data[0].version_number);
      } else if (data.length === 1) {
        setFromVer(data[0].version_number);
        setToVer(data[0].version_number);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveVersion = async () => {
    if (!commitMessage.trim()) {
      alert('Please enter a version message.');
      return;
    }
    setIsSaving(true);
    try {
      await api.createVersion(projectId, commitMessage.trim(), currentSteps, datasetId);
      setCommitMessage('');
      await loadVersions();
      setActiveTab('timeline');
    } catch (err: any) {
      alert(`Failed to save version: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleComputeDiff = async () => {
    if (fromVer === toVer) {
      alert('Please select two distinct versions to compare.');
      return;
    }
    setIsLoadingDiff(true);
    try {
      const res = await api.diffVersions(projectId, fromVer, toVer);
      setDiffReport(res);
      setActiveTab('diff');
    } catch (err: any) {
      alert(`Failed to compute diff: ${err.message}`);
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleRestoreVersion = async (v: any) => {
    if (!window.confirm(`Are you sure you want to revert to Version ${v.version_number}?`)) {
      return;
    }
    setIsRestoring(true);
    try {
      await api.restoreVersion(projectId, v.id);
      onRestoreSteps(v.steps_snapshot);
      onClose();
    } catch (err: any) {
      alert(`Failed to restore version: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <History size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Project Versioning & Step Diff</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  {versions.length} Version Milestones
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Track changes across pipeline edits, inspect step parameter diffs, and restore previous states
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

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'timeline'
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Version Timeline ({versions.length})
            </button>
            <button
              onClick={() => setActiveTab('diff')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'diff'
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Step Diff & Comparison
            </button>
            <button
              onClick={() => setActiveTab('save')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'save'
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              + Create Version Snapshot
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {versions.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <GitCommit size={36} className="mx-auto mb-2 opacity-40 text-violet-400" />
                  <p className="text-sm font-medium">No saved version snapshots yet.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click "+ Create Version Snapshot" to save a milestone of your current pipeline.
                  </p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="relative p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl hover:border-violet-500/40 transition-all flex items-start justify-between gap-4"
                    >
                      <div className="absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full bg-violet-600 border-2 border-slate-900" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                            v{v.version_number}
                          </span>
                          <h4 className="font-semibold text-sm text-slate-100">{v.message}</h4>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(v.created_at).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {v.author_email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Layers size={12} />
                            {v.steps_snapshot.length} step(s)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRestoreVersion(v)}
                          disabled={isRestoring}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                        >
                          <RotateCcw size={12} />
                          <span>Revert</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="space-y-4">
              {/* Version Selector Bar */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-medium">Compare:</span>
                  <select
                    value={fromVer}
                    onChange={(e) => setFromVer(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.version_number}>
                        v{v.version_number} — {v.message}
                      </option>
                    ))}
                  </select>
                  <ArrowRight size={14} className="text-slate-500" />
                  <select
                    value={toVer}
                    onChange={(e) => setToVer(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.version_number}>
                        v{v.version_number} — {v.message}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleComputeDiff}
                  disabled={isLoadingDiff || fromVer === toVer}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <GitCompare size={13} />
                  <span>{isLoadingDiff ? 'Diffing...' : 'Compare Steps'}</span>
                </button>
              </div>

              {/* Diff Output */}
              {diffReport ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      +{diffReport.added_count} Added
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      -{diffReport.removed_count} Removed
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      ~{diffReport.modified_count} Modified
                    </span>
                  </div>

                  {diffReport.diff_steps.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                      Pipelines are identical between these two versions.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {diffReport.diff_steps.map((st: any) => (
                        <div
                          key={st.step_id}
                          className={`p-3 rounded-xl border ${
                            st.change_type === 'added'
                              ? 'bg-emerald-950/20 border-emerald-500/30'
                              : st.change_type === 'removed'
                              ? 'bg-rose-950/20 border-rose-500/30'
                              : 'bg-amber-950/20 border-amber-500/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {st.change_type === 'added' ? (
                                <PlusCircle size={15} className="text-emerald-400" />
                              ) : st.change_type === 'removed' ? (
                                <MinusCircle size={15} className="text-rose-400" />
                              ) : (
                                <AlertTriangle size={15} className="text-amber-400" />
                              )}
                              <span className="font-semibold text-xs text-slate-200">
                                {st.label}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                {st.step_type}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                                st.change_type === 'added'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : st.change_type === 'removed'
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {st.change_type}
                            </span>
                          </div>

                          {/* Parameter level modifications */}
                          {st.param_diffs && st.param_diffs.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/60 space-y-1">
                              {st.param_diffs.map((pd: any, pidx: number) => (
                                <div
                                  key={pidx}
                                  className="text-[11px] font-mono flex items-center gap-2 text-slate-400"
                                >
                                  <span className="text-amber-300">{pd.param_key}:</span>
                                  <span className="line-through text-rose-400">
                                    {JSON.stringify(pd.old_value)}
                                  </span>
                                  <ArrowRight size={10} className="text-slate-500" />
                                  <span className="text-emerald-400">
                                    {JSON.stringify(pd.new_value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                  Select two versions above and click "Compare Steps" to inspect changes.
                </div>
              )}
            </div>
          )}

          {activeTab === 'save' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                <h4 className="font-semibold text-slate-100 text-sm">Save Version Milestone</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Create an immutable version snapshot containing the current {currentSteps.length} step pipeline.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Commit Message / Milestone Description
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="e.g. Added Net Revenue calculation and Region breakdown"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveVersion}
                  disabled={isSaving || !commitMessage.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-violet-500/30"
                >
                  <Plus size={14} />
                  <span>{isSaving ? 'Saving...' : 'Commit Version Snapshot'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Versions are immutable and can be safely restored at any time
          </span>
          <button
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
