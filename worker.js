"use strict";

let DICT = null;
let WORDS_BY_KEY = null;
let WORDS_LIST = null;

function sortedKey(s) {
  return s.split("").sort().join("");
}

function letterCounts(s) {
  const c = new Array(26).fill(0);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i) - 97;
    if (code >= 0 && code < 26) c[code]++;
  }
  return c;
}

function fitsInPool(word, pool) {
  const c = new Array(26).fill(0);
  for (let i = 0; i < word.length; i++) {
    const code = word.charCodeAt(i) - 97;
    if (code < 0 || code > 25) return false;
    c[code]++;
    if (c[code] > pool[code]) return false;
  }
  return true;
}

async function load(url) {
  const t0 = (self.performance && performance.now) ? performance.now() : Date.now();
  const res = await fetch(url || "words.txt");
  if (!res.ok) throw new Error("words.txt fetch failed: " + res.status);
  const text = await res.text();
  const lines = text.split("\n");
  DICT = new Set();
  WORDS_BY_KEY = new Map();
  WORDS_LIST = new Array(lines.length);
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const w = lines[i].trim();
    if (!w) continue;
    DICT.add(w);
    WORDS_LIST[n++] = w;
    const k = sortedKey(w);
    let arr = WORDS_BY_KEY.get(k);
    if (!arr) { arr = []; WORDS_BY_KEY.set(k, arr); }
    arr.push(w);
  }
  WORDS_LIST.length = n;
  const t1 = (self.performance && performance.now) ? performance.now() : Date.now();
  return { count: DICT.size, ms: Math.round(t1 - t0) };
}

function query(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return { word: "", legal: false, full: [], sub: [] };
  const legal = DICT.has(w);
  const full = (WORDS_BY_KEY.get(sortedKey(w)) || []).slice().sort();
  const pool = letterCounts(w);
  const subByLen = new Map();
  for (let i = 0; i < WORDS_LIST.length; i++) {
    const word = WORDS_LIST[i];
    if (word.length >= w.length) continue;
    if (!fitsInPool(word, pool)) continue;
    let arr = subByLen.get(word.length);
    if (!arr) { arr = []; subByLen.set(word.length, arr); }
    arr.push(word);
  }
  const sub = Array.from(subByLen.keys())
    .sort((a, b) => b - a)
    .map(L => ({ length: L, words: subByLen.get(L).slice().sort() }));
  return { word: w, legal, full, sub };
}

self.addEventListener("message", async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === "load") {
      const r = await load(msg.url);
      self.postMessage({ id: msg.id, type: "ready", count: r.count, ms: r.ms });
    } else if (msg.type === "query") {
      self.postMessage({ id: msg.id, type: "result", result: query(msg.word) });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, type: "error", message: String(err && err.message || err) });
  }
});
