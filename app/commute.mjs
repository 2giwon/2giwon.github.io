// 퇴근 귀가편(11-26 사용자 요청). 회사 앞 정류장에 6211 이 언제 오는지 실시간으로 보고,
// "6211 → 노들역 → 9호선" 과 "이촌역 → 4호선 → 동작역 → 9호선" 중 집에 먼저 닿는 쪽을 고른다.
// 구간 시간은 예전 퇴근 분석(2giwon.github.io/commute, 10-14)의 값이다. 결정 기록: personal-docs/2giwon.github.io/decisions.md
// 계산만 둔다(Node 테스트가 그대로 불러온다). 실시간 정보는 Cloudflare Worker(worker/bus-6211.js)가 대신 받아 준다.

/** Worker 주소(worker/bus-6211.js 를 giwon-note.workers.dev 에 올린 것). 비우면 화면이 "아직 연결 전"으로 알린다 */
export const BUS_API = 'https://bus-6211.giwon-note.workers.dev';

/** 회사 앞 정류장(이촌동두산위브트레지움.한강대우아파트, 03215)과 3정거장 뒤 노들역(20014). 6211 노선 순번 */
export const STOP_ORD = 80;
export const NODEUL_ORD = 83;

/** 분 단위. 예전 분석 값(평소 기준). 버스 구간은 실시간으로 계산하고, 못 하면 버스 8분 + 퇴근 정체 약 7분 */
export const ROUTE = {
  walkToStopMin: 3,
  busRideFallbackMin: 15,
  nodeulTransferMin: 5, // 노들역 정류장 → 1번 출구 → 9호선 승강장
  line9WaitMin: 3, // 9호선 일반열차 기다림(평균)
  line9RideMin: 24, // 노들 → 증미 10개 역, 22~25분
  walkHomeMin: 7, // 증미역 4번 출구 → 집
  subwayTotalMin: 60, // 이촌역까지 걸어서 → 4호선 → 동작역 → 9호선 → 증미역 → 집
};

const MIN = 60_000;

const MODES = ['auto', 'manual', 'hidden'];

/**
 * 평일 17:00~18:00 자동(30초마다), 18:00 뒤 버튼, 17:00 전과 주말은 숨김(사용자 결정 11-26).
 * forced: 테스트 스위치. 주소에 ?commute=auto 나 ?commute=manual 을 붙이면 시각과 상관없이 그 모드(11-27 사용자 요청)
 */
export function commuteMode(now, forced = null) {
  if (MODES.includes(forced)) return forced;
  const day = now.getDay();
  if (day === 0 || day === 6) return 'hidden';
  const t = now.getHours() * 60 + now.getMinutes();
  if (t < 17 * 60) return 'hidden';
  return t < 18 * 60 ? 'auto' : 'manual';
}

/** 도착까지 남은 초. 운행종료, 출발대기, 숫자가 없으면 모름(null) */
export function busSeconds(msg, traTime) {
  if (/운행종료|출발대기|회차|정보없음/.test(String(msg ?? ''))) return null;
  const s = String(traTime ?? '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/**
 * 걸어서 정류장에 닿기 전에 오는 버스는 못 탄다. 탈 수 있는 첫 버스와, 같은 차량이 노들역에 닿는 데 걸리는 시간.
 * late = 지금 바로 나가야 탈 수 있다(걸어가는 시간 + 2분 안에 도착)
 * @returns {{waitSec:number, rideSec:number, vehId:string|null, missedFirst:boolean, late:boolean} | null}
 */
export function catchableBus(stop, nodeul, ageSec = 0) {
  const walk = ROUTE.walkToStopMin * 60;
  for (const n of [1, 2]) {
    const raw = busSeconds(stop?.[`arrmsg${n}`], stop?.[`traTime${n}`]);
    // ageSec: Worker 가 받은 뒤 지난 시간. 그만큼 버스는 이미 다가왔다(리뷰 P2 11-26). 버스 구간 길이(rideSec)는 그대로
    const sec = raw === null ? null : raw - ageSec;
    if (sec === null || sec < walk) continue;
    const veh = stop?.[`vehId${n}`] ?? null;
    let rideSec = ROUTE.busRideFallbackMin * 60;
    for (const m of [1, 2]) {
      const at = busSeconds(nodeul?.[`arrmsg${m}`], nodeul?.[`traTime${m}`]);
      if (veh && nodeul?.[`vehId${m}`] === veh && at !== null && at > raw) rideSec = at - raw;
    }
    return { waitSec: sec, rideSec, vehId: veh, missedFirst: n === 2, late: sec <= walk + 120 };
  }
  return null;
}

/**
 * 두 경로의 집 도착 예상 시각과 추천. bus 가 null 이면(6211 정보 없음) 지하철.
 * @returns {{bus:{boardAt:Date, homeAt:Date}|null, subway:{homeAt:Date}, pick:'bus'|'subway', diffMin:number}}
 */
/**
 * 정보가 만들어진 뒤 지난 초. 서울시 API 의 도착 예측은 서울시가 정보를 만든 시각(mkTm, 한국 시각 "YYYY-MM-DD HH:MM:SS.0") 기준이다.
 * 그 값이 없으면 Worker 가 받은 시각(fetchedAt). 모르거나 미래면 0 (11-27 도착 오차 개선)
 */
export function dataAgeSec(data, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(String(data?.mkTm ?? ''));
  const base = m
    ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]) // 한국 시각(UTC+9) → 기준 시각
    : Date.parse(data?.fetchedAt ?? '');
  if (!Number.isFinite(base)) return 0;
  return Math.max(0, Math.round((now - base) / 1000));
}

/**
 * 이번 버스와 다음 버스(11-27 사용자 요청). 지난 시간만큼 줄인 남은 초와, 걸어가서 탈 수 있는지.
 * 예측 시각이 지났으면 gone(지나갔을 수 있음)으로 표시하고 sec 는 null. "1분 안에"로 계속 남지 않게(codex P2 11-27)
 * @returns {{order:1|2, sec:number|null, catchable:boolean, gone:boolean}[]}
 */
export function busList(stop, ageSec = 0) {
  return [1, 2].map((order) => {
    const raw = busSeconds(stop?.[`arrmsg${order}`], stop?.[`traTime${order}`]);
    const left = raw === null ? null : raw - ageSec;
    const gone = left !== null && left < 0;
    const sec = left === null || gone ? null : left;
    return { order, sec, catchable: sec !== null && sec >= ROUTE.walkToStopMin * 60, gone };
  });
}

/** 받은 지 1분 30초가 넘으면 오래된 정보라고 알린다 */
export const staleText = (ageSec) => (ageSec >= 90 ? `${Math.round(ageSec / 60)}분 전 정보` : null);

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** 도착까지 남은 시간 글자. 1분이 안 되면 "1분 안에" */
export const waitText = (sec) => (sec < 60 ? '1분 안에' : `${Math.round(sec / 60)}분 뒤`);

/**
 * 시계 옆 추천 알약(#163, 11-27). 추천 경로, 도착까지 남은 시간, 집 도착 시각을 한 줄로.
 * tone 은 색(bus 지선버스 초록, subway 4호선 하늘색), hurry 는 "지금 바로 나가야 탈 수 있다"(깜빡임)
 */
export function badgeText(plan, bus) {
  if (plan.pick === 'bus' && plan.bus && bus) {
    return { tone: 'bus', text: `6211 ${waitText(bus.waitSec)} 도착 → 집 ${hhmm(plan.bus.homeAt)}`, hurry: !!bus.late };
  }
  return { tone: 'subway', text: `지하철 → 집 ${hhmm(plan.subway.homeAt)}`, hurry: false };
}

export function homePlan(now, bus) {
  const subway = { homeAt: new Date(now.getTime() + ROUTE.subwayTotalMin * MIN) };
  if (!bus) return { bus: null, subway, pick: 'subway', diffMin: 0 };
  const boardAt = new Date(now.getTime() + bus.waitSec * 1000);
  const after = ROUTE.nodeulTransferMin + ROUTE.line9WaitMin + ROUTE.line9RideMin + ROUTE.walkHomeMin;
  const homeAt = new Date(boardAt.getTime() + bus.rideSec * 1000 + after * MIN);
  const diffMin = Math.round((subway.homeAt - homeAt) / MIN);
  return { bus: { boardAt, homeAt }, subway, pick: diffMin >= 0 ? 'bus' : 'subway', diffMin: Math.abs(diffMin) };
}
