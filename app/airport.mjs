// 작업노트 국제공항(11-26 새 디자인)의 계산. 화면과 무관한 순수 로직이다.
// 용어는 personal-docs/2giwon.github.io/terminology.md (탑승권, 머리띠 상태, 편명, 관제탑 띠)

import { LAB } from './catalog.mjs';

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
