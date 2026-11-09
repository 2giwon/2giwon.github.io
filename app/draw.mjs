// 그림 데이터 한 개를 그린다. 그림 하나가 실패해도 그 자리에만 실패를 표시하고 문서는 계속 그린다.
// Mermaid, Chart.js 는 index.html 이 vendor 파일로 불러 둔 전역(window.mermaid, window.Chart)이다.

import { h, failure } from './dom.mjs';

let mermaidReady = false;
let seq = 0;
// Chart.js 는 만든 그래프를 전역에 붙잡아 둔다. 화면을 바꿀 때 떨어져 나간 그래프를 정리한다(codex P2 11-09)
const charts = new Set();

function makeChart(canvas, config) {
  charts.add(new globalThis.Chart(canvas, config));
}

/** 화면에서 떨어져 나간 그래프를 정리한다. 화면을 바꿀 때마다 부른다. */
export function disposeDetachedCharts() {
  for (const c of charts) {
    if (!c.canvas?.isConnected) {
      c.destroy();
      charts.delete(c);
    }
  }
}

let mermaidLoading = null;

/** 흐름도 도구를 처음 필요할 때 한 번만 받아 온다(5.5MB 라 첫 화면을 막지 않게). */
function loadMermaid() {
  if (globalThis.mermaid) return Promise.resolve();
  if (!mermaidLoading) {
    mermaidLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/mermaid.min.js', import.meta.url).href;
      s.onload = () => resolve();
      s.onerror = () => {
        mermaidLoading = null; // 다음 그림에서 다시 시도
        reject(new Error('흐름도 도구를 받지 못했습니다'));
      };
      document.head.append(s);
    });
  }
  return mermaidLoading;
}

async function ensureMermaid() {
  await loadMermaid();
  const m = globalThis.mermaid;
  if (!m) throw new Error('Mermaid 를 불러오지 못했습니다');
  if (!mermaidReady) {
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true });
    mermaidReady = true;
  }
  return m;
}

const PALETTE = ['#1f6feb', '#e0823d', '#2da44e', '#a371f7', '#cf222e', '#6e7781'];

async function drawMermaid(box, f) {
  const id = `mmd-${++seq}`;
  // Mermaid 가 그리는 동안 body 에 임시 요소를 남길 수 있다. 결과 svg 도 같은 id 를 쓰므로
  // 반드시 임시 요소를 먼저 치운 뒤 결과를 넣는다(순서가 바뀌면 방금 넣은 그림이 지워진다).
  const cleanup = () => {
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  };
  let svg;
  try {
    ({ svg } = await (await ensureMermaid()).render(id, f.code));
  } finally {
    cleanup();
  }
  box.replaceChildren(h('div', { class: 'fig-mermaid', html: svg }));
}

function drawChart(box, f) {
  const Chart = globalThis.Chart;
  if (!Chart) throw new Error('그래프 도구를 불러오지 못했습니다');
  const canvas = h('canvas', { role: 'img', 'aria-label': `${f.kind} 그래프` });
  box.replaceChildren(h('div', { class: `fig-chart fig-chart-${f.kind}` }, canvas));
  const pie = f.kind === 'pie';
  makeChart(canvas, {
    type: f.kind,
    data: {
      labels: f.labels,
      datasets: f.series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: pie ? f.labels.map((_, j) => PALETTE[j % PALETTE.length]) : PALETTE[i % PALETTE.length],
        borderColor: pie ? '#fff' : PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: pie || f.series.length > 1, position: 'bottom' } },
    },
  });
}

function drawCards(box, f) {
  box.replaceChildren(
    h(
      'div',
      { class: 'fig-cards' },
      f.items.map((c) => h('div', { class: `fig-card tone-${c.tone ?? 'info'}` }, h('strong', null, c.title), c.body ? h('p', null, c.body) : null))
    )
  );
}

function drawTable(box, f) {
  box.replaceChildren(
    h(
      'div',
      { class: 'fig-table' },
      h(
        'table',
        null,
        h('thead', null, h('tr', null, f.columns.map((c) => h('th', null, c)))),
        h('tbody', null, f.rows.map((r) => h('tr', null, r.map((v) => h('td', null, String(v ?? ''))))))
      )
    )
  );
}

function drawProgress(box, f) {
  box.replaceChildren(
    h(
      'div',
      { class: 'fig-progress' },
      f.items.map((p) =>
        h(
          'div',
          { class: 'progress-row' },
          h('span', { class: 'progress-label' }, p.label),
          h('span', { class: 'progress-bar' }, h('span', { style: `width:${Math.round((p.done / p.total) * 100)}%` })),
          h('span', { class: 'progress-num' }, `${p.done}/${p.total}`)
        )
      )
    )
  );
}

/** 그림 자리를 만들어 돌려주고, 그리기는 비동기로 채운다. */
export function figureBox(f) {
  const box = h('div', { class: `figure figure-${f.type}` }, h('div', { class: 'skeleton fig-skeleton', 'aria-label': '그림 그리는 중' }));
  // 화면에 붙은 뒤 그린다(그래프는 크기를 재야 한다)
  requestAnimationFrame(async () => {
    try {
      if (f.type === 'invalid') throw new Error(f.reason);
      if (f.type === 'mermaid') await drawMermaid(box, f);
      else if (f.type === 'chart') drawChart(box, f);
      else if (f.type === 'cards') drawCards(box, f);
      else if (f.type === 'table') drawTable(box, f);
      else if (f.type === 'progress') drawProgress(box, f);
      else throw new Error(`알 수 없는 그림 종류: ${f.type}`);
    } catch (e) {
      console.warn('[worknote] 그림 실패', e);
      const why = String(e?.message ?? e).split('\n')[0].slice(0, 80);
      box.replaceChildren(failure(`그림을 그리지 못했습니다 (${why})`));
    }
  });
  return box;
}

/** 자동 그림: 최근 며칠 문서 수를 날짜별 회사, 개인으로 쌓은 막대. */
export function timelineChart(items, todayIso, days) {
  const box = h('div', { class: 'figure fig-chart fig-chart-timeline' });
  const labels = [];
  const base = new Date(`${todayIso}T00:00:00`);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    labels.push(d.toLocaleDateString('sv-SE'));
  }
  const count = (repo) => labels.map((l) => items.filter((x) => x.date === l && x.repo === repo).length);
  requestAnimationFrame(() => {
    try {
      const Chart = globalThis.Chart;
      if (!Chart) throw new Error('그래프 도구를 불러오지 못했습니다');
      const canvas = h('canvas', { role: 'img', 'aria-label': `최근 ${days}일 문서 수 막대 그래프` });
      box.replaceChildren(canvas);
      makeChart(canvas, {
        type: 'bar',
        data: {
          labels: labels.map((l) => `${+l.slice(5, 7)}/${+l.slice(8, 10)}`),
          datasets: [
            { label: '회사', data: count('labmanager-docs'), backgroundColor: PALETTE[0] },
            { label: '개인', data: count('personal-docs'), backgroundColor: PALETTE[1] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: { x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, ticks: { precision: 0 } } },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    } catch (e) {
      box.replaceChildren(failure(`타임라인을 그리지 못했습니다 (${e?.message ?? e})`));
    }
  });
  return box;
}
