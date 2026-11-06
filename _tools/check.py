#!/usr/bin/env python3
"""check.py: the gate before any push of bogomind.com. Exit 0 = PASS, 1 = FAIL (every problem is listed).

  python3 _tools/check.py [--cache DIR] [--words FILE] [--plain]

Room 1 (字小时候), per day file in _content/days/:
  forms     3-4 forms, oldest first (甲骨文 → 金文 → 小篆 → 秦简), each glyph registered in _content/glyphs.json
            with an allowed licence (PD, CC0, CC BY, CC BY-SA; never NC/ND), a Commons page, its authors, its changes;
            the served SVG exists in zi/g/, parses, is small, draws in currentColor
  clues     forms + hints = 6 (one clue per try); no hint and no near-miss message contains the answer
  answer    one Han character; simplified and traditional forms both accepted and paired (OpenCC when installed,
            otherwise the Unicode variant table below); every accepted/near key is a single Han character
  story     3-7 paragraphs, 90-480 Han characters, sentences ≤ 40, every paragraph ≥ 1 evidence [source, quote]
            whose source is listed with title + url; with --cache DIR every quote must be found verbatim (whitespace
            ignored) in DIR/<source.cache> (the saved copy of what was read)
  numbering days 1..N in order, no gaps; core.js START == build.py START
Site-wide:
  build     zi/ is what _tools/build.py makes from _content/ (no hand edits, nothing stale)
  words     with --words FILE: no served file matches any regex in FILE (one per line, case-insensitive);
            privacy.html is exempt (the API client's privacy note, linked from the footer only)
  secrets   no tokens, keys or private paths anywhere in the repo
  size      every page's own HTML+CSS+JS < 300 KB
--plain: run the register counter ($PLAIN_TOOL) in its short-script mode on each story (≥1 why-word, ≥1 reaction, ≥1 picture or no
hard number, every hard number landed); a FAIL there is reported as a warning, not a gate failure."""
import glob, hashlib, json, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "_tools"))
import build  # noqa: E402

HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U0003134f]")
ALLOWED = re.compile(r"^(Public domain|CC0( 1\.0)?|CC BY(-SA)? [2-4]\.0( [A-Za-z]+)?)$")
STAGES = ["甲骨文", "金文", "小篆", "秦简"]
# simplified -> traditional for the answers we use (checked against OpenCC when it is installed)
S2T = {"鱼": "魚", "马": "馬", "门": "門", "车": "車", "龟": "龜", "贝": "貝", "册": "冊", "监": "監"}
BANNED = []    # filled from --words FILE (one regex per line, kept outside the repo)
SECRETS = [r"sk-[A-Za-z0-9]{16,}", r"ghp_[A-Za-z0-9]{20,}", r"github_pat_", r"AKIA[0-9A-Z]{16}", r"-----BEGIN [A-Z ]*PRIVATE KEY",
           r"xox[bap]-[0-9A-Za-z-]+", r"AIza[0-9A-Za-z_-]{30,}", r"(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}",
           r"/home/[A-Za-z0-9_-]+/", r"\b\d{9,10}:[A-Za-z0-9_-]{30,}"]

problems, warnings = [], []


def bad(where, msg):
    problems.append(f"{where}: {msg}")


def han(s):
    return HAN.findall(s)


def t2s_s2t():
    try:
        from opencc import OpenCC
        return OpenCC("t2s").convert, OpenCC("s2t").convert
    except ImportError:
        warnings.append("opencc not installed: simplified/traditional pairs checked against the built-in table only")
        return None, None


def check_days(cache):
    days = build.load_days()
    glyphs = build.load_glyphs()
    t2s, s2t = t2s_s2t()
    if [d["n"] for d in days] != list(range(1, len(days) + 1)):
        bad("days", f"numbering is not 1..{len(days)}: {[d['n'] for d in days]}")
    seen = {}
    for d in days:
        w = d["_file"]
        a, acc = d["answer"], d["accept"]
        # answer and its pairs
        if len(han(a)) != 1 or len(a) != 1:
            bad(w, f"answer {a!r} is not one Han character")
        if a in seen:
            bad(w, f"answer {a} repeats day {seen[a]}")
        seen[a] = d["n"]
        for c in acc:
            if len(c) != 1 or not HAN.fullmatch(c):
                bad(w, f"accept entry {c!r} is not one Han character")
        if a not in acc or d["simp"] not in acc or d["trad"] not in acc:
            bad(w, f"accept {acc} misses the answer/simplified/traditional form")
        if d["simp"] != d["trad"]:
            if S2T.get(d["simp"]) != d["trad"]:
                bad(w, f"pair {d['simp']}/{d['trad']} is not in the variant table")
            if t2s and (t2s(d["trad"]) != d["simp"] or d["trad"] not in s2t(d["simp"])):
                bad(w, f"OpenCC disagrees with the pair {d['simp']}/{d['trad']} ({t2s(d['trad'])}, {s2t(d['simp'])})")
        elif t2s and (t2s(a) != a or s2t(a) != a):
            bad(w, f"{a} has another form ({t2s(a)}/{s2t(a)}) that is not listed")
        for k, msg in d["near"].items():
            if len(k) != 1 or not HAN.fullmatch(k):
                bad(w, f"near key {k!r} is not one Han character")
            if k in acc:
                bad(w, f"near key {k} is also an accepted answer")
            if any(c in msg for c in acc):
                bad(w, f"near message for {k} gives the answer away: {msg}")
        # forms
        forms = d["forms"]
        if not 3 <= len(forms) <= 4:
            bad(w, f"{len(forms)} forms (want 3-4)")
        idx = [STAGES.index(f["stage"]) if f["stage"] in STAGES else -1 for f in forms]
        if -1 in idx or idx != sorted(idx) or idx[0] != 0:
            bad(w, f"form stages out of order or unknown: {[f['stage'] for f in forms]}")
        for f in forms:
            g = glyphs.get(f["glyph"])
            if not g:
                bad(w, f"glyph {f['glyph']} is not registered in _content/glyphs.json")
                continue
            if g["char"] not in acc:
                bad(w, f"glyph {f['glyph']} draws {g['char']}, not this day's answer")
            if not ALLOWED.match(g.get("licence", "")):
                bad(w, f"glyph {f['glyph']} licence {g.get('licence')!r} is not allowed")
            for k in ("page", "authors", "commons", "modified", "local", "permission"):
                if not g.get(k):
                    bad(w, f"glyph {f['glyph']} has no {k}")
            if re.search(r"(?i)non-?commercial|no ?deriv|\bNC\b|\bND\b", g.get("permission", "") + g.get("licence", "")):
                bad(w, f"glyph {f['glyph']} permission mentions NC/ND")
            rp = os.path.join(ROOT, "_content", "glyphs-raw", g["local"])
            if not os.path.exists(rp) or hashlib.sha1(open(rp, "rb").read()).hexdigest() != g.get("sha1"):
                bad(w, f"original {g['local']} is missing or differs from the Commons file (sha1)")
            p = os.path.join(ROOT, "zi", "g", g["local"])
            if not os.path.exists(p):
                bad(w, f"served glyph {p} missing")
                continue
            raw = open(p, "rb").read()
            try:
                el = ET.fromstring(raw)
            except ET.ParseError as e:
                bad(w, f"{g['local']} does not parse: {e}")
                continue
            if len(raw) > 20000:
                bad(w, f"{g['local']} is {len(raw)} bytes (> 20 KB)")
            if el.get("fill") != "currentColor" or re.search(rb"#[0-9a-fA-F]{3,6}", raw):
                bad(w, f"{g['local']} is not drawn in currentColor only")
        # clues
        if len(forms) + len(d["hints"]) != 6:
            bad(w, f"{len(forms)} forms + {len(d['hints'])} hints != 6 clues")
        for h in d["hints"]:
            if not h.strip():
                bad(w, "empty hint")
            if any(c in h for c in acc):
                bad(w, f"hint gives the answer away: {h}")
        # story
        st = d["story"]
        if not 3 <= len(st) <= 7:
            bad(w, f"{len(st)} story paragraphs (want 3-7)")
        total = sum(len(han(p["text"])) for p in st)
        if not 90 <= total <= 480:
            bad(w, f"story is {total} Han characters (want 90-480)")
        for i, p in enumerate(st, 1):
            for s in re.split(r"[。！？]", p["text"]):
                if len(han(s)) > 40:
                    bad(w, f"paragraph {i}: sentence of {len(han(s))} characters (> 40): {s}")
            if not p.get("ev"):
                bad(w, f"paragraph {i} has no evidence")
            for key, quote in p.get("ev", []):
                src = d["sources"].get(key)
                if not src:
                    bad(w, f"paragraph {i}: evidence key {key} is not in sources")
                    continue
                if not quote.strip():
                    bad(w, f"paragraph {i}: empty quote for {key}")
                if cache:
                    cp = os.path.join(cache, src.get("cache", ""))
                    if not src.get("cache") or not os.path.exists(cp):
                        bad(w, f"paragraph {i}: no cached copy for {key} ({cp})")
                        continue
                    hay = re.sub(r"\s+", "", open(cp, encoding="utf-8").read())
                    if re.sub(r"\s+", "", quote) not in hay:
                        bad(w, f"paragraph {i}: quote not found in {src['cache']}: {quote}")
        for key, s in d["sources"].items():
            if not s.get("title") or not s.get("url", "").startswith("https://"):
                bad(w, f"source {key} has no title or https url")
        used = {k for p in st for k, _ in p.get("ev", [])}
        for key in set(d["sources"]) - used:
            bad(w, f"source {key} is listed but no paragraph uses it")
    return days, glyphs


def check_start():
    core = open(os.path.join(ROOT, "zi", "core.js"), encoding="utf-8").read()
    m = re.search(r"START\s*=\s*['\"](\d{4}-\d\d-\d\d)['\"]", core)
    if not m or m.group(1) != build.START:
        bad("zi/core.js", f"START {m.group(1) if m else None} != build.py START {build.START}")


def served_files():
    out = []
    for p in glob.glob(os.path.join(ROOT, "**", "*"), recursive=True):
        rel = os.path.relpath(p, ROOT)
        if os.path.isdir(p) or rel.split(os.sep)[0].startswith(("_", ".")) or rel.startswith("NOTES"):
            continue
        out.append(rel)
    return out


def check_words_secrets_size():
    for rel in served_files():
        if not rel.endswith((".html", ".js", ".css", ".json", ".svg", ".md", ".txt", ".webmanifest", ".xml")):
            continue
        txt = open(os.path.join(ROOT, rel), encoding="utf-8").read()
        if rel != "privacy.html":
            for pat in BANNED:
                m = re.search(pat, txt, flags=re.I)
                if m:
                    bad(rel, f"contains {m.group()!r} (a word on the --words list)")
    for p in glob.glob(os.path.join(ROOT, "**", "*"), recursive=True):
        rel = os.path.relpath(p, ROOT)
        if os.path.isdir(p) or rel.startswith(".git" + os.sep) or rel.endswith((".png", ".jpg", ".webp")):
            continue
        try:
            txt = open(p, encoding="utf-8").read()
        except UnicodeDecodeError:
            continue
        raw = rel.startswith(os.path.join("_content", "glyphs-raw") + os.sep)   # Commons originals, byte for byte (their authors' export paths)
        for pat in SECRETS:
            if raw and pat.startswith("/home"):
                continue
            m = re.search(pat, txt)
            if m and rel != os.path.join("_tools", "check.py"):
                bad(rel, f"looks like a secret or a private path: {m.group()[:24]}…")
    for page in ["index.html", "404.html", "zi/index.html", "zi/credits.html"]:
        p = os.path.join(ROOT, page)
        if not os.path.exists(p):
            bad(page, "missing")
            continue
        size = os.path.getsize(p)
        html = open(p, encoding="utf-8").read()
        for ref in re.findall(r'(?:href|src)="([^"#?]+\.(?:css|js))"', html):
            rp = os.path.normpath(os.path.join(ROOT, ref.lstrip("/")) if ref.startswith("/") else os.path.join(os.path.dirname(p), ref))
            if os.path.exists(rp):
                size += os.path.getsize(rp)
            else:
                bad(page, f"references {ref}, which does not exist")
        if size > 300 * 1024:
            bad(page, f"{size / 1024:.0f} KB with its CSS/JS (> 300 KB)")


def check_build():
    stale, extra, _ = build.build(write=False)
    if stale or extra:
        bad("zi/", f"not what build.py makes from _content (run python3 _tools/build.py): {stale + extra}")


def check_credits(glyphs, days):
    txt = open(os.path.join(ROOT, "zi", "credits.html"), encoding="utf-8").read()
    for d in days:
        for f in d["forms"]:
            g = glyphs[f["glyph"]]
            if g["page"] not in txt:
                bad("zi/credits.html", f"does not list {f['glyph']}")


def plain_gate(days):
    tool = os.environ.get("PLAIN_TOOL", "")
    if not tool or not os.path.exists(tool):
        warnings.append("set PLAIN_TOOL to the register counter to measure the stories (skipped)")
        return
    for d in days:
        lines = [{"id": f"p{i}", "zh": p["text"], "kind": "story"} for i, p in enumerate(d["story"], 1)]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(lines, f, ensure_ascii=False)
        r = subprocess.run([tool, f.name, "--gate"], capture_output=True, text=True)
        os.unlink(f.name)
        if r.returncode != 0:
            last = [l for l in (r.stdout + r.stderr).splitlines() if "FAIL" in l or "fail" in l][-3:]
            warnings.append(f"plain.py on day {d['n']} ({d['answer']}): " + " | ".join(last))


def main():
    cache = None
    if "--cache" in sys.argv:
        cache = os.path.expanduser(sys.argv[sys.argv.index("--cache") + 1])
    if "--words" in sys.argv:
        wf = os.path.expanduser(sys.argv[sys.argv.index("--words") + 1])
        BANNED.extend(l.strip() for l in open(wf, encoding="utf-8") if l.strip() and not l.startswith("#"))
    else:
        warnings.append("no --words file: served text not checked for unwanted words")
    days, glyphs = check_days(cache)
    check_start()
    check_build()
    check_credits(glyphs, days)
    check_words_secrets_size()
    if "--plain" in sys.argv:
        plain_gate(days)
    for w in warnings:
        print("warning:", w)
    if problems:
        for p in problems:
            print("FAIL", p)
        print(f"check: FAIL ({len(problems)} problems)")
        sys.exit(1)
    q = sum(len(p["ev"]) for d in days for p in d["story"])
    print(f"check: PASS ({len(days)} days, {len(glyphs)} glyphs, {q} evidence quotes{' verified against the cache' if cache else ' (not verified: no --cache)'})")


if __name__ == "__main__":
    main()
