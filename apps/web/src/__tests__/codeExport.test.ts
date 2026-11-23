/**
 * Code export structure. Executing the code is covered by
 * codeExportParity.test.ts + scripts/verify_code_export/check.py.
 */
import { describe, it, expect } from 'vitest';
import { localEngine, __resetLocalStoreForTests } from '../api/localEngine';

const csv = (t: string, name: string) => ({ name, type: 'text/csv', size: t.length, text: async () => t, arrayBuffer: async () => new TextEncoder().encode(t).buffer }) as any;
const S = (id: string, type: string, params: any, enabled = true) => ({ id, label: `${type} ${id}`, type, enabled, params });

describe('code export', () => {
  it('produces runnable-shaped SQL, Polars and Power Query for a pipeline', async () => {
    __resetLocalStoreForTests();
    const ds = await localEngine.uploadDataset(csv('id,rep,amount,status\n1,Ann,"1,200",Completed\n2,bob,300,completed \n', 'orders.csv'), 'orders');
    const steps = [
      S('a', 'math_transform', { column: 'amount', operation: 'clean_numeric' }),
      S('b', 'filter_rows', { conditions: [{ column: 'status', operator: 'eq', value: 'completed' }] }),
      S('c', 'filter_rows', { conditions: [{ column: 'id', operator: 'gt', value: '100' }] }, false),
      S('d', 'custom_column', { new_column: 'double', expression: '[amount]*2' }),
      S('e', 'rename_column', { old_name: 'rep', new_name: 'sales_rep' }),
    ];
    const code = await localEngine.exportCode(ds.id, steps);
    expect(code.unsupported).toEqual([]);
    // Every enabled step appears once, the disabled one not at all.
    for (const c of [code.sql, code.polars, code.power_query_m]) {
      expect(c).toContain('Step 3: custom_column d');
      expect(c).not.toContain('filter_rows c');
    }
    expect(code.sql).toMatch(/FROM "orders"/);
    expect(code.sql).toMatch(/SELECT "id", "sales_rep", "amount", "status", "double" FROM s4 ORDER BY __rid;\n$/);
    expect(code.sql).not.toMatch(/\beq\b|\[amount\]/);
    expect(code.polars).toContain('pl.read_csv("orders.csv", infer_schema=False)');
    expect(code.polars).not.toContain('pl.lit(None)');
    expect(code.power_query_m).not.toContain('PrevStep');
    expect(code.power_query_m).toMatch(/in\n {4}Step4\n$/);
    const m = code.power_query_m.replace(/"(?:[^"]|"")*"/g, '""');
    for (const [o, c] of [['(', ')'], ['[', ']'], ['{', '}']]) expect(m.split(o).length).toBe(m.split(c).length);
  });

  it('stops with a clear message on a step it cannot reproduce', async () => {
    __resetLocalStoreForTests();
    const ds = await localEngine.uploadDataset(csv('a,b\n1,2\n', 't.csv'), 't');
    const code = await localEngine.exportCode(ds.id, [S('t', 'transpose', {})]);
    expect(code.unsupported.map((u: any) => u.language).sort()).toEqual(['polars', 'power_query_m', 'sql']);
    expect(code.sql).toContain("error('Step 1 (transpose t) can''t be exported");
    expect(code.polars).toContain('raise NotImplementedError(');
    expect(code.power_query_m).toContain('error "Step 1 (transpose t)');
  });

  it('shows the same code per step in the step panel', async () => {
    __resetLocalStoreForTests();
    const ds = await localEngine.uploadDataset(csv('a,b\n1,x\n', 't.csv'), 't');
    const r: any = await localEngine.previewPipeline(ds.id, [S('u', 'text_transform', { column: 'b', operation: 'upper' })], { offset: 0, limit: 10 } as any);
    expect(r.steps[0].generated_code.sql).toContain('upper(');
    expect(r.steps[0].generated_code.power_query_m).toMatch(/^Table\.ReplaceValue\(Source,/);
    expect(r.compiled_sql).toContain('CREATE OR REPLACE TEMP MACRO ss_num');
  });
});
