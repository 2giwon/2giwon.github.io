// 퇴근 귀가편용 Cloudflare Worker(11-26). 서울시 버스 도착 정보 API 인증키를 숨기고, 작업노트 대신 6211 도착 정보를 받아 준다.
// - 6211 의 회사 앞 정류장(노선 순번 80)과 노들역(83) 두 곳만 돌려준다. 다른 노선, 정류장은 조회할 수 없다
// - 작업노트 주소에서 온 요청만 받는다(인증키 하루 요청 한도를 남이 쓰지 못하게)
// - 같은 결과를 20초 동안 다시 써서 여러 화면이 열려 있어도 요청 수를 아낀다
// 인증키는 Cloudflare 비밀값 SEOUL_BUS_KEY 에 공공데이터포털의 "일반 인증키(Encoding)" 를 그대로 넣는다.

import { handleBoard, createOwnerCache, durableStore, SessionBoard } from './board.mjs';

const ROUTE_ID = '100100289'; // 6211
const STOP_ORD = '80'; // 이촌동두산위브트레지움.한강대우아파트(03215)
const NODEUL_ORD = '83'; // 노들역(20014)
const ALLOWED = ['https://2giwon.github.io', 'http://localhost:5300', 'http://127.0.0.1:5300'];
const CACHE_SEC = 20;
const FIELDS = ['stNm', 'arsId', 'arrmsg1', 'arrmsg2', 'traTime1', 'traTime2', 'vehId1', 'vehId2', 'mkTm'];

let recent = null; // { at, body } 최근 결과(20초)

// 세션 현황판(11-27)은 같은 Worker 의 /board 경로에서 돈다. 작업노트 CSP 에 이 주소가 이미 있어서 주소를 새로 두지 않았다
const ownerCache = createOwnerCache();

const pick = (item) => (item ? Object.fromEntries(FIELDS.map((k) => [k, item[k] ?? null])) : null);

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
  });
}

export { SessionBoard };

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/board') {
      return handleBoard(request, env, { store: durableStore(env), cache: ownerCache, now: Date.now, fetchImpl: fetch });
    }
    const origin = request.headers.get('Origin') ?? '';
    const cors = ALLOWED.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : null;
    if (!cors) return json({ error: '허용하지 않은 주소' }, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return json({ error: 'GET 만 받아요' }, 405, cors);
    if (!env.SEOUL_BUS_KEY) return json({ error: '인증키(SEOUL_BUS_KEY)가 없어요' }, 500, cors);

    // *.workers.dev 주소에서는 Cloudflare 캐시(caches.default)가 동작하지 않는다(리뷰 P2 11-26).
    // 그래서 Worker 메모리에 최근 결과를 20초 들고 있는다. 같은 서버 안에서만 나눠 쓰지만 요청 수를 크게 줄인다
    if (recent && Date.now() - recent.at < CACHE_SEC * 1000) return json(recent.body, 200, cors);

    // 붙여 넣을 때 앞뒤 공백이 섞이면 "등록되지 않은 서비스키"가 난다(11-26 실제로 겪음). Decoding 키(/, = 그대로)를 넣어도 되게 인코딩한다
    const raw = String(env.SEOUL_BUS_KEY).trim();
    const serviceKey = raw.includes('%') ? raw : encodeURIComponent(raw);
    let data;
    try {
      // https 로 부르면 서울시 서버가 응답하지 않는다(11-26 확인). 서울시가 https 를 열면 바꾼다
      const url = `http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRouteAll?serviceKey=${serviceKey}&busRouteId=${ROUTE_ID}&resultType=json`;
      const res = await fetch(url);
      data = await res.json();
    } catch (e) {
      return json({ error: `서울시 API 에 닿지 못했어요 (${String(e?.message ?? e)})` }, 502, cors);
    }
    if (data?.msgHeader?.headerCd !== '0') {
      return json({ error: data?.msgHeader?.headerMsg ?? data?.message ?? '서울시 API 오류' }, 502, cors);
    }
    const items = data?.msgBody?.itemList ?? [];
    const stopItem = items.find((i) => String(i.staOrd) === STOP_ORD);
    const body = {
      fetchedAt: new Date().toISOString(),
      // 서울시가 이 도착 예측을 만든 시각(한국 시각). 화면이 이 시각부터 지난 만큼 남은 시간을 줄인다(11-27)
      mkTm: stopItem?.mkTm ?? null,
      stop: pick(items.find((i) => String(i.staOrd) === STOP_ORD)),
      nodeul: pick(items.find((i) => String(i.staOrd) === NODEUL_ORD)),
    };
    recent = { at: Date.now(), body };
    return json(body, 200, cors);
  },
};
