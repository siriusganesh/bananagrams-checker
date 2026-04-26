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

const DEFN_CACHE = new Map(); // word -> { state: "loading"|"ok"|"missing"|"error", payload }

let DICT = null;          // Set<string>
let WORDS_BY_KEY = null;  // Map<sortedLetters, string[]>  -- for fast full-anagram lookup
let WORDS_LIST = null;    // string[] -- for sub-anagram scan

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

// returns true if `word`'s letters are a multiset subset of `pool` counts
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

async function loadDict() {
  els.status.textContent = "Loading dictionary...";
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

function clean(s) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function renderVerdict(input) {
  const w = clean(input);
  els.verdict.classList.remove("hidden", "good", "bad");
  if (!w) {
    els.verdict.classList.add("hidden");
    return;
  }
  if (DICT.has(w)) {
    els.verdict.classList.add("good");
    els.verdict.innerHTML = `<span class="verdict-mark">legal</span> <span class="verdict-word">${w.toUpperCase()}</span> <span class="verdict-note">is a valid Bananagrams word.</span>`;
  } else {
    els.verdict.classList.add("bad");
    els.verdict.innerHTML = `<span class="verdict-mark">not legal</span> <span class="verdict-word">${w.toUpperCase()}</span> <span class="verdict-note">is not in the dictionary.</span>`;
  }
}

function renderArrangements(input) {
  const w = clean(input);
  els.results.classList.toggle("hidden", !w);
  if (!w) return;

  // full anagrams
  const key = sortedKey(w);
  const full = (WORDS_BY_KEY.get(key) || []).slice().sort();

  // sub-anagrams: scan once
  const pool = letterCounts(w);
  const subByLen = new Map();
  for (const word of WORDS_LIST) {
    if (word.length > w.length) continue;       // can't fit
    if (word.length === w.length) continue;     // those are full anagrams
    if (!fitsInPool(word, pool)) continue;
    let arr = subByLen.get(word.length);
    if (!arr) { arr = []; subByLen.set(word.length, arr); }
    arr.push(word);
  }

  // render
  const subTotal = Array.from(subByLen.values()).reduce((a, b) => a + b.length, 0);
  els.resultsSummary.textContent =
    `${full.length} full · ${subTotal} sub · pool ${w.toUpperCase()}`;

  els.fullBox.innerHTML = full.length
    ? full.map(wordTile).join("")
    : `<span class="empty-note">No words use all those letters.</span>`;

  const lens = Array.from(subByLen.keys()).sort((a, b) => b - a);
  els.subBox.innerHTML = lens.length
    ? lens.map(L => {
        const arr = subByLen.get(L).slice().sort();
        return `<div class="length-group">
          <div class="length-head"><span class="length-label">${L} letters</span><span class="length-count">${arr.length}</span></div>
          <div class="words">${arr.map(wordTile).join("")}</div>
        </div>`;
      }).join("")
    : `<span class="empty-note">No sub-anagrams.</span>`;
}

function wordTile(w) {
  return `<button type="button" class="word" data-word="${w}">${w}</button>`;
}

function run() {
  const v = els.letters.value;
  renderVerdict(v);
  renderDefinition(v);
  renderArrangements(v);
}

// click any word tile -> use it as the new input
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

function renderDefinition(input) {
  const w = clean(input);
  els.definition.classList.remove("hidden", "loading", "missing", "error");
  if (!w || !DICT.has(w)) {
    els.definition.classList.add("hidden");
    els.definition.innerHTML = "";
    return;
  }
  els.definition.innerHTML = `<span class="defn-label">definition</span> <span class="defn-loading">looking up &ldquo;${w.toUpperCase()}&rdquo;&hellip;</span>`;

  fetchDefinition(w).then(entry => {
    // Guard: input may have changed while we were fetching
    if (clean(els.letters.value) !== w) return;

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
