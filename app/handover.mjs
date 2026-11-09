// 핸드오프 원문에서 상태판 카드에 쓸 세 칸(지금 상태, 다음 할 일, 미결)을 뽑는다.
// 그림 데이터에 card 가 있으면 그것이 우선이다. 핸드오프마다 h2 제목이 제각각이라(11-09 확인)
// 제목 키워드로 찾는 것은 그림 데이터가 아직 없을 때의 예비책이다.

import { normalizeHeading } from './docview.mjs';

const MAX = 3;
const KINDS = [
  ['state', /지금 상태|현재 상태|어디까지|^(\d+\.\s*)?상태/],
  ['open', /미결|리스크|아직 안 정한/],
  ['next', /다음/],
];

function clean(line) {
  return line
    .replace(/^\s*([-*+]|\d+\.)\s+/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemsOf(lines) {
  const items = lines.filter((l) => /^([-*+]|\d+\.)\s+/.test(l)).map(clean).filter(Boolean);
  if (items.length) return items.slice(0, MAX);
  const para = lines.find((l) => l.trim() && !/^\s*(\||```|>|#)/.test(l));
  return para ? [clean(para)] : [];
}

/** @returns {{state:string[], next:string[], open:string[], source:'figures'|'headings'|'none'}} */
export function handoverCard(md, figures) {
  if (figures?.card) {
    const { state = [], next = [], open = [] } = figures.card;
    return { state, next, open, source: 'figures' };
  }
  const card = { state: [], next: [], open: [] };
  const found = new Set();
  let current = null;
  let lines = [];
  const flush = () => {
    if (current && !found.has(current)) {
      card[current] = itemsOf(lines);
      found.add(current);
    }
  };
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flush();
      const title = normalizeHeading(h2[1]);
      current = KINDS.find(([, re]) => re.test(title))?.[0] ?? null;
      lines = [];
    } else if (current) {
      lines.push(line);
    }
  }
  flush();
  return { ...card, source: found.size ? 'headings' : 'none' };
}
