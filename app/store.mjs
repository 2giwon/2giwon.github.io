// 화면이 쓰는 데이터 창구. GitHub API + 캐시 + 목록 만들기를 한곳에서 한다.
// 파일 목록은 매번 받고, 실패하면 마지막으로 받은 목록을 꺼내 "최신이 아닐 수 있음"으로 표시한다.

import { createGitHub, GitHubError } from './github.mjs';
import { buildCatalog, projectIdsFor, LAB, PERSONAL } from './catalog.mjs';
import { parseFigures, figureState } from './figures.mjs';
import { cache as defaultCache } from './cache.mjs';

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

  return {
    state,
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
