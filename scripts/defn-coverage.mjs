// Measure how much of words.txt the definition sources actually cover.
//
// Manual tool, not a CI gate. It depends on two free public APIs with no
// SLA, so a gate on it would fail for reasons unrelated to the change under
// review. Run it when you change the lookup or suspect a source has
// degraded, and record the number.
//
//   node scripts/defn-coverage.mjs             # 200-word sample, seed 1
//   node scripts/defn-coverage.mjs 500 42      # 500 words, seed 42
//
// Output: hit rate per source, the gain from the base-form fallback, and
// the words that missed everywhere.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import defnLemma from "../defn-lemma.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = Number(process.argv[2] || 200);
const SEED = Number(process.argv[3] || 1);
const CONCURRENCY = 1;   // Wiktionary answers 429 above this
const TIMEOUT_MS = 8000;
const RATE_LIMIT_BACKOFF_MS = 4000;  // doubles per retry
const MIN_GAP_MS = 400;              // throttle, see ask()
const MAX_BASE_FORMS = 2;

const SOURCES = [
  {
    name: "dictionaryapi.dev",
    url: w => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`,
    hasEntry: d => Array.isArray(d) && !!(d[0]?.meanings || []).length,
  },
  {
    name: "wiktionary",
    url: w => `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`,
    hasEntry: d => !!(d?.en || []).length,
  },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Wiktionary answers 429 to an unthrottled walk even at one request at a
// time, and a throttled source looks exactly like a dead one in the totals.
// Space the requests out, back off when it still says 429, and report a
// source that keeps saying it as "throttled" rather than counting it a miss.
let lastRequestAt = 0;
async function throttle() {
  const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// Deterministic sampling so two runs are comparable.
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function sample(list, n, seed) {
  const rnd = lcg(seed);
  const picked = new Set();
  while (picked.size < Math.min(n, list.length)) {
    picked.add(list[Math.floor(rnd() * list.length)]);
  }
  return [...picked];
}

async function ask(source, word, retries = 3) {
  await throttle();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(source.url(word), { signal: ctl.signal });
    if (r.status === 404) return "missing";
    if (r.status === 429) {
      if (retries === 0) return "throttled";
      clearTimeout(timer);
      await sleep(RATE_LIMIT_BACKOFF_MS * Math.pow(2, 3 - retries));
      return ask(source, word, retries - 1);
    }
    if (!r.ok) return "error";
    return source.hasEntry(await r.json()) ? "ok" : "missing";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

async function probe(word) {
  const exact = {};
  for (const s of SOURCES) exact[s.name] = await ask(s, word);
  const exactHit = SOURCES.some(s => exact[s.name] === "ok");

  let baseHit = false;
  let baseForm = null;
  if (!exactHit) {
    for (const form of defnLemma.candidates(word).slice(0, MAX_BASE_FORMS)) {
      for (const s of SOURCES) {
        if (await ask(s, form) === "ok") { baseHit = true; baseForm = form; break; }
      }
      if (baseHit) break;
    }
  }
  return { word, exact, exactHit, baseHit, baseForm };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const words = readFileSync(join(HERE, "..", "words.txt"), "utf8")
  .split("\n").map(s => s.trim()).filter(Boolean);

const picked = sample(words, SAMPLE, SEED);
process.stderr.write(`probing ${picked.length} of ${words.length} words (seed ${SEED})\n`);

const results = await mapLimit(picked, CONCURRENCY, probe);

const n = results.length;
const pct = k => `${((k / n) * 100).toFixed(1)}%`;

console.log(`\nsample        ${n} words, seed ${SEED}`);
for (const s of SOURCES) {
  const ok = results.filter(r => r.exact[s.name] === "ok").length;
  const err = results.filter(r => r.exact[s.name] === "error").length;
  const thr = results.filter(r => r.exact[s.name] === "throttled").length;
  const miss = results.filter(r => r.exact[s.name] === "missing").length;
  const answered = ok + miss;
  const rate = answered ? `${((ok / answered) * 100).toFixed(1)}%` : "n/a";
  console.log(`${s.name.padEnd(20)} ${rate} of the ${answered} it answered ` +
              `(${ok} hit, ${miss} no entry), ${err} no answer, ${thr} throttled`);
}
const exactHits = results.filter(r => r.exactHit).length;
const baseHits = results.filter(r => r.baseHit).length;
console.log(`${"any source, exact".padEnd(20)} ${pct(exactHits)}`);
console.log(`${"+ base-form retry".padEnd(20)} ${pct(exactHits + baseHits)}  (fallback recovered ${baseHits})`);

const misses = results.filter(r => !r.exactHit && !r.baseHit).map(r => r.word);
console.log(`\nmissed everywhere (${misses.length}):`);
console.log(misses.join(" ") || "(none)");
