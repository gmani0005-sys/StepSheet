# StepSheet Feature Audit & Gap Analysis Matrix

**Audit Date**: 2026-11-08  
**Scope**: Verification of existing codebase against the Excel-Replica Data Preparation & Analysis Specification.  
**Statuses Used**: `Complete`, `Partial`, `Missing`, `Buggy`, `Needs UX improvement`.

---

## 1. Executive Summary & Architecture Overview

The StepSheet application is a functional Excel-replica and visual data preparation workbench comprising:
1. **Frontend (`apps/web`)**: React 18, TypeScript, Tailwind CSS, TanStack React Table v8 (with row virtualizer), Zustand store (`workbenchStore.ts`), Lucide icons, Vitest.
2. **Local Engine (`apps/web/src/api/localEngine.ts`)**: In-browser client-side execution sandbox supporting offline/standalone deployment, full transformation execution, formula evaluation, profiling, and export.
3. **Backend API (`apps/api`)**: Python 3.12, FastAPI, DuckDB analytical engine, Polars, SQLAlchemy, Pytest.
4. **Standalone Packager (`scripts/build_singlefile.py`)**: Assembles `StepSheet.html` into a self-contained ~1MB single-file executable for cross-platform sharing.
5. **State & Pipeline Management**: Structured step history (`StepDefinition`), undo/redo stack, step duplication/reordering/enabling/disabling, DuckDB SQL compilation, Polars Python code generation, and Power Query M generation.

Baseline test status before modifications:
- **Web (Vitest)**: 46/46 passed (100%).
- **Backend (Pytest)**: 68/68 passed (100%).

---

## 2. Comprehensive Feature Gap Matrix

| # | Feature | Current Status | Existing Implementation | Gap | Proposed Change | Dependencies | Test Required |
|---|---------|----------------|-------------------------|-----|-----------------|--------------|---------------|
| **A1** | Import Excel (`.xlsx`, `.xls`) | Complete | Polars `pl.read_excel` on backend; client handles packaged workbooks & CSV/TSV. | Multi-sheet picker dialog when workbook contains >1 sheet. | Add sheet selection preview dialog when opening multi-sheet Excel workbooks. | `localEngine.ts`, `api.ts` | Test multi-sheet Excel load. |
| **A2** | Import CSV / TSV / Delimited | Complete | DuckDB `read_csv_auto` & `parseDelimitedText` in `localEngine.ts`. | None. Fully functional. | Maintain as-is. | None | Verified in test suite. |
| **A3** | Import multiple files together | Partial | File upload `<input type="file">` in `LeftPanel` and `TopBar` only takes 1 file. | Cannot select multiple files at once to ingest batch tables. | Add `multiple` attribute to file inputs and iterate files in `handleFileUpload`. | `LeftPanel.tsx`, `TopBar.tsx`, `workbenchStore.ts` | Test selecting 3 files simultaneously. |
| **A4** | Preview data before loading | Partial | Datasets load directly into grid without a pre-load configuration wizard. | Non-technical users cannot preview first 10 rows, confirm delimiters, or choose headers before committing. | Add guided File Import Preview modal showing sample rows, detected delimiter, and header confirmation. | New `ImportPreviewModal.tsx`, `workbenchStore.ts` | Test import preview dialog. |
| **A5** | Promote / Demote Headers | Missing | First row is automatically treated as header during ingestion; no manual toggle. | Cannot promote row 1 to header or demote header to row 1. | Add `promote_headers` step (`Promote First Row as Headers`) and `demote_headers`. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test header promotion and demotion. |
| **A6** | Rename Queries / Datasets | Complete | `renameConnectionQuery` in store and pencil icon in `LeftPanel`. | None. | Maintain as-is. | None | Verified in store. |
| **A7** | Source metadata display | Complete | Shows filename, row count, column count, and size in `LeftPanel` dataset item. | None. | Maintain as-is. | None | Verified in UI. |
| **B1** | Rename column | Complete | `rename_column` step with validation and visual editor. | None. | Maintain as-is. | None | Verified in tests. |
| **B2** | Delete / Remove columns | Partial | Can remove columns via unpivot or select in joins, but no direct "Remove Columns" step. | Users cannot select columns to drop or keep selected columns. | Add dedicated `remove_column` (Drop Columns / Keep Columns) step. | `steps.ts`, `localEngine.ts`, `step_compiler.py`, `EditStepModal.tsx` | Test dropping single and multiple columns. |
| **B3** | Reorder columns | Missing | Columns maintain schema order; cannot drag or move columns left/right. | No recorded `reorder_columns` step. | Add `reorder_columns` step with Move Left, Move Right, or drag-and-drop order editor. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test reordering columns. |
| **B4** | Add custom / calculated column | Complete | `custom_column` step with static value and formula expression modes. | None. Unconstrained and tested. | Maintain as-is. | None | Verified in tests. |
| **B5** | Conditional column | Complete | `conditional` step (`IF / IFS / SWITCH` builder). | None. | Maintain as-is. | None | Verified in tests. |
| **B6** | Change column data type | Complete | `change_type` step (`text`, `integer`, `float`, `date`, `boolean`). | None. | Maintain as-is. | None | Verified in tests. |
| **B7** | Fill Down / Fill Up | Complete | `fill_down` step with direction `'down' \| 'up'`. | None. | Maintain as-is. | None | Verified in tests. |
| **B8** | Replace values | Complete | `replace_values` step with match types (`exact`, `contains`, `is_null`). | None. | Maintain as-is. | None | Verified in tests. |
| **B9** | Column Profiling popover | Complete | `ColumnProfilePopover` shows frequency, distinct count, null count, min/max/sum/avg, and histogram. | None. | Maintain as-is. | None | Verified in tests. |
| **C1** | Sort ascending / descending | Complete | `sort_rows` step and column header clicks. | Single-column only in step params. | Expand `sort_rows` to support multi-column priority sort keys. | `steps.py`, `localEngine.ts`, `step_compiler.py` | Test multi-key sort. |
| **C2** | Text filters | Partial | Operators: `eq`, `neq`, `contains`, `starts_with`, `ends_with`, `is_null`, `is_not_null`. | Missing `does_not_contain`, `in` (list of values), `not_in`. | Add `not_contains`, `in`, `not_in` to filter operators. | `FilterRowsParams`, `localEngine.ts`, `step_compiler.py` | Test `not_contains` and `in`. |
| **C3** | Numeric filters | Partial | Standard comparisons exist (`gt`, `gte`, `lt`, `lte`). | Missing `between` and `top_n` / `bottom_n`. | Add `between` numeric filter and `top_bottom_n` analysis filter. | `FilterRowsParams`, `localEngine.ts` | Test `between` numeric filter. |
| **C4** | Searchable checklist filter | Complete | Column header dropdown (AutoFilter) lists unique values with count badges. | Currently client-side view filter; not saved as a step. | Add "Apply as Step" button in column dropdown to convert checklist into a recorded `filter_rows` step. | `DataGrid.tsx`, `workbenchStore.ts` | Test saving checklist filter as step. |
| **C5** | Combined filter rules (AND/OR) | Partial | Multiple steps chain as AND. | Cannot specify OR conditions inside a single filter step. | Add multi-rule filter builder with AND/OR combinator. | `FilterRowsParams`, `StepBuilderModal.tsx` | Test OR condition filtering. |
| **D1** | Remove Duplicates | Complete | `remove_duplicates` step with key column selection and `keep: 'first' \| 'last'`. | Missing "Show Duplicates Only" option to audit duplicates without deleting. | Add `keep_mode: 'first' \| 'last' \| 'duplicates_only'`. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test `duplicates_only` filter. |
| **D2** | Missing & Null Values Handling | Partial | `replace_values` with `is_null` replaces nulls; `filter_rows` drops nulls. | No numeric imputation (mean, median) or guided missing-values cleaning wizard. | Add `handle_missing` / imputation step (Mean, Median, Fixed value, Mode) with preview. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test mean & median imputation. |
| **D3** | Text Cleaning - Trim & Clean | Complete | `text_transform` supports `trim` and `clean` (non-printables). | Missing `clean_spaces` (collapse repeated consecutive spaces). | Add `clean_spaces` to `text_transform`. | `TextTransformParams`, `localEngine.ts` | Test space collapsing. |
| **D4** | Text Cleaning - Case | Complete | `text_transform` supports `upper`, `lower`, `proper`. | None. | Maintain as-is. | None | Verified in tests. |
| **D5** | Text Cleaning - Value Mapping | Missing | No category standardization / mapping table tool. | Cannot map multiple aliases (e.g. `USA`, `U.S.`, `United States`) to one canonical label. | Add `standardize_values` step with visual mapping table editor. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test category mapping. |
| **D6** | Text Cleaning - Split & Substring | Complete | `split_column` and `text_transform` (`left`, `right`, `mid`, `extract_delimiter`). | Missing split by fixed character count / position. | Add `split_by_position` option to split tool. | `localEngine.ts`, `StepBuilderModal.tsx` | Test split by position. |
| **D7** | Numeric Cleaning - Symbols & Currencies | Missing | Raw `change_type` to number fails on `$1,250.00` or `15%`. | Cannot clean currency symbols, commas, and percentage strings into numbers. | Add `clean_numeric` operation to strip `$`, `€`, `£`, commas, `%` and parse float. | `math_transform`, `localEngine.ts` | Test `$1,250.00` $\rightarrow$ `1250.0`. |
| **D8** | Numeric Cleaning - Outliers | Missing | No automated outlier identification. | Cannot flag or isolate outliers using statistical criteria (IQR, Z-score). | Add `flag_outliers` step using $Q1 - 1.5 \times IQR$ / $Q3 + 1.5 \times IQR$. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test IQR outlier flagging. |
| **D9** | Date Cleaning - Parts & EOMonth | Complete | `date_transform` supports `extract_part`, `eomonth`, `datedif`, `add_time`, `fiscal_year`. | None. | Maintain as-is. | None | Verified in tests. |
| **D10** | Date Cleaning - Working Days | Missing | No business days calculation. | Missing `networkdays` (business days excluding weekends). | Add `networkdays` operation to `date_transform` and formula engine. | `DateTransformParams`, `localEngine.ts` | Test business days calculation. |
| **E1** | Append datasets | Complete | Single and multi-table stacking with dual listbox, column alignment by name, custom discriminator column, incremental deduplication. | None. Fully complete. | Maintain as-is. | None | Verified in tests. |
| **E2** | Merge / Join datasets | Complete | `JoinBuilderModal` supports Inner, Left, Right, Full, Anti, Semi joins, multi-key mapping, key health check. | None. Fully complete. | Maintain as-is. | None | Verified in tests. |
| **E3** | Pivot & Unpivot | Complete | `PivotUnpivotModal` supports interactive PivotTable with aggregations (sum, count, avg, min, max) and Unpivot. | None. | Maintain as-is. | None | Verified in tests. |
| **E4** | Group By & Aggregate | Complete | `GroupByModal` supports multiple grouping keys and multiple aggregations (sum, count, avg, min, max, distinct count). | None. | Maintain as-is. | None | Verified in tests. |
| **E5** | Transpose Table | Missing | Reshaping entire table by swapping rows and columns is not implemented. | Cannot transpose table dimensions. | Add `transpose` step with column header selection. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test table transpose. |
| **E6** | Remove / Keep Rows | Missing | Filtering can remove rows, but no dedicated "Remove Top N", "Remove Bottom N", "Remove Blank Rows". | Quick row slicing requires technical formulas instead of guided actions. | Add `remove_rows` step (`top_n`, `bottom_n`, `blank_rows`, `alternate_rows`). | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test removing top 5 rows and blank rows. |
| **F1** | Guided Formula Builder | Needs UX improvement | `custom_column` has formula mode with chips, but lacks a full categorized function catalog and argument builder. | Non-technical users need a searchable function library with categories, argument labels, examples, and live preview. | Build a dedicated `FormulaBuilderModal` with 50+ Excel functions organized by category, argument pickers, syntax preview, and sample row evaluation. | New `FormulaBuilderModal.tsx`, `localEngine.ts` | Test formula builder across text, math, date, logical, and stats. |
| **G1** | Dataset Overview & Quality Summary | Partial | Column profile exists per column; `QualityModal` tests user-defined rules. | No single-pane overview of dataset health (total duplicate rows, missing values % across table, type mismatches). | Add Dataset Quality Summary card in Quality & Profiling views. | `QualityModal.tsx`, `workbenchStore.ts` | Test dataset-wide quality metrics. |
| **H1** | Top N / Bottom N Analysis | Missing | User has to manually sort and filter. | No 1-click guided "Keep Top 10 by Sales" or "Bottom 5 by Margin". | Add `top_bottom_n` step with rank ordering and optional group partition. | `steps.ts`, `localEngine.ts`, `step_compiler.py` | Test Top 10 filtering. |
| **H2** | Analysis & Ranking Calculations | Complete | `window_calc` supports `rank`, `running_total`, `percent_of_total`, `moving_avg`, `lag`, `lead`. | Dedicated 1-click "Difference from Previous Period" action. | Add `diff_from_previous` preset to `window_calc`. | `WindowCalcModal.tsx`, `localEngine.ts` | Test diff from previous calculation. |
| **I1** | Visual Analytics & Dashboard | Complete | `DashboardModal` with 16 visual types (Waterfall, Gauge, Funnel, Stacked Area, Clustered Bar/Column, Donut, Pie, Slicers, KPI cards, etc.). | None. Fully complete and verified. | Maintain as-is. | None | Verified in tests. |
| **J1** | Export & Delivery | Complete | Multi-tab `.xlsx` with live formulas and metadata, `.csv`, `.sswb.html` packaged workbook, `.pdf` executive dashboard report. | None. Fully complete and verified. | Maintain as-is. | None | Verified in tests. |
| **K1** | Navigation & Menu Organization | Needs UX improvement | TopBar ribbon currently has `Home \| Formulas \| Data \| Join \| Quality \| View \| Help`. | Clean, Transform, and Analysis tools are spread across scattered submenus. | Streamline Ribbon tabs to `Home`, `Transform`, `Clean`, `Filter & Sort`, `Analyse`, `Formulas`, `View`, and `Export` matching specification. | `TopBar.tsx` | Test ribbon tabs navigation. |

---

## 3. Prioritized Implementation Plan

Based on the audit, the work is organized into 5 focused, non-disruptive implementation phases:

### Phase 1: Essential Data Cleaning & Preprocessing Suite
- Implement `clean_numeric`: Strip currency symbols (`$`, `€`, `£`), thousands commas, `%`, and convert to clean numeric values.
- Implement `clean_spaces`: Collapse multiple consecutive whitespace characters into a single space.
- Implement `duplicates_only`: Add ability to filter and retain only duplicate records to audit duplicate occurrences.
- Implement `standardize_values`: Value mapping table to standardize multiple aliases into canonical categories.
- Implement `impute_missing`: Numeric imputation with column Mean, Median, Mode, or Fixed value with warning and preview.
- Implement `flag_outliers`: IQR-based outlier detector ($Q1 - 1.5 \times IQR$ to $Q3 + 1.5 \times IQR$).
- Implement `networkdays`: Calculate business days between two dates excluding weekends.

### Phase 2: Core Table Reshape & Row/Column Management
- Implement `remove_column`: Select multiple columns to drop or keep only selected columns.
- Implement `reorder_columns`: Adjust column ordering.
- Implement `promote_headers` & `demote_headers`: Promote first row to headers and demote headers to data row.
- Implement `remove_rows`: Guided dialog to remove top N rows, bottom N rows, remove blank rows, or keep top N rows.
- Implement `transpose`: Table transposition.

### Phase 3: Enhanced Filtering & Sorting
- Implement multi-column sorting: Extend `sort_rows` to support an array of priority sort keys (`sort_keys`).
- Expand filter operators: Add `not_contains`, `between` (numeric/date), and `in` (list of values) with AND/OR combinator support.
- Implement `top_bottom_n`: Guided step to keep Top N or Bottom N records by column.

### Phase 4: Guided Formula Builder & Function Catalog
- Implement `FormulaBuilderModal`:
  - Searchable function catalogue by category (Maths, Logical, Text, Date/Time, Lookup/Reference, Statistics, Information).
  - Plain-language function descriptions, argument labels, and usage examples.
  - Column picker for arguments, operator picker, and literal inputs.
  - Formula syntax validator and live sample row preview.

### Phase 5: Navigation, Ribbon Reorganization & Multi-File Ingestion
- Streamline Ribbon menu in `TopBar.tsx` into clearly labeled tabs: **Home**, **Transform**, **Clean**, **Filter & Sort**, **Analyse**, **Formulas**, **View**, and **Export**.
- Enable multiple file selection in file inputs for batch dataset loading.
- Add comprehensive unit tests in `apps/web` and backend tests in `apps/api`.
- Rebuild standalone `StepSheet.html` distribution.
