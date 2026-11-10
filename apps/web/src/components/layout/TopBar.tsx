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
  MessageSquare,
  Zap,
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
  BarChart3,
  Heading,
  Rows,
  Award,
  Shuffle,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { useAuthStore } from '../../store/authStore';
import { StepType } from '../../types/steps';
import { SHARE_EXPORT_ENABLED } from '../../config/features';

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
  onOpenDashboard?: () => void;
  onOpenExportShare?: (tab?: 'files' | 'link' | 'history', format?: string) => void;
  onQuickDownload?: (format: 'xlsx_values' | 'csv') => void;
  onOpenDataCleaning?: (tab?: 'duplicates' | 'missing' | 'text' | 'numeric' | 'date') => void;
  onOpenTableOps?: (tab?: 'columns' | 'headers' | 'rows' | 'top_bottom' | 'transpose') => void;
  onOpenFormulaBuilder?: () => void;
  onOpenChatWithData?: () => void;
  onOpenLocalAiSetup?: () => void;
}

type RibbonTabId = 'Home' | 'Transform' | 'Clean' | 'Filter & Sort' | 'Analyse' | 'Formulas' | 'View' | 'Export';

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
  onOpenDashboard,
  onOpenExportShare,
  onQuickDownload,
  onOpenDataCleaning,
  onOpenTableOps,
  onOpenFormulaBuilder,
  onOpenChatWithData,
  onOpenLocalAiSetup,
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
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
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
        name: 'AI Analytics',
        items: [
          {
            id: 'home-chat-data',
            label: 'Chat with Data',
            icon: MessageSquare,
            onClick: () => onOpenChatWithData?.(),
            title: 'Ask questions in natural language and get instant calculations',
            accent: true,
          },
          {
            id: 'home-ai-dashboard',
            label: 'AI Dashboard',
            icon: Sparkles,
            onClick: () => onOpenDashboard?.(),
            title: 'Generate an interactive dashboard from plain text (Native Julius-style)',
            primarySolid: true,
          },
          {
            id: 'home-local-ai',
            label: 'Local AI Setup',
            icon: Zap,
            onClick: () => onOpenLocalAiSetup?.(),
            title: 'Ollama local runtime & model diagnostics',
          },
        ],
      },
      {
        name: 'File & Getting Started',
        items: [
          {
            id: 'home-import',
            label: 'Import File',
            icon: UploadCloud,
            onClick: triggerFileImport,
            title: 'Import / Upload Excel (.xlsx, .xls) or CSV datasets (supports batch multi-file)',
            accent: true,
          },
          {
            id: 'home-samples',
            label: 'Sample Data',
            icon: Sparkles,
            onClick: () => loadSamples(),
            title: 'Load rich multi-table retail sample dataset',
          },
          {
            id: 'home-export',
            label: 'Quick Download',
            icon: Download,
            onClick: () => (onQuickDownload ? onQuickDownload('xlsx_values') : onOpenExport?.()),
            title: 'Instantly download current table as Excel .xlsx',
            primarySolid: true,
          },
        ],
      },
      {
        name: 'Pipeline & Execution',
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
            title: 'Execute complete transformation pipeline across 100% of rows',
            accent: true,
          },
        ],
      },
      {
        name: 'Quick Actions',
        items: [
          {
            id: 'home-formula-builder',
            label: 'Formula Builder',
            icon: Calculator,
            onClick: () => onOpenFormulaBuilder?.(),
            title: 'Guided Formula Builder: Search 50+ Excel functions with live preview',
            accent: true,
          },
          {
            id: 'home-clean-studio',
            label: 'Clean Studio',
            icon: ShieldCheck,
            onClick: () => onOpenDataCleaning?.('duplicates'),
            title: 'Data Hygiene Studio: Duplicates, missing values, text & number cleaning',
          },
          {
            id: 'home-table-ops',
            label: 'Manage Columns',
            icon: Columns,
            onClick: () => onOpenTableOps?.('columns'),
            title: 'Remove, keep, or reorder table columns',
          },
          {
            id: 'home-pivot',
            label: 'PivotTable',
            icon: TableProperties,
            onClick: () => triggerStep('pivot'),
            title: 'Interactive PivotTable Builder',
          },
          {
            id: 'home-xlookup',
            label: 'XLOOKUP',
            icon: GitMerge,
            onClick: () => triggerStep('xlookup'),
            title: 'XLOOKUP across sheets with preview',
          },
        ],
      },
      {
        name: 'Visuals & Models',
        items: [
          {
            id: 'home-dashboard',
            label: 'Dashboard',
            icon: BarChart3,
            onClick: () => onOpenDashboard?.(),
            title: 'Visual Dashboard: 16 chart types, slicers, and KPI scorecards',
            accent: true,
          },
          {
            id: 'home-canvas',
            label: 'Canvas / ER',
            icon: Layers,
            onClick: () => onOpenRelationships?.(),
            title: 'Interactive multi-table entity-relationship canvas',
          },
          {
            id: 'home-quality',
            label: 'Data Quality',
            icon: CheckCircle2,
            onClick: () => onOpenQuality?.(),
            title: 'Data validation rules and schema profiling',
          },
        ],
      },
    ],
    Transform: [
      {
        name: 'Manage Columns',
        items: [
          {
            id: 't-manage-cols',
            label: 'Columns Studio',
            icon: Columns,
            onClick: () => onOpenTableOps?.('columns'),
            title: 'Remove unwanted columns, keep selected, or reorder sequence',
            accent: true,
          },
          {
            id: 't-reorder',
            label: 'Reorder Columns',
            icon: SlidersHorizontal,
            onClick: () => onOpenTableOps?.('columns'),
            title: 'Rearrange column order left-to-right',
          },
          {
            id: 't-rename',
            label: 'Rename Column',
            icon: Type,
            onClick: () => triggerStep('rename_column'),
            title: 'Rename column header cleanly',
          },
          {
            id: 't-change-type',
            label: 'Change Type',
            icon: TableProperties,
            onClick: () => triggerStep('change_type'),
            title: 'Cast column data type (text, number, date, boolean)',
          },
          {
            id: 't-promote',
            label: 'Promote Headers',
            icon: Heading,
            onClick: () => onOpenTableOps?.('headers'),
            title: 'Use values from row #1 as column headers',
          },
        ],
      },
      {
        name: 'Reshape & Structure',
        items: [
          {
            id: 't-split',
            label: 'Split Column',
            icon: Split,
            onClick: () => triggerStep('split_column'),
            title: 'Split text column by delimiter or character position',
          },
          {
            id: 't-pivot',
            label: 'Pivot Table',
            icon: Columns,
            onClick: () => triggerStep('pivot'),
            title: 'Pivot rows into columns with aggregation & totals',
            accent: true,
          },
          {
            id: 't-unpivot',
            label: 'Unpivot Columns',
            icon: ArrowDownUp,
            onClick: () => triggerStep('unpivot'),
            title: 'Melt wide columns into key-value rows',
          },
          {
            id: 't-transpose',
            label: 'Transpose Matrix',
            icon: Shuffle,
            onClick: () => onOpenTableOps?.('transpose'),
            title: 'Rotate table 90 degrees: swap rows and columns',
          },
        ],
      },
      {
        name: 'Combine & Group',
        items: [
          {
            id: 't-join',
            label: 'Join Builder',
            icon: GitMerge,
            onClick: () => triggerStep('join'),
            title: 'Join datasets with Venn diagram, cardinality & join health check',
            accent: true,
          },
          {
            id: 't-append',
            label: 'Append (Union)',
            icon: PlusCircle,
            onClick: () => triggerStep('append'),
            title: 'Stack multiple tables vertically with incremental discriminator',
          },
          {
            id: 't-group',
            label: 'Group By',
            icon: TableProperties,
            onClick: () => triggerStep('group_by'),
            title: 'Aggregate rows by keys (SUM, AVG, MIN, MAX, COUNT)',
          },
        ],
      },
    ],
    Clean: [
      {
        name: 'Cleaning Studio',
        items: [
          {
            id: 'c-studio',
            label: 'Hygiene Studio',
            icon: ShieldCheck,
            onClick: () => onOpenDataCleaning?.('duplicates'),
            title: 'Open dedicated Data Cleaning Studio: duplicates, missing values, text & numeric hygiene',
            accent: true,
          },
        ],
      },
      {
        name: 'Duplicates',
        items: [
          {
            id: 'c-dedupe',
            label: 'Remove Duplicates',
            icon: CopyMinus,
            onClick: () => onOpenDataCleaning?.('duplicates'),
            title: 'Deduplicate on key columns, keep first or last row',
          },
          {
            id: 'c-audit-dedupe',
            label: 'Audit Duplicates',
            icon: Filter,
            onClick: () => onOpenDataCleaning?.('duplicates'),
            title: 'Filter to view only duplicated rows for audit',
          },
        ],
      },
      {
        name: 'Missing & Blanks',
        items: [
          {
            id: 'c-impute',
            label: 'Handle Missing',
            icon: Replace,
            onClick: () => onOpenDataCleaning?.('missing'),
            title: 'Impute missing values using Mean, Median, Mode, or custom value',
          },
          {
            id: 'c-fill',
            label: 'Fill Down / Up',
            icon: ArrowDownUp,
            onClick: () => triggerStep('fill_down'),
            title: 'Propagate adjacent non-blank values up or down',
          },
          {
            id: 'c-remove-blank',
            label: 'Remove Blank Rows',
            icon: Rows,
            onClick: () => onOpenTableOps?.('rows'),
            title: 'Drop rows where all cells are empty or null',
          },
        ],
      },
      {
        name: 'Text Hygiene',
        items: [
          {
            id: 'c-clean-spaces',
            label: 'Clean Spaces',
            icon: Type,
            onClick: () => onOpenDataCleaning?.('text'),
            title: 'Trim leading/trailing spaces and collapse multiple spaces into one',
          },
          {
            id: 'c-standardize',
            label: 'Standardize Values',
            icon: SlidersHorizontal,
            onClick: () => onOpenDataCleaning?.('text'),
            title: 'Category mapping table: map messy spellings to standard names',
          },
          {
            id: 'c-case',
            label: 'Change Case',
            icon: Type,
            onClick: () => triggerStep('text_transform'),
            title: 'Convert to UPPERCASE, lowercase, or Proper Case',
          },
        ],
      },
      {
        name: 'Numbers & Outliers',
        items: [
          {
            id: 'c-clean-num',
            label: 'Clean Currency',
            icon: Calculator,
            onClick: () => onOpenDataCleaning?.('numeric'),
            title: 'Strip $, €, commas, % and convert to pure numbers',
          },
          {
            id: 'c-outliers',
            label: 'Detect Outliers',
            icon: TrendingUp,
            onClick: () => onOpenDataCleaning?.('numeric'),
            title: 'Statistical outlier detection using Interquartile Range (IQR)',
          },
        ],
      },
    ],
    'Filter & Sort': [
      {
        name: 'Filter Data',
        items: [
          {
            id: 'fs-filter',
            label: 'Filter Rows',
            icon: Filter,
            onClick: () => triggerStep('filter_rows'),
            title: 'Filter rows with multi-rule AND/OR conditions',
            accent: true,
          },
        ],
      },
      {
        name: 'Sort Data',
        items: [
          {
            id: 'fs-sort',
            label: 'Sort Rows',
            icon: ArrowUpDown,
            onClick: () => triggerStep('sort_rows'),
            title: 'Multi-column priority sorting (ascending / descending)',
            accent: true,
          },
        ],
      },
      {
        name: 'Top / Bottom Analysis',
        items: [
          {
            id: 'fs-top-bottom',
            label: 'Top / Bottom N',
            icon: Award,
            onClick: () => onOpenTableOps?.('top_bottom'),
            title: 'Filter to the top or bottom N records by metric column',
          },
          {
            id: 'fs-remove-rows',
            label: 'Remove Top/Bottom Rows',
            icon: Rows,
            onClick: () => onOpenTableOps?.('rows'),
            title: 'Remove first N rows, last N rows, or keep a slice',
          },
        ],
      },
    ],
    Analyse: [
      {
        name: 'Summarize & Matrix',
        items: [
          {
            id: 'a-group',
            label: 'Group & Aggregate',
            icon: TableProperties,
            onClick: () => triggerStep('group_by'),
            title: 'Group by categories and compute SUM, AVG, COUNT, MIN, MAX',
            accent: true,
          },
          {
            id: 'a-pivot',
            label: 'PivotTable Matrix',
            icon: Columns,
            onClick: () => triggerStep('pivot'),
            title: 'Multi-dimensional cross-tabulation PivotTable',
            accent: true,
          },
        ],
      },
      {
        name: 'Calculations & Rankings',
        items: [
          {
            id: 'a-window',
            label: 'Window Calculations',
            icon: TrendingUp,
            onClick: () => triggerStep('window_calc'),
            title: 'Running total, moving average, lead/lag differences',
          },
          {
            id: 'a-rank',
            label: 'Rank & Percentile',
            icon: Award,
            onClick: () => triggerStep('window_calc'),
            title: 'Row rank, dense rank, and percentile distribution',
          },
          {
            id: 'a-top-n',
            label: 'Top Performing Records',
            icon: Award,
            onClick: () => onOpenTableOps?.('top_bottom'),
            title: 'Identify top performers by revenue, quantity or score',
          },
          {
            id: 'a-outlier-flag',
            label: 'Flag Outliers',
            icon: ShieldCheck,
            onClick: () => onOpenDataCleaning?.('numeric'),
            title: 'Create TRUE/FALSE anomaly flags for statistical outliers',
          },
        ],
      },
      {
        name: 'Visual Dashboards',
        items: [
          {
            id: 'a-dash',
            label: 'Open Dashboard',
            icon: BarChart3,
            onClick: () => onOpenDashboard?.(),
            title: 'Explore 16 visual chart templates with interactive slicers',
            accent: true,
          },
        ],
      },
    ],
    Formulas: [
      {
        name: 'Formula Builders',
        items: [
          {
            id: 'f-guided-builder',
            label: 'Guided Formula Builder',
            icon: Calculator,
            onClick: () => onOpenFormulaBuilder?.(),
            title: 'Excel Formula Studio: Search 50+ functions with syntax, descriptions & live row preview',
            accent: true,
          },
          {
            id: 'f-custom-col',
            label: 'Custom Column',
            icon: PlusCircle,
            onClick: () => triggerStep('custom_column'),
            title: 'Add a column with a constant value or custom expression',
          },
          {
            id: 'f-conditional',
            label: 'If / Then Logic',
            icon: Sparkles,
            onClick: () => triggerStep('conditional'),
            title: 'Visual IF / IFS / SWITCH rule builder with fallback',
          },
        ],
      },
      {
        name: 'Function Catalog',
        items: [
          {
            id: 'f-math',
            label: 'Math & Rounding',
            icon: Calculator,
            onClick: () => triggerStep('math_transform'),
            title: 'Arithmetic operations, ROUND, ROUNDUP, ABS, percentage change',
          },
          {
            id: 'f-text',
            label: 'Text Functions',
            icon: Type,
            onClick: () => triggerStep('text_transform'),
            title: 'TEXTBEFORE, TEXTAFTER, TRIM, CLEAN, UPPER, LOWER, PROPER, CONCAT',
          },
          {
            id: 'f-date',
            label: 'Date & Time',
            icon: Calendar,
            onClick: () => triggerStep('date_transform'),
            title: 'NETWORKDAYS working days, EOMONTH, EDATE, YEAR, MONTH, DAY',
          },
          {
            id: 'f-xlookup',
            label: 'XLOOKUP',
            icon: GitMerge,
            onClick: () => triggerStep('xlookup'),
            title: 'Modern lookup across sheets in any column direction',
          },
          {
            id: 'f-vlookup',
            label: 'VLOOKUP',
            icon: TableProperties,
            onClick: () => triggerStep('vlookup'),
            title: 'Classic vertical lookup by column index number',
          },
        ],
      },
    ],
    View: [
      {
        name: 'Visuals & Models',
        items: [
          {
            id: 'v-dashboard',
            label: 'Visual Dashboard',
            icon: BarChart3,
            onClick: () => onOpenDashboard?.(),
            title: 'Open interactive Visual Dashboard (16 visual charts & KPI scorecards)',
            accent: true,
          },
          {
            id: 'v-canvas',
            label: 'Relationships / ER',
            icon: Layers,
            onClick: () => onOpenRelationships?.(),
            title: 'Multi-table schema diagram and join relationships',
          },
          {
            id: 'v-quality',
            label: 'Data Quality Rules',
            icon: CheckCircle2,
            onClick: () => onOpenQuality?.(),
            title: 'Inspect data quality rules and schema integrity',
          },
        ],
      },
      {
        name: 'Show / Hide Panes',
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
      {
        name: 'Governance',
        items: [
          {
            id: 'v-templates',
            label: 'Templates',
            icon: LayoutTemplate,
            onClick: () => onOpenTemplates?.(),
          },
          {
            id: 'v-versions',
            label: 'Version History',
            icon: History,
            onClick: () => onOpenVersions?.(),
          },
          {
            id: 'v-audit',
            label: 'Audit Trail',
            icon: Activity,
            onClick: () => onOpenAudit?.(),
          },
        ],
      },
    ],
    Export: [
      {
        name: 'Quick Downloads',
        items: [
          {
            id: 'e-xlsx',
            label: 'Download Excel (.xlsx)',
            icon: Download,
            onClick: () => (onQuickDownload ? onQuickDownload('xlsx_values') : onOpenExport?.()),
            title: 'Download transformed data immediately as Microsoft Excel spreadsheet',
            accent: true,
          },
          {
            id: 'e-csv',
            label: 'Download CSV',
            icon: Download,
            onClick: () => (onQuickDownload ? onQuickDownload('csv') : onOpenExport?.()),
            title: 'Download as comma-separated values (.csv)',
          },
        ],
      },
      {
        name: 'Export & Share Studio',
        items: [
          {
            id: 'e-hub',
            label: 'Export Studio',
            icon: UploadCloud,
            onClick: () => (onOpenExportShare ? onOpenExportShare('files') : onOpenExport?.()),
            title: 'Packaged Workbooks (.sswb.html), Power BI starter pack, Parquet, and PDF reports',
            primarySolid: true,
          },
          {
            id: 'e-run-full',
            label: 'Run Full Pipeline',
            icon: Play,
            onClick: () => (onOpenRunFull ? onOpenRunFull() : onOpenExport?.()),
            title: 'Execute complete data pipeline on 100% full dataset rows',
            accent: true,
          },
        ],
      },
      {
        name: 'Share & Governance',
        items: [
          {
            id: 'e-share',
            label: 'Share Project',
            icon: Share2,
            onClick: () => (onOpenExportShare ? onOpenExportShare('link') : onOpenShare?.()),
            title: 'Share interactive link or embed with stakeholders',
          },
          {
            id: 'e-versions',
            label: 'Snapshots',
            icon: History,
            onClick: () => onOpenVersions?.(),
            title: 'Create and review version snapshots of this workbook',
          },
          {
            id: 'e-audit',
            label: 'Audit Trail',
            icon: Activity,
            onClick: () => onOpenAudit?.(),
            title: 'Review complete changelog and execution history',
          },
        ],
      },
    ],
  };

  const ribbonTabs: RibbonTabId[] = [
    'Home',
    'Transform',
    'Clean',
    'Filter & Sort',
    'Analyse',
    'Formulas',
    'View',
    'Export',
  ];
  const activeGroups = ribbonConfig[activeRibbonTab] || [];

  return (
    <header className="flex flex-col select-none z-40 shrink-0 bg-[#F3F3F3] border-b border-[#D4D4D4]">
      {/* Hidden File Input for Top-Level Import */}
      <input
        type="file"
        ref={topFileInputRef}
        className="hidden"
        accept=".csv,.xlsx,.xls,.parquet"
        multiple
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            for (const file of Array.from(e.target.files)) {
              await uploadDataset(file);
            }
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

            {SHARE_EXPORT_ENABLED ? (
              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={() =>
                    onOpenExportShare ? onOpenExportShare('files') : onOpenExport?.()
                  }
                  title="Download / Export Workbook (.xlsx, .csv, .parquet, PDF, PPTX)"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-white text-[#217346] hover:bg-[#E6F2EB] border-y border-l border-white rounded-l-[2px] transition-colors shadow-sm"
                >
                  <Download size={15} className="shrink-0 stroke-[2.2]" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDownloadMenuOpen(!isDownloadMenuOpen);
                    setIsShareMenuOpen(false);
                  }}
                  title="Download options"
                  aria-label="Download options"
                  className="px-1 py-1 text-xs font-bold bg-white text-[#217346] hover:bg-[#E6F2EB] border border-white rounded-r-[2px] transition-colors shadow-sm"
                >
                  <ChevronDown size={12} />
                </button>

                {isDownloadMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsDownloadMenuOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50 py-1 text-xs text-gray-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDownloadMenuOpen(false);
                          if (onQuickDownload) onQuickDownload('xlsx_values');
                          else if (onOpenExportShare) onOpenExportShare('files', 'xlsx_values');
                          else onOpenExport?.();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                      >
                        <span className="font-medium">Download as XLSX</span>
                        <span className="text-[10px] text-gray-400">values, instant</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDownloadMenuOpen(false);
                          if (onQuickDownload) onQuickDownload('csv');
                          else if (onOpenExportShare) onOpenExportShare('files', 'csv');
                          else onOpenExport?.();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                      >
                        <span className="font-medium">Download as CSV</span>
                        <span className="text-[10px] text-gray-400">instant</span>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsDownloadMenuOpen(false);
                          if (onOpenExportShare) onOpenExportShare('files');
                          else onOpenExport?.();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 font-semibold text-[#217346]"
                      >
                        More options…
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenExport}
                title="Download / Export Workbook (.xlsx, .csv, .parquet, SQL)"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-white text-[#217346] hover:bg-[#E6F2EB] border border-white rounded-[2px] transition-colors shadow-sm"
              >
                <Download size={16} className="shrink-0 stroke-[2.2]" />
                <span>Download</span>
              </button>
            )}
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

        {/* Right: Dashboard, Share, User Menu, Task Pane Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Feature A: Chat with Data */}
          <button
            type="button"
            onClick={onOpenChatWithData}
            title="Chat with Data: Natural language queries executed locally via DuckDB"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[#0078D4] hover:bg-[#106EBE] text-white border border-white/30 rounded-[2px] whitespace-nowrap shrink-0 transition-colors shadow-2xs"
          >
            <MessageSquare size={13} className="shrink-0" />
            <span>Chat with Data</span>
          </button>
          <button
            type="button"
            onClick={onOpenDashboard}
            title="Open Visual Dashboard (Bar, Clustered Bar, Column, Histogram, Donut, Pie, Slicer & KPI Cards)"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[#185C37] hover:bg-[#124629] text-white border border-white/30 rounded-[2px] whitespace-nowrap shrink-0 transition-colors"
          >
            <BarChart3 size={14} className="shrink-0" />
            <span> Visuals</span>
          </button>

          {SHARE_EXPORT_ENABLED ? (
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() =>
                  onOpenExportShare ? onOpenExportShare('link') : onOpenShare?.()
                }
                title="Share project with role-based links or deliverables"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#185C37] hover:bg-[#124629] text-white border-y border-l border-white/25 rounded-l-[2px] whitespace-nowrap shrink-0 transition-colors"
              >
                <Share2 size={14} className="shrink-0" />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsShareMenuOpen(!isShareMenuOpen);
                  setIsDownloadMenuOpen(false);
                }}
                title="Share options"
                aria-label="Share options"
                className="px-1 py-1 text-xs font-medium bg-[#185C37] hover:bg-[#124629] text-white border border-white/25 rounded-r-[2px] whitespace-nowrap shrink-0 transition-colors"
              >
                <ChevronDown size={12} />
              </button>

              {isShareMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsShareMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-50 py-1 text-xs text-gray-800">
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('link');
                        else onOpenShare?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 font-semibold text-[#217346] flex items-center justify-between"
                    >
                      <span>Share link…</span>
                      <span className="text-[10px] text-gray-400">interactive</span>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files', 'xlsx_values');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>Packaged workbook</span>
                      <span className="text-[10px] font-mono text-gray-400">.xlsx</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files', 'pdf');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>PDF</span>
                      <span className="text-[10px] font-mono text-gray-400">.pdf</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files', 'pptx');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>PowerPoint, interactive</span>
                      <span className="text-[10px] font-mono text-gray-400">.pptx</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files', 'csv');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>CSV / Parquet / JSON</span>
                      <span className="text-[10px] text-gray-400">data files</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files', 'powerbi_starter');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>Power BI starter pack</span>
                      <span className="text-[10px] font-mono text-gray-400">.zip</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files', 'share_pack');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <span>Share pack</span>
                      <span className="text-[10px] text-gray-400">all formats, .zip</span>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsShareMenuOpen(false);
                        if (onOpenExportShare) onOpenExportShare('files');
                        else onOpenExport?.();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-600 font-medium"
                    >
                      More options…
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenShare}
              title="Share project with role-based links"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#185C37] hover:bg-[#124629] text-white border border-white/25 rounded-[2px] whitespace-nowrap shrink-0 transition-colors"
            >
              <Share2 size={14} className="shrink-0" />
              <span>Share</span>
            </button>
          )}

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
