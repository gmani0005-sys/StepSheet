/**
 * KPI insights -- period-over-period change, rate KPIs, the data story and
 * "how is this calculated" text for AI-generated dashboards.
 *
 * Every number here comes from the same pure helpers as the charts
 * (engine/dashboardData), computed over the rows currently in view, so slicers
 * and cross-filters move the changes and the story together with the cards.
 * Nothing is produced by a language model: the AI picks WHICH metrics to show,
 * this file computes WHAT they are.
 */
import {
  DashRow,
  dashGet,
  dashMetricOrNull,
  dashDateParts,
  periodKey,
  makeLabeler,
} from './dashboardData';

export type KpiKind = 'aggregate' | 'ratio';
export type KpiCompare = 'previous_period' | 'none';
export type KpiDirection = 'up' | 'down' | 'neutral';
export type KpiFormat = 'number' | 'currency' | 'percent';

/** The KPI fields this engine reads. All optional except column/aggFunc, so old cards still work. */
export interface KpiInsightSpec {
  id?: string;
  title?: string;
  column: string;
  aggFunc: string;
  kind?: KpiKind;
  numeratorCol?: string;
  numeratorAgg?: string;
  denominatorCol?: string;
  denominatorAgg?: string;
  dateCol?: string;
  compare?: KpiCompare;
  goodDirection?: KpiDirection;
  format?: KpiFormat;
  currencySymbol?: string;
  definition?: string;
  /** A bad move at least this large (relative %, default 10) marks the card "Needs attention". */
  alertPct?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AGG_LABEL: Record<string, string> = {
  sum: 'Sum',
  avg: 'Average',
  mean: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  count: 'Count of rows',
  distinct_count: 'Distinct count',
};

export const humanize = (name: string): string =>
  String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');

/** "2025-12" -> "Dec 2025". Other labels pass through. */
export function periodLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '');
  return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : key;
}

// ---------------------------------------------------------------------------
// Planning helpers (shared by the in-browser planner and the prompt bar)
// ---------------------------------------------------------------------------

const LOWER_IS_BETTER =
  /cost|discount|churn|fail|error|return|refund|cancel|complaint|defect|delay|latency|expense|loss|bounce|overdue|backlog|downtime|days_to|lead_time|wait/i;

/** Whether a rise in this metric is good news. */
export function inferGoodDirection(column: string, aggFunc?: string): KpiDirection {
  const f = String(aggFunc || '').toLowerCase();
  if (f === 'min' || f === 'max') return 'neutral';
  return LOWER_IS_BETTER.test(column || '') ? 'down' : 'up';
}

/** A currency symbol, only when the data itself carries one (never guessed from a column name). */
export function detectCurrencySymbol(rows: DashRow[], column: string): string | undefined {
  const counts: Record<string, number> = {};
  let seen = 0;
  for (const r of rows.slice(0, 200)) {
    const v = dashGet(r, column);
    if (v === null || v === undefined || typeof v === 'number') continue;
    const m = String(v).match(/[₹$€£¥]/);
    seen++;
    if (m) counts[m[0]] = (counts[m[0]] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && seen > 0 && best[1] / seen >= 0.5 ? best[0] : undefined;
}

/** The first column whose values parse as dates in at least half of a sample. */
export function findDateColumn(rows: DashRow[], candidates: string[]): string | undefined {
  const sample = rows.slice(0, 200);
  if (sample.length === 0) return undefined;
  for (const c of candidates) {
    let ok = 0;
    for (const r of sample) if (dashDateParts(dashGet(r, c))) ok++;
    if (ok / sample.length >= 0.5) return c;
  }
  return undefined;
}

interface RatioPattern {
  num: RegExp;
  den: RegExp;
  title: (n: string, d: string) => string;
  direction: KpiDirection;
}

const RATIO_PATTERNS: RatioPattern[] = [
  { num: /convert|conversion|won|paid|success|completed|closed_won/i, den: /trial|lead|started|visit|session|opportunit|attempt|signup|run|total/i, title: (n, d) => `${humanize(n)} Rate (÷ ${humanize(d)})`, direction: 'up' },
  { num: /fail|error|reject|return|refund|cancel|churn/i, den: /run|order|attempt|request|subscriber|total|sold|shipped|quantity|qty/i, title: (n, d) => `${humanize(n)} Rate (÷ ${humanize(d)})`, direction: 'down' },
  { num: /discount/i, den: /amount|revenue|sales|gross|price|total/i, title: () => 'Discount Rate', direction: 'down' },
  { num: /profit|margin/i, den: /revenue|sales|amount|gross|total/i, title: () => 'Profit Margin', direction: 'up' },
  { num: /cost|expense|spend/i, den: /revenue|sales|amount|income/i, title: (n) => `${humanize(n)} to Revenue`, direction: 'down' },
];

/** A meaningful rate between two numeric columns, if their names suggest one. */
export function suggestRatioKpi(measures: string[]): Partial<KpiInsightSpec> & { title: string } | null {
  for (const p of RATIO_PATTERNS) {
    const num = measures.find((m) => p.num.test(m));
    if (!num) continue;
    const den = measures.find((m) => m !== num && p.den.test(m) && !p.num.test(m));
    if (!den) continue;
    return {
      title: p.title(num, den),
      kind: 'ratio',
      column: num,
      aggFunc: 'sum',
      numeratorCol: num,
      numeratorAgg: 'sum',
      denominatorCol: den,
      denominatorAgg: 'sum',
      format: 'percent',
      goodDirection: p.direction,
    };
  }
  return null;
}

/** Plain-words definition of a KPI. */
export function describeKpi(k: KpiInsightSpec): string {
  const dir =
    k.goodDirection === 'down' ? ' Lower is better.' : k.goodDirection === 'up' ? ' Higher is better.' : '';
  if (k.kind === 'ratio' && k.numeratorCol && k.denominatorCol) {
    return `${AGG_LABEL[k.numeratorAgg || 'sum'] || 'Sum'} of ${k.numeratorCol} ÷ ${(AGG_LABEL[k.denominatorAgg || 'sum'] || 'Sum').toLowerCase()} of ${k.denominatorCol}, for the rows in view.${dir}`;
  }
  const f = String(k.aggFunc || 'sum').toLowerCase();
  if (f === 'count') return `Number of rows in view.${dir}`;
  if (f === 'distinct_count') return `Number of different ${k.column} values in view.${dir}`;
  return `${AGG_LABEL[f] || humanize(f)} of ${k.column} across the rows in view.${dir}`;
}

/**
 * Fill in the insight fields an AI plan left out, from the data in hand.
 * Fields the plan (or the user) already set are kept.
 */
export function enrichKpiSpec<T extends KpiInsightSpec>(
  k: T,
  ctx: { rows?: DashRow[]; dateColumns?: string[]; allColumns?: string[] }
): T {
  const rows = ctx.rows || [];
  const out: T = { ...k };
  if (!out.kind) out.kind = out.numeratorCol && out.denominatorCol ? 'ratio' : 'aggregate';
  if (!out.goodDirection) {
    out.goodDirection = out.kind === 'ratio' ? inferGoodDirection(out.numeratorCol || out.column) : inferGoodDirection(out.column, out.aggFunc);
  }
  if (!out.format) {
    if (out.kind === 'ratio') out.format = 'percent';
    else {
      const f = String(out.aggFunc || '').toLowerCase();
      const sym = f === 'count' || f === 'distinct_count' ? undefined : detectCurrencySymbol(rows, out.column);
      out.format = sym ? 'currency' : 'number';
      if (sym && !out.currencySymbol) out.currencySymbol = sym;
    }
  }
  if (!out.dateCol) {
    const cands = ctx.dateColumns && ctx.dateColumns.length ? ctx.dateColumns : (ctx.allColumns || []).filter((c) => /date|time|month|period|day/i.test(c));
    const dc = findDateColumn(rows, cands);
    if (dc) out.dateCol = dc;
  }
  if (!out.compare) out.compare = out.dateCol ? 'previous_period' : 'none';
  if (!out.definition) out.definition = describeKpi(out);
  return out;
}

// ---------------------------------------------------------------------------
// Values, periods and change
// ---------------------------------------------------------------------------

/** A KPI's value over some rows (rates included), or null when there is nothing to compute. */
export function kpiValue(rows: DashRow[], k: KpiInsightSpec): number | null {
  if (k.kind === 'ratio' && k.numeratorCol && k.denominatorCol) {
    const n = dashMetricOrNull(rows, k.numeratorCol, k.numeratorAgg || 'sum');
    const d = dashMetricOrNull(rows, k.denominatorCol, k.denominatorAgg || 'sum');
    if (n === null || d === null || d === 0) return null;
    return n / d;
  }
  return dashMetricOrNull(rows, k.column, k.aggFunc);
}

export function formatKpiValue(v: number | null, k: Pick<KpiInsightSpec, 'format' | 'currencySymbol'>, fmt: (n: number) => string): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (k.format === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (k.format === 'currency' && k.currencySymbol) return `${v < 0 ? '-' : ''}${k.currencySymbol}${fmt(Math.abs(v))}`;
  return fmt(v);
}

export interface PeriodSplit {
  latestKey: string;
  previousKey: string;
  latestRows: DashRow[];
  previousRows: DashRow[];
  /** Months with data, oldest first. */
  keys: string[];
}

/** Rows of the two latest calendar months (UTC) that have data. */
export function splitLatestPeriods(rows: DashRow[], dateCol: string): PeriodSplit | null {
  const groups = new Map<string, DashRow[]>();
  const memo = new Map<any, string | null>();
  for (const r of rows) {
    const raw = dashGet(r, dateCol);
    let key = memo.get(raw);
    if (key === undefined) {
      const p = dashDateParts(raw);
      key = p ? periodKey(p, 'month') : null;
      if (memo.size < 200_000) memo.set(raw, key);
    }
    if (key === null) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(r);
  }
  const keys = Array.from(groups.keys()).sort();
  if (keys.length < 2) return null;
  const latestKey = keys[keys.length - 1];
  const previousKey = keys[keys.length - 2];
  return { latestKey, previousKey, latestRows: groups.get(latestKey)!, previousRows: groups.get(previousKey)!, keys };
}

export type Sentiment = 'good' | 'bad' | 'neutral';

export interface KpiTrend {
  current: number | null;
  previous: number | null;
  /** Relative change (0.12 = +12%), null when the previous value is 0 or missing. */
  deltaRel: number | null;
  /** current - previous, in the KPI's own units (a rate's change in points is deltaAbs * 100). */
  deltaAbs: number | null;
  latestLabel: string;
  previousLabel: string;
  latestCount: number;
  previousCount: number;
  /** The latest month has under half the rows of the one before: probably still filling up. */
  partial: boolean;
  sentiment: Sentiment;
  alert: boolean;
  /** Short badge text: "+12.0%" or "+1.3 pts". */
  deltaText: string;
}

function sentimentOf(delta: number | null, rel: number | null, dir: KpiDirection | undefined): Sentiment {
  if (delta === null || dir === 'neutral') return 'neutral';
  if (rel !== null && Math.abs(rel) < 0.005) return 'neutral';
  if (delta === 0) return 'neutral';
  const up = delta > 0;
  return (dir === 'down' ? !up : up) ? 'good' : 'bad';
}

/** Latest month vs the month before, for a KPI that asks for a comparison. */
export function kpiTrend(rows: DashRow[], k: KpiInsightSpec): KpiTrend | null {
  if (k.compare !== 'previous_period' || !k.dateCol) return null;
  const split = splitLatestPeriods(rows, k.dateCol);
  if (!split) return null;
  const current = kpiValue(split.latestRows, k);
  const previous = kpiValue(split.previousRows, k);
  const deltaAbs = current !== null && previous !== null ? current - previous : null;
  const deltaRel = deltaAbs !== null && previous !== null && previous !== 0 ? deltaAbs / Math.abs(previous) : null;
  const sentiment = sentimentOf(deltaAbs, deltaRel, k.goodDirection);
  const alertAt = (k.alertPct ?? 10) / 100;
  const alert = sentiment === 'bad' && deltaRel !== null && Math.abs(deltaRel) >= alertAt;
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±');
  let deltaText = '';
  if (k.format === 'percent' && deltaAbs !== null) deltaText = `${sign(deltaAbs)}${Math.abs(deltaAbs * 100).toFixed(1)} pts`;
  else if (deltaRel !== null) deltaText = `${sign(deltaRel)}${Math.abs(deltaRel * 100).toFixed(1)}%`;
  return {
    current,
    previous,
    deltaRel,
    deltaAbs,
    latestLabel: periodLabel(split.latestKey),
    previousLabel: periodLabel(split.previousKey),
    latestCount: split.latestRows.length,
    previousCount: split.previousRows.length,
    partial: split.latestRows.length < split.previousRows.length * 0.5,
    sentiment,
    alert,
    deltaText,
  };
}

/** "How is this number calculated" lines for a KPI card. */
export function kpiLineage(rows: DashRow[], k: KpiInsightSpec, fmt: (n: number) => string): string[] {
  const lines: string[] = [];
  lines.push(k.definition || describeKpi(k));
  lines.push(`Rows used: ${rows.length.toLocaleString('en-US')} (after the filters on this page).`);
  const t = kpiTrend(rows, k);
  if (t) {
    lines.push(
      `Change compares ${t.latestLabel} (${formatKpiValue(t.current, k, fmt)}, ${t.latestCount.toLocaleString('en-US')} rows) with ${t.previousLabel} (${formatKpiValue(t.previous, k, fmt)}, ${t.previousCount.toLocaleString('en-US')} rows); months are taken from ${k.dateCol} in UTC.`
    );
    if (t.partial) lines.push(`${t.latestLabel} has far fewer rows than ${t.previousLabel} and may not be complete yet.`);
  } else if (k.compare === 'previous_period' && k.dateCol) {
    lines.push(`No change shown: the rows in view cover fewer than two months of ${k.dateCol}.`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Data story
// ---------------------------------------------------------------------------

export interface StoryLine {
  id: string;
  text: string;
  tone: Sentiment;
}

interface Mover {
  category: string;
  previous: number;
  current: number;
  rel: number;
}

function movers(split: PeriodSplit, k: KpiInsightSpec, dim: string): Mover[] {
  const label = makeLabeler();
  const group = (rs: DashRow[]) => {
    const m = new Map<string, DashRow[]>();
    for (const r of rs) {
      const c = label(dashGet(r, dim));
      let g = m.get(c);
      if (!g) m.set(c, (g = []));
      g.push(r);
    }
    return m;
  };
  const prev = group(split.previousRows);
  const cur = group(split.latestRows);
  const out: Mover[] = [];
  for (const [cat, prevRows] of prev) {
    if (cat === '(Blank)' || prevRows.length < 3) continue;
    const p = kpiValue(prevRows, k);
    const c = kpiValue(cur.get(cat) || [], k) ?? 0;
    if (p === null || p <= 0) continue;
    out.push({ category: cat, previous: p, current: c, rel: (c - p) / p });
  }
  return out;
}

/**
 * A few sentences saying what changed, computed from the rows in view.
 * The headline KPI is the first one that compares periods; movers are looked
 * for in the given dimensions (the dashboard's slicers are a good choice).
 */
export function buildDataStory(
  rows: DashRow[],
  kpis: KpiInsightSpec[],
  dimensions: string[],
  fmt: (n: number) => string
): StoryLine[] {
  const story: StoryLine[] = [];
  const trended = kpis
    .map((k) => ({ k, t: kpiTrend(rows, k) }))
    .filter((x): x is { k: KpiInsightSpec; t: KpiTrend } => !!x.t && x.t.current !== null);
  if (trended.length === 0) return story;

  // 1. Headline: the first KPI that compares periods.
  const head = trended[0];
  const name = head.k.title || humanize(head.k.column);
  let change = '';
  if (head.t.deltaAbs === 0) change = `, unchanged from ${head.t.previousLabel}`;
  else if (head.t.deltaAbs !== null && head.t.deltaText) {
    change = `, ${head.t.deltaAbs > 0 ? 'up' : 'down'} ${head.t.deltaText.replace(/^[+−±]/, '')} on ${head.t.previousLabel}`;
  }
  story.push({
    id: 'headline',
    text: `In ${head.t.latestLabel}, ${name} was ${formatKpiValue(head.t.current, head.k, fmt)}${change}${head.t.partial ? ' (this month may still be filling up)' : ''}.`,
    tone: head.t.sentiment,
  });

  // 2. What moved it: biggest gain and biggest drop by category, for the headline KPI.
  const split = splitLatestPeriods(rows, head.k.dateCol!);
  if (split && !head.t.partial) {
    let worst: (Mover & { dim: string }) | null = null;
    let best: (Mover & { dim: string }) | null = null;
    for (const dim of dimensions) {
      if (!dim || dim === head.k.dateCol) continue;
      const ms = movers(split, head.k, dim);
      if (ms.length < 2 || ms.length > 25) continue;
      for (const m of ms) {
        const goodMove = head.k.goodDirection === 'down' ? m.rel < 0 : m.rel > 0;
        if (goodMove && (!best || Math.abs(m.rel) > Math.abs(best.rel))) best = { ...m, dim };
        if (!goodMove && m.rel !== 0 && (!worst || Math.abs(m.rel) > Math.abs(worst.rel))) worst = { ...m, dim };
      }
    }
    const pct = (r: number) => `${Math.abs(r * 100).toFixed(1)}%`;
    const val = (v: number) => formatKpiValue(v, head.k, fmt);
    if (worst && Math.abs(worst.rel) >= 0.05) {
      story.push({
        id: 'attention',
        text: `Needs attention: ${worst.category} (${humanize(worst.dim)}) ${worst.rel < 0 ? 'fell' : 'rose'} ${pct(worst.rel)}, from ${val(worst.previous)} to ${val(worst.current)}.`,
        tone: 'bad',
      });
    }
    if (best && Math.abs(best.rel) >= 0.05) {
      story.push({
        id: 'bright-spot',
        text: `Bright spot: ${best.category} (${humanize(best.dim)}) ${best.rel > 0 ? 'grew' : 'dropped'} ${pct(best.rel)}, from ${val(best.previous)} to ${val(best.current)}.`,
        tone: 'good',
      });
    }
  }

  // 3. Other KPIs that moved the wrong way enough to flag.
  for (const { k, t } of trended.slice(1)) {
    if (!t.alert) continue;
    story.push({
      id: `alert-${k.id || k.column}`,
      text: `${k.title || humanize(k.column)} worsened: ${formatKpiValue(t.previous, k, fmt)} → ${formatKpiValue(t.current, k, fmt)} (${t.deltaText}) in ${t.latestLabel}.`,
      tone: 'bad',
    });
  }
  return story;
}
