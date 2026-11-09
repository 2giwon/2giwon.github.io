// 한 번 받은 원문을 폰 브라우저(IndexedDB)에 지문별로 저장한다. 지문이 같으면 내용도 같아서 지울 일이 없다.
// IndexedDB 를 못 쓰는 환경(사생활 보호 창 등)에서는 저장 없이 그냥 동작한다.

const DB = 'worknote';
const STORE = 'blobs';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = open().catch(() => null);
  return dbPromise;
}

function run(mode, fn) {
  return db().then(
    (d) =>
      d &&
      new Promise((resolve) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result ?? null);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      })
  );
}

export const cache = {
  get: (sha) => run('readonly', (s) => s.get(sha)).catch(() => null),
  put: (sha, text) => run('readwrite', (s) => s.put(text, sha)).catch(() => null),
  clear: () => run('readwrite', (s) => s.clear()).catch(() => null),
};
