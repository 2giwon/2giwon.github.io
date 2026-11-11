// GitHub API 호출. 브라우저에서 바로 부른다(api.github.com 은 인증 요청에 CORS 를 허용한다, 11-09 확인).
// fetch 를 주입받아 Node 테스트에서 가짜로 바꿀 수 있게 한다.

import { TASKS_REPO, TASKS_PATH } from './todo.mjs';

const API = 'https://api.github.com';
const OWNER = '2giwon';

/** 쓰기는 할 일 파일 한 곳만 허락한다(토큰이 쓰기 권한이라도 화면이 다른 문서를 고치지 않게, 11-11 결정) */
const WRITABLE = new Set([`${TASKS_REPO}:${TASKS_PATH}`]);

/** UTF-8 글 ↔ base64. contents API 는 base64 로 주고받는다(atob, btoa 는 한 바이트 글자만 다뤄 한글이 깨진다) */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** 실패 종류. 화면이 종류별로 다른 안내를 띄운다. */
export class GitHubError extends Error {
  /**
   * conflict = 쓰는 사이 다른 곳(폰, /todo)이 파일을 먼저 바꿨다 → 다시 읽고 한 번 더
   * @param {'unauthorized'|'forbidden'|'not_found'|'rate_limited'|'conflict'|'network'|'unknown'} kind
   * @param {number|null} status
   */
  constructor(kind, status, message = kind) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
  }
}

function kindFor(res) {
  if (res.status === 401) return 'unauthorized';
  if (res.status === 429) return 'rate_limited';
  if (res.status === 403) {
    return res.headers.get('x-ratelimit-remaining') === '0' ? 'rate_limited' : 'forbidden';
  }
  if (res.status === 404) return 'not_found';
  if (res.status === 409 || res.status === 422) return 'conflict';
  return 'unknown';
}

export function createGitHub({ token, fetch }) {
  async function request(path, accept = 'application/vnd.github+json', { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      throw new GitHubError('network', null, String(e?.message ?? e));
    }
    if (!res.ok) throw new GitHubError(kindFor(res), res.status);
    return res;
  }

  return {
    /** 기본 브랜치의 전체 파일 목록. @returns {Promise<{path:string, sha:string, type:'blob'|'tree'}[]>} */
    async tree(repo) {
      const res = await request(`/repos/${OWNER}/${repo}/git/trees/HEAD?recursive=1`);
      const body = await res.json();
      if (body.truncated) throw new GitHubError('unknown', res.status, '파일 목록이 너무 커서 잘렸습니다');
      return (body.tree ?? []).map(({ path, sha, type }) => ({ path, sha, type }));
    },

    /** 지문(blob sha)으로 원문을 받는다. 같은 지문이면 내용도 같다. */
    async blobText(repo, sha) {
      const res = await request(`/repos/${OWNER}/${repo}/git/blobs/${sha}`, 'application/vnd.github.raw');
      return res.text();
    },

    /** 그 경로를 마지막으로 바꾼 커밋의 날짜(YYYY-MM-DD). 없으면 null. */
    async lastCommitDate(repo, path) {
      const res = await request(
        `/repos/${OWNER}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`
      );
      const list = await res.json();
      const date = list?.[0]?.commit?.committer?.date;
      return typeof date === 'string' ? date.slice(0, 10) : null;
    },

    /** 파일 글과 sha. 파일이 없으면 null. @returns {Promise<{text:string, sha:string}|null>} */
    async readFile(repo, path) {
      try {
        const res = await request(`/repos/${OWNER}/${repo}/contents/${path}`);
        const body = await res.json();
        return { text: fromBase64(body.content ?? ''), sha: body.sha };
      } catch (e) {
        if (e instanceof GitHubError && e.kind === 'not_found') return null;
        throw e;
      }
    },

    /**
     * 파일을 쓴다(커밋 하나). sha 가 null 이면 새 파일. 할 일 파일이 아니면 요청 없이 거절한다.
     * @returns {Promise<string>} 새 sha
     */
    async writeFile(repo, path, text, sha, message) {
      if (!WRITABLE.has(`${repo}:${path}`)) throw new GitHubError('forbidden', null, `쓰기 금지 경로: ${repo}/${path}`);
      const res = await request(`/repos/${OWNER}/${repo}/contents/${path}`, undefined, {
        method: 'PUT',
        body: { message, content: toBase64(text), ...(sha ? { sha } : {}) },
      });
      const body = await res.json();
      return body?.content?.sha ?? null;
    },
  };
}
