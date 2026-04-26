"use strict";

// Bump when any cached file changes
const CACHE_VERSION = "v5";
const CACHE_NAME = `bananagrams-${CACHE_VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css?v=5",
  "./app.js?v=5",
  "./worker.js",
  "./words.txt",
  "./fonts/ibm-plex-mono-400-latin.woff2",
  "./fonts/ibm-plex-mono-500-latin.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategy:
//   - HTML (navigate requests): network-first, fall back to cache
//     so a fresh deploy is picked up but offline still works.
//   - Everything else (CSS/JS/fonts/words.txt): cache-first
//     since we cache-bust via ?v= on changes.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Don't try to handle cross-origin (e.g. dictionary API).
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((r) => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return r;
      });
    })
  );
});
