import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSample, SAMPLES, SAMPLES_REPO, samplePath } from '../app/samples.mjs';
import { parseRoute } from '../app/route.mjs';

const page = (style, body) => `<!doctype html><html><head><title>x</title><style>${style}</style></head><body>${body}</body></html>`;

test('S1. HTML 에서 style 내용과 본문을 꺼낸다', () => {
  const r = prepareSample(page('.a { color: red; }', '<section class="concept"><h2>A</h2></section>'));
  assert.equal(r.ok, true);
  assert.match(r.css, /\.a \{ color: red; \}/);
  assert.equal(r.body.trim(), '<section class="concept"><h2>A</h2></section>');
});

test('S2. script 와 on... 속성은 모두 지운다', () => {
  const r = prepareSample(
    page('', '<div onclick="alert(1)" class="x">a</div><script>alert(2)</script><SCRIPT src="x.js"></SCRIPT><img src=x onerror=alert(3)><a href="#a" onMouseOver=\'go()\'>b</a>')
  );
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.body, /script/i);
  assert.doesNotMatch(r.body, /\son[a-z]+\s*=/i);
  assert.match(r.body, /class="x"/);
  assert.match(r.body, /href="#a"/);
});

test('S3. CSS 의 body 규칙은 :host 로 바꾸고, .body 나 tbody 같은 이름은 그대로 둔다', () => {
  const r = prepareSample(page('body { margin: 0; } body.dark { color: #fff; } .m .body { padding: 4px; } tbody td { x: 1; }', '<p>a</p>'));
  assert.match(r.css, /:host \{ margin: 0; \}/);
  assert.match(r.css, /:host\(\.dark\) \{ color: #fff; \}/);
  assert.match(r.css, /\.m \.body \{ padding: 4px; \}/);
  assert.match(r.css, /tbody td/);
});

test('S3. :root 와 html 규칙도 :host 로 바꾼다(CSS 변수가 그림자 영역 안에서도 살게, codex P2)', () => {
  const r = prepareSample(page(':root { --a: red; } html { color: blue; } .html-box { x: 1; }', '<p>a</p>'));
  assert.match(r.css, /:host \{ --a: red; \}/);
  assert.match(r.css, /:host \{ color: blue; \}/);
  assert.match(r.css, /\.html-box/);
});

test('S3. body 의 class 를 따로 돌려준다(body.dark 규칙이 :host(.dark) 로 맞게, codex P2)', () => {
  assert.equal(prepareSample('<html><body class="dark  wide">x</body></html>').bodyClass, 'dark wide');
  assert.equal(prepareSample('<html><body>x</body></html>').bodyClass, '');
  assert.equal(prepareSample('<html><body class="a&quot;b ok">x</body></html>').bodyClass, 'ok');
});

test('S4. 본문이 없는 HTML 은 실패로 알린다', () => {
  assert.equal(prepareSample('<html><head></head></html>').ok, false);
  assert.equal(prepareSample('').ok, false);
  assert.equal(prepareSample(null).ok, false);
});

test('샘플은 personal-docs 의 2giwon.github.io/design-samples 폴더에 두 개', () => {
  assert.equal(SAMPLES_REPO, 'personal-docs');
  assert.deepEqual(
    SAMPLES.map((s) => s.id),
    ['all', 'mix']
  );
  assert.equal(samplePath('all'), '2giwon.github.io/design-samples/all.html');
  assert.equal(samplePath('mix'), '2giwon.github.io/design-samples/mix.html');
  assert.equal(samplePath('../x'), samplePath('all'));
});

test('S5. #/samples 는 전체, #/samples/mix 는 섞기, 모르는 이름은 전체', () => {
  assert.deepEqual(parseRoute('#/samples'), { name: 'samples', sample: 'all' });
  assert.deepEqual(parseRoute('#/samples/mix'), { name: 'samples', sample: 'mix' });
  assert.deepEqual(parseRoute('#/samples/../x'), { name: 'samples', sample: 'all' });
});
