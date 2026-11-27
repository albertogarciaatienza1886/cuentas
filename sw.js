// Service worker: la app abre al instante con lo guardado en el móvil y, por detrás, se descarga la
// versión nueva para la próxima vez («stale-while-revalidate»). Sin conexión también abre.
const CACHE = 'cuentas-v2';
const ARCHIVOS = ['./', './index.html', './styles.css', './app.js', './parser.js', './mock.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Solo los archivos de la propia app; las llamadas a la hoja (Google) van siempre directas.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const guardado = await cache.match(req, { ignoreSearch: true });
    const deRed = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (guardado) {
      e.waitUntil(deRed); // actualiza en segundo plano
      return guardado;
    }
    return (await deRed) || (await cache.match('./index.html')) || Response.error();
  }));
});
