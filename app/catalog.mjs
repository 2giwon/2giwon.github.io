// 두 repo 의 파일 목록 → 상태판의 묶음(회사, 개인)과 프로젝트 카드, 폴더 화면의 전체 문서 목록.

import { figurePathFor } from './figures.mjs';

export const LAB = 'labmanager-docs';
export const PERSONAL = 'personal-docs';
const LAB_FOLDERS = [
  ['web', '랩매니저 웹'],
  ['mobile', '랩매니저 모바일'],
];
const PAUSE_DAYS = 30;

const isDoc = (e) => e.type === 'blob' && /\.md$/i.test(e.path) && !/^\./.test(e.path);
const dateOf = (path) => path.split('/').pop().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/**
 * personal-docs README "## 폴더 구조" 다음 첫 코드 블록에서 "보존만"이 적힌 폴더.
 * "아카이브"는 기준으로 쓰지 않는다 — "주식 분석 아카이브"처럼 만드는 것의 이름에도 쓰인다(11-09 확인).
 */
export function archivedFolders(readme) {
  if (!readme) return [];
  const after = readme.split(/^##\s+폴더 구조\s*$/m)[1];
  const block = after?.match(/```[^\n]*\n([\s\S]*?)```/)?.[1] ?? '';
  return block
    .split('\n')
    .filter((line) => /보존만/.test(line))
    .map((line) => line.match(/^(\S+)\/\s/)?.[1])
    .filter(Boolean);
}

function topFolders(tree, repo) {
  if (repo === LAB) {
    return LAB_FOLDERS.filter(([f]) => tree.some((e) => isDoc(e) && e.path.startsWith(`${f}/`))).map(([f]) => f);
  }
  const seen = [];
  for (const e of tree) {
    if (!isDoc(e) || !e.path.includes('/')) continue;
    const f = e.path.split('/')[0];
    if (!seen.includes(f)) seen.push(f);
  }
  return seen;
}

/** 마지막 커밋일을 물어야 하는 프로젝트 id 목록 (`repo:폴더`). */
export function projectIdsFor(tree, repo) {
  return topFolders(tree, repo).map((f) => `${repo}:${f}`);
}

function docsOf(tree, repo, label) {
  const shaByPath = new Map(tree.map((e) => [e.path, e.sha]));
  return tree.filter(isDoc).map((e) => {
    const figurePath = figurePathFor(e.path);
    return { repo, path: e.path, sha: e.sha, date: dateOf(e.path), label, figurePath, figureSha: shaByPath.get(figurePath) ?? null };
  });
}

function projectsOf(tree, repo, lastDates, today) {
  const labels = new Map(LAB_FOLDERS);
  return topFolders(tree, repo).map((folder) => {
    const id = `${repo}:${folder}`;
    const label = repo === LAB ? labels.get(folder) : folder;
    const docs = docsOf(tree, repo, label).filter((d) => d.path.startsWith(`${folder}/`));
    const handovers = docs
      .filter((d) => d.path.startsWith(`${folder}/handover/`) && d.date)
      .sort((a, b) => b.date.localeCompare(a.date) || b.path.localeCompare(a.path));
    const lastDate = lastDates[id] ?? null;
    return {
      id,
      repo,
      folder,
      label,
      docs,
      latestHandover: handovers[0] ?? null,
      lastDate,
      paused: lastDate ? dayNumber(today) - dayNumber(lastDate) > PAUSE_DAYS : false,
    };
  });
}

const byLastDate = (a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '');

function group(id, label, tree, repo, lastDates, today, archivedNames) {
  if (!Array.isArray(tree)) return { id, label, error: tree, projects: [], archived: [] };
  const all = projectsOf(tree, repo, lastDates, today).sort(byLastDate);
  return {
    id,
    label,
    error: null,
    projects: all.filter((p) => !archivedNames.includes(p.folder)),
    archived: all.filter((p) => archivedNames.includes(p.folder)),
  };
}

/**
 * @param {{lab: object[]|Error, personal: object[]|Error, personalReadme: string|null,
 *          lastDates: Record<string, string|null>, today: string}} input
 */
export function buildCatalog({ lab, personal, personalReadme, lastDates, today }) {
  const archived = archivedFolders(personalReadme);
  const allDocs = [
    ...(Array.isArray(lab) ? docsOf(lab, LAB, '랩매니저') : []),
    ...(Array.isArray(personal) ? docsOf(personal, PERSONAL, '개인') : []),
  ];
  return {
    groups: [
      group('company', '회사', lab, LAB, lastDates, today, []),
      group('personal', '개인', personal, PERSONAL, lastDates, today, archived),
    ],
    allDocs,
  };
}
