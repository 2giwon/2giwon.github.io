// 화면이 쓰는 데이터 창구. GitHub API + 캐시 + 목록 만들기를 한곳에서 한다.
// 파일 목록은 매번 받고, 실패하면 마지막으로 받은 목록을 꺼내 "최신이 아닐 수 있음"으로 표시한다.

import { createGitHub, GitHubError, trackWrite } from './github.mjs';
import { buildCatalog, projectIdsFor, LAB, PERSONAL } from './catalog.mjs';
import { parseFigures, figureState } from './figures.mjs';
import { cache as defaultCache } from './cache.mjs';
import { parseTasks, emptyTasks, serializeTasks, TASKS_REPO, TASKS_PATH } from './todo.mjs';
import { parseLinks, LINKS_REPO, LINKS_PATH } from './links.mjs';
import { parseMediaIndex, mediaPath } from './media.mjs';
import {
  parseMarketplace,
  parseThemeRequest,
  parseThemeStatus,
  makeThemeRequest,
  isThemeName,
  THEME_DOCS_REPO,
  THEME_REQUEST_PATH,
  THEME_STATUS_PATH,
} from './themes.mjs';
import { SAMPLES_REPO, samplePath } from './samples.mjs';

const FALLBACK_KINDS = new Set(['network', 'rate_limited', 'unknown']);
const treeKey = (repo) => `worknote.tree.${repo}`;
const DATES_KEY = 'worknote.lastDates';

export function today() {
  return new Date().toLocaleDateString('sv-SE'); // 내 폰 기준 날짜 YYYY-MM-DD
}

export function createStore({
  token,
  fetch = globalThis.fetch.bind(globalThis),
  storage = globalThis.localStorage,
  session = globalThis.sessionStorage,
  cache = defaultCache,
}) {
  const gh = createGitHub({ token, fetch });
  let catalogPromise = null;
  let linksPromise = null;
  // 토큰 지우기를 누르면 폐기된다. 그 뒤에 도착한 응답은 폰 어디에도 저장하지 않는다
  // (지운 직후 늦게 온 응답이 비공개 원문을 다시 저장하는 것을 막는다, codex P1 11-09)
  let disposed = false;
  const state = { usedSavedTree: false };

  async function treeOf(repo) {
    try {
      const t = await gh.tree(repo);
      if (!disposed) {
        try {
          storage.setItem(treeKey(repo), JSON.stringify(t));
        } catch {
          /* 저장 공간이 없으면 다음에 못 꺼낼 뿐 */
        }
      }
      return t;
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'unauthorized') throw e;
      if (e instanceof GitHubError && FALLBACK_KINDS.has(e.kind)) {
        const saved = storage.getItem(treeKey(repo));
        if (saved) {
          state.usedSavedTree = true;
          return JSON.parse(saved);
        }
      }
      return e instanceof GitHubError ? e : new GitHubError('unknown', null, String(e));
    }
  }

  async function text(repo, sha) {
    const hit = await cache.get(sha);
    if (typeof hit === 'string') return hit;
    const t = await gh.blobText(repo, sha);
    if (!disposed) void cache.put(sha, t);
    return t;
  }

  async function lastDates(lab, personal) {
    let saved = {};
    try {
      saved = JSON.parse(session.getItem(DATES_KEY) ?? '{}');
    } catch {
      saved = {};
    }
    const ids = [
      ...(Array.isArray(lab) ? projectIdsFor(lab, LAB) : []),
      ...(Array.isArray(personal) ? projectIdsFor(personal, PERSONAL) : []),
    ];
    const missing = ids.filter((id) => !(id in saved));
    const got = await Promise.all(
      missing.map(async (id) => {
        const [repo, folder] = id.split(':');
        try {
          return [id, await gh.lastCommitDate(repo, folder)];
        } catch {
          return [id, null];
        }
      })
    );
    const all = { ...saved, ...Object.fromEntries(got.filter(([, d]) => d)) };
    if (!disposed) {
      try {
        session.setItem(DATES_KEY, JSON.stringify(all));
      } catch {
        /* 무시 */
      }
    }
    return Object.fromEntries(ids.map((id) => [id, all[id] ?? null]));
  }

  async function loadCatalog() {
    state.usedSavedTree = false;
    const [lab, personal] = await Promise.all([treeOf(LAB), treeOf(PERSONAL)]);
    const readmeEntry = Array.isArray(personal) ? personal.find((e) => e.path === 'README.md') : null;
    const [personalReadme, dates] = await Promise.all([
      readmeEntry ? text(PERSONAL, readmeEntry.sha).catch(() => null) : null,
      lastDates(lab, personal),
    ]);
    return buildCatalog({ lab, personal, personalReadme, lastDates: dates, today: today() });
  }

  /**
   * 상단 바로가기. 화면을 옮길 때마다 GitHub 에 묻지 않게 한 번 읽은 결과를 쓰고,
   * "새로 고침"(force)일 때만 다시 읽는다. 실패한 결과는 남기지 않는다.
   * @returns {Promise<{state:'ok'|'missing', links:object[]} | {state:'invalid', error:string}>}
   */
  function links(force = false) {
    if (force || !linksPromise) {
      linksPromise = (async () => {
        const file = await gh.readFile(LINKS_REPO, LINKS_PATH);
        if (!file) return { state: 'missing', links: [] };
        const r = parseLinks(file.text);
        return r.ok ? { state: 'ok', links: r.links } : { state: 'invalid', error: r.error };
      })();
      linksPromise.catch(() => (linksPromise = null));
    }
    return linksPromise;
  }

  /**
   * 샘플 목록(그 폴더의 index.json). 목록(catalog)은 문서만 담으므로 경로로 바로 읽는다.
   * @returns {Promise<{state:'ok', data:object} | {state:'missing'} | {state:'invalid', error:string}>}
   */
  async function mediaIndex(repo, folder) {
    let text;
    try {
      text = await gh.rawText(repo, mediaPath(folder, 'index.json'));
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'not_found') return { state: 'missing' };
      throw e;
    }
    const r = parseMediaIndex(text);
    return r.ok ? { state: 'ok', data: r.data } : { state: 'invalid', error: r.error };
  }

  /**
   * 샘플 파일 한 개의 바이트. 캐시하지 않는다 — 몇 번 듣고 마는 파일이라 캐시 가치가 낮고,
   * cache.mjs 는 글(문자열)을 담게 만들어져 있어서 바이너리를 넣으면 깨진다.
   * @returns {Promise<ArrayBuffer>}
   */
  function mediaBytes(repo, folder, file) {
    return gh.rawBytes(repo, mediaPath(folder, file));
  }

  /**
   * 할 일 파일. 캐시하지 않는다(폰과 /todo 가 함께 고치는 파일이라 늘 최신을 읽는다).
   * @returns {Promise<{state:'ok'|'missing', data:object, sha:string|null} | {state:'invalid', error:string}>}
   */
  async function tasks() {
    const file = await gh.readFile(TASKS_REPO, TASKS_PATH);
    if (!file) return { state: 'missing', data: emptyTasks(), sha: null };
    const r = parseTasks(file.text);
    return r.ok ? { state: 'ok', data: r.data, sha: file.sha } : { state: 'invalid', error: r.error };
  }

  /**
   * 읽기 → change(data) → 쓰기. 그 사이 다른 곳이 먼저 바꿔 충돌하면 다시 읽어 한 번 더 시도한다.
   * change 는 매번 최신 파일에 다시 적용되므로 순수 함수여야 한다(todo.mjs 의 바꾸기 함수).
   * @returns {Promise<{data:object, sha:string|null}>}
   */
  async function updateTasks(change, message) {
    for (let attempt = 0; ; attempt += 1) {
      if (disposed) throw new GitHubError('unauthorized', null, '토큰을 지웠습니다');
      const cur = await tasks();
      if (cur.state === 'invalid') throw new Error(`할 일 파일 형식이 맞지 않습니다 (${cur.error})`);
      const next = change(cur.data);
      if (disposed) throw new GitHubError('unauthorized', null, '토큰을 지웠습니다');
      try {
        const sha = await gh.writeFile(TASKS_REPO, TASKS_PATH, serializeTasks(next), cur.sha, message);
        return { data: next, sha };
      } catch (e) {
        if (!(e instanceof GitHubError && e.kind === 'conflict') || attempt >= 1) throw e;
      }
    }
  }

  // ─── 테마 갤러리 (11-26) ───
  // 테마 목록과 미리보기는 공개 테마 저장소에서, 요청과 결과는 personal-docs 에서 읽는다. 캐시하지 않는다.

  /** @returns {Promise<{state:'ok', themes:string[]} | {state:'invalid', error:string}>} 서버 실패는 throw */
  async function themeList() {
    const r = parseMarketplace(await gh.themeText('.claude-plugin/marketplace.json'));
    return r.ok ? { state: 'ok', themes: r.themes } : { state: 'invalid', error: r.error };
  }

  /** 번역이 없는 테마의 영어 설명(plugin.json). 없거나 깨졌으면 null */
  async function themeEnglish(name) {
    if (!isThemeName(name)) return null;
    try {
      const d = JSON.parse(await gh.themeText(`themes/${name}/.claude-plugin/plugin.json`));
      return typeof d?.description === 'string' ? d.description : null;
    } catch (e) {
      if (e instanceof GitHubError) throw e;
      return null;
    }
  }

  /** 미리보기 파일(mp4 또는 png) 바이트 */
  function themePreview(name, ext) {
    if (!isThemeName(name) || !['mp4', 'png'].includes(ext)) throw new Error(`잘못된 미리보기: ${name}.${ext}`);
    return gh.themeBytes(`previews/${name}.${ext}`);
  }

  /**
   * 요청과 맥 앱 결과. 결과 파일이 없으면 missing(맥 앱이 아직 연결 전), 깨졌으면 invalid.
   * @returns {Promise<{request:{theme:string, requestedAt:string}|null, status:{state:'ok', data:object}|{state:'missing'}|{state:'invalid', error:string}}>}
   */
  async function themeSnapshot() {
    const [req, st] = await Promise.all([
      gh.readFile(THEME_DOCS_REPO, THEME_REQUEST_PATH),
      gh.readFile(THEME_DOCS_REPO, THEME_STATUS_PATH),
    ]);
    const request = req ? parseThemeRequest(req.text) : null;
    if (!st) return { request, status: { state: 'missing' } };
    const r = parseThemeStatus(st.text);
    return { request, status: r.ok ? { state: 'ok', data: r.data } : { state: 'invalid', error: r.error } };
  }

  /** 테마 요청을 쓴다. 다른 곳이 먼저 바꿔 충돌하면 다시 읽어 한 번 더. */
  async function requestTheme(name, knownThemes, now = new Date()) {
    const text = makeThemeRequest(name, knownThemes, now);
    for (let attempt = 0; ; attempt += 1) {
      if (disposed) throw new GitHubError('unauthorized', null, '토큰을 지웠습니다');
      const cur = await gh.readFile(THEME_DOCS_REPO, THEME_REQUEST_PATH);
      try {
        return await gh.writeFile(THEME_DOCS_REPO, THEME_REQUEST_PATH, text, cur?.sha ?? null, `테마 요청: ${name}`);
      } catch (e) {
        if (!(e instanceof GitHubError && e.kind === 'conflict') || attempt >= 1) throw e;
      }
    }
  }

  return {
    state,
    tasks,
    links,
    // 저장은 읽기부터 쓰기까지 전체를 "쓰는 중"으로 센다(새 버전 자동 받기가 그 사이 다시 열지 않게, 리뷰 P2 11-26)
    updateTasks: (change, message) => trackWrite(() => updateTasks(change, message)),
    mediaIndex,
    mediaBytes,
    themeList,
    themeEnglish,
    themePreview,
    themeSnapshot,
    requestTheme: (...args) => trackWrite(() => requestTheme(...args)),
    /** 디자인 샘플 HTML 글(11-26). 파일이 없으면 null */
    async sampleHtml(id) {
      const file = await gh.readFile(SAMPLES_REPO, samplePath(id));
      return file ? file.text : null;
    },
    /** 토큰 지우기. 이후 도착하는 응답은 저장하지 않는다. */
    dispose() {
      disposed = true;
    },
    /** 목록. force 면 다시 받는다. unauthorized 는 throw(토큰 화면으로). */
    catalog(force = false) {
      if (force || !catalogPromise) {
        if (force) session.removeItem(DATES_KEY);
        catalogPromise = loadCatalog();
        catalogPromise.catch(() => (catalogPromise = null));
      }
      return catalogPromise;
    },
    text,
    /** 문서의 그림 데이터. @returns {Promise<{data:object|null, state:'none'|'fresh'|'stale', error:string|null}>} */
    async figures(doc) {
      if (!doc.figureSha) return { data: null, state: 'none', error: null };
      try {
        const r = parseFigures(await text(doc.repo, doc.figureSha));
        if (!r.ok) return { data: null, state: 'none', error: r.error };
        return { data: r.data, state: figureState(r.data, doc.sha), error: null };
      } catch (e) {
        return { data: null, state: 'none', error: e?.kind ?? String(e) };
      }
    },
  };
}
