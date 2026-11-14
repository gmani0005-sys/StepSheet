/**
 * Regression tests for the Round 3 (real-time data) findings R3-01 .. R3-12.
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';
import { parseSharedDate } from '../engine/values';

const ds = (id: string, rows: any[], name = id) => ({
  meta: {
    id, name, original_filename: `${id}.csv`, file_format: 'csv', row_count: rows.length,
    column_count: rows[0] ? Object.keys(rows[0]).length : 0, file_size_bytes: 0,
    schema_metadata: rows[0] ? Object.keys(rows[0]).map((n) => ({ name: n, data_type: 'text', physical_type: 'VARCHAR', nullable: true })) : [],
    created_at: '', updated_at: '',
  },
  rows,
});
const steps = (xs: any[]) => xs.map((s, i) => ({ id: `s${i}`, label: s.type, enabled: true, ...s }));
const run = (rows: any[], st: any[], others: any[] = []) => localEngine.runPipeline('main', steps(st) as any, 1e9, [ds('main', rows), ...others] as any);
const upload = async (name: string, text: string, type = 'text/csv') =>
  localEngine.uploadDataset({ name, type, size: text.length, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as any, name);

describe('R3-01 upsert keeps one row per key', () => {
  const base = [{ k: 'A', t: '2024-01-02', v: 1 }, { k: 'A', t: '2024-01-01', v: 0 }];
  const batch = ds('b1', [{ k: 'a ', t: '2024-01-01', v: 2 }, { k: 'B', t: '2024-01-05', v: 3 }, { k: 'B', t: '2024-01-04', v: 4 }]);
  it('later rows win; repeats in the base and in the batch collapse; keys match trimmed and case-insensitively', async () => {
    const r = await run(base, [{ type: 'append', params: { dataset_ids: ['b1'], incremental_mode: 'upsert', key_column: 'k' } }], [batch]);
    expect(r.rows.map((x: any) => x.v)).toEqual([2, 4]);
    const w = r.stepSummaries[0].warnings!.join(' ');
    expect(w).toContain('1 row in the starting data repeated a key');
    expect(w).toContain('1 key appeared more than once');
  });
  it('newest_by: a late-arriving older version never overwrites a newer one', async () => {
    const r = await run(base, [{ type: 'append', params: { dataset_ids: ['b1'], incremental_mode: 'upsert', key_column: 'k', newest_by: 't' } }], [batch]);
    expect(r.rows.map((x: any) => x.v)).toEqual([1, 3]);
    expect(r.stepSummaries[0].warnings!.join(' ')).toMatch(/2 incoming rows were older than the stored version \(by "t"\)/);
  });
});

describe('R3-02 append absorbs header drift and reports it', () => {
  it('"Revenue " lands in "revenue"; new and missing columns are reported', async () => {
    const day2 = ds('d2', [{ id: 2, 'Revenue ': 20, channel: 'web' }], 'day_02');
    const r = await run([{ id: 1, revenue: 10, discount: 1 }], [{ type: 'append', params: { dataset_ids: ['d2'] } }], [day2]);
    expect(r.rows).toEqual([{ id: 1, revenue: 10, discount: 1 }, { id: 2, revenue: 20, channel: 'web' }]);
    const w = r.stepSummaries[0].warnings!.join(' | ');
    expect(w).toContain('"Revenue " in day_02 -> "revenue"');
    expect(w).toContain('New column "channel" first appears in day_02');
    expect(w).toContain('has no "discount" column');
  });
});

describe('R3-03 a step that names a missing column says so', () => {
  const rows = [{ region: 'North', channel: 'web', v: 1 }];
  it('filter suggests the likely column', async () => {
    const r = await run(rows, [{ type: 'filter_rows', params: { conditions: [{ column: 'chanel', operator: 'eq', value: 'web' }] } }]);
    expect(r.stepSummaries[0].warnings![0]).toBe('Column "chanel" was not found -- did you mean "channel"? The step treats it as blank.');
  });
  it('group by suggests the likely column', async () => {
    const r = await run(rows, [{ type: 'group_by', params: { group_by_columns: ['regoin'], aggregations: [{ column: 'v', function: 'sum', alias: 't' }] } }]);
    expect(r.stepSummaries[0].warnings![0]).toContain('did you mean "region"');
  });
  it('a formula that names a missing column says so', async () => {
    const r = await run(rows, [{ type: 'custom_column', params: { new_column: 'x', expression: '=[nope]*2' } }]);
    expect(r.stepSummaries[0].warnings![0]).toContain('[nope]');
  });
});

describe('R3-04 time-zone offsets', () => {
  it('an explicit offset is converted to UTC; a value without one is taken as written', () => {
    expect(parseSharedDate('2024-03-05T02:30:00+05:30')!.toISOString()).toBe('2024-03-04T21:00:00.000Z');
    expect(parseSharedDate('2024-02-29T22:00:00-05:00')!.toISOString()).toBe('2024-03-01T03:00:00.000Z');
    expect(parseSharedDate('2024-03-05T10:00:00Z')!.toISOString()).toBe('2024-03-05T10:00:00.000Z');
    expect(parseSharedDate('2024-03-05 10:00:00')!.toISOString()).toBe('2024-03-05T10:00:00.000Z');
  });
  it('sorting mixed-zone timestamps orders them by the real instant', async () => {
    const rows = [{ id: 'a', t: '2024-03-05T09:00:00+05:30' }, { id: 'b', t: '2024-03-05T04:00:00Z' }, { id: 'c', t: '2024-03-04T23:30:00-05:00' }];
    const r = await run(rows, [{ type: 'sort_rows', params: { column: 't', direction: 'asc' } }]);
    expect(r.rows.map((x: any) => x.id)).toEqual(['a', 'b', 'c']); // 03:30Z, 04:00Z, 04:30Z
  });
});

describe('R3-05 / R3-06 hostile names and values', () => {
  it('Chat does not crash on a value named "constructor" and totals every value', async () => {
    const m = await upload('vals.csv', 'id,k,v\n1,__proto__,1\n2,constructor,2\n3,toString,3\n4,__proto__,4\n');
    const r = await localEngine.executeChatQuery(m.id, 'total v by k');
    const got = r.rows.map((x: any) => [x.k, Object.values(x).pop()]).sort();
    expect(got).toEqual([['__proto__', 5], ['constructor', 2], ['toString', 3]]);
  });
  it('renaming to __proto__, a new __proto__ column and a __proto__ pivot value keep their data', async () => {
    const rows = [{ k: '__proto__', v: 1 }, { k: 'constructor', v: 2 }];
    const a = await run(rows, [{ type: 'rename_column', params: { old_name: 'v', new_name: '__proto__' } }]);
    expect(a.rows[0]).toEqual({ k: '__proto__', _proto_: 1 });
    expect(a.stepSummaries[0].warnings![0]).toContain('"_proto_" was used instead');
    const p = await run(rows, [{ type: 'pivot', params: { index_columns: [], pivot_column: 'k', value_column: 'v', agg_func: 'sum' } }]);
    expect(p.rows[0]).toMatchObject({ _proto_: 1, constructor: 2 });
  });
  it('reordering keeps a "constructor" column', async () => {
    const r = await run([{ constructor: 'x', a: 1 }], [{ type: 'reorder_columns', params: { column_order: ['a', 'constructor'] } }]);
    expect(Object.keys(r.rows[0])).toEqual(['a', 'constructor']);
  });
  it('a JSON "__proto__" key becomes a column and pollutes nothing', async () => {
    const m = await upload('j.json', '[{"id":1,"__proto__":{"polluted":true},"a":1}]', 'application/json');
    const rows = (await localEngine.getRows(m.id, { limit: 5 })).rows;
    expect(Object.keys(rows[0])).toEqual(['id', '_proto_', 'a']);
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe('R3-07 malformed pipelines are skipped and reported, never run wrong', () => {
  const rows = [{ id: 1, a: 5 }, { id: 2, a: 7 }];
  it('unknown step type', async () => {
    const r = await run(rows, [{ type: 'teleport_rows', params: {} }]);
    expect(r.rows).toHaveLength(2);
    expect(r.stepSummaries[0].warnings![0]).toContain('Unknown step type "teleport_rows"');
  });
  it('a Group By saved with no settings no longer collapses the data', async () => {
    const r = await run(rows, [{ type: 'group_by', params: undefined }]);
    expect(r.rows).toEqual(rows);
    expect(r.stepSummaries[0].warnings![0]).toContain('missing its settings');
  });
  it('a join to a dataset that no longer exists', async () => {
    const r = await run(rows, [{ type: 'join', params: { right_dataset_id: 'gone', left_key: 'id', right_key: 'id', join_type: 'left' } }]);
    expect(r.stepSummaries[0].warnings![0]).toContain('could not be found');
  });
  it('an empty Chat question gets a prompt, not a sum of ids', async () => {
    const m = await upload('n.csv', 'id,a\n1,5\n');
    expect((await localEngine.executeChatQuery(m.id, '   ')).explanation).toMatch(/^Ask a question/);
  });
});

describe('R3-08 sort speed', () => {
  it('sorts 200K text rows in well under the old ~13 s', async () => {
    const rows = Array.from({ length: 200000 }, (_, i) => ({ r: ['North', 'South', 'East', 'West'][i % 4] + (i % 1000), v: i }));
    const t = performance.now();
    await run(rows, [{ type: 'sort_rows', params: { column: 'r', direction: 'asc' } }]);
    expect(performance.now() - t).toBeLessThan(10000);
  });
});

describe('R3-09 .. R3-12 Chat on an unfamiliar domain', () => {
  const T = [
    { ticket_id: 'T1', agent: 'A1', team: 'Tech', priority: 'High', resolution_hours: 30, refund_amount: 100, created_at: '2025-01-06 10:00' },
    { ticket_id: 'T2', agent: 'A1', team: 'Tech', priority: 'High', resolution_hours: 10, refund_amount: 0, created_at: '2025-01-07 10:00' },
    { ticket_id: 'T3', agent: 'A2', team: 'Billing', priority: 'Low', resolution_hours: 50, refund_amount: 300, created_at: '2025-01-08 10:00' },
    { ticket_id: 'T4', agent: 'A1', team: 'Billing', priority: 'High', resolution_hours: 26, refund_amount: 0, created_at: '2025-01-09 10:00' },
  ];
  let id = '';
  const ask = async (q: string) => {
    if (!id) id = (await upload('t.json', JSON.stringify(T), 'application/json')).id;
    return localEngine.executeChatQuery(id, q);
  };
  it('share of a named quantity is a value share', async () => expect((await ask('what percentage of refund amount comes from the tech team?')).rows[0].Percentage).toBe(25));
  it('a unit after the number picks the column ("more than 24 hours")', async () => expect(Object.values((await ask('how many high priority tickets in the tech team took more than 24 hours?')).rows[0])[0]).toBe(1));
  it('a word of the column name resolves it ("resolution time")', async () => expect(Object.values((await ask('what is the average resolution time for tickets that are not high priority?')).rows[0])[0]).toBe(50));
  it('N longest rows', async () => expect((await ask('list the 2 longest tickets by resolution hours')).rows.map((r: any) => r.ticket_id)).toEqual(['T3', 'T1']));
  it('how many <entity> have more than N <rows>', async () => expect(Object.values((await ask('how many agents have more than 2 tickets?')).rows[0])[0]).toBe(1));
});
