/**
 * Chat with Data -- structured query planner.
 *
 * The keyword branches in localEngine.executeChatQuery answer one simple
 * shape at a time ("how many cancelled orders", "revenue by region"). Round 2
 * QA showed what happens when a question has more than one part: the extra
 * parts were silently dropped ("completed orders in the north" counted every
 * completed order), "not completed" was answered as "completed", and month or
 * customer filters were ignored -- confident, wrong numbers.
 *
 * This planner reads the whole question into one plan -- every filter
 * (categorical, NOT, IN, numeric, date, exact id), one measure and
 * aggregation, an optional grouping, ranking, share, group-level condition
 * (HAVING) or growth -- and computes it. It only takes questions that need
 * it (see `needsPlanner`); simple questions keep their existing answers.
 * When it recognises such a question but cannot build a complete plan it
 * DECLINES with a reason instead of guessing.
 */
import { parseSharedDate, parseSharedNumber, preciseSum, cleanFloat } from './values';

export interface PlannerProfile {
  colNames: string[];
  measures: string[];
  dimensions: string[];
  dates: string[];
}

export interface PlannerAnswer {
  intent: string;
  explanation: string;
  method: string;
  columns: string[];
  rows: Record<string, any>[];
  chart: any;
  trace: string;
  filters: any[];
  groupBy: string[];
}

export type PlannerResult = { kind: 'answer'; answer: PlannerAnswer } | { kind: 'decline'; reason: string } | null;

type Agg = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'std' | 'var' | 'median';
type NumOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';

interface CatFilter { kind: 'cat'; col: string; values: string[]; labels: string[]; negate: boolean }
interface NumFilter { kind: 'num'; col: string; op: NumOp; value: number; value2?: number }
interface DateFilter { kind: 'date'; col: string; year?: number; month?: number; quarter?: number; label: string }
type Filter = CatFilter | NumFilter | DateFilter;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 };
const NEGATION_BEFORE = /(?:\bnot|\bexcluding|\bexclude|\bexcept(?:\s+for)?|\bother\s+than|\bnon-?|\bwithout|n't|\bapart\s+from|\bbesides)\s*(?:the\s+|any\s+|in\s+|from\s+|been\s+|be\s+)*$/;

const MEASURE_WORDS: Array<[RegExp, string[]]> = [
  [/\b(revenue|sales|turnover|order values?|spend|spent|amounts?|money|income)\b/, ['revenue', 'sales', 'amount', 'total_amount', 'total', 'value', 'spend']],
  [/\b(profit|margin)\b/, ['profit', 'margin']],
  [/\b(quantity|quantities|units?|qty|pieces)\b/, ['quantity', 'qty', 'units']],
  [/\b(prices?)\b/, ['unit_price', 'price']],
  [/\b(costs?)\b/, ['cost', 'unit_cost']],
  [/\b(discounts?)\b/, ['discount']],
];
const ENTITY_DIM_WORDS: Array<[RegExp, string[]]> = [
  [/\b(customers?|clients?|buyers?|accounts?)\b/, ['customer_id', 'customer_name', 'customer', 'client', 'account']],
  [/\b(regions?|territor(?:y|ies)|markets?)\b/, ['region', 'territory', 'market']],
  [/\b(countr(?:y|ies))\b/, ['country']],
  [/\b(cit(?:y|ies))\b/, ['city']],
  [/\b(states?)\b/, ['state']],
  [/\b(categor(?:y|ies)|segments?|departments?)\b/, ['category', 'segment', 'department']],
  [/\b(products?|items?|skus?)\b/, ['product', 'product_name', 'item', 'sku']],
  [/\b(status(?:es)?|stages?)\b/, ['status', 'stage']],
  [/\b(channels?)\b/, ['channel']],
  [/\b(tiers?)\b/, ['tier', 'account_tier']],
];
const ROW_ENTITY = /\b(orders?|transactions?|purchases?|invoices?|records?|rows?|sales|deals?|tickets?)\b/;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmt = (n: number | null) =>
  n === null ? 'n/a' : Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const human = (c: string) => c.replace(/_/g, ' ');

function numOf(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  return parseSharedNumber(String(v), { allowScientific: true });
}

function pickColumn(candidates: string[], pool: string[]): string {
  for (const c of candidates) {
    const exact = pool.find((p) => p.toLowerCase() === c);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const part = pool.find((p) => p.toLowerCase().includes(c));
    if (part) return part;
  }
  return '';
}

/** The comparison phrase at the start of `text` ("above 8.5 million", "more than $5,000"). */
function parseThreshold(text: string): { op: NumOp; value: number; value2?: number; start: number; end: number } | null {
  const NUM = '(-?\\$?\\s?[\\d,]*\\.?\\d+)\\s*(k|m|mn|million|thousand|lakh|lakhs|crore|crores|bn|billion)?\\b';
  const scale = (n: string, u?: string) => {
    let v = parseSharedNumber(n.replace(/\s/g, '')) ?? NaN;
    const unit = (u || '').toLowerCase();
    if (unit === 'k' || unit === 'thousand') v *= 1e3;
    else if (unit === 'm' || unit === 'mn' || unit === 'million') v *= 1e6;
    else if (unit === 'bn' || unit === 'billion') v *= 1e9;
    else if (unit.startsWith('lakh')) v *= 1e5;
    else if (unit.startsWith('crore')) v *= 1e7;
    return v;
  };
  const between = new RegExp(`\\bbetween\\s+${NUM}\\s+(?:and|to|-)\\s+${NUM}`, 'i').exec(text);
  if (between) {
    const a = scale(between[1], between[2]);
    const b = scale(between[3], between[4]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { op: 'between', value: Math.min(a, b), value2: Math.max(a, b), start: between.index, end: between.index + between[0].length };
    }
  }
  const OPS: Array<[RegExp, NumOp]> = [
    [/\b(?:at least|no less than|not less than|minimum of|min(?:imum)?)\s+/, 'gte'],
    [/\b(?:at most|no more than|not more than|up to|maximum of|max(?:imum)?)\s+/, 'lte'],
    [/(?:\b(?:more than|greater than|over|above|exceeding|exceeds?|higher than|bigger than|larger than)\s+|>\s*)/, 'gt'],
    [/(?:\b(?:less than|fewer than|under|below|lower than|smaller than)\s+|<\s*)/, 'lt'],
    [/(?:\b(?:exactly|equal to|equals?)\s+|=\s*)/, 'eq'],
  ];
  for (const [re, op] of OPS) {
    const m = new RegExp(re.source + NUM, 'i').exec(text);
    if (m) {
      const v = scale(m[1], m[2]);
      if (Number.isFinite(v)) return { op, value: v, start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

function cmp(op: NumOp, v: number, a: number, b?: number): boolean {
  switch (op) {
    case 'gt': return v > a;
    case 'gte': return v >= a;
    case 'lt': return v < a;
    case 'lte': return v <= a;
    case 'eq': return v === a;
    case 'between': return v >= a && v <= (b as number);
  }
}
const OP_TEXT: Record<NumOp, string> = { gt: 'over', gte: 'at least', lt: 'under', lte: 'at most', eq: 'exactly', between: 'between' };

function aggregate(nums: number[], agg: Agg): number | null {
  if (agg === 'count') return nums.length;
  if (nums.length === 0) return null;
  if (agg === 'sum') return cleanFloat(preciseSum(nums));
  if (agg === 'avg') return cleanFloat(preciseSum(nums) / nums.length);
  if (agg === 'min') return nums.reduce((m, x) => (x < m ? x : m), nums[0]);
  if (agg === 'max') return nums.reduce((m, x) => (x > m ? x : m), nums[0]);
  if (agg === 'median') {
    const s = [...nums].sort((a, b) => a - b);
    const h = Math.floor(s.length / 2);
    return s.length % 2 ? s[h] : cleanFloat((s[h - 1] + s[h]) / 2);
  }
  // Sample statistics (n - 1), as Excel STDEV.S / VAR.S and pandas default.
  if (nums.length < 2) return null;
  const mean = preciseSum(nums) / nums.length;
  const v = preciseSum(nums.map((x) => (x - mean) * (x - mean))) / (nums.length - 1);
  return cleanFloat(agg === 'var' ? v : Math.sqrt(v));
}
const AGG_LABEL: Record<Agg, string> = { sum: 'Total', avg: 'Average', count: 'Count', min: 'Minimum', max: 'Maximum', std: 'Standard deviation', var: 'Variance', median: 'Median' };
const AGG_SQL: Record<Agg, string> = { sum: 'SUM', avg: 'AVG', count: 'COUNT', min: 'MIN', max: 'MAX', std: 'STDDEV_SAMP', var: 'VAR_SAMP', median: 'MEDIAN' };

/** Questions the keyword branches are known to get wrong. */
export function needsPlanner(q: string): boolean {
  return (
    NEGATION_WORDS.test(q) ||
    /\b(standard deviation|std\.?\s*dev|stdev|variance|median)\b/.test(q) ||
    /\b(month over month|month-over-month|mom|year over year|year-over-year|yoy|growth|grew|growing)\b/.test(q) ||
    new RegExp(`\\b${MONTH_RE}\\b\\s+(?:19|20)\\d{2}\\b`).test(q) ||
    /\b(?:in|for|during|from|of)\s+(?:the\s+)?(?:jan(?:uary)?|feb(?:ruary)?|march|april|june|july|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(q) ||
    /\bq[1-4]\b|\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\b/.test(q) ||
    /\b(second|third|fourth|fifth|2nd|3rd|4th|5th)\s+(highest|lowest|largest|smallest|biggest|most|least|top|best|worst)\b/.test(q) ||
    /\b\d+\s+(smallest|largest|biggest|lowest|highest|cheapest|most expensive)\s+\w+/.test(q) ||
    /\bday of (?:the )?week\b|\bweekdays?\b/.test(q) ||
    /\bby (?:number|count) of\b/.test(q) ||
    /\b(percent(?:age)?|share|%)\s+of\s+(?:the\s+|total\s+)?(revenue|sales|amount|profit|quantity|units|spend|turnover)\b/.test(q) ||
    // a condition on a group total; "customers with more than 3 orders" stays with the
    // keyword branch, which counts distinct order ids
    /\bhow many\s+\w+\s+(?:have|has|with|had)\s+(?:a\s+|an\s+)?(?:total|average|avg|sum|combined|overall)\b/.test(q) ||
    /\b(more than|at least|exactly|only)\s+(once|twice|\d+\s+times)\b/.test(q) ||
    /\bcompare\b|\bvs\.?\b|\bversus\b/.test(q) ||
    /\b(combined|together)\b/.test(q) ||
    /\b[a-z]{0,4}\d{2,}[a-z\d-]*\b/.test(q.replace(/\$?\b\d[\d,]*(\.\d+)?\s*(k|m|million|thousand|%)?\b/g, ' ')) ||
    /\b(customer|client|order|invoice|product|sku|account)\s+(?:id\s+|#|no\.?\s*)?[a-z]{0,4}-?\d+\b/.test(q)
  );
}
const NEGATION_WORDS = /\b(not|excluding|exclude|except|other than|non-?\w+|without|isn't|aren't|wasn't|weren't|apart from|besides)\b/;

export function planChatQuery(prompt: string, rows: Record<string, any>[], profile: PlannerProfile): PlannerResult {
  const q = prompt.toLowerCase().replace(/[?!]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (rows.length === 0) return null;
  const triggered = needsPlanner(q);
  const decline = (reason: string): PlannerResult => ({ kind: 'decline', reason });

  // ---- columns -----------------------------------------------------------
  const measures = profile.measures.filter((m) => !/(^|_)(id|code|zip|year|phone)$/i.test(m));
  const dateCol =
    profile.dates.find((d) => /date/i.test(d) && rows.slice(0, 50).some((r) => parseSharedDate(r[d]))) ||
    profile.dates.find((d) => rows.slice(0, 50).some((r) => parseSharedDate(r[d]))) ||
    '';
  const primaryMeasure =
    pickColumn(['revenue', 'sales', 'amount', 'total_amount', 'total', 'value'], measures) || measures[0] || '';
  const measureIn = (text: string): string => {
    for (const m of measures) {
      if (new RegExp(`\\b${esc(m.toLowerCase())}\\b|\\b${esc(human(m.toLowerCase()))}\\b`).test(text)) return m;
    }
    for (const [re, cands] of MEASURE_WORDS) if (re.test(text)) { const c = pickColumn(cands, measures); if (c) return c; }
    return '';
  };
  const allDims = profile.colNames.filter((c) => !measures.includes(c) && c !== dateCol);
  const dimFor = (word: string): string => {
    for (const d of allDims) if (word === d.toLowerCase() || word === human(d.toLowerCase()) || word.replace(/s$/, '') === d.toLowerCase()) return d;
    for (const [re, cands] of ENTITY_DIM_WORDS) if (re.test(word)) { const c = pickColumn(cands, allDims); if (c) return c; }
    return '';
  };

  // ---- value index (what each dimension column contains) -------------------
  const valueIndex = new Map<string, Map<string, string>>(); // col -> lower -> label
  for (const c of allDims) {
    const m = new Map<string, string>();
    for (const r of rows) {
      const v = r[c];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s && !m.has(s.toLowerCase())) m.set(s.toLowerCase(), s);
    }
    valueIndex.set(c, m);
  }

  // ---- filters -----------------------------------------------------------
  const filters: Filter[] = [];
  const consumed: Array<[number, number]> = [];
  const isConsumed = (a: number, b: number) => consumed.some(([x, y]) => a < y && b > x);

  // Numeric threshold on rows -- unless it is a group condition (HAVING) or a frequency ("more than once").
  const havingMatch = q.match(/\bhow many\s+([a-z_ ]+?)\s+(?:have|has|had|with|where|whose)\b/);
  const freqMatch = q.match(/\b(?:more than|at least|exactly|only)\s+(once|twice|\d+\s+times)\b/);
  const thr = parseThreshold(q);
  let havingThreshold: ReturnType<typeof parseThreshold> = null;
  if (thr) {
    const entityWord = havingMatch?.[1]?.trim().split(' ').pop() || '';
    const groupEntity = entityWord && !ROW_ENTITY.test(entityWord) ? dimFor(entityWord) : '';
    if (groupEntity && /\b(total|sum|combined|average|avg|mean|overall)\b/.test(q.slice(0, thr.start))) {
      havingThreshold = thr;
    } else {
      // The measure the threshold is about: named nearest before it, else after it, else units / money.
      const before = q.slice(0, thr.start);
      let col = '';
      let best = -1;
      for (const m of measures) {
        for (const re of [new RegExp(`\\b${esc(m.toLowerCase())}\\b`, 'g'), new RegExp(`\\b${esc(human(m.toLowerCase()))}\\b`, 'g')]) {
          let mm: RegExpExecArray | null;
          while ((mm = re.exec(before))) if (mm.index > best) { best = mm.index; col = m; }
        }
      }
      if (!col) {
        for (const [re, cands] of MEASURE_WORDS) {
          const g = new RegExp(re.source, 'g');
          let mm: RegExpExecArray | null;
          while ((mm = g.exec(before))) { const c = pickColumn(cands, measures); if (c && mm.index > best) { best = mm.index; col = c; } }
        }
      }
      if (!col) col = measureIn(q.slice(thr.end, thr.end + 25));
      if (!col) col = primaryMeasure;
      if (!col) return decline('which number column the threshold applies to');
      filters.push({ kind: 'num', col, op: thr.op, value: thr.value, value2: thr.value2 });
    }
    consumed.push([thr.start, thr.end]);
  }

  // Date filters: "March 2024", "Dec 2024", "in March", "Q2", "Q2 2024", "in 2024".
  if (dateCol) {
    let m = new RegExp(`\\b${MONTH_RE}\\b\\.?,?\\s+((?:19|20)\\d{2})\\b`).exec(q);
    let month: number | undefined;
    let year: number | undefined;
    let quarter: number | undefined;
    if (m) {
      month = MONTHS.findIndex((n) => n.startsWith(m![1].slice(0, 3))) + 1;
      year = +m[2];
      consumed.push([m.index, m.index + m[0].length]);
    } else if ((m = new RegExp(`\\b(?:in|for|during|from|of)\\s+(?:the\\s+month\\s+of\\s+)?${MONTH_RE}\\b`).exec(q)) && !/^may$/.test(m[1]) ) {
      month = MONTHS.findIndex((n) => n.startsWith(m![1].slice(0, 3))) + 1;
      consumed.push([m.index, m.index + m[0].length]);
    }
    const qm = /\bq([1-4])(?:\s*[-']?\s*((?:19|20)\d{2}))?\b/.exec(q) || /\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter(?:\s+(?:of\s+)?((?:19|20)\d{2}))?\b/.exec(q);
    if (qm) {
      quarter = /^\d$/.test(qm[1]) ? +qm[1] : ORDINALS[qm[1]];
      if (qm[2]) year = +qm[2];
      consumed.push([qm.index, qm.index + qm[0].length]);
    }
    if (year === undefined) {
      const ym = /\b(?:in|for|during|of|from)\s+((?:19|20)\d{2})\b/.exec(q);
      if (ym && !isConsumed(ym.index, ym.index + ym[0].length)) {
        year = +ym[1];
        consumed.push([ym.index, ym.index + ym[0].length]);
      }
    }
    if (month || quarter || year) {
      const label = [month ? MONTHS[month - 1][0].toUpperCase() + MONTHS[month - 1].slice(1) : '', quarter ? `Q${quarter}` : '', year ? String(year) : ''].filter(Boolean).join(' ');
      filters.push({ kind: 'date', col: dateCol, year, month, quarter, label });
    }
  }

  // Categorical values named in the question (longest phrase first), with
  // NOT before them and IN when several share a column.
  const isCompare = /\bcompare\b|\bvs\.?\b|\bversus\b/.test(q);
  const catHits: Array<{ col: string; lower: string; label: string; start: number; end: number; negate: boolean }> = [];
  const lowCard = [...valueIndex.entries()].filter(([, m]) => m.size <= 30);
  const phrases: Array<{ col: string; lower: string; label: string }> = [];
  for (const [col, m] of lowCard) for (const [lower, label] of m) {
    if (lower.length < 2 || /^\d+$/.test(lower) || measures.some((x) => x.toLowerCase() === lower)) continue;
    phrases.push({ col, lower, label });
  }
  // Exact ids from high-cardinality columns ("customer C106", "order ORD-1001").
  for (const [col, m] of valueIndex.entries()) {
    if (m.size <= 30) continue;
    for (const tok of q.match(/\b[a-z]{0,6}-?\d+[a-z\d-]*\b/g) || []) {
      if (/^\d+$/.test(tok) && !/(^|_)(id|no|number|code)$/i.test(col)) continue;
      const label = m.get(tok);
      if (label) phrases.push({ col, lower: tok, label });
    }
  }
  phrases.sort((a, b) => b.lower.length - a.lower.length);
  for (const p of phrases) {
    const re = new RegExp(`(?<![\\w-])${esc(p.lower)}s?(?![\\w-])`, 'g');
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(q))) {
      const start = mm.index;
      const end = start + mm[0].length;
      if (isConsumed(start, end) || catHits.some((h) => start < h.end && end > h.start)) continue;
      const before = q.slice(Math.max(0, start - 30), start);
      // "non-cancelled" / "not completed" / "excluding cancelled"; a list
      // continues a negation: "excluding cancelled and pending".
      let negate = NEGATION_BEFORE.test(before);
      if (!negate) {
        const prev = catHits.filter((h) => h.col === p.col && h.end <= start).pop();
        if (prev && prev.negate && /^\s*(?:,|and|or|nor|,\s*and)\s*$/.test(q.slice(prev.end, start).replace(/\b(the|orders?)\b/g, ''))) negate = true;
      }
      catHits.push({ col: p.col, lower: p.lower, label: p.label, start, end, negate });
    }
  }
  const byCol = new Map<string, typeof catHits>();
  for (const h of catHits) {
    if (!byCol.has(h.col)) byCol.set(h.col, []);
    byCol.get(h.col)!.push(h);
    consumed.push([h.start, h.end]);
  }
  for (const [col, hits] of byCol) {
    const pos = hits.filter((h) => !h.negate);
    const neg = hits.filter((h) => h.negate);
    if (pos.length) filters.push({ kind: 'cat', col, values: [...new Set(pos.map((h) => h.lower))], labels: [...new Set(pos.map((h) => h.label))], negate: false });
    if (neg.length) filters.push({ kind: 'cat', col, values: [...new Set(neg.map((h) => h.lower))], labels: [...new Set(neg.map((h) => h.label))], negate: true });
  }
  // Values from two different columns ("completed orders in the north") are
  // two filters; the keyword branches kept only one.
  // (One category plus one threshold is already handled there.)
  if (!triggered && new Set(filters.filter((f) => f.kind !== 'num').map((f) => f.col)).size < 2) return null;

  // A negation word we could not attach to a value would flip the answer: decline.
  const negWord = q.match(/\b(not|excluding|exclude|except|other than|without|apart from|besides|isn't|aren't|wasn't|weren't)\b/);
  if (negWord && !catHits.some((h) => h.negate)) {
    const rest = q.slice((negWord.index ?? 0) + negWord[0].length);
    if (!/^\s*(?:only|just|sure)\b/.test(rest)) {
      return decline(`what "${negWord[0]} ${rest.trim().split(' ').slice(0, 2).join(' ')}" refers to -- I could not match it to a value in the data`);
    }
  }

  // ---- measure and aggregation --------------------------------------------
  let agg: Agg | null = null;
  if (/\b(standard deviation|std\.?\s*dev|stdev|std)\b/.test(q)) agg = 'std';
  else if (/\bvariance\b/.test(q)) agg = 'var';
  else if (/\bmedian\b/.test(q)) agg = 'median';
  else if (/\b(average|avg|mean)\b/.test(q)) agg = 'avg';
  else if (/\b(minimum|min|lowest|smallest|cheapest)\b/.test(q) && !/\b\d+\s+(lowest|smallest|cheapest)\b/.test(q) && !/\b(second|third|2nd|3rd)\s/.test(q)) agg = 'min';
  else if (/\b(maximum|max|largest|biggest|highest|most expensive)\b/.test(q) && !/\b\d+\s+(largest|biggest|highest)\b/.test(q) && !/\b(second|third|2nd|3rd)\s/.test(q) && !/\b(which|what)\s+\w+(\s+\w+)?\s+(has|had|have|got|brings?|made)\b/.test(q)) agg = 'max';
  else if (/\b(total|sum|how much|combined|revenue of|sales of)\b/.test(q)) agg = 'sum';
  else if (/\b(how many|count|number of|no\. of)\b/.test(q)) agg = 'count';

  // The measure the question aggregates, ignoring the threshold's own measure phrase.
  const qNoThreshold = thr ? q.slice(0, thr.start) + ' '.repeat(thr.end - thr.start) + q.slice(thr.end) : q;
  let measure = measureIn(qNoThreshold);
  if (!measure && /\b(how much|spend|spent|worth|value)\b/.test(q)) measure = primaryMeasure;
  if (!agg) agg = measure ? 'sum' : 'count';
  if (agg === 'count' && measure && /\b(how many|count|number of)\s+(units?|items?|pieces?)\b/.test(q)) agg = 'sum';
  if (agg !== 'count' && !measure) {
    if (/\b(order|sale|transaction|purchase)s?\b/.test(q) && primaryMeasure) measure = primaryMeasure;
    else return decline(`which number column to take the ${AGG_LABEL[agg].toLowerCase()} of`);
  }

  // ---- apply row filters ----------------------------------------------------
  const describe = (f: Filter) =>
    f.kind === 'cat'
      ? `**${human(f.col)}** ${f.negate ? 'is not' : 'is'} ${f.labels.map((l) => `**${l}**`).join(f.negate ? ' or ' : ' or ')}`
      : f.kind === 'num'
      ? `**${human(f.col)}** ${OP_TEXT[f.op]} ${fmt(f.value)}${f.op === 'between' ? ` and ${fmt(f.value2!)}` : ''}`
      : `**${human(f.col)}** in **${f.label}**`;
  const sqlOf = (f: Filter) =>
    f.kind === 'cat'
      ? `LOWER(TRIM(${f.col})) ${f.negate ? 'NOT IN' : 'IN'} (${f.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})`
      : f.kind === 'num'
      ? f.op === 'between'
        ? `${f.col} BETWEEN ${f.value} AND ${f.value2}`
        : `${f.col} ${{ gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' }[f.op]} ${f.value}`
      : [f.year ? `YEAR(${f.col}) = ${f.year}` : '', f.month ? `MONTH(${f.col}) = ${f.month}` : '', f.quarter ? `QUARTER(${f.col}) = ${f.quarter}` : ''].filter(Boolean).join(' AND ');

  const compareFilter = isCompare ? (filters.find((f) => f.kind === 'cat' && !f.negate && f.values.length >= 2) as CatFilter | undefined) : undefined;
  const rowPass = (r: Record<string, any>) =>
    filters.every((f) => {
      const v = r[f.col];
      if (f.kind === 'cat') {
        const s = v === null || v === undefined ? '' : String(v).trim().toLowerCase();
        const hit = f.values.includes(s);
        return f.negate ? !hit : hit;
      }
      if (f.kind === 'num') {
        const n = numOf(v);
        return n !== null && cmp(f.op, n, f.value, f.value2);
      }
      const d = parseSharedDate(v);
      if (!d) return false;
      if (f.year && d.getUTCFullYear() !== f.year) return false;
      if (f.month && d.getUTCMonth() + 1 !== f.month) return false;
      if (f.quarter && Math.floor(d.getUTCMonth() / 3) + 1 !== f.quarter) return false;
      return true;
    });
  const matched = rows.filter(rowPass);
  const where = filters.length ? `WHERE ${filters.map(sqlOf).join(' AND ')}` : '';
  const whereText = filters.length ? ` where ${filters.map(describe).join(' and ')}` : '';
  const valuesOf = (rs: Record<string, any>[]) => (agg === 'count' ? rs.map(() => 1) : rs.map((r) => numOf(r[measure])).filter((n): n is number => n !== null));
  const aggOf = (rs: Record<string, any>[]) => (agg === 'count' ? rs.length : aggregate(valuesOf(rs), agg!));
  const outName = agg === 'count' ? 'Count' : `${agg === 'avg' ? 'average' : agg === 'std' ? 'std_dev' : agg === 'var' ? 'variance' : agg}_${measure}`;
  const what = agg === 'count' ? 'rows' : `${AGG_LABEL[agg].toLowerCase()} ${human(measure)}`;
  const answer = (a: Omit<PlannerAnswer, 'filters'> & { filters?: any[] }): PlannerResult => ({
    kind: 'answer',
    answer: { ...a, filters: filters.map((f) => ({ ...f })) },
  });

  // ---- shapes ----------------------------------------------------------------
  const groupOf = (keyFn: (r: Record<string, any>) => string | null, rs: Record<string, any>[]) => {
    const g = new Map<string, Record<string, any>[]>();
    for (const r of rs) {
      const k = keyFn(r);
      if (k === null) continue;
      let b = g.get(k);
      if (!b) g.set(k, (b = []));
      b.push(r);
    }
    return g;
  };
  const labelOfCol = (col: string) => (r: Record<string, any>) => {
    const v = r[col];
    if (v === null || v === undefined || String(v).trim() === '') return '(blank)';
    return valueIndex.get(col)?.get(String(v).trim().toLowerCase()) ?? String(v).trim();
  };

  // Growth: month over month / year over year.
  if (/\b(month over month|month-over-month|mom|year over year|year-over-year|yoy|growth|grew|growing)\b/.test(q)) {
    if (!dateCol) return decline('growth over time -- this dataset has no date column');
    const yearly = /\b(year over year|year-over-year|yoy|yearly|annual)\b/.test(q);
    const keyFn = (r: Record<string, any>) => {
      const d = parseSharedDate(r[dateCol]);
      return d ? (yearly ? String(d.getUTCFullYear()) : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`) : null;
    };
    const g = groupOf(keyFn, matched);
    const keys = [...g.keys()].sort();
    const period = yearly ? 'year' : 'month';
    let prev: number | null = null;
    const out = keys.map((k) => {
      const val = aggOf(g.get(k)!) as number | null;
      const growth = prev === null || val === null || prev === 0 ? null : cleanFloat(Math.round(((val - prev) / Math.abs(prev)) * 10000) / 100);
      prev = val;
      return { [period]: k, [outName]: val, growth_pct: growth };
    });
    const last = out[out.length - 1];
    return answer({
      intent: 'growth',
      explanation: `${yearly ? 'Year-over-year' : 'Month-over-month'} change in ${what}${whereText}, ${out.length} ${period}s in date order${last && last.growth_pct !== null ? `; the latest ${period} (${last[period]}) changed **${last.growth_pct > 0 ? '+' : ''}${last.growth_pct}%**` : ''}.`,
      method: `${AGG_SQL[agg]}(${measure || '*'}) per ${period} of ${dateCol}; growth = (this ${period} - previous) / previous x 100. The first ${period} has no previous value; ${period}s with no rows are not shown, so growth compares consecutive ${period}s that have data.`,
      columns: [period, outName, 'growth_pct'],
      rows: out,
      chart: { type: 'line', x: period, y: 'growth_pct' },
      trace: `SELECT ${period}, v, ROUND((v - LAG(v) OVER (ORDER BY ${period})) * 100.0 / ABS(LAG(v) OVER (ORDER BY ${period})), 2) AS growth_pct FROM (SELECT DATE_TRUNC('${period}', ${dateCol}) AS ${period}, ${AGG_SQL[agg]}(${measure || '*'}) AS v FROM dataset ${where} GROUP BY 1) ORDER BY 1;`,
      groupBy: [period],
    });
  }

  // HAVING on a group frequency: "how many customers ordered more than once".
  if (freqMatch && /\bhow many\b/.test(q)) {
    const entityWord = (q.match(/\bhow many\s+([a-z_]+)/)?.[1] || '').trim();
    const entity = dimFor(entityWord);
    if (!entity) return decline(`which column "${entityWord}" refers to`);
    const n = freqMatch[1] === 'once' ? 1 : freqMatch[1] === 'twice' ? 2 : parseInt(freqMatch[1], 10);
    const op: NumOp = /^(more than)/.test(freqMatch[0]) ? 'gt' : /^at least/.test(freqMatch[0]) ? 'gte' : 'eq';
    const g = groupOf((r) => (r[entity] === null || r[entity] === undefined || String(r[entity]).trim() === '' ? null : String(r[entity]).trim().toLowerCase()), matched);
    const hits = [...g.entries()].filter(([, rs]) => cmp(op, rs.length, n));
    return answer({
      intent: 'having_count',
      explanation: `**${hits.length.toLocaleString('en-US')}** ${human(entity)} values appear in ${OP_TEXT[op]} ${n} row${n === 1 ? '' : 's'}${whereText} (out of ${g.size.toLocaleString('en-US')}).`,
      method: `Count rows per ${entity}, keep the ${human(entity)} values with COUNT ${OP_TEXT[op]} ${n}, then count them.`,
      columns: [`${entity}_count`],
      rows: [{ [`${entity}_count`]: hits.length }],
      chart: null,
      trace: `SELECT COUNT(*) FROM (SELECT ${entity} FROM dataset ${where} GROUP BY ${entity} HAVING COUNT(*) ${{ gt: '>', gte: '>=', eq: '=' }[op as 'gt']} ${n});`,
      groupBy: [entity],
    });
  }

  // HAVING on a group total: "how many regions have total revenue above 8.5 million".
  if (havingThreshold) {
    const entityWord = havingMatch![1].trim().split(' ').pop()!;
    const entity = dimFor(entityWord);
    const hAgg: Agg = /\b(average|avg|mean)\b/.test(q) ? 'avg' : 'sum';
    const hMeasure = measureIn(q.slice(0, havingThreshold.start)) || primaryMeasure;
    if (!entity || !hMeasure) return decline('which groups and which total the condition applies to');
    const g = groupOf(labelOfCol(entity), matched);
    const totals = [...g.entries()].map(([k, rs]) => ({ k, v: aggregate(rs.map((r) => numOf(r[hMeasure])).filter((n): n is number => n !== null), hAgg) }));
    const hits = totals.filter((t) => t.v !== null && cmp(havingThreshold!.op, t.v, havingThreshold!.value, havingThreshold!.value2));
    return answer({
      intent: 'having_total',
      explanation: `**${hits.length}** of ${totals.length} ${human(entity)} values have ${AGG_LABEL[hAgg].toLowerCase()} ${human(hMeasure)} ${OP_TEXT[havingThreshold.op]} ${fmt(havingThreshold.value)}${whereText}${hits.length ? `: ${hits.map((h) => `${h.k} (${fmt(h.v)})`).join(', ')}` : ''}.`,
      method: `${AGG_SQL[hAgg]}(${hMeasure}) per ${entity}, then count the groups meeting the condition.`,
      columns: [`${entity}_count`],
      rows: [{ [`${entity}_count`]: hits.length }],
      chart: null,
      trace: `SELECT COUNT(*) FROM (SELECT ${entity}, ${AGG_SQL[hAgg]}(${hMeasure}) AS v FROM dataset ${where} GROUP BY ${entity} HAVING v ${{ gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', between: 'BETWEEN' }[havingThreshold.op]} ${havingThreshold.value});`,
      groupBy: [entity],
    });
  }

  // Value share: "what percentage of revenue comes from the east region".
  const shareM = q.match(/\b(?:percent(?:age)?|share|%)\s+of\s+(?:the\s+|total\s+|all\s+)?(revenue|sales|amount|profit|quantity|units|spend|turnover|[a-z_]+)\b/);
  if (shareM && filters.length > 0) {
    const shareMeasure = measureIn(shareM[1]) || (ROW_ENTITY.test(shareM[1]) ? '' : primaryMeasure);
    if (shareMeasure) {
      const sumOf = (rs: Record<string, any>[]) => preciseSum(rs.map((r) => numOf(r[shareMeasure])).filter((n): n is number => n !== null));
      const part = sumOf(matched);
      const whole = sumOf(rows);
      const pct = whole === 0 ? null : Math.round((part / whole) * 10000) / 100;
      return answer({
        intent: 'value_share',
        explanation: `**${pct ?? 'n/a'}%** of total ${human(shareMeasure)} (${fmt(cleanFloat(part))} of ${fmt(cleanFloat(whole))}) comes from rows${whereText}.`,
        method: `SUM(${shareMeasure}) for the matching rows / SUM(${shareMeasure}) for all rows x 100 -- a share of ${human(shareMeasure)}, not of row count.`,
        columns: ['Percentage', `${shareMeasure}_part`, `${shareMeasure}_total`],
        rows: [{ Percentage: pct, [`${shareMeasure}_part`]: cleanFloat(part), [`${shareMeasure}_total`]: cleanFloat(whole) }],
        chart: null,
        trace: `SELECT ROUND(SUM(${shareMeasure}) FILTER (${where.replace(/^WHERE /, 'WHERE ')}) * 100.0 / SUM(${shareMeasure}), 2) AS pct FROM dataset;`,
        groupBy: [],
      });
    }
  }

  // Grouping: "compare A vs B", "by <dim>", "day of week", "top N <dims> by ...", "second highest <dim>".
  const nthM = q.match(/\b(second|third|fourth|fifth|2nd|3rd|4th|5th)\s+(highest|lowest|largest|smallest|biggest|most|least|top|best|worst)\b/);
  const topNByCount = q.match(/\b(?:top|bottom)\s+(\d+)\s+([a-z_]+?)\s+by\s+(?:the\s+)?(?:number|count)\s+of\b/);
  const topN = q.match(/\b(top|bottom)\s+(\d+)\s+([a-z_]+)\b/);
  const listN = q.match(/\b(\d+)\s+(smallest|largest|biggest|lowest|highest|cheapest|most expensive)\s+([a-z_]+)/);
  const dowAsked = /\bday of (?:the )?week\b|\bweekdays?\b/.test(q);
  const byM = q.match(/\b(?:by|per|for each|across)\s+([a-z_]+(?:\s+[a-z_]+)?)/);

  // Row listing: "list the 5 smallest orders by revenue".
  if (listN && ROW_ENTITY.test(listN[3])) {
    const n = Math.min(500, parseInt(listN[1], 10));
    const asc = /smallest|lowest|cheapest/.test(listN[2]);
    const by = measureIn(q.slice((listN.index ?? 0) + listN[0].length)) || measure || primaryMeasure;
    if (!by) return decline('which number column to rank the rows by');
    const ranked = matched
      .map((r) => ({ r, n: numOf(r[by]) }))
      .filter((x): x is { r: Record<string, any>; n: number } => x.n !== null)
      .sort((a, b) => (asc ? a.n - b.n : b.n - a.n))
      .slice(0, n)
      .map((x) => x.r);
    return answer({
      intent: 'row_ranking',
      explanation: `The ${ranked.length} ${asc ? 'smallest' : 'largest'} rows by **${human(by)}**${whereText}.`,
      method: `Rows${whereText} ordered by ${by} ${asc ? 'ascending' : 'descending'}, first ${n}; blanks and non-numbers excluded.`,
      columns: profile.colNames,
      rows: ranked,
      chart: null,
      trace: `SELECT * FROM dataset ${where} ORDER BY ${by} ${asc ? 'ASC' : 'DESC'} NULLS LAST LIMIT ${n};`,
      groupBy: [],
    });
  }

  let groupCol = '';
  let keyFn: ((r: Record<string, any>) => string | null) | null = null;
  let groupLabel = '';
  if (compareFilter) {
    groupCol = compareFilter.col;
    keyFn = labelOfCol(groupCol);
    groupLabel = groupCol;
  } else if (dowAsked) {
    if (!dateCol) return decline('day of week -- this dataset has no date column');
    groupLabel = 'day_of_week';
    keyFn = (r) => {
      const d = parseSharedDate(r[dateCol]);
      return d ? WEEKDAYS[d.getUTCDay()] : null;
    };
  } else {
    const word = topNByCount?.[2] || (nthM ? (q.slice((nthM.index ?? 0) + nthM[0].length).match(/^\s+(?:[a-z_]+\s+)?([a-z_]+)/)?.[1] ?? '') : '') || topN?.[3] || byM?.[1] || '';
    let cands = word ? [word, ...word.split(' ')] : [];
    if (nthM && !cands.some((w) => dimFor(w))) cands = q.split(' ');
    for (const w of cands) {
      const d = dimFor(w);
      if (d) {
        groupCol = d;
        break;
      }
    }
    if (groupCol) {
      keyFn = labelOfCol(groupCol);
      groupLabel = groupCol;
    }
  }
  if (topNByCount && !groupCol) return decline(`which column "${topNByCount[2]}" refers to`);
  if (nthM && !keyFn) return decline('what to rank -- name the column, e.g. "second highest revenue region"');

  if (keyFn) {
    let gAgg = agg;
    if (topNByCount) gAgg = 'count';
    // "which day has the highest revenue" ranks totals; only an explicit
    // max/min ("largest single order per day") ranks by the extreme value.
    else if ((gAgg === 'max' || gAgg === 'min') && !/\b(max|maximum|min|minimum|single)\b/.test(q)) gAgg = measure ? 'sum' : 'count';
    const gName = gAgg === 'count' ? 'Count' : `${gAgg === 'avg' ? 'average' : gAgg}_${measure}`;
    const g = groupOf(keyFn, matched);
    let out = [...g.entries()].map(([k, rs]) => ({
      [groupLabel]: k,
      [gName]: gAgg === 'count' ? rs.length : aggregate(rs.map((r) => numOf(r[measure])).filter((n): n is number => n !== null), gAgg),
    }));
    const lowFirst = /\b(lowest|smallest|least|bottom|worst|fewest)\b/.test(q);
    const ranked = !!(nthM || topN || topNByCount || dowAsked || /\b(which|what)\b.*\b(highest|most|best|top|largest|lowest|least|smallest)\b/.test(q));
    if (ranked) out.sort((a, b) => ((lowFirst ? 1 : -1) * (((a[gName] as number) ?? -Infinity) - ((b[gName] as number) ?? -Infinity))));
    else if (compareFilter) out.sort((a, b) => compareFilter.labels.indexOf(String(a[groupLabel])) - compareFilter.labels.indexOf(String(b[groupLabel])));
    const metricText = gAgg === 'count' ? 'row count' : `${AGG_LABEL[gAgg].toLowerCase()} ${human(measure)}`;
    if (nthM) {
      const k = ORDINALS[nthM[1]];
      const row = out[k - 1];
      if (!row) return decline(`a ${nthM[1]} place -- there are only ${out.length} ${human(groupLabel)} values`);
      return answer({
        intent: 'nth_ranking',
        explanation: `**${row[groupLabel]}** is ${nthM[1]} ${lowFirst ? 'lowest' : 'highest'} by ${metricText}: **${fmt(row[gName] as number)}**${whereText} (1st: ${out[0][groupLabel]}, ${fmt(out[0][gName] as number)}).`,
        method: `${AGG_SQL[gAgg]}(${gAgg === 'count' ? '*' : measure}) per ${groupLabel}, ranked ${lowFirst ? 'ascending' : 'descending'}; row ${k}.`,
        columns: [groupLabel, gName],
        rows: [row, ...out.filter((r) => r !== row)],
        chart: { type: 'bar', x: groupLabel, y: gName },
        trace: `SELECT ${groupLabel}, ${AGG_SQL[gAgg]}(${gAgg === 'count' ? '*' : measure}) AS v FROM dataset ${where} GROUP BY 1 ORDER BY v ${lowFirst ? 'ASC' : 'DESC'} LIMIT 1 OFFSET ${k - 1};`,
        groupBy: [groupLabel],
      });
    }
    const limitN = topNByCount ? +topNByCount[1] : topN ? +topN[2] : 0;
    if (limitN) out = out.slice(0, limitN);
    if (dowAsked && /\b(which|what)\b/.test(q)) {
      const top = out[0];
      return answer({
        intent: 'day_of_week',
        explanation: `**${top?.[groupLabel]}** has the ${lowFirst ? 'lowest' : 'highest'} ${metricText}: **${fmt(top?.[gName] as number)}**${whereText}.`,
        method: `${AGG_SQL[gAgg]}(${gAgg === 'count' ? '*' : measure}) per day of the week of ${dateCol}.`,
        columns: [groupLabel, gName],
        rows: out,
        chart: { type: 'bar', x: groupLabel, y: gName },
        trace: `SELECT DAYNAME(${dateCol}) AS day_of_week, ${AGG_SQL[gAgg]}(${gAgg === 'count' ? '*' : measure}) AS v FROM dataset ${where} GROUP BY 1 ORDER BY v ${lowFirst ? 'ASC' : 'DESC'};`,
        groupBy: [groupLabel],
      });
    }
    return answer({
      intent: compareFilter ? 'compare' : 'group_by',
      explanation: compareFilter
        ? `${AGG_LABEL[gAgg]} ${gAgg === 'count' ? 'rows' : human(measure)}: ${out.map((r) => `**${r[groupLabel]}** ${fmt(r[gName] as number)}`).join(' vs ')}${filters.length > 1 ? whereText.replace(describe(compareFilter), '').replace(/ and $/, '') : ''}.`
        : `${metricText[0].toUpperCase() + metricText.slice(1)} by **${human(groupLabel)}**${whereText} (${out.length} ${limitN ? 'shown' : 'groups'}).`,
      method: `${AGG_SQL[gAgg]}(${gAgg === 'count' ? '*' : measure}) per ${groupLabel}${whereText.replace(/\*\*/g, '')}.`,
      columns: [groupLabel, gName],
      rows: out,
      chart: { type: 'bar', x: groupLabel, y: gName },
      trace: `SELECT ${groupLabel}, ${AGG_SQL[gAgg]}(${gAgg === 'count' ? '*' : measure}) AS v FROM dataset ${where} GROUP BY 1${ranked ? ` ORDER BY v ${lowFirst ? 'ASC' : 'DESC'}` : ''}${limitN ? ` LIMIT ${limitN}` : ''};`,
      groupBy: [groupLabel],
    });
  }

  // Row listing: "show me orders from December 2024".
  if (/^(show|list|give|display|find|get)\b/.test(q) && !/\b(total|sum|average|avg|how many|count)\b/.test(q)) {
    return answer({
      intent: 'filter_rows',
      explanation: `Found **${matched.length.toLocaleString('en-US')}** rows${whereText} (showing ${Math.min(matched.length, 500).toLocaleString('en-US')}).`,
      method: `Rows${whereText.replace(/\*\*/g, '')}.`,
      columns: profile.colNames,
      rows: matched.slice(0, 500),
      chart: null,
      trace: `SELECT * FROM dataset ${where} LIMIT 500;`,
      groupBy: [],
    });
  }

  // Scalar.
  if (filters.length === 0 && !['std', 'var', 'median'].includes(agg)) return null;
  const value = aggOf(matched);
  return answer({
    intent: 'scalar',
    explanation:
      agg === 'count'
        ? `There are **${fmt(value as number)}** rows${whereText} (out of ${rows.length.toLocaleString('en-US')} total).`
        : `${AGG_LABEL[agg]}${['std', 'var', 'median'].includes(agg) ? ' of' : ''} ${human(measure)}${whereText} (${matched.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} records) is **${fmt(value as number)}**.`,
    method: `${AGG_SQL[agg]}(${agg === 'count' ? '*' : measure})${whereText.replace(/\*\*/g, '')}${agg === 'std' || agg === 'var' ? ' (sample, n - 1, like Excel STDEV.S / VAR.S)' : ''}.`,
    columns: [outName],
    rows: [{ [outName]: value }],
    chart: null,
    trace: `SELECT ${AGG_SQL[agg]}(${agg === 'count' ? '*' : measure}) AS ${outName} FROM dataset ${where};`,
    groupBy: [],
  });
}
