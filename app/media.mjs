// 샘플 목록(index.json) 해석. 음성, 영상, 이미지를 한 화면에서 비교하려고 만들었다.
// 순수 로직만 둔다(Node 테스트가 이 파일을 그대로 불러온다). GitHub 호출은 store.mjs 가 한다.

/** 확장자 → MIME. Blob 을 만들 때 쓴다. 타입을 안 주면 사파리가 재생을 거부한다. */
const MIME = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  opus: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const KIND_OF = { audio: 'audio', video: 'video', image: 'image' };

export function mimeOf(file) {
  const ext = String(file).split('.').pop().toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

/** 확장자로 종류를 정한다. index.json 의 kind 를 안 적었을 때 쓴다. */
export function kindOf(file) {
  const mime = mimeOf(file);
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'other';
}

/**
 * 파일 이름이 폴더 안쪽을 가리키는지 본다. index.json 은 내가 쓰는 파일이지만,
 * 경로가 폴더를 벗어나면(`..`, 절대 경로) 토큰 권한 안의 다른 파일을 읽게 되므로 막는다.
 */
export function isSafeName(file) {
  const s = String(file ?? '');
  if (!s || s.startsWith('/') || s.includes('\\')) return false;
  return !s.split('/').some((seg) => seg === '..' || seg === '.' || seg === '');
}

/** 폴더 + 파일 이름 → 저장소 안 경로 */
export function mediaPath(folder, file) {
  const base = String(folder ?? '').replace(/\/+$/, '');
  return base ? `${base}/${file}` : String(file);
}

/**
 * index.json 해석. 모양이 틀리면 화면이 "비어 있음"이 아니라 이유를 보여 줘야 하므로
 * ok 와 error 를 돌려준다(links.mjs, todo.mjs 와 같은 방식).
 * @returns {{ok:true, data:object} | {ok:false, error:string}}
 */
export function parseMediaIndex(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 형식이 아닙니다 (${e.message})` };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '최상위가 객체가 아닙니다' };
  if (!Array.isArray(raw.items)) return { ok: false, error: 'items 배열이 없습니다' };

  const items = [];
  for (const [i, it] of raw.items.entries()) {
    if (!it || typeof it !== 'object') return { ok: false, error: `items[${i}] 가 객체가 아닙니다` };
    if (typeof it.file !== 'string' || !it.file) return { ok: false, error: `items[${i}].file 이 없습니다` };
    if (!isSafeName(it.file)) return { ok: false, error: `items[${i}].file 이 폴더를 벗어납니다: ${it.file}` };
    const kind = KIND_OF[it.kind] ?? kindOf(it.file);
    items.push({
      file: it.file,
      kind,
      mime: mimeOf(it.file),
      label: typeof it.label === 'string' && it.label ? it.label : it.file,
      duration: Number.isFinite(it.duration) ? it.duration : null,
      badge: typeof it.badge === 'string' ? it.badge : null,
      model: typeof it.model === 'string' ? it.model : null,
      license: typeof it.license === 'string' ? it.license : null,
      size: typeof it.size === 'string' ? it.size : null,
      options: typeof it.options === 'string' ? it.options : null,
      note: typeof it.note === 'string' ? it.note : null,
    });
  }
  if (!items.length) return { ok: false, error: 'items 가 비었습니다' };

  const list = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s) : []);
  return {
    ok: true,
    data: {
      title: typeof raw.title === 'string' && raw.title ? raw.title : '샘플',
      updated: typeof raw.updated === 'string' ? raw.updated : null,
      doc: typeof raw.doc === 'string' ? raw.doc : null,
      note: typeof raw.note === 'string' ? raw.note : null,
      sentence: typeof raw.sentence === 'string' ? raw.sentence : null,
      sentenceNote: typeof raw.sentenceNote === 'string' ? raw.sentenceNote : null,
      findings: list(raw.findings),
      pending: list(raw.pending),
      items,
    },
  };
}

/** 초 → "8.80초". 길이를 모르면 빈 글자. */
export function durationText(sec) {
  return Number.isFinite(sec) ? `${sec.toFixed(2)}초` : '';
}
