// 테마 갤러리 화면(11-26). Claude 데스크톱 앱 테마를 움직이는 미리보기 카드로 보여 주고, 고르면 테마 요청을 저장한다.
// 실제로 테마를 바꾸는 일(적용)은 맥의 Claude Usage Bar 앱이 한다. 이 화면은 요청을 쓰고 결과를 읽기만 한다.
// 계산은 themes.mjs, 읽기와 쓰기는 store 가 한다. 여기는 그리기와 버튼만.

import { h, skeleton, failure, empty, errorText } from '../dom.mjs';
import { themeTitle, themeDescription, isLightTheme, themeProgress } from '../themes.mjs';
import { THEME_KO } from '../theme-ko.mjs';

const POLL_MS = 20000; // 요청을 기다리는 동안 결과를 다시 읽는 주기
const POLL_MAX = 45; // 최대 15분. 맥이 꺼져 있으면 끝없이 읽지 않는다
const RELOAD_HINT = '새 세션을 열거나 /reload-plugins 를 하면 보여요';

/** 만든 blob 주소. 화면을 새로 그릴 때 거둔다(샘플 화면과 같은 방식) */
let liveUrls = [];
function revokeUrls() {
  for (const u of liveUrls) URL.revokeObjectURL(u);
  liveUrls = [];
}
const blobUrl = (buf, type) => {
  const u = URL.createObjectURL(new Blob([buf], { type }));
  liveUrls.push(u);
  return u;
};

function saveErrorText(e) {
  if (e?.kind === 'forbidden') return '토큰에 쓰기 권한이 없습니다';
  if (e?.kind === 'conflict') return '다른 곳에서 동시에 고쳐 저장하지 못했습니다. 다시 시도해 주세요';
  if (e?.kind) return errorText(e);
  return String(e?.message ?? e);
}

/**
 * 미리보기 자리. 화면에 들어오면 MP4 를 받아 소리 없이 반복 재생하고, 화면 밖으로 나가면 멈춘다.
 * MP4 를 못 받으면 PNG, PNG 도 못 받으면 "미리보기 없음".
 */
function previewSlot(store, name, observer) {
  const slot = h('div', { class: 'theme-preview', 'aria-busy': 'true' });
  slot.load = async () => {
    try {
      const url = blobUrl(await store.themePreview(name, 'mp4'), 'video/mp4');
      const video = h('video', { src: url, muted: true, loop: true, playsinline: true, autoplay: true, 'aria-label': `${themeTitle(name)} 미리보기` });
      video.muted = true; // 속성만으로는 자동 재생 허락이 안 나는 브라우저가 있다
      slot.replaceChildren(video);
      slot.video = video;
      void video.play().catch(() => {});
    } catch {
      try {
        const url = blobUrl(await store.themePreview(name, 'png'), 'image/png');
        slot.replaceChildren(h('img', { src: url, alt: `${themeTitle(name)} 미리보기` }));
      } catch (e) {
        // 파일이 없을 때만 "미리보기 없음". 네트워크, 요청 한도 같은 실패는 이유와 다시 시도를 보여 준다(리뷰 11-26)
        slot.replaceChildren(
          e?.kind === 'not_found'
            ? h('span', { class: 'theme-preview-none' }, '미리보기 없음')
            : failure(`미리보기를 못 받았어요 (${errorText(e)})`, () => void slot.load())
        );
      }
    } finally {
      slot.removeAttribute('aria-busy');
    }
  };
  observer?.observe(slot);
  return slot;
}

/** 설명 칸. 번역이 있으면 바로, 없으면 영어 원문을 받아 넣는다(받는 동안 한 줄 자리) */
function descriptionView(store, name) {
  if (THEME_KO[name]) return h('p', { class: 'theme-desc' }, themeDescription(name, null));
  const p = h('p', { class: 'theme-desc' }, skeleton(1));
  store
    .themeEnglish(name)
    .then((en) => {
      const text = themeDescription(name, en);
      if (text) p.replaceChildren(text);
      else p.remove();
    })
    .catch(() => p.remove()); // 설명은 없어도 고를 수 있어 이름만 남긴다
  return p;
}

export function themesScreen(store) {
  revokeUrls();
  document.title = 'Claude 테마 | 작업노트';

  const statusBox = h('div', { class: 'theme-status', role: 'status' }, skeleton(1));
  const grid = h('div', { class: 'theme-grid' }, Array.from({ length: 6 }, () => h('article', { class: 'theme-card' }, h('div', { class: 'theme-preview' }), skeleton(2))));
  const root = h(
    'div',
    { class: 'themes-page' },
    h('h1', null, 'Claude 테마'),
    h('p', { class: 'muted' }, `고르면 맥의 Claude Usage Bar 앱이 1분 안에 바꿔요. 바뀐 테마는 ${RELOAD_HINT}.`),
    statusBox,
    grid
  );

  let themes = [];
  let snapshot = null; // { request, status }
  let snapshotError = null;
  let busy = null; // 저장 중인 테마 이름
  let saveError = null;
  let pollTimer = null;
  let polls = 0;
  let snapSeq = 0; // 늦게 끝난 이전 읽기가 새 결과를 덮지 않게 순번으로 거른다(리뷰 11-26)
  const cards = new Map(); // 이름 → { button, badges }

  // 화면에 들어온 미리보기만 받고, 나간 영상은 멈춘다(폰 데이터와 배터리)
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const slot = e.target;
              if (e.isIntersecting) {
                if (!slot.started) {
                  slot.started = true;
                  void slot.load();
                } else void slot.video?.play().catch(() => {});
              } else slot.video?.pause();
            }
          },
          { rootMargin: '200px 0px' }
        )
      : null;

  const alive = () => root.isConnected;

  // 화면을 떠나면(주소가 바뀌면) 새로 읽기를 멈추고, 영상 관찰을 끊고, 받은 영상 주소를 거둔다(리뷰 11-26)
  const teardown = () => {
    clearTimeout(pollTimer);
    observer?.disconnect();
    revokeUrls();
  };
  window.addEventListener('hashchange', teardown, { once: true });

  /** 기다리는 중이거나 읽기에 실패했으면 잠시 뒤 다시 읽는다. 저장 실패 같은 다른 안내가 떠 있어도 멈추지 않는다 */
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!snapshot && !snapshotError) return;
    const p = snapshot ? themeProgress(snapshot.request, snapshot.status.state === 'ok' ? snapshot.status.data : null, Date.now()) : null;
    if (!(snapshotError || p?.state === 'waiting') || polls >= POLL_MAX) return;
    pollTimer = setTimeout(() => {
      if (!alive()) return;
      polls += 1;
      void loadSnapshot();
    }, POLL_MS);
  }
  const current = () => (snapshot?.status.state === 'ok' ? snapshot.status.data.current : null);
  const installed = () => (snapshot?.status.state === 'ok' ? snapshot.status.data.installed : []);

  function drawStatus() {
    if (saveError) {
      statusBox.replaceChildren(failure(`요청을 저장하지 못했어요 (${saveError})`, null));
      return;
    }
    if (busy) {
      statusBox.replaceChildren(h('p', { class: 'banner info' }, `${themeTitle(busy)} 요청 저장 중`));
      return;
    }
    if (snapshotError) {
      statusBox.replaceChildren(failure(`맥 상태를 못 불러왔어요 (${snapshotError})`, () => void loadSnapshot()));
      return;
    }
    if (!snapshot) {
      statusBox.replaceChildren(skeleton(1));
      return;
    }
    const parts = [];
    const st = snapshot.status;
    if (st.state === 'missing') parts.push(h('p', { class: 'banner warn' }, '맥 앱이 아직 연결되지 않았어요. 맥에서 Claude Usage Bar 를 켜고 테마 설정 파일을 만들어 주세요.'));
    else if (st.state === 'invalid') parts.push(h('p', { class: 'banner warn' }, `맥 상태 파일 형식이 맞지 않아요 (${st.error})`));
    else if (st.data.current) parts.push(h('p', { class: 'theme-current' }, '지금 테마: ', h('b', null, themeTitle(st.data.current))));

    const p = themeProgress(snapshot.request, st.state === 'ok' ? st.data : null, Date.now());
    if (p.state === 'waiting') parts.push(h('p', { class: 'banner info' }, `${themeTitle(p.theme)} 요청을 맥이 가져가기를 기다리는 중이에요 (${p.minutes ? `${p.minutes}분 전 요청` : '방금 요청'})`));
    if (p.state === 'applied') parts.push(h('p', { class: 'banner ok' }, `${themeTitle(p.theme)} 적용됨. ${RELOAD_HINT}`));
    if (p.state === 'failed') parts.push(h('p', { class: 'banner risk' }, `${themeTitle(p.theme)} 적용 실패: ${p.reason || '이유 없음'}`));
    if (p.state === 'waiting' && polls >= POLL_MAX) parts.push(h('p', { class: 'muted' }, '맥이 오래 응답하지 않아 자동 새로 읽기를 멈췄어요. 위 새로 고침 버튼으로 다시 볼 수 있어요.'));
    statusBox.replaceChildren(...parts);
  }

  function drawCards() {
    const cur = current();
    const inst = new Set(installed());
    for (const [name, { button, badges }] of cards) {
      const b = [];
      if (name === cur) b.push(h('span', { class: 'badge ok' }, '사용 중'));
      else if (inst.has(name)) b.push(h('span', { class: 'badge muted' }, '설치됨'));
      if (isLightTheme(name)) b.push(h('span', { class: 'badge warn' }, '라이트 모드'));
      badges.replaceChildren(...b);
      button.disabled = Boolean(busy) || name === cur;
      button.textContent = busy === name ? '요청 저장 중' : name === cur ? '사용 중' : '이 테마로 바꾸기';
    }
  }

  async function loadSnapshot() {
    const seq = ++snapSeq;
    let next = snapshot;
    let err = null;
    try {
      next = await store.themeSnapshot();
    } catch (e) {
      err = errorText(e);
    }
    if (seq !== snapSeq) return; // 더 새로운 읽기가 시작됐다
    snapshot = next;
    snapshotError = err;
    drawStatus();
    drawCards();
    schedulePoll();
  }

  async function choose(name) {
    if (busy) return;
    busy = name;
    saveError = null;
    drawStatus();
    drawCards();
    try {
      await store.requestTheme(name, themes);
      busy = null;
      polls = 0; // 새 요청이니 자동 새로 읽기를 처음부터
      await loadSnapshot();
    } catch (e) {
      busy = null;
      saveError = saveErrorText(e);
      drawStatus();
      drawCards();
    }
  }

  function card(name) {
    const badges = h('span', { class: 'theme-badges' });
    const button = h('button', { type: 'button', class: 'theme-pick', onclick: () => void choose(name) }, '이 테마로 바꾸기');
    cards.set(name, { button, badges });
    return h(
      'article',
      { class: 'theme-card' },
      previewSlot(store, name, observer),
      h('div', { class: 'theme-body' }, h('div', { class: 'theme-head' }, h('h2', null, themeTitle(name)), badges), descriptionView(store, name), button)
    );
  }

  async function loadList() {
    observer?.disconnect(); // 다시 시도하면 카드를 새로 만들므로 예전 자리 관찰을 끊는다
    grid.replaceChildren(...Array.from({ length: 6 }, () => h('article', { class: 'theme-card' }, h('div', { class: 'theme-preview' }), skeleton(2))));
    try {
      const r = await store.themeList();
      if (r.state === 'invalid') {
        grid.replaceChildren(failure(`테마 목록 형식이 맞지 않아요 (${r.error})`, () => void loadList()));
        return;
      }
      themes = r.themes;
      if (!themes.length) {
        grid.replaceChildren(empty('테마가 없어요'));
        return;
      }
      cards.clear();
      grid.replaceChildren(...themes.map(card));
      drawCards();
    } catch (e) {
      grid.replaceChildren(failure(`테마 목록을 못 불러왔어요 (${errorText(e)})`, () => void loadList()));
    }
  }

  void loadList();
  void loadSnapshot();
  return root;
}
