import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, frameCell, sheetFor, animFrame, loadRoomArt, actorAt, ROOM_MAX, SEATS, STANDS, LIES } from '../app/session-room.mjs';

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
  // 일하는 중은 책상(컴퓨터)을 바라보는 뒷모습(3줄). 옆모습 앉기(8줄)는 책상 옆에 서 있는 것처럼 보였다(11-27 사용자 지적)
  assert.deepEqual(frameCell('sit', 1), { row: 3, col: 1, dy: 1 });
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

test('R10. 의자마다 덧그릴 의자 자리가 있고, 사람 가운데가 의자 가운데에 온다(의자 등받이가 다리를 가려 앉은 모습)', () => {
  for (const seat of SEATS) {
    assert.ok(Array.isArray(seat.chair) && seat.chair.length === 2);
    const chairCenter = seat.chair[0] + 5; // 의자 그림 폭 10
    const personCenter = seat.x + 40; // 그림판 칸 80 의 가운데
    assert.ok(Math.abs(chairCenter - personCenter) <= 1, `${chairCenter} vs ${personCenter}`);
    // 머리는 의자 위로 보이고(사람 위쪽 18도트가 의자보다 위), 다리는 의자에 가린다(사람 아래쪽 47도트가 의자 안)
    assert.ok(seat.y + 18 < seat.chair[1]);
    assert.ok(seat.y + 47 >= seat.chair[1] && seat.y + 47 <= seat.chair[1] + 14);
  }
});

test('R11. 앉아서 일할 때는 프레임마다 몸이 1도트 오르내린다(타자 치는 느낌), 다른 동작은 그대로', () => {
  assert.equal(frameCell('sit', 0).dy, 0);
  assert.equal(frameCell('sit', 1).dy, 1);
  assert.equal(frameCell('stand', 1).dy ?? 0, 0);
});

test('R12. 방에서 누른 자리(방 도트 좌표)에 있는 캐릭터를 찾는다. 겹치면 앞(아래)에 있는 사람', () => {
  const layout = layoutRoom(rows('waiting', 'working', 'done'));
  const [stand, sit, lie] = layout.actors;
  // 서 있는 사람 몸, 머리 위 번호와 말풍선 자리도 누를 수 있다
  assert.equal(actorAt(layout, stand.spot.x + 40, stand.spot.y + 35)?.n, 1);
  assert.equal(actorAt(layout, stand.spot.x + 50, stand.spot.y + 10)?.n, 1);
  // 앉은 사람
  assert.equal(actorAt(layout, sit.spot.x + 40, sit.spot.y + 30)?.n, 2);
  // 누운 사람은 가로로 길다
  assert.equal(actorAt(layout, lie.spot.x + 22, lie.spot.y + 40)?.n, 3);
  // 빈 자리
  assert.equal(actorAt(layout, 180, 128), null);
  // 겹치면 아래(앞)에 그려진 사람
  const overlap = { actors: [
    { n: 1, spot: { x: 50, y: 40 }, pose: 'stand' },
    { n: 2, spot: { x: 52, y: 50 }, pose: 'stand' },
  ], overflow: 0 };
  assert.equal(actorAt(overlap, 92, 75)?.n, 2);
});

test('R13. 번호와 말풍선을 먼저 판정한다(codex P2, P3): 붙어 앉은 두 사람의 번호, 누운 사람의 Zz 말풍선', () => {
  const two = layoutRoom(rows('working', 'working'));
  const [first] = two.actors;
  // 첫 사람 번호 동그라미 가운데(머리 위)
  assert.equal(actorAt(two, first.spot.x + 40, first.spot.y + 12)?.n, 1);
  const sleeper = layoutRoom(rows('done'));
  const lie = sleeper.actors[0];
  // 누운 사람 말풍선(번호 오른쪽 위) 가운데
  assert.equal(actorAt(sleeper, lie.spot.x + 51, lie.spot.y + 21)?.n, 1);
});

test('R8. 동작 줄이기 설정이면 프레임 0 고정', () => {
  assert.equal(animFrame(7, true), 0);
  assert.equal(animFrame(7, false), 7);
});
