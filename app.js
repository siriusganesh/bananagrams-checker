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

// --- Definitions ---------------------------------------------------------
//
// NWL2023 is a game word list, not a dictionary. No free definition source
// covers all 196,601 entries, so a single API call is not enough. The
// lookup widens in two directions before it reports a miss:
//
//   1. Two sources in parallel: the Free Dictionary API and Wiktionary.
//      Wiktionary carries many inflections and obscure game-list entries
//      that the Free Dictionary API returns 404 for.
//   2. Base forms. ROIDS has no entry of its own, ROID does. See
//      defn-lemma.js for the candidate rules.
//
// Every request has its own timeout and the whole lookup has a budget, so
// a slow or dead source cannot leave the panel on "looking up...".

const DEFN_REQUEST_TIMEOUT_MS = 7000;   // per HTTP request
const DEFN_BUDGET_MS = 14000;           // whole lookup, all sources and forms
const DEFN_MAX_BASE_FORMS = 2;          // extra forms to try after the exact word

// word -> Promise<entry>. The promise is cached, not a mutable object, so
// a second lookup of the same word joins the first instead of reading a
// half-filled record.
const DEFN_CACHE = new Map();

// Wiktionary first: measured coverage of this word list is much better, and
// it holds the inflections and archaic forms a game list is full of
// (ROIDS -> "plural of roid", CINQ -> "archaic form of cinque").
const DEFN_SOURCES = [
  {
    name: "wiktionary",
    url: w => `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`,
    parse: parseWiktionary,
  },
  {
    name: "dictionaryapi.dev",
    url: w => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`,
    parse: parseFreeDictionary,
  },
];

// Resolves rather than throws. status 0 means the request never answered
// (offline, CORS, DNS, or the abort below).
async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return { status: r.status };
    return { status: 200, data: await r.json() };
  } catch (err) {
    return { status: 0, message: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
}

function parseFreeDictionary(data) {
  if (!Array.isArray(data) || !data[0]) return { phonetic: "", senses: [] };
  const first = data[0];
  const senses = [];
  for (const m of (first.meanings || [])) {
    const d = (m.definitions || [])[0];
    if (d && d.definition) senses.push({ pos: m.partOfSpeech || "", text: d.definition });
    if (senses.length === 3) break;
  }
  return { phonetic: String(first.phonetic || "").trim(), senses };
}

function parseWiktionary(data) {
  const groups = (data && data.en) || [];
  const senses = [];
  for (const g of groups) {
    const d = (g.definitions || [])[0];
    if (!d || !d.definition) continue;
    const text = stripMarkup(d.definition);
    if (text) senses.push({ pos: g.partOfSpeech || "", text });
    if (senses.length === 3) break;
  }
  return { phonetic: "", senses };
}

// Wiktionary returns definition bodies as HTML fragments. Drop the tags and
// decode the handful of entities that survive. The result is escaped again
// by escapeHtml before it reaches the DOM.
function stripMarkup(html) {
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/g, (_, e) => ({
      amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'",
    }[e]))
    .replace(/\s+/g, " ")
    .trim();
}

async function trySource(source, form) {
  const r = await fetchJson(source.url(form), DEFN_REQUEST_TIMEOUT_MS);
  if (r.status === 404) return { state: "missing" };
  if (r.status !== 200) return { state: "error" };
  const parsed = source.parse(r.data);
  if (!parsed.senses.length) return { state: "missing" };
  return {
    state: "ok",
    source: source.name,
    matched: form,
    phonetic: parsed.phonetic,
    senses: parsed.senses,
  };
}

// Resolves as soon as any source returns an entry, so one dead source cannot
// hold up a live one. When nothing has an entry it waits for every source to
// settle, so it can tell "no entry anywhere" from "a source never answered".
function firstEntry(attempts) {
  return new Promise(resolve => {
    if (!attempts.length) { resolve({ state: "missing" }); return; }
    let pending = attempts.length;
    let sawError = false;
    let settled = false;
    for (const a of attempts) {
      a.then(r => {
        if (settled) return;
        if (r.state === "ok") { settled = true; resolve(r); return; }
        if (r.state === "error") sawError = true;
        if (--pending === 0) { settled = true; resolve({ state: sawError ? "error" : "missing" }); }
      });
    }
  });
}

function baseForms(word) {
  const lemma = (typeof DefnLemma !== "undefined") ? DefnLemma : null;
  if (!lemma) return [];
  return lemma.candidates(word).slice(0, DEFN_MAX_BASE_FORMS);
}

// "missing" means every source answered and none had an entry.
// "error" means at least one source never answered, so a miss is not proven.
async function lookupDefinition(word) {
  const deadline = Date.now() + DEFN_BUDGET_MS;
  const forms = [word].concat(baseForms(word));
  let sawError = false;

  for (const form of forms) {
    if (Date.now() > deadline) { sawError = true; break; }
    const r = await firstEntry(DEFN_SOURCES.map(s => trySource(s, form)));
    if (r.state === "ok") return r;
    if (r.state === "error") sawError = true;
  }
  return { state: sawError ? "error" : "missing" };
}

function fetchDefinition(word) {
  let p = DEFN_CACHE.get(word);
  if (!p) {
    p = lookupDefinition(word).catch(err => ({
      state: "error",
      message: String((err && err.message) || err),
    }));
    DEFN_CACHE.set(word, p);
  }
  return p;
}

function wiktionaryLink(word) {
  return `<a class="defn-link" href="https://en.wiktionary.org/wiki/${encodeURIComponent(word)}"` +
         ` target="_blank" rel="noopener">look it up on Wiktionary &#8599;</a>`;
}

function renderDefinition(result) {
  const w = result.word;
  els.definition.classList.remove("hidden", "loading", "missing", "error");
  if (!w || !result.legal) {
    els.definition.classList.add("hidden");
    els.definition.innerHTML = "";
    return;
  }
  els.definition.innerHTML =
    `<span class="defn-label">definition</span> ` +
    `<span class="defn-loading">looking up &ldquo;${escapeHtml(w.toUpperCase())}&rdquo;&hellip;</span>`;

  fetchDefinition(w).then(entry => {
    if (clean(els.letters.value) !== w) return; // stale

    if (entry.state === "ok") {
      const rows = entry.senses.map(s =>
        `<div class="defn-row">
          <span class="defn-pos">${escapeHtml(s.pos)}</span>
          <span class="defn-text">${escapeHtml(s.text)}</span>
        </div>`).join("");
      const viaBase = entry.matched !== w
        ? ` <span class="defn-src">base form ${escapeHtml(entry.matched.toUpperCase())}</span>`
        : "";
      els.definition.innerHTML =
        `<span class="defn-label">definition</span>` +
        (entry.phonetic ? ` <span class="defn-phon">${escapeHtml(entry.phonetic)}</span>` : "") +
        viaBase +
        `<div class="defn-list">${rows}</div>` +
        `<div class="defn-foot"><span class="defn-src">source: ${escapeHtml(entry.source)}</span></div>`;
      return;
    }

    if (entry.state === "missing") {
      els.definition.classList.add("missing");
      els.definition.innerHTML =
        `<span class="defn-label">definition</span> ` +
        `<span class="defn-missing">${escapeHtml(w.toUpperCase())} is legal in NWL2023, but no free ` +
        `dictionary source has an entry for it. Game word lists include many words that general ` +
        `dictionaries leave out.</span>` +
        `<div class="defn-foot">${wiktionaryLink(w)}</div>`;
      return;
    }

    els.definition.classList.add("error");
    els.definition.innerHTML =
      `<span class="defn-label">definition</span> ` +
      `<span class="defn-missing">The definition sources did not answer. This says nothing about ` +
      `${escapeHtml(w.toUpperCase())}; the verdict above is still correct.</span>` +
      `<div class="defn-foot">${wiktionaryLink(w)}</div>`;
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
