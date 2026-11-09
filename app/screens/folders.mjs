// 폴더 화면: 두 저장소의 문서를 폴더별로 전부 보여 준다(카드가 없는 폴더와 루트 파일도 여기서 본다).

import { h, empty, koDate } from '../dom.mjs';
import { docHref } from './dashboard.mjs';

const REPO_LABEL = { 'labmanager-docs': '회사 (labmanager-docs)', 'personal-docs': '개인 (personal-docs)' };

export function foldersScreen(catalog, repo = null, folder = null) {
  const docs = catalog.allDocs.filter((d) => (!repo || d.repo === repo) && (!folder || d.path.startsWith(`${folder}/`)));
  const byRepo = new Map();
  for (const d of docs) {
    const top = d.path.includes('/') ? d.path.split('/')[0] : '(맨 위)';
    if (!byRepo.has(d.repo)) byRepo.set(d.repo, new Map());
    const m = byRepo.get(d.repo);
    if (!m.has(top)) m.set(top, []);
    m.get(top).push(d);
  }
  return h(
    'div',
    { class: 'folders' },
    h('h1', null, folder ? `폴더: ${folder}` : '폴더'),
    folder ? h('p', null, h('a', { href: '#/folders' }, '← 전체 폴더')) : null,
    docs.length
      ? [...byRepo].map(([r, tops]) =>
          h(
            'section',
            { class: 'group' },
            h('h2', null, REPO_LABEL[r] ?? r),
            [...tops].map(([top, list]) =>
              h(
                'details',
                { class: 'folder', open: Boolean(folder) },
                h('summary', null, `${top}  ${list.length}편`),
                h(
                  'ul',
                  null,
                  list
                    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.path.localeCompare(b.path))
                    .map((d) =>
                      h('li', null, h('span', { class: 'latest-date' }, d.date ? koDate(d.date) : ''), h('a', { href: docHref(d) }, d.path.includes('/') ? d.path.slice(top.length + 1) : d.path), d.figureSha ? h('span', { class: 'badge ok' }, '그림') : null)
                    )
                )
              )
            )
          )
        )
      : empty('문서가 없습니다')
  );
}
