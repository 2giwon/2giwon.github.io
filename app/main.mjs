// 작업노트 시작점. 모듈을 불러올 때는 아무것도 하지 않고, 브라우저에서만 start() 를 부른다.
// (Node 테스트가 순수 로직 모듈을 같은 방식으로 불러오기 때문)

import { loadToken, clearToken, expiryStatus } from './token.mjs';
import { parseRoute } from './route.mjs';
import { initTheme, onThemeChange, cycleChoice, currentChoice, choiceLabel, themeSupported } from './theme.mjs';
import { iconSvg, themeIconName } from './icons.mjs';

let store = null;
let renderSeq = 0; // 늦게 끝난 이전 그리기가 지금 화면을 덮지 않게 순번으로 거른다

function modules() {
  return Promise.all([
    import('./dom.mjs'),
    import('./store.mjs'),
    import('./screens/token.mjs'),
    import('./screens/dashboard.mjs'),
    import('./screens/doc.mjs'),
    import('./screens/folders.mjs'),
    import('./cache.mjs'),
    import('./screens/media.mjs'),
    import('./screens/video.mjs'),
    import('./screens/themes.mjs'),
    import('./screens/samples.mjs'),
  ]);
}

async function render(force = false) {
  const seq = ++renderSeq;
  const [dom, storeMod, tokenMod, dashMod, docMod, folderMod, cacheMod, mediaMod, videoMod, themesMod, samplesMod] = await modules();
  if (seq !== renderSeq) return;
  const { h, failure, errorText } = dom;
  const root = document.getElementById('app');

  const showToken = (reason = null) => {
    renderSeq += 1; // 진행 중인 그리기가 토큰 화면을 덮지 않게
    store = null;
    document.title = '작업노트';
    root.replaceChildren(
      tokenMod.tokenScreen({
        reason,
        onSaved: () => {
          if (location.hash && location.hash !== '#/') location.hash = '#/';
          else void render();
        },
      })
    );
  };

  const tokenInfo = loadToken(localStorage);
  if (!tokenInfo) return showToken();
  if (!store) store = storeMod.createStore({ token: tokenInfo.token });

  let confirmClear = false;
  const clearBtn = iconButton(h, { icon: 'key-off', label: '토큰 지우기', danger: true });
  // 첫 번째로 누르면 아이콘 옆에 안내를 띄우고, 한 번 더 눌러야 지운다
  const clearHint = h('span', { class: 'clear-hint', role: 'status' });
  clearBtn.addEventListener('click', async () => {
    if (!confirmClear) {
      confirmClear = true;
      clearHint.textContent = '한 번 더 누르면 토큰과 저장한 문서를 지웁니다';
      clearBtn.setAttribute('aria-label', '토큰 지우기 확인(한 번 더 누르면 지웁니다)');
      return;
    }
    store?.dispose(); // 아직 오고 있는 응답이 지운 뒤에 다시 저장되지 않게 먼저 막는다
    clearToken(localStorage);
    for (const k of Object.keys(localStorage)) if (k.startsWith('worknote.')) localStorage.removeItem(k);
    sessionStorage.clear();
    await cacheMod.cache.clear();
    showToken();
  });

  const banners = h('div', { class: 'banners' });
  const expiry = expiryStatus(tokenInfo.expiresOn, storeMod.today());
  if (expiry === 'soon') banners.append(h('p', { class: 'banner warn' }, `토큰이 ${tokenInfo.expiresOn}에 만료됩니다. 새 토큰을 만들어 다시 넣어 주세요.`));
  if (expiry === 'expired') banners.append(h('p', { class: 'banner warn' }, `적어 둔 만료일(${tokenInfo.expiresOn})이 지났습니다.`));

  const content = h('div', { class: 'content' });
  // 바로가기 버튼(personal-docs/worknote/links.json). 읽는 동안은 자리만 잡고, 없으면 그리지 않고, 실패하면 알린다
  const shortcuts = h('span', { class: 'shortcuts', 'aria-busy': 'true' });
  root.replaceChildren(
    h(
      'nav',
      { class: 'topbar' },
      // 11-26 작업노트 국제공항: 글자판 모양 공항 부호 WN + 이름
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'flap', 'aria-hidden': 'true' }, h('i', null, 'W'), h('i', null, 'N')), '작업노트'),
      shortcuts,
      h(
        'span',
        { class: 'tools' },
        iconButton(h, { icon: 'folder', label: '폴더', href: '#/folders' }),
        // 디자인 샘플(11-26). 새 디자인을 정한 뒤에도 남겨 둔다(사용자 지시 11-26)
        iconButton(h, { icon: 'palette', label: '디자인 샘플', href: '#/samples' }),
        iconButton(h, { icon: 'refresh', label: '새로 고침', onclick: () => void go(true) }),
        themeButton(h),
        clearBtn,
        clearHint
      )
    ),
    banners,
    content
  );
  const linkStore = store;
  linkStore
    .links(force)
    .then((r) => {
      if (seq !== renderSeq || store !== linkStore) return;
      shortcuts.removeAttribute('aria-busy');
      if (r.state === 'invalid') shortcuts.replaceChildren(h('span', { class: 'shortcut-error' }, '바로가기를 못 읽음'));
      else
        shortcuts.replaceChildren(
          ...r.links.map((l) => h('a', { class: 'shortcut', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.title))
        );
    })
    .catch((e) => {
      if (seq !== renderSeq || store !== linkStore) return;
      shortcuts.removeAttribute('aria-busy');
      if (e?.kind === 'unauthorized') return; // 목록 읽기가 토큰 화면으로 보낸다
      shortcuts.replaceChildren(h('span', { class: 'shortcut-error' }, '바로가기를 못 읽음'));
    });

  const route = parseRoute(location.hash);
  content.replaceChildren(route.name === 'dashboard' ? dashMod.dashboardLoading() : dom.skeleton(6));

  const current = store;
  let catalog;
  try {
    catalog = await current.catalog(force);
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e?.kind === 'unauthorized') return showToken('토큰이 만료됐습니다. 새 토큰을 만들어 다시 넣어 주세요.');
    content.replaceChildren(failure(`목록을 읽지 못했습니다 (${errorText(e)})`, () => void go(true)));
    return;
  }
  if (seq !== renderSeq || store !== current) return;
  if (store.state.usedSavedTree) banners.append(h('p', { class: 'banner info' }, '최신이 아닐 수 있습니다(네트워크 실패로 마지막에 받은 목록을 보여 줍니다).'));

  document.title = '작업노트';
  (await import('./draw.mjs')).disposeDetachedCharts();
  if (route.name === 'doc') content.replaceChildren(docMod.docScreen(store, catalog, route.repo, route.path));
  else if (route.name === 'folders') content.replaceChildren(folderMod.foldersScreen(catalog, route.repo, route.folder));
  else if (route.name === 'media') content.replaceChildren(mediaMod.mediaScreen(store, route.repo, route.folder));
  else if (route.name === 'video') content.replaceChildren(videoMod.videoScreen(store, catalog));
  else if (route.name === 'themes') content.replaceChildren(themesMod.themesScreen(store));
  else if (route.name === 'samples') content.replaceChildren(samplesMod.samplesScreen(store, route.sample));
  else content.replaceChildren(dashMod.dashboardScreen(store, catalog));
  window.scrollTo(0, 0);
}

/** 화면 밝기 버튼. 누를 때마다 자동, 밝게, 어둡게 순서로 바뀐다(11-24). */
function themeButton(h) {
  if (!themeSupported()) return null; // 다크모드를 못 그리는 브라우저에서는 눌러도 바뀌는 것이 없다
  const choice = currentChoice();
  const btn = iconButton(h, { icon: themeIconName(choice), label: `${choiceLabel(choice)} (눌러서 바꾸기)` });
  btn.addEventListener('click', () => {
    const next = cycleChoice();
    setIcon(btn, themeIconName(next), `${choiceLabel(next)} (눌러서 바꾸기)`);
  });
  return btn;
}

/** 위 막대 아이콘 버튼(11-24). 글자 대신 아이콘, 이름은 마우스를 올리면 보이고 화면 읽기 프로그램이 읽는다. */
function iconButton(h, { icon, label, href, onclick, danger = false }) {
  const cls = `icon-btn${danger ? ' danger' : ''}`;
  const el = href ? h('a', { class: cls, href }) : h('button', { type: 'button', class: cls, onclick });
  setIcon(el, icon, label);
  return el;
}

function setIcon(el, icon, label) {
  el.innerHTML = iconSvg(icon); // 이 파일이 만든 고정 SVG 만 넣는다
  el.title = label;
  el.setAttribute('aria-label', label);
}

/**
 * 그리기가 멈추면, 배포 직후 옛 화면 파일이 섞인 경우가 대부분이다(11-26).
 * 이번 탭에서 처음이면 화면 파일을 모두 새로 받고 한 번 다시 연다. 그래도 멈추면 안내와 "새 버전 받기" 버튼만 보여 준다.
 */
async function recover(e) {
  console.error('[worknote]', e);
  const app = document.getElementById('app');
  const files = await import('./app-files.mjs').catch(() => null);
  // 저장소(sessionStorage)를 못 쓰면 끝없이 다시 열 수 있으므로 자동으로 하지 않고 버튼만 보여 준다(codex P2 11-26)
  let auto = false;
  try {
    if (files && files.recoveryStep(sessionStorage.getItem(files.RECOVERY_KEY)) === 'refresh') {
      sessionStorage.setItem(files.RECOVERY_KEY, '1');
      auto = true;
    }
  } catch {
    auto = false;
  }
  if (auto) {
    app.textContent = '새 버전을 받는 중이에요…';
    await files.refreshAppFiles();
    location.reload();
    return;
  }
  app.textContent = '화면을 그리지 못했어요. ';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link';
  btn.textContent = '새 버전 받고 다시 열기';
  btn.addEventListener('click', async () => {
    if (files) await files.refreshAppFiles();
    location.reload();
  });
  app.append(btn);
}

function go(force = false) {
  return render(force)
    .then(() => {
      try {
        sessionStorage.removeItem('worknote-recovered'); // 잘 그려지면 다음 배포 때 또 새로 받을 수 있게 지운다
      } catch {
        /* 저장소를 못 써도 화면은 그려졌다 */
      }
    })
    .catch((e) =>
      recover(e).catch((err) => {
        console.error('[worknote]', err);
        document.getElementById('app').textContent = '화면을 그리지 못했어요. 새로 고침해 주세요.';
      })
    );
}

export function start() {
  initTheme();
  // 그림만 다시 칠한다. 흐름도 도구는 문서를 연 적이 있을 때만 받아져 있다
  onThemeChange(() => void import('./draw.mjs').then((d) => d.redrawForTheme()));
  window.addEventListener('hashchange', () => void go());
  void go();
}

if (typeof document !== 'undefined') start();
