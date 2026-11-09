import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from '../vendor/marked.esm.js';
import { createRenderer, buildDocView, normalizeHeading, resolveDocLink } from '../app/docview.mjs';

const ctx = { repo: 'labmanager-docs', path: 'web/handover/2026-01-01-x-handover.md' };
const render = createRenderer(Marked, ctx);

function figs(sections) {
  return { version: 1, sourceSha: 'a'.repeat(40), summary: '요약', card: null, sections };
}

const MD = [
  '---',
  'type: policy',
  '---',
  '',
  '# 예시 문서',
  '',
  '머리말 문단',
  '',
  '## 0. 지금 상태',
  '',
  '상태 문단',
  '',
  '## 🔴 1. 다음 할 일',
  '',
  '- 할 일 하나',
  '',
  '## 2. 미결',
  '',
  '미결 문단',
].join('\n');

test('frontmatter 를 떼고 첫 h1 을 제목으로 쓴다', () => {
  const v = buildDocView(MD, null, render, 'x.md');
  assert.equal(v.title, '예시 문서');
  assert.ok(!v.sections.some((s) => s.html.includes('type: policy')));
  assert.ok(!v.sections.some((s) => s.html.includes('<h1')));
});

test('h1 이 없으면 파일 이름이 제목', () => {
  assert.equal(buildDocView('본문만', null, render, '2026-01-01-a.md').title, '2026-01-01-a.md');
});

test('코드 블록 안의 # 줄은 제목이 아니고, 코드에서도 지워지지 않는다', () => {
  const v = buildDocView('설명\n\n```sh\n# install dependencies\nnpm i\n```\n', null, render, 'a.md');
  assert.equal(v.title, 'a.md');
  assert.match(v.sections[0].html, /# install dependencies/);
});

test('백틱 4개 코드 블록 안의 백틱 3개와 ## 는 블록을 닫거나 섹션을 나누지 않는다', () => {
  const md = '## 하나\n\n````md\n```js\n## 예시 제목\n```\n````\n\n## 둘\n';
  const v = buildDocView(md, null, render, 'a.md');
  assert.deepEqual(v.sections.map((s) => s.heading), ['하나', '둘']);
});

test('참조 링크 정의가 다른 섹션에 있어도 링크가 된다', () => {
  const md = '## 하나\n\n[깃허브][gh] 보기\n\n## 둘\n\n[gh]: https://github.com\n';
  const v = buildDocView(md, null, render, 'a.md');
  assert.match(v.sections[0].html, /<a href="https:\/\/github\.com"/);
});

test('h2 앞 글은 제목 없는 섹션, 나머지는 h2 마다 한 섹션', () => {
  const v = buildDocView(MD, null, render, 'x.md');
  assert.deepEqual(
    v.sections.map((s) => s.heading),
    [null, '0. 지금 상태', '🔴 1. 다음 할 일', '2. 미결']
  );
  assert.match(v.sections[0].html, /머리말 문단/);
  assert.match(v.sections[2].html, /할 일 하나/);
});

test('h2 가 없으면 원문 전체가 섹션 하나', () => {
  const v = buildDocView('# 제목\n\n문단 하나\n\n### 작은 제목', null, render, 'x.md');
  assert.equal(v.sections.length, 1);
  assert.equal(v.sections[0].heading, null);
  assert.match(v.sections[0].html, /작은 제목/);
});

test('코드 블록 안의 ## 는 섹션을 나누지 않는다', () => {
  const v = buildDocView('## 하나\n\n```md\n## 코드 속 제목\n```\n', null, render, 'x.md');
  assert.equal(v.sections.length, 1);
});

test('그림 데이터 섹션은 이모지와 공백을 무시하고 원문 h2 에 붙는다', () => {
  const v = buildDocView(
    MD,
    figs([
      { heading: '1. 다음 할 일', keyPoints: ['핵심'], figures: [{ type: 'mermaid', code: 'flowchart LR\nA-->B' }] },
      { heading: ' 0. 지금 상태 ', keyPoints: [], figures: [] },
    ]),
    render,
    'x.md'
  );
  assert.equal(v.summary, '요약');
  assert.deepEqual(v.sections[2].keyPoints, ['핵심']);
  assert.equal(v.sections[2].figures.length, 1);
  assert.deepEqual(v.orphanFigures, []);
});

test('원문에 없는 섹션 제목의 그림은 orphanFigures 로 모인다', () => {
  const v = buildDocView(
    MD,
    figs([{ heading: '9. 사라진 섹션', keyPoints: ['x'], figures: [{ type: 'mermaid', code: 'A' }] }]),
    render,
    'x.md'
  );
  assert.equal(v.orphanFigures.length, 1);
  assert.equal(v.sections.every((s) => s.figures.length === 0), true);
});

test('그림 데이터 heading 이 null 이면 제목 없는 첫 섹션에 붙는다', () => {
  const v = buildDocView(MD, figs([{ heading: null, keyPoints: ['머리'], figures: [] }]), render, 'x.md');
  assert.deepEqual(v.sections[0].keyPoints, ['머리']);
});

test('원문 속 HTML 은 실행되지 않고 글자로 나온다', () => {
  const v = buildDocView('<script>alert(1)</script>\n\n문단 <img src=x onerror=alert(1)> 끝', null, render, 'x.md');
  const html = v.sections.map((s) => s.html).join('');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script'));
});

test('이미지 문법은 대체 글자만 남는다', () => {
  const html = buildDocView('![화면 캡처](a.png)', null, render, 'x.md').sections[0].html;
  assert.ok(!html.includes('<img'));
  assert.match(html, /화면 캡처/);
});

test('javascript: 링크는 링크가 아니라 글자로', () => {
  const html = buildDocView('[눌러](javascript:alert(1))', null, render, 'x.md').sections[0].html;
  assert.ok(!/href="javascript/i.test(html));
  assert.match(html, /눌러/);
});

test('바깥 링크는 새 창으로', () => {
  const html = buildDocView('[문서](https://example.com/a)', null, render, 'x.md').sections[0].html;
  assert.match(html, /href="https:\/\/example\.com\/a"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('같은 repo 의 다른 md 로 가는 상대 링크는 작업노트 안 주소로', () => {
  const html = buildDocView('[계획](../plans/p.md)', null, render, 'x.md').sections[0].html;
  assert.match(html, /href="#\/doc\/labmanager-docs\/web\/plans\/p\.md"/);
});

test('상대 링크 풀기: 폴더 오르내리기, 앵커, repo 밖', () => {
  assert.equal(resolveDocLink(ctx, '../plans/p.md'), '#/doc/labmanager-docs/web/plans/p.md');
  assert.equal(resolveDocLink(ctx, './a.md#절'), '#/doc/labmanager-docs/web/handover/a.md');
  assert.equal(resolveDocLink(ctx, '#절'), null);
  assert.equal(resolveDocLink(ctx, '../../../../밖.md'), null);
  assert.equal(resolveDocLink(ctx, 'data:text/html,x'), null);
  assert.equal(resolveDocLink(ctx, 'mailto:a@b.c'), 'mailto:a@b.c');
});

test('제목 비교용 정리: 이모지, 앞뒤 공백, 연속 공백', () => {
  assert.equal(normalizeHeading(' 🔴  1. 다음 할 일 '), '1. 다음 할 일');
  assert.equal(normalizeHeading('📌 웹(최신)'), '웹(최신)');
  assert.equal(normalizeHeading('⚠️ 주의'), '주의');
});
