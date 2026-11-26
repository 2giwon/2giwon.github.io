import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_MS, canRefresh, tasksChanged } from '../app/live.mjs';

const calm = { hidden: false, busy: false, adding: false, dragging: false, editing: false };

test('L1. 화면이 보이고 아무것도 하지 않을 때만 할 일을 다시 읽는다', () => {
  assert.equal(canRefresh(calm), true);
  assert.equal(canRefresh({ ...calm, hidden: true }), false); // 다른 탭이나 앱으로 갔을 때
  assert.equal(canRefresh({ ...calm, busy: true }), false); // 저장하는 중
  assert.equal(canRefresh({ ...calm, adding: true }), false); // 발권 칸에 쓰는 중
  assert.equal(canRefresh({ ...calm, dragging: true }), false); // 탑승권을 미는 중
  assert.equal(canRefresh({ ...calm, editing: true }), false); // 뒷면의 단계 고르기 같은 칸을 만지는 중
});

test('L2. 파일 지문(sha)이 바뀌었을 때만 다시 그린다', () => {
  assert.equal(tasksChanged('a', 'a'), false);
  assert.equal(tasksChanged('a', 'b'), true);
  assert.equal(tasksChanged(null, 'b'), true); // 파일이 없다가 생겼다
  assert.equal(tasksChanged('a', null), true); // 파일이 지워졌다
  assert.equal(tasksChanged(null, null), false);
});

test('L4. 다시 읽는 간격은 10초(11-26 사용자 요청으로 20초에서 줄임)', () => {
  assert.equal(LIVE_MS, 10000);
});
