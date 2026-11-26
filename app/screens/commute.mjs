// 상태판 옆 칸 맨 위 "귀가편 6211"(11-26 사용자 요청). 계산은 commute.mjs, 실시간 정보는 Cloudflare Worker.
// - 평일 17:00~18:00: 30초마다 자동으로 받는다(화면이 안 보이는 동안은 쉬고, 돌아오면 바로 받는다)
// - 18:00 뒤: "지금 확인" 버튼을 눌러야 받는다
// - 17:00 전과 주말: 칸을 숨긴다(30초마다 시각만 다시 보고, 17:00 이 되면 저절로 나타난다)

import { h, skeleton, failure } from '../dom.mjs';
import { BUS_API, commuteMode, catchableBus, homePlan, ROUTE } from '../commute.mjs';

const TICK_MS = 30_000;
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const minText = (sec) => (sec < 60 ? '1분 안에' : `${Math.round(sec / 60)}분 뒤`);

/** Worker 에서 받는다. 실패하면 이유를 담아 throw */
async function fetchBus(fetchFn = fetch) {
  let res;
  try {
    res = await fetchFn(BUS_API, { cache: 'no-store' });
  } catch {
    throw new Error('인터넷 연결을 확인해 주세요');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `서버 오류 ${res.status}`);
  return body;
}

export function commuteCard() {
  const body = h('div', { class: 'cm-body' });
  const checkBtn = h('button', { type: 'button', class: 'cm-check', onclick: () => void load() }, '지금 확인');
  const foot = h('div', { class: 'cm-foot' });
  const card = h(
    'section',
    { class: 'side-card cm', 'aria-label': '귀가편 6211', hidden: true },
    h('h3', null, '귀가편 6211 ', h('small', null, '회사 앞 정류장')),
    body,
    foot
  );
  let loading = false;
  let lastMode = null;

  function result(data, now) {
    // Worker 가 받은 시각부터 지난 만큼 버스는 이미 다가왔다(리뷰 P2 11-26). 시계가 어긋나 음수면 0
    const fetched = Date.parse(data?.fetchedAt ?? '');
    const ageSec = Number.isFinite(fetched) ? Math.max(0, Math.round((now - fetched) / 1000)) : 0;
    const bus = catchableBus(data?.stop, data?.nodeul, ageSec);
    const plan = homePlan(now, bus);
    const rows = [
      h('div', { class: `cm-row${plan.pick === 'bus' ? ' best' : ''}` }, h('span', null, '6211 → 노들역 → 9호선'), h('b', null, plan.bus ? `집 ${hhmm(plan.bus.homeAt)}` : '모름')),
      h('div', { class: `cm-row${plan.pick === 'subway' ? ' best' : ''}` }, h('span', null, '이촌역 → 4호선 → 9호선'), h('b', null, `집 ${hhmm(plan.subway.homeAt)}`)),
    ];
    const lead = bus
      ? h(
          'p',
          { class: 'cm-lead' },
          h('strong', null, `6211 ${minText(bus.waitSec)}`),
          bus.missedFirst ? h('span', null, '앞 버스는 걸어가는 동안 놓쳐요. 다음 버스예요') : null,
          bus.late ? h('span', { class: 'cm-hurry' }, '지금 바로 나가야 탈 수 있어요') : null
        )
      : h('p', { class: 'cm-lead' }, h('strong', null, '탈 수 있는 6211 정보가 없어요'), h('span', null, '운행이 끝났거나 곧 오는 버스를 걸어가는 동안 놓쳐요'));
    const verdict = plan.pick === 'bus'
      ? plan.diffMin === 0 ? '두 길이 비슷해요. 6211 을 타도 돼요' : `6211 이 ${plan.diffMin}분 빨라요`
      : plan.bus ? `지하철이 ${plan.diffMin}분 빨라요` : '지하철로 가세요';
    return [lead, h('div', { class: 'cm-rows' }, rows), h('p', { class: `cm-verdict ${plan.pick}` }, verdict)];
  }

  async function load() {
    if (loading) return;
    if (!BUS_API) {
      body.replaceChildren(h('p', { class: 'side-empty' }, '귀가편 서버(Cloudflare Worker)를 아직 연결하지 않았어요'));
      return;
    }
    loading = true;
    checkBtn.disabled = true;
    // 처음이면 자리만 잡고, 이미 결과가 있으면 그대로 둔 채 받는다(30초마다 깜빡이지 않게)
    if (!body.querySelector('.cm-rows')) body.replaceChildren(skeleton(3));
    try {
      const data = await fetchBus();
      const now = new Date();
      body.replaceChildren(...result(data, now));
      const stamp = h('span', null, `${hhmm(new Date(data.fetchedAt ?? now))} 기준`);
      foot.replaceChildren(...(commuteMode(now) === 'manual' ? [stamp, checkBtn] : [stamp]));
    } catch (e) {
      const sub = new Date(Date.now() + ROUTE.subwayTotalMin * 60_000);
      body.replaceChildren(failure(`6211 도착 정보를 받지 못했어요 (${e.message})`, () => void load()), h('div', { class: 'cm-rows' }, h('div', { class: 'cm-row best' }, h('span', null, '이촌역 → 4호선 → 9호선'), h('b', null, `집 ${hhmm(sub)}`))));
      foot.replaceChildren(...(commuteMode(new Date()) === 'manual' ? [checkBtn] : []));
    } finally {
      loading = false;
      checkBtn.disabled = false;
    }
  }

  function tick() {
    const mode = commuteMode(new Date());
    card.hidden = mode === 'hidden';
    if (mode === 'hidden') {
      lastMode = mode;
      return;
    }
    if (mode === 'manual' && lastMode !== 'manual') {
      // 18:00 이 되면 자동 받기를 멈추고 버튼을 보여 준다. 17시대 결과는 오래된 정보라 지운다(리뷰 P2 11-26)
      body.replaceChildren(h('p', { class: 'side-empty' }, '퇴근할 때 "지금 확인"을 눌러 주세요'));
      foot.replaceChildren(checkBtn);
    }
    lastMode = mode;
    if (mode === 'auto' && !document.hidden) void load();
  }

  // 화면에 붙은 뒤 떨어지면(다른 화면으로 가면) 반복과 탭 전환 알림을 치운다(passes.mjs 와 같은 방식)
  let attached = false;
  const gone = () => {
    if (card.isConnected) attached = true;
    if (!attached || card.isConnected) return false;
    clearInterval(loop);
    document.removeEventListener('visibilitychange', onVisible);
    return true;
  };
  const loop = setInterval(() => {
    if (!gone()) tick();
  }, TICK_MS);
  const onVisible = () => {
    if (!gone() && !document.hidden && commuteMode(new Date()) === 'auto') void load();
  };
  document.addEventListener('visibilitychange', onVisible);
  setTimeout(gone, 0);
  tick();
  return card;
}
