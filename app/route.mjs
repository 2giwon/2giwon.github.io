// 주소 해석. GitHub Pages 에는 서버 주소 규칙이 없어서 # 뒤 주소(hash)로 화면을 나눈다.
// #/ 상태판, #/doc/<repo>/<경로> 문서, #/folders[/<repo>/<폴더>] 폴더

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
  return { name: 'dashboard' };
}
