import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBoard, createOwnerCache, OWNER_CACHE_MS } from '../worker/board.mjs';
import worker from '../worker/bus-6211.js';

// 세션 현황판 Worker 검사 (11-27). 메뉴 막대 앱이 POST /board 로 올리고, 작업노트가 GET /board 로 읽는다

const ENV = { BOARD_WRITE_KEY: 'write-key-123', BOARD_OWNER: '2giwon' };
const NOTES = 'https://2giwon.github.io';
const T0 = Date.UTC(2026, 10, 27, 0, 0, 0);

function memoryStore() {
  let saved = null;
  return { get: async () => saved, put: async (board) => { saved = board; }, peek: () => saved };
}

// GitHub GET /user 를 흉내 낸다. 부른 횟수를 센다
function fakeGitHub(login = '2giwon', status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization });
    return new Response(JSON.stringify({ login }), { status });
  };
  return { fetchImpl, calls };
}

const row = (over = {}) => ({
  id: 'local_1c7745ae-f76e', title: '세션 현황판', kind: 'working', detail: null,
  since: '2026-11-27T00:00:00.000Z', titleMissing: false, ...over,
});

function post(body, key = 'write-key-123') {
  const headers = { 'Content-Type': 'application/json' };
  if (key !== null) headers.Authorization = `Bearer ${key}`;
  return new Request('https://w.example/board', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

function get(token = 'gh-token', origin = NOTES) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://w.example/board', { method: 'GET', headers });
}

function deps(over = {}) {
  return { store: memoryStore(), cache: createOwnerCache(), now: () => T0, ...fakeGitHub(), ...over };
}

test('W1. 쓰기: 열쇠가 맞으면 저장(받은 시각 붙임), 없거나 틀리면 401, 비밀값이 없으면 500', async () => {
  const d = deps();
  const ok = await handleBoard(post({ rows: [row()] }), ENV, d);
  assert.equal(ok.status, 200);
  assert.equal(d.store.peek().rows[0].title, '세션 현황판');
  assert.equal(d.store.peek().receivedAt, '2026-11-27T00:00:00.000Z');

  assert.equal((await handleBoard(post({ rows: [] }, null), ENV, deps())).status, 401);
  assert.equal((await handleBoard(post({ rows: [] }, 'wrong'), ENV, deps())).status, 401);
  assert.equal((await handleBoard(post({ rows: [] }), { BOARD_OWNER: '2giwon' }, deps())).status, 500);
});

test('W2. 쓰기 본문 검사: 64KB 넘음, 줄 100개 넘음, 모르는 상태값, 이상한 번호, 깨진 JSON 은 400', async () => {
  const bad = async (body) => (await handleBoard(post(body), ENV, deps())).status;
  assert.equal(await bad('{ broken'), 400);
  assert.equal(await bad({ rows: 'x' }), 400);
  assert.equal(await bad({ rows: Array.from({ length: 101 }, (_, i) => row({ id: `local_${i}` })) }), 400);
  assert.equal(await bad({ rows: [row({ kind: 'sleeping' })] }), 400);
  assert.equal(await bad({ rows: [row({ id: '../etc' })] }), 400);
  assert.equal(await bad({ rows: [row({ since: 'yesterday' })] }), 400);
  assert.equal(await bad({ rows: [row({ title: 'x'.repeat(70 * 1024) })] }), 400);
  // 앱 세션 폴더를 못 읽을 때 메뉴 막대가 쓰는 cli_ 번호, 설명이 있는 줄은 받는다
  assert.equal(await bad({ rows: [row({ id: 'cli_65d11044-228f', detail: '커밋 대기', kind: 'waiting' })] }), 200);
  // 하는 일 한 줄(activity)은 정해진 값만 받는다
  assert.equal(await bad({ rows: [row({ activity: 'editing' })] }), 200);
  assert.equal(await bad({ rows: [row({ activity: 'hacking' })] }), 400);
  // 허용한 칸만 저장한다(폴더 경로 같은 다른 칸은 버린다)
  const d = deps();
  await handleBoard(post({ rows: [row({ cwd: '/Users/me/secret' })] }), ENV, d);
  assert.equal('cwd' in d.store.peek().rows[0], false);
});

test('W3. 읽기: 작업노트 주소가 아니면 403, 토큰 없으면 401, 주인이 다르면 403, GitHub 가 토큰을 거절하면 401, 맞으면 목록', async () => {
  const d = deps();
  await handleBoard(post({ rows: [row()] }), ENV, d);

  assert.equal((await handleBoard(get('gh-token', 'https://evil.example'), ENV, d)).status, 403);
  assert.equal((await handleBoard(get(null), ENV, d)).status, 401);

  const other = deps({ store: d.store, ...fakeGitHub('someone-else') });
  assert.equal((await handleBoard(get(), ENV, other)).status, 403);

  const revoked = deps({ store: d.store, ...fakeGitHub('2giwon', 401) });
  assert.equal((await handleBoard(get(), ENV, revoked)).status, 401);

  const res = await handleBoard(get(), ENV, d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), NOTES);
  const body = await res.json();
  assert.equal(body.rows[0].id, 'local_1c7745ae-f76e');
  assert.equal(body.receivedAt, '2026-11-27T00:00:00.000Z');
  assert.equal(d.calls[0].url, 'https://api.github.com/user');
  assert.equal(d.calls[0].auth, 'Bearer gh-token');
});

test('W3. 읽기 전 확인 요청(OPTIONS)에 GET 과 Authorization 을 허락한다', async () => {
  const req = new Request('https://w.example/board', {
    method: 'OPTIONS', headers: { Origin: NOTES, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  });
  const res = await handleBoard(req, ENV, deps());
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/i);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /GET/);
});

test('W4. 토큰 확인 기억: 10분 안에는 GitHub 를 다시 부르지 않고, 10분 지나면 다시 부른다', async () => {
  let now = T0;
  const d = deps({ now: () => now });
  await handleBoard(post({ rows: [] }), ENV, d);
  await handleBoard(get(), ENV, d);
  now = T0 + OWNER_CACHE_MS - 1;
  await handleBoard(get(), ENV, d);
  assert.equal(d.calls.length, 1);
  now = T0 + OWNER_CACHE_MS + 1;
  await handleBoard(get(), ENV, d);
  assert.equal(d.calls.length, 2);
  // 다른 토큰은 따로 확인한다
  await handleBoard(get('another-token'), ENV, d);
  assert.equal(d.calls.length, 3);
});

test('W5. 한 번도 안 올렸으면 404, GitHub 에 닿지 못하면 502', async () => {
  assert.equal((await handleBoard(get(), ENV, deps())).status, 404);
  const down = deps({ fetchImpl: async () => { throw new Error('network'); } });
  assert.equal((await handleBoard(get(), ENV, down)).status, 502);
});

test('W5. 귀가편 경로(/)는 예전과 같다: 작업노트 주소가 아니면 403', async () => {
  const res = await worker.fetch(new Request('https://w.example/', { headers: { Origin: 'https://evil.example' } }), {}, {});
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, '허용하지 않은 주소');
});
