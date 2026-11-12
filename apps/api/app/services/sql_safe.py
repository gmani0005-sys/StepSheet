"""
Shared SQL-safety helpers used by step_compiler.py and duckdb_engine.py.

These exist to close the SQL-injection holes described in SPEC.md: column
identifiers and literal values must never be pasted into a SQL string without
going through one of these helpers first.
"""
from __future__ import annotations

import math
from typing import Any, Optional

_CURRENCY_CHARS = "$₹€£¥"  # $ ₹ € £ ¥


def quote_ident(name: Any) -> str:
    """Safely quote a DuckDB identifier, escaping embedded double quotes.

    This is THE function that must be used anywhere a column name is spliced
    into SQL text. A column literally named  Rate "A"  must still produce
    valid SQL, not a syntax error or an injection point.
    """
    s = "" if name is None else str(name)
    return '"' + s.replace('"', '""') + '"'


# Short alias used pervasively inside step_compiler.py
Q = quote_ident


def sql_string_literal(val: Any) -> str:
    """Safely quote a SQL string literal, escaping embedded single quotes."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def parse_excel_number(raw: Any) -> Optional[float]:
    """Parse a Python-side literal the way Excel/SPEC.md parsing rules require.

    Accepts real numbers, and text like "1,234.50", "$500", "₹1,200",
    "(300)" (= -300), "15%" (= 0.15). Returns None when it cannot be parsed
    as a number (this is NOT used for data in the table -- see
    number_parse_sql for that -- it is used for *step parameters*, so that a
    literal value never needs to be pasted unescaped/unquoted into SQL).
    """
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        if isinstance(raw, float) and (math.isnan(raw) or math.isinf(raw)):
            return None
        return float(raw)
    s = str(raw).strip()
    if s == "":
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1].strip()
    pct = False
    if s.endswith("%"):
        pct = True
        s = s[:-1].strip()
    for ch in _CURRENCY_CHARS:
        s = s.replace(ch, "")
    s = s.replace(",", "").strip()
    if s == "":
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    if neg:
        v = -abs(v)
    if pct:
        v = v / 100.0
    return v


def sql_number_literal(raw: Any, default: str = "NULL") -> str:
    """Return a SAFE numeric SQL literal for a step-parameter value.

    Never pastes the raw text into SQL: if it cannot be parsed as an
    Excel-style number, `default` (a literal SQL token, e.g. "NULL") is
    returned instead so the value can never be used to inject SQL
    (the classic `999 OR 1=1` attack from SPEC.md).
    """
    v = parse_excel_number(raw)
    if v is None:
        return default
    if v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return repr(v)


def number_parse_sql(col_sql: str) -> str:
    """Return a DuckDB SQL expression (DOUBLE or NULL) that parses `col_sql`
    (itself a safe SQL expression, e.g. an already-quoted identifier) using
    the shared Excel-style number parser described in SPEC.md:
    accepts numbers, "1,234.50", "$500", "₹1,200", "(300)" (=-300), "15%" (=0.15).
    Blank input stays NULL (blank), never 0.
    """
    txt = f"TRIM(CAST({col_sql} AS VARCHAR))"
    is_paren = f"(LEFT({txt}, 1) = '(' AND RIGHT({txt}, 1) = ')')"
    unparened = f"(CASE WHEN {is_paren} THEN SUBSTR({txt}, 2, LENGTH({txt}) - 2) ELSE {txt} END)"
    is_pct = f"(LENGTH({unparened}) > 0 AND RIGHT({unparened}, 1) = '%')"
    unpercented = f"(CASE WHEN {is_pct} THEN LEFT({unparened}, LENGTH({unparened}) - 1) ELSE {unparened} END)"
    cleaned = unpercented
    for ch in list(_CURRENCY_CHARS) + [","]:
        cleaned = f"REPLACE({cleaned}, '{ch}', '')"
    cleaned = f"TRIM({cleaned})"
    base = f"TRY_CAST({cleaned} AS DOUBLE)"
    signed = f"(CASE WHEN {is_paren} AND {base} IS NOT NULL THEN -ABS({base}) ELSE {base} END)"
    pct_applied = f"(CASE WHEN {is_pct} AND {signed} IS NOT NULL THEN {signed} / 100.0 ELSE {signed} END)"
    return f"(CASE WHEN {txt} IS NULL OR {txt} = '' THEN NULL ELSE {pct_applied} END)"


_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def date_parse_sql(col_sql: str) -> str:
    """Return a DuckDB SQL expression (DATE or NULL) implementing the shared
    date parser from SPEC.md: ISO yyyy-mm-dd (optional time), dd/mm/yyyy and
    dd-mm-yyyy (DAY FIRST by default; first part > 12 => it's the day;
    second part > 12 => treat as mm/dd), d-MMM-yyyy, yyyy/mm/dd, and Excel
    serial numbers (1..2958465) when the value looks like a bare number.
    Unparseable input gives NULL (blank).
    """
    txt = f"TRIM(CAST({col_sql} AS VARCHAR))"

    # Excel serial number: a bare integer/float, no separators.
    is_serial = (
        f"(regexp_matches({txt}, '^\\d+(\\.\\d+)?$') AND "
        f"TRY_CAST({txt} AS DOUBLE) BETWEEN 1 AND 2958465)"
    )
    serial_date = f"(DATE '1899-12-30' + CAST(FLOOR(TRY_CAST({txt} AS DOUBLE)) AS INTEGER))"

    # ISO yyyy-mm-dd, optionally followed by a time component.
    is_iso = f"regexp_matches({txt}, '^\\d{{4}}-\\d{{1,2}}-\\d{{1,2}}')"
    iso_date = f"TRY_CAST(regexp_extract({txt}, '^(\\d{{4}}-\\d{{1,2}}-\\d{{1,2}})', 1) AS DATE)"

    # yyyy/mm/dd
    is_ymd_slash = f"regexp_matches({txt}, '^\\d{{4}}/\\d{{1,2}}/\\d{{1,2}}$')"
    ymd_y = f"CAST(regexp_extract({txt}, '^(\\d{{4}})/(\\d{{1,2}})/(\\d{{1,2}})$', 1) AS BIGINT)"
    ymd_m = f"CAST(regexp_extract({txt}, '^(\\d{{4}})/(\\d{{1,2}})/(\\d{{1,2}})$', 2) AS BIGINT)"
    ymd_d = f"CAST(regexp_extract({txt}, '^(\\d{{4}})/(\\d{{1,2}})/(\\d{{1,2}})$', 3) AS BIGINT)"
    ymd_slash_date = f"TRY_CAST(MAKE_DATE({ymd_y}, {ymd_m}, {ymd_d}) AS DATE)"

    # dd/mm/yyyy or dd-mm-yyyy (day-first default, swap if ambiguous).
    is_dmy = f"regexp_matches({txt}, '^\\d{{1,2}}[/-]\\d{{1,2}}[/-]\\d{{4}}$')"
    dmy_p1 = f"CAST(regexp_extract({txt}, '^(\\d{{1,2}})[/-](\\d{{1,2}})[/-](\\d{{4}})$', 1) AS BIGINT)"
    dmy_p2 = f"CAST(regexp_extract({txt}, '^(\\d{{1,2}})[/-](\\d{{1,2}})[/-](\\d{{4}})$', 2) AS BIGINT)"
    dmy_y = f"CAST(regexp_extract({txt}, '^(\\d{{1,2}})[/-](\\d{{1,2}})[/-](\\d{{4}})$', 3) AS BIGINT)"
    # p2 > 12 => p2 can't be a month -> treat as mm/dd (p1=month, p2=day).
    dmy_month = f"(CASE WHEN {dmy_p2} > 12 THEN {dmy_p1} ELSE {dmy_p2} END)"
    dmy_day = f"(CASE WHEN {dmy_p2} > 12 THEN {dmy_p2} ELSE {dmy_p1} END)"
    dmy_date = f"TRY_CAST(MAKE_DATE({dmy_y}, {dmy_month}, {dmy_day}) AS DATE)"

    # d-MMM-yyyy, e.g. "5-Jan-2024"
    is_dmonthy = f"regexp_matches({txt}, '^\\d{{1,2}}-[A-Za-z]{{3,}}-\\d{{4}}$')"
    dmonthy_d = f"CAST(regexp_extract({txt}, '^(\\d{{1,2}})-([A-Za-z]{{3,}})-(\\d{{4}})$', 1) AS BIGINT)"
    dmonthy_mname = f"LOWER(SUBSTR(regexp_extract({txt}, '^(\\d{{1,2}})-([A-Za-z]{{3,}})-(\\d{{4}})$', 2), 1, 3))"
    dmonthy_y = f"CAST(regexp_extract({txt}, '^(\\d{{1,2}})-([A-Za-z]{{3,}})-(\\d{{4}})$', 3) AS BIGINT)"
    dmonthy_month_resolved = "(CASE " + " ".join(
        f"WHEN {dmonthy_mname} = '{abbr}' THEN {num}" for abbr, num in _MONTH_ABBR.items()
    ) + " ELSE NULL END)"
    dmonthy_date = f"TRY_CAST(MAKE_DATE({dmonthy_y}, {dmonthy_month_resolved}, {dmonthy_d}) AS DATE)"

    return (
        f"(CASE "
        f"WHEN {txt} IS NULL OR {txt} = '' THEN NULL "
        f"WHEN {is_iso} THEN {iso_date} "
        f"WHEN {is_ymd_slash} THEN {ymd_slash_date} "
        f"WHEN {is_dmy} THEN {dmy_date} "
        f"WHEN {is_dmonthy} THEN {dmonthy_date} "
        f"WHEN {is_serial} THEN {serial_date} "
        f"ELSE TRY_CAST({txt} AS DATE) END)"
    )


def round_half_away_from_zero_sql(expr: str, decimals_sql: str) -> str:
    """ROUND: half away from zero, supports negative `decimals_sql`."""
    factor = f"POWER(10, {decimals_sql})"
    return (
        f"(CASE WHEN {expr} IS NULL THEN NULL "
        f"WHEN {expr} >= 0 THEN FLOOR({expr} * {factor} + 0.5) / {factor} "
        f"ELSE -FLOOR(-{expr} * {factor} + 0.5) / {factor} END)"
    )


def round_up_sql(expr: str, decimals_sql: str) -> str:
    """ROUNDUP: away from zero, honours decimals (incl. negative)."""
    factor = f"POWER(10, {decimals_sql})"
    return (
        f"(CASE WHEN {expr} IS NULL THEN NULL "
        f"WHEN {expr} >= 0 THEN CEIL({expr} * {factor}) / {factor} "
        f"ELSE -CEIL(-{expr} * {factor}) / {factor} END)"
    )


def round_down_sql(expr: str, decimals_sql: str) -> str:
    """ROUNDDOWN: toward zero, honours decimals (incl. negative)."""
    factor = f"POWER(10, {decimals_sql})"
    return (
        f"(CASE WHEN {expr} IS NULL THEN NULL "
        f"WHEN {expr} >= 0 THEN FLOOR({expr} * {factor}) / {factor} "
        f"ELSE -FLOOR(-{expr} * {factor}) / {factor} END)"
    )
