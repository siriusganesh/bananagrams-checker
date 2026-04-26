"use strict";

const els = {
  letters: document.getElementById("letters"),
  check: document.getElementById("check"),
  status: document.getElementById("status"),
  verdict: document.getElementById("verdict"),
  results: document.getElementById("results"),
  resultsSummary: document.querySelector(".results-summary"),
  fullBox: document.querySelector('[data-group="full"]'),
  subBox: document.querySelector('[data-group="sub"]'),
};

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
  return `<span class="word">${w}</span>`;
}

function run() {
  const v = els.letters.value;
  renderVerdict(v);
  renderArrangements(v);
}

els.check.addEventListener("click", run);
els.letters.addEventListener("keydown", e => {
  if (e.key === "Enter") run();
});

loadDict().catch(err => {
  els.status.textContent = "Failed to load dictionary: " + err.message;
});
