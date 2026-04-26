"use strict";

const els = {
  letters: document.getElementById("letters"),
  check: document.getElementById("check"),
  status: document.getElementById("status"),
  verdict: document.getElementById("verdict"),
  definition: document.getElementById("definition"),
  results: document.getElementById("results"),
  resultsSummary: document.querySelector(".results-summary"),
  fullBox: document.querySelector('[data-group="full"]'),
  subBox: document.querySelector('[data-group="sub"]'),
};

const DEFN_CACHE = new Map();

let WORKER = null;
let WORKER_READY = false;
let MSG_ID = 0;
const PENDING = new Map(); // id -> { resolve, reject }

// inline-fallback state when no worker is available
let DICT = null;
let WORDS_BY_KEY = null;
let WORDS_LIST = null;

function clean(s) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function sortedKey(s) {
  return s.split("").sort().join("");
}

function send(type, payload) {
  return new Promise((resolve, reject) => {
    const id = ++MSG_ID;
    PENDING.set(id, { resolve, reject });
    WORKER.postMessage({ id, type, ...payload });
  });
}

function startWorker() {
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker("worker.js");
    } catch (err) { reject(err); return; }
    w.onmessage = (e) => {
      const msg = e.data;
      const p = PENDING.get(msg.id);
      if (!p) return;
      PENDING.delete(msg.id);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
    w.onerror = (e) => reject(new Error(e.message || "worker error"));
    WORKER = w;
    resolve();
  });
}

async function loadDict() {
  els.status.textContent = "loading dictionary…";
  try {
    await startWorker();
    const r = await send("load", { url: "words.txt" });
    WORKER_READY = true;
    els.status.textContent = `${r.count.toLocaleString()} words · ${r.ms} ms`;
    els.check.disabled = false;
    els.check.textContent = "check";
  } catch (err) {
    // fallback: parse on main thread (older browsers / no Worker)
    await fetchAndParseInline();
  }
}

async function fetchAndParseInline() {
  const t0 = performance.now();
  const res = await fetch("words.txt");
  if (!res.ok) throw new Error("Could not load words.txt");
  const text = await res.text();
  const lines = text.split("\n");
  DICT = new Set();
  WORDS_BY_KEY = new Map();
  WORDS_LIST = [];
  for (const raw of lines) {
    const w = raw.trim();
    if (!w) continue;
    DICT.add(w);
    WORDS_LIST.push(w);
    const k = sortedKey(w);
    let arr = WORDS_BY_KEY.get(k);
    if (!arr) { arr = []; WORDS_BY_KEY.set(k, arr); }
    arr.push(w);
  }
  const ms = Math.round(performance.now() - t0);
  els.status.textContent = `${DICT.size.toLocaleString()} words · ${ms} ms`;
  els.check.disabled = false;
  els.check.textContent = "check";
}

// Inline-fallback query: same shape as the worker's response
function inlineQuery(word) {
  const w = clean(word);
  if (!w) return { word: "", legal: false, full: [], sub: [] };
  const legal = DICT.has(w);
  const full = (WORDS_BY_KEY.get(sortedKey(w)) || []).slice().sort();
  const pool = new Array(26).fill(0);
  for (let i = 0; i < w.length; i++) pool[w.charCodeAt(i) - 97]++;
  const subByLen = new Map();
  outer: for (const word of WORDS_LIST) {
    if (word.length >= w.length) continue;
    const c = new Array(26).fill(0);
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i) - 97;
      if (code < 0 || code > 25) continue outer;
      c[code]++;
      if (c[code] > pool[code]) continue outer;
    }
    let arr = subByLen.get(word.length);
    if (!arr) { arr = []; subByLen.set(word.length, arr); }
    arr.push(word);
  }
  const sub = Array.from(subByLen.keys())
    .sort((a, b) => b - a)
    .map(L => ({ length: L, words: subByLen.get(L).slice().sort() }));
  return { word: w, legal, full, sub };
}

async function queryDict(word) {
  if (WORKER_READY) {
    const m = await send("query", { word });
    return m.result;
  }
  return inlineQuery(word);
}

function renderVerdict(result) {
  const w = result.word;
  els.verdict.classList.remove("hidden", "good", "bad");
  if (!w) {
    els.verdict.classList.add("hidden");
    els.verdict.innerHTML = "";
    return;
  }
  if (result.legal) {
    els.verdict.classList.add("good");
    els.verdict.innerHTML = `<span class="verdict-mark">legal</span> <span class="verdict-word">${w.toUpperCase()}</span> <span class="verdict-note">is a valid Bananagrams word.</span>`;
  } else {
    els.verdict.classList.add("bad");
    els.verdict.innerHTML = `<span class="verdict-mark">not legal</span> <span class="verdict-word">${w.toUpperCase()}</span> <span class="verdict-note">is not in the dictionary.</span>`;
  }
}

function renderArrangements(result) {
  const w = result.word;
  els.results.classList.toggle("hidden", !w);
  if (!w) return;

  const subTotal = result.sub.reduce((a, g) => a + g.words.length, 0);
  els.resultsSummary.textContent =
    `${result.full.length} full · ${subTotal} sub · pool ${w.toUpperCase()}`;

  els.fullBox.innerHTML = result.full.length
    ? result.full.map(wordTile).join("")
    : `<span class="empty-note">No words use all those letters.</span>`;

  els.subBox.innerHTML = result.sub.length
    ? result.sub.map(g => `<div class="length-group">
        <div class="length-head"><span class="length-label">${g.length} letters</span><span class="length-count">${g.words.length}</span></div>
        <div class="words">${g.words.map(wordTile).join("")}</div>
      </div>`).join("")
    : `<span class="empty-note">No sub-anagrams.</span>`;
}

function wordTile(w) {
  return `<button type="button" class="word" data-word="${w}">${w}</button>`;
}

let RUN_TOKEN = 0;

async function run() {
  const myToken = ++RUN_TOKEN;
  const v = els.letters.value;
  const result = await queryDict(v);
  if (myToken !== RUN_TOKEN) return; // stale
  renderVerdict(result);
  renderDefinition(result);
  renderArrangements(result);
}

document.body.addEventListener("click", e => {
  const t = e.target.closest(".word");
  if (!t) return;
  const w = t.dataset.word;
  if (!w) return;
  els.letters.value = w.toUpperCase();
  run();
  els.letters.focus();
  if (typeof els.letters.scrollIntoView === "function") {
    els.letters.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

els.check.addEventListener("click", run);
els.letters.addEventListener("keydown", e => {
  if (e.key === "Enter") run();
});

// --- Definitions (Free Dictionary API) -----------------------------------

async function fetchDefinition(word) {
  if (DEFN_CACHE.has(word)) return DEFN_CACHE.get(word);
  const entry = { state: "loading" };
  DEFN_CACHE.set(word, entry);
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (r.status === 404) {
      entry.state = "missing";
    } else if (!r.ok) {
      entry.state = "error";
    } else {
      const data = await r.json();
      entry.state = "ok";
      entry.payload = data;
    }
  } catch (err) {
    entry.state = "error";
    entry.message = String(err);
  }
  return entry;
}

function renderDefinition(result) {
  const w = result.word;
  els.definition.classList.remove("hidden", "loading", "missing", "error");
  if (!w || !result.legal) {
    els.definition.classList.add("hidden");
    els.definition.innerHTML = "";
    return;
  }
  els.definition.innerHTML = `<span class="defn-label">definition</span> <span class="defn-loading">looking up &ldquo;${w.toUpperCase()}&rdquo;&hellip;</span>`;

  fetchDefinition(w).then(entry => {
    if (clean(els.letters.value) !== w) return; // stale
    if (entry.state === "ok") {
      const meanings = (entry.payload[0]?.meanings || []).slice(0, 3);
      const phon = (entry.payload[0]?.phonetic || "").trim();
      const blocks = meanings.map(m => {
        const def = (m.definitions || [])[0];
        if (!def) return "";
        return `<div class="defn-row">
          <span class="defn-pos">${m.partOfSpeech || ""}</span>
          <span class="defn-text">${escapeHtml(def.definition)}</span>
        </div>`;
      }).join("");
      els.definition.innerHTML =
        `<span class="defn-label">definition</span>` +
        (phon ? ` <span class="defn-phon">${escapeHtml(phon)}</span>` : "") +
        `<div class="defn-list">${blocks || '<span class="defn-missing">(no definition body returned)</span>'}</div>`;
    } else if (entry.state === "missing") {
      els.definition.classList.add("missing");
      els.definition.innerHTML = `<span class="defn-label">definition</span> <span class="defn-missing">no public definition found for &ldquo;${w.toUpperCase()}&rdquo;.</span>`;
    } else {
      els.definition.classList.add("error");
      els.definition.innerHTML = `<span class="defn-label">definition</span> <span class="defn-missing">lookup failed.</span>`;
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

loadDict().catch(err => {
  els.status.textContent = "Failed to load dictionary: " + err.message;
});
