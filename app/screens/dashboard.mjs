// 상태판(11-26 작업노트 국제공항). 결정 기록: personal-docs/2giwon.github.io/decisions.md
// - 탑승권 레일: 오늘 할 일(passes.mjs)
// - 관제탑 띠: 프로젝트마다 상태 하나(결항, 탑승 중, 지연, 도착, 대기). 누르면 운항 정보(최신 핸드오프의 지금 상태, 다음 할 일, 미결)
// - 옆 칸: 오늘 도착(끝낸 일), 나중에 탑승, 도착 안내(최신 문서), 운항 기록(최근 14일 그래프)
// - 라운지 창문: Claude 테마
// - 세션 카드: Claude 데스크탑 앱 세션마다 캐릭터로 지금 하는 일(sessions.mjs, 11-27)
// PC 는 두 칸(왼쪽 레일과 관제탑, 오른쪽 옆 칸), 폰은 한 줄로 쌓는다(style.css .airport)

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { handoverCard } from '../handover.mjs';
import { passesSection, flap, flapBoard } from './passes.mjs';
import { recentTimeline } from '../timeline.mjs';
import { timelineChart } from '../draw.mjs';
import { today } from '../store.mjs';
import { iconSvg } from '../icons.mjs';
import { loadThemeBanner } from '../themes.mjs';
import { towerStatus, flightPrefix, TOWER_LABEL, towerNowText } from '../airport.mjs';
import { VIDEO_REPO, VIDEO_TASKS_PATH, STATUS_LABEL, parseTaskList, nextUp } from '../video.mjs';
import { LAB } from '../catalog.mjs';
import { sessionsCard } from './sessions.mjs';

const TIMELINE_DAYS = 14;
const LATEST_COUNT = 10;

export const docHref = (doc) => `#/doc/${doc.repo}/${doc.path.split('/').map(encodeURIComponent).join('/')}`;
const folderHref = (p) => `#/folders/${p.repo}/${encodeURIComponent(p.folder)}`;

function titleOf(path) {
  return path
    .split('/')
    .pop()
    .replace(/\.md$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}-?/, '')
    .replace(/-/g, ' ');
}

const boardTitle = (text, extra = null) => h('h2', { class: 'board-title' }, h('span', null, text), extra);

// ─── 관제탑: 출발 안내판 표(11-26 사용자 요청, 샘플 H 모양) ───────────────────
// 열: 편명, 목적지(프로젝트), 지금 할 일, 게이트, 상태. 편명 글자판은 몇 초마다 전광판처럼 "촤르르" 돌다 멈춘다.

const FLAP_EVERY_MS = 9000; // 이만큼마다 안내판 전체가 한 줄씩 차례로 촤르르
const FLAP_ROW_GAP_MS = 140; // 줄과 줄 사이 시간차

const gateOf = (p) => (p.repo === LAB ? '회사' : '개인');

/** 프로젝트 한 줄. 최신 핸드오프를 읽어 미결과 다음 할 일을 알아낸다 */
function towerItem(store, p, code, onSelect) {
  const state = { hasOpen: p.latestHandover ? null : false, card: null, fig: null, error: null, todayCount: 0, todayTitle: null, tasksLoaded: false };
  const pill = h('span', { class: 'tw-pill' });
  const now = h('span', { class: 'tw-now' });
  const board = flapBoard(code);
  const el = h(
    'button',
    { type: 'button', class: 'tw-row', 'aria-expanded': 'false', onclick: () => onSelect(item) },
    h('span', { class: 'tw-code' }, board.el),
    h('span', { class: 'tw-dest' }, p.label),
    now,
    h('span', { class: 'tw-gate' }, gateOf(p)),
    h('span', { class: 'tw-st' }, pill)
  );
  const item = { p, el, state, update, board };

  function update() {
    const s = towerStatus({ paused: p.paused, todayCount: state.todayCount, hasOpen: state.tasksLoaded ? state.hasOpen : null, lastDate: p.lastDate }, today());
    el.dataset.status = s;
    pill.className = `tw-pill st-${s}`;
    pill.textContent = s === 'delayed' && state.card?.open.length ? `${TOWER_LABEL[s]} (미결 ${state.card.open.length})` : TOWER_LABEL[s];
    now.textContent = state.error ? '핸드오프를 읽지 못했어요' : towerNowText({ todayTitle: state.todayTitle, card: state.card, lastDate: p.lastDate });
  }

  // item.update 는 관제탑이 덮어써(운항 정보 다시 그리기) 쓰므로 늘 item.update 로 부른다
  async function load() {
    if (!p.latestHandover) return item.update();
    try {
      const doc = p.latestHandover;
      const [md, fig] = await Promise.all([store.text(doc.repo, doc.sha), store.figures(doc)]);
      state.card = handoverCard(md, fig.data);
      state.fig = fig;
      state.hasOpen = state.card.open.length > 0;
    } catch (e) {
      state.error = e;
      state.hasOpen = false; // 못 읽은 것은 지연으로 단정하지 않는다. 칸에 "핸드오프 못 읽음"을 함께 적는다
    }
    item.update();
  }

  update();
  void load();
  return item;
}

/** 고른 프로젝트의 운항 정보 */
function towerDetail(item, retry) {
  const { p, state } = item;
  const head = h(
    'div',
    { class: 'twd-head' },
    flap(item.board.code),
    h('a', { href: folderHref(p) }, h('h3', null, p.label)),
    h('span', { class: `tw-pill st-${item.el.dataset.status}` }, TOWER_LABEL[item.el.dataset.status]),
    h('span', { class: 'twd-date' }, p.lastDate ? `마지막 ${koDate(p.lastDate)}` : '')
  );
  if (!p.latestHandover) {
    const latest = [...p.docs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
    return h('div', { class: 'tw-detail' }, head, empty('핸드오프 없음'), latest ? h('a', { class: 'twd-link', href: docHref(latest) }, `최신 문서: ${titleOf(latest.path)}`) : null);
  }
  if (state.error) return h('div', { class: 'tw-detail' }, head, failure(`핸드오프를 읽지 못했어요 (${errorText(state.error)})`, retry));
  if (!state.card) return h('div', { class: 'tw-detail' }, head, skeleton(3));
  const doc = p.latestHandover;
  const c = state.card;
  const col = (label, items, cls) => h('div', { class: `twd-col ${cls}` }, h('h4', null, label), items.length ? h('ul', null, items.map((x) => h('li', null, x))) : h('p', { class: 'muted' }, '없음'));
  return h(
    'div',
    { class: 'tw-detail' },
    head,
    h('a', { class: 'twd-link', href: docHref(doc) }, `${koDate(doc.date)} 핸드오프: ${titleOf(doc.path)}`, state.fig?.state === 'stale' ? h('span', { class: 'badge warn' }, '그림 오래됨') : null),
    c.source === 'none'
      ? h('p', { class: 'muted' }, '요약할 항목을 찾지 못했어요. 눌러서 원문을 봐요.')
      : h('div', { class: 'twd-cols' }, col('지금 상태', c.state, 'state'), col('다음 할 일', c.next, 'next'), col(`미결 ${c.open.length}`, c.open, 'open'))
  );
}

/** 유튜브 영상 한 줄. 편명은 YT + 다음 단계 번호(T6 이면 YT6), 상태는 진행(13 / 28). 누르면 영상 자동화 화면(정비 점검표) */
function videoItem(store, catalog) {
  const doc = catalog.allDocs.find((d) => d.repo === VIDEO_REPO && d.path === VIDEO_TASKS_PATH);
  const board = flapBoard('YT0');
  const now = h('span', { class: 'tw-now' }, h('span', { class: 'skeleton-line' }));
  const pill = h('span', { class: 'tw-pill st-checking' }, TOWER_LABEL.checking);
  const el = h(
    'a',
    { class: 'tw-row tw-video', href: '#/video' },
    h('span', { class: 'tw-code' }, board.el),
    h('span', { class: 'tw-dest' }, '유튜브 영상 만들기'),
    now,
    h('span', { class: 'tw-gate' }, '개인'),
    h('span', { class: 'tw-st' }, pill)
  );
  const item = { el, board };
  if (!doc) {
    now.textContent = '작업 목록을 아직 올리지 않았어요';
    pill.className = 'tw-pill st-waiting';
    pill.textContent = TOWER_LABEL.waiting;
    return item;
  }
  const load = async () => {
    try {
      const { groups, progress } = parseTaskList(await store.text(VIDEO_REPO, doc.sha));
      const it = nextUp(groups);
      now.textContent = it ? `${it.id ?? ''} ${it.title}`.trim() : '모든 단계를 끝냈어요';
      const done = progress.total > 0 && progress.done >= progress.total;
      pill.className = `tw-pill ${done ? 'st-arrived' : 'st-delayed'}`;
      pill.textContent = done ? TOWER_LABEL.arrived : `정비 ${progress.done} / ${progress.total}`;
      const num = String(it?.id ?? '').replace(/\D/g, '').slice(0, 1) || '0';
      board.spin(`YT${num}`);
      if (it) el.title = `다음 단계 ${STATUS_LABEL[it.status]}`;
    } catch (e) {
      now.textContent = `작업 목록을 읽지 못했어요 (${errorText(e)})`;
      pill.className = 'tw-pill st-cancelled';
      pill.textContent = '못 읽음';
    }
  };
  void load();
  return item;
}

function towerSection(store, catalog) {
  const groups = catalog.groups;
  const detail = h('div', { class: 'tw-detail-slot' });
  let selected = null;
  const select = (item) => {
    if (selected) selected.el.setAttribute('aria-expanded', 'false');
    if (selected === item) {
      selected = null;
      detail.replaceChildren();
      return;
    }
    selected = item;
    item.el.setAttribute('aria-expanded', 'true');
    detail.replaceChildren(towerDetail(item, () => location.reload()));
  };
  const items = [];
  const codeCount = new Map();
  const nextCode = (p) => {
    const prefix = flightPrefix(p);
    const n = (codeCount.get(prefix) ?? 0) + 1;
    codeCount.set(prefix, n);
    return `${prefix}${n % 10}`;
  };
  const failures = [];
  const archived = [];
  for (const g of groups) {
    if (g.error) failures.push(failure(`${g.label} 저장소를 읽지 못했어요 (${errorText(g.error)})`, () => location.reload()));
    items.push(...g.projects.map((p) => towerItem(store, p, nextCode(p), select)));
    archived.push(...g.archived);
  }
  const video = videoItem(store, catalog);
  const head = h('div', { class: 'tw-row tw-head', 'aria-hidden': 'true' }, h('span', null, '편명'), h('span', null, '목적지 (프로젝트)'), h('span', null, '지금 할 일'), h('span', { class: 'tw-gate' }, '게이트'), h('span', null, '상태'));
  const table = h('div', { class: 'tw-table', role: 'list' }, head, video.el, items.map((i) => i.el));
  const rows = [
    failures,
    table, // 프로젝트가 없어도 유튜브 영상 줄은 늘 보인다(codex P2 11-26)
    items.length ? null : empty('프로젝트가 없어요'),
    archived.length
      ? h('details', { class: 'tw-archived' }, h('summary', null, `보관 중 ${archived.length}`), h('ul', null, archived.map((p) => h('li', null, h('a', { href: folderHref(p) }, p.label), p.lastDate ? ` 마지막 ${koDate(p.lastDate)}` : ''))))
      : null,
  ];
  // 몇 초마다 안내판 전체가 위에서부터 한 줄씩 차례로 "촤르르" 돌다 제 편명에 멈춘다. 다른 화면으로 가면 멈춘다
  const boards = [video.board, ...items.map((i) => i.board)];
  const flipAll = () => boards.forEach((b, i) => setTimeout(() => b.spin(b.code), i * FLAP_ROW_GAP_MS));
  const loop = setInterval(() => {
    if (!table.isConnected) return clearInterval(loop);
    flipAll();
  }, FLAP_EVERY_MS);
  setTimeout(flipAll, 600); // 처음 열 때 한 번
  // 운항 정보를 연 채 핸드오프가 늦게 도착하면 다시 그린다
  for (const it of items) {
    const orig = it.update;
    it.update = () => {
      orig();
      if (selected === it) detail.replaceChildren(towerDetail(it, () => location.reload()));
    };
  }
  const section = h(
    'section',
    { class: 'tower', 'aria-label': '관제탑' },
    boardTitle('출발 Departures', h('small', null, '관제탑, 줄을 누르면 운항 정보')),
    rows,
    detail
  );
  /** 탑승권 레일이 오늘 할 일을 다 읽으면 프로젝트마다 오늘 몇 장인지 알려 준다 */
  const setPasses = ({ passes }) => {
    const counts = new Map();
    const firstTitle = new Map();
    for (const p of passes) {
      if (!p.project) continue;
      counts.set(p.project.id, (counts.get(p.project.id) ?? 0) + 1);
      if (!firstTitle.has(p.project.id)) firstTitle.set(p.project.id, p.task.title);
    }
    for (const it of items) {
      it.state.todayCount = counts.get(it.p.id) ?? 0;
      it.state.todayTitle = firstTitle.get(it.p.id) ?? null;
      it.state.tasksLoaded = true;
      if (it.state.hasOpen === null && !it.p.latestHandover) it.state.hasOpen = false;
      it.update();
    }
  };
  return { section, setPasses };
}

// ─── 옆 칸: 도착 안내, 운항 기록 ──────────────────────────────────────────────

function arrivalsSection(catalog) {
  const items = recentTimeline(catalog, today(), TIMELINE_DAYS);
  return h(
    'section',
    { class: 'side-card board-card' },
    boardTitle('도착 안내', h('small', null, '최신 문서')),
    items.length
      ? h(
          'ol',
          { class: 'arrivals' },
          items.slice(0, LATEST_COUNT).map((d) =>
            h('li', null, h('span', { class: 'arr-date' }, koDate(d.date)), h('span', { class: `arr-gate ${d.repo === LAB ? 'company' : 'personal'}` }, d.repo === LAB ? '회사' : '개인'), h('a', { href: docHref(d) }, titleOf(d.path)))
          )
        )
      : h('p', { class: 'side-empty' }, `최근 ${TIMELINE_DAYS}일 도착한 문서가 없어요`)
  );
}

function flightLogSection(catalog) {
  const items = recentTimeline(catalog, today(), TIMELINE_DAYS);
  return h(
    'section',
    { class: 'side-card' },
    boardTitle('운항 기록', h('small', null, `최근 ${TIMELINE_DAYS}일`)),
    items.length ? timelineChart(items, today(), TIMELINE_DAYS) : h('p', { class: 'side-empty' }, `최근 ${TIMELINE_DAYS}일 문서 없음`)
  );
}

// ─── 라운지 창문(Claude 테마) ──────────────────────────────────────────────────

/**
 * 테마 갤러리로 가는 배너(11-26). 글과 링크는 바로 보이고, 지금 테마 이름과 썸네일만 서버에서 받아 채운다.
 * 썸네일 blob 주소는 그림을 그린 뒤(또는 실패하면) 바로 정리해 상태판을 여러 번 열어도 쌓이지 않는다.
 */
function themesLink(store) {
  const pill = h('span', { class: 'theme-banner-pill' });
  const thumb = h('span', { class: 'theme-banner-thumb', html: iconSvg('palette') });
  const nowLine = h('span', { class: 'theme-banner-now' }, h('span', { class: 'theme-banner-now-label' }, '지금 테마'), pill);

  const PILL_TEXT = {
    missing: '맥 앱이 아직 연결되지 않았어요',
    invalid: '맥 상태를 못 불러왔어요',
    error: '맥 상태를 못 불러왔어요',
    none: '켜진 테마 없음',
  };
  loadThemeBanner(store, (s) => {
    if (s.kind === 'loading') {
      pill.className = 'theme-banner-pill loading';
      pill.setAttribute('aria-label', '불러오는 중');
      pill.replaceChildren();
      return;
    }
    pill.removeAttribute('aria-label');
    if (s.kind !== 'current') {
      pill.className = `theme-banner-pill ${s.kind === 'invalid' || s.kind === 'error' ? 'fail' : 'quiet'}`;
      pill.replaceChildren(PILL_TEXT[s.kind]);
      return;
    }
    pill.className = 'theme-banner-pill';
    pill.replaceChildren(s.title);
    if (s.thumb === 'loading') thumb.classList.add('loading');
    else thumb.classList.remove('loading');
    // 썸네일 실패는 "미리보기 없음"으로 알린다. 아이콘만 남기면 아직 안 받은 것과 구분되지 않는다(리뷰 11-26)
    const thumbFailed = () => {
      thumb.className = 'theme-banner-thumb failed';
      thumb.replaceChildren(h('span', null, '미리보기 없음'));
    };
    if (s.thumb === 'failed') thumbFailed();
    if (s.thumb === 'ok') {
      const url = URL.createObjectURL(new Blob([s.bytes], { type: 'image/png' }));
      const done = () => URL.revokeObjectURL(url);
      const broken = () => {
        done();
        thumbFailed();
      };
      const img = h('img', { src: url, alt: `${s.title} 미리보기`, onload: done, onerror: broken });
      thumb.replaceChildren(img);
      thumb.classList.add('has-img');
    }
  });

  return h(
    'section',
    { class: 'lounge', 'aria-label': '라운지 창문' },
    boardTitle('라운지 창문', h('small', null, 'Claude 테마')),
    h(
      'a',
      { class: 'theme-banner', href: '#/themes' },
      h('span', { class: 'theme-banner-icon', html: iconSvg('palette') }),
      h(
        'span',
        { class: 'theme-banner-text' },
        h('span', { class: 'theme-banner-title' }, '테마 갤러리 열기', h('span', { class: 'theme-banner-arrow', 'aria-hidden': 'true' }, '›')),
        h('span', { class: 'theme-banner-desc' }, '미리보기를 보고 맥의 Claude 테마를 바꿔요'),
        nowLine
      ),
      thumb
    )
  );
}

// ─── 화면 ─────────────────────────────────────────────────────────────────────

/** 목록 받기 전 자리. 실제 화면과 같은 칸 구성으로 자리를 잡아 밀리지 않게 한다 */
export function dashboardLoading() {
  return h(
    'div',
    { class: 'airport' },
    h(
      'div',
      { class: 'ap-main' },
      h(
        'section',
        { class: 'bp-area ap-rail' },
        h('header', { class: 'bp-head' }, h('h2', null, '오늘 탑승할 주문')),
        h('div', { class: 'bp-rail' }),
        h('div', { class: 'bp-rail-passes' }, [1, 2, 3].map(() => h('div', { class: 'bp bp-skeleton' }, skeleton(4))))
      ),
      h('section', { class: 'tower ap-tower' }, boardTitle('관제탑'), skeleton(3))
    ),
    h('aside', { class: 'ap-aside' }, h('div', { class: 'bp-side ap-top' }, h('section', { class: 'side-card' }, skeleton(3))), h('div', { class: 'ap-bottom' }, h('section', { class: 'side-card' }, skeleton(4))))
  );
}

export function dashboardScreen(store, catalog) {
  const projects = catalog.groups.flatMap((g) => [...g.projects, ...g.archived]);
  const tower = towerSection(store, catalog);
  const { rail, side } = passesSection(store, projects, tower.setPasses);
  rail.classList.add('ap-rail');
  side.classList.add('ap-top');
  tower.section.classList.add('ap-tower');
  const lounge = themesLink(store);
  lounge.classList.add('ap-lounge');
  const sessions = sessionsCard({ store }); // store: 방 그림을 비공개 저장소에서 읽는 데 쓴다
  sessions.classList.add('ap-sess');
  // PC 는 왼쪽(ap-main)과 오른쪽(ap-aside) 두 기둥. 폰은 두 기둥을 풀어(display: contents) 레일 → 오늘 도착과 나중에 → 관제탑 → 라운지 → 도착 안내 순으로 쌓는다
  return h(
    'div',
    { class: 'airport' },
    // 세션 카드(방 장면)는 왼쪽 큰 기둥 맨 위, 오늘 탑승할 주문 위(11-27 사용자 요청: 영역을 더 크게)
    h('div', { class: 'ap-main' }, sessions, rail, tower.section, lounge),
    // 귀가편 6211 은 탑승권 레일 머리의 시계 옆으로 옮겼다(#163, passes.mjs)
    h('aside', { class: 'ap-aside' }, side, h('div', { class: 'ap-bottom' }, arrivalsSection(catalog), flightLogSection(catalog)))
  );
}
