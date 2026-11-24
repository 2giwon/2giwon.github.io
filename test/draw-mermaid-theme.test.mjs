import { test } from 'node:test';
import assert from 'node:assert/strict';

// 흐름도를 처음 그리는 중에 화면 밝기를 바꾸면, 늦게 끝난 첫 그림이 예전 테마로 덮으면 안 된다(codex P2 11-24).
// 이 파일은 따로 도는 프로세스라 전역을 가짜 DOM 으로 바꿔도 다른 테스트에 번지지 않는다.
class El {
  constructor() {
    this.isConnected = true;
    this.children = [];
    this.dataset = {};
    this.innerHTML = '';
  }
  append(x) {
    this.children.push(x);
  }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  replaceChildren(...x) {
    this.children = x;
  }
}
globalThis.Node = El;
globalThis.document = { createElement: () => new El(), getElementById: () => null, documentElement: new El() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.CSS = { supports: () => true }; // light-dark() 를 아는 브라우저
let frame;
globalThis.requestAnimationFrame = (f) => {
  frame = f;
};
const pending = [];
globalThis.mermaid = {
  theme: null,
  initialize(c) {
    this.theme = c.theme;
  },
  render() {
    const theme = this.theme;
    return new Promise((resolve) => pending.push(() => resolve({ svg: theme })));
  },
};

const { initTheme, cycleChoice, currentTheme } = await import('../app/theme.mjs');
const { figureBox, redrawForTheme } = await import('../app/draw.mjs');

test('첫 흐름도를 그리는 중에 어둡게로 바꾸면 마지막에 남는 그림은 어두운 테마다', async () => {
  initTheme();
  const box = figureBox({ type: 'mermaid', code: 'flowchart LR; A-->B' });
  const first = frame();
  while (pending.length === 0) await Promise.resolve();
  cycleChoice(); // 자동 → 밝게
  cycleChoice(); // 밝게 → 어둡게
  assert.equal(currentTheme(), 'dark');
  const redraw = redrawForTheme();
  for (let i = 0; i < 1000 && pending.length < 2; i += 1) await Promise.resolve();
  assert.equal(pending.length, 2, '그리는 중인 흐름도도 새 테마로 다시 그려야 한다');
  pending[1](); // 새 테마 그림이 먼저 끝나고
  await redraw;
  pending[0](); // 예전 테마 그림이 늦게 끝난다
  await first;
  assert.equal(box.children[0].innerHTML, 'dark');
});
