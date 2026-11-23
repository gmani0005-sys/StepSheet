/** Share links kept by the browser app enforce passcode, expiry and revoke. */
import { describe, it, expect } from 'vitest';
import { localEngine, __resetLocalStoreForTests } from '../api/localEngine';

describe('local share links', () => {
  it('refuses unknown, revoked and expired links', async () => {
    __resetLocalStoreForTests();
    localStorage.clear();
    await expect(localEngine.getShareAccess('stpsht_nope')).rejects.toThrow(/not found|revoked/);
    const s = await localEngine.createShare('p1', 'viewer', 7);
    expect(String(s.token).length).toBeGreaterThanOrEqual(40);
    expect((await localEngine.getShareAccess(s.token)).valid).toBe(true);
    await localEngine.revokeShare('p1', s.id);
    await expect(localEngine.getShareAccess(s.token)).rejects.toThrow(/revoked/);
    expect((await localEngine.listShares('p1')).find((x: any) => x.id === s.id).is_active).toBe(false);
    const old = await localEngine.createShare('p1', 'viewer', -1);
    await expect(localEngine.getShareAccess(old.token)).rejects.toThrow(/expired/);
  });

  it('keeps only a hash of the passcode and checks it', async () => {
    localStorage.clear();
    const s = await localEngine.createShare('p1', 'viewer', 7, '4711');
    expect(JSON.stringify(s)).not.toContain('passcode_hash');
    const stored = localStorage.getItem('stepsheet_local_shares_v2') || '';
    expect(stored).toContain('passcode_hash');
    expect(stored).not.toContain('4711');
    const a = await localEngine.getShareAccess(s.token);
    expect(a.valid).toBe(false);
    expect(a.requires_passcode).toBe(true);
    await expect(localEngine.verifySharePasscode(s.token, '0000')).rejects.toThrow(/Wrong passcode/);
    expect((await localEngine.verifySharePasscode(s.token, '4711')).valid).toBe(true);
  });

  it('locks the link after 5 wrong passcodes', async () => {
    localStorage.clear();
    const s = await localEngine.createShare('p1', 'viewer', 7, '4711');
    for (let i = 0; i < 4; i++) await expect(localEngine.verifySharePasscode(s.token, `x${i}`)).rejects.toThrow(/Wrong passcode/);
    await expect(localEngine.verifySharePasscode(s.token, 'x5')).rejects.toThrow(/locked/);
    await expect(localEngine.verifySharePasscode(s.token, '4711')).rejects.toThrow(/locked/);
  });

  it('lists shares per project', async () => {
    localStorage.clear();
    await localEngine.createShare('p1');
    await localEngine.createShare('p2');
    expect((await localEngine.listShares('p1')).length).toBe(1);
  });
});
