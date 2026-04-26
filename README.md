# Bananagrams Word Checker

Static site that:

1. Tells you whether a string is a legal Bananagrams (Scrabble-style) word.
2. Lists every legal word you can build from a subset of those letters, plus full anagrams.

Pure HTML/JS. No backend. Runs entirely in the browser. Designed to be hosted on GitHub Pages.

## Files

- `index.html` — page
- `styles.css` — styles
- `app.js` — validator + anagram solver
- `words.txt` — dictionary, one lowercase word per line (~279k words, ~2.7 MB; gzips to ~700 KB)
- `.nojekyll` — disables GitHub Pages' Jekyll processing

## About the dictionary

`words.txt` is a SOWPODS/Collins-derived list of ~279,496 words. It is a strict superset of TWL (the North American Scrabble word list), so every TWL-legal word will validate as legal here. A handful of UK/international words that are in Collins but not TWL will also validate. For casual Bananagrams play this is usually what you want (more permissive, no false rejections of common Scrabble words like QI / ZA / OK).

If you want strict TWL only, replace `words.txt` with any TWL word list (one lowercase word per line). A common source is [fogleman/TWL06](https://github.com/fogleman/TWL06). After replacing the file, no other code changes are needed.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

You must serve via HTTP — opening `index.html` from `file://` will work in some browsers but not others because of how `fetch()` handles local files.

## Deploy to GitHub Pages

1. Create a new repo on GitHub (e.g. `bananagrams-checker`).
2. Push the contents of this folder to the repo's default branch:

   ```sh
   cd bananagrams-checker
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin git@github.com:<YOUR_USER>/bananagrams-checker.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**. Set:
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `(root)`
   - Save.

4. Wait ~30s. Site goes live at `https://<YOUR_USER>.github.io/bananagrams-checker/`.

The `.nojekyll` file is included so GitHub Pages serves files exactly as-is.

## How it works

On page load, the browser fetches `words.txt` and builds three structures:

- A `Set` for O(1) "is this word legal?" lookups.
- A `Map<sortedLetters, [words]>` for instant full-anagram lookup.
- A flat array, scanned linearly for sub-anagrams (~50–100 ms over 279k words on a modern laptop).

For an input string `s`:

- **Validity:** `DICT.has(s.toLowerCase())`.
- **Full anagrams:** look up the multiset key `sorted(s)` in the map.
- **Sub-anagrams:** scan all dictionary words; keep any whose letter-counts are a subset of the input's letter-counts. Group by length, sorted longest-first.

## Customizing

- Different dictionary: replace `words.txt`.
- Hide/show sub-anagrams or full anagrams: edit `index.html` (remove the corresponding `<section>`) or hide via CSS.
- Length filter (e.g. only show 4+ letter words): in `app.js`, in `renderArrangements`, add `if (word.length < 4) continue;` inside the scan loop.
- Style: edit the CSS variables at the top of `styles.css`.

## License

The HTML/CSS/JS in this repo: do whatever you want with it.

The dictionary is derived from publicly distributed Scrabble word lists. These lists are widely circulated for word-game tooling but are not under a formal open-source license. If hosting publicly is a concern for you, swap in [ENABLE](https://github.com/dolph/dictionary) (public domain) or another freely-licensed list.
