// 영상 자동화 화면: 작업 목록(TASKS.md 의 체크 목록)과 샘플 재생을 한자리에 모은다.
// 상단바 바로가기가 아니라 첫 화면의 제 자리에서 들어온다(11-22 사용자 지시).

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { samplePanel, revokeSampleUrls } from './media.mjs';
import { parseTaskList, nextUp, percent, STATUS_LABEL, VIDEO_REPO, VIDEO_TASKS_PATH, VIDEO_SAMPLES } from '../video.mjs';

const GITHUB = 'https://github.com/2giwon';
const BADGE_CLASS = { done: 'ok', doing: 'warn', blocked: 'risk', todo: 'muted' };

export const videoDocHref = `#/doc/${VIDEO_REPO}/${VIDEO_TASKS_PATH}`;

/** 진행률 막대. 숫자만 보여 주면 얼마나 남았는지 한눈에 안 들어온다. */
export function progressBar(progress) {
  const pct = percent(progress);
  return h(
    'div',
    { class: 'vp-progress' },
    h(
      'div',
      { class: 'vp-bar', role: 'img', 'aria-label': `전체 ${progress.total}개 중 ${progress.done}개 끝남` },
      h('span', { style: `width:${pct}%` })
    ),
    h('p', { class: 'vp-progress-text' }, `${progress.done} / ${progress.total} 끝남 (${pct}%)`)
  );
}

function itemView(it) {
  return h(
    'li',
    { class: `vp-item ${it.status}` },
    h('span', { class: `badge ${BADGE_CLASS[it.status]}` }, STATUS_LABEL[it.status]),
    h('span', { class: 'vp-id' }, it.id ?? ''),
    h(
      'span',
      { class: 'vp-text' },
      h('span', { class: 'vp-title' }, it.title),
      it.detail ? h('span', { class: 'vp-detail' }, it.detail) : null
    )
  );
}

function groupView(g) {
  return h(
    'section',
    { class: `vp-group level-${g.level}` },
    h(g.level === 2 ? 'h3' : 'h4', null, g.heading),
    h('ul', { class: 'vp-items' }, g.items.map(itemView))
  );
}

function nextUpBox(it) {
  if (!it) return null;
  return h(
    'div',
    { class: 'vp-next' },
    h('h3', null, '지금 손댈 것'),
    h(
      'p',
      null,
      h('span', { class: `badge ${BADGE_CLASS[it.status]}` }, STATUS_LABEL[it.status]),
      ' ',
      it.id ? h('strong', null, `${it.id} `) : null,
      it.title
    ),
    it.detail ? h('p', { class: 'muted' }, it.detail) : null
  );
}

export function videoScreen(store, catalog) {
  revokeSampleUrls(); // 이전 화면이 만든 blob 주소를 거둔다
  const root = h('div', { class: 'video-page' }, skeleton(2, 'title-skeleton'), skeleton(6));
  const sourceUrl = `${GITHUB}/${VIDEO_REPO}/blob/HEAD/${VIDEO_TASKS_PATH.split('/').map(encodeURIComponent).join('/')}`;
  const doc = catalog.allDocs.find((d) => d.repo === VIDEO_REPO && d.path === VIDEO_TASKS_PATH);

  const head = (extra = null) =>
    h(
      'header',
      { class: 'vp-head' },
      h('h1', null, '영상 자동화'),
      h(
        'p',
        { class: 'vp-meta' },
        doc?.date ? koDate(doc.date) : null,
        h('a', { href: videoDocHref }, '작업 목록 원문'),
        h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub')
      ),
      extra
    );

  const samples = () =>
    h(
      'section',
      { class: 'vp-samples' },
      h('h2', null, '샘플'),
      VIDEO_SAMPLES.map((s) =>
        h(
          'section',
          { class: 'vp-sample' },
          h('h3', null, s.label),
          samplePanel(store, VIDEO_REPO, s.folder, { bare: true })
        )
      )
    );

  if (!doc) {
    // 문서를 아직 올리지 않았을 때. 비어 보이지 않게 무엇을 해야 하는지 적는다
    root.replaceChildren(
      head(),
      empty(`${VIDEO_REPO}/${VIDEO_TASKS_PATH} 을 찾지 못했습니다. 작업 목록을 먼저 올려 주세요.`),
      samples()
    );
    return root;
  }

  const load = async () => {
    root.replaceChildren(head(), skeleton(6));
    let md;
    try {
      md = await store.text(VIDEO_REPO, doc.sha);
    } catch (e) {
      root.replaceChildren(head(), failure(`작업 목록을 읽지 못했습니다 (${errorText(e)})`, load), samples());
      return;
    }
    const { groups, progress } = parseTaskList(md);
    document.title = '영상 자동화 - 작업노트';
    root.replaceChildren(
      head(progressBar(progress)),
      nextUpBox(nextUp(groups)),
      groups.length
        ? h('section', { class: 'vp-tasks' }, h('h2', null, '작업 목록'), groups.map(groupView))
        : empty('체크 목록을 찾지 못했습니다'),
      samples()
    );
  };

  void load();
  return root;
}

/** 첫 화면에 넣는 묶음. 상단바가 아니라 여기가 들어오는 자리다. */
export function videoSection(store, catalog) {
  const body = h('div', { class: 'vp-card-body' }, skeleton(2));
  const doc = catalog.allDocs.find((d) => d.repo === VIDEO_REPO && d.path === VIDEO_TASKS_PATH);

  const section = h(
    'section',
    { class: 'group video-entry' },
    h('h2', null, '영상 자동화'),
    h(
      'article',
      { class: 'card vp-card' },
      h(
        'header',
        { class: 'card-head' },
        h('a', { href: '#/video' }, h('h3', null, '유튜브 영상 만들기')),
        h('span', { class: 'card-date' }, doc?.date ? `마지막 ${koDate(doc.date)}` : '')
      ),
      body
    )
  );

  if (!doc) {
    body.replaceChildren(empty('작업 목록을 아직 올리지 않았습니다'));
    return section;
  }

  const load = async () => {
    body.replaceChildren(skeleton(2));
    try {
      const { groups, progress } = parseTaskList(await store.text(VIDEO_REPO, doc.sha));
      const it = nextUp(groups);
      body.replaceChildren(
        h(
          'div',
          null,
          progressBar(progress),
          it
            ? h(
                'p',
                { class: 'vp-card-next' },
                h('span', { class: `badge ${BADGE_CLASS[it.status]}` }, STATUS_LABEL[it.status]),
                ' ',
                it.id ? h('strong', null, `${it.id} `) : null,
                it.title
              )
            : h('p', { class: 'muted' }, '남은 작업이 없습니다'),
          h('a', { class: 'vp-card-open', href: '#/video' }, '작업 열기')
        )
      );
    } catch (e) {
      body.replaceChildren(failure(`작업 목록을 읽지 못했습니다 (${errorText(e)})`, load));
    }
  };
  void load();
  return section;
}
