import React, { useState } from 'react';
import { X, Check, Type, Code2 } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface TextTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TextTransformModal: React.FC<TextTransformModalProps> = ({ isOpen, onClose }) => {
  const { columns, addStep } = useWorkbenchStore();

  const [column, setColumn] = useState(columns[0]?.name || '');
  const [operation, setOperation] = useState<
    | 'trim'
    | 'clean'
    | 'upper'
    | 'lower'
    | 'proper'
    | 'left'
    | 'right'
    | 'mid'
    | 'length'
    | 'concat'
    | 'extract_delimiter'
  >('trim');

  const [lengthVal, setLengthVal] = useState(5);
  const [startVal, setStartVal] = useState(1);
  const [delimiter, setDelimiter] = useState(' ');
  const [position, setPosition] = useState<'before' | 'after'>('before');
  const [concatCols, setConcatCols] = useState<string[]>([]);
  const [concatSep, setConcatSep] = useState(' ');
  const [createNewColumn, setCreateNewColumn] = useState(false);
  const [outputColumn, setOutputColumn] = useState('');

  if (!isOpen) return null;

  const toggleConcatCol = (cName: string) => {
    if (concatCols.includes(cName)) {
      setConcatCols(concatCols.filter((c) => c !== cName));
    } else {
      setConcatCols([...concatCols, cName]);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!column) return;

    const outCol = createNewColumn ? outputColumn || `${column}_${operation}` : column;

    await addStep({
      id: crypto.randomUUID(),
      type: 'text_transform',
      label: `Text ${operation.toUpperCase()} on ${column}`,
      enabled: true,
      params: {
        column,
        operation,
        output_column: outCol,
        length: lengthVal,
        start: startVal,
        delimiter,
        position,
        concat_columns: concatCols,
        concat_separator: concatSep,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-500/20">
              <Type size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Text & String Operations</h3>
              <p className="text-xs text-slate-400">
                Trim, change case, substring, extract, and concatenate text
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

        {/* Form Body */}
        <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Target Column */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Select Column
            </label>
            <select
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.data_type})
                </option>
              ))}
            </select>
          </div>

          {/* Operation Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Text Operation
            </label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-semibold"
            >
              <option value="trim">Trim Leading & Trailing Whitespace</option>
              <option value="clean">Clean Unprintable Characters</option>
              <option value="upper">UPPERCASE (All capital letters)</option>
              <option value="lower">lowercase (All small letters)</option>
              <option value="proper">Proper / Title Case (Capitalize Each Word)</option>
              <option value="left">LEFT(N) (First N characters)</option>
              <option value="right">RIGHT(N) (Last N characters)</option>
              <option value="mid">MID(Start, N) (Substring)</option>
              <option value="length">Length (Character count)</option>
              <option value="concat">Concatenate with other columns</option>
              <option value="extract_delimiter">Extract text before / after delimiter</option>
            </select>
          </div>

          {/* Dynamic Inputs */}
          {(operation === 'left' || operation === 'right') && (
            <div>
              <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                Number of Characters
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={lengthVal}
                onChange={(e) => setLengthVal(Number(e.target.value))}
                className="w-28 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>
          )}

          {operation === 'mid' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Start Position (1-indexed)
                </label>
                <input
                  type="number"
                  min="1"
                  value={startVal}
                  onChange={(e) => setStartVal(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Character Length
                </label>
                <input
                  type="number"
                  min="1"
                  value={lengthVal}
                  onChange={(e) => setLengthVal(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
              </div>
            </div>
          )}

          {operation === 'extract_delimiter' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Delimiter
                </label>
                <input
                  type="text"
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  Part to Keep
                </label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                >
                  <option value="before">Before delimiter</option>
                  <option value="after">After delimiter</option>
                </select>
              </div>
            </div>
          )}

          {operation === 'concat' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200 block">
                Additional Columns to Concatenate
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded-xl">
                {columns
                  .filter((c) => c.name !== column)
                  .map((c) => {
                    const isChecked = concatCols.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleConcatCol(c.name)}
                        className={`px-2 py-0.5 rounded text-xs border ${
                          isChecked
                            ? 'bg-pink-500/20 text-pink-200 border-pink-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {isChecked ? '✓ ' : ''}
                        {c.name}
                      </button>
                    );
                  })}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  Separator
                </label>
                <input
                  type="text"
                  value={concatSep}
                  onChange={(e) => setConcatSep(e.target.value)}
                  placeholder="e.g. space, comma, hyphen"
                  className="w-28 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
              </div>
            </div>
          )}

          {/* Overwrite vs New Column */}
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-200">
              <input
                type="checkbox"
                checked={createNewColumn}
                onChange={(e) => setCreateNewColumn(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-pink-500 focus:ring-0"
              />
              <span>Create as a new column instead of replacing original</span>
            </label>
            {createNewColumn && (
              <input
                type="text"
                value={outputColumn}
                onChange={(e) => setOutputColumn(e.target.value)}
                placeholder={`${column}_${operation}`}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-400 text-slate-950 rounded-lg shadow-md shadow-pink-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Text Transformation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
