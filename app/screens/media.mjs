// 샘플 화면: 같은 문장을 모델과 설정만 바꿔 만든 음성(나중에는 영상, 이미지)을 한자리에서 듣고 고른다.
// 파일은 비공개 저장소에 있고, 누를 때만 받아 Blob 으로 감싸 재생한다(목록을 열자마자 다 받지 않는다).

import { h, skeleton, failure, empty, errorText, koDate } from '../dom.mjs';
import { durationText } from '../media.mjs';

const GITHUB = 'https://github.com/2giwon';

/**
 * 만들어 둔 blob 주소. 화면을 떠나면 브라우저가 알아서 지우지 않으므로,
 * 샘플 화면을 새로 그릴 때 이전 것을 거둔다(draw.mjs 의 그래프 정리와 같은 방식).
 */
let liveUrls = [];
function revokeAll() {
  for (const u of liveUrls) URL.revokeObjectURL(u);
  liveUrls = [];
}

/** 종류에 맞는 재생 요소. 이미지는 바로 보이고, 음성과 영상은 기본 조작 막대를 쓴다. */
function playerFor(item, url) {
  if (item.kind === 'image') return h('img', { class: 'media-img', src: url, alt: item.label });
  if (item.kind === 'video') return h('video', { class: 'media-video', src: url, controls: true, preload: 'metadata' });
  return h('audio', { class: 'media-audio', src: url, controls: true, preload: 'metadata', autoplay: true });
}

function metaRows(item) {
  const rows = [
    ['모델', item.model],
    ['옵션', item.options],
    ['라이선스', item.license],
    ['내려받기 용량', item.size],
  ].filter(([, v]) => v);
  if (!rows.length && !item.note) return null;
  return h(
    'details',
    { class: 'media-meta' },
    h('summary', null, '설정 보기'),
    rows.length ? h('dl', null, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])) : null,
    item.note ? h('p', { class: 'muted' }, item.note) : null
  );
}

function itemView(store, repo, folder, item) {
  const slot = h('div', { class: 'media-slot' });
  let loaded = false;

  const play = async () => {
    if (loaded) return;
    slot.replaceChildren(skeleton(1, 'media-skeleton'));
    try {
      const buf = await store.mediaBytes(repo, folder, item.file);
      const url = URL.createObjectURL(new Blob([buf], { type: item.mime }));
      liveUrls.push(url);
      loaded = true;
      slot.replaceChildren(playerFor(item, url));
    } catch (e) {
      // 비어 보이지 않게 이유와 다시 시도를 함께 보여 준다
      slot.replaceChildren(failure(`${item.file} 을 받지 못했습니다 (${errorText(e)})`, play));
    }
  };

  slot.replaceChildren(
    h('button', { type: 'button', class: 'media-play', onclick: play }, item.kind === 'image' ? '보기' : '들어보기')
  );

  return h(
    'li',
    { class: 'media-item' },
    h(
      'div',
      { class: 'media-head' },
      h('span', { class: 'media-label' }, item.label),
      item.badge ? h('span', { class: `badge ${item.badge === '기각' ? 'muted' : 'warn'}` }, item.badge) : null,
      item.duration !== null ? h('span', { class: 'media-dur' }, durationText(item.duration)) : null
    ),
    slot,
    metaRows(item)
  );
}

function bulletBlock(title, lines) {
  if (!lines.length) return null;
  return h('section', { class: 'media-notes' }, h('h2', null, title), h('ul', null, lines.map((t) => h('li', null, t))));
}

export function mediaScreen(store, repo, folder) {
  revokeAll(); // 이전 샘플 화면이 만든 주소를 거둔다
  const root = h('article', { class: 'media' }, skeleton(2, 'title-skeleton'), skeleton(5));
  const folderUrl = `${GITHUB}/${repo}/tree/HEAD/${folder.split('/').map(encodeURIComponent).join('/')}`;

  const load = async () => {
    root.replaceChildren(skeleton(2, 'title-skeleton'), skeleton(5));
    let r;
    try {
      r = await store.mediaIndex(repo, folder);
    } catch (e) {
      root.replaceChildren(failure(`샘플 목록을 읽지 못했습니다 (${errorText(e)})`, load));
      return;
    }
    if (r.state === 'missing') {
      root.replaceChildren(empty(`${folder}/index.json 이 없습니다. 샘플 목록 파일을 먼저 올려 주세요.`));
      return;
    }
    if (r.state === 'invalid') {
      root.replaceChildren(failure(`샘플 목록 형식이 맞지 않습니다 (${r.error})`, load));
      return;
    }

    const d = r.data;
    document.title = `${d.title} - 작업노트`;
    root.replaceChildren(
      h(
        'div',
        { class: 'media-page' },
        h(
          'header',
          { class: 'media-head-top' },
          h('p', { class: 'crumb' }, `${repo}  ${folder}`),
          h('h1', null, d.title),
          h(
            'p',
            { class: 'media-top-meta' },
            d.updated ? koDate(d.updated) : null,
            d.doc ? h('a', { href: `#/doc/${repo}/${d.doc}` }, '작업 목록 보기') : null
          ),
          d.note ? h('p', { class: 'summary' }, d.note) : null
        ),
        d.sentence
          ? h(
              'section',
              { class: 'media-sentence' },
              h('h2', null, '비교한 문장'),
              h('blockquote', null, d.sentence),
              d.sentenceNote ? h('p', { class: 'muted' }, d.sentenceNote) : null
            )
          : null,
        h('ul', { class: 'media-list' }, d.items.map((it) => itemView(store, repo, folder, it))),
        bulletBlock('알아낸 것', d.findings),
        bulletBlock('아직 안 해 본 것', d.pending),
        h('p', { class: 'doc-foot' }, h('a', { href: folderUrl, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub에서 폴더 보기'))
      )
    );
  };

  void load();
  return root;
}
