import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  BarChart3,
  BarChartHorizontal,
  PieChart,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Trash2,
  Copy,
  Maximize2,
  Minimize2,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  LayoutGrid,
  Activity,
  Table2,
  Grid,
  Pencil,
  Check,
  Palette,
  Sparkles,
  GripVertical,
  Download,
  Share2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Presentation,
  Database,
  Archive,
  Clock,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { DashboardPaneConfig } from './panes/DashboardPaneWrapper';
import { DashboardFiltersPane } from './panes/DashboardFiltersPane';
import { DashboardVisualizationsPane } from './panes/DashboardVisualizationsPane';
import { DashboardDataPane } from './panes/DashboardDataPane';
import { SHARE_EXPORT_ENABLED } from '../../config/features';
import { ExportShareModal } from '../export_share/ExportShareModal';
import { AiDashboardPromptBar } from './AiDashboardPromptBar';
import { LocalAiSetupModal } from '../ai/LocalAiSetupModal';
import {
  exportShareApi,
  DashboardExportData,
  DashboardExportKpi,
  DashboardExportVisual,
} from '../../api/exportShareApi';

export type CustomVisualType =
  | 'bar'
  | 'clustered_bar'
  | 'column'
  | 'clustered_column'
  | 'stacked_column'
  | 'histogram'
  | 'donut'
  | 'pie'
  | 'line_area'
  | 'stacked_area'
  | 'waterfall'
  | 'gauge'
  | 'funnel'
  | 'treemap'
  | 'table'
  | 'matrix';

export type VisualAggType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct';

export type PaletteId =
  | 'v22'
  | 'classic'
  | 'excel'
  | 'ocean'
  | 'sunset'
  | 'royal'
  | 'forest'
  | 'berry'
  | 'slate';

export type ConditionalFormatMode = 'none' | 'color_scale' | 'data_bars' | 'rules';

export type ColorScalePreset =
  | 'green_yellow_red'
  | 'red_yellow_green'
  | 'white_emerald'
  | 'white_blue'
  | 'blue_white_red';

export interface ConditionalFormattingConfig {
  mode: ConditionalFormatMode;
  scalePreset: ColorScalePreset;
  dataBarColor: string;
  highThreshold: number;
  lowThreshold: number;
  highColor: string;
  midColor: string;
  lowColor: string;
  showIcons: boolean;
}

export interface DashboardKpiConfig {
  id: string;
  title: string;
  column: string;
  aggFunc: VisualAggType;
  subtitle: string;
  accentColor: string;
  // Once the user edits the title directly, further column/aggregation
  // changes must stop overwriting it — mirrors DashboardVisualConfig's
  // customTitle flag below.
  customTitle?: boolean;
  // Power BI-style "General"/"Title" format-pane depth, mirroring
  // DashboardVisualConfig's equivalent fields so KPI cards get the same
  // typography and background/border controls as chart visuals.
  titleFontSize?: number;
  titleColor?: string;
  titleAlign?: 'left' | 'center' | 'right';
  titleBold?: boolean;
  showBorder?: boolean;
  borderColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
}

export type LegendPositionType =
  | 'top_left'
  | 'top'
  | 'top_right'
  | 'left'
  | 'left_center'
  | 'right'
  | 'right_center'
  | 'bottom_left'
  | 'bottom'
  | 'bottom_right'
  | 'hide';

export type DataLabelPositionType = 'inside_end' | 'outside_end' | 'inside_center';

export type DataLabelContentType = 'totals_only' | 'totals_and_percentage';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface AlignmentGuide {
  id: string;
  orientation: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
  label?: string;
}

export interface DashboardVisualConfig {
  id: string;
  title: string;
  customTitle?: boolean;
  type: CustomVisualType;
  categoryCol: string;
  valueCol: string;
  seriesCol: string;
  tableCols?: string[];
  aggFunc: VisualAggType;
  bins: number;
  topN: number;
  sortBy: 'value_desc' | 'value_asc' | 'category_asc';
  showDataLabels: boolean;
  dataLabelPosition?: DataLabelPositionType;
  dataLabelContent?: DataLabelContentType;
  span: 1 | 2;
  x?: number;
  y?: number;
  zIndex?: number;
  locked?: boolean;
  hidden?: boolean;
  customWidth?: number;
  customHeight?: number;
  paletteId?: PaletteId;
  legendPosition?: LegendPositionType;
  customColors?: Record<string, string>;
  customLegendLabels?: Record<string, string>;
  conditionalFormatting?: ConditionalFormattingConfig;
  // Power BI-style "General"/"Title" format-pane depth: per-visual
  // background, border and title typography, independent of the
  // dashboard-wide palette/theme.
  showTitle?: boolean;
  titleFontSize?: number;
  titleColor?: string;
  titleAlign?: 'left' | 'center' | 'right';
  titleBold?: boolean;
  showBorder?: boolean;
  borderColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
}

export interface DashboardPageConfig {
  id: string;
  name: string;
  datasetId?: string;
  queryId?: string | null;
  dashboardTitle: string;
  visuals: DashboardVisualConfig[];
  kpiCards: DashboardKpiConfig[];
  slicerColumns: string[];
  paletteId: PaletteId;
}

export interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExportShare?: (tab?: 'files' | 'link' | 'history', format?: string) => void;
}

const COLOR_PALETTES: Record<PaletteId, { name: string; colors: string[] }> = {
  v22: {
    name: 'Dashboard V22 (Glassmorphism)',
    colors: ['#0D9488', '#FB923C', '#10B981', '#F43F5E', '#0284C7', '#8B5CF6', '#F59E0B', '#34D399'],
  },
  classic: {
    name: 'Classic Analytics',
    colors: ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#744EC2', '#D9B300', '#D64550'],
  },
  excel: {
    name: 'Excel Emerald',
    colors: ['#217346', '#107C10', '#00B294', '#2B88D8', '#FFB900', '#D83B01', '#8764B8', '#004E8C'],
  },
  ocean: {
    name: 'Ocean Breeze',
    colors: ['#0284C7', '#0EA5E9', '#38BDF8', '#0D9488', '#14B8A6', '#2563EB', '#4F46E5', '#6366F1'],
  },
  sunset: {
    name: 'Executive Warm',
    colors: ['#EA580C', '#F97316', '#EF4444', '#EAB308', '#EC4899', '#8B5CF6', '#06B6D4', '#10B981'],
  },
  royal: {
    name: 'Royal Violet & Teal',
    colors: ['#7C3AED', '#9333EA', '#C026D3', '#0D9488', '#2563EB', '#DB2777', '#4F46E5', '#059669'],
  },
  forest: {
    name: 'Forest & Gold',
    colors: ['#15803D', '#16A34A', '#CA8A04', '#D97706', '#0F766E', '#65A30D', '#B45309', '#0369A1'],
  },
  berry: {
    name: 'Crimson & Rose',
    colors: ['#BE123C', '#E11D48', '#F43F5E', '#9333EA', '#FB7185', '#D97706', '#4F46E5', '#0284C7'],
  },
  slate: {
    name: 'Monochrome Pro',
    colors: ['#1E293B', '#334155', '#475569', '#64748B', '#0F766E', '#217346', '#0369A1', '#94A3B8'],
  },
};

const VISUAL_TYPES: Array<{
  type: CustomVisualType;
  label: string;
  shortLabel: string;
  desc: string;
}> = [
  {
    type: 'bar',
    label: 'Bar Chart',
    shortLabel: 'Bar',
    desc: 'Horizontal bars comparing metric across categories',
  },
  {
    type: 'clustered_bar',
    label: 'Clustered Bar Chart',
    shortLabel: 'Clustered Bar',
    desc: 'Side-by-side horizontal bars grouped by Legend / Series',
  },
  {
    type: 'column',
    label: 'Column Chart',
    shortLabel: 'Column',
    desc: 'Vertical columns comparing categories',
  },
  {
    type: 'clustered_column',
    label: 'Clustered Column Chart',
    shortLabel: 'Clustered Col',
    desc: 'Side-by-side vertical columns split by Legend / Series',
  },
  {
    type: 'stacked_column',
    label: 'Stacked Column Chart',
    shortLabel: 'Stacked Col',
    desc: 'Vertical columns stacked by Legend / Series contribution',
  },
  {
    type: 'histogram',
    label: 'Histogram Distribution',
    shortLabel: 'Histogram',
    desc: 'Automatic numeric frequency bins with mean indicator',
  },
  {
    type: 'donut',
    label: 'Donut Chart',
    shortLabel: 'Donut',
    desc: 'Proportional ring slices with center Grand Total KPI',
  },
  {
    type: 'pie',
    label: 'Pie Chart',
    shortLabel: 'Pie',
    desc: 'Classic circular share breakdown by category',
  },
  {
    type: 'line_area',
    label: 'Line & Area Trend',
    shortLabel: 'Line / Area',
    desc: 'Continuous trend line with shaded area gradient',
  },
  {
    type: 'stacked_area',
    label: 'Stacked Area Chart',
    shortLabel: 'Stacked Area',
    desc: 'Cumulative multi-series area trend breakdown over time or categories',
  },
  {
    type: 'waterfall',
    label: 'Waterfall Chart (Bridge)',
    shortLabel: 'Waterfall',
    desc: 'Variance bridge chart showing positive/negative changes and cumulative totals',
  },
  {
    type: 'gauge',
    label: 'Radial Gauge / KPI Meter',
    shortLabel: 'Gauge',
    desc: 'Arc progress meter comparing current performance against goal/target',
  },
  {
    type: 'funnel',
    label: 'Funnel Pipeline Visual',
    shortLabel: 'Funnel',
    desc: 'Conversion pipeline stages with drop-off percentages and retention tracking',
  },
  {
    type: 'treemap',
    label: 'Treemap Hierarchy',
    shortLabel: 'Treemap',
    desc: 'Proportional area blocks sized by metric weight',
  },
  {
    type: 'table',
    label: 'Table Visual',
    shortLabel: 'Table',
    desc: 'Formatted summary & detail table with totals and conditional formatting',
  },
  {
    type: 'matrix',
    label: 'Matrix Table Visual',
    shortLabel: 'Matrix Table',
    desc: 'Cross-tabulated Rows × Columns matrix with totals and heatmap formatting',
  },
];

const DEFAULT_CF: ConditionalFormattingConfig = {
  mode: 'none',
  scalePreset: 'red_yellow_green',
  dataBarColor: '#217346',
  highThreshold: 500,
  lowThreshold: 100,
  highColor: '#107C10',
  midColor: '#D97706',
  lowColor: '#C50F1F',
  showIcons: true,
};

const STORAGE_KEY_DASHBOARDS = 'stepsheet_dashboards_v3';

const DEFAULT_TILE_W = 480;
const DEFAULT_TILE_H = 320;
const DEFAULT_TILE_GAP = 16;
const CANVAS_GRID_SIZE = 8;
const SNAP_GUIDE_THRESHOLD = 6;

export function getRowVal(
  row: Record<string, any> | undefined | null,
  colName: string | undefined | null
): any {
  if (!row || !colName) return undefined;
  if (row[colName] !== undefined) return row[colName];

  const colLower = colName.toLowerCase().trim();
  const colClean = colLower.replace(/[\s_\-]/g, '');

  const keys = Object.keys(row);
  for (const k of keys) {
    if (k.toLowerCase().trim() === colLower) return row[k];
  }
  for (const k of keys) {
    if (k.toLowerCase().replace(/[\s_\-]/g, '') === colClean) return row[k];
  }
  for (const k of keys) {
    const kClean = k.toLowerCase().replace(/[\s_\-]/g, '');
    if (kClean.includes(colClean) || colClean.includes(kClean)) {
      return row[k];
    }
  }
  return undefined;
}

export const layoutVisualsFlow = (
  list: DashboardVisualConfig[]
): DashboardVisualConfig[] => {
  let curY = 16;
  let curCol = 0;
  let rowMaxH = DEFAULT_TILE_H;

  return list.map((v, idx) => {
    const isSpan2 = v.span === 2 || v.type === 'table' || v.type === 'matrix' || (typeof v.customWidth === 'number' && v.customWidth > 600);
    const tileW = isSpan2 ? 976 : (v.customWidth || DEFAULT_TILE_W);
    const tileH = v.customHeight || (isSpan2 ? 340 : DEFAULT_TILE_H);

    if (
      typeof v.x === 'number' &&
      Number.isFinite(v.x) &&
      v.x >= 0 &&
      typeof v.y === 'number' &&
      Number.isFinite(v.y) &&
      v.y >= 0
    ) {
      return {
        ...v,
        span: isSpan2 ? 2 : 1,
        customWidth: tileW,
        customHeight: tileH,
        zIndex: typeof v.zIndex === 'number' && Number.isFinite(v.zIndex) ? v.zIndex : idx + 1,
      };
    }

    let x = 16;
    let y = curY;

    if (isSpan2) {
      if (curCol === 1) {
        curY += rowMaxH + DEFAULT_TILE_GAP;
        y = curY;
        curCol = 0;
        rowMaxH = DEFAULT_TILE_H;
      }
      x = 16;
      curY += tileH + DEFAULT_TILE_GAP;
      rowMaxH = DEFAULT_TILE_H;
      curCol = 0;
    } else {
      if (curCol === 0) {
        x = 16;
        curCol = 1;
        rowMaxH = Math.max(rowMaxH, tileH);
      } else {
        x = 16 + DEFAULT_TILE_W + DEFAULT_TILE_GAP;
        rowMaxH = Math.max(rowMaxH, tileH);
        curY += rowMaxH + DEFAULT_TILE_GAP;
        curCol = 0;
        rowMaxH = DEFAULT_TILE_H;
      }
    }

    return {
      ...v,
      x,
      y,
      span: isSpan2 ? 2 : 1,
      customWidth: tileW,
      customHeight: tileH,
      zIndex: typeof v.zIndex === 'number' && Number.isFinite(v.zIndex) ? v.zIndex : idx + 1,
    };
  });
};

const ensureVisualCanvasCoords = (
  list: DashboardVisualConfig[]
): DashboardVisualConfig[] => {
  return layoutVisualsFlow(list);
};

const computeSnapAndGuides = (
  rawX: number,
  rawY: number,
  w: number,
  h: number,
  movingIds: string[],
  allVisuals: DashboardVisualConfig[],
  snapGridEnabled: boolean
): { x: number; y: number; guides: AlignmentGuide[] } => {
  let snappedX = snapGridEnabled
    ? Math.round(rawX / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
    : Math.round(rawX);
  let snappedY = snapGridEnabled
    ? Math.round(rawY / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
    : Math.round(rawY);

  const guides: AlignmentGuide[] = [];
  const movingSet = new Set(movingIds);
  const others = allVisuals.filter((v) => !movingSet.has(v.id));

  let snappedXByGuide = false;
  let snappedYByGuide = false;

  for (const other of others) {
    const ox = other.x ?? 16;
    const oy = other.y ?? 16;
    const ow = other.customWidth || (other.span === 2 ? 976 : DEFAULT_TILE_W);
    const oh = other.customHeight || DEFAULT_TILE_H;

    const otherXPoints = [ox, ox + ow / 2, ox + ow];
    const movingXOffsets = [0, w / 2, w];

    if (!snappedXByGuide) {
      for (const op of otherXPoints) {
        for (const mOff of movingXOffsets) {
          const candidateX = op - mOff;
          if (Math.abs(rawX - candidateX) <= SNAP_GUIDE_THRESHOLD) {
            snappedX = Math.round(candidateX);
            snappedXByGuide = true;
            guides.push({
              id: `v-${other.id}-${Math.round(op)}`,
              orientation: 'vertical',
              position: Math.round(op),
              start: Math.max(0, Math.min(snappedY, oy) - 12),
              end: Math.max(snappedY + h, oy + oh) + 12,
              label: `${Math.round(op)}px`,
            });
            break;
          }
        }
        if (snappedXByGuide) break;
      }
    }

    const otherYPoints = [oy, oy + oh / 2, oy + oh];
    const movingYOffsets = [0, h / 2, h];

    if (!snappedYByGuide) {
      for (const op of otherYPoints) {
        for (const mOff of movingYOffsets) {
          const candidateY = op - mOff;
          if (Math.abs(rawY - candidateY) <= SNAP_GUIDE_THRESHOLD) {
            snappedY = Math.round(candidateY);
            snappedYByGuide = true;
            guides.push({
              id: `h-${other.id}-${Math.round(op)}`,
              orientation: 'horizontal',
              position: Math.round(op),
              start: Math.max(0, Math.min(snappedX, ox) - 12),
              end: Math.max(snappedX + w, ox + ow) + 12,
              label: `${Math.round(op)}px`,
            });
            break;
          }
        }
        if (snappedYByGuide) break;
      }
    }
  }

  return {
    x: Math.max(0, snappedX),
    y: Math.max(0, snappedY),
    guides,
  };
};

export const DashboardModal: React.FC<DashboardModalProps> = ({
  isOpen,
  onClose,
  onOpenExportShare,
}) => {
  const {
    datasets,
    selectedDataset,
    selectDataset,
    queries,
    activeQueryId,
    selectConnectionQuery,
    columns,
    rows,
    allRows,
    steps,
  } = useWorkbenchStore();

  const [visuals, setVisuals] = useState<DashboardVisualConfig[]>([]);
  const [kpiCards, setKpiCards] = useState<DashboardKpiConfig[]>([]);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [selectedVisualIds, setSelectedVisualIds] = useState<string[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const [paletteId, setPaletteId] = useState<PaletteId>('v22');
  const [dashboardTitle, setDashboardTitle] = useState<string>('');

  // Export & Share State inside Dashboard
  const [isExportShareOpen, setIsExportShareOpen] = useState(false);
  const [exportShareTab, setExportShareTab] = useState<'files' | 'link' | 'history'>('files');
  const [exportShareFormat, setExportShareFormat] = useState<string>('xlsx_values');
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [copiedLinkFeedback, setCopiedLinkFeedback] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  // Which slicer's value-picker dropdown is open (column name), compact
  // button-and-popover pattern instead of spreading every value out as an
  // inline chip row — keeps the filter bar to one line per few slicers so
  // more filter columns fit without the bar eating vertical space.
  const [openSlicerDropdown, setOpenSlicerDropdown] = useState<string | null>(null);
  const [slicerSearchText, setSlicerSearchText] = useState('');
  const slicerDropdownRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLocalAiSetupOpen, setIsLocalAiSetupOpen] = useState(false);

  const toggleFullScreen = () => {
    setIsFullScreen((prev) => {
      const next = !prev;
      if (next) {
        if (!document.fullscreenElement && modalContainerRef.current?.requestFullscreen) {
          modalContainerRef.current.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullScreen();
      } else if (e.key === 'Escape' && isFullScreen) {
        e.preventDefault();
        toggleFullScreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullScreen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setIsShareMenuOpen(false);
      }
      if (slicerDropdownRef.current && !slicerDropdownRef.current.contains(e.target as Node)) {
        setOpenSlicerDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleOpenExport = (tab: 'files' | 'link' | 'history' = 'files', format: string = 'xlsx_values') => {
    setIsDownloadMenuOpen(false);
    setIsShareMenuOpen(false);
    if (onOpenExportShare) {
      onOpenExportShare(tab, format);
    } else {
      setExportShareTab(tab);
      setExportShareFormat(format);
      setIsExportShareOpen(true);
    }
  };



  // Power BI-Style Side Panes State (Filters | Visualizations | Data)
  const [paneFilters, setPaneFilters] = useState<DashboardPaneConfig>(() => {
    try {
      const stored = localStorage.getItem('stepsheet_dashboard_panes_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.filters) return parsed.filters;
      }
    } catch {}
    return { state: 'open', w: 260 };
  });

  const [paneVisualizations, setPaneVisualizations] = useState<DashboardPaneConfig>(() => {
    try {
      const stored = localStorage.getItem('stepsheet_dashboard_panes_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.visualizations) return parsed.visualizations;
      }
    } catch {}
    return { state: 'open', w: 320 };
  });

  const [paneData, setPaneData] = useState<DashboardPaneConfig>(() => {
    try {
      const stored = localStorage.getItem('stepsheet_dashboard_panes_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.data) return parsed.data;
      }
    } catch {}
    return { state: 'open', w: 260 };
  });

  const [activeVisTab, setActiveVisTab] = useState<'build' | 'format' | 'theme'>('build');

  useEffect(() => {
    try {
      localStorage.setItem(
        'stepsheet_dashboard_panes_v2',
        JSON.stringify({
          filters: paneFilters,
          visualizations: paneVisualizations,
          data: paneData,
        })
      );
    } catch {}
  }, [paneFilters, paneVisualizations, paneData]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setPaneFilters((prev) => ({
            ...prev,
            state: prev.state === 'open' ? 'collapsed' : 'open',
          }));
        } else if (e.key === '2') {
          e.preventDefault();
          setPaneVisualizations((prev) => ({
            ...prev,
            state: prev.state === 'open' ? 'collapsed' : 'open',
          }));
        } else if (e.key === '3') {
          e.preventDefault();
          setPaneData((prev) => ({
            ...prev,
            state: prev.state === 'open' ? 'collapsed' : 'open',
          }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Multi-Page Dashboard State (Page 1, Page 2, ... with inline rename & top sheet/query selector)
  const [pages, setPages] = useState<DashboardPageConfig[]>([]);
  const [activePageId, setActivePageId] = useState<string>('page_1');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageNameDraft, setEditingPageNameDraft] = useState<string>('');
  const pendingSheetSwitchForPageRef = useRef<string | null>(null);
  const switchingToPageRef = useRef<string | null>(null);

  // Canvas Snapping, Zoom, Alignment Guides & Undo/Redo History
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const snapToGridRef = useRef<boolean>(true);
  snapToGridRef.current = snapToGrid;

  const [canvasZoom, setCanvasZoom] = useState<number>(100);
  const canvasZoomRef = useRef<number>(100);
  canvasZoomRef.current = canvasZoom;

  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [undoStack, setUndoStack] = useState<DashboardVisualConfig[][]>([]);
  const [redoStack, setRedoStack] = useState<DashboardVisualConfig[][]>([]);

  const visualsRef = useRef<DashboardVisualConfig[]>([]);
  visualsRef.current = visuals;
  const selectedVisualIdsRef = useRef<string[]>([]);
  selectedVisualIdsRef.current = selectedVisualIds;
  const selectedVisualIdRef = useRef<string | null>(null);
  selectedVisualIdRef.current = selectedVisualId;

  // Inline Title Editing State on Canvas Cards
  const [editingTitleVisId, setEditingTitleVisId] = useState<string | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState<string>('');

  // 8-Way Mouse Resize State & Refs
  const [resizingVisId, setResizingVisId] = useState<string | null>(null);
  const resizeSessionRef = useRef<{
    visId: string;
    dir: ResizeDirection;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startW: number;
    startH: number;
    hasMoved: boolean;
    snapshot: DashboardVisualConfig[];
  } | null>(null);

  // Press-and-Hold Canvas Drag & Place/Align State & Refs
  const [hoverDragVisId, setHoverDragVisId] = useState<string | null>(null);
  const [hoverTargetVisId, setHoverTargetVisId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSessionRef = useRef<{
    primaryVisId: string;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
    initialRects: Record<string, { x: number; y: number; w: number; h: number }>;
    snapshot: DashboardVisualConfig[];
  } | null>(null);

  // Multi-Slicer State: array of active slicer columns + map of column -> selected values
  const [slicerColumns, setSlicerColumns] = useState<string[]>([]);
  const [multiSlicerSelections, setMultiSlicerSelections] = useState<Record<string, string[]>>({});
  const [crossFilter, setCrossFilter] = useState<{ column: string; value: string } | null>(null);

  const sourceRows = useMemo(() => {
    return Array.isArray(allRows) && allRows.length > 0
      ? allRows
      : Array.isArray(rows)
      ? rows
      : [];
  }, [allRows, rows]);

  const getSmartDefaults = () => {
    const numericCols = columns.filter((c) =>
      ['integer', 'float', 'number', 'decimal', 'currency'].includes(
        String(c.data_type || '').toLowerCase()
      )
    );
    const textCols = columns.filter(
      (c) =>
        !['integer', 'float', 'number', 'decimal', 'currency'].includes(
          String(c.data_type || '').toLowerCase()
        )
    );

    const cat1 =
      textCols.find((c) => /region|country|city|department|segment/i.test(c.name))?.name ||
      textCols[0]?.name ||
      columns[0]?.name ||
      '';
    const cat2 =
      textCols.find((c) => c.name !== cat1 && /category|status|tier|type|channel/i.test(c.name))
        ?.name ||
      textCols[1]?.name ||
      columns[1]?.name ||
      cat1;
    const val1 =
      numericCols.find((c) => /amount|revenue|sales|total|price|cost/i.test(c.name))?.name ||
      numericCols[0]?.name ||
      columns[columns.length - 1]?.name ||
      '';
    const val2 = numericCols.find((c) => c.name !== val1)?.name || val1;

    return { cat1, cat2, val1, val2 };
  };

  const buildDefaultKpiCards = (): DashboardKpiConfig[] => {
    const { cat1, val1, val2 } = getSmartDefaults();
    return [
      {
        id: 'kpi_1',
        title: `Total ${val1 || 'Value'} (SUM)`,
        column: val1,
        aggFunc: 'sum',
        subtitle: 'Cumulative total across active rows',
        accentColor: '#217346',
      },
      {
        id: 'kpi_2',
        title: `Average ${val1 || 'Value'} (AVG)`,
        column: val1,
        aggFunc: 'avg',
        subtitle: 'Per record mean value',
        accentColor: '#0EA5E9',
      },
      {
        id: 'kpi_3',
        title: `Peak ${val2 || val1 || 'Value'} (MAX)`,
        column: val2 || val1,
        aggFunc: 'max',
        subtitle: 'Highest single record value',
        accentColor: '#D97706',
      },
      {
        id: 'kpi_4',
        title: `Distinct ${cat1 || 'Categories'}`,
        column: cat1,
        aggFunc: 'distinct',
        subtitle: 'Unique category groups',
        accentColor: '#7C3AED',
      },
    ];
  };

  const pushUndoSnapshot = (snapshot: DashboardVisualConfig[]) => {
    const copy = JSON.parse(JSON.stringify(snapshot)) as DashboardVisualConfig[];
    setUndoStack((prev) => [...prev.slice(-29), copy]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousState = prevUndo[prevUndo.length - 1];
      const currentSnapshot = JSON.parse(
        JSON.stringify(visualsRef.current)
      ) as DashboardVisualConfig[];
      setRedoStack((prevRedo) => [...prevRedo, currentSnapshot]);
      setVisuals(previousState);
      return prevUndo.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextState = prevRedo[prevRedo.length - 1];
      const currentSnapshot = JSON.parse(
        JSON.stringify(visualsRef.current)
      ) as DashboardVisualConfig[];
      setUndoStack((prevUndo) => [...prevUndo.slice(-29), currentSnapshot]);
      setVisuals(nextState);
      return prevRedo.slice(0, -1);
    });
  };

  const buildDefaultVisuals = (): DashboardVisualConfig[] => {
    const { cat1, cat2, val1 } = getSmartDefaults();
    return ensureVisualCanvasCoords([
      {
        id: 'vis_1',
        title: `${val1 || 'Value'} by ${cat1 || 'Category'} (Column Chart)`,
        type: 'column',
        categoryCol: cat1,
        valueCol: val1,
        seriesCol: cat2,
        aggFunc: 'sum',
        bins: 8,
        topN: 10,
        sortBy: 'value_desc',
        showDataLabels: true,
        span: 1,
        legendPosition: 'top',
        customColors: {},
        customLegendLabels: {},
        conditionalFormatting: { ...DEFAULT_CF },
      },
      {
        id: 'vis_2',
        title: `Share of ${val1 || 'Value'} by ${cat1 || 'Category'} (Donut)`,
        type: 'donut',
        categoryCol: cat1,
        valueCol: val1,
        seriesCol: cat2,
        aggFunc: 'sum',
        bins: 8,
        topN: 8,
        sortBy: 'value_desc',
        showDataLabels: true,
        span: 1,
        legendPosition: 'top',
        customColors: {},
        customLegendLabels: {},
        conditionalFormatting: { ...DEFAULT_CF },
      },
      {
        id: 'vis_3',
        title: `Clustered ${val1 || 'Value'} by ${cat1 || 'Category'} & ${cat2 || 'Series'}`,
        type: 'clustered_bar',
        categoryCol: cat1,
        valueCol: val1,
        seriesCol: cat2,
        aggFunc: 'sum',
        bins: 8,
        topN: 8,
        sortBy: 'value_desc',
        showDataLabels: true,
        span: 1,
        legendPosition: 'top',
        customColors: {},
        customLegendLabels: {},
        conditionalFormatting: { ...DEFAULT_CF },
      },
      {
        id: 'vis_4',
        title: `${val1 || 'Value'} Distribution (Histogram)`,
        type: 'histogram',
        categoryCol: cat1,
        valueCol: val1,
        seriesCol: cat2,
        aggFunc: 'count',
        bins: 8,
        topN: 10,
        sortBy: 'category_asc',
        showDataLabels: true,
        span: 1,
        legendPosition: 'top',
        customColors: {},
        customLegendLabels: {},
        conditionalFormatting: { ...DEFAULT_CF },
      },
    ]);
  };

  // Load or initialize dashboard when dataset or columns change
  useEffect(() => {
    if (!isOpen || columns.length === 0) return;

    // If we switched dataset/query because the user switched between Page 1 / Page 2 tabs,
    // keep the target page's visuals & pages array intact.
    if (switchingToPageRef.current) {
      switchingToPageRef.current = null;
      return;
    }

    const dsKey = selectedDataset?.id || 'default';
    const colNames = columns.map((c) => c.name);
    const { cat1, cat2 } = getSmartDefaults();
    const entityCol = columns.find(
      (c) =>
        /customer|client|account|product|item|user/i.test(c.name) &&
        !c.name.toLowerCase().endsWith('_id') &&
        c.name.toLowerCase() !== 'id'
    )?.name;
    const defaultSlicers = [cat1, cat2, entityCol].filter(
      (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i
    );

    // If the user explicitly changed the Active Sheet or Connection/Query dropdown on the current page,
    // bind the newly selected sheet/query to the active page while preserving all other pages.
    if (pendingSheetSwitchForPageRef.current) {
      const targetPageId = pendingSheetSwitchForPageRef.current;
      pendingSheetSwitchForPageRef.current = null;
      const defaultVisuals = buildDefaultVisuals();
      const defaultKpis = buildDefaultKpiCards();
      const activeQueryObj = queries.find((q) => q.id === activeQueryId);
      const sourceLabel = activeQueryObj
        ? activeQueryObj.name
        : selectedDataset?.name || 'Executive';
      const currentPageObj = pages.find((p) => p.id === targetPageId);
      const nextTitle =
        currentPageObj && currentPageObj.id !== 'page_1'
          ? `${sourceLabel} Dashboard - ${currentPageObj.name}`
          : `${sourceLabel} Dashboard`;

      setPages((prev) =>
        prev.map((p) =>
          p.id === targetPageId
            ? {
                ...p,
                datasetId: selectedDataset?.id,
                queryId: activeQueryId,
                dashboardTitle: nextTitle,
                visuals: defaultVisuals,
                kpiCards: defaultKpis,
                slicerColumns: defaultSlicers,
              }
            : p
        )
      );
      setDashboardTitle(nextTitle);
      setVisuals(defaultVisuals);
      setKpiCards(defaultKpis);
      setSlicerColumns(defaultSlicers);
      setMultiSlicerSelections({});
      setCrossFilter(null);
      setUndoStack([]);
      setRedoStack([]);
      const firstId = defaultVisuals[0]?.id || null;
      setSelectedVisualId(firstId);
      setSelectedVisualIds(firstId ? [firstId] : []);
      setSelectedKpiId(null);
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARDS);
      const parsed = raw ? JSON.parse(raw) : {};
      const saved = parsed[dsKey] || (dsKey !== 'default' ? parsed['default'] : null);
      const colNamesLower = colNames.map((c) => c.toLowerCase().trim());
      const isSavedValid =
        saved &&
        Array.isArray(saved.visuals) &&
        saved.visuals.length > 0 &&
        saved.visuals.some((v: DashboardVisualConfig) => {
          const cat = (v.categoryCol || '').toLowerCase().trim();
          const val = (v.valueCol || '').toLowerCase().trim();
          return colNamesLower.includes(cat) || colNamesLower.includes(val) || !v.categoryCol;
        });

      if (isSavedValid) {
        const loadedPalette: PaletteId =
          saved.paletteId && COLOR_PALETTES[saved.paletteId as PaletteId]
            ? (saved.paletteId as PaletteId)
            : 'v22';
        const loadedTitle =
          typeof saved.dashboardTitle === 'string'
            ? saved.dashboardTitle
            : `${selectedDataset?.name || 'Executive'} Dashboard`;
        const normalizedVisuals = ensureVisualCanvasCoords(saved.visuals);
        const loadedKpis =
          Array.isArray(saved.kpiCards) && saved.kpiCards.length > 0
            ? saved.kpiCards
            : buildDefaultKpiCards();
        const loadedSlicers =
          Array.isArray(saved.slicerColumns) && saved.slicerColumns.length > 0
            ? saved.slicerColumns.filter((c: string) => colNames.includes(c))
            : defaultSlicers;

        if (Array.isArray(saved.pages) && saved.pages.length > 0) {
          const sanitizedPages: DashboardPageConfig[] = saved.pages.map(
            (p: DashboardPageConfig, idx: number) => ({
              id: p.id || `page_${idx + 1}`,
              name: p.name || `Page ${idx + 1}`,
              datasetId: p.datasetId || selectedDataset?.id,
              queryId: p.queryId ?? activeQueryId,
              dashboardTitle: p.dashboardTitle || loadedTitle,
              visuals: ensureVisualCanvasCoords(
                Array.isArray(p.visuals) ? p.visuals : (idx === 0 ? normalizedVisuals : [])
              ),
              kpiCards:
                Array.isArray(p.kpiCards) ? p.kpiCards : (idx === 0 ? loadedKpis : []),
              slicerColumns:
                Array.isArray(p.slicerColumns)
                  ? p.slicerColumns.filter((c: string) => colNames.includes(c))
                  : (idx === 0 ? loadedSlicers : []),
              paletteId:
                p.paletteId && COLOR_PALETTES[p.paletteId as PaletteId]
                  ? p.paletteId
                  : loadedPalette,
            })
          );
          const targetPage =
            sanitizedPages.find((p) => p.id === saved.activePageId) || sanitizedPages[0];
          setPages(sanitizedPages);
          setActivePageId(targetPage.id);
          setPaletteId(targetPage.paletteId);
          setDashboardTitle(targetPage.dashboardTitle);
          setVisuals(targetPage.visuals);
          setKpiCards(targetPage.kpiCards);
          setSlicerColumns(targetPage.slicerColumns);
          const firstId = targetPage.visuals[0]?.id || null;
          setSelectedVisualId(firstId);
          setSelectedVisualIds(firstId ? [firstId] : []);
        } else {
          const page1: DashboardPageConfig = {
            id: 'page_1',
            name: 'Page 1',
            datasetId: selectedDataset?.id,
            queryId: activeQueryId,
            dashboardTitle: loadedTitle,
            visuals: normalizedVisuals,
            kpiCards: loadedKpis,
            slicerColumns: loadedSlicers,
            paletteId: loadedPalette,
          };
          setPages([page1]);
          setActivePageId('page_1');
          setPaletteId(loadedPalette);
          setDashboardTitle(loadedTitle);
          setVisuals(normalizedVisuals);
          setKpiCards(loadedKpis);
          setSlicerColumns(loadedSlicers);
          const firstId = normalizedVisuals[0]?.id || null;
          setSelectedVisualId(firstId);
          setSelectedVisualIds(firstId ? [firstId] : []);
        }
        setUndoStack([]);
        setRedoStack([]);
        setSelectedKpiId(null);
        return;
      }
    } catch {
      // ignore storage errors
    }

    const defaultVisuals = buildDefaultVisuals();
    const defaultKpis = buildDefaultKpiCards();
    const defaultTitle = `${selectedDataset?.name || 'Executive'} Dashboard`;
    const initialPage: DashboardPageConfig = {
      id: 'page_1',
      name: 'Page 1',
      datasetId: selectedDataset?.id,
      queryId: activeQueryId,
      dashboardTitle: defaultTitle,
      visuals: defaultVisuals,
      kpiCards: defaultKpis,
      slicerColumns: defaultSlicers,
      paletteId: 'v22',
    };
    setPages([initialPage]);
    setActivePageId('page_1');
    setDashboardTitle(defaultTitle);
    setVisuals(defaultVisuals);
    setUndoStack([]);
    setRedoStack([]);
    setKpiCards(defaultKpis);
    setSlicerColumns(defaultSlicers);
    setMultiSlicerSelections({});
    const firstId = defaultVisuals[0]?.id || null;
    setSelectedVisualId(firstId);
    setSelectedVisualIds(firstId ? [firstId] : []);
    setSelectedKpiId(null);
  }, [isOpen, selectedDataset?.id, columns]);

  // Sync active page state into pages array & persist dashboard state
  useEffect(() => {
    if (!isOpen || pages.length === 0) return;
    const dsKey = selectedDataset?.id || 'default';
    setPages((prevPages) => {
      const updatedPages =
        prevPages.length === 0
          ? [
              {
                id: activePageId || 'page_1',
                name: 'Page 1',
                datasetId: selectedDataset?.id,
                queryId: activeQueryId,
                dashboardTitle,
                visuals,
                kpiCards,
                slicerColumns,
                paletteId,
              },
            ]
          : prevPages.map((p) =>
              p.id === activePageId
                ? {
                    ...p,
                    datasetId: p.datasetId || selectedDataset?.id,
                    queryId: p.queryId !== undefined ? p.queryId : activeQueryId,
                    dashboardTitle,
                    visuals,
                    kpiCards,
                    slicerColumns,
                    paletteId,
                  }
                : p
            );
      try {
        const raw = localStorage.getItem(STORAGE_KEY_DASHBOARDS);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[dsKey] = {
          pages: updatedPages,
          activePageId,
          visuals,
          kpiCards,
          slicerColumns,
          paletteId,
          dashboardTitle,
        };
        localStorage.setItem(STORAGE_KEY_DASHBOARDS, JSON.stringify(parsed));
      } catch {
        // ignore
      }
      return updatedPages;
    });
  }, [
    visuals,
    kpiCards,
    slicerColumns,
    paletteId,
    dashboardTitle,
    activePageId,
    selectedDataset?.id,
    isOpen,
  ]);

  // Global mousemove, mouseup & keydown handler for 8-way resize, freeform drag with snapping/guides, keyboard nudge & undo/redo
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const resizeSess = resizeSessionRef.current;
      if (resizeSess) {
        const deltaX = e.clientX - resizeSess.startX;
        const deltaY = e.clientY - resizeSess.startY;
        if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
          resizeSess.hasMoved = true;
        }
        let nextLeft = resizeSess.startLeft;
        let nextTop = resizeSess.startTop;
        let nextW = resizeSess.startW;
        let nextH = resizeSess.startH;

        const dir = resizeSess.dir;
        if (dir.includes('e')) {
          nextW = Math.round(Math.max(260, Math.min(1400, resizeSess.startW + deltaX)));
        }
        if (dir.includes('s')) {
          nextH = Math.round(Math.max(220, Math.min(900, resizeSess.startH + deltaY)));
        }
        if (dir.includes('w')) {
          const rawW = resizeSess.startW - deltaX;
          const clampedW = Math.round(Math.max(260, Math.min(1400, rawW)));
          nextLeft = Math.max(0, resizeSess.startLeft + (resizeSess.startW - clampedW));
          nextW = resizeSess.startW + (resizeSess.startLeft - nextLeft);
        }
        if (dir.includes('n')) {
          const rawH = resizeSess.startH - deltaY;
          const clampedH = Math.round(Math.max(220, Math.min(900, rawH)));
          nextTop = Math.max(0, resizeSess.startTop + (resizeSess.startH - clampedH));
          nextH = resizeSess.startH + (resizeSess.startTop - nextTop);
        }

        // Shift on corner handles preserves aspect ratio
        if (e.shiftKey && ['nw', 'ne', 'se', 'sw'].includes(dir)) {
          const ratio = resizeSess.startW / Math.max(1, resizeSess.startH);
          nextH = Math.round(Math.max(220, Math.min(900, nextW / ratio)));
          if (dir.includes('n')) {
            nextTop = Math.max(0, resizeSess.startTop + (resizeSess.startH - nextH));
          }
        }

        // Alt resizes symmetrically from center
        if (e.altKey) {
          const cx = resizeSess.startLeft + resizeSess.startW / 2;
          const cy = resizeSess.startTop + resizeSess.startH / 2;
          nextLeft = Math.max(0, Math.round(cx - nextW / 2));
          nextTop = Math.max(0, Math.round(cy - nextH / 2));
        }

        // Emit alignment guides when resized edges align with other visuals
        const guides: AlignmentGuide[] = [];
        for (const other of visualsRef.current) {
          if (other.id === resizeSess.visId) continue;
          const ox = other.x ?? 16;
          const oy = other.y ?? 16;
          const ow = other.customWidth || (other.span === 2 ? 976 : DEFAULT_TILE_W);
          const oh = other.customHeight || DEFAULT_TILE_H;
          if (Math.abs(nextLeft + nextW - (ox + ow)) <= 4) {
            guides.push({
              id: `rv-${other.id}`,
              orientation: 'vertical',
              position: ox + ow,
              start: Math.min(nextTop, oy) - 8,
              end: Math.max(nextTop + nextH, oy + oh) + 8,
              label: `${ox + ow}px`,
            });
          }
          if (Math.abs(nextTop + nextH - (oy + oh)) <= 4) {
            guides.push({
              id: `rh-${other.id}`,
              orientation: 'horizontal',
              position: oy + oh,
              start: Math.min(nextLeft, ox) - 8,
              end: Math.max(nextLeft + nextW, ox + ow) + 8,
              label: `${oy + oh}px`,
            });
          }
        }
        setAlignmentGuides(guides);

        setVisuals((prev) =>
          prev.map((v) =>
            v.id === resizeSess.visId
              ? {
                  ...v,
                  x: nextLeft,
                  y: nextTop,
                  customWidth: nextW,
                  customHeight: nextH,
                }
              : v
          )
        );
        return;
      }

      const dragSess = dragSessionRef.current;
      if (dragSess) {
        const deltaX = e.clientX - dragSess.startClientX;
        const deltaY = e.clientY - dragSess.startClientY;
        if (!dragSess.hasMoved && Math.hypot(deltaX, deltaY) < 3) {
          return;
        }
        dragSess.hasMoved = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setHoverDragVisId(dragSess.primaryVisId);

        const primaryInit = dragSess.initialRects[dragSess.primaryVisId];
        if (!primaryInit) return;

        const rawPrimaryX = Math.max(0, primaryInit.x + deltaX);
        const rawPrimaryY = Math.max(0, primaryInit.y + deltaY);
        const movingIds = Object.keys(dragSess.initialRects);

        const { x: snappedX, y: snappedY, guides } = computeSnapAndGuides(
          rawPrimaryX,
          rawPrimaryY,
          primaryInit.w,
          primaryInit.h,
          movingIds,
          visualsRef.current,
          snapToGridRef.current && !e.altKey
        );

        const effDX = snappedX - primaryInit.x;
        const effDY = snappedY - primaryInit.y;
        setAlignmentGuides(guides);

        setVisuals((prev) =>
          prev.map((v) => {
            const initRect = dragSess.initialRects[v.id];
            if (!initRect) return v;
            return {
              ...v,
              x: Math.max(0, Math.round(initRect.x + effDX)),
              y: Math.max(0, Math.round(initRect.y + effDY)),
            };
          })
        );
      }
    };

    const handleWindowMouseUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (resizeSessionRef.current) {
        if (resizeSessionRef.current.hasMoved) {
          pushUndoSnapshot(resizeSessionRef.current.snapshot);
          const resizedVis = visualsRef.current.find(
            (v) => v.id === resizeSessionRef.current?.visId
          );
          if (resizedVis) {
            setAriaAnnouncement(
              `${resizedVis.title} resized to W ${resizedVis.customWidth ?? DEFAULT_TILE_W}, H ${resizedVis.customHeight ?? DEFAULT_TILE_H}`
            );
          }
        }
        resizeSessionRef.current = null;
        setResizingVisId(null);
      }
      if (dragSessionRef.current) {
        if (dragSessionRef.current.hasMoved) {
          pushUndoSnapshot(dragSessionRef.current.snapshot);
          const movedVis = visualsRef.current.find(
            (v) => v.id === dragSessionRef.current?.primaryVisId
          );
          if (movedVis) {
            setAriaAnnouncement(
              `${movedVis.title} moved to X ${movedVis.x ?? 16}, Y ${movedVis.y ?? 16}`
            );
          }
        }
        dragSessionRef.current = null;
      }
      setHoverDragVisId(null);
      setHoverTargetVisId(null);
      setAlignmentGuides([]);
    };

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dragSessionRef.current) {
          e.preventDefault();
          const snap = dragSessionRef.current.snapshot;
          dragSessionRef.current = null;
          setVisuals(snap);
          setHoverDragVisId(null);
          setHoverTargetVisId(null);
          setAlignmentGuides([]);
          setAriaAnnouncement('Move cancelled');
          return;
        }
        if (resizeSessionRef.current) {
          e.preventDefault();
          const snap = resizeSessionRef.current.snapshot;
          resizeSessionRef.current = null;
          setResizingVisId(null);
          setVisuals(snap);
          setAlignmentGuides([]);
          setAriaAnnouncement('Resize cancelled');
          return;
        }
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedVisualIds(visualsRef.current.map((v) => v.id));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const activeIds =
          selectedVisualIdsRef.current.length > 0
            ? selectedVisualIdsRef.current
            : selectedVisualIdRef.current
            ? [selectedVisualIdRef.current]
            : [];
        if (activeIds.length === 0) return;

        e.preventDefault();
        const step = e.shiftKey ? 24 : e.altKey ? 1 : CANVAS_GRID_SIZE;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        pushUndoSnapshot(visualsRef.current);
        const activeSet = new Set(activeIds);
        setVisuals((prev) =>
          prev.map((v) =>
            activeSet.has(v.id) && !v.locked
              ? {
                  ...v,
                  x: Math.max(0, (v.x ?? 16) + dx),
                  y: Math.max(0, (v.y ?? 16) + dy),
                }
              : v
          )
        );
        const primaryVis = visualsRef.current.find((v) => v.id === activeIds[0]);
        if (primaryVis && !primaryVis.locked) {
          setAriaAnnouncement(
            `${primaryVis.title} moved to X ${Math.max(0, (primaryVis.x ?? 16) + dx)}, Y ${Math.max(0, (primaryVis.y ?? 16) + dy)}`
          );
        }
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen]);

  const getDistinctValuesForColumn = (col: string): string[] => {
    if (!col) return [];
    const set = new Set<string>();
    sourceRows.forEach((r) => {
      const v = getRowVal(r, col);
      const norm =
        v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
      set.add(norm);
    });
    return Array.from(set).sort();
  };

  const toggleSlicerValue = (col: string, val: string) => {
    setMultiSlicerSelections((prev) => {
      const current = prev[col] || [];
      const exists = current.includes(val);
      const next = exists ? current.filter((item) => item !== val) : [...current, val];
      return {
        ...prev,
        [col]: next,
      };
    });
  };

  const clearColumnSlicer = (col: string) => {
    setMultiSlicerSelections((prev) => ({
      ...prev,
      [col]: [],
    }));
  };

  const handleAddTopSlicer = () => {
    const unusedCol =
      columns.find((c) => !slicerColumns.includes(c.name))?.name || columns[0]?.name || '';
    if (!unusedCol) return;
    if (!slicerColumns.includes(unusedCol)) {
      setSlicerColumns((prev) => [...prev, unusedCol]);
    }
  };

  const handleRemoveTopSlicer = (col: string) => {
    setSlicerColumns((prev) => prev.filter((c) => c !== col));
    setMultiSlicerSelections((prev) => {
      const copy = { ...prev };
      delete copy[col];
      return copy;
    });
  };

  const handleChangeTopSlicerColumn = (oldCol: string, newCol: string) => {
    if (!newCol || oldCol === newCol) return;
    setSlicerColumns((prev) => prev.map((c) => (c === oldCol ? newCol : c)));
    setMultiSlicerSelections((prev) => {
      const copy = { ...prev };
      delete copy[oldCol];
      return copy;
    });
  };

  const filteredRows = useMemo(() => {
    return sourceRows.filter((r) => {
      for (const [col, selectedVals] of Object.entries(multiSlicerSelections)) {
        if (Array.isArray(selectedVals) && selectedVals.length > 0) {
          const cell = getRowVal(r, col);
          const norm =
            cell === null || cell === undefined || String(cell).trim() === ''
              ? '(Blank)'
              : String(cell);
          if (!selectedVals.includes(norm)) return false;
        }
      }
      if (crossFilter) {
        const cell = getRowVal(r, crossFilter.column);
        const norm =
          cell === null || cell === undefined || String(cell).trim() === ''
            ? '(Blank)'
            : String(cell);
        if (norm !== crossFilter.value) {
          // If crossFilter.value is a month or quarter (e.g. 2023-01 or 2023-Q1), match the row date to the period
          let matchesPeriod = false;
          if (/^\d{4}-\d{2}$/.test(crossFilter.value)) {
            const d = new Date(cell);
            if (!isNaN(d.getTime())) {
              const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              matchesPeriod = p === crossFilter.value;
            }
          } else if (/^\d{4}-Q[1-4]$/.test(crossFilter.value)) {
            const d = new Date(cell);
            if (!isNaN(d.getTime())) {
              const q = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
              matchesPeriod = q === crossFilter.value;
            }
          } else if (/^\d{4}$/.test(crossFilter.value)) {
            const d = new Date(cell);
            if (!isNaN(d.getTime())) {
              matchesPeriod = String(d.getFullYear()) === crossFilter.value;
            }
          }
          if (!matchesPeriod) return false;
        }
      }
      return true;
    });
  }, [sourceRows, multiSlicerSelections, crossFilter]);

  if (!isOpen) return null;

  const activeVisual = visuals.find((v) => v.id === selectedVisualId) || visuals[0] || null;
  const activeKpi = kpiCards.find((k) => k.id === selectedKpiId) || null;

  const getVisualPalette = (vis: DashboardVisualConfig): string[] => {
    const pid = vis.paletteId || paletteId;
    return COLOR_PALETTES[pid]?.colors || COLOR_PALETTES.classic.colors;
  };

  const getItemColor = (vis: DashboardVisualConfig, key: string, idx: number): string => {
    if (vis.customColors && vis.customColors[key]) {
      return vis.customColors[key];
    }
    const pal = getVisualPalette(vis);
    return pal[idx % pal.length];
  };

  const getItemLegendLabel = (vis: DashboardVisualConfig, key: string): string => {
    if (vis.customLegendLabels && vis.customLegendLabels[key]) {
      return vis.customLegendLabels[key];
    }
    // Format YYYY-MM to MMM YYYY (e.g. 2023-01 -> Jan 2023)
    if (/^\d{4}-\d{2}$/.test(key)) {
      const [y, m] = key.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(m, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        return `${monthNames[mIdx]} ${y}`;
      }
    }
    // Format YYYY-Q# to Q# YYYY (e.g. 2023-Q1 -> Q1 2023)
    if (/^\d{4}-Q[1-4]$/.test(key)) {
      const [y, q] = key.split('-');
      return `${q} ${y}`;
    }
    return key;
  };

  // Conditional Formatting Color Helper
  const getConditionalFormatStyle = (
    vis: DashboardVisualConfig,
    val: number,
    minVal: number,
    maxVal: number
  ): { bg?: string; text?: string; badge?: string; barPct?: number } => {
    const cf = vis.conditionalFormatting || DEFAULT_CF;
    if (!cf || cf.mode === 'none') return {};

    const span = maxVal === minVal ? 1 : maxVal - minVal;
    const ratio = Math.max(0, Math.min(1, (val - minVal) / span));

    if (cf.mode === 'data_bars') {
      return {
        barPct: Math.max(4, Math.round(ratio * 100)),
        bg: cf.dataBarColor || '#217346',
      };
    }

    if (cf.mode === 'rules') {
      if (val >= cf.highThreshold) {
        return {
          bg: `${cf.highColor || '#107C10'}22`,
          text: cf.highColor || '#107C10',
          badge: cf.showIcons ? '▲' : undefined,
        };
      }
      if (val <= cf.lowThreshold) {
        return {
          bg: `${cf.lowColor || '#C50F1F'}22`,
          text: cf.lowColor || '#C50F1F',
          badge: cf.showIcons ? '▼' : undefined,
        };
      }
      return {
        bg: `${cf.midColor || '#D97706'}22`,
        text: cf.midColor || '#D97706',
        badge: cf.showIcons ? '●' : undefined,
      };
    }

    // Color Scale (Heatmap)
    const preset = cf.scalePreset || 'red_yellow_green';
    if (preset === 'red_yellow_green') {
      if (ratio >= 0.66) return { bg: '#D1FAE5', text: '#065F46' };
      if (ratio >= 0.33) return { bg: '#FEF3C7', text: '#92400E' };
      return { bg: '#FEE2E2', text: '#991B1B' };
    }
    if (preset === 'green_yellow_red') {
      if (ratio >= 0.66) return { bg: '#FEE2E2', text: '#991B1B' };
      if (ratio >= 0.33) return { bg: '#FEF3C7', text: '#92400E' };
      return { bg: '#D1FAE5', text: '#065F46' };
    }
    if (preset === 'white_emerald') {
      const alpha = Math.round(15 + ratio * 75);
      return {
        bg: `rgba(33, 115, 70, ${alpha / 100})`,
        text: ratio > 0.55 ? '#FFFFFF' : '#185C37',
      };
    }
    if (preset === 'white_blue') {
      const alpha = Math.round(15 + ratio * 75);
      return {
        bg: `rgba(17, 141, 255, ${alpha / 100})`,
        text: ratio > 0.55 ? '#FFFFFF' : '#1E3A8A',
      };
    }
    // blue_white_red
    if (ratio >= 0.66) return { bg: '#FEE2E2', text: '#991B1B' };
    if (ratio <= 0.33) return { bg: '#DBEAFE', text: '#1E40AF' };
    return { bg: '#F8FAFC', text: '#334155' };
  };

  const formatNum = (n: number): string => {
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  };

  const computeMetric = (subset: Record<string, any>[], col: string, fn: VisualAggType | string): number => {
    if (!subset || subset.length === 0) return 0;
    const lowerFn = String(fn || 'sum').toLowerCase().trim();
    if (lowerFn === 'count') {
      if (!col) return subset.length;
      const valid = subset.filter((r) => {
        const val = getRowVal(r, col);
        return val !== null && val !== undefined && String(val).trim() !== '';
      });
      return valid.length > 0 ? valid.length : subset.length;
    }
    if (lowerFn === 'distinct' || lowerFn === 'distinct_count' || lowerFn === 'unique') {
      const set = new Set<string>();
      for (const r of subset) {
        const val = getRowVal(r, col);
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          set.add(String(val).trim());
        }
      }
      return set.size;
    }
    const nums: number[] = [];
    for (const r of subset) {
      const val = getRowVal(r, col);
      if (typeof val === 'number') {
        if (!Number.isNaN(val)) nums.push(val);
      } else if (typeof val === 'string') {
        const cleaned = val.replace(/[$€£¥, %]/g, '').trim();
        if (cleaned) {
          const num = Number(cleaned);
          if (!Number.isNaN(num)) nums.push(num);
        }
      }
    }
    if (nums.length === 0) return 0;
    const sum = nums.reduce((a, b) => a + b, 0);
    if (lowerFn === 'sum') return Number(sum.toFixed(2));
    if (lowerFn === 'avg' || lowerFn === 'mean') return Number((sum / nums.length).toFixed(2));
    if (lowerFn === 'min') return Math.min(...nums);
    if (lowerFn === 'max') return Math.max(...nums);
    return Number(sum.toFixed(2));
  };

  const getDashboardExportData = (): DashboardExportData => {
    const dsName = selectedDataset?.name || 'Executive';

    const exportKpis: DashboardExportKpi[] = kpiCards.map((kpi) => {
      const val = computeMetric(filteredRows, kpi.column, kpi.aggFunc);
      return {
        title: kpi.title,
        value: val,
        formattedValue: formatNum(val),
        aggFunc: kpi.aggFunc,
        subtitle: kpi.subtitle,
        column: kpi.column,
      };
    });

    const exportVisuals: DashboardExportVisual[] = visuals.map((vis) => {
      if (vis.type === 'histogram') {
        const nums = filteredRows
          .map((r) => Number(getRowVal(r, vis.valueCol)))
          .filter((n) => !Number.isNaN(n));
        const minVal = nums.length > 0 ? Math.min(...nums) : 0;
        const maxVal = nums.length > 0 ? Math.max(...nums) : 1;
        const binCount = Math.max(3, Math.min(25, vis.bins || 8));
        const span = maxVal === minVal ? 1 : maxVal - minVal;
        const step = span / binCount;
        const buckets = Array.from({ length: binCount }, (_, idx) => {
          const low = minVal + idx * step;
          const high = idx === binCount - 1 ? maxVal : minVal + (idx + 1) * step;
          return {
            category: `${formatNum(low)}–${formatNum(high)}`,
            value: 0,
            count: 0,
          };
        });
        nums.forEach((n) => {
          const idx = Math.min(binCount - 1, Math.max(0, Math.floor((n - minVal) / step)));
          buckets[idx].count += 1;
          buckets[idx].value += 1;
        });
        const total = nums.length || 1;
        return {
          id: vis.id,
          title: vis.title,
          type: vis.type,
          categoryCol: vis.categoryCol || vis.valueCol,
          valueCol: vis.valueCol,
          aggFunc: 'count',
          items: buckets.map((b) => ({
            category: b.category,
            value: b.value,
            percentage: `${((b.count / total) * 100).toFixed(1)}%`,
            count: b.count,
          })),
        };
      }

      // Group rows for standard visuals
      const catMap = new Map<string, Record<string, any>[]>();
      filteredRows.forEach((r) => {
        const raw = getRowVal(r, vis.categoryCol);
        const key =
          raw === null || raw === undefined || String(raw).trim() === '' ? '(Blank)' : String(raw);
        if (!catMap.has(key)) catMap.set(key, []);
        catMap.get(key)!.push(r);
      });

      let items = Array.from(catMap.entries()).map(([category, groupRows]) => ({
        category,
        value: computeMetric(groupRows, vis.valueCol, vis.aggFunc),
        count: groupRows.length,
      }));

      if (vis.sortBy === 'value_desc') items.sort((a, b) => b.value - a.value);
      else if (vis.sortBy === 'value_asc') items.sort((a, b) => a.value - b.value);
      else items.sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }));

      items = items.slice(0, vis.topN || 12);
      const sumVal = items.reduce((acc, x) => acc + Math.max(0, x.value), 0) || 1;

      return {
        id: vis.id,
        title: vis.title,
        type: vis.type,
        categoryCol: vis.categoryCol,
        valueCol: vis.valueCol,
        aggFunc: vis.aggFunc,
        items: items.map((it) => ({
          category: it.category,
          value: it.value,
          percentage: `${((Math.max(0, it.value) / sumVal) * 100).toFixed(1)}%`,
          count: it.count,
        })),
      };
    });

    const colNames =
      columns && columns.length > 0
        ? columns.map((c) => c.name)
        : filteredRows.length > 0
        ? Object.keys(filteredRows[0])
        : [];

    return {
      title: dashboardTitle,
      datasetName: dsName,
      kpis: exportKpis,
      visuals: exportVisuals,
      filteredRowCount: filteredRows.length,
      totalRowCount: selectedDataset?.row_count || filteredRows.length,
      rows: filteredRows,
      columns: colNames,
      steps: steps || [],
    };
  };

  const handlePrintDashboard = () => {
    setIsDownloadMenuOpen(false);
    window.print();
  };

  const handleQuickDownload = async (format: string = 'sswb_html') => {
    setIsDownloadMenuOpen(false);
    try {
      const dData = getDashboardExportData();
      await exportShareApi.downloadDashboard(dData, format);
    } catch (err) {
      console.error('Quick download failed:', err);
      handleOpenExport('files', format);
    }
  };

  // KPI Card Actions
  const handleAddKpiCard = () => {
    const { val1 } = getSmartDefaults();
    const pal = COLOR_PALETTES[paletteId]?.colors || COLOR_PALETTES.classic.colors;
    const newId = `kpi_${Date.now()}`;
    const newKpi: DashboardKpiConfig = {
      id: newId,
      title: `SUM of ${val1 || 'Metric'}`,
      column: val1 || columns[0]?.name || '',
      aggFunc: 'sum',
      subtitle: 'Across active filtered rows',
      accentColor: pal[kpiCards.length % pal.length],
    };
    setKpiCards((prev) => [...prev, newKpi]);
    setSelectedKpiId(newId);
    setSelectedVisualId(null);
  };

  const handleDuplicateKpiCard = (kpi: DashboardKpiConfig) => {
    const newId = `kpi_${Date.now()}`;
    const copy: DashboardKpiConfig = {
      ...kpi,
      id: newId,
      title: `${kpi.title} (Copy)`,
    };
    setKpiCards((prev) => [...prev, copy]);
    setSelectedKpiId(newId);
    setSelectedVisualId(null);
  };

  const handleRemoveKpiCard = (id: string) => {
    setKpiCards((prev) => {
      const next = prev.filter((k) => k.id !== id);
      if (selectedKpiId === id) {
        setSelectedKpiId(null);
      }
      return next;
    });
  };

  const updateActiveKpi = (patch: Partial<DashboardKpiConfig>) => {
    if (!activeKpi) return;
    setKpiCards((prev) =>
      prev.map((k) => {
        if (k.id !== activeKpi.id) return k;
        const next = { ...k, ...patch };
        if (patch.title !== undefined) {
          next.customTitle = true;
        } else if (!next.customTitle && (patch.column || patch.aggFunc)) {
          next.title = `${next.aggFunc.toUpperCase()} of ${next.column}`;
        }
        return next;
      })
    );
  };

  // Visual Tile Actions
  const updateActiveVisual = (patch: Partial<DashboardVisualConfig>) => {
    if (!activeVisual) return;
    setVisuals((prev) =>
      prev.map((v) => {
        if (v.id !== activeVisual.id) return v;
        const next = { ...v, ...patch };
        if (patch.title !== undefined) {
          next.customTitle = true;
        } else if (
          !next.customTitle &&
          (patch.type || patch.categoryCol || patch.valueCol || patch.aggFunc || patch.seriesCol)
        ) {
          const typeMeta = VISUAL_TYPES.find((t) => t.type === next.type);
          if (next.type === 'histogram') {
            next.title = `${next.valueCol} Distribution (${next.bins} Bins)`;
          } else if (next.type === 'matrix') {
            next.title = `Matrix: ${next.aggFunc.toUpperCase()}(${next.valueCol}) by ${next.categoryCol} × ${next.seriesCol}`;
          } else if (next.type === 'table') {
            next.title = `Table: ${next.categoryCol} & ${next.aggFunc.toUpperCase()}(${next.valueCol})`;
          } else if (
            next.type === 'clustered_bar' ||
            next.type === 'clustered_column' ||
            next.type === 'stacked_column'
          ) {
            next.title = `${next.aggFunc.toUpperCase()}(${next.valueCol}) by ${next.categoryCol} & ${next.seriesCol}`;
          } else {
            next.title = `${next.aggFunc.toUpperCase()}(${next.valueCol}) by ${next.categoryCol} (${
              typeMeta?.shortLabel || next.type
            })`;
          }
        }
        return next;
      })
    );
  };

  const updateActiveVisualCF = (cfPatch: Partial<ConditionalFormattingConfig>) => {
    if (!activeVisual) return;
    const currentCf = activeVisual.conditionalFormatting || DEFAULT_CF;
    updateActiveVisual({
      conditionalFormatting: {
        ...currentCf,
        ...cfPatch,
      },
    });
  };

  const handleAddVisual = (type: CustomVisualType = 'column') => {
    const { cat1, cat2, val1 } = getSmartDefaults();
    const newId = `vis_${Date.now()}`;
    const typeMeta = VISUAL_TYPES.find((t) => t.type === type);
    const idx = visuals.length;
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const newVis: DashboardVisualConfig = {
      id: newId,
      title:
        type === 'matrix'
          ? `Matrix: SUM(${val1 || 'Metric'}) by ${cat1 || 'Row'} × ${cat2 || 'Column'}`
          : type === 'table'
          ? `Table: ${cat1 || 'Category'} Summary & Metrics`
          : `${val1 || 'Metric'} by ${cat1 || 'Category'} (${typeMeta?.shortLabel || type})`,
      type,
      categoryCol: cat1,
      valueCol: val1,
      seriesCol: cat2,
      aggFunc: 'sum',
      bins: 8,
      topN: 10,
      sortBy: 'value_desc',
      showDataLabels: true,
      span: type === 'matrix' || type === 'table' ? 2 : 1,
      x: 16 + col * (DEFAULT_TILE_W + DEFAULT_TILE_GAP),
      y: 16 + row * (DEFAULT_TILE_H + DEFAULT_TILE_GAP),
      zIndex: visuals.length + 1,
      legendPosition: 'top',
      customColors: {},
      customLegendLabels: {},
      conditionalFormatting: {
        ...DEFAULT_CF,
        mode: type === 'matrix' || type === 'table' ? 'color_scale' : 'none',
      },
    };
    pushUndoSnapshot(visuals);
    setVisuals((prev) => [...prev, newVis]);
    setSelectedVisualId(newId);
    setSelectedVisualIds([newId]);
    setSelectedKpiId(null);
  };

  const handleDuplicateVisual = (vis: DashboardVisualConfig) => {
    const copyId = `vis_${Date.now()}`;
    const copy: DashboardVisualConfig = {
      ...vis,
      id: copyId,
      title: `${vis.title} (Copy)`,
      customTitle: true,
      x: (vis.x ?? 16) + 24,
      y: (vis.y ?? 16) + 24,
      zIndex: visuals.length + 1,
    };
    pushUndoSnapshot(visuals);
    setVisuals((prev) => [...prev, copy]);
    setSelectedVisualId(copyId);
    setSelectedVisualIds([copyId]);
    setSelectedKpiId(null);
  };

  const handleRemoveVisual = (id: string) => {
    pushUndoSnapshot(visuals);
    setVisuals((prev) => {
      const next = prev.filter((v) => v.id !== id);
      if (selectedVisualId === id) {
        const fallbackId = next[0]?.id || null;
        setSelectedVisualId(fallbackId);
        setSelectedVisualIds(fallbackId ? [fallbackId] : []);
      } else {
        setSelectedVisualIds((prevSel) => prevSel.filter((sid) => sid !== id));
      }
      return next;
    });
  };

  const handleResetDashboard = () => {
    const defaults = buildDefaultVisuals();
    const defaultKpis = buildDefaultKpiCards();
    const { cat1, cat2 } = getSmartDefaults();
    setDashboardTitle(`${selectedDataset?.name || 'Executive'} Dashboard`);
    setVisuals(defaults);
    setUndoStack([]);
    setRedoStack([]);
    setKpiCards(defaultKpis);
    setSlicerColumns([cat1, cat2].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i));
    setMultiSlicerSelections({});
    setCrossFilter(null);
    const firstId = defaults[0]?.id || null;
    setSelectedVisualId(firstId);
    setSelectedVisualIds(firstId ? [firstId] : []);
    setSelectedKpiId(null);
  };

  const handleSwitchSheetOrQuery = async (value: string) => {
    if (!value) return;
    pendingSheetSwitchForPageRef.current = activePageId;
    if (value.startsWith('query:')) {
      const qId = value.replace('query:', '');
      await selectConnectionQuery(qId);
    } else if (value.startsWith('sheet:')) {
      const dsId = value.replace('sheet:', '');
      await selectDataset(dsId);
    } else {
      await selectDataset(value);
    }
  };

  const handleSelectPage = (targetPageId: string) => {
    if (targetPageId === activePageId) return;
    const targetPage = pages.find((p) => p.id === targetPageId);
    if (!targetPage) return;

    setPages((prev) =>
      prev.map((p) =>
        p.id === activePageId
          ? {
              ...p,
              datasetId: p.datasetId || selectedDataset?.id,
              queryId: p.queryId !== undefined ? p.queryId : activeQueryId,
              dashboardTitle,
              visuals,
              kpiCards,
              slicerColumns,
              paletteId,
            }
          : p
      )
    );

    if (targetPage.queryId && targetPage.queryId !== activeQueryId) {
      switchingToPageRef.current = targetPage.id;
      void selectConnectionQuery(targetPage.queryId);
    } else if (targetPage.datasetId && targetPage.datasetId !== selectedDataset?.id) {
      switchingToPageRef.current = targetPage.id;
      void selectDataset(targetPage.datasetId);
    }

    setActivePageId(targetPage.id);
    setDashboardTitle(targetPage.dashboardTitle);
    setVisuals(targetPage.visuals);
    setKpiCards(targetPage.kpiCards);
    setSlicerColumns(targetPage.slicerColumns);
    setPaletteId(targetPage.paletteId || 'classic');
    setUndoStack([]);
    setRedoStack([]);
    const firstId = targetPage.visuals[0]?.id || null;
    setSelectedVisualId(firstId);
    setSelectedVisualIds(firstId ? [firstId] : []);
    setSelectedKpiId(null);
    setEditingPageId(null);
  };

  const handleAddPage = () => {
    let nextNum = pages.length + 1;
    while (pages.some((p) => p.id === `page_${nextNum}`)) {
      nextNum += 1;
    }
    const newPageId = `page_${nextNum}`;
    const newPageName = `Page ${nextNum}`;
    const newTitle = `${selectedDataset?.name || 'Executive'} Dashboard - ${newPageName}`;

    // Fresh, clean blank page with no duplicated visuals or KPIs
    const newPage: DashboardPageConfig = {
      id: newPageId,
      name: newPageName,
      datasetId: selectedDataset?.id,
      queryId: activeQueryId,
      dashboardTitle: newTitle,
      visuals: [],
      kpiCards: [],
      slicerColumns: [],
      paletteId: 'v22',
    };

    setPages((prev) => [
      ...prev.map((p) =>
        p.id === activePageId
          ? {
              ...p,
              datasetId: p.datasetId || selectedDataset?.id,
              queryId: p.queryId !== undefined ? p.queryId : activeQueryId,
              dashboardTitle,
              visuals,
              kpiCards,
              slicerColumns,
              paletteId,
            }
          : p
      ),
      newPage,
    ]);
    setActivePageId(newPageId);
    setDashboardTitle(newTitle);
    setVisuals([]);
    setKpiCards([]);
    setSlicerColumns([]);
    setPaletteId('v22');
    setUndoStack([]);
    setRedoStack([]);
    setSelectedVisualId(null);
    setSelectedVisualIds([]);
    setSelectedKpiId(null);
    setEditingPageId(null);
  };

  const handleDuplicatePage = (e: React.MouseEvent<HTMLElement>, pageId: string) => {
    e.stopPropagation();
    const sourcePage = pages.find((p) => p.id === pageId);
    if (!sourcePage) return;

    let nextNum = pages.length + 1;
    while (pages.some((p) => p.id === `page_${nextNum}`)) {
      nextNum += 1;
    }
    const newPageId = `page_${nextNum}`;
    const newPageName = `${sourcePage.name} (Copy)`;

    const sourceVisuals = pageId === activePageId ? visuals : (sourcePage.visuals || []);
    const sourceKpis = pageId === activePageId ? kpiCards : (sourcePage.kpiCards || []);
    const sourceSlicers = pageId === activePageId ? slicerColumns : (sourcePage.slicerColumns || []);

    const clonedVisuals: DashboardVisualConfig[] = sourceVisuals.map((v, idx) => ({
      ...v,
      id: `vis_copy_${Date.now()}_${idx}`,
    }));

    const clonedKpis: DashboardKpiConfig[] = sourceKpis.map((k, idx) => ({
      ...k,
      id: `kpi_copy_${Date.now()}_${idx}`,
    }));

    const duplicatedPage: DashboardPageConfig = {
      ...sourcePage,
      id: newPageId,
      name: newPageName,
      dashboardTitle: `${sourcePage.dashboardTitle} (Copy)`,
      visuals: clonedVisuals,
      kpiCards: clonedKpis,
      slicerColumns: [...sourceSlicers],
      paletteId: sourcePage.paletteId || paletteId || 'v22',
    };

    setPages((prev) => [
      ...prev.map((p) =>
        p.id === activePageId
          ? {
              ...p,
              datasetId: p.datasetId || selectedDataset?.id,
              queryId: p.queryId !== undefined ? p.queryId : activeQueryId,
              dashboardTitle,
              visuals,
              kpiCards,
              slicerColumns,
              paletteId,
            }
          : p
      ),
      duplicatedPage,
    ]);
    setActivePageId(newPageId);
    setDashboardTitle(duplicatedPage.dashboardTitle);
    setVisuals(clonedVisuals);
    setKpiCards(clonedKpis);
    setSlicerColumns(duplicatedPage.slicerColumns);
    setPaletteId(duplicatedPage.paletteId);
    setUndoStack([]);
    setRedoStack([]);
    const firstId = clonedVisuals[0]?.id || null;
    setSelectedVisualId(firstId);
    setSelectedVisualIds(firstId ? [firstId] : []);
    setSelectedKpiId(null);
    setEditingPageId(null);
  };

  const handleRenamePage = (pageId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setEditingPageId(null);
      return;
    }
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, name: trimmed } : p))
    );
    setEditingPageId(null);
  };

  const handleDeletePage = (e: React.MouseEvent<HTMLElement>, pageId: string) => {
    e.stopPropagation();
    if (pages.length <= 1) return;
    const remaining = pages.filter((p) => p.id !== pageId);
    setPages(remaining);
    if (activePageId === pageId) {
      const fallback = remaining[0];
      setActivePageId(fallback.id);
      setDashboardTitle(fallback.dashboardTitle);
      setVisuals(fallback.visuals);
      setKpiCards(fallback.kpiCards);
      setSlicerColumns(fallback.slicerColumns);
      setPaletteId(fallback.paletteId || 'classic');
      const firstId = fallback.visuals[0]?.id || null;
      setSelectedVisualId(firstId);
      setSelectedVisualIds(firstId ? [firstId] : []);
      setSelectedKpiId(null);
    }
  };

  const toggleCrossFilter = (column: string, value: string) => {
    if (!column) return;
    setCrossFilter((prev) =>
      prev && prev.column === column && prev.value === value ? null : { column, value }
    );
  };

  const reorderVisuals = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    pushUndoSnapshot(visualsRef.current);
    setVisuals((prev) => {
      const fromIdx = prev.findIndex((v) => v.id === sourceId);
      const toIdx = prev.findIndex((v) => v.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const copy = [...prev];
      const srcX = copy[fromIdx].x;
      const srcY = copy[fromIdx].y;
      const dstX = copy[toIdx].x;
      const dstY = copy[toIdx].y;
      copy[fromIdx] = { ...copy[fromIdx], x: dstX, y: dstY };
      copy[toIdx] = { ...copy[toIdx], x: srcX, y: srcY };
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
  };

  const handleSelectVisualTile = (
    e: React.MouseEvent<HTMLElement>,
    visId: string
  ) => {
    setSelectedKpiId(null);
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      setSelectedVisualIds((prev) => {
        const exists = prev.includes(visId);
        const next = exists ? prev.filter((id) => id !== visId) : [...prev, visId];
        return next.length > 0 ? next : [visId];
      });
      setSelectedVisualId(visId);
    } else {
      setSelectedVisualId(visId);
      setSelectedVisualIds((prev) => (prev.length > 1 && prev.includes(visId) ? prev : [visId]));
    }
  };

  const handleToggleMultiSelectVisual = (
    e: React.MouseEvent<HTMLElement>,
    visId: string
  ) => {
    e.stopPropagation();
    setSelectedKpiId(null);
    setSelectedVisualIds((prev) => {
      const exists = prev.includes(visId);
      const next = exists ? prev.filter((id) => id !== visId) : [...prev, visId];
      return next.length > 0 ? next : [visId];
    });
    setSelectedVisualId(visId);
  };

  const handleSelectAllVisuals = () => {
    const allIds = visuals.map((v) => v.id);
    setSelectedVisualIds(allIds);
    if (allIds.length > 0 && !selectedVisualId) {
      setSelectedVisualId(allIds[0]);
    }
    setSelectedKpiId(null);
  };

  const handleAlignSelectedVisuals = (
    mode: 'left' | 'top' | 'match_size' | 'auto_grid'
  ) => {
    pushUndoSnapshot(visuals);
    if (mode === 'auto_grid') {
      setVisuals((prev) =>
        prev.map((v, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          return {
            ...v,
            x: 16 + col * (DEFAULT_TILE_W + DEFAULT_TILE_GAP),
            y: 16 + row * (DEFAULT_TILE_H + DEFAULT_TILE_GAP),
            customWidth: DEFAULT_TILE_W,
            customHeight: DEFAULT_TILE_H,
          };
        })
      );
      return;
    }

    const activeIds =
      selectedVisualIds.length > 1
        ? selectedVisualIds
        : visuals.map((v) => v.id);
    const activeSet = new Set(activeIds);
    const targetVisuals = visuals.filter((v) => activeSet.has(v.id));
    if (targetVisuals.length === 0) return;

    const minX = Math.min(...targetVisuals.map((v) => v.x ?? 16));
    const minY = Math.min(...targetVisuals.map((v) => v.y ?? 16));
    const refW =
      targetVisuals[0]?.customWidth ||
      (targetVisuals[0]?.span === 2 ? 976 : DEFAULT_TILE_W);
    const refH = targetVisuals[0]?.customHeight || DEFAULT_TILE_H;

    setVisuals((prev) =>
      prev.map((v) => {
        if (!activeSet.has(v.id)) return v;
        if (mode === 'left') return { ...v, x: minX };
        if (mode === 'top') return { ...v, y: minY };
        if (mode === 'match_size') {
          return { ...v, customWidth: refW, customHeight: refH };
        }
        return v;
      })
    );
  };

  const handleToggleLockVisual = (
    e: React.MouseEvent<HTMLElement>,
    visId: string
  ) => {
    e.stopPropagation();
    pushUndoSnapshot(visuals);
    setVisuals((prev) =>
      prev.map((v) => (v.id === visId ? { ...v, locked: !v.locked } : v))
    );
  };

  const handleZOrderChange = (
    e: React.MouseEvent<HTMLElement>,
    visId: string,
    mode: 'front' | 'back'
  ) => {
    e.stopPropagation();
    pushUndoSnapshot(visuals);
    setVisuals((prev) => {
      const zs = prev.map((v, idx) => v.zIndex ?? idx + 1);
      const maxZ = Math.max(1, ...zs);
      const minZ = Math.min(1, ...zs);
      return prev.map((v, idx) => {
        if (v.id !== visId) {
          return mode === 'back' ? { ...v, zIndex: (v.zIndex ?? idx + 1) + 1 } : v;
        }
        return {
          ...v,
          zIndex: mode === 'front' ? maxZ + 1 : Math.max(1, minZ),
        };
      });
    });
  };

  const handleVisualMouseDown = (
    e: React.MouseEvent<HTMLElement>,
    visId: string,
    immediate = false
  ) => {
    if (e.button !== 0) return;
    if (!immediate) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest('button, input, select, textarea, [data-resize-handle="true"]')
      ) {
        return;
      }
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Determine which visuals move together (multi-select group or single visual)
    let movingIds = selectedVisualIdsRef.current;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (!movingIds.includes(visId)) {
        movingIds = [...movingIds, visId];
        setSelectedVisualIds(movingIds);
      }
    } else if (!movingIds.includes(visId)) {
      movingIds = [visId];
      setSelectedVisualIds([visId]);
    }
    setSelectedVisualId(visId);
    setSelectedKpiId(null);

    const targetVis = visualsRef.current.find((v) => v.id === visId);
    if (targetVis?.locked) {
      return;
    }

    const initialRects: Record<string, { x: number; y: number; w: number; h: number }> = {};
    visualsRef.current.forEach((v, idx) => {
      if (movingIds.includes(v.id) && !v.locked) {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        initialRects[v.id] = {
          x: v.x ?? 16 + col * (DEFAULT_TILE_W + DEFAULT_TILE_GAP),
          y: v.y ?? 16 + row * (DEFAULT_TILE_H + DEFAULT_TILE_GAP),
          w: v.customWidth || (v.span === 2 ? 976 : DEFAULT_TILE_W),
          h: v.customHeight || DEFAULT_TILE_H,
        };
      }
    });

    dragSessionRef.current = {
      primaryVisId: visId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      hasMoved: false,
      initialRects,
      snapshot: JSON.parse(JSON.stringify(visualsRef.current)) as DashboardVisualConfig[],
    };

    if (immediate) {
      e.stopPropagation();
      setHoverDragVisId(visId);
      return;
    }
    longPressTimerRef.current = setTimeout(() => {
      setHoverDragVisId(visId);
      longPressTimerRef.current = null;
    }, 180);
  };

  const handleVisualMouseEnter = (targetVisId: string) => {
    if (!hoverDragVisId || hoverDragVisId === targetVisId) return;
    if (dragSessionRef.current?.hasMoved) return;
    setHoverTargetVisId(targetVisId);
    reorderVisuals(hoverDragVisId, targetVisId);
  };

  const handleStartResize = (
    e: React.MouseEvent<HTMLElement>,
    vis: DashboardVisualConfig,
    dir: ResizeDirection = 'se'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (vis.locked) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    dragSessionRef.current = null;
    setHoverDragVisId(null);
    setSelectedVisualId(vis.id);
    if (!selectedVisualIdsRef.current.includes(vis.id)) {
      setSelectedVisualIds([vis.id]);
    }
    setSelectedKpiId(null);

    const tileEl = e.currentTarget.closest('[data-visual-tile="true"]') as HTMLElement | null;
    const rect = tileEl ? tileEl.getBoundingClientRect() : null;
    const startW =
      vis.customWidth ||
      (rect && rect.width > 50 ? Math.round(rect.width) : DEFAULT_TILE_W);
    const startH =
      vis.customHeight ||
      (rect && rect.height > 50 ? Math.round(rect.height) : DEFAULT_TILE_H);

    resizeSessionRef.current = {
      visId: vis.id,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: vis.x ?? 16,
      startTop: vis.y ?? 16,
      startW,
      startH,
      hasMoved: false,
      snapshot: JSON.parse(JSON.stringify(visualsRef.current)) as DashboardVisualConfig[],
    };
    setResizingVisId(vis.id);
  };

  const handleResetVisualSize = (
    e: React.MouseEvent<HTMLElement>,
    visId: string
  ) => {
    e.stopPropagation();
    pushUndoSnapshot(visuals);
    setVisuals((prev) =>
      prev.map((v) =>
        v.id === visId
          ? { ...v, customWidth: undefined, customHeight: undefined }
          : v
      )
    );
  };

  // Get legend keys for the currently selected visual so the user can edit their colors & labels
  const activeVisualLegendItems = (() => {
    if (!activeVisual) return [];
    const targetCol =
      activeVisual.type === 'clustered_bar' ||
      activeVisual.type === 'clustered_column' ||
      activeVisual.type === 'stacked_column' ||
      activeVisual.type === 'matrix'
        ? activeVisual.seriesCol || activeVisual.categoryCol
        : activeVisual.categoryCol;

    return getDistinctValuesForColumn(targetCol).slice(0, activeVisual.topN || 10);
  })();

  // Format data label text according to visual's dataLabelContent ('totals_only' | 'totals_and_percentage')
  const formatDataLabel = (
    vis: DashboardVisualConfig,
    val: number,
    total: number,
    badge?: string
  ): string => {
    const contentMode: DataLabelContentType = vis.dataLabelContent || 'totals_only';
    const prefix = badge ? `${badge}` : '';
    const numStr = formatNum(val);
    if (contentMode === 'totals_and_percentage') {
      const pct = total > 0 ? ((Math.max(0, val) / total) * 100).toFixed(1) : '0.0';
      return `${prefix}${numStr} (${pct}%)`;
    }
    return `${prefix}${numStr}`;
  };

  // Universal wrapper to position the legend inside any chart visual (legend shows ONLY swatch + label, never data values)
  const wrapWithLegend = (
    vis: DashboardVisualConfig,
    chartNode: React.ReactNode,
    legendEntries: {
      key: string;
      label: string;
      color: string;
      filterCol: string;
    }[]
  ) => {
    const pos: LegendPositionType = vis.legendPosition || 'top_left';
    if (pos === 'hide' || legendEntries.length === 0) {
      return (
        <div data-testid={`visual-layout-${vis.id}`} data-legend-pos="hide">
          {chartNode}
        </div>
      );
    }

    const isVerticalSide =
      pos === 'left' || pos === 'left_center' || pos === 'right' || pos === 'right_center';

    const horizontalJustify =
      pos === 'top_left' || pos === 'bottom_left'
        ? 'justify-start text-left'
        : pos === 'top_right' || pos === 'bottom_right'
        ? 'justify-end text-right'
        : 'justify-center text-center';

    const legendBlock = isVerticalSide ? (
      <div
        data-testid={`visual-legend-${vis.id}`}
        data-legend-position={pos}
        className="w-36 sm:w-40 shrink-0 space-y-1 max-h-52 overflow-y-auto px-2 py-1.5 bg-[#FAFAFA] border border-[#EAEAEA] rounded-lg"
      >
        {legendEntries.map((entry) => {
          const isSelected =
            Boolean(entry.filterCol) &&
            crossFilter?.column === entry.filterCol &&
            crossFilter?.value === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => entry.filterCol && toggleCrossFilter(entry.filterCol, entry.key)}
              className={`w-full flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded transition-colors ${
                isSelected
                  ? 'bg-[#E6F2EB] text-[#185C37] font-bold'
                  : 'text-[#212121] hover:bg-[#EFEFEF]'
              }`}
              title={entry.label}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate font-medium">{entry.label}</span>
            </button>
          );
        })}
      </div>
    ) : (
      <div
        data-testid={`visual-legend-${vis.id}`}
        data-legend-position={pos}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-1.5 bg-[#FAFAFA] border border-[#EAEAEA] rounded-lg ${horizontalJustify}`}
      >
        {legendEntries.map((entry) => {
          const isSelected =
            Boolean(entry.filterCol) &&
            crossFilter?.column === entry.filterCol &&
            crossFilter?.value === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => entry.filterCol && toggleCrossFilter(entry.filterCol, entry.key)}
              className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                isSelected
                  ? 'bg-[#E6F2EB] text-[#185C37] font-bold'
                  : 'text-[#212121] hover:text-[#217346] hover:bg-[#EFEFEF]'
              }`}
              title={entry.label}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate max-w-[120px] font-medium">{entry.label}</span>
            </button>
          );
        })}
      </div>
    );

    if (pos === 'top_left' || pos === 'top' || pos === 'top_right') {
      return (
        <div
          data-testid={`visual-layout-${vis.id}`}
          data-legend-pos={pos}
          className="flex flex-col gap-2.5"
        >
          {legendBlock}
          <div className="flex-1 min-w-0">{chartNode}</div>
        </div>
      );
    }

    if (pos === 'bottom_left' || pos === 'bottom' || pos === 'bottom_right') {
      return (
        <div
          data-testid={`visual-layout-${vis.id}`}
          data-legend-pos={pos}
          className="flex flex-col gap-2.5"
        >
          <div className="flex-1 min-w-0">{chartNode}</div>
          {legendBlock}
        </div>
      );
    }

    if (pos === 'left' || pos === 'left_center') {
      return (
        <div
          data-testid={`visual-layout-${vis.id}`}
          data-legend-pos={pos}
          className={`flex flex-row gap-3 ${pos === 'left_center' ? 'items-center' : 'items-start'}`}
        >
          {legendBlock}
          <div className="flex-1 min-w-0">{chartNode}</div>
        </div>
      );
    }

    // right or right_center
    return (
      <div
        data-testid={`visual-layout-${vis.id}`}
        data-legend-pos={pos}
        className={`flex flex-row gap-3 ${pos === 'right_center' ? 'items-center' : 'items-start'}`}
      >
        <div className="flex-1 min-w-0">{chartNode}</div>
        {legendBlock}
      </div>
    );
  };

  // Render an individual Visual Card
  const renderVisualContent = (vis: DashboardVisualConfig) => {
    const visPalette = getVisualPalette(vis);
    const labelPos: DataLabelPositionType = vis.dataLabelPosition || 'outside_end';

    // 1. HISTOGRAM VISUAL
    if (vis.type === 'histogram') {
      const nums = filteredRows
        .map((r) => Number(getRowVal(r, vis.valueCol)))
        .filter((n) => !Number.isNaN(n));
      if (nums.length === 0) {
        return (
          <div className="h-56 flex items-center justify-center text-xs text-[#605E5C]">
            Select a numeric column in Values to render a Histogram distribution.
          </div>
        );
      }
      const minVal = Math.min(...nums);
      const maxVal = Math.max(...nums);
      const binCount = Math.max(3, Math.min(25, vis.bins || 8));
      const span = maxVal === minVal ? 1 : maxVal - minVal;
      const step = span / binCount;

      const buckets = Array.from({ length: binCount }, (_, idx) => {
        const low = minVal + idx * step;
        const high = idx === binCount - 1 ? maxVal : minVal + (idx + 1) * step;
        return {
          label: `${formatNum(low)}–${formatNum(high)}`,
          low,
          high,
          count: 0,
        };
      });

      nums.forEach((n) => {
        const idx = Math.min(binCount - 1, Math.max(0, Math.floor((n - minVal) / step)));
        buckets[idx].count += 1;
      });

      const maxCount = Math.max(1, ...buckets.map((b) => b.count));
      const minCount = Math.min(...buckets.map((b) => b.count));
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;

      const histLegendEntries = buckets.map((b, i) => {
        const cfStyle = getConditionalFormatStyle(vis, b.count, minCount, maxCount);
        const barColor = cfStyle.text || visPalette[i % visPalette.length];
        return {
          key: b.label,
          label: b.label,
          color: barColor,
          filterCol: '',
        };
      });

      const histChart = (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[11px] text-[#605E5C] px-1">
            <span>
              Range: <strong className="text-[#212121]">{formatNum(minVal)}</strong> to{' '}
              <strong className="text-[#212121]">{formatNum(maxVal)}</strong>
            </span>
            <span>
              Mean: <strong className="text-[#217346] font-mono">{formatNum(mean)}</strong> •{' '}
              {nums.length} samples
            </span>
          </div>
          <div className="h-48 flex items-end gap-1.5 pt-6 pb-2 px-2 border-b border-[#D4D4D4]">
            {buckets.map((b, i) => {
              const heightPct = Math.max(12, Math.round((b.count / maxCount) * 100));
              const cfStyle = getConditionalFormatStyle(vis, b.count, minCount, maxCount);
              const barColor = cfStyle.text || visPalette[i % visPalette.length];
              const lblText = formatDataLabel(vis, b.count, nums.length);
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end h-full group"
                  title={`${b.label}: ${b.count} rows`}
                >
                  {vis.showDataLabels && labelPos === 'outside_end' && (
                    <span className="text-[9px] font-mono font-semibold text-[#212121] mb-1 whitespace-nowrap">
                      {lblText}
                    </span>
                  )}
                  <div
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: barColor,
                    }}
                    className={`w-full rounded-t transition-all opacity-90 group-hover:opacity-100 flex flex-col items-center overflow-hidden ${
                      labelPos === 'inside_center' ? 'justify-center' : 'justify-start pt-1'
                    }`}
                  >
                    {vis.showDataLabels && labelPos !== 'outside_end' && (
                      <span className="text-[9px] font-mono font-bold text-white drop-shadow whitespace-nowrap">
                        {lblText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1 px-2">
            {buckets.map((b, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[9px] text-[#605E5C] font-mono truncate"
                title={b.label}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>
      );

      return wrapWithLegend(vis, histChart, histLegendEntries);
    }

    // Check if category is a date or timestamp column
    const isCategoryDate =
      Boolean(vis.categoryCol && /date|time|timestamp|order_date|created_at|updated_at/i.test(vis.categoryCol)) ||
      columns.some(
        (c) =>
          c.name === vis.categoryCol &&
          ['date', 'timestamp'].includes(String(c.data_type || '').toLowerCase())
      );

    const isTrendOrDate =
      vis.type === 'line_area' ||
      vis.type === 'stacked_area' ||
      isCategoryDate;

    // Determine calendar date aggregation interval (Year, Quarter, Month)
    let dateInterval: 'month' | 'quarter' | 'year' = 'month';
    if (isCategoryDate) {
      let minYear = 9999;
      let maxYear = 0;
      let validDateCount = 0;
      for (const r of filteredRows) {
        const raw = getRowVal(r, vis.categoryCol);
        if (!raw) continue;
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          if (y >= 1990 && y <= 2100) {
            if (y < minYear) minYear = y;
            if (y > maxYear) maxYear = y;
            validDateCount++;
          }
        }
      }
      if (validDateCount > 0 && maxYear - minYear > 3) {
        dateInterval = maxYear - minYear > 6 ? 'year' : 'quarter';
      } else {
        dateInterval = 'month';
      }
    }

    // Group rows by categoryCol for standard, table, matrix & multi-series visuals
    const catMap = new Map<string, Record<string, any>[]>();
    filteredRows.forEach((r) => {
      const raw = getRowVal(r, vis.categoryCol);
      let key: string;
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        key = '(Blank)';
      } else if (isCategoryDate) {
        const d = new Date(raw);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100) {
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          if (dateInterval === 'year') {
            key = String(y);
          } else if (dateInterval === 'quarter') {
            key = `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
          } else {
            key = `${y}-${String(m).padStart(2, '0')}`;
          }
        } else {
          key = String(raw);
        }
      } else {
        key = String(raw);
      }
      if (!catMap.has(key)) catMap.set(key, []);
      catMap.get(key)!.push(r);
    });

    let items = Array.from(catMap.entries()).map(([category, groupRows]) => ({
      category,
      value: computeMetric(groupRows, vis.valueCol, vis.aggFunc),
      count: groupRows.length,
      rows: groupRows,
    }));

    if (isTrendOrDate && vis.sortBy !== 'value_desc' && vis.sortBy !== 'value_asc') {
      items.sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }));
    } else if (vis.sortBy === 'value_desc') {
      items.sort((a, b) => b.value - a.value);
    } else if (vis.sortBy === 'value_asc') {
      items.sort((a, b) => a.value - b.value);
    } else {
      items.sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }));
    }

    items = items.slice(0, isTrendOrDate ? Math.max(36, vis.topN || 36) : (vis.topN || 10));
    const maxVal = Math.max(1, ...items.map((x) => Math.abs(x.value)));
    const minVal = items.length > 0 ? Math.min(...items.map((x) => x.value)) : 0;
    const totalVal = items.reduce((acc, x) => acc + Math.max(0, x.value), 0) || 1;

    if (items.length === 0) {
      return (
        <div className="h-56 flex items-center justify-center text-xs text-[#605E5C]">
          No data available for current filter selection.
        </div>
      );
    }

    // Standard category legend entries for single-series charts (swatch + category label ONLY, no embedded data values)
    const categoryLegendEntries = items.map((item, idx) => {
      const cfStyle =
        vis.type === 'donut' || vis.type === 'pie'
          ? {}
          : getConditionalFormatStyle(vis, item.value, minVal, maxVal);
      const itemColor = cfStyle.text || getItemColor(vis, item.category, idx);
      return {
        key: item.category,
        label: getItemLegendLabel(vis, item.category),
        color: itemColor,
        filterCol: vis.categoryCol,
      };
    });

    // 2. TABLE VISUAL (WITH TOTALS & CONDITIONAL FORMATTING)
    if (vis.type === 'table') {
      const secondaryCol = vis.seriesCol && vis.seriesCol !== vis.categoryCol ? vis.seriesCol : '';
      return (
        <div className="overflow-auto max-h-64 border border-[#E1E1E1] rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#F3F3F3] text-[#212121] border-b border-[#D4D4D4] z-10">
              <tr>
                <th className="px-3 py-2 text-left font-bold border-r border-[#E1E1E1]">
                  {vis.categoryCol}
                </th>
                {secondaryCol && (
                  <th className="px-3 py-2 text-left font-bold border-r border-[#E1E1E1]">
                    Top {secondaryCol}
                  </th>
                )}
                <th className="px-3 py-2 text-right font-bold border-r border-[#E1E1E1]">Rows</th>
                <th className="px-3 py-2 text-right font-bold border-r border-[#E1E1E1]">
                  {vis.aggFunc.toUpperCase()}({vis.valueCol})
                </th>
                <th className="px-3 py-2 text-right font-bold">% Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E1E1]">
              {items.map((item, idx) => {
                const share = ((Math.max(0, item.value) / totalVal) * 100).toFixed(1);
                const cfStyle = getConditionalFormatStyle(vis, item.value, minVal, maxVal);
                const topSeriesVal = secondaryCol
                  ? String(item.rows[0]?.[secondaryCol] ?? '-')
                  : '';
                const isSelected =
                  crossFilter?.column === vis.categoryCol && crossFilter?.value === item.category;

                return (
                  <tr
                    key={item.category}
                    onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#E6F2EB] font-semibold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#F8F9FA]'
                        : 'bg-[#FAFAFA] hover:bg-[#F3F3F3]'
                    }`}
                  >
                    <td className="px-3 py-1.5 font-medium text-[#212121] border-r border-[#E1E1E1] flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: getItemColor(vis, item.category, idx) }}
                      />
                      <span className="truncate">{getItemLegendLabel(vis, item.category)}</span>
                    </td>
                    {secondaryCol && (
                      <td className="px-3 py-1.5 text-[#605E5C] border-r border-[#E1E1E1]">
                        {topSeriesVal}
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right font-mono text-[#605E5C] border-r border-[#E1E1E1]">
                      {item.count}
                    </td>
                    <td
                      style={{
                        backgroundColor:
                          vis.conditionalFormatting?.mode !== 'data_bars' ? cfStyle.bg : undefined,
                        color: cfStyle.text || '#212121',
                      }}
                      className="px-3 py-1.5 text-right font-mono font-bold border-r border-[#E1E1E1] relative overflow-hidden"
                    >
                      {vis.conditionalFormatting?.mode === 'data_bars' && cfStyle.barPct && (
                        <div
                          style={{
                            width: `${cfStyle.barPct}%`,
                            backgroundColor: `${cfStyle.bg}30`,
                          }}
                          className="absolute inset-y-0.5 left-0.5 rounded-r pointer-events-none"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1">
                        {cfStyle.badge && <span>{cfStyle.badge}</span>}
                        {formatNum(item.value)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[#605E5C]">{share}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-[#F3F3F3] border-t-2 border-[#217346]/40 font-bold text-[#212121]">
              <tr>
                <td className="px-3 py-2 border-r border-[#E1E1E1]">Grand Total</td>
                {secondaryCol && <td className="px-3 py-2 border-r border-[#E1E1E1]" />}
                <td className="px-3 py-2 text-right font-mono border-r border-[#E1E1E1]">
                  {items.reduce((a, b) => a + b.count, 0)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[#217346] border-r border-[#E1E1E1]">
                  {formatNum(totalVal)}
                </td>
                <td className="px-3 py-2 text-right font-mono">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }

    // 3. MATRIX TABLE VISUAL (ROWS × COLUMNS CROSS-TAB WITH CONDITIONAL FORMATTING)
    if (vis.type === 'matrix') {
      const seriesCol = vis.seriesCol || vis.categoryCol;
      const colHeaders = Array.from(
        new Set(
          filteredRows.map((r) => {
            const v = getRowVal(r, seriesCol);
            return v === null || v === undefined || String(v).trim() === ''
              ? '(Blank)'
              : String(v);
          })
        )
      ).slice(0, 8);

      const matrixRows = items.map((item) => {
        const cells: Record<string, number> = {};
        colHeaders.forEach((ch) => {
          const matching = item.rows.filter((r) => {
            const v = getRowVal(r, seriesCol);
            const norm =
              v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
            return norm === ch;
          });
          cells[ch] = computeMetric(matching, vis.valueCol, vis.aggFunc);
        });
        const rowTotal = computeMetric(item.rows, vis.valueCol, vis.aggFunc);
        return { category: item.category, cells, rowTotal };
      });

      const allCellVals = matrixRows.flatMap((r) => Object.values(r.cells));
      const cellMin = allCellVals.length > 0 ? Math.min(...allCellVals) : 0;
      const cellMax = allCellVals.length > 0 ? Math.max(...allCellVals) : 1;

      const colTotals: Record<string, number> = {};
      colHeaders.forEach((ch) => {
        const matching = filteredRows.filter((r) => {
          const v = getRowVal(r, seriesCol);
          const norm =
            v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
          return norm === ch;
        });
        colTotals[ch] = computeMetric(matching, vis.valueCol, vis.aggFunc);
      });
      const grandTotal = computeMetric(filteredRows, vis.valueCol, vis.aggFunc);

      return (
        <div className="overflow-auto max-h-64 border border-[#E1E1E1] rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#F3F3F3] text-[#212121] border-b border-[#D4D4D4] z-10">
              <tr>
                <th className="px-3 py-2 text-left font-bold border-r border-[#D4D4D4] bg-[#F3F3F3]">
                  {vis.categoryCol} \ {seriesCol}
                </th>
                {colHeaders.map((ch, cIdx) => (
                  <th
                    key={ch}
                    className="px-2.5 py-2 text-right font-bold border-r border-[#E1E1E1] whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getItemColor(vis, ch, cIdx) }}
                      />
                      {getItemLegendLabel(vis, ch)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-bold bg-[#E6F2EB] text-[#185C37] whitespace-nowrap">
                  Row Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E1E1]">
              {matrixRows.map((row) => (
                <tr
                  key={row.category}
                  onClick={() => toggleCrossFilter(vis.categoryCol, row.category)}
                  className="hover:bg-[#F8F9FA] cursor-pointer"
                >
                  <td className="px-3 py-1.5 font-semibold text-[#212121] border-r border-[#D4D4D4] bg-[#FAFAFA] whitespace-nowrap">
                    {getItemLegendLabel(vis, row.category)}
                  </td>
                  {colHeaders.map((ch) => {
                    const v = row.cells[ch] ?? 0;
                    const cfStyle = getConditionalFormatStyle(vis, v, cellMin, cellMax);
                    return (
                      <td
                        key={ch}
                        style={{
                          backgroundColor:
                            vis.conditionalFormatting?.mode !== 'data_bars' ? cfStyle.bg : undefined,
                          color: cfStyle.text || '#212121',
                        }}
                        className="px-2.5 py-1.5 text-right font-mono border-r border-[#E1E1E1] relative overflow-hidden whitespace-nowrap"
                      >
                        {vis.conditionalFormatting?.mode === 'data_bars' && cfStyle.barPct && (
                          <div
                            style={{
                              width: `${cfStyle.barPct}%`,
                              backgroundColor: `${cfStyle.bg}30`,
                            }}
                            className="absolute inset-y-0.5 left-0.5 rounded-r pointer-events-none"
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center gap-1">
                          {cfStyle.badge && <span className="text-[9px]">{cfStyle.badge}</span>}
                          {formatNum(v)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-[#185C37] bg-[#E6F2EB]/40 whitespace-nowrap">
                    {formatNum(row.rowTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-[#F3F3F3] border-t-2 border-[#217346]/40 font-bold text-[#212121]">
              <tr>
                <td className="px-3 py-2 border-r border-[#D4D4D4]">Column Total</td>
                {colHeaders.map((ch) => (
                  <td
                    key={ch}
                    className="px-2.5 py-2 text-right font-mono border-r border-[#E1E1E1] whitespace-nowrap"
                  >
                    {formatNum(colTotals[ch] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono text-[#217346] bg-[#E6F2EB] whitespace-nowrap">
                  {formatNum(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }

    // 4. CLUSTERED BAR / CLUSTERED COLUMN / STACKED COLUMN
    if (
      vis.type === 'clustered_bar' ||
      vis.type === 'clustered_column' ||
      vis.type === 'stacked_column'
    ) {
      const seriesCol = vis.seriesCol || vis.categoryCol;
      const seriesKeys = Array.from(
        new Set(
          filteredRows.map((r) => {
            const v = getRowVal(r, seriesCol);
            return v === null || v === undefined || String(v).trim() === ''
              ? '(Blank)'
              : String(v);
          })
        )
      ).slice(0, 6);

      const matrix = items.map((item) => {
        const seriesVals: Record<string, number> = {};
        seriesKeys.forEach((sk) => {
          const matching = item.rows.filter((r) => {
            const v = getRowVal(r, seriesCol);
            const norm =
              v === null || v === undefined || String(v).trim() === '' ? '(Blank)' : String(v);
            return norm === sk;
          });
          seriesVals[sk] = computeMetric(matching, vis.valueCol, vis.aggFunc);
        });
        const rowSum = Object.values(seriesVals).reduce((a, b) => a + b, 0);
        return { category: item.category, seriesVals, rowSum };
      });

      const maxSeriesVal = Math.max(
        1,
        ...matrix.flatMap((m) => Object.values(m.seriesVals)),
        ...matrix.map((m) => m.rowSum)
      );

      const seriesLegendEntries = seriesKeys.map((sk, idx) => ({
        key: sk,
        label: getItemLegendLabel(vis, sk),
        color: getItemColor(vis, sk, idx),
        filterCol: seriesCol,
      }));

      const chartContent =
        vis.type === 'clustered_bar' ? (
          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {matrix.map((row) => (
              <div key={row.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => toggleCrossFilter(vis.categoryCol, row.category)}
                    className="font-semibold text-[#212121] hover:text-[#217346] truncate max-w-[180px]"
                  >
                    {getItemLegendLabel(vis, row.category)}
                  </button>
                  <span className="text-[10px] font-mono text-[#605E5C]">
                    Total: {formatNum(row.rowSum)}
                  </span>
                </div>
                <div className="space-y-1 pl-2 border-l border-[#D4D4D4]">
                  {seriesKeys.map((sk, sIdx) => {
                    const val = row.seriesVals[sk] || 0;
                    const pct = Math.max(12, Math.round((val / maxSeriesVal) * 100));
                    const lblText = formatDataLabel(vis, val, row.rowSum || totalVal);
                    return (
                      <div key={sk} className="flex items-center gap-2">
                        <span className="w-16 text-[10px] text-[#605E5C] truncate">
                          {getItemLegendLabel(vis, sk)}
                        </span>
                        <div className="flex-1 h-4 bg-[#EFEFEF] rounded-sm overflow-hidden">
                          <div
                            style={{
                              width: `${pct}%`,
                              backgroundColor: getItemColor(vis, sk, sIdx),
                            }}
                            className={`h-full rounded-sm transition-all flex items-center overflow-hidden ${
                              labelPos === 'inside_center'
                                ? 'justify-center'
                                : 'justify-end pr-1.5'
                            }`}
                          >
                            {vis.showDataLabels && labelPos !== 'outside_end' && (
                              <span className="text-[9px] font-mono font-bold text-white drop-shadow whitespace-nowrap">
                                {lblText}
                              </span>
                            )}
                          </div>
                        </div>
                        {vis.showDataLabels && labelPos === 'outside_end' && (
                          <span className="text-right text-[10px] font-mono font-semibold text-[#212121] whitespace-nowrap">
                            {lblText}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="h-48 flex items-end gap-3 pt-4 pb-2 px-2 border-b border-[#D4D4D4]">
              {matrix.map((row) => {
                const rowLbl = formatDataLabel(vis, row.rowSum, totalVal);
                return (
                  <div
                    key={row.category}
                    onClick={() => toggleCrossFilter(vis.categoryCol, row.category)}
                    className="flex-1 h-full flex flex-col justify-end items-center cursor-pointer group"
                  >
                    {vis.type === 'stacked_column' ? (
                      <div className="w-full max-w-[44px] h-full flex flex-col justify-end items-center">
                        {vis.showDataLabels && labelPos === 'outside_end' && (
                          <span className="text-[9px] font-mono font-semibold text-[#212121] text-center mb-1 whitespace-nowrap">
                            {rowLbl}
                          </span>
                        )}
                        <div
                          style={{
                            height: `${Math.max(14, Math.round((row.rowSum / maxSeriesVal) * 100))}%`,
                          }}
                          className="w-full flex flex-col rounded-t overflow-hidden relative"
                        >
                          {seriesKeys.map((sk, sIdx) => {
                            const val = row.seriesVals[sk] || 0;
                            const share = row.rowSum > 0 ? (val / row.rowSum) * 100 : 0;
                            if (share <= 0) return null;
                            return (
                              <div
                                key={sk}
                                style={{
                                  height: `${share}%`,
                                  backgroundColor: getItemColor(vis, sk, sIdx),
                                }}
                                title={`${row.category} • ${getItemLegendLabel(vis, sk)}: ${formatNum(val)}`}
                              />
                            );
                          })}
                          {vis.showDataLabels && labelPos !== 'outside_end' && (
                            <div
                              className={`absolute inset-0 flex flex-col items-center pointer-events-none ${
                                labelPos === 'inside_center' ? 'justify-center' : 'justify-start pt-1'
                              }`}
                            >
                              <span className="text-[9px] font-mono font-bold text-white drop-shadow whitespace-nowrap">
                                {rowLbl}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-end justify-center gap-1">
                        {seriesKeys.map((sk, sIdx) => {
                          const val = row.seriesVals[sk] || 0;
                          const hPct = Math.max(12, Math.round((val / maxSeriesVal) * 100));
                          const subLbl = formatDataLabel(vis, val, row.rowSum || totalVal);
                          return (
                            <div
                              key={sk}
                              className="flex-1 max-w-[18px] h-full flex flex-col justify-end items-center"
                            >
                              {vis.showDataLabels && labelPos === 'outside_end' && (
                                <span className="text-[8px] font-mono font-semibold text-[#212121] mb-0.5 whitespace-nowrap">
                                  {subLbl}
                                </span>
                              )}
                              <div
                                style={{
                                  height: `${hPct}%`,
                                  backgroundColor: getItemColor(vis, sk, sIdx),
                                }}
                                title={`${row.category} • ${getItemLegendLabel(vis, sk)}: ${formatNum(val)}`}
                                className={`w-full rounded-t transition-all opacity-90 group-hover:opacity-100 flex flex-col items-center overflow-hidden ${
                                  labelPos === 'inside_center' ? 'justify-center' : 'justify-start pt-0.5'
                                }`}
                              >
                                {vis.showDataLabels && labelPos !== 'outside_end' && (
                                  <span className="text-[8px] font-mono font-bold text-white drop-shadow whitespace-nowrap">
                                    {subLbl}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 px-2 pt-1.5">
              {matrix.map((row) => (
                <div
                  key={row.category}
                  className="flex-1 text-center text-[10px] font-medium text-[#212121] truncate"
                  title={row.category}
                >
                  {getItemLegendLabel(vis, row.category)}
                </div>
              ))}
            </div>
          </div>
        );

      return wrapWithLegend(vis, chartContent, seriesLegendEntries);
    }

    // 5. HORIZONTAL BAR CHART
    if (vis.type === 'bar') {
      const barChart = (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 pt-1">
          {items.map((item, idx) => {
            const pct = Math.max(14, Math.round((Math.abs(item.value) / maxVal) * 100));
            const cfStyle = getConditionalFormatStyle(vis, item.value, minVal, maxVal);
            const barColor = cfStyle.text || getItemColor(vis, item.category, idx);
            const isSelected =
              crossFilter?.column === vis.categoryCol && crossFilter?.value === item.category;
            const lblText = formatDataLabel(vis, item.value, totalVal, cfStyle.badge);
            return (
              <div
                key={item.category}
                onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                className={`p-1.5 rounded cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#E6F2EB] border border-[#217346]' : 'hover:bg-[#F3F3F3]'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#212121] truncate max-w-[200px]">
                    {getItemLegendLabel(vis, item.category)}
                  </span>
                  {vis.showDataLabels && labelPos === 'outside_end' && (
                    <span
                      data-testid={`data-label-${vis.id}-${idx}`}
                      className="font-mono font-semibold text-xs text-[#212121]"
                    >
                      {lblText}
                    </span>
                  )}
                </div>
                <div className="w-full h-5 bg-[#EFEFEF] rounded overflow-hidden">
                  <div
                    style={{
                      width: `${pct}%`,
                      backgroundColor: barColor,
                    }}
                    className={`h-full rounded transition-all flex items-center overflow-hidden ${
                      labelPos === 'inside_center' ? 'justify-center px-1' : 'justify-end pr-2'
                    }`}
                  >
                    {vis.showDataLabels && labelPos !== 'outside_end' && (
                      <span
                        data-testid={`data-label-${vis.id}-${idx}`}
                        className="font-mono font-bold text-[10px] text-white drop-shadow whitespace-nowrap"
                      >
                        {lblText}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
      const showBarLegend = !isTrendOrDate && vis.legendPosition && vis.legendPosition !== 'hide' && items.length <= 10;
      return wrapWithLegend(vis, barChart, showBarLegend ? categoryLegendEntries : []);
    }

    // 6. VERTICAL COLUMN CHART
    if (vis.type === 'column') {
      const colChart = (
        <div className="pt-2">
          <div className="h-48 flex items-end gap-2.5 pt-6 pb-2 px-2 border-b border-[#D4D4D4]">
            {items.map((item, idx) => {
              const hPct = Math.max(14, Math.round((Math.abs(item.value) / maxVal) * 100));
              const cfStyle = getConditionalFormatStyle(vis, item.value, minVal, maxVal);
              const colColor = cfStyle.text || getItemColor(vis, item.category, idx);
              const isSelected =
                crossFilter?.column === vis.categoryCol && crossFilter?.value === item.category;
              const lblText = formatDataLabel(vis, item.value, totalVal, cfStyle.badge);
              return (
                <div
                  key={item.category}
                  onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                  className="flex-1 h-full flex flex-col items-center justify-end cursor-pointer group"
                  title={`${getItemLegendLabel(vis, item.category)}: ${formatNum(item.value)}`}
                >
                  {vis.showDataLabels && labelPos === 'outside_end' && (
                    <span
                      data-testid={`data-label-${vis.id}-${idx}`}
                      className="text-[10px] font-mono font-bold text-[#212121] mb-1 whitespace-nowrap"
                    >
                      {lblText}
                    </span>
                  )}
                  <div className="w-full max-w-[44px] h-full flex flex-col justify-end items-center">
                    <div className="w-full h-full max-h-[170px] bg-slate-100/90 rounded-full flex flex-col justify-end p-0.5 relative overflow-hidden group-hover:bg-slate-200/80 transition-colors">
                      <div
                        style={{
                          height: `${hPct}%`,
                          backgroundColor: colColor,
                        }}
                        className={`w-full rounded-full transition-all flex flex-col items-center justify-start pt-1 shadow-xs ${
                          isSelected
                            ? 'ring-2 ring-emerald-500 brightness-110 shadow-md shadow-emerald-500/30'
                            : 'opacity-90 group-hover:opacity-100 group-hover:shadow-sm'
                        }`}
                      >
                    {vis.showDataLabels && labelPos !== 'outside_end' && (
                      <span
                        data-testid={`data-label-${vis.id}-${idx}`}
                        className="text-[9px] font-mono font-bold text-white drop-shadow whitespace-nowrap"
                      >
                        {lblText}
                      </span>
                    )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2.5 px-2 pt-1.5">
            {items.map((item) => (
              <div
                key={item.category}
                className="flex-1 text-center text-[10px] font-medium text-[#212121] truncate"
                title={item.category}
              >
                {getItemLegendLabel(vis, item.category)}
              </div>
            ))}
          </div>
        </div>
      );
      const showColLegend = !isTrendOrDate && vis.legendPosition && vis.legendPosition !== 'hide' && items.length <= 10;
      return wrapWithLegend(vis, colChart, showColLegend ? categoryLegendEntries : []);
    }

    // 7. DONUT & PIE CHARTS (SVG)
    if (vis.type === 'donut' || vis.type === 'pie') {
      const isDonut = vis.type === 'donut';
      const cx = 80;
      const cy = 80;
      const pieRadius = 68;
      const donutRadius = 54;
      const circumference = 2 * Math.PI * donutRadius;
      const rawPositiveSum = items.reduce((acc, x) => acc + Math.max(0, x.value), 0);
      const fallbackCountSum = items.reduce((acc, x) => acc + Math.max(1, x.count), 0) || 1;
      const pieOrDonutLabelPos: DataLabelPositionType = vis.dataLabelPosition || 'inside_center';
      let cumulativeShare = 0;

      const pieOrDonutSvg = (
        <div className="flex items-center justify-center py-2 px-2">
          <div className="relative w-52 h-48 flex items-center justify-center shrink-0">
            {isDonut ? (
              <svg
                viewBox="-36 -18 232 196"
                data-testid={`donut-svg-${vis.id}`}
                className="w-52 h-48 overflow-visible"
              >
                {items.map((item, idx) => {
                  const share =
                    rawPositiveSum > 0
                      ? Math.max(0, item.value) / rawPositiveSum
                      : Math.max(1, item.count) / fallbackCountSum;
                  const dash = share * circumference;
                  const offset = -cumulativeShare * circumference;
                  const startAngle = cumulativeShare * 2 * Math.PI - Math.PI / 2;
                  const endAngle = (cumulativeShare + share) * 2 * Math.PI - Math.PI / 2;
                  const midAngle = (startAngle + endAngle) / 2;
                  cumulativeShare += share;

                  const sliceColor = getItemColor(vis, item.category, idx);
                  const donutLabelRadius =
                    pieOrDonutLabelPos === 'outside_end'
                      ? 78
                      : pieOrDonutLabelPos === 'inside_end'
                      ? 61
                      : 54;
                  const lx = cx + donutLabelRadius * Math.cos(midAngle);
                  const ly = cy + donutLabelRadius * Math.sin(midAngle);
                  const lblText = formatDataLabel(vis, item.value, totalVal);

                  return (
                    <g key={item.category}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={donutRadius}
                        fill="transparent"
                        stroke={sliceColor}
                        strokeWidth={24}
                        strokeDasharray={`${dash} ${circumference}`}
                        strokeDashoffset={offset}
                        transform={`rotate(-90 ${cx} ${cy})`}
                        onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                        className="cursor-pointer transition-opacity hover:opacity-85"
                      >
                        <title>
                          {getItemLegendLabel(vis, item.category)}: {formatNum(item.value)} (
                          {(share * 100).toFixed(1)}%)
                        </title>
                      </circle>
                      {vis.showDataLabels && share >= 0.06 && (
                        <>
                          {pieOrDonutLabelPos === 'outside_end' && (
                            <line
                              x1={cx + 66 * Math.cos(midAngle)}
                              y1={cy + 66 * Math.sin(midAngle)}
                              x2={cx + 73 * Math.cos(midAngle)}
                              y2={cy + 73 * Math.sin(midAngle)}
                              stroke={sliceColor}
                              strokeWidth="1.2"
                            />
                          )}
                          <text
                            x={lx}
                            y={ly}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className={`text-[8.5px] font-mono font-bold pointer-events-none ${
                              pieOrDonutLabelPos === 'outside_end'
                                ? 'fill-[#212121]'
                                : 'fill-white drop-shadow'
                            }`}
                          >
                            {lblText}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            ) : (
              <svg
                viewBox="-36 -18 232 196"
                data-testid={`pie-svg-${vis.id}`}
                className="w-52 h-48 overflow-visible"
              >
                {items.map((item, idx) => {
                  const share =
                    rawPositiveSum > 0
                      ? Math.max(0, item.value) / rawPositiveSum
                      : Math.max(1, item.count) / fallbackCountSum;
                  const startAngle = cumulativeShare * 2 * Math.PI - Math.PI / 2;
                  const endAngle = (cumulativeShare + share) * 2 * Math.PI - Math.PI / 2;
                  const midAngle = (startAngle + endAngle) / 2;
                  cumulativeShare += share;

                  const sliceColor = getItemColor(vis, item.category, idx);
                  const lblText = formatDataLabel(vis, item.value, totalVal);

                  if (share >= 0.9999) {
                    const fullCirclePath = [
                      `M ${cx} ${cy - pieRadius}`,
                      `A ${pieRadius} ${pieRadius} 0 1 1 ${cx} ${cy + pieRadius}`,
                      `A ${pieRadius} ${pieRadius} 0 1 1 ${cx} ${cy - pieRadius}`,
                      'Z',
                    ].join(' ');
                    return (
                      <g
                        key={item.category}
                        onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                        className="cursor-pointer transition-opacity hover:opacity-90"
                      >
                        <path
                          d={fullCirclePath}
                          fill={sliceColor}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        >
                          <title>
                            {getItemLegendLabel(vis, item.category)}: {formatNum(item.value)} (100.0%)
                          </title>
                        </path>
                        {vis.showDataLabels && (
                          <text
                            x={cx}
                            y={
                              pieOrDonutLabelPos === 'outside_end'
                                ? cy - pieRadius - 10
                                : pieOrDonutLabelPos === 'inside_end'
                                ? cy - pieRadius * 0.72
                                : cy
                            }
                            textAnchor="middle"
                            dominantBaseline="central"
                            className={`text-[9px] font-mono font-bold pointer-events-none ${
                              pieOrDonutLabelPos === 'outside_end'
                                ? 'fill-[#212121]'
                                : 'fill-white drop-shadow'
                            }`}
                          >
                            {lblText}
                          </text>
                        )}
                      </g>
                    );
                  }

                  if (share <= 0) return null;

                  const x1 = cx + pieRadius * Math.cos(startAngle);
                  const y1 = cy + pieRadius * Math.sin(startAngle);
                  const x2 = cx + pieRadius * Math.cos(endAngle);
                  const y2 = cy + pieRadius * Math.sin(endAngle);
                  const largeArcFlag = share > 0.5 ? 1 : 0;

                  const pathData = [
                    `M ${cx} ${cy}`,
                    `L ${x1} ${y1}`,
                    `A ${pieRadius} ${pieRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                    'Z',
                  ].join(' ');

                  const labelRadius =
                    pieOrDonutLabelPos === 'outside_end'
                      ? pieRadius + 14
                      : pieOrDonutLabelPos === 'inside_end'
                      ? pieRadius * 0.76
                      : pieRadius * 0.5;
                  const lx = cx + labelRadius * Math.cos(midAngle);
                  const ly = cy + labelRadius * Math.sin(midAngle);

                  return (
                    <g
                      key={item.category}
                      onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                    >
                      <path
                        d={pathData}
                        fill={sliceColor}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      >
                        <title>
                          {getItemLegendLabel(vis, item.category)}: {formatNum(item.value)} (
                          {(share * 100).toFixed(1)}%)
                        </title>
                      </path>
                      {vis.showDataLabels && share >= 0.06 && (
                        <>
                          {pieOrDonutLabelPos === 'outside_end' && (
                            <line
                              x1={cx + pieRadius * Math.cos(midAngle)}
                              y1={cy + pieRadius * Math.sin(midAngle)}
                              x2={cx + (pieRadius + 8) * Math.cos(midAngle)}
                              y2={cy + (pieRadius + 8) * Math.sin(midAngle)}
                              stroke={sliceColor}
                              strokeWidth="1.2"
                            />
                          )}
                          <text
                            x={lx}
                            y={ly}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className={`text-[8.5px] font-mono font-bold pointer-events-none ${
                              pieOrDonutLabelPos === 'outside_end'
                                ? 'fill-[#212121]'
                                : 'fill-white drop-shadow'
                            }`}
                          >
                            {lblText}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
            {isDonut && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#605E5C]">
                  Total
                </span>
                <span className="text-sm font-extrabold text-[#212121] font-mono">
                  {formatNum(totalVal)}
                </span>
              </div>
            )}
          </div>
        </div>
      );

      return wrapWithLegend(vis, pieOrDonutSvg, categoryLegendEntries);
    }

    // 8. LINE & AREA TREND CHART (SVG)
    if (vis.type === 'line_area') {
      const width = 460;
      const height = 170;
      const padX = 28;
      const padY = 22;
      const usableW = width - padX * 2;
      const usableH = height - padY * 2;

      const pts = items.map((item, idx) => {
        const x =
          items.length === 1 ? width / 2 : padX + (idx / (items.length - 1)) * usableW;
        const y = padY + usableH - (Math.max(0, item.value) / maxVal) * usableH;
        return { x, y, ...item };
      });

      const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const areaPath =
        pts.length > 0
          ? `${linePath} L ${pts[pts.length - 1].x} ${padY + usableH} L ${pts[0].x} ${
              padY + usableH
            } Z`
          : '';
      const primaryColor = getItemColor(vis, items[0]?.category || 'line', 0);

      const lineChart = (
        <div className="pt-1">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 overflow-visible">
            <defs>
              <linearGradient id={`grad_${vis.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryColor} stopOpacity="0.45" />
                <stop offset="100%" stopColor={primaryColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#grad_${vis.id})`} />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={primaryColor}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}
            {pts.map((p, idx) => {
              const labelY =
                labelPos === 'inside_center'
                  ? p.y + 3
                  : labelPos === 'inside_end'
                  ? p.y + 13
                  : p.y - 9;
              return (
                <g
                  key={p.category}
                  onClick={() => toggleCrossFilter(vis.categoryCol, p.category)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                    fill={getItemColor(vis, p.category, idx)}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  {vis.showDataLabels && (
                    <text
                      x={p.x}
                      y={labelY}
                      textAnchor="middle"
                      className="fill-[#212121] text-[9px] font-mono font-bold"
                    >
                      {formatDataLabel(vis, p.value, totalVal)}
                    </text>
                  )}
                  <text
                    x={p.x}
                    y={height - 4}
                    textAnchor="middle"
                    className="fill-[#605E5C] text-[9px]"
                  >
                    {getItemLegendLabel(vis, p.category).slice(0, 10)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      );
      return wrapWithLegend(vis, lineChart, []);
    }

    // 8B. STACKED AREA CHART
    if (vis.type === 'stacked_area') {
      const maxVal = Math.max(1, ...items.map((it) => it.value));
      const width = 360;
      const height = 180;
      const points = items.map((it, idx) => ({
        x: items.length > 1 ? (idx / (items.length - 1)) * (width - 40) + 20 : width / 2,
        y: height - (it.value / maxVal) * (height - 40) - 20,
        category: it.category,
        value: it.value,
      }));
      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - 20} L ${points[0].x} ${height - 20} Z`;
      const col = getItemColor(vis, items[0]?.category || 'area', 0);

      const stackedAreaChart = (
        <div className="h-56 flex items-center justify-center p-2">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id={`grad-stacked-area-${vis.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={col} stopOpacity="0.65" />
                <stop offset="100%" stopColor={col} stopOpacity="0.08" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#grad-stacked-area-${vis.id})`} />
            <path d={linePath} fill="none" stroke={col} strokeWidth="2.5" />
            {points.map((p, idx) => (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#FFFFFF"
                stroke={col}
                strokeWidth="2"
                onClick={() => toggleCrossFilter(vis.categoryCol, p.category)}
                className="cursor-pointer hover:r-5 transition-all"
              />
            ))}
          </svg>
        </div>
      );
      return wrapWithLegend(vis, stackedAreaChart, []);
    }

    // 8C. WATERFALL CHART (VARIANCE BRIDGE)
    if (vis.type === 'waterfall') {
      let running = 0;
      const waterfallData = items.slice(0, 8).map((it) => {
        const prev = running;
        const change = it.value;
        running += change;
        return {
          category: it.category,
          value: change,
          start: prev,
          end: running,
          isTotal: false,
        };
      });
      waterfallData.push({
        category: 'Total',
        value: running,
        start: 0,
        end: running,
        isTotal: true,
      });

      const allEnds = waterfallData.map((d) => Math.max(d.start, d.end));
      const allStarts = waterfallData.map((d) => Math.min(d.start, d.end, 0));
      const maxVal = Math.max(1, ...allEnds);
      const minVal = Math.min(0, ...allStarts);
      const range = maxVal - minVal || 1;

      const waterfallChart = (
        <div className="h-56 pt-2 pb-1 flex items-end gap-2 overflow-x-auto">
          {waterfallData.map((d) => {
            const isPositive = d.value >= 0;
            const bottom = ((Math.min(d.start, d.end) - minVal) / range) * 100;
            const heightPct = Math.max(4, (Math.abs(d.value) / range) * 100);
            const barColor = d.isTotal ? '#2563EB' : isPositive ? '#107C10' : '#C50F1F';

            return (
              <div
                key={d.category}
                onClick={() => !d.isTotal && toggleCrossFilter(vis.categoryCol, d.category)}
                className="flex-1 min-w-[48px] h-full flex flex-col justify-end items-center relative group cursor-pointer"
              >
                <div
                  style={{ bottom: `${bottom}%`, height: `${heightPct}%`, backgroundColor: barColor }}
                  className="w-full rounded-sm absolute transition-all hover:brightness-110 shadow-xs flex flex-col items-center justify-center"
                >
                  {vis.showDataLabels && (
                    <span className="text-[9px] font-mono font-bold text-white px-1 truncate">
                      {d.isTotal ? formatNum(d.value) : isPositive ? `+${formatNum(d.value)}` : formatNum(d.value)}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-[#605E5C] truncate max-w-full font-medium mt-1">
                  {d.category}
                </span>
              </div>
            );
          })}
        </div>
      );
      return wrapWithLegend(vis, waterfallChart, [
        { key: 'pos', label: 'Increase (+)', color: '#107C10', filterCol: '' },
        { key: 'neg', label: 'Decrease (-)', color: '#C50F1F', filterCol: '' },
        { key: 'tot', label: 'Total', color: '#2563EB', filterCol: '' },
      ]);
    }

    // 8D. RADIAL GAUGE / KPI METER
    if (vis.type === 'gauge') {
      const metricVal = totalVal;
      const target = Math.round(metricVal * 1.25) || 1000;
      const maxGauge = Math.max(target * 1.2, metricVal * 1.2, 1);
      const pct = Math.min(100, Math.round((metricVal / target) * 100));
      const angle = Math.min(180, (metricVal / maxGauge) * 180);
      const targetAngle = Math.min(180, (target / maxGauge) * 180);

      const gaugeChart = (
        <div className="h-56 flex flex-col items-center justify-center relative p-3">
          <svg viewBox="0 0 200 120" className="w-48 h-32 overflow-visible">
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="16"
              strokeLinecap="round"
            />
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke={pct >= 100 ? '#107C10' : '#217346'}
              strokeWidth="16"
              strokeDasharray={`${(angle / 180) * 251.3} 251.3`}
              strokeLinecap="round"
            />
            <line
              x1="100"
              y1="100"
              x2={100 + 88 * Math.cos(Math.PI - (targetAngle * Math.PI) / 180)}
              y2={100 - 88 * Math.sin((targetAngle * Math.PI) / 180)}
              stroke="#DC2626"
              strokeWidth="2.5"
              strokeDasharray="3 3"
            />
          </svg>
          <div className="text-center mt-[-10px] space-y-0.5">
            <div className="text-2xl font-black text-[#212121] tracking-tight">
              {formatNum(metricVal)}
            </div>
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-[#605E5C]">Target: {formatNum(target)}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pct >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {pct}% of Goal
              </span>
            </div>
          </div>
        </div>
      );
      return wrapWithLegend(vis, gaugeChart, [
        { key: 'progress', label: 'Actual Progress', color: '#217346', filterCol: '' },
        { key: 'target', label: `Target (${formatNum(target)})`, color: '#DC2626', filterCol: '' },
      ]);
    }

    // 8E. FUNNEL PIPELINE CHART
    if (vis.type === 'funnel') {
      const maxVal = Math.max(1, ...items.map((it) => it.value));
      const funnelChart = (
        <div className="h-56 flex flex-col justify-center space-y-2 px-3 py-1">
          {items.slice(0, 6).map((it, idx, arr) => {
            const widthPct = Math.max(20, Math.round((it.value / maxVal) * 100));
            const prevVal = idx > 0 ? arr[idx - 1].value : it.value;
            const convPct = prevVal > 0 ? Math.round((it.value / prevVal) * 100) : 100;
            const col = getItemColor(vis, it.category, idx);

            return (
              <div
                key={it.category}
                onClick={() => toggleCrossFilter(vis.categoryCol, it.category)}
                className="cursor-pointer group space-y-0.5"
              >
                <div className="flex items-center justify-between text-xs text-[#212121]">
                  <span className="font-semibold truncate">{getItemLegendLabel(vis, it.category)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[11px]">{formatNum(it.value)}</span>
                    {idx > 0 && (
                      <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-600 font-mono">
                        {convPct}% conv.
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-5 rounded-md overflow-hidden flex justify-center p-0.5">
                  <div
                    style={{ width: `${widthPct}%`, backgroundColor: col }}
                    className="h-full rounded transition-all group-hover:brightness-110 flex items-center justify-center"
                  >
                    {vis.showDataLabels && widthPct > 35 && (
                      <span className="text-[10px] text-white font-mono font-bold drop-shadow">
                        {formatNum(it.value)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
      return wrapWithLegend(vis, funnelChart, categoryLegendEntries);
    }

    // 9. TREEMAP HIERARCHY VISUAL
    const treemapChart = (
      <div className="flex flex-wrap gap-1.5 h-52 pt-1 content-start overflow-hidden">
        {items.map((item, idx) => {
          const share = Math.max(8, Math.round((Math.max(0, item.value) / totalVal) * 100));
          const lblText = formatDataLabel(vis, item.value, totalVal);
          return (
            <div
              key={item.category}
              onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
              style={{
                flexBasis: `${Math.max(18, Math.min(100, share * 1.4))}%`,
                backgroundColor: getItemColor(vis, item.category, idx),
              }}
              className="flex-1 min-h-[64px] p-2.5 rounded border border-white/25 cursor-pointer hover:brightness-110 transition-all flex flex-col justify-between overflow-hidden"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-white truncate drop-shadow">
                  {getItemLegendLabel(vis, item.category)}
                </span>
                {vis.showDataLabels && labelPos === 'outside_end' && (
                  <span className="text-[10px] font-mono text-white font-semibold drop-shadow shrink-0">
                    {lblText}
                  </span>
                )}
              </div>
              {vis.showDataLabels && labelPos === 'inside_center' && (
                <div className="text-[11px] font-mono text-white font-bold drop-shadow text-center my-auto">
                  {lblText}
                </div>
              )}
              {vis.showDataLabels && labelPos === 'inside_end' && (
                <div className="text-[11px] font-mono text-white font-semibold drop-shadow text-right">
                  {lblText}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
    return wrapWithLegend(vis, treemapChart, categoryLegendEntries);
  };

  // The Dashboard opens as its own full-bleed sheet/tab over the workbench,
  // not a centered dialog: no dimmed backdrop, no rounded floating card, no
  // margins - it fills the viewport edge-to-edge like switching sheets,
  // and "Close" (below) returns to the data grid rather than "dismissing
  // a popup". The real F11/Fullscreen-API toggle still applies on top of
  // this for hiding the OS/browser chrome.
  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-50 bg-white"
    >
      <div className="bg-white overflow-hidden flex flex-col text-[#212121] w-screen h-screen border-0 rounded-none">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#D4D4D4] bg-[#F3F3F3]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#E6F2EB] border border-[#217346]/30 rounded-lg text-[#217346]">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#212121]">
                  Visual Dashboard &amp; Custom Visuals Studio
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 rounded">
                  Interactive Canvas
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-[#605E5C]">
                  Active Sheet / Query:
                </span>
                <select
                  aria-label="Active Sheet or Query"
                  data-testid="active-sheet-query-select"
                  value={
                    activeQueryId
                      ? `query:${activeQueryId}`
                      : `sheet:${selectedDataset?.id || ''}`
                  }
                  onChange={(e) => {
                    void handleSwitchSheetOrQuery(e.target.value);
                  }}
                  className="bg-white border border-[#217346]/60 hover:border-[#217346] rounded-md px-2.5 py-1 text-xs font-bold text-[#185C37] shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#217346]/30"
                >
                  <optgroup label="Sheets & Tables">
                    {datasets.map((ds) => (
                      <option key={`sheet:${ds.id}`} value={`sheet:${ds.id}`}>
                        📄 {ds.name} ({ds.row_count} rows)
                      </option>
                    ))}
                  </optgroup>
                  {queries.length > 0 && (
                    <optgroup label="Connections & Queries">
                      {queries.map((q) => (
                        <option key={`query:${q.id}`} value={`query:${q.id}`}>
                          🔗 {q.name} ({q.steps.length} steps)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <span className="text-xs text-[#605E5C] hidden xl:inline">
                  • Multi-select slicers, dynamic KPI cards, Table &amp; Matrix visuals
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Active Page Selector Dropdown in Top Header */}
            <select
              aria-label="Active Dashboard Page"
              data-testid="top-page-select"
              value={activePageId}
              onChange={(e) => handleSelectPage(e.target.value)}
              className="bg-white border border-[#217346]/50 rounded-lg px-2.5 py-1.5 text-xs text-[#185C37] font-bold shadow-sm"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  Page: {p.name}
                </option>
              ))}
            </select>

            {/* Canvas Zoom Dropdown near Global Theme */}
            <select
              aria-label="Canvas Zoom"
              data-testid="canvas-zoom-select"
              value={canvasZoom}
              onChange={(e) => setCanvasZoom(Number(e.target.value))}
              className="bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121] font-medium"
            >
              <option value={50}>Zoom: 50%</option>
              <option value={75}>Zoom: 75%</option>
              <option value={100}>Zoom: 100% (16:9)</option>
              <option value={150}>Zoom: 150%</option>
              <option value={200}>Zoom: 200%</option>
            </select>

            <select
              aria-label="Dashboard Color Theme"
              value={paletteId}
              onChange={(e) => {
                const nextTheme = e.target.value as PaletteId;
                setPaletteId(nextTheme);
                setVisuals((prev) =>
                  prev.map((v) => ({
                    ...v,
                    paletteId: nextTheme,
                    customColors: {},
                  }))
                );
              }}
              className="bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121] font-medium"
            >
              {Object.entries(COLOR_PALETTES).map(([id, p]) => (
                <option key={id} value={id}>
                  Global Theme: {p.name}
                </option>
              ))}
            </select>

            {/* DOWNLOAD SPLIT BUTTON */}
            {SHARE_EXPORT_ENABLED && (
              <div className="relative inline-flex items-center shadow-sm rounded-md" ref={downloadMenuRef}>
                <button
                  type="button"
                  data-testid="dashboard-download-btn"
                  onClick={() => handleQuickDownload('sswb_html')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#217346] hover:bg-[#185C37] text-white text-xs font-bold rounded-l-md transition-colors"
                  title="Download StepSheet Universal Packaged Workbook (.sswb.html) — opens on all systems (Windows, Mac, Linux, Mobile)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Packaged Workbook</span>
                </button>
                <button
                  type="button"
                  data-testid="dashboard-download-dropdown-btn"
                  onClick={() => {
                    setIsDownloadMenuOpen(!isDownloadMenuOpen);
                    setIsShareMenuOpen(false);
                  }}
                  className="p-1.5 bg-[#185C37] hover:bg-[#104227] text-white border-l border-[#2e8b55] rounded-r-md transition-colors"
                  title="More download and deliverable options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isDownloadMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 z-[100] text-xs">
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('sswb_html')}
                      className="w-full text-left px-3 py-2 bg-emerald-50/70 hover:bg-emerald-100/70 flex items-center gap-2.5 text-gray-900 border-b border-emerald-100"
                    >
                      <Sparkles className="w-4 h-4 text-[#217346] shrink-0" />
                      <div>
                        <div className="font-bold text-[#185C37]">Universal Packaged Workbook (.sswb.html)</div>
                        <div className="text-[10px] text-gray-600">Opens in all systems (Windows, Mac, Mobile). Interactive visuals, KPIs &amp; full dataset</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('sswb')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <Database className="w-4 h-4 text-purple-700 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">StepSheet Package (.sswb)</div>
                        <div className="text-[10px] text-gray-500">Raw package format for StepSheet backup &amp; re-import</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenExport('files', 'xlsx_values')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 font-semibold text-gray-800"
                    >
                      <Download className="w-4 h-4 text-[#217346]" />
                      <div>
                        <div>Export &amp; Share Studio...</div>
                        <div className="text-[10px] text-gray-500 font-normal">Custom row scope, exclusions, all formats</div>
                      </div>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('xlsx')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-green-700 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">Packaged Workbook (.xlsx)</div>
                        <div className="text-[10px] text-gray-500">Dashboard summary with native Excel charts, KPIs &amp; raw data</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('pdf')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <FileText className="w-4 h-4 text-red-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">PDF Executive Dashboard (.pdf)</div>
                        <div className="text-[10px] text-gray-500">Multi-page report with KPIs, chart breakdowns &amp; metrics</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintDashboard}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">Print / Save as PDF (Browser Print)</div>
                        <div className="text-[10px] text-gray-500">Native browser print dialog on graphical canvas</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('pptx')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <Presentation className="w-4 h-4 text-orange-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">Interactive PowerPoint (.pptx)</div>
                        <div className="text-[10px] text-gray-500">Presentation deck with native PowerPoint charts on every slide</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('html')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <Activity className="w-4 h-4 text-teal-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">Standalone HTML Dashboard (.html)</div>
                        <div className="text-[10px] text-gray-500">Single-file interactive offline dashboard with charts</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('csv')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <Database className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">CSV Data File (.csv)</div>
                        <div className="text-[10px] text-gray-500">Filtered data rows matching active dashboard</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDownload('powerbi_starter')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                    >
                      <Archive className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">Power BI Starter Pack (.zip)</div>
                        <div className="text-[10px] text-gray-500">CSV, Power Query M script &amp; data model notes</div>
                      </div>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => handleOpenExport('history')}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-gray-600"
                    >
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>Export History...</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SHARE SPLIT BUTTON */}
            {SHARE_EXPORT_ENABLED && (
              <div className="relative inline-flex items-center shadow-sm rounded-md" ref={shareMenuRef}>
                <button
                  type="button"
                  data-testid="dashboard-share-btn"
                  onClick={() => handleOpenExport('link')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-bold rounded-l-md transition-colors"
                  title="Share Dashboard & Project Link"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#217346]" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  data-testid="dashboard-share-dropdown-btn"
                  onClick={() => {
                    setIsShareMenuOpen(!isShareMenuOpen);
                    setIsDownloadMenuOpen(false);
                  }}
                  className="p-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-l-0 border-gray-300 rounded-r-md transition-colors"
                  title="More share options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isShareMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 z-[100] text-xs">
                    <button
                      type="button"
                      onClick={() => handleOpenExport('link')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 font-semibold text-gray-800"
                    >
                      <Share2 className="w-4 h-4 text-[#217346]" />
                      <div>
                        <div>Shareable Link &amp; Access...</div>
                        <div className="text-[10px] text-gray-500 font-normal">Generate links with roles &amp; passcode</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const currentUrl = window.location.href;
                        await navigator.clipboard.writeText(currentUrl);
                        setCopiedLinkFeedback(true);
                        setTimeout(() => setCopiedLinkFeedback(false), 2000);
                        setIsShareMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                    >
                      <Copy className="w-4 h-4 text-gray-500" />
                      <span>{copiedLinkFeedback ? 'Copied to Clipboard!' : 'Copy Dashboard Link'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const title = selectedDataset?.name || 'Dashboard';
                        const subject = encodeURIComponent(`StepSheet Dashboard: ${title}`);
                        const body = encodeURIComponent(
                          `Hi,\n\nCheck out the StepSheet visual dashboard for "${title}".\n\nLink: ${window.location.href}`
                        );
                        window.location.href = `mailto:?subject=${subject}&body=${body}`;
                        setIsShareMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                    >
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span>Email Dashboard (Mailto)...</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleResetDashboard}
              title="Reset Dashboard to default visuals and KPIs"
              className="p-1.5 text-[#605E5C] hover:text-[#212121] rounded-lg hover:bg-[#E6E6E6] border border-[#D4D4D4]"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-testid="dashboard-fullscreen-btn"
              onClick={toggleFullScreen}
              title={isFullScreen ? 'Exit Full Screen (Esc)' : 'Expand to Full Screen (F11)'}
              className={`p-1.5 rounded-lg border transition-colors ${
                isFullScreen
                  ? 'bg-[#185C37] text-white border-[#185C37] hover:bg-[#124629]'
                  : 'text-[#605E5C] hover:text-[#212121] rounded-lg hover:bg-[#E6E6E6] border-[#D4D4D4]'
              }`}
            >
              {isFullScreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            {/* Reads as leaving this sheet and returning to the data grid,
                not dismissing a dialog - matches the full-bleed takeover
                above (no X-only affordance on a borderless full page). */}
            <button
              type="button"
              onClick={onClose}
              title="Back to Sheet"
              className="flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 text-xs font-bold text-[#605E5C] hover:text-[#212121] rounded-lg hover:bg-[#E6E6E6] border border-[#D4D4D4] ml-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Sheet</span>
            </button>
          </div>
        </div>

        
        {/* AI Dashboard Prompt & Conversational Refinement Bar */}
        <AiDashboardPromptBar
          datasetId={selectedDataset?.id || 'active_dataset'}
          datasetName={selectedDataset?.name || 'Dataset'}
          columns={columns}
          rows={sourceRows}
          selectedVisualId={selectedVisualId}
          onSelectVisual={(id) => {
            setSelectedVisualId(id);
            setSelectedKpiId(null);
          }}
          currentDashboard={{
            dashboardTitle,
            visuals,
            kpiCards,
            slicerColumns,
            paletteId,
          }}
          onApplyGeneratedDashboard={(plan) => {
            pushUndoSnapshot(visualsRef.current);
            const adjustedVisuals = ensureVisualCanvasCoords(plan.visuals);
            setDashboardTitle(plan.dashboardTitle);
            setVisuals(adjustedVisuals);
            setKpiCards(plan.kpiCards);
            setSlicerColumns(plan.slicerColumns);
            setPaletteId(plan.paletteId);
            setMultiSlicerSelections({});
            setCrossFilter(null);
            setPages((prevPages) =>
              prevPages.map((p) =>
                p.id === activePageId
                  ? {
                      ...p,
                      dashboardTitle: plan.dashboardTitle,
                      visuals: adjustedVisuals,
                      kpiCards: plan.kpiCards,
                      slicerColumns: plan.slicerColumns,
                      paletteId: plan.paletteId,
                    }
                  : p
              )
            );
            if (adjustedVisuals[0]) {
              setSelectedVisualId(adjustedVisuals[0].id);
              setSelectedVisualIds([adjustedVisuals[0].id]);
            }
            try {
              if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
                const dsKey = selectedDataset?.id || 'default';
                const raw = window.localStorage.getItem(STORAGE_KEY_DASHBOARDS);
                const parsed = raw ? JSON.parse(raw) : {};
                const currentPagesList = pages.length > 0 ? pages : [{ id: activePageId, name: 'Page 1', datasetId: selectedDataset?.id, queryId: activeQueryId, dashboardTitle: plan.dashboardTitle, visuals: adjustedVisuals, kpiCards: plan.kpiCards, slicerColumns: plan.slicerColumns, paletteId: plan.paletteId }];
                const updatedPagesList = currentPagesList.map((p) =>
                  p.id === activePageId
                    ? {
                        ...p,
                        dashboardTitle: plan.dashboardTitle,
                        visuals: adjustedVisuals,
                        kpiCards: plan.kpiCards,
                        slicerColumns: plan.slicerColumns,
                        paletteId: plan.paletteId,
                      }
                    : p
                );
                parsed[dsKey] = {
                  dashboardTitle: plan.dashboardTitle,
                  visuals: adjustedVisuals,
                  kpiCards: plan.kpiCards,
                  slicerColumns: plan.slicerColumns,
                  paletteId: plan.paletteId,
                  pages: updatedPagesList,
                  activePageId: activePageId,
                };
                window.localStorage.setItem(STORAGE_KEY_DASHBOARDS, JSON.stringify(parsed));
              }
            } catch (err) {
              console.error('Failed to persist AI dashboard:', err);
            }
          }}
          onApplyPatch={(updated) => {
            pushUndoSnapshot(visualsRef.current);
            setDashboardTitle(updated.dashboardTitle);
            setVisuals(updated.visuals);
            setKpiCards(updated.kpiCards);
            setSlicerColumns(updated.slicerColumns);
            setPaletteId(updated.paletteId);
            setPages((prevPages) =>
              prevPages.map((p) =>
                p.id === activePageId
                  ? {
                      ...p,
                      dashboardTitle: updated.dashboardTitle,
                      visuals: updated.visuals,
                      kpiCards: updated.kpiCards,
                      slicerColumns: updated.slicerColumns,
                      paletteId: updated.paletteId,
                    }
                  : p
              )
            );
          }}
          onOpenLocalAiSetup={() => setIsLocalAiSetupOpen(true)}
        />

        {/* Multi-Slicer & Cross-Filter Bar */}
        <div className="px-6 py-1.5 bg-[#F8F9FA] border-b border-[#D4D4D4] flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#217346] flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Slicers (Multi-Select):
              </span>
              <button
                type="button"
                onClick={handleAddTopSlicer}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 hover:bg-[#cce5d6] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Slicer Filter
              </button>
              {Object.values(multiSlicerSelections).some((arr) => arr.length > 0) && (
                <button
                  type="button"
                  onClick={() => setMultiSlicerSelections({})}
                  className="text-[11px] font-semibold text-[#C50F1F] hover:underline ml-1"
                >
                  Clear All Slicers
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {crossFilter && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E6F2EB] border border-[#217346]/40 text-xs text-[#185C37] font-semibold">
                  <span>
                    Cross-Filter: <strong>{crossFilter.column}</strong> ={' '}
                    <strong>{crossFilter.value}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCrossFilter(null)}
                    className="hover:text-[#C50F1F] ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="text-xs text-[#605E5C] font-mono">
                Showing <strong className="text-[#212121]">{filteredRows.length}</strong> of{' '}
                {sourceRows.length} rows
              </div>
            </div>
          </div>

          {slicerColumns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {slicerColumns.map((col) => {
                const vals = getDistinctValuesForColumn(col);
                const selectedVals = multiSlicerSelections[col] || [];
                const isOpen = openSlicerDropdown === col;
                const summary =
                  selectedVals.length === 0
                    ? 'All'
                    : selectedVals.length === 1
                    ? selectedVals[0]
                    : `${selectedVals.length} selected`;
                const visibleVals = slicerSearchText.trim()
                  ? vals.filter((v) => v.toLowerCase().includes(slicerSearchText.trim().toLowerCase()))
                  : vals;

                return (
                  <div
                    key={col}
                    className="relative flex items-center gap-1 bg-white border border-[#D4D4D4] rounded-[2px] shadow-sm"
                    ref={isOpen ? slicerDropdownRef : undefined}
                  >
                    <select
                      aria-label={`Slicer Column ${col}`}
                      value={col}
                      onChange={(e) => handleChangeTopSlicerColumn(col, e.target.value)}
                      className="bg-[#F3F3F3] border-r border-[#D4D4D4] rounded-l-[2px] pl-2 pr-1 py-1 text-[11px] font-bold text-[#212121] max-w-[110px]"
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        setSlicerSearchText('');
                        setOpenSlicerDropdown(isOpen ? null : col);
                      }}
                      className={`flex items-center gap-1.5 pl-1.5 pr-2 py-1 text-[11px] font-semibold max-w-[150px] ${
                        selectedVals.length > 0 ? 'text-[#185C37]' : 'text-[#444444]'
                      }`}
                      title={selectedVals.length > 0 ? selectedVals.join(', ') : 'All values'}
                    >
                      <span className="truncate">{summary}</span>
                      <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {slicerColumns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTopSlicer(col)}
                        title="Remove this Slicer"
                        className="p-1 text-[#605E5C] hover:text-[#C50F1F] border-l border-[#D4D4D4]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    {isOpen && (
                      <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-[#8A8886] rounded-[2px] shadow-lg z-50 flex flex-col overflow-hidden">
                        <div className="p-1.5 border-b border-[#E1E1E1]">
                          <input
                            type="text"
                            autoFocus
                            value={slicerSearchText}
                            onChange={(e) => setSlicerSearchText(e.target.value)}
                            placeholder={`Search ${col}...`}
                            className="w-full text-[11px] border border-[#D4D4D4] rounded-[2px] px-2 py-1 focus:outline-none focus:border-[#217346]"
                          />
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 border-b border-[#E1E1E1] text-[10px]">
                          <span className="text-[#605E5C]">
                            {selectedVals.length === 0 ? 'Showing all values' : `${selectedVals.length} of ${vals.length} selected`}
                          </span>
                          <button
                            type="button"
                            onClick={() => clearColumnSlicer(col)}
                            disabled={selectedVals.length === 0}
                            className="font-semibold text-[#217346] hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto chips-scrollbar py-1">
                          {visibleVals.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-[#605E5C]">No matching values.</div>
                          )}
                          {visibleVals.map((v) => {
                            const isPicked = selectedVals.includes(v);
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={() => toggleSlicerValue(col, v)}
                                className="w-full flex items-center gap-2 px-2.5 py-1 text-[11px] text-left hover:bg-[#F3F3F3]"
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded-[2px] border shrink-0 flex items-center justify-center ${
                                    isPicked
                                      ? 'bg-[#217346] border-[#217346] text-white'
                                      : 'border-[#8A8886] bg-white'
                                  }`}
                                >
                                  {isPicked && <Check className="w-2.5 h-2.5" />}
                                </span>
                                <span className="truncate text-[#212121]">{v}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Main Body: Left Canvas + Right Visualizations & Formatting Inspector Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Interactive Dashboard Canvas */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-br from-[#EFF7F2]/80 via-[#F8FAFC] to-[#EEF2F6] min-h-full">
            {/* Executive Hero / Profile Banner (Dashboard V22 Glassmorphism) */}
            <div className="rounded-2xl backdrop-blur-xl bg-white/75 border border-white/60 shadow-xs hover:shadow-md transition-all p-4 mb-2 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 flex-1 min-w-[280px]">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-md shadow-emerald-500/20 shrink-0">
                  <div className="w-full h-full rounded-[14px] bg-white/95 backdrop-blur-sm flex items-center justify-center text-emerald-700 font-black text-base">
                    {selectedDataset?.name ? selectedDataset.name.slice(0, 2).toUpperCase() : 'DB'}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      aria-label="Dashboard Title"
                      value={dashboardTitle}
                      onChange={(e) => setDashboardTitle(e.target.value)}
                      placeholder="Enter Dashboard Title..."
                      className="bg-transparent hover:bg-white/60 focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-emerald-500 rounded-md px-1.5 py-0.5 text-base font-black text-slate-800 tracking-tight transition-all focus:outline-none max-w-md truncate"
                    />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live DuckDB OLAP
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 font-medium">
                    <span>{selectedDataset?.name || 'Dataset'}</span>
                    <span>•</span>
                    <span>{filteredRows.length.toLocaleString()} records</span>
                    <span>•</span>
                    <span>{columns.length} columns</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-semibold">Glassmorphic V22 Theme</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAddKpiCard}
                  className="px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 text-xs font-semibold text-slate-700 hover:text-emerald-700 shadow-2xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Add KPI Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddVisual()}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Visual</span>
                </button>
              </div>
            </div>

            {/* Executive AI Insights Narrative Banner (Glassmorphism V22) */}
            {(() => {
              if (filteredRows.length === 0 || columns.length === 0) return null;

              const numCols = columns.filter((c: any) => {
                const dt = String(c.data_type || c.type || '').toLowerCase();
                const name = String(c.name || '').toLowerCase();
                return ['amount', 'revenue', 'sales', 'profit', 'quantity', 'balance', 'salary', 'credit_limit'].some(k => name.includes(k)) || ['integer', 'float', 'number'].includes(dt);
              });
              const primaryMeas = numCols[0]?.name || columns.find((c: any) => !String(c.name || '').toLowerCase().endsWith('id'))?.name;
              const catCols = columns.filter((c: any) => {
                const name = String(c.name || '').toLowerCase();
                return !name.endsWith('_id') && name !== 'id' && !numCols.some((nc: any) => nc.name === c.name);
              });

              const isBroadCat = (name: string) =>
                /^(category|segment|type|department|division|group|tier|status|channel|market|class|stage)$/i.test(name) ||
                /(category|segment|department|division|tier|channel)/i.test(name);
              const isGeoCol = (name: string) =>
                /region|country|state|city|territory|location|zone|area/i.test(name);
              const isGranularEntity = (name: string) =>
                /customer|client|account|product|item|sku|vendor|supplier|user|rep|employee/i.test(name);
              const isDateCol = (name: string) =>
                /date|time|timestamp|day|month|year|period/i.test(name);

              // Prioritize broad strategic categories for Executive Takeaway, then geo, then others
              const primaryD =
                catCols.find((c: any) => isBroadCat(c.name) && !isDateCol(c.name))?.name ||
                catCols.find((c: any) => !isGranularEntity(c.name) && !isDateCol(c.name) && !isGeoCol(c.name))?.name ||
                catCols.find((c: any) => isGeoCol(c.name))?.name ||
                catCols.find((c: any) => !isDateCol(c.name))?.name ||
                columns[0]?.name;

              const geoD =
                catCols.find((c: any) => isGeoCol(c.name) && c.name !== primaryD)?.name ||
                catCols.find((c: any) => isGeoCol(c.name))?.name;

              const entityD =
                catCols.find((c: any) => isGranularEntity(c.name) && c.name !== primaryD)?.name;

              let topCatName = '';
              let topCatSum = 0;
              let totalMeasSum = 0;
              let topGeoName = '';
              let topGeoCount = 0;
              let topEntityName = '';
              let topEntitySum = 0;

              if (primaryMeas) {
                const catMap = new Map<string, number>();
                const geoMap = new Map<string, number>();
                const entityMap = new Map<string, number>();
                for (const r of filteredRows) {
                  const v = Number(r[primaryMeas]) || 0;
                  totalMeasSum += v;
                  if (primaryD) {
                    const ck = String(r[primaryD] ?? 'Other');
                    catMap.set(ck, (catMap.get(ck) || 0) + v);
                  }
                  if (geoD) {
                    const gk = String(r[geoD] ?? 'General');
                    geoMap.set(gk, (geoMap.get(gk) || 0) + 1);
                  }
                  if (entityD) {
                    const ek = String(r[entityD] ?? 'Other');
                    entityMap.set(ek, (entityMap.get(ek) || 0) + v);
                  }
                }
                for (const [k, v] of catMap.entries()) {
                  if (v > topCatSum) {
                    topCatSum = v;
                    topCatName = k;
                  }
                }
                for (const [k, v] of geoMap.entries()) {
                  if (v > topGeoCount) {
                    topGeoCount = v;
                    topGeoName = k;
                  }
                }
                for (const [k, v] of entityMap.entries()) {
                  if (v > topEntitySum) {
                    topEntitySum = v;
                    topEntityName = k;
                  }
                }
              }

              const topCatNumPct = totalMeasSum > 0 ? (topCatSum / totalMeasSum) * 100 : 0;
              const topCatPct = totalMeasSum > 0 ? `${topCatNumPct.toFixed(1)}%` : '0%';
              const avgDeal = filteredRows.length > 0 ? (totalMeasSum / filteredRows.length) : 0;
              const isCurr = primaryMeas && ['amount', 'revenue', 'sales', 'price', 'cost', 'spend', 'budget', 'salary', 'credit_limit'].some(k => primaryMeas.toLowerCase().includes(k));
              const prefix = isCurr ? '$' : '';

              const isSalesDomain = columns.some((c: any) => /sales|order|revenue|amount|customer|product/i.test(String(c.name || '')));
              const domainLabel = isSalesDomain ? 'SALES & REVENUE INTELLIGENCE' : 'EXECUTIVE BUSINESS INTELLIGENCE';

              return (
                <div
                  data-testid="executive-ai-insights-banner"
                  className="rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 backdrop-blur-xl p-4 shadow-sm relative overflow-hidden transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {domainLabel}
                          </span>
                          <span className="text-[11px] font-bold text-slate-800">
                            Executive Strategic Takeaway
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed">
                          {topCatName ? (
                            <>
                              {topCatNumPct >= 15 ? (
                                <>
                                  <strong className="text-slate-900 font-bold">{topCatName}</strong> is the primary volume driver contributing{' '}
                                  <strong className="text-emerald-700 font-bold">{prefix}{formatNum(topCatSum)} ({topCatPct})</strong> of overall{' '}
                                  {primaryMeas}.{' '}
                                </>
                              ) : (
                                <>
                                  Volume is distributed across {primaryD}, led by <strong className="text-slate-900 font-bold">{topCatName}</strong> with{' '}
                                  <strong className="text-emerald-700 font-bold">{prefix}{formatNum(topCatSum)} ({topCatPct})</strong> of overall {primaryMeas}.{' '}
                                </>
                              )}
                              {topEntityName && (
                                <>
                                  Key account driver is <strong className="text-slate-900 font-bold">{topEntityName}</strong> ({prefix}{formatNum(topEntitySum)}).{' '}
                                </>
                              )}
                              {topGeoName && (
                                <>
                                  Regional activity is led by <strong className="text-slate-900 font-bold">{topGeoName}</strong> across{' '}
                                  <strong className="text-slate-900 font-bold">{topGeoCount} transactions</strong>.{' '}
                                </>
                              )}
                              Across all <strong className="text-slate-900 font-bold">{filteredRows.length.toLocaleString()} records</strong>, the average transaction benchmark is{' '}
                              <strong className="text-teal-700 font-bold">{prefix}{formatNum(avgDeal)}</strong>.
                            </>
                          ) : (
                            `Executive analytics generated for ${selectedDataset?.name || 'Dataset'} across ${filteredRows.length} active records.`
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 border border-white/60 shadow-2xs text-[11px]">
                        <span className="text-slate-400 font-bold">Top Driver:</span>
                        <span className="font-extrabold text-slate-800 truncate max-w-[120px]">{topCatName || '-'}</span>
                        <span className="text-emerald-700 font-black">{topCatPct}</span>
                      </div>
                      <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 border border-white/60 shadow-2xs text-[11px]">
                        <span className="text-slate-400 font-bold">Mean Benchmark:</span>
                        <span className="font-extrabold text-teal-800">{prefix}{formatNum(avgDeal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Dynamic KPI Cards Section */}
            <div className="space-y-3">

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {kpiCards.map((kpi, kpiIdx) => {
                  const val = computeMetric(filteredRows, kpi.column, kpi.aggFunc);
                  const isKpiSelected = selectedKpiId === kpi.id;
                  const iconTint = kpiIdx === 0 ? 'bg-emerald-500/10 text-emerald-600' : kpiIdx === 1 ? 'bg-teal-500/10 text-teal-600' : kpiIdx === 2 ? 'bg-orange-500/10 text-orange-600' : 'bg-sky-500/10 text-sky-600';
                  return (
                    <div
                      key={kpi.id}
                      onClick={() => {
                        setSelectedKpiId(kpi.id);
                        setSelectedVisualId(null);
                      }}
                      style={{
                        ...(kpi.backgroundColor ? { backgroundColor: kpi.backgroundColor } : {}),
                        ...(kpi.showBorder === false
                          ? { borderWidth: 0 }
                          : kpi.borderColor
                          ? { borderColor: kpi.borderColor }
                          : {}),
                        ...(kpi.borderRadius !== undefined ? { borderRadius: `${kpi.borderRadius}px` } : {}),
                      }}
                      className={`p-5 ${
                        kpi.borderRadius !== undefined ? '' : 'rounded-2xl'
                      } backdrop-blur-xl transition-all cursor-pointer flex flex-col justify-between ${
                        isKpiSelected
                          ? `border-2 border-emerald-600 ring-4 ring-emerald-500/20 shadow-lg${
                              kpi.backgroundColor ? '' : ' bg-white/95'
                            }`
                          : `border border-white/60 hover:border-emerald-200 shadow-xs hover:shadow-md${
                              kpi.backgroundColor ? '' : ' bg-white/75 hover:bg-white/90'
                            }`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            style={{
                              fontSize: kpi.titleFontSize ? `${kpi.titleFontSize}px` : undefined,
                              color: kpi.titleColor || undefined,
                              textAlign: kpi.titleAlign || undefined,
                              fontWeight: kpi.titleBold === false ? 500 : undefined,
                              display: kpi.titleAlign && kpi.titleAlign !== 'left' ? 'block' : undefined,
                            }}
                            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            {kpi.title}
                          </span>
                          <div
                            style={{ color: kpi.accentColor || '#0F172A' }}
                            className="text-2xl font-black font-sans my-1 tracking-tight"
                          >
                            {(() => {
                              const colLower = (kpi.column || '').toLowerCase();
                              const isCurr = ['amount', 'revenue', 'sales', 'price', 'cost', 'discount', 'spend', 'budget', 'profit'].some((c) => colLower.includes(c));
                              const prefix = isCurr && (kpi.aggFunc as string) !== 'distinct_count' && (kpi.aggFunc as string) !== 'distinct' && kpi.aggFunc !== 'count' ? '$' : '';
                              return `${prefix}${formatNum(val)}`;
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className={`w-9 h-9 rounded-xl ${iconTint} flex items-center justify-center font-bold`}>
                            <TrendingUp className="w-4 h-4" />
                          </div>
                          <div
                            className="flex items-center gap-0.5 ml-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedKpiId(kpi.id);
                                setSelectedVisualId(null);
                              }}
                              title="Edit KPI Card"
                              className="p-1 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-slate-100"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateKpiCard(kpi)}
                              title="Duplicate KPI Card"
                              className="p-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            {kpiCards.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveKpiCard(kpi.id)}
                                title="Remove KPI Card"
                                className="p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const sub = (kpi.subtitle || '').trim();
                        const match = sub.match(/([+-]?\d+(?:\.\d+)?%)\s*(.*)/i);
                        if (match) {
                          const delta = match[1];
                          const rest = match[2]?.trim().replace(/^vs\s*/i, 'vs ') || '';
                          const isNegative = delta.startsWith('-');
                          const Icon = isNegative ? ArrowDownRight : ArrowUpRight;
                          const badgeClass = isNegative
                            ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
                          return (
                            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-slate-100/80">
                              <span
                                data-testid={`kpi-delta-badge-${kpi.id}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}
                              >
                                <Icon className="w-3 h-3" /> {delta}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono uppercase font-bold truncate ml-2 text-right">
                                {rest ? `${kpi.aggFunc} • ${rest}` : kpi.aggFunc}
                              </span>
                            </div>
                          );
                        }

                        const aggUpper = (kpi.aggFunc || 'SUM').toUpperCase().replace('_', ' ');
                        let label = aggUpper;
                        let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200/60';

                        if ((kpi.aggFunc as string) === 'distinct_count' || kpi.aggFunc === 'distinct') {
                          label = 'DISTINCT';
                          badgeClass = 'bg-sky-50 text-sky-700 border-sky-200/60';
                        } else if (kpi.aggFunc === 'count') {
                          label = 'COUNT';
                          badgeClass = 'bg-orange-50 text-orange-700 border-orange-200/60';
                        } else if (kpi.aggFunc === 'avg') {
                          label = 'AVERAGE';
                          badgeClass = 'bg-teal-50 text-teal-700 border-teal-200/60';
                        } else if (kpi.aggFunc === 'max') {
                          label = 'PEAK MAX';
                          badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/60';
                        } else if (kpi.aggFunc === 'min') {
                          label = 'MIN';
                          badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200/60';
                        }

                        return (
                          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-slate-100/80">
                            <span
                              data-testid={`kpi-delta-badge-${kpi.id}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}
                            >
                              <Activity className="w-3 h-3" /> {label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono uppercase font-bold truncate ml-2 text-right">
                              {sub ? sub : kpi.column || aggUpper}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              role="status"
              aria-live="polite"
              data-testid="canvas-aria-live"
              className="sr-only"
            >
              {ariaAnnouncement}
            </div>

            {/* Freeform 2D Visual Canvas (Supports Press & Hold Drag, Snapping, Alignment Guides, 8-Way Resize & Multi-Select) */}
            <div
              data-testid="visuals-canvas-grid"
              style={{
                minHeight: `${Math.max(
                  740,
                  ...visuals.map(
                    (v, idx) =>
                      (v.y ?? 16 + Math.floor(idx / 2) * (DEFAULT_TILE_H + DEFAULT_TILE_GAP)) +
                      (v.customHeight || DEFAULT_TILE_H) +
                      48
                  )
                )}px`,
                backgroundImage: snapToGrid
                  ? 'radial-gradient(#CBD5E1 1.2px, transparent 1.2px)'
                  : undefined,
                backgroundSize: '16px 16px',
                transform: canvasZoom !== 100 ? `scale(${canvasZoom / 100})` : undefined,
                transformOrigin: 'top left',
              }}
              className="relative w-full rounded-xl border border-[#D4D4D4] bg-[#F8FAFC] overflow-x-auto overflow-y-visible"
            >
              {/* Smart Alignment Guide Lines Overlay */}
              {alignmentGuides.map((g) =>
                g.orientation === 'vertical' ? (
                  <div
                    key={g.id}
                    data-testid="alignment-guide-vertical"
                    style={{
                      position: 'absolute',
                      left: `${g.position}px`,
                      top: `${g.start}px`,
                      height: `${Math.max(24, g.end - g.start)}px`,
                      zIndex: 60,
                    }}
                    className="pointer-events-none border-l-2 border-dashed border-[#E11D48]"
                  >
                    {g.label && (
                      <span className="px-1 py-0.5 rounded bg-[#E11D48] text-white text-[9px] font-mono font-bold shadow ml-1">
                        {g.label}
                      </span>
                    )}
                  </div>
                ) : (
                  <div
                    key={g.id}
                    data-testid="alignment-guide-horizontal"
                    style={{
                      position: 'absolute',
                      top: `${g.position}px`,
                      left: `${g.start}px`,
                      width: `${Math.max(24, g.end - g.start)}px`,
                      zIndex: 60,
                    }}
                    className="pointer-events-none border-t-2 border-dashed border-[#E11D48]"
                  >
                    {g.label && (
                      <span className="px-1 py-0.5 rounded bg-[#E11D48] text-white text-[9px] font-mono font-bold shadow mt-1 inline-block">
                        {g.label}
                      </span>
                    )}
                  </div>
                )
              )}

              {visuals.length === 0 && (
                <div
                  data-testid="fresh-page-empty-state"
                  className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center select-none"
                >
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mb-4 shadow-sm">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-1">
                    Fresh Canvas — {pages.find((p) => p.id === activePageId)?.name || 'New Page'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mb-5 leading-relaxed">
                    This page is completely fresh and ready for your custom analytics. Use the AI prompt bar above to generate visuals, or add charts and KPI cards manually.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleAddVisual()}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Add Visual
                    </button>
                    <button
                      type="button"
                      onClick={handleAddKpiCard}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:text-emerald-700 shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-emerald-600" /> Add KPI Card
                    </button>
                  </div>
                </div>
              )}

              {visuals.map((vis, idx) => {
                const isSelected = !selectedKpiId && vis.id === activeVisual?.id;
                const isMultiSelected = !selectedKpiId && selectedVisualIds.includes(vis.id);
                const typeMeta = VISUAL_TYPES.find((t) => t.type === vis.type);
                const isEditingTitle = editingTitleVisId === vis.id;
                const isHoverDragging =
                  hoverDragVisId === vis.id ||
                  (hoverDragVisId !== null &&
                    selectedVisualIds.includes(hoverDragVisId) &&
                    selectedVisualIds.includes(vis.id));
                const isHoverTarget =
                  hoverTargetVisId === vis.id &&
                  hoverDragVisId !== null &&
                  hoverDragVisId !== vis.id;
                const isResizing = resizingVisId === vis.id;

                const col = idx % 2;
                const row = Math.floor(idx / 2);
                const tileX = (typeof vis.x === 'number' && Number.isFinite(vis.x) && vis.x >= 0) ? vis.x : (16 + col * (DEFAULT_TILE_W + DEFAULT_TILE_GAP));
                const tileY = (typeof vis.y === 'number' && Number.isFinite(vis.y) && vis.y >= 0) ? vis.y : (16 + row * (DEFAULT_TILE_H + DEFAULT_TILE_GAP));
                const tileW = vis.customWidth || (vis.span === 2 ? 976 : DEFAULT_TILE_W);
                const tileH = vis.customHeight || DEFAULT_TILE_H;

                return (
                  <div
                    key={vis.id}
                    data-testid={`visual-tile-${vis.id}`}
                    data-visual-tile="true"
                    data-visual-id={vis.id}
                    data-hover-dragging={isHoverDragging ? 'true' : 'false'}
                    data-selected={isMultiSelected ? 'true' : 'false'}
                    data-locked={vis.locked ? 'true' : 'false'}
                    onMouseDown={(e) => handleVisualMouseDown(e, vis.id, false)}
                    onMouseEnter={() => handleVisualMouseEnter(vis.id)}
                    onClick={(e) => handleSelectVisualTile(e, vis.id)}
                    style={{
                      position: 'absolute',
                      left: `${tileX}px`,
                      top: `${tileY}px`,
                      width: `${tileW}px`,
                      height: `${tileH}px`,
                      zIndex: isHoverDragging || isResizing ? 50 : isSelected || isMultiSelected ? 20 : vis.zIndex || idx + 1,
                      ...(vis.backgroundColor ? { backgroundColor: vis.backgroundColor } : {}),
                      ...(vis.showBorder === false
                        ? { borderWidth: 0 }
                        : vis.borderColor
                        ? { borderColor: vis.borderColor }
                        : {}),
                      ...(vis.borderRadius !== undefined ? { borderRadius: `${vis.borderRadius}px` } : {}),
                    }}
                    className={`${vis.borderRadius !== undefined ? '' : 'rounded-2xl'} border transition-all p-5 flex flex-col justify-between select-none backdrop-blur-xl ${
                      isHoverDragging
                        ? `border-emerald-600 ring-4 ring-emerald-500/30 shadow-2xl cursor-grabbing${
                            vis.backgroundColor ? '' : ' bg-white/95'
                          }`
                        : isHoverTarget
                        ? `border-emerald-500 border-dashed ring-2 ring-emerald-500/40 shadow-lg${
                            vis.backgroundColor ? '' : ' bg-white/90'
                          }`
                        : isSelected || isMultiSelected
                        ? `border-emerald-600 ring-2 ring-emerald-500/25 shadow-md cursor-grab${
                            vis.backgroundColor ? '' : ' bg-white/90'
                          }`
                        : `border-white/60 hover:border-emerald-400 shadow-xs hover:shadow-md cursor-grab${
                            vis.backgroundColor ? '' : ' bg-white/80'
                          }`
                    }`}
                  >
                    {/* Tile Header with Multi-Select Toggle, Drag Grip & Inline Edit Title Option */}
                    <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-[#E1E1E1]">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`multi-select-btn-${vis.id}`}
                          onClick={(e) => handleToggleMultiSelectVisual(e, vis.id)}
                          title="Toggle Multi-Select on this visual (or Ctrl+Click tile)"
                          className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors ${
                            isMultiSelected && selectedVisualIds.length > 1
                              ? 'bg-[#217346] border-[#217346] text-white'
                              : 'bg-white border-[#D4D4D4] text-transparent hover:border-[#217346]'
                          }`}
                        >
                          ✓
                        </button>

                        <button
                          type="button"
                          data-testid={`drag-grip-${vis.id}`}
                          onMouseDown={(e) => handleVisualMouseDown(e, vis.id, true)}
                          title="Press & hold visual or drag grip to move anywhere on canvas"
                          className="p-0.5 text-[#605E5C] hover:text-[#217346] cursor-grab active:cursor-grabbing rounded hover:bg-[#F3F3F3] shrink-0"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </button>

                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 rounded shrink-0">
                          {typeMeta?.shortLabel || vis.type}
                        </span>

                        {isHoverDragging && (
                          <span
                            data-testid={`hover-badge-${vis.id}`}
                            className="px-2 py-0.5 rounded-full bg-[#217346] text-white text-[9px] font-bold uppercase tracking-wider shadow shrink-0"
                          >
                            Hovering • Move to Align
                          </span>
                        )}

                        {isEditingTitle ? (
                          <div
                            className="flex items-center gap-1 flex-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingTitleDraft}
                              onChange={(e) => setEditingTitleDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setVisuals((prev) =>
                                    prev.map((v) =>
                                      v.id === vis.id
                                        ? { ...v, title: editingTitleDraft, customTitle: true }
                                        : v
                                    )
                                  );
                                  setEditingTitleVisId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingTitleVisId(null);
                                }
                              }}
                              className="flex-1 bg-white border border-[#217346] rounded px-2 py-0.5 text-xs font-bold text-[#212121]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setVisuals((prev) =>
                                  prev.map((v) =>
                                    v.id === vis.id
                                      ? { ...v, title: editingTitleDraft, customTitle: true }
                                      : v
                                  )
                                );
                                setEditingTitleVisId(null);
                              }}
                              className="p-1 bg-[#217346] text-white rounded"
                              title="Save Title"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {vis.showTitle !== false && (
                              <h3
                                className="truncate"
                                style={{
                                  fontSize: vis.titleFontSize ? `${vis.titleFontSize}px` : '12px',
                                  color: vis.titleColor || '#212121',
                                  textAlign: vis.titleAlign || 'left',
                                  fontWeight: vis.titleBold === false ? 500 : 700,
                                  flex: vis.titleAlign && vis.titleAlign !== 'left' ? 1 : undefined,
                                }}
                              >
                                {vis.title}
                              </h3>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVisualId(vis.id);
                                setSelectedKpiId(null);
                                setEditingTitleVisId(vis.id);
                                setEditingTitleDraft(vis.title);
                              }}
                              title="Edit Visual Title"
                              className="p-1 text-[#605E5C] hover:text-[#217346] rounded hover:bg-[#F3F3F3] shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          data-testid={`lock-visual-btn-${vis.id}`}
                          onClick={(e) => handleToggleLockVisual(e, vis.id)}
                          title={vis.locked ? 'Unlock visual position & size' : 'Lock visual position & size'}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                            vis.locked
                              ? 'bg-[#FEF3C7] text-[#B45309] border-[#F59E0B]'
                              : 'bg-white text-[#605E5C] border-[#D4D4D4] hover:bg-[#F3F3F3]'
                          }`}
                        >
                          {vis.locked ? '🔒' : '🔓'}
                        </button>
                        <button
                          type="button"
                          data-testid={`bring-front-btn-${vis.id}`}
                          onClick={(e) => handleZOrderChange(e, vis.id, 'front')}
                          title="Bring visual to front (Z-order)"
                          className="px-1 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-[#F3F3F3] text-[#605E5C] border border-[#D4D4D4]"
                        >
                          ⇪
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            pushUndoSnapshot(visuals);
                            setVisuals((prev) =>
                              prev.map((v) =>
                                v.id === vis.id
                                  ? {
                                      ...v,
                                      span: v.span === 2 ? 1 : 2,
                                      customWidth: v.span === 2 ? DEFAULT_TILE_W : 976,
                                    }
                                  : v
                              )
                            );
                          }}
                          title={vis.span === 2 ? 'Half Width' : 'Expand Full Width'}
                          className="p-1 text-[#605E5C] hover:text-[#212121] rounded hover:bg-[#F3F3F3]"
                        >
                          {vis.span === 2 ? (
                            <Minimize2 className="w-3.5 h-3.5" />
                          ) : (
                            <Maximize2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateVisual(vis)}
                          title="Duplicate Visual"
                          className="p-1 text-[#605E5C] hover:text-[#212121] rounded hover:bg-[#F3F3F3]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {visuals.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVisual(vis.id)}
                            title="Remove Visual"
                            className="p-1 text-[#605E5C] hover:text-[#C50F1F] rounded hover:bg-[#F3F3F3]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tile Body */}
                    <div className="flex-1 min-h-0 flex flex-col justify-center overflow-auto">
                      {renderVisualContent(vis)}
                    </div>

                    {/* 8-Way Resize Handles (N, S, E, W, NW, NE, SW, SE) */}
                    <div
                      data-testid={`resize-handle-${vis.id}-n`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'n')}
                      className="absolute -top-1 left-6 right-6 h-2 cursor-ns-resize z-10"
                    />
                    <div
                      data-testid={`resize-handle-${vis.id}-s`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 's')}
                      className="absolute -bottom-1 left-6 right-6 h-2 cursor-ns-resize z-10"
                    />
                    <div
                      data-testid={`resize-handle-${vis.id}-w`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'w')}
                      className="absolute top-6 bottom-6 -left-1 w-2 cursor-ew-resize z-10"
                    />
                    <div
                      data-testid={`resize-handle-${vis.id}-e`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'e')}
                      className="absolute top-6 bottom-6 -right-1 w-2 cursor-ew-resize z-10"
                    />
                    <div
                      data-testid={`resize-handle-${vis.id}-nw`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'nw')}
                      className="absolute -top-1 -left-1 w-3.5 h-3.5 cursor-nwse-resize z-10"
                    />
                    <div
                      data-testid={`resize-handle-${vis.id}-ne`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'ne')}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 cursor-nesw-resize z-10"
                    />
                    <div
                      data-testid={`resize-handle-${vis.id}-sw`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'sw')}
                      className="absolute -bottom-1 -left-1 w-3.5 h-3.5 cursor-nesw-resize z-10"
                    />
                    {/* Bottom-Right Diagonal Mouse Resize Handle (SE) */}
                    <div
                      data-testid={`resize-handle-${vis.id}`}
                      data-resize-handle="true"
                      onMouseDown={(e) => handleStartResize(e, vis, 'se')}
                      onDoubleClick={(e) => handleResetVisualSize(e, vis.id)}
                      title="Drag diagonally to resize visual width & height (Double-click to reset size)"
                      className={`absolute bottom-1 right-1 w-5 h-5 flex items-end justify-end p-0.5 cursor-nwse-resize rounded transition-colors z-10 ${
                        isResizing
                          ? 'text-[#217346] bg-[#E6F2EB]'
                          : 'text-[#605E5C]/70 hover:text-[#217346] hover:bg-[#E6F2EB]/60'
                      }`}
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="w-3.5 h-3.5 pointer-events-none"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      >
                        <line x1="11" y1="3" x2="3" y2="11" />
                        <line x1="11" y1="7" x2="7" y2="11" />
                        <line x1="11" y1="10.5" x2="10.5" y2="11" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Three Side Panes on the Right: Filters | Visualizations | Data */}
          <div className="flex h-full shrink-0 z-10 border-l border-[#D4D4D4] bg-[#F3F2F1]">
            <DashboardFiltersPane
              config={paneFilters}
              onToggleCollapse={() =>
                setPaneFilters((prev) => ({
                  ...prev,
                  state: prev.state === 'open' ? 'collapsed' : 'open',
                }))
              }
              onHide={() => setPaneFilters((prev) => ({ ...prev, state: 'hidden' }))}
              onResize={(w) =>
                setPaneFilters((prev) => ({
                  ...prev,
                  w: Math.min(480, Math.max(200, Math.round(w))),
                }))
              }
              onResetWidth={() => setPaneFilters((prev) => ({ ...prev, w: 260 }))}
              activeVisual={activeVisual}
              slicerColumns={slicerColumns}
              multiSlicerSelections={multiSlicerSelections}
              onToggleSlicerValue={toggleSlicerValue}
              onClearAllSlicers={() => setMultiSlicerSelections({})}
              distinctValuesGetter={getDistinctValuesForColumn}
            />

            <DashboardVisualizationsPane
              config={paneVisualizations}
              onToggleCollapse={() =>
                setPaneVisualizations((prev) => ({
                  ...prev,
                  state: prev.state === 'open' ? 'collapsed' : 'open',
                }))
              }
              onResize={(w) =>
                setPaneVisualizations((prev) => ({
                  ...prev,
                  w: Math.min(480, Math.max(200, Math.round(w))),
                }))
              }
              onResetWidth={() => setPaneVisualizations((prev) => ({ ...prev, w: 320 }))}
              activeVisTab={activeVisTab}
              setActiveVisTab={setActiveVisTab}
              visualTypes={VISUAL_TYPES}
              activeVisual={activeVisual}
              activeKpi={activeKpi}
              columns={columns}
              onAddVisual={handleAddVisual}
              onUpdateActiveVisual={updateActiveVisual}
              onUpdateActiveVisualCF={updateActiveVisualCF}
              onAddKpiCard={handleAddKpiCard}
              onUpdateActiveKpi={updateActiveKpi}
              paletteId={paletteId}
              onSelectPalette={(p) => {
                setPaletteId(p);
                setVisuals((prev) =>
                  prev.map((v) => ({ ...v, paletteId: p, customColors: {} }))
                );
              }}
              colorPalettes={COLOR_PALETTES}
            />

            <DashboardDataPane
              config={paneData}
              onToggleCollapse={() =>
                setPaneData((prev) => ({
                  ...prev,
                  state: prev.state === 'open' ? 'collapsed' : 'open',
                }))
              }
              onResize={(w) =>
                setPaneData((prev) => ({
                  ...prev,
                  w: Math.min(480, Math.max(200, Math.round(w))),
                }))
              }
              onResetWidth={() => setPaneData((prev) => ({ ...prev, w: 260 }))}
              datasets={datasets}
              queries={queries}
              selectedDataset={selectedDataset}
              columns={columns}
              activeVisual={!activeKpi ? activeVisual : null}
              activeKpi={activeKpi}
              onBindFieldToVisual={(colName, role) => {
                if (!activeKpi && activeVisual) {
                  if (role === 'category') updateActiveVisual({ categoryCol: colName });
                  else if (role === 'value') updateActiveVisual({ valueCol: colName });
                  else if (role === 'series') updateActiveVisual({ seriesCol: colName });
                } else if (activeKpi) {
                  // A KPI card only has one bindable field (its metric
                  // column), so any field-row click/drop while a KPI is
                  // selected sets that, regardless of which quick-action
                  // role was clicked.
                  updateActiveKpi({ column: colName });
                }
              }}
            />
          </div>
        </div>

        {/* Bottom Pages Bar (Power BI / Excel-style Multi-Page Tabs with Inline Rename & + Add Page) */}
        <div
          data-testid="dashboard-pages-bar"
          className="px-4 py-2 bg-[#F3F3F3] border-t border-[#D4D4D4] flex items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#605E5C] mr-1 shrink-0">
              Pages:
            </span>
            {pages.map((page) => {
              const isActivePage = page.id === activePageId;
              const isEditingThisPage = editingPageId === page.id;
              return (
                <div
                  key={page.id}
                  data-testid={`page-tab-${page.id}`}
                  data-active={isActivePage ? 'true' : 'false'}
                  onClick={() => handleSelectPage(page.id)}
                  onDoubleClick={() => {
                    setEditingPageId(page.id);
                    setEditingPageNameDraft(page.name);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-t-lg border text-xs font-semibold cursor-pointer transition-all shrink-0 ${
                    isActivePage
                      ? 'bg-white text-[#185C37] border-[#217346] border-b-2 shadow-sm font-bold'
                      : 'bg-[#E6E6E6]/70 text-[#605E5C] border-[#D4D4D4] hover:bg-white hover:text-[#212121]'
                  }`}
                >
                  {isEditingThisPage ? (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        autoFocus
                        aria-label={`Rename ${page.name}`}
                        data-testid={`rename-page-input-${page.id}`}
                        value={editingPageNameDraft}
                        onChange={(e) => setEditingPageNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenamePage(page.id, editingPageNameDraft);
                          } else if (e.key === 'Escape') {
                            setEditingPageId(null);
                          }
                        }}
                        className="w-28 bg-white border border-[#217346] rounded px-1.5 py-0.5 text-xs font-bold text-[#212121]"
                      />
                      <button
                        type="button"
                        data-testid={`save-page-name-btn-${page.id}`}
                        onClick={() => handleRenamePage(page.id, editingPageNameDraft)}
                        title="Save Page Name"
                        className="p-0.5 bg-[#217346] text-white rounded"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span>{page.name}</span>
                      <button
                        type="button"
                        data-testid={`edit-page-name-btn-${page.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPageId(page.id);
                          setEditingPageNameDraft(page.name);
                        }}
                        title="Rename Page"
                        className="p-0.5 text-[#605E5C] hover:text-[#217346] rounded hover:bg-[#F3F3F3]"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        data-testid={`duplicate-page-btn-${page.id}`}
                        onClick={(e) => handleDuplicatePage(e, page.id)}
                        title={`Duplicate ${page.name}`}
                        className="p-0.5 text-[#605E5C] hover:text-[#217346] rounded hover:bg-[#F3F3F3]"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {pages.length > 1 && (
                        <button
                          type="button"
                          data-testid={`delete-page-btn-${page.id}`}
                          onClick={(e) => handleDeletePage(e, page.id)}
                          title="Delete Page"
                          className="p-0.5 text-[#605E5C] hover:text-[#C50F1F] rounded hover:bg-[#F3F3F3]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              data-testid="add-dashboard-page-btn"
              onClick={handleAddPage}
              title="Create a new Dashboard Page"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346]/30 shrink-0 ml-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Page
            </button>
          </div>

          <div className="text-[11px] text-[#605E5C] font-medium hidden sm:block shrink-0">
            Active:{' '}
            <strong className="text-[#217346]">
              {pages.find((p) => p.id === activePageId)?.name || 'Page 1'}
            </strong>{' '}
            ({pages.length} {pages.length === 1 ? 'page' : 'pages'})
          </div>
        </div>
      </div>

      {SHARE_EXPORT_ENABLED && isExportShareOpen && (
        <ExportShareModal
          isOpen={isExportShareOpen}
          onClose={() => setIsExportShareOpen(false)}
          dataset={selectedDataset}
          columns={columns}
          steps={steps || []}
          initialTab={exportShareTab}
          initialFormat={exportShareFormat}
          dashboardData={getDashboardExportData()}
        />
      )}
    </div>
  );
};
