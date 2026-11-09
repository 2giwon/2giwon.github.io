#!/usr/bin/env node
// (Claude 용) 문서 repo 에서 그림이 없거나(none) 오래된(stale) 문서를 갱신할 순서대로 보여 준다.
// 사용: node tools/notes-status.mjs ~/Documents/labmanager-docs [--limit 10]
// 원문 지문은 작업트리 파일의 `git hash-object` — 커밋하면 화면이 보는 지문과 같아진다.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { buildCatalog, LAB, PERSONAL } from '../app/catalog.mjs';
import { parseFigures, figureState } from '../app/figures.mjs';
import { orderForRefresh } from './notes-status-lib.mjs';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : 10;
if (!root) {
  console.error('사용: node tools/notes-status.mjs <문서repo경로> [--limit 10]');
  process.exit(2);
}
const dir = resolve(root);
const repo = basename(dir);
if (repo !== LAB && repo !== PERSONAL) {
  console.error(`${LAB} 또는 ${PERSONAL} 폴더만 됩니다: ${repo}`);
  process.exit(2);
}

const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
// core.quotePath=false + -z: 한글 경로를 따옴표, 8진수 없이 그대로 받는다(codex P2 11-09)
const files = git('-c', 'core.quotePath=false', 'ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean);
// 커밋 안 하고 지운 파일은 목록에 남아 있지만 hash-object 가 멈추므로 뺀다(codex P2 11-09)
const wanted = files.filter(
  (p) => (/\.md$/i.test(p) || (p.startsWith('.notes/') && p.endsWith('.json'))) && existsSync(join(dir, p))
);
const shas = execFileSync('git', ['-C', dir, 'hash-object', '--stdin-paths'], {
  input: wanted.join('\n'),
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);
const tree = wanted.map((path, i) => ({ path, sha: shas[i], type: 'blob' }));

const today = new Date().toISOString().slice(0, 10);
const readme = repo === PERSONAL && existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : null;
const catalog = buildCatalog({
  lab: repo === LAB ? tree : [],
  personal: repo === PERSONAL ? tree : [],
  personalReadme: readme,
  lastDates: {},
  today,
});
const latest = new Set(
  catalog.groups.flatMap((g) => [...g.projects, ...g.archived]).map((p) => p.latestHandover?.path).filter(Boolean)
);

const entries = catalog.allDocs.map((d) => {
  let state = 'none';
  const figFile = join(dir, d.figurePath);
  if (existsSync(figFile)) {
    const r = parseFigures(readFileSync(figFile, 'utf8'));
    state = r.ok ? figureState(r.data, d.sha) : 'stale';
  }
  return { path: d.path, date: d.date, state, latestHandover: latest.has(d.path) };
});

const order = orderForRefresh(entries, today);
const docPaths = new Set(catalog.allDocs.map((d) => d.figurePath));
const orphans = wanted.filter((p) => p.startsWith('.notes/') && !docPaths.has(p));

console.log(`${repo}: 문서 ${entries.length}편, 그림 최신 ${entries.length - order.length}편, 갱신 대상 ${order.length}편`);
for (const x of order.slice(0, limit)) {
  console.log(`${x.state === 'none' ? '그림 없음 ' : '오래됨    '} ${x.date ?? '----------'}  ${x.latestHandover ? '[최신 핸드오프] ' : ''}${x.path}`);
}
if (order.length > limit) console.log(`… 나머지 ${order.length - limit}편 (--limit 로 늘리기)`);
for (const p of orphans) console.log(`원문 없음  ${p} (원문이 지워졌거나 옮겨졌다 — 그림 데이터 정리 필요)`);
