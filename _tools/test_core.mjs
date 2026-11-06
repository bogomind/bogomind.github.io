// node _tools/test_core.mjs : tests for zi/core.js (day index, answer matching, share text, stats) and the built day files.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const require = createRequire(import.meta.url);
const Z = require(path.join(root, 'zi', 'core.js'));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('day 1 starts at Shanghai midnight', () => {
  assert.equal(Z.dayNumber(new Date('2026-11-06T00:00:00+08:00')), 1);
  assert.equal(Z.dayNumber(new Date('2026-11-05T23:59:59+08:00')), 0);
  assert.equal(Z.dayNumber(new Date('2026-11-06T15:59:59Z')), 1);   // 23:59:59 in Shanghai
  assert.equal(Z.dayNumber(new Date('2026-11-06T16:00:00Z')), 2);   // midnight in Shanghai
});
t('day number does not depend on the player\'s time zone', () => {
  assert.equal(Z.dayNumber(new Date('2026-11-06T05:00:00+04:00')), 1);  // Dubai morning = Shanghai 09:00
  assert.equal(Z.dayNumber(new Date('2026-11-06T20:30:00-05:00')), 2);  // New York evening = Shanghai next morning
  assert.equal(Z.dayNumber(new Date('2026-12-05T12:00:00+08:00')), 30);
  assert.equal(Z.dayNumber(new Date('2027-03-01T12:00:00+08:00')), 116);
});
t('dates of days', () => {
  assert.equal(Z.dateOfDay(1), '2026-11-06');
  assert.equal(Z.dateOfDay(26), '2026-12-01');
  assert.equal(Z.dateOfDay(30), '2026-12-05');
  for (let k = 1; k < 400; k++) assert.equal(Z.dayNumber(new Date(Z.dateOfDay(k) + 'T12:00:00+08:00')), k);
});
t('parse a guess', () => {
  assert.deepEqual(Z.parseGuess('马'), { ok: true, ch: '马' });
  assert.deepEqual(Z.parseGuess(' 馬 '), { ok: true, ch: '馬' });
  assert.deepEqual(Z.parseGuess('日。'), { ok: true, ch: '日' });
  assert.deepEqual(Z.parseGuess('「月」'), { ok: true, ch: '月' });
  assert.deepEqual(Z.parseGuess('𠀀'), { ok: true, ch: '𠀀' });
  assert.equal(Z.parseGuess('').why, 'empty');
  assert.equal(Z.parseGuess('   ').why, 'empty');
  assert.equal(Z.parseGuess('ma').why, 'not-han');
  assert.equal(Z.parseGuess('3').why, 'not-han');
  assert.equal(Z.parseGuess('马马').why, 'too-many');
  assert.equal(Z.parseGuess('马a').why, 'too-many');
});

const days = readdirSync(path.join(root, 'zi', 'd')).sort().map((f) => JSON.parse(readFileSync(path.join(root, 'zi', 'd', f), 'utf8')));
const day = (k) => days[k - 1];

t('simplified and traditional answers both count', () => {
  assert.equal(Z.judge(day(11), '马'), 'right');
  assert.equal(Z.judge(day(11), '馬'), 'right');
  assert.equal(Z.judge(day(11), '驴'), 'wrong');
  assert.equal(Z.judge(day(10), '鱼'), 'right');
  assert.equal(Z.judge(day(10), '魚'), 'right');
  assert.equal(Z.judge(day(12), '门'), 'right');
  assert.equal(Z.judge(day(12), '門'), 'right');
  assert.equal(Z.judge(day(24), '册'), 'right');
  assert.equal(Z.judge(day(24), '冊'), 'right');
  assert.equal(Z.judge(day(20), '亀'), 'right');
});
t('near misses', () => {
  assert.equal(Z.judge(day(3), '夕'), 'near');
  assert.equal(Z.judge(day(23), '鼻'), 'near');
  assert.equal(Z.judge(day(12), '户'), 'near');
  assert.equal(Z.judge(day(1), 'constructor'), 'wrong');
  assert.equal(Z.judge(day(1), 'toString'), 'wrong');
});
t('every built day: answers right, near keys near, six clues, nothing about the answer in hints', () => {
  assert.equal(days.length, 30);
  days.forEach((d, i) => {
    assert.equal(d.n, i + 1);
    assert.equal(d.date, Z.dateOfDay(d.n));
    d.accept.forEach((c) => assert.equal(Z.judge(d, c), 'right', `${d.n} ${c}`));
    Object.keys(d.near).forEach((c) => assert.equal(Z.judge(d, c), 'near', `${d.n} ${c}`));
    assert.equal(d.forms.length + d.hints.length, Z.TRIES, `day ${d.n}`);
    d.hints.forEach((h) => d.accept.forEach((c) => assert.ok(!h.includes(c), `day ${d.n} hint has ${c}`)));
    d.story.forEach((p) => p.refs.forEach((r) => assert.ok(r >= 1 && r <= d.sources.length, `day ${d.n} ref ${r}`)));
  });
});
t('playing a day', () => {
  let s = Z.play(day(1), []);
  assert.deepEqual([s.done, s.used, s.clues], [false, 0, 1]);
  s = Z.play(day(1), ['口']);
  assert.deepEqual([s.done, s.used, s.clues], [false, 1, 2]);
  s = Z.play(day(1), ['口', '日']);
  assert.deepEqual([s.won, s.done, s.used, s.marks], [true, true, 2, ['wrong', 'right']]);
  s = Z.play(day(1), ['一', '二', '三', '四', '五']);
  assert.deepEqual([s.done, s.clues], [false, 6]);
  s = Z.play(day(1), ['一', '二', '三', '四', '五', '六']);
  assert.deepEqual([s.lost, s.won, s.done, s.used], [true, false, true, 6]);
  s = Z.play(day(3), ['夕', '月']);
  assert.deepEqual(s.marks, ['near', 'right']);
});
t('share text', () => {
  assert.equal(Z.shareText(12, ['wrong', 'wrong', 'right'], true), '字小时候 #12 ⬛⬛🟩 3/6\nbogomind.com/zi/');
  assert.equal(Z.shareText(1, ['right'], true), '字小时候 #1 🟩 1/6\nbogomind.com/zi/');
  assert.equal(Z.shareText(3, ['near', 'wrong', 'wrong', 'wrong', 'wrong', 'wrong'], false), '字小时候 #3 🟨⬛⬛⬛⬛⬛ X/6\nbogomind.com/zi/');
});
t('stats count only games finished on their own day', () => {
  const g = {
    1: { daily: true, done: true, won: true, used: 2 },
    2: { daily: true, done: true, won: true, used: 3 },
    3: { daily: true, done: true, won: false, used: 6 },
    4: { daily: true, done: true, won: true, used: 1 },
    5: { daily: false, done: true, won: true, used: 1 },
  };
  let s = Z.stats(g, 6);
  assert.deepEqual([s.played, s.won, s.rate, s.best, s.dist], [4, 3, 75, 2, [1, 1, 1, 0, 0, 0]]);
  assert.equal(s.streak, 0);                        // day 5 was played later, from the archive
  s = Z.stats(g, 5);
  assert.equal(s.streak, 1);                        // today (5) unfinished as a daily: the streak ends yesterday
  s = Z.stats({ 7: { daily: true, done: true, won: true, used: 4 }, 8: { daily: true, done: true, won: true, used: 2 } }, 8);
  assert.deepEqual([s.streak, s.best], [2, 2]);
  s = Z.stats({}, 3);
  assert.deepEqual([s.played, s.rate, s.streak], [0, 0, 0]);
});
console.log(`PASS ${n} tests`);
