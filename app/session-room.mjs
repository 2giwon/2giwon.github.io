// 세션 카드 "방" 장면 (11-27, 사용자가 고른 P 방 + W 캐릭터). 그림은 그리지 않고 자리와 그림판 칸만 계산한다.
// 그림 원본은 비공개 personal-docs/claude-usage-bar/session-room/ 에 있고 화면(app/screens/sessions.mjs)이 토큰으로 읽어 그린다.
//  - room.png, furniture.png: nemo 가구 묶음(CC0)
//  - memao-01.png ~ memao-10.png: Memao Fantasy 사람 10명(재배포 금지라 공개 저장소에 두지 않는다).
//    처음에는 Pixel Gnome NPC 무료판(남녀 2명)이었는데 같은 캐릭터가 여러 명 나와서 11-27 에 바꿨다
//  - cat.png: Elthen 고양이
// 좌표는 모두 room.png(192x192) 기준 도트. 자리(spot)는 80x64 짜리 "자리 칸"의 왼쪽 위다(처음 Pixel Gnome 칸 크기).
// Memao 칸(48x48)은 그 자리 칸 안에 PERSON_AT 만큼 들여 놓아 발끝(자리 칸 y 48)과 가운데(x 40)를 맞춘다

export const ART_FOLDER = 'claude-usage-bar/session-room';
export const PEOPLE = Array.from({ length: 10 }, (_, i) => `memao-${String(i + 1).padStart(2, '0')}.png`);
//  - limezu-interiors.png: LimeZu Modern Interiors 무료판 16x16 가구 그림판(비상업만 가능). 안락의자를 쓴다
export const ART_FILES = { room: 'room.png', furniture: 'furniture.png', interiors: 'limezu-interiors.png' };

/** 화면에 쓰는 방 부분(방 안쪽) */
export const CROP = { x: 8, y: 36, w: 176, h: 96 };
export const CELL = { w: 80, h: 64 };
/** Memao 칸 크기와 자리 칸 안에 놓는 위치(칸 안 발끝 y 41 -> 자리 칸 y 48, 칸 가운데 x 24 -> 자리 칸 x 40) */
export const PCELL = 48;
export const PERSON_AT = { x: 16, y: 7 };
/** 칸 번호 -> Memao 그림판 안 왼쪽 위(한 줄 8칸) */
export const frameXY = (frame) => ({ sx: (frame % 8) * PCELL, sy: Math.floor(frame / 8) * PCELL });

/** 원래 방의 컴퓨터 책상(x 64) 양옆에 같은 책상, 컴퓨터, 의자를 더 놓는다. [그림판 x, y, 너비, 높이, 방 x, 방 y] */
const DESK = [16, 68, 16, 16];
const COMPUTER = [179, 27, 10, 14];
export const CHAIR = [147, 128, 10, 14];
export const EXTRA_FURNITURE = [
  ...[48, 80].flatMap((x) => [[...DESK, x, 66], [...COMPUTER, x + 3, 57], [...CHAIR, x + 3, 78]]),
];

/**
 * 끝난 세션이 앉아 쉬는 앞을 보는 안락의자(LimeZu 가구 그림판 [x, y, 너비, 높이]). 위 14도트가 등받이, 양옆 2도트가 팔걸이.
 * 처음에는 nemo 가구 묶음의 옆에서 본 의자에 Memao 옆모습 앉기를 썼는데, 앉기 그림의 엉덩이에서 발까지가 7도트뿐이라
 * 의자 앞 허공에 앉은 것처럼 보였다(11-27 사용자: "의자보다 더 앞에 앉아 있다", "이건 안 돼")
 */
export const ARMCHAIR = [160, 288, 16, 26];
/** 사람 위에 한 번 더 덧그릴 부분(안락의자 안 [x, y, 너비, 높이]): 왼쪽 팔걸이, 오른쪽 팔걸이, 앉는 판 아래 앞면. 다리와 팔 옆을 가린다 */
export const ARMCHAIR_FRONT = [[0, 0, 2, 26], [14, 0, 2, 26], [0, 14, 16, 12]];
/** 안락의자 자리(방 x, y): 파란 러그 위, 벽난로 왼쪽(화분 앞). 빈 의자도 늘 그린다 */
export const ARMCHAIRS = [[52, 80], [110, 80]];
/** 안락의자 [x, y] -> 앉은 사람 자리 칸. 사람 가운데(자리 칸 x 40)가 의자 가운데, 허리(자리 칸 y 37)가 앉는 판(의자 위 16도트) */
const seatIn = ([cx, cy]) => ({ x: cx + 8 - 40, y: cy + 16 - 37, armchair: [cx, cy] });

// 자리(그림판 칸의 왼쪽 위). 의자는 책상 x 48, 64, 80 에 맞춘다.
// 앉은 사람은 컴퓨터를 바라보는 뒷모습으로 그리고, 그 위에 의자(chair: 방 x, y)를 덧그려 등받이가 다리를 가리게 한다.
// 무료판에는 뒷모습 앉기 그림이 없어서 이렇게 앉은 모습을 만든다(옆모습 앉기는 책상 옆에 서 있는 것처럼 보였다, 11-27)
export const SEATS = [
  { x: 32, y: 44, chair: [67, 78] },
  { x: 16, y: 44, chair: [51, 78] },
  { x: 48, y: 44, chair: [83, 78] },
];
// 세 번째 서 있는 자리는 처음에 x 84, y 66 이었는데 벽난로 옆 의자와 겹쳐서 파란 러그 오른쪽 아래(x 40, y 76)로 옮겼다.
// x 50, y 78 은 두 번째 서 있는 자리와 겹쳤다(11-27 리뷰)
// 맨 오른쪽 서 있는 자리는 빨간 러그 눕기를 옮기면서 x 124 에서 128 로(11-27)
export const STANDS = [{ x: 0, y: 60 }, { x: 60, y: 66 }, { x: 40, y: 76 }, { x: 128, y: 62 }];

// 끝난 세션이 쉬는 자리 네 곳(11-27, 사용자: "침대도 있는데 다양하게 쉬어도 될 것 같다"). 순서가 restFor 의 번호다
//  - bed: 왼쪽 침대(x 16~31). 누운 그림(11줄)을 90도 돌려 머리를 베개(y 74~78)에 두고, 침대 밖은 잘라 내고(clip),
//         이불과 발판(quilt, room.png 좌표)을 다시 덧그려 이불 밖으로 머리만 보이게 한다. spot 은 돌린 그림(16x30)의 왼쪽 위
//  - armchair: 파란 러그 위, 벽난로 왼쪽의 앞을 보는 안락의자(ARMCHAIRS)에 앞모습으로 앉아 쉬기. 벽난로 쪽은 처음에 벽난로 앞
//              서서 졸기였는데 사용자가 "벽난로에서 쉬는 건 말이 안 된다, 의자를 두자"고 해서 의자로 바꿨다
//  - lie: 빨간 러그(x 128~158) 위에 눕기(눕기 칸 190)
export const REST = [
  // 이불을 y 79 부터 덮으면 얼굴까지 가려서 y 82 부터 덮는다(얼굴은 이불 밖, 11-27 캡처)
  { pose: 'bed', spot: { x: 16, y: 71, clip: [16, 68, 16, 27], quilt: [16, 82, 16, 13] } },
  { pose: 'armchair', spot: seatIn(ARMCHAIRS[0]) },
  { pose: 'armchair', spot: seatIn(ARMCHAIRS[1]) },
  // 빨간 러그 눕기(Memao 는 35도트 길이). 화분 앞 안락의자(x 110~126)와 맨 오른쪽 서 있는 자리 사이에 x 107
  // (x 104 이면 머리가 안락의자 오른쪽 팔걸이를 덮었다, 11-27 리뷰)
  { pose: 'lie', spot: { x: 107, y: 61 } },
];
export const ROOM_MAX = 6;

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

/**
 * 세션 번호 -> 좋아하는 캐릭터(PEOPLE 번호). 쉬는 자리를 정하는 아래 3비트는 빼고 그 위 비트로 정한다.
 * 같은 비트를 쓰면 어떤 캐릭터는 늘 침대처럼 묶여 버린다
 */
export function lookFor(id) {
  return Math.floor(hashId(id) / 8) % PEOPLE.length;
}

/** 세션 번호 -> 좋아하는 쉬는 자리(REST 번호, 섞은 수의 아래 1~2비트) */
export function restFor(id) {
  return Math.floor(hashId(id) / 2) % REST.length;
}

/**
 * 목록(이미 정렬됨) -> 방에 그릴 사람들. 번호 n 은 목록 순서(1부터).
 * 일하는 중은 의자(앉기), 모자라면 서 있기. 답 기다림 !, 확인 필요 ? 는 서 있기.
 * 끝남은 좋아하는 쉬는 자리(restFor)로 가고, 앞선 사람이 차지했으면 REST 순서대로 다음 빈 자리로 간다.
 * 네 곳이 다 차면 서 있는 자리에서 서서 졸기.
 * 캐릭터는 좋아하는 캐릭터(lookFor)를 쓰고, 방에 이미 같은 캐릭터가 있으면 다음 캐릭터로 넘어간다(11-27 사용자 요청).
 * 방에는 ROOM_MAX 명까지. 자리를 못 받은 사람과 넘친 사람은 overflow 로 센다
 */
export function layoutRoom(list) {
  const free = { seat: [...SEATS], stand: [...STANDS], rest: REST.map(() => true) };
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
    const rest = r.kind === 'done' ? takeRest(r.id) : null;
    if (r.kind === 'working' && free.seat.length) { pose = 'sit'; spot = free.seat.shift(); }
    else if (rest) { pose = rest.pose; spot = rest.spot; }
    else {
      pose = r.kind === 'done' ? 'doze' : 'stand';
      spot = free.stand.shift() ?? null;
    }
    if (!spot) { overflow += 1; return; }
    actors.push({ n: i + 1, id: r.id, kind: r.kind, pose, spot, look: takeLook(r.id), bubble: BUBBLE[r.kind] ?? null });
  });
  return { actors, overflow };
}

/** Memao 칸 번호(CREDITS.md 의 그림판 설명과 같다) */
export const FRAMES = { front: 0, back: 4, lie: 190 };

/**
 * 동작과 프레임 -> Memao 칸 번호. 가만히 앞모습(0~3)과 뒷모습(4~7)은 4장을 번갈아 그린다.
 * 앉아서 일하기는 뒷모습에 몸을 1도트씩 오르내려(dy) 타자 치는 느낌을 준다.
 * 침대(bed)는 눕기 그림을 90도 돌려(turn) 그린다. 안락의자(armchair)는 앞모습 가만히(눈 깜빡임)에 팔걸이와 앞면을 덧그린다.
 * 서서 조는 그림이 없어서 서서 졸기(doze)는 앞모습 첫 장(머리 위 Zz 로 자는 것을 보인다)
 */
export function frameCell(pose, frame) {
  const n = Math.abs(Math.floor(frame || 0));
  if (pose === 'sit') return { frame: FRAMES.back + (n % 4), dy: n % 2 };
  if (pose === 'bed') return { frame: FRAMES.lie, turn: true };
  if (pose === 'lie') return { frame: FRAMES.lie };
  if (pose === 'doze') return { frame: FRAMES.front };
  return { frame: FRAMES.front + (n % 4) };
}

/**
 * 머리 위 기준점(room.png 좌표). 번호 동그라미는 이 점 5도트 위, 말풍선은 오른쪽 위에 그린다.
 * 화면 그리기(sessions.mjs drawRoom)와 누르기 판정(actorAt)이 같은 값을 쓰도록 여기 한 곳에 둔다.
 * Memao 를 자리 칸에 놓으면 머리 꼭대기는 자리 칸 위에서 약 14도트(누운 사람은 33도트). 침대는 돌린 그림의 위쪽 끝이 머리다
 */
export function headAt(a) {
  const { x, y } = a.spot;
  if (a.pose === 'bed') return { x: x + 8, y: y - 1 };
  if (a.pose === 'lie') return { x: x + 40, y: y + 30 };
  return { x: x + 40, y: y + 13 };
}

/**
 * 몸이 그려지는 범위(room.png 좌표, Memao 칸 안 그림 범위 + PERSON_AT).
 * 서기, 앉기 x 32~48 y 14~48(안락의자는 의자 아래 끝까지), 누운 사람 x 19~54 y 30~52, 침대는 이불 밖 머리와 이불 위
 */
export function bodyBox(a) {
  const { x, y } = a.spot;
  if (a.pose === 'bed') return { l: x, r: x + 16, t: y, b: y + 24 };
  if (a.pose === 'lie') return { l: x + 19, r: x + 54, t: y + 30, b: y + 52 };
  if (a.pose === 'armchair') return { l: x + 32, r: x + 48, t: y + 14, b: a.spot.armchair[1] + ARMCHAIR[3] };
  return { l: x + 32, r: x + 48, t: y + 14, b: y + 48 };
}

/**
 * 방에서 누른 자리(room.png 도트 좌표)에 있는 사람. 몸과 머리 위 번호, 말풍선 자리까지 누를 수 있다.
 * 겹치면 앞(아래, 나중에 그려진)에 있는 사람을 고른다. 없으면 null
 */
export function actorAt(layout, x, y) {
  const actors = layout?.actors ?? [];
  const inside = (b) => x >= b.l && x <= b.r && y >= b.t && y <= b.b;
  const front = (list) => (list.length ? list.reduce((f, a) => (a.spot.y >= f.spot.y ? a : f)) : null);
  // 1) 번호 동그라미와 말풍선(화면 그리기와 같은 좌표, 말풍선은 프레임마다 1도트 오르내림). 몸보다 위에 그려지므로 먼저 본다(codex P2, P3)
  const labelHit = actors.filter((a) => {
    const h = headAt(a);
    const cy = h.y - 5;
    const label = { l: h.x - 5, r: h.x + 5, t: cy - 5, b: cy + 5 };
    const bubble = { l: h.x + 6, r: h.x + 16, t: h.y - 14, b: h.y - 4 };
    return inside(label) || (a.bubble && inside(bubble));
  });
  if (labelHit.length) return front(labelHit);
  // 2) 몸
  return front(actors.filter((a) => inside(bodyBox(a))));
}

/** 동작 줄이기 설정이면 첫 프레임에 멈춘다 */
export const animFrame = (frame, reduced) => (reduced ? 0 : frame);

/** 있으면 좋은 그림. 못 받아도 방은 그리고 그 그림만 뺀다(고양이는 장식이라 방 전체를 빼지 않는다) */
export const OPTIONAL_ART = { cat: 'cat.png' };

/**
 * 그림을 받아 이미지로 바꾼다. getBytes(파일 이름) -> ArrayBuffer, decode(bytes) -> 이미지.
 * ART_FILES 가 하나라도 없으면 failed(목록은 그대로 두고 방만 뺀다). OPTIONAL_ART 는 없으면 그 그림만 뺀다.
 * OPTIONAL_ART 는 꼭 필요한 그림이 다 온 뒤 optionalWaitMs 까지만 기다린다(고양이 그림이 느려도 방은 늦지 않게, 리뷰 P3)
 */
export async function loadRoomArt(getBytes, decode, { optionalWaitMs = 1500 } = {}) {
  const load = async ([key, name]) => [key, await decode(await getBytes(name))];
  // 고양이 그림 받기는 바로 시작하고, 기다리는 시간(optionalWaitMs)은 꼭 필요한 그림이 다 온 뒤부터 센다
  // (처음에는 시작할 때부터 세서 사람 그림 10장이 느리면 고양이가 조용히 빠졌다, 리뷰 P2)
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
// 고양이(11-27). 일하지 않고 방에서 놀기만 하는 고양이. 그림은 Elthen 2D Pixel Art Cat Sprites(cat.png, 칸 32x32, 오른쪽을 보는 옆모습)
// 고양이 상태는 시각만으로 계산한다. 그래서 다시 그리거나 새로고침해도 튀지 않고, 같은 시각이면 맥과 폰에서 같다.
// 시간을 CAT_BLOCK_MS 씩 나눠 구간마다 "놀 자리로 걸어가기 -> 한두 가지 하기"를 한다. 가끔은 그 구간 내내 잔다

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
 * 고양이가 노는 자리(발끝 가운데, room.png 좌표): 왼쪽 아래 바닥, 벽난로 앞, 파란 러그 옆, 방 가운데, 문 앞.
 * 처음에는 침대 발치(이불 위)도 있었는데 이불 무늬와 섞여 안 보여서 뺐다. 벽난로 앞은 빨간 러그에 누운 사람 번호를 피해 x 133(11-27 캡처)
 */
export const CAT_SPOTS = [
  { x: 58, y: 120 }, { x: 133, y: 86 }, { x: 80, y: 104 }, { x: 100, y: 118 }, { x: 118, y: 126 },
];
export const CAT_BLOCK_MS = 30000;
const CAT_SPEED = { walk: 16, run: 40 }; // 초당 도트
const CAT_IDLE = ['sit', 'blink', 'lick', 'wash', 'paw'];
const POKE_MS = 1000;

/** 구간 번호 -> 섞은 수(같은 번호는 늘 같다) */
function mix(k, salt) {
  return hashId(`cat:${salt}:${k}`);
}

/**
 * 구간 k 에서 고양이가 갈 자리 번호. 짝수 구간은 0, 2, 4 번 자리, 홀수 구간은 1, 3 번 자리에서 골라
 * 앞 구간과 늘 다른 자리로 걸어간다(같은 자리면 걷지 않고 같은 동작이 두 구간 넘게 이어졌다)
 */
function catSpot(k) {
  const group = CAT_SPOTS.map((_, i) => i).filter((i) => i % 2 === ((k % 2) + 2) % 2);
  return group[mix(k, 'spot') % group.length];
}

const cell = (act, ms) => {
  const a = CAT_ACTS[act];
  return { act, row: a.row, col: Math.floor((Math.max(0, ms) * a.fps) / 1000) % a.n };
};

/**
 * 시각 -> 고양이 상태 { x, y(발끝, room.png 좌표), act, row, col, flip(왼쪽을 보면 true), walk?: { from, to } }.
 * reduced: 동작 줄이기면 방 가운데에 앉은 모습 첫 장으로 멈춘다.
 * pokedAt: 고양이를 누른 시각. 그 뒤 1초 동안 누른 자리에서 점프나 놀라기를 하고 다시 하던 일로 돌아간다
 */
export function catAt(t, { reduced = false, pokedAt = null } = {}) {
  if (reduced) return { ...CAT_SPOTS[3], ...cell('sit', 0), flip: false };
  if (pokedAt != null && t >= pokedAt && t - pokedAt < POKE_MS) {
    // 위치와 방향은 하던 일을 그대로 따라가고 동작만 바꾼다(멈췄다가 순간이동하지 않게, 리뷰 P3)
    const base = catAt(t);
    const act = mix(Math.floor(pokedAt), 'poke') % 2 ? 'jump' : 'scared';
    const a = CAT_ACTS[act];
    // 한 번만 하고 마지막 장에 머문다
    const col = Math.min(a.n - 1, Math.floor(((t - pokedAt) * a.fps) / 1000));
    return { x: base.x, y: base.y, act, row: a.row, col, flip: base.flip };
  }
  const k = Math.floor(t / CAT_BLOCK_MS);
  const into = t - k * CAT_BLOCK_MS;
  const from = CAT_SPOTS[catSpot(k - 1)];
  const to = CAT_SPOTS[catSpot(k)];
  const gait = mix(k, 'gait') % 5 === 0 ? 'run' : 'walk';
  const walkMs = (Math.hypot(to.x - from.x, to.y - from.y) / CAT_SPEED[gait]) * 1000;
  const flip = to.x < from.x;
  if (into < walkMs) {
    const p = into / walkMs;
    return {
      x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, ...cell(gait, into), flip,
      walk: { from, to },
    };
  }
  const rest = into - walkMs;
  // 구간의 30% 는 남은 시간 내내 잔다. 나머지는 남은 시간을 셋으로 나눠 세 가지를 한다(바로 앞과 같은 동작은 고르지 않는다)
  if (mix(k, 'sleep') % 10 < 3) return { ...to, ...cell('sleep', rest), flip };
  const part = (CAT_BLOCK_MS - walkMs) / 3;
  const i = Math.min(2, Math.floor(rest / part));
  let pick = mix(k, 'act0') % CAT_IDLE.length;
  for (let j = 1; j <= i; j += 1) pick = (pick + 1 + (mix(k, `act${j}`) % (CAT_IDLE.length - 1))) % CAT_IDLE.length;
  return { ...to, ...cell(CAT_IDLE[pick], rest - i * part), flip };
}

/** 고양이 몸이 그려지는 범위(room.png 좌표). 그림판 칸에서 고양이는 x 9~23, 아래 12도트 */
export function catBox(cat) {
  return { l: cat.x - 8, r: cat.x + 8, t: cat.y - 13, b: cat.y };
}

/**
 * 방에서 누른 자리: 사람({ actor }) 또는 고양이({ cat: true }), 없으면 null.
 * 둘 다 맞으면 앞에 그려진 쪽(그리는 순서 depthOf 가 큰 쪽)을 고른다. 같으면 사람
 * (처음에는 늘 사람이 먼저였는데, 사람 앞에 그려진 고양이를 눌러도 세션이 열렸다. 리뷰 P2 11-27)
 */
export function pickAt(layout, cat, x, y) {
  const actor = actorAt(layout, x, y);
  let catHit = false;
  if (cat) {
    const b = catBox(cat);
    catHit = x >= b.l && x <= b.r && y >= b.t && y <= b.b;
  }
  if (actor && catHit) return cat.y > depthOf(actor) ? { cat: true } : { actor };
  if (actor) return { actor };
  return catHit ? { cat: true } : null;
}
