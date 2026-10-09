import React from 'react';
import {
  X,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Hash,
  Type,
  Calendar,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

export const ColumnProfilePopover: React.FC = () => {
  const { selectedColumnProfile, isLoadingProfile, closeColumnProfile } = useWorkbenchStore();

  if (!selectedColumnProfile && !isLoadingProfile) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <BarChart3 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">
                  {selectedColumnProfile?.column_name || 'Loading column...'}
                </h3>
                {selectedColumnProfile && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedColumnProfile.data_type}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Column profile & distribution analysis</p>
            </div>
          </div>
          <button
            onClick={closeColumnProfile}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        {isLoadingProfile ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs">Computing column profile via DuckDB...</p>
          </div>
        ) : selectedColumnProfile ? (
          <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Total Rows</span>
                <span className="text-sm font-bold text-slate-100 font-mono">
                  {selectedColumnProfile.total_count.toLocaleString()}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Null Values</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span
                    className={`text-sm font-bold font-mono ${
                      selectedColumnProfile.null_count > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {selectedColumnProfile.null_percentage}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({selectedColumnProfile.null_count})
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Distinct Values</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-sm font-bold text-slate-100 font-mono">
                    {selectedColumnProfile.distinct_count.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({selectedColumnProfile.distinct_percentage}%)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Uniqueness</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold mt-0.5">
                  {selectedColumnProfile.is_unique ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle size={12} /> Unique Key
                    </span>
                  ) : (
                    <span className="text-slate-400">Non-unique</span>
                  )}
                </span>
              </div>
            </div>

            {/* Min / Max / Mean / Median for Numeric */}
            {(selectedColumnProfile.min_value !== undefined ||
              selectedColumnProfile.mean_value !== undefined) && (
              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                  Statistical Summary
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Min</span>
                    <span className="font-mono font-medium text-slate-200">
                      {String(selectedColumnProfile.min_value ?? 'N/A')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Max</span>
                    <span className="font-mono font-medium text-slate-200">
                      {String(selectedColumnProfile.max_value ?? 'N/A')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Mean (Average)</span>
                    <span className="font-mono font-medium text-slate-200">
                      {selectedColumnProfile.mean_value !== undefined
                        ? selectedColumnProfile.mean_value
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Median</span>
                    <span className="font-mono font-medium text-slate-200">
                      {selectedColumnProfile.median_value !== undefined
                        ? selectedColumnProfile.median_value
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Histogram (if available) */}
            {selectedColumnProfile.histogram && selectedColumnProfile.histogram.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Distribution Histogram (10 Bins)
                  </h4>
                  <span className="text-[10px] text-slate-500">Value frequency</span>
                </div>

                <div className="h-28 flex items-end gap-1.5 pt-4 pb-2 border-b border-slate-800">
                  {(() => {
                    const maxCount = Math.max(
                      ...selectedColumnProfile.histogram.map((b) => b.count),
                      1
                    );
                    return selectedColumnProfile.histogram.map((bin, i) => {
                      const heightPercent = Math.max((bin.count / maxCount) * 100, 4);
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center h-full justify-end group relative"
                        >
                          {/* Tooltip */}
                          <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-[10px] text-slate-200 px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-10 font-mono">
                            {bin.label}: {bin.count}
                          </div>
                          {/* Bar */}
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className="w-full bg-emerald-500/70 hover:bg-emerald-400 rounded-t transition-all"
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                  <span>{selectedColumnProfile.min_value}</span>
                  <span>{selectedColumnProfile.max_value}</span>
                </div>
              </div>
            )}

            {/* Top Frequent Values */}
            {selectedColumnProfile.top_values && selectedColumnProfile.top_values.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                  Top Frequent Values
                </h4>
                <div className="space-y-2">
                  {selectedColumnProfile.top_values.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-200 truncate max-w-[280px]">
                          {item.value === null ? (
                            <span className="text-slate-500 italic">null</span>
                          ) : (
                            String(item.value)
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {item.count.toLocaleString()} ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={closeColumnProfile}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
