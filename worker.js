"use strict";

// Build the dictionary structures off the main thread.
self.addEventListener("message", async (e) => {
  if (e.data && e.data.type === "load") {
    const t0 = (self.performance && performance.now) ? performance.now() : Date.now();
    try {
      const res = await fetch(e.data.url || "words.txt");
      if (!res.ok) throw new Error("words.txt fetch failed: " + res.status);
      const text = await res.text();
      const lines = text.split("\n");
      const DICT = new Set();
      const WORDS_BY_KEY = new Map();
      const WORDS_LIST = new Array(lines.length);
      let n = 0;
      for (let i = 0; i < lines.length; i++) {
        const w = lines[i].trim();
        if (!w) continue;
        DICT.add(w);
        WORDS_LIST[n++] = w;
        const k = w.split("").sort().join("");
        let arr = WORDS_BY_KEY.get(k);
        if (!arr) { arr = []; WORDS_BY_KEY.set(k, arr); }
        arr.push(w);
      }
      WORDS_LIST.length = n;
      const t1 = (self.performance && performance.now) ? performance.now() : Date.now();
      self.postMessage({
        type: "ready",
        ms: Math.round(t1 - t0),
        dict: DICT,
        wordsByKey: WORDS_BY_KEY,
        wordsList: WORDS_LIST,
      });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err && err.message || err) });
    }
  }
});
