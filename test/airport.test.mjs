import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightPrefix, boardingPasses, matchProject, towerStatus, TOWER_LABEL, PASS_LABEL } from '../app/airport.mjs';
import { restoreTask } from '../app/todo.mjs';

const task = (id, over = {}) => ({ id, title: `할 일 ${id}`, stage: 'normal', doOn: '2026-11-26', status: 'todo', project: '', ...over });
const item = (t, carryDays = 0) => ({ task: t, carryDays });

const projects = [
  { id: 'labmanager-docs:mobile', repo: 'labmanager-docs', folder: 'mobile', label: '랩매니저 모바일' },
  { id: 'labmanager-docs:web', repo: 'labmanager-docs', folder: 'web', label: '랩매니저 웹' },
  { id: 'personal-docs:video-pipeline', repo: 'personal-docs', folder: 'video-pipeline', label: 'video-pipeline' },
  { id: 'personal-docs:Note-Android', repo: 'personal-docs', folder: 'Note-Android', label: 'Note-Android' },
  { id: 'personal-docs:claude-usage-bar', repo: 'personal-docs', folder: 'claude-usage-bar', label: 'claude-usage-bar' },
];

// ─── 편명 ───────────────────────────────────────────────────────────────────

test('A1. 편명 앞 두 글자: 랩매니저는 LM, LW, 나머지는 단어 머리글자', () => {
  assert.equal(flightPrefix(projects[0]), 'LM');
  assert.equal(flightPrefix(projects[1]), 'LW');
  assert.equal(flightPrefix(projects[2]), 'VP');
  assert.equal(flightPrefix(projects[3]), 'NA');
  assert.equal(flightPrefix({ folder: 'friday', label: 'friday' }), 'FR');
  assert.equal(flightPrefix(null), 'ET');
});

// ─── 할 일 ↔ 프로젝트 짝 맞추기 ─────────────────────────────────────────────

test('A2. 할 일 project 는 대소문자와 - _ 를 무시하고 카드와 짝을 맞춘다', () => {
  assert.equal(matchProject('KP-LABMANAGER-MOBILE', projects)?.id, 'labmanager-docs:mobile');
  assert.equal(matchProject('KP-LABMANAGER-WEB', projects)?.id, 'labmanager-docs:web');
  assert.equal(matchProject('video_pipeline', projects)?.id, 'personal-docs:video-pipeline');
  assert.equal(matchProject('note-android', projects)?.id, 'personal-docs:Note-Android');
  assert.equal(matchProject('claude-dotfiles', projects), null);
  assert.equal(matchProject('', projects), null);
});

// ─── 탑승권 머리띠 ───────────────────────────────────────────────────────────

test('A3. 맨 앞은 탑승 중, 이월은 지연, 나머지는 대기. 긴급은 도장', () => {
  const r = boardingPasses(
    [item(task(1, { stage: 'urgent', project: 'KP-LABMANAGER-MOBILE' })), item(task(2, { project: 'KP-LABMANAGER-MOBILE' }), 2), item(task(3))],
    projects
  );
  assert.deepEqual(
    r.map((p) => [p.task.id, p.status, p.urgent, p.code, p.carryDays]),
    [
      [1, 'boarding', true, 'LM1', 0],
      [2, 'delayed', false, 'LM2', 2],
      [3, 'waiting', false, 'ET1', 0],
    ]
  );
  assert.equal(r[0].project?.id, 'labmanager-docs:mobile');
  assert.equal(PASS_LABEL.boarding, '탑승 중');
});

test('A3. 맨 앞이 이월이어도 탑승 중(지금 할 일이 먼저)', () => {
  const r = boardingPasses([item(task(1), 3), item(task(2), 1)], projects);
  assert.deepEqual(
    r.map((p) => p.status),
    ['boarding', 'delayed']
  );
});

test('A3. 오늘 할 일이 없으면 빈 목록', () => {
  assert.deepEqual(boardingPasses([], projects), []);
});

// ─── 관제탑 띠 ───────────────────────────────────────────────────────────────

const T = '2026-11-26';

test('A4. 관제탑 상태는 결항 → 탑승 중 → 지연 → 도착 → 대기 순으로 먼저 맞는 것', () => {
  assert.equal(towerStatus({ paused: true, todayCount: 2, hasOpen: true, lastDate: '2026-10-01' }, T), 'cancelled');
  assert.equal(towerStatus({ paused: false, todayCount: 1, hasOpen: true, lastDate: '2026-11-20' }, T), 'boarding');
  assert.equal(towerStatus({ paused: false, todayCount: 0, hasOpen: true, lastDate: '2026-11-25' }, T), 'delayed');
  assert.equal(towerStatus({ paused: false, todayCount: 0, hasOpen: false, lastDate: '2026-11-19' }, T), 'arrived');
  assert.equal(towerStatus({ paused: false, todayCount: 0, hasOpen: false, lastDate: '2026-11-18' }, T), 'waiting');
  assert.equal(towerStatus({ paused: false, todayCount: 0, hasOpen: false, lastDate: null }, T), 'waiting');
  assert.equal(TOWER_LABEL.cancelled, '결항');
});

test('A4. 미결을 아직 모르면(읽는 중) checking', () => {
  assert.equal(towerStatus({ paused: false, todayCount: 0, hasOpen: null, lastDate: '2026-11-25' }, T), 'checking');
  assert.equal(towerStatus({ paused: false, todayCount: 1, hasOpen: null, lastDate: '2026-11-25' }, T), 'boarding');
});

// ─── 되돌리기 ────────────────────────────────────────────────────────────────

test('A5. 되돌리기는 상태, 할 날, 끝낸 날을 이전 값으로 돌린다', () => {
  const data = { version: 1, nextId: 3, tasks: [task(1, { status: 'done', doneOn: T, doOn: '2026-11-24' }), task(2)] };
  const back = restoreTask(data, 1, { status: 'todo', doOn: '2026-11-24', doneOn: null });
  assert.equal(back.tasks[0].status, 'todo');
  assert.equal(back.tasks[0].doOn, '2026-11-24');
  assert.equal(back.tasks[0].doneOn, null);
  assert.equal(back.tasks[1], data.tasks[1]);
  assert.throws(() => restoreTask(data, 99, { status: 'todo', doOn: null, doneOn: null }));
});
