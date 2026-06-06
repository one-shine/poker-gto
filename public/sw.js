// GTO Lab Service Worker — オフライン対応 (アプリシェル + フォント資産プリキャッシュ + 同一オリジン資産の runtime cache)。
// CACHE 名と PRECACHE_FONTS はビルド後に scripts/inject-sw-precache.mjs がプレースホルダを実値へ置換する。
const CACHE = '__CACHE_VERSION__'
// 相対パス: SW は base 配下(例 /poker-gto/sw.js)に配信され、相対URLは自身の URL 基準で解決される。
// これによりルート配信(custom domain)でもサブパス配信(Pages)でも同じコードが動く。
const SHELL = ['./', './index.html', './manifest.json', './favicon.svg']
const PRECACHE_FONTS = __PRECACHE_FONTS__ // ビルドで dist/assets/*.woff2 を注入 (完全オフライン保証)

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([...SHELL, ...PRECACHE_FONTS]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // クロスオリジンは素通し

  // ナビゲーションは network-first(更新を優先)、オフライン時はキャッシュにフォールバック
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(r => r || caches.match('./'))),
    )
    return
  }

  // ハッシュ付き資産は stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(res => {
          if (res.ok && res.type !== 'opaque') caches.open(CACHE).then(c => c.put(request, res.clone()))
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
