import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, projectIdsFor, archivedFolders } from '../app/catalog.mjs';
import { recentTimeline } from '../app/timeline.mjs';
import { GitHubError } from '../app/github.mjs';

const b = (path, sha = `sha-${path}`) => ({ path, sha, type: 'blob' });
const t = (path) => ({ path, sha: `tree-${path}`, type: 'tree' });

const LAB = [
  b('README.md'),
  t('web'),
  b('web/00-overview.md'),
  b('web/handover/2026-11-06-a-handover.md'),
  b('web/handover/2026-11-09-b-handover.md'),
  b('web/plans/2026-11-01-p.md'),
  t('mobile'),
  b('mobile/handover/2026-10-23-m-handover.md'),
  t('handover'),
  b('handover/2026-10-07-old-handover.md'),
  t('reference'),
  b('reference/api.md'),
  b('.notes/web/handover/2026-11-09-b-handover.json', 'fig-b'),
  b('.github/workflows/x.md'),
  b('web/image.png'),
];

const PERSONAL = [
  b('README.md'),
  b('Aide-Android/handover/2026-10-15-x-handover.md'),
  b('Aide-Android/decisions.md'),
  b('friday-night/specs/2026-10-06-s.md'),
  b('Note-Android/handover/2026-09-01-n-handover.md'),
  b('roblox_games/README.md'),
];

const README = [
  '# 개인',
  '## 폴더 구조',
  '',
  '```',
  'Aide-Android/     ← 업무 비서 앱',
  'Note-Android/     ← 개인 앱 — 보존만. 확장안은 대체됨',
  'friday-night/     ← 신작',
  'roblox_games/     ← 구작 (아카이브 — 보존만)',
  '```',
  '',
  '```',
  'Aide-Android/ 보존만  ← 두 번째 코드 블록은 보지 않는다',
  '```',
].join('\n');

const LAST = {
  'labmanager-docs:web': '2026-11-09',
  'labmanager-docs:mobile': '2026-10-08',
  'personal-docs:Aide-Android': '2026-10-28',
  'personal-docs:friday-night': null,
  'personal-docs:Note-Android': '2026-09-01',
  'personal-docs:roblox_games': '2026-08-01',
};

function build(over = {}) {
  return buildCatalog({ lab: LAB, personal: PERSONAL, personalReadme: README, lastDates: LAST, today: '2026-11-09', ...over });
}

test('회사 묶음은 랩매니저 웹, 모바일 두 장뿐이고 루트 폴더는 카드가 없다', () => {
  const company = build().groups[0];
  assert.equal(company.id, 'company');
  assert.equal(company.label, '회사');
  assert.deepEqual(company.projects.map((p) => p.label), ['랩매니저 웹', '랩매니저 모바일']);
});

test('개인 묶음은 최상위 폴더마다, 보존 폴더는 archived 로', () => {
  const personal = build().groups[1];
  assert.equal(personal.label, '개인');
  assert.deepEqual(personal.projects.map((p) => p.folder), ['Aide-Android', 'friday-night']);
  assert.deepEqual(personal.archived.map((p) => p.folder), ['Note-Android', 'roblox_games']);
});

test('묶음 안은 마지막 수정일 최신순, 날짜 없으면 맨 뒤', () => {
  const personal = build({ lastDates: { ...LAST, 'personal-docs:friday-night': '2026-11-01' } }).groups[1];
  assert.deepEqual(personal.projects.map((p) => p.folder), ['friday-night', 'Aide-Android']);
});

test('멈춤: 오늘부터 30일 넘게 지나면', () => {
  const company = build().groups[0];
  const mobile = company.projects.find((p) => p.folder === 'mobile');
  const web = company.projects.find((p) => p.folder === 'web');
  assert.equal(web.paused, false);
  assert.equal(mobile.paused, true); // 10-08 → 32일
  const atEdge = build({ lastDates: { ...LAST, 'labmanager-docs:mobile': '2026-10-10' } }).groups[0];
  assert.equal(atEdge.projects.find((p) => p.folder === 'mobile').paused, false); // 30일
});

test('최신 핸드오프는 handover/ 안에서 파일 이름 날짜가 가장 최근인 것', () => {
  const web = build().groups[0].projects.find((p) => p.folder === 'web');
  assert.equal(web.latestHandover.path, 'web/handover/2026-11-09-b-handover.md');
  const friday = build().groups[1].projects.find((p) => p.folder === 'friday-night');
  assert.equal(friday.latestHandover, null);
});

test('문서는 md 만, .notes/ 와 .github/ 은 빼고, 그림 데이터 지문을 붙인다', () => {
  const web = build().groups[0].projects.find((p) => p.folder === 'web');
  assert.deepEqual(
    web.docs.map((d) => d.path).sort(),
    ['web/00-overview.md', 'web/handover/2026-11-06-a-handover.md', 'web/handover/2026-11-09-b-handover.md', 'web/plans/2026-11-01-p.md']
  );
  const bDoc = web.docs.find((d) => d.path.endsWith('b-handover.md'));
  assert.equal(bDoc.figurePath, '.notes/web/handover/2026-11-09-b-handover.json');
  assert.equal(bDoc.figureSha, 'fig-b');
  assert.equal(bDoc.date, '2026-11-09');
  assert.equal(web.docs.find((d) => d.path === 'web/00-overview.md').date, null);
});

test('문서 전체 목록(allDocs)에는 카드 없는 폴더와 루트 파일도 들어간다', () => {
  const c = build();
  const labAll = c.allDocs.filter((d) => d.repo === 'labmanager-docs').map((d) => d.path);
  assert.ok(labAll.includes('handover/2026-10-07-old-handover.md'));
  assert.ok(labAll.includes('README.md'));
  assert.ok(!labAll.some((p) => p.startsWith('.notes/') || p.startsWith('.github/')));
});

test('한 repo 를 못 읽으면 그 묶음만 error, 다른 묶음은 정상', () => {
  const err = new GitHubError('not_found', 404);
  const c = build({ lab: err });
  assert.equal(c.groups[0].error, err);
  assert.deepEqual(c.groups[0].projects, []);
  assert.equal(c.groups[1].error, null);
  assert.equal(c.groups[1].projects.length, 2);
});

test('"아카이브"라는 말만 있고 "보존만"이 없으면 보존이 아니다', () => {
  const readme = ['## 폴더 구조', '```', 'stock-portfolio/  ← 주식 분석 아카이브 → 정적 사이트', '```'].join('\n');
  assert.deepEqual(archivedFolders(readme), []);
});

test('README 가 없으면 보존 없음', () => {
  assert.deepEqual(build({ personalReadme: null }).groups[1].archived, []);
});

test('보존 폴더 읽기: 폴더 구조 다음 첫 코드 블록만', () => {
  assert.deepEqual(archivedFolders(README), ['Note-Android', 'roblox_games']);
});

test('마지막 커밋일을 물을 프로젝트 목록', () => {
  assert.deepEqual(projectIdsFor(LAB, 'labmanager-docs'), ['labmanager-docs:web', 'labmanager-docs:mobile']);
  assert.deepEqual(projectIdsFor(PERSONAL, 'personal-docs'), [
    'personal-docs:Aide-Android',
    'personal-docs:friday-night',
    'personal-docs:Note-Android',
    'personal-docs:roblox_games',
  ]);
});

test('타임라인: 최근 14일 안, 날짜 최신순, 날짜 없는 문서 제외', () => {
  const items = recentTimeline(build(), '2026-11-09', 14);
  assert.deepEqual(
    items.map((i) => i.path),
    ['web/handover/2026-11-09-b-handover.md', 'web/handover/2026-11-06-a-handover.md', 'web/plans/2026-11-01-p.md']
  );
  assert.equal(items[0].label, '랩매니저 웹');
  assert.equal(items[0].repo, 'labmanager-docs');
});

test('타임라인: 오늘 포함 14일(막대 그래프와 같은 범위), 그 전날은 제외', () => {
  const lab = [b('web/a/2026-10-27-x.md'), b('web/a/2026-10-26-y.md')];
  const c = buildCatalog({ lab, personal: [], personalReadme: null, lastDates: {}, today: '2026-11-09' });
  assert.deepEqual(recentTimeline(c, '2026-11-09', 14).map((i) => i.path), ['web/a/2026-10-27-x.md']);
});
