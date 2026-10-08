/* 離線快取:第一次打開後把遊戲需要的檔案都存起來,之後沒網路也能開 */
const CACHE_NAME = 'llxxl-cache-v41';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/ui/diary_card_bg.jpg',
  './assets/ui/home_bg.webp',
  './assets/ui/icon_diary.webp',
  './assets/ui/icon_endless.gif',
  './assets/ui/icon_gift.webp',
  './assets/ui/icon_postcard.webp',
  './assets/ui/icon_status_avatar.webp',
  './assets/ui/icon_piggy.webp',
  './assets/ui/coin.webp',
  './assets/ui/coin2.webp',
  './assets/ui/milestone_card_bg.jpg',
  './assets/ui/xiaobiga_anim.gif',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 網頁本體(index.html)一律優先打網路拿最新版,避免玩家卡在舊版本(舊的 style.css/game.js 版本號)出不來,
  // 只有離線時才退回快取;其他靜態資源(圖片等)才用快取優先,减少流量。
  const isNavigation = event.request.mode === 'navigate' ||
    event.request.url.endsWith('/') || event.request.url.endsWith('/index.html');
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他静态资源(图片、带 ?v= 的 js/css):缓存优先,没有才下载。以前每次打开都会在背景把所有图片重新下载一遍,
  // 网速慢时会跟首页要看的图抢频宽。图片内容有更新时,记得把上面的 CACHE_NAME 版本号加一。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
