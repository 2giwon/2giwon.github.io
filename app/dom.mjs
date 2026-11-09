// 작은 DOM 도우미. 데이터는 글자(textContent)로만 넣는다. html 속성은 안전하게 만든 HTML(문서 본문, Mermaid 그림)에만 쓴다.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/** 로딩 자리. 값이 와도 화면이 밀리지 않게 높이를 정해 둔다. */
export function skeleton(lines = 3, cls = '') {
  return h('div', { class: `skeleton ${cls}`, 'aria-label': '불러오는 중' }, Array.from({ length: lines }, () => h('span')));
}

/** 실패 자리. 비어 보이지 않게 이유와 다시 시도를 보여 준다. */
export function failure(message, retry) {
  return h(
    'div',
    { class: 'failure', role: 'alert' },
    h('span', null, message),
    retry ? h('button', { type: 'button', class: 'link', onclick: retry }, '다시 시도') : null
  );
}

export function empty(message) {
  return h('div', { class: 'empty' }, message);
}

export const ERROR_TEXT = {
  unauthorized: '토큰이 만료됐거나 잘못됐습니다',
  forbidden: '이 저장소를 읽을 권한이 없습니다',
  not_found: '저장소를 찾지 못했습니다(토큰에 이 저장소 권한이 없을 때도 이렇게 보입니다)',
  rate_limited: 'GitHub 요청 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요',
  network: '네트워크에 연결되지 않았습니다',
  unknown: '알 수 없는 오류가 났습니다',
};

export function errorText(e) {
  return ERROR_TEXT[e?.kind] ?? ERROR_TEXT.unknown;
}

export function koDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일`;
}
