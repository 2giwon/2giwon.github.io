// 작업노트 국제공항(11-26 새 디자인)의 계산. 화면과 무관한 순수 로직이다.
// 용어는 personal-docs/2giwon.github.io/terminology.md (탑승권, 머리띠 상태, 편명, 관제탑 띠)

import { LAB } from './catalog.mjs';
import { koDate } from './dom.mjs';

/** 글자판이 도는 동안 보여 줄 글자들 */
export const FLAP_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FLAP_SPIN = 5; // 첫 글자가 멈추기 전까지 도는 횟수
const FLAP_STAGGER = 3; // 다음 글자는 이만큼 더 돌고 멈춘다(왼쪽부터 차례로 "촤르르")

/**
 * 전광판 글자판이 바뀌는 그림판(프레임) 목록. 글자마다 아무 글자나 돌다가 왼쪽부터 차례로 제 글자에 멈춘다.
 * 마지막 그림판은 늘 목표 글자다. rnd 는 테스트에서 정해진 값을 넣으려고 받는다
 */
export function flapFrames(target, rnd = Math.random) {
  const chars = [...String(target)];
  const total = FLAP_SPIN + FLAP_STAGGER * Math.max(0, chars.length - 1) + 1;
  const frames = [];
  for (let k = 0; k < total; k += 1) {
    frames.push(
      chars
        .map((c, i) => {
          if (k >= FLAP_SPIN + FLAP_STAGGER * i) return c;
          const pool = FLAP_ALPHA.replace(c, ''); // 멈추기 전에는 제 글자가 나오지 않게(멈추는 순간이 또렷하게)
          return pool[Math.floor(rnd() * pool.length) % pool.length];
        })
        .join('')
    );
  }
  frames[frames.length - 1] = chars.join('');
  return frames;
}

/** 관제탑 안내판의 "지금 할 일" 칸. 오늘 할 일 → 최신 핸드오프의 다음 할 일 → 지금 상태 → 소식 없음 */
export function towerNowText({ todayTitle, card, lastDate }) {
  if (todayTitle) return todayTitle;
  if (card?.next?.length) return card.next[0];
  if (card?.state?.length) return card.state[0];
  return lastDate ? `${koDate(lastDate)} 이후 소식 없음` : '소식 없음';
}

const ARRIVED_DAYS = 7;

export const PASS_LABEL = { boarding: '탑승 중', delayed: '지연', waiting: '대기' };
export const TOWER_LABEL = { cancelled: '결항', boarding: '탑승 중', delayed: '지연', arrived: '도착', waiting: '대기', checking: '확인 중' };

const norm = (s) => String(s ?? '').toLowerCase().replace(/[-_.\s]/g, '');

function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/** 편명 앞 두 글자. 랩매니저는 L + 폴더 첫 글자(LM, LW), 나머지는 단어 머리글자 두 개, 한 단어면 앞 두 글자. 프로젝트가 없으면 ET */
export function flightPrefix(project) {
  if (!project) return 'ET';
  if (project.repo === LAB) return `L${(project.folder?.[0] ?? 'X').toUpperCase()}`;
  const words = String(project.folder ?? project.label ?? '')
    .split(/[-_.\s]+/)
    .filter(Boolean);
  if (!words.length) return 'ET';
  const two = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return two.toUpperCase().padEnd(2, 'X');
}

/**
 * 할 일의 project 칸(예: KP-LABMANAGER-MOBILE, video_pipeline)과 상태판 프로젝트를 잇는다.
 * 대소문자와 - _ . 공백을 무시하고 같으면 짝. 랩매니저는 labmanager+폴더, kplabmanager+폴더도 본다. 없으면 null
 */
export function matchProject(taskProject, projects) {
  const key = norm(taskProject);
  if (!key) return null;
  return (
    projects.find((p) => {
      const keys = [norm(p.folder), norm(p.label)];
      if (p.repo === LAB) keys.push(`labmanager${norm(p.folder)}`, `kplabmanager${norm(p.folder)}`);
      return keys.includes(key);
    }) ?? null
  );
}

// 폰 탑승권 더미 넘기기(11-27 사용자: "다음 티켓을 보기가 힘들어", "옆으로 밀면 다음 티켓, 밑에서 위로 올리면 완료").
// 예전에는 옆으로 밀면 바로 탑승 완료(오른쪽)나 나중에(왼쪽)로 처리돼서, 다음 티켓을 보려면 앞 티켓을 처리해야 했다.
// 나중에는 탑승권의 버튼으로만 한다(사용자 결정)

/** 손가락을 이만큼(px) 넘게 밀어야 넘기기나 완료로 친다 */
export const SWIPE_PX = 90;

/** 탑승권 목록 → 맨 앞 티켓(frontId)이 앞에 오게 돌린 목록. 나머지 순서는 그대로, 없는 번호면 처음부터 */
export function stackOrder(passes, frontId) {
  const i = passes.findIndex((p) => p.task.id === frontId);
  return i > 0 ? [...passes.slice(i), ...passes.slice(0, i)] : [...passes];
}

/** 맨 앞 티켓에서 dir(1 다음, -1 이전)만큼 넘긴 티켓 번호. 끝에서는 처음으로 돌아온다. 없는 번호면 처음 티켓에서 센다 */
export function stepFront(passes, frontId, dir) {
  if (!passes.length) return null;
  const i = Math.max(0, passes.findIndex((p) => p.task.id === frontId));
  const n = passes.length;
  return passes[(((i + dir) % n) + n) % n].task.id;
}

/**
 * 손가락이 움직인 거리 → 할 일. 옆으로 더 많이 밀었으면 넘기기(왼쪽 next, 오른쪽 prev),
 * 위로 더 많이 올렸고 탑승권 아래쪽(점선 아래 바코드 부분, lower)을 잡았으면 완료(done). 그 밖은 null.
 * 제목 쪽을 잡고 위아래로 밀면 화면을 스크롤해야 해서 완료로 치지 않는다(사용자 결정 11-27)
 */
export function swipeIntent({ dx, dy, lower }) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx < -SWIPE_PX) return 'next';
    if (dx > SWIPE_PX) return 'prev';
    return null;
  }
  return lower && dy < -SWIPE_PX ? 'done' : null;
}

/**
 * 오늘 할 일(todayView().today) → 탑승권 목록.
 * 머리띠: 맨 앞 한 장은 탑승 중, 이월된 것은 지연, 나머지는 대기. 단계 긴급은 도장(urgent). 편명은 앞 두 글자별로 1부터.
 */
export function boardingPasses(items, projects) {
  const counter = new Map();
  return items.map(({ task, carryDays }, i) => {
    const project = matchProject(task.project, projects);
    const prefix = flightPrefix(project);
    const n = (counter.get(prefix) ?? 0) + 1;
    counter.set(prefix, n);
    return {
      task,
      carryDays,
      project,
      code: `${prefix}${n}`,
      status: i === 0 ? 'boarding' : carryDays > 0 ? 'delayed' : 'waiting',
      urgent: task.stage === 'urgent',
    };
  });
}

/**
 * 관제탑 띠의 프로젝트 상태. 위에서부터 먼저 맞는 것 하나.
 * 결항(멈춤) → 탑승 중(오늘 할 일 있음) → 확인 중(미결을 아직 못 읽음) → 지연(미결 남음) → 도착(7일 안 활동) → 대기
 * @param {{paused:boolean, todayCount:number, hasOpen:boolean|null, lastDate:string|null}} p hasOpen 이 null 이면 아직 읽는 중
 */
export function towerStatus({ paused, todayCount, hasOpen, lastDate }, today) {
  if (paused) return 'cancelled';
  if (todayCount > 0) return 'boarding';
  if (hasOpen === null) return 'checking';
  if (hasOpen) return 'delayed';
  if (lastDate && dayNumber(today) - dayNumber(lastDate) <= ARRIVED_DAYS) return 'arrived';
  return 'waiting';
}
