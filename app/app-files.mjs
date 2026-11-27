// 배포 직후 브라우저가 옛 화면 파일과 새 화면 파일을 섞어 쓰면 그리기가 통째로 멈춘다(11-26 실제로 겪음).
// GitHub Pages 는 파일마다 10분까지 브라우저에 맡겨 두고, 화면 파일(모듈)은 서로를 불러오기 때문에
// 하나만 옛것이어도 "그런 내보내기가 없다" 오류가 난다. 그럴 때 아래 파일을 모두 새로 받고 한 번 다시 연다.
// 파일을 더하거나 지우면 이 목록도 고친다(test/app-files.test.mjs 가 app 폴더와 맞는지 검사한다).

export const APP_FILES = [
  'app/airport.mjs',
  'app/app-files.mjs',
  'app/cache.mjs',
  'app/catalog.mjs',
  'app/clock.mjs',
  'app/commute.mjs',
  'app/docview.mjs',
  'app/dom.mjs',
  'app/draw.mjs',
  'app/figures.mjs',
  'app/github.mjs',
  'app/handover.mjs',
  'app/icons.mjs',
  'app/links.mjs',
  'app/live.mjs',
  'app/main.mjs',
  'app/media.mjs',
  'app/route.mjs',
  'app/samples.mjs',
  'app/session-room.mjs',
  'app/sessions.mjs',
  'app/screens/commute.mjs',
  'app/screens/dashboard.mjs',
  'app/screens/doc.mjs',
  'app/screens/folders.mjs',
  'app/screens/media.mjs',
  'app/screens/passes.mjs',
  'app/screens/samples.mjs',
  'app/screens/sessions.mjs',
  'app/screens/themes.mjs',
  'app/screens/token.mjs',
  'app/screens/video.mjs',
  'app/store.mjs',
  'app/style.css',
  'app/theme-ko.mjs',
  'app/theme.mjs',
  'app/themes.mjs',
  'app/timeline.mjs',
  'app/todo.mjs',
  'app/token.mjs',
  'app/update.mjs',
  'app/video.mjs',
];

/** 이번 탭에서 이미 한 번 새로 받았는지 적어 두는 sessionStorage 키. 끝없이 다시 열지 않게 한다 */
export const RECOVERY_KEY = 'worknote-recovered';

/** 그리기 실패 때 할 일. 처음이면 새로 받기(refresh), 이미 한 번 했으면 안내만(show) */
export const recoveryStep = (flag) => (flag ? 'show' : 'refresh');

/**
 * 모든 화면 파일을 브라우저 보관본을 건너뛰고 새로 받는다(cache: 'reload' 가 보관본도 새것으로 바꾼다).
 * 응답 머리만 오고 내용을 덜 받은 채 다시 열면 받다 만 파일이 남으므로 내용(text)까지 끝까지 받는다(codex P2 11-26).
 */
export async function refreshAppFiles(fetchFn = fetch) {
  await Promise.allSettled(APP_FILES.map(async (f) => (await fetchFn(`/${f}`, { cache: 'reload' })).text()));
}
