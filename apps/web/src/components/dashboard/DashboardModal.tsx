import React, { useState, useEffect, useMemo } from 'react';
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
  Hash,
  CheckSquare,
  Square,
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
  | 'slicer'
  | 'kpi_card';

export type VisualAggType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct';

export type PaletteId = 'classic' | 'excel' | 'ocean' | 'sunset';

export interface DashboardKpiConfig {
  id: string;
  title: string;
  column: string;
  aggFunc: VisualAggType;
  subtitle: string;
  accentColor: string;
}

export interface DashboardVisualConfig {
  id: string;
  title: string;
  type: CustomVisualType;
  categoryCol: string;
  valueCol: string;
  seriesCol: string;
  aggFunc: VisualAggType;
  bins: number;
  topN: number;
  sortBy: 'value_desc' | 'value_asc' | 'category_asc';
  showDataLabels: boolean;
  span: 1 | 2;
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
    name: 'Ocean Cool',
    colors: ['#0EA5E9', '#2563EB', '#14B8A6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'],
  },
  sunset: {
    name: 'Executive Warm',
    colors: ['#F97316', '#EF4444', '#EAB308', '#EC4899', '#8B5CF6', '#06B6D4', '#10B981', '#3B82F6'],
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
];

const STORAGE_KEY_DASHBOARDS = 'stepsheet_dashboards_v2';

export const DashboardModal: React.FC<DashboardModalProps> = ({ isOpen, onClose }) => {
  const { selectedDataset, columns, rows, allRows } = useWorkbenchStore();

  const [visuals, setVisuals] = useState<DashboardVisualConfig[]>([]);
  const [kpiCards, setKpiCards] = useState<DashboardKpiConfig[]>([]);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const [paletteId, setPaletteId] = useState<PaletteId>('classic');

  // Multi-Slicer State: array of active slicer columns + map of column -> selected values (empty array = All)
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
    const val2 =
      numericCols.find((c) => c.name !== val1)?.name || val1;

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

  const buildDefaultVisuals = (): DashboardVisualConfig[] => {
    const { cat1, cat2, val1 } = getSmartDefaults();
    return [
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
      },
    ];
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
        setVisuals(saved.visuals);
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
        setSelectedVisualId(saved.visuals[0]?.id || null);
        setSelectedKpiId(null);
        return;
      }
    } catch {
      // ignore storage errors
    }

    const defaultVisuals = buildDefaultVisuals();
    const defaultKpis = buildDefaultKpiCards();
    setVisuals(defaultVisuals);
    setKpiCards(defaultKpis);
    setSlicerColumns([cat1, cat2].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i));
    setMultiSlicerSelections({});
    setSelectedVisualId(defaultVisuals[0]?.id || null);
    setSelectedKpiId(null);
  }, [isOpen, selectedDataset?.id, columns]);

  // Persist dashboard state
  useEffect(() => {
    if (!isOpen || visuals.length === 0) return;
    const dsKey = selectedDataset?.id || 'default';
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARDS);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[dsKey] = { visuals, kpiCards, slicerColumns };
      localStorage.setItem(STORAGE_KEY_DASHBOARDS, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, [visuals, kpiCards, slicerColumns, selectedDataset?.id, isOpen]);

  // Helper to get distinct values for any column
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

  // Toggle a single value inside a column's multi-select slicer
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

  // Filtered rows after applying ALL multi-select Slicers (top bar + slicer visuals) + Cross-Filter
  const filteredRows = useMemo(() => {
    return sourceRows.filter((r) => {
      // Check all active multi-slicer selections across any column
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
  const palette = COLOR_PALETTES[paletteId]?.colors || COLOR_PALETTES.classic.colors;

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
    const newId = `kpi_${Date.now()}`;
    const newKpi: DashboardKpiConfig = {
      id: newId,
      title: `SUM of ${val1 || 'Metric'}`,
      column: val1 || columns[0]?.name || '',
      aggFunc: 'sum',
      subtitle: `Across active filtered rows`,
      accentColor: palette[kpiCards.length % palette.length],
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
        if (patch.column || patch.aggFunc) {
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
        if (patch.type || patch.categoryCol || patch.valueCol || patch.aggFunc) {
          const typeMeta = VISUAL_TYPES.find((t) => t.type === next.type);
          if (next.type === 'slicer') {
            next.title = `Slicer: ${next.categoryCol} (Multi-Select)`;
          } else if (next.type === 'kpi_card') {
            next.title = `KPI: ${next.aggFunc.toUpperCase()}(${next.valueCol}) by ${next.categoryCol}`;
          } else if (next.type === 'histogram') {
            next.title = `${next.valueCol} Distribution (${next.bins} Bins)`;
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

  const handleAddVisual = (type: CustomVisualType = 'column') => {
    const { cat1, cat2, val1 } = getSmartDefaults();
    const newId = `vis_${Date.now()}`;
    const typeMeta = VISUAL_TYPES.find((t) => t.type === type);
    const newVis: DashboardVisualConfig = {
      id: newId,
      title:
        type === 'slicer'
          ? `Slicer: ${cat1 || 'Category'} (Multi-Select)`
          : type === 'kpi_card'
          ? `KPI: SUM(${val1 || 'Metric'}) by ${cat1 || 'Category'}`
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
      span: 1,
    };
    setVisuals((prev) => [...prev, newVis]);
    setSelectedVisualId(newId);
    setSelectedKpiId(null);
  };

  const handleDuplicateVisual = (vis: DashboardVisualConfig) => {
    const copyId = `vis_${Date.now()}`;
    const copy: DashboardVisualConfig = {
      ...vis,
      id: copyId,
      title: `${vis.title} (Copy)`,
    };
    setVisuals((prev) => [...prev, copy]);
    setSelectedVisualId(copyId);
    setSelectedKpiId(null);
  };

  const handleRemoveVisual = (id: string) => {
    setVisuals((prev) => {
      const next = prev.filter((v) => v.id !== id);
      if (selectedVisualId === id) {
        setSelectedVisualId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleResetDashboard = () => {
    const defaults = buildDefaultVisuals();
    const defaultKpis = buildDefaultKpiCards();
    const { cat1, cat2 } = getSmartDefaults();
    setVisuals(defaults);
    setKpiCards(defaultKpis);
    setSlicerColumns([cat1, cat2].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i));
    setMultiSlicerSelections({});
    setCrossFilter(null);
    setSelectedVisualId(defaults[0]?.id || null);
    setSelectedKpiId(null);
  };

  const toggleCrossFilter = (column: string, value: string) => {
    if (!column) return;
    setCrossFilter((prev) =>
      prev && prev.column === column && prev.value === value ? null : { column, value }
    );
  };

  // Render an individual Visual Card
  const renderVisualContent = (vis: DashboardVisualConfig) => {
    // 0A. INTERACTIVE SLICER VISUAL (MULTI-SELECT)
    if (vis.type === 'slicer') {
      const col = vis.categoryCol || columns[0]?.name || '';
      const distinctVals = getDistinctValuesForColumn(col);
      const selectedForCol = multiSlicerSelections[col] || [];
      const isAllSelected = selectedForCol.length === 0;

      return (
        <div className="space-y-2.5 pt-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-semibold text-[#212121]">
              Filter Field: <span className="text-[#217346] font-mono">{col}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#605E5C]">
                {isAllSelected
                  ? `All (${distinctVals.length})`
                  : `${selectedForCol.length} of ${distinctVals.length} selected`}
              </span>
              {!isAllSelected && (
                <button
                  type="button"
                  onClick={() => clearColumnSlicer(col)}
                  className="text-[11px] font-semibold text-[#C50F1F] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-1">
            {distinctVals.map((val) => {
              const isChecked = selectedForCol.includes(val);
              const countInSource = sourceRows.filter((r) => {
                const c = r[col];
                const norm =
                  c === null || c === undefined || String(c).trim() === '' ? '(Blank)' : String(c);
                return norm === val;
              }).length;

              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleSlicerValue(col, val)}
                  className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded border text-xs text-left transition-all ${
                    isChecked
                      ? 'bg-[#E6F2EB] border-[#217346] text-[#185C37] font-bold shadow-sm'
                      : 'bg-[#F8F9FA] border-[#D4D4D4] text-[#212121] hover:bg-[#EFEFEF]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#217346] shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-[#605E5C] shrink-0" />
                    )}
                    <span className="truncate">{val}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#605E5C] shrink-0">
                    {countInSource}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // 0B. KPI SUMMARY CARD VISUAL
    if (vis.type === 'kpi_card') {
      const mainVal = computeMetric(filteredRows, vis.valueCol, vis.aggFunc);
      const totalVal = computeMetric(sourceRows, vis.valueCol, vis.aggFunc) || 1;
      const ratioPct = Math.min(100, Math.max(0, Math.round((mainVal / totalVal) * 100)));

      // Top 3 category contributors
      const catMap = new Map<string, Record<string, any>[]>();
      filteredRows.forEach((r) => {
        const k = String(r[vis.categoryCol] ?? '(Blank)');
        if (!catMap.has(k)) catMap.set(k, []);
        catMap.get(k)!.push(r);
      });
      const topContributors = Array.from(catMap.entries())
        .map(([cat, gRows]) => ({
          cat,
          val: computeMetric(gRows, vis.valueCol, vis.aggFunc),
        }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 3);

      return (
        <div className="space-y-3 py-2 px-1">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#605E5C]">
                {vis.aggFunc.toUpperCase()} OF {vis.valueCol}
              </div>
              <div className="text-3xl font-extrabold text-[#212121] font-mono mt-1">
                {formatNum(mainVal)}
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-2 py-0.5 rounded bg-[#E6F2EB] text-[#217346] text-xs font-bold font-mono">
                {ratioPct}% of Dataset
              </span>
              <div className="text-[11px] text-[#605E5C] mt-1">
                {filteredRows.length} active rows
              </div>
            </div>
          </div>

          <div className="w-full h-2.5 bg-[#E6E6E6] rounded-full overflow-hidden">
            <div
              style={{ width: `${ratioPct}%`, backgroundColor: palette[0] }}
              className="h-full rounded-full transition-all"
            />
          </div>

          {topContributors.length > 0 && (
            <div className="pt-2 border-t border-[#E1E1E1] grid grid-cols-3 gap-2">
              {topContributors.map((c) => (
                <div
                  key={c.cat}
                  onClick={() => toggleCrossFilter(vis.categoryCol, c.cat)}
                  className="p-2 rounded bg-[#F8F9FA] border border-[#E1E1E1] cursor-pointer hover:border-[#217346]"
                >
                  <div className="text-[10px] text-[#605E5C] truncate">{c.cat}</div>
                  <div className="text-xs font-bold font-mono text-[#212121]">
                    {formatNum(c.val)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

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
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;

      return (
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
              const heightPct = Math.max(4, Math.round((b.count / maxCount) * 100));
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end h-full group"
                  title={`${b.label}: ${b.count} rows`}
                >
                  {vis.showDataLabels && (
                    <span className="text-[10px] font-mono font-semibold text-[#212121] mb-1">
                      {b.count}
                    </span>
                  )}
                  <div
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: palette[0],
                    }}
                    className="w-full rounded-t transition-all opacity-90 group-hover:opacity-100"
                  />
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
    }

    // Group rows by categoryCol for standard & multi-series visuals
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
      rows: groupRows,
    }));

    if (vis.sortBy === 'value_desc') items.sort((a, b) => b.value - a.value);
    else if (vis.sortBy === 'value_asc') items.sort((a, b) => a.value - b.value);
    else items.sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }));

    items = items.slice(0, vis.topN || 10);
    const maxVal = Math.max(1, ...items.map((x) => Math.abs(x.value)));
    const totalVal = items.reduce((acc, x) => acc + Math.max(0, x.value), 0) || 1;

    if (items.length === 0) {
      return (
        <div className="h-56 flex items-center justify-center text-xs text-[#605E5C]">
          No data available for current filter selection.
        </div>
      );
    }

    // 2. CLUSTERED BAR / CLUSTERED COLUMN / STACKED COLUMN
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

      return (
        <div className="space-y-3">
          {/* Series Legend */}
          <div className="flex flex-wrap items-center gap-3 px-1">
            {seriesKeys.map((sk, idx) => (
              <button
                key={sk}
                type="button"
                onClick={() => toggleCrossFilter(seriesCol, sk)}
                className="flex items-center gap-1.5 text-[11px] text-[#212121] hover:text-[#217346]"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: palette[idx % palette.length] }}
                />
                <span className="truncate max-w-[110px] font-medium">{sk}</span>
              </button>
            ))}
          </div>

          {vis.type === 'clustered_bar' ? (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {matrix.map((row) => (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => toggleCrossFilter(vis.categoryCol, row.category)}
                      className="font-semibold text-[#212121] hover:text-[#217346] truncate max-w-[180px]"
                    >
                      {row.category}
                    </button>
                    <span className="text-[10px] font-mono text-[#605E5C]">
                      Total: {formatNum(row.rowSum)}
                    </span>
                  </div>
                  <div className="space-y-1 pl-2 border-l border-[#D4D4D4]">
                    {seriesKeys.map((sk, sIdx) => {
                      const val = row.seriesVals[sk] || 0;
                      const pct = Math.max(2, Math.round((val / maxSeriesVal) * 100));
                      return (
                        <div key={sk} className="flex items-center gap-2">
                          <span className="w-16 text-[10px] text-[#605E5C] truncate">{sk}</span>
                          <div className="flex-1 h-3.5 bg-[#EFEFEF] rounded-sm overflow-hidden">
                            <div
                              style={{
                                width: `${pct}%`,
                                backgroundColor: palette[sIdx % palette.length],
                              }}
                              className="h-full rounded-sm transition-all"
                            />
                          </div>
                          {vis.showDataLabels && (
                            <span className="w-14 text-right text-[10px] font-mono font-semibold text-[#212121]">
                              {formatNum(val)}
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
                {matrix.map((row) => (
                  <div
                    key={row.category}
                    onClick={() => toggleCrossFilter(vis.categoryCol, row.category)}
                    className="flex-1 h-full flex flex-col justify-end items-center cursor-pointer group"
                  >
                    {vis.type === 'stacked_column' ? (
                      <div className="w-full max-w-[44px] h-full flex flex-col justify-end">
                        {vis.showDataLabels && (
                          <span className="text-[10px] font-mono font-semibold text-[#212121] text-center mb-1">
                            {formatNum(row.rowSum)}
                          </span>
                        )}
                        <div
                          style={{
                            height: `${Math.max(6, Math.round((row.rowSum / maxSeriesVal) * 100))}%`,
                          }}
                          className="w-full flex flex-col rounded-t overflow-hidden"
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
                                  backgroundColor: palette[sIdx % palette.length],
                                }}
                                title={`${row.category} • ${sk}: ${formatNum(val)}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-end justify-center gap-1">
                        {seriesKeys.map((sk, sIdx) => {
                          const val = row.seriesVals[sk] || 0;
                          const hPct = Math.max(4, Math.round((val / maxSeriesVal) * 100));
                          return (
                            <div
                              key={sk}
                              style={{
                                height: `${hPct}%`,
                                backgroundColor: palette[sIdx % palette.length],
                              }}
                              title={`${row.category} • ${sk}: ${formatNum(val)}`}
                              className="flex-1 max-w-[16px] rounded-t transition-all opacity-90 group-hover:opacity-100"
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 px-2 pt-1.5">
                {matrix.map((row) => (
                  <div
                    key={row.category}
                    className="flex-1 text-center text-[10px] font-medium text-[#212121] truncate"
                    title={row.category}
                  >
                    {row.category}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 3. HORIZONTAL BAR CHART
    if (vis.type === 'bar') {
      return (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 pt-1">
          {items.map((item, idx) => {
            const pct = Math.max(3, Math.round((Math.abs(item.value) / maxVal) * 100));
            const isSelected =
              crossFilter?.column === vis.categoryCol && crossFilter?.value === item.category;
            return (
              <div
                key={item.category}
                onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                className={`p-1.5 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#E6F2EB] border border-[#217346]'
                    : 'hover:bg-[#F3F3F3]'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#212121] truncate max-w-[200px]">
                    {item.category}
                  </span>
                  {vis.showDataLabels && (
                    <span className="font-mono font-semibold text-xs text-[#212121]">
                      {formatNum(item.value)}{' '}
                      <span className="text-[10px] text-[#605E5C]">
                        ({((Math.max(0, item.value) / totalVal) * 100).toFixed(1)}%)
                      </span>
                    </span>
                  )}
                </div>
                <div className="w-full h-4 bg-[#EFEFEF] rounded overflow-hidden">
                  <div
                    style={{
                      width: `${pct}%`,
                      backgroundColor: palette[idx % palette.length],
                    }}
                    className="h-full rounded transition-all"
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // 4. VERTICAL COLUMN CHART
    if (vis.type === 'column') {
      return (
        <div className="pt-2">
          <div className="h-48 flex items-end gap-2.5 pt-6 pb-2 px-2 border-b border-[#D4D4D4]">
            {items.map((item, idx) => {
              const hPct = Math.max(5, Math.round((Math.abs(item.value) / maxVal) * 100));
              const isSelected =
                crossFilter?.column === vis.categoryCol && crossFilter?.value === item.category;
              return (
                <div
                  key={item.category}
                  onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                  className="flex-1 h-full flex flex-col items-center justify-end cursor-pointer group"
                  title={`${item.category}: ${formatNum(item.value)}`}
                >
                  {vis.showDataLabels && (
                    <span className="text-[10px] font-mono font-bold text-[#212121] mb-1">
                      {formatNum(item.value)}
                    </span>
                  )}
                  <div
                    style={{
                      height: `${hPct}%`,
                      backgroundColor: palette[idx % palette.length],
                    }}
                    className={`w-full max-w-[42px] rounded-t transition-all ${
                      isSelected
                        ? 'ring-2 ring-[#217346] brightness-110'
                        : 'opacity-90 group-hover:opacity-100'
                    }`}
                  />
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
                {item.category}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 5. DONUT & PIE CHARTS (SVG)
    if (vis.type === 'donut' || vis.type === 'pie') {
      const isDonut = vis.type === 'donut';
      const radius = 64;
      const circumference = 2 * Math.PI * radius;
      let cumulativeShare = 0;

      return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-2">
          <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 160 160" className="w-44 h-44 -rotate-90">
              {items.map((item, idx) => {
                const val = Math.max(0, item.value);
                const share = val / totalVal;
                const dash = share * circumference;
                const offset = -cumulativeShare * circumference;
                cumulativeShare += share;
                return (
                  <circle
                    key={item.category}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke={palette[idx % palette.length]}
                    strokeWidth={isDonut ? 28 : 64}
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={offset}
                    onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                    className="cursor-pointer transition-opacity hover:opacity-85"
                  >
                    <title>
                      {item.category}: {formatNum(item.value)} ({(share * 100).toFixed(1)}%)
                    </title>
                  </circle>
                );
              })}
            </svg>
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

          <div className="flex-1 w-full space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {items.map((item, idx) => {
              const share = ((Math.max(0, item.value) / totalVal) * 100).toFixed(1);
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
                  className="w-full flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-[#F3F3F3]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: palette[idx % palette.length] }}
                    />
                    <span className="text-[#212121] font-medium truncate">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                    <span className="text-[#212121] font-semibold">{formatNum(item.value)}</span>
                    <span className="text-[#605E5C] w-12 text-right">({share}%)</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // 6. LINE & AREA TREND CHART (SVG)
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

      return (
        <div className="pt-1">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 overflow-visible">
            <defs>
              <linearGradient id={`grad_${vis.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette[0]} stopOpacity="0.45" />
                <stop offset="100%" stopColor={palette[0]} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#grad_${vis.id})`} />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={palette[0]}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}
            {pts.map((p) => (
              <g
                key={p.category}
                onClick={() => toggleCrossFilter(vis.categoryCol, p.category)}
                className="cursor-pointer"
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4.5"
                  fill={palette[0]}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                {vis.showDataLabels && (
                  <text
                    x={p.x}
                    y={p.y - 8}
                    textAnchor="middle"
                    className="fill-[#212121] text-[9px] font-mono font-bold"
                  >
                    {formatNum(p.value)}
                  </text>
                )}
                <text
                  x={p.x}
                  y={height - 4}
                  textAnchor="middle"
                  className="fill-[#605E5C] text-[9px]"
                >
                  {p.category.slice(0, 10)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      );
    }

    // 7. TREEMAP HIERARCHY VISUAL
    return (
      <div className="flex flex-wrap gap-1.5 h-52 pt-1 content-start overflow-hidden">
        {items.map((item, idx) => {
          const share = Math.max(8, Math.round((Math.max(0, item.value) / totalVal) * 100));
          return (
            <div
              key={item.category}
              onClick={() => toggleCrossFilter(vis.categoryCol, item.category)}
              style={{
                flexBasis: `${Math.max(18, Math.min(100, share * 1.4))}%`,
                backgroundColor: palette[idx % palette.length],
              }}
              className="flex-1 min-h-[64px] p-2.5 rounded border border-white/25 cursor-pointer hover:brightness-110 transition-all flex flex-col justify-between overflow-hidden"
            >
              <span className="text-xs font-bold text-white truncate drop-shadow">
                {item.category}
              </span>
              {vis.showDataLabels && (
                <div className="text-[11px] font-mono text-white font-semibold drop-shadow">
                  {formatNum(item.value)} ({((Math.max(0, item.value) / totalVal) * 100).toFixed(0)}%)
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
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
                Multi-select slicers, dynamic KPI cards, and cross-filtering visuals
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Dashboard Color Theme"
              value={paletteId}
              onChange={(e) => setPaletteId(e.target.value as PaletteId)}
              className="bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121] font-medium"
            >
              {Object.entries(COLOR_PALETTES).map(([id, p]) => (
                <option key={id} value={id}>
                  Theme: {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAddKpiCard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346]/40"
            >
              <Plus className="w-3.5 h-3.5" /> Add KPI Card
            </button>

            <button
              type="button"
              onClick={handleAddTopSlicer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346]/40"
            >
              <Filter className="w-3.5 h-3.5" /> Add Slicer
            </button>

            <button
              type="button"
              onClick={() => handleAddVisual('column')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#217346] hover:bg-[#185C37] text-white shadow"
            >
              <Plus className="w-3.5 h-3.5" /> Add Visual
            </button>

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

          {/* Active Multi-Select Slicers Strip */}
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

        {/* Main Body: Left Canvas + Right Visualizations & KPI Inspector Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Interactive Dashboard Canvas */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#F3F3F3]">
            {/* Dynamic KPI Cards Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#605E5C] flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-[#217346]" />
                  Dynamic KPI Cards ({kpiCards.length}) — Click any card to customize metric &amp; aggregation
                </span>
                <button
                  type="button"
                  onClick={handleAddKpiCard}
                  className="text-xs font-semibold text-[#217346] hover:underline flex items-center gap-1"
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

            {/* Visual Tiles Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {visuals.map((vis) => {
                const isSelected = !selectedKpiId && vis.id === activeVisual?.id;
                const typeMeta = VISUAL_TYPES.find((t) => t.type === vis.type);
                return (
                  <div
                    key={vis.id}
                    onClick={() => {
                      setSelectedVisualId(vis.id);
                      setSelectedKpiId(null);
                    }}
                    className={`bg-white rounded-xl border transition-all p-4 flex flex-col justify-between cursor-pointer ${
                      vis.span === 2 ? 'lg:col-span-2' : 'lg:col-span-1'
                    } ${
                      isSelected
                        ? 'border-[#217346] ring-2 ring-[#217346]/25 shadow-md'
                        : 'border-[#D4D4D4] hover:border-[#217346]/60 shadow-sm'
                    }`}
                  >
                    {/* Tile Header */}
                    <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-[#E1E1E1]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 rounded">
                            {typeMeta?.shortLabel || vis.type}
                          </span>
                          <h3 className="text-xs font-bold text-[#212121] truncate">
                            {vis.title}
                          </h3>
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setVisuals((prev) =>
                              prev.map((v) =>
                                v.id === vis.id ? { ...v, span: v.span === 2 ? 1 : 2 } : v
                              )
                            )
                          }
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
                    <div className="flex-1">{renderVisualContent(vis)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Visualizations & KPI Inspector Pane */}
          <div className="w-80 sm:w-96 border-l border-[#D4D4D4] bg-white p-4 overflow-y-auto space-y-5 shrink-0">
            <div className="flex items-center justify-between border-b border-[#D4D4D4] pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#217346]">
                <SlidersHorizontal className="w-4 h-4" />
                <span>Visualizations Pane</span>
              </div>
              <span className="text-[10px] font-semibold text-[#605E5C]">
                {activeKpi ? 'Editing KPI Card' : 'Editing Visual Tile'}
              </span>
            </div>

            {activeKpi ? (
              /* KPI CARD CONFIGURATION INSPECTOR */
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-[#E6F2EB] border border-[#217346]/30 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#185C37]">
                    KPI Card Settings
                  </span>
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
                    Card Title
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
                  {/* 1. Custom Visuals Gallery Grid */}
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
                            ) : vt.type === 'slicer' ? (
                              <Filter className="w-4 h-4 text-[#D97706] shrink-0" />
                            ) : vt.type === 'kpi_card' ? (
                              <Hash className="w-4 h-4 text-[#217346] shrink-0" />
                            ) : (
                              <BarChart3 className="w-4 h-4 text-[#217346] shrink-0" />
                            )}
                            <span className="text-xs truncate">{vt.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Field Wells (Data Binding) */}
                  <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                      2. Field Wells (Data Binding)
                    </label>

                    {activeVisual.type !== 'histogram' && (
                      <div>
                        <label className="text-xs font-medium text-[#605E5C] block mb-1">
                          {activeVisual.type === 'slicer'
                            ? 'Slicer Filter Column (Multi-Select)'
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
                      activeVisual.type === 'stacked_column') && (
                      <div>
                        <label className="text-xs font-semibold text-[#217346] block mb-1">
                          Legend / Series (Cluster / Stack By)
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

                    {activeVisual.type !== 'slicer' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-[#605E5C] block mb-1">
                            Values (Y-Axis Metric)
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
                    )}

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

                  {/* 3. Formatting, Sorting & Title */}
                  <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                      3. Format &amp; Sorting
                    </label>

                    <div>
                      <label className="text-xs font-medium text-[#605E5C] block mb-1">
                        Visual Title
                      </label>
                      <input
                        type="text"
                        value={activeVisual.title}
                        onChange={(e) => updateActiveVisual({ title: e.target.value })}
                        className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
                      />
                    </div>

                    {activeVisual.type !== 'slicer' && activeVisual.type !== 'kpi_card' && (
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
                    )}

                    <label className="flex items-center gap-2 text-xs text-[#212121] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={activeVisual.showDataLabels}
                        onChange={(e) => updateActiveVisual({ showDataLabels: e.target.checked })}
                        className="rounded border-[#D4D4D4] text-[#217346]"
                      />
                      <span>Show Data Labels &amp; Values</span>
                    </label>
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
