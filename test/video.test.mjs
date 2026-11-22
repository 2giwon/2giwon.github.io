import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../app/route.mjs';
import { parseTaskList, nextUp, percent, STATUS_LABEL } from '../app/video.mjs';

const MD = `# 압구정 1편 작업 목록

작성 2026-11-22. 머리말은 체크 목록이 없으니 묶음이 되지 않는다.

## 끝난 것

- [x] **D1 소재 확정과 출처 검증** — 압구정 용봉차일 사건. \`sources.md\` 에 근거를 적었다
      일부러 뺀 내용 7개도 함께 기록했다
- [x] **D2 대본** — 18문장

## P0 — 지금

- [x] **T1 mlx-audio 설치** — 끝. 실제 456 MB
- [~] **T2 Qwen3-TTS 샘플** — 생성 끝, **사용자 판정 대기**
- [ ] **T3 나머지 후보 비교** — 같은 문장으로 만들어 듣는다

      | 모델 | 용량 |
      |---|---|
      | supertonic-3 | 0.40 GB |

### P0 병행 — 사용자가 해야 한다

- [ ] **T6 Pinokio 에서 Phosphene Start**
- [!] **T7 사진 받기** — 공공누리 1유형만

## 설명만 있는 절

표나 글만 있고 체크 목록이 없으면 묶음에서 빠진다.
`;

test('영상 주소는 하위 경로가 없어도 된다', () => {
  assert.deepEqual(parseRoute('#/video'), { name: 'video' });
  assert.deepEqual(parseRoute('#/video/'), { name: 'video' });
});

test('제목마다 묶음을 만들고 체크 목록이 없는 절은 뺀다', () => {
  const { groups } = parseTaskList(MD);
  assert.deepEqual(
    groups.map((g) => [g.heading, g.level, g.items.length]),
    [
      ['끝난 것', 2, 2],
      ['P0 — 지금', 2, 3],
      ['P0 병행 — 사용자가 해야 한다', 3, 2],
    ]
  );
});

test('상태 글자를 상태로 읽는다', () => {
  const { groups } = parseTaskList(MD);
  const byId = Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.id, i.status]));
  assert.equal(byId.D1, 'done');
  assert.equal(byId.T1, 'done');
  assert.equal(byId.T2, 'doing');
  assert.equal(byId.T3, 'todo');
  assert.equal(byId.T6, 'todo');
  assert.equal(byId.T7, 'blocked');
});

test('번호와 제목을 나누고 꾸밈 글자를 뗀다', () => {
  const { groups } = parseTaskList(MD);
  const d1 = groups[0].items[0];
  assert.equal(d1.id, 'D1');
  assert.equal(d1.title, '소재 확정과 출처 검증');
  assert.match(d1.detail, /압구정 용봉차일 사건/);
  assert.ok(!d1.detail.includes('`'), '코드 기호를 떼야 한다');
});

test('들여쓴 이어지는 줄은 설명에 붙인다', () => {
  const d1 = parseTaskList(MD).groups[0].items[0];
  assert.match(d1.detail, /일부러 뺀 내용 7개도 함께 기록했다/);
});

test('항목 안의 표는 설명에 넣지 않는다', () => {
  const t3 = parseTaskList(MD).groups[1].items[2];
  assert.equal(t3.id, 'T3');
  assert.ok(!t3.detail.includes('|'), `표가 섞였다: ${t3.detail}`);
  assert.ok(!t3.detail.includes('0.40 GB'), '표 안의 값이 섞였다');
});

test('설명 안쪽의 굵게 표시도 떼어 낸다', () => {
  const t2 = parseTaskList(MD).groups[1].items[1];
  assert.equal(t2.title, 'T2 Qwen3-TTS 샘플'.replace('T2 ', ''));
  assert.ok(!t2.detail.includes('**'), `굵게 기호가 남았다: ${t2.detail}`);
  assert.match(t2.detail, /사용자 판정 대기/);
});

test('쪼갠 작업 번호(T2-1)도 읽는다', () => {
  const r = parseTaskList('## 가\n\n- [~] **T2-1 목소리 9종 비교** — 생성 끝\n- [ ] **T2-2 말 속도**\n');
  const [a, b] = r.groups[0].items;
  assert.equal(a.id, 'T2-1');
  assert.equal(a.title, '목소리 9종 비교');
  assert.equal(b.id, 'T2-2');
  assert.equal(b.title, '말 속도');
});

test('번호 모양이 아니면 전체를 제목으로 둔다', () => {
  const r = parseTaskList('## 가\n\n- [ ] **번호 없는 작업**\n');
  const it = r.groups[0].items[0];
  assert.equal(it.id, null);
  assert.equal(it.title, '번호 없는 작업');
});

test('설명이 없는 항목도 받는다', () => {
  const t6 = parseTaskList(MD).groups[2].items[0];
  assert.equal(t6.id, 'T6');
  assert.equal(t6.title, 'Pinokio 에서 Phosphene Start');
  assert.equal(t6.detail, '');
});

test('진행률은 끝난 것과 전체 수', () => {
  const { progress } = parseTaskList(MD);
  assert.deepEqual(progress, { done: 3, total: 7 });
  assert.equal(percent(progress), 43);
  assert.equal(percent({ done: 0, total: 0 }), 0, '전체가 0이면 0');
});

test('지금 손댈 것은 막힘 → 진행 중 → 안 함 순서', () => {
  const { groups } = parseTaskList(MD);
  assert.equal(nextUp(groups).id, 'T7', '막힌 것이 가장 먼저다');

  const noBlocked = parseTaskList(MD.replace('[!] **T7', '[x] **T7'));
  assert.equal(nextUp(noBlocked.groups).id, 'T2', '막힘이 없으면 진행 중');

  const onlyTodo = parseTaskList('## 가\n\n- [ ] **A1 하나**\n- [ ] **A2 둘**\n');
  assert.equal(nextUp(onlyTodo.groups).id, 'A1', '안 함만 있으면 첫 번째');

  assert.equal(nextUp([]), null, '아무것도 없으면 null');
});

test('빈 글이나 체크 목록이 없는 글은 묶음 0개', () => {
  for (const md of ['', null, undefined, '# 제목만\n\n글만 있다.\n']) {
    const r = parseTaskList(md);
    assert.deepEqual(r.groups, []);
    assert.deepEqual(r.progress, { done: 0, total: 0 });
  }
});

test('제목 없이 시작하는 체크 목록도 묶음이 된다', () => {
  const r = parseTaskList('- [ ] **A1 제목 없음**\n');
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].heading, '');
  assert.equal(r.groups[0].items[0].id, 'A1');
});

test('설명이 너무 길면 자른다', () => {
  const long = 'ㄱ'.repeat(500);
  const it = parseTaskList(`## 가\n\n- [ ] **A1 제목** — ${long}\n`).groups[0].items[0];
  assert.ok(it.detail.length <= 301, `길이가 ${it.detail.length} 다`);
  assert.ok(it.detail.endsWith('…'), '자른 표시가 있어야 한다');
});

test('상태 이름표가 네 가지 다 있다', () => {
  assert.deepEqual(Object.keys(STATUS_LABEL).sort(), ['blocked', 'doing', 'done', 'todo']);
});
