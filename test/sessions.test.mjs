import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_URL, STALE_MS, loadBoard, boardView, canOpenSessions, sessionHref, sortRows,
  KIND_LABEL, activityText, poseFor, sinceText,
} from '../app/sessions.mjs';

// 세션 현황판 카드 검사 (11-27). 맥 메뉴 막대 앱이 올린 목록을 Worker /board 에서 읽는다

const NOW = Date.UTC(2026, 10, 27, 1, 0, 0);
const row = (over = {}) => ({
  id: 'local_a1', title: '주식 종목 분석', kind: 'working', detail: null, activity: null,
  since: new Date(NOW - 5 * 60 * 1000).toISOString(), titleMissing: false, ...over,
});
const body = (rows, minutesAgo = 0) => ({ receivedAt: new Date(NOW - minutesAgo * 60 * 1000).toISOString(), rows });

const fakeFetch = (status, json) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    return new Response(JSON.stringify(json), { status });
  };
  return { fetchImpl, calls };
};

test('N1. 받은 결과 -> 카드 상태: 목록, 빈 목록, 실패, 토큰 문제, 아직 안 보냄', async () => {
  const ok = fakeFetch(200, body([row()]));
  const listed = await loadBoard(ok.fetchImpl, 'gh-token');
  assert.equal(listed.state, 'list');
  assert.equal(ok.calls[0].url, BOARD_URL);
  assert.equal(ok.calls[0].auth, 'Bearer gh-token');

  assert.equal((await loadBoard(fakeFetch(200, body([])).fetchImpl, 't')).state, 'empty');
  assert.equal((await loadBoard(fakeFetch(401, { error: 'x' }).fetchImpl, 't')).state, 'token');
  assert.equal((await loadBoard(fakeFetch(403, { error: 'x' }).fetchImpl, 't')).state, 'token');
  assert.equal((await loadBoard(fakeFetch(404, { error: 'x' }).fetchImpl, 't')).state, 'notSent');
  assert.equal((await loadBoard(fakeFetch(502, { error: 'GitHub 에 닿지 못했어요' }).fetchImpl, 't')).state, 'failed');
  assert.equal((await loadBoard(fakeFetch(200, body([])).fetchImpl, null)).state, 'token'); // 토큰이 없으면 부르지 않는다
});

test('N1. 카드 처음 상태는 로딩', () => {
  assert.equal(boardView(null, NOW).state, 'loading');
});

test('N2. 3분 넘은 목록은 오래됨으로 표시하고 받은 시각 문구를 붙인다', () => {
  const fresh = boardView({ state: 'list', body: body([row()], 2) }, NOW);
  assert.equal(fresh.stale, false);
  const old = boardView({ state: 'list', body: body([row()], 4) }, NOW);
  assert.equal(old.stale, true);
  assert.equal(old.ageText, '맥에서 4분 전에 받은 목록이에요');
  assert.equal(STALE_MS, 3 * 60 * 1000);
});

test('N3. 맥 브라우저에서만 세션 링크, 아이폰, 아이패드(맥처럼 보여도 터치), 안드로이드는 없음', () => {
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 };
  const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 };
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 };
  const android = { userAgent: 'Mozilla/5.0 (Linux; Android 15)', maxTouchPoints: 5 };
  assert.equal(canOpenSessions(mac), true);
  assert.equal(canOpenSessions(ipad), false);
  assert.equal(canOpenSessions(iphone), false);
  assert.equal(canOpenSessions(android), false);

  assert.equal(sessionHref(row(), true), 'claude://code/continue?session=local_a1');
  assert.equal(sessionHref(row(), false), null);
  assert.equal(sessionHref(row({ id: 'cli_65d1' }), true), null); // 앱 세션을 못 찾은 줄
  assert.equal(sessionHref(row({ id: 'local_a&b' }), true), null);
});

test('N4. 순서와 문구가 메뉴 막대와 같다: 답 기다림 -> 일하는 중(최근 순) -> 확인 필요 -> 끝남', () => {
  const rows = sortRows([
    row({ id: 'local_d', kind: 'done' }),
    row({ id: 'local_w1', kind: 'working', since: new Date(NOW - 9 * 60000).toISOString() }),
    row({ id: 'local_q', kind: 'waiting' }),
    row({ id: 'local_r', kind: 'review' }),
    row({ id: 'local_w2', kind: 'working', since: new Date(NOW - 2 * 60000).toISOString() }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['local_q', 'local_w2', 'local_w1', 'local_r', 'local_d']);
  assert.deepEqual(KIND_LABEL, { waiting: '답 기다림', working: '일하는 중', review: '확인 필요', done: '끝남' });
  assert.equal(sinceText(new Date(NOW - 20 * 1000).toISOString(), NOW), '방금');
  assert.equal(sinceText(new Date(NOW - 5 * 60000).toISOString(), NOW), '5분 전');
  assert.equal(sinceText(new Date(NOW - 95 * 60000).toISOString(), NOW), '1시간 전');
});

test('N5. 응답이 느리면 시간 제한 뒤 실패, 네트워크 오류도 실패, 깨진 응답도 실패', async () => {
  const never = () => new Promise(() => {});
  const slow = await loadBoard(never, 't', { timeoutMs: 20 });
  assert.equal(slow.state, 'failed');
  const thrown = await loadBoard(async () => { throw new Error('offline'); }, 't');
  assert.equal(thrown.state, 'failed');
  const broken = await loadBoard(async () => new Response('<html>', { status: 200 }), 't');
  assert.equal(broken.state, 'failed');
});

test('N6. 상태별 캐릭터 동작과 하는 일 문구', () => {
  assert.equal(poseFor('working'), 'type');
  assert.equal(poseFor('waiting'), 'wave');
  assert.equal(poseFor('review'), 'paper');
  assert.equal(poseFor('done'), 'sleep');
  assert.equal(activityText('editing'), '파일 고치는 중');
  assert.equal(activityText('running'), '명령 실행 중');
  assert.equal(activityText('delegating'), '서브 에이전트에 맡기는 중');
  assert.equal(activityText('nope'), null);
});
