import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoverCard } from '../app/handover.mjs';

// 원문 형식만 흉내 낸 지어낸 문서들 (실제 문서 내용은 공개 repo 에 넣지 않는다)
const LAB = [
  '# 핸드오프',
  '## 0. 지금 상태',
  '- 상태 가',
  '- **상태 나** 굵게',
  '  - 하위 항목은 빼기',
  '## 1. 다음 할 일',
  '1. 할 일 가',
  '2. `코드` 할 일 나',
  '## 2. 이번에 정한 것',
  '- 정한 것',
  '## 3. 미결, 리스크',
  '- 미결 가',
].join('\n');

const PERSONAL = [
  '# 핸드오프',
  '## 지금 어디까지 왔나',
  '- 어디까지 가',
  '## 미결·리스크',
  '- 미결 가',
  '- 미결 나',
].join('\n');

test('랩매니저형 제목에서 세 칸을 다 뽑는다', () => {
  assert.deepEqual(handoverCard(LAB, null), {
    state: ['상태 가', '상태 나 굵게'],
    next: ['할 일 가', '코드 할 일 나'],
    open: ['미결 가'],
    source: 'headings',
  });
});

test('개인형 제목(지금 어디까지 왔나, 미결)도 찾는다', () => {
  const c = handoverCard(PERSONAL, null);
  assert.deepEqual(c.state, ['어디까지 가']);
  assert.deepEqual(c.next, []);
  assert.deepEqual(c.open, ['미결 가', '미결 나']);
});

test('목록이 많으면 세 개까지만', () => {
  const md = ['## 다음 작업', '- 1', '- 2', '- 3', '- 4', '- 5'].join('\n');
  assert.deepEqual(handoverCard(md, null).next, ['1', '2', '3']);
});

test('목록이 없으면 첫 문단 한 줄', () => {
  const md = ['## 현재 상태 — 검증 완료', '', '구현 착수 직전이다.', '', '다음 문단'].join('\n');
  assert.deepEqual(handoverCard(md, null).state, ['구현 착수 직전이다.']);
});

test('링크는 글자만 남긴다', () => {
  const md = ['## 다음 할 일', '- [계획 문서](plans/a.md) 읽기'].join('\n');
  assert.deepEqual(handoverCard(md, null).next, ['계획 문서 읽기']);
});

test('그림 데이터에 card 가 있으면 그것을 쓴다', () => {
  const c = handoverCard(LAB, { card: { state: ['그림 상태'], next: [], open: ['그림 미결'] } });
  assert.deepEqual(c, { state: ['그림 상태'], next: [], open: ['그림 미결'], source: 'figures' });
});

test('키워드 제목이 하나도 없으면 none', () => {
  assert.deepEqual(handoverCard('# 문서\n## 배경\n- 가', null), {
    state: [],
    next: [],
    open: [],
    source: 'none',
  });
});

test('원문이 비어도 오류 없이 none', () => {
  assert.equal(handoverCard('', null).source, 'none');
  assert.equal(handoverCard(null, null).source, 'none');
});
