import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/store.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

function memoryCache() {
  const map = new Map();
  return { get: async (k) => map.get(k) ?? null, put: async (k, v) => void map.set(k, v), clear: async () => map.clear(), map };
}

/** 응답을 손으로 풀어 주는 가짜 fetch */
function heldFetch() {
  const pending = [];
  const fn = (url) => new Promise((resolve) => pending.push({ url, resolve }));
  fn.release = (body) => pending.splice(0).forEach((p) => p.resolve(new Response(body, { status: 200 })));
  fn.pending = pending;
  return fn;
}

test('토큰을 지운(dispose) 뒤 도착한 원문은 캐시에 저장하지 않는다', async () => {
  const fetch = heldFetch();
  const cache = memoryCache();
  const store = createStore({ token: 'tk', fetch, storage: memoryStorage(), session: memoryStorage(), cache });
  const p = store.text('personal-docs', 'sha1').catch((e) => e);
  await new Promise((r) => setTimeout(r, 0));
  store.dispose();
  fetch.release('비밀 원문');
  await p;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(cache.map.size, 0);
});

test('dispose 뒤 도착한 파일 목록은 저장소에 쓰지 않는다', async () => {
  const fetch = heldFetch();
  const storage = memoryStorage();
  const store = createStore({ token: 'tk', fetch, storage, session: memoryStorage(), cache: memoryCache() });
  const p = store.catalog().catch((e) => e);
  await new Promise((r) => setTimeout(r, 0));
  store.dispose();
  fetch.release(JSON.stringify({ truncated: false, tree: [] }));
  await p;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal([...storage.map.keys()].filter((k) => k.startsWith('worknote.tree.')).length, 0);
});

test('dispose 전에는 원문을 캐시에 저장한다', async () => {
  const cache = memoryCache();
  const fetch = async () => new Response('원문', { status: 200 });
  const store = createStore({ token: 'tk', fetch, storage: memoryStorage(), session: memoryStorage(), cache });
  assert.equal(await store.text('personal-docs', 'sha1'), '원문');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(cache.map.get('sha1'), '원문');
});
