// 탑승권 레일 실시간 갱신(11-26 사용자 요청: 할 일이 추가되면 새로 고침 없이 바로 보이게).
// 작업노트는 서버가 없어서 GitHub 이 먼저 알려 주지 못한다. 그래서 화면이 10초마다(처음 20초, 사용자 요청으로 줄임) 할 일 파일을 다시 읽고,
// 파일 지문(sha)이 바뀌었을 때만 다시 그린다. 화면으로 돌아오는 순간(탭 전환, 폰 앱 전환)에도 바로 읽는다.
// 다시 읽는 요청은 no-cache 라 GitHub 이 "안 바뀜(304)"으로 답하면 요청 한도를 쓰지 않는다.

export const LIVE_MS = 10000;

/** 사용자가 무언가를 하는 중이면 다시 그리지 않는다(손가락 아래에서 탑승권이 바뀌지 않게) */
export function canRefresh({ hidden, busy, adding, dragging, editing }) {
  return !hidden && !busy && !adding && !dragging && !editing;
}

/** 지문이 바뀌었을 때만 다시 그린다 */
export function tasksChanged(prevSha, nextSha) {
  return (prevSha ?? null) !== (nextSha ?? null);
}
