// CAD パスポート PWA Service Worker (= offline cache、 Task 3)。
//
// 戦略:
//   - App Shell HTML (= /auth precache + 動的 navigate) → network-first
//     + cache fallback + 圏外で未訪問 URL は /auth fallback
//   - 静的アセット (= /_next/static/*, /icon*, /apple-icon,
//     /manifest.webmanifest, /favicon.ico) → cache-first (= hash 名で不変)
//   - /api/* / cross-origin (= Supabase) / /_next/data/* / 非 GET → 素通し
//     (= 認証 / DB / dynamic data は cache 不可)
//
// VERSION 運用ルール:
//   - SW logic を変えたとき (= 戦略 / route 判定 / cache 対象 etc) に
//     v1 → v2 へ手動 bump
//   - コメントだけの変更では bump 不要
//   - VERSION を bump すると、 activate 時に古い cache が全削除されて
//     再構築される (= 強制無効化)
//
// 既存挙動互換:
//   - Phase 1 (= commit 0171f22) で導入の skipWaiting + clients.claim は
//     そのまま (= 新 SW を即時 active 化)

const VERSION = 'v1';
const SHELL_CACHE = `cadpassport-shell-${VERSION}`;
const STATIC_CACHE = `cadpassport-static-${VERSION}`;

// install 時に precache する shell (= 認証必須なので /auth のみ、
// /projects は cache しても圏外で middleware redirect → /auth で意味なし)
const SHELL_URLS = ['/auth'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
  // 新 SW を即時 active 化
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('cadpassport-') && !k.endsWith(`-${VERSION}`))
            .map((k) => caches.delete(k)),
        ),
      )
      // 既存タブも新 SW で動作
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET 以外 (= POST/PUT/DELETE) は素通し
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // cross-origin (= Supabase / 外部 CDN 等) は素通し
  if (url.origin !== self.location.origin) return;
  // /api/* は素通し (= 認証 / DB、 cache 不可)
  if (url.pathname.startsWith('/api/')) return;
  // /_next/data/* は素通し (= dynamic data)
  if (url.pathname.startsWith('/_next/data/')) return;

  // /_next/static/* は cache-first (= hash 名で不変)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  // icons / manifest / favicon は cache-first
  if (
    url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.ico'
    || url.pathname.startsWith('/icon')
    || url.pathname.startsWith('/apple-icon')
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  // HTML navigate は network-first + cache fallback + /auth 最終 fallback
  if (
    req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }
  // それ以外は素通し
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // 圏外で未訪問 URL → /auth fallback (= 白画面回避)
    const fallback = await cache.match('/auth');
    if (fallback) return fallback;
    // shell すら無い (= 初回圏外起動) → ブラウザ標準のオフラインエラー
    throw new Error('offline + no cache');
  }
}
