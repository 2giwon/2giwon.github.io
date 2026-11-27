// 귀가편 6211(11-26 사용자 요청, #163 11-27 개선, 11-27 그림 타일). 계산은 commute.mjs, 실시간 정보는 Cloudflare Worker.
// "서울 지금" 시계 옆에 공항 안내 표지 같은 그림 타일 하나만 둔다. 6211 이 빠르면 초록 버스, 지하철이 빠르면 하늘색 지하철.
// 버스 타일 구석에는 남은 분 배지. PC 는 마우스를 올리면, 폰은 누르면 타일 아래로 자세한 내용(드롭다운)이 펼쳐진다.
// 드롭다운: 한 줄 요약, 이번 버스와 다음 버스 도착, 두 경로 집 도착 비교. 남은 시간은 10초마다 다시 계산해 줄어든다(11-27 도착 오차 개선).
// - 평일 17:00~18:00: 30초마다 자동으로 받는다(화면이 안 보이는 동안은 쉬고, 돌아오면 바로 받는다)
// - 18:00 뒤: 회색 버스에 "?" 배지. 누르면 받는다
// - 17:00 전과 주말: 숨긴다(30초마다 시각만 다시 보고, 17:00 이 되면 저절로 나타난다)
// - 테스트 스위치: 주소에 ?commute=auto 나 ?commute=manual 을 붙이면 시각과 상관없이 보인다

import { h, skeleton, failure } from '../dom.mjs';
import { vehicleSvg } from '../icons.mjs';
import { BUS_API, commuteMode, catchableBus, homePlan, badgeText, waitText, dataAgeSec, busList, staleText, ROUTE } from '../commute.mjs';

const TICK_MS = 30_000;
const REPAINT_MS = 10_000; // 받은 정보로 남은 시간만 다시 계산하는 간격
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
  const icon = h('span', { class: 'cm-icon', html: vehicleSvg('bus') });
  const badge = h('span', { class: 'cm-badge' });
  const tile = h('button', { type: 'button', class: 'cm-tile loading', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': '귀가편 불러오는 중' }, icon, badge);
  const drop = h('div', { class: 'cm-drop', id, role: 'region', 'aria-label': '귀가편 자세히', hidden: true });
  const wrap = h('div', { class: 'cm', hidden: true }, tile, drop);
  let loading = false;
  let lastMode = null;
  let open = false;
  let lastData = null; // 마지막으로 받은 정보. 10초마다 이것으로 남은 시간을 다시 계산한다

  const setOpen = (v) => {
    open = v;
    drop.hidden = !v;
    tile.setAttribute('aria-expanded', String(v));
  };
  // PC: 마우스를 올리면 열리고 떠나면 0.2초 뒤 닫힌다(틈을 지나는 동안 닫히지 않게, codex P2 11-27). 폰과 키보드: 누르면 열고 닫기
  const hover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
  let closeTimer = null;
  if (hover) {
    wrap.addEventListener('mouseenter', () => {
      clearTimeout(closeTimer);
      setOpen(true);
    });
    wrap.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => setOpen(false), 200);
    });
  }
  tile.addEventListener('click', (e) => {
    if (tile.classList.contains('manual')) return void load(true);
    // 마우스로 누르면 올리는 순간 이미 열려 있어 "닫기"가 되면 바로 닫혀 버린다. 키보드(e.detail 0)와 손가락은 열고 닫기(codex P2 11-27)
    setOpen(hover && e.detail > 0 ? true : !open);
  });
  const onDocClick = (e) => {
    if (open && !wrap.contains(e.target)) setOpen(false);
  };
  const onKey = (e) => {
    if (open && e.key === 'Escape') {
      setOpen(false);
      tile.focus();
    }
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  /** 타일 모양. kind: bus, subway, manual, fail, loading */
  function paintTile(kind, { badgeText: b = '', label, hurry = false } = {}) {
    tile.className = `cm-tile ${kind}${hurry ? ' hurry' : ''}`;
    icon.innerHTML = vehicleSvg(kind === 'subway' ? 'subway' : 'bus');
    badge.textContent = b;
    badge.hidden = !b;
    tile.setAttribute('aria-label', label);
  }

  function render(data, now) {
    const ageSec = dataAgeSec(data, now);
    const bus = catchableBus(data?.stop, data?.nodeul, ageSec);
    const b = badgeText(homePlan(now, bus), bus);
    const stale = staleText(ageSec);
    paintTile(b.tone, {
      badgeText: b.tone === 'bus' ? `${Math.max(1, Math.round(bus.waitSec / 60))}분` : '',
      label: `귀가편 추천: ${b.text}${stale ? `, ${stale}` : ''}. 누르면 자세히`,
      hurry: b.hurry,
    });
    // 이번 버스와 다음 버스(11-27 사용자 요청). 계산에 쓴 버스에 "탈 버스", 걸어가는 동안 올 버스에 "놓칠 수 있어요"
    const list = busList(data?.stop, ageSec);
    const chosen = bus ? (bus.missedFirst ? 2 : 1) : null;
    const plan = homePlan(now, bus);
    const arrivals = h(
      'ul',
      { class: 'cm-buses' },
      list.map((x) =>
        h(
          'li',
          { class: x.order === chosen ? 'chosen' : '' },
          h('span', { class: 'cm-bus-name' }, x.order === 1 ? '이번 6211' : '다음 6211'),
          h('b', null, x.gone ? '지나갔을 수 있어요' : x.sec === null ? '정보 없음' : `${waitText(x.sec)} (${hhmm(new Date(now.getTime() + x.sec * 1000))})`),
          x.order === chosen ? h('span', { class: `cm-tag ${plan.pick === 'bus' ? 'go' : 'if'}` }, plan.pick === 'bus' ? '탈 버스' : '6211 이면 이 버스') : x.sec !== null && !x.catchable ? h('span', { class: 'cm-tag miss' }, '걸어가면 놓칠 수 있어요') : null
        )
      )
    );
    const verdict =
      plan.pick === 'bus'
        ? plan.diffMin === 0
          ? '두 길이 비슷해요. 6211 을 타도 돼요'
          : `6211 이 ${plan.diffMin}분 빨라요`
        : plan.bus
          ? `지하철이 ${plan.diffMin}분 빨라요`
          : '지하철로 가세요';
    const hurry = bus?.late && plan.pick === 'bus' ? [h('p', { class: 'cm-hurry' }, '지금 바로 나가야 탈 수 있어요')] : [];
    drop.replaceChildren(
      h('p', { class: `cm-summary ${b.tone}` }, b.text),
      ...hurry,
      arrivals,
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
        h('span', { class: stale ? 'cm-stale' : '' }, stale ?? `${hhmm(new Date(now.getTime() - ageSec * 1000))} 서울시 정보 기준`),
        // 18:00 뒤에는 자동으로 받지 않으니 다시 받는 버튼을 둔다. 오래된 정보일 때도 다시 받게
        modeAt(now) === 'manual' || stale ? h('button', { type: 'button', class: 'cm-check', onclick: () => void load(true) }, '다시 확인') : null
      )
    );
  }

  async function load(openAfter = false) {
    if (loading) return;
    if (!BUS_API) {
      paintTile('fail', { badgeText: '!', label: '귀가편 서버를 아직 연결하지 않았어요' });
      drop.replaceChildren(h('p', { class: 'side-empty' }, '귀가편 서버(Cloudflare Worker)를 아직 연결하지 않았어요'));
      return;
    }
    loading = true;
    // 처음이면 같은 크기 회색 타일로 자리만 잡는다. 이미 결과가 있으면 그대로 둔 채 받는다(30초마다 깜빡이지 않게)
    if (!lastData) {
      paintTile('loading', { label: '귀가편 불러오는 중' });
      drop.replaceChildren(skeleton(3));
    }
    try {
      lastData = await fetchBus();
      render(lastData, new Date());
    } catch (e) {
      lastData = null;
      paintTile('fail', { badgeText: '!', label: `귀가편: 6211 정보를 못 받았어요 (${e.message}). 누르면 자세히` });
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
      // 18:00 이 되면 자동 받기를 멈추고 "?" 타일로 바꾼다. 17시대 결과는 오래된 정보라 지운다(리뷰 P2 11-26)
      setOpen(false);
      lastData = null;
      paintTile('manual', { badgeText: '?', label: '귀가편 확인: 누르면 6211 도착 정보를 받아요' });
      drop.replaceChildren();
    }
    lastMode = mode;
    if (mode === 'auto' && !document.hidden) void load();
  }

  // 남은 시간이 줄어들게 10초마다 다시 계산한다. 드롭다운 안 버튼에 초점이 있으면 건너뛴다(다시 그리면 초점이 사라진다)
  const repaint = setInterval(() => {
    if (!lastData || loading || wrap.hidden || drop.contains(document.activeElement)) return;
    render(lastData, new Date());
  }, REPAINT_MS);

  // 화면에 붙은 뒤 떨어지면(다른 화면으로 가면) 반복과 문서 알림을 치운다(passes.mjs 와 같은 방식)
  let attached = false;
  const gone = () => {
    if (wrap.isConnected) attached = true;
    if (!attached || wrap.isConnected) return false;
    clearInterval(loop);
    clearInterval(repaint);
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
