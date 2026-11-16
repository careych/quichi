#!/usr/bin/env python3
"""Build the per-level vocabulary files in data/ from the complete-hsk-vocabulary dataset.

Usage:
    python3 scripts/build_data.py [path/to/complete.json]

Without an argument the source file is downloaded from GitHub.
Source: https://github.com/drkameleon/complete-hsk-vocabulary (MIT License)
The "new-N" tags are the HSK 3.0 (2021) word lists; "new-7" is the combined 7-9 band.
"""
import json
import sys
import urllib.request
from pathlib import Path

SOURCE_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json"
OUT_DIR = Path(__file__).resolve().parent.parent / "data"
LEVELS = ["1", "2", "3", "4", "5", "6", "7"]
MAX_MEANINGS = 8
WEAK_PREFIXES = ("surname ", "variant of ", "old variant of ", "used in ", "see ", "erhua variant of ", "archaic variant of ")


def load_source(argv):
    if len(argv) > 1:
        return json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    with urllib.request.urlopen(SOURCE_URL) as resp:
        return json.loads(resp.read().decode("utf-8"))


def is_weak(meaning):
    return meaning.lower().startswith(WEAK_PREFIXES)


def form_rank(indexed_form):
    """Sort key: everyday readings first, name-only / variant-only readings last."""
    index, form = indexed_form
    meanings = form["meanings"]
    all_weak = all(is_weak(m) for m in meanings)
    proper = form["transcriptions"]["pinyin"][:1].isupper()
    return (all_weak, proper, index)


def clean_meanings(meanings):
    strong = [m for m in meanings if not is_weak(m)]
    weak = [m for m in meanings if is_weak(m)]
    return (strong + weak)[:MAX_MEANINGS]


def build_entry(word):
    forms = [f for f in word["forms"] if f["meanings"]]
    forms = [f for _, f in sorted(enumerate(forms), key=form_rank)]
    main = forms[0]
    simplified = word["simplified"]
    traditional = main["traditional"]
    alts = [[f["transcriptions"]["pinyin"], clean_meanings(f["meanings"])] for f in forms[1:4]]
    entry = [
        simplified,
        0 if traditional == simplified else traditional,
        main["transcriptions"]["pinyin"],
        clean_meanings(main["meanings"]),
        word.get("pos", [])[:3],
    ]
    if alts:
        entry.append(alts)
    return entry


def main(argv):
    words = load_source(argv)
    by_level = {level: [] for level in LEVELS}
    seen = set()
    for word in words:
        level = next((tag[4:] for tag in word["level"] if tag.startswith("new-")), None)
        if level not in by_level or word["simplified"] in seen:
            continue
        if not any(f["meanings"] for f in word["forms"]):
            continue
        seen.add(word["simplified"])
        by_level[level].append((word.get("frequency") or 10**9, word["simplified"], build_entry(word)))

    OUT_DIR.mkdir(exist_ok=True)
    counts = {}
    for level, rows in by_level.items():
        rows.sort(key=lambda r: (r[0], r[1]))  # most frequent words first
        entries = [r[2] for r in rows]
        counts[level] = len(entries)
        payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
        (OUT_DIR / f"hsk{level}.js").write_text(
            f'window.QUICHI_DATA=window.QUICHI_DATA||{{}};window.QUICHI_DATA["{level}"]={payload};\n',
            encoding="utf-8",
        )
    index = json.dumps({"counts": counts, "total": sum(counts.values())}, separators=(",", ":"))
    (OUT_DIR / "index.js").write_text(f"window.QUICHI_INDEX={index};\n", encoding="utf-8")
    print(counts, "total", sum(counts.values()))


if __name__ == "__main__":
    main(sys.argv)
