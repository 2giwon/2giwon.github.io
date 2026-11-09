// 그림 갱신 순서. 상태판 카드에서 바로 이어지는 문서부터 그림을 만든다(결정: 처음에는 최근 문서부터).

const RECENT_DAYS = 30;

function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/**
 * @param {{path:string, date:string|null, state:'none'|'stale'|'fresh', latestHandover:boolean}[]} entries
 * @returns 같은 모양, 최신 그림(fresh)은 빠지고 갱신할 순서대로
 */
export function orderForRefresh(entries, today) {
  const todo = entries.filter((x) => x.state !== 'fresh');
  const isRecent = (x) => x.date && dayNumber(today) - dayNumber(x.date) <= RECENT_DAYS;
  const newestFirst = (a, b) => (b.date ?? '').localeCompare(a.date ?? '');
  const oldestFirst = (a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  };
  const handovers = todo.filter((x) => x.latestHandover).sort(newestFirst);
  const recent = todo.filter((x) => !x.latestHandover && isRecent(x)).sort(newestFirst);
  const rest = todo.filter((x) => !x.latestHandover && !isRecent(x)).sort(oldestFirst);
  return [...handovers, ...recent, ...rest];
}
