// 세션 현황판 계산 (11-27). 맥 메뉴 막대 앱 Claude Usage Bar 가 Worker /board 로 올린 Claude 세션 목록을 읽는다.
// 읽을 때 작업노트 GitHub 토큰을 같이 보내고, Worker 가 토큰 주인을 GitHub 에 확인한다(세션 제목에 회사 업무 이름이 있어서).
// 줄을 누르면 데스크탑 앱이 그 세션을 연다(claude://code/continue). 이 링크는 맥 브라우저에서만 동작한다.
// 순서, 상태 문구, 하는 일 문구는 메뉴 막대 앱(UsageBarCore/SessionBoard.swift, Strings.swift)과 맞춘다

import { BUS_API } from './commute.mjs';

export const BOARD_URL = `${BUS_API}/board`;
export const STALE_MS = 3 * 60 * 1000; // 맥이 60초마다 올리므로, 3분 넘게 안 오면 맥이 꺼졌거나 앱이 멈춘 것
export const BOARD_TIMEOUT_MS = 8000;

export const KIND_LABEL = { waiting: '답 기다림', working: '일하는 중', review: '확인 필요', done: '끝남' };
const KIND_ORDER = { waiting: 0, working: 1, review: 2, done: 3 };

const ACTIVITY_TEXT = {
  reading: '파일 읽는 중',
  editing: '파일 고치는 중',
  running: '명령 실행 중',
  researching: '찾아보는 중',
  delegating: '서브 에이전트에 맡기는 중',
  planning: '계획 세우는 중',
  tool: '도구 쓰는 중',
};
export const activityText = (activity) => ACTIVITY_TEXT[activity] ?? null;

// 상태별 캐릭터 동작: 일하는 중 타자, 답 기다림 손 흔들기, 확인 필요 서류 들기, 끝남 잠들기
const POSE = { working: 'type', waiting: 'wave', review: 'paper', done: 'sleep' };
export const poseFor = (kind) => POSE[kind] ?? 'sleep';

/**
 * Worker 에서 목록을 받는다. 결과 state:
 * list 목록 / empty 빈 목록 / token 토큰 없음이나 거절(401, 403) / notSent 맥에서 아직 안 보냄(404) / failed 그 밖 실패
 */
export async function loadBoard(fetchImpl, token, { timeoutMs = BOARD_TIMEOUT_MS } = {}) {
  if (!token) return { state: 'token' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ state: 'failed', error: '응답이 너무 늦어요' });
    }, timeoutMs);
  });
  const request = (async () => {
    try {
      const res = await fetchImpl(BOARD_URL, { headers: { Authorization: `Bearer ${token}` }, signal: controller?.signal, cache: 'no-store' });
      if (res.status === 401 || res.status === 403) return { state: 'token' };
      if (res.status === 404) return { state: 'notSent' };
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !Array.isArray(json.rows)) return { state: 'failed', error: json?.error ?? `응답 ${res.status}` };
      return { state: json.rows.length ? 'list' : 'empty', body: json };
    } catch (e) {
      return { state: 'failed', error: String(e?.message ?? e) };
    }
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** 카드에 그릴 값. result 가 없으면 로딩 */
export function boardView(result, now) {
  if (!result) return { state: 'loading' };
  if (result.state !== 'list' && result.state !== 'empty') return { ...result };
  const receivedAt = Date.parse(result.body?.receivedAt ?? '');
  const ageMs = Number.isNaN(receivedAt) ? Infinity : now - receivedAt;
  const stale = ageMs > STALE_MS;
  const minutes = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 60000)) : null;
  return {
    state: result.state,
    rows: sortRows(result.body.rows ?? []),
    stale,
    ageText: stale && minutes !== null ? `맥에서 ${minutes}분 전에 받은 목록이에요` : null,
  };
}

export function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const k = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
    return k !== 0 ? k : Date.parse(b.since) - Date.parse(a.since);
  });
}

/** 데스크탑 앱을 열 수 있는 맥 브라우저인지. 아이패드는 맥처럼 보이지만 터치 지점이 여럿이라 뺀다 */
export function canOpenSessions(nav) {
  return /Macintosh/.test(nav?.userAgent ?? '') && (nav?.maxTouchPoints ?? 0) <= 1;
}

const LOCAL_ID = /^local_[A-Za-z0-9-]{1,64}$/;
export function sessionHref(row, isMac) {
  if (!isMac || !LOCAL_ID.test(row?.id ?? '')) return null;
  return `claude://code/continue?session=${row.id}`;
}

export function sinceText(since, now) {
  const minutes = Math.floor((now - Date.parse(since)) / 60000);
  if (!(minutes >= 1)) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}
