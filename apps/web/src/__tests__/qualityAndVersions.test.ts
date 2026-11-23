/** Quality checks read every row; version history holds only the user's versions, per project. */
import { describe, it, expect } from 'vitest';
import { localEngine, __resetLocalStoreForTests } from '../api/localEngine';

const jsonFile = (rows: any[]) => ({ name: 'd.json', type: 'application/json', size: 1, text: async () => JSON.stringify(rows), arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(rows)).buffer }) as any;

describe('quality checks', () => {
  it('check every row, not the first 10,000', async () => {
    __resetLocalStoreForTests();
    const rows = Array.from({ length: 12000 }, (_, i) => ({ k: i === 11999 ? null : 'x' }));
    const d = await localEngine.uploadDataset(jsonFile(rows), 'big');
    const q = await localEngine.runQualityCheck(d.id, [{ column: 'k', rule_type: 'not_null' }]);
    expect(q.results[0].failed_rows).toBe(1);
    expect(q.results[0].total_rows ?? q.total_rows ?? 12000).toBe(12000);
  });
});

describe('version history', () => {
  it('starts empty and numbers versions per project', async () => {
    localStorage.clear();
    expect(await localEngine.listVersions('a')).toEqual([]);
    await localEngine.createVersion('a', 'one', []);
    await localEngine.createVersion('a', 'two', [{ id: 's', type: 'filter_rows', label: 'f', enabled: true, params: {} }]);
    await localEngine.createVersion('b', 'other', []);
    expect((await localEngine.listVersions('a')).map((v: any) => v.version_number).sort()).toEqual([1, 2]);
    expect((await localEngine.listVersions('b')).map((v: any) => v.version_number)).toEqual([1]);
    const diff = await localEngine.diffVersions('a', 1, 2);
    expect(diff.added_count).toBe(1);
  });

  it('drops the old seeded demo version', async () => {
    localStorage.clear();
    localStorage.setItem('stepsheet_local_versions_v2', JSON.stringify([{ id: 'ver-seed-1', project_id: 'a', version_number: 1, steps: [] }]));
    expect(await localEngine.listVersions('a')).toEqual([]);
  });

  it('refuses to restore or diff a version that does not exist', async () => {
    localStorage.clear();
    await expect(localEngine.restoreVersion('a', 'nope')).rejects.toThrow(/does not exist/);
    await expect(localEngine.diffVersions('a', 1, 2)).rejects.toThrow(/does not exist/);
  });
});
