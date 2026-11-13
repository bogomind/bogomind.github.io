#!/usr/bin/env python3
"""test_build.py: path rounding in build.py (python3 _tools/test_build.py; exit 0 = PASS).

The served glyphs round path data to one decimal. Rounding each number of a RELATIVE path on its own lets the errors add
up (11-13: 牛's Shang bronze, a traced outline of ~1,000 tiny 'c' segments, came out at ink IoU 0.89 against its
original). _round_d rounds every point in absolute terms, so the error stays under 0.05 units at every point."""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f": {detail}"))
    if not ok:
        fails.append(name)


TOK = re.compile(r"[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def points(d):
    """absolute end point of every segment (enough to measure drift; implicit repeats and z handled)"""
    toks, i, cmd, cx, cy, sx, sy, out = TOK.findall(d), 0, None, 0.0, 0.0, 0.0, 0.0, []
    while i < len(toks):
        if toks[i].isalpha():
            cmd, i = toks[i], i + 1
            if cmd in "Zz":
                cx, cy = sx, sy
                out.append((cx, cy))
                continue
        n = build._NPAR[cmd.lower()]
        v = [float(x) for x in toks[i:i + n]]
        i += n
        rel = cmd.islower()
        lc = cmd.lower()
        if lc == "h":
            cx = cx + v[0] if rel else v[0]
        elif lc == "v":
            cy = cy + v[0] if rel else v[0]
        else:
            ex, ey = v[-2], v[-1]
            cx, cy = (cx + ex, cy + ey) if rel else (ex, ey)
        if lc == "m":
            sx, sy = cx, cy
            cmd = "l" if rel else "L"
        out.append((cx, cy))
    return out


def worst(a, b):
    return max(max(abs(x1 - x2), abs(y1 - y2)) for (x1, y1), (x2, y2) in zip(a, b))


# 1. the drift case: 1,000 relative curves of 0.04 units each
d = "m0,0 c" + " ".join(["0.01,0.02 0.03,0.01 0.04,0.02"] * 1000)
true, new, old = points(d), points(build._round_d(d)), points(build._round(d))
check("drift: every point within 0.05 of the original", worst(true, new) <= 0.05 + 1e-9, worst(true, new))
check("drift: the old per-number rounding is off by whole units (the bug this fixes)", worst(true, old) > 10,
      worst(true, old))
check("same number of segments", len(true) == len(new), (len(true), len(new)))

# 2. every command kind, relative and absolute, implicit repeats, z back to the subpath start
d = ("M10.04,20.06 L30.15,40.26 30.33,40.44 h1.26 v-2.04 H5.05 V6.06 C1.01,2.02 3.03,4.04 5.05,6.06 "
     "S7.07,8.08 9.09,10.1 Q1.12,2.13 3.14,4.15 T5.16,6.17 A5.5,5.5 0 0 1 7.21,8.3 Z "
     "m0.31,0.42 l1.04,1.05 1.06,1.07 c0.11,0.12 0.13,0.14 0.15,0.16 s0.17,0.18 0.19,0.2 q0.21,0.22 0.23,0.24 "
     "t0.25,0.26 a2.2,2.2 0 1 0 0.27,0.28 z m-1.55,-2.66 h0.04 0.04 0.04 v0.04 0.04 0.04 z")
t, n = points(d), points(build._round_d(d))
check("all commands: same segment count", len(t) == len(n), (len(t), len(n)))
check("all commands: every end point within 0.05", worst(t, n) <= 0.05 + 1e-9, worst(t, n))
out = build._round_d(d)
check("arc flags kept as 0/1", re.search(r"A5\.5,5\.5,0,0,1,", out) is not None and re.search(r"a2\.2,2\.2,0,1,0,", out) is not None, out)
check("numbers written short (.3, -.4) and no separator before a minus", ".3" in out and "-" in out and ",-" not in out, out)

# 3. a moveto's extra pairs stay linetos (implicit), and z resets the current point
d = "m1,1 2,2 3,3 z m1,1 l1,0"
check("implicit lineto after m and z resets", points(build._round_d(d)) == points(d), build._round_d(d))

# 4. glued arc flags are refused, not misread
try:
    build._round_d("M0,0 a1,1 0 01 5,5")
    check("glued arc flags raise", False, "no error")
except ValueError:
    check("glued arc flags raise", True)

# 5. a number where a command belongs is refused
try:
    build._round_d("5,5 L1,1")
    check("leading number raises", False, "no error")
except ValueError:
    check("leading number raises", True)

# 6. credits name each Wiktionary entry by what stands inside 「」 (a fixed slice [12:13] printed 」 for every
#    one-character entry and 鼎 for 問鼎, live until 11-14)
check("credits entry name, one character", build._bracketed("Wiktionary「日」Glyph origin") == "日")
check("credits entry name, a word", build._bracketed("Wiktionary「問鼎」") == "問鼎")
_cred = build.credits_html(build.load_days(), build.load_glyphs())
check("no credits link reads only a bracket", not re.search(r">[」』）)]</a>", _cred),
      re.findall(r".{40}>[」』）)]</a>", _cred)[:2])

print("test_build:", "FAIL" if fails else "PASS", f"({len(fails)} failed)" if fails else "")
sys.exit(1 if fails else 0)
