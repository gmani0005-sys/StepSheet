import React, { useRef, useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Type,
  Hash,
  Percent,
  Calendar,
  Clock,
  ToggleLeft,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { DataType } from '../../types';

export const DataGrid: React.FC = () => {
  const {
    rows,
    columns: schemaColumns,
    totalRows,
    filteredRows,
    offset,
    limit,
    isLoadingRows,
    searchQuery,
    sortConditions,
    setSearch,
    toggleSort,
    fetchRows,
    openColumnProfile,
    selectedDataset,
  } = useWorkbenchStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Column helper
  const columnHelper = createColumnHelper<Record<string, any>>();

  const columns = useMemo(() => {
    return schemaColumns.map((col) =>
      columnHelper.accessor(col.name, {
        id: col.name,
        header: () => (
          <div className="flex items-center justify-between w-full group select-none">
            <div
              className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
              onClick={() => toggleSort(col.name)}
              title={`Click to sort by ${col.name}`}
            >
              <span className="text-slate-400">
                {getTypeIcon(col.data_type)}
              </span>
              <span className="font-semibold text-xs text-slate-200 group-hover:text-white">
                {col.name}
              </span>
              {getSortIcon(col.name, sortConditions)}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                openColumnProfile(col.name);
              }}
              title={`View ${col.name} column profile & histogram`}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 rounded transition-all"
            >
              <BarChart3 size={13} />
            </button>
          </div>
        ),
        cell: (info) => {
          const val = info.getValue();
          if (val === null || val === undefined) {
            return <span className="text-slate-600 italic font-mono text-[11px]">null</span>;
          }
          if (typeof val === 'boolean') {
            return (
              <span
                className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                  val ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {val ? 'TRUE' : 'FALSE'}
              </span>
            );
          }
          return <span className="truncate block font-mono text-xs">{String(val)}</span>;
        },
      })
    );
  }, [schemaColumns, sortConditions, toggleSort, openColumnProfile]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows: tableRows } = table.getRowModel();

  // Virtualizer for smooth 60fps rendering of rows
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(localSearch);
  };

  if (!selectedDataset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
          <FileSpreadsheet size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-200">Welcome to StepSheet</h3>
        <p className="text-sm text-slate-400 max-w-md mt-1 mb-6">
          Upload an Excel (.xlsx) or CSV file from the left panel to begin applying transformations through guided UI steps.
        </p>
      </div>
    );
  }

  const startRow = totalRows === 0 ? 0 : offset + 1;
  const endRow = Math.min(offset + limit, filteredRows);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden h-[calc(100vh-3.5rem)]">
      {/* Grid Toolbar: Search, Filter, Pagination */}
      <div className="h-11 border-b border-slate-800/80 bg-slate-900/60 px-4 flex items-center justify-between gap-4 shrink-0">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-sm w-full">
          <div className="relative w-full">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search in all columns..."
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          {localSearch !== searchQuery && (
            <button
              type="submit"
              className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
            >
              Filter
            </button>
          )}
        </form>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {isLoadingRows ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <RefreshCw size={12} className="animate-spin" />
              <span>Querying DuckDB...</span>
            </span>
          ) : (
            <span>
              Showing <span className="font-semibold text-slate-200">{startRow}</span> -{' '}
              <span className="font-semibold text-slate-200">{endRow}</span> of{' '}
              <span className="font-semibold text-slate-200">{filteredRows.toLocaleString()}</span> rows
              {filteredRows < totalRows && ` (filtered from ${totalRows.toLocaleString()})`}
            </span>
          )}

          {/* Pagination buttons */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            <button
              onClick={() => fetchRows(Math.max(0, offset - limit))}
              disabled={offset === 0 || isLoadingRows}
              className="p-1 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded text-slate-300"
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => fetchRows(offset + limit)}
              disabled={offset + limit >= filteredRows || isLoadingRows}
              className="p-1 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded text-slate-300"
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Virtualized Table Body */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto relative">
        <table className="w-full text-left border-collapse table-fixed">
          {/* Sticky Header */}
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10 shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Row Number Header */}
                <th className="w-12 px-2 py-2 text-center text-[10px] font-mono font-medium text-slate-500 bg-slate-900/90 border-r border-slate-800">
                  #
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 border-r border-slate-800 text-xs font-semibold text-slate-300 truncate"
                    style={{ minWidth: 150 }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          {/* Virtualized Rows */}
          <tbody>
            {rowVirtualizer.getVirtualItems().length === 0 ? (
              <tr>
                <td
                  colSpan={schemaColumns.length + 1}
                  className="text-center py-12 text-xs text-slate-500"
                >
                  {isLoadingRows ? 'Loading rows...' : 'No matching rows found.'}
                </td>
              </tr>
            ) : (
              <>
                {rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
                  <tr>
                    <td
                      colSpan={schemaColumns.length + 1}
                      style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start}px` }}
                    />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  const rowIndex = offset + virtualRow.index + 1;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-900/60 hover:bg-slate-900/50 transition-colors"
                      style={{ height: `${virtualRow.size}px` }}
                    >
                      {/* Row Index */}
                      <td className="w-12 px-2 py-1.5 text-center text-[10px] font-mono text-slate-600 bg-slate-950/40 border-r border-slate-800/80 select-none">
                        {rowIndex}
                      </td>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-1.5 border-r border-slate-800/60 text-xs text-slate-300 truncate"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function getTypeIcon(dataType: DataType) {
  switch (dataType) {
    case 'integer':
    case 'float':
      return <Hash size={13} className="text-amber-400" />;
    case 'date':
      return <Calendar size={13} className="text-sky-400" />;
    case 'timestamp':
      return <Clock size={13} className="text-indigo-400" />;
    case 'boolean':
      return <ToggleLeft size={13} className="text-emerald-400" />;
    default:
      return <Type size={13} className="text-slate-400" />;
  }
}

function getSortIcon(colName: string, sortConditions: any[]) {
  const current = sortConditions.find((s) => s.column === colName);
  if (!current) return null;
  return current.direction === 'asc' ? (
    <ArrowUp size={12} className="text-emerald-400" />
  ) : (
    <ArrowDown size={12} className="text-emerald-400" />
  );
}
