// 토큰 저장. localStorage 를 쓴다 — 폰에서 한 번 넣으면 1년 동안 다시 넣지 않아도 되게 하려는 것이고
// (sessionStorage 는 탭을 닫으면 사라진다), 토큰은 두 문서 repo 읽기 권한만 가진다.

const KEY = 'worknote.token';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOON_DAYS = 14;

/** 저장된 토큰을 꺼낸다. 없거나 깨졌으면 null. */
export function loadToken(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.token !== 'string' || !v.token) return null;
    return { token: v.token, expiresOn: DATE.test(v.expiresOn ?? '') ? v.expiresOn : null };
  } catch {
    return null;
  }
}

/** 토큰과 (선택) 만료일 YYYY-MM-DD 를 저장한다. 빈 토큰이면 throw. */
export function saveToken(storage, { token, expiresOn = null }) {
  const t = String(token ?? '').trim();
  if (!t) throw new Error('토큰이 비었습니다');
  const e = DATE.test(String(expiresOn ?? '').trim()) ? String(expiresOn).trim() : null;
  storage.setItem(KEY, JSON.stringify({ token: t, expiresOn: e }));
}

export function clearToken(storage) {
  storage.removeItem(KEY);
}

function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/**
 * 만료일 기준 상태. 만료일 당일까지는 쓸 수 있고, 14일 전부터 'soon'.
 * @returns {'ok'|'soon'|'expired'|'unknown'}
 */
export function expiryStatus(expiresOn, today) {
  if (!DATE.test(expiresOn ?? '') || !DATE.test(today ?? '')) return 'unknown';
  const left = dayNumber(expiresOn) - dayNumber(today);
  if (left < 0) return 'expired';
  if (left <= SOON_DAYS) return 'soon';
  return 'ok';
}
