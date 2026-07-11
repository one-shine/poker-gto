// GTO Lab Service Worker — オフライン対応 (アプリシェル + フォント資産プリキャッシュ + 同一オリジン資産の runtime cache)。
// CACHE 名と PRECACHE_FONTS はビルド後に scripts/inject-sw-precache.mjs がプレースホルダを実値へ置換する。
const CACHE = '__CACHE_VERSION__'
// 相対パス: SW は base 配下(例 /poker-gto/sw.js)に配信され、相対URLは自身の URL 基準で解決される。
// これによりルート配信(custom domain)でもサブパス配信(Pages)でも同じコードが動く。
const SHELL = ['./', './index.html', './manifest.json', './favicon.svg']
const PRECACHE_FONTS = __PRECACHE_FONTS__ // ビルドで dist/assets/*.woff2 を注入 (完全オフライン保証)

// フォント(17件)は best-effort: 1件でも失敗すると起動を止めないよう個別 fetch+put を allSettled で許容する。
// 取り逃したフォントはオンライン時に fetch ハンドラ(stale-while-revalidate)が後追いで埋める。
async function precacheBestEffort(cache, urls) {
  await Promise.allSettled(
    urls.map(async url => {
      const res = await fetch(url)
      if (res.ok) await cache.put(url, res)
    }),
  )
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache => {
        // 必須シェルは原子的にキャッシュする。1件(特に './')でも失敗したら addAll が throw →
        // install ごと reject → ブラウザが次回ナビゲーションで install を再試行する(回線が安定した時点で
        // シェル一式が確実に入る=完全オフライン保証)。best-effort にすると './' 欠落でも install 成功扱いに
        // なり二度と再試行されず、オフライン起動が恒久的に不成立になる。
        await cache.addAll(SHELL)
        await precacheBestEffort(cache, PRECACHE_FONTS) // フォントは best-effort(起動をブロックしない)
      })
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
