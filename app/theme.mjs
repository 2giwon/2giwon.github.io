// 화면 밝기(11-24). 처음에는 기기 설정(prefers-color-scheme)을 따르고, 위 막대 버튼으로 자동, 밝게, 어둡게를 고른다.
// 색은 style.css 의 light-dark() 가 칠한다. 이 모듈은 <html data-theme> 만 바꾸고, 그림(흐름도, 그래프) 색을 알려 준다.
// 모듈을 불러올 때는 document 를 만지지 않는다(Node 테스트가 그대로 불러온다).

// 'worknote.' 로 시작하면 '토큰 지우기'가 같이 지운다. 화면 설정은 토큰과 상관없어서 남겨 둔다
export const THEME_KEY = 'worknote-theme';
const CHOICES = ['auto', 'light', 'dark'];
const LABEL = { auto: '자동', light: '밝게', dark: '어둡게' };

/** 저장한 선택을 읽는다. 없거나 모르는 값이거나 저장소를 못 쓰면 자동. */
export function readChoice(storage) {
  let v = null;
  try {
    v = storage?.getItem(THEME_KEY) ?? null;
  } catch {
    return 'auto';
  }
  return CHOICES.includes(v) ? v : 'auto';
}

/** 선택을 저장한다. 자동은 기본값이라 지운다. 저장소를 못 쓰면 이번 화면에서만 적용된다. */
export function saveChoice(storage, choice) {
  try {
    if (choice === 'auto') storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, choice);
  } catch {
    // 사생활 보호 창 등. 저장 없이 넘어간다
  }
}

export function nextChoice(choice) {
  const i = Math.max(0, CHOICES.indexOf(choice)); // 모르는 값은 자동으로 본다
  return CHOICES[(i + 1) % CHOICES.length];
}

export function choiceLabel(choice) {
  return `화면: ${LABEL[choice] ?? LABEL.auto}`;
}

/**
 * 실제로 보일 모드. 자동이면 기기 설정을 따른다.
 * light-dark() 를 모르는 브라우저는 CSS 가 밝은 색만 칠하므로 그림도 밝게 그린다(화면과 그림이 어긋나지 않게).
 */
export function resolveTheme(choice, systemDark, supported = true) {
  if (!supported) return 'light';
  if (choice === 'light' || choice === 'dark') return choice;
  return systemDark ? 'dark' : 'light';
}

/** 그림 색. 밝은 화면은 원래 값(Chart.js 기본값, Mermaid neutral) 그대로 둔다. */
export function figureColors(theme) {
  if (theme === 'dark') return { mermaid: 'dark', text: '#8d96a0', grid: 'rgba(240,246,252,0.12)', pieBorder: '#161b22' };
  return { mermaid: 'neutral', text: '#666', grid: 'rgba(0,0,0,0.1)', pieBorder: '#fff' };
}

// ─── 브라우저에서만 ───────────────────────────────────────────────

let choice = 'auto';
let media = null;
const listeners = new Set();

function systemDark() {
  return Boolean(media?.matches);
}

/** 이 브라우저가 다크모드 색(style.css 의 light-dark())을 그릴 수 있는지. 못 그리면 버튼을 숨긴다. */
export function themeSupported() {
  try {
    return Boolean(globalThis.CSS?.supports?.('color', 'light-dark(#000, #fff)'));
  } catch {
    return false;
  }
}

function apply() {
  // 자동이면 속성을 지워 CSS 가 기기 설정을 따르게 한다(스크립트가 돌기 전에도 같은 색이라 깜빡이지 않는다)
  if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = choice;
}

function notify() {
  const theme = currentTheme();
  for (const fn of listeners) fn(theme);
}

/** 시작할 때 한 번. 저장한 선택을 적용하고 기기 설정이 바뀌는 것을 지켜본다. */
export function initTheme() {
  choice = readChoice(globalThis.localStorage);
  media = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  media?.addEventListener?.('change', () => {
    if (choice === 'auto') notify();
  });
  apply();
}

export function currentChoice() {
  return choice;
}

export function currentTheme() {
  return resolveTheme(choice, systemDark(), themeSupported());
}

/** 버튼이 부른다. 다음 선택으로 바꾸고 저장한 뒤, 바뀐 선택을 돌려준다. */
export function cycleChoice() {
  const before = currentTheme();
  choice = nextChoice(choice);
  saveChoice(globalThis.localStorage, choice);
  apply();
  if (currentTheme() !== before) notify();
  return choice;
}

/** 보이는 모드가 바뀔 때 부를 함수를 등록한다(그림 다시 칠하기). */
export function onThemeChange(fn) {
  listeners.add(fn);
}
