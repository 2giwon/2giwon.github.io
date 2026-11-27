// 세션 카드 "방" 장면 (11-27, 사용자가 고른 P 방 + W 캐릭터). 그림은 그리지 않고 자리와 그림판 칸만 계산한다.
// 그림 원본은 비공개 personal-docs/claude-usage-bar/session-room/ 에 있고 화면(app/screens/sessions.mjs)이 토큰으로 읽어 그린다.
//  - room.png, furniture.png: nemo 가구 묶음(CC0)
//  - npc-man.png, npc-woman.png: Pixel Gnome NPC 무료판(재배포 금지라 공개 저장소에 두지 않는다)
// 좌표는 모두 room.png(192x192) 기준 도트. 캐릭터 그림판 칸은 80x64 이고, spot 은 그 칸의 왼쪽 위가 놓일 자리다

export const ART_FOLDER = 'claude-usage-bar/session-room';
export const ART_FILES = { room: 'room.png', furniture: 'furniture.png', man: 'npc-man.png', woman: 'npc-woman.png' };

/** 화면에 쓰는 방 부분(방 안쪽) */
export const CROP = { x: 8, y: 36, w: 176, h: 96 };
export const CELL = { w: 80, h: 64 };

/** 원래 방의 컴퓨터 책상(x 64) 양옆에 같은 책상, 컴퓨터, 의자를 더 놓는다. [그림판 x, y, 너비, 높이, 방 x, 방 y] */
const DESK = [16, 68, 16, 16];
const COMPUTER = [179, 27, 10, 14];
export const CHAIR = [147, 128, 10, 14];
export const EXTRA_FURNITURE = [48, 80].flatMap((x) => [
  [...DESK, x, 66], [...COMPUTER, x + 3, 57], [...CHAIR, x + 3, 78],
]);

// 자리(그림판 칸의 왼쪽 위). 의자는 책상 x 48, 64, 80 에 맞춘다.
// 앉은 사람은 컴퓨터를 바라보는 뒷모습으로 그리고, 그 위에 의자(chair: 방 x, y)를 덧그려 등받이가 다리를 가리게 한다.
// 무료판에는 뒷모습 앉기 그림이 없어서 이렇게 앉은 모습을 만든다(옆모습 앉기는 책상 옆에 서 있는 것처럼 보였다, 11-27)
export const SEATS = [
  { x: 32, y: 44, chair: [67, 78] },
  { x: 16, y: 44, chair: [51, 78] },
  { x: 48, y: 44, chair: [83, 78] },
];
export const STANDS = [{ x: 0, y: 60 }, { x: 60, y: 66 }, { x: 84, y: 66 }, { x: 124, y: 62 }];
export const LIES = [{ x: 104, y: 61 }, { x: 28, y: 58 }];
export const ROOM_MAX = 6;

const BUBBLE = { waiting: '!', review: '?', done: 'z' };

/** 세션 번호 -> 남자 또는 여자. 같은 번호는 늘 같다(FNV-1a 와 마무리 섞기) */
export function sheetFor(id) {
  let hash = 2166136261;
  for (const ch of String(id ?? '')) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash % 2 ? 'woman' : 'man';
}

/**
 * 목록(이미 정렬됨) -> 방에 그릴 사람들. 번호 n 은 목록 순서(1부터).
 * 일하는 중은 의자(앉기), 모자라면 서 있기. 답 기다림 !, 확인 필요 ? 는 서 있기. 끝남은 눕기, 모자라면 서서 졸기.
 * 방에는 ROOM_MAX 명까지. 자리를 못 받은 사람과 넘친 사람은 overflow 로 센다
 */
export function layoutRoom(list) {
  const free = { seat: [...SEATS], stand: [...STANDS], lie: [...LIES] };
  const actors = [];
  let overflow = 0;
  (list ?? []).forEach((r, i) => {
    if (i >= ROOM_MAX) { overflow += 1; return; }
    let pose = 'stand';
    let spot = null;
    if (r.kind === 'working' && free.seat.length) { pose = 'sit'; spot = free.seat.shift(); }
    else if (r.kind === 'done' && free.lie.length) { pose = 'lie'; spot = free.lie.shift(); }
    else {
      pose = r.kind === 'done' ? 'doze' : 'stand';
      spot = free.stand.shift() ?? null;
    }
    if (!spot) { overflow += 1; return; }
    actors.push({ n: i + 1, id: r.id, kind: r.kind, pose, spot, sheet: sheetFor(r.id), bubble: BUBBLE[r.kind] ?? null });
  });
  return { actors, overflow };
}

/**
 * 동작과 프레임 -> 그림판 칸. 가만히(1줄)는 2장을 번갈아, 누워 자기(11줄)와 서서 졸기(9줄)는 1장.
 * 앉아서 일하기는 뒷모습(3줄) 2장을 번갈아 그리고, 몸을 1도트씩 오르내려(dy) 타자 치는 느낌을 준다
 */
export function frameCell(pose, frame) {
  const f = Math.abs(Math.floor(frame || 0)) % 2;
  if (pose === 'sit') return { row: 3, col: f, dy: f };
  if (pose === 'lie') return { row: 11, col: 0 };
  if (pose === 'doze') return { row: 9, col: 0 };
  return { row: 1, col: f };
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
    const { x: sx, y: sy } = a.spot;
    const off = a.pose === 'lie' ? 30 : 17; // 머리 위 기준점(sessions.mjs drawRoom 과 같은 값)
    const cx = sx + 40, cy = sy + off - 5;
    const label = { l: cx - 5, r: cx + 5, t: cy - 5, b: cy + 5 };
    const bubble = { l: sx + 46, r: sx + 56, t: sy + off - 14, b: sy + off - 4 };
    return inside(label) || (a.bubble && inside(bubble));
  });
  if (labelHit.length) return front(labelHit);
  // 2) 몸: 그림판 칸 안에서 실제 그림이 있는 범위(서기, 앉기 x 32~48 y 18~48, 누운 사람 x 18~48 y 32~48)
  const bodyHit = actors.filter((a) => {
    const { x: sx, y: sy } = a.spot;
    return inside(a.pose === 'lie'
      ? { l: sx + 18, r: sx + 48, t: sy + 32, b: sy + 48 }
      : { l: sx + 32, r: sx + 48, t: sy + 18, b: sy + 48 });
  });
  return front(bodyHit);
}

/** 동작 줄이기 설정이면 첫 프레임에 멈춘다 */
export const animFrame = (frame, reduced) => (reduced ? 0 : frame);

/**
 * 그림 4개를 받아 이미지로 바꾼다. getBytes(파일 이름) -> ArrayBuffer, decode(bytes) -> 이미지.
 * 하나라도 못 받거나 못 풀면 failed(목록은 그대로 두고 방만 뺀다)
 */
export async function loadRoomArt(getBytes, decode) {
  try {
    const entries = await Promise.all(
      Object.entries(ART_FILES).map(async ([key, name]) => [key, await decode(await getBytes(name))])
    );
    return { state: 'ready', images: Object.fromEntries(entries) };
  } catch (e) {
    return { state: 'failed', error: String(e?.message ?? e) };
  }
}
