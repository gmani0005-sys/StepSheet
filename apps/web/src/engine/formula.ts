// Real tokenizer + parser + evaluator for the StepSheet Formula Builder.
// No `new Function`, no `eval`, no regex-rewriting into JavaScript.
// Implements the "Formula Builder" section of SPEC.md.

import {
  parseSharedNumber,
  parseSharedDate,
  toISODate,
  cleanFloat,
  properCase,
  trimCollapse,
  datedif,
  eomonth,
  addMonthsClamped,
  weekdaySun0,
  excelWeekNum,
  networkdays,
  workday,
  roundHalfAwayFromZero,
  roundUpAwayFromZero,
  roundDownTowardZero,
  dateToExcelSerial,
  daysInMonth,
  preciseSum,
} from './values';

// ---------------------------------------------------------------------------
// Error values
// ---------------------------------------------------------------------------

export class FxError {
  code: string;
  constructor(code: string) {
    this.code = code;
  }
}
export function isFxError(v: any): v is FxError {
  return v instanceof FxError;
}
const NAME_ERR = () => new FxError('#NAME?');
const DIV0_ERR = () => new FxError('#DIV/0!');
const VALUE_ERR = () => new FxError('#VALUE!');
const NA_ERR = () => new FxError('#N/A');
const NUM_ERR = () => new FxError('#NUM!');

export type FxValue = string | number | boolean | null | FxError;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER' | 'STRING' | 'BOOL' | 'COLUMN' | 'IDENT'
  | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'PERCENT' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  num?: number;
}

function tokenize(expr: string, columnNames: string[]): Token[] {
  const tokens: Token[] = [];
  const sortedCols = [...columnNames].sort((a, b) => b.length - a.length);
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Both double- and single-quoted literals are accepted as STRING
      // tokens (Excel itself only recognizes double quotes, but many users
      // and NL-generated formulas use single quotes interchangeably, so we
      // treat them identically rather than silently dropping the quote
      // character and letting the contents fall through as a bare
      // identifier, which previously surfaced as a spurious #NAME? error).
      const quote = ch;
      let j = i + 1;
      let val = '';
      while (j < n) {
        if (expr[j] === quote) {
          if (expr[j + 1] === quote) {
            val += quote;
            j += 2;
            continue;
          }
          j++;
          break;
        }
        val += expr[j];
        j++;
      }
      tokens.push({ type: 'STRING', value: val });
      i = j;
      continue;
    }
    if (ch === '[') {
      const close = expr.indexOf(']', i + 1);
      const end = close === -1 ? n : close;
      tokens.push({ type: 'COLUMN', value: expr.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(expr[j])) j++;
      if (expr[j] === '.') {
        j++;
        while (j < n && /[0-9]/.test(expr[j])) j++;
      }
      tokens.push({ type: 'NUMBER', value: expr.slice(i, j), num: Number(expr.slice(i, j)) });
      i = j;
      continue;
    }
    // multi-char operators
    const two = expr.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ type: 'OP', value: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ch });
      i++;
      continue;
    }
    if (ch === '%') {
      tokens.push({ type: 'PERCENT', value: ch });
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      // try the longest matching known column name first (case-insensitive),
      // but defer to a function call if this identifier is immediately
      // followed by '(' once trimmed.
      let matchedCol: string | null = null;
      for (const col of sortedCols) {
        if (!col) continue;
        const slice = expr.slice(i, i + col.length);
        if (slice.toLowerCase() === col.toLowerCase()) {
          const before = expr[i - 1];
          const after = expr[i + col.length];
          const boundaryOk = (c: string | undefined) => c === undefined || !/[A-Za-z0-9_]/.test(c);
          if (boundaryOk(before) && boundaryOk(after)) {
            // if immediately followed (ignoring spaces) by '(' treat as function instead
            let k = i + col.length;
            while (k < n && expr[k] === ' ') k++;
            if (expr[k] === '(') continue;
            matchedCol = col;
            break;
          }
        }
      }
      if (matchedCol) {
        tokens.push({ type: 'COLUMN', value: matchedCol });
        i += matchedCol.length;
        continue;
      }
      let j = i;
      while (j < n && /[A-Za-z0-9_.]/.test(expr[j])) j++;
      const word = expr.slice(i, j);
      if (/^(TRUE|FALSE)$/i.test(word)) {
        tokens.push({ type: 'BOOL', value: word.toUpperCase() });
      } else {
        tokens.push({ type: 'IDENT', value: word });
      }
      i = j;
      continue;
    }
    // unknown character: skip it (keeps the parser resilient; will likely
    // surface as a parse error -> #VALUE!)
    i++;
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'col'; name: string }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'unary'; op: string; arg: Node }
  | { kind: 'percent'; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'name_error' };

class ParseError extends Error {}

class Parser {
  tokens: Token[];
  pos = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
  peek(): Token {
    return this.tokens[this.pos];
  }
  next(): Token {
    return this.tokens[this.pos++];
  }
  expect(type: TokenType): Token {
    const t = this.next();
    if (t.type !== type) throw new ParseError(`Expected ${type} got ${t.type}`);
    return t;
  }

  parse(): Node {
    const node = this.parseComparison();
    if (this.peek().type !== 'EOF') throw new ParseError('Unexpected trailing tokens');
    return node;
  }

  parseComparison(): Node {
    let left = this.parseConcat();
    while (this.peek().type === 'OP' && ['=', '<>', '<', '>', '<=', '>='].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseConcat();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  parseConcat(): Node {
    let left = this.parseAdditive();
    while (this.peek().type === 'OP' && this.peek().value === '&') {
      this.next();
      const right = this.parseAdditive();
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  }

  parseAdditive(): Node {
    let left = this.parseTerm();
    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseTerm();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  parseTerm(): Node {
    let left = this.parsePower();
    while (this.peek().type === 'OP' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value;
      const right = this.parsePower();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  parsePower(): Node {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && this.peek().value === '^') {
      this.next();
      const right = this.parseUnary();
      left = { kind: 'binary', op: '^', left, right };
    }
    return left;
  }

  parseUnary(): Node {
    if (this.peek().type === 'OP' && this.peek().value === '-') {
      this.next();
      return { kind: 'unary', op: '-', arg: this.parseUnary() };
    }
    if (this.peek().type === 'OP' && this.peek().value === '+') {
      this.next();
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  parsePostfix(): Node {
    let node = this.parsePrimary();
    while (this.peek().type === 'PERCENT') {
      this.next();
      node = { kind: 'percent', arg: node };
    }
    return node;
  }

  parsePrimary(): Node {
    const t = this.peek();
    if (t.type === 'NUMBER') {
      this.next();
      return { kind: 'num', value: t.num as number };
    }
    if (t.type === 'STRING') {
      this.next();
      return { kind: 'str', value: t.value };
    }
    if (t.type === 'BOOL') {
      this.next();
      return { kind: 'bool', value: t.value === 'TRUE' };
    }
    if (t.type === 'COLUMN') {
      this.next();
      return { kind: 'col', name: t.value };
    }
    if (t.type === 'LPAREN') {
      this.next();
      const inner = this.parseComparison();
      this.expect('RPAREN');
      return inner;
    }
    if (t.type === 'IDENT') {
      this.next();
      if (this.peek().type === 'LPAREN') {
        this.next();
        const args: Node[] = [];
        if (this.peek().type !== 'RPAREN') {
          args.push(this.parseComparison());
          while (this.peek().type === 'COMMA') {
            this.next();
            args.push(this.parseComparison());
          }
        }
        this.expect('RPAREN');
        return { kind: 'call', name: t.value.toUpperCase(), args };
      }
      // bare identifier that isn't a known column and isn't a call -> #NAME?
      return { kind: 'name_error' };
    }
    throw new ParseError(`Unexpected token ${t.type}`);
  }
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

function toNumber(v: FxValue): number | FxError {
  if (isFxError(v)) return v;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseSharedNumber(v);
  return n === null ? VALUE_ERR() : n;
}

const MS_DAY = 86400000;

/** A text value that reads as a date (and not as a plain number). */
function dateOperand(v: FxValue): Date | null {
  if (typeof v !== 'string') return null;
  if (parseSharedNumber(v) !== null) return null;
  return parseSharedDate(v);
}

/** d shifted by n days, as an ISO date (or date + time when a time remains). */
function dateResult(d: Date, n: number): string {
  const out = new Date(d.getTime() + n * MS_DAY);
  const hasTime = out.getUTCHours() || out.getUTCMinutes() || out.getUTCSeconds();
  if (!hasTime) return toISODate(out);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${toISODate(out)} ${pad(out.getUTCHours())}:${pad(out.getUTCMinutes())}:${pad(out.getUTCSeconds())}`;
}

function formatNumberCompact(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(cleanFloat(n));
}

function toTextForConcat(v: FxValue): string | FxError {
  if (isFxError(v)) return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return formatNumberCompact(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function toBool(v: FxValue): boolean {
  if (isFxError(v)) return false;
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s !== '';
}

function compareValues(a: FxValue, op: string, b: FxValue): FxValue {
  if (isFxError(a)) return a;
  if (isFxError(b)) return b;
  const aBlank = a === null || a === undefined;
  const bBlank = b === null || b === undefined;
  const aNum = typeof a === 'number' ? a : typeof a === 'string' ? parseSharedNumber(a) : typeof a === 'boolean' ? (a ? 1 : 0) : null;
  const bNum = typeof b === 'number' ? b : typeof b === 'string' ? parseSharedNumber(b) : typeof b === 'boolean' ? (b ? 1 : 0) : null;
  let numeric = aNum !== null && bNum !== null;
  let av: number | string, bv: number | string;
  if (numeric) {
    av = aBlank ? 0 : (aNum as number);
    bv = bBlank ? 0 : (bNum as number);
  } else {
    av = aBlank ? '' : String(a).toLowerCase();
    bv = bBlank ? '' : String(b).toLowerCase();
  }
  switch (op) {
    case '=':
      return av === bv;
    case '<>':
      return av !== bv;
    case '<':
      return av < bv;
    case '>':
      return av > bv;
    case '<=':
      return av <= bv;
    case '>=':
      return av >= bv;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

export interface FormulaContext {
  getColumn: (name: string) => any;
}

function evalNode(node: Node, ctx: FormulaContext): FxValue {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'str':
      return node.value;
    case 'bool':
      return node.value;
    case 'name_error':
      return NAME_ERR();
    case 'col':
      return normalizeCellValue(ctx.getColumn(node.name));
    case 'unary': {
      const v = toNumber(evalNode(node.arg, ctx));
      if (isFxError(v)) return v;
      return -v;
    }
    case 'percent': {
      const v = toNumber(evalNode(node.arg, ctx));
      if (isFxError(v)) return v;
      return v / 100;
    }
    case 'binary':
      return evalBinary(node, ctx);
    case 'call':
      return evalCall(node, ctx);
    default:
      return VALUE_ERR();
  }
}

function normalizeCellValue(v: any): FxValue {
  if (v === undefined) return null;
  if (v instanceof Date) return toISODate(v);
  return v;
}

function evalBinary(node: Extract<Node, { kind: 'binary' }>, ctx: FormulaContext): FxValue {
  const { op } = node;
  if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
    const l = evalNode(node.left, ctx);
    const r = evalNode(node.right, ctx);
    return compareValues(l, op, r);
  }
  if (op === '&') {
    const l = toTextForConcat(evalNode(node.left, ctx));
    if (isFxError(l)) return l;
    const r = toTextForConcat(evalNode(node.right, ctx));
    if (isFxError(r)) return r;
    return l + r;
  }
  const lv = evalNode(node.left, ctx);
  const rv = evalNode(node.right, ctx);
  if (op === '+' || op === '-') {
    // Excel date arithmetic: a date is a day count, so date - date = days
    // and date +/- n = a date n days away. Dates here are text cells
    // ("2024-03-05", "05-Mar-2024"), which toNumber() alone rejects as
    // #VALUE! -- that made the most common date formulas in Excel
    // ([ship_date]-[order_date], [due]+30) unusable.
    const ld = dateOperand(lv);
    const rd = dateOperand(rv);
    if (ld || rd) {
      if (ld && rd) {
        if (op === '+') return VALUE_ERR();
        return cleanFloat((ld.getTime() - rd.getTime()) / MS_DAY);
      }
      if (ld) {
        const n = toNumber(rv);
        if (isFxError(n)) return n;
        return dateResult(ld, op === '+' ? n : -n);
      }
      const n = toNumber(lv);
      if (isFxError(n)) return n;
      if (op === '+') return dateResult(rd as Date, n);
      return cleanFloat(n - dateToExcelSerial(rd as Date));
    }
  }
  const l = toNumber(lv);
  if (isFxError(l)) return l;
  const r = toNumber(rv);
  if (isFxError(r)) return r;
  switch (op) {
    case '+':
      return cleanFloat(l + r);
    case '-':
      return cleanFloat(l - r);
    case '*':
      return cleanFloat(l * r);
    case '/':
      if (r === 0) return DIV0_ERR();
      return cleanFloat(l / r);
    case '^': {
      const res = Math.pow(l, r);
      if (!Number.isFinite(res)) return NUM_ERR();
      return cleanFloat(res);
    }
    default:
      return VALUE_ERR();
  }
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

const LAZY_FUNCTIONS = new Set(['IF', 'IFS', 'SWITCH', 'AND', 'OR', 'IFERROR', 'IFNA', 'COALESCE']);

function evalCall(node: Extract<Node, { kind: 'call' }>, ctx: FormulaContext): FxValue {
  const name = node.name;
  if (LAZY_FUNCTIONS.has(name)) return evalLazyCall(name, node.args, ctx);
  const args = node.args.map((a) => evalNode(a, ctx));
  for (const a of args) if (isFxError(a)) {
    // most functions propagate the first error, except error-inspection fns
    if (!['ISERROR', 'ISNA', 'ISBLANK', 'ISNUMBER', 'ISTEXT'].includes(name)) return a;
  }
  return callFunction(name, args, ctx);
}

function evalLazyCall(name: string, argNodes: Node[], ctx: FormulaContext): FxValue {
  switch (name) {
    case 'IF': {
      if (argNodes.length < 2) return VALUE_ERR();
      const cond = evalNode(argNodes[0], ctx);
      if (isFxError(cond)) return cond;
      const branch = toBool(cond) ? argNodes[1] : argNodes[2];
      if (branch === undefined) return false;
      return evalNode(branch, ctx);
    }
    case 'IFS': {
      for (let i = 0; i + 1 < argNodes.length; i += 2) {
        const cond = evalNode(argNodes[i], ctx);
        if (isFxError(cond)) return cond;
        if (toBool(cond)) return evalNode(argNodes[i + 1], ctx);
      }
      return NA_ERR();
    }
    case 'SWITCH': {
      if (argNodes.length === 0) return VALUE_ERR();
      const val = evalNode(argNodes[0], ctx);
      if (isFxError(val)) return val;
      let i = 1;
      for (; i + 1 < argNodes.length; i += 2) {
        const caseVal = evalNode(argNodes[i], ctx);
        if (isFxError(caseVal)) return caseVal;
        if (compareValues(val, '=', caseVal) === true) return evalNode(argNodes[i + 1], ctx);
      }
      if (i < argNodes.length) return evalNode(argNodes[i], ctx);
      return NA_ERR();
    }
    case 'AND': {
      let result = true;
      for (const a of argNodes) {
        const v = evalNode(a, ctx);
        if (isFxError(v)) return v;
        result = result && toBool(v);
      }
      return result;
    }
    case 'OR': {
      let result = false;
      for (const a of argNodes) {
        const v = evalNode(a, ctx);
        if (isFxError(v)) return v;
        result = result || toBool(v);
      }
      return result;
    }
    case 'IFERROR': {
      const v = evalNode(argNodes[0], ctx);
      if (isFxError(v)) return argNodes[1] !== undefined ? evalNode(argNodes[1], ctx) : false;
      return v;
    }
    case 'IFNA': {
      const v = evalNode(argNodes[0], ctx);
      if (isFxError(v) && v.code === '#N/A') return argNodes[1] !== undefined ? evalNode(argNodes[1], ctx) : false;
      return v;
    }
    case 'COALESCE': {
      for (const a of argNodes) {
        const v = evalNode(a, ctx);
        if (isFxError(v)) continue;
        if (v !== null && v !== undefined && v !== '') return v;
      }
      return null;
    }
    default:
      return NAME_ERR();
  }
}

function asText(v: FxValue): string {
  if (isFxError(v)) return '';
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return formatNumberCompact(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function asNum(v: FxValue): number | FxError {
  return toNumber(v);
}

function asDate(v: FxValue): Date | null {
  if (isFxError(v) || v === null || v === undefined) return null;
  if (typeof v === 'number') return parseSharedDate(v, { asDateStep: true });
  return parseSharedDate(v, { asDateStep: true });
}

function excelFloorMod(n: number, d: number): number {
  const r = n % d;
  if (r !== 0 && (r < 0) !== (d < 0)) return r + d;
  return r;
}

// Excel number-format codes, as used by TEXT(). Supports the parts people
// actually type: 0 # ? digit placeholders, thousands commas, decimals, %,
// literal text ("..." or \x) and plain literal characters ($, Rs, spaces)
// around the number, and up to four ;-separated sections (positive;
// negative; zero; text).
function splitFormatSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === '"') inQuote = !inQuote;
    if (ch === '\\' && !inQuote && i + 1 < fmt.length) {
      cur += ch + fmt[i + 1];
      i++;
      continue;
    }
    if (ch === ';' && !inQuote) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Strip quoted literals / escapes, for format-type detection only. */
function formatCodesOnly(fmt: string): string {
  return fmt.replace(/"[^"]*"/g, '').replace(/\\./g, '');
}

function formatNumberWithPattern(n: number, fmt: string): string {
  const sections = splitFormatSections(fmt);
  let sec = sections[0];
  let value = n;
  let explicitNegSection = false;
  if (n < 0 && sections.length > 1 && sections[1] !== '') {
    sec = sections[1];
    value = -n;
    explicitNegSection = true;
  } else if (n === 0 && sections.length > 2 && sections[2] !== '') {
    sec = sections[2];
  }

  // Tokenise into literals and the numeric core (first run of 0 # ? , .).
  type Tok = { lit: string } | { core: string };
  const toks: Tok[] = [];
  let i = 0;
  let coreTaken = false;
  let percentCount = 0;
  while (i < sec.length) {
    const ch = sec[i];
    if (ch === '"') {
      const end = sec.indexOf('"', i + 1);
      toks.push({ lit: sec.slice(i + 1, end === -1 ? sec.length : end) });
      i = end === -1 ? sec.length : end + 1;
      continue;
    }
    if (ch === '\\' && i + 1 < sec.length) {
      toks.push({ lit: sec[i + 1] });
      i += 2;
      continue;
    }
    if (!coreTaken && /[0#?.,]/.test(ch) && /[0#?]/.test(sec.slice(i))) {
      let j = i;
      while (j < sec.length && /[0#?.,]/.test(sec[j])) j++;
      toks.push({ core: sec.slice(i, j) });
      coreTaken = true;
      i = j;
      continue;
    }
    if (ch === '%') percentCount++;
    if (ch === '_' || ch === '*') {
      // _x = space the width of x; *x = repeat fill: render as nothing
      i += 2;
      continue;
    }
    toks.push({ lit: ch });
    i++;
  }

  let v = Math.abs(value) * Math.pow(100, percentCount);
  const coreTok = toks.find((t): t is { core: string } => 'core' in t);
  let numText = '';
  if (coreTok) {
    let core = coreTok.core;
    // trailing commas scale by 1,000 each (e.g. "0.0,," = millions)
    while (core.endsWith(',')) {
      v /= 1000;
      core = core.slice(0, -1);
    }
    const dot = core.indexOf('.');
    const intPat = dot === -1 ? core : core.slice(0, dot);
    const fracPat = dot === -1 ? '' : core.slice(dot + 1).replace(/,/g, '');
    const decimals = (fracPat.match(/[0#?]/g) || []).length;
    const minFrac = (fracPat.match(/0/g) || []).length;
    const minInt = (intPat.match(/0/g) || []).length;
    const grouping = intPat.includes(',');
    const rounded = roundHalfAwayFromZero(v, decimals);
    const fixed = rounded.toFixed(decimals);
    let [intDigits, fracDigits = ''] = fixed.split('.');
    if (intDigits === '0' && minInt === 0) intDigits = '';
    intDigits = intDigits.padStart(minInt, '0');
    if (grouping) intDigits = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    while (fracDigits.length > minFrac && fracDigits.endsWith('0')) fracDigits = fracDigits.slice(0, -1);
    numText = intDigits + (dot !== -1 ? '.' + fracDigits : '');
    v = rounded;
  }
  const body = toks.map((t) => ('core' in t ? numText : t.lit)).join('');
  const negative = value < 0 && !explicitNegSection && (!coreTok || v !== 0);
  return (negative ? '-' : '') + body;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Excel date/time format codes for TEXT(): yyyy yy, mmmm mmm mm m (month,
// or minutes right after h / before s), dddd ddd dd d, hh h, ss s,
// AM/PM, am/pm, A/P, quoted literals and \ escapes.
function formatDateWithPattern(d: Date, fmt: string): string {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = d.getUTCDay();
  let h = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const se = d.getUTCSeconds();
  const hasAmPm = /am\/pm|a\/p/i.test(formatCodesOnly(fmt));
  const pad = (x: number) => String(x).padStart(2, '0');
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const hourShown = hasAmPm ? hour12 : h;

  const out: string[] = [];
  const kinds: string[] = []; // token kind per out entry, for m-as-minutes
  let i = 0;
  const lower = fmt.toLowerCase();
  const push = (txt: string, kind: string) => {
    out.push(txt);
    kinds.push(kind);
  };
  while (i < fmt.length) {
    const ch = fmt[i];
    if (ch === '"') {
      const end = fmt.indexOf('"', i + 1);
      push(fmt.slice(i + 1, end === -1 ? fmt.length : end), 'lit');
      i = end === -1 ? fmt.length : end + 1;
      continue;
    }
    if (ch === '\\' && i + 1 < fmt.length) {
      push(fmt[i + 1], 'lit');
      i += 2;
      continue;
    }
    const rest = lower.slice(i);
    const run = (c: string) => {
      let j = i;
      while (j < lower.length && lower[j] === c) j++;
      return j - i;
    };
    if (rest.startsWith('am/pm')) {
      push(h < 12 ? (fmt.slice(i, i + 2) === 'am' ? 'am' : 'AM') : (fmt.slice(i, i + 2) === 'am' ? 'pm' : 'PM'), 'ampm');
      i += 5;
      continue;
    }
    if (rest.startsWith('a/p')) {
      push(h < 12 ? (fmt[i] === 'a' ? 'a' : 'A') : (fmt[i] === 'a' ? 'p' : 'P'), 'ampm');
      i += 3;
      continue;
    }
    if (ch.toLowerCase() === 'y') {
      const n = run('y');
      push(n <= 2 ? String(y).slice(-2) : String(y), 'y');
      i += n;
      continue;
    }
    if (ch.toLowerCase() === 'd') {
      const n = run('d');
      push(n === 1 ? String(day) : n === 2 ? pad(day) : n === 3 ? DAYS_SHORT[dow] : DAYS_FULL[dow], 'd');
      i += n;
      continue;
    }
    if (ch.toLowerCase() === 'h') {
      const n = run('h');
      push(n === 1 ? String(hourShown) : pad(hourShown), 'h');
      i += n;
      continue;
    }
    if (ch.toLowerCase() === 's') {
      const n = run('s');
      // a preceding m/mm token meant minutes
      for (let k = kinds.length - 1; k >= 0; k--) {
        if (kinds[k] === 'lit') continue;
        if (kinds[k] === 'm' && (out[k] === String(mo) || out[k] === pad(mo))) {
          out[k] = kinds[k] === 'm' && out[k].length === 2 ? pad(mi) : String(mi);
          kinds[k] = 'min';
        }
        break;
      }
      push(n === 1 ? String(se) : pad(se), 's');
      i += n;
      continue;
    }
    if (ch.toLowerCase() === 'm') {
      const n = run('m');
      let prev = '';
      for (let k = kinds.length - 1; k >= 0; k--) {
        if (kinds[k] !== 'lit') {
          prev = kinds[k];
          break;
        }
      }
      if (n <= 2 && prev === 'h') push(n === 1 ? String(mi) : pad(mi), 'min');
      else if (n === 1) push(String(mo), 'm');
      else if (n === 2) push(pad(mo), 'm');
      else if (n === 3) push(MONTHS_SHORT[mo - 1], 'mon');
      else if (n === 5) push(MONTHS_FULL[mo - 1][0], 'mon');
      else push(MONTHS_FULL[mo - 1], 'mon');
      i += n;
      continue;
    }
    push(ch, 'lit');
    i++;
  }
  void h;
  return out.join('');
}

/** Excel wildcard pattern (* ? with ~ escape) -> RegExp source. */
function wildcardToRegex(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length && /[*?~]/.test(pattern[i + 1])) {
      out += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    } else if (ch === '*') out += '[\\s\\S]*';
    else if (ch === '?') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

/** Does `val` meet an Excel COUNTIF/SUMIF-style criterion (">1000", "N*", "<>x", 5)? */
function meetsCriteria(val: FxValue, crit: FxValue): boolean {
  if (isFxError(val)) return false;
  if (typeof crit === 'number' || typeof crit === 'boolean') return compareValues(val, '=', crit) === true;
  const critStr = asText(crit);
  const m = critStr.match(/^(<=|>=|<>|=|<|>)([\s\S]*)$/);
  const op = m ? m[1] : '=';
  const operand = m ? m[2] : critStr;
  const valBlank = val === null || val === undefined || val === '';
  const valNum = typeof val === 'number' ? val : typeof val === 'string' ? parseSharedNumber(val) : null;
  const opNum = parseSharedNumber(operand);
  if (op === '=' || op === '<>') {
    let eq: boolean;
    if (operand === '') eq = valBlank;
    else if (opNum !== null && valNum !== null) eq = valNum === opNum;
    else if (/[*?]/.test(operand.replace(/~[*?~]/g, ''))) {
      eq = !valBlank && new RegExp(`^${wildcardToRegex(operand)}$`, 'i').test(asText(val));
    } else if (/~[*?~]/.test(operand)) {
      eq = !valBlank && new RegExp(`^${wildcardToRegex(operand)}$`, 'i').test(asText(val));
    } else eq = !valBlank && asText(val).toLowerCase() === operand.toLowerCase();
    return op === '=' ? eq : !eq;
  }
  if (valBlank) return false;
  if (opNum !== null) {
    if (valNum === null) return false;
    return compareValues(valNum, op, opNum) === true;
  }
  if (valNum !== null) return false;
  return compareValues(asText(val), op, operand) === true;
}

/** k-th (1-based; negative = from the end) occurrence index of delim in s. */
function nthIndexOf(s: string, delim: string, k: number, caseInsensitive: boolean): number {
  const hay = caseInsensitive ? s.toLowerCase() : s;
  const needle = caseInsensitive ? delim.toLowerCase() : delim;
  const hits: number[] = [];
  let from = 0;
  while (needle.length > 0) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    hits.push(idx);
    from = idx + needle.length;
  }
  const pos = k > 0 ? k - 1 : hits.length + k;
  return pos >= 0 && pos < hits.length ? hits[pos] : -1;
}

/** Excel YEARFRAC for bases 0 (US 30/360), 1 (actual/actual), 2 (actual/360), 3 (actual/365), 4 (European 30/360). */
function yearFrac(start: Date, end: Date, basis: number): number | null {
  let a = start;
  let b = end;
  if (a.getTime() > b.getTime()) [a, b] = [b, a];
  let sy = a.getUTCFullYear(), sm = a.getUTCMonth() + 1, sd = a.getUTCDate();
  let ey = b.getUTCFullYear(), em = b.getUTCMonth() + 1, ed = b.getUTCDate();
  const actualDays = Math.round((b.getTime() - a.getTime()) / MS_DAY);
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  switch (basis) {
    case 0: {
      const lastFeb = (y: number, m: number, d: number) => m === 2 && d === daysInMonth(y, 2);
      if (lastFeb(sy, sm, sd) && lastFeb(ey, em, ed)) ed = 30;
      if (lastFeb(sy, sm, sd)) sd = 30;
      if (ed === 31 && sd >= 30) ed = 30;
      if (sd === 31) sd = 30;
      return (ey * 360 + em * 30 + ed - (sy * 360 + sm * 30 + sd)) / 360;
    }
    case 1: {
      const oneYearOn = new Date(Date.UTC(sy + 1, sm - 1, Math.min(sd, daysInMonth(sy + 1, sm))));
      if (b.getTime() <= oneYearOn.getTime()) {
        let denom = 365;
        if (sy === ey && isLeap(sy)) denom = 366;
        else {
          // a Feb 29 inside (start, end] makes it a 366-day year
          for (let y = sy; y <= ey; y++) {
            if (!isLeap(y)) continue;
            const feb29 = Date.UTC(y, 1, 29);
            if (feb29 >= a.getTime() && feb29 <= b.getTime()) denom = 366;
          }
        }
        return actualDays / denom;
      }
      let total = 0;
      for (let y = sy; y <= ey; y++) total += isLeap(y) ? 366 : 365;
      return actualDays / (total / (ey - sy + 1));
    }
    case 2:
      return actualDays / 360;
    case 3:
      return actualDays / 365;
    case 4: {
      if (sd === 31) sd = 30;
      if (ed === 31) ed = 30;
      return (ey * 360 + em * 30 + ed - (sy * 360 + sm * 30 + sd)) / 360;
    }
    default:
      return null;
  }
}

function localDateParts(): { date: string; time: string } {
  // TODAY()/NOW() are the user's local calendar date and clock, like Excel --
  // not UTC (which is the previous day in India until 05:30 IST).
  const now = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
}

function callFunction(name: string, args: FxValue[], ctx: FormulaContext): FxValue {
  const a0 = args[0];
  switch (name) {
    // --- logical / error inspection (NOT/XOR; lazy ones handled earlier) ---
    case 'NOT':
      return !toBool(a0);
    case 'XOR': {
      let count = 0;
      for (const a of args) if (toBool(a)) count++;
      return count % 2 === 1;
    }
    case 'ISBLANK':
      return a0 === null || a0 === undefined || a0 === '';
    case 'ISNUMBER':
      return typeof a0 === 'number';
    case 'ISTEXT':
      return typeof a0 === 'string' && !isFxError(a0);
    case 'ISERROR':
      return isFxError(a0);
    case 'ISNA':
      return isFxError(a0) && a0.code === '#N/A';

    // --- text ---
    case 'CONCAT':
    case 'CONCATENATE': {
      let out = '';
      for (const a of args) {
        const t = toTextForConcat(a);
        if (isFxError(t)) return t;
        out += t;
      }
      return out;
    }
    case 'TEXTJOIN': {
      const sep = asText(args[0]);
      const ignoreEmpty = toBool(args[1]);
      const parts = args.slice(2).map((a) => asText(a)).filter((s) => !ignoreEmpty || s !== '');
      return parts.join(sep);
    }
    case 'UPPER':
      return asText(a0).toUpperCase();
    case 'LOWER':
      return asText(a0).toLowerCase();
    case 'PROPER':
      return properCase(asText(a0));
    case 'TRIM':
      return trimCollapse(asText(a0));
    case 'CLEAN':
      return asText(a0).replace(/[\x00-\x1F\x7F]/g, '');
    case 'LEN':
      return asText(a0).length;
    case 'LEFT': {
      const s = asText(a0);
      const cnt = args.length > 1 ? Number(asNum(args[1])) : 1;
      if (!(cnt >= 0)) return VALUE_ERR();
      return s.slice(0, Math.floor(cnt));
    }
    case 'RIGHT': {
      const s = asText(a0);
      const cnt = args.length > 1 ? Number(asNum(args[1])) : 1;
      if (!(cnt >= 0)) return VALUE_ERR();
      return cnt === 0 ? '' : s.slice(-Math.floor(cnt));
    }
    case 'MID': {
      const s = asText(a0);
      const start = Number(asNum(args[1]));
      const len = Number(asNum(args[2]));
      if (!(start >= 1) || !(len >= 0)) return VALUE_ERR();
      return s.slice(Math.floor(start) - 1, Math.floor(start) - 1 + Math.floor(len));
    }
    case 'FIND': {
      const needle = asText(a0);
      const hay = asText(args[1]);
      const start = args.length > 2 ? Number(asNum(args[2])) : 1;
      // Excel: not found, or a start outside the text, is #VALUE! (not #N/A)
      if (!(start >= 1) || start > hay.length + 1) return VALUE_ERR();
      const idx = hay.indexOf(needle, Math.floor(start) - 1);
      return idx === -1 ? VALUE_ERR() : idx + 1;
    }
    case 'SEARCH': {
      // case-insensitive, with Excel wildcards (* ? and ~ to escape)
      const needle = asText(a0);
      const hay = asText(args[1]);
      const start = args.length > 2 ? Number(asNum(args[2])) : 1;
      if (!(start >= 1) || start > hay.length + 1) return VALUE_ERR();
      const rx = new RegExp(wildcardToRegex(needle), 'gi');
      rx.lastIndex = Math.floor(start) - 1;
      const hit = rx.exec(hay);
      return hit ? hit.index + 1 : VALUE_ERR();
    }
    case 'SUBSTITUTE': {
      const s = asText(a0);
      const oldS = asText(args[1]);
      const newS = asText(args[2]);
      if (oldS === '') return s;
      if (args.length > 3) {
        const instance = Number(asNum(args[3]));
        let count = 0;
        let idx = -1;
        let searchFrom = 0;
        while (true) {
          idx = s.indexOf(oldS, searchFrom);
          if (idx === -1) return s;
          count++;
          if (count === instance) {
            return s.slice(0, idx) + newS + s.slice(idx + oldS.length);
          }
          searchFrom = idx + oldS.length;
        }
      }
      return s.split(oldS).join(newS);
    }
    case 'REPLACE': {
      const s = asText(a0);
      const start = Math.max(1, Number(asNum(args[1])));
      const len = Math.max(0, Number(asNum(args[2])));
      const newText = asText(args[3]);
      return s.slice(0, start - 1) + newText + s.slice(start - 1 + len);
    }
    case 'EXACT':
      return asText(a0) === asText(args[1]);
    case 'REPT':
      return asText(a0).repeat(Math.max(0, Math.floor(Number(asNum(args[1])))));
    case 'TEXT': {
      const fmt = asText(args[1]);
      const codes = formatCodesOnly(fmt);
      const isDateFmt = /[ymdhs]/i.test(codes) && !/[#0?]/.test(codes);
      if (isDateFmt) {
        const d = asDate(a0);
        if (!d) return VALUE_ERR();
        return formatDateWithPattern(d, fmt);
      }
      const num = asNum(a0);
      if (isFxError(num)) return num;
      return formatNumberWithPattern(num, fmt);
    }
    case 'VALUE': {
      const n = parseSharedNumber(asText(a0));
      return n === null ? VALUE_ERR() : n;
    }
    case 'TEXTBEFORE':
    case 'TEXTAFTER': {
      // TEXTBEFORE/TEXTAFTER(text, delimiter, [instance_num], [match_mode],
      // [match_end], [if_not_found]); a negative instance counts from the end.
      const s = asText(a0);
      const delim = asText(args[1]);
      const inst = args.length > 2 && args[2] !== null ? Number(asNum(args[2])) : 1;
      if (!Number.isFinite(inst) || inst === 0 || Math.abs(inst) > Math.max(1, s.length)) return VALUE_ERR();
      const ci = args.length > 3 && toBool(args[3]);
      const notFound = () => (args.length > 5 ? args[5] : NA_ERR());
      if (delim === '') return name === 'TEXTBEFORE' ? (inst > 0 ? '' : s) : inst > 0 ? s : '';
      const idx = nthIndexOf(s, delim, Math.trunc(inst), ci);
      if (idx === -1) return notFound();
      return name === 'TEXTBEFORE' ? s.slice(0, idx) : s.slice(idx + delim.length);
    }
    case 'DATEVALUE': {
      const d = asDate(a0);
      return d ? toISODate(d) : VALUE_ERR();
    }

    // --- math ---
    case 'ROUND': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const d = args.length > 1 ? Number(asNum(args[1])) : 0;
      return roundHalfAwayFromZero(n, d);
    }
    case 'ROUNDUP': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const d = args.length > 1 ? Number(asNum(args[1])) : 0;
      return roundUpAwayFromZero(n, d);
    }
    case 'ROUNDDOWN': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const d = args.length > 1 ? Number(asNum(args[1])) : 0;
      return roundDownTowardZero(n, d);
    }
    case 'INT': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      return Math.floor(n);
    }
    case 'TRUNC': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const d = args.length > 1 ? Number(asNum(args[1])) : 0;
      return roundDownTowardZero(n, d);
    }
    case 'ABS': {
      const n = asNum(a0);
      return isFxError(n) ? n : Math.abs(n);
    }
    case 'SQRT': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      if (n < 0) return NUM_ERR();
      return Math.sqrt(n);
    }
    case 'POWER': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const e = asNum(args[1]);
      if (isFxError(e)) return e;
      const res = Math.pow(n, e);
      return Number.isFinite(res) ? cleanFloat(res) : NUM_ERR();
    }
    case 'MOD': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const d = asNum(args[1]);
      if (isFxError(d)) return d;
      if (d === 0) return DIV0_ERR();
      return excelFloorMod(n, d);
    }
    case 'CEILING': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const sig = args.length > 1 ? Number(asNum(args[1])) : 1;
      if (sig === 0) return 0;
      return Math.ceil(n / sig) * sig;
    }
    case 'FLOOR': {
      const n = asNum(a0);
      if (isFxError(n)) return n;
      const sig = args.length > 1 ? Number(asNum(args[1])) : 1;
      if (sig === 0) return 0;
      return Math.floor(n / sig) * sig;
    }
    case 'SIGN': {
      const n = asNum(a0);
      return isFxError(n) ? n : Math.sign(n);
    }
    case 'SUM': {
      const nums: number[] = [];
      for (const a of args) {
        if (a === null || a === undefined || a === '') continue;
        const n = asNum(a);
        if (!isFxError(n)) nums.push(n);
      }
      return cleanFloat(preciseSum(nums));
    }
    case 'AVERAGE': {
      const nums = args.filter((a) => a !== null && a !== undefined && a !== '').map((a) => asNum(a)).filter((n): n is number => !isFxError(n));
      if (nums.length === 0) return DIV0_ERR();
      return cleanFloat(preciseSum(nums) / nums.length);
    }
    case 'MIN': {
      const nums = args.filter((a) => a !== null && a !== undefined && a !== '').map((a) => asNum(a)).filter((n): n is number => !isFxError(n));
      return nums.length ? Math.min(...nums) : 0;
    }
    case 'MAX': {
      const nums = args.filter((a) => a !== null && a !== undefined && a !== '').map((a) => asNum(a)).filter((n): n is number => !isFxError(n));
      return nums.length ? Math.max(...nums) : 0;
    }
    case 'MEDIAN': {
      const nums = args.filter((a) => a !== null && a !== undefined && a !== '').map((a) => asNum(a)).filter((n): n is number => !isFxError(n)).sort((x, y) => x - y);
      if (!nums.length) return NUM_ERR();
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 ? nums[mid] : cleanFloat((nums[mid - 1] + nums[mid]) / 2);
    }
    case 'PRODUCT': {
      let total: number | null = null;
      for (const a of args) {
        if (a === null || a === undefined || a === '') continue;
        const n = asNum(a);
        if (isFxError(n)) return n;
        total = (total ?? 1) * n;
      }
      return total ?? 0;
    }

    // --- COUNTIF-lite (single-cell convenience, not part of the required list) ---
    case 'COUNTIF': {
      return meetsCriteria(a0, args[1]) ? 1 : 0;
    }

    // --- dates ---
    case 'DATE': {
      const y = Number(asNum(args[0]));
      const m = Number(asNum(args[1]));
      const d = Number(asNum(args[2]));
      const dt = new Date(Date.UTC(y, m - 1, d));
      return toISODate(dt);
    }
    case 'YEAR': {
      const d = asDate(a0);
      return d ? d.getUTCFullYear() : VALUE_ERR();
    }
    case 'MONTH': {
      const d = asDate(a0);
      return d ? d.getUTCMonth() + 1 : VALUE_ERR();
    }
    case 'DAY': {
      const d = asDate(a0);
      return d ? d.getUTCDate() : VALUE_ERR();
    }
    case 'HOUR': {
      const d = asDate(a0);
      return d ? d.getUTCHours() : VALUE_ERR();
    }
    case 'MINUTE': {
      const d = asDate(a0);
      return d ? d.getUTCMinutes() : VALUE_ERR();
    }
    case 'SECOND': {
      const d = asDate(a0);
      return d ? d.getUTCSeconds() : VALUE_ERR();
    }
    case 'TODAY':
      return localDateParts().date;
    case 'NOW': {
      const { date, time } = localDateParts();
      return `${date} ${time}`;
    }
    case 'DATEDIF': {
      const d1 = asDate(a0);
      const d2 = asDate(args[1]);
      if (!d1 || !d2) return VALUE_ERR();
      const unit = asText(args[2]) || 'd';
      const result = datedif(d1, d2, unit);
      return result === null ? NUM_ERR() : result;
    }
    case 'EDATE': {
      const d = asDate(a0);
      if (!d) return VALUE_ERR();
      const months = Number(asNum(args[1]));
      return toISODate(addMonthsClamped(d, months));
    }
    case 'EOMONTH': {
      const d = asDate(a0);
      if (!d) return VALUE_ERR();
      const months = args.length > 1 ? Number(asNum(args[1])) : 0;
      return toISODate(eomonth(d, months));
    }
    case 'WEEKDAY': {
      const d = asDate(a0);
      if (!d) return VALUE_ERR();
      const type = args.length > 1 && args[1] !== null ? Number(asNum(args[1])) : 1;
      const sun0 = weekdaySun0(d);
      // Excel return types: 1/17 Sun=1..Sat=7, 2/11 Mon=1..Sun=7,
      // 3 Mon=0..Sun=6, 12..16 week starting Tue..Sat = 1.
      if (type === 1 || type === 17) return sun0 + 1;
      if (type === 2 || type === 11) return ((sun0 + 6) % 7) + 1;
      if (type === 3) return (sun0 + 6) % 7;
      if (type >= 12 && type <= 16) return ((sun0 - (type - 10) + 7) % 7) + 1;
      return NUM_ERR();
    }
    case 'WEEKNUM': {
      const d = asDate(a0);
      return d ? excelWeekNum(d) : VALUE_ERR();
    }
    case 'NETWORKDAYS': {
      const d1 = asDate(a0);
      const d2 = asDate(args[1]);
      if (!d1 || !d2) return VALUE_ERR();
      return networkdays(d1, d2);
    }
    case 'WORKDAY': {
      const d = asDate(a0);
      if (!d) return VALUE_ERR();
      const days = Number(asNum(args[1]));
      return toISODate(workday(d, days));
    }
    case 'YEARFRAC': {
      const d1 = asDate(a0);
      const d2 = asDate(args[1]);
      if (!d1 || !d2) return VALUE_ERR();
      const basis = args.length > 2 && args[2] !== null ? Math.trunc(Number(asNum(args[2]))) : 0;
      const yf = yearFrac(d1, d2, basis);
      return yf === null ? NUM_ERR() : cleanFloat(yf);
    }

    default:
      return NAME_ERR();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a Formula Builder expression for one row.
 * `row` is used case-insensitively for bare / bracketed column references.
 */
export function evaluateFormula(expression: string, row: Record<string, any>): FxValue {
  let expr = (expression ?? '').trim();
  if (!expr) return null;
  if (expr.startsWith('=')) expr = expr.slice(1);

  const columnNames = Object.keys(row || {});
  const ctx: FormulaContext = {
    getColumn: (name: string) => {
      if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
      const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? row[key] : undefined;
    },
  };

  // A step evaluates the same formula on every row: parse it once per
  // (formula, column set) instead of once per row.
  const cacheKey = `${expr}\u0000${columnNames.join('\u0001')}`;
  let ast = AST_CACHE.get(cacheKey);
  if (ast === undefined) {
    try {
      ast = new Parser(tokenize(expr, columnNames)).parse();
    } catch {
      ast = PARSE_FAILED;
    }
    if (AST_CACHE.size >= 256) AST_CACHE.delete(AST_CACHE.keys().next().value as string);
    AST_CACHE.set(cacheKey, ast);
  }
  if (ast === PARSE_FAILED) return VALUE_ERR();
  try {
    return evalNode(ast, ctx);
  } catch {
    return VALUE_ERR();
  }
}
const PARSE_FAILED = Symbol('parse-failed');
const AST_CACHE = new Map<string, any>();

/** Convert a formula result into the plain JS value StepSheet stores in a cell. */
export function formulaResultToCell(v: FxValue): any {
  if (isFxError(v)) return v.code;
  if (v === undefined) return null;
  return v;
}
