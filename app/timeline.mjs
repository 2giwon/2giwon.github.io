// 최근 타임라인: 파일 이름 앞 날짜(YYYY-MM-DD)로 최근 며칠 안의 문서를 모은다(자동 그림).
// 두 README 의 작업 히스토리 형식이 서로 달라서(11-09 확인) 파일 이름 날짜를 공통 기준으로 쓴다.

function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/** @returns {{date:string, repo:string, path:string, label:string, projectId:string}[]} 날짜 최신순 */
export function recentTimeline(catalog, today, days = 14) {
  const from = dayNumber(today) - (days - 1); // 오늘 포함 days 일 — 막대 그래프의 날짜 칸과 같은 범위
  return catalog.groups
    .flatMap((g) => [...g.projects, ...g.archived])
    .flatMap((p) => p.docs.map((d) => ({ ...d, projectId: p.id, label: p.label })))
    .filter((d) => d.date && dayNumber(d.date) >= from && dayNumber(d.date) <= dayNumber(today))
    .sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path))
    .map(({ date, repo, path, label, projectId }) => ({ date, repo, path, label, projectId }));
}
