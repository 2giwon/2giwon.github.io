// 세션 현황판 Worker 부분 (11-27). 귀가편 Worker 와 같은 주소의 /board 경로에서 돈다.
// - 쓰기(POST): 맥 메뉴 막대 앱 Claude Usage Bar 가 세션 목록을 올린다. 브라우저가 아니라 Origin 이 없으므로
//   주소 대신 쓰기 열쇠(Cloudflare 비밀값 BOARD_WRITE_KEY)로 막는다
// - 읽기(GET): 작업노트가 읽는다. 작업노트 주소에서 온 요청이고, 함께 보낸 GitHub 토큰의 주인이 BOARD_OWNER 일 때만 준다.
//   세션 제목에 회사 업무 이름이 들어 있어서 막는다. 토큰은 저장하지 않고 지문(SHA-256)만 10분 기억한다
// 목록은 Durable Object 한 곳에 저장한다(store.get/put). 여러 곳에서 돌아도 같은 목록을 본다

export const BOARD_ALLOWED = ['https://2giwon.github.io', 'http://localhost:5300', 'http://127.0.0.1:5300'];
export const MAX_BYTES = 64 * 1024;
export const MAX_ROWS = 100;
export const KINDS = ['waiting', 'working', 'review', 'done'];
export const ACTIVITIES = ['reading', 'editing', 'running', 'researching', 'delegating', 'planning', 'tool'];
export const OWNER_CACHE_MS = 10 * 60 * 1000;

const ID_RE = /^(local_[A-Za-z0-9-]{1,64}|cli_[A-Za-z0-9_-]{1,128})$/;

export const createOwnerCache = () => new Map();

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function bearer(request) {
  const value = request.headers.get('Authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

// 글자 길이와 상관없이 끝까지 비교한다(어디서 틀렸는지 시간으로 알 수 없게)
function sameText(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isText = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

// 올라온 본문을 검사하고, 허용한 칸만 남긴 목록을 돌려준다. 문제가 있으면 { error }
export function parseBoard(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: '깨진 JSON' };
  }
  if (!body || !Array.isArray(body.rows)) return { error: 'rows 가 없어요' };
  if (body.rows.length > MAX_ROWS) return { error: `줄은 ${MAX_ROWS}개까지` };
  const rows = [];
  for (const r of body.rows) {
    if (!r || !ID_RE.test(String(r.id ?? ''))) return { error: '이상한 세션 번호' };
    if (!isText(r.title, 200)) return { error: '제목이 없거나 너무 길어요' };
    if (!KINDS.includes(r.kind)) return { error: '모르는 상태' };
    if (r.detail != null && (typeof r.detail !== 'string' || r.detail.length > 300)) return { error: '설명이 너무 길어요' };
    if (r.activity != null && !ACTIVITIES.includes(r.activity)) return { error: '모르는 하는 일' };
    if (typeof r.since !== 'string' || Number.isNaN(Date.parse(r.since))) return { error: '시각이 이상해요' };
    rows.push({
      id: r.id,
      title: r.title,
      kind: r.kind,
      detail: r.detail || null,
      activity: r.activity ?? null,
      since: new Date(r.since).toISOString(),
      titleMissing: r.titleMissing === true,
    });
  }
  return { rows };
}

async function handleWrite(request, env, { store, now }) {
  if (!env.BOARD_WRITE_KEY) return json({ error: '쓰기 열쇠(BOARD_WRITE_KEY)가 없어요' }, 500);
  const key = bearer(request);
  if (!key || !sameText(key, String(env.BOARD_WRITE_KEY))) return json({ error: '쓰기 열쇠가 맞지 않아요' }, 401);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES) return json({ error: '본문이 너무 커요' }, 400);
  const parsed = parseBoard(text);
  if (parsed.error) return json({ error: parsed.error }, 400);
  await store.put({ receivedAt: new Date(now()).toISOString(), rows: parsed.rows });
  return json({ ok: true, rows: parsed.rows.length }, 200);
}

// GitHub 토큰 주인 확인. 맞으면 null, 아니면 응답
async function checkOwner(token, env, { cache, now, fetchImpl }, cors) {
  const owner = String(env.BOARD_OWNER ?? '').toLowerCase();
  if (!owner) return json({ error: '주인(BOARD_OWNER) 설정이 없어요' }, 500, cors);
  const print = await sha256(token);
  const hit = cache.get(print);
  if (hit && now() - hit.at < OWNER_CACHE_MS) return null;

  let res;
  try {
    res = await fetchImpl('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'giwon-note-session-board',
      },
    });
  } catch {
    return json({ error: 'GitHub 에 닿지 못했어요' }, 502, cors);
  }
  if (res.status === 401) return json({ error: 'GitHub 토큰이 맞지 않아요' }, 401, cors);
  if (!res.ok) return json({ error: `GitHub 확인 실패 (${res.status})` }, 502, cors);
  const user = await res.json().catch(() => null);
  if (String(user?.login ?? '').toLowerCase() !== owner) return json({ error: '이 토큰으로는 볼 수 없어요' }, 403, cors);
  cache.set(print, { at: now() });
  return null;
}

async function handleRead(request, env, deps, cors) {
  const token = bearer(request);
  if (!token) return json({ error: 'GitHub 토큰이 없어요' }, 401, cors);
  const denied = await checkOwner(token, env, deps, cors);
  if (denied) return denied;
  const board = await deps.store.get();
  if (!board) return json({ error: '아직 받은 목록이 없어요' }, 404, cors);
  return json(board, 200, cors);
}

// deps: { store: { get, put }, cache, now: () => ms, fetchImpl }
export async function handleBoard(request, env, deps) {
  if (request.method === 'POST') return handleWrite(request, env, deps);

  const origin = request.headers.get('Origin') ?? '';
  if (!BOARD_ALLOWED.includes(origin)) return json({ error: '허용하지 않은 주소' }, 403);
  const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '600' },
    });
  }
  if (request.method !== 'GET') return json({ error: 'GET 만 받아요' }, 405, cors);
  return handleRead(request, env, deps, cors);
}

// 목록을 들고 있는 Durable Object. SQLite 저장 방식이라 무료 요금제에서도 돈다
export class SessionBoard {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.method === 'PUT') {
      await this.ctx.storage.put('board', await request.json());
      return new Response('ok');
    }
    const board = await this.ctx.storage.get('board');
    return new Response(JSON.stringify(board ?? null), { headers: { 'Content-Type': 'application/json' } });
  }
}

// Worker 에서 Durable Object 를 store 모양으로 감싼다
export function durableStore(env) {
  const stub = env.SESSION_BOARD.get(env.SESSION_BOARD.idFromName('main'));
  return {
    get: async () => (await stub.fetch('https://board/', { method: 'GET' })).json(),
    put: async (board) => {
      await stub.fetch('https://board/', { method: 'PUT', body: JSON.stringify(board) });
    },
  };
}
