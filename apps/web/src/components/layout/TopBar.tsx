import React, { useRef, useState } from 'react';
import {
  Table2,
  Play,
  Download,
  UploadCloud,
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
  Filter,
  ArrowUpDown,
  CopyMinus,
  GitMerge,
  Calculator,
  Sparkles,
  Calendar,
  Type,
  TrendingUp,
  Columns,
  Split,
  Replace,
  ArrowDownUp,
  TableProperties,
  ListTree,
  PlusCircle,
  SlidersHorizontal,
  LayoutTemplate,
  History,
  Activity,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { useAuthStore } from '../../store/authStore';
import { StepType } from '../../types/steps';

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

type RibbonTabId = 'Home' | 'Formulas' | 'Data' | 'Join' | 'Quality' | 'View' | 'Help';

interface RibbonItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  accent?: boolean;
  primarySolid?: boolean;
}

interface RibbonGroup {
  name: string;
  items: RibbonItem[];
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenAuthModal,
  onOpenRelationships,
  onOpenQuality,
  onOpenExport,
  onOpenRunFull,
  onOpenTemplates,
  onOpenVersions,
  onOpenShare,
  onOpenAudit,
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
    openStepWizard,
    setActiveTab,
    loadSamples,
    uploadDataset,
  } = useWorkbenchStore();

  const { user, isAuthenticated, logout } = useAuthStore();
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('Home');
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);
  const topFileInputRef = useRef<HTMLInputElement>(null);

  const handleTabClick = (tab: RibbonTabId) => {
    if (activeRibbonTab === tab && isRibbonCollapsed) {
      setIsRibbonCollapsed(false);
    } else {
      setActiveRibbonTab(tab);
    }
  };

  const handleTabDoubleClick = () => {
    setIsRibbonCollapsed((prev) => !prev);
  };

  const triggerStep = (type: StepType) => {
    openStepWizard(type);
  };

  const triggerFileImport = () => {
    topFileInputRef.current?.click();
  };

  const ribbonConfig: Record<RibbonTabId, RibbonGroup[]> = {
    Home: [
      {
        name: 'Import & Export',
        items: [
          {
            id: 'home-import',
            label: 'Import File',
            icon: UploadCloud,
            onClick: triggerFileImport,
            title: 'Import / Upload Excel (.xlsx) or CSV dataset',
            accent: true,
          },
          {
            id: 'home-export',
            label: 'Export / Download',
            icon: Download,
            onClick: () => onOpenExport?.(),
            title: 'Download spreadsheet with live formulas, CSV, Parquet, or SQL/Polars code',
            primarySolid: true,
          },
        ],
      },
      {
        name: 'Pipeline',
        items: [
          {
            id: 'home-undo',
            label: 'Undo',
            icon: RotateCcw,
            onClick: undo,
            disabled: undoStack.length === 0,
            title: 'Undo step edit (Ctrl+Z)',
          },
          {
            id: 'home-redo',
            label: 'Redo',
            icon: RotateCw,
            onClick: redo,
            disabled: redoStack.length === 0,
            title: 'Redo step edit (Ctrl+Y)',
          },
          {
            id: 'home-run',
            label: 'Run Full',
            icon: Play,
            onClick: () => (onOpenRunFull ? onOpenRunFull() : onOpenExport?.()),
            title: 'Execute pipeline across 100% of rows',
            accent: true,
          },
        ],
      },
      {
        name: 'Sort & Filter',
        items: [
          {
            id: 'home-filter',
            label: 'Filter Rows',
            icon: Filter,
            onClick: () => triggerStep('filter_rows'),
            title: 'Keep or remove rows by visual rule conditions',
          },
          {
            id: 'home-sort',
            label: 'Sort Rows',
            icon: ArrowUpDown,
            onClick: () => triggerStep('sort_rows'),
            title: 'Sort ascending or descending by column',
          },
          {
            id: 'home-dedupe',
            label: 'Deduplicate',
            icon: CopyMinus,
            onClick: () => triggerStep('remove_duplicates'),
            title: 'Remove duplicate rows on key columns',
          },
        ],
      },
      {
        name: 'Formulas & Summary',
        items: [
          {
            id: 'home-xlookup',
            label: 'Lookup & Connect',
            icon: GitMerge,
            onClick: () => triggerStep('xlookup'),
            title: 'XLOOKUP / VLOOKUP across sheets',
          },
          {
            id: 'home-calc',
            label: 'Calculate Column',
            icon: Calculator,
            onClick: () => triggerStep('math_transform'),
            title: 'Create calculated arithmetic or math column',
          },
          {
            id: 'home-if',
            label: 'If / Then Logic',
            icon: Sparkles,
            onClick: () => triggerStep('conditional'),
            title: 'IF / IFS conditional column rules',
          },
          {
            id: 'home-group',
            label: 'Group & Summarize',
            icon: TableProperties,
            onClick: () => triggerStep('group_by'),
            title: 'Group by keys and aggregate (SUM, COUNT, AVG, MIN, MAX)',
          },
        ],
      },
      {
        name: 'Relationships & Quality',
        items: [
          {
            id: 'home-canvas',
            label: 'Canvas / ER',
            icon: Layers,
            onClick: () => onOpenRelationships?.(),
            title: 'Multi-table relationships & ER canvas',
          },
          {
            id: 'home-quality',
            label: 'Data Quality',
            icon: ShieldCheck,
            onClick: () => onOpenQuality?.(),
            title: 'Data integrity & quality rules',
          },
        ],
      },
    ],
    Formulas: [
      {
        name: 'Lookup & Reference',
        items: [
          {
            id: 'f-xlookup',
            label: 'Lookup & Connect',
            icon: GitMerge,
            onClick: () => triggerStep('xlookup'),
            title: 'XLOOKUP / VLOOKUP from another sheet',
          },
          {
            id: 'f-join',
            label: 'Visual Join',
            icon: Layers,
            onClick: () => triggerStep('join'),
            title: 'Join tables with cardinality & key health check',
          },
        ],
      },
      {
        name: 'Function Library',
        items: [
          {
            id: 'f-math',
            label: 'Calculate Column',
            icon: Calculator,
            onClick: () => triggerStep('math_transform'),
            title: 'Arithmetic (+, -, *, /), round, percent change',
          },
          {
            id: 'f-cond',
            label: 'If / Then Logic',
            icon: Sparkles,
            onClick: () => triggerStep('conditional'),
            title: 'Visual IF / IFS / SWITCH builder',
          },
          {
            id: 'f-text',
            label: 'Text Functions',
            icon: Type,
            onClick: () => triggerStep('text_transform'),
            title: 'TRIM, UPPER, LOWER, PROPER, SUBSTRING, CONCAT',
          },
          {
            id: 'f-date',
            label: 'Date & Time',
            icon: Calendar,
            onClick: () => triggerStep('date_transform'),
            title: 'YEAR, MONTH, EOMONTH, DATEDIF, add interval',
          },
          {
            id: 'f-window',
            label: 'Window & Rank',
            icon: TrendingUp,
            onClick: () => triggerStep('window_calc'),
            title: 'Running total, Rank, Moving average, Lag / Lead',
          },
        ],
      },
    ],
    Data: [
      {
        name: 'Get & Export Data',
        items: [
          {
            id: 'd-import',
            label: 'Import File',
            icon: UploadCloud,
            onClick: triggerFileImport,
            accent: true,
          },
          {
            id: 'd-export',
            label: 'Download / Export',
            icon: Download,
            onClick: () => onOpenExport?.(),
            primarySolid: true,
          },
        ],
      },
      {
        name: 'Sort & Filter',
        items: [
          {
            id: 'd-filter',
            label: 'Filter Rows',
            icon: Filter,
            onClick: () => triggerStep('filter_rows'),
          },
          {
            id: 'd-sort',
            label: 'Sort Rows',
            icon: ArrowUpDown,
            onClick: () => triggerStep('sort_rows'),
          },
        ],
      },
      {
        name: 'Data Tools',
        items: [
          {
            id: 'd-dedupe',
            label: 'Remove Duplicates',
            icon: CopyMinus,
            onClick: () => triggerStep('remove_duplicates'),
          },
          {
            id: 'd-type',
            label: 'Change Type',
            icon: Columns,
            onClick: () => triggerStep('change_type'),
          },
          {
            id: 'd-rename',
            label: 'Rename Column',
            icon: Type,
            onClick: () => triggerStep('rename_column'),
          },
          {
            id: 'd-replace',
            label: 'Replace Values',
            icon: Replace,
            onClick: () => triggerStep('replace_values'),
          },
          {
            id: 'd-fill',
            label: 'Fill Down / Up',
            icon: ArrowDownUp,
            onClick: () => triggerStep('fill_down'),
          },
          {
            id: 'd-split',
            label: 'Text to Columns',
            icon: Split,
            onClick: () => triggerStep('split_column'),
          },
        ],
      },
      {
        name: 'Outline & Reshape',
        items: [
          {
            id: 'd-group',
            label: 'Group & Summarize',
            icon: TableProperties,
            onClick: () => triggerStep('group_by'),
          },
          {
            id: 'd-pivot',
            label: 'Pivot Table',
            icon: Columns,
            onClick: () => triggerStep('pivot'),
          },
          {
            id: 'd-unpivot',
            label: 'Unpivot Columns',
            icon: ArrowDownUp,
            onClick: () => triggerStep('unpivot'),
          },
        ],
      },
    ],
    Join: [
      {
        name: 'Combine Queries',
        items: [
          {
            id: 'j-builder',
            label: 'Visual Join Builder',
            icon: GitMerge,
            onClick: () => triggerStep('join'),
            accent: true,
          },
          {
            id: 'j-xlookup',
            label: 'Lookup & Connect',
            icon: Layers,
            onClick: () => triggerStep('xlookup'),
          },
          {
            id: 'j-append',
            label: 'Append / Union',
            icon: PlusCircle,
            onClick: () => triggerStep('append'),
          },
        ],
      },
      {
        name: 'Relationships',
        items: [
          {
            id: 'j-canvas',
            label: 'Canvas / ER',
            icon: Layers,
            onClick: () => onOpenRelationships?.(),
          },
        ],
      },
    ],
    Quality: [
      {
        name: 'Data Integrity',
        items: [
          {
            id: 'q-rules',
            label: 'Quality Rules',
            icon: ShieldCheck,
            onClick: () => onOpenQuality?.(),
            accent: true,
          },
          {
            id: 'q-dedupe',
            label: 'Remove Duplicates',
            icon: CopyMinus,
            onClick: () => triggerStep('remove_duplicates'),
          },
          {
            id: 'q-replace',
            label: 'Clean Nulls',
            icon: Replace,
            onClick: () => triggerStep('replace_values'),
          },
        ],
      },
    ],
    View: [
      {
        name: 'Show Panes',
        items: [
          {
            id: 'v-left',
            label: isLeftPanelOpen ? 'Hide Data Pane' : 'Show Data Pane',
            icon: isLeftPanelOpen ? PanelLeftClose : PanelLeftOpen,
            onClick: toggleLeftPanel,
          },
          {
            id: 'v-right',
            label: isRightPanelOpen ? 'Hide Task Pane' : 'Show Task Pane',
            icon: isRightPanelOpen ? PanelRightClose : PanelRightOpen,
            onClick: toggleRightPanel,
          },
        ],
      },
      {
        name: 'Task Pane Views',
        items: [
          {
            id: 'v-applied',
            label: 'Applied Steps',
            icon: ListTree,
            onClick: () => setActiveTab('applied'),
          },
          {
            id: 'v-catalog',
            label: 'Step Catalog',
            icon: PlusCircle,
            onClick: () => setActiveTab('catalog'),
          },
          {
            id: 'v-details',
            label: 'Step Formulas',
            icon: SlidersHorizontal,
            onClick: () => setActiveTab('details'),
          },
        ],
      },
    ],
    Help: [
      {
        name: 'Demo & Sample Data',
        items: [
          {
            id: 'h-samples',
            label: 'Load Sample Data',
            icon: Sparkles,
            onClick: () => loadSamples(),
            accent: true,
          },
        ],
      },
      {
        name: 'Workbook Governance',
        items: [
          {
            id: 'h-templates',
            label: 'Templates',
            icon: LayoutTemplate,
            onClick: () => onOpenTemplates?.(),
          },
          {
            id: 'h-versions',
            label: 'Versions',
            icon: History,
            onClick: () => onOpenVersions?.(),
          },
          {
            id: 'h-audit',
            label: 'Audit Log',
            icon: Activity,
            onClick: () => onOpenAudit?.(),
          },
        ],
      },
    ],
  };

  const ribbonTabs: RibbonTabId[] = ['Home', 'Formulas', 'Data', 'Join', 'Quality', 'View', 'Help'];
  const activeGroups = ribbonConfig[activeRibbonTab] || [];

  return (
    <header className="flex flex-col select-none z-40 shrink-0 bg-[#F3F3F3] border-b border-[#D4D4D4]">
      {/* Hidden File Input for Top-Level Import */}
      <input
        type="file"
        ref={topFileInputRef}
        className="hidden"
        accept=".csv,.xlsx,.xls,.parquet"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            uploadDataset(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* 1. EXCEL TITLE BAR + QUICK ACCESS TOOLBAR */}
      <div className="h-10 bg-[#217346] text-white px-3 flex items-center justify-between gap-3 min-w-0">
        {/* Left: Sidebar Toggle, Brand & Quick Access Toolbar */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <button
            onClick={toggleLeftPanel}
            title={isLeftPanelOpen ? 'Collapse Data & Connections pane' : 'Expand Data & Connections pane'}
            className="p-1.5 text-white/90 hover:text-white hover:bg-[#185C37] rounded-[2px] transition-colors shrink-0"
          >
            {isLeftPanelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          {/* StepSheet Brand */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-6 h-6 rounded-[2px] bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
              <Table2 className="text-white" size={15} />
            </div>
            <span className="font-bold text-white tracking-tight text-sm whitespace-nowrap">
              StepSheet
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] bg-[#185C37] text-white/95 border border-white/20 whitespace-nowrap">
              Workbench
            </span>
          </div>

          {/* Quick Access Toolbar (Undo / Redo + High-Visibility Import & Download) */}
          <div className="hidden sm:flex items-center gap-1.5 ml-2 pl-2.5 border-l border-white/25 shrink-0">
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-1.5 text-white/90 hover:text-white hover:bg-[#185C37] disabled:opacity-40 disabled:cursor-not-allowed rounded-[2px] transition-colors"
            >
              <RotateCcw size={15} />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-1.5 text-white/90 hover:text-white hover:bg-[#185C37] disabled:opacity-40 disabled:cursor-not-allowed rounded-[2px] transition-colors"
            >
              <RotateCw size={15} />
            </button>

            <button
              type="button"
              onClick={triggerFileImport}
              title="Import CSV or Excel (.xlsx) file"
              className="ml-1 flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-[#185C37] hover:bg-[#124629] text-white border border-white/30 rounded-[2px] transition-colors shadow-sm"
            >
              <UploadCloud size={16} className="shrink-0" />
              <span>Import</span>
            </button>

            <button
              type="button"
              onClick={onOpenExport}
              title="Download / Export Workbook (.xlsx, .csv, .parquet, SQL)"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-white text-[#217346] hover:bg-[#E6F2EB] border border-white rounded-[2px] transition-colors shadow-sm"
            >
              <Download size={16} className="shrink-0 stroke-[2.2]" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* Center: Active Workbook / Dataset Name & Saved State */}
        <div className="hidden md:flex items-center gap-2 min-w-0 truncate text-xs text-white/95 font-medium">
          <span className="truncate font-semibold" title={selectedDataset?.name || 'StepSheet'}>
            {selectedDataset ? selectedDataset.name : 'Book1'}
          </span>
          <span className="text-white/70">—</span>
          <span className="inline-flex items-center gap-1 text-[12px] text-white/90">
            <CheckCircle2 size={12} className="text-white/90 shrink-0" />
            <span>Saved</span>
          </span>
          {selectedDataset && (
            <span className="text-[12px] px-1.5 py-0.2 rounded-[2px] bg-[#185C37] text-white/90 font-mono whitespace-nowrap border border-white/15">
              {totalRows.toLocaleString()} rows • {columns.length} cols
            </span>
          )}
        </div>

        {/* Right: Share, User Menu, Task Pane Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenShare}
            title="Share project with role-based links"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#185C37] hover:bg-[#124629] text-white border border-white/25 rounded-[2px] whitespace-nowrap shrink-0 transition-colors"
          >
            <Share2 size={14} className="shrink-0" />
            <span>Share</span>
          </button>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-1.5 text-xs text-white bg-[#185C37] px-2 py-0.5 rounded-[2px] border border-white/20 whitespace-nowrap shrink-0">
              <div className="w-4 h-4 rounded-[2px] bg-white text-[#217346] flex items-center justify-center text-[11px] font-bold shrink-0">
                {(user.full_name || user.email)[0].toUpperCase()}
              </div>
              <span className="hidden sm:inline font-medium">{user.full_name || user.email}</span>
              <button
                onClick={logout}
                title="Sign Out"
                className="ml-1 text-white/80 hover:text-white transition-colors shrink-0"
              >
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 text-xs font-medium bg-white text-[#217346] hover:bg-[#E6F2EB] px-2.5 py-1 rounded-[2px] transition-colors whitespace-nowrap shrink-0"
            >
              <UserIcon size={13} className="shrink-0" />
              <span>Sign In / Join</span>
            </button>
          )}

          <button
            onClick={toggleRightPanel}
            title={isRightPanelOpen ? 'Collapse Task Pane' : 'Expand Task Pane'}
            className="p-1.5 text-white/90 hover:text-white hover:bg-[#185C37] rounded-[2px] transition-colors shrink-0"
          >
            {isRightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>

      {/* 2. EXCEL RIBBON TAB STRIP */}
      <div className="h-8 bg-[#F3F3F3] border-b border-[#D4D4D4] px-2 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-0.5 h-full">
          {ribbonTabs.map((tab) => {
            const isActive = activeRibbonTab === tab && !isRibbonCollapsed;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleTabClick(tab)}
                onDoubleClick={handleTabDoubleClick}
                className={`h-full px-3 text-[12px] transition-colors relative flex items-center whitespace-nowrap rounded-t-[2px] ${
                  isActive
                    ? 'bg-white text-[#217346] font-semibold border-t border-x border-[#D4D4D4] -mb-px z-10'
                    : 'text-[#444444] hover:text-[#212121] hover:bg-[#E6E6E6] font-normal'
                }`}
              >
                <span>{tab}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1 right-1 h-[2.5px] bg-[#217346]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right of Ribbon Tabs: Quick Status & Collapse Ribbon Chevron */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsRibbonCollapsed((prev) => !prev)}
            title={isRibbonCollapsed ? 'Expand Ribbon' : 'Collapse Ribbon (Double-click tab)'}
            className="p-1 text-[#605E5C] hover:text-[#212121] hover:bg-[#E6E6E6] rounded-[2px] transition-colors"
          >
            {isRibbonCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* 3. EXCEL RIBBON COMMAND GROUPS PANEL */}
      {!isRibbonCollapsed && (
        <div className="bg-white px-2 py-1.5 flex items-stretch gap-1 overflow-x-auto min-h-[76px]">
          {activeGroups.map((group, gIdx) => (
            <div
              key={group.name}
              className={`flex flex-col justify-between px-2 shrink-0 ${
                gIdx < activeGroups.length - 1 ? 'border-r border-[#D4D4D4]' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.onClick}
                      disabled={item.disabled}
                      title={item.title || item.label}
                      className={`group flex flex-col items-center justify-center px-3 py-1.5 min-w-[62px] rounded-[2px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        item.primarySolid
                          ? 'bg-[#217346] hover:bg-[#185C37] active:bg-[#124629] text-white border border-[#185C37] shadow-sm'
                          : item.accent
                          ? 'bg-[#E6F2EB] hover:bg-[#cce5d6] active:bg-[#99cbad] text-[#217346] border border-[#217346]/40'
                          : 'bg-transparent hover:bg-[#E6E6E6] active:bg-[#D2D2D2] text-[#212121] border border-transparent'
                      }`}
                    >
                      <div className="w-8 h-7 flex items-center justify-center shrink-0">
                        <Icon
                          size={item.primarySolid || item.accent ? 24 : 22}
                          className={
                            item.primarySolid
                              ? 'text-white'
                              : item.accent
                              ? 'text-[#217346]'
                              : 'text-[#217346] group-hover:text-[#185C37]'
                          }
                        />
                      </div>
                      <span
                        className={`text-[12px] leading-tight whitespace-nowrap mt-0.5 ${
                          item.primarySolid
                            ? 'font-bold text-white'
                            : item.accent
                            ? 'font-semibold text-[#217346]'
                            : 'font-normal text-[#212121]'
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-[#605E5C] text-center tracking-tight mt-1 select-none">
                {group.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
};
