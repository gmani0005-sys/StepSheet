import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  RotateCcw,
  Zap,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Sliders,
  Layers,
  Wand2,
  BarChart3,
  TrendingUp,
  PieChart,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  DashboardVisualConfig,
  DashboardKpiConfig,
  PaletteId,
} from './DashboardModal';

export type AiDashboardMode = 'create' | 'add' | 'edit';

interface AiDashboardPromptBarProps {
  datasetId: string;
  datasetName: string;
  columns?: any[];
  rows?: any[];
  currentDashboard: {
    dashboardTitle: string;
    visuals: DashboardVisualConfig[];
    kpiCards: DashboardKpiConfig[];
    slicerColumns: string[];
    paletteId: PaletteId;
  };
  selectedVisualId?: string | null;
  onSelectVisual?: (id: string | null) => void;
  onApplyGeneratedDashboard: (plan: {
    dashboardTitle: string;
    visuals: DashboardVisualConfig[];
    kpiCards: DashboardKpiConfig[];
    slicerColumns: string[];
    paletteId: PaletteId;
  }) => void;
  onApplyPatch: (updatedDashboard: {
    dashboardTitle: string;
    visuals: DashboardVisualConfig[];
    kpiCards: DashboardKpiConfig[];
    slicerColumns: string[];
    paletteId: PaletteId;
  }, patchSummary: string) => void;
  onOpenLocalAiSetup?: () => void;
}

export const AiDashboardPromptBar: React.FC<AiDashboardPromptBarProps> = ({
  datasetId,
  datasetName,
  columns,
  rows,
  currentDashboard,
  selectedVisualId,
  onSelectVisual,
  onApplyGeneratedDashboard,
  onApplyPatch,
  onOpenLocalAiSetup,
}) => {
  const [activeMode, setActiveMode] = useState<AiDashboardMode>('create');
  // Collapsed by default once a dashboard already has content — the full
  // composer (tabs + input + templates) only needs to dominate the screen
  // on first run. Returning to an existing dashboard shouldn't push the
  // actual visuals below the fold.
  const [isComposerOpen, setIsComposerOpen] = useState(currentDashboard.visuals.length === 0);
  const [prompt, setPrompt] = useState('');
  const [targetVisId, setTargetVisId] = useState<string>(selectedVisualId || (currentDashboard.visuals[0]?.id || ''));
  const [loading, setLoading] = useState(false);
  const [patchSummary, setPatchSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync target visual when selectedVisualId changes from canvas
  React.useEffect(() => {
    if (selectedVisualId) {
      setTargetVisId(selectedVisualId);
    } else if (currentDashboard.visuals[0]?.id && !targetVisId) {
      setTargetVisId(currentDashboard.visuals[0].id);
    }
  }, [selectedVisualId, currentDashboard.visuals]);

  const defaultPrompt =
    'Build me a complete executive glassmorphic dashboard for this dataset with KPIs, trends, comparisons, and slicers.';

  // 1. GENERATE FULL NEW DASHBOARD FROM DATASET
  const handleGenerate = async (customPrompt?: string) => {
    const textToRun = (customPrompt || prompt).trim() || defaultPrompt;
    setLoading(true);
    setErrorMsg(null);
    setPatchSummary(null);

    try {
      const res = await api.generateAiDashboard(datasetId, textToRun, undefined, {
        columns,
        rows,
        datasetName,
      });
      if (res && res.plan) {
        const plan = res.plan;
        const mappedVisuals: DashboardVisualConfig[] = (plan.visuals || []).map(
          (v: any, idx: number) => {
            const isSpan2 = v.span === 2 || v.type === 'table' || v.type === 'matrix';
            const customW = v.customWidth || (isSpan2 ? 976 : 480);
            const customH = v.customHeight || (isSpan2 ? 340 : 320);
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const fallbackX = 16 + col * (480 + 16);
            const fallbackY = 16 + row * (320 + 16);
            const x = (typeof v.x === 'number' && Number.isFinite(v.x) && v.x >= 0) ? v.x : fallbackX;
            const y = (typeof v.y === 'number' && Number.isFinite(v.y) && v.y >= 0) ? v.y : fallbackY;
            const isTrendOrDate = v.type === 'line_area' || v.type === 'stacked_area' || (v.categoryCol && /date|time|month|day|year/i.test(v.categoryCol));
            return {
              id: v.id || `vis_ai_${Date.now()}_${idx}`,
              title: v.title,
              type: v.type || 'column',
              categoryCol: v.categoryCol,
              valueCol: v.valueCol,
              seriesCol: v.seriesCol || '',
              aggFunc: v.aggFunc || 'sum',
              bins: v.bins || 5,
              topN: v.topN || 10,
              sortBy: isTrendOrDate ? 'category_asc' : (v.sortBy || 'value_desc'),
              showDataLabels: true,
              dataLabelPosition: 'outside_end',
              dataLabelContent: 'totals_only',
              span: isSpan2 ? 2 : 1,
              x,
              y,
              customWidth: customW,
              customHeight: customH,
              w: isSpan2 ? 12 : 6,
              h: 4,
              customTitle: true,
              insight: v.insight || undefined,
              legendPosition: 'top_right',
              dataLabels: true,
              axisLabels: true,
              gridLines: true,
              smoothLines: true,
              donutHoleSize: 55,
              conditionalFormatting: {
                mode: 'none',
                scalePreset: 'green_yellow_red',
                dataBarColor: '#0D9488',
                highThreshold: 80,
                lowThreshold: 20,
                highColor: '#10B981',
                midColor: '#FB923C',
                lowColor: '#F43F5E',
                showIcons: false,
              },
            };
          }
        );

        const mappedKpis: DashboardKpiConfig[] = (plan.kpis || []).map(
          (k: any, idx: number) => ({
            id: k.id || `kpi_ai_${Date.now()}_${idx}`,
            title: k.title,
            column: k.column,
            aggFunc: k.aggFunc || 'sum',
            subtitle: k.subtitle || 'Calculated Metric',
            accentColor: k.accentColor || (idx === 0 ? '#10B981' : idx === 1 ? '#0D9488' : idx === 2 ? '#FB923C' : '#0284C7'),
          })
        );

        onApplyGeneratedDashboard({
          dashboardTitle: plan.dashboard_title || `${datasetName} Executive Dashboard`,
          visuals: mappedVisuals,
          kpiCards: mappedKpis,
          slicerColumns: plan.slicer_columns || [],
          paletteId: (plan.palette_id as PaletteId) || 'v22',
        });
        setPrompt('');
        setPatchSummary(`Generated complete Glassmorphic Dashboard with ${mappedKpis.length} KPIs, ${mappedVisuals.length} visuals & slicers.`);
        // The dashboard now has content, so collapse the composer to give the
        // canvas the room it deserves instead of staying pinned open.
        setIsComposerOpen(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate dashboard with AI.');
    } finally {
      setLoading(false);
    }
  };

  // 2. ADD NEW VISUAL OR KPI
  const handleAddVisual = async (addPromptText?: string) => {
    const textToRun = (addPromptText || prompt).trim();
    if (!textToRun) return;

    setLoading(true);
    setErrorMsg(null);
    setPatchSummary(null);

    try {
      const serializableDashboard = {
        schema_version: '1.0',
        dashboard_title: currentDashboard.dashboardTitle,
        dataset_id: datasetId,
        slicer_columns: currentDashboard.slicerColumns,
        kpis: currentDashboard.kpiCards.map((k) => ({
          id: k.id,
          title: k.title,
          column: k.column,
          aggFunc: k.aggFunc,
          subtitle: k.subtitle,
          accentColor: k.accentColor,
        })),
        visuals: currentDashboard.visuals.map((v) => ({
          id: v.id,
          title: v.title,
          type: v.type,
          categoryCol: v.categoryCol,
          valueCol: v.valueCol,
          seriesCol: v.seriesCol,
          aggFunc: v.aggFunc,
        })),
        palette_id: currentDashboard.paletteId,
      };

      const command = textToRun.toLowerCase().startsWith('add') ? textToRun : `Add visual: ${textToRun}`;
      const res = await api.patchAiDashboard(datasetId, command, serializableDashboard, undefined, {
        columns,
        rows,
        datasetName,
      });

      if (res && res.updated_dashboard) {
        applyUpdatedDashboard(res.updated_dashboard, res.patch?.patch_summary || `Added visual '${textToRun}'`);
        setPrompt('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add visual with AI.');
    } finally {
      setLoading(false);
    }
  };

  // 3. EDIT EXISTING VISUAL
  const handleEditVisual = async (editPromptText?: string) => {
    const textToRun = (editPromptText || prompt).trim();
    if (!textToRun) return;

    setLoading(true);
    setErrorMsg(null);
    setPatchSummary(null);

    try {
      const serializableDashboard = {
        schema_version: '1.0',
        dashboard_title: currentDashboard.dashboardTitle,
        dataset_id: datasetId,
        slicer_columns: currentDashboard.slicerColumns,
        kpis: currentDashboard.kpiCards.map((k) => ({
          id: k.id,
          title: k.title,
          column: k.column,
          aggFunc: k.aggFunc,
          subtitle: k.subtitle,
          accentColor: k.accentColor,
        })),
        visuals: currentDashboard.visuals.map((v) => ({
          id: v.id,
          title: v.title,
          type: v.type,
          categoryCol: v.categoryCol,
          valueCol: v.valueCol,
          seriesCol: v.seriesCol,
          aggFunc: v.aggFunc,
        })),
        palette_id: currentDashboard.paletteId,
      };

      const res = await api.patchAiDashboard(datasetId, textToRun, serializableDashboard, undefined, {
        columns,
        rows,
        datasetName,
        targetId: targetVisId,
      });

      if (res && res.updated_dashboard) {
        applyUpdatedDashboard(res.updated_dashboard, res.patch?.patch_summary || `Updated visual: '${textToRun}'`);
        setPrompt('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to edit visual with AI.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to map and apply updated dashboard state cleanly
  const applyUpdatedDashboard = (updated: any, summaryText: string) => {
    const existingVisualMap = new Map(currentDashboard.visuals.map((v) => [v.id, v]));
    const nextVisuals: DashboardVisualConfig[] = (updated.visuals || []).map(
      (v: any, idx: number) => {
        const existing = existingVisualMap.get(v.id);
        if (existing) {
          return { ...existing, ...v };
        }
        const isSpan2 = v.span === 2 || v.type === 'table' || v.type === 'matrix';
        const customW = v.customWidth || (isSpan2 ? 976 : 480);
        const customH = v.customHeight || (isSpan2 ? 340 : 320);
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const fallbackX = 16 + col * (480 + 16);
        const fallbackY = 16 + row * (320 + 16);
        const x = (typeof v.x === 'number' && Number.isFinite(v.x) && v.x >= 0) ? v.x : fallbackX;
        const y = (typeof v.y === 'number' && Number.isFinite(v.y) && v.y >= 0) ? v.y : fallbackY;
        return {
          id: v.id || `vis_patch_${Date.now()}_${idx}`,
          title: v.title,
          type: v.type || 'column',
          categoryCol: v.categoryCol,
          valueCol: v.valueCol,
          seriesCol: v.seriesCol || '',
          aggFunc: v.aggFunc || 'sum',
          bins: v.bins || 5,
          topN: v.topN || 10,
          sortBy: v.sortBy || 'value_desc',
          showDataLabels: true,
          span: isSpan2 ? 2 : 1,
          customWidth: customW,
          customHeight: customH,
          x,
          y,
          w: isSpan2 ? 12 : 6,
          h: 4,
          customTitle: true,
          insight: v.insight || undefined,
          legendPosition: 'top_right',
          dataLabels: true,
          axisLabels: true,
          gridLines: true,
          smoothLines: true,
          donutHoleSize: 55,
          conditionalFormatting: {
            mode: 'none',
            scalePreset: 'green_yellow_red',
            dataBarColor: '#0D9488',
            highThreshold: 80,
            lowThreshold: 20,
            highColor: '#10B981',
            midColor: '#FB923C',
            lowColor: '#F43F5E',
            showIcons: false,
          },
        };
      }
    );

    const nextKpis: DashboardKpiConfig[] = (updated.kpis || []).map(
      (k: any, idx: number) => ({
        id: k.id || `kpi_patch_${Date.now()}_${idx}`,
        title: k.title,
        column: k.column,
        aggFunc: k.aggFunc || 'sum',
        subtitle: k.subtitle || 'Updated KPI',
        accentColor: k.accentColor || (idx === 0 ? '#10B981' : '#0D9488'),
      })
    );

    onApplyPatch(
      {
        dashboardTitle: updated.dashboard_title || currentDashboard.dashboardTitle,
        visuals: nextVisuals,
        kpiCards: nextKpis,
        slicerColumns: updated.slicer_columns || currentDashboard.slicerColumns,
        paletteId: (updated.palette_id as PaletteId) || currentDashboard.paletteId,
      },
      summaryText
    );
    setPatchSummary(summaryText);
  };

  // SMART UNIFIED DISPATCHER
  const handleSmartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) {
      if (activeMode === 'create') {
        handleGenerate();
      }
      return;
    }

    const textLower = text.toLowerCase();

    // Auto-detect intent regardless of tab
    const isCreateIntent =
      textLower.includes('dashboard') ||
      textLower.startsWith('create') ||
      textLower.startsWith('build') ||
      textLower.startsWith('generate') ||
      textLower.startsWith('make') ||
      textLower.startsWith('rebuild') ||
      /(?:create|generate|build|make|rebuild|design)?\s*(?:an?\s+)?(?:interactive\s+)?dashboard/i.test(textLower);

    if (isCreateIntent) {
      handleGenerate(text);
      return;
    }

    if (
      textLower.startsWith('add ') ||
      textLower.includes('add visual') ||
      textLower.includes('add chart') ||
      textLower.includes('add kpi') ||
      textLower.includes('add card') ||
      textLower.includes('add metric') ||
      textLower.includes('add slicer')
    ) {
      handleAddVisual(text);
      return;
    }

    if (
      textLower.startsWith('change ') ||
      textLower.startsWith('switch ') ||
      textLower.startsWith('convert ') ||
      textLower.startsWith('edit ') ||
      textLower.includes('make it') ||
      textLower.includes('rename')
    ) {
      handleEditVisual(text);
      return;
    }

    // Default to active tab mode
    if (activeMode === 'create') {
      handleGenerate(text);
    } else if (activeMode === 'add') {
      handleAddVisual(text);
    } else {
      handleEditVisual(text);
    }
  };

  // Find targeted visual metadata
  const currentTargetVisual = currentDashboard.visuals.find((v) => v.id === targetVisId) || currentDashboard.visuals[0];

  // Restyled to match the app's flat Excel theme (solid white, #D4D4D4
  // borders, #217346 green accents, 2px corners) instead of the previous
  // glassmorphism/pill treatment, which looked like a different app
  // bolted on top of the ribbon above it.
  return (
    <div className={`px-6 bg-[#F3F3F3] border-b border-[#D4D4D4] flex flex-col gap-2.5 ${isComposerOpen ? 'py-3' : 'py-1.5'}`}>
      {/* Top Header & Operational Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Capability Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[2px] bg-[#217346] flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#212121]">Create Dashboard with AI</span>
              {isComposerOpen && (
                <span className="text-[10px] bg-[#E6F2EB] text-[#185C37] px-2 py-0.5 rounded-[2px] font-semibold border border-[#217346]/30">
                  Native Julius-Style (DuckDB)
                </span>
              )}
              {!isComposerOpen && currentDashboard.visuals.length > 0 && (
                <span className="text-[11px] text-[#605E5C]">
                  {currentDashboard.visuals.length} visual{currentDashboard.visuals.length === 1 ? '' : 's'} on this page — open to add, edit or regenerate
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: 3 Dedicated Action Tabs */}
        {isComposerOpen && (
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-[2px] border border-[#D4D4D4] text-xs">
            <button
              type="button"
              onClick={() => setActiveMode('create')}
              className={`px-3 py-1 rounded-[2px] font-semibold flex items-center gap-1.5 transition-colors ${
                activeMode === 'create'
                  ? 'bg-[#217346] text-white'
                  : 'text-[#605E5C] hover:text-[#212121] hover:bg-[#F3F3F3]'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Create New Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('add')}
              className={`px-3 py-1 rounded-[2px] font-semibold flex items-center gap-1.5 transition-colors ${
                activeMode === 'add'
                  ? 'bg-[#217346] text-white'
                  : 'text-[#605E5C] hover:text-[#212121] hover:bg-[#F3F3F3]'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Visual</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('edit')}
              className={`px-3 py-1 rounded-[2px] font-semibold flex items-center gap-1.5 transition-colors ${
                activeMode === 'edit'
                  ? 'bg-[#217346] text-white'
                  : 'text-[#605E5C] hover:text-[#212121] hover:bg-[#F3F3F3]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit Visual</span>
            </button>
          </div>
        )}

        {/* Right: Local AI Diagnostics link + collapse toggle */}
        <div className="flex items-center gap-2 text-xs">
          {onOpenLocalAiSetup && isComposerOpen && (
            <button
              onClick={onOpenLocalAiSetup}
              className="text-[11px] text-[#605E5C] hover:text-[#217346] flex items-center gap-1 transition-colors font-medium"
              title="Configure local Ollama engine & models"
            >
              <Zap className="w-3.5 h-3.5 text-[#217346]" />
              <span>Local AI Engine Active</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsComposerOpen((v) => !v)}
            aria-expanded={isComposerOpen}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] border border-[#D4D4D4] bg-white hover:border-[#217346] text-[11px] font-semibold text-[#605E5C] hover:text-[#217346] transition-colors shrink-0"
            title={isComposerOpen ? 'Collapse AI dashboard composer' : 'Open AI dashboard composer'}
          >
            {isComposerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isComposerOpen ? 'Collapse' : 'AI Tools'}</span>
          </button>
        </div>
      </div>

      {!isComposerOpen ? null : (
      <>
      {/* Mode-Specific Contextual Toolbars */}
      {activeMode === 'edit' && currentDashboard.visuals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 py-1 px-2.5 bg-white rounded-[2px] border border-[#D4D4D4] text-xs text-[#212121]">
          <span className="font-semibold text-[#605E5C] flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Target Visual:
          </span>
          <select
            value={targetVisId}
            onChange={(e) => {
              setTargetVisId(e.target.value);
              onSelectVisual?.(e.target.value);
            }}
            className="text-xs bg-white border border-[#D4D4D4] rounded-[2px] px-2.5 py-1 font-semibold text-[#212121] focus:outline-none focus:ring-2 focus:ring-[#217346]/30"
          >
            {currentDashboard.visuals.map((v, i) => (
              <option key={v.id} value={v.id}>
                {i + 1}. {v.title} ({v.type})
              </option>
            ))}
          </select>

          {/* Quick Transformation Action Pills */}
          <div className="flex items-center gap-1.5 ml-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => handleEditVisual(`Convert ${currentTargetVisual?.title || 'chart'} to column chart`)}
              className="px-2 py-0.5 rounded-[2px] bg-white border border-[#D4D4D4] hover:border-[#217346] text-[11px] font-medium text-[#605E5C] hover:text-[#217346] transition-colors"
            >
              Column Capsule
            </button>
            <button
              type="button"
              onClick={() => handleEditVisual(`Convert ${currentTargetVisual?.title || 'chart'} to donut chart`)}
              className="px-2 py-0.5 rounded-[2px] bg-white border border-[#D4D4D4] hover:border-[#217346] text-[11px] font-medium text-[#605E5C] hover:text-[#217346] transition-colors"
            >
              Donut
            </button>
            <button
              type="button"
              onClick={() => handleEditVisual(`Convert ${currentTargetVisual?.title || 'chart'} to line area trend`)}
              className="px-2 py-0.5 rounded-[2px] bg-white border border-[#D4D4D4] hover:border-[#217346] text-[11px] font-medium text-[#605E5C] hover:text-[#217346] transition-colors"
            >
              Line Area
            </button>
            <button
              type="button"
              onClick={() => handleEditVisual(`Change metric of ${currentTargetVisual?.title || 'chart'} to average`)}
              className="px-2 py-0.5 rounded-[2px] bg-white border border-[#D4D4D4] hover:border-[#217346] text-[11px] font-medium text-[#605E5C] hover:text-[#217346] transition-colors"
            >
              Average Metric
            </button>
          </div>
        </div>
      )}

      {/* Main Command Input Bar */}
      <form onSubmit={handleSmartSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              activeMode === 'create'
                ? "Describe what dashboard you want to create (e.g. 'Build an Executive Glassmorphic Dashboard with sales, top products, and monthly trends')..."
                : activeMode === 'add'
                ? "Describe the visual to add (e.g. 'Add a donut chart of sales by region', 'Add a bar chart of top 5 products', 'Add KPI for total amount')..."
                : `Command to edit '${currentTargetVisual?.title || 'selected visual'}' (e.g. 'Change to donut chart', 'Group by region', 'Change metric to average')...`
            }
            className="w-full text-xs border border-[#8A8886] hover:border-[#217346] focus:border-[#217346] rounded-[2px] pl-3 pr-24 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#217346]/20 bg-white text-[#212121] transition-colors font-medium"
          />
          {!prompt && activeMode === 'create' && (
            <button
              type="button"
              onClick={() => handleGenerate(defaultPrompt)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#217346] hover:text-[#185C37] hover:underline font-semibold"
            >
              Standard Executive
            </button>
          )}
        </div>

        {/* Primary Action Button */}
        <button
          type="submit"
          disabled={loading}
          aria-label={
            activeMode === 'create'
              ? 'Generate Dashboard'
              : activeMode === 'add'
              ? 'Add Visual'
              : 'Apply Visual Edit'
          }
          className="px-4 py-2.5 bg-[#217346] hover:bg-[#185C37] text-white font-bold rounded-[2px] text-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
        >
          {loading ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>
            {loading
              ? 'Processing...'
              : activeMode === 'create'
              ? 'Generate Dashboard'
              : activeMode === 'add'
              ? 'Add Visual'
              : 'Apply Visual Edit'}
          </span>
        </button>

        {/* Quick Rebuild button if visuals exist */}
        {currentDashboard.visuals.length > 0 && activeMode === 'create' && (
          <button
            type="button"
            onClick={() => handleGenerate(defaultPrompt)}
            disabled={loading}
            className="px-3 py-2.5 border border-[#D4D4D4] hover:bg-[#F3F3F3] text-[#605E5C] hover:text-[#212121] font-semibold rounded-[2px] text-xs flex items-center gap-1.5 transition-colors shrink-0"
            title="Rebuild complete dashboard from scratch"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rebuild</span>
          </button>
        )}
      </form>

      {/* Suggested Quick Starter Chips */}
      {activeMode === 'create' && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-0.5">
          <span className="text-[#605E5C] font-medium mr-1 flex items-center gap-1">
            <LayoutGrid className="w-3 h-3 text-[#217346]" /> Templates:
          </span>
          <button
            type="button"
            onClick={() => handleGenerate('Build Executive Glassmorphism V22 Dashboard with sales, trends and KPI cards')}
            className="px-2.5 py-1 rounded-[2px] bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#185C37] border border-[#217346]/30 font-semibold transition-colors"
          >
            Executive V22
          </button>
          <button
            type="button"
            onClick={() => handleGenerate('Build Sales & Revenue Breakdown Dashboard with monthly trends and top products')}
            className="px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#F3F3F3] text-[#444444] border border-[#D4D4D4] font-medium transition-colors"
          >
            Sales & Revenue Breakdown
          </button>
          <button
            type="button"
            onClick={() => handleGenerate('Build Operational Performance and Volume Dashboard')}
            className="px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#F3F3F3] text-[#444444] border border-[#D4D4D4] font-medium transition-colors"
          >
            Operations & Volume
          </button>
          <button
            type="button"
            onClick={() => handleGenerate('Build Regional & Category Distribution Dashboard')}
            className="px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#F3F3F3] text-[#444444] border border-[#D4D4D4] font-medium transition-colors"
          >
            Regional & Category
          </button>
        </div>
      )}

      {activeMode === 'add' && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-0.5">
          <span className="text-[#605E5C] font-medium mr-1 flex items-center gap-1">
            <PlusCircle className="w-3 h-3 text-[#217346]" /> Quick Add:
          </span>
          <button
            type="button"
            onClick={() => handleAddVisual('Add a bar chart of sales by product category')}
            className="px-2.5 py-1 rounded-[2px] bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#185C37] border border-[#217346]/30 font-semibold transition-colors flex items-center gap-1"
          >
            <BarChart3 className="w-3 h-3" /> Sales by Category (Bar)
          </button>
          <button
            type="button"
            onClick={() => handleAddVisual('Add a monthly revenue trend line')}
            className="px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#F3F3F3] text-[#444444] border border-[#D4D4D4] font-medium transition-colors flex items-center gap-1"
          >
            <TrendingUp className="w-3 h-3" /> Monthly Trend (Line Area)
          </button>
          <button
            type="button"
            onClick={() => handleAddVisual('Add a donut chart for regional contribution')}
            className="px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#F3F3F3] text-[#444444] border border-[#D4D4D4] font-medium transition-colors flex items-center gap-1"
          >
            <PieChart className="w-3 h-3" /> Regional Share (Donut)
          </button>
          <button
            type="button"
            onClick={() => handleAddVisual('Add a KPI card for total sales volume')}
            className="px-2.5 py-1 rounded-[2px] bg-white hover:bg-[#F3F3F3] text-[#444444] border border-[#D4D4D4] font-medium transition-colors"
          >
            Total Volume (KPI Card)
          </button>
        </div>
      )}
      </>
      )}

      {/* Messages — shown regardless of composer collapse state so feedback from the last action is never hidden */}
      {errorMsg && (
        <div className="text-[11px] text-[#C50F1F] bg-[#FDE7E9] border border-[#C50F1F]/30 px-3 py-1.5 rounded-[2px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {patchSummary && !errorMsg && (
        <div className="text-[11px] text-[#185C37] bg-[#E6F2EB] border border-[#217346]/30 px-3 py-1.5 rounded-[2px] flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#217346]" />
          <span className="font-medium">{patchSummary}</span>
        </div>
      )}
    </div>
  );
};
