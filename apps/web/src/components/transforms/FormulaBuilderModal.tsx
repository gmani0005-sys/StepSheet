import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Calculator,
  Sparkles,
  Type,
  Calendar,
  Layers,
  BarChart2,
  HelpCircle,
  Check,
  Play,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { StepDefinition } from '../../types/steps';

interface FormulaBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialColumnName?: string;
}

type FunctionCategory = 'All' | 'Math' | 'Logical' | 'Text' | 'Date' | 'Lookup' | 'Statistical';

interface FunctionDoc {
  name: string;
  category: FunctionCategory;
  syntax: string;
  desc: string;
  example: string;
  args: Array<{ name: string; desc: string; type: 'column' | 'number' | 'text' | 'any' }>;
}

const FUNCTION_CATALOG: FunctionDoc[] = [
  // Math
  {
    name: 'ROUND',
    category: 'Math',
    syntax: 'ROUND(number, decimals)',
    desc: 'Rounds a number to a specified number of decimal digits.',
    example: 'ROUND([Price], 2)',
    args: [
      { name: 'number', desc: 'The numeric value or column to round', type: 'number' },
      { name: 'decimals', desc: 'Number of decimal places (default 0)', type: 'number' },
    ],
  },
  {
    name: 'ROUNDUP',
    category: 'Math',
    syntax: 'ROUNDUP(number, decimals)',
    desc: 'Rounds a number up, away from zero.',
    example: 'ROUNDUP([Cost], 0)',
    args: [
      { name: 'number', desc: 'Number to round up', type: 'number' },
      { name: 'decimals', desc: 'Decimal places', type: 'number' },
    ],
  },
  {
    name: 'ROUNDDOWN',
    category: 'Math',
    syntax: 'ROUNDDOWN(number, decimals)',
    desc: 'Rounds a number down, towards zero.',
    example: 'ROUNDDOWN([Cost], 0)',
    args: [
      { name: 'number', desc: 'Number to round down', type: 'number' },
      { name: 'decimals', desc: 'Decimal places', type: 'number' },
    ],
  },
  {
    name: 'ABS',
    category: 'Math',
    syntax: 'ABS(number)',
    desc: 'Returns the absolute (positive) value of a number.',
    example: 'ABS([Variance])',
    args: [{ name: 'number', desc: 'Number or column', type: 'number' }],
  },
  {
    name: 'INT',
    category: 'Math',
    syntax: 'INT(number)',
    desc: 'Rounds a number down to the nearest integer.',
    example: 'INT([Amount])',
    args: [{ name: 'number', desc: 'Number or column', type: 'number' }],
  },
  {
    name: 'MOD',
    category: 'Math',
    syntax: 'MOD(number, divisor)',
    desc: 'Returns remainder after number is divided by divisor.',
    example: 'MOD([Quantity], 12)',
    args: [
      { name: 'number', desc: 'Dividend', type: 'number' },
      { name: 'divisor', desc: 'Divisor', type: 'number' },
    ],
  },
  {
    name: 'POWER',
    category: 'Math',
    syntax: 'POWER(number, power)',
    desc: 'Returns result of a number raised to a power.',
    example: 'POWER([Rate], 2)',
    args: [
      { name: 'number', desc: 'Base number', type: 'number' },
      { name: 'power', desc: 'Exponent', type: 'number' },
    ],
  },
  {
    name: 'SQRT',
    category: 'Math',
    syntax: 'SQRT(number)',
    desc: 'Returns square root of a positive number.',
    example: 'SQRT([Area])',
    args: [{ name: 'number', desc: 'Positive number', type: 'number' }],
  },
  {
    name: 'PRODUCT',
    category: 'Math',
    syntax: 'PRODUCT(val1, val2, ...)',
    desc: 'Multiplies all given numbers.',
    example: 'PRODUCT([Quantity], [UnitPrice])',
    args: [
      { name: 'val1', desc: 'First factor', type: 'number' },
      { name: 'val2', desc: 'Second factor', type: 'number' },
    ],
  },

  // Logical
  {
    name: 'IF',
    category: 'Logical',
    syntax: 'IF(condition, value_if_true, value_if_false)',
    desc: 'Checks condition; returns one value if TRUE, another if FALSE.',
    example: 'IF([Sales] > 1000, "High", "Standard")',
    args: [
      { name: 'condition', desc: 'Logical test (e.g. [Sales] > 1000)', type: 'any' },
      { name: 'value_if_true', desc: 'Output if condition is met', type: 'any' },
      { name: 'value_if_false', desc: 'Output if condition is not met', type: 'any' },
    ],
  },
  {
    name: 'IFS',
    category: 'Logical',
    syntax: 'IFS(cond1, val1, cond2, val2, ...)',
    desc: 'Evaluates multiple conditions and returns corresponding value for first TRUE.',
    example: 'IFS([Score] >= 90, "A", [Score] >= 80, "B", true, "C")',
    args: [
      { name: 'cond1', desc: 'First condition', type: 'any' },
      { name: 'val1', desc: 'Result if cond1 is true', type: 'any' },
    ],
  },
  {
    name: 'SWITCH',
    category: 'Logical',
    syntax: 'SWITCH(expression, val1, res1, val2, res2, default)',
    desc: 'Evaluates expression against list of values and returns first match.',
    example: 'SWITCH([Region], "US", "Domestic", "EMEA", "International", "Other")',
    args: [
      { name: 'expression', desc: 'Column or value to evaluate', type: 'column' },
      { name: 'val1', desc: 'First value to match', type: 'any' },
      { name: 'res1', desc: 'Result if matched', type: 'any' },
    ],
  },
  {
    name: 'AND',
    category: 'Logical',
    syntax: 'AND(logical1, logical2, ...)',
    desc: 'Returns TRUE if all arguments are TRUE.',
    example: 'IF(AND([Age] >= 18, [Active] = true), "Eligible", "Ineligible")',
    args: [{ name: 'logical1', desc: 'First condition', type: 'any' }],
  },
  {
    name: 'OR',
    category: 'Logical',
    syntax: 'OR(logical1, logical2, ...)',
    desc: 'Returns TRUE if any argument is TRUE.',
    example: 'IF(OR([Status] = "Pending", [Status] = "Hold"), "Review", "Proceed")',
    args: [{ name: 'logical1', desc: 'First condition', type: 'any' }],
  },
  {
    name: 'NOT',
    category: 'Logical',
    syntax: 'NOT(logical)',
    desc: 'Reverses logical value of argument.',
    example: 'NOT([IsLocked])',
    args: [{ name: 'logical', desc: 'Condition', type: 'any' }],
  },
  {
    name: 'IFERROR',
    category: 'Logical',
    syntax: 'IFERROR(value, value_if_error)',
    desc: 'Returns value_if_error if calculation results in an error/null.',
    example: 'IFERROR([Price] / [Qty], 0)',
    args: [
      { name: 'value', desc: 'Value or formula', type: 'any' },
      { name: 'value_if_error', desc: 'Fallback value', type: 'any' },
    ],
  },

  // Text
  {
    name: 'CONCAT',
    category: 'Text',
    syntax: 'CONCAT(text1, text2, ...)',
    desc: 'Combines text from multiple ranges and/or strings.',
    example: 'CONCAT([FirstName], " ", [LastName])',
    args: [
      { name: 'text1', desc: 'First text string or column', type: 'any' },
      { name: 'text2', desc: 'Second text string or column', type: 'any' },
    ],
  },
  {
    name: 'TEXTJOIN',
    category: 'Text',
    syntax: 'TEXTJOIN(delimiter, ignore_empty, text1, text2, ...)',
    desc: 'Combines text with a delimiter, optionally ignoring empty cells.',
    example: 'TEXTJOIN(" - ", true, [City], [State], [Country])',
    args: [
      { name: 'delimiter', desc: 'Delimiter string e.g. " - "', type: 'text' },
      { name: 'ignore_empty', desc: 'true or false', type: 'any' },
      { name: 'text1', desc: 'Items to combine', type: 'any' },
    ],
  },
  {
    name: 'UPPER',
    category: 'Text',
    syntax: 'UPPER(text)',
    desc: 'Converts all letters in a text string to uppercase.',
    example: 'UPPER([Category])',
    args: [{ name: 'text', desc: 'Text or column', type: 'text' }],
  },
  {
    name: 'LOWER',
    category: 'Text',
    syntax: 'LOWER(text)',
    desc: 'Converts all letters in a text string to lowercase.',
    example: 'LOWER([Email])',
    args: [{ name: 'text', desc: 'Text or column', type: 'text' }],
  },
  {
    name: 'PROPER',
    category: 'Text',
    syntax: 'PROPER(text)',
    desc: 'Capitalizes the first letter in each word of a text string.',
    example: 'PROPER([FullName])',
    args: [{ name: 'text', desc: 'Text or column', type: 'text' }],
  },
  {
    name: 'TRIM',
    category: 'Text',
    syntax: 'TRIM(text)',
    desc: 'Removes all leading and trailing spaces from text.',
    example: 'TRIM([VendorName])',
    args: [{ name: 'text', desc: 'Text or column', type: 'text' }],
  },
  {
    name: 'CLEAN',
    category: 'Text',
    syntax: 'CLEAN(text)',
    desc: 'Removes all non-printable ASCII characters from text.',
    example: 'CLEAN([RawNotes])',
    args: [{ name: 'text', desc: 'Text to clean', type: 'text' }],
  },
  {
    name: 'LEN',
    category: 'Text',
    syntax: 'LEN(text)',
    desc: 'Returns the number of characters in a text string.',
    example: 'LEN([PostalCode])',
    args: [{ name: 'text', desc: 'Text string or column', type: 'text' }],
  },
  {
    name: 'LEFT',
    category: 'Text',
    syntax: 'LEFT(text, num_chars)',
    desc: 'Returns specified number of characters from the start of a string.',
    example: 'LEFT([SKU], 3)',
    args: [
      { name: 'text', desc: 'Text or column', type: 'text' },
      { name: 'num_chars', desc: 'Number of characters to extract', type: 'number' },
    ],
  },
  {
    name: 'RIGHT',
    category: 'Text',
    syntax: 'RIGHT(text, num_chars)',
    desc: 'Returns specified number of characters from the end of a string.',
    example: 'RIGHT([AccountNo], 4)',
    args: [
      { name: 'text', desc: 'Text or column', type: 'text' },
      { name: 'num_chars', desc: 'Number of characters to extract', type: 'number' },
    ],
  },
  {
    name: 'MID',
    category: 'Text',
    syntax: 'MID(text, start_num, num_chars)',
    desc: 'Returns characters from middle of string given starting position and length.',
    example: 'MID([TrackingCode], 3, 5)',
    args: [
      { name: 'text', desc: 'Source text', type: 'text' },
      { name: 'start_num', desc: 'Start position (1-based)', type: 'number' },
      { name: 'num_chars', desc: 'Number of characters', type: 'number' },
    ],
  },
  {
    name: 'TEXTBEFORE',
    category: 'Text',
    syntax: 'TEXTBEFORE(text, delimiter)',
    desc: 'Returns text that occurs before a given delimiter.',
    example: 'TEXTBEFORE([Email], "@")',
    args: [
      { name: 'text', desc: 'Source text', type: 'text' },
      { name: 'delimiter', desc: 'Delimiter substring', type: 'text' },
    ],
  },
  {
    name: 'TEXTAFTER',
    category: 'Text',
    syntax: 'TEXTAFTER(text, delimiter)',
    desc: 'Returns text that occurs after a given delimiter.',
    example: 'TEXTAFTER([Email], "@")',
    args: [
      { name: 'text', desc: 'Source text', type: 'text' },
      { name: 'delimiter', desc: 'Delimiter substring', type: 'text' },
    ],
  },
  {
    name: 'SUBSTITUTE',
    category: 'Text',
    syntax: 'SUBSTITUTE(text, old_text, new_text)',
    desc: 'Substitutes new text for old text in a text string.',
    example: 'SUBSTITUTE([Phone], "-", "")',
    args: [
      { name: 'text', desc: 'Source text', type: 'text' },
      { name: 'old_text', desc: 'Text to be replaced', type: 'text' },
      { name: 'new_text', desc: 'Replacement text', type: 'text' },
    ],
  },

  // Date
  {
    name: 'YEAR',
    category: 'Date',
    syntax: 'YEAR(serial_number)',
    desc: 'Returns the year corresponding to a date.',
    example: 'YEAR([OrderDate])',
    args: [{ name: 'serial_number', desc: 'Date column or date string', type: 'column' }],
  },
  {
    name: 'MONTH',
    category: 'Date',
    syntax: 'MONTH(serial_number)',
    desc: 'Returns month (1 to 12) corresponding to a date.',
    example: 'MONTH([OrderDate])',
    args: [{ name: 'serial_number', desc: 'Date column', type: 'column' }],
  },
  {
    name: 'DAY',
    category: 'Date',
    syntax: 'DAY(serial_number)',
    desc: 'Returns day of the month (1 to 31).',
    example: 'DAY([OrderDate])',
    args: [{ name: 'serial_number', desc: 'Date column', type: 'column' }],
  },
  {
    name: 'WEEKDAY',
    category: 'Date',
    syntax: 'WEEKDAY(serial_number)',
    desc: 'Returns day of the week (1=Sunday, 2=Monday, ..., 7=Saturday).',
    example: 'WEEKDAY([OrderDate])',
    args: [{ name: 'serial_number', desc: 'Date column', type: 'column' }],
  },
  {
    name: 'TODAY',
    category: 'Date',
    syntax: 'TODAY()',
    desc: 'Returns the current date in YYYY-MM-DD format.',
    example: 'TODAY()',
    args: [],
  },
  {
    name: 'EOMONTH',
    category: 'Date',
    syntax: 'EOMONTH(start_date, months)',
    desc: 'Returns last day of the month indicated by number of months offset.',
    example: 'EOMONTH([InvoiceDate], 0)',
    args: [
      { name: 'start_date', desc: 'Base date column', type: 'column' },
      { name: 'months', desc: 'Number of months ahead (0 for current month)', type: 'number' },
    ],
  },
  {
    name: 'EDATE',
    category: 'Date',
    syntax: 'EDATE(start_date, months)',
    desc: 'Returns date that is specified number of months before or after start date.',
    example: 'EDATE([StartDate], 12)',
    args: [
      { name: 'start_date', desc: 'Base date column', type: 'column' },
      { name: 'months', desc: 'Number of months to add/subtract', type: 'number' },
    ],
  },
  {
    name: 'DATEDIF',
    category: 'Date',
    syntax: 'DATEDIF(start_date, end_date, unit)',
    desc: 'Calculates number of days ("d"), months ("m"), or years ("y") between two dates.',
    example: 'DATEDIF([HireDate], TODAY(), "y")',
    args: [
      { name: 'start_date', desc: 'Earlier date', type: 'column' },
      { name: 'end_date', desc: 'Later date', type: 'column' },
      { name: 'unit', desc: '"d", "m", or "y"', type: 'text' },
    ],
  },
  {
    name: 'NETWORKDAYS',
    category: 'Date',
    syntax: 'NETWORKDAYS(start_date, end_date)',
    desc: 'Returns number of whole working days (Monday-Friday) between two dates.',
    example: 'NETWORKDAYS([ShipDate], [DeliveryDate])',
    args: [
      { name: 'start_date', desc: 'Start date column', type: 'column' },
      { name: 'end_date', desc: 'End date column', type: 'column' },
    ],
  },

  // Statistical
  {
    name: 'AVERAGE',
    category: 'Statistical',
    syntax: 'AVERAGE(num1, num2, ...)',
    desc: 'Returns the arithmetic mean of arguments.',
    example: 'AVERAGE([Score1], [Score2], [Score3])',
    args: [{ name: 'num1', desc: 'Numbers or columns', type: 'number' }],
  },
  {
    name: 'MEDIAN',
    category: 'Statistical',
    syntax: 'MEDIAN(num1, num2, ...)',
    desc: 'Returns median of numbers.',
    example: 'MEDIAN([Salary], [Bonus])',
    args: [{ name: 'num1', desc: 'Numbers or columns', type: 'number' }],
  },
  {
    name: 'MIN',
    category: 'Statistical',
    syntax: 'MIN(num1, num2, ...)',
    desc: 'Returns minimum value among arguments.',
    example: 'MIN([Q1], [Q2], [Q3], [Q4])',
    args: [{ name: 'num1', desc: 'Numbers or columns', type: 'number' }],
  },
  {
    name: 'MAX',
    category: 'Statistical',
    syntax: 'MAX(num1, num2, ...)',
    desc: 'Returns maximum value among arguments.',
    example: 'MAX([Bid], [Ask])',
    args: [{ name: 'num1', desc: 'Numbers or columns', type: 'number' }],
  },
];

export const FormulaBuilderModal: React.FC<FormulaBuilderModalProps> = ({
  isOpen,
  onClose,
  initialColumnName,
}) => {
  const { selectedDataset, columns, rows, addStep } = useWorkbenchStore();

  const [columnName, setColumnName] = useState(initialColumnName || 'Calculated_Col');
  const [formula, setFormula] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FunctionCategory>('All');
  const [selectedFunc, setSelectedFunc] = useState<FunctionDoc>(FUNCTION_CATALOG[0]);

  const categories: FunctionCategory[] = ['All', 'Math', 'Logical', 'Text', 'Date', 'Statistical'];

  const filteredFunctions = useMemo(() => {
    return FUNCTION_CATALOG.filter((fn) => {
      const matchCat = activeCategory === 'All' || fn.category === activeCategory;
      const matchSearch =
        !searchQuery.trim() ||
        fn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fn.desc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery]);

  // Insert token into formula
  const insertToken = (token: string) => {
    setFormula((prev) => (prev ? `${prev} ${token}` : token));
  };

  // Live preview evaluation on first 3 rows
  const previewRows = useMemo(() => {
    if (!rows || rows.length === 0 || !formula.trim()) return [];
    const sample = rows.slice(0, 3);
    return sample.map((r) => {
      try {
        let jsExpr = formula;
        // bracketed cols
        jsExpr = jsExpr.replace(/\[([^\]]+)\]/g, (_, col) => JSON.stringify(r[col] ?? ''));
        // string concat
        jsExpr = jsExpr.replace(/&/g, '+');
        // evaluate in sandbox
        const fn = new Function(...Object.keys(r), `"use strict"; return (${jsExpr});`);
        return fn(...Object.values(r));
      } catch {
        return '—';
      }
    });
  }, [formula, rows]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!columnName.trim() || !formula.trim()) return;

    const newStep: StepDefinition = {
      id: `step-formula-${Date.now()}`,
      type: 'custom_column',
      label: `Add ${columnName.trim()} (${formula.trim()})`,
      enabled: true,
      params: {
        new_column: columnName.trim(),
        formula: formula.trim(),
      },
    };

    await addStep(newStep);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#D4D4D4] rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden text-[#212121]">
        {/* Header */}
        <div className="h-10 px-4 bg-[#217346] text-white flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Calculator size={16} />
            <span className="font-semibold text-xs tracking-wide">
              Guided Formula &amp; Calculated Column Builder
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#107C10] rounded text-white/90 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleApply} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 grid grid-cols-12 overflow-hidden">
            {/* Left Column: Function Catalog & Categories (5 cols) */}
            <div className="col-span-5 border-r border-[#D4D4D4] bg-[#F9F9F9] flex flex-col overflow-hidden">
              {/* Search Bar */}
              <div className="p-2.5 border-b border-[#E1DFDD] bg-white">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-[#8A8886]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search functions (e.g. IF, TRIM, ROUND)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F3F3F3] border border-[#D4D4D4] rounded focus:bg-white focus:outline-none focus:border-[#217346]"
                  />
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                        activeCategory === cat
                          ? 'bg-[#217346] text-white font-semibold'
                          : 'bg-[#EDEBE9] text-[#605E5C] hover:bg-[#E1DFDD]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Function List */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {filteredFunctions.map((fn) => {
                  const isSel = selectedFunc.name === fn.name;
                  return (
                    <div
                      key={fn.name}
                      onClick={() => setSelectedFunc(fn)}
                      className={`p-2 rounded cursor-pointer border transition-all ${
                        isSel
                          ? 'bg-[#E6F2EB] border-[#217346] text-[#217346]'
                          : 'bg-white border-[#EDEBE9] hover:border-[#8A8886] text-[#212121]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs font-mono">{fn.name}</span>
                        <span className="text-[10px] text-[#605E5C] bg-[#EDEBE9] px-1.5 py-0.5 rounded">
                          {fn.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#605E5C] mt-0.5 line-clamp-1">{fn.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Selected Function Details Box */}
              {selectedFunc && (
                <div className="p-3 bg-white border-t border-[#D4D4D4] shrink-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-[#217346]">
                      {selectedFunc.syntax}
                    </span>
                    <button
                      type="button"
                      onClick={() => insertToken(`${selectedFunc.name}()`)}
                      className="px-2 py-0.5 text-[11px] bg-[#217346] text-white rounded hover:bg-[#107C10] font-semibold flex items-center gap-1 shadow-xs"
                    >
                      <Plus size={11} /> Insert Function
                    </button>
                  </div>
                  <p className="text-xs text-[#323130]">{selectedFunc.desc}</p>
                  <div className="text-[11px] bg-[#F3F3F3] p-1.5 rounded border border-[#EDEBE9]">
                    <span className="font-semibold text-[#605E5C]">Example: </span>
                    <code className="font-mono text-[#217346] font-semibold">{selectedFunc.example}</code>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Expression Editor, Column Pickers, Preview (7 cols) */}
            <div className="col-span-7 p-4 flex flex-col space-y-3.5 bg-white overflow-y-auto">
              {/* Output Column Name */}
              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1">
                  New Calculated Column Name
                </label>
                <input
                  type="text"
                  required
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value)}
                  placeholder="e.g. Total_Amount, Cleaned_Email, Profit_Margin"
                  className="w-full bg-[#FAFAFA] border border-[#D4D4D4] rounded px-3 py-1.5 text-xs text-[#212121] focus:bg-white focus:outline-none focus:border-[#217346]"
                />
              </div>

              {/* Interactive Column Picker Chips */}
              <div>
                <label className="text-xs font-semibold text-[#605E5C] block mb-1">
                  Click to Insert Column Tokens
                </label>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 bg-[#F9F9F9] border border-[#EDEBE9] rounded">
                  {columns.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => insertToken(`[${c.name}]`)}
                      className="px-2 py-0.5 bg-white border border-[#D4D4D4] hover:border-[#217346] hover:bg-[#E6F2EB] text-[#212121] text-[11px] rounded transition-all font-mono shadow-2xs"
                    >
                      [{c.name}]
                    </button>
                  ))}
                </div>
              </div>

              {/* Operator Quick Buttons */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-[#605E5C] mr-1">Operators:</span>
                {['+', '-', '*', '/', '&', '>', '>=', '<', '<=', '=', '<>'].map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => insertToken(op)}
                    className="px-2 py-0.5 bg-[#F3F3F3] hover:bg-[#E1DFDD] border border-[#D4D4D4] text-xs font-mono font-bold rounded"
                  >
                    {op}
                  </button>
                ))}
              </div>

              {/* Formula Expression Textarea */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#212121]">
                    Formula Expression (Excel Syntax)
                  </label>
                  <span className="text-[11px] text-[#605E5C]">
                    Use standard Excel functions, column names in <code className="font-mono">[ ]</code>
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="e.g. IF([Sales] > 500, [Price] * [Qty], 0) or CONCAT(UPPER([Region]), '-', [ID])"
                  className="w-full font-mono text-xs p-2.5 bg-[#FAFAFA] border border-[#D4D4D4] rounded focus:bg-white focus:outline-none focus:border-[#217346] leading-relaxed resize-none"
                />
              </div>

              {/* Live Sample Row Preview */}
              <div className="bg-[#F9F9F9] border border-[#EDEBE9] rounded p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-[#323130] uppercase tracking-wider flex items-center gap-1">
                    <Play size={10} className="text-[#217346]" /> Sample Row Evaluation Preview
                  </span>
                  <span className="text-[10px] text-[#605E5C]">
                    {selectedDataset?.name || 'Current Sheet'}
                  </span>
                </div>
                <div className="space-y-1">
                  {previewRows.length > 0 ? (
                    previewRows.map((val, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-[#EDEBE9]"
                      >
                        <span className="text-[#605E5C] font-mono text-[11px]">Row #{idx + 1}</span>
                        <span className="font-mono font-semibold text-[#217346]">
                          {String(val)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-[#8A8886] italic py-1 text-center">
                      Type a formula above to see instant row-by-row outputs.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="h-12 px-4 bg-[#F3F3F3] border-t border-[#D4D4D4] flex items-center justify-between shrink-0 select-none">
            <span className="text-xs text-[#605E5C]">
              Transformation will be recorded in step history and can be edited or undone.
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
                type="submit"
                disabled={!columnName.trim() || !formula.trim()}
                className="px-5 py-1.5 text-xs bg-[#217346] hover:bg-[#107C10] text-white font-semibold rounded shadow-sm disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                <Check size={14} /> Add Calculated Column
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
