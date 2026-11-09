import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../app/route.mjs';

test('빈 주소와 #/ 는 상태판', () => {
  assert.deepEqual(parseRoute(''), { name: 'dashboard' });
  assert.deepEqual(parseRoute('#/'), { name: 'dashboard' });
});

test('문서 주소는 repo 와 경로로, 한글은 풀어서', () => {
  assert.deepEqual(parseRoute('#/doc/labmanager-docs/web/handover/2026-11-09-a.md'), {
    name: 'doc',
    repo: 'labmanager-docs',
    path: 'web/handover/2026-11-09-a.md',
  });
  assert.deepEqual(parseRoute('#/doc/personal-docs/%EC%83%88%20%ED%8F%B4%EB%8D%94/a.md'), {
    name: 'doc',
    repo: 'personal-docs',
    path: '새 폴더/a.md',
  });
});

test('경로가 빠진 문서 주소는 상태판', () => {
  assert.deepEqual(parseRoute('#/doc/labmanager-docs'), { name: 'dashboard' });
});

test('폴더 주소: 전체, repo 와 폴더', () => {
  assert.deepEqual(parseRoute('#/folders'), { name: 'folders', repo: null, folder: null });
  assert.deepEqual(parseRoute('#/folders/personal-docs/Aide-Android'), {
    name: 'folders',
    repo: 'personal-docs',
    folder: 'Aide-Android',
  });
});

test('잘못된 % 인코딩은 그대로 둔다', () => {
  assert.deepEqual(parseRoute('#/folders/personal-docs/%E0%A4%A'), {
    name: 'folders',
    repo: 'personal-docs',
    folder: '%E0%A4%A',
  });
});

test('모르는 주소는 상태판', () => {
  assert.deepEqual(parseRoute('#/xyz'), { name: 'dashboard' });
});
