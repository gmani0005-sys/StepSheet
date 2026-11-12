import React, { useState } from 'react';
import {
  BarChart3,
  Paintbrush,
  Palette,
  Plus,
  BarChartHorizontal,
  PieChart,
  TrendingUp,
  LayoutGrid,
  Activity,
  Table2,
  Grid,
  Search,
  Pencil,
  Copy,
  Trash2,
  Lock,
  Unlock,
  SlidersHorizontal,
  Gauge,
  Filter,
  Layers,
  GitCommitVertical,
} from 'lucide-react';
import { DashboardPaneWrapper, DashboardPaneConfig } from './DashboardPaneWrapper';
import {
  DashboardVisualConfig,
  DashboardKpiConfig,
  CustomVisualType,
  VisualAggType,
  PaletteId,
  LegendPositionType,
  DataLabelPositionType,
  DataLabelContentType,
  ConditionalFormattingConfig,
} from '../DashboardModal';
import { ColumnSchema } from '../../../types';

export interface VisualTypeMeta {
  type: CustomVisualType;
  label: string;
  shortLabel: string;
  desc: string;
}

interface DashboardVisualizationsPaneProps {
  config: DashboardPaneConfig;
  onToggleCollapse: () => void;
  onResize: (newWidth: number) => void;
  onResetWidth: () => void;
  activeVisTab: 'build' | 'format' | 'theme';
  setActiveVisTab: (tab: 'build' | 'format' | 'theme') => void;
  visualTypes: VisualTypeMeta[];
  activeVisual: DashboardVisualConfig | null;
  activeKpi: DashboardKpiConfig | null;
  columns: ColumnSchema[];
  onAddVisual: (type: CustomVisualType) => void;
  onUpdateActiveVisual: (patch: Partial<DashboardVisualConfig>) => void;
  onUpdateActiveVisualCF: (patch: Partial<ConditionalFormattingConfig>) => void;
  onAddKpiCard: () => void;
  onUpdateActiveKpi: (patch: Partial<DashboardKpiConfig>) => void;
  paletteId: PaletteId;
  onSelectPalette: (palette: PaletteId) => void;
  colorPalettes: Record<PaletteId, { name: string; colors: string[] }>;
}

export const DashboardVisualizationsPane: React.FC<DashboardVisualizationsPaneProps> = ({
  config,
  onToggleCollapse,
  onResize,
  onResetWidth,
  activeVisTab,
  setActiveVisTab,
  visualTypes,
  activeVisual,
  activeKpi,
  columns,
  onAddVisual,
  onUpdateActiveVisual,
  onUpdateActiveVisualCF,
  onAddKpiCard,
  onUpdateActiveKpi,
  paletteId,
  onSelectPalette,
  colorPalettes,
}) => {
  const [formatSearch, setFormatSearch] = useState('');

  // Power BI-style drag-and-drop onto field wells: DashboardDataPane marks
  // each field row draggable and puts its column name in the plain-text
  // transfer; a well here accepts the drop and calls back into the same
  // update function its <select> already uses, so dragging is purely an
  // additional way to set the same state — the dropdown stays as the
  // precise/keyboard-accessible path.
  const [dragOverWell, setDragOverWell] = useState<string | null>(null);

  const wellDropHandlers = (wellId: string, onField: (fieldName: string) => void) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dragOverWell !== wellId) setDragOverWell(wellId);
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDragOverWell((prev) => (prev === wellId ? null : prev));
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverWell(null);
      const fieldName = e.dataTransfer.getData('text/plain');
      if (fieldName) onField(fieldName);
    },
  });

  const wellDropClass = (wellId: string) =>
    dragOverWell === wellId
      ? 'ring-2 ring-[#217346] ring-offset-1 bg-[#E6F2EB]/50 rounded-lg'
      : '';

  const formatTabLabel = activeKpi
    ? 'Format KPI'
    : activeVisual
    ? 'Format visual'
    : 'Format page';

  const renderVisualFormatSettings = () => {
    if (!activeVisual) return null;
    return (
      <div className="space-y-4 pt-2 border-t border-[#D4D4D4]">
        {/* 1. Title */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-[#217346]" /> 1. Title
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[#605E5C] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeVisual.showTitle !== false}
                onChange={(e) => onUpdateActiveVisual({ showTitle: e.target.checked })}
                className="rounded border-[#D4D4D4] text-[#217346] w-3 h-3"
              />
              Show
            </label>
          </div>

          {activeVisual.showTitle !== false && (
            <>
              <input
                type="text"
                aria-label="Edit Visual Title"
                value={activeVisual.title}
                onChange={(e) => onUpdateActiveVisual({ title: e.target.value, customTitle: true })}
                className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#212121]"
              />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                    Font Size
                  </label>
                  <input
                    type="number"
                    aria-label="Title Font Size"
                    min={8}
                    max={32}
                    value={activeVisual.titleFontSize ?? 12}
                    onChange={(e) =>
                      onUpdateActiveVisual({ titleFontSize: Number(e.target.value) || 12 })
                    }
                    className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                    Alignment
                  </label>
                  <select
                    aria-label="Title Alignment"
                    value={activeVisual.titleAlign || 'left'}
                    onChange={(e) =>
                      onUpdateActiveVisual({
                        titleAlign: e.target.value as 'left' | 'center' | 'right',
                      })
                    }
                    className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                    Weight
                  </label>
                  <select
                    aria-label="Title Weight"
                    value={activeVisual.titleBold === false ? 'regular' : 'bold'}
                    onChange={(e) =>
                      onUpdateActiveVisual({ titleBold: e.target.value === 'bold' })
                    }
                    className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
                  >
                    <option value="bold">Bold</option>
                    <option value="regular">Regular</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                  Title Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Title Color"
                    value={activeVisual.titleColor || '#212121'}
                    onChange={(e) => onUpdateActiveVisual({ titleColor: e.target.value })}
                    className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer p-0.5"
                  />
                  <span className="text-[10px] font-mono text-[#605E5C]">
                    {activeVisual.titleColor || '#212121'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 2. General (Background & Border) */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5 text-[#217346]" />
              2. General
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[#605E5C] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeVisual.showBorder !== false}
                onChange={(e) => onUpdateActiveVisual({ showBorder: e.target.checked })}
                className="rounded border-[#D4D4D4] text-[#217346] w-3 h-3"
              />
              Border
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                Background
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  aria-label="Visual Background Color"
                  value={activeVisual.backgroundColor || '#ffffff'}
                  onChange={(e) => onUpdateActiveVisual({ backgroundColor: e.target.value })}
                  className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer p-0.5"
                />
                <button
                  type="button"
                  onClick={() => onUpdateActiveVisual({ backgroundColor: undefined })}
                  title="Reset to default (translucent)"
                  className="text-[10px] text-[#605E5C] hover:text-[#217346] underline shrink-0"
                >
                  Reset
                </button>
              </div>
            </div>

            {activeVisual.showBorder !== false && (
              <div>
                <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                  Border Color
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    aria-label="Visual Border Color"
                    value={activeVisual.borderColor || '#e5e7eb'}
                    onChange={(e) => onUpdateActiveVisual({ borderColor: e.target.value })}
                    className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer p-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateActiveVisual({ borderColor: undefined })}
                    title="Reset to default"
                    className="text-[10px] text-[#605E5C] hover:text-[#217346] underline shrink-0"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-[#212121] block mb-1">
              Corner Radius ({activeVisual.borderRadius ?? 16}px)
            </label>
            <input
              type="range"
              aria-label="Visual Corner Radius"
              min={0}
              max={24}
              value={activeVisual.borderRadius ?? 16}
              onChange={(e) => onUpdateActiveVisual({ borderRadius: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>

        {/* 3. Edit Legend & Colors */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-[#217346]" />
            4. Edit Legend &amp; Colors
          </label>

          <div>
            <label className="text-xs font-medium text-[#605E5C] block mb-1">
              Legend Position
            </label>
            <select
              aria-label="Legend Position"
              value={activeVisual.legendPosition || 'top_left'}
              onChange={(e) =>
                onUpdateActiveVisual({
                  legendPosition: e.target.value as LegendPositionType,
                })
              }
              className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
            >
              <option value="top_left">Top Left</option>
              <option value="top">Top</option>
              <option value="top_right">Top Right</option>
              <option value="left">Left</option>
              <option value="left_center">Left Center</option>
              <option value="right">Right</option>
              <option value="right_center">Right Center</option>
              <option value="bottom_left">Bottom Left</option>
              <option value="bottom">Bottom</option>
              <option value="bottom_right">Bottom Right</option>
              <option value="hide">Hide Legend</option>
            </select>
          </div>
        </div>

        {/* 5. Conditional Formatting */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
            <Paintbrush className="w-3.5 h-3.5 text-[#217346]" />
            5. Conditional Formatting
          </label>

          <div>
            <label className="text-xs font-medium text-[#605E5C] block mb-1">
              Formatting Mode
            </label>
            <select
              value={activeVisual.conditionalFormatting?.mode || 'none'}
              onChange={(e) =>
                onUpdateActiveVisualCF({
                  mode: e.target.value as ConditionalFormattingConfig['mode'],
                })
              }
              className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
            >
              <option value="none">None (Standard Theme)</option>
              <option value="color_scale">Color Scale (Gradient Heatmap)</option>
              <option value="data_bars">Data Bars (Excel In-Cell Fill)</option>
              <option value="rules">Rules (Threshold Highlights)</option>
            </select>
          </div>
        </div>

        {/* 6. Data Labels & Sorting */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
            6. Data Labels &amp; Sorting
          </label>

          <label className="flex items-center gap-2 text-xs text-[#212121] font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={activeVisual.showDataLabels}
              onChange={(e) => onUpdateActiveVisual({ showDataLabels: e.target.checked })}
              className="rounded border-[#D4D4D4] text-[#217346]"
            />
            <span>Show Data Labels</span>
          </label>

          {activeVisual.showDataLabels && (
            <div className="grid grid-cols-2 gap-2 p-2 rounded bg-white border border-[#D4D4D4]">
              <div>
                <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                  Label Position
                </label>
                <select
                  aria-label="Data Label Position"
                  value={activeVisual.dataLabelPosition || 'outside_end'}
                  onChange={(e) =>
                    onUpdateActiveVisual({
                      dataLabelPosition: e.target.value as DataLabelPositionType,
                    })
                  }
                  className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
                >
                  <option value="inside_end">Inside End</option>
                  <option value="outside_end">Outside End</option>
                  <option value="inside_center">Inside Center</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                  Label Content
                </label>
                <select
                  aria-label="Data Label Format"
                  value={activeVisual.dataLabelContent || 'totals_only'}
                  onChange={(e) =>
                    onUpdateActiveVisual({
                      dataLabelContent: e.target.value as DataLabelContentType,
                    })
                  }
                  className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
                >
                  <option value="totals_only">Only Totals</option>
                  <option value="totals_and_percentage">Totals and Percentage</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // KPI cards have no editor of their own today: the pencil icon on a card
  // only calls setSelectedKpiId, and this pane's Build/Format tabs branched
  // solely on activeVisual, so selecting a KPI just showed the "select a
  // visual" placeholder with onUpdateActiveKpi never invoked anywhere.
  const KPI_ACCENT_SWATCHES = ['#10B981', '#0D9488', '#FB923C', '#0284C7', '#DC2626', '#7C3AED', '#D97706', '#0F172A'];

  const renderKpiFormatSettings = () => {
    if (!activeKpi) return null;
    return (
      <div className="space-y-4 pt-2 border-t border-[#D4D4D4]">
        {/* 1. Title */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5 text-[#217346]" /> 1. Title
          </label>
          <input
            type="text"
            aria-label="KPI Title"
            value={activeKpi.title}
            onChange={(e) => onUpdateActiveKpi({ title: e.target.value })}
            className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#212121]"
          />

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                Font Size
              </label>
              <input
                type="number"
                aria-label="KPI Title Font Size"
                min={8}
                max={32}
                value={activeKpi.titleFontSize ?? 11}
                onChange={(e) =>
                  onUpdateActiveKpi({ titleFontSize: Number(e.target.value) || 11 })
                }
                className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                Alignment
              </label>
              <select
                aria-label="KPI Title Alignment"
                value={activeKpi.titleAlign || 'left'}
                onChange={(e) =>
                  onUpdateActiveKpi({ titleAlign: e.target.value as 'left' | 'center' | 'right' })
                }
                className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                Weight
              </label>
              <select
                aria-label="KPI Title Weight"
                value={activeKpi.titleBold === false ? 'regular' : 'bold'}
                onChange={(e) => onUpdateActiveKpi({ titleBold: e.target.value === 'bold' })}
                className="w-full bg-white border border-[#D4D4D4] rounded px-2 py-1 text-xs text-[#212121]"
              >
                <option value="bold">Bold</option>
                <option value="regular">Regular</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-[#212121] block mb-1">
              Title Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="KPI Title Color"
                value={activeKpi.titleColor || '#64748B'}
                onChange={(e) => onUpdateActiveKpi({ titleColor: e.target.value })}
                className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer p-0.5"
              />
              <span className="text-[10px] font-mono text-[#605E5C]">
                {activeKpi.titleColor || '#64748B'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <label className="text-xs font-semibold text-[#212121] block">
            Subtitle / Comparison Label
          </label>
          <input
            type="text"
            aria-label="KPI Subtitle"
            value={activeKpi.subtitle}
            onChange={(e) => onUpdateActiveKpi({ subtitle: e.target.value })}
            placeholder="e.g. -60.0% SUM · MoM (2025-12 vs 2025-11)"
            className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121]"
          />
        </div>

        {/* 2. General (Background & Border) */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5 text-[#217346]" />
              2. General
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[#605E5C] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeKpi.showBorder !== false}
                onChange={(e) => onUpdateActiveKpi({ showBorder: e.target.checked })}
                className="rounded border-[#D4D4D4] text-[#217346] w-3 h-3"
              />
              Border
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                Background
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  aria-label="KPI Background Color"
                  value={activeKpi.backgroundColor || '#ffffff'}
                  onChange={(e) => onUpdateActiveKpi({ backgroundColor: e.target.value })}
                  className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer p-0.5"
                />
                <button
                  type="button"
                  onClick={() => onUpdateActiveKpi({ backgroundColor: undefined })}
                  title="Reset to default (translucent)"
                  className="text-[10px] text-[#605E5C] hover:text-[#217346] underline shrink-0"
                >
                  Reset
                </button>
              </div>
            </div>

            {activeKpi.showBorder !== false && (
              <div>
                <label className="text-[10px] font-semibold text-[#212121] block mb-1">
                  Border Color
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    aria-label="KPI Border Color"
                    value={activeKpi.borderColor || '#e5e7eb'}
                    onChange={(e) => onUpdateActiveKpi({ borderColor: e.target.value })}
                    className="w-8 h-7 rounded border border-[#D4D4D4] cursor-pointer p-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateActiveKpi({ borderColor: undefined })}
                    title="Reset to default"
                    className="text-[10px] text-[#605E5C] hover:text-[#217346] underline shrink-0"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-[#212121] block mb-1">
              Corner Radius ({activeKpi.borderRadius ?? 16}px)
            </label>
            <input
              type="range"
              aria-label="KPI Corner Radius"
              min={0}
              max={24}
              value={activeKpi.borderRadius ?? 16}
              onChange={(e) => onUpdateActiveKpi({ borderRadius: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>

        {/* 3. Accent Color */}
        <div className="p-2.5 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#212121] flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-[#217346]" />
            3. Accent Color
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {KPI_ACCENT_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onUpdateActiveKpi({ accentColor: c })}
                title={c}
                aria-label={`KPI accent color ${c}`}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  (activeKpi.accentColor || '').toLowerCase() === c.toLowerCase()
                    ? 'border-[#212121] scale-110'
                    : 'border-white shadow-sm hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardPaneWrapper
      id="visualizations"
      title="Visualizations"
      testId="dashboard-visualizations-pane"
      icon={<SlidersHorizontal className="w-4 h-4 text-[#217346]" />}
      config={config}
      onToggleCollapse={onToggleCollapse}
      onResize={onResize}
      onResetWidth={onResetWidth}
      headerRightExtra={
        <button
          type="button"
          onClick={() => onAddVisual(activeVisual?.type || 'column')}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#217346] hover:bg-[#185C37] text-white shadow-xs shrink-0 mr-1"
          title="Add New Visual"
        >
          <Plus className="w-3 h-3" /> Add Visual
        </button>
      }
    >
      {/* 3 Icon Tabs (Build visual | Format | Theme) */}
      <div className="flex items-center border-b border-[#D4D4D4] bg-[#F8F9FA] px-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveVisTab('build')}
          className={`flex items-center gap-1.5 py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeVisTab === 'build'
              ? 'border-[#217346] text-[#217346] bg-white'
              : 'border-transparent text-[#605E5C] hover:text-[#212121]'
          }`}
          title="Build Visual (Visual Gallery & Field Wells)"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Build visual</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveVisTab('format')}
          className={`flex items-center gap-1.5 py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeVisTab === 'format'
              ? 'border-[#217346] text-[#217346] bg-white'
              : 'border-transparent text-[#605E5C] hover:text-[#212121]'
          }`}
          title={formatTabLabel}
        >
          <Paintbrush className="w-3.5 h-3.5" />
          <span>Format</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveVisTab('theme')}
          className={`flex items-center gap-1.5 py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeVisTab === 'theme'
              ? 'border-[#217346] text-[#217346] bg-white'
              : 'border-transparent text-[#605E5C] hover:text-[#212121]'
          }`}
          title="Themes & Palettes"
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Theme</span>
        </button>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-[#212121]">
        {/* TAB 1: BUILD VISUAL */}
        {activeVisTab === 'build' && (
          <div className="space-y-4">
            {/* 1. Visual Gallery Grid (6 icons per row) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#212121]">
                  Visualizations Pane
                </span>
                <span className="text-[10px] text-[#605E5C]">
                  {visualTypes.length} visuals
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1 p-1 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg">
                {visualTypes.map((vt) => {
                  // Guard with !activeKpi: activeVisual defaults to visuals[0]
                  // when nothing is explicitly selected, so without this a
                  // click here while a KPI card is being edited would retype
                  // an unrelated visual instead of adding a new one.
                  const isActive = !activeKpi && activeVisual?.type === vt.type;
                  return (
                    <button
                      key={vt.type}
                      type="button"
                      onClick={() => {
                        if (!activeKpi && activeVisual) {
                          onUpdateActiveVisual({ type: vt.type });
                        } else {
                          onAddVisual(vt.type);
                        }
                      }}
                      title={`${vt.label}: ${vt.desc}`}
                      className={`h-9 flex flex-col items-center justify-center rounded border transition-all relative ${
                        isActive
                          ? 'bg-white border-[#217346] shadow-sm ring-1 ring-[#217346]'
                          : 'border-transparent hover:bg-white hover:border-[#D4D4D4]'
                      }`}
                    >
                      {vt.type.includes('bar') ? (
                        <BarChartHorizontal className="w-4 h-4 text-[#217346]" />
                      ) : vt.type === 'donut' || vt.type === 'pie' ? (
                        <PieChart className="w-4 h-4 text-[#0EA5E9]" />
                      ) : vt.type === 'line_area' ? (
                        <TrendingUp className="w-4 h-4 text-[#2563EB]" />
                      ) : vt.type === 'stacked_area' ? (
                        <Layers className="w-4 h-4 text-[#0284C7]" />
                      ) : vt.type === 'waterfall' ? (
                        <GitCommitVertical className="w-4 h-4 text-[#059669]" />
                      ) : vt.type === 'gauge' ? (
                        <Gauge className="w-4 h-4 text-[#D97706]" />
                      ) : vt.type === 'funnel' ? (
                        <Filter className="w-4 h-4 text-[#E11D48]" />
                      ) : vt.type === 'treemap' ? (
                        <LayoutGrid className="w-4 h-4 text-[#7C3AED]" />
                      ) : vt.type === 'histogram' ? (
                        <Activity className="w-4 h-4 text-[#EC4899]" />
                      ) : vt.type === 'table' ? (
                        <Table2 className="w-4 h-4 text-[#217346]" />
                      ) : vt.type === 'matrix' ? (
                        <Grid className="w-4 h-4 text-[#D97706]" />
                      ) : (
                        <BarChart3 className="w-4 h-4 text-[#217346]" />
                      )}
                      <span className="sr-only">{vt.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Field Wells
                 activeVisual defaults to visuals[0] whenever nothing is
                 explicitly selected (see DashboardModal), so it stays truthy
                 even right after a KPI card is clicked and selectedVisualId
                 is cleared. activeKpi has no such fallback — it's only set
                 by an explicit KPI selection — so it must be checked first,
                 or the KPI editor below is never reached. */}
            {!activeKpi && activeVisual ? (
              <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                  Field Wells
                </span>

                {/* Category / Axis Well */}
                {activeVisual.type !== 'histogram' && (
                  <div
                    {...wellDropHandlers('category', (name) => onUpdateActiveVisual({ categoryCol: name }))}
                    className={`transition-shadow ${wellDropClass('category')}`}
                  >
                    <label className="text-xs font-medium text-[#605E5C] block mb-1">
                      {activeVisual.type === 'matrix'
                        ? 'Matrix Rows (Row Groups)'
                        : activeVisual.type === 'table'
                        ? 'Primary Group Column'
                        : 'Category / Axis (X-Axis)'}
                      <span className="text-[10px] font-normal text-[#8A8886] normal-case ml-1">— drag a field here</span>
                    </label>
                    <select
                      aria-label="Visual Category Axis"
                      value={activeVisual.categoryCol}
                      onChange={(e) => onUpdateActiveVisual({ categoryCol: e.target.value })}
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

                {/* Series / Legend Well */}
                {(activeVisual.type === 'clustered_bar' ||
                  activeVisual.type === 'clustered_column' ||
                  activeVisual.type === 'stacked_column' ||
                  activeVisual.type === 'matrix' ||
                  activeVisual.type === 'table') && (
                  <div
                    {...wellDropHandlers('series', (name) => onUpdateActiveVisual({ seriesCol: name }))}
                    className={`transition-shadow ${wellDropClass('series')}`}
                  >
                    <label className="text-xs font-semibold text-[#217346] block mb-1">
                      {activeVisual.type === 'matrix'
                        ? 'Matrix Columns (Pivot Header)'
                        : activeVisual.type === 'table'
                        ? 'Secondary Detail Column'
                        : 'Legend / Series (Cluster / Stack By)'}
                      <span className="text-[10px] font-normal text-[#8A8886] ml-1">— drag a field here</span>
                    </label>
                    <select
                      aria-label="Visual Legend Series"
                      value={activeVisual.seriesCol}
                      onChange={(e) => onUpdateActiveVisual({ seriesCol: e.target.value })}
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

                {/* Values / Metric Well */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    {...wellDropHandlers('value', (name) => onUpdateActiveVisual({ valueCol: name }))}
                    className={`transition-shadow ${wellDropClass('value')}`}
                  >
                    <label className="text-xs font-medium text-[#605E5C] block mb-1">
                      Values (Y-Axis)
                    </label>
                    <select
                      aria-label="Visual Value Column"
                      value={activeVisual.valueCol}
                      onChange={(e) => onUpdateActiveVisual({ valueCol: e.target.value })}
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
                        onUpdateActiveVisual({ aggFunc: e.target.value as VisualAggType })
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

                {/* Histogram Bins */}
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
                      onChange={(e) => onUpdateActiveVisual({ bins: Number(e.target.value) })}
                      className="w-full accent-[#217346]"
                    />
                  </div>
                )}

                {/* Visual Format Settings (Title, Legend, Conditional Formatting, Data Labels) */}
                {renderVisualFormatSettings()}
              </div>
            ) : activeKpi ? (
              <div className="space-y-3 pt-2 border-t border-[#D4D4D4]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
                  KPI Card Fields
                </span>

                <div
                  {...wellDropHandlers('kpi-column', (name) => onUpdateActiveKpi({ column: name }))}
                  className={`transition-shadow ${wellDropClass('kpi-column')}`}
                >
                  <label className="text-xs font-medium text-[#605E5C] block mb-1">
                    Metric Column
                    <span className="text-[10px] font-normal text-[#8A8886] ml-1">— drag a field here</span>
                  </label>
                  <select
                    aria-label="KPI Metric Column"
                    value={activeKpi.column}
                    onChange={(e) => onUpdateActiveKpi({ column: e.target.value })}
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
                  <label className="text-xs font-medium text-[#605E5C] block mb-1">
                    Aggregation
                  </label>
                  <select
                    aria-label="KPI Aggregation"
                    value={activeKpi.aggFunc}
                    onChange={(e) => onUpdateActiveKpi({ aggFunc: e.target.value as VisualAggType })}
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

                {renderKpiFormatSettings()}
              </div>
            ) : (
              <div className="p-4 border border-dashed border-[#D4D4D4] rounded-lg text-center text-xs text-[#605E5C]">
                Select a visual or KPI card on the canvas to edit it.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FORMAT */}
        {activeVisTab === 'format' && (
          <div className="space-y-4">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2 text-[#605E5C]" />
              <input
                type="text"
                value={formatSearch}
                onChange={(e) => setFormatSearch(e.target.value)}
                placeholder="Search format settings"
                className="w-full bg-white border border-[#D4D4D4] rounded px-2.5 pl-7 py-1 text-xs text-[#212121] outline-none focus:border-[#217346]"
              />
            </div>

            {!activeKpi && activeVisual ? (
              renderVisualFormatSettings()
            ) : activeKpi ? (
              renderKpiFormatSettings()
            ) : (
              <div className="p-3 bg-[#F8F9FA] border border-[#D4D4D4] rounded-lg text-xs text-[#605E5C] space-y-2">
                <span className="font-bold text-[#212121] block">Format page</span>
                <p>Page size: 16:9 (1280×720 logical px)</p>
                <p>Grid snapping: 8px active</p>
                <p>Select any visual on the canvas to inspect its title, colors, and data labels.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: THEME */}
        {activeVisTab === 'theme' && (
          <div className="space-y-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#212121] block">
              Dashboard Color Theme
            </span>

            <div>
              <label className="text-xs font-medium text-[#605E5C] block mb-1">
                Select Global Theme
              </label>
              <select
                aria-label="Visualizations Theme Palette"
                value={paletteId}
                onChange={(e) => onSelectPalette(e.target.value as PaletteId)}
                className="w-full bg-white border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 text-xs text-[#212121] font-semibold"
              >
                {Object.entries(colorPalettes).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#605E5C] block">Theme Swatches</span>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(colorPalettes).map(([id, p]) => {
                  const isSelected = paletteId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectPalette(id as PaletteId)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'bg-white border-[#217346] ring-1 ring-[#217346] shadow-sm'
                          : 'bg-[#F8F9FA] border-[#D4D4D4] hover:bg-white'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-[#212121] mb-1 truncate">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-1">
                        {p.colors.slice(0, 5).map((col, idx) => (
                          <div
                            key={idx}
                            style={{ backgroundColor: col }}
                            className="w-3.5 h-3.5 rounded-full shadow-2xs"
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardPaneWrapper>
  );
};
