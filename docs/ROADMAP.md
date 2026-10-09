# StepSheet Implementation Roadmap

## Phase 1: Foundation (Current)
- [x] Repository scaffold, monorepo layout, Docker Compose, .env config
- [x] Auth system (email/password with argon2, JWT access & refresh tokens, `/join`, `/login`)
- [x] Storage abstraction (Local filesystem + MinIO S3 adapter)
- [x] DuckDB-backed dataset registry (CSV and XLSX upload, Parquet conversion, row pagination)
- [x] Virtualized data grid (TanStack Table + TanStack Virtual with smooth scrolling)
- [x] Column profiling engine (null %, distinct count, min/max, top values, histogram generation)
- [x] Automated unit and integration tests for auth, upload, and profiling

## Phase 2: Step Engine Core
- [ ] Shared JSON Step Specification (`packages/step-spec`)
- [ ] Pipeline runner & DuckDB SQL compiler
- [ ] UI Applied Steps panel (reorder, disable, delete, duplicate, undo/redo)
- [ ] Step types: Change type, Rename, Filter, Sort, Remove duplicates, Fill down/up, Replace values, Split column
- [ ] Live preview on 200-row sample

## Phase 3: Lookup & Join Suite
- [ ] VLOOKUP, HLOOKUP, XLOOKUP, INDEX-MATCH wizards
- [ ] Append (Union) with column alignment
- [ ] Dedicated visual Join Builder (Inner, Left, Right, Full, Semi, Anti, Cross, Self, Range, Fuzzy)
- [ ] Pre-join health check & cardinality verdict (1:1, 1:N, N:1, N:N)
- [ ] Join result report & multi-table visual canvas

## Phase 4: Logic, Aggregation, Text, Date, Math Wizards
- [ ] IF / IFS / SWITCH rule builder
- [ ] SUMIFS, COUNTIFS, AVERAGEIFS, Group By, Pivot, Unpivot, Window functions
- [ ] Text wizard (Trim, Clean, Case, Left/Right/Mid, Regex extract/replace)
- [ ] Date & Time wizard (Parse date, EOMONTH, DATEDIF, NETWORKDAYS, Fiscal periods)
- [ ] Numeric wizard (Arithmetic, Rounding, Bucketing, Formatting)

## Phase 5: Data Integrity & Quality Rules
- [ ] Quality rules builder (not-null, unique, range, allowed values, regex, referential integrity)
- [ ] Quality Report with downloadable failing rows
- [ ] Cross-table reconciliation

## Phase 6: Exporters
- [ ] XLSX export with live dynamic formulas (XLOOKUP, SUMIFS, IF)
- [ ] Power Query M script generator
- [ ] DuckDB / ANSI SQL generator
- [ ] Python (Polars) script generator
- [ ] Pipeline JSON import/export

## Phase 7: Collaboration, Hardening & Production
- [ ] Project versioning & diff viewer
- [ ] Sharing with role-based access
- [ ] Optional LLM "Describe it in plain English" adapter (Ollama/OpenAI)
- [ ] Performance benchmarks & security hardening
