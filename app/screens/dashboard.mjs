// 상태판(11-26 작업노트 국제공항). 결정 기록: personal-docs/2giwon.github.io/decisions.md
// - 탑승권 레일: 오늘 할 일(passes.mjs)
// - 관제탑 띠: 프로젝트마다 상태 하나(결항, 탑승 중, 지연, 도착, 대기). 누르면 운항 정보(최신 핸드오프의 지금 상태, 다음 할 일, 미결)
// - 옆 칸: 오늘 도착(끝낸 일), 나중에 탑승, 도착 안내(최신 문서), 운항 기록(최근 14일 그래프)
// - 라운지 창문: Claude 테마
// PC 는 두 칸(왼쪽 레일과 관제탑, 오른쪽 옆 칸), 폰은 한 줄로 쌓는다(style.css .airport)

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { handoverCard } from '../handover.mjs';
import { passesSection, flap } from './passes.mjs';
import { progressBar } from './video.mjs';
import { recentTimeline } from '../timeline.mjs';
import { timelineChart } from '../draw.mjs';
import { today } from '../store.mjs';
import { iconSvg } from '../icons.mjs';
import { loadThemeBanner } from '../themes.mjs';
import { towerStatus, flightPrefix, TOWER_LABEL } from '../airport.mjs';
import { VIDEO_REPO, VIDEO_TASKS_PATH, STATUS_LABEL, parseTaskList, nextUp } from '../video.mjs';
import { LAB } from '../catalog.mjs';

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

// ─── 관제탑 띠 ────────────────────────────────────────────────────────────────

/** 프로젝트 하나의 관제탑 칸. 최신 핸드오프를 읽어 미결이 있는지 알아낸다 */
function towerItem(store, p, onSelect) {
  const state = { hasOpen: p.latestHandover ? null : false, card: null, fig: null, error: null, todayCount: 0, tasksLoaded: false };
  const pill = h('span', { class: 'tw-pill' });
  const line = h('span', { class: 'tw-line' });
  const el = h(
    'button',
    { type: 'button', class: 'tw-item', 'aria-expanded': 'false', onclick: () => onSelect(item) },
    h('span', { class: 'tw-top' }, flap(flightPrefix(p)), pill),
    h('span', { class: 'tw-name' }, p.label),
    line
  );
  const item = { p, el, state, update };

  function update() {
    const s = towerStatus({ paused: p.paused, todayCount: state.todayCount, hasOpen: state.tasksLoaded ? state.hasOpen : null, lastDate: p.lastDate }, today());
    el.dataset.status = s;
    pill.className = `tw-pill st-${s}`;
    pill.textContent = TOWER_LABEL[s];
    const bits = [];
    if (state.todayCount) bits.push(`오늘 ${state.todayCount}장`);
    if (state.card?.open.length) bits.push(`미결 ${state.card.open.length}`);
    if (state.error) bits.push('핸드오프 못 읽음');
    bits.push(p.lastDate ? `마지막 ${koDate(p.lastDate)}` : '활동 기록 없음');
    line.textContent = bits.join(', ');
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
    flap(flightPrefix(p)),
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

/** 유튜브 영상 칸. 진행 막대와 다음 단계. 누르면 영상 자동화 화면(정비 점검표) */
function videoItem(store, catalog) {
  const doc = catalog.allDocs.find((d) => d.repo === VIDEO_REPO && d.path === VIDEO_TASKS_PATH);
  const body = h('span', { class: 'tw-video-body' }, skeleton(2));
  const el = h('a', { class: 'tw-item tw-video', href: '#/video' }, h('span', { class: 'tw-top' }, flap('YT'), h('span', { class: 'tw-pill st-waiting' }, '정비 중')), h('span', { class: 'tw-name' }, '유튜브 영상 만들기'), body);
  if (!doc) {
    body.replaceChildren(h('span', { class: 'tw-line' }, '작업 목록을 아직 올리지 않았어요'));
    return el;
  }
  const load = async () => {
    body.replaceChildren(skeleton(2));
    try {
      const { groups, progress } = parseTaskList(await store.text(VIDEO_REPO, doc.sha));
      const it = nextUp(groups);
      body.replaceChildren(progressBar(progress), it ? h('span', { class: 'tw-line' }, `다음 ${it.id ?? ''} ${it.title} (${STATUS_LABEL[it.status]})`) : h('span', { class: 'tw-line' }, '모든 단계를 끝냈어요'));
    } catch (e) {
      body.replaceChildren(h('span', { class: 'tw-line tw-error' }, `작업 목록을 읽지 못했어요 (${errorText(e)})`));
    }
  };
  void load();
  return el;
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
  const rows = groups.map((g) => {
    if (g.error) return h('div', { class: 'tw-group' }, h('h3', null, g.label), failure(`이 저장소를 읽지 못했어요 (${errorText(g.error)})`, () => location.reload()));
    const its = g.projects.map((p) => towerItem(store, p, select));
    items.push(...its);
    return h(
      'div',
      { class: 'tw-group' },
      h('h3', null, g.label),
      its.length ? h('div', { class: 'tw-strip' }, its.map((i) => i.el)) : empty('문서가 없어요'),
      g.archived.length
        ? h('details', { class: 'tw-archived' }, h('summary', null, `보관 중 ${g.archived.length}`), h('ul', null, g.archived.map((p) => h('li', null, h('a', { href: folderHref(p) }, p.label), p.lastDate ? ` 마지막 ${koDate(p.lastDate)}` : ''))))
        : null
    );
  });
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
    boardTitle('관제탑', h('small', null, '프로젝트를 누르면 운항 정보')),
    h('div', { class: 'tw-group' }, h('h3', null, '정비'), h('div', { class: 'tw-strip' }, videoItem(store, catalog))),
    rows,
    detail
  );
  /** 탑승권 레일이 오늘 할 일을 다 읽으면 프로젝트마다 오늘 몇 장인지 알려 준다 */
  const setPasses = ({ passes }) => {
    const counts = new Map();
    for (const p of passes) if (p.project) counts.set(p.project.id, (counts.get(p.project.id) ?? 0) + 1);
    for (const it of items) {
      it.state.todayCount = counts.get(it.p.id) ?? 0;
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
  // PC 는 왼쪽(ap-main)과 오른쪽(ap-aside) 두 기둥. 폰은 두 기둥을 풀어(display: contents) 레일 → 오늘 도착과 나중에 → 관제탑 → 라운지 → 도착 안내 순으로 쌓는다
  return h(
    'div',
    { class: 'airport' },
    h('div', { class: 'ap-main' }, rail, tower.section, lounge),
    h('aside', { class: 'ap-aside' }, side, h('div', { class: 'ap-bottom' }, arrivalsSection(catalog), flightLogSection(catalog)))
  );
}
