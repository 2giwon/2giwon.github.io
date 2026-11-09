import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadToken, saveToken, clearToken, expiryStatus } from '../app/token.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    raw: map,
  };
}

test('저장한 토큰과 만료일을 그대로 불러온다', () => {
  const s = memoryStorage();
  saveToken(s, { token: 'github_pat_abc', expiresOn: '2027-11-09' });
  assert.deepEqual(loadToken(s), { token: 'github_pat_abc', expiresOn: '2027-11-09' });
});

test('만료일 없이 저장하면 null 로 불러온다', () => {
  const s = memoryStorage();
  saveToken(s, { token: 'github_pat_abc' });
  assert.deepEqual(loadToken(s), { token: 'github_pat_abc', expiresOn: null });
});

test('토큰 앞뒤 공백은 저장할 때 잘라 낸다', () => {
  const s = memoryStorage();
  saveToken(s, { token: '  github_pat_abc \n', expiresOn: '' });
  assert.deepEqual(loadToken(s), { token: 'github_pat_abc', expiresOn: null });
});

test('지우면 null', () => {
  const s = memoryStorage();
  saveToken(s, { token: 'github_pat_abc', expiresOn: null });
  clearToken(s);
  assert.equal(loadToken(s), null);
});

test('저장값이 깨졌으면 null', () => {
  const s = memoryStorage();
  s.setItem('worknote.token', '{깨짐');
  assert.equal(loadToken(s), null);
});

test('저장값에 토큰이 비었으면 null', () => {
  const s = memoryStorage();
  s.setItem('worknote.token', JSON.stringify({ token: '', expiresOn: null }));
  assert.equal(loadToken(s), null);
});

test('빈 토큰은 저장하지 않고 throw', () => {
  assert.throws(() => saveToken(memoryStorage(), { token: '   ' }));
});

test('만료일 14일 전부터 곧 만료', () => {
  assert.equal(expiryStatus('2026-12-01', '2026-11-16'), 'ok');
  assert.equal(expiryStatus('2026-12-01', '2026-11-17'), 'soon');
  assert.equal(expiryStatus('2026-12-01', '2026-12-01'), 'soon');
  assert.equal(expiryStatus('2026-12-01', '2026-12-02'), 'expired');
});

test('만료일이 없거나 형식이 틀리면 unknown', () => {
  assert.equal(expiryStatus(null, '2026-11-09'), 'unknown');
  assert.equal(expiryStatus('내년', '2026-11-09'), 'unknown');
});
