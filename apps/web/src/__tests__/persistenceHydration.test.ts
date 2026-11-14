/**
 * R2-17: a reload must never replace the user's datasets with the samples,
 * and the newest stored copy must win. Uses an in-memory IndexedDB.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { localEngine, __resetLocalStoreForTests } from '../api/localEngine';

const KEY = 'stepsheet_local_datasets_v1';
const userDs = (id: string, n = 2) => ({
  meta: {
    id, name: id, original_filename: `${id}.csv`, file_format: 'csv', row_count: n, column_count: 2,
    file_size_bytes: 0, schema_metadata: [{ name: 'a', data_type: 'integer', physical_type: 'BIGINT', nullable: false }],
    created_at: '', updated_at: '',
  },
  rows: Array.from({ length: n }, (_, i) => ({ a: i, b: `x${i}` })),
});

function idb<T>(mode: 'get' | 'put', value?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stepsheet_local_db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('kv');
      const r = mode === 'get' ? store.get(KEY) : store.put(value, KEY);
      r.onsuccess = () => { const out = r.result; tx.oncomplete = () => { db.close(); resolve(out as T); }; };
      r.onerror = () => reject(r.error);
    };
    req.onerror = () => reject(req.error);
  });
}
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  localStorage.clear();
  await idb('put', null);
  __resetLocalStoreForTests();
});

describe('R2-17 reload keeps the user data', () => {
  it('empty localStorage + datasets in IndexedDB: the datasets load and are not overwritten by samples', async () => {
    await idb('put', { savedAt: 1000, datasets: [userDs('sales_2024')] });
    const list = await localEngine.listDatasets();
    expect(list.map((d) => d.id)).toEqual(['sales_2024']);
    await settle();
    const stored: any = await idb('get');
    expect(stored.datasets.map((d: any) => d.meta.id)).toEqual(['sales_2024']);
  });

  it('a legacy bare-array copy in IndexedDB is still read', async () => {
    await idb('put', [userDs('legacy')]);
    expect((await localEngine.listDatasets()).map((d) => d.id)).toEqual(['legacy']);
  });

  it('a newer IndexedDB copy beats a stale localStorage copy with the same count', async () => {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: 1000, datasets: [userDs('old_name')] }));
    await idb('put', { savedAt: 2000, datasets: [userDs('new_name')] });
    expect((await localEngine.listDatasets()).map((d) => d.id)).toEqual(['new_name']);
  });

  it('a save after hydration keeps every existing dataset', async () => {
    await idb('put', { savedAt: 1000, datasets: [userDs('keep_me')] });
    await localEngine.deleteDataset('does-not-exist');
    await settle();
    const stored: any = await idb('get');
    expect(stored.datasets.map((d: any) => d.meta.id)).toContain('keep_me');
    expect(stored.savedAt).toBeGreaterThan(1000);
  });

  it('first run with nothing stored seeds the samples', async () => {
    const list = await localEngine.listDatasets();
    expect(list.length).toBeGreaterThan(0);
    await settle();
    const stored: any = await idb('get');
    expect(stored.datasets.length).toBe(list.length);
  });

  it('a large store keeps only a marker in localStorage (no 5MB overflow, no stale full copy)', async () => {
    await idb('put', { savedAt: 1000, datasets: [userDs('big', 150_000)] });
    await localEngine.deleteDataset('nothing');
    const ls = JSON.parse(localStorage.getItem(KEY)!);
    expect(ls.inIdb).toBe(true);
    expect(ls.datasets).toBeUndefined();
    __resetLocalStoreForTests();
    expect((await localEngine.listDatasets()).map((d) => d.id)).toEqual(['big']);
  });
});
