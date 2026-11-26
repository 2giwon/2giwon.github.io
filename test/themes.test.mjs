import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarketplace,
  themeTitle,
  themeDescription,
  isLightTheme,
  parseThemeStatus,
  parseThemeRequest,
  makeThemeRequest,
  themeProgress,
  THEME_REQUEST_PATH,
  THEME_STATUS_PATH,
} from '../app/themes.mjs';
import { THEME_KO } from '../app/theme-ko.mjs';

const market = (names) =>
  JSON.stringify({
    name: 'claudefolio-themes',
    plugins: names.map((name) => ({ name, source: { source: 'archive', url: `https://x/${name}.zip`, sha256: 'a'.repeat(64) } })),
  });

// ─── W1: 목록과 표시 ──────────────────────────────────────────────────────────

test('W1. marketplace.json 에서 테마 이름을 순서대로 뽑는다', () => {
  const r = parseMarketplace(market(['digital-rain', 'harvest-home', 'clean-slate']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.themes, ['digital-rain', 'harvest-home', 'clean-slate']);
});

test('W1. 이름 규칙에 맞지 않는 항목(경로, 대문자, 빈 값)은 뺀다', () => {
  const r = parseMarketplace(market(['ok-one', '../evil', 'Bad', '', 'two']));
  assert.deepEqual(r.themes, ['ok-one', 'two']);
});

test('W1. 라이트 모드 테마는 morning-light, sakura-day, clean-slate 세 개', () => {
  assert.equal(isLightTheme('morning-light'), true);
  assert.equal(isLightTheme('sakura-day'), true);
  assert.equal(isLightTheme('clean-slate'), true);
  assert.equal(isLightTheme('harvest-home'), false);
});

test('W1. 제목은 이름을 단어마다 대문자로, OLED Black 은 예외', () => {
  assert.equal(themeTitle('harvest-home'), 'Harvest Home');
  assert.equal(themeTitle('oled-black'), 'OLED Black');
});

// ─── W2: 실패와 빈 상태 ───────────────────────────────────────────────────────

test('W2. 깨진 JSON 은 실패, plugins 가 없으면 실패', () => {
  assert.equal(parseMarketplace('{').ok, false);
  assert.equal(parseMarketplace('{"name":"x"}').ok, false);
});

test('W2. plugins 가 빈 배열이면 성공이고 목록이 비어 있다(실패와 구분)', () => {
  const r = parseMarketplace(market([]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.themes, []);
});

// ─── W3: 설명 언어 ────────────────────────────────────────────────────────────

test('W3. 번역이 있으면 한국어, 없으면 영어 원문, 둘 다 없으면 빈 문자열', () => {
  assert.equal(themeDescription('harvest-home', 'English'), THEME_KO['harvest-home']);
  assert.equal(themeDescription('brand-new-theme', 'English text'), 'English text');
  assert.equal(themeDescription('brand-new-theme', null), '');
});

test('W3. 지금 있는 45개 테마는 전부 한국어 번역이 있다', () => {
  assert.equal(Object.keys(THEME_KO).length, 45);
  for (const v of Object.values(THEME_KO)) assert.ok(typeof v === 'string' && v.length > 5);
});

// ─── W4: 요청과 결과 합치기 ───────────────────────────────────────────────────

const status = (over) => ({
  version: 1,
  current: 'pixel-cafe',
  installed: ['pixel-cafe', 'sky-clock'],
  last: null,
  ...over,
});

test('W4. 상태 파일을 읽는다. 모양이 틀리면 실패', () => {
  const r = parseThemeStatus(JSON.stringify(status({ last: { theme: 'sky-clock', result: 'applied', reason: '', at: '2026-11-26T10:00:00Z' } })));
  assert.equal(r.ok, true);
  assert.equal(r.data.current, 'pixel-cafe');
  assert.deepEqual(r.data.installed, ['pixel-cafe', 'sky-clock']);
  assert.equal(r.data.last.result, 'applied');
  assert.equal(parseThemeStatus('nope').ok, false);
  assert.equal(parseThemeStatus('{"version":1}').ok, false);
});

test('W4. 요청이 없으면 none', () => {
  assert.equal(themeProgress(null, status(), Date.parse('2026-11-26T10:00:00Z')).state, 'none');
});

test('W4. 요청 뒤의 결과가 없으면 waiting 과 몇 분 지났는지', () => {
  const req = { theme: 'harvest-home', requestedAt: '2026-11-26T10:00:00Z' };
  const p = themeProgress(req, status(), Date.parse('2026-11-26T10:03:30Z'));
  assert.equal(p.state, 'waiting');
  assert.equal(p.theme, 'harvest-home');
  assert.equal(p.minutes, 3);
});

test('W4. 상태 파일이 없어도(맥 앱 연결 전) 요청은 waiting', () => {
  const req = { theme: 'harvest-home', requestedAt: '2026-11-26T10:00:00Z' };
  assert.equal(themeProgress(req, null, Date.parse('2026-11-26T10:00:00Z')).state, 'waiting');
});

test('W4. 같은 테마의 결과가 요청보다 늦으면 applied 또는 failed(이유 포함)', () => {
  const req = { theme: 'harvest-home', requestedAt: '2026-11-26T10:00:00Z' };
  const ok = status({ current: 'harvest-home', last: { theme: 'harvest-home', result: 'applied', reason: '', at: '2026-11-26T10:01:00Z' } });
  assert.equal(themeProgress(req, ok, 0).state, 'applied');
  const bad = status({ last: { theme: 'harvest-home', result: 'failed', reason: 'SHA-256 불일치', at: '2026-11-26T10:01:00Z' } });
  const p = themeProgress(req, bad, 0);
  assert.equal(p.state, 'failed');
  assert.equal(p.reason, 'SHA-256 불일치');
});

test('W4. 결과에 요청 시각이 있으면 시각이 같은지로 본다(맥 시계가 폰보다 늦어도 applied)', () => {
  const req = { theme: 'harvest-home', requestedAt: '2026-11-26T10:00:00.000Z' };
  const done = status({ last: { theme: 'harvest-home', result: 'applied', reason: '', at: '2026-11-26T09:58:00.000Z', requestedAt: '2026-11-26T10:00:00.000Z' } });
  const parsed = parseThemeStatus(JSON.stringify(done)).data;
  assert.equal(parsed.last.requestedAt, '2026-11-26T10:00:00.000Z');
  assert.equal(themeProgress(req, parsed, 0).state, 'applied');
  const newer = { theme: 'harvest-home', requestedAt: '2026-11-26T10:05:00.000Z' };
  assert.equal(themeProgress(newer, parsed, Date.parse('2026-11-26T10:05:00Z')).state, 'waiting');
});

test('W4. 결과가 요청보다 먼저면(예전 결과) 아직 waiting', () => {
  const req = { theme: 'harvest-home', requestedAt: '2026-11-26T10:05:00Z' };
  const old = status({ last: { theme: 'harvest-home', result: 'failed', reason: 'x', at: '2026-11-26T10:01:00Z' } });
  assert.equal(themeProgress(req, old, Date.parse('2026-11-26T10:05:00Z')).state, 'waiting');
});

// ─── W5: 요청 파일 만들기 ─────────────────────────────────────────────────────

test('W5. 요청 파일 글을 만든다(이름, 시각)', () => {
  const text = makeThemeRequest('harvest-home', ['harvest-home', 'sky-clock'], new Date('2026-11-26T10:00:00Z'));
  assert.deepEqual(JSON.parse(text), { version: 1, theme: 'harvest-home', requestedAt: '2026-11-26T10:00:00.000Z' });
  assert.ok(text.endsWith('\n'));
});

test('W5. 목록에 없는 이름은 만들지 않는다', () => {
  assert.throws(() => makeThemeRequest('evil', ['sky-clock'], new Date()));
});

test('W5. 요청 파일을 읽는다. 모양이 틀리면 null', () => {
  assert.deepEqual(parseThemeRequest('{"version":1,"theme":"sky-clock","requestedAt":"2026-11-26T10:00:00.000Z"}'), {
    theme: 'sky-clock',
    requestedAt: '2026-11-26T10:00:00.000Z',
  });
  assert.equal(parseThemeRequest('{"theme":"../x","requestedAt":"2026-11-26T10:00:00.000Z"}'), null);
  assert.equal(parseThemeRequest('x'), null);
});

test('경로는 personal-docs 의 claude-theme 폴더', () => {
  assert.equal(THEME_REQUEST_PATH, 'claude-theme/request.json');
  assert.equal(THEME_STATUS_PATH, 'claude-theme/status.json');
});
