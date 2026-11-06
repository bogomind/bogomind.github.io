#!/usr/bin/env python3
"""chou_build.py: build room 2 (差一筹) text files from _content/chou/notes.json.

  python3 _tools/chou_build.py           write chou/notes.json and chou/credits.html
  python3 _tools/chou_build.py --check   exit 1 if they differ from what would be written

chou/days.json (the puzzles) is made by `node _tools/chou_days.mjs`, not here."""
import html, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_content", "chou", "notes.json")
OUT_NOTES = os.path.join(ROOT, "chou", "notes.json")
OUT_CREDITS = os.path.join(ROOT, "chou", "credits.html")


def load():
    with open(SRC, encoding="utf-8") as f:
        return json.load(f)


def served_notes(c):
    out = []
    for n in c["notes"]:
        s = c["sources"][n["src"]]
        out.append({"id": n["id"], "title": n["title"], "text": n["text"], "orig": n["orig"], "cite": s["title"], "url": s["url"]})
    return json.dumps({"count": len(out), "notes": out}, ensure_ascii=False, indent=1) + "\n"


def credits(c):
    e = html.escape
    used = []
    for n in c["notes"]:
        for key, _ in n["evidence"]:
            if key not in used:
                used.append(key)
    for key in ("sunzi", "suanxue"):          # the rules on the help page
        if key not in used:
            used.append(key)
    refs = "\n".join(
        f'<li><a href="{e(c["sources"][k]["url"])}">{e(c["sources"][k]["title"])}</a> <span class="lic">{e(c["sources"][k]["licence"])}</span></li>'
        for k in used)
    notes = "\n".join(
        f'<li>{e(n["title"])}：' + "、".join(e(c["sources"][k]["title"]) for k in dict.fromkeys(k for k, _ in n["evidence"])) + "</li>"
        for n in c["notes"])
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>出处 · 差一筹</title>
<meta name="description" content="差一筹的规则和每一条算筹小识的出处。">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="chou.css">
</head>
<body class="page">
<header class="bar"><a href="/" class="home">bogo</a><span class="sep">/</span><a href="./">差一筹</a><span class="sep">/</span><span>出处</span></header>
<main class="credits">
<h1>出处</h1>
<h2>题目</h2>
<p>每天一道。每一道都只有一种挪法能让它成立：挪一根的所有办法都试过了，多一种解的题不用。
算筹和算盘格都是画出来的，没有用任何图片。</p>
<h2>算筹的摆法</h2>
<p>个位、百位竖摆，十位、千位横摆，依《孙子算经》“一从十横，百立千僵”；六到九上面一根当五，
依朱世杰《算学启蒙》“满六已上，五在上方。六不积聚，五不单张”。空位表示零。
把加号、减号、等号也摆成算筹，是这个游戏自己加的规矩。</p>
<h2>算筹小识</h2>
<p>每天解完题后的那段小识，文字是本站自己写的；每一句话都核对过下面的原文，古书引文按维基文库的文本，转成了简体。</p>
<ol class="refs">
{notes}
</ol>
<h2>资料</h2>
<ol class="refs">
{refs}
</ol>
</main>
<footer class="foot"><a href="./">差一筹</a> · <a href="/">bogomind.com</a></footer>
</body>
</html>
"""


def main():
    c = load()
    files = {OUT_NOTES: served_notes(c), OUT_CREDITS: credits(c)}
    if "--check" in sys.argv:
        bad = [os.path.relpath(p, ROOT) for p, t in files.items() if not os.path.exists(p) or open(p, encoding="utf-8").read() != t]
        if bad:
            print("chou_build --check FAIL: stale " + ", ".join(bad))
            return 1
        print("chou_build --check PASS")
        return 0
    for p, t in files.items():
        with open(p, "w", encoding="utf-8") as f:
            f.write(t)
    print("wrote chou/notes.json, chou/credits.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
