import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figurePathFor, parseFigures, figureState, checkFigureFile } from '../app/figures.mjs';

const SHA = 'a'.repeat(40);

function sample() {
  return {
    version: 1,
    source: 'web/handover/2026-01-01-sample-handover.md',
    sourceSha: SHA,
    summary: '예시 문서 한 줄 요약',
    card: { state: ['예시 상태'], next: ['예시 다음'], open: [] },
    sections: [
      {
        heading: '0. 지금 상태',
        keyPoints: ['핵심 하나', '핵심 둘'],
        figures: [
          { type: 'mermaid', code: 'flowchart LR\n A-->B' },
          { type: 'chart', kind: 'bar', labels: ['완료', '미결'], series: [{ name: '건수', values: [3, 2] }] },
          { type: 'cards', items: [{ title: '카드', body: '내용', tone: 'ok' }] },
          { type: 'table', columns: ['항목', '내용'], rows: [['가', '나']] },
          { type: 'progress', items: [{ label: '진행', done: 3, total: 5 }] },
        ],
      },
    ],
  };
}

test('그림 데이터 위치는 .notes/ 아래 같은 경로의 .json', () => {
  assert.equal(figurePathFor('web/handover/a.md'), '.notes/web/handover/a.json');
  assert.equal(figurePathFor('README.md'), '.notes/README.json');
});

test('.md 가 아닌 경로는 throw', () => {
  assert.throws(() => figurePathFor('web/a.txt'));
});

test('형식에 맞는 그림 데이터는 그대로 ok', () => {
  const r = parseFigures(JSON.stringify(sample()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, sample());
});

test('JSON 문법 오류는 ok:false', () => {
  const r = parseFigures('{ "version": 1,');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});

test('version 이 1 이 아니면 ok:false', () => {
  const r = parseFigures(JSON.stringify({ ...sample(), version: 2 }));
  assert.equal(r.ok, false);
});

test('sourceSha 가 40자 16진수가 아니면 ok:false', () => {
  assert.equal(parseFigures(JSON.stringify({ ...sample(), sourceSha: 'abc' })).ok, false);
});

test('sections 가 배열이 아니면 ok:false', () => {
  assert.equal(parseFigures(JSON.stringify({ ...sample(), sections: {} })).ok, false);
});

test('알 수 없는 그림 종류 하나만 invalid 로 바뀌고 나머지는 남는다', () => {
  const d = sample();
  d.sections[0].figures.splice(1, 0, { type: 'hologram' });
  const r = parseFigures(JSON.stringify(d));
  assert.equal(r.ok, true);
  const figs = r.data.sections[0].figures;
  assert.equal(figs.length, 6);
  assert.equal(figs[1].type, 'invalid');
  assert.match(figs[1].reason, /hologram/);
  assert.equal(figs[0].type, 'mermaid');
  assert.equal(figs[2].type, 'chart');
});

test('chart 값 개수가 labels 와 다르면 그 그림만 invalid', () => {
  const d = sample();
  d.sections[0].figures[1].series[0].values = [1];
  const figs = parseFigures(JSON.stringify(d)).data.sections[0].figures;
  assert.equal(figs[1].type, 'invalid');
  assert.equal(figs[0].type, 'mermaid');
});

test('chart kind 가 bar, line, pie 밖이면 invalid', () => {
  const d = sample();
  d.sections[0].figures[1].kind = 'radar';
  assert.equal(parseFigures(JSON.stringify(d)).data.sections[0].figures[1].type, 'invalid');
});

test('mermaid code 가 비면 invalid', () => {
  const d = sample();
  d.sections[0].figures[0].code = '';
  assert.equal(parseFigures(JSON.stringify(d)).data.sections[0].figures[0].type, 'invalid');
});

test('table 행 칸 수가 columns 와 다르면 invalid', () => {
  const d = sample();
  d.sections[0].figures[3].rows = [['가']];
  assert.equal(parseFigures(JSON.stringify(d)).data.sections[0].figures[3].type, 'invalid');
});

test('progress 의 done 이 total 보다 크면 invalid', () => {
  const d = sample();
  d.sections[0].figures[4].items = [{ label: '진행', done: 6, total: 5 }];
  assert.equal(parseFigures(JSON.stringify(d)).data.sections[0].figures[4].type, 'invalid');
});

test('cards tone 이 정해진 값 밖이면 invalid', () => {
  const d = sample();
  d.sections[0].figures[2].items[0].tone = 'pink';
  assert.equal(parseFigures(JSON.stringify(d)).data.sections[0].figures[2].type, 'invalid');
});

test('keyPoints 와 card 가 없어도 ok (빈 값으로 채움)', () => {
  const d = sample();
  delete d.card;
  delete d.sections[0].keyPoints;
  const r = parseFigures(JSON.stringify(d));
  assert.equal(r.ok, true);
  assert.equal(r.data.card, null);
  assert.deepEqual(r.data.sections[0].keyPoints, []);
});

test('검사: 형식에 맞고 경로가 원문과 맞으면 문제 없음', () => {
  const d = sample();
  assert.deepEqual(checkFigureFile('.notes/web/handover/2026-01-01-sample-handover.json', JSON.stringify(d)), []);
});

test('검사: 깨진 그림은 섹션과 순서를 붙여 알려 준다', () => {
  const d = sample();
  d.sections[0].figures[0].code = '';
  const problems = checkFigureFile('.notes/web/handover/2026-01-01-sample-handover.json', JSON.stringify(d));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0\. 지금 상태/);
  assert.match(problems[0], /1번째/);
});

test('검사: source 가 파일 위치와 다르면 문제', () => {
  const problems = checkFigureFile('.notes/web/other.json', JSON.stringify(sample()));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /source/);
});

test('검사: JSON 이 깨졌으면 그 오류 하나', () => {
  const problems = checkFigureFile('.notes/web/a.json', '{');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /JSON/);
});

test('검사: keyPoints 가 3개를 넘으면 문제', () => {
  const d = sample();
  d.sections[0].keyPoints = ['1', '2', '3', '4'];
  const problems = checkFigureFile('.notes/web/handover/2026-01-01-sample-handover.json', JSON.stringify(d));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /keyPoints/);
});

test('그림 상태: 없음, 최신, 오래됨', () => {
  assert.equal(figureState(null, SHA), 'none');
  assert.equal(figureState(sample(), SHA), 'fresh');
  assert.equal(figureState(sample(), 'b'.repeat(40)), 'stale');
});
