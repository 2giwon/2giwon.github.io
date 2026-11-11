import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTasks,
  todayView,
  addTask,
  completeTask,
  moveToToday,
  moveToLater,
  setStage,
  needsTicket,
} from '../app/todo.mjs';

const TODAY = '2026-11-11';

const task = (over) => ({
  id: 1,
  title: '할 일',
  stage: 'normal',
  doOn: TODAY,
  status: 'todo',
  project: '',
  due: null,
  note: '',
  createdOn: TODAY,
  doneOn: null,
  redmine: null,
  sheetRow: null,
  ...over,
});

const file = (tasks, nextId = 100) => ({ version: 1, nextId, tasks });

// ─── 1, 2: parseTasks ─────────────────────────────────────────────────────────

test('1. 정상 파일을 읽고, 모르는 단계는 보통, 빠진 칸은 기본값으로 채운다', () => {
  const r = parseTasks(
    JSON.stringify({ version: 1, nextId: 5, tasks: [{ id: 3, title: '가', stage: '아주급함', doOn: TODAY, status: 'todo' }] })
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.nextId, 5);
  assert.deepEqual(r.data.tasks[0], task({ id: 3, title: '가', createdOn: null }));
});

test('1. 이상한 상태와 날짜는 기본값으로, nextId 가 없으면 가장 큰 id + 1', () => {
  const r = parseTasks(JSON.stringify({ tasks: [{ id: 7, title: '나', status: '??', doOn: '11월 11일', redmine: '489' }] }));
  assert.equal(r.ok, true);
  assert.equal(r.data.nextId, 8);
  assert.equal(r.data.tasks[0].status, 'todo');
  assert.equal(r.data.tasks[0].doOn, null);
  assert.equal(r.data.tasks[0].redmine, null);
});

test('2. JSON 이 깨졌거나 tasks 가 배열이 아니면 형식 오류', () => {
  assert.equal(parseTasks('{ 깨짐').ok, false);
  assert.equal(parseTasks(JSON.stringify({ tasks: {} })).ok, false);
  assert.equal(parseTasks('null').ok, false);
});

test('2. 제목이나 id 가 없는 할 일은 빼고 읽는다', () => {
  const r = parseTasks(JSON.stringify({ tasks: [{ title: 'id 없음' }, { id: 2 }, { id: 3, title: '정상' }] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.tasks.map((t) => t.id), [3]);
});

// ─── 3~6: todayView ──────────────────────────────────────────────────────────

test('3. 할 날이 오늘과 지난 날이면 오늘, 미래면 안 보이고, null 이면 나중에', () => {
  const v = todayView(
    [
      task({ id: 1, doOn: TODAY }),
      task({ id: 2, doOn: '2026-11-10' }),
      task({ id: 3, doOn: '2026-11-12' }),
      task({ id: 4, doOn: null }),
    ],
    TODAY
  );
  assert.deepEqual(v.today.map((x) => x.task.id), [1, 2]);
  assert.deepEqual(v.later.map((t) => t.id), [4]);
  assert.deepEqual(v.doneToday, []);
});

test('4. 긴급 → 보통 → 여유, 같은 단계는 파일 순서', () => {
  const v = todayView(
    [
      task({ id: 1, stage: 'relaxed' }),
      task({ id: 2, stage: 'normal' }),
      task({ id: 3, stage: 'urgent' }),
      task({ id: 4, stage: 'normal' }),
      task({ id: 5, stage: 'urgent' }),
    ],
    TODAY
  );
  assert.deepEqual(v.today.map((x) => x.task.id), [3, 5, 2, 4, 1]);
});

test('5. 이월 일수: 오늘 0, 어제 1, 월을 넘어가도 맞다', () => {
  const v = todayView(
    [task({ id: 1, doOn: TODAY }), task({ id: 2, doOn: '2026-11-10' }), task({ id: 3, doOn: '2026-10-30' })],
    TODAY
  );
  assert.deepEqual(v.today.map((x) => x.carryDays), [0, 1, 12]);
});

test('6. 오늘 끝낸 것만 doneToday, 어제 끝낸 것과 끝난 나중에는 안 보인다', () => {
  const v = todayView(
    [
      task({ id: 1, status: 'done', doneOn: TODAY }),
      task({ id: 2, status: 'done', doneOn: '2026-11-10' }),
      task({ id: 3, status: 'done', doOn: null, doneOn: '2026-11-01' }),
    ],
    TODAY
  );
  assert.deepEqual(v.doneToday.map((t) => t.id), [1]);
  assert.deepEqual(v.today, []);
  assert.deepEqual(v.later, []);
});

// ─── 7: 바꾸기 함수 ──────────────────────────────────────────────────────────

test('7. 추가는 끝에 붙고 nextId 가 하나 는다. 원본은 그대로', () => {
  const before = file([task({ id: 1 })], 9);
  const after = addTask(before, { title: '  새 일  ', stage: 'urgent', doOn: TODAY, project: 'X' }, TODAY);
  assert.equal(after.nextId, 10);
  assert.deepEqual(after.tasks.at(-1), task({ id: 9, title: '새 일', stage: 'urgent', project: 'X' }));
  assert.equal(before.tasks.length, 1);
  assert.equal(before.nextId, 9);
});

test('7. 빈 제목은 추가하지 않는다', () => {
  assert.throws(() => addTask(file([]), { title: '   ' }, TODAY));
});

test('7. 완료, 오늘로, 나중에로, 단계 바꾸기. 원본은 그대로', () => {
  const before = file([task({ id: 1, doOn: null }), task({ id: 2 })]);
  const done = completeTask(before, 2, TODAY);
  assert.equal(done.tasks[1].status, 'done');
  assert.equal(done.tasks[1].doneOn, TODAY);
  assert.equal(moveToToday(before, 1, TODAY).tasks[0].doOn, TODAY);
  assert.equal(moveToLater(before, 2).tasks[1].doOn, null);
  assert.equal(setStage(before, 2, 'urgent').tasks[1].stage, 'urgent');
  assert.equal(before.tasks[1].status, 'todo');
  assert.equal(before.tasks[0].doOn, null);
});

test('7. 없는 id 나 모르는 단계는 오류', () => {
  assert.throws(() => completeTask(file([task()]), 99, TODAY));
  assert.throws(() => setStage(file([task()]), 1, '아주급함'));
});

// ─── 8: needsTicket ─────────────────────────────────────────────────────────

test('8. 랩매니저 할 일이면서 Redmine 번호가 없을 때만 티켓 없음', () => {
  assert.equal(needsTicket(task({ project: 'KP-LABMANAGER-WEB' })), true);
  assert.equal(needsTicket(task({ project: 'KP-LABMANAGER-MOBILE', redmine: 489 })), false);
  assert.equal(needsTicket(task({ project: 'Aide-Android' })), false);
  assert.equal(needsTicket(task({ project: 'KP-LABMANAGER-WEB', status: 'done' })), false);
});
