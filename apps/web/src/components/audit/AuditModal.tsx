import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Clock,
  User,
  Filter,
  Activity,
  Layers,
  Download,
  Share2,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../../api/client';

interface AuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const AuditModal: React.FC<AuditModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && projectId) {
      loadLogs();
    }
  }, [isOpen, projectId, actionFilter]);

  if (!isOpen) return null;

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const filter = actionFilter === 'all' ? undefined : actionFilter;
      const res = await api.listAuditLogs(projectId, filter);
      const list = res.items || res.logs || [];
      setLogs(list);
      setTotal(res.total ?? list.length);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('version')) {
      return { bg: 'bg-violet-500/10 text-violet-400 border-violet-500/20', icon: Layers };
    }
    if (action.includes('export') || action.includes('download')) {
      return { bg: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: Download };
    }
    if (action.includes('share')) {
      return { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Share2 };
    }
    if (action.includes('template')) {
      return { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Activity };
    }
    if (action.includes('quality')) {
      return { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: ShieldCheck };
    }
    return { bg: 'bg-slate-800 text-slate-300 border-slate-700', icon: FileCheck };
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Activity size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Audit Trail & Governance</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {total} Logged Actions
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Immutable chronological log of who applied, modified, or exported data transformations
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

        {/* Filter Bar */}
        <div className="px-5 pt-2 pb-2.5 border-b border-slate-800 bg-slate-950/30 flex items-center gap-2 text-xs overflow-x-auto shrink-0 chips-scrollbar">
          <span className="text-slate-500 flex items-center gap-1 mr-1">
            <Filter size={12} /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Actions' },
            { id: 'version', label: 'Versions' },
            { id: 'template', label: 'Templates' },
            { id: 'share', label: 'Sharing' },
            { id: 'export', label: 'Exports' },
          ].map((flt) => (
            <button
              key={flt.id}
              onClick={() => setActionFilter(flt.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                actionFilter === flt.id
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {flt.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800 text-xs">
              No audit logs recorded for this category yet.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const badge = getActionBadge(log.action || '');
                const Icon = badge.icon;
                const isExpanded = expandedLogId === log.id;

                return (
                  <div
                    key={log.id}
                    className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg border ${badge.bg}`}>
                          <Icon size={14} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-200 font-mono">
                              {log.action}
                            </span>
                            <span className="text-[10px] text-slate-500 capitalize">
                              ({log.resource_type || 'project'})
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <User size={11} /> {log.actor_email || log.user_email || 'local@stepsheet.app'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={11} />{' '}
                              {new Date(log.timestamp || log.created_at || Date.now()).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {log.details && Object.keys(log.details).length > 0 && (
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="text-xs text-slate-400 hover:text-slate-200 p-1 rounded"
                        >
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      )}
                    </div>

                    {/* Expandable Payload Inspection */}
                    {isExpanded && log.details && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/70">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                          Action Payload Details
                        </span>
                        <pre className="p-2.5 bg-slate-950 rounded-lg text-[11px] font-mono text-amber-300/90 overflow-x-auto border border-slate-800">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Audit logs are append-only and cannot be altered by users
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
