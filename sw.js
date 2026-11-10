// Service worker do Megafut: guarda o jogo no aparelho para abrir sem internet.
const VERSAO = "megafut-e3c1ff79b5eb";
const ARQUIVOS = [
 "./",
 "./index.html",
 "./manifest.webmanifest",
 "./app.js",
 "./motor_worker.js",
 "./pacote.json",
 "./mapa_americas.json",
 "./pyodide.mjs",
 "./pyodide.asm.mjs",
 "./pyodide.asm.wasm",
 "./pyodide-lock.json",
 "./python_stdlib.wasm",
 "./icone-192.png",
 "./icone-512.png",
 "./icone-mascaravel-512.png",
 "./apple-touch-icon.png"
];

self.addEventListener("install", (evento) => {
  // cache "reload": baixa direto do servidor, sem pegar cópia velha do navegador
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("megafut-") && n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  // Fontes do Google: usa a cópia guardada e atualiza por trás quando houver internet
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    evento.respondWith(caches.open("megafut-fontes").then(async (cache) => {
      const guardada = await cache.match(pedido);
      const rede = fetch(pedido).then((r) => { if (r && (r.ok || r.type === "opaque")) cache.put(pedido, r.clone()); return r; }).catch(() => guardada);
      return guardada || rede;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (pedido.mode === "navigate") {
    evento.respondWith(caches.match("./index.html").then((r) => r || fetch(pedido)));
    return;
  }
  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then((r) => r || fetch(pedido).then((resposta) => {
      if (resposta && resposta.ok) caches.open(VERSAO).then((cache) => cache.put(pedido, resposta.clone()));
      return resposta;
    }))
  );
});
