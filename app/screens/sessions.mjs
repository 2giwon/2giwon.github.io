// 상태판의 "세션" 카드 (11-27). Claude 데스크탑 앱 세션들이 방 하나에 모여 지금 무엇을 하는지 보여 준다.
// 일하는 중은 컴퓨터 의자에 앉기, 답 기다림은 "!", 확인 필요는 "?", 끝남은 러그 위에서 잠(app/session-room.mjs 가 자리를 정한다).
// 방(nemo 가구 묶음, CC0)과 캐릭터(Pixel Gnome NPC 무료판) 그림은 비공개 personal-docs 에 있고 GitHub 토큰으로 읽는다.
// 캐릭터 그림은 재배포 금지라 이 공개 저장소에 넣지 않는다. 그림을 못 받으면 방만 빼고 목록은 그대로 보인다.
// 방은 0.5초마다 다음 프레임을 그린다. 화면이 숨겨졌거나 "동작 줄이기" 설정이면 멈춘다
// 목록은 10초마다 다시 읽는다. 화면이 숨겨져 있으면 쉬고, 다시 보이면 바로 읽는다

import { h, skeleton, failure, empty } from '../dom.mjs';
import { loadToken } from '../token.mjs';
import { LIVE_MS } from '../live.mjs';
import {
  loadBoard, boardView, canOpenSessions, sessionHref, KIND_LABEL, activityText, sinceText,
} from '../sessions.mjs';
import {
  ART_FOLDER, CROP, CELL, CHAIR, EXTRA_FURNITURE, layoutRoom, frameCell, animFrame, loadRoomArt, actorAt,
} from '../session-room.mjs';

const FRAME_MS = 500;
const ART_REPO = 'personal-docs';
const SCALE = 3; // 캔버스는 방을 3배로 그리고, CSS 로 카드 폭에 맞춘다(도트가 덜 흐려지게)
const KIND_COLOR = { waiting: '#f0a028', working: '#3fb950', review: '#58a6ff', done: '#8d8a80' };

async function decodeImage(bytes) {
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}

/** 방 한 장면을 그린다. 방, 더 놓은 책상, 사람, 번호, 말풍선 순서 */
function drawRoom(canvas, art, layout, frame) {
  const x = canvas.getContext?.('2d');
  if (!x) return;
  const S = SCALE;
  x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.drawImage(art.room, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w * S, CROP.h * S);
  for (const [sx, sy, w, hh, dx, dy] of EXTRA_FURNITURE) {
    x.drawImage(art.furniture, sx, sy, w, hh, (dx - CROP.x) * S, (dy - CROP.y) * S, w * S, hh * S);
  }
  // 아래쪽(앞)에 있는 사람을 나중에 그려 겹칠 때 자연스럽게
  const actors = [...layout.actors].sort((a, b) => a.spot.y - b.spot.y);
  for (const a of actors) {
    const { row, col, dy = 0 } = frameCell(a.pose, frame);
    const sheet = a.sheet === 'woman' ? art.woman : art.man;
    x.drawImage(sheet, col * CELL.w, (row - 1) * CELL.h, CELL.w, CELL.h,
      (a.spot.x - CROP.x) * S, (a.spot.y + dy - CROP.y) * S, CELL.w * S, CELL.h * S);
    // 앉은 사람: 의자를 한 번 더 덧그려 등받이가 다리를 가리게 한다(의자에 앉아 컴퓨터를 보는 뒷모습)
    if (a.spot.chair) {
      const [cx, cy] = a.spot.chair;
      x.drawImage(art.furniture, CHAIR[0], CHAIR[1], CHAIR[2], CHAIR[3], (cx - CROP.x) * S, (cy - CROP.y) * S, CHAIR[2] * S, CHAIR[3] * S);
    }
  }
  for (const a of actors) {
    // 머리 위 번호 동그라미(목록 번호와 같다)와 말풍선. 그림판 칸에서 머리 꼭대기는 위에서 18도트, 누운 사람은 32도트
    const hx = (a.spot.x + 40 - CROP.x) * S;
    const hy = (a.spot.y + (a.pose === 'lie' ? 30 : 17) - CROP.y) * S;
    x.fillStyle = KIND_COLOR[a.kind] ?? '#8d8a80';
    x.beginPath(); x.arc(hx, hy - 5 * S, 4 * S, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#101214'; x.font = `bold ${5 * S}px system-ui, sans-serif`; x.textAlign = 'center';
    x.fillText(String(a.n), hx, hy - 3.2 * S);
    if (a.bubble) {
      const bob = frame % 2 ? -1 : 0;
      const bx = hx + 6 * S, by = hy - (13 - bob) * S;
      x.fillStyle = a.bubble === 'z' ? 'rgba(185,195,255,.92)' : '#ffffff';
      x.fillRect(bx, by, 10 * S, 9 * S);
      x.fillStyle = a.bubble === '!' ? '#e0661b' : a.bubble === '?' ? '#2f6fd6' : '#3a3f6b';
      x.fillText(a.bubble === 'z' ? 'Zz' : a.bubble, bx + 5 * S, by + 7 * S);
    }
  }
}

function rowEl(r, n, now, isMac) {
  const href = sessionHref(r, isMac);
  const second = activityText(r.activity) ?? r.detail ?? (r.titleMissing ? '앱 형식이 바뀌어 제목을 못 읽었어요' : null);
  const inner = [
    h('span', { class: `sess-num kind-${r.kind}`, 'aria-hidden': 'true' }, String(n)),
    h(
      'span',
      { class: 'sess-text' },
      h('b', null, r.title),
      second ? h('span', null, second) : null,
      h(
        'span',
        { class: 'sess-meta' },
        h('span', { class: `sess-kind kind-${r.kind}` }, KIND_LABEL[r.kind] ?? r.kind),
        h('span', { class: 'sess-since' }, sinceText(r.since, now))
      )
    ),
  ];
  const label = `${r.title}, ${KIND_LABEL[r.kind] ?? ''}${second ? `, ${second}` : ''}`;
  return h(
    'li',
    null,
    href
      ? h('a', { class: 'sess-row', href, 'data-id': r.id, title: '눌러서 데스크탑 앱에서 이 세션 열기', 'aria-label': `${label}. 눌러서 열기` }, inner)
      : h('div', { class: 'sess-row', 'data-id': r.id, 'aria-label': label }, inner)
  );
}

export function sessionsCard({
  fetchImpl = (...a) => fetch(...a), storage = localStorage, nav = navigator, store = null,
  getArtBytes = store ? (name) => store.mediaBytes(ART_REPO, ART_FOLDER, name) : null,
} = {}) {
  const status = h('small', { class: 'sess-status' });
  const body = h('div', { class: 'sess-body' }, skeleton(3));
  // 방 장면 자리. 목록을 다시 그려도 방은 그대로 두고 사람만 다시 놓는다
  const canvas = h('canvas', { class: 'sess-room-canvas', width: CROP.w * SCALE, height: CROP.h * SCALE, role: 'img', 'aria-label': '세션들이 모인 방' });
  const roomBox = h('div', { class: 'sess-room loading' }, h('div', { class: 'sess-room-wait' }));
  const roomNote = h('p', { class: 'sess-room-note', hidden: true });
  const card = h('section', { class: 'side-card sess', 'aria-label': 'Claude 세션 현황판' }, h('h3', null, '세션 ', status), roomBox, roomNote, body);
  const isMac = canOpenSessions(nav);
  let last = null; // 마지막으로 받은 목록(잠깐 실패해도 목록을 지우지 않으려고)
  let loading = false;
  let art = { state: 'loading' };
  let layout = { actors: [], overflow: 0 };
  let showRoom = false;
  let shownRows = []; // 지금 목록(방 번호 n = 순서 + 1)

  // 방의 캐릭터 누르기 = 목록 줄 누르기(11-27 사용자 요청). 맥 브라우저는 그 세션을 열고,
  // 폰처럼 데스크탑 앱을 못 여는 곳은 목록의 그 줄로 내려가 잠깐 강조한다
  const roomPoint = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [CROP.x + ((e.clientX - rect.left) * CROP.w) / rect.width, CROP.y + ((e.clientY - rect.top) * CROP.h) / rect.height];
  };
  canvas.addEventListener('click', (e) => {
    const actor = actorAt(layout, ...roomPoint(e));
    const row = actor ? shownRows[actor.n - 1] : null;
    if (!row) return;
    const href = sessionHref(row, isMac);
    if (href) {
      location.href = href;
      return;
    }
    const el = [...body.querySelectorAll('.sess-row')].find((r) => r.dataset.id === row.id);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth; // 같은 줄을 다시 눌러도 강조가 다시 보이게
    el.classList.add('flash');
  });
  canvas.addEventListener('mousemove', (e) => {
    canvas.style.cursor = actorAt(layout, ...roomPoint(e)) ? 'pointer' : '';
  });

  // 방 그림은 카드를 만들 때 한 번만 받는다. 못 받으면 방만 빼고 목록은 그대로
  if (getArtBytes) {
    loadRoomArt(getArtBytes, decodeImage).then((r) => { art = r; paintRoom(); });
  } else {
    art = { state: 'failed', error: '그림을 읽을 저장소 연결이 없어요' };
  }

  function paintRoom() {
    roomBox.hidden = !showRoom || art.state === 'failed';
    roomNote.hidden = !showRoom || (art.state !== 'failed' && layout.overflow === 0);
    if (!showRoom) return;
    if (art.state === 'failed') {
      roomNote.textContent = '방 그림을 불러오지 못했어요. 목록은 아래에 그대로 있어요';
      return;
    }
    roomNote.textContent = layout.overflow ? `+${layout.overflow}명은 방에 자리가 없어 목록에만 있어요` : '';
    if (art.state !== 'ready') return;
    if (roomBox.classList.contains('loading')) {
      roomBox.classList.remove('loading');
      roomBox.replaceChildren(canvas);
    }
    drawRoom(canvas, art.images, layout, animFrame(frame, still()));
  }

  function paint(result) {
    const now = Date.now();
    const view = boardView(result, now);
    status.textContent = '';
    card.classList.toggle('stale', !!view.stale);
    showRoom = view.state === 'list' || view.state === 'empty' || (view.state === 'failed' && !!last);
    layout = view.state === 'list' ? layoutRoom(view.rows) : view.state === 'empty' ? layoutRoom([]) : layout;
    if (view.state === 'list') shownRows = view.rows;
    else if (view.state === 'empty') shownRows = [];
    paintRoom();
    switch (view.state) {
      case 'loading':
        body.replaceChildren(skeleton(3));
        return;
      case 'token':
        body.replaceChildren(failure('GitHub 토큰을 확인해 주세요. 토큰 주인만 세션 목록을 볼 수 있어요'));
        return;
      case 'notSent':
        body.replaceChildren(empty('맥 메뉴 막대 앱에서 아직 보내지 않았어요'));
        return;
      case 'empty':
        body.replaceChildren(empty('지금 열린 세션이 없어요'));
        if (view.ageText) body.append(h('p', { class: 'sess-age' }, view.ageText));
        return;
      case 'failed':
        if (last) {
          paint(last);
          status.textContent = '갱신 실패, 10초 뒤 다시';
          return;
        }
        body.replaceChildren(failure('세션 목록을 받지 못했어요', () => void load()));
        return;
      default: {
        const waiting = view.rows.filter((r) => r.kind === 'waiting').length;
        status.textContent = waiting ? `답 기다림 ${waiting}` : '';
        // 10초마다 다시 그려도 키보드 초점이 그 세션 줄에 남게 한다(codex P2 11-27: 초점이 사라지면 Enter 로 못 연다)
        const focusedId = body.contains(document.activeElement) ? document.activeElement?.dataset?.id : null;
        // replaceChildren 은 null 을 "null" 글자로 넣으므로 빈 자리는 걸러 낸다
        body.replaceChildren(
          ...[
            h('ul', { class: 'sess-list' }, view.rows.map((r, i) => rowEl(r, i + 1, now, isMac))),
            view.ageText ? h('p', { class: 'sess-age' }, view.ageText) : null,
            isMac ? null : h('p', { class: 'sess-hint' }, '맥 브라우저에서 누르면 데스크탑 앱의 그 세션으로 가요'),
          ].filter(Boolean)
        );
        if (focusedId) [...body.querySelectorAll('a.sess-row')].find((a) => a.dataset.id === focusedId)?.focus();
      }
    }
  }

  // 방 움직이기: 0.5초마다 다음 프레임. "동작 줄이기" 설정이면 첫 프레임에 멈춘다
  // 설정은 화면을 연 동안에도 바뀔 수 있어서 그릴 때마다 지금 값을 읽는다(codex P2 11-27)
  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const still = () => !!motion?.matches;
  let frame = 0;
  const animate = setInterval(() => {
    if (gone() || document.hidden) return;
    if (still()) {
      if (frame !== 0) { frame = 0; paintRoom(); }
      return;
    }
    frame += 1;
    paintRoom();
  }, FRAME_MS);

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const result = await loadBoard(fetchImpl, loadToken(storage)?.token);
      // 목록을 받으면 기억하고, 토큰 문제처럼 목록이 아닌 답이면 지운다. 잠깐 실패면 그대로 둔다
      if (result.state === 'list' || result.state === 'empty') last = result;
      else if (result.state !== 'failed') last = null;
      paint(result);
    } finally {
      loading = false;
    }
  }

  // 화면에 붙은 뒤 떨어지면(다른 화면으로 가면) 반복과 문서 알림을 치운다(commute.mjs 와 같은 방식)
  let attached = false;
  const gone = () => {
    if (card.isConnected) attached = true;
    if (!attached || card.isConnected) return false;
    clearInterval(loop);
    clearInterval(animate);
    document.removeEventListener('visibilitychange', onVisible);
    return true;
  };
  const loop = setInterval(() => {
    if (!gone() && !document.hidden) void load();
  }, LIVE_MS);
  const onVisible = () => {
    if (!gone() && !document.hidden) void load();
  };
  document.addEventListener('visibilitychange', onVisible);
  setTimeout(gone, 0);
  void load();
  return card;
}
