// 상태판의 "세션" 카드 (11-27). Claude 데스크탑 앱 세션마다 작은 캐릭터가 지금 무엇을 하는지 보여 준다.
// 일하는 중은 책상에서 타자, 답 기다림은 손 흔들기, 확인 필요는 서류 들기, 끝남은 잠들기.
// 캐릭터 그림은 이 저장소에서 직접 그린 SVG 다. 움직임은 style.css 의 .sess-char 규칙(동작 줄이기 설정을 따름)
// 10초마다 다시 읽는다. 화면이 숨겨져 있으면 쉬고, 다시 보이면 바로 읽는다

import { h, skeleton, failure, empty } from '../dom.mjs';
import { loadToken } from '../token.mjs';
import { LIVE_MS } from '../live.mjs';
import {
  loadBoard, boardView, canOpenSessions, sessionHref, KIND_LABEL, activityText, poseFor, sinceText,
} from '../sessions.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 캐릭터 하나. 몸은 둥근 사각형, 머리는 원, 앞에 책상과 노트북. 동작에 쓰는 부분마다 class 를 붙여 CSS 로 보이고 움직인다
const CHARACTER = `
<g class="c-desk"><rect x="4" y="38" width="56" height="4" rx="2"/></g>
<g class="c-laptop"><rect x="34" y="25" width="20" height="13" rx="2"/><rect class="c-screen" x="36" y="27" width="16" height="9" rx="1"/></g>
<g class="c-body">
  <rect class="c-torso" x="12" y="22" width="20" height="17" rx="7"/>
  <circle class="c-head" cx="22" cy="15" r="9"/>
  <g class="c-eyes-open"><circle cx="19" cy="14" r="1.6"/><circle cx="25.5" cy="14" r="1.6"/></g>
  <g class="c-eyes-closed"><path d="M17 14.5 q2 1.6 4 0 M23.5 14.5 q2 1.6 4 0"/></g>
</g>
<g class="c-arm c-arm-type"><rect x="27" y="29" width="9" height="3.4" rx="1.7"/></g>
<g class="c-arm c-arm-wave"><rect x="28" y="12" width="3.4" height="12" rx="1.7"/></g>
<g class="c-paper"><rect x="29" y="18" width="10" height="13" rx="1.5"/><path d="M31 22 h6 M31 25 h6 M31 28 h4"/></g>
<g class="c-zz"><text x="33" y="9">z</text><text x="39" y="5">z</text></g>`;

function character(kind) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 44');
  svg.setAttribute('class', `sess-char pose-${poseFor(kind)} kind-${kind}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = CHARACTER; // 고정된 그림만 넣는다(세션 값은 넣지 않는다)
  return svg;
}

function rowEl(r, now, isMac) {
  const href = sessionHref(r, isMac);
  const second = activityText(r.activity) ?? r.detail ?? (r.titleMissing ? '앱 형식이 바뀌어 제목을 못 읽었어요' : null);
  const inner = [
    character(r.kind),
    h(
      'span',
      { class: 'sess-text' },
      h('b', null, r.title),
      second ? h('span', null, second) : null
    ),
    h(
      'span',
      { class: 'sess-meta' },
      h('span', { class: `sess-kind kind-${r.kind}` }, KIND_LABEL[r.kind] ?? r.kind),
      h('span', { class: 'sess-since' }, sinceText(r.since, now))
    ),
  ];
  const label = `${r.title}, ${KIND_LABEL[r.kind] ?? ''}${second ? `, ${second}` : ''}`;
  return h(
    'li',
    null,
    href
      ? h('a', { class: 'sess-row', href, 'data-id': r.id, title: '눌러서 데스크탑 앱에서 이 세션 열기', 'aria-label': `${label}. 눌러서 열기` }, inner)
      : h('div', { class: 'sess-row', 'aria-label': label }, inner)
  );
}

export function sessionsCard({ fetchImpl = (...a) => fetch(...a), storage = localStorage, nav = navigator } = {}) {
  const status = h('small', { class: 'sess-status' });
  const body = h('div', { class: 'sess-body' }, skeleton(3));
  const card = h('section', { class: 'side-card sess', 'aria-label': 'Claude 세션 현황판' }, h('h3', null, '세션 ', status), body);
  const isMac = canOpenSessions(nav);
  let last = null; // 마지막으로 받은 목록(잠깐 실패해도 목록을 지우지 않으려고)
  let loading = false;

  function paint(result) {
    const now = Date.now();
    const view = boardView(result, now);
    status.textContent = '';
    card.classList.toggle('stale', !!view.stale);
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
            h('ul', { class: 'sess-list' }, view.rows.map((r) => rowEl(r, now, isMac))),
            view.ageText ? h('p', { class: 'sess-age' }, view.ageText) : null,
            isMac ? null : h('p', { class: 'sess-hint' }, '맥 브라우저에서 누르면 데스크탑 앱의 그 세션으로 가요'),
          ].filter(Boolean)
        );
        if (focusedId) [...body.querySelectorAll('a.sess-row')].find((a) => a.dataset.id === focusedId)?.focus();
      }
    }
  }

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
