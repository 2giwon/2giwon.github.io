import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightPrefix, boardingPasses, matchProject, towerStatus, TOWER_LABEL, PASS_LABEL, flapFrames, towerNowText, FLAP_ALPHA, stackOrder, stepFront, swipeIntent, SWIPE_PX } from '../app/airport.mjs';
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

// ─── 글자판 촤르르 ───────────────────────────────────────────────────────────

test('A6. 글자판은 글자마다 여러 글자를 돌다가 왼쪽부터 차례로 제자리에 멈춘다', () => {
  let i = 0;
  const rnd = () => (i++ % 7) / 7;
  const frames = flapFrames('LM1', rnd);
  assert.equal(frames.at(-1), 'LM1');
  assert.ok(frames.length >= 8, '충분히 돌아야 촤르르 느낌이 난다');
  assert.ok(frames.every((f) => f.length === 3));
  // 첫 글자가 먼저 멈추고, 마지막 글자가 가장 늦게 멈춘다
  const settledAt = (pos) => frames.findIndex((f, k) => frames.slice(k).every((g) => g[pos] === 'LM1'[pos]));
  assert.ok(settledAt(0) < settledAt(1) && settledAt(1) < settledAt(2));
  // 도는 동안의 글자는 글자판에 있는 글자만
  assert.ok(frames.slice(0, -1).every((f) => [...f].every((c) => FLAP_ALPHA.includes(c))));
});

// ─── 관제탑 지금 할 일 ──────────────────────────────────────────────────────

test('A7. 지금 할 일 칸: 오늘 할 일 → 핸드오프 다음 할 일 → 지금 상태 → 소식 없음 순', () => {
  const card = { state: ['PR 머지'], next: ['QR 답 받기'], open: [] };
  assert.equal(towerNowText({ todayTitle: '사진 보여주기', card, lastDate: '2026-11-24' }), '사진 보여주기');
  assert.equal(towerNowText({ todayTitle: null, card, lastDate: '2026-11-24' }), 'QR 답 받기');
  assert.equal(towerNowText({ todayTitle: null, card: { state: ['PR 머지'], next: [], open: [] }, lastDate: null }), 'PR 머지');
  assert.equal(towerNowText({ todayTitle: null, card: null, lastDate: '2026-11-19' }), '11월 19일 이후 소식 없음');
  assert.equal(towerNowText({ todayTitle: null, card: null, lastDate: null }), '소식 없음');
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

// 폰 탑승권 더미 넘기기(11-27 사용자: "작업 리스트 티켓에서 다음 티켓을 보기가 힘들어", "옆으로 밀면 다음 티켓, 밑에서 위로 올리면 완료").
// 예전에는 옆으로 밀면 바로 탑승 완료(오른쪽)나 나중에(왼쪽)로 처리돼서, 다음 티켓을 보려면 앞 티켓을 처리해야 했다
const deck = ['a', 'b', 'c', 'd'].map((id) => ({ task: { id } }));
const ids = (list) => list.map((p) => p.task.id);

test('S1. 맨 앞 티켓이 앞에 오게 순서를 돌린다(나머지 순서는 그대로)', () => {
  assert.deepEqual(ids(stackOrder(deck, null)), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(stackOrder(deck, 'c')), ['c', 'd', 'a', 'b']);
  assert.deepEqual(ids(stackOrder(deck, 'zz')), ['a', 'b', 'c', 'd'], '없는 번호(처리돼 사라짐)면 처음부터');
  assert.deepEqual(stackOrder([], 'a'), []);
});

test('S2. 다음, 이전 티켓으로 넘기고 끝에서는 처음으로 돌아온다', () => {
  assert.equal(stepFront(deck, null, 1), 'b');
  assert.equal(stepFront(deck, 'b', 1), 'c');
  assert.equal(stepFront(deck, 'd', 1), 'a');
  assert.equal(stepFront(deck, 'a', -1), 'd');
  assert.equal(stepFront(deck, 'c', -1), 'b');
  assert.equal(stepFront(deck, 'zz', 1), 'b', '없는 번호면 처음 티켓에서 센다');
  assert.equal(stepFront([{ task: { id: 'x' } }], 'x', 1), 'x');
  assert.equal(stepFront([], null, 1), null);
});

test('S3. 손동작: 옆으로 밀면 넘기기, 아래쪽을 잡고 위로 올리면 완료, 나머지는 아무것도 아님', () => {
  const far = SWIPE_PX + 10;
  assert.equal(swipeIntent({ dx: 20, dy: -10, lower: true }), null, '조금 움직임');
  assert.equal(swipeIntent({ dx: -far, dy: 0, lower: false }), 'next', '왼쪽으로 밀면 다음 티켓');
  assert.equal(swipeIntent({ dx: far, dy: 0, lower: true }), 'prev', '오른쪽으로 밀면 이전 티켓');
  assert.equal(swipeIntent({ dx: 0, dy: -far, lower: true }), 'done', '아래쪽을 잡고 위로 올리면 완료');
  assert.equal(swipeIntent({ dx: 0, dy: -far, lower: false }), null, '제목 쪽을 잡고 올리면 화면 스크롤(완료 아님)');
  assert.equal(swipeIntent({ dx: 0, dy: far, lower: true }), null, '아래로 내리기는 아무것도 아님(나중에는 버튼으로만)');
  assert.equal(swipeIntent({ dx: -far, dy: -(far - 5), lower: true }), 'next', '대각선은 더 많이 움직인 쪽');
  assert.equal(swipeIntent({ dx: -40, dy: -far, lower: true }), 'done');
});
