// 그림 데이터: 원문 한 편을 그림으로 다시 그리기 위해 Claude Code 가 만들어 둔 JSON.
// 원문 repo 안 `.notes/<원문 경로>.json` 에 있다. 그림 하나가 잘못돼도 문서 전체를 버리지 않는다.

const SHA = /^[0-9a-f]{40}$/;
const CHART_KINDS = new Set(['bar', 'line', 'pie']);
const TONES = new Set(['ok', 'warn', 'risk', 'info']);

/** 원문 경로 → 그림 데이터 경로. `web/a.md` → `.notes/web/a.json` */
export function figurePathFor(mdPath) {
  if (!/\.md$/i.test(mdPath)) throw new Error(`md 문서가 아닙니다: ${mdPath}`);
  return `.notes/${mdPath.replace(/\.md$/i, '.json')}`;
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** 그림 하나를 검사한다. 문제가 있으면 이유 문자열, 없으면 null. */
function problemOf(f) {
  if (!f || typeof f !== 'object') return '그림이 객체가 아닙니다';
  switch (f.type) {
    case 'mermaid':
      return isStr(f.code) ? null : 'mermaid code 가 비었습니다';
    case 'chart': {
      if (!CHART_KINDS.has(f.kind)) return `chart kind 가 잘못됐습니다: ${f.kind}`;
      if (!Array.isArray(f.labels) || !f.labels.length) return 'chart labels 가 비었습니다';
      if (!Array.isArray(f.series) || !f.series.length) return 'chart series 가 비었습니다';
      for (const s of f.series) {
        if (!Array.isArray(s?.values) || s.values.length !== f.labels.length || !s.values.every(isNum)) {
          return 'chart values 개수가 labels 와 다릅니다';
        }
      }
      return null;
    }
    case 'cards':
      if (!Array.isArray(f.items) || !f.items.length) return 'cards items 가 비었습니다';
      for (const c of f.items) {
        if (!isStr(c?.title)) return 'cards title 이 비었습니다';
        if (c.tone !== undefined && !TONES.has(c.tone)) return `cards tone 이 잘못됐습니다: ${c.tone}`;
      }
      return null;
    case 'table':
      if (!Array.isArray(f.columns) || !f.columns.length) return 'table columns 가 비었습니다';
      if (!Array.isArray(f.rows)) return 'table rows 가 배열이 아닙니다';
      for (const r of f.rows) {
        if (!Array.isArray(r) || r.length !== f.columns.length) return 'table 행의 칸 수가 columns 와 다릅니다';
      }
      return null;
    case 'progress':
      if (!Array.isArray(f.items) || !f.items.length) return 'progress items 가 비었습니다';
      for (const p of f.items) {
        if (!isStr(p?.label) || !isNum(p.done) || !isNum(p.total) || p.total <= 0 || p.done < 0 || p.done > p.total) {
          return 'progress 의 done, total 이 잘못됐습니다';
        }
      }
      return null;
    default:
      return `알 수 없는 그림 종류: ${f?.type}`;
  }
}

function cleanCard(card) {
  if (!card || typeof card !== 'object') return null;
  return { state: strList(card.state), next: strList(card.next), open: strList(card.open) };
}

/**
 * 그림 데이터 글을 읽는다. 문서 단위 형식이 틀리면 ok:false, 그림 하나가 틀리면 그 그림만 {type:'invalid'}.
 * @returns {{ok:true, data:object} | {ok:false, error:string}}
 */
export function parseFigures(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 문법 오류: ${e.message}` };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: '객체가 아닙니다' };
  if (raw.version !== 1) return { ok: false, error: `지원하지 않는 version: ${raw.version}` };
  if (!SHA.test(raw.sourceSha ?? '')) return { ok: false, error: 'sourceSha 가 40자 16진수가 아닙니다' };
  if (!Array.isArray(raw.sections)) return { ok: false, error: 'sections 가 배열이 아닙니다' };

  const sections = raw.sections.map((s) => ({
    heading: typeof s?.heading === 'string' ? s.heading : null,
    keyPoints: strList(s?.keyPoints),
    figures: (Array.isArray(s?.figures) ? s.figures : []).map((f) => {
      const reason = problemOf(f);
      return reason ? { type: 'invalid', reason } : f;
    }),
  }));

  return {
    ok: true,
    data: {
      version: 1,
      source: typeof raw.source === 'string' ? raw.source : null,
      sourceSha: raw.sourceSha,
      summary: typeof raw.summary === 'string' ? raw.summary : null,
      card: cleanCard(raw.card),
      sections,
    },
  };
}

/**
 * (Claude 용 검사) 그림 데이터 파일 하나의 문제를 사람이 읽을 문장으로 돌려준다. 문제가 없으면 [].
 * 화면은 깨진 그림을 견디지만, 만드는 쪽에서는 하나도 남기지 않는다.
 */
export function checkFigureFile(figPath, text) {
  const r = parseFigures(text);
  if (!r.ok) return [r.error];
  const problems = [];
  if (!r.data.source || figurePathFor(r.data.source) !== figPath) {
    problems.push(`source(${r.data.source}) 가 파일 위치(${figPath})와 맞지 않습니다`);
  }
  r.data.sections.forEach((s) => {
    if (s.keyPoints.length > 3) problems.push(`[${s.heading}] keyPoints 가 3개를 넘습니다`);
    s.figures.forEach((f, i) => {
      if (f.type === 'invalid') problems.push(`[${s.heading}] ${i + 1}번째 그림: ${f.reason}`);
    });
  });
  return problems;
}

/** 그림 상태. 그림 데이터를 만든 뒤 원문이 바뀌었으면 'stale'(오래된 그림). */
export function figureState(data, currentSha) {
  if (!data) return 'none';
  return data.sourceSha === currentSha ? 'fresh' : 'stale';
}
