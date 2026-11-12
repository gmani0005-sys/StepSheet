import React, { useState } from 'react';
import {
  Database,
  Search,
  ChevronDown,
  ChevronRight,
  Calendar,
  CheckSquare,
  Type,
  Table2,
  Plus,
  GripVertical,
} from 'lucide-react';
import { DashboardPaneWrapper, DashboardPaneConfig } from './DashboardPaneWrapper';
import { Dataset, ColumnSchema, DataType } from '../../../types';
import { QueryConnection } from '../../../store/workbenchStore';
import { DashboardVisualConfig, DashboardKpiConfig } from '../DashboardModal';

interface DashboardDataPaneProps {
  config: DashboardPaneConfig;
  onToggleCollapse: () => void;
  onResize: (newWidth: number) => void;
  onResetWidth: () => void;
  datasets: Dataset[];
  queries: QueryConnection[];
  selectedDataset: Dataset | null;
  columns: ColumnSchema[];
  activeVisual: DashboardVisualConfig | null;
  activeKpi?: DashboardKpiConfig | null;
  onBindFieldToVisual: (columnName: string, role: 'category' | 'value' | 'series') => void;
}

export const DashboardDataPane: React.FC<DashboardDataPaneProps> = ({
  config,
  onToggleCollapse,
  onResize,
  onResetWidth,
  datasets,
  queries,
  selectedDataset,
  columns,
  activeVisual,
  activeKpi,
  onBindFieldToVisual,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({
    [selectedDataset?.id || 'default']: true,
  });

  const toggleTableExpand = (tableId: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableId]: !prev[tableId],
    }));
  };

  const renderTypeIcon = (dt: DataType) => {
    switch (dt) {
      case 'integer':
      case 'float':
        return <span className="text-[11px] font-bold text-[#217346] w-3.5 text-center">Σ</span>;
      case 'date':
      case 'timestamp':
        return <Calendar className="w-3.5 h-3.5 text-[#005A9E]" />;
      case 'boolean':
        return <CheckSquare className="w-3.5 h-3.5 text-[#498205]" />;
      default:
        return <Type className="w-3.5 h-3.5 text-[#605E5C]" />;
    }
  };

  const hasData = datasets.length > 0 || queries.length > 0;

  return (
    <DashboardPaneWrapper
      id="data"
      title="Data"
      testId="dashboard-data-pane"
      icon={<Database className="w-4 h-4 text-[#217346]" />}
      config={config}
      onToggleCollapse={onToggleCollapse}
      onResize={onResize}
      onResetWidth={onResetWidth}
    >
      {/* Search Bar */}
      {hasData && (
        <div className="p-2 border-b border-[#D4D4D4] bg-[#F8F9FA]">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2 text-[#605E5C]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search data fields"
              className="w-full bg-white border border-[#D4D4D4] rounded px-2.5 pl-7 py-1 text-xs text-[#212121] outline-none focus:border-[#217346]"
            />
          </div>
        </div>
      )}

      {/* Tables & Columns List */}
      <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-[#605E5C] space-y-2 mt-6">
            <Database className="w-8 h-8 text-[#C8C6C4]" />
            <p>You haven't loaded any data yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5" role="tree">
            {datasets.map((ds) => {
              const isExpanded = expandedTables[ds.id] ?? false;
              const isSelected = selectedDataset?.id === ds.id;
              const dsColumns = isSelected ? columns : (ds.schema_metadata || []);
              const filteredCols = dsColumns.filter((c) =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase())
              );

              return (
                <div key={ds.id} className="border border-[#D4D4D4] rounded-lg bg-white overflow-hidden shadow-2xs">
                  {/* Table Header */}
                  <div
                    onClick={() => toggleTableExpand(ds.id)}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-[#F8F9FA] hover:bg-[#EFEFEF] cursor-pointer select-none text-xs font-bold text-[#212121]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#605E5C] shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#605E5C] shrink-0" />
                      )}
                      <Table2 className="w-3.5 h-3.5 text-[#217346] shrink-0" />
                      <span className="truncate" title={ds.name}>
                        {ds.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#605E5C] font-normal shrink-0 ml-1">
                      {ds.row_count} rows
                    </span>
                  </div>

                  {/* Columns */}
                  {isExpanded && (
                    <div className="py-1 px-1 bg-white border-t border-[#D4D4D4] space-y-0.5">
                      {filteredCols.length === 0 ? (
                        <div className="text-[11px] text-[#605E5C] px-3 py-1">
                          No matching fields
                        </div>
                      ) : (
                        filteredCols.map((col) => {
                          const isBoundCategory = activeVisual?.categoryCol === col.name;
                          const isBoundValue =
                            activeVisual?.valueCol === col.name || activeKpi?.column === col.name;
                          const isChecked = isBoundCategory || isBoundValue;

                          return (
                            <div
                              key={col.name}
                              draggable
                              onDragStart={(e) => {
                                // Power BI-style field drag: drop onto a
                                // Category/Values/Legend well in the
                                // Visualizations pane to bind it there,
                                // for the active visual or KPI card.
                                e.dataTransfer.setData('text/plain', col.name);
                                e.dataTransfer.setData('application/x-stepsheet-field-type', col.data_type);
                                e.dataTransfer.effectAllowed = 'copy';
                              }}
                              className="flex items-center justify-between px-2 py-1 rounded hover:bg-[#F3F3F3] text-xs text-[#212121] group cursor-grab active:cursor-grabbing"
                              title={`${col.name} (${col.data_type}) — drag onto a field well, or use the checkbox`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <GripVertical className="w-3 h-3 text-[#C8C6C4] group-hover:text-[#8A8886] shrink-0" />
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (col.data_type === 'integer' || col.data_type === 'float') {
                                      onBindFieldToVisual(col.name, 'value');
                                    } else {
                                      onBindFieldToVisual(col.name, 'category');
                                    }
                                  }}
                                  className="rounded border-[#D4D4D4] text-[#217346] w-3 h-3 cursor-pointer shrink-0"
                                />
                                <div className="shrink-0">{renderTypeIcon(col.data_type)}</div>
                                <span className="truncate">{col.name}</span>
                              </div>

                              {activeVisual && (
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => onBindFieldToVisual(col.name, 'category')}
                                    className="px-1 py-0.5 text-[9px] font-bold bg-[#E6F2EB] text-[#185C37] rounded hover:bg-[#cce5d6]"
                                    title="Add to Axis / Category"
                                  >
                                    Axis
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onBindFieldToVisual(col.name, 'value')}
                                    className="px-1 py-0.5 text-[9px] font-bold bg-[#E6F2EB] text-[#185C37] rounded hover:bg-[#cce5d6]"
                                    title="Add to Values / Metric"
                                  >
                                    Value
                                  </button>
                                </div>
                              )}
                              {!activeVisual && activeKpi && (
                                <div className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => onBindFieldToVisual(col.name, 'value')}
                                    className="px-1 py-0.5 text-[9px] font-bold bg-[#E6F2EB] text-[#185C37] rounded hover:bg-[#cce5d6]"
                                    title="Set as this KPI's metric column"
                                  >
                                    Set as Metric
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardPaneWrapper>
  );
};
