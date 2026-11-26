import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHub, GitHubError, pendingWrites, trackWrite } from '../app/github.mjs';

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}

function res(status, body, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

async function kindOf(promise) {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof GitHubError, `GitHubError 가 아님: ${e}`);
    return e.kind;
  }
  assert.fail('실패해야 하는데 성공했다');
}

test('트리는 전체 항목을 path, sha, type 으로 돌려준다', async () => {
  const fetch = fakeFetch(() =>
    res(200, {
      truncated: false,
      tree: [
        { path: 'web', type: 'tree', sha: 't1', mode: '040000' },
        { path: 'web/a.md', type: 'blob', sha: 'b1', size: 10 },
      ],
    })
  );
  const gh = createGitHub({ token: 'tk', fetch });
  assert.deepEqual(await gh.tree('labmanager-docs'), [
    { path: 'web', sha: 't1', type: 'tree' },
    { path: 'web/a.md', sha: 'b1', type: 'blob' },
  ]);
  assert.equal(
    fetch.calls[0].url,
    'https://api.github.com/repos/2giwon/labmanager-docs/git/trees/HEAD?recursive=1'
  );
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer tk');
  assert.equal(fetch.calls[0].init.headers['X-GitHub-Api-Version'], '2022-11-28');
});

test('트리가 잘렸으면(truncated) 실패로 본다', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(200, { truncated: true, tree: [] })) });
  assert.equal(await kindOf(gh.tree('personal-docs')), 'unknown');
});

test('원문은 지문으로 받고 raw Accept 를 붙인다', async () => {
  const fetch = fakeFetch(() => res(200, '# 제목\n본문'));
  const gh = createGitHub({ token: 'tk', fetch });
  assert.equal(await gh.blobText('personal-docs', 'abc123'), '# 제목\n본문');
  assert.equal(fetch.calls[0].url, 'https://api.github.com/repos/2giwon/personal-docs/git/blobs/abc123');
  assert.equal(fetch.calls[0].init.headers.Accept, 'application/vnd.github.raw');
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer tk');
});

test('마지막 커밋일은 날짜 10자', async () => {
  const fetch = fakeFetch(() => res(200, [{ commit: { committer: { date: '2026-11-09T01:23:45Z' } } }]));
  const gh = createGitHub({ token: 'tk', fetch });
  assert.equal(await gh.lastCommitDate('labmanager-docs', 'web'), '2026-11-09');
  assert.equal(
    fetch.calls[0].url,
    'https://api.github.com/repos/2giwon/labmanager-docs/commits?path=web&per_page=1'
  );
});

test('커밋이 없으면 null', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(200, [])) });
  assert.equal(await gh.lastCommitDate('labmanager-docs', 'web'), null);
});

test('경로에 한글이나 공백이 있으면 주소에 맞게 바꾼다', async () => {
  const fetch = fakeFetch(() => res(200, []));
  await createGitHub({ token: 'tk', fetch }).lastCommitDate('personal-docs', '새 폴더');
  assert.ok(fetch.calls[0].url.includes('path=%EC%83%88%20%ED%8F%B4%EB%8D%94'));
});

test('401 은 unauthorized (토큰 만료나 잘못된 토큰)', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(401, { message: 'Bad credentials' })) });
  assert.equal(await kindOf(gh.tree('personal-docs')), 'unauthorized');
});

test('403 + 남은 요청 0 은 rate_limited', async () => {
  const gh = createGitHub({
    token: 'tk',
    fetch: fakeFetch(() => res(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '0' })),
  });
  assert.equal(await kindOf(gh.tree('personal-docs')), 'rate_limited');
});

test('429 도 rate_limited', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(429, {})) });
  assert.equal(await kindOf(gh.tree('personal-docs')), 'rate_limited');
});

test('403 (요청 남음) 은 forbidden', async () => {
  const gh = createGitHub({
    token: 'tk',
    fetch: fakeFetch(() => res(403, {}, { 'x-ratelimit-remaining': '4999' })),
  });
  assert.equal(await kindOf(gh.tree('personal-docs')), 'forbidden');
});

test('404 는 not_found (토큰에 그 repo 권한이 없을 때도 404 가 온다)', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(404, {})) });
  const err = await gh.tree('labmanager-docs').catch((e) => e);
  assert.equal(err.kind, 'not_found');
  assert.equal(err.status, 404);
});

test('fetch 자체가 실패하면 network', async () => {
  const gh = createGitHub({
    token: 'tk',
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const err = await gh.blobText('personal-docs', 'x').catch((e) => e);
  assert.equal(err.kind, 'network');
  assert.equal(err.status, null);
});

test('500 은 unknown', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(500, {})) });
  assert.equal(await kindOf(gh.tree('personal-docs')), 'unknown');
});

// ─── 할 일 파일 읽기, 쓰기 (11-11) ────────────────────────────────────────────

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('9. readFile 은 한글 내용(UTF-8)과 sha 를 돌려준다', async () => {
  const text = '{"title":"보관위치 400"}\n';
  // GitHub 은 base64 를 60자마다 줄바꿈해서 준다
  const content = b64(text).replace(/(.{20})/g, '$1\n');
  const fetch = fakeFetch(() => res(200, { content, encoding: 'base64', sha: 's1' }));
  const gh = createGitHub({ token: 'tk', fetch });
  assert.deepEqual(await gh.readFile('personal-docs', 'todo/tasks.json'), { text, sha: 's1' });
  assert.equal(fetch.calls[0].url, 'https://api.github.com/repos/2giwon/personal-docs/contents/todo/tasks.json');
});

test('L3. readFile 은 브라우저 캐시를 그대로 쓰지 않고 GitHub 에 바뀌었는지 묻는다(no-cache, 실시간 갱신 11-26)', async () => {
  const fetch = fakeFetch(() => res(200, { content: b64('{}'), sha: 's1' }));
  const gh = createGitHub({ token: 'tk', fetch });
  await gh.readFile('personal-docs', 'todo/tasks.json');
  assert.equal(fetch.calls[0].init.cache, 'no-cache');
});

test('U6. 쓰는 동안만 pendingWrites 가 1이고, 끝나면(실패해도) 0으로 돌아온다(새 버전 자동 받기가 기다리게)', async () => {
  let release;
  // 쓰기(PUT)만 붙잡아 두고, 읽기는 바로 답한다
  const fetch = fakeFetch((url, init) => (init.method === 'PUT' ? new Promise((r) => (release = r)) : res(200, { content: '', sha: 's' })));
  const gh = createGitHub({ token: 'tk', fetch });
  assert.equal(pendingWrites(), 0);
  const p = gh.writeFile('personal-docs', 'todo/tasks.json', 'x', 's1', 'm');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pendingWrites(), 1);
  release(res(500, {}));
  await p.catch(() => {});
  assert.equal(pendingWrites(), 0);
  await gh.readFile('personal-docs', 'todo/tasks.json').catch(() => {});
  assert.equal(pendingWrites(), 0); // 읽기는 세지 않는다
});

test('U6. trackWrite 는 읽고 쓰는 전체 동안 pendingWrites 를 올려 둔다(읽는 사이 다시 열리지 않게, 리뷰 P2 11-26)', async () => {
  let release;
  const p = trackWrite(() => new Promise((r) => (release = r)));
  assert.equal(pendingWrites(), 1);
  release('ok');
  assert.equal(await p, 'ok');
  assert.equal(pendingWrites(), 0);
  await trackWrite(async () => {
    throw new Error('x');
  }).catch(() => {});
  assert.equal(pendingWrites(), 0); // 실패해도 내린다
});

test('9. readFile 은 파일이 없으면(404) null', async () => {
  const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(404, {})) });
  assert.equal(await gh.readFile('personal-docs', 'todo/tasks.json'), null);
});

test('10. writeFile 은 PUT 본문에 base64 UTF-8, sha, message 를 담고 새 sha 를 돌려준다', async () => {
  const fetch = fakeFetch(() => res(200, { content: { sha: 's2' } }));
  const gh = createGitHub({ token: 'tk', fetch });
  const sha = await gh.writeFile('personal-docs', 'todo/tasks.json', '할 일\n', 's1', '할 일 추가: 가');
  assert.equal(sha, 's2');
  const { init } = fetch.calls[0];
  assert.equal(init.method, 'PUT');
  assert.equal(init.headers.Authorization, 'Bearer tk');
  assert.deepEqual(JSON.parse(init.body), { message: '할 일 추가: 가', content: b64('할 일\n'), sha: 's1' });
});

test('10. writeFile 은 sha 가 null 이면 sha 없이 보낸다(새 파일)', async () => {
  const fetch = fakeFetch(() => res(201, { content: { sha: 'n1' } }));
  const gh = createGitHub({ token: 'tk', fetch });
  await gh.writeFile('personal-docs', 'todo/tasks.json', 'x', null, 'm');
  assert.equal('sha' in JSON.parse(fetch.calls[0].init.body), false);
});

test('10. writeFile 은 409, 422 를 conflict, 403 을 forbidden 으로', async () => {
  for (const [status, kind] of [
    [409, 'conflict'],
    [422, 'conflict'],
    [403, 'forbidden'],
  ]) {
    const gh = createGitHub({ token: 'tk', fetch: fakeFetch(() => res(status, {})) });
    assert.equal(await kindOf(gh.writeFile('personal-docs', 'todo/tasks.json', 'x', 's', 'm')), kind);
  }
});

test('14. 할 일 파일이 아닌 경로에는 쓰지 않는다(요청도 보내지 않는다)', async () => {
  const fetch = fakeFetch(() => res(200, { content: { sha: 'x' } }));
  const gh = createGitHub({ token: 'tk', fetch });
  for (const [repo, path] of [
    ['personal-docs', 'README.md'],
    ['labmanager-docs', 'todo/tasks.json'],
    ['personal-docs', 'claude-theme/status.json'],
  ]) {
    await assert.rejects(gh.writeFile(repo, path, 'x', 's', 'm'));
  }
  assert.equal(fetch.calls.length, 0);
});

test('테마 요청 파일(personal-docs/claude-theme/request.json)에는 쓸 수 있다', async () => {
  const fetch = fakeFetch(() => res(200, { content: { sha: 'n1' } }));
  const gh = createGitHub({ token: 'tk', fetch });
  assert.equal(await gh.writeFile('personal-docs', 'claude-theme/request.json', '{}', null, '테마 요청'), 'n1');
  assert.match(fetch.calls[0].url, /\/repos\/2giwon\/personal-docs\/contents\/claude-theme\/request\.json$/);
});

test('테마 저장소(claudefoliothemes/claude-code-themes)의 파일을 raw 로 받는다', async () => {
  const fetch = fakeFetch(() => res(200, 'hello'));
  const gh = createGitHub({ token: 'tk', fetch });
  assert.equal(await gh.themeText('.claude-plugin/marketplace.json'), 'hello');
  const buf = await gh.themeBytes('previews/harvest-home.mp4');
  assert.equal(new TextDecoder().decode(buf), 'hello');
  assert.match(fetch.calls[0].url, /\/repos\/claudefoliothemes\/claude-code-themes\/contents\/\.claude-plugin\/marketplace\.json$/);
  assert.equal(fetch.calls[0].init.headers.Accept, 'application/vnd.github.raw');
});
