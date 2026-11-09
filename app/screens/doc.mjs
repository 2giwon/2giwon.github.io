// 문서 화면: 원문 섹션 순서대로 그림 → 핵심 2~3줄 → 원문 펼치기. 그림 데이터가 없으면 원문을 펼쳐 둔다.

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { figureBox } from '../draw.mjs';
import { buildDocView, createRenderer } from '../docview.mjs';
import { Marked } from '../../vendor/marked.esm.js';

const GITHUB = 'https://github.com/2giwon';

function stateBadge(fig) {
  if (fig.error) return h('span', { class: 'badge warn' }, '그림 데이터를 읽지 못함');
  if (fig.state === 'none') return h('span', { class: 'badge muted' }, '그림 없음');
  if (fig.state === 'stale') return h('span', { class: 'badge warn' }, '그림이 원문보다 오래됨');
  return null;
}

function sectionView(s, hasFigures) {
  // 그림 데이터가 없는 문서는 접을 이유가 없으니 원문을 그대로 보여 준다
  if (!hasFigures) {
    return h('section', { class: 'doc-section' }, s.heading ? h('h2', null, s.heading) : null, h('div', { class: 'prose', html: s.html }));
  }
  const showOriginalOpen = !s.figures.length && !s.keyPoints.length;
  return h(
    'section',
    { class: 'doc-section' },
    s.heading ? h('h2', null, s.heading) : null,
    s.figures.length ? h('div', { class: 'figures' }, s.figures.map(figureBox)) : null,
    s.keyPoints.length ? h('ul', { class: 'key-points' }, s.keyPoints.map((k) => h('li', null, k))) : null,
    s.html.trim()
      ? h('details', { class: 'original', open: showOriginalOpen }, h('summary', null, '원문 펼치기'), h('div', { class: 'prose', html: s.html }))
      : null
  );
}

export function docScreen(store, catalog, repo, path) {
  const root = h('article', { class: 'doc' }, skeleton(2, 'title-skeleton'), skeleton(6));
  const doc = catalog.allDocs.find((d) => d.repo === repo && d.path === path);
  const sourceUrl = `${GITHUB}/${repo}/blob/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`;
  if (!doc) {
    root.replaceChildren(failure('문서를 찾지 못했습니다(지워졌거나 옮겨졌을 수 있습니다)'), h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub에서 열기'));
    return root;
  }
  const load = async () => {
    root.replaceChildren(skeleton(2, 'title-skeleton'), skeleton(6));
    try {
      const [md, fig] = await Promise.all([store.text(repo, doc.sha), store.figures(doc)]);
      const view = buildDocView(md, fig.data, createRenderer(Marked, { repo, path }), path.split('/').pop());
      const hasFigures = Boolean(fig.data);
      const hasContent = view.sections.some((s) => s.html.trim() || s.figures.length);
      // replaceChildren 은 배열을 펼치지 않는다 — h() 로 감싸 펼친다
      const page = h(
        'div',
        { class: 'doc-page' },
        h(
          'header',
          { class: 'doc-head' },
          h('p', { class: 'crumb' }, `${doc.label}  ${path}`),
          h('h1', null, view.title),
          h('p', { class: 'doc-meta' }, doc.date ? koDate(doc.date) : null, stateBadge(fig)),
          view.summary ? h('p', { class: 'summary' }, view.summary) : null
        ),
        hasContent ? view.sections.map((s) => sectionView(s, hasFigures)) : empty('내용이 없는 문서입니다'),
        view.orphanFigures.length
          ? h('section', { class: 'doc-section' }, h('h2', null, '섹션 이름이 바뀐 그림'), h('p', { class: 'muted' }, '원문의 섹션 이름이 바뀌어 붙일 자리를 찾지 못한 그림입니다.'), h('div', { class: 'figures' }, view.orphanFigures.map(figureBox)))
          : null,
        h('p', { class: 'doc-foot' }, h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub에서 원문 보기'))
      );
      root.replaceChildren(page);
      document.title = `${view.title} - 작업노트`;
    } catch (e) {
      root.replaceChildren(failure(`문서를 읽지 못했습니다 (${errorText(e)})`, load), h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub에서 열기'));
    }
  };
  void load();
  return root;
}
