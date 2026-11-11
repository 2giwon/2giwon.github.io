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

// ─── 할 일 파일 (11-11) ─────────────────────────────────────────────────────

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const tasksFile = (titles, nextId = 10) =>
  JSON.stringify({ version: 1, nextId, tasks: titles.map((title, i) => ({ id: i + 1, title, doOn: '2026-11-11', status: 'todo' })) });

/** GET 과 PUT 에 차례로 줄 응답을 받는 가짜 fetch. 호출 기록을 남긴다. */
function scriptedFetch({ gets = [], puts = [] }) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    const next = (method === 'PUT' ? puts : gets).shift();
    if (!next) throw new Error(`예상하지 못한 ${method} ${url}`);
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  };
  fn.calls = calls;
  return fn;
}
const getFile = (text, sha) => ({ status: 200, body: { content: b64(text), encoding: 'base64', sha } });
const makeStore = (fetch) => createStore({ token: 'tk', fetch, storage: memoryStorage(), session: memoryStorage(), cache: memoryCache() });
const addOne = (title) => (data) => ({ ...data, nextId: data.nextId + 1, tasks: [...data.tasks, { id: data.nextId, title }] });

test('11. 저장 중 충돌(409)이면 다시 읽어 최신 파일에 바꾸기를 다시 적용해 성공한다', async () => {
  const fetch = scriptedFetch({
    gets: [getFile(tasksFile(['가']), 's1'), getFile(tasksFile(['가', '폰에서 넣은 일'], 11), 's2')],
    puts: [{ status: 409 }, { status: 200, body: { content: { sha: 's3' } } }],
  });
  const r = await makeStore(fetch).updateTasks(addOne('새 일'), '할 일 추가: 새 일');
  assert.equal(r.sha, 's3');
  assert.deepEqual(r.data.tasks.map((t) => t.title), ['가', '폰에서 넣은 일', '새 일']);
  const lastPut = fetch.calls.filter((c) => c.method === 'PUT').at(-1);
  assert.equal(lastPut.body.sha, 's2');
  const saved = JSON.parse(Buffer.from(lastPut.body.content, 'base64').toString('utf8'));
  assert.deepEqual(saved.tasks.map((t) => t.title), ['가', '폰에서 넣은 일', '새 일']);
});

test('11. 두 번 연속 충돌하면 conflict 오류', async () => {
  const fetch = scriptedFetch({
    gets: [getFile(tasksFile(['가']), 's1'), getFile(tasksFile(['가']), 's2')],
    puts: [{ status: 409 }, { status: 409 }],
  });
  const err = await makeStore(fetch).updateTasks(addOne('새 일'), 'm').catch((e) => e);
  assert.equal(err.kind, 'conflict');
});

test('12. 할 일 파일이 없으면(404) 새로 만든다(sha 없이)', async () => {
  const fetch = scriptedFetch({ gets: [{ status: 404 }], puts: [{ status: 201, body: { content: { sha: 'n1' } } }] });
  const r = await makeStore(fetch).updateTasks(addOne('첫 일'), 'm');
  assert.deepEqual(r.data.tasks.map((t) => t.title), ['첫 일']);
  assert.equal('sha' in fetch.calls.find((c) => c.method === 'PUT').body, false);
});

test('12. tasks() 는 파일이 없으면 missing, 형식이 틀리면 invalid', async () => {
  const missing = await makeStore(scriptedFetch({ gets: [{ status: 404 }] })).tasks();
  assert.equal(missing.state, 'missing');
  assert.deepEqual(missing.data.tasks, []);
  const invalid = await makeStore(scriptedFetch({ gets: [getFile('{ 깨짐', 's1')] })).tasks();
  assert.equal(invalid.state, 'invalid');
});

test('12. 형식이 틀린 파일에는 쓰지 않는다', async () => {
  const fetch = scriptedFetch({ gets: [getFile('{ 깨짐', 's1')] });
  await assert.rejects(makeStore(fetch).updateTasks(addOne('x'), 'm'));
  assert.equal(fetch.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('13. 토큰을 지운(dispose) 뒤에는 할 일 파일에 쓰지 않는다', async () => {
  const fetch = scriptedFetch({ gets: [getFile(tasksFile(['가']), 's1')] });
  const store = makeStore(fetch);
  store.dispose();
  await assert.rejects(store.updateTasks(addOne('x'), 'm'));
  assert.equal(fetch.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('dispose 전에는 원문을 캐시에 저장한다', async () => {
  const cache = memoryCache();
  const fetch = async () => new Response('원문', { status: 200 });
  const store = createStore({ token: 'tk', fetch, storage: memoryStorage(), session: memoryStorage(), cache });
  assert.equal(await store.text('personal-docs', 'sha1'), '원문');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(cache.map.get('sha1'), '원문');
});
