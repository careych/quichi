# Quichi 趣

A friendly Chinese vocabulary trainer for **HSK 1 to HSK 9** — 10,969 words, flashcards with spaced repetition, quizzes, audio and stroke order. Static site, no build step, no account: progress is stored in the browser.

## Features

- **7 level decks** following the HSK 3.0 word lists: HSK 1–6 and the combined HSK 7–9 band, ordered most-common-first.
- **Learn** — new words in small batches (5–20): first see the word, then recall it.
- **Review** — spaced repetition (SM-2 style: Again / Hard / Good / Easy) brings each card back just before you forget it.
- **Quiz** — four modes: meaning, characters, pinyin, listening. A missed word is scheduled for review again.
- **Dictionary** — search every level by characters, toneless pinyin (`xiexie`) or English; word pages show all meanings, other readings, part of speech and animated stroke order.
- **Progress** — day streak, 14-day activity, per-level progress; export / import as a JSON backup.
- Simplified or traditional characters, light / dark theme, keyboard shortcuts (`Space`, `1`–`4`, `Enter`), mobile-first layout.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Audio uses the browser's built-in Chinese voice (Web Speech API). Stroke-order animations load from the jsDelivr CDN, so they need an internet connection; everything else works offline.

## Deploy on GitHub Pages

Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**. The site is then served at `https://<user>.github.io/quichi/`.

## Project layout

```
index.html            app shell
css/style.css         styles (light + dark tokens)
js/app.js             the whole app: store, scheduler, views, router
data/hsk*.js          generated word lists, one file per level (lazy-loaded)
scripts/build_data.py regenerates data/ from the source dataset
tests/smoke.html      open in a browser: drives the real app end to end and prints PASS/FAIL
```

Rebuild the data (downloads the source file when no path is given):

```sh
python3 scripts/build_data.py [path/to/complete.json]
```

## Data and credits

- Word lists, pinyin and definitions: [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT). Its `new-1` … `new-7` tags are used as HSK 1–6 and HSK 7–9. Definitions originate from [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0).
- Stroke-order animation: [Hanzi Writer](https://hanziwriter.org) (MIT), character data from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi).

The level split comes from that dataset as-is; it has not been checked word by word against the official syllabus.

## License

Code: MIT, see `LICENSE`. Vocabulary data keeps the licenses of its sources listed above.
