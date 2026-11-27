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
  // 귀가편 그림 타일(11-27 사용자 요청: 옆모습 단색 실루엣). 오른쪽이 앞. 창문은 몸통을 뚫어(evenodd) 타일 바탕색이 보이고,
  // 바퀴 자리는 몸통을 둥글게 파내 바퀴가 또렷하게 떨어져 보인다
  bus:
    '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M3.4 5.5H20q2.6 0 2.6 2.6V16h-2.3a2.8 2.8 0 0 0-5.6 0H9.3a2.8 2.8 0 0 0-5.6 0H1.4V7.5q0-2 2-2zM3.4 8h3v3.4h-3zM7.6 8h3v3.4h-3zM11.8 8h3v3.4h-3zM16 8h2.2v3.4H16zM19.4 8h1.9v5h-1.9z"/><circle cx="6.5" cy="16.4" r="2.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="16.4" r="2.1" fill="currentColor" stroke="none"/>',
  // 지하철 옆모습: 둥근 앞코, 창문 줄, 바퀴 네 개, 선로
  subway:
    '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M2.6 5.5H17q5.4 0 5.4 5.6V15.5H1.4V6.7q0-1.2 1.2-1.2zM3.6 8h3v3h-3zM7.8 8h3v3h-3zM12 8h3v3h-3zM16.4 8h2.4q1.6.3 2.2 3h-4.6z"/><circle cx="4.6" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.4" cy="17" r="1.3" fill="currentColor" stroke="none"/><path d="M1 19.6h22" stroke-width="1.6"/>',
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
