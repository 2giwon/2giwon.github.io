// 상태판: 오늘 할 일 → 영상 자동화 → 회사 묶음 → 개인 묶음, 프로젝트 카드(최신 핸드오프의 지금 상태,
// 다음 할 일, 미결), 최근 타임라인, 최신 문서.

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { handoverCard } from '../handover.mjs';
import { todaySection } from './today.mjs';
import { videoSection } from './video.mjs';
import { recentTimeline } from '../timeline.mjs';
import { timelineChart } from '../draw.mjs';
import { today } from '../store.mjs';
import { iconSvg } from '../icons.mjs';
import { loadThemeBanner } from '../themes.mjs';

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
    { class: 'group' },
    h('h2', null, 'Claude 테마'),
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

/** 목록 받기 전 자리. */
export function dashboardLoading() {
  return h(
    'div',
    { class: 'dashboard' },
    h('section', { class: 'group today' }, h('h2', null, '오늘 할 일'), skeleton(3)),
    h('section', { class: 'group' }, h('h2', null, '영상 자동화'), h('article', { class: 'card' }, skeleton(3))),
    ['회사', '개인'].map((label) => h('section', { class: 'group' }, h('h2', null, label), h('div', { class: 'cards' }, [1, 2].map(() => h('article', { class: 'card' }, skeleton(4)))))),
    h('section', { class: 'group' }, h('h2', null, `최근 ${TIMELINE_DAYS}일`), skeleton(1, 'chart-skeleton'))
  );
}

export function dashboardScreen(store, catalog) {
  return h(
    'div',
    { class: 'dashboard' },
    todaySection(store),
    videoSection(store, catalog),
    themesLink(store),
    catalog.groups.map((g) => groupSection(store, g)),
    timelineSection(catalog)
  );
}
