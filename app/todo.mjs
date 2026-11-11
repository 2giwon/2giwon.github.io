// 할 일 파일(personal-docs/todo/tasks.json) 읽기, 오늘 할 일 계산, 바꾸기. 화면과 무관한 순수 로직이다.
// 용어는 personal-docs/2giwon.github.io/terminology.md (할 일, 할 날, 오늘 할 일, 이월, 나중에, 단계)

export const TASKS_REPO = 'personal-docs';
export const TASKS_PATH = 'todo/tasks.json';

/** 단계: 앞에 있을수록 위로 간다 */
export const STAGES = ['urgent', 'normal', 'relaxed'];
export const STAGE_LABEL = { urgent: '긴급', normal: '보통', relaxed: '여유' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOr = (v, fallback = null) => (typeof v === 'string' && DATE_RE.test(v) ? v : fallback);
const numOr = (v) => (Number.isInteger(v) ? v : null);
const strOr = (v) => (typeof v === 'string' ? v : '');

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = strOr(raw.title).trim();
  if (!Number.isInteger(raw.id) || !title) return null;
  return {
    id: raw.id,
    title,
    stage: STAGES.includes(raw.stage) ? raw.stage : 'normal',
    doOn: dateOr(raw.doOn),
    status: raw.status === 'done' ? 'done' : 'todo',
    project: strOr(raw.project),
    due: dateOr(raw.due),
    note: strOr(raw.note),
    createdOn: dateOr(raw.createdOn),
    doneOn: dateOr(raw.doneOn),
    redmine: numOr(raw.redmine),
    sheetRow: numOr(raw.sheetRow),
  };
}

/**
 * 할 일 파일 글을 읽는다. 할 일 하나가 깨졌으면 그 줄만 빼고, 파일 모양이 틀리면 형식 오류.
 * @returns {{ok:true, data:{version:number, nextId:number, tasks:object[]}} | {ok:false, error:string}}
 */
export function parseTasks(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다' };
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) {
    return { ok: false, error: 'tasks 목록이 없습니다' };
  }
  const tasks = raw.tasks.map(normalize).filter(Boolean);
  const maxId = tasks.reduce((m, t) => Math.max(m, t.id), 0);
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1;
  return { ok: true, data: { version: 1, nextId, tasks } };
}

/** 빈 할 일 파일 (파일이 아직 없을 때 첫 추가에 쓴다) */
export const emptyTasks = () => ({ version: 1, nextId: 1, tasks: [] });

function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/**
 * 첫 화면에 보여 줄 세 묶음.
 * - today: 끝나지 않았고 할 날이 오늘이거나 지난 것. 단계순, 같은 단계는 파일 순서. carryDays = 이월 일수
 * - doneToday: 오늘 끝낸 것
 * - later: 할 날이 없는 끝나지 않은 것(파일 순서)
 */
export function todayView(tasks, today) {
  const t0 = dayNumber(today);
  const open = tasks.filter((t) => t.status !== 'done');
  const due = open
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.doOn && dayNumber(task.doOn) <= t0)
    .sort((a, b) => STAGES.indexOf(a.task.stage) - STAGES.indexOf(b.task.stage) || a.index - b.index)
    .map(({ task }) => ({ task, carryDays: t0 - dayNumber(task.doOn) }));
  return {
    today: due,
    doneToday: tasks.filter((t) => t.status === 'done' && t.doneOn === today),
    later: open.filter((t) => !t.doOn),
  };
}

function replaceTask(data, id, change) {
  const i = data.tasks.findIndex((t) => t.id === id);
  if (i < 0) throw new Error(`할 일 ${id} 이(가) 없습니다`);
  const tasks = data.tasks.slice();
  tasks[i] = { ...tasks[i], ...change };
  return { ...data, tasks };
}

/** 끝에 붙인다. 단계 기본 보통, 할 날 기본 오늘(null 이면 나중에). */
export function addTask(data, { title, stage = 'normal', doOn = undefined, project = '' }, today) {
  const clean = strOr(title).trim();
  if (!clean) throw new Error('제목이 비어 있습니다');
  if (!STAGES.includes(stage)) throw new Error(`모르는 단계: ${stage}`);
  const t = normalize({
    id: data.nextId,
    title: clean,
    stage,
    doOn: doOn === undefined ? today : doOn,
    status: 'todo',
    project,
    createdOn: today,
  });
  return { ...data, nextId: data.nextId + 1, tasks: [...data.tasks, t] };
}

export const completeTask = (data, id, today) => replaceTask(data, id, { status: 'done', doneOn: today });
export const moveToToday = (data, id, today) => replaceTask(data, id, { doOn: today });
export const moveToLater = (data, id) => replaceTask(data, id, { doOn: null });

export function setStage(data, id, stage) {
  if (!STAGES.includes(stage)) throw new Error(`모르는 단계: ${stage}`);
  return replaceTask(data, id, { stage });
}

/** 랩매니저 할 일인데 Redmine 번호가 없으면 true (시작 전에 티켓과 시트 행을 만들어야 한다) */
export function needsTicket(task) {
  return task.status !== 'done' && /^KP-LABMANAGER/.test(task.project) && task.redmine === null;
}

/** 파일로 쓸 글. 사람이 PC 에서 diff 로 읽기 쉽게 들여쓰기 2칸 */
export const serializeTasks = (data) => `${JSON.stringify(data, null, 2)}\n`;
