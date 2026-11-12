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

function getExcelColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export const DataGrid: React.FC = () => {
  const {
    datasets,
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
    selectDataset,
    uploadDataset,
  } = useWorkbenchStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [openDropdownCol, setOpenDropdownCol] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    colIndex: number;
    colName: string;
  }>({ rowIndex: 1, colIndex: 0, colName: '' });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sheetUploadInputRef = useRef<HTMLInputElement>(null);

  const safeDatasets = Array.isArray(datasets) ? datasets : [];
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

    const left = Math.max(12, Math.min(rect.right - dropdownWidth, viewportW - dropdownWidth - 12));
    const top =
      rect.bottom + dropdownMaxHeight > viewportH
        ? Math.max(12, rect.top - dropdownMaxHeight - 4)
        : rect.bottom + 4;

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
      const isNumericOrDate =
        col.data_type === 'integer' ||
        col.data_type === 'float' ||
        col.data_type === 'date' ||
        col.data_type === 'timestamp';
      const isBool = col.data_type === 'boolean';

      return columnHelper.accessor(col.name, {
        id: col.name,
        header: () => (
          <div className="flex items-center justify-between gap-1.5 w-full group select-none whitespace-nowrap">
            <div
              className="flex items-center gap-1.5 cursor-pointer text-[#212121] hover:text-[#217346] transition-colors min-w-0"
              onClick={() => toggleSort(col.name)}
              title={`Click to sort by ${col.name}`}
            >
              <span className="text-[#605E5C] shrink-0">
                {getTypeIcon(col.data_type)}
              </span>
              <span className="font-bold text-[12px] text-[#212121] group-hover:text-[#217346] whitespace-nowrap">
                {col.name}
              </span>
              {getSortIcon(col.name, sortConditions)}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openColumnProfile(col.name);
                }}
                title={`View ${col.name} column profile & histogram`}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-[#605E5C] hover:text-[#217346] hover:bg-[#E6E6E6] rounded-[2px] transition-all shrink-0"
              >
                <BarChart3 size={12} />
              </button>

              {/* Column Unique Values Dropdown Trigger (Excel AutoFilter button) */}
              <button
                type="button"
                data-col-dropdown-trigger={col.name}
                data-testid={`col-dropdown-${col.name}`}
                onClick={(e) => handleOpenColumnDropdown(col.name, e)}
                title={`View unique values & filter ${col.name}`}
                className={`flex items-center gap-0.5 px-1 py-0.5 rounded-[2px] border text-[11px] font-medium transition-all shrink-0 ${
                  isDropdownOpen || hasActiveFilter
                    ? 'bg-[#E6F2EB] border-[#217346] text-[#217346]'
                    : 'bg-white border-[#D4D4D4] text-[#444444] hover:text-[#212121] hover:bg-[#E6E6E6] hover:border-[#8A8886]'
                }`}
              >
                {hasActiveFilter && (
                  <span className="px-1 rounded-[1px] bg-[#217346] text-white font-bold text-[9px] leading-tight">
                    {activeFilterValues.length}
                  </span>
                )}
                <ChevronDown
                  size={11}
                  className={`transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
          </div>
        ),
        cell: (info) => {
          const val = info.getValue();
          // Excel rule: Null/blank cells render truly empty (no "null" chip)
          if (val === null || val === undefined || val === '') {
            return <span className="block h-4" />;
          }
          if (typeof val === 'boolean' || isBool) {
            return (
              <span className="block text-center font-sans text-[14.7px] leading-[20px] text-[#212121] uppercase">
                {val ? 'TRUE' : 'FALSE'}
              </span>
            );
          }
          const isNum = typeof val === 'number' || isNumericOrDate;
          return (
            <span
              className={`block text-[14.7px] leading-[20px] text-[#212121] whitespace-nowrap truncate ${
                isNum ? 'text-right font-sans tabular-nums' : 'text-left font-sans'
              }`}
              title={String(val)}
            >
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

  // Virtualizer for compact 24px Excel rows
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 24,
    overscan: 15,
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

  // Selection summary stats for Status Bar (Sum / Avg / Count for active column)
  const statusBarStats = useMemo(() => {
    const colName =
      selectedCell.colName || safeSchemaColumns[selectedCell.colIndex]?.name || safeSchemaColumns[0]?.name;
    if (!colName || safeRows.length === 0) {
      return { count: safeRows.length, sum: null as number | null, avg: null as number | null };
    }
    let numericCount = 0;
    let nonEmptyCount = 0;
    let sum = 0;
    safeRows.forEach((r) => {
      const v = r?.[colName];
      if (v !== null && v !== undefined && v !== '') {
        nonEmptyCount++;
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n) && typeof v !== 'boolean') {
          numericCount++;
          sum += n;
        }
      }
    });
    if (numericCount > 0) {
      return {
        count: nonEmptyCount,
        sum: Number(sum.toFixed(2)),
        avg: Number((sum / numericCount).toFixed(2)),
      };
    }
    return { count: nonEmptyCount, sum: null, avg: null };
  }, [selectedCell, safeSchemaColumns, safeRows]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(localSearch);
  };

  if (!selectedDataset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white p-8 text-center min-h-0 border-t border-[#D4D4D4]">
        <div className="w-14 h-14 rounded-[2px] bg-[#E6F2EB] border border-[#217346]/30 flex items-center justify-center text-[#217346] mb-3">
          <FileSpreadsheet size={28} />
        </div>
        <h3 className="text-base font-bold text-[#212121]">Welcome to StepSheet</h3>
        <p className="text-xs text-[#605E5C] max-w-md mt-1 mb-4">
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
    <div className="flex-1 flex flex-col bg-white overflow-hidden min-h-0 min-w-0">
      {/* Sub-strip: Quick Filter Search, Active Column Filter Pills & Page Controls */}
      <div className="min-h-[32px] py-1 border-b border-[#D4D4D4] bg-[#F3F3F3] px-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 max-w-[240px] w-full">
            <div className="relative w-full">
              <Search size={12} className="absolute left-2 top-1.5 text-[#605E5C]" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search in all columns..."
                className="w-full h-6 bg-white border border-[#8A8886] focus:border-[#217346] rounded-[2px] pl-6 pr-2 text-[12px] text-[#212121] placeholder-[#605E5C] focus:outline-none"
              />
            </div>
            {localSearch !== searchQuery && (
              <button
                type="submit"
                className="px-2 py-0.5 text-[12px] font-medium bg-[#217346] text-white rounded-[2px]"
              >
                Filter
              </button>
            )}
          </form>

          {/* Active Column Unique-Value Filter Pills */}
          {activeFilterEntries.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {activeFilterEntries.map(([colName, vals]) => (
                <span
                  key={colName}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[12px] bg-[#E6F2EB] border border-[#217346] text-[#217346]"
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
                    className="hover:bg-[#217346]/15 p-0.5 rounded-[1px]"
                    title={`Clear ${colName} filter`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {activeFilterEntries.length > 1 && (
                <button
                  type="button"
                  onClick={clearColumnValueFilters}
                  className="text-[12px] text-[#605E5C] hover:text-[#C50F1F] underline px-1"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-[#605E5C] shrink-0">
          {isLoadingRows ? (
            <span className="flex items-center gap-1 text-[#217346]">
              <RefreshCw size={11} className="animate-spin" />
              <span>Calculating...</span>
            </span>
          ) : (
            <span className="whitespace-nowrap">
              Showing <span className="font-semibold text-[#212121]">{startRow}</span> -{' '}
              <span className="font-semibold text-[#212121]">{endRow}</span> of{' '}
              <span className="font-semibold text-[#212121]">{filteredRows.toLocaleString()}</span> rows
              {filteredRows < totalRows && ` (filtered from ${totalRows.toLocaleString()})`}
            </span>
          )}

          {/* Pagination buttons */}
          <div className="flex items-center gap-0.5 pl-2 border-l border-[#D4D4D4]">
            <button
              onClick={() => fetchRows(Math.max(0, offset - limit))}
              disabled={offset === 0 || isLoadingRows}
              className="p-0.5 hover:bg-[#E6E6E6] disabled:opacity-30 disabled:cursor-not-allowed rounded-[2px] text-[#212121]"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => fetchRows(offset + limit)}
              disabled={offset + limit >= filteredRows || isLoadingRows}
              className="p-0.5 hover:bg-[#E6E6E6] disabled:opacity-30 disabled:cursor-not-allowed rounded-[2px] text-[#212121]"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Virtualized Excel Worksheet Grid */}
      <div
        ref={tableContainerRef}
        data-testid="grid-scroll-container"
        className="flex-1 overflow-x-auto overflow-y-auto relative min-h-0 grid-scrollbar bg-white"
      >
        <table className="min-w-full w-max text-left border-collapse table-auto">
          {/* Sticky Two-Tier Excel Header: Row 1 = Letters (A, B, C...), Row 2 = Column Names */}
          <thead className="sticky top-0 z-20 select-none" style={{ boxShadow: '0 2px 4px rgba(15,23,32,0.08)' }}>
            {/* Tier 1: Excel Column Letter Headers (A, B, C...) */}
            <tr className="bg-[#F3F3F3]">
              <th
                title="Select All"
                className="sticky left-0 z-30 w-11 min-w-[44px] h-[21px] px-1 text-center text-[11px] font-normal text-[#605E5C] bg-[#F3F3F3] border-r border-b border-[#D4D4D4]"
              >
                <span className="inline-block text-[9px] text-[#8A8886] leading-none">◢</span>
              </th>
              {safeSchemaColumns.map((col, colIdx) => {
                const isColSelected = selectedCell.colIndex === colIdx;
                return (
                  <th
                    key={`letter-${col.name}`}
                    onClick={() =>
                      setSelectedCell((prev) => ({
                        rowIndex: prev.rowIndex || 1,
                        colIndex: colIdx,
                        colName: col.name,
                      }))
                    }
                    className={`h-[21px] px-2 text-center text-[12px] border-r border-b cursor-pointer transition-colors ${
                      isColSelected
                        ? 'bg-[#E6F2EB] text-[#217346] font-bold border-r-[#D4D4D4] border-b-2 border-b-[#217346]'
                        : 'bg-[#F3F3F3] text-[#444444] font-normal border-[#D4D4D4] hover:bg-[#E6E6E6]'
                    }`}
                    style={{ minWidth: 165 }}
                  >
                    {getExcelColumnLetter(colIdx)}
                  </th>
                );
              })}
            </tr>

            {/* Tier 2: Column Name & AutoFilter Row */}
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[#F8F8F8] border-b-2 border-b-[#D4D4D4]">
                <th className="sticky left-0 z-30 w-11 min-w-[44px] h-[26px] px-1 text-center text-[12px] font-semibold text-[#444444] bg-[#F3F3F3] border-r border-b-2 border-r-[#D4D4D4] border-b-[#D4D4D4]">
                  #
                </th>
                {headerGroup.headers.map((header, colIdx) => {
                  const isColSelected = selectedCell.colIndex === colIdx;
                  return (
                    <th
                      key={header.id}
                      className={`h-[26px] px-2 py-0.5 border-r border-b-2 border-r-[#D4D4D4] border-b-[#D4D4D4] text-[12px] font-bold text-[#212121] whitespace-nowrap ${
                        isColSelected ? 'bg-[#E6F2EB]/60' : 'bg-[#F8F8F8]'
                      }`}
                      style={{ minWidth: 165 }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/* Virtualized Worksheet Cells */}
          <tbody>
            {rowVirtualizer.getVirtualItems().length === 0 ? (
              <tr>
                <td
                  colSpan={safeSchemaColumns.length + 1}
                  className="text-center py-12 text-xs text-[#605E5C]"
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
                  const isRowSelected = selectedCell.rowIndex === rowIndex;

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-[#F5F5F5] transition-none"
                      style={{ height: '24px' }}
                    >
                      {/* Sticky Excel Row Number Header */}
                      <td
                        onClick={() =>
                          setSelectedCell((prev) => ({
                            ...prev,
                            rowIndex,
                          }))
                        }
                        className={`sticky left-0 z-10 w-11 min-w-[44px] h-[24px] px-1 text-center text-[12px] select-none cursor-pointer border-b ${
                          isRowSelected
                            ? 'bg-[#E6F2EB] text-[#217346] font-bold border-r-2 border-r-[#217346] border-b-[#D4D4D4]'
                            : 'bg-[#F3F3F3] text-[#444444] font-normal border-r border-r-[#D4D4D4] border-b-[#D4D4D4]'
                        }`}
                      >
                        {rowIndex}
                      </td>

                      {/* Worksheet Cells */}
                      {row.getVisibleCells().map((cell, colIdx) => {
                        const isCellSelected =
                          selectedCell.rowIndex === rowIndex && selectedCell.colIndex === colIdx;
                        return (
                          <td
                            key={cell.id}
                            onClick={() =>
                              setSelectedCell({
                                rowIndex,
                                colIndex: colIdx,
                                colName: cell.column.id,
                              })
                            }
                            className={`relative h-[24px] px-2 py-0 border-r border-b border-[#E1E1E1] whitespace-nowrap cursor-cell ${
                              isCellSelected ? 'bg-white z-10' : ''
                            }`}
                            style={{
                              minWidth: 165,
                              ...(isCellSelected
                                ? {
                                    outline: '2px solid #217346',
                                    outlineOffset: '-2px',
                                  }
                                : {}),
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            {/* Visual Excel Fill Handle square on selected cell */}
                            {isCellSelected && (
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-[2px] -right-[2px] w-[5px] h-[5px] bg-[#217346] border border-white z-20"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* EXCEL SHEET TABS BAR (Bottom Dataset Switcher + '+' Upload Sheet Button) */}
      <div className="h-7 bg-[#E6E6E6] border-t border-[#D4D4D4] px-2 flex items-center justify-between gap-2 select-none shrink-0">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto h-full">
          {/* Sheet Tab Scroll Arrows */}
          <div className="flex items-center gap-0.5 pr-1 text-[#605E5C] shrink-0">
            <span className="px-1 text-[11px] hover:text-[#212121] cursor-default">◂</span>
            <span className="px-1 text-[11px] hover:text-[#212121] cursor-default">▸</span>
          </div>

          {/* Dataset Sheet Tabs */}
          {safeDatasets.map((ds) => {
            const isActiveSheet = ds.id === selectedDataset.id;
            return (
              <button
                key={ds.id}
                type="button"
                onClick={() => selectDataset(ds.id)}
                title={`${ds.name} (${ds.row_count.toLocaleString()} rows)`}
                className={`h-[24px] px-3 text-[12px] flex items-center gap-1.5 whitespace-nowrap border-x transition-colors shrink-0 ${
                  isActiveSheet
                    ? 'bg-white text-[#217346] font-bold border-[#D4D4D4] border-b-2 border-b-[#217346] shadow-sm'
                    : 'bg-[#E6E6E6] hover:bg-[#F3F3F3] text-[#444444] font-normal border-transparent hover:border-[#D4D4D4]'
                }`}
              >
                <FileSpreadsheet size={12} className={isActiveSheet ? 'text-[#217346]' : 'text-[#605E5C]'} />
                <span className="max-w-[160px] truncate">{ds.name}</span>
              </button>
            );
          })}

          {/* '+' New Sheet / Upload Dataset Action */}
          <input
            type="file"
            ref={sheetUploadInputRef}
            className="hidden"
            accept=".csv,.xlsx,.xls,.parquet"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                uploadDataset(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => sheetUploadInputRef.current?.click()}
            title="Upload / Add Sheet (.xlsx, .csv)"
            className="w-6 h-6 ml-0.5 flex items-center justify-center rounded-full hover:bg-[#D4D4D4] text-[#444444] hover:text-[#212121] transition-colors shrink-0"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* EXCEL STATUS BAR */}
      <div
        className="h-6 text-white px-3 flex items-center justify-between text-[12px] select-none shrink-0"
        style={{
          background: 'linear-gradient(180deg, #1F8049 0%, #1A6E40 100%)',
          boxShadow: '0 -1px 3px rgba(15,23,32,0.12)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5 font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#92D5AE] shrink-0" />
            Ready
          </span>
          <span className="text-white/50">|</span>
          <span className="truncate">
            Rows: {filteredRows.toLocaleString()} · Cols: {safeSchemaColumns.length}
          </span>
          <span className="hidden sm:inline text-white/50">|</span>
          <span className="hidden sm:inline font-mono text-[11px] text-white/90">
            Cell: {getExcelColumnLetter(selectedCell.colIndex)}
            {selectedCell.rowIndex}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[12px]">
          {statusBarStats.avg !== null && (
            <span>Average: {statusBarStats.avg.toLocaleString()}</span>
          )}
          <span>Count: {statusBarStats.count.toLocaleString()}</span>
          {statusBarStats.sum !== null && (
            <span>Sum: {statusBarStats.sum.toLocaleString()}</span>
          )}
          <span className="text-white/50">|</span>
          <span>100%</span>
        </div>
      </div>

      {/* Floating Column Unique Values Dropdown Menu (Excel AutoFilter Menu) */}
      {openDropdownCol && (
        <div
          ref={dropdownRef}
          data-testid="column-unique-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: 280 }}
          className="fixed z-50 bg-white border border-[#8A8886] rounded-[2px] shadow-lg flex flex-col overflow-hidden text-[#212121]"
        >
          {/* Dropdown Header */}
          <div className="px-3 py-2 bg-[#F3F3F3] border-b border-[#D4D4D4] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {activeColSchema && getTypeIcon(activeColSchema.data_type)}
              <span className="text-[12px] font-bold text-[#212121] truncate">
                {openDropdownCol}
              </span>
              <span className="px-1.5 py-0.5 rounded-[2px] text-[11px] font-mono bg-[#E6F2EB] text-[#217346] border border-[#217346]/30 shrink-0">
                {allUniqueItems.length} unique
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenDropdownCol(null)}
              className="p-1 text-[#605E5C] hover:text-[#212121] hover:bg-[#E6E6E6] rounded-[2px] transition-colors"
              title="Close dropdown"
            >
              <X size={13} />
            </button>
          </div>

          {/* Quick Sort Row */}
          <div className="px-2 py-1.5 border-b border-[#D4D4D4] bg-white flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColumnSort(openDropdownCol, 'asc')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-[2px] text-[12px] font-medium border transition-colors ${
                sortConditions.some((s) => s.column === openDropdownCol && s.direction === 'asc')
                  ? 'bg-[#E6F2EB] border-[#217346] text-[#217346]'
                  : 'bg-white border-[#D4D4D4] text-[#212121] hover:bg-[#E6E6E6]'
              }`}
            >
              <ArrowUp size={11} />
              <span>Sort A → Z</span>
            </button>
            <button
              type="button"
              onClick={() => setColumnSort(openDropdownCol, 'desc')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-[2px] text-[12px] font-medium border transition-colors ${
                sortConditions.some((s) => s.column === openDropdownCol && s.direction === 'desc')
                  ? 'bg-[#E6F2EB] border-[#217346] text-[#217346]'
                  : 'bg-white border-[#D4D4D4] text-[#212121] hover:bg-[#E6E6E6]'
              }`}
            >
              <ArrowDown size={11} />
              <span>Sort Z → A</span>
            </button>
          </div>

          {/* Search Unique Values Input */}
          <div className="p-2 border-b border-[#D4D4D4] bg-[#F8F8F8]">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2 text-[#605E5C]" />
              <input
                type="text"
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                placeholder={`Search ${allUniqueItems.length} unique values...`}
                className="w-full bg-white border border-[#8A8886] rounded-[2px] pl-7 pr-6 py-1 text-[12px] text-[#212121] placeholder-[#605E5C] focus:outline-none focus:border-[#217346]"
                autoFocus
              />
              {dropdownSearch && (
                <button
                  type="button"
                  onClick={() => setDropdownSearch('')}
                  className="absolute right-2 top-2 text-[#605E5C] hover:text-[#212121]"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Select All & Selection Counter Bar */}
          <div className="px-3 py-1.5 bg-[#F3F3F3] border-b border-[#D4D4D4] flex items-center justify-between text-[12px]">
            <label
              onClick={() => handleToggleSelectAllVisible(openDropdownCol)}
              className="flex items-center gap-2 cursor-pointer text-[#212121] font-medium select-none"
            >
              <span
                className={`w-3.5 h-3.5 rounded-[2px] flex items-center justify-center border transition-colors ${
                  isAllVisibleSelected
                    ? 'bg-[#217346] border-[#217346] text-white'
                    : 'border-[#8A8886] bg-white'
                }`}
              >
                {isAllVisibleSelected && <Check size={10} strokeWidth={3} />}
              </span>
              <span>(Select All)</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[#605E5C] font-mono text-[11px]">
                {activeColSelectedKeys.size}/{allUniqueItems.length}
              </span>
              {safeColumnFilters[openDropdownCol] && (
                <button
                  type="button"
                  onClick={() => setColumnValueFilter(openDropdownCol, null)}
                  className="text-[11px] text-[#217346] hover:underline font-medium"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Unique Values List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-[#E1E1E1] grid-scrollbar bg-white">
            {filteredUniqueItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#605E5C]">
                No matching unique values
              </div>
            ) : (
              filteredUniqueItems.map((item) => {
                const isChecked = activeColSelectedKeys.has(item.key);
                return (
                  <div
                    key={item.key}
                    onClick={() => handleToggleUniqueValue(openDropdownCol, item.key)}
                    className="group/item px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-[#E6E6E6] cursor-pointer transition-colors select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-3.5 h-3.5 rounded-[2px] flex items-center justify-center border shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-[#217346] border-[#217346] text-white'
                            : 'border-[#8A8886] bg-white'
                        }`}
                      >
                        {isChecked && <Check size={10} strokeWidth={3} />}
                      </span>

                      {item.isNull ? (
                        <span className="text-[12px] italic text-[#605E5C] font-mono truncate">
                          {item.displayLabel}
                        </span>
                      ) : item.isBoolean ? (
                        <span className="px-1.5 py-0.2 rounded-[2px] text-[11px] font-semibold bg-[#E6F2EB] text-[#217346]">
                          {item.displayLabel}
                        </span>
                      ) : (
                        <span
                          className="text-[12px] font-mono text-[#212121] truncate"
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
                        className="opacity-0 group-hover/item:opacity-100 px-1.5 py-0.5 rounded-[2px] bg-[#217346] text-white text-[10px] font-semibold transition-all"
                        title={`Show only "${item.displayLabel}"`}
                      >
                        Only
                      </button>
                      <span className="text-[11px] font-mono text-[#605E5C] bg-[#F3F3F3] border border-[#D4D4D4] px-1.5 py-0.2 rounded-[2px]">
                        {item.count}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="px-3 py-2 bg-[#F3F3F3] border-t border-[#D4D4D4] flex items-center justify-between gap-2">
            {safeColumnFilters[openDropdownCol] &&
            safeColumnFilters[openDropdownCol].length > 0 ? (
              <button
                type="button"
                onClick={() => handleAddFilterAsPipelineStep(openDropdownCol)}
                className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-[12px] font-medium bg-[#E6F2EB] hover:bg-[#cce5d6] text-[#217346] border border-[#217346] transition-colors"
                title="Promote selected values to an Applied Step"
              >
                <Plus size={11} />
                <span>Add as Step</span>
              </button>
            ) : (
              <span className="text-[11px] text-[#605E5C]">
                Click values to filter table
              </span>
            )}

            <button
              type="button"
              onClick={() => setOpenDropdownCol(null)}
              className="px-3 py-1 rounded-[2px] text-[12px] font-semibold bg-[#217346] hover:bg-[#185C37] text-white transition-colors"
            >
              OK
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
      return <Hash size={12} className="text-[#605E5C]" />;
    case 'date':
      return <Calendar size={12} className="text-[#605E5C]" />;
    case 'timestamp':
      return <Clock size={12} className="text-[#605E5C]" />;
    case 'boolean':
      return <ToggleLeft size={12} className="text-[#217346]" />;
    default:
      return <Type size={12} className="text-[#605E5C]" />;
  }
}

function getSortIcon(colName: string, sortConditions: any[]) {
  const current = sortConditions.find((s) => s.column === colName);
  if (!current) return null;
  return current.direction === 'asc' ? (
    <ArrowUp size={11} className="text-[#217346]" />
  ) : (
    <ArrowDown size={11} className="text-[#217346]" />
  );
}
