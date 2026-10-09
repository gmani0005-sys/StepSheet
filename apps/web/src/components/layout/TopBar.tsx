import React from 'react';
import {
  Table2,
  Play,
  Download,
  RotateCcw,
  RotateCw,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  Database,
  Sparkles,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { useAuthStore } from '../../store/authStore';

interface TopBarProps {
  onOpenAuthModal?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenAuthModal }) => {
  const {
    selectedDataset,
    totalRows,
    columns,
    isLeftPanelOpen,
    isRightPanelOpen,
    toggleLeftPanel,
    toggleRightPanel,
    undo,
    redo,
    undoStack,
    redoStack,
    steps,
  } = useWorkbenchStore();

  const { user, isAuthenticated, logout } = useAuthStore();

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none z-20">
      {/* Left: Brand & Panel Toggles */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleLeftPanel}
          title={isLeftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
        >
          {isLeftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Table2 className="text-white" size={18} />
          </div>
          <div>
            <span className="font-bold text-slate-100 tracking-tight text-base">StepSheet</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Workbench
            </span>
          </div>
        </div>

        {selectedDataset && (
          <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l border-slate-800">
            <span className="text-sm font-medium text-slate-200">{selectedDataset.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {totalRows.toLocaleString()} rows • {columns.length} cols
            </span>
            {steps.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono">
                {steps.filter((s) => s.enabled).length} active step(s)
              </span>
            )}
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Live Preview (Sampled)
            </span>
          </div>
        )}
      </div>

      {/* Center: Pipeline Actions */}
      <div className="hidden lg:flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-lg border border-slate-800/80">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo step edit (Ctrl+Z)"
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
        >
          <RotateCcw size={15} />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo step edit (Ctrl+Y)"
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
        >
          <RotateCw size={15} />
        </button>
        <div className="w-px h-4 bg-slate-800 mx-1" />
        <button
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded transition-colors"
          onClick={() => alert(`Running full pipeline (${steps.length} steps) across complete dataset.`)}
        >
          <Play size={13} className="text-emerald-400 fill-emerald-400" />
          <span>Run Full</span>
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded transition-colors"
          onClick={() => alert('Exporting will generate Excel with live formulas, Power Query M, SQL, and Polars in Phase 6.')}
        >
          <Download size={13} className="text-sky-400" />
          <span>Export</span>
        </button>
      </div>

      {/* Right: User profile & Step Panel toggle */}
      <div className="flex items-center gap-3">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/50 px-2.5 py-1 rounded-full border border-slate-700/50">
            <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">
              {(user.full_name || user.email)[0].toUpperCase()}
            </div>
            <span className="hidden sm:inline font-medium">{user.full_name || user.email}</span>
            <button
              onClick={logout}
              title="Sign Out"
              className="ml-1 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm shadow-emerald-600/30"
          >
            <UserIcon size={13} />
            <span>Sign In / Join</span>
          </button>
        )}

        <button
          onClick={toggleRightPanel}
          title={isRightPanelOpen ? 'Collapse steps panel' : 'Expand steps panel'}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
        >
          {isRightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
    </header>
  );
};
