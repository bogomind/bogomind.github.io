# bogomind.github.io

https://bogomind.com/ (GitHub Pages, branch `main`, root). Static files, no frameworks, no trackers.

- `index.html`: the front page, one card per room.
- `zi/`: room 1, 字小时候, a daily guess-the-character game. Built from `_content/` by `_tools/build.py`;
  don't edit `zi/d/`, `zi/g/`, `zi/days.json` or `zi/credits.html` by hand.
- `_content/days/NN-字.json`: one file per day (forms, hints, story, and for every paragraph the source and the
  exact words it rests on). `_content/glyphs.json`: one record per glyph image (Commons page, licence, authors, changes).
- Before a push: `python3 _tools/build.py && python3 _tools/check.py --cache <saved sources>` and
  `node _tools/test_core.mjs` must pass.
- `chou/`: room 2, 差一筹, a daily counting-rod puzzle (move one rod so the sum holds). `chou/core.js` holds the
  rules, the solver and the puzzle maker; `chou/days.json` is made by `node _tools/chou_days.mjs` (seeded, every day
  proved to have exactly one fix); `chou/notes.json` and `chou/credits.html` are built from `_content/chou/notes.json`
  by `python3 _tools/chou_build.py`. Before a push: `python3 _tools/check_chou.py --cache <saved sources>` must pass
  (it also runs `node _tools/test_chou.mjs`).
- `privacy.html`: a short, generic privacy note (noindex, linked from nowhere).
- Nothing on this site describes its maker, how anything is made or run, or any other account: `_tools/selfcheck.py` (pre-commit hook) refuses it.
