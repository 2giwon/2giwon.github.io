// 상태판: 회사 묶음 → 개인 묶음, 프로젝트 카드(최신 핸드오프의 지금 상태, 다음 할 일, 미결), 최근 타임라인, 최신 문서.

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { handoverCard } from '../handover.mjs';
import { recentTimeline } from '../timeline.mjs';
import { timelineChart } from '../draw.mjs';
import { today } from '../store.mjs';

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

function cardBody(store, p) {
  const body = h('div', { class: 'card-body' }, skeleton(3));
  if (!p.latestHandover) {
    const latest = [...p.docs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
    // replaceChildren 은 null 을 "null" 글자로 넣는다 — h() 로 감싸 빈 값을 걸러 낸다
    body.replaceChildren(
      h('div', null, empty('핸드오프 없음'), latest ? h('a', { class: 'card-latest', href: docHref(latest) }, `최신 문서: ${titleOf(latest.path)}`) : null)
    );
    return body;
  }
  const load = async () => {
    body.replaceChildren(skeleton(3));
    try {
      const doc = p.latestHandover;
      const [md, fig] = await Promise.all([store.text(doc.repo, doc.sha), store.figures(doc)]);
      const c = handoverCard(md, fig.data);
      const col = (label, items, cls) =>
        h('div', { class: `card-col ${cls}` }, h('h4', null, label), items.length ? h('ul', null, items.map((x) => h('li', null, x))) : h('p', { class: 'muted' }, '-'));
      body.replaceChildren(
        h('a', { class: 'card-handover', href: docHref(doc) }, `${koDate(doc.date)} 핸드오프: ${titleOf(doc.path)}`, fig.state === 'stale' ? h('span', { class: 'badge warn' }, '그림 오래됨') : null),
        c.source === 'none'
          ? h('p', { class: 'muted' }, '요약할 항목을 찾지 못했습니다. 눌러서 원문을 보세요.')
          : h(
              'div',
              { class: 'card-cols' },
              col('지금 상태', c.state, 'state'),
              col('다음 할 일', c.next, 'next'),
              col(`미결 ${c.open.length}`, c.open, 'open')
            )
      );
    } catch (e) {
      body.replaceChildren(failure(`핸드오프를 읽지 못했습니다 (${errorText(e)})`, load));
    }
  };
  void load();
  return body;
}

function projectCard(store, p) {
  return h(
    'article',
    { class: `card${p.paused ? ' paused' : ''}` },
    h(
      'header',
      { class: 'card-head' },
      h('a', { href: folderHref(p) }, h('h3', null, p.label)),
      p.paused ? h('span', { class: 'badge muted' }, '멈춤') : h('span', { class: 'badge ok' }, '진행 중'),
      h('span', { class: 'card-date' }, p.lastDate ? `마지막 ${koDate(p.lastDate)}` : '')
    ),
    cardBody(store, p)
  );
}

function groupSection(store, g) {
  const title = h('h2', null, g.label);
  if (g.error) return h('section', { class: 'group' }, title, failure(`이 저장소를 읽지 못했습니다 (${errorText(g.error)})`, () => location.reload()));
  if (!g.projects.length && !g.archived.length) return h('section', { class: 'group' }, title, empty('문서가 없습니다'));
  return h(
    'section',
    { class: 'group' },
    title,
    h('div', { class: 'cards' }, g.projects.map((p) => projectCard(store, p))),
    g.archived.length
      ? h(
          'details',
          { class: 'archived' },
          h('summary', null, `보존 ${g.archived.length}개`),
          h('ul', null, g.archived.map((p) => h('li', null, h('a', { href: folderHref(p) }, p.label), p.lastDate ? ` 마지막 ${koDate(p.lastDate)}` : '')))
        )
      : null
  );
}

function timelineSection(catalog) {
  const items = recentTimeline(catalog, today(), TIMELINE_DAYS);
  return h(
    'section',
    { class: 'group' },
    h('h2', null, `최근 ${TIMELINE_DAYS}일`),
    items.length ? timelineChart(items, today(), TIMELINE_DAYS) : empty(`최근 ${TIMELINE_DAYS}일 문서 없음`),
    h('h3', { class: 'sub' }, '최신 문서'),
    items.length
      ? h(
          'ol',
          { class: 'latest' },
          items.slice(0, LATEST_COUNT).map((d) =>
            h('li', null, h('span', { class: 'latest-date' }, koDate(d.date)), h('span', { class: `latest-label ${d.repo}` }, d.label), h('a', { href: docHref(d) }, titleOf(d.path)))
          )
        )
      : empty('최신 문서 없음')
  );
}

/** 목록 받기 전 자리. */
export function dashboardLoading() {
  return h(
    'div',
    { class: 'dashboard' },
    ['회사', '개인'].map((label) => h('section', { class: 'group' }, h('h2', null, label), h('div', { class: 'cards' }, [1, 2].map(() => h('article', { class: 'card' }, skeleton(4)))))),
    h('section', { class: 'group' }, h('h2', null, `최근 ${TIMELINE_DAYS}일`), skeleton(1, 'chart-skeleton'))
  );
}

export function dashboardScreen(store, catalog) {
  return h('div', { class: 'dashboard' }, catalog.groups.map((g) => groupSection(store, g)), timelineSection(catalog));
}
