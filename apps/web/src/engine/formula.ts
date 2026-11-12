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
    if (ch === '"') {
      let j = i + 1;
      let val = '';
      while (j < n) {
        if (expr[j] === '"') {
          if (expr[j + 1] === '"') {
            val += '"';
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
  const l = toNumber(evalNode(node.left, ctx));
  if (isFxError(l)) return l;
  const r = toNumber(evalNode(node.right, ctx));
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

function formatNumberWithPattern(n: number, fmt: string): string {
  let isPct = /%$/.test(fmt);
  let base = isPct ? fmt.slice(0, -1) : fmt;
  let value = isPct ? n * 100 : n;
  const decMatch = base.match(/\.(0+)/);
  const decimals = decMatch ? decMatch[1].length : 0;
  const grouped = base.includes(',');
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart] = fixed.split('.');
  let intOut = intPart;
  if (grouped) {
    const neg = intOut.startsWith('-');
    const digits = neg ? intOut.slice(1) : intOut;
    const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    intOut = (neg ? '-' : '') + withCommas;
  }
  let out = fracPart !== undefined ? `${intOut}.${fracPart}` : intOut;
  if (isPct) out += '%';
  return out;
}

function formatDateWithPattern(d: Date, fmt: string): string {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const tokens = ['yyyy', 'mmmm', 'mmm', 'yy', 'mm', 'dd', 'm', 'd'];
  let out = '';
  let i = 0;
  while (i < fmt.length) {
    let matched = false;
    for (const tok of tokens) {
      if (fmt.slice(i, i + tok.length).toLowerCase() === tok) {
        switch (tok) {
          case 'yyyy': out += String(y); break;
          case 'yy': out += String(y).slice(-2); break;
          case 'mmmm': out += monthNamesFull[mo - 1]; break;
          case 'mmm': out += monthNamesShort[mo - 1]; break;
          case 'mm': out += String(mo).padStart(2, '0'); break;
          case 'm': out += String(mo); break;
          case 'dd': out += String(day).padStart(2, '0'); break;
          case 'd': out += String(day); break;
        }
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += fmt[i];
      i++;
    }
  }
  return out;
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
      return s.slice(0, Math.max(0, cnt));
    }
    case 'RIGHT': {
      const s = asText(a0);
      const cnt = args.length > 1 ? Number(asNum(args[1])) : 1;
      return cnt <= 0 ? '' : s.slice(-cnt);
    }
    case 'MID': {
      const s = asText(a0);
      const start = Math.max(1, Number(asNum(args[1])));
      const len = Math.max(0, Number(asNum(args[2])));
      return s.slice(start - 1, start - 1 + len);
    }
    case 'FIND': {
      const needle = asText(a0);
      const hay = asText(args[1]);
      const start = args.length > 2 ? Math.max(1, Number(asNum(args[2]))) : 1;
      const idx = hay.indexOf(needle, start - 1);
      return idx === -1 ? NA_ERR() : idx + 1;
    }
    case 'SEARCH': {
      const needle = asText(a0).toLowerCase();
      const hay = asText(args[1]).toLowerCase();
      const start = args.length > 2 ? Math.max(1, Number(asNum(args[2]))) : 1;
      const idx = hay.indexOf(needle, start - 1);
      return idx === -1 ? NA_ERR() : idx + 1;
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
      const isDateFmt = /[ymd]/i.test(fmt) && !/[#0]/.test(fmt);
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
    case 'TEXTBEFORE': {
      const s = asText(a0);
      const delim = asText(args[1]);
      const idx = s.indexOf(delim);
      return idx === -1 ? NA_ERR() : s.slice(0, idx);
    }
    case 'TEXTAFTER': {
      const s = asText(a0);
      const delim = asText(args[1]);
      const idx = s.indexOf(delim);
      return idx === -1 ? NA_ERR() : s.slice(idx + delim.length);
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
      let total = 0;
      for (const a of args) {
        if (a === null || a === undefined || a === '') continue;
        const n = asNum(a);
        if (!isFxError(n)) total += n;
      }
      return cleanFloat(total);
    }
    case 'AVERAGE': {
      const nums = args.filter((a) => a !== null && a !== undefined && a !== '').map((a) => asNum(a)).filter((n): n is number => !isFxError(n));
      if (nums.length === 0) return DIV0_ERR();
      return cleanFloat(nums.reduce((s, n) => s + n, 0) / nums.length);
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
      const val = a0;
      const crit = args[1];
      return compareValues(val, '=', crit) === true ? 1 : 0;
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
      return toISODate(new Date());
    case 'NOW':
      return new Date().toISOString();
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
      const type = args.length > 1 ? Number(asNum(args[1])) : 1;
      const sun0 = weekdaySun0(d);
      return type === 1 ? sun0 + 1 : sun0;
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
      const days = Math.abs((d2.getTime() - d1.getTime()) / 86400000);
      return cleanFloat(days / 365);
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
      if (name in row) return row[name];
      const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? row[key] : undefined;
    },
  };

  try {
    const tokens = tokenize(expr, columnNames);
    const ast = new Parser(tokens).parse();
    return evalNode(ast, ctx);
  } catch {
    return VALUE_ERR();
  }
}

/** Convert a formula result into the plain JS value StepSheet stores in a cell. */
export function formulaResultToCell(v: FxValue): any {
  if (isFxError(v)) return v.code;
  if (v === undefined) return null;
  return v;
}
