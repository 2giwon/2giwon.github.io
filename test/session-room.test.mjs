import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutRoom, frameCell, lookFor, PEOPLE, restFor, headAt, bodyBox, animFrame, loadRoomArt, actorAt, ROOM_MAX, SEATS, WORK_STANDS,
  WAIT_SEATS, WAIT_STANDS, DOZE_STANDS, REST, ROOMS, FLOORS, DOORS, roomAt, onWalkway, HOUSE, ARMCHAIR, SOFA, FRONT_PARTS, TABLE, FRAMES,
  CAT_ACTS, CAT_SPOTS, catAt, pickAt, depthOf, labelScale, labelBoxes,
  footOf, walkRoute, startWalk, walkAt, updateWalks, sceneAt, ACT_BLOCK_MS,
} from '../app/session-room.mjs';

// 세션 카드 "세션 집" 장면(11-27). 방 하나짜리 장면을 다섯 방짜리 집으로 넓혔다(계획 2026-11-27-session-house-plan.md).
// 자리 배치와 그림 고르기만 검사한다(그림 자체는 화면 확인). 좌표는 모두 house.png(384x224) 도트

const row = (id, kind) => ({ id: `local_${id}`, title: id, kind, since: '2026-11-27T00:00:00.000Z' });
const rows = (...kinds) => kinds.map((k, i) => row(`s${i}`, k));
const center = (a) => { const b = bodyBox(a); return [(b.l + b.r) / 2, (b.t + b.b) / 2]; };
const roomOf = (a) => roomAt(...center(a));

// 집의 생김새(personal-docs session-room/build-house.py 와 같은 값)
test('H0. 집은 384x224, 방 다섯(위: 침실, 작업실, 식당 / 아래: 현관, 거실)', () => {
  assert.deepEqual([HOUSE.w, HOUSE.h], [384, 224]);
  assert.deepEqual(Object.keys(ROOMS).sort(), ['bedroom', 'dining', 'entrance', 'living', 'work']);
  for (const [name, r] of Object.entries(ROOMS)) {
    const f = FLOORS[name];
    assert.ok(f.x >= r.x && f.x + f.w <= r.x + r.w && f.y >= r.y && f.y + f.h <= r.y + r.h, `${name} 바닥이 방 안`);
  }
  assert.equal(roomAt(60, 80), 'bedroom');
  assert.equal(roomAt(200, 80), 'work');
  assert.equal(roomAt(320, 80), 'dining');
  assert.equal(roomAt(50, 190), 'entrance');
  assert.equal(roomAt(250, 190), 'living');
  assert.equal(roomAt(121, 50), null, '벽 위');
});

// H1: 사용자 결정 "일하는 중 = 작업실, 끝남 = 거실, 침실, 식당". 답 기다림과 확인 필요는 처음에 현관이었는데
// 11-27 사용자가 "대답 기다릴 때 현관에 서 있도록 하지 말고 거실로 와서 의자에 앉아서 대기"로 바꿨다(W1)
test('H1. 상태마다 방: 일하는 중은 작업실, 답 기다림과 확인 필요는 거실, 끝남은 거실, 침실, 식당', () => {
  const { actors } = layoutRoom(rows('working', 'waiting', 'review', 'done', 'working', 'done', 'done', 'waiting', 'done', 'review'));
  for (const a of actors) {
    const want = { working: ['work'], waiting: ['living'], review: ['living'], done: ['living', 'bedroom', 'dining'] }[a.kind];
    assert.ok(want.includes(roomOf(a)), `${a.n} ${a.kind} 가 ${roomOf(a)} 에 있다`);
  }
  // 일하는 중은 책상 넷에 먼저 앉고, 다섯째부터는 작업실에 선다
  const work = layoutRoom(rows('working', 'working', 'working', 'working', 'working', 'working')).actors;
  assert.deepEqual(work.slice(0, 4).map((a) => a.spot), SEATS);
  assert.ok(work.slice(0, 4).every((a) => a.pose === 'sit'));
  assert.deepEqual(work.slice(4).map((a) => a.spot), WORK_STANDS);
  assert.ok(work.slice(4).every((a) => a.pose === 'stand' && a.bubble === null));
  // 답 기다림 "!", 확인 필요 "?" 는 거실 의자
  const [w, r] = layoutRoom(rows('waiting', 'review')).actors;
  assert.equal(w.bubble, '!'); assert.equal(r.bubble, '?');
  assert.ok(WAIT_SEATS.includes(w.spot) && WAIT_SEATS.includes(r.spot) && w.spot !== r.spot);
  assert.equal(w.pose, 'armchair');
  // 끝남은 모두 "Zz"
  assert.ok(layoutRoom(rows('done', 'done', 'done')).actors.every((a) => a.bubble === 'z' && REST.some((s) => s.spot === a.spot)));
});

const doneRows = (ids) => ids.map((id) => row(id, 'done'));
// restFor 가 원하는 값을 돌려주는 세션 번호를 찾는다
const idsWithRest = (want, count, skip = new Set()) => {
  const out = [];
  for (let i = 0; out.length < count && i < 20000; i += 1) {
    const id = `r${i}`;
    if (!skip.has(id) && restFor(`local_${id}`) === want) out.push(id);
  }
  return out;
};

test('H1-2. 쉬는 자리 아홉: 침대 둘, 소파 둘, 안락의자 둘, 러그 눕기, 식탁 먹기와 마시기. 같은 세션은 늘 같은 자리', () => {
  assert.equal(REST.length, 9);
  assert.deepEqual(REST.map((r) => r.pose).sort(), ['armchair', 'armchair', 'armchair', 'armchair', 'bed', 'bed', 'drink', 'eat', 'lie']);
  assert.deepEqual(
    REST.map((r) => roomOf(r)).sort(),
    ['bedroom', 'bedroom', 'dining', 'dining', 'living', 'living', 'living', 'living', 'living'],
  );
  const ids = REST.map((_, k) => idsWithRest(k, 1)[0]);
  const { actors } = layoutRoom(doneRows(ids));
  assert.deepEqual(actors.map((a) => a.spot), REST.map((r) => r.spot));
  const id = 'local_keep1';
  assert.equal(layoutRoom([row('keep1', 'done')]).actors[0].spot, REST[restFor(id)].spot);
  const seen = new Set(Array.from({ length: 200 }, (_, i) => restFor(`local_z${i}`)));
  assert.equal(seen.size, REST.length);
});

test('H1-3. 원하는 쉬는 자리가 찼으면 다음 빈 자리, 아홉 자리가 다 차면 거실에서 서서 졸기', () => {
  const [a, b] = idsWithRest(0, 2);
  const two = layoutRoom(doneRows([a, b])).actors;
  assert.equal(two[0].spot, REST[0].spot);
  assert.equal(two[1].spot, REST[1].spot);
  const ten = layoutRoom(doneRows(Array.from({ length: 10 }, (_, i) => `f${i}`))).actors;
  assert.equal(new Set(ten.slice(0, 9).map((x) => x.spot)).size, 9);
  assert.equal(ten[9].pose, 'doze');
  assert.ok(DOZE_STANDS.includes(ten[9].spot));
  assert.equal(roomOf(ten[9]), 'living');
});

test('H2. 10명이면 10명 모두 서로 다른 캐릭터, 11명째부터 넘친 수로 센다', () => {
  assert.equal(ROOM_MAX, 10);
  assert.equal(PEOPLE.length, 10);
  for (let s = 0; s < 30; s += 1) {
    const list = Array.from({ length: 10 }, (_, i) => row(`p${s}_${i}`, ['waiting', 'working', 'done', 'review'][i % 4]));
    const looks = layoutRoom(list).actors.map((a) => a.look);
    assert.equal(looks.length, 10);
    assert.equal(new Set(looks).size, 10, `묶음 ${s}: ${looks}`);
  }
  const list = rows('waiting', 'working', 'working', 'review', 'done', 'done', 'done', 'done', 'working', 'done', 'done', 'waiting');
  const { actors, overflow } = layoutRoom(list);
  assert.equal(actors.length, 10);
  assert.equal(overflow, 2);
  assert.deepEqual(actors.map((a) => a.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // 거실 의자(4)와 거실 서기(2)보다 답 기다림이 많으면 자리를 못 받은 사람도 넘친 수로 센다
  const crowd = layoutRoom(rows(...Array(8).fill('waiting')));
  const waitRoom = WAIT_SEATS.length + WAIT_STANDS.length;
  assert.equal(crowd.actors.length, waitRoom);
  assert.equal(crowd.overflow, 8 - waitRoom);
  assert.deepEqual(layoutRoom([]), { actors: [], overflow: 0 });
});

// 두 몸 범위가 3도트보다 깊이 겹치는지(가장자리 맞닿음은 괜찮다)
const TOUCH = 3;
const overlaps = (a, b) => a.l + TOUCH < b.r && b.l + TOUCH < a.r && a.t + TOUCH < b.b && b.t + TOUCH < a.b;
const ALL_SPOTS = [
  ...SEATS.map((s) => ({ name: `책상 ${s.x}`, pose: 'sit', spot: s })),
  ...WORK_STANDS.map((s) => ({ name: `작업실 서기 ${s.x}`, pose: 'stand', spot: s })),
  ...WAIT_STANDS.map((s) => ({ name: `거실 기다림 서기 ${s.x},${s.y}`, pose: 'stand', spot: s })),
  ...DOZE_STANDS.map((s) => ({ name: `거실 졸기 ${s.x}`, pose: 'doze', spot: s })),
  ...REST.map((r, i) => ({ name: `쉬기 ${i} ${r.pose}`, pose: r.pose, spot: r.spot })),
];

test('H3. 모든 자리가 자기 방 안에 있고(벽 밖, 다른 방에 걸치지 않음) 자리끼리 겹치지 않는다', () => {
  for (const s of ALL_SPOTS) {
    const b = bodyBox(s);
    const name = roomOf(s);
    assert.ok(name, `${s.name} 가운데가 방 안`);
    const r = ROOMS[name];
    assert.ok(b.l >= r.x && b.r <= r.x + r.w && b.t >= r.y && b.b <= r.y + r.h, `${s.name} 몸이 ${name} 밖으로 나간다: ${JSON.stringify(b)}`);
    // 발은 바닥 위(벽지에 서지 않는다). 침대는 침대 위라서 뺀다
    if (s.pose !== 'bed') {
      const f = FLOORS[name];
      assert.ok(b.b > f.y && b.b <= f.y + f.h, `${s.name} 발이 바닥 위`);
    }
  }
  // 책상 의자에 앉은 사람과 그 뒤 작업실 서기는 앞뒤 배치라 빼지 않고 함께 검사한다
  for (let i = 0; i < ALL_SPOTS.length; i += 1) {
    for (let j = i + 1; j < ALL_SPOTS.length; j += 1) {
      assert.ok(!overlaps(bodyBox(ALL_SPOTS[i]), bodyBox(ALL_SPOTS[j])), `${ALL_SPOTS[i].name} 와 ${ALL_SPOTS[j].name} 가 겹친다`);
    }
  }
});

test('H3-2. 소파와 안락의자에 앉은 사람: 가운데가 자리 가운데, 허리가 앉는 판, 덧그리는 부분은 팔걸이와 앞면', () => {
  assert.deepEqual(ARMCHAIR, [160, 288, 16, 26]);
  assert.deepEqual(SOFA, [128, 288, 32, 26]);
  assert.deepEqual(FRONT_PARTS.armchair, [[0, 0, 2, 26], [14, 0, 2, 26], [0, 14, 16, 12]]);
  assert.deepEqual(FRONT_PARTS.sofa, [[0, 0, 2, 26], [30, 0, 2, 26], [0, 14, 32, 12]]);
  const seated = REST.filter((r) => r.pose === 'armchair');
  assert.equal(seated.length, 4);
  for (const { spot } of seated) {
    const { src, at, seatX } = spot.front;
    assert.ok([ARMCHAIR, SOFA].includes(src));
    // Memao 앞모습은 칸 가운데가 x 24, 허리가 칸 y 30. 자리 칸에 (16, 7) 들여 놓으므로 자리 칸 x 40, y 37
    assert.equal(spot.x + 40, at[0] + seatX + 8, '사람 가운데가 앉는 자리 가운데');
    assert.equal(spot.y + 37, at[1] + 16, '허리가 앉는 판 높이');
  }
  // 소파 두 자리는 같은 소파의 왼쪽, 오른쪽
  const sofa = seated.filter((r) => r.spot.front.src === SOFA);
  assert.deepEqual(sofa.map((r) => r.spot.front.seatX).sort(), [0, 16]);
});

test('H3-3. 식탁에서 먹기, 마시기: 식탁 뒤에 서서 머리와 어깨가 식탁 위로 보이고, 식탁을 덧그려 다리를 가린다', () => {
  const table = REST.filter((r) => r.pose === 'eat' || r.pose === 'drink');
  assert.equal(table.length, 2);
  for (const { spot } of table) {
    assert.equal(spot.front.src, TABLE.src);
    const [tx, ty] = spot.front.at;
    const head = spot.y + 7 + 7; // Memao 머리 꼭대기는 칸 y 약 7
    const feet = spot.y + 48;
    assert.ok(head < ty - 10, '머리와 어깨가 식탁 위로 보인다');
    assert.ok(feet > ty && feet <= ty + TABLE.src[3], '발은 식탁에 가린다');
    assert.ok(spot.x + 32 >= tx - 4 && spot.x + 48 <= tx + TABLE.src[2] + 4, '식탁 폭 안');
  }
});

test('H3-4. 침대에서는 머리가 베개 위에 오고, 몸은 침대 안에서 이불 덧그림에 가린다', () => {
  const beds = REST.filter((r) => r.pose === 'bed');
  assert.equal(beds.length, 2);
  for (const bed of beds) {
    const { x, y, clip, quilt } = bed.spot;
    const [kx, ky, kw, kh] = clip; // 침대(보이는 부분 16x27)
    assert.ok(x >= kx && x + 16 <= kx + kw, '침대 폭 안');
    assert.ok(y >= ky && y <= ky + 6, '머리가 베개(침대 위 끝)에 걸친다');
    const [qx, qy, qw, qh] = quilt;
    assert.ok(qx <= x && qx + qw >= x + 16, '이불이 몸 폭을 덮는다');
    assert.ok(qy >= y + 10, '얼굴은 이불 밖');
    assert.ok(qy + qh >= ky + kh, '잘린 끝까지 이불이 덮는다');
  }
});

test('R10. 책상 의자마다 덧그릴 의자 자리가 있고, 사람 가운데가 의자 가운데에 온다', () => {
  for (const seat of SEATS) {
    assert.ok(Array.isArray(seat.chair) && seat.chair.length === 2);
    assert.ok(Math.abs(seat.chair[0] + 5 - (seat.x + 40)) <= 1);
    assert.ok(seat.y + 18 < seat.chair[1]);
    assert.ok(seat.y + 47 >= seat.chair[1] && seat.y + 47 <= seat.chair[1] + 14);
  }
});

// H6: 식당 먹기, 마시기 칸(그림판을 크게 그려 확인. 200~202 앞모습 주먹밥 들고 한 입, 268~271 앞모습 컵을 입에)
test('H6. 동작과 프레임 -> Memao 칸 번호(먹기 200~202, 마시기 268~271 포함)', () => {
  // 11-27 생활 계획에서 걷기, 대화(옆모습), 쓰다듬기(쪼그려 앉기) 칸이 더해졌다(W3, W6)
  assert.deepEqual(FRAMES, {
    front: 0, back: 4, lie: 190, eat: [200, 201, 202, 201], drink: [268, 269, 270, 271],
    walk: { down: 16, up: 22, left: 28, right: 34 }, face: { left: 8, right: 12 }, crouch: [180, 181],
  });
  assert.deepEqual(frameCell('eat', 0), { frame: 200 });
  assert.deepEqual(frameCell('eat', 1), { frame: 201 });
  assert.deepEqual(frameCell('eat', 3), { frame: 201 });
  assert.deepEqual(frameCell('eat', 4), { frame: 200 });
  assert.deepEqual(frameCell('drink', 2), { frame: 270 });
  assert.deepEqual(frameCell('drink', 5), { frame: 269 });
  assert.deepEqual(frameCell('stand', 0), { frame: 0 });
  assert.deepEqual(frameCell('stand', 5), { frame: 1 });
  assert.deepEqual(frameCell('sit', 1), { frame: 5, dy: 1 });
  assert.deepEqual(frameCell('lie', 5), { frame: 190 });
  assert.deepEqual(frameCell('bed', 3), { frame: 190, turn: true });
  assert.deepEqual(frameCell('armchair', 6), { frame: 2 });
  assert.deepEqual(frameCell('doze', 1), { frame: 0 });
});

test('R11. 앉아서 일할 때는 프레임마다 몸이 1도트 오르내린다, 다른 동작은 그대로', () => {
  assert.equal(frameCell('sit', 0).dy, 0);
  assert.equal(frameCell('sit', 1).dy, 1);
  assert.equal(frameCell('stand', 1).dy ?? 0, 0);
});

test('P2. 캐릭터는 세션 번호로 정해지고, 혼자면 늘 그 캐릭터, 여러 세션이면 10명이 모두 나온다', () => {
  assert.equal(lookFor('local_a1'), lookFor('local_a1'));
  assert.equal(layoutRoom([row('a1', 'working')]).actors[0].look, lookFor('local_a1'));
  assert.equal(new Set(Array.from({ length: 200 }, (_, i) => lookFor(`local_x${i}`))).size, 10);
});

test('P3. 좋아하는 캐릭터를 앞선 세션이 쓰고 있으면 다음 캐릭터', () => {
  const ids = [];
  for (let i = 0; ids.length < 2; i += 1) if (lookFor(`local_q${i}`) === 3) ids.push(`q${i}`);
  const [a, b] = layoutRoom(ids.map((id) => row(id, 'waiting'))).actors;
  assert.equal(a.look, 3);
  assert.equal(b.look, 4);
});

// H7: 배경은 미리 조립한 house.png 한 장(personal-docs build-house.py). 의자, 소파, 식탁 앞면은 가구 그림판에서 덧그린다
test('H7. 그림 불러오기: house.png 를 포함해 모두 받으면 ready, 하나라도 실패하면 failed', async () => {
  const names = [];
  const ok = await loadRoomArt(async (name) => { names.push(name); return new ArrayBuffer(4); }, async (bytes) => ({ w: bytes.byteLength }));
  assert.equal(ok.state, 'ready');
  const memao = Array.from({ length: 10 }, (_, i) => `memao-${String(i + 1).padStart(2, '0')}.png`);
  assert.deepEqual(names.sort(), ['cat.png', 'furniture.png', 'house.png', 'limezu-interiors.png', ...memao].sort());
  assert.ok(ok.images.house && ok.images.furniture && ok.images.interiors);
  assert.equal(ok.images.people.length, 10);
  for (const missing of ['house.png', 'memao-04.png', 'limezu-interiors.png']) {
    const bad = await loadRoomArt(async (name) => { if (name === missing) throw new Error('404'); return new ArrayBuffer(4); }, async () => ({}));
    assert.equal(bad.state, 'failed', missing);
  }
  const badDecode = await loadRoomArt(async () => new ArrayBuffer(4), async () => { throw new Error('broken png'); });
  assert.equal(badDecode.state, 'failed');
});

// H5: 폰처럼 캔버스가 작게 줄어들면 번호와 말풍선이 읽기 어려울 만큼 작아진다. 화면에서 약 16px 가 되게 도트 기준 크기를 키운다
test('H5. 번호와 말풍선 크기: 캔버스가 좁을수록 커지고, 누르기 판정이 같은 크기를 쓴다', () => {
  assert.equal(labelScale(1152), 1);
  assert.equal(labelScale(768), 1);
  assert.ok(labelScale(350) > labelScale(500));
  assert.ok(Math.abs(labelScale(384) - 2) < 1e-9);
  assert.equal(labelScale(0), 1, '아직 크기를 모르면 1');
  // 번호 동그라미 지름(도트) x 화면 배율 = 약 16px
  const px = (w) => labelBoxes({ pose: 'stand', spot: { x: 0, y: 100 }, bubble: '!' }, labelScale(w)).label.r * 2 * (w / HOUSE.w);
  assert.ok(Math.abs(px(350) - 16) < 0.5, `폰 ${px(350)}px`);
  // 누르기 판정: 크게 키운 번호의 가장자리는 k=1 에서는 비어 있고, 같은 k 를 넘기면 그 사람
  const layout = layoutRoom(rows('waiting'));
  const a = layout.actors[0];
  const big = labelBoxes(a, 2.2).label;
  const edge = [big.cx, big.cy - big.r + 0.5];
  assert.equal(actorAt(layout, ...edge), null);
  assert.equal(actorAt(layout, ...edge, 2.2)?.n, 1);
  const bubble = labelBoxes(a, 2.2).bubble;
  assert.equal(actorAt(layout, bubble.r - 0.5, bubble.t + 0.5, 2.2)?.n, 1);
  // k=1 은 번호 반지름 4도트(예전 크기). 말풍선은 번호 동그라미 바로 위에 붙은 8x7 꼬리표(11-27 오른쪽 위에서 위로 옮김, H5-3)
  const one = labelBoxes(a, 1);
  const h = headAt(a);
  assert.deepEqual([one.label.cx, one.label.cy, one.label.r], [h.x, h.y - 5, 4]);
  assert.deepEqual(one.bubble, { l: h.x - 4, r: h.x + 4, t: h.y - 15, b: h.y - 8 });
});

// 11-27 확인 페이지 폰 폭 캡처: 현관 자리는 30도트 간격인데, 처음에는 말풍선을 번호 오른쪽에 10x10 으로 두고 배율만큼 키워서
// 1번, 2번의 "!" 가 옆 사람 번호에 가려 안 보였다. 답 기다림 "!", 확인 필요 "?" 는 꼭 보여야 해서 번호 오른쪽 위 꼬리표로 바꿨다
// 11-27 기다림이 거실 의자로 옮겼다. 소파와 안락의자는 16~22도트 간격이라 꼬리표를 번호 오른쪽 위에 두면 320px 폰에서
// 옆 사람 번호에 가렸다. 그래서 꼬리표를 번호 바로 위에 둔다(옆 사람은 옆에 있어서 위아래로 쌓으면 겹치지 않는다)
test('H5-3. 거실에 기다리는 여섯 명이 있어도 폰 폭까지 "!", "?" 글자가 다른 사람 번호에 가리지 않는다', () => {
  const crowd = layoutRoom(rows('waiting', 'review', 'waiting', 'review', 'waiting', 'review'));
  assert.equal(crowd.actors.length, 6);
  for (const k of [1, labelScale(375), labelScale(312), labelScale(280)]) {
    for (const a of crowd.actors) {
      const { bubble } = labelBoxes(a, k);
      const text = [(bubble.l + bubble.r) / 2, (bubble.t + bubble.b) / 2];
      for (const o of crowd.actors) {
        const { label } = labelBoxes(o, k);
        // 글자 가운데에서 다른 번호 동그라미까지 글자 반 폭(2k) 넘게 떨어진다. 자기 번호는 글자 가운데를 덮지 않는다
        const gap = Math.hypot(text[0] - label.cx, text[1] - label.cy) - label.r;
        assert.ok(gap > (o === a ? 0 : 2 * k), `k ${k.toFixed(2)}: ${a.n} 의 "${a.bubble}" 가 ${o.n} 번호에 가린다`);
      }
    }
  }
});

// 소파 두 자리는 16도트 간격이라 폰에서는 번호와 말풍선이 겹친다.
// 화면은 번호를 말풍선보다 나중에 그리고, 누르기도 번호를 말풍선보다 먼저 본다
test('H5-2. 소파 옆자리 번호끼리 겹쳐도 번호와 꼬리표를 누르면 그 주인', () => {
  const sofa = REST.filter((r) => r.pose === 'armchair' && r.spot.front.src === SOFA);
  const [left, right] = sofa.sort((a, b) => a.spot.x - b.spot.x)
    .map((r, i) => ({ n: i + 1, kind: 'done', pose: r.pose, spot: r.spot, bubble: 'z' }));
  // 오른쪽 사람을 먼저 두어 앞뒤(같은 높이면 나중 사람) 고르기에 기대지 않는다
  const layout = { actors: [right, left], overflow: 0 };
  // 폰 배율에서는 두 번호 동그라미끼리 겹친다. 오른쪽 번호의 오른쪽 끝을 누르면 오른쪽 사람, 꼬리표를 누르면 그 꼬리표 주인
  for (const k of [2.2, 2.5]) {
    const { label } = labelBoxes(right, k);
    assert.equal(actorAt(layout, label.cx + label.r / 2, label.cy, k)?.n, right.n, `k ${k}`);
    const lb = labelBoxes(left, k).bubble;
    assert.equal(actorAt(layout, (lb.l + lb.r) / 2, lb.t + 1, k)?.n, left.n, `k ${k} 꼬리표`);
  }
});

test('R18. 쉬는 자리 아홉 곳 사람의 몸, 번호, Zz 말풍선을 누르면 그 사람', () => {
  const ids = REST.map((_, k) => idsWithRest(k, 1)[0]);
  const layout = layoutRoom(doneRows(ids));
  for (const a of layout.actors) {
    const [mx, my] = center(a);
    const { label, bubble } = labelBoxes(a, 1);
    assert.equal(actorAt(layout, mx, my)?.n, a.n, `${a.pose} 몸`);
    assert.equal(actorAt(layout, label.cx, label.cy)?.n, a.n, `${a.pose} 번호`);
    assert.equal(actorAt(layout, (bubble.l + bubble.r) / 2, (bubble.t + bubble.b) / 2)?.n, a.n, `${a.pose} 말풍선`);
  }
});

test('R12. 누른 자리에 있는 사람, 겹치면 앞(아래), 빈 자리는 null', () => {
  const layout = layoutRoom(rows('waiting', 'working'));
  const [stand, sit] = layout.actors;
  assert.equal(actorAt(layout, stand.spot.x + 40, stand.spot.y + 35)?.n, 1);
  assert.equal(actorAt(layout, sit.spot.x + 40, sit.spot.y + 30)?.n, 2);
  assert.equal(actorAt(layout, 330, 200), null);
  const overlap = { actors: [
    { n: 1, spot: { x: 50, y: 40 }, pose: 'stand' },
    { n: 2, spot: { x: 52, y: 50 }, pose: 'stand' },
  ], overflow: 0 };
  assert.equal(actorAt(overlap, 92, 75)?.n, 2);
});

// 고양이(11-27). 시각만으로 계산하고, 방마다 놀 자리가 있으며 다른 방으로 갈 때는 문 구멍을 지난다
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

test('C2. 걷는 동안에는 지금 걷는 구간의 양 끝 사이에 있고, 가는 쪽을 본다(왼쪽이면 뒤집기)', () => {
  const walks = HOURS2.filter((c) => c.act === 'walk' || c.act === 'run');
  assert.ok(walks.length > 0);
  for (const c of walks) {
    const { from, to } = c.walk;
    assert.ok(c.x >= Math.min(from.x, to.x) - 0.01 && c.x <= Math.max(from.x, to.x) + 0.01);
    assert.ok(c.y >= Math.min(from.y, to.y) - 0.01 && c.y <= Math.max(from.y, to.y) + 0.01);
    if (to.x !== from.x) assert.equal(c.flip, to.x < from.x);
  }
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
  assert.ok(longest('sleep') > 2 * longest('paw'));
  assert.ok(longest('sleep') > 2 * longest('lick'));
});

test('H4. 고양이는 늘 바닥이나 문 구멍 위에 있고, 벽을 지나지 않으며, 여러 방을 오간다', () => {
  for (const s of CAT_SPOTS) assert.ok(FLOORS[roomAt(s.x, s.y)], `놀 자리 ${s.x},${s.y} 가 바닥 위`);
  // 문 구멍마다 양쪽 지점이 서로 다른 방 바닥에 있다
  for (const d of DOORS) {
    assert.notEqual(roomAt(d.a.x, d.a.y), roomAt(d.b.x, d.b.y));
    assert.ok(onWalkway(d.a.x, d.a.y) && onWalkway(d.b.x, d.b.y));
  }
  // 0.05초마다 재서 늘 걷는 길(바닥 + 문 구멍) 위에 있다. 벽을 뚫고 가면 그 사이 어딘가가 벽 위에 걸린다
  const rooms = new Set();
  for (const c of samples(T0, T0 + 3600 * 1000, 50)) {
    assert.ok(onWalkway(c.x, c.y), `${new Date(c.t).toISOString()} 고양이 ${c.x.toFixed(1)},${c.y.toFixed(1)} 가 벽 위`);
    const r = roomAt(c.x, c.y);
    if (r) rooms.add(r);
  }
  assert.ok(rooms.size >= 4, `오간 방: ${[...rooms]}`);
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
  assert.equal(a.act, 'sit');
  assert.equal(a.col, 0);
  assert.deepEqual(a, catAt(T0 + 77777, { reduced: true }));
});

test('C7. 고양이 그림만 못 받으면 집은 그대로(ready) 그리고 고양이만 빠진다', async () => {
  const r = await loadRoomArt(async (name) => { if (name === 'cat.png') throw new Error('404'); return new ArrayBuffer(4); }, async () => ({}));
  assert.equal(r.state, 'ready');
  assert.equal(r.images.cat, undefined);
  assert.ok(r.images.house && r.images.people.length === 10);
  const slow = await loadRoomArt(
    async (name) => (name === 'cat.png' ? new Promise(() => {}) : new ArrayBuffer(4)), async () => ({}), { optionalWaitMs: 20 },
  );
  assert.equal(slow.state, 'ready');
  assert.equal(slow.images.cat, undefined);
  const wait = (ms, v) => new Promise((res) => setTimeout(() => res(v), ms));
  const lateCat = await loadRoomArt(
    async (name) => (name === 'cat.png' ? wait(60, new ArrayBuffer(1)) : wait(50, new ArrayBuffer(4))), async (b) => ({ n: b.byteLength }), { optionalWaitMs: 30 },
  );
  assert.deepEqual(lateCat.images.cat, { n: 1 });
});

test('C8. 누른 자리: 사람과 고양이 중 앞에 그려진 쪽, 둘 다 아니면 null', () => {
  const cat = catAt(T0);
  assert.deepEqual(pickAt({ actors: [], overflow: 0 }, cat, cat.x, cat.y - 5), { cat: true });
  assert.equal(pickAt({ actors: [], overflow: 0 }, cat, cat.x + 30, cat.y - 40), null);
  const person = { n: 1, kind: 'waiting', pose: 'stand', spot: { x: cat.x - 40, y: cat.y - 48 }, bubble: '!' };
  assert.equal(pickAt({ actors: [person], overflow: 0 }, cat, cat.x, cat.y - 5)?.actor?.n, 1);
  const behind = { n: 2, kind: 'waiting', pose: 'stand', spot: { x: cat.x - 40, y: cat.y - 56 }, bubble: '!' };
  assert.deepEqual(pickAt({ actors: [behind], overflow: 0 }, cat, cat.x, cat.y - 5), { cat: true });
});

test('C11. 구간 경계와 누르기 앞뒤에서 고양이가 순간이동하지 않는다', () => {
  for (let k = -3; k < 40; k += 1) {
    const a = catAt(k * 30000 - 1), b = catAt(k * 30000);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1, `구간 ${k}`);
  }
  const walking = HOURS2.find((c) => c.act === 'walk');
  const during = catAt(walking.t + 500, { pokedAt: walking.t });
  const plain = catAt(walking.t + 500);
  assert.ok(['jump', 'scared'].includes(during.act));
  assert.equal(during.x, plain.x);
  assert.equal(during.y, plain.y);
  assert.deepEqual(catAt(T0 + 100, { reduced: true, pokedAt: T0 }), catAt(T0, { reduced: true }));
});

test('C9. 고양이를 누르면 그 자리에서 잠깐 점프나 놀라기를 하고 다시 하던 일로 돌아간다', () => {
  const t = T0 + 50000;
  const poked = catAt(t + 300, { pokedAt: t });
  assert.ok(['jump', 'scared'].includes(poked.act));
  assert.equal(poked.x, catAt(t + 300).x);
  assert.deepEqual(catAt(t + 3000, { pokedAt: t }), catAt(t + 3000));
});

test('C10. 그리는 순서(앞뒤): 침대에 누운 사람은 침실 고양이보다 먼저 그린다', () => {
  const bed = REST.find((r) => r.pose === 'bed');
  const bedroomCats = CAT_SPOTS.filter((s) => roomAt(s.x, s.y) === 'bedroom');
  assert.ok(bedroomCats.length > 0);
  for (const c of bedroomCats) assert.ok(depthOf({ pose: 'bed', spot: bed.spot }) < c.y);
  assert.equal(depthOf({ pose: 'stand', spot: WORK_STANDS[0] }), WORK_STANDS[0].y + 48);
});

// ---------------------------------------------------------------------------
// 세션 집 생활(11-27 계획 2026-11-27-session-life-plan.md). 사용자: "일을 시키면 컴퓨터 방으로 걸어가서 작업, 끝나고 쉴 때는 방이나
// 거실 소파로 이동, 대답 기다릴 때 거실 의자에 앉아서 대기, 쉬거나 대기일 때는 고양이를 만지거나 밥을 먹거나 대화"

test('W1. 기다림과 확인 필요는 거실 의자에 먼저 앉고, 끝남은 남은 거실 의자만 쓴다. 넘치면 거실 서기, 그다음 넘친 수', () => {
  assert.equal(WAIT_SEATS.length, 4);
  for (const s of WAIT_SEATS) assert.ok(REST.some((r) => r.spot === s && r.pose === 'armchair'), '거실 의자는 쉬는 자리이기도 하다');
  // 끝남이 목록 앞에 있어도 기다림이 거실 의자를 먼저 갖는다
  const ids = WAIT_SEATS.map((s) => idsWithRest(REST.findIndex((r) => r.spot === s), 1)[0]);
  const list = [...doneRows(ids), row('w0', 'waiting'), row('w1', 'review')];
  const { actors } = layoutRoom(list);
  const done = actors.filter((a) => a.kind === 'done');
  const wait = actors.filter((a) => a.kind !== 'done');
  assert.ok(wait.every((a) => WAIT_SEATS.includes(a.spot)));
  assert.ok(done.every((a) => !wait.some((w) => w.spot === a.spot)), '같은 의자에 두 사람이 앉지 않는다');
  assert.equal(done.filter((a) => WAIT_SEATS.includes(a.spot)).length, 2, '끝남은 남은 거실 의자 둘만');
  assert.deepEqual(actors.map((a) => a.n), [1, 2, 3, 4, 5, 6], '번호는 목록 순서 그대로');
  // 여섯 명까지 거실(의자 4, 서기 2)
  const six = layoutRoom(rows(...Array(6).fill('waiting'))).actors;
  assert.deepEqual(six.map((a) => a.spot), [...WAIT_SEATS, ...WAIT_STANDS]);
  assert.ok(six.every((a) => roomOf(a) === 'living'));
});

const feetOf = () => [
  ...SEATS.map((s) => footOf('sit', s)), ...WORK_STANDS.map((s) => footOf('stand', s)), ...WAIT_STANDS.map((s) => footOf('stand', s)),
  ...DOZE_STANDS.map((s) => footOf('doze', s)), ...REST.map((r) => footOf(r.pose, r.spot)),
];

test('W2. 모든 자리의 발 위치가 바닥 위에 있고, 어느 자리에서 어느 자리로 가든 길이 바닥과 문 구멍 위로만 지난다', () => {
  const feet = feetOf();
  for (const f of feet) assert.ok(onWalkway(f.x, f.y) && roomAt(f.x, f.y), `발 ${f.x},${f.y}`);
  for (const a of feet) {
    for (const b of feet) {
      const path = walkRoute(a, b);
      assert.deepEqual(path[0], a); assert.deepEqual(path[path.length - 1], b);
      for (let i = 1; i < path.length; i += 1) {
        for (let s = 0; s <= 20; s += 1) {
          const x = path[i - 1].x + ((path[i].x - path[i - 1].x) * s) / 20;
          const y = path[i - 1].y + ((path[i].y - path[i - 1].y) * s) / 20;
          assert.ok(onWalkway(x, y), `${a.x},${a.y} -> ${b.x},${b.y} 길이 벽 위(${x.toFixed(1)},${y.toFixed(1)})`);
        }
      }
    }
  }
});

test('W3. 걷기: 최대 8초, 가는 방향에 맞는 걷기 칸(앞 16, 뒤 22, 왼쪽 28, 오른쪽 34부터 6장), 도착하면 끝', () => {
  assert.deepEqual(FRAMES.walk, { down: 16, up: 22, left: 28, right: 34 });
  const from = footOf('sit', SEATS[0]);
  const to = footOf(REST[0].pose, REST[0].spot); // 작업실 책상 -> 침실 침대
  const w = startWalk(from, to, 1000);
  assert.ok(w.ms > 0 && w.ms <= 8000);
  assert.deepEqual(walkAt(w, 1000), { x: from.x, y: from.y, dir: walkAt(w, 1000).dir, done: false });
  assert.equal(walkAt(w, 1000 + w.ms).done, true);
  const end = walkAt(w, 1000 + w.ms + 5);
  assert.deepEqual([end.x, end.y, end.done], [to.x, to.y, true]);
  // 왼쪽으로만 가는 길은 left, 오른쪽은 right, 아래 down, 위 up
  const flat = (a, b) => walkAt(startWalk(a, b, 0), 10).dir;
  assert.equal(flat({ x: 200, y: 200 }, { x: 150, y: 200 }), 'left');
  assert.equal(flat({ x: 150, y: 200 }, { x: 200, y: 200 }), 'right');
  assert.equal(flat({ x: 300, y: 160 }, { x: 300, y: 210 }), 'down');
  assert.equal(flat({ x: 300, y: 210 }, { x: 300, y: 160 }), 'up');
  assert.deepEqual(frameCell('walk', 7, 'left'), { frame: 29 });
  assert.deepEqual(frameCell('walk', 0, 'right'), { frame: 34 });
  assert.deepEqual(frameCell('walk', 5, 'down'), { frame: 21 });
  assert.deepEqual(frameCell('walk', 2, 'up'), { frame: 24 });
  // 상태가 바뀌면(작업실 -> 쉬는 자리) 예전에 그린 발 위치에서 새 자리로 걷기 시작. 처음 보는 세션은 바로 나타난다
  const working = layoutRoom([row('m1', 'working')]);
  const drawn = new Map([['local_m1', footOf('sit', working.actors[0].spot)]]);
  const resting = layoutRoom([row('m1', 'done'), row('m2', 'done')]);
  const walks = updateWalks(new Map(), drawn, resting, 5000);
  assert.ok(walks.has('local_m1'));
  assert.ok(!walks.has('local_m2'), '처음 보는 세션은 걷지 않는다');
  const scene = sceneAt(resting, 5500, { walks });
  const m1 = scene.actors.find((a) => a.id === 'local_m1');
  assert.equal(m1.pose, 'walk');
  assert.equal(m1.bubble, null, '걷는 동안 끝남의 Zz 는 감춘다');
  // 기다림은 걸어가는 동안에도 ! 를 보인다(사용자 결정 3)
  const waitL = layoutRoom([row('m1', 'waiting')]);
  const s2 = sceneAt(waitL, 5500, { walks: updateWalks(new Map(), drawn, waitL, 5000) });
  assert.equal(s2.actors[0].pose, 'walk');
  assert.equal(s2.actors[0].bubble, '!');
});

// 끝남 한 명이 1시간 동안 하는 일. 30초 구간마다 본다
const ACT_HOUR = (layout, id) => {
  const seen = [];
  for (let t = T0; t < T0 + 3600 * 1000; t += 1000) {
    const a = sceneAt(layout, t, {}).actors.find((x) => x.id === id);
    if (a.activity && a.activity.phase === 'do' && seen[seen.length - 1]?.k !== a.activity.k) seen.push({ k: a.activity.k, kind: a.activity.kind });
  }
  return seen;
};

test('W4. 끝남의 할 일은 세션 번호와 시각으로 늘 같고, 1~2분마다 한 번 이하로 한다', () => {
  const layout = layoutRoom(rows('done', 'done', 'done'));
  for (const a of layout.actors) {
    const hour = ACT_HOUR(layout, a.id);
    assert.ok(hour.length >= 15 && hour.length <= 60, `${a.id}: 한 시간에 ${hour.length}번`);
    for (let i = 1; i < hour.length; i += 1) assert.ok(hour[i].k - hour[i - 1].k >= 2, '연달아 하지 않는다(1분 넘게 간격)');
    assert.ok(new Set(hour.map((x) => x.kind)).size >= 2, '여러 가지를 한다');
  }
  assert.deepEqual(sceneAt(layout, T0 + 123456, {}), sceneAt(layout, T0 + 123456, {}));
  // 동작 줄이기면 할 일과 걷기 없이 자리 그대로
  const still = sceneAt(layout, T0 + 123456, { reduced: true });
  assert.ok(still.actors.every((a, i) => a.spot === layout.actors[i].spot && !a.activity));
});

test('W5. 기다리는 세션은 자리를 떠나지 않고(앉은 채 대화, 쓰다듬기만) ! ? 를 늘 보인다', () => {
  const layout = layoutRoom(rows('waiting', 'review', 'waiting', 'done', 'done'));
  let talk = 0;
  for (let t = T0; t < T0 + 1800 * 1000; t += 2000) {
    for (const a of sceneAt(layout, t, {}).actors.filter((x) => x.kind !== 'done')) {
      const base = layout.actors.find((x) => x.id === a.id);
      assert.equal(a.spot, base.spot);
      assert.equal(a.pose, 'armchair');
      assert.ok(a.bubble === '!' || a.bubble === '?');
      if (a.mood === 'talk') talk += 1;
      assert.ok([null, 'talk', 'heart'].includes(a.mood ?? null));
    }
  }
  assert.ok(talk > 0, '옆자리 기다리는 사람과 가끔 대화한다');
});

test('W6. 쓰다듬기는 고양이 옆에서 쪼그려 앉기(180~181)와 하트, 대화는 둘이 서로 마주 보고 "...", 먹기는 식탁', () => {
  const layout = layoutRoom(rows('done', 'done', 'done', 'done'));
  const kinds = new Set();
  for (let t = T0; t < T0 + 3600 * 1000; t += 1000) {
    const scene = sceneAt(layout, t, {});
    const doing = scene.actors.filter((a) => a.activity?.phase === 'do');
    for (const a of doing) {
      kinds.add(a.activity.kind);
      const foot = footOf(a.pose, a.spot);
      if (a.activity.kind === 'pet') {
        assert.equal(a.pose, 'crouch');
        assert.deepEqual([180, 181].includes(frameCell('crouch', t / 500).frame), true);
        assert.equal(a.mood, 'heart');
        const cat = catAt(t);
        assert.ok(Math.hypot(foot.x - cat.x, foot.y - cat.y) <= 22, `고양이 옆 ${foot.x},${foot.y} / ${cat.x},${cat.y}`);
      }
      if (a.activity.kind === 'talk') {
        const other = doing.find((o) => o !== a && o.activity.kind === 'talk' && o.activity.with === a.id);
        assert.ok(other, '대화 상대가 같은 때 대화 중');
        assert.equal(a.pose, 'face');
        // 왼쪽 사람은 오른쪽을, 오른쪽 사람은 왼쪽을 본다
        const otherFoot = footOf(other.pose, other.spot);
        assert.equal(a.dir, otherFoot.x > foot.x ? 'right' : 'left');
        assert.equal(a.mood, 'talk');
      }
      if (a.activity.kind === 'eat') assert.ok(['eat', 'drink'].includes(a.pose) && roomOf(a) === 'dining');
    }
  }
  assert.deepEqual([...kinds].sort(), ['eat', 'pet', 'talk']);
  assert.deepEqual(frameCell('face', 1, 'left'), { frame: 9 });
  assert.deepEqual(frameCell('face', 1, 'right'), { frame: 13 });
});

test('W7. 움직이는 사람도 그린 위치에서 누르면 그 사람', () => {
  const layout = layoutRoom(rows('done', 'done', 'done'));
  let checked = 0;
  for (let t = T0; t < T0 + 1200 * 1000 && checked < 20; t += 700) {
    const scene = sceneAt(layout, t, {});
    for (const a of scene.actors.filter((x) => x.pose === 'walk' || x.pose === 'crouch' || x.pose === 'face')) {
      const others = scene.actors.filter((o) => o !== a);
      const [mx, my] = center(a);
      if (others.some((o) => { const b = bodyBox(o); return mx >= b.l && mx <= b.r && my >= b.t && my <= b.b; })) continue;
      assert.equal(actorAt(scene, mx, my)?.id, a.id);
      checked += 1;
    }
  }
  assert.ok(checked >= 5, `확인한 움직이는 사람 ${checked}`);
  assert.equal(ACT_BLOCK_MS, 30000);
});

test('R8. 동작 줄이기 설정이면 프레임 0 고정', () => {
  assert.equal(animFrame(7, true), 0);
  assert.equal(animFrame(7, false), 7);
});

// codex P2 3건(11-27): 화면처럼 10초마다 목록을 다시 받고, 0.1초마다 그리며 발 위치를 기억해 흉내 낸다
const simulate = (layouts, from, to, stepMs = 100) => {
  let walks = new Map();
  let feet = new Map();
  let prev = null;
  const track = [];
  for (let t = from; t < to; t += stepMs) {
    const layout = layouts(t);
    if (layout !== prev) { walks = updateWalks(walks, feet, layout, t, prev); prev = layout; }
    const scene = sceneAt(layout, t, { walks });
    feet = scene.feet;
    track.push({ t, feet: new Map(feet), scene });
  }
  return track;
};
// 0.1초 사이 발이 이만큼 넘게 움직이면 순간이동(걷기는 최대 8초에 길 하나라 0.1초에 10도트를 넘지 않는다)
const JUMP = 12;
const jumps = (track, id) => {
  const out = [];
  for (let i = 1; i < track.length; i += 1) {
    const a = track[i - 1].feet.get(id), b = track[i].feet.get(id);
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > JUMP) out.push({ t: track[i].t, d: Math.hypot(a.x - b.x, a.y - b.y).toFixed(1) });
  }
  return out;
};

test('W8. 목록을 다시 받아도 자리가 그대로면 하던 할 일을 끊지 않는다(10초마다 같은 목록)', () => {
  const list = rows('done', 'done', 'done');
  // 10초마다 새 배치 객체(내용은 같다). 화면이 10초마다 목록을 다시 받아 layoutRoom 을 새로 부르는 것과 같다
  const every10s = new Map();
  const refreshed = (t) => {
    const k = Math.floor(t / 10000);
    if (!every10s.has(k)) every10s.set(k, layoutRoom(list));
    return every10s.get(k);
  };
  const track = simulate(refreshed, T0, T0 + 600 * 1000);
  for (const a of layoutRoom(list).actors) {
    assert.deepEqual(jumps(track, a.id), [], `${a.id} 순간이동`);
    // 할 일을 끝까지 한다: 'do' 가 시작되면 10초 동안 이어진다
    let run = 0, best = 0;
    for (const s of track) {
      const x = s.scene.actors.find((o) => o.id === a.id);
      run = x.activity?.phase === 'do' ? run + 1 : 0;
      best = Math.max(best, run);
    }
    assert.ok(best >= 95, `${a.id} 할 일이 끊겼다(${best / 10}초)`);
  }
});

test('W9. 문 구멍 안에 서 있다가 새 자리로 가도 벽을 지나지 않는다', () => {
  for (const d of DOORS) {
    const mid = { x: d.gap.x + d.gap.w / 2, y: d.gap.y + d.gap.h / 2 };
    for (const f of feetOf()) {
      const path = walkRoute(mid, f);
      for (let i = 1; i < path.length; i += 1) {
        for (let s = 0; s <= 20; s += 1) {
          const x = path[i - 1].x + ((path[i].x - path[i - 1].x) * s) / 20;
          const y = path[i - 1].y + ((path[i].y - path[i - 1].y) * s) / 20;
          assert.ok(onWalkway(x, y), `문 ${mid.x},${mid.y} -> ${f.x},${f.y} 길이 벽 위(${x.toFixed(1)},${y.toFixed(1)})`);
        }
      }
    }
  }
});

// codex P2 2차(11-27): 자리는 그대로인데 상태만 바뀌거나(끝남 <-> 기다림, 같은 소파), 대화 상대가 떠나면 순간이동했다
test('W11. 같은 의자에서 끝남과 기다림이 바뀌어도 순간이동하지 않는다', () => {
  // 끝났을 때 왼쪽 소파 자리(REST 1번, 기다림의 첫 자리)를 좋아하는 세션
  const sid = idsWithRest(REST.findIndex((r) => r.spot === WAIT_SEATS[0]), 1)[0];
  const asDone = layoutRoom([row(sid, 'done')]);
  const asWait = layoutRoom([row(sid, 'waiting')]);
  assert.equal(asDone.actors[0].spot, asWait.actors[0].spot, '같은 소파 자리(검사 전제)');
  for (let c = 0; c < 40; c += 1) {
    const change = T0 + c * 4500;
    for (const [a, b] of [[asDone, asWait], [asWait, asDone]]) {
      const track = simulate((t) => (t < change ? a : b), change - 40 * 1000, change + 60 * 1000);
      assert.deepEqual(jumps(track, `local_${sid}`), [], `${change - T0}ms 에 ${a.actors[0].kind} -> ${b.actors[0].kind}`);
    }
  }
});

test('W12. 대화 상대가 일하러 가거나 사라져도 남은 사람이 순간이동하지 않는다', () => {
  const ids = Array.from({ length: 6 }, (_, i) => `s${i}`);
  const before = layoutRoom(ids.map((id) => row(id, 'done')));
  for (let c = 0; c < 30; c += 1) {
    const change = T0 + c * 9000 + 1000;
    for (const gone of ['s4', 's1']) {
      const afterWork = layoutRoom(ids.map((id) => row(id, id === gone ? 'working' : 'done')));
      const afterLeave = layoutRoom(ids.filter((id) => id !== gone).map((id) => row(id, 'done')));
      for (const after of [afterWork, afterLeave]) {
        const track = simulate((t) => (t < change ? before : after), change - 30 * 1000, change + 60 * 1000);
        for (const id of ids) assert.deepEqual(jumps(track, `local_${id}`), [], `${change - T0}ms ${gone} 바뀜, ${id}`);
      }
    }
  }
});

// codex 3차(11-27): 상태가 바뀐 뒤 대화 짝 중 한 명만 대화했다, 폰에서 침대 Zz 가 그림 위로 잘렸다, 고양이 그림이 없어도 쓰다듬었다
test('W13. 대화는 늘 둘이 함께 한다(상태가 바뀐 뒤에도)', () => {
  const ids = Array.from({ length: 6 }, (_, i) => `s${i}`);
  // codex 가 재현한 시각(2026-11-27 00:02:03Z)과 여러 시각
  const changes = [Date.UTC(2026, 10, 27, 0, 2, 3), ...Array.from({ length: 20 }, (_, c) => T0 + c * 6000 + 2000)];
  for (const change of changes) {
    const before = layoutRoom(ids.map((id) => row(id, id === 's3' ? 'working' : 'done')));
    const after = layoutRoom(ids.map((id) => row(id, 'done')));
    const track = simulate((t) => (t < change ? before : after), change - 20 * 1000, change + 90 * 1000, 500);
    for (const s of track) {
      for (const a of s.scene.actors.filter((x) => x.activity?.kind === 'talk' && x.activity.phase === 'do')) {
        const other = s.scene.actors.find((o) => o.id === a.activity.with);
        assert.ok(other?.activity?.kind === 'talk' && other.activity.phase === 'do', `${new Date(s.t).toISOString()} ${a.id} 혼자 대화`);
      }
    }
  }
});

test('W14. 폰 배율에서도 침대 Zz 꼬리표가 그림 위로 잘리지 않는다, 고양이 그림이 없으면 고양이와 관련된 할 일을 하지 않는다', () => {
  for (const r of REST.filter((x) => x.pose === 'bed')) {
    for (const w of [280, 312, 375]) assert.ok(labelBoxes({ pose: 'bed', spot: r.spot }, labelScale(w)).bubble.t >= 0, `${w}px`);
  }
  const layout = layoutRoom(rows('done', 'done', 'done', 'done', 'waiting', 'review'));
  for (let t = T0; t < T0 + 3600 * 1000; t += 1000) {
    for (const a of sceneAt(layout, t, { cat: null }).actors) {
      assert.notEqual(a.mood, 'heart');
      assert.notEqual(a.activity?.kind, 'pet');
    }
  }
});

test('W10. 상태가 바뀌어 걸어온 뒤 할 일 한가운데로 순간이동하지 않는다', () => {
  const ids = Array.from({ length: 6 }, (_, i) => `s${i}`);
  const working = layoutRoom(ids.map((id) => row(id, 'working')));
  const done = layoutRoom(ids.map((id) => row(id, 'done')));
  // 여러 시각에 바꿔 본다(할 일 구간 안 여러 곳)
  for (let c = 0; c < 12; c += 1) {
    const change = T0 + c * 7000 + 3000;
    const track = simulate((t) => (t < change ? working : done), change - 2000, change + 90 * 1000);
    for (const id of ids) assert.deepEqual(jumps(track, `local_${id}`), [], `${change - T0}ms 에 바꿈, ${id}`);
  }
});
