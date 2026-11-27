// 세션 카드 "세션 집" 장면(11-27). 그림은 그리지 않고 자리와 그림판 칸만 계산한다.
// 처음에는 방 하나(nemo 샘플 방)였는데, 사용자가 "이 화면을 자주 볼 것 같아서 더 크게, 원룸이 아닌 집처럼 방을 나눠 달라"고 해서
// 다섯 방짜리 집으로 넓혔다(계획 personal-docs claude-usage-bar/plans/2026-11-27-session-house-plan.md).
// 그림 원본은 비공개 personal-docs/claude-usage-bar/session-room/ 에 있고 화면(app/screens/sessions.mjs)이 토큰으로 읽어 그린다.
//  - house.png: 집 배경 한 장. personal-docs 의 build-house.py 가 LimeZu 벽, 바닥, 가구와 nemo 가구로 미리 조립한다
//  - furniture.png: nemo 가구 묶음(CC0). 책상 의자를 앉은 사람 위에 덧그린다
//  - limezu-interiors.png: LimeZu Modern Interiors 무료판(비상업만). 소파, 안락의자, 식탁 앞면을 덧그린다
//  - memao-01.png ~ memao-10.png: Memao Fantasy 사람 10명(재배포 금지라 공개 저장소에 두지 않는다)
//  - cat.png: Elthen 고양이
// 좌표는 모두 house.png(384x224) 도트. 가구 자리 좌표는 build-house.py 에도 같은 값이 있다. 하나를 고치면 다른 하나도 고친다.
// 자리(spot)는 80x64 짜리 "자리 칸"의 왼쪽 위다(처음 캐릭터 그림 칸 크기). Memao 칸(48x48)은 자리 칸 안에 PERSON_AT 만큼
// 들여 놓아 발끝(자리 칸 y 48)과 가운데(x 40)를 맞춘다

export const ART_FOLDER = 'claude-usage-bar/session-room';
export const PEOPLE = Array.from({ length: 10 }, (_, i) => `memao-${String(i + 1).padStart(2, '0')}.png`);
export const ART_FILES = { house: 'house.png', furniture: 'furniture.png', interiors: 'limezu-interiors.png' };

/** 집 전체(house.png) */
export const HOUSE = { x: 0, y: 0, w: 384, h: 224 };
export const CELL = { w: 80, h: 64 };
/** Memao 칸 크기와 자리 칸 안에 놓는 위치(칸 안 발끝 y 41 -> 자리 칸 y 48, 칸 가운데 x 24 -> 자리 칸 x 40) */
export const PCELL = 48;
export const PERSON_AT = { x: 16, y: 7 };
/** 칸 번호 -> Memao 그림판 안 왼쪽 위(한 줄 8칸) */
export const frameXY = (frame) => ({ sx: (frame % 8) * PCELL, sy: Math.floor(frame / 8) * PCELL });

/**
 * 방(벽지와 바닥, 벽 두께는 뺀다). 위 줄은 침실, 작업실, 식당, 아래 줄은 현관(아래 벽에 바깥문), 거실.
 * 사용자 결정(11-27): 일하는 중 = 작업실, 답 기다림과 확인 필요 = 현관(문 앞에서 사용자를 기다림), 끝남 = 거실, 침실, 식당
 */
export const ROOMS = {
  bedroom: { x: 6, y: 0, w: 112, h: 112 },
  work: { x: 124, y: 0, w: 138, h: 112 },
  dining: { x: 268, y: 0, w: 110, h: 112 },
  entrance: { x: 6, y: 112, w: 96, h: 106 },
  living: { x: 108, y: 112, w: 270, h: 106 },
};
/** 방마다 바닥(벽지 32도트 아래) */
export const FLOORS = {
  bedroom: { x: 6, y: 32, w: 112, h: 80 },
  work: { x: 124, y: 32, w: 138, h: 80 },
  dining: { x: 268, y: 32, w: 110, h: 80 },
  entrance: { x: 6, y: 144, w: 96, h: 74 },
  living: { x: 108, y: 144, w: 270, h: 74 },
};
/**
 * 방 사이 문 구멍. a, b 는 구멍 양쪽 바닥 위 지점(고양이가 지나가는 길), gap 은 벽을 뚫은 곳.
 * 작업실과 거실 사이는 거실 뒤 벽지를 뚫었다(x 232~256)
 */
export const DOORS = [
  { rooms: ['bedroom', 'work'], a: { x: 112, y: 90 }, b: { x: 130, y: 90 }, gap: { x: 118, y: 72, w: 6, h: 32 } },
  { rooms: ['work', 'dining'], a: { x: 256, y: 90 }, b: { x: 274, y: 90 }, gap: { x: 262, y: 72, w: 6, h: 32 } },
  { rooms: ['work', 'living'], a: { x: 244, y: 106 }, b: { x: 244, y: 150 }, gap: { x: 232, y: 106, w: 24, h: 44 } },
  { rooms: ['entrance', 'living'], a: { x: 96, y: 196 }, b: { x: 114, y: 196 }, gap: { x: 102, y: 178, w: 6, h: 34 } },
];

const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** (x, y) 가 있는 방 이름. 벽 위나 집 밖이면 null */
export function roomAt(x, y) {
  for (const [name, r] of Object.entries(ROOMS)) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
  }
  return null;
}
/** 고양이가 걸을 수 있는 곳(바닥과 문 구멍) */
export function onWalkway(x, y) {
  return Object.values(FLOORS).some((f) => inRect(f, x, y)) || DOORS.some((d) => inRect(d.gap, x, y));
}

/** 작업실 책상 넷(build-house.py 와 같은 x). 책상 y 40, 의자 y 52 */
const DESK_X = [136, 164, 192, 220];
export const CHAIR = [147, 128, 10, 14];
// 앉은 사람은 컴퓨터를 바라보는 뒷모습으로 그리고, 그 위에 의자(chair: 집 x, y)를 덧그려 등받이가 다리를 가리게 한다.
// 무료판에는 뒷모습 앉기 그림이 없어서 이렇게 앉은 모습을 만든다(옆모습 앉기는 책상 옆에 서 있는 것처럼 보였다, 11-27)
export const SEATS = DESK_X.map((dx) => ({ x: dx - 32, y: 18, chair: [dx + 3, 52] }));
/** 책상이 다 찼을 때 일하는 중이 서는 작업실 자리(발끝 y 104) */
export const WORK_STANDS = [{ x: 140, y: 56 }, { x: 170, y: 56 }];
/** 현관 서는 자리 여섯(세 명씩 두 줄, 발끝 y 178, 214). 답 기다림 !, 확인 필요 ? 가 문 앞에서 기다린다 */
export const DOOR_STANDS = [130, 166].flatMap((y) => [-16, 14, 44].map((x) => ({ x, y })));
/** 쉬는 자리 아홉이 다 찼을 때 끝남이 서서 조는 거실 자리 */
export const DOZE_STANDS = [{ x: 220, y: 162 }, { x: 250, y: 162 }];

/**
 * 앉는 가구 앞면(가구 그림판 [x, y, 너비, 높이]). 위 14도트가 등받이, 그 아래가 앉는 판과 앞면, 양옆 2도트가 팔걸이.
 * 처음에는 nemo 묶음의 옆에서 본 의자에 Memao 옆모습 앉기를 썼는데, 엉덩이에서 발까지가 7도트뿐이라
 * 의자 앞 허공에 앉은 것처럼 보였다(11-27 사용자: "이건 안 돼"). 앞을 보는 LimeZu 안락의자와 소파로 바꿨다
 */
export const ARMCHAIR = [160, 288, 16, 26];
export const SOFA = [128, 288, 32, 26];
/** 앉은 사람 위에 한 번 더 덧그릴 부분(가구 안 [x, y, 너비, 높이]): 왼쪽 팔걸이, 오른쪽 팔걸이, 앉는 판 아래 앞면 */
export const FRONT_PARTS = {
  armchair: [[0, 0, 2, 26], [14, 0, 2, 26], [0, 14, 16, 12]],
  sofa: [[0, 0, 2, 26], [30, 0, 2, 26], [0, 14, 32, 12]],
};
/** 식당 식탁(LimeZu 그림판 src, 집 자리 at). 식탁 뒤에 선 사람 위에 통째로 덧그려 다리를 가린다 */
export const TABLE = { src: [13, 160, 38, 38], at: [300, 64] };
const SOFA_AT = [152, 158];
export const ARMCHAIRS = [[190, 158], [210, 158]];

/** 앉는 가구 -> 앉은 사람 자리 칸. 사람 가운데(자리 칸 x 40)가 앉는 자리 가운데, 허리(자리 칸 y 37)가 앉는 판(가구 위 16도트) */
const seatIn = (src, at, seatX, parts) => ({
  x: at[0] + seatX + 8 - 40, y: at[1] + 16 - 37, front: { src, at, seatX, parts },
});
const atTable = (x) => ({ x, y: 26, front: { src: TABLE.src, at: TABLE.at, seatX: 0, parts: [[0, 0, TABLE.src[2], TABLE.src[3]]] } });
/** nemo 침대(보이는 부분 16x27)의 왼쪽 위 -> 누운 사람 자리. 돌린 눕기 그림 머리를 베개에, 이불(침대 위 14도트 아래)을 다시 덧그린다 */
const inBed = (bx, by) => ({ x: bx, y: by + 3, clip: [bx, by, 16, 27], quilt: [bx, by + 14, 16, 13] });

// 끝난 세션이 쉬는 자리 아홉. 순서가 restFor 의 번호다(방이 번갈아 나오게 섞었다)
//  - bed: 침실 침대. 누운 그림(190)을 90도 돌려 머리를 베개에 두고, 침대 밖은 잘라 내고(clip), 이불(quilt, 집 좌표)을 다시 덧그린다
//  - armchair: 거실 소파 두 자리와 안락의자 둘에 앞모습으로 앉아 쉬기(앞면 덧그리기)
//  - eat, drink: 식당 식탁 뒤에서 먹기(주먹밥), 마시기(컵). 식탁을 덧그려 다리를 가린다
//  - lie: 거실 러그에 눕기(눕기 칸 190)
export const REST = [
  { pose: 'bed', spot: inBed(24, 30) },
  { pose: 'armchair', spot: seatIn(SOFA, SOFA_AT, 0, FRONT_PARTS.sofa) },
  { pose: 'eat', spot: atTable(270) },
  { pose: 'bed', spot: inBed(56, 30) },
  { pose: 'armchair', spot: seatIn(ARMCHAIR, ARMCHAIRS[0], 0, FRONT_PARTS.armchair) },
  { pose: 'drink', spot: atTable(288) },
  { pose: 'armchair', spot: seatIn(SOFA, SOFA_AT, 16, FRONT_PARTS.sofa) },
  { pose: 'armchair', spot: seatIn(ARMCHAIR, ARMCHAIRS[1], 0, FRONT_PARTS.armchair) },
  { pose: 'lie', spot: { x: 143, y: 155 } },
];
/** 집에 그리는 최대 인원. Memao 가 10명이라 늘 서로 다른 캐릭터가 된다(사용자 결정 11-27) */
export const ROOM_MAX = 10;

const BUBBLE = { waiting: '!', review: '?', done: 'z' };

/** 세션 번호 -> 섞은 수. 같은 번호는 늘 같다(FNV-1a 와 마무리 섞기) */
function hashId(id) {
  let hash = 2166136261;
  for (const ch of String(id ?? '')) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash;
}

/** 세션 번호 -> 좋아하는 캐릭터(PEOPLE 번호). 쉬는 자리를 정하는 아래 비트와 섞이지 않게 그 위 비트로 정한다 */
export function lookFor(id) {
  return Math.floor(hashId(id) / 8) % PEOPLE.length;
}

/** 세션 번호 -> 좋아하는 쉬는 자리(REST 번호) */
export function restFor(id) {
  return Math.floor(hashId(id) / 2) % REST.length;
}

/**
 * 목록(이미 정렬됨) -> 집에 그릴 사람들. 번호 n 은 목록 순서(1부터).
 * 일하는 중은 작업실 책상(앉기), 모자라면 작업실에 서기. 답 기다림 !, 확인 필요 ? 는 현관에 서기.
 * 끝남은 좋아하는 쉬는 자리(restFor)로 가고, 앞선 사람이 차지했으면 REST 순서대로 다음 빈 자리로 간다.
 * 아홉 곳이 다 차면 거실에서 서서 졸기.
 * 캐릭터는 좋아하는 캐릭터(lookFor)를 쓰고, 집에 이미 같은 캐릭터가 있으면 다음 캐릭터로 넘어간다.
 * 집에는 ROOM_MAX 명까지. 자리를 못 받은 사람과 넘친 사람은 overflow 로 센다
 */
export function layoutRoom(list) {
  const free = { seat: [...SEATS], work: [...WORK_STANDS], door: [...DOOR_STANDS], doze: [...DOZE_STANDS], rest: REST.map(() => true) };
  const usedLooks = new Set();
  const takeLook = (id) => {
    const start = lookFor(id);
    for (let k = 0; k < PEOPLE.length; k += 1) {
      const i = (start + k) % PEOPLE.length;
      if (!usedLooks.has(i)) { usedLooks.add(i); return i; }
    }
    return start;
  };
  const takeRest = (id) => {
    const start = restFor(id);
    for (let k = 0; k < REST.length; k += 1) {
      const i = (start + k) % REST.length;
      if (free.rest[i]) { free.rest[i] = false; return REST[i]; }
    }
    return null;
  };
  const actors = [];
  let overflow = 0;
  (list ?? []).forEach((r, i) => {
    if (i >= ROOM_MAX) { overflow += 1; return; }
    let pose = 'stand';
    let spot = null;
    if (r.kind === 'working') {
      spot = free.seat.shift() ?? null;
      if (spot) pose = 'sit';
      else spot = free.work.shift() ?? null;
    } else if (r.kind === 'done') {
      const rest = takeRest(r.id);
      if (rest) { pose = rest.pose; spot = rest.spot; }
      else { pose = 'doze'; spot = free.doze.shift() ?? null; }
    } else {
      spot = free.door.shift() ?? null;
    }
    if (!spot) { overflow += 1; return; }
    actors.push({ n: i + 1, id: r.id, kind: r.kind, pose, spot, look: takeLook(r.id), bubble: BUBBLE[r.kind] ?? null });
  });
  return { actors, overflow };
}

/**
 * Memao 칸 번호(CREDITS.md 의 그림판 설명과 같다). 먹기와 마시기는 그림판을 크게 그려 확인했다(11-27):
 * 200~202 앞모습 주먹밥을 들고 한 입, 268~271 앞모습 컵을 입에. 먹기는 들기, 한 입, 내리기, 한 입 순서로 돌린다
 */
export const FRAMES = { front: 0, back: 4, lie: 190, eat: [200, 201, 202, 201], drink: [268, 269, 270, 271] };

/**
 * 동작과 프레임 -> Memao 칸 번호. 가만히 앞모습(0~3)과 뒷모습(4~7)은 4장을 번갈아 그린다.
 * 앉아서 일하기는 뒷모습에 몸을 1도트씩 오르내려(dy) 타자 치는 느낌을 준다.
 * 침대(bed)는 눕기 그림을 90도 돌려(turn) 그린다. 안락의자, 소파(armchair)는 앞모습 가만히에 팔걸이와 앞면을 덧그린다.
 * 서서 조는 그림이 없어서 서서 졸기(doze)는 앞모습 첫 장(머리 위 Zz 로 자는 것을 보인다)
 */
export function frameCell(pose, frame) {
  const n = Math.abs(Math.floor(frame || 0));
  if (pose === 'sit') return { frame: FRAMES.back + (n % 4), dy: n % 2 };
  if (pose === 'bed') return { frame: FRAMES.lie, turn: true };
  if (pose === 'lie') return { frame: FRAMES.lie };
  if (pose === 'doze') return { frame: FRAMES.front };
  if (pose === 'eat' || pose === 'drink') return { frame: FRAMES[pose][n % 4] };
  return { frame: FRAMES.front + (n % 4) };
}

/**
 * 머리 위 기준점(집 좌표). 번호 동그라미와 말풍선은 labelBoxes 가 이 점에서 정한다.
 * Memao 를 자리 칸에 놓으면 머리 꼭대기는 자리 칸 위에서 약 14도트(누운 사람은 33도트). 침대는 돌린 그림의 위쪽 끝이 머리다
 */
export function headAt(a) {
  const { x, y } = a.spot;
  if (a.pose === 'bed') return { x: x + 8, y: y - 1 };
  if (a.pose === 'lie') return { x: x + 40, y: y + 30 };
  return { x: x + 40, y: y + 13 };
}

/**
 * 번호와 말풍선 크기 배율. 캔버스가 CSS 로 줄어들면 도트가 작아져 폰에서 번호를 읽기 어렵다(사용자 결정 11-27:
 * 폰은 집 전체를 폭에 맞추고 번호와 말풍선만 키운다). 화면에서 번호 동그라미가 약 16px 가 되게 한다.
 * cssWidth: 캔버스가 화면에 보이는 폭(px). 768px 이상이면 1(원래 크기)
 */
export function labelScale(cssWidth) {
  return cssWidth > 0 ? Math.max(1, (16 / 8) * (HOUSE.w / cssWidth)) : 1;
}

/**
 * 번호 동그라미(가운데 cx, cy, 반지름 r)와 말풍선 꼬리표(l, r, t, b). 화면 그리기와 누르기 판정이 같은 값을 쓴다.
 * 번호는 k = 1 이면 반지름 4도트(예전 크기)이고, 아래 끝을 머리 위에 붙인 채 위로 커진다.
 * 말풍선은 번호 동그라미 오른쪽 위에 붙은 8x7(k 배) 꼬리표다. 처음에는 번호 오른쪽에 10x10 으로 두고 키웠는데,
 * 폰에서 현관(30도트 간격)의 "!" 가 옆 사람 번호에 가려 안 보였다(11-27 캡처)
 */
export function labelBoxes(a, k = 1) {
  const h = headAt(a);
  const label = { cx: h.x, cy: h.y - 1 - 4 * k, r: 4 * k };
  const by = label.cy - label.r;
  return { label, bubble: { l: h.x, r: h.x + 8 * k, t: by - 3.5 * k, b: by + 3.5 * k } };
}

/**
 * 몸이 그려지는 범위(집 좌표, Memao 칸 안 그림 범위 + PERSON_AT).
 * 서기, 앉기 x 32~48 y 14~48(소파, 안락의자는 가구 아래 끝까지), 누운 사람 x 19~54 y 30~52, 침대는 이불 밖 머리와 이불 위
 */
export function bodyBox(a) {
  const { x, y } = a.spot;
  if (a.pose === 'bed') return { l: x, r: x + 16, t: y, b: y + 24 };
  if (a.pose === 'lie') return { l: x + 19, r: x + 54, t: y + 30, b: y + 52 };
  if (a.pose === 'armchair') return { l: x + 32, r: x + 48, t: y + 14, b: a.spot.front.at[1] + a.spot.front.src[3] };
  return { l: x + 32, r: x + 48, t: y + 14, b: y + 48 };
}

/**
 * 집에서 누른 자리(집 도트 좌표)에 있는 사람. 몸과 머리 위 번호, 말풍선 자리까지 누를 수 있다.
 * k 는 화면이 쓰는 번호, 말풍선 배율(labelScale). 겹치면 앞(아래, 나중에 그려진)에 있는 사람을 고른다. 없으면 null
 */
export function actorAt(layout, x, y, k = 1) {
  const actors = layout?.actors ?? [];
  const inside = (b) => x >= b.l && x <= b.r && y >= b.t && y <= b.b;
  const front = (list) => (list.length ? list.reduce((f, a) => (a.spot.y >= f.spot.y ? a : f)) : null);
  // 화면은 몸, 말풍선, 번호 순서로 그린다. 그래서 위에 보이는 것부터 본다(codex P2, P3).
  // 1) 번호 동그라미(반지름보다 1도트 넉넉히). 소파 두 자리처럼 붙어 있으면 왼쪽 사람 말풍선이 오른쪽 사람 번호를 덮는데,
  //    번호를 말풍선 위에 그리므로 번호 주인을 고른다(11-27 캡처)
  const labelHit = actors.filter((a) => {
    const { label } = labelBoxes(a, k);
    return Math.hypot(x - label.cx, y - label.cy) <= label.r + 1;
  });
  if (labelHit.length) return front(labelHit);
  // 2) 말풍선
  const bubbleHit = actors.filter((a) => a.bubble && inside(labelBoxes(a, k).bubble));
  if (bubbleHit.length) return front(bubbleHit);
  // 3) 몸
  return front(actors.filter((a) => inside(bodyBox(a))));
}

/** 동작 줄이기 설정이면 첫 프레임에 멈춘다 */
export const animFrame = (frame, reduced) => (reduced ? 0 : frame);

/** 있으면 좋은 그림. 못 받아도 집은 그리고 그 그림만 뺀다(고양이는 장식이라 집 전체를 빼지 않는다) */
export const OPTIONAL_ART = { cat: 'cat.png' };

/**
 * 그림을 받아 이미지로 바꾼다. getBytes(파일 이름) -> ArrayBuffer, decode(bytes) -> 이미지.
 * ART_FILES 가 하나라도 없으면 failed(목록은 그대로 두고 집만 뺀다). OPTIONAL_ART 는 없으면 그 그림만 뺀다.
 * OPTIONAL_ART 는 꼭 필요한 그림이 다 온 뒤 optionalWaitMs 까지만 기다린다(고양이 그림이 느려도 집은 늦지 않게, 리뷰 P3)
 */
export async function loadRoomArt(getBytes, decode, { optionalWaitMs = 1500 } = {}) {
  const load = async ([key, name]) => [key, await decode(await getBytes(name))];
  // 고양이 그림 받기는 바로 시작하고, 기다리는 시간(optionalWaitMs)은 꼭 필요한 그림이 다 온 뒤부터 센다(리뷰 P2)
  const started = Object.entries(OPTIONAL_ART).map((e) => load(e).catch(() => null));
  const waitOptional = () => Promise.all(started.map((p) => {
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), optionalWaitMs); });
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  }));
  try {
    const [entries, people] = await Promise.all([
      Promise.all(Object.entries(ART_FILES).map(load)),
      Promise.all(PEOPLE.map(async (name) => decode(await getBytes(name)))),
    ]);
    const extra = (await waitOptional()).filter(Boolean);
    return { state: 'ready', images: { ...Object.fromEntries([...entries, ...extra]), people } };
  } catch (e) {
    return { state: 'failed', error: String(e?.message ?? e) };
  }
}

/** 그리는 앞뒤 순서(작을수록 먼저, 뒤에). 사람은 발끝 높이, 침대에 누운 사람은 침대 위 것들보다 먼저 그리도록 머리 높이 */
export function depthOf(a) {
  return a.pose === 'bed' ? a.spot.y : a.spot.y + CELL.h - 16;
}

// ---------------------------------------------------------------------------
// 고양이(11-27). 일하지 않고 집에서 놀기만 하는 고양이. 그림은 Elthen 2D Pixel Art Cat Sprites(cat.png, 칸 32x32, 오른쪽을 보는 옆모습)
// 고양이 상태는 시각만으로 계산한다. 그래서 다시 그리거나 새로고침해도 튀지 않고, 같은 시각이면 맥과 폰에서 같다.
// 시간을 CAT_BLOCK_MS 씩 나눠 구간마다 "놀 자리로 걸어가기 -> 한두 가지 하기"를 한다. 가끔은 그 구간 내내 잔다.
// 다른 방의 놀 자리로 갈 때는 방 사이 문 구멍을 거쳐 걷는다(벽을 뚫고 지나가지 않는다)

export const CAT_CELL = 32;
/** 동작 -> 그림판 줄(1부터), 장 수, 초당 장 수 */
export const CAT_ACTS = {
  sit: { row: 1, n: 4, fps: 4 },
  blink: { row: 2, n: 4, fps: 4 },
  lick: { row: 3, n: 4, fps: 6 },
  wash: { row: 4, n: 4, fps: 6 },
  walk: { row: 5, n: 8, fps: 8 },
  run: { row: 6, n: 8, fps: 12 },
  sleep: { row: 7, n: 4, fps: 2 },
  paw: { row: 8, n: 6, fps: 8 },
  jump: { row: 9, n: 7, fps: 10 },
  scared: { row: 10, n: 8, fps: 10 },
};
/**
 * 고양이가 노는 자리(발끝 가운데, 집 좌표). 방마다 하나, 넓은 거실은 둘.
 * 짝수 번호(침실, 식당, 현관)와 홀수 번호(작업실, 거실 둘)를 번갈아 가서 늘 다른 자리로 걷는다
 */
export const CAT_SPOTS = [
  { x: 60, y: 100 }, { x: 150, y: 110 }, { x: 290, y: 108 }, { x: 330, y: 204 }, { x: 39, y: 200 }, { x: 240, y: 205 },
];
export const CAT_BLOCK_MS = 30000;
const CAT_SPEED = { walk: 16, run: 40 }; // 초당 도트
/** 걷기는 구간의 60% 안에 끝낸다. 먼 방으로 갈 때는 그만큼 빨리 걷는다 */
const CAT_WALK_SHARE = 0.6;
const CAT_IDLE = ['sit', 'blink', 'lick', 'wash', 'paw'];
const POKE_MS = 1000;

/** 구간 번호 -> 섞은 수(같은 번호는 늘 같다) */
function mix(k, salt) {
  return hashId(`cat:${salt}:${k}`);
}

/** 구간 k 에서 고양이가 갈 자리 번호. 짝수 구간은 짝수 번 자리, 홀수 구간은 홀수 번 자리에서 골라 앞 구간과 늘 다르다 */
function catSpot(k) {
  const group = CAT_SPOTS.map((_, i) => i).filter((i) => i % 2 === ((k % 2) + 2) % 2);
  return group[mix(k, 'spot') % group.length];
}

/** 방 이름 두 개 -> 그 사이를 잇는 문 구멍 지점들(가는 순서). 방이 넷 이상 떨어져 있어도 문을 차례로 거친다 */
function roomRoute(from, to) {
  if (from === to) return [];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const r = queue.shift();
    if (r === to) break;
    for (const d of DOORS) {
      const i = d.rooms.indexOf(r);
      if (i < 0) continue;
      const next = d.rooms[1 - i];
      if (next in prev) continue;
      prev[next] = { room: r, door: d };
      queue.push(next);
    }
  }
  const points = [];
  for (let r = to; prev[r]; r = prev[r].room) {
    const { room, door } = prev[r];
    const [near, far] = door.rooms[0] === room ? [door.a, door.b] : [door.b, door.a];
    points.unshift(near, far);
  }
  return points;
}

/** 놀 자리 두 곳 사이 걷는 길(점들) */
function catPath(from, to) {
  return [from, ...roomRoute(roomAt(from.x, from.y), roomAt(to.x, to.y)), to];
}

const cell = (act, ms) => {
  const a = CAT_ACTS[act];
  return { act, row: a.row, col: Math.floor((Math.max(0, ms) * a.fps) / 1000) % a.n };
};

/** 길에서 걸어온 거리 d 의 위치와 그 구간 양 끝 */
function alongPath(path, d) {
  let left = d;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1], to = path[i];
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    if (left <= len || i === path.length - 1) {
      const p = len ? Math.min(1, left / len) : 1;
      return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, from, to };
    }
    left -= len;
  }
  return { ...path[0], from: path[0], to: path[0] };
}

/** 길의 마지막 옆으로 걷는 구간 방향(도착한 뒤 바라보는 쪽) */
function lastFlip(path) {
  for (let i = path.length - 1; i > 0; i -= 1) {
    if (path[i].x !== path[i - 1].x) return path[i].x < path[i - 1].x;
  }
  return false;
}

/**
 * 시각 -> 고양이 상태 { x, y(발끝, 집 좌표), act, row, col, flip(왼쪽을 보면 true), walk?: { from, to } }.
 * walk 의 from, to 는 지금 걷는 구간(놀 자리나 문 구멍 지점)의 양 끝이다.
 * reduced: 동작 줄이기면 거실에 앉은 모습 첫 장으로 멈춘다.
 * pokedAt: 고양이를 누른 시각. 그 뒤 1초 동안 누른 자리에서 점프나 놀라기를 하고 다시 하던 일로 돌아간다
 */
export function catAt(t, { reduced = false, pokedAt = null } = {}) {
  if (reduced) return { ...CAT_SPOTS[3], ...cell('sit', 0), flip: false };
  if (pokedAt != null && t >= pokedAt && t - pokedAt < POKE_MS) {
    // 위치와 방향은 하던 일을 그대로 따라가고 동작만 바꾼다(멈췄다가 순간이동하지 않게, 리뷰 P3)
    const base = catAt(t);
    const act = mix(Math.floor(pokedAt), 'poke') % 2 ? 'jump' : 'scared';
    const a = CAT_ACTS[act];
    const col = Math.min(a.n - 1, Math.floor(((t - pokedAt) * a.fps) / 1000));
    return { x: base.x, y: base.y, act, row: a.row, col, flip: base.flip };
  }
  const k = Math.floor(t / CAT_BLOCK_MS);
  const into = t - k * CAT_BLOCK_MS;
  const path = catPath(CAT_SPOTS[catSpot(k - 1)], CAT_SPOTS[catSpot(k)]);
  const to = path[path.length - 1];
  const length = path.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
  const gait = mix(k, 'gait') % 5 === 0 ? 'run' : 'walk';
  const walkMs = Math.min((length / CAT_SPEED[gait]) * 1000, CAT_BLOCK_MS * CAT_WALK_SHARE);
  if (into < walkMs) {
    const at = alongPath(path, (length * into) / walkMs);
    return { x: at.x, y: at.y, ...cell(gait, into), flip: at.to.x === at.from.x ? lastFlip(path) : at.to.x < at.from.x, walk: { from: at.from, to: at.to } };
  }
  const flip = lastFlip(path);
  const rest = into - walkMs;
  // 구간의 30% 는 남은 시간 내내 잔다. 나머지는 남은 시간을 셋으로 나눠 세 가지를 한다(바로 앞과 같은 동작은 고르지 않는다)
  if (mix(k, 'sleep') % 10 < 3) return { x: to.x, y: to.y, ...cell('sleep', rest), flip };
  const part = (CAT_BLOCK_MS - walkMs) / 3;
  const i = Math.min(2, Math.floor(rest / part));
  let pick = mix(k, 'act0') % CAT_IDLE.length;
  for (let j = 1; j <= i; j += 1) pick = (pick + 1 + (mix(k, `act${j}`) % (CAT_IDLE.length - 1))) % CAT_IDLE.length;
  return { x: to.x, y: to.y, ...cell(CAT_IDLE[pick], rest - i * part), flip };
}

/** 고양이 몸이 그려지는 범위(집 좌표). 그림판 칸에서 고양이는 x 9~23, 아래 12도트 */
export function catBox(cat) {
  return { l: cat.x - 8, r: cat.x + 8, t: cat.y - 13, b: cat.y };
}

/**
 * 집에서 누른 자리: 사람({ actor }) 또는 고양이({ cat: true }), 없으면 null. k 는 번호, 말풍선 배율(labelScale).
 * 둘 다 맞으면 앞에 그려진 쪽(그리는 순서 depthOf 가 큰 쪽)을 고른다. 같으면 사람(리뷰 P2 11-27)
 */
export function pickAt(layout, cat, x, y, k = 1) {
  const actor = actorAt(layout, x, y, k);
  let catHit = false;
  if (cat) {
    const b = catBox(cat);
    catHit = x >= b.l && x <= b.r && y >= b.t && y <= b.b;
  }
  if (actor && catHit) return cat.y > depthOf(actor) ? { cat: true } : { actor };
  if (actor) return { actor };
  return catHit ? { cat: true } : null;
}
