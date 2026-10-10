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
  ShieldCheck,
  LogOut,
  User as UserIcon,
  Share2,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { useAuthStore } from '../../store/authStore';

interface TopBarProps {
  onOpenAuthModal?: () => void;
  onOpenRelationships?: () => void;
  onOpenQuality?: () => void;
  onOpenExport?: () => void;
  onOpenRunFull?: () => void;
  onOpenTemplates?: () => void;
  onOpenVersions?: () => void;
  onOpenShare?: () => void;
  onOpenAudit?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenAuthModal,
  onOpenRelationships,
  onOpenQuality,
  onOpenExport,
  onOpenRunFull,
  onOpenShare,
}) => {
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
  } = useWorkbenchStore();

  const { user, isAuthenticated, logout } = useAuthStore();

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none z-40 relative gap-4 min-w-0">
      {/* Left Section: Brand & Active Dataset Metadata */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <button
          onClick={toggleLeftPanel}
          title={isLeftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors shrink-0"
        >
          {isLeftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <Table2 className="text-white" size={18} />
          </div>
          <div className="flex items-center">
            <span className="font-bold text-slate-100 tracking-tight text-base whitespace-nowrap">StepSheet</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
              Workbench
            </span>
          </div>
        </div>

        {selectedDataset && (
          <div className="hidden md:flex items-center gap-2 ml-2 pl-3 border-l border-slate-800 shrink-0">
            <span
              className="text-xs font-semibold text-slate-200 truncate max-w-[130px] lg:max-w-[180px] whitespace-nowrap shrink-0"
              title={selectedDataset.name}
            >
              {selectedDataset.name}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono whitespace-nowrap shrink-0 border border-slate-700/50">
              {totalRows.toLocaleString()} rows • {columns.length} cols
            </span>
          </div>
        )}
      </div>

      {/* Center Section: Pipeline Actions & Tools */}
      <div className="hidden lg:flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80 shrink-0 shadow-sm">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo step edit (Ctrl+Z)"
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo step edit (Ctrl+Y)"
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
        >
          <RotateCw size={14} />
        </button>
        <div className="w-px h-4 bg-slate-800 mx-1 shrink-0" />

        <button
          onClick={onOpenRelationships}
          title="Multi-table relationships & ER canvas"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800/80 rounded-lg whitespace-nowrap shrink-0 transition-colors"
        >
          <Layers size={13} className="text-indigo-400 shrink-0" />
          <span>Canvas / ER</span>
        </button>

        <button
          onClick={onOpenQuality}
          title="Data integrity & quality rules"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800/80 rounded-lg whitespace-nowrap shrink-0 transition-colors"
        >
          <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
          <span>Data Quality</span>
        </button>

        <button
          onClick={onOpenRunFull || onOpenExport}
          title="Execute pipeline across 100% of rows"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg whitespace-nowrap shrink-0 transition-colors"
        >
          <Play size={12} className="text-emerald-400 fill-emerald-400 shrink-0" />
          <span>Run Full</span>
        </button>

        <button
          onClick={onOpenExport}
          title="Export spreadsheet with live formulas, code, or pipeline spec"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg whitespace-nowrap shrink-0 transition-colors"
        >
          <Download size={13} className="text-sky-400 shrink-0" />
          <span>Export</span>
        </button>

        <div className="w-px h-4 bg-slate-800 mx-1 shrink-0" />

        <button
          type="button"
          onClick={onOpenShare}
          title="Share project with role-based links"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800/80 rounded-lg whitespace-nowrap shrink-0 transition-colors"
        >
          <Share2 size={13} className="text-sky-400 shrink-0" />
          <span>Share</span>
        </button>
      </div>

      {/* Right Section: User profile & Step Panel toggle */}
      <div className="flex items-center gap-2.5 shrink-0">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/50 px-2.5 py-1 rounded-full border border-slate-700/50 whitespace-nowrap shrink-0">
            <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {(user.full_name || user.email)[0].toUpperCase()}
            </div>
            <span className="hidden sm:inline font-medium">{user.full_name || user.email}</span>
            <button
              onClick={logout}
              title="Sign Out"
              className="ml-1 text-slate-400 hover:text-rose-400 transition-colors shrink-0"
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm shadow-emerald-600/30 whitespace-nowrap shrink-0"
          >
            <UserIcon size={13} className="shrink-0" />
            <span>Sign In / Join</span>
          </button>
        )}

        <button
          onClick={toggleRightPanel}
          title={isRightPanelOpen ? 'Collapse steps panel' : 'Expand steps panel'}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors shrink-0"
        >
          {isRightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
    </header>
  );
};
