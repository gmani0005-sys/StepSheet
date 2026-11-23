/**
 * Code export: turns a pipeline into DuckDB SQL, Python (Polars) and Power
 * Query M that reproduce what the StepSheet engine computes.
 *
 * Each step is translated with the engine's own rules (see localEngine.ts):
 *  - text matches ignore case and surrounding spaces;
 *  - numbers stored as text ("1,200.50", "₹450", "99,5") are read as numbers;
 *  - blanks are skipped by aggregates and never match a join or lookup key;
 *  - row order is kept exactly (SQL carries a row id; Polars keeps order).
 * A step or option that cannot be expressed faithfully makes the generated
 * code stop with a clear message instead of running different logic, and is
 * listed in `unsupported`. Known differences (stated in every script header):
 * Excel errors such as #VALUE! come out as blank, and the more exotic
 * number/date spellings the engine accepts may not be read.
 */
import type { StepDefinition } from '../types/steps';
import { parseFormulaAst, type FormulaAst } from './formula';
import { parseSharedDate, parseSharedNumber, toISODate } from './values';

export type ColumnKind = 'number' | 'date' | 'text';

export interface CodegenStepInput {
  step: StepDefinition;
  /** Columns of the table entering this step, in order. */
  columnsIn: string[];
  /** Columns of the table this step produces, in order. */
  columnsOut: string[];
  /** What the non-blank values of each incoming column look like. */
  kindsIn: Record<string, ColumnKind>;
}

export interface CodegenDataset {
  id: string;
  name: string;
  columns: string[];
}

export interface CodegenContext {
  datasetName: string;
  sourceColumns: string[];
  datasets: CodegenDataset[];
}

export interface UnsupportedStep {
  index: number;
  label: string;
  language: 'sql' | 'polars' | 'power_query_m';
  reason: string;
}

export interface GeneratedPipelineCode {
  sql: string;
  polars: string;
  power_query_m: string;
  unsupported: UnsupportedStep[];
  per_step: { index: number; sql: string; polars: string; power_query_m: string }[];
}

class Unsupported extends Error {}
const unsupported = (why: string): never => {
  throw new Unsupported(why);
};

// ---------------------------------------------------------------- quoting
const qi = (name: string) => `"${String(name).replace(/"/g, '""')}"`;
const ql = (v: any) => `'${String(v).replace(/'/g, "''")}'`;
const py = (v: any): string => {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'None';
  return JSON.stringify(String(v));
};
const mi = (name: string) => `#"${String(name).replace(/"/g, '""')}"`;
const ms = (v: any) => `"${String(v).replace(/"/g, '""')}"`;
const mv = (v: any): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return ms(v);
};
const sqlLit = (v: any): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return ql(v);
};
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeIdent = (s: string) => {
  const t = String(s || 'dataset').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return /^[a-z_]/.test(t) ? t : `t_${t || 'dataset'}`;
};

// ---------------------------------------------------------------- preambles
const SQL_PRELUDE = `-- StepSheet pipeline as DuckDB SQL (DuckDB 1.0+).
-- Load each source first, e.g.:
--   CREATE TABLE {SOURCE} AS SELECT * FROM read_csv('{SOURCE_FILE}', all_varchar = true);
-- The macros below copy StepSheet's rules: text matches ignore case and
-- surrounding spaces, numbers stored as text are read as numbers, blanks are
-- skipped. Excel errors such as #VALUE! come out as NULL.
CREATE OR REPLACE TEMP MACRO ss_str(x) AS CASE WHEN typeof(x) IN ('DOUBLE', 'FLOAT') THEN regexp_replace(CAST(x AS VARCHAR), '\\.0$', '') ELSE CAST(x AS VARCHAR) END;
CREATE OR REPLACE TEMP MACRO ss_empty(x) AS (x IS NULL OR CAST(x AS VARCHAR) = '');
CREATE OR REPLACE TEMP MACRO ss_txt(x) AS lower(trim(ss_str(x)));
CREATE OR REPLACE TEMP MACRO ss_key(x) AS COALESCE(lower(trim(ss_str(x))), '');
CREATE OR REPLACE TEMP MACRO ss_core(t) AS CASE
  WHEN t IS NULL OR t = '' THEN NULL
  WHEN regexp_full_match(t, '[-+]?\\d{1,3}(,\\d{3})+(\\.\\d+)?') THEN TRY_CAST(replace(t, ',', '') AS DOUBLE)
  WHEN regexp_full_match(t, '[-+]?\\d{1,2}(,\\d{2})+,\\d{3}(\\.\\d+)?') THEN TRY_CAST(replace(t, ',', '') AS DOUBLE)
  WHEN regexp_full_match(t, '[-+]?\\d{1,3}(\\.\\d{3})+,\\d+') OR regexp_full_match(t, '[-+]?\\d{1,3}(\\.\\d{3}){2,}') THEN TRY_CAST(replace(replace(t, '.', ''), ',', '.') AS DOUBLE)
  WHEN regexp_full_match(t, '[-+]?\\d+,\\d+') THEN TRY_CAST(replace(t, ',', '.') AS DOUBLE)
  WHEN regexp_full_match(t, '[-+]?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?') THEN TRY_CAST(t AS DOUBLE)
  ELSE NULL END;
CREATE OR REPLACE TEMP MACRO ss_paren(t) AS CASE WHEN regexp_full_match(t, '\\(.*\\)') THEN '-' || substr(t, 2, length(t) - 2) ELSE t END;
CREATE OR REPLACE TEMP MACRO ss_num(x) AS CASE WHEN typeof(x) IN ('BIGINT', 'INTEGER', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'SMALLINT', 'TINYINT') THEN CAST(x AS DOUBLE) ELSE ss_core(ss_paren(regexp_replace(replace(replace(trim(CAST(x AS VARCHAR)), '−', '-'), '–', '-'), '[\\s\\x{00A0}\\x{202F}$€£¥₹%]|^(USD|EUR|GBP|INR|JPY)|(USD|EUR|GBP|INR|JPY)$', '', 'g'))) END;
CREATE OR REPLACE TEMP MACRO ss_num_eu(x) AS TRY_CAST(replace(replace(regexp_replace(trim(CAST(x AS VARCHAR)), '[\\s\\x{00A0}$€£¥₹]', '', 'g'), '.', ''), ',', '.') AS DOUBLE);
CREATE OR REPLACE TEMP MACRO ss_num_us(x) AS TRY_CAST(regexp_replace(trim(CAST(x AS VARCHAR)), '[\\s\\x{00A0},$€£¥₹]', '', 'g') AS DOUBLE);
CREATE OR REPLACE TEMP MACRO ss_date(x) AS CASE
  WHEN x IS NULL OR trim(CAST(x AS VARCHAR)) = '' THEN NULL
  WHEN typeof(x) = 'DATE' THEN CAST(x AS DATE)
  WHEN regexp_full_match(trim(CAST(x AS VARCHAR)), '\\d{5}(\\.0)?') THEN DATE '1899-12-30' + CAST(CAST(trim(CAST(x AS VARCHAR)) AS DOUBLE) AS INTEGER)
  ELSE COALESCE(
    TRY_CAST(trim(CAST(x AS VARCHAR)) AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%Y%m%d') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%d %b %Y') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%d %B %Y') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%B %d, %Y') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%b %d, %Y') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%d-%b-%Y') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%Y/%m/%d') AS DATE),
    TRY_CAST(TRY_STRPTIME(trim(CAST(x AS VARCHAR)), '%d/%m/%Y') AS DATE)) END;
CREATE OR REPLACE TEMP MACRO ss_case(x) AS translate(ss_str(x), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
CREATE OR REPLACE TEMP MACRO ss_round(x, d) AS CASE WHEN x IS NULL THEN NULL ELSE sign(x) * floor(abs(x) * pow(10, d) * (1 + pow(2, -44)) + 0.5) / pow(10, d) END;
CREATE OR REPLACE TEMP MACRO ss_roundup(x, d) AS CASE WHEN x IS NULL THEN NULL ELSE sign(x) * ceil(abs(x) * pow(10, d) * (1 - pow(2, -44))) / pow(10, d) END;
CREATE OR REPLACE TEMP MACRO ss_rounddown(x, d) AS CASE WHEN x IS NULL THEN NULL ELSE sign(x) * floor(abs(x) * pow(10, d) * (1 + pow(2, -44))) / pow(10, d) END;
`;

const PY_PRELUDE = `# StepSheet pipeline as Python (Polars 1.0+).
# Columns are read as text, like StepSheet reads a file; the helpers below copy
# its rules: text matches ignore case and surrounding spaces, numbers stored as
# text are read as numbers, blanks are skipped. Excel errors such as #VALUE!
# come out as null.
import polars as pl

def ss_str(e):
    return e.cast(pl.Utf8)

def ss_empty(e):
    return e.is_null() | (e.cast(pl.Utf8) == "")

def ss_txt(e):
    return e.cast(pl.Utf8).str.strip_chars().str.to_lowercase()

def ss_key(e):
    return ss_txt(e).fill_null("")

def ss_num(e):
    t = (e.cast(pl.Utf8).str.strip_chars()
         .str.replace_all("[\\u2212\\u2013]", "-")
         .str.replace_all(r"[\\s\\u00a0\\u202f$\\u20ac\\u00a3\\u00a5\\u20b9%]|^(USD|EUR|GBP|INR|JPY)|(USD|EUR|GBP|INR|JPY)$", ""))
    t = pl.when(t.str.contains(r"^\\(.*\\)$")).then(pl.lit("-") + t.str.slice(1).str.strip_suffix(")")).otherwise(t)
    return (pl.when(t.str.contains(r"^[-+]?\\d{1,3}(,\\d{3})+(\\.\\d+)?$") | t.str.contains(r"^[-+]?\\d{1,2}(,\\d{2})+,\\d{3}(\\.\\d+)?$"))
            .then(t.str.replace_all(",", ""))
            .when(t.str.contains(r"^[-+]?\\d{1,3}(\\.\\d{3})+,\\d+$") | t.str.contains(r"^[-+]?\\d{1,3}(\\.\\d{3}){2,}$"))
            .then(t.str.replace_all(r"\\.", "").str.replace(",", "."))
            .when(t.str.contains(r"^[-+]?\\d+,\\d+$"))
            .then(t.str.replace(",", "."))
            .when(t.str.contains(r"^[-+]?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?$"))
            .then(t)
            .otherwise(None)
            .cast(pl.Float64, strict=False))

def ss_num_eu(e):
    t = e.cast(pl.Utf8).str.strip_chars().str.replace_all(r"[\\s\\u00a0$\\u20ac\\u00a3\\u00a5\\u20b9]", "")
    return t.str.replace_all(r"\\.", "").str.replace(",", ".").cast(pl.Float64, strict=False)

def ss_num_us(e):
    return e.cast(pl.Utf8).str.strip_chars().str.replace_all(r"[\\s\\u00a0,$\\u20ac\\u00a3\\u00a5\\u20b9]", "").cast(pl.Float64, strict=False)

def ss_date(e):
    t = e.cast(pl.Utf8).str.strip_chars()
    serial = pl.when(t.str.contains(r"^\\d{5}(\\.0)?$")).then(
        pl.lit("1899-12-30").str.to_date() + pl.duration(days=t.cast(pl.Float64, strict=False).cast(pl.Int64)))
    return pl.coalesce(
        serial,
        t.str.to_date("%Y-%m-%d", strict=False), t.str.to_date("%Y%m%d", strict=False),
        t.str.to_date("%d %b %Y", strict=False), t.str.to_date("%d %B %Y", strict=False),
        t.str.to_date("%B %d, %Y", strict=False), t.str.to_date("%b %d, %Y", strict=False),
        t.str.to_date("%d-%b-%Y", strict=False), t.str.to_date("%Y/%m/%d", strict=False),
        t.str.to_date("%d/%m/%Y", strict=False))

def ss_read(path):
    df = pl.read_csv(path, infer_schema=False)
    return df.with_columns([pl.col(c).str.strip_chars().replace("", None) for c in df.columns])

def ss_case(e):
    # Tie-break for text that differs only in case: lowercase first, like StepSheet.
    lo, up = "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return ss_str(e).str.replace_many(list(lo + up), list(up + lo))

def ss_round(e, d):
    f = 10 ** d
    return (e.abs() * f * (1 + 2 ** -44) + 0.5).floor() / f * e.sign()

def ss_roundup(e, d):
    f = 10 ** d
    return (e.abs() * f * (1 - 2 ** -44)).ceil() / f * e.sign()

def ss_rounddown(e, d):
    f = 10 ** d
    return (e.abs() * f * (1 + 2 ** -44)).floor() / f * e.sign()

def ss_order_keys(name, desc, i):
    # StepSheet sort order: numbers, then dates, then text; blanks always last.
    c = pl.col(name)
    kind = (pl.when(ss_empty(c)).then(3).when(ss_num(c).is_not_null()).then(0)
            .when(ss_date(c).is_not_null()).then(1).otherwise(2))
    keys = [kind.alias(f"_k{i}"), ss_num(c).alias(f"_n{i}"), ss_date(c).alias(f"_d{i}"), ss_txt(c).alias(f"_t{i}"), ss_case(c).alias(f"_c{i}")]
    return keys, [False, desc, desc, desc, desc]
`;

const M_HELPERS = [
  `SsStr = (v) => if v = null then null else Text.From(v, "en-US")`,
  `SsEmpty = (v) => v = null or Text.From(v, "en-US") = ""`,
  `SsTxt = (v) => if v = null then null else Text.Lower(Text.Trim(Text.From(v, "en-US")))`,
  `SsKey = (v) => if v = null then "" else Text.Lower(Text.Trim(Text.From(v, "en-US")))`,
  `SsNum = (v) => if v = null then null else if Value.Is(v, type number) then v else let t0 = Text.Remove(Text.Trim(Text.From(v, "en-US")), {" ", "#(00A0)", "$", "€", "£", "¥", "₹", "%"}), t1 = if Text.StartsWith(t0, "(") and Text.EndsWith(t0, ")") then "-" & Text.Middle(t0, 1, Text.Length(t0) - 2) else t0, hasC = Text.Contains(t1, ","), hasD = Text.Contains(t1, "."), lastC = Text.PositionOf(t1, ",", Occurrence.Last), lastD = Text.PositionOf(t1, ".", Occurrence.Last), dots = List.Count(Text.PositionOf(t1, ".", Occurrence.All)), t2 = if hasC and hasD then (if lastC > lastD then Text.Replace(Text.Replace(t1, ".", ""), ",", ".") else Text.Replace(t1, ",", "")) else if hasC then (if Text.Length(t1) - lastC - 1 = 3 then Text.Replace(t1, ",", "") else Text.Replace(t1, ",", ".")) else if dots > 1 then Text.Replace(t1, ".", "") else t1 in if t2 = "" then null else try Number.From(t2, "en-US") otherwise null`,
  `SsNumEu = (v) => if v = null then null else if Value.Is(v, type number) then v else try Number.From(Text.Replace(Text.Remove(Text.Trim(Text.From(v)), {" ", "#(00A0)", ".", "$", "€", "£", "¥", "₹"}), ",", "."), "en-US") otherwise null`,
  `SsNumUs = (v) => if v = null then null else if Value.Is(v, type number) then v else try Number.From(Text.Remove(Text.Trim(Text.From(v)), {" ", "#(00A0)", ",", "$", "€", "£", "¥", "₹"}), "en-US") otherwise null`,
  `SsDate = (v) => if v = null then null else if Value.Is(v, type date) then v else if Value.Is(v, type datetime) then Date.From(v) else let t = Text.Trim(Text.From(v, "en-US")) in if t = "" then null else if Text.Length(t) = 5 and (try Number.From(t) otherwise null) <> null then Date.AddDays(#date(1899, 12, 30), Number.From(t)) else if Text.Length(t) = 8 and (try Number.From(t) otherwise null) <> null then (try #date(Number.From(Text.Start(t, 4)), Number.From(Text.Middle(t, 4, 2)), Number.From(Text.End(t, 2))) otherwise null) else try Date.FromText(t, [Culture = "en-GB"]) otherwise try Date.FromText(t, [Culture = "en-US"]) otherwise null`,
  `SsRound = (x, d) => if x = null then null else Number.Round(x, d, RoundingMode.AwayFromZero)`,
  `SsRoundUp = (x, d) => if x = null then null else Number.Sign(x) * Number.RoundUp(Number.Abs(x) * Number.Power(10, d) * (1 - Number.Power(2, -44))) / Number.Power(10, d)`,
  `SsRoundDown = (x, d) => if x = null then null else Number.Sign(x) * Number.RoundDown(Number.Abs(x) * Number.Power(10, d) * (1 + Number.Power(2, -44))) / Number.Power(10, d)`,
  `SsRead = (path) => let raw = Table.PromoteHeaders(Csv.Document(File.Contents(path), [Delimiter = ",", Encoding = 65001]), [PromoteAllScalars = true]) in Table.TransformColumns(raw, List.Transform(Table.ColumnNames(raw), (c) => {c, each if _ = null then null else let t = Text.Trim(Text.From(_)) in if t = "" then null else t}))`,
  `SsKind = (v) => if SsEmpty(v) then 3 else if SsNum(v) <> null then 0 else if SsDate(v) <> null then 1 else 2`,
];

// ---------------------------------------------------------------- value semantics per language
const isNumLit = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && parseSharedNumber(v) !== null;
const numOf = (v: any) => parseSharedNumber(v) as number;
const dateLit = (v: any): string | null => {
  if (v === null || v === undefined || String(v).trim() === '' || isNumLit(v)) return null;
  const d = parseSharedDate(v);
  return d ? toISODate(d) : null;
};

/** One filter condition, mirroring evaluateRowCondition. */
function condSql(c: string, op: string, val: any): string {
  const C = qi(c);
  if (op === 'is_null') return `ss_empty(${C})`;
  if (op === 'is_not_null') return `NOT ss_empty(${C})`;
  if (op === 'in') {
    const list = (Array.isArray(val) ? val : String(val ?? '').split(',')).map((s: any) => String(s).trim().toLowerCase());
    return `ss_key(${C}) IN (${list.map(ql).join(', ')})`;
  }
  const order: Record<string, string> = { gt: '>', '>': '>', gte: '>=', '>=': '>=', lt: '<', '<': '<', lte: '<=', '<=': '<=' };
  const blankVal = val === null || val === undefined || val === '';
  if (order[op]) {
    const o = order[op];
    if (blankVal) return `COALESCE(ss_num(${C}) ${o} 0, FALSE)`;
    if (isNumLit(val)) return `COALESCE(ss_num(${C}) ${o} ${numOf(val)}, FALSE)`;
    const d = dateLit(val);
    if (d) return `COALESCE(ss_date(${C}) ${o} DATE ${ql(d)}, FALSE)`;
    return `(NOT ss_empty(${C}) AND lower(ss_str(${C})) ${o} ${ql(String(val).toLowerCase())})`;
  }
  const txt = String(val ?? '').trim().toLowerCase();
  const eqExpr = isNumLit(val)
    ? `CASE WHEN ss_num(${C}) IS NOT NULL THEN ss_num(${C}) = ${numOf(val)} ELSE ss_key(${C}) = ${ql(txt)} END`
    : `ss_key(${C}) = ${ql(txt)}`;
  switch (op) {
    case 'eq': case '==': case '=': return `(${eqExpr})`;
    case 'neq': case '!=': return `(NOT (${eqExpr}))`;
    case 'contains': return `contains(lower(COALESCE(ss_str(${C}), '')), ${ql(String(val ?? '').toLowerCase())})`;
    case 'not_contains': return `(NOT contains(lower(COALESCE(ss_str(${C}), '')), ${ql(String(val ?? '').toLowerCase())}))`;
    case 'starts_with': return `starts_with(ss_key(${C}), ${ql(txt)})`;
    case 'ends_with': return `ends_with(ss_key(${C}), ${ql(txt)})`;
    default: return unsupported(`filter operator "${op}"`);
  }
}
function condPy(c: string, op: string, val: any): string {
  const C = `pl.col(${py(c)})`;
  if (op === 'is_null') return `ss_empty(${C})`;
  if (op === 'is_not_null') return `~ss_empty(${C})`;
  if (op === 'in') {
    const list = (Array.isArray(val) ? val : String(val ?? '').split(',')).map((s: any) => String(s).trim().toLowerCase());
    return `ss_key(${C}).is_in([${list.map(py).join(', ')}])`;
  }
  const order: Record<string, string> = { gt: '>', '>': '>', gte: '>=', '>=': '>=', lt: '<', '<': '<', lte: '<=', '<=': '<=' };
  const blankVal = val === null || val === undefined || val === '';
  if (order[op]) {
    const o = order[op];
    if (blankVal) return `(ss_num(${C}) ${o} 0).fill_null(False)`;
    if (isNumLit(val)) return `(ss_num(${C}) ${o} ${numOf(val)}).fill_null(False)`;
    const d = dateLit(val);
    if (d) return `(ss_date(${C}) ${o} pl.lit(${py(d)}).str.to_date()).fill_null(False)`;
    return `((~ss_empty(${C})) & (ss_str(${C}).str.to_lowercase() ${o} ${py(String(val).toLowerCase())})).fill_null(False)`;
  }
  const txt = String(val ?? '').trim().toLowerCase();
  const eqExpr = isNumLit(val)
    ? `pl.when(ss_num(${C}).is_not_null()).then(ss_num(${C}) == ${numOf(val)}).otherwise(ss_key(${C}) == ${py(txt)})`
    : `(ss_key(${C}) == ${py(txt)})`;
  const low = `ss_str(${C}).fill_null("").str.to_lowercase()`;
  switch (op) {
    case 'eq': case '==': case '=': return `(${eqExpr})`;
    case 'neq': case '!=': return `(~(${eqExpr}))`;
    case 'contains': return `${low}.str.contains(${py(String(val ?? '').toLowerCase())}, literal=True)`;
    case 'not_contains': return `(~${low}.str.contains(${py(String(val ?? '').toLowerCase())}, literal=True))`;
    case 'starts_with': return `ss_key(${C}).str.starts_with(${py(txt)})`;
    case 'ends_with': return `ss_key(${C}).str.ends_with(${py(txt)})`;
    default: return unsupported(`filter operator "${op}"`);
  }
}
function condM(c: string, op: string, val: any): string {
  const C = `Record.Field(_, ${ms(c)})`;
  if (op === 'is_null') return `SsEmpty(${C})`;
  if (op === 'is_not_null') return `not SsEmpty(${C})`;
  if (op === 'in') {
    const list = (Array.isArray(val) ? val : String(val ?? '').split(',')).map((s: any) => String(s).trim().toLowerCase());
    return `List.Contains({${list.map(ms).join(', ')}}, SsKey(${C}))`;
  }
  const order: Record<string, string> = { gt: '>', '>': '>', gte: '>=', '>=': '>=', lt: '<', '<': '<', lte: '<=', '<=': '<=' };
  const blankVal = val === null || val === undefined || val === '';
  if (order[op]) {
    const o = order[op];
    if (blankVal) return `(SsNum(${C}) <> null and SsNum(${C}) ${o} 0)`;
    if (isNumLit(val)) return `(SsNum(${C}) <> null and SsNum(${C}) ${o} ${numOf(val)})`;
    const d = dateLit(val);
    if (d) {
      const [y, m, dd] = d.split('-').map(Number);
      return `(SsDate(${C}) <> null and SsDate(${C}) ${o} #date(${y}, ${m}, ${dd}))`;
    }
    return `(not SsEmpty(${C}) and Text.Lower(SsStr(${C})) ${o} ${ms(String(val).toLowerCase())})`;
  }
  const txt = String(val ?? '').trim().toLowerCase();
  const eqExpr = isNumLit(val)
    ? `(if SsNum(${C}) <> null then SsNum(${C}) = ${numOf(val)} else SsKey(${C}) = ${ms(txt)})`
    : `(SsKey(${C}) = ${ms(txt)})`;
  const low = `Text.Lower(if ${C} = null then "" else SsStr(${C}))`;
  switch (op) {
    case 'eq': case '==': case '=': return eqExpr;
    case 'neq': case '!=': return `(not ${eqExpr})`;
    case 'contains': return `Text.Contains(${low}, ${ms(String(val ?? '').toLowerCase())})`;
    case 'not_contains': return `(not Text.Contains(${low}, ${ms(String(val ?? '').toLowerCase())}))`;
    case 'starts_with': return `Text.StartsWith(SsKey(${C}), ${ms(txt)})`;
    case 'ends_with': return `Text.EndsWith(SsKey(${C}), ${ms(txt)})`;
    default: return unsupported(`filter operator "${op}"`);
  }
}

function numberParser(p: any): { sql: string; py: string; m: string } {
  const v = String(p.number_format || p.decimal_separator || 'auto').toLowerCase();
  if (v === 'comma' || v === ',' || v === '1.234,56') return { sql: 'ss_num_eu', py: 'ss_num_eu', m: 'SsNumEu' };
  if (v === 'dot' || v === '.' || v === '1,234.56') return { sql: 'ss_num_us', py: 'ss_num_us', m: 'SsNumUs' };
  return { sql: 'ss_num', py: 'ss_num', m: 'SsNum' };
}

// ---------------------------------------------------------------- formulas
/** Translate a formula's syntax tree. Unsupported functions throw. */
function formulaTo(ast: FormulaAst, lang: 'sql' | 'py' | 'm'): string {
  const col = (name: string) => (lang === 'sql' ? qi(name) : lang === 'py' ? `pl.col(${py(name)})` : `Record.Field(_, ${ms(name)})`);
  const num = (x: string) => (lang === 'sql' ? `ss_num(${x})` : lang === 'py' ? `ss_num(${x})` : `SsNum(${x})`);
  const str = (x: string) => (lang === 'sql' ? `COALESCE(ss_str(${x}), '')` : lang === 'py' ? `ss_str(${x}).fill_null("")` : `(if ${x} = null then "" else SsStr(${x}))`);
  const lit = (v: any) => (lang === 'sql' ? sqlLit(v) : lang === 'py' ? `pl.lit(${py(v)})` : mv(v));
  // Arithmetic operand: a blank cell counts as 0, like Excel.
  const arith = (n: FormulaAst): string => {
    if (n.kind === 'num') return String(n.value);
    if (n.kind === 'col') {
      const c = col(n.name);
      if (lang === 'sql') return `(CASE WHEN ss_empty(${c}) THEN 0 ELSE ss_num(${c}) END)`;
      if (lang === 'py') return `pl.when(ss_empty(${c})).then(0.0).otherwise(ss_num(${c}))`;
      return `(if SsEmpty(${c}) then 0 else SsNum(${c}))`;
    }
    const inner = go(n);
    if (n.kind === 'str') return num(inner);
    return lang === 'sql' ? `CAST(${inner} AS DOUBLE)` : lang === 'py' ? `(${inner}).cast(pl.Float64, strict=False)` : inner;
  };
  const isTextNode = (n: FormulaAst) => n.kind === 'str' || (n.kind === 'binary' && n.op === '&') || (n.kind === 'call' && ['LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'TRIM', 'PROPER', 'CONCAT', 'CONCATENATE', 'TEXT', 'SUBSTITUTE'].includes(n.name));
  const cmp = (op: string, a: FormulaAst, b: FormulaAst): string => {
    const textCompare = isTextNode(a) || isTextNode(b);
    const o = op === '<>' ? (lang === 'sql' ? '<>' : lang === 'py' ? '!=' : '<>') : op === '=' ? (lang === 'py' ? '==' : '=') : op;
    if (textCompare) {
      const L = lang === 'sql' ? `lower(${str(go(a))})` : lang === 'py' ? `${str(go(a))}.str.to_lowercase()` : `Text.Lower(${str(go(a))})`;
      const R = lang === 'sql' ? `lower(${str(go(b))})` : lang === 'py' ? `${str(go(b))}.str.to_lowercase()` : `Text.Lower(${str(go(b))})`;
      return `(${L} ${o} ${R})`;
    }
    return `(${arith(a)} ${o} ${arith(b)})`;
  };
  const bool = (n: FormulaAst) => {
    const g = go(n);
    if (n.kind === 'binary' && ['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return g;
    if (n.kind === 'bool' || (n.kind === 'call' && ['AND', 'OR', 'NOT', 'ISBLANK', 'ISNUMBER', 'ISTEXT'].includes(n.name))) return g;
    return lang === 'sql' ? `(${arith(n)} <> 0)` : lang === 'py' ? `(${arith(n)} != 0)` : `(${arith(n)} <> 0)`;
  };
  const go = (n: FormulaAst): string => {
    switch (n.kind) {
      case 'num': return lang === 'py' ? `pl.lit(${n.value})` : String(n.value);
      case 'str': return lit(n.value);
      case 'bool': return lang === 'sql' ? (n.value ? 'TRUE' : 'FALSE') : lang === 'py' ? `pl.lit(${n.value ? 'True' : 'False'})` : n.value ? 'true' : 'false';
      case 'col': return col(n.name);
      case 'name_error': return unsupported('a formula that refers to an unknown name');
      case 'unary': return `(-${arith(n.arg)})`;
      case 'percent': return `(${arith(n.arg)} / 100)`;
      case 'binary': {
        const { op, left, right } = n;
        if (op === '&') return lang === 'sql' ? `(${str(go(left))} || ${str(go(right))})` : lang === 'py' ? `(${str(go(left))} + ${str(go(right))})` : `(${str(go(left))} & ${str(go(right))})`;
        if (['=', '<>', '<', '>', '<=', '>='].includes(op)) return cmp(op, left, right);
        if (op === '^') return lang === 'sql' ? `pow(${arith(left)}, ${arith(right)})` : lang === 'py' ? `(${arith(left)}).pow(${arith(right)})` : `Number.Power(${arith(left)}, ${arith(right)})`;
        if (op === '/') {
          if (lang === 'sql') return `(${arith(left)} / NULLIF(${arith(right)}, 0))`;
          if (lang === 'py') return `pl.when(${arith(right)} == 0).then(None).otherwise(${arith(left)} / ${arith(right)})`;
          return `(if ${arith(right)} = 0 then null else ${arith(left)} / ${arith(right)})`;
        }
        if (['+', '-', '*'].includes(op)) return `(${arith(left)} ${op} ${arith(right)})`;
        return unsupported(`the formula operator "${op}"`);
      }
      case 'call': {
        const a = n.args;
        const A = (i: number) => go(a[i]);
        const N = (i: number) => arith(a[i]);
        const S = (i: number) => str(go(a[i]));
        const need = (k: number) => { if (a.length < k) unsupported(`${n.name} with ${a.length} arguments`); };
        switch (n.name) {
          case 'IF': {
            need(2);
            const otherwise = a.length > 2 ? A(2) : lang === 'py' ? 'pl.lit(False)' : lang === 'sql' ? 'FALSE' : 'false';
            if (lang === 'sql') return `(CASE WHEN ${bool(a[0])} THEN ${A(1)} ELSE ${otherwise} END)`;
            if (lang === 'py') return `pl.when(${bool(a[0])}).then(${A(1)}).otherwise(${otherwise})`;
            return `(if ${bool(a[0])} then ${A(1)} else ${otherwise})`;
          }
          case 'IFS': {
            if (a.length < 2 || a.length % 2) unsupported('IFS with an odd number of arguments');
            const pairs: [string, string][] = [];
            for (let i = 0; i < a.length; i += 2) pairs.push([bool(a[i]), go(a[i + 1])]);
            if (lang === 'sql') return `(CASE ${pairs.map(([c, v]) => `WHEN ${c} THEN ${v}`).join(' ')} END)`;
            if (lang === 'py') return pairs.reduce((acc, [c, v], i) => (i === 0 ? `pl.when(${c}).then(${v})` : `${acc}.when(${c}).then(${v})`), '') + '.otherwise(None)';
            return pairs.reduceRight((acc, [c, v]) => `(if ${c} then ${v} else ${acc})`, 'null');
          }
          case 'AND': case 'OR': {
            const j = lang === 'sql' ? ` ${n.name} ` : lang === 'py' ? (n.name === 'AND' ? ' & ' : ' | ') : ` ${n.name.toLowerCase()} `;
            return `(${a.map(bool).join(j)})`;
          }
          case 'NOT': need(1); return lang === 'py' ? `(~${bool(a[0])})` : `(NOT ${bool(a[0])})`.replace('NOT', lang === 'm' ? 'not' : 'NOT');
          case 'ISBLANK': need(1); return lang === 'sql' ? `ss_empty(${A(0)})` : lang === 'py' ? `ss_empty(${A(0)})` : `SsEmpty(${A(0)})`;
          case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': {
            need(1);
            const d = a.length > 1 ? (a[1].kind === 'num' ? String(a[1].value) : unsupported(`${n.name} with a computed number of decimals`)) : '0';
            const fn = n.name === 'ROUND' ? 'round' : n.name === 'ROUNDUP' ? 'roundup' : 'rounddown';
            if (lang === 'm') return `Ss${fn === 'round' ? 'Round' : fn === 'roundup' ? 'RoundUp' : 'RoundDown'}(${N(0)}, ${d})`;
            return `ss_${fn}(${N(0)}, ${d})`;
          }
          case 'ABS': need(1); return lang === 'sql' ? `abs(${N(0)})` : lang === 'py' ? `(${N(0)}).abs()` : `Number.Abs(${N(0)})`;
          case 'INT': need(1); return lang === 'sql' ? `floor(${N(0)})` : lang === 'py' ? `(${N(0)}).floor()` : `Number.RoundDown(${N(0)})`;
          case 'SUM': return a.length ? `(${a.map((_, i) => N(i)).join(' + ')})` : '0';
          case 'MIN': case 'MAX': {
            if (lang === 'sql') return `${n.name === 'MIN' ? 'least' : 'greatest'}(${a.map((_, i) => N(i)).join(', ')})`;
            if (lang === 'py') return `pl.${n.name === 'MIN' ? 'min' : 'max'}_horizontal(${a.map((_, i) => N(i)).join(', ')})`;
            return `List.${n.name === 'MIN' ? 'Min' : 'Max'}({${a.map((_, i) => N(i)).join(', ')}})`;
          }
          case 'AVERAGE': return `((${a.map((_, i) => N(i)).join(' + ')}) / ${a.length})`;
          case 'LEN': need(1); return lang === 'sql' ? `length(${S(0)})` : lang === 'py' ? `${S(0)}.str.len_chars()` : `Text.Length(${S(0)})`;
          case 'UPPER': case 'LOWER': need(1); return lang === 'sql' ? `${n.name.toLowerCase()}(${S(0)})` : lang === 'py' ? `${S(0)}.str.to_${n.name.toLowerCase()}case()` : `Text.${n.name === 'UPPER' ? 'Upper' : 'Lower'}(${S(0)})`;
          case 'TRIM': need(1); return lang === 'sql' ? `regexp_replace(trim(${S(0)}), '\\s+', ' ', 'g')` : lang === 'py' ? `${S(0)}.str.strip_chars().str.replace_all(r"\\s+", " ")` : `Text.Combine(List.Select(Text.Split(Text.Trim(${S(0)}), " "), each _ <> ""), " ")`;
          case 'LEFT': case 'RIGHT': {
            need(1);
            const k = a.length > 1 ? (a[1].kind === 'num' ? a[1].value : unsupported(`${n.name} with a computed length`)) : 1;
            if (lang === 'sql') return `${n.name.toLowerCase()}(${S(0)}, ${k})`;
            if (lang === 'py') return n.name === 'LEFT' ? `${S(0)}.str.slice(0, ${k})` : k === 0 ? 'pl.lit("")' : `${S(0)}.str.slice(-${k})`;
            return `Text.${n.name === 'LEFT' ? 'Start' : 'End'}(${S(0)}, ${k})`;
          }
          case 'MID': {
            need(3);
            if (a[1].kind !== 'num' || a[2].kind !== 'num') unsupported('MID with a computed position');
            const s0 = (a[1] as any).value as number, l0 = (a[2] as any).value as number;
            if (lang === 'sql') return `substr(${S(0)}, ${s0}, ${l0})`;
            if (lang === 'py') return `${S(0)}.str.slice(${s0 - 1}, ${l0})`;
            return `Text.Middle(${S(0)}, ${s0 - 1}, ${l0})`;
          }
          case 'CONCAT': case 'CONCATENATE': {
            const parts = a.map((_, i) => S(i));
            return lang === 'sql' ? `(${parts.join(' || ')})` : lang === 'py' ? `(${parts.join(' + ')})` : `(${parts.join(' & ')})`;
          }
          case 'YEAR': case 'MONTH': case 'DAY': {
            need(1);
            const d = lang === 'sql' ? `ss_date(${A(0)})` : lang === 'py' ? `ss_date(${A(0)})` : `SsDate(${A(0)})`;
            if (lang === 'sql') return `${n.name.toLowerCase()}(${d})`;
            if (lang === 'py') return `${d}.dt.${n.name.toLowerCase()}()`;
            return `Date.${n.name === 'YEAR' ? 'Year' : n.name === 'MONTH' ? 'Month' : 'Day'}(${d})`;
          }
          case 'VALUE': need(1); return num(A(0));
          case 'COALESCE': {
            if (lang === 'sql') return `COALESCE(${a.map((x, i) => `CASE WHEN ss_empty(${A(i)}) THEN NULL ELSE ${A(i)} END`).join(', ')})`;
            if (lang === 'py') return `pl.coalesce(${a.map((_, i) => `pl.when(ss_empty(${A(i)})).then(None).otherwise(${A(i)})`).join(', ')})`;
            return a.map((_, i) => A(i)).reduceRight((acc, x) => `(if SsEmpty(${x}) then ${acc} else ${x})`, 'null');
          }
          default:
            return unsupported(`the formula function ${n.name}`);
        }
      }
    }
    return unsupported('this formula');
  };
  return go(ast);
}

function formulaExprs(expression: string, columns: string[]): { sql: string; py: string; m: string } {
  const ast = parseFormulaAst(expression, columns);
  if (!ast) return unsupported(`the formula "${expression}" (it does not parse)`);
  // A top-level arithmetic or number result stays a number column.
  return { sql: formulaTo(ast, 'sql'), py: formulaTo(ast, 'py'), m: formulaTo(ast, 'm') };
}

// ---------------------------------------------------------------- per-step translation
interface StepCode { sql: string; py: string[]; m: string }

function selectList(cols: string[], replace: Map<string, string>, add: [string, string][], extra: string[] = ['__rid']): string {
  const parts = cols.map((c) => (replace.has(c) ? `${replace.get(c)} AS ${qi(c)}` : qi(c)));
  for (const [c, e] of add) if (!cols.includes(c)) parts.push(`${e} AS ${qi(c)}`);
  return [...parts, ...extra].join(', ');
}
/** SELECT the given columns (in this order) plus the row id. */
const withCol = (cols: string[], target: string, expr: string, prev: string) => {
  const rep = new Map<string, string>();
  const add: [string, string][] = [];
  if (cols.includes(target)) rep.set(target, expr);
  else add.push([target, expr]);
  return `SELECT ${selectList(cols, rep, add)} FROM ${prev}`;
};
const mAddOrReplace = (prev: string, cols: string[], target: string, fnBody: string) =>
  cols.includes(target)
    ? `Table.ReplaceValue(${prev}, each Record.Field(_, ${ms(target)}), each ${fnBody}, (old, oldV, newV) => newV, {${ms(target)}})`
    : `Table.AddColumn(${prev}, ${ms(target)}, each ${fnBody})`;

function translateStep(
  input: CodegenStepInput,
  prev: { sql: string; m: string },
  ctx: CodegenContext,
  lang: 'sql' | 'py' | 'm'
): string | string[] {
  const { step, columnsIn: cols, columnsOut, kindsIn } = input;
  const p: any = step.params || {};
  const dsOf = (id: string): CodegenDataset => {
    const d = ctx.datasets.find((x) => x.id === id);
    if (!d) return unsupported('a step that uses a dataset that is no longer loaded');
    return d;
  };
  const tableOf = (d: CodegenDataset) => safeIdent(d.name);
  // Lookup and append sources get the same trimming as the main source.
  const ssTable = (d: CodegenDataset) => `(SELECT ${d.columns.map((c) => `NULLIF(trim(CAST(${qi(c)} AS VARCHAR)), '') AS ${qi(c)}`).join(', ')} FROM ${qi(tableOf(d))})`;
  const pyFrame = (d: CodegenDataset) => `ss_read(${py(`${tableOf(d)}.csv`)})`;
  const mTable = (d: CodegenDataset) => `SsRead(${ms(`${tableOf(d)}.csv`)})`;
  const S = prev.sql;
  const M = prev.m;

  switch (step.type) {
    case 'filter_rows': {
      const conds: any[] = Array.isArray(p.conditions) && p.conditions.length ? p.conditions : [{ column: p.column, operator: p.operator || 'eq', value: p.value }];
      const logic = String(p.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
      const valid = conds.filter((c) => c && c.column);
      if (!valid.length) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      if (lang === 'sql') return `SELECT * FROM ${S} WHERE ${valid.map((c) => condSql(c.column, c.operator || 'eq', c.value)).join(` ${logic} `)}`;
      if (lang === 'py') return [`df = df.filter((${valid.map((c) => `(${condPy(c.column, c.operator || 'eq', c.value)})`).join(logic === 'OR' ? ' | ' : ' & ')}).fill_null(False))`];
      return `Table.SelectRows(${M}, each ${valid.map((c) => condM(c.column, c.operator || 'eq', c.value)).join(logic === 'OR' ? ' or ' : ' and ')})`;
    }

    case 'sort_rows': {
      const conds: any[] = Array.isArray(p.conditions) && p.conditions.length ? p.conditions : [{ column: p.column, direction: p.direction || 'asc' }];
      const valid = conds.filter((c) => c && c.column);
      if (!valid.length) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      if (lang === 'sql') {
        const keys = valid.map((c) => {
          const C = qi(c.column);
          const d = String(c.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
          return `CASE WHEN ss_empty(${C}) THEN 3 WHEN ss_num(${C}) IS NOT NULL THEN 0 WHEN ss_date(${C}) IS NOT NULL THEN 1 ELSE 2 END, ss_num(${C}) ${d}, ss_date(${C}) ${d}, ss_txt(${C}) ${d}, ss_case(${C}) ${d}`;
        });
        return `SELECT ${selectList(cols, new Map(), [], [])}, ROW_NUMBER() OVER (ORDER BY ${keys.join(', ')}, __rid) AS __rid FROM ${S}`;
      }
      if (lang === 'py') {
        const lines = ['_keys, _desc = [], []'];
        valid.forEach((c, i) => lines.push(`_k, _d = ss_order_keys(${py(c.column)}, ${String(c.direction || 'asc').toLowerCase() === 'desc' ? 'True' : 'False'}, ${i}); _keys += _k; _desc += _d`));
        lines.push('df = df.with_columns(_keys).sort([k.meta.output_name() for k in _keys], descending=_desc, nulls_last=True, maintain_order=True).drop([k.meta.output_name() for k in _keys])');
        return lines;
      }
      const crit = valid
        .map((c) => {
          const o = String(c.direction || 'asc').toLowerCase() === 'desc' ? 'Order.Descending' : 'Order.Ascending';
          const f = `Record.Field(_, ${ms(c.column)})`;
          return `{each SsKind(${f}), Order.Ascending}, {each SsNum(${f}), ${o}}, {each SsDate(${f}), ${o}}, {each SsTxt(${f}), ${o}}`;
        })
        .join(', ');
      return `Table.RemoveColumns(Table.Sort(Table.AddIndexColumn(${M}, "__i", 0, 1), {${crit}, {"__i", Order.Ascending}}), {"__i"})`;
    }

    case 'remove_duplicates': {
      const keyCols: string[] = Array.isArray(p.columns) && p.columns.length ? p.columns : p.column ? [p.column] : cols;
      const keep = p.keep_mode || p.keep || 'first';
      if (lang === 'sql') {
        const part = keyCols.map((c) => `ss_key(${qi(c)})`).join(', ');
        if (keep === 'duplicates_only') return `SELECT ${selectList(cols, new Map(), [])} FROM (SELECT *, COUNT(*) OVER (PARTITION BY ${part}) AS __n FROM ${S}) WHERE __n > 1`;
        return `SELECT ${selectList(cols, new Map(), [])} FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ${part} ORDER BY __rid ${keep === 'last' ? 'DESC' : 'ASC'}) AS __n FROM ${S}) WHERE __n = 1`;
      }
      if (lang === 'py') {
        const st = `pl.struct([${keyCols.map((c, i) => `ss_key(pl.col(${py(c)})).alias("_k${i}")`).join(', ')}])`;
        const f = keep === 'duplicates_only' ? 'is_duplicated' : keep === 'last' ? 'is_last_distinct' : 'is_first_distinct';
        return [`df = df.filter(${st}.${f}())`];
      }
      const keyFn = `each Text.Combine(List.Transform({${keyCols.map((c) => `Record.Field(_, ${ms(c)})`).join(', ')}}, SsKey), "|")`;
      const withKey = `Table.AddColumn(${M}, "__k", ${keyFn})`;
      if (keep === 'duplicates_only')
        return `let t = Table.Buffer(${withKey}), counts = Table.Group(t, {"__k"}, {{"__n", Table.RowCount}}), j = Table.Join(t, "__k", Table.RenameColumns(counts, {{"__k", "__k2"}}), "__k2") in Table.RemoveColumns(Table.SelectRows(j, each [__n] > 1), {"__k", "__k2", "__n"})`;
      if (keep === 'last') return `Table.RemoveColumns(Table.ReverseRows(Table.Distinct(Table.ReverseRows(${withKey}), {"__k"})), {"__k"})`;
      return `Table.RemoveColumns(Table.Distinct(${withKey}, {"__k"}), {"__k"})`;
    }

    case 'fill_down': {
      const fcols: string[] = Array.isArray(p.columns) && p.columns.length ? p.columns : p.column ? [p.column] : [];
      const up = (p.direction || 'down') === 'up';
      if (lang === 'sql') {
        const rep = new Map<string, string>();
        for (const c of fcols) {
          const C = qi(c);
          const win = up ? 'ORDER BY __rid ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING' : 'ORDER BY __rid ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW';
          rep.set(c, `COALESCE(${up ? 'FIRST_VALUE' : 'LAST_VALUE'}(CASE WHEN ss_empty(${C}) THEN NULL ELSE ${C} END IGNORE NULLS) OVER (${win}), ${C})`);
        }
        return `SELECT ${selectList(cols, rep, [])} FROM ${S}`;
      }
      if (lang === 'py')
        return [`df = df.with_columns([pl.coalesce(pl.when(ss_empty(pl.col(c))).then(None).otherwise(pl.col(c)).${up ? 'backward_fill' : 'forward_fill'}(), pl.col(c)).alias(c) for c in ${py(null) === 'None' ? JSON.stringify(fcols) : ''}])`];
      const replaced = `Table.TransformColumns(${M}, {${fcols.map((c) => `{${ms(c)}, each if _ = "" then null else _}`).join(', ')}})`;
      return `Table.Fill${up ? 'Up' : 'Down'}(${replaced}, {${fcols.map(ms).join(', ')}})`;
    }

    case 'replace_values': {
      const c = p.column;
      if (!c) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      const find = p.search_value ?? p.find_value ?? p.old_value ?? '';
      const repl = p.replace_value ?? p.new_value ?? '';
      const mt = p.match_type || 'exact';
      if (lang === 'sql') {
        const C = qi(c);
        let e: string;
        if (mt === 'is_null') e = `CASE WHEN ss_empty(${C}) THEN ${sqlLit(repl)} ELSE ss_str(${C}) END`;
        else if (mt === 'contains') e = String(find) === '' ? `ss_str(${C})` : `regexp_replace(ss_str(${C}), ${ql(reEscape(String(find)))}, ${ql(String(repl).replace(/\\/g, '\\\\'))}, 'gi')`;
        else e = `CASE WHEN COALESCE(ss_str(${C}), '') = ${ql(String(find))} THEN ${sqlLit(repl)} ELSE ss_str(${C}) END`;
        return withCol(cols, c, e, S);
      }
      if (lang === 'py') {
        const C = `pl.col(${py(c)})`;
        if (mt === 'is_null') return [`df = df.with_columns(pl.when(ss_empty(${C})).then(pl.lit(${py(repl)})).otherwise(ss_str(${C})).alias(${py(c)}))`];
        if (mt === 'contains') return String(find) === '' ? [] : [`df = df.with_columns(ss_str(${C}).str.replace_all(${py('(?i)' + reEscape(String(find)))}, ${py(String(repl).replace(/\$/g, '$$$$'))}).alias(${py(c)}))`];
        return [`df = df.with_columns(pl.when(ss_str(${C}).fill_null("") == ${py(String(find))}).then(pl.lit(${py(repl)})).otherwise(ss_str(${C})).alias(${py(c)}))`];
      }
      if (mt === 'is_null') return `Table.TransformColumns(${M}, {{${ms(c)}, each if SsEmpty(_) then ${mv(repl)} else _}})`;
      if (mt === 'contains') {
        if (String(find) === '') return M;
        // Case-insensitive replace of every occurrence.
        return `Table.TransformColumns(${M}, {{${ms(c)}, each if _ = null then null else let s = SsStr(_), parts = Text.Split(Text.Lower(s), ${ms(String(find).toLowerCase())}), lens = List.Transform(parts, Text.Length), starts = List.Accumulate(List.Positions(parts), {}, (acc, i) => acc & {if i = 0 then 0 else List.Last(acc) + lens{i - 1} + ${String(find).length}}) in Text.Combine(List.Transform(List.Positions(parts), (i) => Text.Middle(s, starts{i}, lens{i})), ${ms(String(repl))})}})`;
      }
      return `Table.TransformColumns(${M}, {{${ms(c)}, each if (if _ = null then "" else SsStr(_)) = ${ms(String(find))} then ${mv(repl)} else _}})`;
    }

    case 'split_column': {
      const c = p.column;
      if (!c) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      const d = p.delimiter || ',';
      const names: string[] = Array.isArray(p.new_column_names) && p.new_column_names.length ? p.new_column_names : [`${c}_1`, `${c}_2`];
      const keepOrig = p.keep_original !== false;
      const n = names.length;
      if (lang === 'sql') {
        const sp = `string_split(COALESCE(ss_str(${qi(c)}), ''), ${ql(d)})`;
        const exprs = names.map((nm, i) =>
          i === n - 1
            ? [nm, `CASE WHEN len(${sp}) > ${n} THEN NULLIF(trim(array_to_string(list_slice(${sp}, ${n}, len(${sp})), ${ql(d)})), '') ELSE trim(${sp}[${i + 1}]) END`] as [string, string]
            : [nm, `trim(${sp}[${i + 1}])`] as [string, string]
        );
        const base = keepOrig ? cols : cols.filter((x) => x !== c);
        const rep = new Map<string, string>();
        const add: [string, string][] = [];
        for (const [nm, e] of exprs) (base.includes(nm) ? rep.set(nm, e) : add.push([nm, e]));
        return `SELECT ${selectList(base, rep, add)} FROM ${S}`;
      }
      if (lang === 'py') {
        const sp = `ss_str(pl.col(${py(c)})).fill_null("").str.split(${py(d)})`;
        const exprs = names.map((nm, i) =>
          i === n - 1
            ? `pl.when(${sp}.list.len() > ${n}).then(${sp}.list.slice(${n - 1}).list.join(${py(d)}).str.strip_chars().replace("", None)).otherwise(${sp}.list.get(${i}, null_on_oob=True).str.strip_chars()).alias(${py(nm)})`
            : `${sp}.list.get(${i}, null_on_oob=True).str.strip_chars().alias(${py(nm)})`
        );
        const lines = [`df = df.with_columns([${exprs.join(', ')}])`];
        if (!keepOrig && !names.includes(c)) lines.push(`df = df.drop(${py(c)})`);
        return lines;
      }
      let t = M;
      names.forEach((nm, i) => {
        const body = `let parts = Text.Split(if Record.Field(_, ${ms(c)}) = null then "" else SsStr(Record.Field(_, ${ms(c)})), ${ms(d)}) in ${
          i === n - 1
            ? `if List.Count(parts) > ${n} then (let r = Text.Trim(Text.Combine(List.Skip(parts, ${n - 1}), ${ms(d)})) in if r = "" then null else r) else if List.Count(parts) > ${i} then Text.Trim(parts{${i}}) else null`
            : `if List.Count(parts) > ${i} then Text.Trim(parts{${i}}) else null`
        }`;
        t = mAddOrReplace(t, [...cols, ...names.slice(0, i)], nm, body);
      });
      return keepOrig || names.includes(c) ? t : `Table.RemoveColumns(${t}, {${ms(c)}})`;
    }

    case 'change_type': {
      const c = p.column;
      if (!c) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      const t = p.target_type || 'text';
      const keepOnError = p.on_error === 'keep';
      const np = numberParser(p);
      if (lang === 'sql') {
        const C = qi(c);
        let e: string;
        if (t === 'integer') e = `CASE WHEN ${np.sql}(${C}) = floor(${np.sql}(${C})) THEN CAST(${np.sql}(${C}) AS BIGINT) END`;
        else if (t === 'float') e = `${np.sql}(${C})`;
        else if (t === 'boolean') e = `CASE WHEN ss_txt(${C}) IN ('true', 'yes', 'y', '1') THEN TRUE WHEN ss_txt(${C}) IN ('false', 'no', 'n', '0') THEN FALSE END`;
        else if (t === 'date') e = `ss_date(${C})`;
        else return withCol(cols, c, `ss_str(${C})`, S);
        const full = keepOnError ? `COALESCE(ss_str(${e}), ss_str(${C}))` : e;
        return withCol(cols, c, `CASE WHEN ss_empty(${C}) THEN NULL ELSE ${full} END`, S);
      }
      if (lang === 'py') {
        const C = `pl.col(${py(c)})`;
        let e: string;
        if (t === 'integer') e = `pl.when(${np.py}(${C}) == ${np.py}(${C}).floor()).then(${np.py}(${C}).cast(pl.Int64, strict=False))`;
        else if (t === 'float') e = `${np.py}(${C})`;
        else if (t === 'boolean') e = `pl.when(ss_txt(${C}).is_in(["true", "yes", "y", "1"])).then(True).when(ss_txt(${C}).is_in(["false", "no", "n", "0"])).then(False)`;
        else if (t === 'date') e = `ss_date(${C})`;
        else return [`df = df.with_columns(ss_str(${C}).alias(${py(c)}))`];
        const full = keepOnError ? `pl.coalesce(ss_str(${e}), ss_str(${C}))` : e;
        return [`df = df.with_columns(pl.when(ss_empty(${C})).then(None).otherwise(${full}).alias(${py(c)}))`];
      }
      let fn: string;
      if (t === 'integer') fn = `let n = ${np.m}(_) in if n <> null and n = Number.RoundDown(n) then Int64.From(n) else null`;
      else if (t === 'float') fn = `${np.m}(_)`;
      else if (t === 'boolean') fn = `let s = SsTxt(_) in if List.Contains({"true", "yes", "y", "1"}, s) then true else if List.Contains({"false", "no", "n", "0"}, s) then false else null`;
      else if (t === 'date') fn = `SsDate(_)`;
      else fn = `SsStr(_)`;
      const body = keepOnError ? `let v = (${fn}) in if v = null then _ else v` : fn;
      return `Table.TransformColumns(${M}, {{${ms(c)}, each if SsEmpty(_) then null else ${body}}})`;
    }

    case 'rename_column': {
      const o = p.old_name || p.column;
      const nn = p.new_name;
      if (!o || !nn || o === nn) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      if (lang === 'sql') return `SELECT ${cols.map((c) => (c === o ? `${qi(c)} AS ${qi(nn)}` : qi(c))).join(', ')}, __rid FROM ${S}`;
      if (lang === 'py') return [`df = df.rename({${py(o)}: ${py(nn)}})`];
      return `Table.RenameColumns(${M}, {{${ms(o)}, ${ms(nn)}}})`;
    }

    case 'math_transform': {
      const c1 = p.column1 || p.column;
      const c2 = p.column2;
      const op = p.operation || 'add';
      const mathOp = p.math_operator || '+';
      const operand = p.operand !== undefined && p.operand !== '' ? parseSharedNumber(p.operand) : null;
      const decimals = p.decimals !== undefined ? Number(p.decimals) : 2;
      const target = p.output_column || p.target_column || c1 || 'calculated';
      if (op === 'formula' && p.expression) {
        const f = formulaExprs(p.expression, cols);
        if (lang === 'sql') return withCol(cols, target, f.sql, S);
        if (lang === 'py') return [`df = df.with_columns((${f.py}).alias(${py(target)}))`];
        return mAddOrReplace(M, cols, target, f.m);
      }
      const np = numberParser(p);
      const rd = p.decimals !== undefined ? decimals : operand ?? 0;
      // v1 = blank ? null : number
      const V1 = { sql: `${op === 'clean_numeric' ? np.sql : 'ss_num'}(${qi(c1)})`, py: `${op === 'clean_numeric' ? np.py : 'ss_num'}(pl.col(${py(c1)}))`, m: `${op === 'clean_numeric' ? np.m : 'SsNum'}(Record.Field(_, ${ms(c1)}))` };
      const opnd = operand ?? 0;
      const v2 = (l: 'sql' | 'py' | 'm') => {
        if (c2 && cols.includes(c2)) {
          const C2 = l === 'sql' ? qi(c2) : l === 'py' ? `pl.col(${py(c2)})` : `Record.Field(_, ${ms(c2)})`;
          return l === 'sql' ? `(CASE WHEN ss_empty(${C2}) THEN ${opnd} ELSE ss_num(${C2}) END)` : l === 'py' ? `pl.when(ss_empty(${C2})).then(${opnd}).otherwise(ss_num(${C2}))` : `(if SsEmpty(${C2}) then ${opnd} else SsNum(${C2}))`;
        }
        if (c2 !== undefined && c2 !== null && c2 !== '') {
          const n = parseSharedNumber(c2);
          return n === null ? 'NULL' : String(n);
        }
        return String(opnd);
      };
      let e: { sql: string; py: string; m: string };
      switch (op) {
        case 'clean_numeric': e = { sql: V1.sql, py: V1.py, m: V1.m }; break;
        case 'abs': e = { sql: `abs(${V1.sql})`, py: `${V1.py}.abs()`, m: `(let v = ${V1.m} in if v = null then null else Number.Abs(v))` }; break;
        case 'round': e = { sql: `ss_round(${V1.sql}, ${rd})`, py: `ss_round(${V1.py}, ${rd})`, m: `SsRound(${V1.m}, ${rd})` }; break;
        case 'roundup': e = { sql: `ss_roundup(${V1.sql}, ${rd})`, py: `ss_roundup(${V1.py}, ${rd})`, m: `SsRoundUp(${V1.m}, ${rd})` }; break;
        case 'rounddown': e = { sql: `ss_rounddown(${V1.sql}, ${rd})`, py: `ss_rounddown(${V1.py}, ${rd})`, m: `SsRoundDown(${V1.m}, ${rd})` }; break;
        case 'add': case '+': e = { sql: `(${V1.sql} + ${opnd})`, py: `(${V1.py} + ${opnd})`, m: `(let v = ${V1.m} in if v = null then null else v + ${opnd})` }; break;
        case 'subtract': case '-': e = { sql: `(${V1.sql} - ${opnd})`, py: `(${V1.py} - ${opnd})`, m: `(let v = ${V1.m} in if v = null then null else v - ${opnd})` }; break;
        case 'multiply': case '*': e = { sql: `(${V1.sql} * ${opnd})`, py: `(${V1.py} * ${opnd})`, m: `(let v = ${V1.m} in if v = null then null else v * ${opnd})` }; break;
        case 'divide': case '/':
          e = operand === null || operand === 0
            ? { sql: 'CAST(NULL AS DOUBLE)', py: 'pl.lit(None, dtype=pl.Float64)', m: 'null' }
            : { sql: `(${V1.sql} / ${operand})`, py: `(${V1.py} / ${operand})`, m: `(let v = ${V1.m} in if v = null then null else v / ${operand})` };
          break;
        case 'arithmetic': {
          const o = ['+', '-', '*', '/'].includes(mathOp) ? mathOp : '+';
          if (o === '/') e = { sql: `(${V1.sql} / NULLIF(${v2('sql')}, 0))`, py: `pl.when(${v2('py')} == 0).then(None).otherwise(${V1.py} / ${v2('py')})`, m: `(let v = ${V1.m}, w = ${v2('m')} in if v = null or w = null or w = 0 then null else v / w)` };
          else e = { sql: `(${V1.sql} ${o} ${v2('sql')})`, py: `(${V1.py} ${o} ${v2('py')})`, m: `(let v = ${V1.m}, w = ${v2('m')} in if v = null or w = null then null else v ${o} w)` };
          break;
        }
        case 'percent_change':
          e = {
            sql: `ss_round((${v2('sql')} - ${V1.sql}) / NULLIF(abs(${V1.sql}), 0) * 100, ${decimals})`,
            py: `ss_round(pl.when(${V1.py} == 0).then(None).otherwise((${v2('py')} - ${V1.py}) / ${V1.py}.abs() * 100), ${decimals})`,
            m: `(let v = ${V1.m}, w = ${v2('m')} in if v = null or w = null or v = 0 then null else SsRound((w - v) / Number.Abs(v) * 100, ${decimals}))`,
          };
          break;
        case 'bin': {
          const bins: any[] = (Array.isArray(p.bins) ? p.bins : []).slice().sort((a: any, b: any) => Number(a.max) - Number(b.max));
          const other = p.bin_other || 'High';
          e = {
            sql: `CASE WHEN ${V1.sql} IS NULL THEN NULL ${bins.map((b) => `WHEN ${V1.sql} <= ${Number(b.max)} THEN ${ql(b.label)}`).join(' ')} ELSE ${ql(other)} END`,
            py: `${bins.reduce((acc, b) => `${acc}.when(${V1.py} <= ${Number(b.max)}).then(pl.lit(${py(b.label)}))`, `pl.when(${V1.py}.is_null()).then(None)`)}.otherwise(pl.lit(${py(other)}))`,
            m: `(let v = ${V1.m} in if v = null then null ${bins.map((b) => `else if v <= ${Number(b.max)} then ${ms(b.label)} `).join('')}else ${ms(other)})`,
          };
          break;
        }
        default:
          return unsupported(`the math operation "${op}"`);
      }
      if (lang === 'sql') return withCol(cols, target, e.sql, S);
      if (lang === 'py') return [`df = df.with_columns((${e.py}).alias(${py(target)}))`];
      return mAddOrReplace(M, cols, target, e.m);
    }

    case 'text_transform': {
      const c = p.column;
      const op = p.operation || 'upper';
      const target = p.output_column || p.target_column || c;
      if (!c || !target) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      const len = Math.max(0, Number(p.length ?? 5));
      const start = Math.max(0, Number(p.start ?? 1) - 1);
      const sep = p.concat_separator ?? ' ';
      const extra: string[] = Array.isArray(p.concat_columns) ? p.concat_columns : [];
      const delim = p.delimiter ?? ' ';
      if (op === 'split_by_position') return unsupported('Split by position');
      const keepsNull = op !== 'length' && op !== 'concat';
      if (lang === 'sql') {
        const s = `COALESCE(ss_str(${qi(c)}), '')`;
        const e: Record<string, string> = {
          upper: `upper(${s})`, uppercase: `upper(${s})`, lower: `lower(${s})`, lowercase: `lower(${s})`,
          trim: `regexp_replace(trim(${s}), '\\s+', ' ', 'g')`,
          clean: `trim(regexp_replace(${s}, '[\\x00-\\x1F\\x7F]', '', 'g'))`,
          proper: `array_to_string(list_transform(regexp_extract_all(lower(${s}), '\\pL+|[^\\pL]+'), t -> CASE WHEN regexp_matches(t, '^\\pL') THEN upper(left(t, 1)) || substr(t, 2) ELSE t END), '')`,
          left: `left(${s}, ${len})`, right: len === 0 ? `''` : `right(${s}, ${len})`,
          mid: `substr(${s}, ${start + 1}, ${len})`, length: `length(${s})`,
          concat: [s, ...extra.map((x) => `COALESCE(ss_str(${qi(x)}), '')`)].join(` || ${ql(sep)} || `),
          extract_delimiter: (p.position || 'before') === 'after' ? `CASE WHEN position(${ql(delim)} IN ${s}) > 0 THEN substr(${s}, position(${ql(delim)} IN ${s}) + ${String(delim).length}) ELSE '' END` : `split_part(${s}, ${ql(delim)}, 1)`,
          clean_spaces: `trim(regexp_replace(${s}, '[\\s\\x{00A0}]+', ' ', 'g'))`,
        };
        e.title = e.proper;
        if (!e[op]) return unsupported(`the text operation "${op}"`);
        return withCol(cols, target, keepsNull ? `CASE WHEN ${qi(c)} IS NULL THEN NULL ELSE ${e[op]} END` : e[op], S);
      }
      if (lang === 'py') {
        const s = `ss_str(pl.col(${py(c)})).fill_null("")`;
        const e: Record<string, string> = {
          upper: `${s}.str.to_uppercase()`, uppercase: `${s}.str.to_uppercase()`, lower: `${s}.str.to_lowercase()`, lowercase: `${s}.str.to_lowercase()`,
          trim: `${s}.str.strip_chars().str.replace_all(r"\\s+", " ")`,
          clean: `${s}.str.replace_all(r"[\\x00-\\x1F\\x7F]", "").str.strip_chars()`,
          proper: `${s}.str.to_lowercase().str.to_titlecase()`,
          left: `${s}.str.slice(0, ${len})`, right: len === 0 ? 'pl.lit("")' : `${s}.str.slice(-${len})`,
          mid: `${s}.str.slice(${start}, ${len})`, length: `${s}.str.len_chars()`,
          concat: `pl.concat_str([${[s, ...extra.map((x) => `ss_str(pl.col(${py(x)})).fill_null("")`)].join(', ')}], separator=${py(sep)})`,
          extract_delimiter: (p.position || 'before') === 'after' ? `pl.when(${s}.str.contains(${py(delim)}, literal=True)).then(${s}.str.splitn(${py(delim)}, 2).struct.field("field_1")).otherwise(pl.lit(""))` : `${s}.str.split(${py(delim)}).list.first()`,
          clean_spaces: `${s}.str.replace_all(r"\\s+", " ").str.strip_chars()`,
        };
        e.title = e.proper;
        if (!e[op]) return unsupported(`the text operation "${op}"`);
        return [`df = df.with_columns(${keepsNull ? `pl.when(pl.col(${py(c)}).is_null()).then(None).otherwise(${e[op]})` : e[op]}.alias(${py(target)}))`];
      }
      const s = `(if Record.Field(_, ${ms(c)}) = null then "" else SsStr(Record.Field(_, ${ms(c)})))`;
      const e: Record<string, string> = {
        upper: `Text.Upper(${s})`, uppercase: `Text.Upper(${s})`, lower: `Text.Lower(${s})`, lowercase: `Text.Lower(${s})`,
        trim: `Text.Combine(List.Select(Text.SplitAny(Text.Trim(${s}), " #(tab)#(cr)#(lf)"), each _ <> ""), " ")`,
        clean: `Text.Trim(Text.Clean(${s}))`, proper: `Text.Proper(${s})`,
        left: `Text.Start(${s}, ${len})`, right: `Text.End(${s}, ${len})`, mid: `Text.Middle(${s}, ${start}, ${len})`, length: `Text.Length(${s})`,
        concat: `Text.Combine({${[s, ...extra.map((x) => `(if Record.Field(_, ${ms(x)}) = null then "" else SsStr(Record.Field(_, ${ms(x)})))`)].join(', ')}}, ${ms(sep)})`,
        extract_delimiter: (p.position || 'before') === 'after' ? `let parts = Text.Split(${s}, ${ms(delim)}) in Text.Combine(List.Skip(parts, 1), ${ms(delim)})` : `Text.Split(${s}, ${ms(delim)}){0}`,
        clean_spaces: `Text.Combine(List.Select(Text.SplitAny(Text.Trim(${s}), " #(00A0)#(tab)#(cr)#(lf)"), each _ <> ""), " ")`,
      };
      e.title = e.proper;
      if (!e[op]) return unsupported(`the text operation "${op}"`);
      return mAddOrReplace(M, cols, target, keepsNull ? `if Record.Field(_, ${ms(c)}) = null then null else ${e[op]}` : e[op]);
    }

    case 'date_transform': {
      const c = p.column;
      if (!c) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      const op = p.operation || p.part || 'extract_part';
      const part = p.date_part || p.part || (op !== 'extract_part' ? op : 'year');
      const target = p.output_column || p.target_column || `${c}_${part}`;
      const amt = Number(p.amount ?? 0);
      const unit = p.unit || 'day';
      const c2 = p.second_column;
      if (lang === 'sql') {
        const d = `ss_date(${qi(c)})`;
        const d2 = c2 ? `ss_date(${qi(c2)})` : 'CAST(NULL AS DATE)';
        let e: string;
        if (op === 'eomonth') e = `last_day(${d} + INTERVAL (${amt}) MONTH)`;
        else if (op === 'datedif') {
          const u = String(unit).toLowerCase();
          const months = `((year(${d2}) - year(${d})) * 12 + month(${d2}) - month(${d}) - CASE WHEN day(${d2}) < day(${d}) THEN 1 ELSE 0 END)`;
          const years = `(year(${d2}) - year(${d}) - CASE WHEN month(${d2}) < month(${d}) OR (month(${d2}) = month(${d}) AND day(${d2}) < day(${d})) THEN 1 ELSE 0 END)`;
          const body = ['y', 'year', 'years'].includes(u) ? years : ['m', 'month', 'months'].includes(u) ? months : ['d', 'day', 'days'].includes(u) || !['ym', 'yd', 'md'].includes(u) ? `datediff('day', ${d}, ${d2})` : unsupported(`DATEDIF unit "${unit}"`);
          e = `CASE WHEN ${d2} < ${d} THEN NULL ELSE ${body} END`;
        } else if (op === 'networkdays') {
          const lo = `least(${d}, ${d2})`, hi = `greatest(${d}, ${d2})`;
          e = `(CASE WHEN ${d2} >= ${d} THEN 1 ELSE -1 END) * len(list_filter(generate_series(CAST(${lo} AS TIMESTAMP), CAST(${hi} AS TIMESTAMP), INTERVAL 1 DAY), x -> dayofweek(x) NOT IN (0, 6)))`;
        } else if (op === 'add_time') e = `CAST(${d} + INTERVAL (${amt}) ${unit === 'year' ? 'YEAR' : unit === 'month' ? 'MONTH' : 'DAY'} AS DATE)`;
        else if (op === 'fiscal_year') {
          const sm = Number(p.fiscal_start_month ?? 4) >= 1 && Number(p.fiscal_start_month ?? 4) <= 12 ? Number(p.fiscal_start_month ?? 4) : 1;
          e = `'FY' || CAST(year(${d}) + CASE WHEN ${sm} > 1 AND month(${d}) >= ${sm} THEN 1 ELSE 0 END AS VARCHAR)`;
        } else {
          const map: Record<string, string> = {
            year: `year(${d})`, month: `month(${d})`, day: `day(${d})`, quarter: `quarter(${d})`,
            week: `CAST(floor((dayofyear(${d}) - 1 + dayofweek(make_date(year(${d}), 1, 1))) / 7) + 1 AS BIGINT)`,
            day_name: `dayname(${d})`, weekday: `dayofweek(${d})`,
          };
          e = map[part] || `${d}`;
        }
        return withCol(cols, target, `CASE WHEN ${d} IS NULL THEN NULL ELSE ${e} END`, S);
      }
      if (lang === 'py') {
        const d = `ss_date(pl.col(${py(c)}))`;
        const d2 = c2 ? `ss_date(pl.col(${py(c2)}))` : 'pl.lit(None, dtype=pl.Date)';
        let e: string;
        if (op === 'eomonth') e = `${d}.dt.offset_by(${py(`${amt}mo`)}).dt.month_end()`;
        else if (op === 'datedif') {
          const u = String(unit).toLowerCase();
          const months = `((${d2}.dt.year() - ${d}.dt.year()) * 12 + ${d2}.dt.month().cast(pl.Int32) - ${d}.dt.month().cast(pl.Int32) - (${d2}.dt.day() < ${d}.dt.day()).cast(pl.Int32))`;
          const years = `(${d2}.dt.year() - ${d}.dt.year() - ((${d2}.dt.month() < ${d}.dt.month()) | ((${d2}.dt.month() == ${d}.dt.month()) & (${d2}.dt.day() < ${d}.dt.day()))).cast(pl.Int32))`;
          const body = ['y', 'year', 'years'].includes(u) ? years : ['m', 'month', 'months'].includes(u) ? months : ['d', 'day', 'days'].includes(u) || !['ym', 'yd', 'md'].includes(u) ? `(${d2} - ${d}).dt.total_days()` : unsupported(`DATEDIF unit "${unit}"`);
          e = `pl.when(${d2} < ${d}).then(None).otherwise(${body})`;
        } else if (op === 'networkdays') {
          e = `pl.when(${d2} >= ${d}).then(pl.business_day_count(${d}, ${d2}.dt.offset_by("1d"))).otherwise(-pl.business_day_count(${d2}, ${d}.dt.offset_by("1d")))`;
        } else if (op === 'add_time') e = `${d}.dt.offset_by(${py(`${amt}${unit === 'year' ? 'y' : unit === 'month' ? 'mo' : 'd'}`)})`;
        else if (op === 'fiscal_year') {
          const sm0 = Number(p.fiscal_start_month ?? 4);
          const sm = sm0 >= 1 && sm0 <= 12 ? sm0 : 1;
          e = `pl.lit("FY") + (${d}.dt.year() + ((${d}.dt.month() >= ${sm}) & pl.lit(${sm > 1 ? 'True' : 'False'})).cast(pl.Int32)).cast(pl.Utf8)`;
        } else {
          const map: Record<string, string> = {
            year: `${d}.dt.year()`, month: `${d}.dt.month()`, day: `${d}.dt.day()`, quarter: `${d}.dt.quarter()`,
            week: `((${d}.dt.ordinal_day() - 1 + (pl.date(${d}.dt.year(), 1, 1).dt.weekday() % 7)) // 7 + 1)`,
            day_name: `${d}.dt.strftime("%A")`, weekday: `(${d}.dt.weekday() % 7)`,
          };
          e = map[part] || d;
        }
        return [`df = df.with_columns(pl.when(${d}.is_null()).then(None).otherwise(${e}).alias(${py(target)}))`];
      }
      const d = `SsDate(Record.Field(_, ${ms(c)}))`;
      const d2 = c2 ? `SsDate(Record.Field(_, ${ms(c2)}))` : 'null';
      let e: string;
      if (op === 'eomonth') e = `Date.EndOfMonth(Date.AddMonths(d, ${amt}))`;
      else if (op === 'datedif') {
        const u = String(unit).toLowerCase();
        const months = `((Date.Year(d2) - Date.Year(d)) * 12 + Date.Month(d2) - Date.Month(d) - (if Date.Day(d2) < Date.Day(d) then 1 else 0))`;
        const years = `(Date.Year(d2) - Date.Year(d) - (if Date.Month(d2) < Date.Month(d) or (Date.Month(d2) = Date.Month(d) and Date.Day(d2) < Date.Day(d)) then 1 else 0))`;
        const body = ['y', 'year', 'years'].includes(u) ? years : ['m', 'month', 'months'].includes(u) ? months : ['d', 'day', 'days'].includes(u) || !['ym', 'yd', 'md'].includes(u) ? `Duration.Days(d2 - d)` : unsupported(`DATEDIF unit "${unit}"`);
        e = `if d2 = null or d2 < d then null else ${body}`;
      } else if (op === 'networkdays') {
        e = `if d2 = null then null else (if d2 >= d then 1 else -1) * List.Count(List.Select(List.Dates(List.Min({d, d2}), Duration.Days(List.Max({d, d2}) - List.Min({d, d2})) + 1, #duration(1, 0, 0, 0)), each Date.DayOfWeek(_, Day.Monday) < 5))`;
      } else if (op === 'add_time') e = unit === 'year' ? `Date.AddYears(d, ${amt})` : unit === 'month' ? `Date.AddMonths(d, ${amt})` : `Date.AddDays(d, ${amt})`;
      else if (op === 'fiscal_year') {
        const sm0 = Number(p.fiscal_start_month ?? 4);
        const sm = sm0 >= 1 && sm0 <= 12 ? sm0 : 1;
        e = `"FY" & Text.From(Date.Year(d) + (if ${sm} > 1 and Date.Month(d) >= ${sm} then 1 else 0))`;
      } else {
        const map: Record<string, string> = {
          year: 'Date.Year(d)', month: 'Date.Month(d)', day: 'Date.Day(d)', quarter: 'Date.QuarterOfYear(d)',
          week: 'Date.WeekOfYear(d, Day.Sunday)', day_name: 'Date.DayOfWeekName(d, "en-US")', weekday: 'Date.DayOfWeek(d, Day.Sunday)',
        };
        e = map[part] || 'd';
      }
      return mAddOrReplace(M, cols, target, `let d = ${d}, d2 = ${d2} in if d = null then null else ${e}`);
    }

    case 'conditional': {
      const target = p.new_column || p.output_column || p.target_column || 'conditional_col';
      const clauses: any[] = p.rules || p.clauses || [{ column: p.column, operator: p.operator || 'eq', value: p.value, then_value: p.then_value ?? 'True' }];
      const elseVal = p.else_value ?? 'Other';
      const outcomes = [...clauses.map((c: any) => c.result ?? c.then_value), elseVal];
      const allNum = outcomes.every((v) => v !== undefined && v !== null && parseSharedNumber(v) !== null);
      const val = (v: any) => (allNum ? parseSharedNumber(v) : v ?? 'True');
      const valid = clauses.filter((c) => c && c.column);
      if (lang === 'sql') return withCol(cols, target, `CASE ${valid.map((c) => `WHEN ${condSql(c.column, c.operator || 'eq', c.value)} THEN ${sqlLit(val(c.result ?? c.then_value ?? 'True'))}`).join(' ')} ELSE ${sqlLit(val(elseVal))} END`.replace('CASE  ELSE', 'CASE WHEN FALSE THEN NULL ELSE'), S);
      if (lang === 'py') {
        const chain = valid.reduce((acc, c, i) => `${i === 0 ? 'pl' : acc}.when(${condPy(c.column, c.operator || 'eq', c.value)}).then(pl.lit(${py(val(c.result ?? c.then_value ?? 'True'))}))`, '');
        return [`df = df.with_columns(${valid.length ? `${chain}.otherwise(pl.lit(${py(val(elseVal))}))` : `pl.lit(${py(val(elseVal))})`}.alias(${py(target)}))`];
      }
      const body = valid.reduceRight((acc, c) => `if ${condM(c.column, c.operator || 'eq', c.value)} then ${mv(val(c.result ?? c.then_value ?? 'True'))} else ${acc}`, mv(val(elseVal)));
      return mAddOrReplace(M, cols, target, body);
    }

    case 'group_by': {
      const g: string[] = (Array.isArray(p.group_by_columns) ? p.group_by_columns : Array.isArray(p.group_columns) ? p.group_columns : p.group_by ? [p.group_by] : []).filter(Boolean);
      const aggs: any[] = Array.isArray(p.aggregations) && p.aggregations.length ? p.aggregations : [{ column: p.agg_column || 'amount', function: p.agg_func || 'sum', alias: p.alias || `${p.agg_func || 'sum'}_${p.agg_column || 'amount'}` }];
      const fnOf = (a: any) => String(a.agg_func || a.function || 'sum').toLowerCase();
      const aliasOf = (a: any) => a.output_column || a.output_name || a.alias || `${fnOf(a)}_${a.column}`;
      if (lang === 'sql') {
        const keys = g.map((c) => `ss_key(${qi(c)})`);
        const sel = [
          ...g.map((c) => `arg_min(${qi(c)}, __rid) AS ${qi(c)}`),
          ...aggs.map((a) => {
            const C = qi(a.column);
            const f = fnOf(a);
            const nb = `CASE WHEN ss_empty(${C}) THEN NULL ELSE ${C} END`;
            let e: string;
            if (f === 'count') e = `COUNT(${nb})`;
            else if (f === 'distinct_count') e = `COUNT(DISTINCT CASE WHEN ss_empty(${C}) THEN NULL ELSE ss_key(${C}) END)`;
            else if (f === 'sum') e = `SUM(ss_num(${C}))`;
            else if (f === 'avg' || f === 'mean') e = `AVG(ss_num(${C}))`;
            else if (f === 'min' || f === 'max') {
              const k = kindsIn[a.column] || 'text';
              e = k === 'number' ? `${f.toUpperCase()}(ss_num(${C}))` : k === 'date' ? `arg_${f}(${nb}, ss_date(${C}))` : `${f.toUpperCase()}(${nb})`;
            } else return unsupported(`the aggregation "${f}"`);
            return `${e} AS ${qi(aliasOf(a))}`;
          }),
          `MIN(__rid) AS __first`,
        ];
        const inner = `SELECT ${sel.join(', ')} FROM ${S}${keys.length ? ` GROUP BY ${keys.join(', ')}` : ''}`;
        return `SELECT * EXCLUDE (__first), ROW_NUMBER() OVER (ORDER BY __first) AS __rid FROM (${inner})`;
      }
      if (lang === 'py') {
        const aggExprs = aggs.map((a) => {
          const C = `pl.col(${py(a.column)})`;
          const f = fnOf(a);
          const nb = `pl.when(ss_empty(${C})).then(None).otherwise(${C})`;
          let e: string;
          if (f === 'count') e = `${nb}.count()`;
          else if (f === 'distinct_count') e = `pl.when(ss_empty(${C})).then(None).otherwise(ss_key(${C})).drop_nulls().n_unique()`;
          else if (f === 'sum') e = `pl.when(ss_num(${C}).count() > 0).then(ss_num(${C}).sum())`;
          else if (f === 'avg' || f === 'mean') e = `ss_num(${C}).mean()`;
          else if (f === 'min' || f === 'max') {
            const k = kindsIn[a.column] || 'text';
            e = k === 'number' ? `ss_num(${C}).${f}()` : k === 'date' ? `${nb}.sort_by(ss_date(${C})).drop_nulls().${f === 'min' ? 'first' : 'last'}()` : `${nb}.${f}()`;
          } else return unsupported(`the aggregation "${f}"`);
          return `(${e}).alias(${py(aliasOf(a))})`;
        });
        const keyCols = g.map((c, i) => `ss_key(pl.col(${py(c)})).alias("_g${i}")`);
        const firsts = g.map((c) => `pl.col(${py(c)}).first()`);
        if (!g.length) return [`df = df.select([${aggExprs.join(', ')}])`];
        return [
          `df = (df.with_columns([${keyCols.join(', ')}])`,
          `        .group_by([${g.map((_, i) => `"_g${i}"`).join(', ')}], maintain_order=True)`,
          `        .agg([${[...firsts, ...aggExprs].join(', ')}])`,
          `        .drop([${g.map((_, i) => `"_g${i}"`).join(', ')}]))`,
        ];
      }
      const mAgg = aggs.map((a) => {
        const f = fnOf(a);
        const vals = `List.Select(Table.Column(t, ${ms(a.column)}), each not SsEmpty(_))`;
        let e: string;
        if (f === 'count') e = `List.Count(${vals})`;
        else if (f === 'distinct_count') e = `List.Count(List.Distinct(List.Transform(${vals}, SsKey)))`;
        else if (f === 'sum') e = `List.Sum(List.RemoveNulls(List.Transform(${vals}, SsNum)))`;
        else if (f === 'avg' || f === 'mean') e = `List.Average(List.RemoveNulls(List.Transform(${vals}, SsNum)))`;
        else if (f === 'min' || f === 'max') {
          const k = kindsIn[a.column] || 'text';
          e = k === 'number' ? `List.${f === 'min' ? 'Min' : 'Max'}(List.RemoveNulls(List.Transform(${vals}, SsNum)))` : `List.${f === 'min' ? 'Min' : 'Max'}(${vals})`;
        } else return unsupported(`the aggregation "${f}"`);
        return `{${ms(aliasOf(a))}, (t) => ${e}}`;
      });
      if (!g.length) return `Table.FromRecords({[${aggs.map((a, i) => `${mi(aliasOf(a))} = (${mAgg[i].replace(/^\{"[^"]*", \(t\) => /, '(t) => ').replace(/\}$/, '')})(${M})`).join(', ')}]})`;
      const withKeys = `Table.AddColumn(${M}, "__g", each Text.Combine(List.Transform({${g.map((c) => `Record.Field(_, ${ms(c)})`).join(', ')}}, SsKey), "|"))`;
      const firsts = g.map((c) => `{${ms(c)}, (t) => Table.Column(t, ${ms(c)}){0}}`);
      return `Table.RemoveColumns(Table.Group(${withKeys}, {"__g"}, {${[...firsts, ...mAgg].join(', ')}}), {"__g"})`;
    }

    case 'window_calc': {
      const fn = String(p.calc_type || p.function || p.window_type || 'running_total').toLowerCase();
      const valCol = p.value_column || (p.output_column ? p.target_column : p.column) || 'amount';
      const outCol = p.output_column || (p.value_column ? p.target_column : undefined) || `${fn}_${valCol}`;
      const part: string[] = Array.isArray(p.partition_by) ? p.partition_by.filter(Boolean) : [];
      const orderCol: string | undefined = p.order_by || undefined;
      const desc = String(p.order_direction || 'asc').toLowerCase() === 'desc';
      const win = Math.max(1, Number(p.window_size ?? 3));
      const off = Math.max(1, Number(p.offset ?? 1));
      const rankCol = fn === 'rank' && orderCol ? orderCol : valCol;
      if (!['running_total', 'row_number', 'percent_of_total', 'moving_avg', 'running_avg', 'lag', 'lead', 'rank'].includes(fn)) return unsupported(`the window calculation "${fn}"`);
      if (lang === 'sql') {
        const P = part.length ? `PARTITION BY ${part.map((c) => `ss_key(${qi(c)})`).join(', ')}` : '';
        const ordKey = (c: string, d: boolean) => {
          const C = qi(c);
          const dir = d ? 'DESC' : 'ASC';
          return `CASE WHEN ss_empty(${C}) THEN 3 WHEN ss_num(${C}) IS NOT NULL THEN 0 WHEN ss_date(${C}) IS NOT NULL THEN 1 ELSE 2 END, ss_num(${C}) ${dir}, ss_date(${C}) ${dir}, ss_txt(${C}) ${dir}, ss_case(${C}) ${dir}`;
        };
        const O = `ORDER BY ${orderCol ? `${ordKey(orderCol, desc)}, ` : ''}__rid`;
        const v = `ss_num(${qi(valCol)})`;
        let e: string;
        if (fn === 'row_number') e = `ROW_NUMBER() OVER (${P} ${O})`;
        else if (fn === 'running_total') e = `CASE WHEN COUNT(${v}) OVER (${P} ${O} ROWS UNBOUNDED PRECEDING) > 0 THEN SUM(${v}) OVER (${P} ${O} ROWS UNBOUNDED PRECEDING) END`;
        else if (fn === 'running_avg') e = `AVG(${v}) OVER (${P} ${O} ROWS UNBOUNDED PRECEDING)`;
        else if (fn === 'moving_avg') e = `AVG(${v}) OVER (${P} ${O} ROWS BETWEEN ${win - 1} PRECEDING AND CURRENT ROW)`;
        else if (fn === 'percent_of_total') e = `CASE WHEN ${v} IS NULL OR SUM(${v}) OVER (${P}) = 0 THEN NULL ELSE ${v} / SUM(${v}) OVER (${P}) * 100 END`;
        else if (fn === 'lag' || fn === 'lead') e = `${fn.toUpperCase()}(${qi(valCol)}, ${off}) OVER (${P} ${O})`;
        else {
          // rank: numbers only when the partition has numbers; blanks unranked.
          const C = qi(rankCol);
          const k = `CASE WHEN ss_empty(${C}) THEN 3 WHEN ss_num(${C}) IS NOT NULL THEN 0 WHEN ss_date(${C}) IS NOT NULL THEN 1 ELSE 2 END`;
          const dir = desc ? 'DESC' : 'ASC';
          const rk = String(p.rank_method || '').toLowerCase() === 'dense' ? 'DENSE_RANK' : 'RANK';
          const gp = part.map((c) => `ss_key(${qi(c)})`);
          const stage1 = `SELECT *, MAX(CASE WHEN ss_num(${C}) IS NOT NULL THEN 1 ELSE 0 END) OVER (${P}) AS __hasnum FROM ${S}`;
          const stage2 = `SELECT *, (${k} <> 3 AND (__hasnum = 0 OR ${k} = 0)) AS __elig FROM (${stage1})`;
          const rankExpr = `CASE WHEN __elig THEN ${rk}() OVER (PARTITION BY ${[...gp, '__elig'].join(', ')} ORDER BY ${k}, ss_num(${C}) ${dir}, ss_date(${C}) ${dir}, ss_txt(${C}) ${dir}, ss_case(${C}) ${dir}) END`;
          const rep = new Map<string, string>();
          const add: [string, string][] = [];
          if (cols.includes(outCol)) rep.set(outCol, rankExpr);
          else add.push([outCol, rankExpr]);
          return `SELECT ${selectList(cols, rep, add)} FROM (${stage2})`;
        }
        return withCol(cols, outCol, e, S);
      }
      if (lang === 'py') {
        const lines: string[] = [];
        const okeys = orderCol ? [`*ss_order_keys(${py(orderCol)}, ${desc ? 'True' : 'False'}, 0)[0]`] : [];
        lines.push(`_w = df.with_row_index("_rid")${part.length ? `.with_columns([${part.map((c, i) => `ss_key(pl.col(${py(c)})).alias("_p${i}")`).join(', ')}])` : '.with_columns(pl.lit(0).alias("_p0"))'}`);
        const P = part.length ? part.map((_, i) => `"_p${i}"`) : ['"_p0"'];
        if (orderCol) lines.push(`_w = _w.with_columns([${okeys[0]}]).sort([${P.join(', ')}, "_k0", "_n0", "_d0", "_t0", "_c0", "_rid"], descending=[${P.map(() => 'False').join(', ')}, False, ${desc ? 'True, True, True, True' : 'False, False, False, False'}, False], nulls_last=True)`);
        else lines.push(`_w = _w.sort([${P.join(', ')}, "_rid"])`);
        const v = `ss_num(pl.col(${py(valCol)}))`;
        const over = `.over([${P.join(', ')}])`;
        let e: string;
        if (fn === 'row_number') e = `pl.int_range(1, pl.len() + 1)${over}`;
        else if (fn === 'running_total') e = `pl.when(${v}.cum_count()${over} > 0).then(${v}.fill_null(0).cum_sum()${over})`;
        else if (fn === 'running_avg') e = `(${v}.fill_null(0).cum_sum()${over} / ${v}.cum_count()${over}).fill_nan(None)`;
        else if (fn === 'moving_avg') e = `${v}.rolling_mean(window_size=${win}, min_samples=1)${over}`;
        else if (fn === 'percent_of_total') e = `pl.when(${v}.is_null() | (${v}.sum()${over} == 0)).then(None).otherwise(${v} / ${v}.sum()${over} * 100)`;
        else if (fn === 'lag') e = `pl.col(${py(valCol)}).shift(${off})${over}`;
        else if (fn === 'lead') e = `pl.col(${py(valCol)}).shift(-${off})${over}`;
        else {
          const C = `pl.col(${py(rankCol)})`;
          lines.push(`_w = _w.with_columns([(ss_num(${C}).is_not_null().any()${over}).alias("_hasnum"), *ss_order_keys(${py(rankCol)}, ${desc ? 'True' : 'False'}, 1)[0]])`);
          lines.push(`_w = _w.with_columns(((pl.col("_k1") != 3) & (~pl.col("_hasnum") | (pl.col("_k1") == 0))).alias("_elig"))`);
          const method = String(p.rank_method || '').toLowerCase() === 'dense' ? 'dense' : 'min';
          // Rank by (kind, number, date, text) within eligible rows of each partition.
          e = `pl.when(pl.col("_elig")).then(pl.struct(["_k1", ${desc ? 'pl.col("_n1") * -1, pl.col("_d1").dt.epoch("d") * -1' : '"_n1", pl.col("_d1").dt.epoch("d")'}, "_t1", "_c1"]).rank(${py(method)})${over.replace('])', ', "_elig"])')})`;
        }
        lines.push(`_w = _w.with_columns((${e}).alias(${py(outCol)}))`);
        lines.push(`df = _w.sort("_rid").select(${JSON.stringify(columnsOut)})`);
        return lines;
      }
      // Power Query: number rows, sort within partitions, compute with list functions, restore order.
      const pk = `Text.Combine(List.Transform({${part.map((c) => `Record.Field(_, ${ms(c)})`).join(', ')}}, SsKey), "|")`;
      const sortCrit = orderCol
        ? `{each SsKind(Record.Field(_, ${ms(orderCol)})), Order.Ascending}, {each SsNum(Record.Field(_, ${ms(orderCol)})), ${desc ? 'Order.Descending' : 'Order.Ascending'}}, {each SsDate(Record.Field(_, ${ms(orderCol)})), ${desc ? 'Order.Descending' : 'Order.Ascending'}}, {each SsTxt(Record.Field(_, ${ms(orderCol)})), ${desc ? 'Order.Descending' : 'Order.Ascending'}}, `
        : '';
      let perGroup: string;
      const vals = `List.Transform(Table.Column(g, ${ms(valCol)}), (x) => if SsEmpty(x) then null else SsNum(x))`;
      if (fn === 'row_number') perGroup = `List.Numbers(1, Table.RowCount(g))`;
      else if (fn === 'running_total') perGroup = `List.Accumulate(${vals}, {}, (acc, x) => acc & {if x = null then (if List.IsEmpty(acc) then null else List.Last(acc)) else (if List.IsEmpty(acc) or List.Last(acc) = null then 0 else List.Last(acc)) + x})`;
      else if (fn === 'moving_avg') perGroup = `let v = ${vals} in List.Transform(List.Positions(v), (i) => List.Average(List.RemoveNulls(List.Range(v, List.Max({0, i - ${win - 1}}), List.Min({${win}, i + 1})))))`;
      else if (fn === 'running_avg') perGroup = `let v = ${vals} in List.Transform(List.Positions(v), (i) => List.Average(List.RemoveNulls(List.FirstN(v, i + 1))))`;
      else if (fn === 'percent_of_total') perGroup = `let v = ${vals}, t = List.Sum(List.RemoveNulls(v)) in List.Transform(v, (x) => if x = null or t = 0 or t = null then null else x / t * 100)`;
      else if (fn === 'lag' || fn === 'lead') perGroup = `let v = Table.Column(g, ${ms(valCol)}) in List.Transform(List.Positions(v), (i) => let j = i ${fn === 'lag' ? '-' : '+'} ${off} in if j < 0 or j >= List.Count(v) then null else v{j})`;
      else {
        const rc = ms(rankCol);
        const dense = String(p.rank_method || '').toLowerCase() === 'dense';
        // Sortable key per value: numbers rank as numbers when the partition has any; else dates, then text.
        perGroup = `let raw = Table.Column(g, ${rc}), hasNum = List.AnyTrue(List.Transform(raw, (x) => SsNum(x) <> null)), keyOf = (x) => let k = SsKind(x) in if k = 3 or (hasNum and k <> 0) then null else if k = 0 then SsNum(x) else if k = 1 then Number.From(SsDate(x)) - 1000000 else SsTxt(x), ks = List.Transform(raw, keyOf), elig = List.RemoveNulls(ks), uniq = List.Distinct(elig), better = (a, b) => ${desc ? 'a > b' : 'a < b'}, cmp = (a, b) => if Value.Is(a, type number) and Value.Is(b, type number) then better(a, b) else if Value.Is(a, type number) then ${desc ? 'false' : 'true'} else if Value.Is(b, type number) then ${desc ? 'true' : 'false'} else better(a, b) in List.Transform(ks, (x) => if x = null then null else 1 + List.Count(List.Select(${dense ? 'uniq' : 'elig'}, (y) => cmp(y, x))))`;
      }
      const body = `let t0 = Table.AddIndexColumn(${M}, "__i", 0, 1), t1 = Table.AddColumn(t0, "__p", each ${part.length ? pk : '""'}), t2 = Table.Sort(t1, {{"__p", Order.Ascending}, ${sortCrit}{"__i", Order.Ascending}}), grouped = Table.Group(t2, {"__p"}, {{"__rows", (g) => Table.FromColumns(Table.ToColumns(g) & {${perGroup}}, Table.ColumnNames(g) & {"__v"})}}, GroupKind.Global), expanded = Table.Combine(grouped[__rows]), restored = Table.Sort(expanded, {{"__i", Order.Ascending}}), out = ${cols.includes(outCol) ? `Table.RenameColumns(Table.RemoveColumns(restored, {${ms(outCol)}}), {{"__v", ${ms(outCol)}}})` : `Table.RenameColumns(restored, {{"__v", ${ms(outCol)}}})`} in Table.SelectColumns(out, {${columnsOut.map(ms).join(', ')}})`;
      return body;
    }

    case 'pivot': {
      const idx: string[] = Array.isArray(p.index_columns) ? p.index_columns.filter(Boolean) : [];
      const pc: string = p.pivot_column && p.pivot_column !== '__NONE__' ? p.pivot_column : '';
      const vc: string = p.value_column || cols[0];
      const agg = String(p.agg_func || 'sum').toLowerCase();
      if (p.include_row_totals || p.include_grand_total) return unsupported('PivotTable totals');
      if (p.filter_column && p.filter_value !== undefined && p.filter_value !== '' && p.filter_value !== '__ALL__') return unsupported('a PivotTable filter');
      if (!pc || !idx.length) return unsupported('a PivotTable without row and column fields');
      if (!['sum', 'avg', 'min', 'max', 'count'].includes(agg)) return unsupported(`the PivotTable aggregation "${agg}"`);
      if (lang === 'sql') {
        const gk = idx.map((c) => `ss_key(${qi(c)})`).join(', ');
        const labels = idx.map((c) => `FIRST_VALUE(${qi(c)}) OVER (PARTITION BY ${gk} ORDER BY __rid) AS ${qi(c)}`).join(', ');
        const pl0 = `CASE WHEN ss_empty(${qi(pc)}) THEN 'Blank' ELSE FIRST_VALUE(trim(ss_str(${qi(pc)}))) OVER (PARTITION BY ss_key(${qi(pc)}) ORDER BY __rid) END`;
        const using = agg === 'count' ? 'count(*)' : `${agg === 'avg' ? 'avg' : agg}(__v)`;
        const src = `SELECT ${labels}, ${pl0} AS __pv, ss_num(${qi(vc)}) AS __v, MIN(__rid) OVER (PARTITION BY ${gk}) AS __first FROM ${S}`;
        return `SELECT * EXCLUDE (__first), ROW_NUMBER() OVER (ORDER BY __first) AS __rid FROM (PIVOT (${src}) ON __pv USING ${using} GROUP BY ${[...idx.map(qi), '__first'].join(', ')})`;
      }
      if (lang === 'py') {
        const aggFn = agg === 'count' ? '"len"' : agg === 'avg' ? '"mean"' : `pl.when(pl.element().count() > 0).then(pl.element().${agg}())`;
        return [
          `_p = df.with_row_index("_rid").with_columns([${idx.map((c, i) => `ss_key(pl.col(${py(c)})).alias("_g${i}")`).join(', ')}, ss_key(pl.col(${py(pc)})).alias("_pk")])`,
          `_p = _p.with_columns([${idx.map((c, i) => `pl.col(${py(c)}).first().over("_g${i}"${idx.length > 1 ? `, ${idx.map((_, j) => `"_g${j}"`).filter((_, j) => j !== i).join(', ')}` : ''}).alias(${py(c)})`).join(', ')}, pl.when(ss_empty(pl.col(${py(pc)}))).then(pl.lit("Blank")).otherwise(ss_str(pl.col(${py(pc)})).str.strip_chars().first().over("_pk")).alias("_pv"), ss_num(pl.col(${py(vc)})).alias("_v"), pl.col("_rid").min().over([${idx.map((_, i) => `"_g${i}"`).join(', ')}]).alias("_first")])`,
          `df = _p.pivot(on="_pv", index=[${[...idx.map(py), '"_first"'].join(', ')}], values="_v", aggregate_function=${aggFn}).sort("_first").drop("_first")`,
        ];
      }
      const aggM = agg === 'count' ? 'List.Count' : agg === 'avg' ? '(l) => List.Average(List.RemoveNulls(l))' : agg === 'min' ? '(l) => List.Min(List.RemoveNulls(l))' : agg === 'max' ? '(l) => List.Max(List.RemoveNulls(l))' : '(l) => List.Sum(List.RemoveNulls(l))';
      return `let t = Table.SelectColumns(${M}, {${[...idx, pc, vc].map(ms).join(', ')}}), t1 = Table.TransformColumns(t, {{${ms(pc)}, each if SsEmpty(_) then "Blank" else Text.Trim(SsStr(_))}, {${ms(vc)}, SsNum}}) in Table.Pivot(t1, List.Distinct(Table.Column(t1, ${ms(pc)})), ${ms(pc)}, ${ms(vc)}, ${aggM})`;
    }

    case 'unpivot': {
      const vcols: string[] = Array.isArray(p.value_columns) ? p.value_columns.filter(Boolean) : [];
      const ids: string[] = Array.isArray(p.id_columns) && p.id_columns.length ? p.id_columns : cols.filter((c) => !vcols.includes(c));
      const nameCol = p.name_column || 'attribute';
      const valOut = p.value_column || 'value';
      if (!vcols.length) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      const mixed = new Set(vcols.map((c) => kindsIn[c] || 'text')).size > 1;
      if (lang === 'sql') {
        const parts = vcols.map((c, j) => `SELECT ${[...ids.map(qi), `${ql(c)} AS ${qi(nameCol)}`, `${mixed ? `ss_str(${qi(c)})` : qi(c)} AS ${qi(valOut)}`, '__rid', `${j} AS __j`].join(', ')} FROM ${S}`);
        return `SELECT * EXCLUDE (__rid, __j), ROW_NUMBER() OVER (ORDER BY __rid, __j) AS __rid FROM (${parts.join(' UNION ALL ')})`;
      }
      if (lang === 'py')
        return [
          `df = (df.with_row_index("_rid")${mixed ? `.with_columns([${vcols.map((c) => `ss_str(pl.col(${py(c)}))`).join(', ')}])` : ''}`,
          `        .unpivot(index=[${[...ids.map(py), '"_rid"'].join(', ')}], on=[${vcols.map(py).join(', ')}], variable_name=${py(nameCol)}, value_name=${py(valOut)})`,
          `        .with_columns(pl.col(${py(nameCol)}).replace_strict([${vcols.map(py).join(', ')}], list(range(${vcols.length}))).alias("_j"))`,
          `        .sort(["_rid", "_j"]).drop(["_rid", "_j"]))`,
        ];
      return `let t = Table.SelectColumns(${M}, {${[...ids, ...vcols].map(ms).join(', ')}}), marked = Table.TransformColumns(t, {${vcols.map((c) => `{${ms(c)}, each if _ = null then "__ss_null__" else _}`).join(', ')}}), u = Table.Unpivot(marked, {${vcols.map(ms).join(', ')}}, ${ms(nameCol)}, ${ms(valOut)}) in Table.TransformColumns(u, {{${ms(valOut)}, each if _ = "__ss_null__" then null else _}})`;
    }

    case 'xlookup':
    case 'vlookup': {
      const rid = p.lookup_dataset_id || p.right_dataset_id;
      const right = dsOf(rid);
      const leftKey = p.left_key_col || p.lookup_column || p.left_key || p.lookup_key || 'customer_id';
      let rightKey: string;
      let pairs: [string, string][];
      const fallback = p.if_not_found !== undefined ? p.if_not_found : null;
      if (step.type === 'xlookup') {
        if (Number(p.match_mode ?? 0) !== 0) return unsupported('an approximate or wildcard XLOOKUP match');
        rightKey = p.right_key_col || p.right_Lookup_column || p.right_key || p.match_key || leftKey;
        const ret: string[] = Array.isArray(p.return_columns) ? p.return_columns : p.return_column ? [p.return_column] : [];
        if (!ret.length) return unsupported('an XLOOKUP that returns every column');
        const merged = new Set(cols);
        pairs = ret.map((rc) => {
          const out = (p.output_column || p.target_column) && ret.length === 1 ? p.output_column || p.target_column : merged.has(rc) && rc !== rightKey ? `lookup_${rc}` : rc;
          merged.add(out);
          return [rc, out];
        });
      } else {
        if (p.range_lookup) return unsupported('an approximate VLOOKUP match');
        rightKey = p.right_key_col || p.right_key || right.columns[0] || leftKey;
        const idx1 = Math.max(1, Number(p.col_index_num ?? 2));
        const rc = right.columns[idx1 - 1] || p.return_column || (Array.isArray(p.return_columns) ? p.return_columns[0] : undefined) || right.columns[Math.min(1, right.columns.length - 1)] || rightKey;
        const out = p.output_column || p.target_column || (cols.includes(rc) && rc !== rightKey ? `vlookup_${rc}` : rc);
        pairs = [[rc, out]];
      }
      const lastWins = step.type === 'xlookup' && Number(p.search_mode ?? 1) === -1;
      if (lang === 'sql') {
        const R = `(SELECT *, ROW_NUMBER() OVER () AS __rr FROM ${ssTable(right)})`;
        const firsts = `(SELECT ss_key(${qi(rightKey)}) AS __k, ${pairs.map(([rc], i) => `${qi(rc)} AS __r${i}`).join(', ')} FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ss_key(${qi(rightKey)}) ORDER BY __rr ${lastWins ? 'DESC' : 'ASC'}) AS __n FROM ${R} WHERE NOT ss_empty(${qi(rightKey)})) WHERE __n = 1)`;
        const rep = new Map<string, string>();
        const add: [string, string][] = [];
        pairs.forEach(([, out], i) => {
          const e = fallback === null ? `r.__r${i}` : `CASE WHEN r.__k IS NULL THEN ${sqlLit(fallback)} ELSE ${typeof fallback === 'string' ? `ss_str(r.__r${i})` : `r.__r${i}`} END`;
          if (cols.includes(out)) rep.set(out, e);
          else add.push([out, e]);
        });
        const list = cols.map((c) => (rep.has(c) ? `${rep.get(c)} AS ${qi(c)}` : `l.${qi(c)}`));
        for (const [c, e] of add) list.push(`${e} AS ${qi(c)}`);
        return `SELECT ${list.join(', ')}, l.__rid FROM ${S} l LEFT JOIN ${firsts} r ON NOT ss_empty(l.${qi(leftKey)}) AND ss_key(l.${qi(leftKey)}) = r.__k`;
      }
      if (lang === 'py') {
        const lines = [
          `_r = ${pyFrame(right)}.filter(~ss_empty(pl.col(${py(rightKey)}))).with_columns(ss_key(pl.col(${py(rightKey)})).alias("_k"))`,
          `_r = _r.filter(pl.col("_k").${lastWins ? 'is_last_distinct' : 'is_first_distinct'}()).select(["_k", ${pairs.map(([rc], i) => `pl.col(${py(rc)}).alias("_r${i}")`).join(', ')}]).with_columns(pl.lit(True).alias("_hit"))`,
          `df = df.with_columns(pl.when(ss_empty(pl.col(${py(leftKey)}))).then(None).otherwise(ss_key(pl.col(${py(leftKey)}))).alias("_k")).join(_r, on="_k", how="left", maintain_order="left")`,
          `df = df.with_columns([${pairs.map(([, out], i) => `pl.when(pl.col("_hit")).then(pl.col("_r${i}")${typeof fallback === 'string' ? '.cast(pl.Utf8)' : ''}).otherwise(pl.lit(${py(fallback)})).alias(${py(out)})`).join(', ')}]).drop(["_k", "_hit", ${pairs.map((_, i) => `"_r${i}"`).join(', ')}])`,
        ];
        return lines;
      }
      const rightT = `Table.Buffer(let r0 = ${mTable(right)}, r1 = Table.SelectRows(r0, each not SsEmpty(Record.Field(_, ${ms(rightKey)}))), r2 = Table.AddColumn(r1, "__k", each SsKey(Record.Field(_, ${ms(rightKey)}))) in Table.Distinct(${lastWins ? 'Table.ReverseRows(r2)' : 'r2'}, {"__k"}))`;
      let t = `let R = ${rightT}, keys = List.Buffer(R[__k]) in `;
      let inner = M;
      pairs.forEach(([rc, out]) => {
        const body = `let k = Record.Field(_, ${ms(leftKey)}), i = if SsEmpty(k) then -1 else List.PositionOf(keys, SsKey(k)) in if i < 0 then ${mv(fallback)} else Table.Column(R, ${ms(rc)}){i}`;
        inner = mAddOrReplace(inner, cols, out, body);
      });
      t += inner;
      return t;
    }

    case 'join': {
      const right = dsOf(p.right_dataset_id || p.lookup_dataset_id);
      const jt = String(p.join_type || 'left').toLowerCase();
      const kp: [string, string][] = (Array.isArray(p.key_pairs) && p.key_pairs.length ? p.key_pairs : [{ left_col: p.left_key || p.lookup_key || 'customer_id', right_col: p.right_key || p.match_key || p.left_key || 'customer_id' }]).map((k: any) => [k.left_col || k.left_key || 'customer_id', k.right_col || k.right_key || 'customer_id']);
      const rKeys = new Set(kp.map(([, r]) => r));
      const sel: string[] = Array.isArray(p.selected_right_columns) && p.selected_right_columns.length ? p.selected_right_columns : right.columns.filter((c) => !rKeys.has(c));
      const suffix = p.suffix_right || '_right';
      if (!['inner', 'left', 'right', 'full', 'left_semi', 'left_anti', 'cross'].includes(jt)) return unsupported(`the join type "${jt}"`);
      // Output names: right columns that clash with what is already there get the suffix.
      const merged = new Set(cols);
      const outNames: [string, string][] = [];
      for (const c of sel) {
        if (rKeys.has(c) && merged.has(c) && jt !== 'cross') continue;
        const out = merged.has(c) ? `${c}${suffix}` : c;
        merged.add(out);
        outNames.push([c, out]);
      }
      const dedupe = Boolean(p.dedupe_right_first);
      if (lang === 'sql') {
        const keyMatch = (l: string, r: string) => kp.map(([lc, rc]) => `NOT ss_empty(${l}.${qi(lc)}) AND NOT ss_empty(${r}.${qi(rc)}) AND ss_key(${l}.${qi(lc)}) = ss_key(${r}.${qi(rc)})`).join(' AND ');
        let R = `(SELECT *, ROW_NUMBER() OVER () AS __rr FROM ${ssTable(right)})`;
        if (dedupe) R = `(SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ${kp.map(([, rc]) => `ss_key(${qi(rc)})`).join(', ')}, ${kp.map(([, rc]) => `ss_empty(${qi(rc)})`).join(' OR ')} ORDER BY __rr) AS __dn FROM ${R}) WHERE __dn = 1 OR ${kp.map(([, rc]) => `ss_empty(${qi(rc)})`).join(' OR ')})`;
        if (jt === 'left_semi' || jt === 'left_anti')
          return `SELECT * FROM ${S} l WHERE ${jt === 'left_anti' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM ${R} r WHERE ${keyMatch('l', 'r')})`;
        const leftCols = cols.map((c) => {
          const k = kp.find(([lc]) => lc === c);
          return k && (jt === 'right' || jt === 'full') ? `CASE WHEN l.__rid IS NULL THEN r.${qi(k[1])} ELSE l.${qi(c)} END AS ${qi(c)}` : `l.${qi(c)}`;
        });
        const rightCols = outNames.map(([c, out]) => `r.${qi(c)} AS ${qi(out)}`);
        const sqlJoin = jt === 'cross' ? 'CROSS JOIN' : jt === 'inner' ? 'INNER JOIN' : jt === 'left' ? 'LEFT JOIN' : jt === 'right' ? 'RIGHT JOIN' : 'FULL JOIN';
        const on = jt === 'cross' ? '' : ` ON ${keyMatch('l', 'r')}`;
        return `SELECT ${[...leftCols, ...rightCols].join(', ')}, ROW_NUMBER() OVER (ORDER BY CASE WHEN l.__rid IS NULL THEN 1 ELSE 0 END, l.__rid, r.__rr) AS __rid FROM ${S} l ${sqlJoin} ${R} r${on}`;
      }
      if (lang === 'py') {
        const lk = kp.map(([lc], i) => `pl.when(ss_empty(pl.col(${py(lc)}))).then(None).otherwise(ss_key(pl.col(${py(lc)}))).alias("_jk${i}")`);
        const rk = kp.map(([, rc], i) => `pl.when(ss_empty(pl.col(${py(rc)}))).then(None).otherwise(ss_key(pl.col(${py(rc)}))).alias("_jk${i}")`);
        const keyNames = kp.map((_, i) => `"_jk${i}"`).join(', ');
        const lines = [
          `_l = df.with_row_index("_lrid").with_columns([${lk.join(', ')}])`,
          `_r = ${pyFrame(right)}.with_row_index("_rrid").with_columns([${rk.join(', ')}])`,
        ];
        if (dedupe) lines.push(`_r = _r.filter(pl.struct([${keyNames}]).is_first_distinct() | pl.any_horizontal([pl.col(k).is_null() for k in [${keyNames}]]))`);
        const rsel = `[${[...kp.map((_, i) => `"_jk${i}"`), '"_rrid"', ...(jt === 'right' || jt === 'full' ? kp.map(([, rc], i) => `pl.col(${py(rc)}).alias("_rkey${i}")`) : []), ...outNames.map(([c, out]) => `pl.col(${py(c)}).alias(${py(out)})`)].join(', ')}]`;
        if (jt === 'left_semi' || jt === 'left_anti') {
          lines.push(`df = _l.join(_r.select([${keyNames}]), on=[${keyNames}], how=${py(jt === 'left_semi' ? 'semi' : 'anti')}, maintain_order="left").drop(["_lrid", ${keyNames}])`);
          return lines;
        }
        if (jt === 'cross') {
          lines.push(`df = _l.drop([${keyNames}]).join(_r.select(["_rrid", ${outNames.map(([c, out]) => `pl.col(${py(c)}).alias(${py(out)})`).join(', ')}]), how="cross").sort(["_lrid", "_rrid"]).drop(["_lrid", "_rrid"])`);
          return lines;
        }
        lines.push(`_j = _l.join(_r.select(${rsel}), on=[${keyNames}], how=${py(jt)}, nulls_equal=False, coalesce=False)`);
        if (jt === 'right' || jt === 'full')
          lines.push(`_j = _j.with_columns([${kp.map(([lc], i) => `pl.when(pl.col("_lrid").is_null()).then(pl.col("_rkey${i}")).otherwise(pl.col(${py(lc)})).alias(${py(lc)})`).join(', ')}])`);
        lines.push(`df = _j.sort([pl.col("_lrid").is_null(), "_lrid", "_rrid"], nulls_last=True).select(${JSON.stringify([...cols, ...outNames.map(([, o]) => o)])})`);
        return lines;
      }
      const keyM = (side: 'l' | 'r') => `each if List.AnyTrue(List.Transform({${kp.map(([lc, rc]) => `Record.Field(_, ${ms(side === 'l' ? lc : rc)})`).join(', ')}}, SsEmpty)) then null else Text.Combine(List.Transform({${kp.map(([lc, rc]) => `Record.Field(_, ${ms(side === 'l' ? lc : rc)})`).join(', ')}}, SsKey), "|")`;
      const rightBase = `Table.AddIndexColumn(Table.AddColumn(${mTable(right)}, "__k", ${keyM('r')}), "__rr", 0, 1)`;
      const rightT = dedupe ? `let r = ${rightBase} in Table.Combine({Table.Distinct(Table.SelectRows(r, each [__k] <> null), {"__k"}), Table.SelectRows(r, each [__k] = null)})` : rightBase;
      const L = `Table.AddIndexColumn(Table.AddColumn(${M}, "__k", ${keyM('l')}), "__lr", 0, 1)`;
      if (jt === 'left_semi' || jt === 'left_anti')
        return `let R = Table.Buffer(Table.SelectRows(${rightT}, each [__k] <> null)), keys = List.Buffer(R[__k]) in Table.RemoveColumns(Table.SelectRows(${L}, each ${jt === 'left_anti' ? 'not ' : ''}([__k] <> null and List.Contains(keys, [__k]))), {"__k", "__lr"})`;
      const expandCols = `{${outNames.map(([c]) => ms(c)).join(', ')}, "__rr"${jt === 'right' || jt === 'full' ? `, ${kp.map(([, rc]) => ms(rc)).join(', ')}` : ''}}`;
      const expandAs = `{${outNames.map(([, o]) => ms(o)).join(', ')}, "__rr"${jt === 'right' || jt === 'full' ? `, ${kp.map((_, i) => `"__rkey${i}"`).join(', ')}` : ''}}`;
      if (jt === 'cross')
        return `let R = Table.Buffer(${rightT}), t = Table.AddColumn(${L}, "__r", each R), e = Table.ExpandTableColumn(t, "__r", ${expandCols}, ${expandAs}) in Table.RemoveColumns(Table.Sort(e, {{"__lr", Order.Ascending}, {"__rr", Order.Ascending}}), {"__k", "__lr", "__rr"})`;
      const kind = jt === 'inner' ? 'JoinKind.Inner' : jt === 'left' ? 'JoinKind.LeftOuter' : jt === 'right' ? 'JoinKind.RightOuter' : 'JoinKind.FullOuter';
      const fixKeys = jt === 'right' || jt === 'full' ? `, fixed = Table.FromRecords(Table.TransformRows(e, (row) => Record.TransformFields(row, {${kp.map(([lc], i) => `{${ms(lc)}, each if row[__lr] = null then Record.Field(row, "__rkey${i}") else _}`).join(', ')}})), Value.Type(e)), cleaned = Table.RemoveColumns(fixed, {${kp.map((_, i) => `"__rkey${i}"`).join(', ')}})` : ', cleaned = e';
      return `let R = Table.Buffer(Table.SelectRows(${rightT}, each [__k] <> null)), j = Table.NestedJoin(${L}, {"__k"}, R, {"__k"}, "__r", ${kind}), e = Table.ExpandTableColumn(j, "__r", ${expandCols}, ${expandAs})${fixKeys}, sorted = Table.Sort(cleaned, {{each if [__lr] = null then 1 else 0, Order.Ascending}, {"__lr", Order.Ascending}, {"__rr", Order.Ascending}}) in Table.RemoveColumns(sorted, {"__k", "__lr", "__rr"})`;
    }

    case 'append': {
      const ids: string[] = p.dataset_ids || (p.append_dataset_id ? [p.append_dataset_id] : p.right_dataset_id ? [p.right_dataset_id] : []);
      if (p.alignment_mode === 'by_position') return unsupported('Append by column position');
      const inc = p.incremental_mode || (p.union_type === 'distinct' ? 'distinct' : 'all');
      if (!['all', 'distinct'].includes(inc) || p.key_column || p.newest_by) return unsupported(`the "${inc}" append mode`);
      if (p.add_custom_column || p.custom_column_name) return unsupported('Append with a source column');
      const others = ids.map(dsOf);
      const canon = new Map<string, string>();
      cols.forEach((c) => canon.has(c.trim().toLowerCase()) || canon.set(c.trim().toLowerCase(), c));
      for (const o of others) for (const c of o.columns) if (!canon.has(c.trim().toLowerCase())) canon.set(c.trim().toLowerCase(), c);
      const all = [...canon.values()];
      const mapFor = (o: CodegenDataset) => new Map(o.columns.map((c) => [canon.get(c.trim().toLowerCase())!, c]));
      if (lang === 'sql') {
        const first = `SELECT ${all.map((c) => (cols.includes(c) ? `ss_str(${qi(c)}) AS ${qi(c)}` : `NULL AS ${qi(c)}`)).join(', ')}, 0 AS __src, __rid FROM ${S}`;
        const rest = others.map((o, i) => {
          const m = mapFor(o);
          return `SELECT ${all.map((c) => (m.has(c) ? `ss_str(${qi(m.get(c)!)}) AS ${qi(c)}` : `NULL AS ${qi(c)}`)).join(', ')}, ${i + 1} AS __src, ROW_NUMBER() OVER () AS __rid FROM ${ssTable(o)}`;
        });
        let u = `SELECT * EXCLUDE (__src, __rid), ROW_NUMBER() OVER (ORDER BY __src, __rid) AS __rid FROM (${[first, ...rest].join(' UNION ALL ')})`;
        if (inc === 'distinct') u = `SELECT * EXCLUDE (__n) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ${all.map((c) => `ss_key(${qi(c)})`).join(', ')} ORDER BY __rid) AS __n FROM (${u})) WHERE __n = 1`;
        return u;
      }
      if (lang === 'py') {
        const lines = others.map((o, i) => {
          const m = mapFor(o);
          return `_a${i} = ${pyFrame(o)}.rename({${[...m.entries()].filter(([c, rc]) => c !== rc).map(([c, rc]) => `${py(rc)}: ${py(c)}`).join(', ')}})`;
        });
        lines.push(`df = pl.concat([df, ${others.map((_, i) => `_a${i}`).join(', ')}], how="diagonal_relaxed")`);
        if (inc === 'distinct') lines.push(`df = df.filter(pl.struct([ss_key(pl.col(c)).alias(f"_u{i}") for i, c in enumerate(df.columns)]).is_first_distinct())`);
        return lines;
      }
      const tabs = others.map((o) => {
        const m = mapFor(o);
        const ren = [...m.entries()].filter(([c, rc]) => c !== rc);
        return ren.length ? `Table.RenameColumns(${mTable(o)}, {${ren.map(([c, rc]) => `{${ms(rc)}, ${ms(c)}}`).join(', ')}})` : mTable(o);
      });
      const comb = `Table.Combine({${[M, ...tabs].join(', ')}})`;
      return inc === 'distinct' ? `Table.RemoveColumns(Table.Distinct(Table.AddColumn(${comb}, "__k", each Text.Combine(List.Transform(Record.FieldValues(_), SsKey), "|")), {"__k"}), {"__k"})` : comb;
    }

    case 'custom_column': {
      const name = String(p.new_column || p.column || p.target_column || 'custom_col').trim();
      const expr = p.expression || p.formula;
      if (expr) {
        const f = formulaExprs(expr, cols);
        if (lang === 'sql') return withCol(cols, name, f.sql, S);
        if (lang === 'py') return [`df = df.with_columns((${f.py}).alias(${py(name)}))`];
        return mAddOrReplace(M, cols, name, f.m);
      }
      const v = p.value !== undefined ? p.value : '';
      if (lang === 'sql') return withCol(cols, name, sqlLit(v), S);
      if (lang === 'py') return [`df = df.with_columns(pl.lit(${py(v)}).alias(${py(name)}))`];
      return mAddOrReplace(M, cols, name, mv(v));
    }

    case 'remove_column': {
      const drop = new Set<string>(Array.isArray(p.columns) ? p.columns : [p.column].filter(Boolean));
      const keepSel = Boolean(p.keep_selected);
      const keepCols = cols.filter((c) => (keepSel ? drop.has(c) : !drop.has(c)));
      if (lang === 'sql') return `SELECT ${selectList(keepCols, new Map(), [])} FROM ${S}`;
      if (lang === 'py') return [`df = df.select(${JSON.stringify(keepCols)})`];
      return `Table.SelectColumns(${M}, {${keepCols.map(ms).join(', ')}})`;
    }

    case 'reorder_columns': {
      const order: string[] = Array.isArray(p.column_order) ? p.column_order : [];
      const next = [...order.filter((c) => cols.includes(c)), ...cols.filter((c) => !order.includes(c))];
      if (lang === 'sql') return `SELECT ${selectList(next, new Map(), [])} FROM ${S}`;
      if (lang === 'py') return [`df = df.select(${JSON.stringify(next)})`];
      return `Table.ReorderColumns(${M}, {${next.map(ms).join(', ')}})`;
    }

    case 'remove_rows': {
      const mode = p.mode || 'top_n';
      const n = Math.max(0, Number(p.count ?? 1));
      if (mode === 'blank_rows') {
        const check: string[] = Array.isArray(p.columns) && p.columns.length ? p.columns : cols;
        if (lang === 'sql') return `SELECT * FROM ${S} WHERE NOT (${check.map((c) => `COALESCE(trim(ss_str(${qi(c)})), '') = ''`).join(' AND ')})`;
        if (lang === 'py') return [`df = df.filter(~pl.all_horizontal([ss_str(pl.col(c)).fill_null("").str.strip_chars() == "" for c in ${JSON.stringify(check)}]))`];
        return `Table.SelectRows(${M}, each not List.AllTrue(List.Transform({${check.map((c) => `Record.Field(_, ${ms(c)})`).join(', ')}}, (v) => v = null or Text.Trim(SsStr(v)) = "")))`;
      }
      const cond: Record<string, [string, string, string]> = {
        top_n: [`__pos > ${n}`, `df = df.slice(${n})`, `Table.Skip(${M}, ${n})`],
        bottom_n: [`__pos <= __cnt - ${n}`, `df = df.head(max(0, df.height - ${n}))`, `Table.RemoveLastN(${M}, ${n})`],
        keep_top_n: [`__pos <= ${n}`, `df = df.head(${n})`, `Table.FirstN(${M}, ${n})`],
        keep_bottom_n: [`__pos > __cnt - ${n}`, `df = df.tail(${n})`, `Table.LastN(${M}, ${n})`],
      };
      if (!cond[mode]) return unsupported(`the remove-rows mode "${mode}"`);
      if (lang === 'sql') return `SELECT ${selectList(cols, new Map(), [])} FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY __rid) AS __pos, COUNT(*) OVER () AS __cnt FROM ${S}) WHERE ${cond[mode][0]}`;
      if (lang === 'py') return [cond[mode][1]];
      return cond[mode][2];
    }

    case 'standardize_values': {
      const c = p.column;
      const target = p.output_column || c;
      const pairs: [string, string][] = [];
      if (Array.isArray(p.mappings)) p.mappings.forEach((m: any) => m.from !== undefined && !pairs.some(([f]) => f === String(m.from).toLowerCase().trim()) && pairs.push([String(m.from).toLowerCase().trim(), String(m.to ?? '')]));
      else if (p.mapping && typeof p.mapping === 'object') Object.entries(p.mapping).forEach(([f, t]) => pairs.push([String(f).toLowerCase().trim(), String(t ?? '')]));
      if (!c) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      if (lang === 'sql') return withCol(cols, target, `CASE ${pairs.map(([f, t]) => `WHEN ss_key(${qi(c)}) = ${ql(f)} THEN ${ql(t)}`).join(' ')} ELSE ss_str(${qi(c)}) END`.replace('CASE  ELSE', 'CASE WHEN FALSE THEN NULL ELSE'), S);
      if (lang === 'py') return [`df = df.with_columns(${pairs.reduce((acc, [f, t], i) => `${i === 0 ? 'pl' : acc}.when(ss_key(pl.col(${py(c)})) == ${py(f)}).then(pl.lit(${py(t)}))`, '')}${pairs.length ? '.otherwise(' : '('}ss_str(pl.col(${py(c)}))).alias(${py(target)}))`];
      return mAddOrReplace(M, cols, target, `let k = SsKey(Record.Field(_, ${ms(c)})) in ${pairs.map(([f, t]) => `if k = ${ms(f)} then ${ms(t)} else `).join('')}Record.Field(_, ${ms(c)})`);
    }

    case 'impute_missing': {
      const c = p.column;
      const strategy = p.strategy || 'mean';
      const target = p.output_column || c;
      const fixed = p.fixed_value ?? 0;
      if (!c) return lang === 'sql' ? `SELECT * FROM ${S}` : lang === 'py' ? [] : M;
      if (!['mean', 'median', 'mode', 'fixed'].includes(strategy)) return unsupported(`the fill strategy "${strategy}"`);
      if (lang === 'sql') {
        const C = qi(c);
        const fill =
          strategy === 'mean' ? `(SELECT AVG(ss_num(${C})) FROM ${S})`
          : strategy === 'median' ? `(SELECT MEDIAN(ss_num(${C})) FROM ${S})`
          : strategy === 'mode' ? `(SELECT ${C} FROM ${S} WHERE NOT ss_empty(${C}) GROUP BY ${C} ORDER BY COUNT(*) DESC, MIN(__rid) LIMIT 1)`
          : sqlLit(fixed);
        const numeric = strategy === 'mean' || strategy === 'median' || (strategy === 'fixed' && typeof fixed === 'number' && kindsIn[c] === 'number');
        const keep = numeric && kindsIn[c] === 'number' ? `ss_num(${C})` : `ss_str(${C})`;
        const f = numeric && kindsIn[c] === 'number' ? fill : `ss_str(${fill})`;
        return withCol(cols, target, `CASE WHEN (ss_empty(${C}) OR (typeof(${C}) IN ('DOUBLE', 'FLOAT') AND isnan(CAST(${C} AS DOUBLE)))) AND ${f} IS NOT NULL THEN ${f} ELSE ${keep} END`, S);
      }
      if (lang === 'py') {
        const C = `pl.col(${py(c)})`;
        const fill =
          strategy === 'mean' ? `ss_num(${C}).mean()`
          : strategy === 'median' ? `ss_num(${C}).median()`
          : strategy === 'mode' ? `df.filter(~ss_empty(${C})).group_by(${py(c)}, maintain_order=True).len().sort("len", descending=True, maintain_order=True).get_column(${py(c)}).first()`
          : py(fixed);
        if (strategy === 'mode') return [`_fill = ${fill}`, `df = df.with_columns(pl.when(ss_empty(${C}) & pl.lit(_fill is not None)).then(pl.lit(_fill)).otherwise(${C}).alias(${py(target)}))`];
        return [`df = df.with_columns(pl.when(ss_empty(${C})).then(pl.coalesce(pl.lit(${fill === py(fixed) ? fill : `df.select(${fill}).item()`}), ${C})).otherwise(${C}).alias(${py(target)}))`];
      }
      const vals = `List.Select(Table.Column(${M}, ${ms(c)}), each not SsEmpty(_))`;
      const fill =
        strategy === 'mean' ? `List.Average(List.RemoveNulls(List.Transform(${vals}, SsNum)))`
        : strategy === 'median' ? `List.Median(List.RemoveNulls(List.Transform(${vals}, SsNum)))`
        : strategy === 'mode' ? `let v = ${vals} in if List.IsEmpty(v) then null else List.Mode(v)`
        : mv(fixed);
      return `let fill = ${fill} in ${mAddOrReplace(M, cols, target, `if SsEmpty(Record.Field(_, ${ms(c)})) and fill <> null then fill else Record.Field(_, ${ms(c)})`)}`;
    }

    case 'flag_outliers': {
      const c = p.column;
      const target = p.output_column || `${c}_is_outlier`;
      const filterOut = Boolean(p.filter_outliers);
      if (lang === 'sql') {
        const C = qi(c);
        const stats = `(SELECT len(l) AS n, l[CAST(floor(len(l) * 0.25) AS BIGINT) + 1] AS q1, l[CAST(floor(len(l) * 0.75) AS BIGINT) + 1] AS q3 FROM (SELECT list_sort(list(ss_num(${C})) FILTER (WHERE ss_num(${C}) IS NOT NULL)) AS l FROM ${S}))`;
        const flag = `COALESCE(NOT ss_empty(l.${C}) AND st.n >= 4 AND (ss_num(l.${C}) < st.q1 - 1.5 * (st.q3 - st.q1) OR ss_num(l.${C}) > st.q3 + 1.5 * (st.q3 - st.q1)), FALSE)`;
        const list = cols.map((x) => (x === target ? `${flag} AS ${qi(x)}` : `l.${qi(x)}`));
        if (!cols.includes(target)) list.push(`${flag} AS ${qi(target)}`);
        const q = `SELECT ${list.join(', ')}, l.__rid FROM ${S} l CROSS JOIN ${stats} st`;
        return filterOut ? `SELECT * FROM (${q}) WHERE NOT ${qi(target)}` : q;
      }
      if (lang === 'py') {
        const lines = [
          `_v = df.select(ss_num(pl.col(${py(c)})).drop_nulls().sort()).to_series()`,
          `_lo, _hi = (float("-inf"), float("inf")) if len(_v) < 4 else (_v[int(len(_v) * 0.25)] - 1.5 * (_v[int(len(_v) * 0.75)] - _v[int(len(_v) * 0.25)]), _v[int(len(_v) * 0.75)] + 1.5 * (_v[int(len(_v) * 0.75)] - _v[int(len(_v) * 0.25)]))`,
          `df = df.with_columns((~ss_empty(pl.col(${py(c)})) & ((ss_num(pl.col(${py(c)})) < _lo) | (ss_num(pl.col(${py(c)})) > _hi))).fill_null(False).alias(${py(target)}))`,
        ];
        if (filterOut) lines.push(`df = df.filter(~pl.col(${py(target)}))`);
        return lines;
      }
      const body = `let v = List.Sort(List.RemoveNulls(List.Transform(Table.Column(${M}, ${ms(c)}), (x) => if SsEmpty(x) then null else SsNum(x)))), n = List.Count(v), q1 = if n >= 4 then v{Number.RoundDown(n * 0.25)} else null, q3 = if n >= 4 then v{Number.RoundDown(n * 0.75)} else null, t = ${mAddOrReplace(M, cols, target, `let x = Record.Field(_, ${ms(c)}), num = if SsEmpty(x) then null else SsNum(x) in num <> null and q1 <> null and (num < q1 - 1.5 * (q3 - q1) or num > q3 + 1.5 * (q3 - q1))`)} in ${filterOut ? `Table.SelectRows(t, each not Record.Field(_, ${ms(target)}))` : 't'}`;
      return body;
    }

    case 'top_bottom_n': {
      const c = p.column;
      const bottom = (p.mode || 'top') === 'bottom';
      const n = Math.max(1, Number(p.n ?? 10));
      if (lang === 'sql') {
        const C = qi(c);
        return `SELECT ${selectList(cols, new Map(), [], [])}, ROW_NUMBER() OVER (ORDER BY __o, __rid) AS __rid FROM (SELECT *, ${bottom ? '' : '-'}ss_num(${C}) AS __o FROM ${S} WHERE ss_num(${C}) IS NOT NULL ORDER BY __o, __rid LIMIT ${n}) UNION ALL SELECT ${selectList(cols, new Map(), [])} FROM (SELECT * FROM ${S} WHERE NOT EXISTS (SELECT 1 FROM ${S} WHERE ss_num(${C}) IS NOT NULL) ORDER BY __rid LIMIT ${n})`;
      }
      if (lang === 'py') {
        const C = `pl.col(${py(c)})`;
        return [
          `_num = df.filter(ss_num(${C}).is_not_null())`,
          `df = _num.with_columns(ss_num(${C}).alias("_o")).sort("_o", descending=${bottom ? 'False' : 'True'}, maintain_order=True).head(${n}).drop("_o") if _num.height else df.head(${n})`,
        ];
      }
      return `let t = Table.AddIndexColumn(${M}, "__i", 0, 1), num = Table.SelectRows(t, each SsNum(Record.Field(_, ${ms(c)})) <> null) in if Table.IsEmpty(num) then Table.RemoveColumns(Table.FirstN(t, ${n}), {"__i"}) else Table.RemoveColumns(Table.FirstN(Table.Sort(num, {{each SsNum(Record.Field(_, ${ms(c)})), ${bottom ? 'Order.Ascending' : 'Order.Descending'}}, {"__i", Order.Ascending}}), ${n}), {"__i"})`;
    }

    case 'promote_headers':
      if (lang === 'm') return `Table.PromoteHeaders(${M}, [PromoteAllScalars = true])`;
      return unsupported('Promote headers (the new column names come from the data)');

    case 'transpose':
      return unsupported('Transpose (the new columns come from the data)');

    default:
      return unsupported(`the step type "${step.type}"`);
  }
}

// ---------------------------------------------------------------- assembly
export function generatePipelineCode(inputs: CodegenStepInput[], ctx: CodegenContext): GeneratedPipelineCode {
  const src = safeIdent(ctx.datasetName);
  const unsupportedSteps: UnsupportedStep[] = [];
  const perStep: GeneratedPipelineCode['per_step'] = [];
  // Like StepSheet's CSV import: cells are trimmed and empty cells are blank.
  const srcCols = ctx.sourceColumns.length ? ctx.sourceColumns : null;
  const sqlCtes: string[] = [
    srcCols
      ? `s0 AS (SELECT ${srcCols.map((c) => `NULLIF(trim(CAST(${qi(c)} AS VARCHAR)), '') AS ${qi(c)}`).join(', ')}, ROW_NUMBER() OVER () AS __rid FROM ${qi(src)})`
      : `s0 AS (SELECT *, ROW_NUMBER() OVER () AS __rid FROM ${qi(src)})`,
  ];
  const pyLines: string[] = [
    `df = pl.read_csv(${py(`${src}.csv`)}, infer_schema=False)`,
    `df = df.with_columns([pl.col(c).str.strip_chars().replace("", None) for c in df.columns])`,
  ];
  const mSteps: string[] = [
    ...M_HELPERS,
    `Raw = Table.PromoteHeaders(Csv.Document(File.Contents(${ms(`${src}.csv`)}), [Delimiter = ",", Encoding = 65001]), [PromoteAllScalars = true])`,
    `Source = Table.TransformColumns(Raw, List.Transform(Table.ColumnNames(Raw), (c) => {c, each if _ = null then null else let t = Text.Trim(Text.From(_)) in if t = "" then null else t}))`,
  ];
  let prevSql = 's0';
  let prevM = 'Source';
  let n = 0;
  inputs.forEach((inp, i) => {
    if (!inp.step.enabled) return;
    n++;
    const label = inp.step.label || inp.step.type;
    const run = (lang: 'sql' | 'py' | 'm'): string | string[] => {
      try {
        return translateStep(inp, { sql: prevSql, m: prevM }, ctx, lang);
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e;
        const reason = `Step ${n} (${label}) can't be exported: ${e.message} has no faithful equivalent here.`;
        unsupportedSteps.push({ index: i, label, language: lang === 'py' ? 'polars' : lang === 'm' ? 'power_query_m' : 'sql', reason });
        if (lang === 'sql') return `SELECT ${prevSql}.* FROM ${prevSql}, (SELECT error(${ql(reason)})) AS stop`;
        if (lang === 'py') return [`raise NotImplementedError(${py(reason)})`];
        return `error ${ms(reason)}`;
      }
    };
    const s = run('sql') as string;
    const pyl = run('py') as string[];
    const m = run('m') as string;
    const name = `s${n}`;
    sqlCtes.push(`-- Step ${n}: ${label.replace(/\n/g, ' ')}\n${name} AS (\n  ${s}\n)`);
    pyLines.push(`# Step ${n}: ${label.replace(/\n/g, ' ')}`, ...pyl);
    const mName = `Step${n}`;
    mSteps.push(`// Step ${n}: ${label.replace(/\n/g, ' ')}\n    ${mName} = ${m}`);
    perStep.push({ index: i, sql: s, polars: pyl.join('\n'), power_query_m: m });
    prevSql = name;
    prevM = mName;
  });
  const finalCols = inputs.length ? inputs[inputs.length - 1].columnsOut : ctx.sourceColumns;
  const sql =
    SQL_PRELUDE.replace(/\{SOURCE\}/g, src).replace('{SOURCE_FILE}', `${src}.csv`) +
    `\nWITH\n${sqlCtes.join(',\n')}\nSELECT ${finalCols.length ? finalCols.map(qi).join(', ') : '* EXCLUDE (__rid)'} FROM ${prevSql} ORDER BY __rid;\n`;
  const polars = `${PY_PRELUDE}\n${pyLines.join('\n')}\n\nprint(df)\n`;
  const power_query_m = `// StepSheet pipeline as Power Query M (Excel / Power BI).\n// Text matches ignore case and surrounding spaces and numbers stored as text\n// are read as numbers, like StepSheet. Excel errors such as #VALUE! come out as null.\nlet\n    ${mSteps.join(',\n    ')}\nin\n    ${prevM}\n`;
  return { sql, polars, power_query_m, unsupported: unsupportedSteps, per_step: perStep };
}
