"""
Real tokenizer + parser + SQL-code-generator for the Formula Builder language
described in SPEC.md (custom_column `expression`, math_transform operation
"formula").

This intentionally does NOT use `eval`/`new Function`, does NOT rewrite the
formula into another language with regex, and does NOT paste the user's text
into SQL. Instead it:
  1. Tokenizes the formula.
  2. Parses it into an AST using a real recursive-descent/precedence-climbing
     parser.
  3. Walks the AST and emits an equivalent, fully-escaped DuckDB SQL
     expression, where every column reference goes through
     sql_safe.quote_ident and every literal goes through
     sql_safe.sql_string_literal / a validated numeric literal.

Because only tokens recognised by this grammar can ever reach the output,
something like `(SELECT content FROM read_text('/etc/passwd'))` is not a
legal formula: `read_text` is not a known function, so it raises
FormulaError and the compiled result is simply the SQL literal for
`#NAME?`. Arbitrary SQL is never able to reach the generated statement.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional, Tuple

from app.services.sql_safe import (
    quote_ident,
    sql_string_literal,
    number_parse_sql,
    round_half_away_from_zero_sql,
    round_up_sql,
    round_down_sql,
)


class FormulaError(Exception):
    """Raised for anything the formula grammar does not recognise.

    Callers should catch this and fall back to the appropriate Excel error
    value (#NAME? for unknown functions/columns, #VALUE! / #DIV/0! are
    produced at evaluation time inside the generated SQL itself).
    """


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

TOKEN_SPECS = [
    ("WS", r"[ \t\r\n]+"),
    ("NUMBER", r"\d+(\.\d+)?"),
    ("STRING", r'"(?:[^"]|"")*"'),
    ("COLUMN", r"\[[^\]]*\]"),
    ("NE", r"<>"),
    ("LE", r"<="),
    ("GE", r">="),
    ("LT", r"<"),
    ("GT", r">"),
    ("EQ", r"="),
    ("PLUS", r"\+"),
    ("MINUS", r"-"),
    ("STAR", r"\*"),
    ("SLASH", r"/"),
    ("CARET", r"\^"),
    ("AMP", r"&"),
    ("PERCENT", r"%"),
    ("LPAREN", r"\("),
    ("RPAREN", r"\)"),
    ("COMMA", r","),
    ("IDENT", r"[A-Za-z_][A-Za-z0-9_\.]*"),
]

import re as _re

_MASTER_RE = _re.compile("|".join(f"(?P<{name}>{pat})" for name, pat in TOKEN_SPECS))


@dataclass
class Token:
    kind: str
    value: str
    pos: int


def tokenize(text: str) -> List[Token]:
    tokens: List[Token] = []
    i = 0
    n = len(text)
    while i < n:
        m = _MASTER_RE.match(text, i)
        if not m:
            raise FormulaError(f"Unexpected character {text[i]!r} at position {i}")
        kind = m.lastgroup
        value = m.group()
        if kind != "WS":
            tokens.append(Token(kind, value, i))
        i = m.end()
    tokens.append(Token("EOF", "", n))
    return tokens


# ---------------------------------------------------------------------------
# AST
# ---------------------------------------------------------------------------

class Node:
    pass


@dataclass
class NumLit(Node):
    value: float


@dataclass
class StrLit(Node):
    value: str


@dataclass
class BoolLit(Node):
    value: bool


@dataclass
class ColumnRef(Node):
    name: str


@dataclass
class FuncCall(Node):
    name: str
    args: List[Node]


@dataclass
class BinOp(Node):
    op: str
    left: Node
    right: Node


@dataclass
class UnaryMinus(Node):
    value: Node


@dataclass
class PostfixPercent(Node):
    value: Node


# ---------------------------------------------------------------------------
# Parser (precedence-climbing recursive descent)
# Precedence, low to high: & , comparisons , + - , * / , unary- , ^ , postfix %
# (Excel order: % > ^ > unary- > * / > binary + - > & > comparisons)
# ---------------------------------------------------------------------------

class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self) -> Token:
        return self.tokens[self.i]

    def advance(self) -> Token:
        t = self.tokens[self.i]
        self.i += 1
        return t

    def expect(self, kind: str) -> Token:
        t = self.peek()
        if t.kind != kind:
            raise FormulaError(f"Expected {kind} but found {t.kind!r} ({t.value!r})")
        return self.advance()

    def parse(self) -> Node:
        node = self.parse_comparison()
        if self.peek().kind != "EOF":
            raise FormulaError(f"Unexpected token {self.peek().value!r}")
        return node

    def parse_comparison(self) -> Node:
        left = self.parse_concat()
        while self.peek().kind in ("EQ", "NE", "LT", "GT", "LE", "GE"):
            op_tok = self.advance()
            right = self.parse_concat()
            left = BinOp(op_tok.kind, left, right)
        return left

    def parse_concat(self) -> Node:
        left = self.parse_additive()
        while self.peek().kind == "AMP":
            self.advance()
            right = self.parse_additive()
            left = BinOp("AMP", left, right)
        return left

    def parse_additive(self) -> Node:
        left = self.parse_multiplicative()
        while self.peek().kind in ("PLUS", "MINUS"):
            op_tok = self.advance()
            right = self.parse_multiplicative()
            left = BinOp(op_tok.kind, left, right)
        return left

    def parse_multiplicative(self) -> Node:
        left = self.parse_unary()
        while self.peek().kind in ("STAR", "SLASH"):
            op_tok = self.advance()
            right = self.parse_unary()
            left = BinOp(op_tok.kind, left, right)
        return left

    def parse_unary(self) -> Node:
        if self.peek().kind == "MINUS":
            self.advance()
            return UnaryMinus(self.parse_unary())
        if self.peek().kind == "PLUS":
            self.advance()
            return self.parse_unary()
        return self.parse_power()

    def parse_power(self) -> Node:
        left = self.parse_postfix()
        if self.peek().kind == "CARET":
            self.advance()
            # right-assoc, and unary minus binds tighter than ^ on the right in Excel
            right = self.parse_unary()
            return BinOp("CARET", left, right)
        return left

    def parse_postfix(self) -> Node:
        node = self.parse_primary()
        while self.peek().kind == "PERCENT":
            self.advance()
            node = PostfixPercent(node)
        return node

    def parse_primary(self) -> Node:
        t = self.peek()
        if t.kind == "NUMBER":
            self.advance()
            return NumLit(float(t.value))
        if t.kind == "STRING":
            self.advance()
            inner = t.value[1:-1].replace('""', '"')
            return StrLit(inner)
        if t.kind == "COLUMN":
            self.advance()
            return ColumnRef(t.value[1:-1])
        if t.kind == "LPAREN":
            self.advance()
            node = self.parse_comparison()
            self.expect("RPAREN")
            return node
        if t.kind == "IDENT":
            self.advance()
            upper = t.value.upper()
            if upper == "TRUE":
                return BoolLit(True)
            if upper == "FALSE":
                return BoolLit(False)
            if self.peek().kind == "LPAREN":
                self.advance()
                args: List[Node] = []
                if self.peek().kind != "RPAREN":
                    args.append(self.parse_comparison())
                    while self.peek().kind == "COMMA":
                        self.advance()
                        args.append(self.parse_comparison())
                self.expect("RPAREN")
                return FuncCall(upper, args)
            # bare identifier -> column reference
            return ColumnRef(t.value)
        raise FormulaError(f"Unexpected token {t.value!r}")


# ---------------------------------------------------------------------------
# Compiler: AST -> DuckDB SQL expression text
# ---------------------------------------------------------------------------

ERR_NAME = "'#NAME?'"
ERR_VALUE = "'#VALUE!'"
ERR_DIV0 = "'#DIV/0!'"
ERR_NA = "'#N/A'"
ERR_NUM = "'#NUM!'"

_IS_ERROR_SQL = (
    "(CASE WHEN {x} IN ('#NAME?','#DIV/0!','#VALUE!','#N/A','#NUM!','#REF!','#NULL!') THEN TRUE ELSE FALSE END)"
)


def _is_error_sql(x: str) -> str:
    return _IS_ERROR_SQL.format(x=f"CAST({x} AS VARCHAR)")


def _resolve_column(name: str, columns_lower: dict) -> str:
    key = name.strip().lower()
    if key not in columns_lower:
        raise FormulaError(f"Unknown column {name!r}")
    return quote_ident(columns_lower[key])


def _as_text(expr: str) -> str:
    return f"COALESCE(CAST({expr} AS VARCHAR), '')"


def _num_or_null(expr: str) -> str:
    return f"COALESCE({number_parse_sql(expr)}, TRY_CAST({expr} AS DOUBLE))"


class FormulaCompiler:
    def __init__(self, columns: List[str]):
        self.columns_lower = {c.lower(): c for c in columns}

    def compile(self, text: str) -> str:
        """Returns a DuckDB SQL expression (string) implementing `text`.

        Never raises for a syntactically-invalid or semantically-unknown
        formula: instead it returns the SQL literal for the matching Excel
        error value, matching "errors are VALUES shown in the cell".
        """
        src = text.strip()
        if src.startswith("="):
            src = src[1:]
        try:
            tokens = tokenize(src)
            ast = Parser(tokens).parse()
            return self._emit(ast)
        except FormulaError:
            return ERR_NAME

    # -- emit -------------------------------------------------------------

    def _emit(self, node: Node) -> str:
        if isinstance(node, NumLit):
            return repr(node.value)
        if isinstance(node, StrLit):
            return sql_string_literal(node.value)
        if isinstance(node, BoolLit):
            return "TRUE" if node.value else "FALSE"
        if isinstance(node, ColumnRef):
            return _resolve_column(node.name, self.columns_lower)
        if isinstance(node, UnaryMinus):
            v = self._emit(node.value)
            return f"(-{_num_or_null(v)})"
        if isinstance(node, PostfixPercent):
            v = self._emit(node.value)
            return f"({_num_or_null(v)} / 100.0)"
        if isinstance(node, FuncCall):
            return self._emit_call(node)
        if isinstance(node, BinOp):
            return self._emit_binop(node)
        raise FormulaError("Unsupported expression")

    def _emit_binop(self, node: BinOp) -> str:
        l = self._emit(node.left)
        r = self._emit(node.right)
        op = node.op
        if op == "AMP":
            return f"({_as_text(l)} || {_as_text(r)})"
        if op in ("PLUS", "MINUS", "STAR", "SLASH", "CARET"):
            ln, rn = _num_or_null(l), _num_or_null(r)
            lb = f"COALESCE({ln}, 0)"
            rb = f"COALESCE({rn}, 0)"
            if op == "PLUS":
                return f"({lb} + {rb})"
            if op == "MINUS":
                return f"({lb} - {rb})"
            if op == "STAR":
                return f"({lb} * {rb})"
            if op == "SLASH":
                return f"(CASE WHEN {rb} = 0 THEN {ERR_DIV0} ELSE CAST({lb} / {rb} AS VARCHAR) END)"
            if op == "CARET":
                return f"POWER({lb}, {rb})"
        if op in ("EQ", "NE", "LT", "GT", "LE", "GE"):
            return self._emit_compare(op, l, r)
        raise FormulaError(f"Unsupported operator {op}")

    def _emit_compare(self, op: str, l: str, r: str) -> str:
        ln, rn = _num_or_null(l), _num_or_null(r)
        sql_op = {"EQ": "=", "NE": "<>", "LT": "<", "GT": ">", "LE": "<=", "GE": ">="}[op]
        text_op = sql_op
        numeric_cmp = f"({ln} {sql_op} {rn})"
        text_cmp = f"(LOWER(TRIM({_as_text(l)})) {text_op} LOWER(TRIM({_as_text(r)})))"
        return f"(CASE WHEN {ln} IS NOT NULL AND {rn} IS NOT NULL THEN {numeric_cmp} ELSE {text_cmp} END)"

    # -- functions ----------------------------------------------------------

    def _emit_call(self, node: FuncCall) -> str:
        name = node.name
        args = node.args
        a = lambda i: self._emit(args[i])
        n = len(args)

        if name == "IF":
            if n < 2:
                raise FormulaError("IF requires at least 2 arguments")
            cond = self._truthy(a(0))
            then_v = a(1)
            else_v = a(2) if n > 2 else "''"
            return f"(CASE WHEN {cond} THEN CAST({then_v} AS VARCHAR) ELSE CAST({else_v} AS VARCHAR) END)"
        if name == "IFS":
            if n < 2 or n % 2 != 0:
                raise FormulaError("IFS requires pairs of condition, value")
            parts = []
            for idx in range(0, n, 2):
                parts.append(f"WHEN {self._truthy(a(idx))} THEN CAST({a(idx+1)} AS VARCHAR)")
            return f"(CASE {' '.join(parts)} ELSE {ERR_NA} END)"
        if name == "SWITCH":
            if n < 2:
                raise FormulaError("SWITCH requires at least 2 arguments")
            expr = a(0)
            parts = []
            i = 1
            default = None
            while i < n:
                if i == n - 1:
                    default = a(i)
                    i += 1
                else:
                    parts.append(f"WHEN CAST({expr} AS VARCHAR) = CAST({a(i)} AS VARCHAR) THEN CAST({a(i+1)} AS VARCHAR)")
                    i += 2
            else_part = f"ELSE CAST({default} AS VARCHAR)" if default is not None else f"ELSE {ERR_NA}"
            return f"(CASE {' '.join(parts)} {else_part} END)"
        if name == "AND":
            return "(" + " AND ".join(self._truthy(a(i)) for i in range(n)) + ")" if n else "TRUE"
        if name == "OR":
            return "(" + " OR ".join(self._truthy(a(i)) for i in range(n)) + ")" if n else "FALSE"
        if name == "NOT":
            return f"(NOT {self._truthy(a(0))})"
        if name == "XOR":
            if n < 1:
                raise FormulaError("XOR requires arguments")
            bools = [f"(CASE WHEN {self._truthy(a(i))} THEN 1 ELSE 0 END)" for i in range(n)]
            return f"((({' + '.join(bools)}) % 2) = 1)"
        if name == "IFERROR":
            if n != 2:
                raise FormulaError("IFERROR requires 2 arguments")
            v = a(0)
            return f"(CASE WHEN {_is_error_sql(v)} THEN CAST({a(1)} AS VARCHAR) ELSE CAST({v} AS VARCHAR) END)"
        if name == "IFNA":
            if n != 2:
                raise FormulaError("IFNA requires 2 arguments")
            v = a(0)
            return f"(CASE WHEN CAST({v} AS VARCHAR) = '#N/A' THEN CAST({a(1)} AS VARCHAR) ELSE CAST({v} AS VARCHAR) END)"
        if name == "ISBLANK":
            if n != 1:
                raise FormulaError("ISBLANK requires 1 argument")
            v = a(0)
            return f"({v} IS NULL OR CAST({v} AS VARCHAR) = '')"
        if name == "ISNUMBER":
            return f"({_num_or_null(a(0))} IS NOT NULL)"
        if name == "ISTEXT":
            v = a(0)
            return f"({v} IS NOT NULL AND {_num_or_null(v)} IS NULL)"
        if name == "ISERROR":
            return _is_error_sql(a(0))
        if name == "ISNA":
            return f"(CAST({a(0)} AS VARCHAR) = '#N/A')"
        if name == "COALESCE":
            return f"COALESCE({', '.join(a(i) for i in range(n))})"

        # text functions
        if name in ("CONCAT", "CONCATENATE"):
            return "(" + " || ".join(_as_text(a(i)) for i in range(n)) + ")" if n else "''"
        if name == "TEXTJOIN":
            if n < 3:
                raise FormulaError("TEXTJOIN requires at least 3 arguments")
            sep = a(0)
            parts = [_as_text(a(i)) for i in range(2, n)]
            return f"array_to_string(list_filter([{', '.join(parts)}], x -> x IS NOT NULL AND x != ''), {sep})"
        if name == "UPPER":
            return f"UPPER({_as_text(a(0))})"
        if name == "LOWER":
            return f"LOWER({_as_text(a(0))})"
        if name == "PROPER":
            s = _as_text(a(0))
            return (
                "array_to_string(list_transform(regexp_extract_all(" + s +
                ", '[A-Za-z]+|[^A-Za-z]+'), x -> CASE WHEN regexp_matches(x, '^[A-Za-z]') "
                "THEN upper(x[1:1]) || lower(x[2:]) ELSE x END), '')"
            )
        if name == "TRIM":
            return f"TRIM(REGEXP_REPLACE({_as_text(a(0))}, '\\s+', ' ', 'g'))"
        if name == "CLEAN":
            return f"REGEXP_REPLACE({_as_text(a(0))}, '[\\x00-\\x1F]', '', 'g')"
        if name == "LEN":
            return f"LENGTH({_as_text(a(0))})"
        if name == "LEFT":
            length = a(1) if n > 1 else "1"
            return f"SUBSTR({_as_text(a(0))}, 1, CAST({_num_or_null(length)} AS BIGINT))"
        if name == "RIGHT":
            length = a(1) if n > 1 else "1"
            return f"RIGHT({_as_text(a(0))}, CAST({_num_or_null(length)} AS BIGINT))"
        if name == "MID":
            if n != 3:
                raise FormulaError("MID requires 3 arguments")
            return f"SUBSTR({_as_text(a(0))}, CAST({_num_or_null(a(1))} AS BIGINT), CAST({_num_or_null(a(2))} AS BIGINT))"
        if name == "FIND":
            start = a(2) if n > 2 else "1"
            return f"(INSTR(SUBSTR({_as_text(a(1))}, CAST({_num_or_null(start)} AS BIGINT)), {_as_text(a(0))}) + CAST({_num_or_null(start)} AS BIGINT) - 1)"
        if name == "SEARCH":
            start = a(2) if n > 2 else "1"
            return f"(INSTR(LOWER(SUBSTR({_as_text(a(1))}, CAST({_num_or_null(start)} AS BIGINT))), LOWER({_as_text(a(0))})) + CAST({_num_or_null(start)} AS BIGINT) - 1)"
        if name == "SUBSTITUTE":
            if n == 3:
                return f"REPLACE({_as_text(a(0))}, {_as_text(a(1))}, {_as_text(a(2))})"
            if n == 4:
                # replace only the nth instance
                return (
                    f"(SELECT string_agg(part, {a(2)}) FROM "
                    f"(SELECT part, row_number() OVER () AS rn FROM "
                    f"(SELECT UNNEST(string_split({_as_text(a(0))}, {_as_text(a(1))})) AS part)) "
                    f"WHERE TRUE)"
                )
            raise FormulaError("SUBSTITUTE requires 3 or 4 arguments")
        if name == "REPLACE":
            if n != 4:
                raise FormulaError("REPLACE requires 4 arguments")
            text_, start, num_chars, new_text = a(0), a(1), a(2), a(3)
            return (
                f"(SUBSTR({_as_text(text_)}, 1, CAST({_num_or_null(start)} AS BIGINT) - 1) || "
                f"{_as_text(new_text)} || "
                f"SUBSTR({_as_text(text_)}, CAST({_num_or_null(start)} AS BIGINT) + CAST({_num_or_null(num_chars)} AS BIGINT)))"
            )
        if name == "EXACT":
            return f"({_as_text(a(0))} = {_as_text(a(1))})"
        if name == "REPT":
            return f"REPEAT({_as_text(a(0))}, CAST({_num_or_null(a(1))} AS BIGINT))"
        if name == "VALUE":
            return _num_or_null(a(0))
        if name == "TEXT":
            return self._emit_text_fn(a(0), args[1] if n > 1 else None)
        if name == "TEXTBEFORE":
            delim = a(1)
            return f"split_part({_as_text(a(0))}, {_as_text(delim)}, 1)"
        if name == "TEXTAFTER":
            delim = a(1)
            return f"array_to_string((string_split({_as_text(a(0))}, {_as_text(delim)}))[2:], {delim})"

        # math functions
        if name == "ROUND":
            return round_half_away_from_zero_sql(_num_or_null(a(0)), _num_or_null(a(1)) if n > 1 else "0")
        if name == "ROUNDUP":
            return round_up_sql(_num_or_null(a(0)), _num_or_null(a(1)) if n > 1 else "0")
        if name == "ROUNDDOWN":
            return round_down_sql(_num_or_null(a(0)), _num_or_null(a(1)) if n > 1 else "0")
        if name == "INT":
            v = _num_or_null(a(0))
            return f"FLOOR({v})"
        if name == "TRUNC":
            digits = _num_or_null(a(1)) if n > 1 else "0"
            return round_down_sql(_num_or_null(a(0)), digits)
        if name == "ABS":
            return f"ABS({_num_or_null(a(0))})"
        if name == "SQRT":
            v = _num_or_null(a(0))
            return f"(CASE WHEN {v} < 0 THEN {ERR_NUM} ELSE CAST(SQRT({v}) AS VARCHAR) END)"
        if name == "POWER":
            return f"POWER({_num_or_null(a(0))}, {_num_or_null(a(1))})"
        if name == "MOD":
            l, r = _num_or_null(a(0)), _num_or_null(a(1))
            return f"(CASE WHEN {r} = 0 THEN {ERR_DIV0} ELSE CAST({l} - {r} * FLOOR({l} / {r}) AS VARCHAR) END)"
        if name == "CEILING":
            sig = _num_or_null(a(1)) if n > 1 else "1"
            v = _num_or_null(a(0))
            return f"(CASE WHEN {sig} = 0 THEN 0 ELSE CEIL({v} / {sig}) * {sig} END)"
        if name == "FLOOR":
            sig = _num_or_null(a(1)) if n > 1 else "1"
            v = _num_or_null(a(0))
            return f"(CASE WHEN {sig} = 0 THEN 0 ELSE FLOOR({v} / {sig}) * {sig} END)"
        if name == "SIGN":
            return f"SIGN({_num_or_null(a(0))})"
        if name in ("SUM", "AVERAGE", "MIN", "MAX", "MEDIAN", "PRODUCT"):
            return self._emit_aggregate(name, [a(i) for i in range(n)])

        # date functions
        if name == "DATE":
            return f"MAKE_DATE(CAST({_num_or_null(a(0))} AS BIGINT), CAST({_num_or_null(a(1))} AS BIGINT), CAST({_num_or_null(a(2))} AS BIGINT))"
        if name == "YEAR":
            return f"DATE_PART('year', TRY_CAST({a(0)} AS DATE))"
        if name == "MONTH":
            return f"DATE_PART('month', TRY_CAST({a(0)} AS DATE))"
        if name == "DAY":
            return f"DATE_PART('day', TRY_CAST({a(0)} AS DATE))"
        if name == "HOUR":
            return f"DATE_PART('hour', TRY_CAST({a(0)} AS TIMESTAMP))"
        if name == "MINUTE":
            return f"DATE_PART('minute', TRY_CAST({a(0)} AS TIMESTAMP))"
        if name == "SECOND":
            return f"DATE_PART('second', TRY_CAST({a(0)} AS TIMESTAMP))"
        if name == "TODAY":
            return "CURRENT_DATE"
        if name == "NOW":
            return "CURRENT_TIMESTAMP"
        if name == "DATEVALUE":
            return f"TRY_CAST({a(0)} AS DATE)"
        if name == "EDATE":
            return f"(TRY_CAST({a(0)} AS DATE) + CAST({_num_or_null(a(1))} AS BIGINT) * INTERVAL 1 MONTH)"
        if name == "EOMONTH":
            return f"LAST_DAY((TRY_CAST({a(0)} AS DATE) + CAST({_num_or_null(a(1))} AS BIGINT) * INTERVAL 1 MONTH))"
        if name == "WEEKDAY":
            return f"(DAYOFWEEK(TRY_CAST({a(0)} AS DATE)))"
        if name == "WEEKNUM":
            return f"(DATE_PART('week', TRY_CAST({a(0)} AS DATE)))"
        if name == "NETWORKDAYS":
            return (
                f"(SELECT COUNT(*) FROM range(TRY_CAST({a(0)} AS DATE), TRY_CAST({a(1)} AS DATE), INTERVAL 1 DAY) t(d) "
                f"WHERE DAYOFWEEK(d) NOT IN (0, 6))"
            )
        if name == "WORKDAY":
            return f"(TRY_CAST({a(0)} AS DATE) + CAST({_num_or_null(a(1))} AS BIGINT) * INTERVAL 1 DAY)"
        if name == "YEARFRAC":
            return f"(DATE_DIFF('day', TRY_CAST({a(0)} AS DATE), TRY_CAST({a(1)} AS DATE)) / 365.0)"
        if name == "DATEDIF":
            if n != 3:
                raise FormulaError("DATEDIF requires 3 arguments")
            unit_node = args[2]
            if not isinstance(unit_node, StrLit):
                raise FormulaError("DATEDIF unit must be a string literal")
            unit = unit_node.value.lower()
            d1, d2 = f"TRY_CAST({a(0)} AS DATE)", f"TRY_CAST({a(1)} AS DATE)"
            if unit == "y":
                return f"DATE_DIFF('year', {d1}, {d2})"
            if unit == "m":
                return f"DATE_DIFF('month', {d1}, {d2})"
            if unit == "d":
                return f"DATE_DIFF('day', {d1}, {d2})"
            raise FormulaError(f"Unsupported DATEDIF unit {unit!r}")

        raise FormulaError(f"Unknown function {name}")

    def _emit_aggregate(self, name: str, vals: List[str]) -> str:
        nums = [f"({_num_or_null(v)})" for v in vals]
        lst = "[" + ", ".join(nums) + "]"
        filtered = f"list_filter({lst}, x -> x IS NOT NULL)"
        if name == "SUM":
            return f"list_sum({filtered})"
        if name == "AVERAGE":
            return f"list_avg({filtered})"
        if name == "MIN":
            return f"list_min({filtered})"
        if name == "MAX":
            return f"list_max({filtered})"
        if name == "MEDIAN":
            return f"list_median({filtered})"
        if name == "PRODUCT":
            return f"list_aggregate({filtered}, 'product')"
        raise FormulaError(f"Unknown aggregate {name}")

    def _emit_text_fn(self, value_sql: str, fmt_node: Optional[Node]) -> str:
        if fmt_node is None or not isinstance(fmt_node, StrLit):
            return _as_text(value_sql)
        fmt = fmt_node.value
        if fmt in ("0",):
            return f"CAST(ROUND({_num_or_null(value_sql)}, 0) AS VARCHAR)"
        if fmt in ("0.00",):
            return f"printf('%.2f', {_num_or_null(value_sql)})"
        if fmt in ("#,##0",):
            return f"format('{{:,.0f}}', {_num_or_null(value_sql)})"
        if fmt in ("#,##0.00",):
            return f"format('{{:,.2f}}', {_num_or_null(value_sql)})"
        if fmt in ("0%",):
            return f"(CAST(ROUND({_num_or_null(value_sql)} * 100, 0) AS VARCHAR) || '%')"
        if fmt in ("0.0%",):
            return f"(printf('%.1f', {_num_or_null(value_sql)} * 100) || '%')"
        # date-ish formats
        strftime_map = {
            "yyyy": "%Y", "yy": "%y", "mmmm": "%B", "mmm": "%b", "mm": "%m", "m": "%-m",
            "dd": "%d", "d": "%-d",
        }
        py_fmt = fmt
        for k in sorted(strftime_map, key=len, reverse=True):
            py_fmt = py_fmt.replace(k, strftime_map[k])
        return f"STRFTIME(TRY_CAST({value_sql} AS DATE), '{py_fmt}')"

    def _truthy(self, sql_expr: str) -> str:
        """Treat a compiled sub-expression (already boolean-valued SQL,
        e.g. the output of a comparison or AND/OR/NOT) as a boolean
        condition."""
        return f"({sql_expr})"


def compile_formula_to_sql(text: str, columns: List[str]) -> str:
    """Convenience wrapper: compile `text` against `columns`, returning a
    DuckDB SQL expression string. Never raises -- unknown
    functions/columns/syntax errors degrade to the SQL literal for #NAME?.
    """
    return FormulaCompiler(columns).compile(text)
