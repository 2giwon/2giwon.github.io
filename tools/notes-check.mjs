#!/usr/bin/env node
// (Claude 용) 문서 repo 의 .notes/ 그림 데이터를 전부 검사한다. 문제가 하나라도 있으면 종료 코드 1.
// 사용: node tools/notes-check.mjs ~/Documents/labmanager-docs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkFigureFile } from '../app/figures.mjs';

const root = process.argv[2];
if (!root) {
  console.error('사용: node tools/notes-check.mjs <문서repo경로>');
  process.exit(2);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
}

const notesDir = join(root, '.notes');
let files = [];
try {
  files = walk(notesDir);
} catch {
  console.log('그림 데이터 없음 (.notes/ 폴더가 없습니다)');
  process.exit(0);
}

let bad = 0;
for (const file of files) {
  const rel = relative(root, file);
  const problems = checkFigureFile(rel, readFileSync(file, 'utf8'));
  if (problems.length) {
    bad += 1;
    console.log(`✖ ${rel}`);
    for (const p of problems) console.log(`    ${p}`);
  }
}
console.log(`${files.length}개 검사, 문제 ${bad}개`);
process.exit(bad ? 1 : 0);
