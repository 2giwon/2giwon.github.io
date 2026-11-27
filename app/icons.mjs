// 위 막대 아이콘(11-24). 사이트 CSP 가 밖의 파일을 막아서 SVG 를 여기서 직접 그린다.
// 선 굵기 2, 24칸 격자, 색은 글자색(currentColor)을 따라서 밝은 화면, 어두운 화면 모두 맞는다.

export const ICONS = {
  // 폴더
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  // 새로 고침: 둥근 화살표
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  // 화면 자동: 반쪽이 칠해진 원(기기 설정을 따름)
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  // 화면 밝게: 해
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  // 화면 어둡게: 달
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  // 토큰 지우기: 열쇠와 X
  'key-off': '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l6-6M14 9l2 2"/><path d="M17 15l4 4M21 15l-4 4"/>',
  // Claude 테마: 물감 팔레트(상태판 테마 배너, 11-26)
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="14.5" cy="7" r="1" fill="currentColor"/><circle cx="17" cy="10.5" r="1" fill="currentColor"/>',
};

/**
 * 귀가편 그림(11-27 사용자 요청: 여러 색으로 칠한 납작한 옆모습, 둘레 사각형 없이). 오른쪽이 앞.
 * 버스는 6211 지선버스 초록, 지하철은 흰 몸통에 4호선 하늘색 띠. 64x40 칸에 직접 그린다(사이트 CSP 가 밖의 그림 파일을 막는다)
 */
const VEHICLES = {
  bus: [
    '<ellipse cx="32" cy="37" rx="27" ry="2" fill="#000" opacity=".25"/>',
    '<rect x="9" y="3.5" width="38" height="4" rx="2" fill="#1f8f45"/>', // 지붕 냉방기
    '<path d="M8 6h44q7 0 7 7v15H4V10q0-4 4-4z" fill="#2fbf5b"/>', // 몸통
    '<rect x="4" y="24" width="55" height="5" fill="#1f8f45"/>', // 아랫단
    '<rect x="8" y="10" width="34" height="10" rx="2" fill="#173042"/>', // 창틀
    '<rect x="10" y="11.5" width="6.5" height="7" rx="1" fill="#bfe6ff"/><rect x="18" y="11.5" width="6.5" height="7" rx="1" fill="#bfe6ff"/><rect x="26" y="11.5" width="6.5" height="7" rx="1" fill="#bfe6ff"/><rect x="34" y="11.5" width="6.5" height="7" rx="1" fill="#bfe6ff"/>',
    '<rect x="44" y="10" width="7" height="16" rx="1.5" fill="#173042"/><rect x="45.5" y="11.5" width="4" height="7" rx="1" fill="#bfe6ff"/>', // 문
    '<path d="M53 10h3q2.5 0 2.5 3v6H53z" fill="#bfe6ff"/>', // 앞유리
    '<rect x="56" y="21.5" width="3" height="2.5" rx="1" fill="#ffd84d"/><rect x="4" y="21.5" width="2" height="2.5" fill="#ff5a4f"/>', // 전조등, 뒷등
    '<circle cx="16" cy="29.5" r="5.2" fill="#2b2f36"/><circle cx="16" cy="29.5" r="2.2" fill="#c9ced6"/>',
    '<circle cx="47" cy="29.5" r="5.2" fill="#2b2f36"/><circle cx="47" cy="29.5" r="2.2" fill="#c9ced6"/>',
  ].join(''),
  subway: [
    '<rect x="2" y="35" width="60" height="1.6" rx=".8" fill="#6b7280"/>', // 선로
    '<rect x="8" y="5" width="40" height="3" rx="1.5" fill="#c9ced6"/>', // 지붕
    '<path d="M6 7.5h42q11 0 11 12V28H4V9.5q0-2 2-2z" fill="#f2f4f7"/>', // 몸통(둥근 앞코)
    '<rect x="4" y="22" width="55" height="3.2" fill="#00a5de"/>', // 4호선 하늘색 띠
    '<rect x="8" y="11" width="8" height="7" rx="1.2" fill="#2f7fc1"/><rect x="19" y="11" width="8" height="7" rx="1.2" fill="#2f7fc1"/><rect x="40" y="11" width="6" height="7" rx="1.2" fill="#2f7fc1"/>', // 창
    '<rect x="30" y="10" width="7" height="17" rx="1" fill="#7cc6ee"/><path d="M33.5 10v17" stroke="#f2f4f7" stroke-width=".8"/>', // 문
    '<path d="M50 11h3.5q3.5 1 4.5 7H50z" fill="#2f7fc1"/>', // 앞창
    '<rect x="6" y="28" width="51" height="2.6" fill="#5b616b"/>', // 차체 밑
    '<circle cx="12" cy="32" r="2.4" fill="#2b2f36"/><circle cx="19" cy="32" r="2.4" fill="#2b2f36"/><circle cx="44" cy="32" r="2.4" fill="#2b2f36"/><circle cx="51" cy="32" r="2.4" fill="#2b2f36"/>',
  ].join(''),
};

/** 귀가편 그림 SVG 글자. 모르는 이름이면 빈 글자 */
export function vehicleSvg(name) {
  const body = VEHICLES[name];
  if (!body) return '';
  return `<svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** 아이콘 SVG 글자. 모르는 이름이면 빈 글자(화면이 깨지지 않게). */
export function iconSvg(name) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** 화면 밝기 버튼 아이콘. 지금 고른 값(자동, 밝게, 어둡게)을 보여 준다. */
export function themeIconName(choice) {
  if (choice === 'light') return 'sun';
  if (choice === 'dark') return 'moon';
  return 'auto';
}
