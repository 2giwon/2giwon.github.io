// 새 버전 자동 받기(11-26 사용자 요청). 기능을 고쳐 배포해도 이미 열어 둔 탭은 예전 화면 파일로 계속 돌았다
// (실시간 갱신을 배포했는데 열어 둔 탭에서 할 일 완료가 안 바뀐 일). GitHub Pages 는 배포할 때마다 모든 파일의
// Last-Modified 를 그 배포 시각으로 바꾼다(11-26 확인). 그래서 1분마다, 그리고 화면으로 돌아올 때
// 브라우저가 가진 main.mjs 의 시각과 사이트 최신 main.mjs 의 시각을 비교하고, 다르면 화면 파일을 모두 새로 받아 다시 연다.

import { refreshAppFiles } from './app-files.mjs';
import { pendingWrites } from './github.mjs';

export const UPDATE_MS = 60_000;
/** 이 안에 이미 한 번 다시 열었으면 또 열지 않는다. 배포가 아직 덜 퍼져 최신 시각이 오락가락할 때 계속 다시 열리는 것을 막는다 */
export const RELOAD_GAP_MS = 120_000;
const RELOADED_AT_KEY = 'worknote-update-reloaded-at';
const PROBE = '/app/main.mjs';

/** 둘 다 알고 있고 서로 다를 때만 새 배포 */
export const isNewDeploy = (loaded, latest) => !!loaded && !!latest && loaded !== latest;

/** 글을 쓰는 중이나 저장 중이면 기다린다. 최근에 이미 다시 열었으면 기다린다 */
export function shouldReload({ typing, saving, lastReloadAt, now }) {
  if (typing || saving) return false;
  return !(lastReloadAt && now - lastReloadAt <= RELOAD_GAP_MS);
}

const NOT_TEXT = new Set(['hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/**
 * 글 칸에 내용이 남아 있으면 쓰던 글로 본다(커서가 칸을 떠나도). 발권 제목이나 토큰은 화면 안에만 있어서
 * 다시 열면 사라진다(codex P2 11-26). 체크 상자, 숨은 칸, 버튼은 세지 않는다.
 */
export function hasDraft(fields) {
  return [...fields].some((f) => {
    const isText = f.tagName === 'TEXTAREA' || !NOT_TEXT.has(String(f.type ?? 'text').toLowerCase());
    // 처음 값(defaultValue)에서 바뀐 칸만. 처음부터 값이 든 칸 때문에 새 버전을 영영 못 받으면 안 된다(리뷰 P2 11-26)
    return isText && String(f.value ?? '') !== String(f.defaultValue ?? '');
  });
}

/** 지금 다시 열면 안 되는 상태인지(글을 쓰는 중, 쓰던 글이 남음, GitHub 에 저장 중) */
function busyNow() {
  const a = document.activeElement;
  const typing = !!a?.matches?.('input, textarea, select, [contenteditable="true"]') || hasDraft(document.querySelectorAll('input, textarea'));
  // 되돌리기 안내가 떠 있는 동안도 기다린다. 다시 열면 실수로 누른 완료를 되돌릴 길이 사라진다(리뷰 P2 11-26)
  const saving = pendingWrites() > 0 || !!document.querySelector('.bp-status.saving, .undo-toast:not([hidden])');
  return { typing, saving };
}

async function stamp(fetchFn, init) {
  try {
    const res = await fetchFn(PROBE, init);
    return res.ok ? res.headers.get('last-modified') : null;
  } catch {
    return null; // 닿지 못하면 모른다. 모르면 다시 열지 않는다
  }
}

/** 지금 화면이 쓰는 파일의 배포 시각. force-cache 는 오래됐어도 브라우저 보관본을 그대로 준다 */
export const loadedStamp = (fetchFn = fetch) => stamp(fetchFn, { cache: 'force-cache' });

/** 사이트 최신 배포 시각. no-store 로 늘 사이트에 묻고, 머리만 받는 HEAD 라 가볍다 */
export const latestStamp = (fetchFn = fetch) => stamp(fetchFn, { cache: 'no-store', method: 'HEAD' });

/**
 * 브라우저에서만 부른다(main.mjs start). 화면을 연 순간 지금 쓰는 파일의 시각을 한 번 기억해 두고,
 * 1분마다, 화면으로 돌아올 때 사이트 최신 시각과 비교한다. 확인할 때마다 보관본을 다시 보지 않는 이유:
 * 다른 탭이 보관본을 새것으로 바꿔 두면 예전 코드로 도는 이 탭이 자기가 최신이라고 착각한다(11-26 확인)
 */
export function watchForUpdates() {
  let checking = false;
  const loadedPromise = loadedStamp();
  const tick = async () => {
    if (checking) return;
    checking = true;
    try {
      const [loaded, latest] = [await loadedPromise, await latestStamp()];
      if (!isNewDeploy(loaded, latest)) return;
      const { typing, saving } = busyNow();
      let lastReloadAt = null;
      try {
        lastReloadAt = Number(sessionStorage.getItem(RELOADED_AT_KEY)) || null;
      } catch {
        return; // 저장소를 못 쓰면 끝없이 다시 열 수 있으므로 자동으로 하지 않는다
      }
      if (!shouldReload({ typing, saving, lastReloadAt, now: Date.now() })) return;
      try {
        sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
      } catch {
        return;
      }
      await refreshAppFiles();
      // 파일을 받는 사이 글을 쓰거나 저장을 시작했으면 이번엔 열지 않는다. 받은 새 파일은 보관본에 남아
      // 다음 확인(2분 뒤) 때 다시 연다(codex P2 11-26)
      const after = busyNow();
      if (after.typing || after.saving) {
        try {
          sessionStorage.removeItem(RELOADED_AT_KEY);
        } catch {
          /* 무시 */
        }
        return;
      }
      location.reload();
    } finally {
      checking = false;
    }
  };
  setInterval(() => void tick(), UPDATE_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void tick();
  });
  setTimeout(() => void tick(), 5000); // 이미 예전 파일로 열렸을 수 있으니 처음 연 직후에도 한 번
}
