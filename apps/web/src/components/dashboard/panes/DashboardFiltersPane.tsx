import React, { useState } from 'react';
import { Eye, Search, ChevronDown, ChevronRight, MoreHorizontal, Filter, X, RotateCcw } from 'lucide-react';
import { DashboardPaneWrapper, DashboardPaneConfig } from './DashboardPaneWrapper';
import { DashboardVisualConfig } from '../DashboardModal';

interface DashboardFiltersPaneProps {
  config: DashboardPaneConfig;
  onToggleCollapse: () => void;
  onHide: () => void;
  onResize: (newWidth: number) => void;
  onResetWidth: () => void;
  activeVisual: DashboardVisualConfig | null;
  slicerColumns: string[];
  multiSlicerSelections: Record<string, string[]>;
  onToggleSlicerValue: (column: string, value: string) => void;
  onClearAllSlicers: () => void;
  distinctValuesGetter: (col: string) => string[];
}

export const DashboardFiltersPane: React.FC<DashboardFiltersPaneProps> = ({
  config,
  onToggleCollapse,
  onHide,
  onResize,
  onResetWidth,
  activeVisual,
  slicerColumns,
  multiSlicerSelections,
  onToggleSlicerValue,
  onClearAllSlicers,
  distinctValuesGetter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isVisualFiltersOpen, setIsVisualFiltersOpen] = useState(true);
  const [isPageFiltersOpen, setIsPageFiltersOpen] = useState(true);
  const [isAllPagesFiltersOpen, setIsAllPagesFiltersOpen] = useState(true);

  return (
    <DashboardPaneWrapper
      id="filters"
      title="Filters"
      testId="dashboard-filters-pane"
      icon={<Filter className="w-4 h-4 text-[#217346]" />}
      config={config}
      onToggleCollapse={onToggleCollapse}
      onHide={onHide}
      onResize={onResize}
      onResetWidth={onResetWidth}
      headerRightExtra={
        <button
          type="button"
          onClick={onHide}
          className="p-1 rounded text-[#605E5C] hover:text-[#217346] hover:bg-black/5 transition-colors"
          title="Hide Filters pane"
          aria-label="Hide Filters pane"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      }
    >
      {/* Search Bar */}
      <div className="p-2 border-b border-[#D4D4D4] bg-[#F8F9FA]">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-[#605E5C]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search filters"
            className="w-full bg-white border border-[#D4D4D4] rounded px-2.5 pl-7 py-1 text-xs text-[#212121] outline-none focus:border-[#217346]"
          />
        </div>
      </div>

      <div className="p-2.5 space-y-3 overflow-y-auto">
        {/* Section 1: Filters on this visual */}
        {activeVisual && (
          <div className="border border-[#D4D4D4] rounded-lg bg-white overflow-hidden shadow-xs">
            <div
              onClick={() => setIsVisualFiltersOpen(!isVisualFiltersOpen)}
              className="flex items-center justify-between px-2.5 py-1.5 bg-[#F8F9FA] border-b border-[#D4D4D4] cursor-pointer select-none"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#212121]">
                {isVisualFiltersOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#605E5C]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#605E5C]" />
                )}
                <span>Filters on this visual</span>
              </div>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 text-[#605E5C] hover:text-[#212121]"
                title="Filter options"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {isVisualFiltersOpen && (
              <div className="p-2.5 space-y-2">
                <div className="text-[11px] font-semibold text-[#605E5C]">
                  {activeVisual.title} ({activeVisual.categoryCol})
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {distinctValuesGetter(activeVisual.categoryCol)
                    .filter((v) => v.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((val) => {
                      const isChecked = (multiSlicerSelections[activeVisual.categoryCol] || []).includes(val);
                      return (
                        <label
                          key={val}
                          className="flex items-center gap-2 text-xs text-[#212121] hover:bg-[#F3F3F3] p-1 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleSlicerValue(activeVisual.categoryCol, val)}
                            className="rounded border-[#D4D4D4] text-[#217346]"
                          />
                          <span className="truncate">{val}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 2: Filters on this page */}
        <div className="border border-[#D4D4D4] rounded-lg bg-white overflow-hidden shadow-xs">
          <div
            onClick={() => setIsPageFiltersOpen(!isPageFiltersOpen)}
            className="flex items-center justify-between px-2.5 py-1.5 bg-[#F8F9FA] border-b border-[#D4D4D4] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#212121]">
              {isPageFiltersOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#605E5C]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#605E5C]" />
              )}
              <span>Filters on this page</span>
            </div>
            {Object.values(multiSlicerSelections).some((arr) => arr.length > 0) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAllSlicers();
                }}
                className="text-[10px] text-[#C50F1F] font-bold hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {isPageFiltersOpen && (
            <div className="p-2.5 space-y-2">
              {slicerColumns.map((col) => {
                const picked = multiSlicerSelections[col] || [];
                const distinct = distinctValuesGetter(col);
                return (
                  <div key={col} className="p-2 rounded border border-[#E1DFDD] bg-[#FAF9F8]">
                    <div className="flex items-center justify-between text-xs font-bold text-[#217346] mb-1">
                      <span>{col}</span>
                      <span className="text-[10px] text-[#605E5C] font-normal">
                        {picked.length > 0 ? `${picked.length} selected` : 'All'}
                      </span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-0.5">
                      {distinct.slice(0, 6).map((val) => {
                        const isChecked = picked.includes(val);
                        return (
                          <label
                            key={val}
                            className="flex items-center gap-1.5 text-[11px] text-[#212121] cursor-pointer py-0.5"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => onToggleSlicerValue(col, val)}
                              className="rounded border-[#D4D4D4] text-[#217346] w-3 h-3"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="border border-dashed border-[#D4D4D4] rounded-lg p-2.5 text-center text-xs text-[#605E5C]">
                Add data fields here
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Filters on all pages */}
        <div className="border border-[#D4D4D4] rounded-lg bg-white overflow-hidden shadow-xs">
          <div
            onClick={() => setIsAllPagesFiltersOpen(!isAllPagesFiltersOpen)}
            className="flex items-center justify-between px-2.5 py-1.5 bg-[#F8F9FA] border-b border-[#D4D4D4] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#212121]">
              {isAllPagesFiltersOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#605E5C]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#605E5C]" />
              )}
              <span>Filters on all pages</span>
            </div>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="p-0.5 text-[#605E5C] hover:text-[#212121]"
              title="Filter options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {isAllPagesFiltersOpen && (
            <div className="p-2.5">
              <div className="border border-dashed border-[#D4D4D4] rounded-lg p-2.5 text-center text-xs text-[#605E5C]">
                Add data fields here
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardPaneWrapper>
  );
};
