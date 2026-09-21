"use strict";

// Candidate base forms for a word that a dictionary source may not list.
//
// NWL2023 is a game word list. It carries every legal inflection
// (ROIDS, PONIES, HOPPED), but the free dictionary APIs usually hold only
// the base form. When a lookup of the exact word misses, the definition
// code retries these candidates in order.
//
// These rules are heuristics, not a stemmer. A wrong candidate costs one
// extra request that returns 404. It cannot produce a wrong definition for
// the exact word, because the exact word is always tried first and wins.

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.DefnLemma = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

  const VOWELS = "aeiou";

  function endsWithDoubledConsonant(s) {
    if (s.length < 3) return false;
    const a = s[s.length - 2];
    const b = s[s.length - 1];
    return a === b && VOWELS.indexOf(b) === -1 && b !== "s";
  }

  // "hopp" -> "hop". Returns null when there is nothing to undouble.
  function undouble(stem) {
    return endsWithDoubledConsonant(stem) ? stem.slice(0, -1) : null;
  }

  function candidates(word) {
    const w = String(word == null ? "" : word).toLowerCase().replace(/[^a-z]/g, "");
    const out = [];

    function add(c) {
      if (!c || c.length < 2 || c === w) return;
      if (out.indexOf(c) === -1) out.push(c);
    }

    // -y inflections first. They are the most specific.
    if (w.length > 4 && w.slice(-4) === "iest") add(w.slice(0, -4) + "y");
    if (w.length > 4 && w.slice(-3) === "ier") add(w.slice(0, -3) + "y");
    if (w.length > 4 && w.slice(-3) === "ies") add(w.slice(0, -3) + "y");
    if (w.length > 4 && w.slice(-3) === "ied") add(w.slice(0, -3) + "y");
    if (w.length > 4 && w.slice(-3) === "ily") add(w.slice(0, -3) + "y");

    // Plurals. "bakes" -> "bake", "boxes" -> "box", "roids" -> "roid".
    if (w.length > 3 && w.slice(-2) === "es") { add(w.slice(0, -1)); add(w.slice(0, -2)); }
    if (w.length > 3 && w.slice(-1) === "s" && w.slice(-2) !== "ss") add(w.slice(0, -1));

    if (w.length > 4 && w.slice(-2) === "ed") {
      const stem = w.slice(0, -2);
      add(w.slice(0, -1));  // "baked" -> "bake"
      add(stem);            // "walked" -> "walk"
      add(undouble(stem));  // "hopped" -> "hop"
    }
    if (w.length > 5 && w.slice(-3) === "ing") {
      const stem = w.slice(0, -3);
      add(stem);            // "walking" -> "walk"
      add(stem + "e");      // "baking" -> "bake"
      add(undouble(stem));  // "hopping" -> "hop"
    }
    if (w.length > 4 && w.slice(-3) === "est") {
      const stem = w.slice(0, -3);
      add(stem); add(stem + "e"); add(undouble(stem));
    }
    if (w.length > 3 && w.slice(-2) === "er") {
      const stem = w.slice(0, -2);
      add(w.slice(0, -1)); add(stem); add(undouble(stem));
    }
    if (w.length > 4 && w.slice(-2) === "ly") add(w.slice(0, -2));

    return out;
  }

  return { candidates };
});
