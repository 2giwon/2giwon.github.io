// 상태판 출발 안내판의 디지털 시계(11-26 사용자 요청). 숫자는 막대 7개(7세그먼트)로 그리고,
// 가운데 : 는 1초마다 깜빡인다. 꺼진 막대도 아주 흐리게 남겨 실제 전광판처럼 보이게 한다.
// 계산(어느 막대를 켤지, 지금 몇 시인지)은 순수 함수, 그리기는 digitalClock() 이 한다.

/** 숫자마다 켜는 막대. a 위, b 오른쪽 위, c 오른쪽 아래, d 아래, e 왼쪽 아래, f 왼쪽 위, g 가운데 */
export const SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

const pad = (n) => String(n).padStart(2, '0');

/** 24시간제 네 자리(HHMM) */
export const clockDigits = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}`;

/** 가운데 : 는 짝수 초에 켜진다 */
export const colonOn = (d) => d.getSeconds() % 2 === 0;

/** 다음 초가 바뀌는 순간까지 남은 밀리초. 깜빡임을 실제 초에 맞춘다 */
export const msToNextSecond = (d) => 1000 - d.getMilliseconds();

// 막대 모양(가로 14, 세로 24 칸). 끝을 비스듬히 깎아 전광판 막대처럼 보이게 한다
const SHAPES = {
  a: '3,1 11,1 12,2 11,3 3,3 2,2',
  b: '12,3 13,4 13,10.5 12,11.5 11,10.5 11,4',
  c: '12,12.5 13,13.5 13,20 12,21 11,20 11,13.5',
  d: '3,21 11,21 12,22 11,23 3,23 2,22',
  e: '2,12.5 3,13.5 3,20 2,21 1,20 1,13.5',
  f: '2,3 3,4 3,10.5 2,11.5 1,10.5 1,4',
  g: '3,11 11,11 12,12 11,13 3,13 2,12',
};

/** 숫자 하나를 그린 SVG 글자(이 파일이 만든 고정 모양만 쓴다) */
export function digitSvg(digit) {
  const on = SEGMENTS[digit] ?? '';
  const polys = Object.entries(SHAPES)
    .map(([k, pts]) => `<polygon points="${pts}" class="seg${on.includes(k) ? ' on' : ''}"/>`)
    .join('');
  return `<svg viewBox="0 0 14 24" aria-hidden="true" focusable="false">${polys}</svg>`;
}

/**
 * 디지털 시계 요소. 1초마다(실제 초에 맞춰) 숫자와 : 를 바꾼다. 화면에서 떨어지면(다른 화면으로 가면) 스스로 멈춘다.
 * @param {(tag:string, props?:object, ...children:any[]) => HTMLElement} h dom.mjs 의 h
 */
export function digitalClock(h, now = () => new Date()) {
  const digits = [0, 1, 2, 3].map(() => h('span', { class: 'dc-digit' }));
  const colon = h('span', { class: 'dc-colon', 'aria-hidden': 'true' }, h('i'), h('i'));
  const el = h('time', { class: 'dc', role: 'timer', 'aria-live': 'off' }, digits[0], digits[1], colon, digits[2], digits[3]);
  let shown = '';
  const draw = () => {
    const d = now();
    const s = clockDigits(d);
    if (s !== shown) {
      [...s].forEach((c, i) => (digits[i].innerHTML = digitSvg(c)));
      el.setAttribute('aria-label', `지금 ${s.slice(0, 2)}시 ${s.slice(2)}분`);
      el.dateTime = `${s.slice(0, 2)}:${s.slice(2)}`;
      shown = s;
    }
    colon.classList.toggle('off', !colonOn(d));
  };
  // 처음 그리기와 1초마다 다시 그리기를 나눈다. 다시 그릴 때 화면에서 떨어져 있으면(다른 화면으로 갔으면) 멈춘다.
  // 처음 그리기는 화면에 붙기 전이라 붙었는지로 판단하면 타이머가 멈추지 않았다(codex P2 11-26)
  const tick = () => {
    if (!el.isConnected) return;
    draw();
    setTimeout(tick, msToNextSecond(now()));
  };
  draw();
  setTimeout(tick, msToNextSecond(now()));
  return el;
}
