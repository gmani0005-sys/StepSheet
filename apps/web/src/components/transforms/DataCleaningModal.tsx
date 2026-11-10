import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  CopyMinus,
  AlertCircle,
  HelpCircle,
  Check,
  Type,
  Calculator,
  Calendar,
  Layers,
  ArrowRight,
  Plus,
  Trash2,
  Filter,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepDefinition } from '../../types/steps';

interface DataCleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'duplicates' | 'missing' | 'text' | 'numeric' | 'date';
}

type CleanTab = 'duplicates' | 'missing' | 'text' | 'numeric' | 'date';

export const DataCleaningModal: React.FC<DataCleaningModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'duplicates',
}) => {
  const { selectedDataset, columns, rows, addStep } = useWorkbenchStore();

  const [activeTab, setActiveTab] = useState<CleanTab>(initialTab);

  // --- Duplicate state ---
  const [dedupCols, setDedupCols] = useState<string[]>([]);
  const [dedupKeep, setDedupKeep] = useState<'first' | 'last' | 'duplicates_only'>('first');

  // --- Missing/Null state ---
  const [missingCol, setMissingCol] = useState(columns[0]?.name || '');
  const [missingAction, setMissingAction] = useState<'replace' | 'impute_mean' | 'impute_median' | 'remove_rows'>('replace');
  const [missingReplaceVal, setMissingReplaceVal] = useState('0');

  // --- Text clean state ---
  const [textCol, setTextCol] = useState(columns[0]?.name || '');
  const [textAction, setTextAction] = useState<'trim' | 'clean_spaces' | 'clean' | 'upper' | 'lower' | 'proper' | 'mapping'>('trim');
  const [mappingPairs, setMappingPairs] = useState<Array<{ from: string; to: string }>>([
    { from: '', to: '' },
  ]);

  // --- Numeric clean state ---
  const [numCol, setNumCol] = useState(columns[0]?.name || '');
  const [numAction, setNumAction] = useState<'clean_numeric' | 'round' | 'outliers'>('clean_numeric');
  const [roundDecimals, setRoundDecimals] = useState(2);
  const [outlierAction, setOutlierAction] = useState<'flag' | 'filter'>('flag');

  // --- Date clean state ---
  const [dateCol, setDateCol] = useState(columns[0]?.name || '');
  const [dateAction, setDateAction] = useState<'extract_part' | 'eomonth' | 'networkdays'>('extract_part');
  const [datePart, setDatePart] = useState('year');
  const [secondDateCol, setSecondDateCol] = useState(columns[1]?.name || columns[0]?.name || '');

  // Pre-select first column if empty
  React.useEffect(() => {
    if (columns.length > 0) {
      if (!missingCol) setMissingCol(columns[0].name);
      if (!textCol) setTextCol(columns[0].name);
      if (!numCol) setNumCol(columns[0].name);
      if (!dateCol) setDateCol(columns[0].name);
      if (!secondDateCol) setSecondDateCol(columns[1]?.name || columns[0].name);
    }
  }, [columns]);

  // Duplicate preview count
  const duplicateStats = useMemo(() => {
    if (!rows || rows.length === 0) return { duplicateCount: 0, totalCount: 0 };
    const keys = dedupCols.length > 0 ? dedupCols : columns.map((c) => c.name);
    const seen = new Set<string>();
    let dupes = 0;
    rows.forEach((r) => {
      const k = keys.map((c) => String(r[c] ?? '')).join('||');
      if (seen.has(k)) dupes++;
      else seen.add(k);
    });
    return { duplicateCount: dupes, totalCount: rows.length };
  }, [rows, dedupCols, columns]);

  const handleApply = async () => {
    let step: StepDefinition | null = null;

    if (activeTab === 'duplicates') {
      const keepLabel =
        dedupKeep === 'duplicates_only'
          ? 'Retain only duplicate rows'
          : `Remove duplicates (keep ${dedupKeep})`;
      step = {
        id: `step-dedup-${Date.now()}`,
        type: 'remove_duplicates',
        label: `${keepLabel} on ${dedupCols.length > 0 ? dedupCols.join(', ') : 'all columns'}`,
        enabled: true,
        params: {
          columns: dedupCols,
          keep_mode: dedupKeep,
          keep: dedupKeep === 'last' ? 'last' : 'first',
        },
      };
    } else if (activeTab === 'missing') {
      if (missingAction === 'replace') {
        step = {
          id: `step-replace-null-${Date.now()}`,
          type: 'replace_values',
          label: `Replace nulls in ${missingCol} with "${missingReplaceVal}"`,
          enabled: true,
          params: {
            column: missingCol,
            search_value: '',
            replace_value: missingReplaceVal,
            match_type: 'is_null',
          },
        };
      } else if (missingAction === 'impute_mean') {
        step = {
          id: `step-impute-mean-${Date.now()}`,
          type: 'impute_missing',
          label: `Impute missing in ${missingCol} with Column Mean (Average)`,
          enabled: true,
          params: {
            column: missingCol,
            strategy: 'mean',
          },
        };
      } else if (missingAction === 'impute_median') {
        step = {
          id: `step-impute-median-${Date.now()}`,
          type: 'impute_missing',
          label: `Impute missing in ${missingCol} with Column Median`,
          enabled: true,
          params: {
            column: missingCol,
            strategy: 'median',
          },
        };
      } else if (missingAction === 'remove_rows') {
        step = {
          id: `step-filter-notnull-${Date.now()}`,
          type: 'filter_rows',
          label: `Remove rows with blank ${missingCol}`,
          enabled: true,
          params: {
            column: missingCol,
            operator: 'is_not_null',
          },
        };
      }
    } else if (activeTab === 'text') {
      if (textAction === 'mapping') {
        const validPairs = mappingPairs.filter((p) => p.from.trim() !== '');
        step = {
          id: `step-std-vals-${Date.now()}`,
          type: 'standardize_values',
          label: `Standardize categories in ${textCol} (${validPairs.length} mappings)`,
          enabled: true,
          params: {
            column: textCol,
            mappings: validPairs,
          },
        };
      } else {
        step = {
          id: `step-text-clean-${Date.now()}`,
          type: 'text_transform',
          label: `Text ${textAction} on ${textCol}`,
          enabled: true,
          params: {
            column: textCol,
            operation: textAction,
          },
        };
      }
    } else if (activeTab === 'numeric') {
      if (numAction === 'clean_numeric') {
        step = {
          id: `step-clean-num-${Date.now()}`,
          type: 'math_transform',
          label: `Clean currency & symbols in ${numCol} to numeric`,
          enabled: true,
          params: {
            column1: numCol,
            operation: 'clean_numeric',
            output_column: numCol,
          },
        };
      } else if (numAction === 'round') {
        step = {
          id: `step-round-${Date.now()}`,
          type: 'math_transform',
          label: `Round ${numCol} to ${roundDecimals} decimals`,
          enabled: true,
          params: {
            column1: numCol,
            operation: 'round',
            decimals: roundDecimals,
            output_column: numCol,
          },
        };
      } else if (numAction === 'outliers') {
        step = {
          id: `step-outlier-${Date.now()}`,
          type: 'flag_outliers',
          label: `${outlierAction === 'filter' ? 'Filter out' : 'Flag'} IQR outliers in ${numCol}`,
          enabled: true,
          params: {
            column: numCol,
            output_column: `${numCol}_is_outlier`,
            filter_outliers: outlierAction === 'filter',
          },
        };
      }
    } else if (activeTab === 'date') {
      if (dateAction === 'networkdays') {
        step = {
          id: `step-netdays-${Date.now()}`,
          type: 'date_transform',
          label: `Calculate working days between ${dateCol} and ${secondDateCol}`,
          enabled: true,
          params: {
            column: dateCol,
            second_column: secondDateCol,
            operation: 'networkdays',
            output_column: `working_days_${dateCol}_${secondDateCol}`,
          },
        };
      } else if (dateAction === 'eomonth') {
        step = {
          id: `step-eom-${Date.now()}`,
          type: 'date_transform',
          label: `End of month for ${dateCol}`,
          enabled: true,
          params: {
            column: dateCol,
            operation: 'eomonth',
            output_column: `${dateCol}_eomonth`,
          },
        };
      } else {
        step = {
          id: `step-datepart-${Date.now()}`,
          type: 'date_transform',
          label: `Extract ${datePart} from ${dateCol}`,
          enabled: true,
          params: {
            column: dateCol,
            operation: 'extract_part',
            date_part: datePart,
            output_column: `${dateCol}_${datePart}`,
          },
        };
      }
    }

    if (step) {
      await addStep(step);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#D4D4D4] rounded-lg shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-[#212121]">
        {/* Header */}
        <div className="h-10 px-4 bg-[#217346] text-white flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Sparkles size={16} />
            <span className="font-semibold text-xs tracking-wide">
              Excel Data Cleaning &amp; Hygiene Studio
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#107C10] rounded text-white/90 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#D4D4D4] bg-[#F3F3F3] px-3 pt-2 gap-1 shrink-0 select-none">
          {[
            { id: 'duplicates', label: 'Duplicates', icon: CopyMinus },
            { id: 'missing', label: 'Missing / Nulls', icon: Filter },
            { id: 'text', label: 'Text Cleaning', icon: Type },
            { id: 'numeric', label: 'Numbers & Outliers', icon: Calculator },
            { id: 'date', label: 'Date & Time', icon: Calendar },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as CleanTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t border-t border-x transition-colors ${
                  isSel
                    ? 'bg-white text-[#217346] border-[#D4D4D4] border-b-2 border-b-[#217346] -mb-px shadow-xs'
                    : 'text-[#605E5C] border-transparent hover:text-[#212121] hover:bg-[#E6E6E6]'
                }`}
              >
                <Icon size={13} className={isSel ? 'text-[#217346]' : 'text-[#8A8886]'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* 1. DUPLICATES TAB */}
          {activeTab === 'duplicates' && (
            <div className="space-y-4">
              <div className="bg-[#F9F9F9] p-3 rounded border border-[#EDEBE9]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#212121]">
                    Duplicate Detection Summary
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded font-bold bg-[#E6F2EB] text-[#217346]">
                    {duplicateStats.duplicateCount} Duplicate Rows Found
                  </span>
                </div>
                <p className="text-[11px] text-[#605E5C] mt-1">
                  Select one or more key columns to identify duplicated records. If no columns are
                  checked, all columns will be checked across the table.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1.5">
                  Key Columns to Inspect for Duplicates
                </label>
                <div className="max-h-36 overflow-y-auto p-2 bg-[#FAFAFA] border border-[#D4D4D4] rounded grid grid-cols-2 gap-1">
                  {columns.map((c) => (
                    <label
                      key={c.name}
                      className="flex items-center gap-2 text-xs p-1 rounded hover:bg-[#E6E6E6] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={dedupCols.includes(c.name)}
                        onChange={(e) => {
                          if (e.target.checked) setDedupCols([...dedupCols, c.name]);
                          else setDedupCols(dedupCols.filter((x) => x !== c.name));
                        }}
                        className="rounded border-[#8A8886] text-[#217346] focus:ring-0"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1">
                  Deduplication Action &amp; Retention Rule
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 p-2 rounded border border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="dedup-keep"
                      checked={dedupKeep === 'first'}
                      onChange={() => setDedupKeep('first')}
                      className="text-[#217346] focus:ring-0"
                    />
                    <div>
                      <span className="font-semibold block">Keep First Occurrence</span>
                      <span className="text-[11px] text-[#605E5C]">
                        Retains the first record encountered and discards subsequent duplicates.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded border border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="dedup-keep"
                      checked={dedupKeep === 'last'}
                      onChange={() => setDedupKeep('last')}
                      className="text-[#217346] focus:ring-0"
                    />
                    <div>
                      <span className="font-semibold block">Keep Last Occurrence</span>
                      <span className="text-[11px] text-[#605E5C]">
                        Retains the newest/last record encountered and discards prior duplicates.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded border border-[#0078D4] bg-[#EFF6FC] hover:bg-white cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="dedup-keep"
                      checked={dedupKeep === 'duplicates_only'}
                      onChange={() => setDedupKeep('duplicates_only')}
                      className="text-[#0078D4] focus:ring-0"
                    />
                    <div>
                      <span className="font-semibold text-[#0078D4] block">
                        Audit Duplicates Only (Retain ONLY duplicate rows)
                      </span>
                      <span className="text-[11px] text-[#605E5C]">
                        Filters the dataset to inspect which rows have repeated keys without deleting them.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 2. MISSING / NULLS TAB */}
          {activeTab === 'missing' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1">
                  Target Column to Clean
                </label>
                <select
                  value={missingCol}
                  onChange={(e) => setMissingCol(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121] focus:bg-white focus:outline-none focus:border-[#217346]"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.data_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1.5">
                  Missing &amp; Blank Treatment Strategy
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMissingAction('replace')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      missingAction === 'replace'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Replace with User Value</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Specify 0, "Unknown", or default text.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMissingAction('impute_mean')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      missingAction === 'impute_mean'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Numeric Imputation: Mean</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Fills nulls with column average.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMissingAction('impute_median')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      missingAction === 'impute_median'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Numeric Imputation: Median</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Fills nulls with middle value (robust to outliers).
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMissingAction('remove_rows')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      missingAction === 'remove_rows'
                        ? 'border-[#C50F1F] bg-[#FDE7E9] text-[#C50F1F] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Drop Rows with Blanks</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Removes rows where this column is empty.
                    </span>
                  </button>
                </div>
              </div>

              {missingAction === 'replace' && (
                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Value to Replace Nulls/Blanks With
                  </label>
                  <input
                    type="text"
                    value={missingReplaceVal}
                    onChange={(e) => setMissingReplaceVal(e.target.value)}
                    placeholder='e.g. 0, "Unknown", "N/A"'
                    className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121] focus:bg-white focus:outline-none focus:border-[#217346]"
                  />
                </div>
              )}
            </div>
          )}

          {/* 3. TEXT CLEANING TAB */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1">
                  Text Column to Clean
                </label>
                <select
                  value={textCol}
                  onChange={(e) => setTextCol(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121] focus:bg-white focus:outline-none focus:border-[#217346]"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1.5">
                  Text Cleaning Operation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'trim', title: 'Trim Spaces', desc: 'Remove leading & trailing whitespace' },
                    { id: 'clean_spaces', title: 'Collapse Spaces', desc: 'Replace double/multiple spaces with 1 space' },
                    { id: 'clean', title: 'Clean Non-Printable', desc: 'Strip carriage returns, tabs, linebreaks' },
                    { id: 'upper', title: 'UPPERCASE', desc: 'Convert ALL letters to capitals' },
                    { id: 'lower', title: 'lowercase', desc: 'Convert ALL letters to small' },
                    { id: 'proper', title: 'Proper / Title Case', desc: 'Capitalize First Letter Of Each Word' },
                    { id: 'mapping', title: 'Standardize Categories', desc: 'Map aliases using a translation table' },
                  ].map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setTextAction(op.id as any)}
                      className={`p-2 rounded border text-left text-xs transition-all ${
                        textAction === op.id
                          ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                          : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                      }`}
                    >
                      <span className="font-bold block">{op.title}</span>
                      <span className="text-[10px] text-[#605E5C] block mt-0.5">{op.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {textAction === 'mapping' && (
                <div className="space-y-2 pt-2 border-t border-[#EDEBE9]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#212121]">
                      Category Standardization Mapping Table
                    </label>
                    <button
                      type="button"
                      onClick={() => setMappingPairs([...mappingPairs, { from: '', to: '' }])}
                      className="text-xs text-[#217346] hover:text-[#107C10] font-semibold flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Mapping Row
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {mappingPairs.map((pair, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={pair.from}
                          onChange={(e) => {
                            const next = [...mappingPairs];
                            next[idx].from = e.target.value;
                            setMappingPairs(next);
                          }}
                          placeholder="Source alias (e.g. U.S., USA)"
                          className="flex-1 bg-[#FAFAFA] border border-[#D4D4D4] rounded px-2 py-1 text-xs"
                        />
                        <ArrowRight size={13} className="text-[#8A8886] shrink-0" />
                        <input
                          type="text"
                          value={pair.to}
                          onChange={(e) => {
                            const next = [...mappingPairs];
                            next[idx].to = e.target.value;
                            setMappingPairs(next);
                          }}
                          placeholder="Standard value (e.g. United States)"
                          className="flex-1 bg-[#FAFAFA] border border-[#D4D4D4] rounded px-2 py-1 text-xs"
                        />
                        {mappingPairs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMappingPairs(mappingPairs.filter((_, i) => i !== idx))}
                            className="text-[#C50F1F] p-1 hover:bg-[#FDE7E9] rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. NUMBERS & OUTLIERS TAB */}
          {activeTab === 'numeric' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1">
                  Numeric Column to Clean
                </label>
                <select
                  value={numCol}
                  onChange={(e) => setNumCol(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121] focus:bg-white focus:outline-none focus:border-[#217346]"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.data_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1.5">
                  Numeric Cleaning Action
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNumAction('clean_numeric')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      numAction === 'clean_numeric'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Clean Currency &amp; Symbols</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Strip $, €, £, %, and commas; parse clean number.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNumAction('round')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      numAction === 'round'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Round Decimals</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Standardize decimal place precision.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNumAction('outliers')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      numAction === 'outliers'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">IQR Outlier Detection</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Flag or filter statistical outliers (1.5x IQR).
                    </span>
                  </button>
                </div>
              </div>

              {numAction === 'round' && (
                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Decimal Places
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={roundDecimals}
                    onChange={(e) => setRoundDecimals(Number(e.target.value))}
                    className="w-32 bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121]"
                  />
                </div>
              )}

              {numAction === 'outliers' && (
                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Outlier Treatment
                  </label>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="outlier-act"
                        checked={outlierAction === 'flag'}
                        onChange={() => setOutlierAction('flag')}
                        className="text-[#217346] focus:ring-0"
                      />
                      <span>Flag with True/False column</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="outlier-act"
                        checked={outlierAction === 'filter'}
                        onChange={() => setOutlierAction('filter')}
                        className="text-[#217346] focus:ring-0"
                      />
                      <span>Filter out outlier rows</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. DATE & TIME TAB */}
          {activeTab === 'date' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1">
                  Date Column
                </label>
                <select
                  value={dateCol}
                  onChange={(e) => setDateCol(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121] focus:bg-white focus:outline-none focus:border-[#217346]"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1.5">
                  Date Calculation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDateAction('extract_part')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      dateAction === 'extract_part'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Extract Date Part</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Year, Month, Quarter, Day, Weekday.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDateAction('eomonth')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      dateAction === 'eomonth'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">End of Month (EOMONTH)</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Last calendar date of the month.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDateAction('networkdays')}
                    className={`p-2.5 rounded border text-left text-xs transition-all ${
                      dateAction === 'networkdays'
                        ? 'border-[#217346] bg-[#E6F2EB] text-[#217346] font-semibold'
                        : 'border-[#D4D4D4] bg-[#FAFAFA] hover:bg-white'
                    }`}
                  >
                    <span className="font-bold block">Working Days (NETWORKDAYS)</span>
                    <span className="text-[11px] text-[#605E5C] block mt-0.5">
                      Workdays excluding Sat/Sun between 2 dates.
                    </span>
                  </button>
                </div>
              </div>

              {dateAction === 'extract_part' && (
                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    Component to Extract
                  </label>
                  <select
                    value={datePart}
                    onChange={(e) => setDatePart(e.target.value)}
                    className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121]"
                  >
                    <option value="year">Year (e.g. 2026)</option>
                    <option value="quarter">Quarter (1 to 4)</option>
                    <option value="month">Month Number (1 to 12)</option>
                    <option value="day">Day of Month (1 to 31)</option>
                    <option value="day_name">Day Name (e.g. Monday)</option>
                    <option value="weekday">Weekday Index (1 to 7)</option>
                  </select>
                </div>
              )}

              {dateAction === 'networkdays' && (
                <div>
                  <label className="text-xs font-semibold text-[#212121] block mb-1">
                    End / Second Date Column
                  </label>
                  <select
                    value={secondDateCol}
                    onChange={(e) => setSecondDateCol(e.target.value)}
                    className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121]"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-4 bg-[#F3F3F3] border-t border-[#D4D4D4] flex items-center justify-between shrink-0 select-none">
          <span className="text-xs text-[#605E5C]">
            Cleaning operations produce repeatable, non-destructive transformation steps.
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
              onClick={handleApply}
              className="px-5 py-1.5 text-xs bg-[#217346] hover:bg-[#107C10] text-white font-semibold rounded shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check size={14} /> Apply Cleaning Step
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
