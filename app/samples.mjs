// 디자인 샘플(11-26, 임시). 작업노트 새 디자인을 고르는 동안만 둔다. 디자인을 확정하면 이 파일, 샘플 화면, 위 막대 링크를 같이 지운다.
// 샘플 HTML 은 실제 업무 내용이 들어 있어 공개 repo 에 두지 않고 비공개 personal-docs 에 둔다. 화면이 토큰으로 읽어 그린다.

export const SAMPLES_REPO = 'personal-docs';
const SAMPLES_DIR = '2giwon.github.io/design-samples';

export const SAMPLES = [
  { id: 'all', label: 'A~K 전체' },
  { id: 'mix', label: 'H와 I 섞기' },
];

const known = (id) => SAMPLES.some((s) => s.id === id);

/** 샘플 파일 경로. 모르는 이름이면 전체 샘플(엉뚱한 경로를 읽지 않게) */
export function samplePath(id) {
  return `${SAMPLES_DIR}/${known(id) ? id : 'all'}.html`;
}

/**
 * 샘플 HTML 을 그림자 영역(Shadow DOM)에 넣을 수 있게 다듬는다.
 * - <style> 내용과 <body> 안쪽만 꺼낸다
 * - <script> 와 on... 속성(실행 코드)은 모두 지운다. 사이트 CSP 가 막기도 하지만 원본에서 아예 뺀다
 * - CSS 의 body 규칙은 그림자 영역 바깥 틀(:host) 규칙으로 바꾼다. .body, tbody 같은 이름은 건드리지 않는다
 * @returns {{ok:true, css:string, body:string, bodyClass:string} | {ok:false, error:string}}
 */
export function prepareSample(html) {
  if (typeof html !== 'string') return { ok: false, error: '샘플 파일이 글이 아닙니다' };
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) return { ok: false, error: '샘플 파일에 본문(body)이 없습니다' };
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join('\n')
    .replace(/(?<![\w.#-])body\.([\w-]+)/g, ':host(.$1)')
    .replace(/(?<![\w.#-])body(?![\w-])/g, ':host')
    // :root, html 규칙(CSS 변수 등)은 그림자 영역 안에서 아무것도 못 가리키므로 바깥 틀로 옮긴다(codex P2 11-26)
    .replace(/(?<![\w.#-]):root(?![\w-])/g, ':host')
    .replace(/(?<![\w.#:-])html(?![\w-])/g, ':host');
  // body.dark 같은 규칙이 :host(.dark) 로 바뀌므로, body 의 class 도 바깥 틀에 붙일 수 있게 돌려준다(codex P2 11-26)
  const bodyClass = (html.match(/<body[^>]*\sclass=["']([^"']*)["']/i)?.[1] ?? '')
    .split(/\s+/)
    .filter((c) => /^[\w-]+$/.test(c))
    .join(' ');
  const body = bodyMatch[1]
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return { ok: true, css, body, bodyClass };
}
