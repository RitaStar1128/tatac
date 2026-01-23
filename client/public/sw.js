const CACHE_NAME = "kaimono-cache-v2";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // 直ちに新しいSWを有効化
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  // APIリクエストなどはキャッシュしない
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // キャッシュがあればそれを即座に返す（高速化の鍵）
      // 同時にバックグラウンドでネットワークから最新を取得してキャッシュを更新する (Stale-While-Revalidate)
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // 有効なレスポンスのみキャッシュする
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // オフライン時は何もしない（キャッシュがあればそれが使われる）
      });

      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    Promise.all([
      // 古いキャッシュの削除
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // クライアントの制御を即座に開始
      self.clients.claim()
    ])
  );
});
