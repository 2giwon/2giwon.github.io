// GitHub API 호출. 브라우저에서 바로 부른다(api.github.com 은 인증 요청에 CORS 를 허용한다, 11-09 확인).
// fetch 를 주입받아 Node 테스트에서 가짜로 바꿀 수 있게 한다.

const API = 'https://api.github.com';
const OWNER = '2giwon';

/** 실패 종류. 화면이 종류별로 다른 안내를 띄운다. */
export class GitHubError extends Error {
  /**
   * @param {'unauthorized'|'forbidden'|'not_found'|'rate_limited'|'network'|'unknown'} kind
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
  return 'unknown';
}

export function createGitHub({ token, fetch }) {
  async function request(path, accept = 'application/vnd.github+json') {
    let res;
    try {
      res = await fetch(API + path, {
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
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
  };
}
