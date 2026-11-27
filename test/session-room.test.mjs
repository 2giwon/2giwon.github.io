import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, frameCell, sheetFor, animFrame, loadRoomArt, ROOM_MAX, SEATS, STANDS, LIES } from '../app/session-room.mjs';

// 세션 카드 "방" 장면 (11-27, 사용자가 고른 P 방 + W 캐릭터). 자리 배치와 그림 고르기만 검사한다(그림 자체는 화면 확인)

const row = (id, kind) => ({ id: `local_${id}`, title: id, kind, since: '2026-11-27T00:00:00.000Z' });
const rows = (...kinds) => kinds.map((k, i) => row(`s${i}`, k));

test('R1. 일하는 중 3명까지 책상 의자에 앉고, 4번째는 서 있는 자리', () => {
  const { actors } = layoutRoom(rows('working', 'working', 'working', 'working'));
  assert.deepEqual(actors.slice(0, 3).map((a) => a.pose), ['sit', 'sit', 'sit']);
  assert.deepEqual(actors.slice(0, 3).map((a) => a.spot), SEATS);
  assert.equal(actors[3].pose, 'stand');
  assert.ok(STANDS.includes(actors[3].spot));
  assert.equal(actors[3].bubble, null);
});

test('R2. 답 기다림은 "!", 확인 필요는 "?" 말풍선과 서 있는 자리', () => {
  const { actors } = layoutRoom(rows('waiting', 'review'));
  assert.equal(actors[0].pose, 'stand'); assert.equal(actors[0].bubble, '!');
  assert.equal(actors[1].pose, 'stand'); assert.equal(actors[1].bubble, '?');
  assert.notEqual(actors[0].spot, actors[1].spot);
});

test('R3. 끝남은 눕는 자리 2개까지 누워 자고, 그다음은 서서 졸기', () => {
  const { actors } = layoutRoom(rows('done', 'done', 'done'));
  assert.deepEqual(actors.map((a) => a.pose), ['lie', 'lie', 'doze']);
  assert.deepEqual(actors.slice(0, 2).map((a) => a.spot), LIES);
  assert.ok(actors.every((a) => a.bubble === 'z'));
});

test('R4. 방에는 최대 6명, 넘친 수를 알려 주고 번호는 목록 순서와 같다', () => {
  assert.equal(ROOM_MAX, 6);
  const list = rows('waiting', 'working', 'working', 'review', 'done', 'done', 'done', 'done');
  const { actors, overflow } = layoutRoom(list);
  assert.equal(actors.length, 6);
  assert.equal(overflow, 2);
  assert.deepEqual(actors.map((a) => a.n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(actors.map((a) => a.id), list.slice(0, 6).map((r) => r.id));
  // 서 있는 자리가 모자라면(답 기다림 5명) 자리를 못 받은 사람도 넘친 수로 센다
  const crowd = layoutRoom(rows('waiting', 'waiting', 'waiting', 'waiting', 'waiting'));
  assert.equal(crowd.actors.length, STANDS.length);
  assert.equal(crowd.overflow, 5 - STANDS.length);
  // 두 사람이 같은 자리에 서지 않는다
  assert.equal(new Set(crowd.actors.map((a) => a.spot)).size, crowd.actors.length);
  assert.deepEqual(layoutRoom([]), { actors: [], overflow: 0 });
});

test('R5. 동작과 프레임 -> 그림판 칸(줄은 1부터, 칸은 0부터)', () => {
  assert.deepEqual(frameCell('stand', 0), { row: 1, col: 0 });
  assert.deepEqual(frameCell('stand', 1), { row: 1, col: 1 });
  assert.deepEqual(frameCell('stand', 2), { row: 1, col: 0 });
  assert.deepEqual(frameCell('sit', 1), { row: 8, col: 1 });
  assert.deepEqual(frameCell('lie', 5), { row: 11, col: 0 });
  assert.deepEqual(frameCell('doze', 3), { row: 9, col: 0 });
});

test('R6. 남자, 여자는 세션 번호로 정해지고 같은 번호는 늘 같다', () => {
  assert.equal(sheetFor('local_a1'), sheetFor('local_a1'));
  assert.ok(['man', 'woman'].includes(sheetFor('local_a1')));
  const ids = Array.from({ length: 12 }, (_, i) => `local_x${i}`);
  assert.equal(new Set(ids.map(sheetFor)).size, 2); // 두 사람 모두 나온다
  assert.equal(layoutRoom([row('a1', 'working')]).actors[0].sheet, sheetFor('local_a1'));
});

test('R7. 그림 불러오기: 모두 받으면 ready, 하나라도 실패하면 failed', async () => {
  const names = [];
  const ok = await loadRoomArt(async (name) => { names.push(name); return new ArrayBuffer(4); }, async (bytes) => ({ w: bytes.byteLength }));
  assert.equal(ok.state, 'ready');
  assert.deepEqual(names.sort(), ['furniture.png', 'npc-man.png', 'npc-woman.png', 'room.png']);
  assert.ok(ok.images.room && ok.images.furniture && ok.images.man && ok.images.woman);
  const bad = await loadRoomArt(async (name) => { if (name === 'npc-man.png') throw new Error('404'); return new ArrayBuffer(4); }, async () => ({}));
  assert.equal(bad.state, 'failed');
  const badDecode = await loadRoomArt(async () => new ArrayBuffer(4), async () => { throw new Error('broken png'); });
  assert.equal(badDecode.state, 'failed');
});

test('R8. 동작 줄이기 설정이면 프레임 0 고정', () => {
  assert.equal(animFrame(7, true), 0);
  assert.equal(animFrame(7, false), 7);
});
