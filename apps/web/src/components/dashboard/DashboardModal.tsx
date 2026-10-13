import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  BarChart3,
  BarChartHorizontal,
  PieChart,
  TrendingUp,
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
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

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
  | 'treemap'
  | 'table'
  | 'matrix';

export type VisualAggType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct';

export type PaletteId =
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
  customWidth?: number;
  customHeight?: number;
  paletteId?: PaletteId;
  legendPosition?: LegendPositionType;
  customColors?: Record<string, string>;
  customLegendLabels?: Record<string, string>;
  conditionalFormatting?: ConditionalFormattingConfig;
}

interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_PALETTES: Record<PaletteId, { name: string; colors: string[] }> = {
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

const ensureVisualCanvasCoords = (
  list: DashboardVisualConfig[]
): DashboardVisualConfig[] => {
  return list.map((v, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const defaultX = 16 + col * (DEFAULT_TILE_W + DEFAULT_TILE_GAP);
    const defaultY = 16 + row * (DEFAULT_TILE_H + DEFAULT_TILE_GAP);
    return {
      ...v,
      x: typeof v.x === 'number' && Number.isFinite(v.x) ? Math.max(0, v.x) : defaultX,
      y: typeof v.y === 'number' && Number.isFinite(v.y) ? Math.max(0, v.y) : defaultY,
      zIndex: typeof v.zIndex === 'number' && Number.isFinite(v.zIndex) ? v.zIndex : idx + 1,
    };
  });
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

export const DashboardModal: React.FC<DashboardModalProps> = ({ isOpen, onClose }) => {
  const { selectedDataset, columns, rows, allRows } = useWorkbenchStore();

  const [visuals, setVisuals] = useState<DashboardVisualConfig[]>([]);
  const [kpiCards, setKpiCards] = useState<DashboardKpiConfig[]>([]);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [selectedVisualIds, setSelectedVisualIds] = useState<string[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const [paletteId, setPaletteId] = useState<PaletteId>('classic');
  const [dashboardTitle, setDashboardTitle] = useState<string>('');

  // Canvas Snapping, Alignment Guides & Undo/Redo History
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const snapToGridRef = useRef<boolean>(true);
  snapToGridRef.current = snapToGrid;

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

    const dsKey = selectedDataset?.id || 'default';
    const colNames = columns.map((c) => c.name);
    const { cat1, cat2 } = getSmartDefaults();

    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARDS);
      const parsed = raw ? JSON.parse(raw) : {};
      const saved = parsed[dsKey];
      if (
        saved &&
        Array.isArray(saved.visuals) &&
        saved.visuals.length > 0 &&
        saved.visuals.every(
          (v: DashboardVisualConfig) =>
            colNames.includes(v.categoryCol) || colNames.includes(v.valueCol)
        )
      ) {
        if (saved.paletteId && COLOR_PALETTES[saved.paletteId as PaletteId]) {
          setPaletteId(saved.paletteId as PaletteId);
        }
        setDashboardTitle(
          typeof saved.dashboardTitle === 'string'
            ? saved.dashboardTitle
            : `${selectedDataset?.name || 'Executive'} Dashboard`
        );
        const normalizedVisuals = ensureVisualCanvasCoords(saved.visuals);
        setVisuals(normalizedVisuals);
        setUndoStack([]);
        setRedoStack([]);
        setKpiCards(
          Array.isArray(saved.kpiCards) && saved.kpiCards.length > 0
            ? saved.kpiCards
            : buildDefaultKpiCards()
        );
        setSlicerColumns(
          Array.isArray(saved.slicerColumns) && saved.slicerColumns.length > 0
            ? saved.slicerColumns.filter((c: string) => colNames.includes(c))
            : [cat1, cat2].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)
        );
        const firstId = normalizedVisuals[0]?.id || null;
        setSelectedVisualId(firstId);
        setSelectedVisualIds(firstId ? [firstId] : []);
        setSelectedKpiId(null);
        return;
      }
    } catch {
      // ignore storage errors
    }

    const defaultVisuals = buildDefaultVisuals();
    const defaultKpis = buildDefaultKpiCards();
    setDashboardTitle(`${selectedDataset?.name || 'Executive'} Dashboard`);
    setVisuals(defaultVisuals);
    setUndoStack([]);
    setRedoStack([]);
    setKpiCards(defaultKpis);
    setSlicerColumns([cat1, cat2].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i));
    setMultiSlicerSelections({});
    const firstId = defaultVisuals[0]?.id || null;
    setSelectedVisualId(firstId);
    setSelectedVisualIds(firstId ? [firstId] : []);
    setSelectedKpiId(null);
  }, [isOpen, selectedDataset?.id, columns]);

  // Persist dashboard state
  useEffect(() => {
    if (!isOpen || visuals.length === 0) return;
    const dsKey = selectedDataset?.id || 'default';
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARDS);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[dsKey] = { visuals, kpiCards, slicerColumns, paletteId, dashboardTitle };
      localStorage.setItem(STORAGE_KEY_DASHBOARDS, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, [visuals, kpiCards, slicerColumns, paletteId, dashboardTitle, selectedDataset?.id, isOpen]);

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
        }
        resizeSessionRef.current = null;
        setResizingVisId(null);
      }
      if (dragSessionRef.current) {
        if (dragSessionRef.current.hasMoved) {
          pushUndoSnapshot(dragSessionRef.current.snapshot);
        }
        dragSessionRef.current = null;
      }
      setHoverDragVisId(null);
      setHoverTargetVisId(null);
      setAlignmentGuides([]);
    };

    const handleWindowKeyDown = (e: KeyboardEvent) => {
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
            activeSet.has(v.id)
              ? {
                  ...v,
                  x: Math.max(0, (v.x ?? 16) + dx),
                  y: Math.max(0, (v.y ?? 16) + dy),
                }
              : v
          )
        );
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
      const v = r[col];
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
          const cell = r[col];
          const norm =
            cell === null || cell === undefined || String(cell).trim() === ''
              ? '(Blank)'
              : String(cell);
          if (!selectedVals.includes(norm)) return false;
        }
      }
      if (crossFilter) {
        const cell = r[crossFilter.column];
        const norm =
          cell === null || cell === undefined || String(cell).trim() === ''
            ? '(Blank)'
            : String(cell);
        if (norm !== crossFilter.value) return false;
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

  const computeMetric = (subset: Record<string, any>[], col: string, fn: VisualAggType): number => {
    if (subset.length === 0) return 0;
    if (fn === 'count') return subset.length;
    if (fn === 'distinct') {
      return new Set(
        subset
          .map((r) => r[col])
          .filter((v) => v !== null && v !== undefined && v !== '')
          .map((v) => String(v))
      ).size;
    }
    const nums = subset.map((r) => Number(r[col])).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return 0;
    const sum = nums.reduce((a, b) => a + b, 0);
    if (fn === 'sum') return Number(sum.toFixed(2));
    if (fn === 'avg') return Number((sum / nums.length).toFixed(2));
    if (fn === 'min') return Math.min(...nums);
    if (fn === 'max') return Math.max(...nums);
    return Number(sum.toFixed(2));
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
        if ((patch.column || patch.aggFunc) && !patch.title) {
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

    const initialRects: Record<string, { x: number; y: number; w: number; h: number }> = {};
    visualsRef.current.forEach((v, idx) => {
      if (movingIds.includes(v.id)) {
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
        .map((r) => Number(r[vis.valueCol]))
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

    // Group rows by categoryCol for standard, table, matrix & multi-series visuals
    const catMap = new Map<string, Record<string, any>[]>();
    filteredRows.forEach((r) => {
      const raw = r[vis.categoryCol];
      const key =
        raw === null || raw === undefined || String(raw).trim() === '' ? '(Blank)' : String(raw);
      if (!catMap.has(key)) catMap.set(key, []);
      catMap.get(key)!.push(r);
    });

    let items = Array.from(catMap.entries()).map(([category, groupRows]) => ({
      category,
      value: computeMetric(groupRows, vis.valueCol, vis.aggFunc),
      count: groupRows.length,
      rows: groupRows,
    }));

    if (vis.sortBy === 'value_desc') items.sort((a, b) => b.value - a.value);
    else if (vis.sortBy === 'value_asc') items.sort((a, b) => a.value - b.value);
    else items.sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }));

    items = items.slice(0, vis.topN || 10);
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
            const v = r[seriesCol];
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
            const v = r[seriesCol];
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
          const v = r[seriesCol];
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
            const v = r[seriesCol];
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
            const v = r[seriesCol];
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
      return wrapWithLegend(vis, barChart, categoryLegendEntries);
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
                  <div
                    style={{
                      height: `${hPct}%`,
                      backgroundColor: colColor,
                    }}
                    className={`w-full max-w-[44px] rounded-t transition-all flex flex-col items-center overflow-hidden ${
                      labelPos === 'inside_center' ? 'justify-center' : 'justify-start pt-1.5'
                    } ${
                      isSelected
                        ? 'ring-2 ring-[#217346] brightness-110'
                        : 'opacity-90 group-hover:opacity-100'
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
      return wrapWithLegend(vis, colChart, categoryLegendEntries);
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
      return wrapWithLegend(vis, lineChart, categoryLegendEntries);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5">
      <div className="bg-white border border-[#D4D4D4] rounded-xl w-full max-w-7xl h-[92vh] shadow-2xl overflow-hidden flex flex-col text-[#212121]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#D4D4D4] bg-[#F3F3F3]">
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
              <p className="text-xs text-[#605E5C]">
                Active Sheet:{' '}
                <strong className="text-[#212121]">{selectedDataset?.name || 'Dataset'}</strong> •
                Multi-select slicers, dynamic KPI cards, Table &amp; Matrix visuals, and conditional formatting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={onClose}
              className="text-[#605E5C] hover:text-[#212121] p-1.5 rounded-lg hover:bg-[#E6E6E6]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Multi-Slicer & Cross-Filter Bar */}
        <div className="px-6 py-2.5 bg-[#F8F9FA] border-b border-[#D4D4D4] flex flex-col gap-2">
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
            <div className="flex flex-wrap items-center gap-2.5">
              {slicerColumns.map((col) => {
                const vals = getDistinctValuesForColumn(col);
                const selectedVals = multiSlicerSelections[col] || [];
                return (
                  <div
                    key={col}
                    className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[#D4D4D4] rounded-lg shadow-sm"
                  >
                    <select
                      aria-label={`Slicer Column ${col}`}
                      value={col}
                      onChange={(e) => handleChangeTopSlicerColumn(col, e.target.value)}
                      className="bg-[#F3F3F3] border border-[#D4D4D4] rounded px-2 py-0.5 text-xs font-bold text-[#212121]"
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => clearColumnSlicer(col)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                        selectedVals.length === 0
                          ? 'bg-[#217346] text-white'
                          : 'bg-[#F3F3F3] text-[#605E5C] hover:bg-[#E6E6E6]'
                      }`}
                    >
                      All
                    </button>

                    {vals.slice(0, 8).map((v) => {
                      const isPicked = selectedVals.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleSlicerValue(col, v)}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                            isPicked
                              ? 'bg-[#E6F2EB] text-[#185C37] border border-[#217346] font-bold'
                              : 'bg-[#F8F9FA] text-[#212121] border border-[#E1E1E1] hover:bg-[#EFEFEF]'
                          }`}
                        >
                          <span>{v}</span>
                        </button>
                      );
                    })}

                    {slicerColumns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTopSlicer(col)}
                        title="Remove this Slicer"
                        className="p-0.5 text-[#605E5C] hover:text-[#C50F1F] ml-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
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
          <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#F3F3F3]">
            {/* Dynamic KPI Cards Section */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-xl">
                  <span className="px-2 py-1 rounded-md bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                    <Pencil className="w-3 h-3" /> Text Box
                  </span>
                  <input
                    type="text"
                    aria-label="Dashboard Title"
                    value={dashboardTitle}
                    onChange={(e) => setDashboardTitle(e.target.value)}
                    placeholder="Enter Dashboard Title..."
                    className="flex-1 bg-white border border-[#D4D4D4] hover:border-[#217346]/60 focus:border-[#217346] focus:ring-2 focus:ring-[#217346]/20 focus:outline-none rounded-lg px-3 py-1.5 text-sm font-extrabold text-[#212121] shadow-sm transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddKpiCard}
                  className="text-xs font-semibold text-[#217346] hover:underline flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add KPI Card
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {kpiCards.map((kpi) => {
                  const val = computeMetric(filteredRows, kpi.column, kpi.aggFunc);
                  const isKpiSelected = selectedKpiId === kpi.id;
                  return (
                    <div
                      key={kpi.id}
                      onClick={() => {
                        setSelectedKpiId(kpi.id);
                        setSelectedVisualId(null);
                      }}
                      className={`p-3.5 bg-white rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isKpiSelected
                          ? 'border-[#217346] ring-2 ring-[#217346]/25 shadow-md'
                          : 'border-[#D4D4D4] hover:border-[#217346]/60 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#605E5C] truncate">
                          {kpi.title}
                        </div>
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKpiId(kpi.id);
                              setSelectedVisualId(null);
                            }}
                            title="Edit KPI Card Title & Metric"
                            className="p-0.5 text-[#605E5C] hover:text-[#217346] rounded"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateKpiCard(kpi)}
                            title="Duplicate KPI Card"
                            className="p-0.5 text-[#605E5C] hover:text-[#212121] rounded"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {kpiCards.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveKpiCard(kpi.id)}
                              title="Remove KPI Card"
                              className="p-0.5 text-[#605E5C] hover:text-[#C50F1F] rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        style={{ color: kpi.accentColor || '#212121' }}
                        className="text-2xl font-extrabold font-mono my-1"
                      >
                        {formatNum(val)}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#605E5C]">
                        <span className="truncate">{kpi.subtitle}</span>
                        <span className="font-mono uppercase font-semibold text-[#217346]">
                          {kpi.aggFunc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Canvas Interaction Toolbar: Undo/Redo, Snap-to-Grid, Multi-Select & Alignment */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white rounded-xl border border-[#D4D4D4] shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="canvas-undo-btn"
                  disabled={undoStack.length === 0}
                  onClick={handleUndo}
                  title="Undo layout change (Ctrl+Z)"
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    undoStack.length > 0
                      ? 'bg-white hover:bg-[#F3F3F3] text-[#212121] border-[#D4D4D4]'
                      : 'bg-[#F8F9FA] text-[#A19F9D] border-[#E1E1E1] cursor-not-allowed'
                  }`}
                >
                  ↶ Undo ({undoStack.length})
                </button>
                <button
                  type="button"
                  data-testid="canvas-redo-btn"
                  disabled={redoStack.length === 0}
                  onClick={handleRedo}
                  title="Redo layout change (Ctrl+Y)"
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    redoStack.length > 0
                      ? 'bg-white hover:bg-[#F3F3F3] text-[#212121] border-[#D4D4D4]'
                      : 'bg-[#F8F9FA] text-[#A19F9D] border-[#E1E1E1] cursor-not-allowed'
                  }`}
                >
                  ↷ Redo ({redoStack.length})
                </button>

                <span className="h-4 w-px bg-[#D4D4D4] mx-0.5" />

                <button
                  type="button"
                  data-testid="toggle-snap-grid"
                  onClick={() => setSnapToGrid((prev) => !prev)}
                  title="Toggle 8px Grid Snapping & Smart Alignment Guides"
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    snapToGrid
                      ? 'bg-[#E6F2EB] text-[#185C37] border-[#217346]'
                      : 'bg-white text-[#605E5C] border-[#D4D4D4] hover:bg-[#F3F3F3]'
                  }`}
                >
                  ⊞ Snap Grid: {snapToGrid ? 'ON' : 'OFF'}
                </button>

                <button
                  type="button"
                  data-testid="select-all-visuals-btn"
                  onClick={handleSelectAllVisuals}
                  title="Select all visuals for group move, alignment, or keyboard nudging"
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white hover:bg-[#F3F3F3] text-[#212121] border border-[#D4D4D4]"
                >
                  ☑ Select All ({selectedVisualIds.length}/{visuals.length})
                </button>

                <span className="h-4 w-px bg-[#D4D4D4] mx-0.5" />

                <button
                  type="button"
                  data-testid="align-left-btn"
                  onClick={() => handleAlignSelectedVisuals('left')}
                  title="Align selected visuals to left edge"
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-white hover:bg-[#F3F3F3] text-[#212121] border border-[#D4D4D4]"
                >
                  Align Left
                </button>
                <button
                  type="button"
                  data-testid="align-top-btn"
                  onClick={() => handleAlignSelectedVisuals('top')}
                  title="Align selected visuals to top edge"
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-white hover:bg-[#F3F3F3] text-[#212121] border border-[#D4D4D4]"
                >
                  Align Top
                </button>
                <button
                  type="button"
                  data-testid="match-size-btn"
                  onClick={() => handleAlignSelectedVisuals('match_size')}
                  title="Match width & height of selected visuals"
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-white hover:bg-[#F3F3F3] text-[#212121] border border-[#D4D4D4]"
                >
                  Match Size
                </button>
                <button
                  type="button"
                  data-testid="auto-arrange-btn"
                  onClick={() => handleAlignSelectedVisuals('auto_grid')}
                  title="Auto-arrange all visuals into a clean 2-column grid"
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346]/30"
                >
                  Tidy Grid
                </button>
              </div>

              <div className="text-[10px] text-[#605E5C] font-medium">
                Hold &amp; Drag to Move • 8-Way Resize • Ctrl+Click Multi-Select • Arrow Keys Nudge
              </div>
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
                const tileX = vis.x ?? 16 + col * (DEFAULT_TILE_W + DEFAULT_TILE_GAP);
                const tileY = vis.y ?? 16 + row * (DEFAULT_TILE_H + DEFAULT_TILE_GAP);
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
                    }}
                    className={`bg-white rounded-xl border transition-shadow p-4 flex flex-col justify-between select-none ${
                      isHoverDragging
                        ? 'border-[#217346] ring-4 ring-[#217346]/30 shadow-2xl cursor-grabbing bg-[#F8FDFB]'
                        : isHoverTarget
                        ? 'border-[#217346] border-dashed ring-2 ring-[#217346]/40 shadow-lg'
                        : isSelected || isMultiSelected
                        ? 'border-[#217346] ring-2 ring-[#217346]/25 shadow-md cursor-grab'
                        : 'border-[#D4D4D4] hover:border-[#217346]/60 shadow-sm cursor-grab'
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
                            <h3 className="text-xs font-bold text-[#212121] truncate">
                              {vis.title}
                            </h3>
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
                          onClick={(e) => handleResetVisualSize(e, vis.id)}
                          title="Position (X,Y) & Size (W×H) — Click to reset size"
                          className="px-1.5 py-0.5 rounded bg-[#F3F3F3] hover:bg-[#E6E6E6] text-[9px] font-mono font-semibold text-[#605E5C]"
                        >
                          {tileX},{tileY} • {tileW}×{tileH}
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

          {/* Right: Visualizations, Legend Colors & Conditional Formatting Inspector Pane */}
          <div className="w-80 sm:w-96 border-l border-[#D4D4D4] bg-white p-4 overflow-y-auto space-y-5 shrink-0">
            <div className="flex items-center justify-between border-b border-[#D4D4D4] pb-2.5 gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#217346]">
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span>Visualizations Pane</span>
              </div>
              <button
                type="button"
                onClick={() => handleAddVisual(activeVisual?.type || 'column')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#217346] hover:bg-[#185C37] text-white shadow-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add Visual
              </button>
            </div>

            {activeKpi ? (
              /* KPI CARD CONFIGURATION INSPECTOR */
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-[#E6F2EB] border border-[#217346]/30 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#185C37]">KPI Card Settings</span>
                  <button
                    type="button"
                    onClick={handleAddKpiCard}
                    className="px-2 py-1 rounded bg-[#217346] text-white text-[11px] font-semibold"
                  >
                    + New KPI Card
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Edit KPI Card Title
                  </label>
                  <input
                    type="text"
                    value={activeKpi.title}
                    onChange={(e) => updateActiveKpi({ title: e.target.value })}
                    className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Metric Column
                  </label>
                  <select
                    aria-label="KPI Metric Column"
                    value={activeKpi.column}
                    onChange={(e) => updateActiveKpi({ column: e.target.value })}
                    className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.data_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Aggregation Function
                  </label>
                  <select
                    aria-label="KPI Aggregation Function"
                    value={activeKpi.aggFunc}
                    onChange={(e) =>
                      updateActiveKpi({ aggFunc: e.target.value as VisualAggType })
                    }
                    className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#212121]"
                  >
                    <option value="sum">SUM (Total)</option>
                    <option value="avg">AVERAGE (Mean)</option>
                    <option value="max">MAX (Peak)</option>
                    <option value="min">MIN (Lowest)</option>
                    <option value="count">COUNT (Rows)</option>
                    <option value="distinct">DISTINCT COUNT (Unique)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    KPI Value Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={activeKpi.accentColor || '#217346'}
                      onChange={(e) => updateActiveKpi({ accentColor: e.target.value })}
                      className="w-8 h-8 rounded border border-[#D4D4D4] cursor-pointer"
                    />
                    <div className="flex flex-wrap gap-1">
                      {['#217346', '#0EA5E9', '#D97706', '#7C3AED', '#E11D48', '#1E293B'].map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => updateActiveKpi({ accentColor: c })}
                            style={{ backgroundColor: c }}
                            className="w-5 h-5 rounded-full border border-white shadow-sm"
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Subtitle / Description
                  </label>
                  <input
                    type="text"
                    value={activeKpi.subtitle}
                    onChange={(e) => updateActiveKpi({ subtitle: e.target.value })}
                    className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                  />
                </div>
              </div>
            ) : (
              activeVisual && (
                <>
                  {/* 1. Custom Visuals Gallery Grid (12 Visuals including Table & Matrix Table) */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                      1. Choose Visual Type
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {VISUAL_TYPES.map((vt) => {
                        const isActive = activeVisual.type === vt.type;
                        return (
                          <button
                            key={vt.type}
                            type="button"
                            onClick={() => updateActiveVisual({ type: vt.type })}
                            title={vt.desc}
                            className={`px-2.5 py-2 rounded-lg border text-left transition-all flex items-center gap-2 ${
                              isActive
                                ? 'bg-[#E6F2EB] border-[#217346] text-[#185C37] font-bold shadow-sm'
                                : 'bg-[#F8F9FA] border-[#D4D4D4] text-[#212121] hover:bg-[#EFEFEF]'
                            }`}
                          >
                            {vt.type.includes('bar') ? (
                              <BarChartHorizontal className="w-4 h-4 text-[#217346] shrink-0" />
                            ) : vt.type === 'donut' || vt.type === 'pie' ? (
                              <PieChart className="w-4 h-4 text-[#0EA5E9] shrink-0" />
                            ) : vt.type === 'line_area' ? (
                              <TrendingUp className="w-4 h-4 text-[#2563EB] shrink-0" />
                            ) : vt.type === 'treemap' ? (
                              <LayoutGrid className="w-4 h-4 text-[#7C3AED] shrink-0" />
                            ) : vt.type === 'histogram' ? (
                              <Activity className="w-4 h-4 text-[#EC4899] shrink-0" />
                            ) : vt.type === 'table' ? (
                              <Table2 className="w-4 h-4 text-[#217346] shrink-0" />
                            ) : vt.type === 'matrix' ? (
                              <Grid className="w-4 h-4 text-[#D97706] shrink-0" />
                            ) : (
                              <BarChart3 className="w-4 h-4 text-[#217346] shrink-0" />
                            )}
                            <span className="text-xs truncate">{vt.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Edit Visual Title & Field Wells (Data Binding) */}
                  <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                      2. Title &amp; Field Wells
                    </label>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[#212121] flex items-center gap-1">
                          <Pencil className="w-3 h-3 text-[#217346]" /> Edit Visual Title
                        </label>
                        {activeVisual.customTitle && (
                          <button
                            type="button"
                            onClick={() =>
                              setVisuals((prev) =>
                                prev.map((v) =>
                                  v.id === activeVisual.id ? { ...v, customTitle: false } : v
                                )
                              )
                            }
                            className="text-[10px] text-[#217346] hover:underline"
                          >
                            Auto Title
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        aria-label="Edit Visual Title"
                        value={activeVisual.title}
                        onChange={(e) => updateActiveVisual({ title: e.target.value })}
                        className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#212121]"
                      />
                    </div>

                    {activeVisual.type !== 'histogram' && (
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          {activeVisual.type === 'matrix'
                            ? 'Matrix Rows (Row Groups)'
                            : activeVisual.type === 'table'
                            ? 'Primary Group Column'
                            : 'Category / Axis (X-Axis)'}
                        </label>
                        <select
                          aria-label="Visual Category Axis"
                          value={activeVisual.categoryCol}
                          onChange={(e) => updateActiveVisual({ categoryCol: e.target.value })}
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                        >
                          {columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.data_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(activeVisual.type === 'clustered_bar' ||
                      activeVisual.type === 'clustered_column' ||
                      activeVisual.type === 'stacked_column' ||
                      activeVisual.type === 'matrix' ||
                      activeVisual.type === 'table') && (
                      <div>
                        <label className="text-xs font-semibold text-[#217346] block mb-1">
                          {activeVisual.type === 'matrix'
                            ? 'Matrix Columns (Pivot Header)'
                            : activeVisual.type === 'table'
                            ? 'Secondary Detail Column'
                            : 'Legend / Series (Cluster / Stack By)'}
                        </label>
                        <select
                          aria-label="Visual Legend Series"
                          value={activeVisual.seriesCol}
                          onChange={(e) => updateActiveVisual({ seriesCol: e.target.value })}
                          className="w-full bg-white border border-[#217346] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                        >
                          {columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Values (Metric)
                        </label>
                        <select
                          aria-label="Visual Value Column"
                          value={activeVisual.valueCol}
                          onChange={(e) => updateActiveVisual({ valueCol: e.target.value })}
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                        >
                          {columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Aggregation
                        </label>
                        <select
                          aria-label="Visual Aggregation"
                          value={activeVisual.aggFunc}
                          onChange={(e) =>
                            updateActiveVisual({ aggFunc: e.target.value as VisualAggType })
                          }
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121] font-semibold"
                        >
                          <option value="sum">SUM</option>
                          <option value="count">COUNT</option>
                          <option value="avg">AVERAGE</option>
                          <option value="min">MIN</option>
                          <option value="max">MAX</option>
                          <option value="distinct">DISTINCT COUNT</option>
                        </select>
                      </div>
                    </div>

                    {activeVisual.type === 'histogram' && (
                      <div>
                        <label className="text-xs font-semibold text-[#212121] block mb-1">
                          Number of Histogram Bins: <strong>{activeVisual.bins}</strong>
                        </label>
                        <input
                          type="range"
                          min={4}
                          max={20}
                          value={activeVisual.bins}
                          onChange={(e) => updateActiveVisual({ bins: Number(e.target.value) })}
                          className="w-full accent-[#217346]"
                        />
                      </div>
                    )}
                  </div>

                  {/* 3. Edit Legend & Color Palettes */}
                  <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-[#217346]" />
                        3. Edit Legend &amp; Colors
                      </label>
                      {((activeVisual.customColors &&
                        Object.keys(activeVisual.customColors).length > 0) ||
                        (activeVisual.customLegendLabels &&
                          Object.keys(activeVisual.customLegendLabels).length > 0)) && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveVisual({ customColors: {}, customLegendLabels: {} })
                          }
                          className="text-[10px] text-[#C50F1F] hover:underline"
                        >
                          Reset Colors
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Visual Color Palette
                        </label>
                        <select
                          aria-label="Visual Color Palette"
                          value={activeVisual.paletteId || paletteId}
                          onChange={(e) =>
                            updateActiveVisual({ paletteId: e.target.value as PaletteId })
                          }
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2 py-1.5 text-xs text-[#212121]"
                        >
                          {Object.entries(COLOR_PALETTES).map(([id, p]) => (
                            <option key={id} value={id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Legend Position
                        </label>
                        <select
                          aria-label="Legend Position"
                          value={activeVisual.legendPosition || 'top_left'}
                          onChange={(e) =>
                            updateActiveVisual({
                              legendPosition: e.target.value as LegendPositionType,
                            })
                          }
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2 py-1.5 text-xs text-[#212121]"
                        >
                          <option value="top_left">Top Left</option>
                          <option value="top">Top Center</option>
                          <option value="top_right">Top Right</option>
                          <option value="left">Left</option>
                          <option value="left_center">Left Center</option>
                          <option value="right">Right</option>
                          <option value="right_center">Right Center</option>
                          <option value="bottom_left">Bottom Left</option>
                          <option value="bottom">Bottom Center</option>
                          <option value="bottom_right">Bottom Right</option>
                          <option value="hide">Hide Legend</option>
                        </select>
                      </div>
                    </div>

                    {/* Palette Swatches Preview */}
                    <div className="flex items-center gap-1 p-1.5 bg-[#F8F9FA] rounded-lg border border-[#E1E1E1]">
                      {getVisualPalette(activeVisual).map((hex, i) => (
                        <div
                          key={i}
                          style={{ backgroundColor: hex }}
                          className="flex-1 h-4 rounded-sm"
                          title={hex}
                        />
                      ))}
                    </div>

                    {/* Per-Series / Category Legend Label & Color Picker */}
                    {activeVisualLegendItems.length > 0 && (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-[#F8F9FA] border border-[#E1E1E1] rounded-lg">
                        <div className="text-[10px] font-semibold text-[#605E5C] uppercase tracking-wider mb-1">
                          Customize Series / Category Colors &amp; Labels
                        </div>
                        {activeVisualLegendItems.map((itemKey, idx) => {
                          const currentColor = getItemColor(activeVisual, itemKey, idx);
                          const currentLabel =
                            activeVisual.customLegendLabels?.[itemKey] ?? itemKey;
                          return (
                            <div key={itemKey} className="flex items-center gap-2">
                              <input
                                type="color"
                                aria-label={`Color for ${itemKey}`}
                                value={currentColor}
                                onChange={(e) =>
                                  updateActiveVisual({
                                    customColors: {
                                      ...(activeVisual.customColors || {}),
                                      [itemKey]: e.target.value,
                                    },
                                  })
                                }
                                className="w-6 h-6 rounded border border-[#D4D4D4] cursor-pointer shrink-0"
                              />
                              <input
                                type="text"
                                value={currentLabel}
                                onChange={(e) =>
                                  updateActiveVisual({
                                    customLegendLabels: {
                                      ...(activeVisual.customLegendLabels || {}),
                                      [itemKey]: e.target.value,
                                    },
                                  })
                                }
                                className="flex-1 bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Conditional Formatting */}
                  <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#217346]" />
                      4. Conditional Formatting
                    </label>

                    <div>
                      <label className="text-xs font-medium text-[#605E5C] block mb-1">
                        Formatting Mode
                      </label>
                      <select
                        aria-label="Conditional Formatting Mode"
                        value={activeVisual.conditionalFormatting?.mode || 'none'}
                        onChange={(e) =>
                          updateActiveVisualCF({
                            mode: e.target.value as ConditionalFormatMode,
                          })
                        }
                        className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#212121]"
                      >
                        <option value="none">None (Standard Palette)</option>
                        <option value="color_scale">Color Scale (Gradient Heatmap)</option>
                        <option value="data_bars">Data Bars (In-Cell Fill Bars)</option>
                        <option value="rules">Threshold Rules (High / Mid / Low)</option>
                      </select>
                    </div>

                    {activeVisual.conditionalFormatting?.mode === 'color_scale' && (
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Color Scale Gradient
                        </label>
                        <select
                          aria-label="Color Scale Preset"
                          value={
                            activeVisual.conditionalFormatting?.scalePreset || 'red_yellow_green'
                          }
                          onChange={(e) =>
                            updateActiveVisualCF({
                              scalePreset: e.target.value as ColorScalePreset,
                            })
                          }
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                        >
                          <option value="red_yellow_green">Red → Yellow → Green (High = Good)</option>
                          <option value="green_yellow_red">Green → Yellow → Red (Low = Good)</option>
                          <option value="white_emerald">White → Emerald Green</option>
                          <option value="white_blue">White → Ocean Blue</option>
                          <option value="blue_white_red">Blue → White → Red (Diverging)</option>
                        </select>
                      </div>
                    )}

                    {activeVisual.conditionalFormatting?.mode === 'data_bars' && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#605E5C]">Data Bar Fill Color</span>
                        <input
                          type="color"
                          value={activeVisual.conditionalFormatting?.dataBarColor || '#217346'}
                          onChange={(e) =>
                            updateActiveVisualCF({ dataBarColor: e.target.value })
                          }
                          className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer"
                        />
                      </div>
                    )}

                    {activeVisual.conditionalFormatting?.mode === 'rules' && (
                      <div className="space-y-2 p-2.5 bg-[#F8F9FA] border border-[#E1E1E1] rounded-lg">
                        <div className="grid grid-cols-2 gap-2 items-center">
                          <div>
                            <label className="text-[10px] font-semibold text-[#212121] block">
                              High Threshold (&gt;=)
                            </label>
                            <input
                              type="number"
                              value={activeVisual.conditionalFormatting?.highThreshold ?? 500}
                              onChange={(e) =>
                                updateActiveVisualCF({ highThreshold: Number(e.target.value) })
                              }
                              className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-[#212121] block">
                              High Color (▲)
                            </label>
                            <input
                              type="color"
                              value={activeVisual.conditionalFormatting?.highColor || '#107C10'}
                              onChange={(e) =>
                                updateActiveVisualCF({ highColor: e.target.value })
                              }
                              className="w-full h-7 rounded border border-[#D4D4D4] cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 items-center">
                          <div>
                            <label className="text-[10px] font-semibold text-[#212121] block">
                              Low Threshold (&lt;=)
                            </label>
                            <input
                              type="number"
                              value={activeVisual.conditionalFormatting?.lowThreshold ?? 100}
                              onChange={(e) =>
                                updateActiveVisualCF({ lowThreshold: Number(e.target.value) })
                              }
                              className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-[#212121] block">
                              Low Color (▼)
                            </label>
                            <input
                              type="color"
                              value={activeVisual.conditionalFormatting?.lowColor || '#C50F1F'}
                              onChange={(e) =>
                                updateActiveVisualCF({ lowColor: e.target.value })
                              }
                              className="w-full h-7 rounded border border-[#D4D4D4] cursor-pointer"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-[#212121] cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={activeVisual.conditionalFormatting?.showIcons ?? true}
                            onChange={(e) =>
                              updateActiveVisualCF({ showIcons: e.target.checked })
                            }
                            className="rounded border-[#D4D4D4] text-[#217346]"
                          />
                          <span>Show Rule Status Icons (▲ / ● / ▼)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* 5. Data Labels & Sorting */}
                  <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                      5. Data Labels &amp; Sorting
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#212121] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeVisual.showDataLabels}
                        onChange={(e) => updateActiveVisual({ showDataLabels: e.target.checked })}
                        className="rounded border-[#D4D4D4] text-[#217346]"
                      />
                      <span>Show Data Labels</span>
                    </label>

                    {activeVisual.showDataLabels && (
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#F8F9FA] border border-[#D4D4D4]">
                        <div>
                          <label className="text-[11px] font-semibold text-[#212121] block mb-1">
                            Label Position
                          </label>
                          <select
                            aria-label="Data Label Position"
                            value={activeVisual.dataLabelPosition || 'outside_end'}
                            onChange={(e) =>
                              updateActiveVisual({
                                dataLabelPosition: e.target.value as DataLabelPositionType,
                              })
                            }
                            className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2 py-1.5 text-xs text-[#212121]"
                          >
                            <option value="inside_end">Inside End</option>
                            <option value="outside_end">Outside End</option>
                            <option value="inside_center">Inside Center</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-[#212121] block mb-1">
                            Label Content
                          </label>
                          <select
                            aria-label="Data Label Format"
                            value={activeVisual.dataLabelContent || 'totals_only'}
                            onChange={(e) =>
                              updateActiveVisual({
                                dataLabelContent: e.target.value as DataLabelContentType,
                              })
                            }
                            className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2 py-1.5 text-xs text-[#212121]"
                          >
                            <option value="totals_only">Only Totals</option>
                            <option value="totals_and_percentage">Totals and Percentage</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Sort Order
                        </label>
                        <select
                          value={activeVisual.sortBy}
                          onChange={(e) =>
                            updateActiveVisual({
                              sortBy: e.target.value as DashboardVisualConfig['sortBy'],
                            })
                          }
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2 py-1.5 text-xs text-[#212121]"
                        >
                          <option value="value_desc">Value (High → Low)</option>
                          <option value="value_asc">Value (Low → High)</option>
                          <option value="category_asc">Category (A → Z)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          Top N Categories
                        </label>
                        <select
                          value={activeVisual.topN}
                          onChange={(e) => updateActiveVisual({ topN: Number(e.target.value) })}
                          className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2 py-1.5 text-xs text-[#212121]"
                        >
                          <option value={5}>Top 5</option>
                          <option value={8}>Top 8</option>
                          <option value={10}>Top 10</option>
                          <option value={15}>Top 15</option>
                          <option value={25}>Top 25</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
