import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_MS, RELOAD_GAP_MS, isNewDeploy, shouldReload, hasDraft, loadedStamp, latestStamp } from '../app/update.mjs';

const OLD = 'Thu, 26 Nov 2026 07:08:10 GMT';
const NEW = 'Thu, 26 Nov 2026 07:14:52 GMT';

test('U1. 브라우저가 가진 파일과 사이트 최신 파일의 배포 시각이 다르면 새 배포다', () => {
  assert.equal(isNewDeploy(OLD, NEW), true);
  assert.equal(isNewDeploy(NEW, NEW), false);
  assert.equal(isNewDeploy(null, NEW), false); // 모르면 다시 열지 않는다
  assert.equal(isNewDeploy(OLD, null), false);
});

const idle = { hidden: false, typing: false, saving: false, lastReloadAt: null, now: 1_000_000 };

test('U2. 글을 쓰는 중이나 저장 중에는 다시 열지 않는다', () => {
  assert.equal(shouldReload(idle), true);
  assert.equal(shouldReload({ ...idle, typing: true }), false);
  assert.equal(shouldReload({ ...idle, saving: true }), false);
  assert.equal(shouldReload({ ...idle, hidden: true, typing: true }), false); // 안 보여도 쓰던 글은 지킨다
});

test('U7. 처음 값에서 바뀐 글 칸이 있으면(커서가 떠나도) 쓰던 글로 본다', () => {
  assert.equal(hasDraft([{ type: 'text', value: '', defaultValue: '' }, { type: 'checkbox', value: 'on', defaultValue: 'on' }]), false);
  assert.equal(hasDraft([{ type: 'text', value: '발권할 제목', defaultValue: '' }]), true);
  assert.equal(hasDraft([{ type: 'password', value: 'tok', defaultValue: '' }]), true); // 토큰 넣는 칸
  assert.equal(hasDraft([{ type: 'hidden', value: 'x', defaultValue: '' }, { type: 'submit', value: '발권', defaultValue: '' }]), false);
  assert.equal(hasDraft([{ tagName: 'TEXTAREA', value: '메모', defaultValue: '' }]), true);
  // 처음부터 값이 들어 있고 그대로면 쓰던 글이 아니다(그런 칸이 있다고 새 버전을 영영 못 받으면 안 된다, 리뷰 P2 11-26)
  assert.equal(hasDraft([{ type: 'date', value: '2026-12-01', defaultValue: '2026-12-01' }]), false);
  assert.equal(hasDraft([{ type: 'date', value: '2026-12-02', defaultValue: '2026-12-01' }]), true);
});

test('U3. 2분 안에 이미 한 번 다시 열었으면 또 열지 않는다(배포가 덜 퍼졌을 때 계속 다시 열리는 것을 막는다)', () => {
  assert.equal(shouldReload({ ...idle, lastReloadAt: idle.now - 60_000 }), false);
  assert.equal(shouldReload({ ...idle, lastReloadAt: idle.now - RELOAD_GAP_MS - 1 }), true);
  assert.equal(RELOAD_GAP_MS, 120_000);
});

test('U4. 확인 간격은 1분', () => {
  assert.equal(UPDATE_MS, 60_000);
});

// 화면을 연 순간 한 번만 "지금 쓰는 파일의 배포 시각"을 기억한다. 확인할 때마다 보관본을 다시 보면,
// 다른 탭이 보관본을 새것으로 바꿔 놓았을 때 예전 코드로 도는 탭이 자기가 최신이라고 착각한다(11-26 확인)
test('U5. loadedStamp 는 브라우저 보관본(force-cache)의 Last-Modified, latestStamp 는 사이트 최신(no-store, HEAD)', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push([url, init.cache, init.method ?? 'GET']);
    return new Response(null, { headers: { 'last-modified': init.cache === 'force-cache' ? OLD : NEW } });
  };
  assert.equal(await loadedStamp(fetchFn), OLD);
  assert.equal(await latestStamp(fetchFn), NEW);
  assert.deepEqual(calls, [
    ['/app/main.mjs', 'force-cache', 'GET'],
    ['/app/main.mjs', 'no-store', 'HEAD'],
  ]);
});

test('U5. 사이트에 닿지 못하거나(오프라인) 실패 응답이면 null(새 배포로 보지 않는다)', async () => {
  const offline = async () => {
    throw new TypeError('Failed to fetch');
  };
  assert.equal(await loadedStamp(offline), null);
  assert.equal(await latestStamp(offline), null);
  const notFound = async () => new Response(null, { status: 404, headers: { 'last-modified': NEW } });
  assert.equal(await latestStamp(notFound), null);
});
