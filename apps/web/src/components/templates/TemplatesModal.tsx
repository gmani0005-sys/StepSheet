import React, { useState, useEffect } from 'react';
import {
  X,
  LayoutTemplate,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Plus,
  Play,
  RotateCcw,
  BookOpen,
  Layers,
  ChevronRight,
  Check,
} from 'lucide-react';
import { api } from '../../api/client';
import { Dataset, ColumnSchema } from '../../types';
import { StepDefinition } from '../../types/steps';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset | null;
  columns: ColumnSchema[];
  currentSteps: StepDefinition[];
  onApplySteps: (newSteps: StepDefinition[]) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  isOpen,
  onClose,
  dataset,
  columns,
  currentSteps,
  onApplySteps,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'save' | 'mapping'>('catalog');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);

  // Column Mapping state
  const [mappingSuggestions, setMappingSuggestions] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);

  // Save as Template state
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveCat, setSaveCat] = useState('General');
  const [saveReqCols, setSaveReqCols] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      if (currentSteps.length > 0 && columns.length > 0) {
        setSaveReqCols(columns.slice(0, 3).map((c) => c.name));
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await api.listTemplates();
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartApply = async (tpl: any) => {
    if (!dataset) {
      alert('Please upload or select a dataset first.');
      return;
    }
    setSelectedTemplate(tpl);
    setIsLoading(true);
    try {
      const res = await api.suggestColumnMapping(tpl.id, dataset.id);
      setMappingSuggestions(res.suggestions || []);

      // Pre-fill mapping
      const initialMap: Record<string, string> = {};
      for (const s of res.suggestions || []) {
        if (s.suggested_column) {
          initialMap[s.template_column] = s.suggested_column;
        } else if (columns.length > 0) {
          initialMap[s.template_column] = columns[0].name;
        }
      }
      setColumnMapping(initialMap);
      setActiveTab('mapping');
    } catch (err: any) {
      alert(`Failed to load column mapping: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmApply = async () => {
    if (!dataset || !selectedTemplate) return;
    setIsApplying(true);
    try {
      const res = await api.applyTemplate(selectedTemplate.id, dataset.id, columnMapping);
      onApplySteps(res.rewritten_steps);
      onClose();
    } catch (err: any) {
      alert(`Failed to apply template: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!saveName.trim()) {
      alert('Please provide a template name.');
      return;
    }
    if (currentSteps.length === 0) {
      alert('Current pipeline has no steps to save.');
      return;
    }

    setIsSaving(true);
    try {
      const reqCols = saveReqCols.map((cName) => {
        const found = columns.find((c) => c.name === cName);
        return {
          name: cName,
          data_type: found?.data_type || 'text',
          description: `Required input column ${cName}`,
        };
      });

      await api.createTemplate({
        name: saveName.trim(),
        description: saveDesc.trim() || undefined,
        category: saveCat,
        required_columns: reqCols,
        steps: currentSteps,
      });

      await loadTemplates();
      setActiveTab('catalog');
      setSaveName('');
      setSaveDesc('');
    } catch (err: any) {
      alert(`Failed to save template: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const categories = ['All', 'Finance', 'Marketing', 'Time Intelligence', 'Data Cleansing', 'General'];
  const filteredTemplates = templates.filter(
    (t) => categoryFilter === 'All' || t.category === categoryFilter
  );

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <LayoutTemplate size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">Pipeline Templates & Reusability</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {templates.length} Templates Available
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Apply pre-built analytical workflows to new files with guided column mapping
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'catalog'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Template Catalog
            </button>
            <button
              onClick={() => setActiveTab('save')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'save'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Save Current Pipeline ({currentSteps.length} Steps)
            </button>
            {activeTab === 'mapping' && (
              <button
                className="pb-2.5 text-xs font-semibold border-b-2 border-indigo-500 text-indigo-400"
              >
                Column Mapping: {selectedTemplate?.name}
              </button>
            )}
          </div>

          {activeTab === 'catalog' && (
            <div className="flex items-center gap-1.5 pt-0.5 pb-2.5 overflow-x-auto text-[11px] chips-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    categoryFilter === cat
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'catalog' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-500/50 transition-all group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {tpl.category}
                      </span>
                      {tpl.is_builtin && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Built-in
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-slate-100 text-sm group-hover:text-indigo-300 transition-colors">
                      {tpl.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {tpl.description}
                    </p>

                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Layers size={13} className="text-indigo-400" />
                        <span>{tpl.steps.length} Steps</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Requires: {tpl.required_columns.map((c: any) => c.name).join(', ')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-end">
                    <button
                      onClick={() => handleStartApply(tpl)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm shadow-indigo-600/30"
                    >
                      <span>Apply to Dataset</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'mapping' && selectedTemplate && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-100 text-sm">
                      Map Columns for "{selectedTemplate.name}"
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Target Dataset: <span className="text-slate-200 font-medium">{dataset?.name}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('catalog')}
                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                  >
                    Change Template
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Column Matching Configuration
                </span>

                {mappingSuggestions.map((sug) => {
                  const reqName = sug.template_column;
                  const currentTarget = columnMapping[reqName] || '';

                  return (
                    <div
                      key={reqName}
                      className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-300">
                            {reqName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            Required
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                          {sug.match_reason} ({(sug.confidence * 100).toFixed(0)}% confidence)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <ArrowRight size={14} className="text-slate-500" />
                        <select
                          value={currentTarget}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({
                              ...prev,
                              [reqName]: e.target.value,
                            }))
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          {columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.data_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-800">
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                >
                  Back to Catalog
                </button>
                <button
                  onClick={handleConfirmApply}
                  disabled={isApplying}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30"
                >
                  <Play size={14} className="fill-white" />
                  <span>{isApplying ? 'Applying Pipeline...' : 'Apply & Run Pipeline'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'save' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                <h4 className="font-semibold text-slate-100 text-sm">Save Current Pipeline as Template</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Package current {currentSteps.length} steps into a reusable template that any team member can apply to new datasets.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Template Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Monthly Revenue Consolidation"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Category</label>
                  <select
                    value={saveCat}
                    onChange={(e) => setSaveCat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="General">General</option>
                    <option value="Finance">Finance</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Sales">Sales</option>
                    <option value="Data Cleansing">Data Cleansing</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Required Columns ({saveReqCols.length})
                  </label>
                  <span className="text-[11px] text-slate-400 block truncate">
                    {saveReqCols.join(', ') || 'None selected'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Description (Optional)</label>
                <textarea
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="Describe the calculation steps and intended use..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={isSaving || !saveName.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30"
                >
                  <Plus size={14} />
                  <span>{isSaving ? 'Saving Template...' : 'Save Template'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Templates are reusable across any CSV, Excel, or Parquet dataset
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
