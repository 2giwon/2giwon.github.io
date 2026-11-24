import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_KEY, readChoice, saveChoice, nextChoice, resolveTheme, figureColors, choiceLabel } from '../app/theme.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    raw: map,
  };
}

const broken = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

test('저장한 값이 없으면 자동이다', () => {
  assert.equal(readChoice(memoryStorage()), 'auto');
});

test('저장한 밝게, 어둡게를 그대로 읽는다', () => {
  const s = memoryStorage();
  saveChoice(s, 'dark');
  assert.equal(readChoice(s), 'dark');
  saveChoice(s, 'light');
  assert.equal(readChoice(s), 'light');
});

test('모르는 값이 저장돼 있으면 자동으로 읽는다', () => {
  const s = memoryStorage();
  s.setItem(THEME_KEY, 'purple');
  assert.equal(readChoice(s), 'auto');
});

test('자동을 고르면 저장한 값을 지운다', () => {
  const s = memoryStorage();
  saveChoice(s, 'dark');
  saveChoice(s, 'auto');
  assert.equal(s.raw.has(THEME_KEY), false);
});

test('저장소를 못 쓰는 환경에서도 오류 없이 자동으로 동작한다', () => {
  assert.equal(readChoice(broken), 'auto');
  assert.doesNotThrow(() => saveChoice(broken, 'dark'));
  assert.equal(readChoice(null), 'auto');
});

test('토큰 지우기(worknote. 로 시작하는 키 삭제)에 화면 설정이 같이 지워지지 않는다', () => {
  assert.equal(THEME_KEY.startsWith('worknote.'), false);
});

test('버튼을 누를 때마다 자동, 밝게, 어둡게 순서로 돈다', () => {
  assert.equal(nextChoice('auto'), 'light');
  assert.equal(nextChoice('light'), 'dark');
  assert.equal(nextChoice('dark'), 'auto');
  assert.equal(nextChoice('purple'), 'light');
});

test('버튼 글자는 지금 고른 값을 보여 준다', () => {
  assert.equal(choiceLabel('auto'), '화면: 자동');
  assert.equal(choiceLabel('light'), '화면: 밝게');
  assert.equal(choiceLabel('dark'), '화면: 어둡게');
});

test('자동이면 기기 설정을 따르고, 직접 고르면 기기 설정과 상관없다', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('다크모드를 못 그리는 브라우저(light-dark() 없음)는 무엇을 골라도 밝은 화면이다', () => {
  assert.equal(resolveTheme('auto', true, false), 'light');
  assert.equal(resolveTheme('dark', false, false), 'light');
});

test('그림 색: 밝은 화면은 지금 값 그대로, 어두운 화면은 흐름도 dark 테마와 밝은 글자', () => {
  assert.deepEqual(figureColors('light'), { mermaid: 'neutral', text: '#666', grid: 'rgba(0,0,0,0.1)', pieBorder: '#fff' });
  const dark = figureColors('dark');
  assert.equal(dark.mermaid, 'dark');
  assert.notEqual(dark.text, '#666');
  assert.notEqual(dark.pieBorder, '#fff');
});
