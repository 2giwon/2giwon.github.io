// 상단 바로가기 버튼. 주소는 공개 repo 인 이 사이트가 아니라 비공개 personal-docs/worknote/links.json 에 둔다
// (맥의 Tailscale 주소 같은 내부 주소를 공개 repo 에 남기지 않기 위해, 11-11). 화면과 무관한 순수 로직이다.

export const LINKS_REPO = 'personal-docs';
export const LINKS_PATH = 'worknote/links.json';

/** http, https 주소만 받는다(javascript:, data: 같은 주소가 버튼이 되지 않게) */
function safeUrl(v) {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

/**
 * 바로가기 파일 글을 읽는다. 깨진 줄은 빼고, 파일 모양이 틀리면 형식 오류.
 * @returns {{ok:true, links:{title:string, url:string}[]} | {ok:false, error:string}}
 */
export function parseLinks(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다' };
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.links)) return { ok: false, error: 'links 목록이 없습니다' };
  const links = [];
  for (const l of raw.links) {
    if (!l || typeof l !== 'object') continue;
    const title = typeof l.title === 'string' ? l.title.trim() : '';
    const url = safeUrl(l.url);
    if (title && url) links.push({ title, url });
  }
  return { ok: true, links };
}
