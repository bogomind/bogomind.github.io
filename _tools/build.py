#!/usr/bin/env python3
"""build.py: _content/ -> the served files of room 1 (字小时候).

  python3 _tools/build.py            build zi/g/*.svg, zi/d/NNN.json, zi/days.json, zi/credits.html
  python3 _tools/build.py --check    exit 1 if any built file differs from what the content would build (check.py runs this)

Inputs: _content/days/NN-字.json (one per day: forms, hints, story with evidence, sources), _content/glyphs.json (one
record per glyph file: Commons page, licence, authors, changes), _content/glyphs-raw/*.svg (the Commons originals).
No dependencies beyond the Python standard library."""
import glob, html, json, os, re, sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZI = os.path.join(ROOT, "zi")
START = "2026-11-06"                      # day 1, Asia/Shanghai (core.js has the same constant; check.py compares them)
TZ = "Asia/Shanghai"
SVG_NS = "http://www.w3.org/2000/svg"
KEEP = {"svg", "g", "path", "polygon", "polyline", "rect", "circle", "ellipse", "line"}
SKIP = {"metadata", "defs", "namedview", "title", "desc", "pattern", "marker", "clipPath", "mask", "script", "style", "RDF"}
GEOM = ["d", "points", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "transform"]


def load_days():
    days = []
    for f in sorted(glob.glob(os.path.join(ROOT, "_content", "days", "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        d["_file"] = os.path.relpath(f, ROOT)
        days.append(d)
    return days


def load_glyphs():
    return json.load(open(os.path.join(ROOT, "_content", "glyphs.json"), encoding="utf-8"))


def _num(m):
    v = float(m.group())
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _round(s):
    return re.sub(r"-?\d+\.\d+(?:e-?\d+)?", _num, s)


def _num_t(m):
    v = float(m.group())
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _round_t(s):
    """transforms keep 6 decimals: a scale rounded to 0.1 resizes the whole glyph (matrix(0.0879…) -> 0.1 is +14 %,
    which pushed 贝's seal/slip and 心's slip past their viewBox; 11-13 fix)"""
    return re.sub(r"-?\d+\.\d+(?:e-?\d+)?", _num_t, s)


_PTOK = re.compile(r"[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_NPAR = {"m": 2, "l": 2, "h": 1, "v": 1, "c": 6, "s": 4, "q": 4, "t": 2, "a": 7, "z": 0}


def _r1(v):
    return round(v * 10) / 10


def _fmt_d(v):
    s = f"{_r1(v):.1f}".rstrip("0").rstrip(".")
    if s in ("-0", "", "-"):
        return "0"
    if s.startswith("0."):
        return s[1:]
    if s.startswith("-0."):
        return "-" + s[2:]
    return s


def _round_d(d):
    """path data to one decimal WITHOUT drift (11-13 fix). Rounding each number of a relative path on its own lets the
    errors add up along a traced outline (牛's Shang bronze: ~1,000 'c' segments of 0.0x units walked the outline off by
    whole units, ink IoU 0.89). Every point is rounded in absolute terms and written against the previous ROUNDED point,
    so the served outline stays within 0.05 units of the original everywhere. Same commands and parameter counts;
    numbers written short (.4, -.4, no separator before a minus)."""
    toks = _PTOK.findall(d)
    segs, i = [], 0
    cx = cy = rx = ry = 0.0          # true / rounded current point
    sx = sy = rsx = rsy = 0.0        # true / rounded start of the subpath
    cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd, i = t, i + 1
            if cmd in "Zz":
                segs.append((cmd, []))
                cx, cy, rx, ry = sx, sy, rsx, rsy
                continue
        elif cmd is None or cmd in "Zz":
            raise ValueError(f"path data has a number where a command belongs: {t}")
        lc, rel = cmd.lower(), cmd.islower()
        n = _NPAR[lc]
        if i + n > len(toks) or any(x.isalpha() for x in toks[i:i + n]):
            raise ValueError(f"path command {cmd} is short of parameters")
        if lc == "a" and not (toks[i + 3] in ("0", "1") and toks[i + 4] in ("0", "1")):
            raise ValueError(f"arc flags {toks[i + 3]!r} {toks[i + 4]!r}: write them apart (0 or 1 each)")
        vals = [float(x) for x in toks[i:i + n]]
        i += n
        if lc == "h":
            ax = cx + vals[0] if rel else vals[0]
            new = [_r1(ax) - rx if rel else _r1(ax)]
            cx, rx = ax, _r1(ax)
        elif lc == "v":
            ay = cy + vals[0] if rel else vals[0]
            new = [_r1(ay) - ry if rel else _r1(ay)]
            cy, ry = ay, _r1(ay)
        else:
            pts = [(vals[5], vals[6])] if lc == "a" else [(vals[k], vals[k + 1]) for k in range(0, n, 2)]
            new = [_r1(v) for v in vals[:3]] + [int(v) for v in vals[3:5]] if lc == "a" else []
            for px, py in pts:
                ax, ay = (cx + px, cy + py) if rel else (px, py)
                new += [_r1(ax) - rx, _r1(ay) - ry] if rel else [_r1(ax), _r1(ay)]
            ex, ey = pts[-1]
            cx, cy = (cx + ex, cy + ey) if rel else (ex, ey)
            rx, ry = _r1(cx), _r1(cy)
        segs.append((cmd, new))
        if lc == "m":
            sx, sy, rsx, rsy = cx, cy, rx, ry
            cmd = "l" if rel else "L"            # more pairs after a moveto are linetos
    out, cont = [], None
    for c, nums in segs:
        body = ""
        for k, v in enumerate(nums):
            s = str(v) if (c in "Aa" and k in (3, 4)) else _fmt_d(v)
            body += ("," if body and not s.startswith("-") else "") + s
        if c == cont:
            out.append(("," if not body.startswith("-") else "") + body)
        else:
            out.append(c + body)
        cont = {"m": "l", "M": "L"}.get(c, None if c in "Zz" else c)
    return "".join(out)


def _color(v):
    v = (v or "").strip().lower()
    if v in ("", "inherit"):
        return None
    if v in ("none", "transparent"):
        return "none"
    if v in ("#000", "#000000", "black", "currentcolor"):
        return "ink"
    if re.fullmatch(r"#([0-9a-f])\1\1|#([0-9a-f]{2})\2\2", v):
        return "grey"
    return "other:" + v


def clean_svg(raw, drop_grey=False, name="", viewbox=None):
    """Commons SVG -> small SVG drawn in currentColor. Raises on anything unexpected (a colour we don't know)."""
    root = ET.fromstring(raw)
    vb = viewbox or root.get("viewBox")
    if not vb:
        w = float(re.sub(r"[a-z]+$", "", root.get("width", "300")))
        h = float(re.sub(r"[a-z]+$", "", root.get("height", "300")))
        vb = f"0 0 {w:g} {h:g}"
    out = ET.Element("svg", {"xmlns": SVG_NS, "viewBox": _round(vb), "fill": "currentColor"})

    def local(tag):
        return tag.split("}")[-1]

    def walk(src, dst, inh_fill, inh_stroke):
        for el in src:
            t = local(el.tag)
            if t in SKIP or t not in KEEP:
                continue
            style = dict(kv.split(":", 1) for kv in (el.get("style") or "").split(";") if ":" in kv)
            style = {k.strip(): v.strip() for k, v in style.items()}
            fill = _color(style.get("fill", el.get("fill"))) or inh_fill
            stroke = _color(style.get("stroke", el.get("stroke"))) or inh_stroke
            if drop_grey and fill == "grey" and t != "g":
                continue
            for c in (fill, stroke):
                if c and (c.startswith("other:") or (c == "grey" and not drop_grey)):
                    raise ValueError(f"{name}: unexpected colour {c} on <{t}>")
            a = {k: (_round_t if k == "transform" else _round_d if k == "d" else _round)(el.get(k))
                 for k in GEOM if el.get(k) is not None}
            if t != "g":
                if fill == "none":
                    a["fill"] = "none"
                if stroke == "ink":
                    a["stroke"] = "currentColor"
                    sw = style.get("stroke-width", el.get("stroke-width"))
                    if sw:
                        a["stroke-width"] = _round(re.sub(r"px$", "", sw))
                    for k in ("stroke-linecap", "stroke-linejoin"):
                        v = style.get(k, el.get(k))
                        if v:
                            a[k] = v
                fr = style.get("fill-rule", el.get("fill-rule"))
                if fr and fr != "nonzero":
                    a["fill-rule"] = fr
            e = ET.SubElement(dst, t, a)
            if t == "g":
                walk(el, e, fill, stroke)
                if len(e) == 0:
                    dst.remove(e)

    walk(root, out, None, None)
    if not any(local(e.tag) != "g" for e in out.iter() if e is not out):
        raise ValueError(f"{name}: nothing left to draw")
    s = ET.tostring(out, encoding="unicode", short_empty_elements=True)
    s = s.replace("ns0:", "").replace(":ns0", "")
    return s + "\n"


def day_date(n):
    import datetime
    d = datetime.date.fromisoformat(START) + datetime.timedelta(days=n - 1)
    return d.isoformat()


def client_day(d, glyphs):
    order, refs = [], []
    for p in d["story"]:
        r = []
        for key, _q in p["ev"]:
            if key not in order:
                order.append(key)
            i = order.index(key) + 1
            if i not in r:
                r.append(i)
        refs.append(sorted(r))
    sources = []
    for key in order:
        s = d["sources"][key]
        sources.append({k: s[k] for k in ("title", "by", "url", "note") if k in s})
    return {
        "n": d["n"], "date": day_date(d["n"]), "answer": d["answer"], "accept": d["accept"], "pinyin": d["pinyin"],
        "simp": d["simp"], "trad": d["trad"],
        "forms": [{"src": "g/" + glyphs[f["glyph"]]["local"], "stage": f["stage"], "era": f["era"]} for f in d["forms"]],
        "hints": d["hints"], "near": d["near"],
        "story": [{"text": p["text"], "refs": r} for p, r in zip(d["story"], refs)],
        "sources": sources,
    }


def _bracketed(title):
    """The entry name inside 「」 of a source title: 'Wiktionary「日」Glyph origin' -> '日' (a fixed slice showed 」)."""
    m = re.search(r"「(.+?)」", title)
    return m.group(1) if m else title


def credits_html(days, glyphs):
    used = {}
    for d in days:
        for f in d["forms"]:
            used.setdefault(f["glyph"], (d, f))
    rows = []
    for g, (d, f) in used.items():
        r = glyphs[g]
        authors = "、".join(r["authors"])
        src = f' · {html.escape(r["source"])}' if r.get("source") else ""
        model = f'<br>依据：{html.escape(r["model"])}' if r.get("model") else ""
        change = "去元数据、改颜色" + ("、去灰色笔画" if r.get("drop_grey") else "") + ("、重新居中" if r.get("viewbox") else "")
        lic = "公有领域" if r["licence"] == "Public domain" else html.escape(r["licence"])
        rows.append(
            f'<tr><td class="c">{html.escape(d["simp"])}</td><td>{html.escape(f["stage"])}<br><span class="muted">{html.escape(f["era"])}{src}</span></td>'
            f'<td><a href="{html.escape(r["page"])}">{html.escape(r["commons"][5:])}</a>'
            f'<span class="muted"><br>绘制：{html.escape(authors)}（Commons 用户）{model}<br>改动：{change}</span></td>'
            f'<td>{lic}</td></tr>')
    texts = {}
    for d in days:
        for key, s in d["sources"].items():
            k = s["url"] if not s["title"].startswith("《說文") else "shuowen"
            if s["title"].startswith("漢語多功能字庫"):
                k = "cuhk"
            if s["title"].startswith("Wiktionary"):
                k = "wikt"
            texts.setdefault(k, []).append((d, s))
    tl = []
    cu = texts.pop("cuhk", [])
    if cu:
        links = "、".join(f'<a href="{html.escape(s["url"])}">{html.escape(s["title"][8:-1])}</a>' for _, s in dict(((s["url"], (d, s)) for d, s in cu)).values())
        tl.append(f'<li>香港中文大學《漢語多功能字庫》：{links}。各字的字形演變與釋義據此改寫成白話。</li>')
    sw = texts.pop("shuowen", [])
    if sw:
        tl.append('<li>許慎《說文解字》（東漢，公有領域）。原文據《漢語多功能字庫》所錄。</li>')
    wk = texts.pop("wikt", [])
    if wk:
        links = "、".join(f'<a href="{html.escape(s["url"])}">{html.escape(_bracketed(s["title"]))}</a>' for _, s in dict(((s["url"], (d, s)) for d, s in wk)).values())
        tl.append(f'<li>Wiktionary 的 Glyph origin 條目（CC BY-SA 4.0，Wiktionary 編者）：{links}。只取事實，文字為本站自寫。</li>')
    for k, lst in texts.items():
        s = lst[0][1]
        tl.append(f'<li><a href="{html.escape(s["url"])}">{html.escape(s["title"])}</a>，{html.escape(s["by"])}。</li>')
    return CREDITS.format(rows="\n".join(rows), texts="\n".join(tl), n=len(used))


CREDITS = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>出处 · 字小时候</title>
<meta name="description" content="字小时候用到的每一张字形图和每一条资料的出处。">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="zi.css">
</head>
<body class="page">
<header class="bar"><a href="/" class="home">bogo</a><span class="sep">/</span><a href="./">字小时候</a><span class="sep">/</span><span>出处</span></header>
<main class="credits">
<h1>出处</h1>
<p>这里列出字小时候用到的每一张字形图和每一条资料。</p>
<h2>字形图（{n} 张）</h2>
<p>全部来自 Wikimedia Commons 的“古汉字计划”（Ancient Chinese characters project），都是公有领域（public domain）。
其中很多张依据 Richard Sears 的 Chinese Etymology（hanziyuan.net）所收字形绘制，经他许可公开，按他的要求在此致谢；
另一些依据中研院“小学堂”的字形资料（CC0）。本站对每张图只做了两件事：去掉文件里的元数据，把颜色改成跟着页面走。
另有两张图（“雨”和“力”的金文）原本是从“雩”“男”两个字里截出来的，图里用灰色画着那个字的其余笔画，本站把灰色部分去掉了。</p>
<div class="table"><table>
<thead><tr><th>字</th><th>阶段</th><th>文件、绘制者、改动</th><th>许可</th></tr></thead>
<tbody>
{rows}
</tbody></table></div>
<h2>文字资料</h2>
<p>每天的小故事由本站用白话写成，每一句话都对应下面的资料；在游戏里，故事后面的小数字就是这一段的出处。</p>
<ul class="refs">
{texts}
</ul>
</main>
<footer class="foot"><a href="./">回到字小时候</a> · <a href="/">bogomind.com</a></footer>
</body>
</html>
"""


def build(write=True):
    days = load_days()
    glyphs = load_glyphs()
    want = {}
    for d in days:
        for f in d["forms"]:
            r = glyphs[f["glyph"]]
            raw = open(os.path.join(ROOT, "_content", "glyphs-raw", r["local"]), "rb").read()
            want[os.path.join(ZI, "g", r["local"])] = clean_svg(raw, r.get("drop_grey", False), f["glyph"], r.get("viewbox"))
        want[os.path.join(ZI, "d", f"{d['n']:03d}.json")] = json.dumps(client_day(d, glyphs), ensure_ascii=False, separators=(",", ":")) + "\n"
    want[os.path.join(ZI, "days.json")] = json.dumps({"start": START, "tz": TZ, "count": len(days)}, separators=(",", ":")) + "\n"
    want[os.path.join(ZI, "credits.html")] = credits_html(days, glyphs)
    stale = []
    for path, content in want.items():
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != content:
            stale.append(os.path.relpath(path, ROOT))
            if write:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, "w", encoding="utf-8").write(content)
    extra = [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ZI, "g", "*")) + glob.glob(os.path.join(ZI, "d", "*")) if p not in want]
    if write:
        for p in extra:
            os.remove(os.path.join(ROOT, p))
    return stale, extra, want


def main():
    check = "--check" in sys.argv
    stale, extra, want = build(write=not check)
    if check:
        if stale or extra:
            print("build: out of date:", ", ".join(stale + [x + " (not built from content)" for x in extra]))
            sys.exit(1)
        print(f"build: up to date ({len(want)} files)")
    else:
        print(f"build: {len(stale)} written, {len(extra)} removed, {len(want)} total")
        size = sum(len(c.encode()) for p, c in want.items() if "/g/" in p)
        print(f"glyphs: {sum(1 for p in want if '/g/' in p)} files, {size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
