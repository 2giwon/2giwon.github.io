// 영상 자동화 작업 화면의 데이터. TASKS.md 의 체크 목록을 묶음과 진행률로 바꾼다.
// 순수 로직만 둔다(Node 테스트가 이 파일을 그대로 불러온다).

export const VIDEO_REPO = 'personal-docs';
export const VIDEO_TASKS_PATH = 'video-pipeline/TASKS.md';
/**
 * 샘플 묶음. 폴더마다 index.json 하나를 읽는다. 음성이 먼저 들어왔고
 * 나중에 클립과 앵커 이미지도 폴더를 하나 더 두는 식으로 붙인다.
 */
export const VIDEO_SAMPLES = [
  { label: '목소리 고르기', folder: 'video-pipeline/media/voice-test' },
  { label: '말 속도', folder: 'video-pipeline/media/speed-test' },
];

/** `- [ ]` 의 가운데 글자 → 상태. TASKS.md 머리말에 적어 둔 규칙과 같다. */
const STATUS = { ' ': 'todo', x: 'done', X: 'done', '~': 'doing', '!': 'blocked' };

export const STATUS_LABEL = { todo: '안 함', doing: '진행 중', done: '끝', blocked: '막힘' };

/** 설명을 이만큼까지만 보여 준다. 전문은 원문 문서에서 본다 */
const DETAIL_MAX = 300;

/** 보여 줄 때만 쓰는 꾸밈 글자를 떼어 낸다(굵게, 코드, 링크). 뜻을 담은 이모지는 남긴다. */
function plain(s) {
  return String(s)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/**
 * `D1 소재 확정과 출처 검증` → { id:'D1', title:'소재 확정과 출처 검증' }
 * 쪼갠 작업은 `T2-1` 처럼 하이픈이 붙는다(11-22에 T2 를 T2-1, T2-2 로 나누면서 드러났다).
 */
function splitId(text) {
  const m = /^([A-Z]\d+(?:-\d+)*)\s+(.*)$/.exec(text);
  return m ? { id: m[1], title: m[2].trim() } : { id: null, title: text };
}

/**
 * 체크 목록 한 줄을 항목으로. 굵게 쓴 앞부분이 제목이고 그 뒤가 설명이다.
 * 예: `- [x] **D1 소재 확정** — 압구정 용봉차일 사건` → done / D1 / 소재 확정 / 압구정 ...
 */
function parseItem(mark, rest) {
  const bold = /^\s*\*\*(.+?)\*\*\s*(.*)$/.exec(rest);
  const head = bold ? bold[1] : rest.replace(/\s*[—-]\s.*$/, '');
  const tail = bold ? bold[2] : rest.slice(head.length);
  const { id, title } = splitId(plain(head));
  return {
    status: STATUS[mark] ?? 'todo',
    id,
    title,
    detail: plain(tail.replace(/^\s*[—-]\s*/, '')),
  };
}

/**
 * TASKS.md → 묶음 목록과 진행률. 제목(##, ###)마다 묶음을 만들고 그 아래 체크 목록을 담는다.
 * 체크 목록이 없는 묶음은 버린다(머리말, 설명만 있는 절).
 * @returns {{groups:{heading:string, level:number, items:object[]}[], progress:{done:number, total:number}}}
 */
export function parseTaskList(md) {
  const groups = [];
  let cur = null;
  let last = null;

  for (const raw of String(md ?? '').split('\n')) {
    const heading = /^(#{2,3})\s+(.*)$/.exec(raw);
    if (heading) {
      cur = { heading: plain(heading[2]), level: heading[1].length, items: [] };
      groups.push(cur);
      last = null;
      continue;
    }
    const item = /^\s*-\s*\[(.)\]\s*(.*)$/.exec(raw);
    if (item) {
      if (!cur) {
        cur = { heading: '', level: 2, items: [] };
        groups.push(cur);
      }
      last = parseItem(item[1], item[2]);
      cur.items.push(last);
      continue;
    }
    // 들여쓴 이어지는 줄은 바로 위 항목의 설명에 붙인다(한 항목이 여러 줄로 적혀 있다).
    // 표는 뺀다 — 항목 안에 표를 적어 둔 곳이 있고(T3 의 모델 용량 표), 그대로 붙이면
    // 설명이 세로줄 기호 범벅이 된다. 표는 원문에서 보면 된다.
    if (last && /^\s{2,}\S/.test(raw)) {
      const t = raw.trim();
      if (t.startsWith('|') || /^[-=\s|:]+$/.test(t)) continue;
      const more = plain(raw);
      if (more) last.detail = last.detail ? `${last.detail} ${more}` : more;
      continue;
    }
    if (!raw.trim()) continue;
    last = null;
  }

  const kept = groups.filter((g) => g.items.length);
  const all = kept.flatMap((g) => g.items);
  // 설명이 긴 항목이 있어서 목록 화면이 글 벽이 된다. 여기서 자르고 전문은 원문에서 본다
  for (const it of all) if (it.detail.length > DETAIL_MAX) it.detail = `${it.detail.slice(0, DETAIL_MAX).trimEnd()}…`;
  return {
    groups: kept,
    progress: { done: all.filter((i) => i.status === 'done').length, total: all.length },
  };
}

/** 지금 손댈 것. 진행 중이 있으면 그것, 없으면 첫 안 함. 막힌 것이 있으면 그게 먼저다. */
export function nextUp(groups) {
  const all = groups.flatMap((g) => g.items);
  return all.find((i) => i.status === 'blocked') ?? all.find((i) => i.status === 'doing') ?? all.find((i) => i.status === 'todo') ?? null;
}

/** 진행률을 백분율 정수로. 전체가 0이면 0. */
export function percent({ done, total }) {
  return total ? Math.round((done / total) * 100) : 0;
}
