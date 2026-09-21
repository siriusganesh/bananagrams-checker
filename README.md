# Bananagrams Word Checker

Live site: https://siriusganesh.github.io/bananagrams-checker/

Type letters, hit **check**. The tool returns:

1. Whether the input is a legal Bananagrams word.
2. Every legal word you can build from those letters — full anagrams
   first, then sub-anagrams grouped by length.

Click any tile to use that word as the new input.

## Deliberate choices

- Static HTML + vanilla JS. No build step, no framework, no runtime
  dependency. Ships as the source.
- Anagram search runs in a Web Worker so the ~196K-word dictionary scan
  never blocks input. Inline fallback path when no worker is available.
- Service worker (versioned cache, `skipWaiting` + `clients.claim`)
  precaches HTML/CSS/JS/words/fonts — fully usable offline after first visit.
- Definitions come from Wiktionary and dictionaryapi.dev, raced so a dead
  source cannot hold up a live one, with a base-form retry (ROIDS -> ROID)
  when both miss. A game word list holds many words no general dictionary
  defines, so the panel says "no source has an entry" rather than implying
  the word is not real.
- Light and dark theme, resolved before first paint from localStorage or the
  OS setting. The dark palette lifts the accents instead of inverting them.
- Lighthouse CI on every PR (mobile + desktop matrix), plus `node --test`.

## Dictionary

NWL2023 (NASPA Word List 2023, ~196,601 words) — the current official
North American Scrabble / Bananagrams word list. Sourced from
[scrabblewords/scrabblewords](https://github.com/scrabblewords/scrabblewords).
