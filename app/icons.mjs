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
};

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
