/**
 * Chat with Data planner (R2-03, R2-04, R2-09): every part of a multi-part
 * question is applied, or the question is declined -- never a partial answer.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { localEngine } from '../api/localEngine';

const R = [
  { order_id: 'O1', customer_id: 'C1', region: 'North', status: 'Completed', order_date: '2024-03-04', revenue: 100, quantity: 1 }, // Mon
  { order_id: 'O2', customer_id: 'C1', region: 'North', status: 'Cancelled', order_date: '2024-03-05', revenue: 200, quantity: 2 },
  { order_id: 'O3', customer_id: 'C2', region: 'South', status: 'Completed', order_date: '2024-04-10', revenue: 300, quantity: 3 },
  { order_id: 'O4', customer_id: 'C3', region: 'South', status: 'Pending', order_date: '2024-05-11', revenue: 400, quantity: 4 },
  { order_id: 'O5', customer_id: 'C2', region: 'East', status: 'Completed', order_date: '2024-12-02', revenue: 1000, quantity: 5 },
  { order_id: 'O6', customer_id: 'C4', region: 'West', status: 'Completed', order_date: '2024-12-20', revenue: 50, quantity: 6 },
];
let ID = '';
const ask = (q: string) => localEngine.executeChatQuery(ID, q);
const first = (res: any) => Object.values(res.rows[0] ?? {}).pop();

beforeAll(async () => {
  const text = JSON.stringify(R);
  const file = { name: 'p.json', type: 'application/json', text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as unknown as File;
  ID = (await localEngine.uploadDataset(file, 'planner')).id;
});

describe('filters', () => {
  it('two categorical filters are both applied', async () => expect(first(await ask('how many completed orders are in the north region?'))).toBe(1));
  it('NOT is applied, not reversed', async () => expect(first(await ask('how many orders are not completed?'))).toBe(2));
  it('excluding', async () => expect(first(await ask('total revenue excluding cancelled orders'))).toBe(1850));
  it('a negation list stays negated', async () => expect(first(await ask('total revenue excluding cancelled and pending orders'))).toBe(1450));
  it('IN for two values of one column', async () => expect(first(await ask('revenue for north and south combined'))).toBe(1000));
  it('month + year', async () => expect(first(await ask('what was the total revenue in December 2024?'))).toBe(1050));
  it('quarter', async () => expect(first(await ask('how many orders were placed in Q2?'))).toBe(2));
  it('exact id from a high-cardinality column', async () => expect(first(await ask('what is the revenue of customer C2?'))).toBe(1300));
  it('category + region + threshold', async () => expect(first(await ask('how many completed orders in the south region are over $200?'))).toBe(1));
});

describe('shapes', () => {
  it('compare A vs B', async () => {
    const r = await ask('compare revenue between north and south');
    expect(r.rows).toEqual([{ region: 'North', sum_revenue: 300 }, { region: 'South', sum_revenue: 700 }]);
  });
  it('second highest group', async () => expect((await ask('what is the second highest revenue region?')).rows[0].region).toBe('South'));
  it('top N by number of rows', async () => expect((await ask('top 2 regions by number of orders')).rows.map((r: any) => r.Count)).toEqual([2, 2]));
  it('N smallest rows', async () => expect((await ask('list the 2 smallest orders by revenue')).rows.map((r: any) => r.order_id)).toEqual(['O6', 'O1']));
  it('day of week ranks totals', async () => expect((await ask('which day of the week has the highest revenue?')).rows[0].day_of_week).toBe('Monday'));
  it('value share, not row share', async () => expect((await ask('what percentage of revenue comes from the east region?')).rows[0].Percentage).toBe(48.78));
  it('HAVING on a group total', async () => expect(first(await ask('how many regions have total revenue above 400?'))).toBe(2));
  it('HAVING on frequency', async () => expect(first(await ask('how many customers ordered more than once?'))).toBe(2));
  it('sample standard deviation', async () => expect(first(await ask('what is the standard deviation of revenue?'))).toBeCloseTo(347.0110, 3));
  it('month-over-month growth', async () => {
    const r = await ask('what is the month over month growth in revenue?');
    expect(r.rows.map((x: any) => x.growth_pct)).toEqual([null, 0, 33.33, 162.5]);
  });
  it('row listing reports the count', async () => expect((await ask('show me orders from December 2024')).explanation).toContain('**2**'));
});

describe('declines instead of guessing', () => {
  it('a negation that matches no value', async () => {
    const r = await ask('how many orders are not refunded?');
    expect(r.declined).toBe(true);
    expect(r.rows).toEqual([]);
    expect(r.explanation).toMatch(/can't answer that reliably/);
  });
  it('a rank beyond the number of groups', async () => expect((await ask('what is the fifth highest revenue region?')).declined).toBe(true));
});

describe('simple questions keep their existing answers', () => {
  it('a single category count is untouched', async () => expect((await ask('how many orders are cancelled?')).explanation).toMatch(/rows where \*\*status\*\* is \*\*Cancelled\*\*/));
});
