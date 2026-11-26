// 테마 갤러리의 순수 로직(11-26). Claude 데스크톱 앱 테마(ClaudeFolio 마켓플레이스) 목록 읽기,
// 테마 요청 파일 만들기, 맥 Claude Usage Bar 앱이 쓴 결과와 합쳐 진행 상태 계산.
// 용어는 personal-docs/claude-usage-bar/terminology.md (테마, 테마 갤러리, 테마 요청, 적용)

import { THEME_KO } from './theme-ko.mjs';

/** 테마 요청과 결과는 personal-docs 에 둔다. 웹은 요청만 쓰고, 결과는 맥 앱이 쓴다. */
export const THEME_DOCS_REPO = 'personal-docs';
export const THEME_REQUEST_PATH = 'claude-theme/request.json';
export const THEME_STATUS_PATH = 'claude-theme/status.json';

/** 라이트 모드에서만 제대로 보이는 테마(테마 저장소 README 기준) */
const LIGHT = new Set(['morning-light', 'sakura-day', 'clean-slate']);
const TITLE_OVERRIDE = { 'oled-black': 'OLED Black' };

/** 테마 이름 규칙. 경로 문자나 대문자가 들어간 이름은 요청에도 화면에도 쓰지 않는다. */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isThemeName = (v) => typeof v === 'string' && v.length <= 64 && NAME_RE.test(v);

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * marketplace.json 글에서 테마 이름 목록을 뽑는다(파일 순서 그대로).
 * @returns {{ok:true, themes:string[]} | {ok:false, error:string}}
 */
export function parseMarketplace(text) {
  const raw = parseJson(text);
  if (raw === undefined) return { ok: false, error: 'JSON 형식이 아닙니다' };
  if (!raw || !Array.isArray(raw.plugins)) return { ok: false, error: 'plugins 목록이 없습니다' };
  const themes = raw.plugins.map((p) => p?.name).filter(isThemeName);
  return { ok: true, themes: [...new Set(themes)] };
}

export const isLightTheme = (name) => LIGHT.has(name);

export function themeTitle(name) {
  return TITLE_OVERRIDE[name] ?? name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** 번역이 있으면 한국어, 없으면 영어 원문, 둘 다 없으면 빈 문자열 */
export function themeDescription(name, english) {
  return THEME_KO[name] ?? (typeof english === 'string' ? english : '');
}

const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** 요청 파일 글을 읽는다. 모양이 틀리면 null. @returns {{theme:string, requestedAt:string}|null} */
export function parseThemeRequest(text) {
  const raw = parseJson(text);
  if (!raw || !isThemeName(raw.theme) || !isIso(raw.requestedAt)) return null;
  return { theme: raw.theme, requestedAt: raw.requestedAt };
}

/**
 * 맥 앱이 쓴 결과 파일을 읽는다.
 * @returns {{ok:true, data:{current:string|null, installed:string[], last:{theme:string, result:'applied'|'failed', reason:string, at:string}|null}} | {ok:false, error:string}}
 */
export function parseThemeStatus(text) {
  const raw = parseJson(text);
  if (raw === undefined) return { ok: false, error: 'JSON 형식이 아닙니다' };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.installed)) return { ok: false, error: 'installed 목록이 없습니다' };
  const l = raw.last;
  const last =
    l && isThemeName(l.theme) && (l.result === 'applied' || l.result === 'failed') && isIso(l.at)
      ? {
          theme: l.theme,
          result: l.result,
          reason: typeof l.reason === 'string' ? l.reason : '',
          at: l.at,
          requestedAt: isIso(l.requestedAt) ? l.requestedAt : null,
        }
      : null;
  return {
    ok: true,
    data: {
      current: isThemeName(raw.current) ? raw.current : null,
      installed: raw.installed.filter(isThemeName),
      last,
    },
  };
}

/** 요청 파일로 쓸 글. 목록에 없는 이름이면 throw(엉뚱한 플러그인을 요청하지 않게). */
export function makeThemeRequest(name, knownThemes, now = new Date()) {
  if (!isThemeName(name) || !knownThemes.includes(name)) throw new Error(`모르는 테마: ${name}`);
  return `${JSON.stringify({ version: 1, theme: name, requestedAt: now.toISOString() }, null, 2)}\n`;
}

/**
 * 요청과 결과를 합친 진행 상태.
 * - none: 요청이 없다
 * - waiting: 요청 뒤의 결과가 아직 없다(맥 앱이 아직 가져가지 않음). minutes = 요청 뒤 지난 분
 * - applied / failed: 이 요청의 결과가 있다. failed 면 reason
 * 맥 앱은 결과에 처리한 요청의 시각(requestedAt)을 남긴다. 폰과 맥 시계가 달라도 되게 그 값이 같은지로 본다(리뷰 11-26).
 * 그 값이 없는 예전 결과만 시각 앞뒤로 본다.
 */
export function themeProgress(request, status, nowMs = Date.now()) {
  if (!request) return { state: 'none' };
  const last = status?.last;
  const same = last?.requestedAt
    ? Date.parse(last.requestedAt) === Date.parse(request.requestedAt)
    : last && Date.parse(last.at) >= Date.parse(request.requestedAt);
  if (last && last.theme === request.theme && same) {
    return { state: last.result, theme: request.theme, reason: last.reason };
  }
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(request.requestedAt)) / 60000));
  return { state: 'waiting', theme: request.theme, minutes };
}
