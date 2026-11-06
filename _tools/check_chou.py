#!/usr/bin/env python3
"""check_chou.py: the gate for room 2 (差一筹) before any push. Exit 0 = PASS, 1 = FAIL (every problem is listed).

  python3 _tools/check_chou.py --cache DIR [--words FILE]

  notes     _content/chou/notes.json: every note has a title, our own text (<= 200 chars), a listed source, and
            evidence [source, exact words]; with --cache DIR every quote is found verbatim (whitespace ignored) in
            DIR/texts/<source>.txt, the saved copy of what was read; the old line shown (orig) is the simplified form
            (OpenCC t2s, punctuation ignored) of words inside one evidence quote; a "math" line adds up
  build     chou/notes.json and chou/credits.html are what chou_build.py makes; chou/days.json is what
            chou_days.mjs makes (same seed); credits list every source a note uses
  tests     node _tools/test_chou.mjs passes (rules, solver, every day has exactly one fix, layout, share, stats)
  page      no request leaves the site (no http(s) URL in the room's JS/CSS/HTML except links in credits/notes),
            no secrets or private paths, each file < 300 KB, the front page card points at /chou/
  words     with --words FILE: no served file of the room matches any regex in FILE (kept outside the repo)
Needs the opencc package for the orig check; without it that check is reported as skipped."""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "_content", "chou", "notes.json")
ROOM = os.path.join(ROOT, "chou")
sys.path.insert(0, os.path.join(ROOT, "_tools"))
from check import SECRETS  # noqa: E402  (one list for the whole site)
PUNCT = re.compile(r"[\s，。、；：！？「」『』“”‘’《》（）〈〉()\[\]:;,.!?…·—-]")
problems, warnings = [], []


def bad(where, msg):
    problems.append(f"{where}: {msg}")


def squash(s):
    return re.sub(r"\s+", "", s)


KEEP = "乾"   # OpenCC turns the trigram 乾 (qián) into 干; in simplified text it stays 乾


def simp(t2s, s):
    for i, ch in enumerate(KEEP):
        s = s.replace(ch, chr(0xE000 + i))
    s = t2s(s)
    for i, ch in enumerate(KEEP):
        s = s.replace(chr(0xE000 + i), ch)
    return s


def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def check_notes(cache):
    c = json.load(open(CONTENT, encoding="utf-8"))
    try:
        from opencc import OpenCC
        t2s = OpenCC("t2s").convert
    except ImportError:
        t2s = None
        warnings.append("opencc not installed: orig lines not compared with their sources (pip install opencc)")
    ids = set()
    texts = {}
    for n in c["notes"]:
        w = f"note {n.get('id')}"
        for k in ("id", "title", "text", "src", "evidence", "orig"):
            if k not in n:
                bad(w, f"missing {k}")
        if n["id"] in ids:
            bad(w, "id repeats")
        ids.add(n["id"])
        if n["src"] not in c["sources"]:
            bad(w, f"source {n['src']} not listed")
        if not (8 <= len(n["text"]) <= 200):
            bad(w, f"text is {len(n['text'])} chars (8-200)")
        if not n["evidence"]:
            bad(w, "no evidence")
        for key, quote in n["evidence"]:
            if key not in c["sources"]:
                bad(w, f"evidence source {key} not listed")
                continue
            if cache:
                p = os.path.join(cache, "texts", key + ".txt")
                if p not in texts:
                    texts[p] = squash(open(p, encoding="utf-8").read()) if os.path.exists(p) else None
                if texts[p] is None:
                    bad(w, f"no saved copy {p}")
                elif squash(quote) not in texts[p]:
                    bad(w, f"quote not found in {key}: {quote[:40]}")
        if n["orig"] and t2s:
            o = PUNCT.sub("", n["orig"])
            if not any(o in PUNCT.sub("", simp(t2s, q)) for _, q in n["evidence"]):
                bad(w, f"orig is not the simplified form of an evidence quote: {n['orig'][:40]}")
        if "math" in n:
            m = re.fullmatch(r"\s*([\d\s+]+)=\s*(\d+)\s*", n["math"])
            if not m or sum(int(x) for x in m.group(1).split("+")) != int(m.group(2)):
                bad(w, f"math does not add up: {n['math']}")
    if not cache:
        warnings.append("no --cache: evidence quotes not checked against the saved sources")
    return c


def check_build(c):
    r = subprocess.run([sys.executable, os.path.join(ROOT, "_tools", "chou_build.py"), "--check"], capture_output=True, text=True)
    if r.returncode:
        bad("build", r.stdout.strip() or r.stderr.strip())
    r = subprocess.run(["node", os.path.join(ROOT, "_tools", "chou_days.mjs"), "--check"], capture_output=True, text=True)
    if r.returncode:
        bad("days", (r.stdout + r.stderr).strip()[-400:])
    cred = open(os.path.join(ROOM, "credits.html"), encoding="utf-8").read()
    for n in c["notes"]:
        for key, _ in n["evidence"]:
            if c["sources"][key]["url"] not in cred:
                bad("credits", f"does not link {key}")


def check_tests():
    r = subprocess.run(["node", os.path.join(ROOT, "_tools", "test_chou.mjs")], capture_output=True, text=True)
    if r.returncode:
        bad("tests", (r.stdout + r.stderr).strip()[-600:])
    else:
        print(r.stdout.strip().splitlines()[-1])


def check_page(words):
    for name in sorted(os.listdir(ROOM)):
        p = os.path.join(ROOM, name)
        t = open(p, encoding="utf-8", errors="replace").read()
        if os.path.getsize(p) > 300_000:
            bad(f"chou/{name}", "over 300 KB")
        for pat in SECRETS:
            if re.search(pat, t):
                bad(f"chou/{name}", f"looks like a secret or private path ({pat})")
        if name.endswith((".js", ".css")) or name == "index.html":
            for m in re.finditer(r"https?://[^\s'\"<>)]+", t):
                if m.group(0) == "http://www.w3.org/2000/svg":      # the SVG namespace, not a request
                    continue
                bad(f"chou/{name}", f"external URL {m.group(0)} (the room must not call out)")
        for pat in words:
            if re.search(pat, t, re.I):
                bad(f"chou/{name}", f"listed word /{pat}/")
    home = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    if 'href="/chou/"' not in home:
        bad("index.html", "no card for /chou/")
    for pat in words:
        if re.search(pat, home, re.I):
            bad("index.html", f"listed word /{pat}/")


def main():
    cache = arg("--cache")
    words = []
    if arg("--words"):
        words = [l.strip() for l in open(arg("--words"), encoding="utf-8") if l.strip() and not l.startswith("#")]
    c = check_notes(cache)
    check_build(c)
    check_tests()
    check_page(words)
    for w in warnings:
        print("WARN", w)
    if problems:
        print("check_chou FAIL")
        print("\n".join(problems))
        return 1
    print(f"check_chou PASS ({len(c['notes'])} notes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
