/**
 * Round 6 (production-readiness hardening, continued) regression tests.
 *
 * R6-01: Chat-with-Data's simple "<measure> by <dimension>" queries --
 * arguably the single most common Chat-with-Data query shape ("total
 * revenue by region", "average order value by category", "customer count
 * by status") -- grouped the category column by its *raw* string value
 * instead of the case/space-insensitive key every other part of the app
 * uses (dashboardData.ts's makeLabeler for dashboards, chatPlanner.ts's
 * valueIndex for multi-filter questions, groupKeyOf for upsert/dedupe). A
 * dataset with "East" and "east" in the same column -- a common state in
 * real-world CSVs from different sources or manual entry -- would silently
 * split into two rows and understate each one's true total, in exactly the
 * query a user is most likely to run first. Found via a Round 6 probe that
 * fed the same "region" values through the dashboard group_by step (merges
 * correctly), Chat-with-Data's structured planner (merges correctly), and
 * plain "total X by Y" Chat-with-Data (did not merge) -- and compared them.
 * Fixed by routing every raw-grouping site in the legacy "by"-clause handler
 * through the same first-seen-casing convention via canonicalGroupKey().
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';

const upload = async (text: string, name = 'r6.csv', type = 'text/csv') => {
  const file = { name, type, size: text.length, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as unknown as File;
  return localEngine.uploadDataset(file, name);
};

describe('R6-01 Chat-with-Data "<measure> by <dimension>" merges case/space variants of the same category', () => {
  it('"total amt by region" sums Global/global into one row, matching dashboard and planner grouping', async () => {
    const meta = await upload('region,amt\nGlobal,10\nglobal,20\nHot,5\n');
    const r = await localEngine.executeChatQuery(meta.id, 'total amt by region');
    expect(r.rows).toEqual([
      { region: 'Global', 'Sum of amt': 30 },
      { region: 'Hot', 'Sum of amt': 5 },
    ]);
  });

  it('"average amt by region" (a different aggregation branch) merges the same way', async () => {
    const meta = await upload('region,amt\n East ,10\neast,30\nNorth,1\nNorth,2\nNorth,3\n');
    const r = await localEngine.executeChatQuery(meta.id, 'average amt by region');
    const east = r.rows.find((row: any) => row.region === 'East');
    expect(east['Avg of amt']).toBe(20);
  });

  it('"top products by revenue" (measure-as-group-candidate branch) merges category case variants', async () => {
    const meta = await upload(
      'product,revenue\nWidget,100\nwidget,50\nGadget,10\nGizmo,5\nThingamajig,2\nDoohickey,1\n'
    );
    const r = await localEngine.executeChatQuery(meta.id, 'top 5 products by revenue');
    const widget = r.rows.find((row: any) => row.product === 'Widget');
    expect(widget['Total Revenue']).toBe(150);
    expect(r.rows.filter((row: any) => /widget/i.test(row.product)).length).toBe(1); // Widget/widget merged
  });

  it('"how many orders by region" (entity-count branch) merges category case variants', async () => {
    const meta = await upload('region,order_id\nNorth,1\nnorth,2\nnorth,3\nSouth,4\n');
    const r = await localEngine.executeChatQuery(meta.id, 'how many orders by region');
    const north = r.rows.find((row: any) => row.region === 'North');
    expect(north['Order Count']).toBe(3);
  });

  it('an emoji category (surrogate-pair safe, not just ASCII) merges the same way', async () => {
    const meta = await upload('region,amt\n\u{1F30D} Global,10\n\u{1F30D} global,20\n');
    const r = await localEngine.executeChatQuery(meta.id, 'total amt by region');
    expect(r.rows).toEqual([{ region: '\u{1F30D} Global', 'Sum of amt': 30 }]);
  });
});
