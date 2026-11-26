import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { APP_FILES, recoveryStep, RECOVERY_KEY, refreshAppFiles } from '../app/app-files.mjs';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('F1. 새로 받을 파일 목록은 app 폴더의 화면 파일(.mjs, .css)과 같다(빠지면 그 파일만 옛것으로 남는다)', () => {
  const actual = walk('app')
    .filter((p) => /\.(mjs|css)$/.test(p))
    .map((p) => p.split('\\').join('/'))
    .sort();
  assert.deepEqual([...APP_FILES].sort(), actual);
});

test('F2. 화면 코드가 같은 사이트의 파일을 새로 받을 수 있게 CSP connect-src 에 self 가 있다', () => {
  const html = readFileSync('index.html', 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src'));
  assert.match(connect, /'self'/);
  assert.match(connect, /https:\/\/api\.github\.com/);
});

test('F4. 새로 받기는 파일 내용을 끝까지 받은 뒤에 끝난다(중간에 다시 열면 받다 만 파일이 남는다, codex P2)', async () => {
  let bodiesRead = 0;
  const slowFetch = (url, opts) => {
    assert.equal(opts.cache, 'reload');
    return Promise.resolve({ text: () => new Promise((r) => setTimeout(() => r((bodiesRead += 1)), 5)) });
  };
  await refreshAppFiles(slowFetch);
  assert.equal(bodiesRead, APP_FILES.length);
});

test('F4. 파일 하나를 못 받아도 나머지는 받고 끝난다', async () => {
  let n = 0;
  await refreshAppFiles(() => (n++ === 0 ? Promise.reject(new Error('net')) : Promise.resolve({ text: async () => '' })));
  assert.equal(n, APP_FILES.length);
});

test('F3. 그리기에 실패하면 이번 탭에서 처음 한 번만 새로 받고 다시 열고, 그래도 실패하면 안내만 한다', () => {
  assert.equal(recoveryStep(null), 'refresh');
  assert.equal(recoveryStep('1'), 'show');
  assert.equal(RECOVERY_KEY, 'worknote-recovered');
});
