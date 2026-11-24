import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, iconSvg, themeIconName } from '../app/icons.mjs';

test('위 막대 아이콘 6개가 모두 있다', () => {
  for (const name of ['folder', 'refresh', 'auto', 'sun', 'moon', 'key-off']) assert.ok(ICONS[name], name);
});

test('아이콘은 화면 읽기 프로그램이 건너뛰는 24칸 SVG 이고, 색은 글자색을 따른다', () => {
  for (const name of Object.keys(ICONS)) {
    const svg = iconSvg(name);
    assert.match(svg, /^<svg /, name);
    assert.match(svg, /viewBox="0 0 24 24"/, name);
    assert.match(svg, /aria-hidden="true"/, name);
    assert.match(svg, /stroke="currentColor"/, name);
    assert.match(svg, /<\/svg>$/, name);
  }
});

test('모르는 아이콘 이름이면 빈 글자를 돌려준다(화면이 깨지지 않게)', () => {
  assert.equal(iconSvg('nope'), '');
});

test('화면 밝기 버튼은 지금 고른 값을 아이콘으로 보여 준다', () => {
  assert.equal(themeIconName('auto'), 'auto');
  assert.equal(themeIconName('light'), 'sun');
  assert.equal(themeIconName('dark'), 'moon');
  assert.equal(themeIconName('purple'), 'auto');
});
