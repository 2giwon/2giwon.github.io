import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutRoom, frameCell, lookFor, PEOPLE, restFor, headAt, bodyBox, animFrame, loadRoomArt, actorAt, ROOM_MAX, SEATS, STANDS, REST,
  ARMCHAIR, ARMCHAIR_FRONT, ARMCHAIRS, CAT_ACTS, catAt, pickAt, depthOf,
} from '../app/session-room.mjs';

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

// R3 은 11-27 에 바뀌었다: 예전에는 끝남이 러그 두 곳에 모두 누웠는데, 사용자가 "침대도 있는데 다양하게 쉬어도 될 것 같다"고 해서
// 쉬는 자리 네 곳(침대, 파란 러그, 벽난로 앞, 빨간 러그)으로 나눴다. 자세한 검사는 R14~R19
test('R3. 끝남은 쉬는 자리에서 쉬고 모두 "Zz" 말풍선', () => {
  const { actors } = layoutRoom(rows('done', 'done', 'done'));
  assert.ok(actors.every((a) => REST.some((s) => s.spot === a.spot)));
  assert.ok(actors.every((a) => a.bubble === 'z'));
});

const doneRows = (ids) => ids.map((id) => row(id, 'done'));
// restFor 가 원하는 값을 돌려주는 세션 번호를 찾는다
const idsWithRest = (want, count, skip = new Set()) => {
  const out = [];
  for (let i = 0; out.length < count && i < 5000; i += 1) {
    const id = `r${i}`;
    if (!skip.has(id) && restFor(`local_${id}`) === want) out.push(id);
  }
  return out;
};

test('R14. 끝남 네 명은 침대, 파란 러그, 벽난로 앞, 빨간 러그에 한 명씩 가고 모습이 모두 다르다', () => {
  // 파란 러그와 벽난로 옆은 둘 다 안락의자(11-27, 옆 의자에 옆모습으로 앉히던 방식을 버렸다. R17 참고)
  assert.deepEqual(REST.map((r) => r.pose), ['bed', 'armchair', 'armchair', 'lie']);
  const ids = [0, 1, 2, 3].map((k) => idsWithRest(k, 1)[0]);
  const { actors } = layoutRoom(doneRows(ids));
  assert.deepEqual(actors.map((a) => a.spot), REST.map((r) => r.spot));
  assert.equal(new Set(actors.map((a) => a.pose)).size, 3);
});

test('R15. 같은 세션은 늘 같은 자리, 같은 모습이고 여러 세션이면 네 자리가 모두 나온다', () => {
  const id = 'local_keep1';
  assert.equal(restFor(id), restFor(id));
  const alone = layoutRoom([row('keep1', 'done')]).actors[0];
  assert.equal(alone.spot, REST[restFor(id)].spot);
  assert.equal(alone.pose, REST[restFor(id)].pose);
  const list = rows('done', 'working', 'done', 'done');
  assert.deepEqual(layoutRoom(list), layoutRoom(list));
  const seen = new Set(Array.from({ length: 40 }, (_, i) => restFor(`local_z${i}`)));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  // 캐릭터와 묶이지 않는다: 같은 캐릭터 안에서도 쉬는 자리가 둘 이상 나온다
  const same = Array.from({ length: 300 }, (_, i) => `local_m${i}`).filter((x) => lookFor(x) === 0);
  assert.ok(new Set(same.map(restFor)).size > 1);
});

test('R16. 원하는 자리가 찼으면 다음 빈 자리로, 다섯 번째는 서 있는 자리에서 서서 졸기', () => {
  const [a, b] = idsWithRest(0, 2); // 둘 다 침대를 원한다
  const { actors } = layoutRoom(doneRows([a, b]));
  assert.equal(actors[0].pose, 'bed');
  assert.equal(actors[1].spot, REST[1].spot); // 다음 자리(파란 러그)
  const five = layoutRoom(doneRows(['f0', 'f1', 'f2', 'f3', 'f4'])).actors;
  assert.equal(new Set(five.slice(0, 4).map((x) => x.spot)).size, 4);
  assert.equal(five[4].pose, 'doze');
  assert.ok(STANDS.includes(five[4].spot));
});

// R17, R5, R11 은 11-27 Memao 그림으로 바뀌었다(칸 48x48, 동작이 줄을 넘어 이어 붙어 칸 번호로 짚는다).
// 예전 Pixel Gnome 그림판은 줄, 칸으로 짚었다
// 11-27: 옆에서 본 의자에 옆모습으로 앉히던 방식은 버렸다. Memao 앉기 그림은 엉덩이에서 발까지 7도트뿐이라 작은 의자에서
// 발이 떠 보였다(사용자: "의자보다 더 앞에 앉아 있다", "이건 안 돼"). 앞을 보는 LimeZu 안락의자에 앞모습으로 앉히고
// 팔걸이와 앞면을 덧그려 다리를 가린다(책상 의자와 같은 방식)
test('R17. 새 동작의 칸 번호: 침대는 눕기(190)를 돌리고, 안락의자는 앞모습 가만히(0~3)', () => {
  assert.deepEqual(frameCell('bed', 3), { frame: 190, turn: true });
  assert.deepEqual(frameCell('armchair', 1), { frame: 1 });
  assert.deepEqual(frameCell('armchair', 6), { frame: 2 });
  // 서서 조는 그림이 없어서 앞모습 첫 장(머리 위 Zz 로 잔다는 것을 보인다)
  assert.deepEqual(frameCell('doze', 1), { frame: 0 });
});

// 두 몸 범위가 3도트보다 깊이 겹치는지. Memao 캐릭터는 Pixel Gnome 보다 커서 가장자리 2도트 정도 맞닿는 자리가 생긴다(11-27)
const TOUCH = 3;
const overlaps = (a, b) => a.l + TOUCH < b.r && b.l + TOUCH < a.r && a.t + TOUCH < b.b && b.t + TOUCH < a.b;

test('R20. 안락의자 두 개는 늘 놓여 있고, 앉은 사람 허리가 앉는 판에 오며, 덧그리는 부분은 팔걸이와 앞면이다', () => {
  // LimeZu 안락의자: 그림판 x 160, y 288, 16x26. 위 14도트가 등받이, 그 아래가 앉는 판과 앞면, 양옆 2도트가 팔걸이
  assert.deepEqual(ARMCHAIR, [160, 288, 16, 26]);
  assert.deepEqual(ARMCHAIR_FRONT, [[0, 0, 2, 26], [14, 0, 2, 26], [0, 14, 16, 12]]);
  for (const i of [1, 2]) {
    const { spot } = REST[i];
    assert.equal(REST[i].pose, 'armchair');
    const [cx, cy] = spot.armchair;
    assert.ok(ARMCHAIRS.some(([x, y]) => x === cx && y === cy), '빈 의자도 방에 늘 놓는다');
    // Memao 앞모습은 칸 가운데가 x 24, 허리가 칸 y 30. 자리 칸에 (16, 7) 들여 놓으므로 자리 칸 x 40, y 37
    assert.equal(spot.x + 40, cx + 8, '사람 가운데가 의자 가운데');
    assert.equal(spot.y + 37, cy + 16, '허리가 앉는 판 높이(의자 위 14도트 아래 + 2)');
  }
  // 서 있는 사람과 누운 사람이 안락의자를 덮지 않는다(리뷰 P3: 빨간 러그에 누운 사람 머리가 오른쪽 팔걸이를 덮을 수 있었다)
  const others = [
    ...STANDS.map((s) => bodyBox({ pose: 'stand', spot: s })),
    bodyBox({ pose: 'lie', spot: REST[3].spot }),
  ];
  for (const [cx, cy] of ARMCHAIRS) {
    const chair = { l: cx, r: cx + 16, t: cy, b: cy + 26 };
    for (const b of others) {
      const hit = b.l < chair.r && chair.l < b.r && b.t < chair.b && chair.t < b.b;
      assert.ok(!hit, `안락의자 ${cx},${cy} 를 덮는다: ${JSON.stringify(b)}`);
    }
  }
});

test('R18. 침대, 러그에 앉기, 벽난로 앞 캐릭터의 몸, 번호, Zz 말풍선을 누르면 그 캐릭터', () => {
  const ids = [0, 1, 2, 3].map((k) => idsWithRest(k, 1)[0]);
  const layout = layoutRoom(doneRows(ids));
  for (const a of layout.actors) {
    const b = bodyBox(a);
    const h = headAt(a);
    assert.equal(actorAt(layout, (b.l + b.r) / 2, (b.t + b.b) / 2)?.n, a.n, `${a.pose} 몸`);
    assert.equal(actorAt(layout, h.x, h.y - 5)?.n, a.n, `${a.pose} 번호`);
    assert.equal(actorAt(layout, h.x + 11, h.y - 9)?.n, a.n, `${a.pose} 말풍선`);
  }
});

test('R19. 침대에서는 머리가 베개(y 74~78) 위에 오고, 몸은 침대 안에서 이불 덧그림에 가린다', () => {
  const bed = REST[0];
  const { x, y } = bed.spot;
  assert.ok(x >= 16 && x + 16 <= 32, '침대 폭(x 16~31) 안');
  assert.ok(y <= 76 && y + 12 >= 76, '머리(돌린 그림 위쪽 12도트)가 베개에 걸친다');
  const [qx, qy, qw, qh] = bed.spot.quilt; // 다시 덧그릴 이불과 발판(room.png 좌표)
  assert.ok(qx <= x && qx + qw >= x + 16, '이불이 몸 폭을 덮는다');
  // 처음에 이불을 y 79 부터 덮었더니 얼굴까지 가려 머리카락만 보였다(11-27 캡처). 돌린 그림 위쪽 10도트(얼굴)는 이불 밖
  assert.ok(qy >= y + 10 && qy <= 84, '얼굴은 이불 밖, 몸은 이불 안');
  const [, cy, , ch] = bed.spot.clip; // 침대 밖으로 다리가 나오지 않게 자른다
  assert.ok(cy + ch <= 95 && qy + qh >= cy + ch, '잘린 끝까지 이불이 덮는다');
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

test('R5. 동작과 프레임 -> 칸 번호(Memao, 줄 x 8 + 칸)', () => {
  // 가만히 앞모습 0~3 을 번갈아
  assert.deepEqual(frameCell('stand', 0), { frame: 0 });
  assert.deepEqual(frameCell('stand', 1), { frame: 1 });
  assert.deepEqual(frameCell('stand', 5), { frame: 1 });
  // 일하는 중은 책상(컴퓨터)을 바라보는 뒷모습 4~7. 옆모습 앉기는 책상 옆에 서 있는 것처럼 보였다(11-27 사용자 지적)
  assert.deepEqual(frameCell('sit', 1), { frame: 5, dy: 1 });
  assert.deepEqual(frameCell('lie', 5), { frame: 190 });
});

test('P1. 방에 6명이 있으면 6명 모두 서로 다른 캐릭터', () => {
  assert.equal(PEOPLE.length, 10);
  for (let s = 0; s < 30; s += 1) {
    const list = Array.from({ length: 6 }, (_, i) => row(`p${s}_${i}`, ['waiting', 'working', 'done'][i % 3]));
    const looks = layoutRoom(list).actors.map((a) => a.look);
    assert.equal(new Set(looks).size, looks.length, `묶음 ${s}: ${looks}`);
  }
});

test('P2. 캐릭터는 세션 번호로 정해지고, 혼자면 늘 그 캐릭터, 여러 세션이면 10명이 모두 나온다', () => {
  assert.equal(lookFor('local_a1'), lookFor('local_a1'));
  assert.equal(layoutRoom([row('a1', 'working')]).actors[0].look, lookFor('local_a1'));
  const seen = new Set(Array.from({ length: 200 }, (_, i) => lookFor(`local_x${i}`)));
  assert.equal(seen.size, 10);
});

test('P3. 좋아하는 캐릭터를 앞선 세션이 쓰고 있으면 다음 캐릭터', () => {
  const ids = [];
  for (let i = 0; ids.length < 2; i += 1) if (lookFor(`local_q${i}`) === 3) ids.push(`q${i}`);
  const [a, b] = layoutRoom(ids.map((id) => row(id, 'waiting'))).actors;
  assert.equal(a.look, 3);
  assert.equal(b.look, 4);
});

test('R7. 그림 불러오기: 모두 받으면 ready, 하나라도 실패하면 failed', async () => {
  const names = [];
  const ok = await loadRoomArt(async (name) => { names.push(name); return new ArrayBuffer(4); }, async (bytes) => ({ w: bytes.byteLength }));
  assert.equal(ok.state, 'ready');
  // 11-27 고양이 그림(cat.png)이 더해지고, 사람은 Pixel Gnome 2장에서 Memao 10장(P5)으로 바뀌었다
  const memao = Array.from({ length: 10 }, (_, i) => `memao-${String(i + 1).padStart(2, '0')}.png`);
  // 안락의자 그림(LimeZu 가구 그림판, limezu-interiors.png)도 꼭 필요한 그림에 더해졌다
  assert.deepEqual(names.sort(), ['cat.png', 'furniture.png', 'limezu-interiors.png', ...memao, 'room.png'].sort());
  assert.ok(ok.images.room && ok.images.furniture && ok.images.interiors);
  assert.equal(ok.images.people.length, 10);
  assert.ok(ok.images.people.every(Boolean));
  const bad = await loadRoomArt(async (name) => { if (name === 'memao-04.png') throw new Error('404'); return new ArrayBuffer(4); }, async () => ({}));
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
  const layout = layoutRoom(rows('waiting', 'working'));
  const [stand, sit] = layout.actors;
  // 서 있는 사람 몸, 머리 위 번호와 말풍선 자리도 누를 수 있다
  assert.equal(actorAt(layout, stand.spot.x + 40, stand.spot.y + 35)?.n, 1);
  // 말풍선(Memao 는 Pixel Gnome 보다 4도트 커서 말풍선도 4도트 위, 11-27)
  assert.equal(actorAt(layout, stand.spot.x + 50, stand.spot.y + 6)?.n, 1);
  // 앉은 사람
  assert.equal(actorAt(layout, sit.spot.x + 40, sit.spot.y + 30)?.n, 2);
  // 누운 사람은 가로로 길다(R12 는 예전에 끝남 세션을 늘 러그에 눕혔다. 지금은 세션 번호로 쉬는 자리가 정해져서 빨간 러그 자리를 직접 만든다)
  const lie = { actors: [{ n: 3, kind: 'done', pose: 'lie', spot: REST[3].spot, bubble: 'z' }], overflow: 0 };
  assert.equal(actorAt(lie, REST[3].spot.x + 22, REST[3].spot.y + 40)?.n, 3);
  // 누운 Memao 그림은 자리 칸 y 30~52(리뷰 P3: 위아래 끝을 눌러도 골라져야 한다)
  assert.equal(actorAt(lie, REST[3].spot.x + 45, REST[3].spot.y + 31)?.n, 3);
  assert.equal(actorAt(lie, REST[3].spot.x + 45, REST[3].spot.y + 51)?.n, 3);
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
  // 누운 사람(빨간 러그) 자리를 직접 만든다. 세션 번호에 따라 쉬는 자리가 바뀌어서(R14) layoutRoom 결과로는 늘 눕지 않는다
  const sleeper = { actors: [{ n: 1, kind: 'done', pose: 'lie', spot: REST[3].spot, bubble: 'z' }], overflow: 0 };
  const lie = sleeper.actors[0];
  // 누운 사람 말풍선(번호 오른쪽 위) 가운데
  assert.equal(actorAt(sleeper, lie.spot.x + 51, lie.spot.y + 21)?.n, 1);
});

test('R21. 바닥 자리(서 있는 자리, 쉬는 자리)끼리 몸이 겹치지 않는다(가장자리 3도트 이내 맞닿음은 괜찮다)', () => {
  // 리뷰에서 잡힘(11-27): 세 번째 서 있는 자리를 옮기면서 두 번째 서 있는 자리와 겹쳤다.
  // 책상 의자(SEATS)는 뺀다. 책상 뒤에 앉은 사람 앞에 다른 사람이 서는 앞뒤 배치라서 겹쳐 보이는 것이 맞고,
  // 파란 러그는 책상 바로 아래에 있어서 피할 수 없다(두 번째 서 있는 자리와 세 번째 책상 의자도 처음부터 이렇게 겹쳤다)
  const spots = [
    ...STANDS.map((s) => ({ name: `서기 ${s.x},${s.y}`, b: bodyBox({ pose: 'stand', spot: s }) })),
    ...REST.map((r) => ({ name: r.pose, b: bodyBox(r) })),
  ];
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      const a = spots[i].b, b = spots[j].b;
      assert.ok(!overlaps(a, b), `${spots[i].name} 와 ${spots[j].name} 가 겹친다`);
    }
  }
});

// 고양이(11-27, 사용자: "일은 하지 않고 놀기만 하고 보는 사람 마음을 편하게 하는 고양이"). Elthen 고양이 그림판, 모두 오른쪽을 보는 옆모습.
// 고양이 상태는 시각만으로 계산한다(다시 그려도 튀지 않고 맥, 폰에서 같게)
const T0 = Date.UTC(2026, 10, 27, 3, 0, 0);
const samples = (fromMs, toMs, stepMs, opts) => {
  const out = [];
  for (let t = fromMs; t < toMs; t += stepMs) out.push({ t, ...catAt(t, opts) });
  return out;
};
const HOURS2 = samples(T0, T0 + 2 * 3600 * 1000, 1000);

test('C1. 같은 시각이면 고양이 상태가 늘 같다', () => {
  for (const t of [T0, T0 + 1234, T0 + 98765]) assert.deepEqual(catAt(t), catAt(t));
});

test('C2. 걷는 동안에는 출발 자리와 도착 자리 사이에 있고, 가는 쪽을 본다(왼쪽이면 뒤집기)', () => {
  const walks = HOURS2.filter((c) => c.act === 'walk' || c.act === 'run');
  assert.ok(walks.length > 0);
  for (const c of walks) {
    const { from, to } = c.walk;
    assert.ok(c.x >= Math.min(from.x, to.x) - 0.01 && c.x <= Math.max(from.x, to.x) + 0.01);
    assert.ok(c.y >= Math.min(from.y, to.y) - 0.01 && c.y <= Math.max(from.y, to.y) + 0.01);
    if (to.x !== from.x) assert.equal(c.flip, to.x < from.x);
  }
  // 왼쪽, 오른쪽 모두 걷는다
  assert.equal(new Set(walks.filter((c) => c.walk.to.x !== c.walk.from.x).map((c) => c.flip)).size, 2);
});

test('C3. 앉기, 그루밍, 놀기, 잠이 모두 나오고 잠은 다른 동작보다 길게 이어진다', () => {
  const acts = new Set(HOURS2.map((c) => c.act));
  for (const a of ['sit', 'blink', 'lick', 'wash', 'paw', 'sleep', 'walk']) assert.ok(acts.has(a), a);
  const longest = (act) => {
    let best = 0, run = 0;
    for (const c of HOURS2) { run = c.act === act ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  };
  assert.ok(longest('sleep') > 2 * longest('paw'), `잠 ${longest('sleep')}초, 놀기 ${longest('paw')}초`);
  assert.ok(longest('sleep') > 2 * longest('lick'));
});

test('C4. 고양이는 늘 방 바닥 안에 있다', () => {
  for (const c of HOURS2) {
    assert.ok(c.x >= 20 && c.x <= 170, `x ${c.x}`);
    assert.ok(c.y >= 86 && c.y <= 127, `y ${c.y}`);
  }
});

test('C5. 동작마다 그림판 줄이 맞고 칸 번호가 장 수를 넘지 않는다', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(CAT_ACTS).map(([k, v]) => [k, [v.row, v.n]])),
    { sit: [1, 4], blink: [2, 4], lick: [3, 4], wash: [4, 4], walk: [5, 8], run: [6, 8], sleep: [7, 4], paw: [8, 6], jump: [9, 7], scared: [10, 8] },
  );
  for (const c of samples(T0, T0 + 600 * 1000, 37)) {
    assert.equal(c.row, CAT_ACTS[c.act].row);
    assert.ok(Number.isInteger(c.col) && c.col >= 0 && c.col < CAT_ACTS[c.act].n);
  }
});

test('C6. 동작 줄이기 설정이면 같은 자리에 앉은 모습 첫 장으로 멈춘다', () => {
  const a = catAt(T0, { reduced: true });
  const b = catAt(T0 + 77777, { reduced: true });
  assert.equal(a.act, 'sit');
  assert.equal(a.col, 0);
  assert.deepEqual(a, b);
});

test('C7. 고양이 그림만 못 받으면 방은 그대로(ready) 그리고 고양이만 빠진다', async () => {
  const r = await loadRoomArt(async (name) => { if (name === 'cat.png') throw new Error('404'); return new ArrayBuffer(4); }, async () => ({}));
  assert.equal(r.state, 'ready');
  assert.equal(r.images.cat, undefined);
  assert.ok(r.images.room && r.images.people.length === 10);
  // 고양이 그림이 오래 걸려도 방은 기다리지 않는다(리뷰 P3). 1.5초까지만 기다리고 고양이만 뺀다
  const slow = await loadRoomArt(
    async (name) => (name === 'cat.png' ? new Promise(() => {}) : new ArrayBuffer(4)), async () => ({}), { optionalWaitMs: 20 },
  );
  assert.equal(slow.state, 'ready');
  assert.equal(slow.images.cat, undefined);
  // 1.5초는 꼭 필요한 그림이 다 온 뒤부터 센다(리뷰 P2: 사람 그림 10장이 느리면 고양이가 조용히 빠졌다)
  const wait = (ms, v) => new Promise((res) => setTimeout(() => res(v), ms));
  const lateCat = await loadRoomArt(
    async (name) => (name === 'cat.png' ? wait(60, new ArrayBuffer(1)) : wait(50, new ArrayBuffer(4))), async (b) => ({ n: b.byteLength }), { optionalWaitMs: 30 },
  );
  assert.equal(lateCat.state, 'ready');
  assert.deepEqual(lateCat.images.cat, { n: 1 });
  // 꼭 필요한 그림이 없으면 고양이가 있어도 failed
  const bad = await loadRoomArt(async (name) => { if (name === 'room.png') throw new Error('404'); return new ArrayBuffer(4); }, async () => ({}));
  assert.equal(bad.state, 'failed');
});

test('C8. 누른 자리: 사람이 먼저, 그다음 고양이, 둘 다 아니면 null', () => {
  const cat = catAt(T0);
  assert.deepEqual(pickAt({ actors: [], overflow: 0 }, cat, cat.x, cat.y - 5), { cat: true });
  assert.equal(pickAt({ actors: [], overflow: 0 }, cat, cat.x + 30, cat.y - 40), null);
  // 고양이 바로 위에 사람이 서 있으면 사람
  const person = { n: 1, kind: 'waiting', pose: 'stand', spot: { x: cat.x - 40, y: cat.y - 48 }, bubble: '!' };
  const layout = { actors: [person], overflow: 0 };
  assert.equal(pickAt(layout, cat, cat.x, cat.y - 5)?.actor?.n, 1);
  // 고양이가 사람 앞(더 아래)에 그려져 있으면 고양이(리뷰 P2 11-27: 고양이를 눌렀는데 뒤 사람 세션이 열렸다)
  const behind = { n: 2, kind: 'waiting', pose: 'stand', spot: { x: cat.x - 40, y: cat.y - 56 }, bubble: '!' };
  assert.deepEqual(pickAt({ actors: [behind], overflow: 0 }, cat, cat.x, cat.y - 5), { cat: true });
});

test('C11. 구간 경계와 누르기 앞뒤에서 고양이가 순간이동하지 않는다(리뷰 P3)', () => {
  for (let k = -3; k < 40; k += 1) {
    const a = catAt(k * 30000 - 1), b = catAt(k * 30000);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1, `구간 ${k}`);
  }
  // 걷는 중에 눌러도 위치는 계속 따라간다(동작만 점프나 놀라기)
  const walking = HOURS2.find((c) => c.act === 'walk');
  const during = catAt(walking.t + 500, { pokedAt: walking.t });
  const plain = catAt(walking.t + 500);
  assert.ok(['jump', 'scared'].includes(during.act));
  assert.equal(during.x, plain.x);
  assert.equal(during.y, plain.y);
  // 동작 줄이기면 눌러도 멈춘 그대로
  assert.deepEqual(catAt(T0 + 100, { reduced: true, pokedAt: T0 }), catAt(T0, { reduced: true }));
});

test('C9. 고양이를 누르면 그 자리에서 잠깐 점프나 놀라기를 하고 다시 하던 일로 돌아간다', () => {
  const t = T0 + 50000;
  const base = catAt(t + 300);
  const poked = catAt(t + 300, { pokedAt: t });
  assert.ok(['jump', 'scared'].includes(poked.act));
  assert.equal(poked.x, base.x);
  assert.equal(poked.y, base.y);
  assert.deepEqual(catAt(t + 3000, { pokedAt: t }), catAt(t + 3000));
});

test('C10. 그리는 순서(앞뒤): 침대 위 고양이는 침대에 누운 사람 다음에 그린다', () => {
  const bed = { pose: 'bed', spot: REST[0].spot };
  const stand = { pose: 'stand', spot: STANDS[1] };
  assert.ok(depthOf(bed) < 86, '침대 사람은 바닥 어떤 고양이보다 먼저');
  assert.equal(depthOf(stand), STANDS[1].y + 48);
});

test('R8. 동작 줄이기 설정이면 프레임 0 고정', () => {
  assert.equal(animFrame(7, true), 0);
  assert.equal(animFrame(7, false), 7);
});
