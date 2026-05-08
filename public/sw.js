// 最低限の Service Worker (= installability 要件、 PWA 化用)。
// fetch event listener は no-op (= offline cache は別タスク)。
// install + activate は即時 SW を有効化 (= skipWaiting + clients.claim)。

self.addEventListener('install', (event) => {
  // 新 SW を即時 active 化
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 既存タブも新 SW で動作
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // no-op (= ブラウザのデフォルト fetch にフォールバック)
});
