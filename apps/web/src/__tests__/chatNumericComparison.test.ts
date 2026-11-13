import { describe, it, expect, beforeAll } from 'vitest';
import { localEngine, parseNumericComparison } from '../api/localEngine';

// Regression coverage for numeric-comparison questions in Chat with Data
// ("how many orders are over $500?"). These previously had no filter parsing
// at all and fell through to the generic default-ranking fallback, which
// answered every one of them with an unrelated "top 10 order_id by amount"
// table.

describe('parseNumericComparison', () => {
  it.each([
    ['how many orders are over $500?', { op: 'gt', value: 500, isCurrency: true }],
    ['orders above 1,250.50', { op: 'gt', value: 1250.5, isCurrency: false }],
    ['orders over 500.', { op: 'gt', value: 500, isCurrency: false }],
    ['amount greater than or equal to 10', { op: 'gte', value: 10 }],
    ['at least 3 orders', { op: 'gte', value: 3, wordAfter: 'orders' }],
    ['no more than 7 units', { op: 'lte', value: 7, wordAfter: 'units' }],
    ['price under 20', { op: 'lt', value: 20 }],
    ['fewer than 2 orders', { op: 'lt', value: 2, wordAfter: 'orders' }],
    ['exceeding $1.5k', { op: 'gt', value: 1500, isCurrency: true }],
    ['over 2 million', { op: 'gt', value: 2_000_000 }],
    ['spend above 300 dollars', { op: 'gt', value: 300, isCurrency: true, wordAfter: 'dollars' }],
    ['amount >= 1000', { op: 'gte', value: 1000 }],
    ['amount<50', { op: 'lt', value: 50 }],
    ['exactly 4 items', { op: 'eq', value: 4, wordAfter: 'items' }],
    ['between 100 and 250', { op: 'between', value: 100, value2: 250 }],
    ['between $2k to $1k', { op: 'between', value: 1000, value2: 2000, isCurrency: true }],
    ['5 units or more', { op: 'gte', value: 5, wordAfter: 'units' }],
    ['$500 and above', { op: 'gte', value: 500, isCurrency: true }],
    ['10 or fewer', { op: 'lte', value: 10 }],
    ['10+ units', { op: 'gte', value: 10, wordAfter: 'units' }],
  ])('%s', (text, expected) => {
    expect(parseNumericComparison(text)).toMatchObject(expected);
  });

  it.each([
    'revenue over time',
    'orders above average',
    'top 10 products by sales',
    'sales by region',
    'turnover 500',
    'how many orders are there?',
  ])('finds no comparison in "%s"', (text) => {
    expect(parseNumericComparison(text)).toBeNull();
  });
});

describe('Chat with Data: numeric-comparison questions (regression)', () => {
  // Hand-built so every expected value below is computed independently from
  // this array. C1 has 6 distinct orders across 7 rows (O1 has two line
  // items), C2 has 4, C3 has 2, C4 has 1. O12 has a blank amount and O13 a
  // non-numeric one -- both must be excluded from any amount comparison.
  const SRC = [
    { order_id: 'O1', customer_id: 'C1', status: 'Completed', quantity: 2, amount: 120 },
    { order_id: 'O1', customer_id: 'C1', status: 'Completed', quantity: 1, amount: 80 },
    { order_id: 'O2', customer_id: 'C1', status: 'Cancelled', quantity: 6, amount: 650 },
    { order_id: 'O3', customer_id: 'C1', status: 'Completed', quantity: 9, amount: 1800 },
    { order_id: 'O4', customer_id: 'C1', status: 'Pending', quantity: 1, amount: 40 },
    { order_id: 'O5', customer_id: 'C1', status: 'Completed', quantity: 5, amount: 500 },
    { order_id: 'O6', customer_id: 'C1', status: 'Cancelled', quantity: 7, amount: 920 },
    { order_id: 'O7', customer_id: 'C2', status: 'Completed', quantity: 3, amount: 240 },
    { order_id: 'O8', customer_id: 'C2', status: 'Completed', quantity: 12, amount: 2400 },
    { order_id: 'O9', customer_id: 'C2', status: 'Pending', quantity: 4, amount: 199.99 },
    { order_id: 'O10', customer_id: 'C2', status: 'Cancelled', quantity: 2, amount: 310 },
    { order_id: 'O11', customer_id: 'C3', status: 'Completed', quantity: 8, amount: 1100 },
    { order_id: 'O12', customer_id: 'C3', status: 'Pending', quantity: 1, amount: '' },
    { order_id: 'O13', customer_id: 'C4', status: 'Completed', quantity: 3, amount: 'n/a' },
  ];
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const ids = (rows: any[]) => rows.map((r) => r.order_id);
  let ID = '';

  beforeAll(async () => {
    const text = JSON.stringify(SRC);
    // jsdom's File lacks text()/arrayBuffer(); hand uploadDataset the same
    // minimal interface the scale tests in AiAnalytics.test.tsx use.
    const file = {
      name: 'numeric-comparison.json',
      type: 'application/json',
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    } as unknown as File;
    ID = (await localEngine.uploadDataset(file, 'Numeric Comparison Regression')).id;
  });

  it('counts rows over a money threshold against the amount column', async () => {
    const expected = SRC.filter((r) => (num(r.amount) ?? -Infinity) > 500).length;
    const res = await localEngine.executeChatQuery(ID, 'how many orders are over $500?');
    expect(res.rows).toEqual([{ Count: expected }]);
    expect(res.query_trace).toContain('WHERE "amount" > 500');
    expect(res.explanation).toContain('**amount**');
    expect(res.plan.filters).toEqual([{ column: 'amount', operator: 'gt', value: 500 }]);
  });

  it('applies a named category AND the threshold together', async () => {
    const expected = SRC.filter((r) => r.status === 'Cancelled' && (num(r.amount) ?? -Infinity) > 500).length;
    expect(expected).toBeLessThan(SRC.filter((r) => r.status === 'Cancelled').length); // the threshold matters
    const res = await localEngine.executeChatQuery(ID, 'How many cancelled orders are above $500?');
    expect(res.rows).toEqual([{ Count: expected }]);
    expect(res.query_trace).toContain(`"amount" > 500 AND LOWER("status") = 'cancelled'`);
  });

  it('resolves a unit word after the number to the quantity column ("5 units or more")', async () => {
    const expected = SRC.filter((r) => r.quantity >= 5).length;
    expect(expected).not.toBe(SRC.length);
    const res = await localEngine.executeChatQuery(ID, 'how many orders have 5 units or more?');
    expect(res.rows).toEqual([{ Count: expected }]);
    expect(res.query_trace).toContain('"quantity" >= 5');
  });

  it('uses a measure named before the comparison ("quantity under 3")', async () => {
    const expected = SRC.filter((r) => r.quantity < 3).length;
    const res = await localEngine.executeChatQuery(ID, 'count of orders with quantity under 3');
    expect(res.rows).toEqual([{ Count: expected }]);
  });

  it('lists the matching rows for "show ... between X and Y"', async () => {
    const expected = SRC.filter((r) => {
      const a = num(r.amount);
      return a !== null && a >= 100 && a <= 250;
    });
    const res = await localEngine.executeChatQuery(ID, 'show orders with amount between 100 and 250');
    expect(res.plan.intent).toBe('filter');
    expect(ids(res.rows)).toEqual(ids(expected));
    expect(res.row_count).toBe(expected.length);
    expect(res.plan.filters).toEqual([
      { column: 'amount', operator: 'gte', value: 100 },
      { column: 'amount', operator: 'lte', value: 250 },
    ]);
  });

  it('sorts by the compared column for "top N ... over $1k"', async () => {
    const res = await localEngine.executeChatQuery(ID, 'top 2 orders over $1k');
    expect(ids(res.rows)).toEqual(['O8', 'O3']);
    expect(res.explanation).toMatch(/Found \*\*3\*\* rows/); // O3, O8, O11 match; 2 shown
  });

  it('answers "how many customers have more than 3 orders?" with a per-customer distinct-order count', async () => {
    const res = await localEngine.executeChatQuery(ID, 'how many customers have more than 3 orders?');
    expect(Object.values(res.rows[0])[0]).toBe(2); // C1 (6 distinct orders), C2 (4)
    expect(res.query_trace).toContain('HAVING COUNT(DISTINCT "order_id") > 3');
  });

  it('lists customers for "which customers placed at least 4 orders?", most orders first', async () => {
    const res = await localEngine.executeChatQuery(ID, 'which customers placed at least 4 orders?');
    expect(res.rows).toEqual([
      { customer_id: 'C1', 'Orders Count': 6 },
      { customer_id: 'C2', 'Orders Count': 4 },
    ]);
  });

  it('never answers a comparison question with the unfiltered total', async () => {
    const res = await localEngine.executeChatQuery(ID, 'how many orders have an average amount over 500?');
    expect(res.columns).not.toEqual(['Total Records']);
  });

  it('leaves non-comparison count questions on their existing paths', async () => {
    const total = await localEngine.executeChatQuery(ID, 'how many orders are there?');
    expect(total.rows).toEqual([{ 'Total Records': SRC.length }]);
    const cancelled = await localEngine.executeChatQuery(ID, 'how many orders were cancelled?');
    expect(cancelled.rows).toEqual([{ Count: SRC.filter((r) => r.status === 'Cancelled').length }]);
  });
});
