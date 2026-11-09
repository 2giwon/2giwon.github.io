import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderForRefresh } from '../tools/notes-status-lib.mjs';

const e = (path, date, state, latestHandover = false) => ({ path, date, state, latestHandover });

test('최신 핸드오프 → 30일 안 문서(최신순) → 나머지(오래된 순), 최신 그림은 빠진다', () => {
  const out = orderForRefresh(
    [
      e('old-b.md', '2026-08-01', 'none'),
      e('recent-a.md', '2026-11-01', 'none'),
      e('ho.md', '2026-10-01', 'stale', true),
      e('fresh.md', '2026-11-08', 'fresh'),
      e('recent-b.md', '2026-11-05', 'stale'),
      e('old-a.md', '2026-07-01', 'none'),
      e('nodate.md', null, 'none'),
    ],
    '2026-11-09'
  );
  assert.deepEqual(
    out.map((x) => x.path),
    ['ho.md', 'recent-b.md', 'recent-a.md', 'old-a.md', 'old-b.md', 'nodate.md']
  );
});

test('최신 핸드오프가 여러 개면 날짜 최신순', () => {
  const out = orderForRefresh(
    [e('h1.md', '2026-09-01', 'none', true), e('h2.md', '2026-10-01', 'none', true)],
    '2026-11-09'
  );
  assert.deepEqual(out.map((x) => x.path), ['h2.md', 'h1.md']);
});

test('최신 그림인 최신 핸드오프도 빠진다', () => {
  assert.deepEqual(orderForRefresh([e('h.md', '2026-11-01', 'fresh', true)], '2026-11-09'), []);
});

test('30일 경계: 30일 전은 최근, 31일 전은 나머지', () => {
  const out = orderForRefresh(
    [e('d31.md', '2026-10-09', 'none'), e('d30.md', '2026-10-10', 'none')],
    '2026-11-09'
  );
  assert.deepEqual(out.map((x) => x.path), ['d30.md', 'd31.md']);
});
