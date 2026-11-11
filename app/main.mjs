// 작업노트 시작점. 모듈을 불러올 때는 아무것도 하지 않고, 브라우저에서만 start() 를 부른다.
// (Node 테스트가 순수 로직 모듈을 같은 방식으로 불러오기 때문)

import { loadToken, clearToken, expiryStatus } from './token.mjs';
import { parseRoute } from './route.mjs';

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
  ]);
}

async function render(force = false) {
  const seq = ++renderSeq;
  const [dom, storeMod, tokenMod, dashMod, docMod, folderMod, cacheMod] = await modules();
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
  const clearBtn = h('button', { type: 'button', class: 'link danger' }, '토큰 지우기');
  clearBtn.addEventListener('click', async () => {
    if (!confirmClear) {
      confirmClear = true;
      clearBtn.textContent = '한 번 더 누르면 토큰과 저장한 문서를 지웁니다';
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
      h('a', { class: 'brand', href: '#/' }, '작업노트'),
      shortcuts,
      h('a', { href: '#/folders' }, '폴더'),
      h('button', { type: 'button', class: 'link', onclick: () => void go(true) }, '새로 고침'),
      clearBtn
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
  else content.replaceChildren(dashMod.dashboardScreen(store, catalog));
  window.scrollTo(0, 0);
}

function go(force = false) {
  return render(force).catch((e) => {
    console.error('[worknote]', e);
    document.getElementById('app').textContent = '화면을 그리지 못했습니다. 새로 고침해 주세요.';
  });
}

export function start() {
  window.addEventListener('hashchange', () => void go());
  void go();
}

if (typeof document !== 'undefined') start();
