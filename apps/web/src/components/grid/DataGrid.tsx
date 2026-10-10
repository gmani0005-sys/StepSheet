import React, { useRef, useMemo, useState, useEffect } from 'react';
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
  Calendar,
  Clock,
  ToggleLeft,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FileSpreadsheet,
  Check,
  Filter,
  X,
  Plus,
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/workbenchStore';
import { DataType } from '../../types';

interface UniqueValueItem {
  key: string;
  rawValue: any;
  displayLabel: string;
  isNull: boolean;
  isBoolean: boolean;
  count: number;
  percentage: number;
}

function toUniqueValueKey(val: any): string {
  if (val === null || val === undefined || val === '') return '__NULL__';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

export const DataGrid: React.FC = () => {
  const {
    rows,
    allRows,
    columns: schemaColumns,
    totalRows,
    filteredRows,
    offset,
    limit,
    isLoadingRows,
    searchQuery,
    sortConditions,
    columnValueFilters,
    setSearch,
    toggleSort,
    setColumnSort,
    setColumnValueFilter,
    clearColumnValueFilters,
    fetchRows,
    openColumnProfile,
    addStep,
    selectedDataset,
  } = useWorkbenchStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [openDropdownCol, setOpenDropdownCol] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [dropdownSearch, setDropdownSearch] = useState('');

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const safeRows = Array.isArray(rows) ? rows : [];
  const safeAllRows = Array.isArray(allRows) ? allRows : [];
  const safeSchemaColumns = Array.isArray(schemaColumns) ? schemaColumns : [];
  const safeColumnFilters = columnValueFilters || {};

  // Close column unique-values dropdown on outside click or Escape
  useEffect(() => {
    if (!openDropdownCol) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (dropdownRef.current && dropdownRef.current.contains(target)) {
        return;
      }
      if (target.closest && target.closest('[data-col-dropdown-trigger]')) {
        return;
      }
      setOpenDropdownCol(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdownCol(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdownCol]);

  // Compute unique values per column from the full dataset/pipeline rows (or current rows fallback)
  const sourceRowsForUniqueValues = useMemo(() => {
    return safeAllRows.length > 0 ? safeAllRows : safeRows;
  }, [safeAllRows, safeRows]);

  const uniqueValuesByColumn = useMemo(() => {
    const map: Record<string, UniqueValueItem[]> = {};
    const total = sourceRowsForUniqueValues.length;

    safeSchemaColumns.forEach((col) => {
      const counts = new Map<string, { rawValue: any; count: number }>();
      sourceRowsForUniqueValues.forEach((row) => {
        if (!row) return;
        const val = row[col.name];
        const key = toUniqueValueKey(val);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { rawValue: val, count: 1 });
        }
      });

      const items: UniqueValueItem[] = Array.from(counts.entries()).map(([key, info]) => {
        const isNull = key === '__NULL__';
        const isBoolean = typeof info.rawValue === 'boolean';
        const displayLabel = isNull
          ? '(Blank / Null)'
          : isBoolean
          ? info.rawValue
            ? 'TRUE'
            : 'FALSE'
          : String(info.rawValue);
        return {
          key,
          rawValue: info.rawValue,
          displayLabel,
          isNull,
          isBoolean,
          count: info.count,
          percentage: total > 0 ? Number(((info.count / total) * 100).toFixed(1)) : 0,
        };
      });

      // Sort unique values naturally (non-null first, numeric/alphabetical)
      items.sort((a, b) => {
        if (a.isNull && !b.isNull) return 1;
        if (!a.isNull && b.isNull) return -1;
        if (typeof a.rawValue === 'number' && typeof b.rawValue === 'number') {
          return a.rawValue - b.rawValue;
        }
        return a.displayLabel.localeCompare(b.displayLabel, undefined, { numeric: true });
      });

      map[col.name] = items;
    });

    return map;
  }, [safeSchemaColumns, sourceRowsForUniqueValues]);

  const handleOpenColumnDropdown = (colName: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (openDropdownCol === colName) {
      setOpenDropdownCol(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownWidth = 280;
    const dropdownMaxHeight = 410;
    const viewportW = window.innerWidth || 1280;
    const viewportH = window.innerHeight || 800;

    // Position right below the column header trigger, clamped within viewport bounds
    const left = Math.max(12, Math.min(rect.right - dropdownWidth, viewportW - dropdownWidth - 12));
    const top =
      rect.bottom + dropdownMaxHeight > viewportH
        ? Math.max(12, rect.top - dropdownMaxHeight - 4)
        : rect.bottom + 6;

    setDropdownPos({ top, left });
    setDropdownSearch('');
    setOpenDropdownCol(colName);
  };

  // Column helper
  const columnHelper = createColumnHelper<Record<string, any>>();

  const columns = useMemo(() => {
    return safeSchemaColumns.map((col) => {
      const activeFilterValues = safeColumnFilters[col.name];
      const hasActiveFilter = Array.isArray(activeFilterValues);
      const isDropdownOpen = openDropdownCol === col.name;

      return columnHelper.accessor(col.name, {
        id: col.name,
        header: () => (
          <div className="flex items-center justify-between gap-2 w-full group select-none whitespace-nowrap">
            <div
              className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors min-w-0"
              onClick={() => toggleSort(col.name)}
              title={`Click to sort by ${col.name}`}
            >
              <span className="text-slate-400 shrink-0">
                {getTypeIcon(col.data_type)}
              </span>
              <span className="font-semibold text-xs text-slate-200 group-hover:text-white whitespace-nowrap">
                {col.name}
              </span>
              {getSortIcon(col.name, sortConditions)}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openColumnProfile(col.name);
                }}
                title={`View ${col.name} column profile & histogram`}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 rounded transition-all shrink-0"
              >
                <BarChart3 size={13} />
              </button>

              {/* Column Unique Values Dropdown Trigger */}
              <button
                type="button"
                data-col-dropdown-trigger={col.name}
                data-testid={`col-dropdown-${col.name}`}
                onClick={(e) => handleOpenColumnDropdown(col.name, e)}
                title={`View unique values & filter ${col.name}`}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded border text-[10px] font-medium transition-all shrink-0 ${
                  isDropdownOpen || hasActiveFilter
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                    : 'bg-slate-800/70 border-slate-700/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                {hasActiveFilter && (
                  <span className="px-1 rounded bg-emerald-500 text-slate-950 font-bold text-[9px] leading-tight">
                    {activeFilterValues.length}
                  </span>
                )}
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
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
          return (
            <span className="block font-mono text-xs whitespace-nowrap" title={String(val)}>
              {String(val)}
            </span>
          );
        },
      });
    });
  }, [
    safeSchemaColumns,
    sortConditions,
    safeColumnFilters,
    openDropdownCol,
    toggleSort,
    openColumnProfile,
  ]);

  const table = useReactTable({
    data: safeRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows: tableRows } = table.getRowModel();

  // Virtualizer for smooth 60fps rendering of rows
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 34,
    overscan: 10,
  });

  // Active dropdown column metadata & unique values (computed before any early return)
  const activeColSchema = openDropdownCol
    ? safeSchemaColumns.find((c) => c.name === openDropdownCol)
    : null;
  const allUniqueItems = openDropdownCol ? uniqueValuesByColumn[openDropdownCol] || [] : [];
  const filteredUniqueItems = dropdownSearch.trim()
    ? allUniqueItems.filter((item) =>
        item.displayLabel.toLowerCase().includes(dropdownSearch.trim().toLowerCase())
      )
    : allUniqueItems;

  const activeColSelectedKeys: Set<string> = useMemo(() => {
    if (!openDropdownCol) return new Set();
    const explicit = safeColumnFilters[openDropdownCol];
    if (Array.isArray(explicit)) {
      return new Set(explicit);
    }
    return new Set(allUniqueItems.map((i) => i.key));
  }, [openDropdownCol, safeColumnFilters, allUniqueItems]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(localSearch);
  };

  if (!selectedDataset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-8 text-center min-h-0">
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

  const startRow = totalRows === 0 || filteredRows === 0 ? 0 : offset + 1;
  const endRow = Math.min(offset + limit, filteredRows);
  const activeFilterEntries = Object.entries(safeColumnFilters);

  const isAllVisibleSelected =
    filteredUniqueItems.length > 0 &&
    filteredUniqueItems.every((item) => activeColSelectedKeys.has(item.key));

  const handleToggleUniqueValue = (colName: string, itemKey: string) => {
    const colItems = uniqueValuesByColumn[colName] || [];
    const allKeys = colItems.map((i) => i.key);
    const currentSelected = safeColumnFilters[colName]
      ? new Set(safeColumnFilters[colName])
      : new Set(allKeys);

    if (currentSelected.has(itemKey)) {
      currentSelected.delete(itemKey);
    } else {
      currentSelected.add(itemKey);
    }

    if (currentSelected.size === allKeys.length) {
      setColumnValueFilter(colName, null);
    } else {
      setColumnValueFilter(colName, Array.from(currentSelected));
    }
  };

  const handleSelectOnlyUniqueValue = (colName: string, itemKey: string) => {
    const colItems = uniqueValuesByColumn[colName] || [];
    if (colItems.length <= 1) {
      setColumnValueFilter(colName, null);
    } else {
      setColumnValueFilter(colName, [itemKey]);
    }
  };

  const handleToggleSelectAllVisible = (colName: string) => {
    const colItems = uniqueValuesByColumn[colName] || [];
    const allKeys = colItems.map((i) => i.key);
    const visibleKeys = filteredUniqueItems.map((i) => i.key);

    if (!dropdownSearch.trim()) {
      if (isAllVisibleSelected) {
        setColumnValueFilter(colName, []);
      } else {
        setColumnValueFilter(colName, null);
      }
      return;
    }

    const currentSelected = safeColumnFilters[colName]
      ? new Set(safeColumnFilters[colName])
      : new Set(allKeys);

    if (isAllVisibleSelected) {
      visibleKeys.forEach((k) => currentSelected.delete(k));
    } else {
      visibleKeys.forEach((k) => currentSelected.add(k));
    }

    if (currentSelected.size === allKeys.length) {
      setColumnValueFilter(colName, null);
    } else {
      setColumnValueFilter(colName, Array.from(currentSelected));
    }
  };

  const handleAddFilterAsPipelineStep = async (colName: string) => {
    const selectedKeys = safeColumnFilters[colName];
    if (!selectedKeys || selectedKeys.length === 0) return;

    const cleanValues = selectedKeys.map((k) => (k === '__NULL__' ? '' : k));
    const isSingle = cleanValues.length === 1;

    await addStep({
      id: crypto.randomUUID(),
      type: 'filter_rows',
      label: isSingle
        ? `Filter ${colName} = ${cleanValues[0] || 'null'}`
        : `Filter ${colName} in (${cleanValues.slice(0, 2).join(', ')}${cleanValues.length > 2 ? '...' : ''})`,
      enabled: true,
      params: isSingle
        ? { column: colName, operator: 'eq', value: cleanValues[0] }
        : { column: colName, operator: 'in', value: cleanValues },
    });

    setColumnValueFilter(colName, null);
    setOpenDropdownCol(null);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden min-h-0 min-w-0">
      {/* Grid Toolbar: Search, Active Column Filters, Pagination */}
      <div className="min-h-[44px] py-1.5 border-b border-slate-800/80 bg-slate-900/60 px-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <Search size={14} className="absolute left-2.5 top-2 text-slate-500" />
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

          {/* Active Column Unique-Value Filter Pills */}
          {activeFilterEntries.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeFilterEntries.map(([colName, vals]) => (
                <span
                  key={colName}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                >
                  <Filter size={10} />
                  <span className="font-semibold">{colName}:</span>
                  <span className="max-w-[140px] truncate">
                    {vals.length === 0
                      ? 'None'
                      : vals.map((v) => (v === '__NULL__' ? 'Null' : v)).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setColumnValueFilter(colName, null)}
                    className="hover:text-white p-0.5 rounded"
                    title={`Clear ${colName} filter`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {activeFilterEntries.length > 1 && (
                <button
                  type="button"
                  onClick={clearColumnValueFilters}
                  className="text-[11px] text-slate-400 hover:text-rose-400 underline px-1"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
          {isLoadingRows ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <RefreshCw size={12} className="animate-spin" />
              <span>Querying DuckDB...</span>
            </span>
          ) : (
            <span className="whitespace-nowrap">
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

      {/* Main Virtualized Table Body with Native Horizontal & Vertical Scrollers */}
      <div
        ref={tableContainerRef}
        data-testid="grid-scroll-container"
        className="flex-1 overflow-x-auto overflow-y-auto relative min-h-0 grid-scrollbar"
      >
        <table className="min-w-full w-max text-left border-collapse table-auto">
          {/* Sticky Header */}
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-20 shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Sticky Row Number Header */}
                <th className="sticky left-0 z-30 w-12 min-w-[48px] px-2 py-2.5 text-center text-[10px] font-mono font-medium text-slate-500 bg-slate-900 border-r border-slate-800">
                  #
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3.5 py-2.5 border-r border-slate-800 text-xs font-semibold text-slate-300 whitespace-nowrap bg-slate-900"
                    style={{ minWidth: 190 }}
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
                  colSpan={safeSchemaColumns.length + 1}
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
                      colSpan={safeSchemaColumns.length + 1}
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
                      {/* Sticky Row Index */}
                      <td className="sticky left-0 z-10 w-12 min-w-[48px] px-2 py-1.5 text-center text-[10px] font-mono text-slate-500 bg-slate-950 border-r border-slate-800/80 select-none">
                        {rowIndex}
                      </td>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3.5 py-1.5 border-r border-slate-800/60 text-xs text-slate-300 whitespace-nowrap"
                          style={{ minWidth: 190 }}
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

      {/* Floating Column Unique Values Dropdown Menu */}
      {openDropdownCol && (
        <div
          ref={dropdownRef}
          data-testid="column-unique-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: 280 }}
          className="fixed z-50 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl shadow-black/70 flex flex-col overflow-hidden"
        >
          {/* Dropdown Header */}
          <div className="px-3 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {activeColSchema && getTypeIcon(activeColSchema.data_type)}
              <span className="text-xs font-bold text-slate-100 truncate">
                {openDropdownCol}
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-emerald-400 border border-slate-700 shrink-0">
                {allUniqueItems.length} unique
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenDropdownCol(null)}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Close dropdown"
            >
              <X size={13} />
            </button>
          </div>

          {/* Quick Sort Row */}
          <div className="px-2.5 py-1.5 border-b border-slate-800/80 bg-slate-900/60 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColumnSort(openDropdownCol, 'asc')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium border transition-colors ${
                sortConditions.some((s) => s.column === openDropdownCol && s.direction === 'asc')
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ArrowUp size={11} />
              <span>Sort A → Z</span>
            </button>
            <button
              type="button"
              onClick={() => setColumnSort(openDropdownCol, 'desc')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium border transition-colors ${
                sortConditions.some((s) => s.column === openDropdownCol && s.direction === 'desc')
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ArrowDown size={11} />
              <span>Sort Z → A</span>
            </button>
          </div>

          {/* Search Unique Values Input */}
          <div className="p-2 border-b border-slate-800/80 bg-slate-900">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
              <input
                type="text"
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                placeholder={`Search ${allUniqueItems.length} unique values...`}
                className="w-full bg-slate-950 border border-slate-800 rounded-md pl-7 pr-6 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                autoFocus
              />
              {dropdownSearch && (
                <button
                  type="button"
                  onClick={() => setDropdownSearch('')}
                  className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Select All & Selection Counter Bar */}
          <div className="px-3 py-1.5 bg-slate-950/50 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
            <label
              onClick={() => handleToggleSelectAllVisible(openDropdownCol)}
              className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white font-medium select-none"
            >
              <span
                className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                  isAllVisibleSelected
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                    : 'border-slate-600 bg-slate-950'
                }`}
              >
                {isAllVisibleSelected && <Check size={10} strokeWidth={3} />}
              </span>
              <span>(Select All)</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-mono text-[10px]">
                {activeColSelectedKeys.size}/{allUniqueItems.length}
              </span>
              {safeColumnFilters[openDropdownCol] && (
                <button
                  type="button"
                  onClick={() => setColumnValueFilter(openDropdownCol, null)}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Unique Values List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/40 grid-scrollbar">
            {filteredUniqueItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No matching unique values
              </div>
            ) : (
              filteredUniqueItems.map((item) => {
                const isChecked = activeColSelectedKeys.has(item.key);
                return (
                  <div
                    key={item.key}
                    onClick={() => handleToggleUniqueValue(openDropdownCol, item.key)}
                    className="group/item px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-800/60 cursor-pointer transition-colors select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                            : 'border-slate-600 bg-slate-950'
                        }`}
                      >
                        {isChecked && <Check size={10} strokeWidth={3} />}
                      </span>

                      {item.isNull ? (
                        <span className="text-xs italic text-slate-500 font-mono truncate">
                          {item.displayLabel}
                        </span>
                      ) : item.isBoolean ? (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            item.rawValue
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {item.displayLabel}
                        </span>
                      ) : (
                        <span
                          className="text-xs font-mono text-slate-200 truncate"
                          title={item.displayLabel}
                        >
                          {item.displayLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectOnlyUniqueValue(openDropdownCol, item.key);
                        }}
                        className="opacity-0 group-hover/item:opacity-100 px-1.5 py-0.5 rounded bg-slate-700 hover:bg-emerald-500 hover:text-slate-950 text-[9px] font-semibold text-slate-200 transition-all"
                        title={`Show only "${item.displayLabel}"`}
                      >
                        Only
                      </button>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-950/80 border border-slate-800 px-1.5 py-0.5 rounded">
                        {item.count}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="px-3 py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2">
            {safeColumnFilters[openDropdownCol] &&
            safeColumnFilters[openDropdownCol].length > 0 ? (
              <button
                type="button"
                onClick={() => handleAddFilterAsPipelineStep(openDropdownCol)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors"
                title="Promote selected values to an Applied Step"
              >
                <Plus size={11} />
                <span>Add as Step</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-500">
                Click values to filter table
              </span>
            )}

            <button
              type="button"
              onClick={() => setOpenDropdownCol(null)}
              className="px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
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
