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
  Eye,
  Check,
  Code2,
  Filter,
  ArrowUpDown,
  Calculator,
  Type,
  Split,
  Binary,
  Layers,
  Sparkles,
  Info,
  GitBranch,
  Calendar,
  TrendingUp,
  TableProperties,
  Pencil,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepType } from '../../types/steps';

export const RightPanel: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isRightPanelOpen,
    selectedDataset,
    steps,
    activeStepIndex,
    stepSummaries,
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
        { id: 'xlookup', name: 'XLOOKUP / VLOOKUP', desc: 'Bring columns from another table with exact match' },
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
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 select-none z-10 h-[calc(100vh-3.5rem)]">
      {/* Tabs Header */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 p-1">
        <button
          onClick={() => setActiveTab('applied')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'applied'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListTree size={14} className="text-emerald-400" />
          <span>Applied Steps ({steps.length + 1})</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'catalog'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PlusCircle size={14} className="text-sky-400" />
          <span>Add Step</span>
        </button>

        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'details'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal size={14} className="text-purple-400" />
          <span>Details</span>
        </button>
      </div>

      {/* Tab 1: Applied Steps */}
      {activeTab === 'applied' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800/60 bg-slate-950/20 text-xs text-slate-400 flex items-center justify-between">
            <span>{steps.length + 1} steps in pipeline</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Live DuckDB Preview
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Step 0: Source Dataset */}
            <div
              onClick={() => selectStep(null)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                activeStepIndex === null && steps.length === 0
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/70 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                    0
                  </div>
                  <span className="text-xs font-semibold">Source Dataset</span>
                </div>
                <CheckCircle2 size={13} className="text-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 pl-7 truncate">
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
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                      : step.enabled
                      ? 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 text-slate-200'
                      : 'bg-slate-900/40 border-slate-800 opacity-60 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          step.enabled
                            ? 'bg-sky-500/20 text-sky-400'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <span className="text-xs font-medium truncate">{step.label}</span>
                    </div>

                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => moveStep(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        className="p-1 hover:text-slate-100 text-slate-400 disabled:opacity-20"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => moveStep(idx, 'down')}
                        disabled={idx === steps.length - 1}
                        title="Move Down"
                        className="p-1 hover:text-slate-100 text-slate-400 disabled:opacity-20"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={() => openEditStepModal(step)}
                        title="Edit Step Parameters"
                        className="p-1 hover:text-amber-400 text-slate-400"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => duplicateStep(step.id)}
                        title="Duplicate Step"
                        className="p-1 hover:text-sky-400 text-slate-400"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        title="Delete Step"
                        className="p-1 hover:text-rose-400 text-slate-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 pl-7 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono uppercase bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
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
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 text-xs"
                      />
                      <span className="text-[10px]">{step.enabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  </div>
                </div>
              );
            })}

            {/* Add step CTA */}
            <button
              onClick={() => setActiveTab('catalog')}
              className="w-full mt-2 py-2.5 px-3 rounded-lg border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-all"
            >
              <PlusCircle size={14} />
              <span>Add Transformation Step</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Function Catalog */}
      {activeTab === 'catalog' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search functions & formulas..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
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
                  <div className="flex items-center gap-1.5 mb-2 px-1 text-slate-400">
                    <Icon size={13} className="text-emerald-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">{cat.category}</span>
                  </div>
                  <div className="space-y-1.5">
                    {filtered.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          openStepWizard(item.id as StepType);
                        }}
                        className="p-2 rounded-lg bg-slate-950/40 hover:bg-slate-800/80 border border-slate-800/60 hover:border-slate-700 cursor-pointer transition-all group"
                      >
                        <p className="text-xs font-medium text-slate-200 group-hover:text-emerald-300">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{item.desc}</p>
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
        <div className="flex-1 p-3 overflow-y-auto space-y-4">
          {currentInspectedStep ? (
            <>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-100">{currentInspectedStep.label}</h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditStepModal(currentInspectedStep)}
                      className="px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 flex items-center gap-1 transition-colors"
                      title="Edit this step's configuration"
                    >
                      <Pencil size={10} />
                      <span>Edit</span>
                    </button>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {currentInspectedStep.type}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1 font-mono">
                  {Object.entries(currentInspectedStep.params).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-500">{k}:</span>
                      <span className="text-slate-300">{JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equivalent Code Generator Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Code2 size={14} className="text-sky-400" />
                  <span>Equivalent Code</span>
                </div>

                {/* DuckDB SQL */}
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-amber-400">DuckDB SQL</span>
                    <button
                      onClick={() =>
                        handleCopyCode(selectedStepSummary?.generated_code.sql || '', 'sql')
                      }
                      className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1"
                    >
                      {copiedCodeType === 'sql' ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedCodeType === 'sql' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/60 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {selectedStepSummary?.generated_code.sql || '-- SQL fragment'}
                  </pre>
                </div>

                {/* Python Polars */}
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-sky-400">Python (Polars)</span>
                    <button
                      onClick={() =>
                        handleCopyCode(selectedStepSummary?.generated_code.polars || '', 'polars')
                      }
                      className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1"
                    >
                      {copiedCodeType === 'polars' ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedCodeType === 'polars' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/60 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {selectedStepSummary?.generated_code.polars || '# Polars code'}
                  </pre>
                </div>

                {/* Power Query M */}
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-purple-400">Power Query M</span>
                    <button
                      onClick={() =>
                        handleCopyCode(selectedStepSummary?.generated_code.power_query_m || '', 'm')
                      }
                      className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1"
                    >
                      {copiedCodeType === 'm' ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedCodeType === 'm' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/60 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {selectedStepSummary?.generated_code.power_query_m || '// Power Query M'}
                  </pre>
                </div>

                {/* Excel Formula */}
                {selectedStepSummary?.generated_code.excel_formula && (
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-emerald-400">Excel Formula</span>
                      <button
                        onClick={() =>
                          handleCopyCode(
                            selectedStepSummary?.generated_code.excel_formula || '',
                            'excel'
                          )
                        }
                        className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1"
                      >
                        {copiedCodeType === 'excel' ? <Check size={10} /> : <Copy size={10} />}
                        <span>{copiedCodeType === 'excel' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/60 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                      {selectedStepSummary.generated_code.excel_formula}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-slate-500">
              <SlidersHorizontal size={28} className="mx-auto mb-2 opacity-40 text-purple-400" />
              <p className="text-xs font-medium text-slate-300">No step selected</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] mx-auto">
                Apply a step or select an existing step from the Applied Steps list to view its formulas.
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
