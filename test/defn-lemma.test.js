"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { candidates } = require("../defn-lemma.js");

test("simple plural drops the s", () => {
  assert.deepStrictEqual(candidates("roids"), ["roid"]);
});

test("an uninflected word yields no candidates", () => {
  assert.deepStrictEqual(candidates("cinq"), []);
  assert.deepStrictEqual(candidates("zax"), []);
});

test("-ies plural restores the y", () => {
  assert.ok(candidates("ponies").includes("pony"));
});

test("-es plural offers both stems", () => {
  assert.ok(candidates("boxes").includes("box"));
  assert.ok(candidates("bakes").includes("bake"));
});

test("past tense handles a doubled consonant", () => {
  assert.ok(candidates("hopped").includes("hop"));
  assert.ok(candidates("walked").includes("walk"));
  assert.ok(candidates("baked").includes("bake"));
});

test("-ing forms", () => {
  assert.ok(candidates("walking").includes("walk"));
  assert.ok(candidates("baking").includes("bake"));
  assert.ok(candidates("hopping").includes("hop"));
});

test("comparatives", () => {
  assert.ok(candidates("bigger").includes("big"));
  assert.ok(candidates("biggest").includes("big"));
  assert.ok(candidates("happiest").includes("happy"));
});

test("never returns the input, an empty string, or a single letter", () => {
  const inputs = ["", "a", "as", "is", "ss", "es", "s", "aa", "cinq", "roids",
                  "hopped", "ponies", "biggest", "aah", "qi"];
  for (const w of inputs) {
    for (const c of candidates(w)) {
      assert.notStrictEqual(c, w.toLowerCase(), `candidate equals input for "${w}"`);
      assert.ok(c.length >= 2, `candidate too short for "${w}": "${c}"`);
      assert.match(c, /^[a-z]+$/, `candidate not lowercase a-z for "${w}": "${c}"`);
    }
  }
});

test("candidates are unique", () => {
  for (const w of ["hopped", "ponies", "biggest", "bakes", "walking"]) {
    const c = candidates(w);
    assert.strictEqual(new Set(c).size, c.length, `duplicate candidate for "${w}"`);
  }
});

test("input is normalised for case and punctuation", () => {
  assert.deepStrictEqual(candidates("ROIDS!"), ["roid"]);
  assert.deepStrictEqual(candidates("  Roids  "), ["roid"]);
});

test("null and undefined are safe", () => {
  assert.deepStrictEqual(candidates(null), []);
  assert.deepStrictEqual(candidates(undefined), []);
});
