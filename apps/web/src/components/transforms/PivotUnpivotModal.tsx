import React, { useState } from 'react';
import { X, Check, TableProperties, ArrowRightLeft, Code2 } from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';

interface PivotUnpivotModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'pivot' | 'unpivot';
}

export const PivotUnpivotModal: React.FC<PivotUnpivotModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'pivot',
}) => {
  const { columns, addStep } = useWorkbenchStore();

  const [mode, setMode] = useState<'pivot' | 'unpivot'>(initialMode);

  // Pivot state
  const [pivotCol, setPivotCol] = useState(columns[0]?.name || '');
  const [valCol, setValCol] = useState(columns[1]?.name || columns[0]?.name || '');
  const [aggFunc, setAggFunc] = useState<'sum' | 'count' | 'avg' | 'min' | 'max'>('sum');
  const [selectedIdxCols, setSelectedIdxCols] = useState<string[]>(
    columns.length > 2 ? [columns[2].name] : []
  );

  // Unpivot state
  const [idCols, setIdCols] = useState<string[]>([columns[0]?.name || '']);
  const [valueCols, setValueCols] = useState<string[]>(
    columns.slice(1).map((c) => c.name)
  );
  const [nameCol, setNameCol] = useState('metric');
  const [valueOutCol, setValueOutCol] = useState('value');

  if (!isOpen) return null;

  const toggleIdxCol = (colName: string) => {
    if (selectedIdxCols.includes(colName)) {
      setSelectedIdxCols(selectedIdxCols.filter((c) => c !== colName));
    } else {
      setSelectedIdxCols([...selectedIdxCols, colName]);
    }
  };

  const toggleUnpivotValCol = (colName: string) => {
    if (valueCols.includes(colName)) {
      setValueCols(valueCols.filter((c) => c !== colName));
    } else {
      setValueCols([...valueCols, colName]);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'pivot') {
      if (!pivotCol || !valCol) return;
      await addStep({
        id: crypto.randomUUID(),
        type: 'pivot',
        label: `PIVOT on ${pivotCol} with ${aggFunc.toUpperCase()}(${valCol})`,
        enabled: true,
        params: {
          index_columns: selectedIdxCols,
          pivot_column: pivotCol,
          value_column: valCol,
          agg_func: aggFunc,
        },
      });
    } else {
      if (valueCols.length === 0) return;
      await addStep({
        id: crypto.randomUUID(),
        type: 'unpivot',
        label: `UNPIVOT ${valueCols.length} columns into rows`,
        enabled: true,
        params: {
          id_columns: idCols,
          value_columns: valueCols,
          name_column: nameCol,
          value_column: valueOutCol,
        },
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-fuchsia-500/20">
              <TableProperties size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Pivot & Unpivot Wizard</h3>
              <p className="text-xs text-slate-400">Reshape data between tall/narrow and wide formats</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1">
          <button
            type="button"
            onClick={() => setMode('pivot')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === 'pivot'
                ? 'bg-slate-800 text-fuchsia-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pivot (Tall → Wide)
          </button>
          <button
            type="button"
            onClick={() => setMode('unpivot')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === 'unpivot'
                ? 'bg-slate-800 text-fuchsia-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unpivot (Wide → Tall)
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-5 space-y-4">
          {mode === 'pivot' ? (
            <>
              {/* Pivot Column */}
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                  1. Pivot Column (Values become new column headers)
                </label>
                <select
                  value={pivotCol}
                  onChange={(e) => setPivotCol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Value Column & Agg */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                    2. Value Column
                  </label>
                  <select
                    value={valCol}
                    onChange={(e) => setValCol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                    Aggregation
                  </label>
                  <select
                    value={aggFunc}
                    onChange={(e) => setAggFunc(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-bold"
                  >
                    <option value="sum">SUM</option>
                    <option value="count">COUNT</option>
                    <option value="avg">AVERAGE</option>
                    <option value="min">MIN</option>
                    <option value="max">MAX</option>
                  </select>
                </div>
              </div>

              {/* Row index columns */}
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  3. Row Index Columns (Keep as row identifiers)
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded-xl">
                  {columns
                    .filter((c) => c.name !== pivotCol && c.name !== valCol)
                    .map((c) => {
                      const isChecked = selectedIdxCols.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => toggleIdxCol(c.name)}
                          className={`px-2 py-0.5 rounded text-xs border ${
                            isChecked
                              ? 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          {isChecked ? '✓ ' : ''}
                          {c.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Unpivot columns */}
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  Columns to Melt / Unpivot into Rows
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded-xl">
                  {columns.map((c) => {
                    const isChecked = valueCols.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleUnpivotValCol(c.name)}
                        className={`px-2 py-0.5 rounded text-xs border ${
                          isChecked
                            ? 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {isChecked ? '✓ ' : ''}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Naming output */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                    Attribute Column Name
                  </label>
                  <input
                    type="text"
                    value={nameCol}
                    onChange={(e) => setNameCol(e.target.value)}
                    placeholder="attribute"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                    Value Column Name
                  </label>
                  <input
                    type="text"
                    value={valueOutCol}
                    onChange={(e) => setValueOutCol(e.target.value)}
                    placeholder="value"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    required
                  />
                </div>
              </div>
            </>
          )}

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
              className="px-5 py-2 text-xs font-semibold bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 rounded-lg shadow-md shadow-fuchsia-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply {mode === 'pivot' ? 'Pivot' : 'Unpivot'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
