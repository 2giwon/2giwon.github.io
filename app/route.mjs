// 주소 해석. GitHub Pages 에는 서버 주소 규칙이 없어서 # 뒤 주소(hash)로 화면을 나눈다.
// #/ 상태판, #/doc/<repo>/<경로> 문서, #/folders[/<repo>/<폴더>] 폴더,
// #/media/<repo>/<폴더> 샘플 재생(그 폴더의 index.json 을 읽는다), #/video 영상 자동화, #/themes 테마 갤러리,
// #/samples[/mix] 디자인 샘플(11-26, 지우지 않고 남겨 둔다)

function decode(p) {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

export function parseRoute(hash) {
  const parts = String(hash ?? '')
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decode);
  if (parts[0] === 'doc' && parts.length >= 3) return { name: 'doc', repo: parts[1], path: parts.slice(2).join('/') };
  if (parts[0] === 'folders') return { name: 'folders', repo: parts[1] ?? null, folder: parts.slice(2).join('/') || null };
  if (parts[0] === 'media' && parts.length >= 3) return { name: 'media', repo: parts[1], folder: parts.slice(2).join('/') };
  if (parts[0] === 'video') return { name: 'video' };
  if (parts[0] === 'themes') return { name: 'themes' };
  if (parts[0] === 'samples') return { name: 'samples', sample: parts[1] === 'mix' ? 'mix' : 'all' };
  return { name: 'dashboard' };
}
