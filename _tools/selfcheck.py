#!/usr/bin/env python3
"""selfcheck.py: the site never records its maker (Vincent 771/857: 「主页不要记录自己…别人都看到你在干嘛了，这会有安全隐患」).
Fails (exit 1) if any public text file in the repo names the maker's tools, machine, accounts, other channels, money,
people or activities. Run by .git/hooks/pre-commit on the staged tree; `selfcheck.py --all` checks the working tree.
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = ('.html', '.md', '.txt', '.json', '.webmanifest', '.xml', '.svg', '.js', '.css')
SKIP_DIRS = ('.git', '_tools')
DENY = [  # (pattern, flags, why)
    (r'youtube|youtu\.be', re.I, 'another account / channel'),
    (r'三更电台|三更電台|\bIn Ink\b|ininkquotes', re.I, 'another channel'),
    (r'twitter\.com|\bx\.com\b|@bogomind\b|github\.com/bogomind', re.I, 'another account'),
    (r'\bAI\b|人工智能|\bLLM\b|\bGPT\b|chatbot|机器人|機器人', 0, 'says what the maker is'),
    (r'\bagent\b|subagent|heartbeat|\brho\b|pi-coding|claude|anthropic|deepseek|gemini|openai|\bfal\.ai\b', re.I, 'tooling'),
    (r'backup|备份|備份|google drive|云端硬盘|雲端硬碟|rclone', re.I, 'infrastructure'),
    (r'oauth|access token|refresh token|api key|api client|\bserver\b|服务器|伺服器|\bVM\b|omarchy|hyprland|\bk12\b|tailscale|telegram', re.I, 'infrastructure'),
    (r'vincent|hanxiao|杜晗|botim|ledger|信用卡|credit card', re.I, 'people / money'),
    (r'my (videos?|channel|machine|notes|work|tools?)|我的(视频|頻道|频道|机器|機器|工具|笔记|筆記)', re.I, 'records the maker'),
]
ALLOW_JS = re.compile(r'(?s)/\*.*?\*/|//[^\n]*')  # comments in code are not shown, but still public: checked too


def files(staged):
    if staged:
        out = subprocess.run(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'], cwd=ROOT,
                             capture_output=True, text=True).stdout.split()
        names = out
    else:
        names = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split()
        names += [n for n in subprocess.run(['git', 'ls-files', '--others', '--exclude-standard'], cwd=ROOT,
                                            capture_output=True, text=True).stdout.split()]
    for n in sorted(set(names)):
        if n.split('/')[0] in SKIP_DIRS or not n.endswith(EXT):
            continue
        yield n


def read(n, staged):
    if staged:
        r = subprocess.run(['git', 'show', f':{n}'], cwd=ROOT, capture_output=True)
        return r.stdout.decode('utf-8', 'replace')
    return open(os.path.join(ROOT, n), encoding='utf-8', errors='replace').read()


def main():
    staged = '--all' not in sys.argv
    bad = []
    for n in files(staged):
        text = read(n, staged)
        for pat, fl, why in DENY:
            for m in re.finditer(pat, text, fl):
                line = text.count('\n', 0, m.start()) + 1
                bad.append(f'{n}:{line}: "{m.group(0)}" ({why})')
    if bad:
        print('selfcheck FAIL: the site must not record its maker (Vincent 771/857):')
        print('\n'.join(bad[:60]))
        return 1
    print('selfcheck PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
