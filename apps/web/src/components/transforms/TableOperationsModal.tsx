import React, { useState, useMemo } from 'react';
import {
  X,
  Columns,
  Rows,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Heading,
  Trash2,
  Check,
  Award,
  Shuffle,
  Eye,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepDefinition } from '../../types/steps';

interface TableOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'columns' | 'headers' | 'rows' | 'top_bottom' | 'transpose';
}

type OperationTab = 'columns' | 'headers' | 'rows' | 'top_bottom' | 'transpose';

export const TableOperationsModal: React.FC<TableOperationsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'columns',
}) => {
  const { selectedDataset, columns, rows, addStep } = useWorkbenchStore();

  const [activeTab, setActiveTab] = useState<OperationTab>(initialTab);

  // --- 1. Columns state (Remove / Keep / Reorder) ---
  const [columnAction, setColumnAction] = useState<'remove' | 'keep' | 'reorder'>('remove');
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [colSearch, setColSearch] = useState('');
  const [reorderedList, setReorderedList] = useState<string[]>([]);

  // Initialize reorderedList when columns change or modal opens
  React.useEffect(() => {
    if (columns.length > 0) {
      setReorderedList(columns.map((c) => c.name));
    }
  }, [columns, isOpen]);

  const filteredColumns = useMemo(() => {
    if (!colSearch.trim()) return columns;
    return columns.filter((c) => c.name.toLowerCase().includes(colSearch.toLowerCase()));
  }, [columns, colSearch]);

  const toggleColumnSelection = (colName: string) => {
    setSelectedCols((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  };

  const handleSelectAllCols = () => {
    setSelectedCols(filteredColumns.map((c) => c.name));
  };

  const handleClearAllCols = () => {
    setSelectedCols([]);
  };

  const handleInvertCols = () => {
    const set = new Set(selectedCols);
    setSelectedCols(filteredColumns.map((c) => c.name).filter((n) => !set.has(n)));
  };

  const moveCol = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= reorderedList.length) return;
    const next = [...reorderedList];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    setReorderedList(next);
  };

  const moveColToBoundary = (index: number, to: 'top' | 'bottom') => {
    const next = [...reorderedList];
    const [moved] = next.splice(index, 1);
    if (to === 'top') {
      next.unshift(moved);
    } else {
      next.push(moved);
    }
    setReorderedList(next);
  };

  // --- 2. Remove Rows state ---
  const [rowMode, setRowMode] = useState<
    'top_n' | 'bottom_n' | 'keep_top_n' | 'keep_bottom_n' | 'blank_rows'
  >('top_n');
  const [rowCount, setRowCount] = useState<number>(1);

  // --- 3. Top / Bottom N state ---
  const [topBottomCol, setTopBottomCol] = useState(columns[0]?.name || '');
  const [topBottomMode, setTopBottomMode] = useState<'top' | 'bottom'>('top');
  const [topBottomN, setTopBottomN] = useState<number>(10);

  // Sync topBottomCol when columns change
  React.useEffect(() => {
    if (columns.length > 0 && !topBottomCol) {
      setTopBottomCol(columns[0].name);
    }
  }, [columns]);

  // --- Apply handlers ---
  const handleApplyColumns = async () => {
    if (columnAction === 'reorder') {
      const step: StepDefinition = {
        id: `step-reorder-${Date.now()}`,
        type: 'reorder_columns',
        label: `Reorder ${reorderedList.length} Columns`,
        enabled: true,
        params: {
          column_order: reorderedList,
        },
      };
      await addStep(step);
    } else {
      if (selectedCols.length === 0) return;
      const isKeep = columnAction === 'keep';
      const step: StepDefinition = {
        id: `step-remove-col-${Date.now()}`,
        type: 'remove_column',
        label: isKeep
          ? `Keep Columns (${selectedCols.join(', ')})`
          : `Remove Columns (${selectedCols.join(', ')})`,
        enabled: true,
        params: {
          columns: selectedCols,
          keep_selected: isKeep,
        },
      };
      await addStep(step);
    }
    onClose();
  };

  const handleApplyPromoteHeaders = async () => {
    const step: StepDefinition = {
      id: `step-promote-headers-${Date.now()}`,
      type: 'promote_headers',
      label: 'Use First Row as Headers',
      enabled: true,
      params: {},
    };
    await addStep(step);
    onClose();
  };

  const handleApplyRemoveRows = async () => {
    const labels: Record<string, string> = {
      top_n: `Remove Top ${rowCount} Rows`,
      bottom_n: `Remove Bottom ${rowCount} Rows`,
      keep_top_n: `Keep Top ${rowCount} Rows`,
      keep_bottom_n: `Keep Bottom ${rowCount} Rows`,
      blank_rows: 'Remove Blank Rows',
    };
    const step: StepDefinition = {
      id: `step-remove-rows-${Date.now()}`,
      type: 'remove_rows',
      label: labels[rowMode] || `Remove Rows (${rowMode})`,
      enabled: true,
      params: {
        mode: rowMode,
        count: rowCount,
      },
    };
    await addStep(step);
    onClose();
  };

  const handleApplyTopBottomN = async () => {
    if (!topBottomCol) return;
    const step: StepDefinition = {
      id: `step-top-bottom-n-${Date.now()}`,
      type: 'top_bottom_n',
      label: `Keep ${topBottomMode === 'top' ? 'Top' : 'Bottom'} ${topBottomN} by [${topBottomCol}]`,
      enabled: true,
      params: {
        column: topBottomCol,
        mode: topBottomMode,
        n: topBottomN,
      },
    };
    await addStep(step);
    onClose();
  };

  const handleApplyTranspose = async () => {
    const step: StepDefinition = {
      id: `step-transpose-${Date.now()}`,
      type: 'transpose',
      label: 'Transpose Table (Swap Rows and Columns)',
      enabled: true,
      params: {},
    };
    await addStep(step);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#D4D4D4] rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden text-[#212121]">
        {/* Header */}
        <div className="h-10 px-4 bg-[#217346] text-white flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Columns size={16} />
            <span className="font-semibold text-xs tracking-wide">
              Table Structure &amp; Reshape Studio
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#107C10] rounded text-white/90 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="bg-[#F3F3F3] border-b border-[#D4D4D4] px-4 flex gap-1 select-none shrink-0 pt-2">
          <button
            onClick={() => setActiveTab('columns')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t flex items-center gap-1.5 border-t border-x transition-colors ${
              activeTab === 'columns'
                ? 'bg-white border-[#D4D4D4] text-[#217346] border-b-transparent translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#605E5C] hover:text-[#212121]'
            }`}
          >
            <Columns size={13} /> Manage Columns
          </button>
          <button
            onClick={() => setActiveTab('headers')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t flex items-center gap-1.5 border-t border-x transition-colors ${
              activeTab === 'headers'
                ? 'bg-white border-[#D4D4D4] text-[#217346] border-b-transparent translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#605E5C] hover:text-[#212121]'
            }`}
          >
            <Heading size={13} /> Promote Headers
          </button>
          <button
            onClick={() => setActiveTab('rows')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t flex items-center gap-1.5 border-t border-x transition-colors ${
              activeTab === 'rows'
                ? 'bg-white border-[#D4D4D4] text-[#217346] border-b-transparent translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#605E5C] hover:text-[#212121]'
            }`}
          >
            <Rows size={13} /> Remove Rows
          </button>
          <button
            onClick={() => setActiveTab('top_bottom')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t flex items-center gap-1.5 border-t border-x transition-colors ${
              activeTab === 'top_bottom'
                ? 'bg-white border-[#D4D4D4] text-[#217346] border-b-transparent translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#605E5C] hover:text-[#212121]'
            }`}
          >
            <Award size={13} /> Top / Bottom N
          </button>
          <button
            onClick={() => setActiveTab('transpose')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t flex items-center gap-1.5 border-t border-x transition-colors ${
              activeTab === 'transpose'
                ? 'bg-white border-[#D4D4D4] text-[#217346] border-b-transparent translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#605E5C] hover:text-[#212121]'
            }`}
          >
            <Shuffle size={13} /> Transpose Table
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 p-5 overflow-y-auto bg-white">
          {/* TAB 1: MANAGE COLUMNS (REMOVE, KEEP, REORDER) */}
          {activeTab === 'columns' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-[#212121]">Choose Column Operation</h3>
                <p className="text-xs text-[#605E5C]">
                  Select whether to drop unwanted columns, keep only a subset, or rearrange column sequence.
                </p>
              </div>

              {/* Action Radios */}
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#F9F9F9] border border-[#EDEBE9] rounded">
                <button
                  type="button"
                  onClick={() => setColumnAction('remove')}
                  className={`py-2 px-3 rounded text-xs font-semibold text-center transition-all ${
                    columnAction === 'remove'
                      ? 'bg-white text-[#C53929] shadow-xs border border-[#C53929]/30'
                      : 'text-[#605E5C] hover:bg-white/60'
                  }`}
                >
                  Remove Columns
                </button>
                <button
                  type="button"
                  onClick={() => setColumnAction('keep')}
                  className={`py-2 px-3 rounded text-xs font-semibold text-center transition-all ${
                    columnAction === 'keep'
                      ? 'bg-white text-[#217346] shadow-xs border border-[#217346]/30'
                      : 'text-[#605E5C] hover:bg-white/60'
                  }`}
                >
                  Keep Only Columns
                </button>
                <button
                  type="button"
                  onClick={() => setColumnAction('reorder')}
                  className={`py-2 px-3 rounded text-xs font-semibold text-center transition-all ${
                    columnAction === 'reorder'
                      ? 'bg-white text-[#0078D4] shadow-xs border border-[#0078D4]/30'
                      : 'text-[#605E5C] hover:bg-white/60'
                  }`}
                >
                  Reorder Columns
                </button>
              </div>

              {/* REMOVE / KEEP VIEW */}
              {columnAction !== 'reorder' ? (
                <div className="space-y-2 border border-[#D4D4D4] rounded p-3 bg-[#FAFAFA]">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={colSearch}
                      onChange={(e) => setColSearch(e.target.value)}
                      placeholder="Search columns..."
                      className="px-2.5 py-1 text-xs border border-[#D4D4D4] rounded bg-white w-48 focus:outline-none focus:border-[#217346]"
                    />
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={handleSelectAllCols}
                        className="px-2 py-0.5 border border-[#D4D4D4] rounded bg-white hover:bg-[#F3F3F3] text-[#323130]"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllCols}
                        className="px-2 py-0.5 border border-[#D4D4D4] rounded bg-white hover:bg-[#F3F3F3] text-[#323130]"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={handleInvertCols}
                        className="px-2 py-0.5 border border-[#D4D4D4] rounded bg-white hover:bg-[#F3F3F3] text-[#323130]"
                      >
                        Invert
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 bg-white border border-[#EDEBE9] rounded p-2">
                    {filteredColumns.map((col) => {
                      const isChecked = selectedCols.includes(col.name);
                      return (
                        <label
                          key={col.name}
                          className="flex items-center gap-2 p-1.5 hover:bg-[#F9F9F9] rounded cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleColumnSelection(col.name)}
                            className="rounded border-[#D4D4D4] text-[#217346] focus:ring-0"
                          />
                          <span className="font-medium text-[#212121]">{col.name}</span>
                          <span className="text-[10px] text-[#605E5C] font-mono ml-auto">
                            {col.data_type || (col as any).type}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="text-xs text-[#605E5C]">
                    {columnAction === 'remove' ? (
                      <span>
                        Will <strong className="text-[#C53929]">remove</strong> {selectedCols.length}{' '}
                        of {columns.length} columns.
                      </span>
                    ) : (
                      <span>
                        Will <strong className="text-[#217346]">keep</strong> {selectedCols.length}{' '}
                        of {columns.length} columns (and drop the remaining).
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* REORDER VIEW */
                <div className="space-y-2 border border-[#D4D4D4] rounded p-3 bg-[#FAFAFA]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#323130]">
                      Current Column Order (Click Up/Down to Arrange)
                    </span>
                    <button
                      type="button"
                      onClick={() => setReorderedList(columns.map((c) => c.name))}
                      className="text-[11px] text-[#0078D4] hover:underline"
                    >
                      Reset Order
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1 bg-white border border-[#EDEBE9] rounded p-2">
                    {reorderedList.map((colName, idx) => (
                      <div
                        key={colName}
                        className="flex items-center justify-between p-1.5 bg-[#FAFAFA] border border-[#EDEBE9] rounded text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#605E5C] w-5 text-right">
                            {idx + 1}.
                          </span>
                          <span className="font-medium text-[#212121]">{colName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveCol(idx, 'up')}
                            className="p-1 hover:bg-[#EDEBE9] rounded disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === reorderedList.length - 1}
                            onClick={() => moveCol(idx, 'down')}
                            className="p-1 hover:bg-[#EDEBE9] rounded disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROMOTE HEADERS */}
          {activeTab === 'headers' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-[#212121]">Use First Row as Headers</h3>
                <p className="text-xs text-[#605E5C]">
                  Promote the values in the first data row into column headers. Ideal for raw CSVs or Excel
                  spreadsheets where the header was imported as data.
                </p>
              </div>

              {/* Preview Comparison */}
              <div className="border border-[#D4D4D4] rounded p-3 bg-[#FAFAFA] space-y-3">
                <div className="text-xs font-semibold text-[#323130] flex items-center gap-1.5">
                  <Eye size={13} className="text-[#217346]" /> Current First Row Preview
                </div>

                {rows.length > 0 ? (
                  <div className="overflow-x-auto border border-[#EDEBE9] rounded bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F3F3F3] text-[#605E5C] font-mono text-[11px] border-b border-[#EDEBE9]">
                        <tr>
                          {columns.slice(0, 6).map((c) => (
                            <th key={c.name} className="p-2 font-normal">
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-[#E6F2EB] font-bold text-[#217346]">
                          {columns.slice(0, 6).map((c) => (
                            <td key={c.name} className="p-2 border-r border-[#EDEBE9] last:border-r-0">
                              {String(rows[0][c.name] ?? '(empty)')}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-[#8A8886] italic">No rows in current dataset.</p>
                )}

                <div className="p-2.5 bg-[#E6F2EB] border border-[#217346]/20 rounded text-xs text-[#107C10] flex items-start gap-2">
                  <Check size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Action Result:</strong> The highlighted row above will become the new column
                    headers, and row #1 will be removed from data records.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REMOVE ROWS */}
          {activeTab === 'rows' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-[#212121]">Remove or Keep Rows</h3>
                <p className="text-xs text-[#605E5C]">
                  Clean out leading or trailing metadata lines, remove empty blank rows, or retain a specific slice.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: 'top_n',
                    label: 'Remove Top N Rows',
                    desc: 'Drop leading rows (e.g. report titles, metadata lines)',
                    needsCount: true,
                  },
                  {
                    id: 'bottom_n',
                    label: 'Remove Bottom N Rows',
                    desc: 'Drop trailing rows (e.g. summary totals, footer notes)',
                    needsCount: true,
                  },
                  {
                    id: 'keep_top_n',
                    label: 'Keep Top N Rows',
                    desc: 'Retain only the first N records and drop the rest',
                    needsCount: true,
                  },
                  {
                    id: 'keep_bottom_n',
                    label: 'Keep Bottom N Rows',
                    desc: 'Retain only the last N records and drop the rest',
                    needsCount: true,
                  },
                  {
                    id: 'blank_rows',
                    label: 'Remove Blank Rows',
                    desc: 'Drop rows where every single column is empty or null',
                    needsCount: false,
                  },
                ].map((opt) => {
                  const isSel = rowMode === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setRowMode(opt.id as any)}
                      className={`p-3 rounded border cursor-pointer transition-all ${
                        isSel
                          ? 'bg-[#E6F2EB] border-[#217346] shadow-xs'
                          : 'bg-[#FAFAFA] border-[#D4D4D4] hover:border-[#8A8886]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isSel ? 'text-[#217346]' : 'text-[#212121]'}`}>
                          {opt.label}
                        </span>
                        <input
                          type="radio"
                          checked={isSel}
                          onChange={() => setRowMode(opt.id as any)}
                          className="text-[#217346] focus:ring-0"
                        />
                      </div>
                      <p className="text-[11px] text-[#605E5C] mt-1">{opt.desc}</p>
                    </div>
                  );
                })}
              </div>

              {rowMode !== 'blank_rows' && (
                <div className="p-3 bg-[#FAFAFA] border border-[#D4D4D4] rounded flex items-center gap-3">
                  <label className="text-xs font-semibold text-[#323130]">Number of Rows (N):</label>
                  <input
                    type="number"
                    min={1}
                    value={rowCount}
                    onChange={(e) => setRowCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-2.5 py-1 text-xs border border-[#D4D4D4] rounded bg-white font-mono focus:outline-none focus:border-[#217346]"
                  />
                  <span className="text-xs text-[#605E5C]">
                    Total rows currently in table: <strong>{rows.length}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TOP / BOTTOM N */}
          {activeTab === 'top_bottom' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-[#212121]">Top / Bottom N Analysis</h3>
                <p className="text-xs text-[#605E5C]">
                  Filter and sort down to the highest or lowest performing records by any metric column.
                </p>
              </div>

              <div className="border border-[#D4D4D4] rounded p-4 bg-[#FAFAFA] space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#605E5C] block mb-1">Direction</label>
                    <select
                      value={topBottomMode}
                      onChange={(e) => setTopBottomMode(e.target.value as any)}
                      className="w-full bg-white border border-[#D4D4D4] rounded px-2.5 py-1.5 text-xs text-[#212121] font-semibold"
                    >
                      <option value="top">Top (Highest Values)</option>
                      <option value="bottom">Bottom (Lowest Values)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#605E5C] block mb-1">
                      Number of Records (N)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={topBottomN}
                      onChange={(e) => setTopBottomN(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-white border border-[#D4D4D4] rounded px-2.5 py-1.5 text-xs text-[#212121] font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#605E5C] block mb-1">Rank By Column</label>
                    <select
                      value={topBottomCol}
                      onChange={(e) => setTopBottomCol(e.target.value)}
                      className="w-full bg-white border border-[#D4D4D4] rounded px-2.5 py-1.5 text-xs text-[#212121] font-medium"
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.data_type || (c as any).type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#EDEBE9] rounded text-xs text-[#323130]">
                  <strong>Summary:</strong> Will sort entire table by{' '}
                  <code className="font-mono font-semibold text-[#217346]">[{topBottomCol}]</code> in{' '}
                  <strong>{topBottomMode === 'top' ? 'descending' : 'ascending'}</strong> order and keep
                  only the <strong>{topBottomN}</strong> records.
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRANSPOSE */}
          {activeTab === 'transpose' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold text-[#212121]">Transpose Table</h3>
                <p className="text-xs text-[#605E5C]">
                  Rotate the entire table 90 degrees: columns become rows, and rows become columns.
                </p>
              </div>

              <div className="border border-[#D4D4D4] rounded p-4 bg-[#FAFAFA] space-y-3">
                <div className="flex items-center gap-4 text-xs">
                  <div className="p-3 bg-white border border-[#EDEBE9] rounded flex-1 text-center">
                    <span className="font-bold text-[#605E5C] block mb-1">Current Matrix</span>
                    <span className="font-mono text-[#212121]">
                      {rows.length} rows &times; {columns.length} columns
                    </span>
                  </div>
                  <Shuffle className="text-[#217346]" size={20} />
                  <div className="p-3 bg-[#E6F2EB] border border-[#217346]/30 rounded flex-1 text-center">
                    <span className="font-bold text-[#217346] block mb-1">Transposed Matrix</span>
                    <span className="font-mono text-[#217346] font-semibold">
                      {columns.length} rows &times; {rows.length + 1} columns
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#FFF4CE] border border-[#FED95B] rounded text-xs text-[#7A5200] flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    A new <code className="font-mono font-bold">Attribute</code> column will be created
                    containing the original column headers, followed by columns for each row (
                    <code className="font-mono">Row_1, Row_2, ...</code>).
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-4 bg-[#F3F3F3] border-t border-[#D4D4D4] flex items-center justify-between shrink-0 select-none">
          <span className="text-xs text-[#605E5C]">
            Step will be added to the applied steps pipeline and can be undone or edited at any time.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-[#444444] hover:bg-[#E6E6E6] border border-[#D4D4D4] rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'columns') handleApplyColumns();
                else if (activeTab === 'headers') handleApplyPromoteHeaders();
                else if (activeTab === 'rows') handleApplyRemoveRows();
                else if (activeTab === 'top_bottom') handleApplyTopBottomN();
                else if (activeTab === 'transpose') handleApplyTranspose();
              }}
              disabled={
                (activeTab === 'columns' &&
                  columnAction !== 'reorder' &&
                  selectedCols.length === 0) ||
                (activeTab === 'top_bottom' && !topBottomCol)
              }
              className="px-5 py-1.5 text-xs bg-[#217346] hover:bg-[#107C10] text-white font-semibold rounded shadow-sm disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <Check size={14} /> Apply Transformation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
