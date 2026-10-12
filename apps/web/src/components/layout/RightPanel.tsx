import React, { useState } from 'react';
import {
  ListTree,
  PlusCircle,
  SlidersHorizontal,
  Search,
  CheckCircle2,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Check,
  Code2,
  Filter,
  Calculator,
  Type,
  Sparkles,
  GitBranch,
  Calendar,
  TrendingUp,
  Pencil,
  X,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepType } from '../../types/steps';

export const RightPanel: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isRightPanelOpen,
    toggleRightPanel,
    selectedDataset,
    steps,
    activeStepIndex,
    stepSummaries,
    queries,
    activeQueryId,
    addConnectionQuery,
    openStepWizard,
    openEditStepModal,
    removeStep,
    toggleStep,
    duplicateStep,
    moveStep,
    selectStep,
  } = useWorkbenchStore();

  const [catalogSearch, setCatalogSearch] = useState('');
  const [copiedCodeType, setCopiedCodeType] = useState<string | null>(null);

  if (!isRightPanelOpen) return null;

  const stepCategories = [
    {
      category: 'Cleaning & Shape',
      icon: Filter,
      items: [
        { id: 'filter_rows', name: 'Filter Rows', desc: 'Keep or remove rows by visual rule conditions' },
        { id: 'sort_rows', name: 'Sort Rows', desc: 'Sort ascending or descending by column' },
        { id: 'change_type', name: 'Change Type', desc: 'Convert text, number, date, or boolean' },
        { id: 'rename_column', name: 'Rename Column', desc: 'Change column headers cleanly' },
        { id: 'remove_duplicates', name: 'Remove Duplicates', desc: 'Deduplicate on key columns, keep first or last' },
        { id: 'fill_down', name: 'Fill Down / Up', desc: 'Propagate values to fill missing blanks' },
        { id: 'replace_values', name: 'Replace Values', desc: 'Find and replace values or nulls' },
        { id: 'split_column', name: 'Split Column', desc: 'Split by delimiter into multiple columns' },
        { id: 'pivot', name: 'Pivot Table', desc: 'Reshape rows into columns with aggregation' },
        { id: 'unpivot', name: 'Unpivot Columns', desc: 'Melt multiple columns into rows' },
      ],
    },
    {
      category: 'Lookup & Join',
      icon: GitBranch,
      items: [
        {
          id: 'xlookup',
          name: 'XLOOKUP Wizard',
          desc: 'Modern flexible lookup in any column direction with multi-column return & search modes',
        },
        {
          id: 'vlookup',
          name: 'VLOOKUP Wizard',
          desc: 'Classic vertical lookup by column index number (col_index_num) & exact/approximate match',
        },
        { id: 'join', name: 'Join Builder', desc: 'Combine datasets with Venn diagrams and health check' },
        { id: 'append', name: 'Append (Union)', desc: 'Stack tables with column name alignment' },
      ],
    },
    {
      category: 'Logical & Conditional',
      icon: Sparkles,
      items: [
        { id: 'conditional', name: 'IF / IFS / SWITCH', desc: 'Visual rule rows with conditions and default fallback' },
      ],
    },
    {
      category: 'Aggregation & Summary',
      icon: Calculator,
      items: [
        { id: 'group_by', name: 'Group By & Aggregate', desc: 'SUM, COUNT, DISTINCT COUNT, AVG, MIN, MAX' },
        { id: 'window_calc', name: 'Window Calculations', desc: 'Running total, Rank, Moving average, Lag / Lead' },
      ],
    },
    {
      category: 'Text & String',
      icon: Type,
      items: [
        { id: 'text_transform', name: 'Text Operations', desc: 'Trim, uppercase, lowercase, proper case, substring, concat' },
      ],
    },
    {
      category: 'Date & Time',
      icon: Calendar,
      items: [
        { id: 'date_transform', name: 'Date & Time Operations', desc: 'Extract parts, EOMONTH, DATEDIF, add time, fiscal year' },
      ],
    },
    {
      category: 'Numeric & Math',
      icon: TrendingUp,
      items: [
        { id: 'math_transform', name: 'Numeric & Math', desc: 'Arithmetic (+, -, *, /), round, abs, percent change, bins' },
      ],
    },
  ];

  const handleCopyCode = (code: string, type: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeType(type);
    setTimeout(() => setCopiedCodeType(null), 2000);
  };

  const selectedStepSummary =
    activeStepIndex !== null && stepSummaries[activeStepIndex]
      ? stepSummaries[activeStepIndex]
      : stepSummaries[stepSummaries.length - 1] || null;

  const currentInspectedStep =
    activeStepIndex !== null ? steps[activeStepIndex] : steps[steps.length - 1];

  return (
    <aside className="w-80 bg-[#F3F3F3] border-l border-[#D4D4D4] flex flex-col shrink-0 select-none z-10 h-full">
      {/* Excel Task Pane Title Strip */}
      <div className="h-8 px-3 bg-[#E6E6E6] border-b border-[#D4D4D4] flex items-center justify-between">
        <span className="text-[12px] font-bold text-[#212121] tracking-tight">
          Query Settings & Applied Steps
        </span>
        <button
          type="button"
          onClick={toggleRightPanel}
          title="Close Task Pane"
          className="p-1 text-[#605E5C] hover:text-[#212121] hover:bg-[#D4D4D4] rounded-[2px] transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Task Pane Sub-Tabs */}
      <div className="flex border-b border-[#D4D4D4] bg-[#F3F3F3] px-1 pt-1 gap-0.5">
        <button
          onClick={() => setActiveTab('applied')}
          className={`flex-1 py-1.5 px-2 text-[12px] flex items-center justify-center gap-1 transition-colors rounded-t-[2px] ${
            activeTab === 'applied'
              ? 'bg-white text-[#217346] font-semibold border-t border-x border-[#D4D4D4] border-b-2 border-b-[#217346] -mb-px'
              : 'text-[#444444] hover:text-[#212121] hover:bg-[#E6E6E6]'
          }`}
        >
          <ListTree size={13} className="text-[#217346]" />
          <span>Applied Steps ({steps.length + 1})</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 py-1.5 px-2 text-[12px] flex items-center justify-center gap-1 transition-colors rounded-t-[2px] ${
            activeTab === 'catalog'
              ? 'bg-white text-[#217346] font-semibold border-t border-x border-[#D4D4D4] border-b-2 border-b-[#217346] -mb-px'
              : 'text-[#444444] hover:text-[#212121] hover:bg-[#E6E6E6]'
          }`}
        >
          <PlusCircle size={13} className="text-[#217346]" />
          <span>Add Step</span>
        </button>

        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-1.5 px-2 text-[12px] flex items-center justify-center gap-1 transition-colors rounded-t-[2px] ${
            activeTab === 'details'
              ? 'bg-white text-[#217346] font-semibold border-t border-x border-[#D4D4D4] border-b-2 border-b-[#217346] -mb-px'
              : 'text-[#444444] hover:text-[#212121] hover:bg-[#E6E6E6]'
          }`}
        >
          <SlidersHorizontal size={13} className="text-[#217346]" />
          <span>Details</span>
        </button>
      </div>

      {/* Tab 1: Applied Steps */}
      {activeTab === 'applied' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="p-2.5 border-b border-[#D4D4D4] bg-[#F8F8F8] text-[12px] text-[#605E5C] space-y-1.5">
            <div className="flex items-center justify-between">
              <span>{steps.length + 1} steps in pipeline</span>
              <span className="text-[11px] text-[#217346] bg-[#E6F2EB] px-1.5 py-0.5 rounded-[2px] border border-[#217346]/30 font-medium">
                Live Preview
              </span>
            </div>
            {selectedDataset && (
              <div className="flex items-center justify-between pt-1 border-t border-[#E1E1E1] text-[12px]">
                {activeQueryId ? (
                  <span className="text-[#217346] flex items-center gap-1 truncate font-medium">
                    <GitBranch size={11} className="text-[#217346] shrink-0" />
                    <span className="truncate">
                      Query: {queries.find((q) => q.id === activeQueryId)?.name || selectedDataset.name}
                    </span>
                  </span>
                ) : (
                  <span className="text-[#605E5C] truncate">Table: {selectedDataset.name}</span>
                )}
                {activeQueryId ? (
                  <span className="text-[11px] px-1.5 py-0.2 rounded-[2px] bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 shrink-0">
                    Saved in Connections
                  </span>
                ) : (
                  <button
                    onClick={() => addConnectionQuery(selectedDataset.id)}
                    className="text-[11px] px-1.5 py-0.5 rounded-[2px] bg-white hover:bg-[#E6F2EB] text-[#217346] border border-[#217346] shrink-0 transition-colors"
                  >
                    + Save to Connections
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {/* Step 0: Source Dataset */}
            <div
              onClick={() => selectStep(null)}
              className={`p-2 rounded-[2px] border transition-colors cursor-pointer ${
                activeStepIndex === null && steps.length === 0
                  ? 'bg-[#E6F2EB] border-[#217346] text-[#212121]'
                  : 'bg-[#F8F8F8] border-[#D4D4D4] hover:bg-[#F3F3F3] text-[#212121]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-[2px] bg-[#217346] text-white flex items-center justify-center text-[11px] font-bold">
                    0
                  </div>
                  <span className="text-[12px] font-semibold">Source Dataset</span>
                </div>
                <CheckCircle2 size={13} className="text-[#107C10]" />
              </div>
              <p className="text-[12px] text-[#605E5C] mt-0.5 pl-7 truncate">
                {selectedDataset ? selectedDataset.name : 'No dataset selected'}
              </p>
            </div>

            {/* Steps list */}
            {steps.map((step, idx) => {
              const isSelected = activeStepIndex === idx;
              return (
                <div
                  key={step.id}
                  onClick={() => selectStep(idx)}
                  onDoubleClick={() => openEditStepModal(step)}
                  className={`p-2 rounded-[2px] border transition-colors cursor-pointer group ${
                    isSelected
                      ? 'bg-[#E6F2EB] border-[#217346] text-[#212121]'
                      : step.enabled
                      ? 'bg-white border-[#D4D4D4] hover:bg-[#F3F3F3] text-[#212121]'
                      : 'bg-[#F3F3F3] border-[#D4D4D4] opacity-60 text-[#605E5C]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-[2px] shrink-0 flex items-center justify-center text-[11px] font-bold ${
                          step.enabled
                            ? 'bg-[#217346] text-white'
                            : 'bg-[#D4D4D4] text-[#605E5C]'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <span className="text-[12px] font-semibold truncate" title={step.label}>
                        {step.label}
                      </span>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openEditStepModal(step)}
                        title="Edit Step Parameters"
                        className="px-1.5 py-0.5 bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346]/40 rounded-[2px] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Pencil size={11} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => moveStep(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        className="p-1 hover:bg-[#E6E6E6] text-[#605E5C] hover:text-[#212121] disabled:opacity-20 rounded-[2px]"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => moveStep(idx, 'down')}
                        disabled={idx === steps.length - 1}
                        title="Move Down"
                        className="p-1 hover:bg-[#E6E6E6] text-[#605E5C] hover:text-[#212121] disabled:opacity-20 rounded-[2px]"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={() => duplicateStep(step.id)}
                        title="Duplicate Step"
                        className="p-1 hover:bg-[#E6E6E6] text-[#605E5C] hover:text-[#217346] rounded-[2px]"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        title="Delete Step"
                        className="p-1 hover:bg-[#E6E6E6] text-[#605E5C] hover:text-[#C50F1F] rounded-[2px]"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 pl-7 flex items-center justify-between text-[11px] text-[#605E5C]">
                    <span className="font-mono uppercase bg-[#F3F3F3] px-1.5 py-0.2 rounded-[2px] border border-[#D4D4D4] text-[#444444]">
                      {step.type.replace('_', ' ')}
                    </span>
                    <label
                      className="flex items-center gap-1 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={() => toggleStep(step.id)}
                        className="rounded-[2px] border-[#8A8886] text-[#217346] focus:ring-0 text-xs"
                      />
                      <span className="text-[11px]">{step.enabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  </div>
                </div>
              );
            })}

            {/* Add step CTA */}
            <button
              onClick={() => setActiveTab('catalog')}
              className="w-full mt-2 py-2 px-3 rounded-[2px] border border-dashed border-[#8A8886] hover:border-[#217346] bg-[#F8F8F8] hover:bg-[#E6F2EB] flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#212121] hover:text-[#217346] transition-colors"
            >
              <PlusCircle size={14} />
              <span>Add Transformation Step</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Function Catalog */}
      {activeTab === 'catalog' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="p-2.5 border-b border-[#D4D4D4] bg-[#F8F8F8]">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-[#605E5C]" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search functions & formulas..."
                className="w-full bg-white border border-[#8A8886] rounded-[2px] pl-8 pr-3 py-1 text-[12px] text-[#212121] placeholder-[#605E5C] focus:outline-none focus:border-[#217346]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
            {stepCategories.map((cat) => {
              const Icon = cat.icon;
              const filtered = cat.items.filter(
                (item) =>
                  item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                  item.desc.toLowerCase().includes(catalogSearch.toLowerCase())
              );
              if (filtered.length === 0) return null;

              return (
                <div key={cat.category}>
                  <div className="flex items-center gap-1.5 mb-1.5 px-1 text-[#444444]">
                    <Icon size={13} className="text-[#217346]" />
                    <span className="text-[12px] font-bold uppercase tracking-wider">{cat.category}</span>
                  </div>
                  <div className="space-y-1">
                    {filtered.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          openStepWizard(item.id as StepType);
                        }}
                        className="p-2 rounded-[2px] bg-[#F8F8F8] hover:bg-[#E6F2EB] border border-[#D4D4D4] hover:border-[#217346] cursor-pointer transition-colors group"
                      >
                        <p className="text-[12px] font-semibold text-[#212121] group-hover:text-[#217346]">
                          {item.name}
                        </p>
                        <p className="text-[12px] text-[#605E5C] mt-0.5 leading-tight">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Step Details & Live Formula Equivalents */}
      {activeTab === 'details' && (
        <div className="flex-1 p-2.5 overflow-y-auto space-y-3 bg-white">
          {currentInspectedStep ? (
            <>
              <div className="p-2.5 rounded-[2px] bg-[#F8F8F8] border border-[#D4D4D4]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[12px] font-bold text-[#212121]">{currentInspectedStep.label}</h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditStepModal(currentInspectedStep)}
                      className="px-2 py-0.5 text-[11px] rounded-[2px] bg-[#E6F2EB] text-[#217346] hover:bg-[#cce5d6] border border-[#217346] flex items-center gap-1 transition-colors font-medium"
                      title="Edit this step's configuration"
                    >
                      <Pencil size={10} />
                      <span>Edit</span>
                    </button>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-[2px] bg-[#E6E6E6] text-[#212121]">
                      {currentInspectedStep.type}
                    </span>
                  </div>
                </div>
                <div className="text-[12px] text-[#605E5C] space-y-1 font-mono">
                  {Object.entries(currentInspectedStep.params).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-[#605E5C]">{k}:</span>
                      <span className="text-[#212121]">{JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equivalent Code Generator Section */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#212121]">
                  <Code2 size={14} className="text-[#217346]" />
                  <span>Equivalent Code</span>
                </div>

                {/* DuckDB SQL */}
                <div className="p-2 rounded-[2px] bg-[#F8F8F8] border border-[#D4D4D4] space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-[#217346]">DuckDB SQL</span>
                    <button
                      onClick={() =>
                        handleCopyCode(selectedStepSummary?.generated_code.sql || '', 'sql')
                      }
                      className="text-[11px] text-[#605E5C] hover:text-[#217346] flex items-center gap-1"
                    >
                      {copiedCodeType === 'sql' ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedCodeType === 'sql' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-[12px] font-mono text-[#212121] bg-white border border-[#E1E1E1] p-2 rounded-[2px] overflow-x-auto whitespace-pre-wrap">
                    {selectedStepSummary?.generated_code.sql || '-- SQL fragment'}
                  </pre>
                </div>

                {/* Python Polars */}
                <div className="p-2 rounded-[2px] bg-[#F8F8F8] border border-[#D4D4D4] space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-[#217346]">Python (Polars)</span>
                    <button
                      onClick={() =>
                        handleCopyCode(selectedStepSummary?.generated_code.polars || '', 'polars')
                      }
                      className="text-[11px] text-[#605E5C] hover:text-[#217346] flex items-center gap-1"
                    >
                      {copiedCodeType === 'polars' ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedCodeType === 'polars' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-[12px] font-mono text-[#212121] bg-white border border-[#E1E1E1] p-2 rounded-[2px] overflow-x-auto whitespace-pre-wrap">
                    {selectedStepSummary?.generated_code.polars || '# Polars code'}
                  </pre>
                </div>

                {/* Power Query M */}
                <div className="p-2 rounded-[2px] bg-[#F8F8F8] border border-[#D4D4D4] space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-[#217346]">Power Query M</span>
                    <button
                      onClick={() =>
                        handleCopyCode(selectedStepSummary?.generated_code.power_query_m || '', 'm')
                      }
                      className="text-[11px] text-[#605E5C] hover:text-[#217346] flex items-center gap-1"
                    >
                      {copiedCodeType === 'm' ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedCodeType === 'm' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-[12px] font-mono text-[#212121] bg-white border border-[#E1E1E1] p-2 rounded-[2px] overflow-x-auto whitespace-pre-wrap">
                    {selectedStepSummary?.generated_code.power_query_m || '// Power Query M'}
                  </pre>
                </div>

                {/* Excel Formula */}
                {selectedStepSummary?.generated_code.excel_formula && (
                  <div className="p-2 rounded-[2px] bg-[#F8F8F8] border border-[#D4D4D4] space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#217346]">Excel Formula</span>
                      <button
                        onClick={() =>
                          handleCopyCode(
                            selectedStepSummary?.generated_code.excel_formula || '',
                            'excel'
                          )
                        }
                        className="text-[11px] text-[#605E5C] hover:text-[#217346] flex items-center gap-1"
                      >
                        {copiedCodeType === 'excel' ? <Check size={10} /> : <Copy size={10} />}
                        <span>{copiedCodeType === 'excel' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="text-[12px] font-mono text-[#212121] bg-white border border-[#E1E1E1] p-2 rounded-[2px] overflow-x-auto whitespace-pre-wrap">
                      {selectedStepSummary.generated_code.excel_formula}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-[#605E5C]">
              <SlidersHorizontal size={24} className="mx-auto mb-2 text-[#217346]" />
              <p className="text-[12px] font-semibold text-[#212121]">No step selected</p>
              <p className="text-[12px] text-[#605E5C] mt-1 max-w-[200px] mx-auto">
                Apply a step or select an existing step from the Applied Steps list to view its formulas.
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
