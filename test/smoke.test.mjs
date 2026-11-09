import { test } from 'node:test';
import assert from 'node:assert/strict';

// 화면 코드는 브라우저에서 돌지만, 모듈을 불러오는 순간에는 document 를 만지지 않는다.
// 그래야 순수 로직 모듈을 Node 테스트에서 그대로 불러올 수 있다.
test('시작 모듈은 브라우저가 아니어도 오류 없이 불러와진다', async () => {
  const mod = await import('../app/main.mjs');
  assert.equal(typeof mod.start, 'function');
});
