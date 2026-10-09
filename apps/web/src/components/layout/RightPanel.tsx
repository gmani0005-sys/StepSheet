import React, { useState } from 'react';
import {
  ListTree,
  PlusCircle,
  SlidersHorizontal,
  Search,
  Eye,
  CheckCircle2,
  GitBranch,
  Filter,
  ArrowUpDown,
  Calculator,
  Calendar,
  Type,
  Split,
  Binary,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

export const RightPanel: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isRightPanelOpen,
    selectedDataset,
  } = useWorkbenchStore();

  const [catalogSearch, setCatalogSearch] = useState('');

  if (!isRightPanelOpen) return null;

  const stepCategories = [
    {
      category: 'Cleaning & Shape',
      icon: Filter,
      items: [
        { id: 'filter_rows', name: 'Filter Rows', desc: 'Keep or remove rows by visual rule conditions' },
        { id: 'sort_rows', name: 'Sort Rows', desc: 'Sort ascending or descending by one or more columns' },
        { id: 'change_type', name: 'Change Type', desc: 'Convert text, number, date, or boolean' },
        { id: 'rename_col', name: 'Rename Column', desc: 'Change column headers cleanly' },
        { id: 'remove_duplicates', name: 'Remove Duplicates', desc: 'Deduplicate on key columns, keep first or last' },
        { id: 'fill_down', name: 'Fill Down / Up', desc: 'Propagate values to fill missing blanks' },
      ],
    },
    {
      category: 'Lookup & Join',
      icon: GitBranch,
      items: [
        { id: 'xlookup', name: 'XLOOKUP / VLOOKUP', desc: 'Bring columns from another table with exact or fuzzy match' },
        { id: 'join_builder', name: 'Join Builder', desc: 'Combine datasets with visual Venn diagrams and health check' },
        { id: 'append_tables', name: 'Append (Union)', desc: 'Stack tables with column name or position alignment' },
      ],
    },
    {
      category: 'Logical & Conditional',
      icon: Binary,
      items: [
        { id: 'if_condition', name: 'IF / IFS Builder', desc: 'Visual rule rows with AND/OR groups and default values' },
        { id: 'conditional_col', name: 'Conditional Column', desc: 'Power Query style conditional branching' },
      ],
    },
    {
      category: 'Aggregation & Math',
      icon: Calculator,
      items: [
        { id: 'group_by', name: 'Group By & Aggregate', desc: 'SUMIFS, COUNTIFS, AVERAGEIFS across dimensions' },
        { id: 'math_column', name: 'Calculate Column', desc: 'Arithmetic between columns (e.g. Net = Amount - Discount)' },
      ],
    },
    {
      category: 'Text & Date',
      icon: Type,
      items: [
        { id: 'split_column', name: 'Split Column', desc: 'Split by delimiter, fixed position, or regex' },
        { id: 'text_clean', name: 'Trim / Clean / Case', desc: 'Standardize text formatting' },
        { id: 'date_extract', name: 'Date Parts & Calc', desc: 'Year, Month, EOMONTH, DATEDIF, Fiscal periods' },
      ],
    },
  ];

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
          <span>Applied Steps</span>
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
            <span>Pipeline: 1 step recorded</span>
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Deterministic
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Step 1: Source */}
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                    1
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Source Dataset</span>
                </div>
                <CheckCircle2 size={14} className="text-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 pl-7">
                {selectedDataset ? selectedDataset.name : 'No dataset selected'}
              </p>
              <div className="mt-2 pl-7 flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono">
                  {selectedDataset?.file_format.toUpperCase() || 'DATA'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {selectedDataset?.row_count.toLocaleString() || 0} rows
                </span>
              </div>
            </div>

            {/* Hint for adding steps */}
            <div className="p-3 rounded-lg border border-dashed border-slate-800 text-center text-slate-500">
              <p className="text-xs">Next steps will appear here in Phase 2.</p>
              <button
                onClick={() => setActiveTab('catalog')}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
              >
                <PlusCircle size={13} />
                <span>Browse Function Catalog</span>
              </button>
            </div>
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
                placeholder="Search transformations & formulas..."
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
                          alert(`Step "${item.name}" will be activated in Phase 2 Step Engine.`);
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

      {/* Tab 3: Step Details */}
      {activeTab === 'details' && (
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="text-center py-8 text-slate-500">
            <SlidersHorizontal size={28} className="mx-auto mb-2 opacity-40 text-purple-400" />
            <p className="text-xs font-medium text-slate-300">Step Parameters</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] mx-auto">
              Select an applied step or choose one from the catalog to configure its parameters.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
};
