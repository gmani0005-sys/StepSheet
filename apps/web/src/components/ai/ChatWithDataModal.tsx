import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  Database,
  BarChart3,
  Table as TableIcon,
  Code2,
  PlusCircle,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  RotateCcw,
  User,
  Bot,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { getRowVal } from '../dashboard/DashboardModal';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  response?: {
    plan?: any;
    explanation: string;
    calculation_method: string;
    columns: string[];
    rows: any[];
    row_count: number;
    chart?: {
      type: string;
      x: string;
      y: string;
    };
    query_trace: string;
    latency_ms: number;
  };
  error?: string;
  viewMode?: 'split' | 'chart' | 'table';
  showSql?: boolean;
  dashboardPlan?: {
    dashboardTitle: string;
    visuals: any[];
    kpiCards: any[];
    slicerColumns: string[];
    paletteId: string;
  };
}

interface ChatWithDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDashboard?: () => void;
}

export const ChatWithDataModal: React.FC<ChatWithDataModalProps> = ({
  isOpen,
  onClose,
  onOpenDashboard,
}) => {
  const { selectedDataset, datasets } = useWorkbenchStore();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    selectedDataset?.id || (datasets[0]?.id || '')
  );
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeDataset =
    datasets.find((d) => d.id === selectedDatasetId) || selectedDataset || datasets[0];

  const suggestedPrompts = [
    'What are the top 5 products by revenue?',
    'Show total sales by region',
    'Show missing values by column',
    'Show sales trend over time',
    'Which categories contribute the most to profit?',
  ];

  const initialWelcomeMessage = (): ChatMessage => ({
    id: 'msg_welcome',
    role: 'assistant',
    content: `Hello! I am your AI Data Analyst for **${activeDataset?.name || 'Dataset'}** (${activeDataset?.row_count || 0} rows). Ask me any analytical question in plain English, and I will compute answers, plot charts, and explain the findings step by step.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  const [messages, setMessages] = useState<ChatMessage[]>([initialWelcomeMessage()]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') { messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }); }
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, loading]);

  // Reset conversation if dataset changes
  useEffect(() => {
    if (activeDataset) {
      setMessages([initialWelcomeMessage()]);
    }
  }, [selectedDatasetId]);

  const handleClearHistory = () => {
    setMessages([initialWelcomeMessage()]);
  };

  const handleToggleViewMode = (msgId: string, mode: 'split' | 'chart' | 'table') => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, viewMode: mode } : m))
    );
  };

  const handleToggleSql = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, showSql: !m.showSql } : m))
    );
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSubmit = async (queryText?: string) => {
    const textToRun = (queryText || prompt).trim();
    if (!textToRun || !activeDataset || loading) return;

    const userMsgId = `msg_user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: textToRun,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    try {
      const storeState = useWorkbenchStore.getState();
      const rowsToUse = Array.isArray((activeDataset as any).rows) && (activeDataset as any).rows.length > 0
        ? (activeDataset as any).rows
        : (Array.isArray(storeState.allRows) && storeState.allRows.length > 0 ? storeState.allRows : storeState.rows);
      const colsToUse = Array.isArray(activeDataset.schema_metadata) && activeDataset.schema_metadata.length > 0
        ? activeDataset.schema_metadata
        : storeState.columns;

      const isDashboardIntent =
        /(?:create|generate|build|make|design|rebuild)\s+.*dashboard/i.test(textToRun) ||
        /(?:interactive\s+)?dashboard\s+(?:for|using|with|from|of)/i.test(textToRun) ||
        textToRun.toLowerCase().includes('dashboard') && (
          textToRun.toLowerCase().includes('create') ||
          textToRun.toLowerCase().includes('build') ||
          textToRun.toLowerCase().includes('generate') ||
          textToRun.toLowerCase().includes('interactive') ||
          textToRun.toLowerCase().includes('dataset') ||
          textToRun.toLowerCase().includes('make')
        );

      if (isDashboardIntent) {
        const dashRes = await api.generateAiDashboard(
          activeDataset.id,
          textToRun,
          undefined,
          {
            columns: colsToUse,
            rows: rowsToUse,
            datasetName: activeDataset.name,
          }
        );

        if (dashRes && dashRes.plan) {
          const plan = dashRes.plan;
          const mappedVisuals = (plan.visuals || []).map((v: any, idx: number) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const isTrendOrDate = v.type === 'line_area' || v.type === 'stacked_area' || (v.categoryCol && /date|time|month|day|year/i.test(v.categoryCol));
            return {
              id: v.id || `vis_ai_${Date.now()}_${idx}`,
              title: v.title,
              type: v.type === 'clustered_bar' ? 'column' : (v.type || 'column'),
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
              span: 1,
              x: 16 + col * (480 + 16),
              y: 16 + row * (320 + 16),
              customWidth: 480,
              customHeight: 320,
              paletteId: plan.palette_id || 'v22',
            };
          });

          const mappedKpis = (plan.kpis || []).map((k: any, idx: number) => ({
            id: k.id || `kpi_ai_${Date.now()}_${idx}`,
            title: k.title,
            column: k.column,
            aggFunc: k.aggFunc || 'sum',
            subtitle: k.subtitle || 'Calculated Metric',
            accentColor: k.accentColor || (idx === 0 ? '#10B981' : idx === 1 ? '#0D9488' : idx === 2 ? '#FB923C' : '#0284C7'),
          }));

          const fullDashboardState = {
            dashboardTitle: plan.dashboard_title || `${activeDataset.name} Executive Dashboard`,
            visuals: mappedVisuals,
            kpiCards: mappedKpis,
            slicerColumns: plan.slicer_columns || [],
            paletteId: (plan.palette_id as any) || 'v22',
          };

          try {
            if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
              const raw = window.localStorage.getItem('stepsheet_dashboards_v3');
              const parsed = raw ? JSON.parse(raw) : {};
              const entry = {
                ...fullDashboardState,
                pages: [{
                  id: 'page_1',
                  name: 'Executive Overview',
                  datasetId: activeDataset.id,
                  ...fullDashboardState,
                }],
                activePageId: 'page_1',
              };
              parsed[activeDataset.id] = entry;
              parsed['default'] = entry;
              if (storeState.selectedDataset?.id) {
                parsed[storeState.selectedDataset.id] = entry;
              }
              window.localStorage.setItem('stepsheet_dashboards_v3', JSON.stringify(parsed));
            }
          } catch (e) {
            console.error('Failed to save generated dashboard to storage', e);
          }

          const assistantMsg: ChatMessage = {
            id: `msg_ai_${Date.now()}`,
            role: 'assistant',
            content: `✨ **Interactive Glassmorphic Dashboard Generated!**\n\nI have created a complete executive dashboard for **${activeDataset.name}** featuring **${mappedKpis.length} Glassmorphism KPI cards**, **${mappedVisuals.length} interactive visuals** (focus column bars, line/area trends, category breakdowns), and dynamic slicers (${(plan.slicer_columns || []).join(', ')}). Click below to open and interact with it!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            dashboardPlan: fullDashboardState,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          return;
        }
      }

      const res = await api.executeChatQuery(
        activeDataset.id,
        textToRun,
        undefined,
        {
          columns: colsToUse,
          rows: rowsToUse,
          datasetName: activeDataset.name,
        }
      );

      const assistantMsg: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        role: 'assistant',
        content: res.explanation || 'Here is the analysis based on your query.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        response: res,
        viewMode: 'split',
        showSql: false,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsgText = err.message || 'Failed to analyze data.';
      const assistantErrorMsg: ChatMessage = {
        id: `msg_ai_err_${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an issue analyzing this query: ${errorMsgText}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: errorMsgText,
      };
      setMessages((prev) => [...prev, assistantErrorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertAsNewSheet = (resp: any, qTitle?: string) => {
    if (!resp || !resp.rows || resp.rows.length === 0) return;

    const newId = `analysis_${Date.now()}`;
    const newName = `Analysis - ${(qTitle || resp.explanation || 'Data').slice(0, 20)}`;
    const cols = resp.columns.map((c: string) => ({
      name: c,
      data_type: typeof resp.rows[0]?.[c] === 'number' ? 'float' : 'text',
      physical_type: typeof resp.rows[0]?.[c] === 'number' ? 'DOUBLE' : 'VARCHAR',
    }));

    const newDs: any = {
      id: newId,
      name: newName,
      original_filename: `${newName}.csv`,
      file_format: 'csv',
      row_count: resp.rows.length,
      column_count: resp.columns.length,
      schema_metadata: cols,
      rows: resp.rows,
    };

    useWorkbenchStore.setState((prev) => ({
      datasets: [newDs, ...prev.datasets],
      selectedDataset: newDs,
      columns: cols,
      rows: resp.rows,
      allRows: resp.rows,
      totalRows: resp.rows.length,
    }));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#FAF9F8] rounded-2xl shadow-2xl border border-[#D4D4D4] w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden text-[#201F1E]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#EDEBE9] bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0078D4] to-[#107C41] flex items-center justify-center text-white shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#201F1E]">Chat with Data</h2>
                <span className="px-2 py-0.5 bg-[#E6F2EB] text-[#107C41] text-[10px] font-bold rounded-full">
                  DuckDB In-Memory
                </span>
              </div>
              <p className="text-[11px] text-[#605E5C]">
                Continuous conversational assistant. Ask questions one by one.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {datasets.length > 1 && (
              <select
                aria-label="Active Analysis Dataset"
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="text-xs border border-[#D4D4D4] rounded-lg px-2.5 py-1.5 bg-white font-medium shadow-xs"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count || 0} rows)
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleClearHistory}
              title="Clear chat history"
              className="p-1.5 rounded-lg text-[#605E5C] hover:text-[#201F1E] hover:bg-black/5 transition flex items-center gap-1 text-xs font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#605E5C] hover:text-[#201F1E] hover:bg-black/5 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Target Dataset Scope Bar */}
        {activeDataset && (
          <div className="px-6 py-2 bg-[#F3F2F1] border-b border-[#EDEBE9] flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2 font-medium text-[#323130]">
              <Database className="w-3.5 h-3.5 text-[#0078D4]" />
              <span>Target: <strong>{activeDataset.name}</strong> ({activeDataset.row_count || 0} rows)</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(activeDataset.schema_metadata || []).slice(0, 6).map((col: any) => (
                <span
                  key={col.name}
                  className="px-2 py-0.5 bg-white border border-[#E1DFDD] rounded-md text-[10px] text-[#605E5C]"
                >
                  {col.name}
                </span>
              ))}
              {(activeDataset.schema_metadata || []).length > 6 && (
                <span className="text-[10px] text-[#8A8886]">
                  +{(activeDataset.schema_metadata || []).length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Chat Messages Conversation Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end gap-2.5 max-w-2xl ml-auto">
                  <div className="flex flex-col items-end gap-1">
                    <div className="bg-[#0078D4] text-white px-4 py-2.5 rounded-2xl rounded-tr-xs shadow-xs text-xs font-medium leading-relaxed">
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-[#8A8886] pr-1">{msg.timestamp}</span>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#005A9E] text-white flex items-center justify-center shrink-0 text-xs shadow-xs">
                    <User className="w-4 h-4" />
                  </div>
                </div>
              );
            }

            // Assistant Response Card
            const resp = msg.response;
            const currentView = msg.viewMode || 'split';

            return (
              <div key={msg.id} className="flex justify-start gap-3 max-w-3xl mr-auto">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#107C41] to-[#0078D4] text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>

                <div className="flex-1 bg-white border border-[#E1DFDD] rounded-2xl rounded-tl-xs p-4 shadow-sm space-y-4">
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-[#F3F2F1] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#201F1E]">StepSheet Assistant</span>
                      {resp && (
                        <span className="text-[10px] px-2 py-0.5 bg-[#EFF6FC] text-[#0078D4] rounded-full font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {resp.latency_ms}ms
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#8A8886]">{msg.timestamp}</span>
                  </div>

                  {/* Text Explanation */}
                  <div className="text-xs text-[#201F1E] font-medium leading-relaxed">
                    {resp ? (
                      <p>{resp.explanation}</p>
                    ) : (
                      <p className="whitespace-pre-line">{msg.content}</p>
                    )}
                  </div>

                  {/* Error State */}
                  {msg.error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{msg.error}</span>
                    </div>
                  )}

                  {/* Generated Interactive Dashboard Preview Card */}
                  {msg.dashboardPlan && (
                    <div className="space-y-3 pt-2">
                      <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-xs">
                              <Sparkles className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-800">
                                {msg.dashboardPlan.dashboardTitle}
                              </h4>
                              <p className="text-[11px] text-slate-600">
                                Glassmorphism V22 • {msg.dashboardPlan.kpiCards.length} KPIs • {msg.dashboardPlan.visuals.length} Visuals • {msg.dashboardPlan.slicerColumns.length} Slicers
                              </p>
                            </div>
                          </div>
                          {onOpenDashboard && (
                            <button
                              type="button"
                              onClick={onOpenDashboard}
                              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95"
                            >
                              <BarChart3 className="w-4 h-4" />
                              Open Generated Dashboard
                            </button>
                          )}
                        </div>

                        {/* KPI Grid Preview */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {msg.dashboardPlan.kpiCards.map((kpi: any, kIdx: number) => (
                            <div key={kIdx} className="bg-white/80 border border-white/60 p-2.5 rounded-xl backdrop-blur-md shadow-2xs">
                              <span className="text-[10px] uppercase font-bold text-slate-400 truncate block">
                                {kpi.title}
                              </span>
                              <div className="text-sm font-black text-slate-800">
                                {kpi.aggFunc === 'distinct_count' ? 'Distinct Count' : kpi.aggFunc.toUpperCase()}
                              </div>
                              <span className="text-[10px] text-emerald-600 font-semibold truncate block">
                                {kpi.column}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Visuals Summary List */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {msg.dashboardPlan.visuals.map((vis: any, vIdx: number) => (
                            <div key={vIdx} className="bg-white/70 border border-emerald-100 px-3 py-2 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-semibold text-slate-700 truncate">{vis.title}</span>
                              </div>
                              <span className="text-[10px] uppercase font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                {vis.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Calculated Analytical Result Block */}
                  {resp && resp.rows && resp.rows.length > 0 && (
                    <div className="space-y-3 pt-1">
                      {/* View Mode Toggle Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F9F9F8] p-1.5 rounded-xl border border-[#EDEBE9]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleViewMode(msg.id, 'split')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition ${
                              currentView === 'split' ? 'bg-white shadow-xs text-[#0078D4]' : 'text-[#605E5C] hover:text-[#201F1E]'
                            }`}
                          >
                            Split View
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleViewMode(msg.id, 'chart')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition flex items-center gap-1 ${
                              currentView === 'chart' ? 'bg-white shadow-xs text-[#0078D4]' : 'text-[#605E5C] hover:text-[#201F1E]'
                            }`}
                          >
                            <BarChart3 className="w-3 h-3" /> Chart
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleViewMode(msg.id, 'table')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition flex items-center gap-1 ${
                              currentView === 'table' ? 'bg-white shadow-xs text-[#0078D4]' : 'text-[#605E5C] hover:text-[#201F1E]'
                            }`}
                          >
                            <TableIcon className="w-3 h-3" /> Table
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleInsertAsNewSheet(resp, resp.explanation)}
                            className="px-2.5 py-1 bg-[#107C41] hover:bg-[#0E6C38] text-white text-[11px] font-semibold rounded-lg shadow-xs flex items-center gap-1 transition"
                          >
                            <PlusCircle className="w-3 h-3" />
                            Insert as New Sheet
                          </button>
                          {onOpenDashboard && (
                            <button
                              type="button"
                              onClick={onOpenDashboard}
                              className="px-2.5 py-1 border border-[#0078D4] text-[#0078D4] hover:bg-[#0078D4]/10 text-[11px] font-semibold rounded-lg flex items-center gap-1 transition"
                            >
                              <BarChart3 className="w-3 h-3" />
                              Open in Dashboard
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Chart Visual Preview Component */}
                      {(currentView === 'split' || currentView === 'chart') && resp.chart && (
                        <div className="p-3.5 bg-white border border-[#E1DFDD] rounded-xl shadow-xs space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[#323130]">
                            <div className="flex items-center gap-1.5">
                              <BarChart3 className="w-3.5 h-3.5 text-[#0078D4]" />
                              <span>{resp.chart.y} by {resp.chart.x}</span>
                            </div>
                            <span className="text-[10px] font-bold text-[#8A8886] uppercase tracking-wider">
                              {resp.chart.type === 'line' ? 'Trend Line' : 'Horizontal Bar'}
                            </span>
                          </div>

                          {resp.chart.type === 'line' ? (
                            // SVG Line Area Chart
                            <div className="h-40 w-full pt-2">
                              {(() => {
                                const items = resp.rows;
                                const xKey = resp.chart.x;
                                const yKey = resp.chart.y;
                                const nums = items.map((r: any) => Number(getRowVal(r, yKey)) || 0);
                                const maxVal = Math.max(1, ...nums);
                                const minVal = Math.min(0, ...nums);
                                const range = maxVal - minVal || 1;
                                const width = 600;
                                const height = 130;
                                const padX = 40;
                                const padY = 20;
                                const stepX = (width - padX * 2) / Math.max(1, items.length - 1);

                                const points = items.map((r: any, idx: number) => {
                                  const x = padX + idx * stepX;
                                  const val = Number(getRowVal(r, yKey)) || 0;
                                  const y = height - padY - ((val - minVal) / range) * (height - padY * 2);
                                  return { x, y, label: String(getRowVal(r, xKey) ?? ''), val };
                                });

                                const pathD = points.map((p: any, idx: number) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                                const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`;

                                return (
                                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                                    <defs>
                                      <linearGradient id={`grad_${msg.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0078D4" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#0078D4" stopOpacity="0.0" />
                                      </linearGradient>
                                    </defs>
                                    <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#EDEBE9" strokeWidth="1" />
                                    <path d={areaD} fill={`url(#grad_${msg.id})`} />
                                    <path d={pathD} fill="none" stroke="#0078D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {points.map((p: any, i: number) => (
                                      <g key={i}>
                                        <circle cx={p.x} cy={p.y} r="3.5" fill="#0078D4" stroke="#FFFFFF" strokeWidth="1.5" />
                                        <text x={p.x} y={height - 4} fontSize="9" textAnchor="middle" fill="#605E5C">
                                          {p.label.length > 7 ? p.label.slice(0, 6) + '…' : p.label}
                                        </text>
                                        <text x={p.x} y={p.y - 7} fontSize="9" textAnchor="middle" fontWeight="bold" fill="#201F1E">
                                          {p.val >= 1000 ? `${(p.val / 1000).toFixed(1)}k` : p.val}
                                        </text>
                                      </g>
                                    ))}
                                  </svg>
                                );
                              })()}
                            </div>
                          ) : (
                            // Progress Bar Distribution
                            <div className="space-y-2 pt-1">
                              {(() => {
                                const items = resp.rows.slice(0, 7);
                                const xKey = resp.chart.x;
                                const yKey = resp.chart.y;
                                const nums = items.map((r: any) => Number(getRowVal(r, yKey)) || 0);
                                const maxVal = Math.max(1, ...nums);

                                return items.map((row: any, idx: number) => {
                                  const val = Number(getRowVal(row, yKey)) || 0;
                                  const pct = Math.max(5, Math.round((val / maxVal) * 100));
                                  const label = String(getRowVal(row, xKey) ?? '(Blank)');
                                  return (
                                    <div key={idx} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-[11px] text-[#201F1E]">
                                        <span className="font-medium truncate max-w-[200px]" title={label}>{label}</span>
                                        <span className="font-bold text-[#0078D4]">{val.toLocaleString()}</span>
                                      </div>
                                      <div className="w-full bg-[#EDEBE9] h-2.5 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-[#0078D4] to-[#107C41] rounded-full transition-all duration-500"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interactive Result Table */}
                      {(currentView === 'split' || currentView === 'table') && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[#323130] px-0.5">
                            <span className="flex items-center gap-1">
                              <TableIcon className="w-3 h-3 text-[#107C41]" /> Calculated Result Table ({resp.row_count} rows)
                            </span>
                          </div>
                          <div className="border border-[#E1DFDD] rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-inner bg-white">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead className="bg-[#F3F2F1] text-[#323130] font-semibold sticky top-0 border-b border-[#E1DFDD]">
                                <tr>
                                  {resp.columns.map((c: string) => (
                                    <th key={c} className="p-2 border-r border-[#EDEBE9] last:border-r-0">
                                      {c}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#EDEBE9] bg-white">
                                {resp.rows.map((row: any, rIdx: number) => (
                                  <tr key={rIdx} className="hover:bg-[#F9F9F8]">
                                    {resp.columns.map((c: string) => {
                                      const cellVal = getRowVal(row, c);
                                      return (
                                        <td key={c} className="p-2 border-r border-[#EDEBE9] last:border-r-0 text-[#201F1E]">
                                          {cellVal !== null && cellVal !== undefined ? String(cellVal) : '—'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Collapsible DuckDB SQL Trace */}
                      <div className="border border-[#EDEBE9] rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleToggleSql(msg.id)}
                          className="w-full px-3 py-1.5 bg-[#F9F9F8] text-[11px] font-medium text-[#605E5C] flex items-center justify-between hover:bg-[#F3F2F1] transition"
                        >
                          <div className="flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-[#0078D4]" />
                            <span>DuckDB Parameterised SQL Query</span>
                          </div>
                          {msg.showSql ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {msg.showSql && (
                          <div className="p-2.5 bg-[#1E1E1E] text-green-400 font-mono text-[11px] overflow-x-auto">
                            <code>{resp.query_trace}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading Indicator in Chat Stream */}
          {loading && (
            <div className="flex items-center gap-3 mr-auto max-w-sm">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#0078D4] to-[#107C41] text-white flex items-center justify-center shrink-0 animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-white border border-[#E1DFDD] px-4 py-2.5 rounded-2xl rounded-tl-xs shadow-xs text-xs text-[#605E5C] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#0078D4] animate-ping" />
                <span>Computing analytical query in DuckDB...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts Shelf */}
        <div className="px-6 py-2 bg-white border-t border-[#EDEBE9]">
          <div className="flex items-center justify-between pb-1 text-[11px] font-bold text-[#605E5C]">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#0078D4]" /> Suggested Analytical Questions
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {suggestedPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSubmit(p)}
                disabled={loading}
                className="px-2.5 py-1 bg-[#F3F2F1] hover:bg-[#EFF6FC] hover:border-[#0078D4] border border-transparent text-[#201F1E] text-[11px] rounded-full whitespace-nowrap transition shadow-xs disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Sticky Input Bar */}
        <div className="p-4 border-t border-[#EDEBE9] bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const inputEl = e.currentTarget.querySelector('input');
              const val = (inputEl ? inputEl.value : prompt) || prompt;
              handleSubmit(val);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              placeholder="Ask a question about this data (e.g. 'What are the top 5 products by revenue?')..."
              className="flex-1 text-xs sm:text-sm border border-[#D4D4D4] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-transparent bg-white shadow-xs disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-4 py-2.5 bg-[#0078D4] hover:bg-[#106EBE] text-white font-semibold rounded-xl text-xs sm:text-sm shadow-xs flex items-center gap-1.5 disabled:opacity-50 transition"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
