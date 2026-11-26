// 귀가편 6211(11-26 사용자 요청, #163 11-27 개선). 계산은 commute.mjs, 실시간 정보는 Cloudflare Worker.
// "서울 지금" 시계 옆에 추천 알약 하나만 둔다(예: "6211 16분 뒤 도착 → 집 18:09"). 알약은 추천 경로의 노선 색으로 칠한다.
// PC 는 마우스를 올리면, 폰은 누르면 알약 아래로 두 경로 비교(드롭다운)가 펼쳐진다. 바깥을 누르거나 Esc 로 닫는다.
// - 평일 17:00~18:00: 30초마다 자동으로 받는다(화면이 안 보이는 동안은 쉬고, 돌아오면 바로 받는다)
// - 18:00 뒤: 알약 자리에 "귀가편 확인" 버튼. 누르면 받는다
// - 17:00 전과 주말: 숨긴다(30초마다 시각만 다시 보고, 17:00 이 되면 저절로 나타난다)

import { h, skeleton, failure } from '../dom.mjs';
import { BUS_API, commuteMode, catchableBus, homePlan, badgeText, waitText, ROUTE } from '../commute.mjs';

const TICK_MS = 30_000;
/** 테스트 스위치: 주소에 ?commute=auto 나 ?commute=manual 을 붙이면 시각과 상관없이 보인다(11-27) */
const FORCED = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('commute') : null;
const modeAt = (d) => commuteMode(d, FORCED);
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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

let seq = 0; // 드롭다운 id 를 겹치지 않게

export function commuteBadge() {
  const id = `cm-drop-${++seq}`;
  const pill = h('button', { type: 'button', class: 'cm-pill loading', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': '귀가편 불러오는 중' });
  const drop = h('div', { class: 'cm-drop', id, role: 'region', 'aria-label': '귀가편 두 경로 비교', hidden: true });
  const wrap = h('div', { class: 'cm', hidden: true }, pill, drop);
  let loading = false;
  let lastMode = null;
  let open = false;

  const setOpen = (v) => {
    open = v;
    drop.hidden = !v;
    pill.setAttribute('aria-expanded', String(v));
  };
  // PC: 마우스를 올리면 열리고 떠나면 닫힌다. 폰과 키보드: 누르면 열고 닫는다
  const hover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
  let closeTimer = null;
  if (hover) {
    wrap.addEventListener('mouseenter', () => {
      clearTimeout(closeTimer);
      setOpen(true);
    });
    // 떠나도 0.2초 기다렸다 닫는다. 그 사이 다시 들어오면 그대로 열어 둔다(codex P2 11-27)
    wrap.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => setOpen(false), 200);
    });
  }
  pill.addEventListener('click', (e) => {
    if (pill.classList.contains('manual')) return void load(true);
    // 마우스로 누르면 올리는 순간 이미 열려 있어서 "닫기"가 되면 누르자마자 닫혀 버린다. 그래서 마우스는 늘 열기.
    // 키보드(Enter, Space)로 누르면 e.detail 이 0 이다. 키보드와 손가락은 열고 닫기(codex P2 11-27)
    const mouse = hover && e.detail > 0;
    setOpen(mouse ? true : !open);
  });
  const onDocClick = (e) => {
    if (open && !wrap.contains(e.target)) setOpen(false);
  };
  const onKey = (e) => {
    if (open && e.key === 'Escape') {
      setOpen(false);
      pill.focus();
    }
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  function paintPill(cls, text, label = text) {
    pill.className = `cm-pill ${cls}`;
    pill.textContent = text;
    pill.setAttribute('aria-label', label);
  }

  function compare(data, now) {
    // Worker 가 받은 시각부터 지난 만큼 버스는 이미 다가왔다(리뷰 P2 11-26). 시계가 어긋나 음수면 0
    const fetched = Date.parse(data?.fetchedAt ?? '');
    const ageSec = Number.isFinite(fetched) ? Math.max(0, Math.round((now - fetched) / 1000)) : 0;
    const bus = catchableBus(data?.stop, data?.nodeul, ageSec);
    const plan = homePlan(now, bus);
    const b = badgeText(plan, bus);
    paintPill(`${b.tone}${b.hurry ? ' hurry' : ''}`, b.text, `귀가편 추천: ${b.text}. 누르면 두 경로 비교`);
    const lead = bus
      ? h(
          'p',
          { class: 'cm-lead' },
          h('strong', null, `6211 ${waitText(bus.waitSec)}`),
          bus.missedFirst ? h('span', null, '앞 버스는 걸어가는 동안 놓쳐요. 다음 버스예요') : null,
          bus.late ? h('span', { class: 'cm-hurry' }, '지금 바로 나가야 탈 수 있어요') : null
        )
      : h('p', { class: 'cm-lead' }, h('strong', null, '탈 수 있는 6211 이 없어요'), h('span', null, '운행이 끝났거나 곧 오는 버스를 걸어가는 동안 놓쳐요'));
    const verdict =
      plan.pick === 'bus'
        ? plan.diffMin === 0
          ? '두 길이 비슷해요. 6211 을 타도 돼요'
          : `6211 이 ${plan.diffMin}분 빨라요`
        : plan.bus
          ? `지하철이 ${plan.diffMin}분 빨라요`
          : '지하철로 가세요';
    return [
      lead,
      h(
        'div',
        { class: 'cm-rows' },
        h('div', { class: `cm-row bus${plan.pick === 'bus' ? ' best' : ''}` }, h('span', null, '6211 → 노들역 → 9호선'), h('b', null, plan.bus ? `집 ${hhmm(plan.bus.homeAt)}` : '모름')),
        h('div', { class: `cm-row subway${plan.pick === 'subway' ? ' best' : ''}` }, h('span', null, '이촌역 → 4호선 → 9호선'), h('b', null, `집 ${hhmm(plan.subway.homeAt)}`))
      ),
      h('p', { class: `cm-verdict ${plan.pick}` }, verdict),
      h(
        'p',
        { class: 'cm-foot' },
        h('span', null, `${hhmm(new Date(data?.fetchedAt ?? now))} 기준, 회사 앞 정류장`),
        // 18:00 뒤에는 자동으로 받지 않으니 다시 받는 버튼을 둔다
        modeAt(now) === 'manual' ? h('button', { type: 'button', class: 'cm-check', onclick: () => void load(true) }, '다시 확인') : null
      ),
    ];
  }

  async function load(openAfter = false) {
    if (loading) return;
    if (!BUS_API) {
      paintPill('fail', '귀가편 연결 전');
      drop.replaceChildren(h('p', { class: 'side-empty' }, '귀가편 서버(Cloudflare Worker)를 아직 연결하지 않았어요'));
      return;
    }
    loading = true;
    // 처음이면 알약 모양 회색 막대로 자리만 잡는다. 이미 결과가 있으면 그대로 둔 채 받는다(30초마다 깜빡이지 않게)
    if (!drop.querySelector('.cm-rows')) {
      paintPill('loading', '', '귀가편 불러오는 중');
      drop.replaceChildren(skeleton(3));
    }
    try {
      drop.replaceChildren(...compare(await fetchBus(), new Date()));
    } catch (e) {
      paintPill('fail', '6211 정보를 못 받았어요', `귀가편: 6211 정보를 못 받았어요 (${e.message}). 누르면 자세히`);
      const sub = new Date(Date.now() + ROUTE.subwayTotalMin * 60_000);
      drop.replaceChildren(
        failure(`6211 도착 정보를 받지 못했어요 (${e.message})`, () => void load(true)),
        h('div', { class: 'cm-rows' }, h('div', { class: 'cm-row subway best' }, h('span', null, '이촌역 → 4호선 → 9호선'), h('b', null, `집 ${hhmm(sub)}`)))
      );
    } finally {
      loading = false;
      if (openAfter) setOpen(true);
    }
  }

  function tick() {
    const mode = modeAt(new Date());
    wrap.hidden = mode === 'hidden';
    if (mode === 'hidden') {
      setOpen(false);
      lastMode = mode;
      return;
    }
    if (mode === 'manual' && lastMode !== 'manual') {
      // 18:00 이 되면 자동 받기를 멈추고 "귀가편 확인" 버튼으로 바꾼다. 17시대 결과는 오래된 정보라 지운다(리뷰 P2 11-26)
      setOpen(false);
      paintPill('manual', '귀가편 확인', '귀가편 확인: 누르면 6211 도착 정보를 받아요');
      drop.replaceChildren();
    }
    lastMode = mode;
    if (mode === 'auto' && !document.hidden) void load();
  }

  // 화면에 붙은 뒤 떨어지면(다른 화면으로 가면) 반복과 문서 알림을 치운다(passes.mjs 와 같은 방식)
  let attached = false;
  const gone = () => {
    if (wrap.isConnected) attached = true;
    if (!attached || wrap.isConnected) return false;
    clearInterval(loop);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    return true;
  };
  const loop = setInterval(() => {
    if (!gone()) tick();
  }, TICK_MS);
  const onVisible = () => {
    if (!gone() && !document.hidden && modeAt(new Date()) === 'auto') void load();
  };
  document.addEventListener('visibilitychange', onVisible);
  setTimeout(gone, 0);
  tick();
  return wrap;
}
