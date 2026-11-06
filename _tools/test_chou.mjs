// node _tools/test_chou.mjs : tests for chou/core.js (rod shapes, moves, solver, day index, layout, share, stats)
// and every day in chou/days.json (a wrong sum with exactly one one-rod fix).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const require = createRequire(import.meta.url);
const C = require(path.join(root, 'chou', 'core.js'));
const cfg = JSON.parse(readFileSync(path.join(root, 'chou', 'days.json'), 'utf8'));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const rods = (b) => b.rows.reduce((s, r, i) => s + (i ? C.oshape(r.op).v + C.oshape(r.op).h : 0) + r.d.reduce((a, v) => a + C.rodCount(v), 0), 0);

t('day 1 is 2026-11-07 in Shanghai, whatever the player\'s zone', () => {
  assert.equal(C.dayNumber(new Date('2026-11-07T00:00:00+08:00')), 1);
  assert.equal(C.dayNumber(new Date('2026-11-06T23:59:59+08:00')), 0);
  assert.equal(C.dayNumber(new Date('2026-11-06T20:30:00+04:00')), 1);   // Dubai evening = Shanghai 00:30
  assert.equal(C.dayNumber(new Date('2026-11-07T11:00:00-05:00')), 2);   // New York morning = Shanghai 00:00 next day
  for (let k = 1; k < 400; k++) assert.equal(C.dayNumber(new Date(C.dateOfDay(k) + 'T12:00:00+08:00')), k);
  assert.equal(cfg.start, C.START);
});
t('digit shapes follow the old rule (五在上方, 六不积聚, 五不单张)', () => {
  for (let v = 0; v <= 9; v++) { const s = C.dshape(v); assert.equal(C.dvalue(s.b, s.u), v); }
  assert.deepEqual(C.dshape(5), { b: 0, u: 5 });          // five is five rods
  assert.deepEqual(C.dshape(6), { b: 1, u: 1 });          // six is a five-rod and one
  assert.equal(C.dvalue(1, 0), -1);                       // a lone five-rod is no digit
  assert.equal(C.dvalue(0, 6), -1);                       // six rods are no digit
  assert.equal(C.dvalue(1, 5), -1);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(C.rodCount), [0, 1, 2, 3, 4, 5, 2, 3, 4, 5]);
});
t('places alternate upright and flat from the units (一纵十横，百立千僵)', () => {
  const b = C.parse('105+020=125');
  assert.deepEqual([0, 1, 2].map(c => C.form(b, c)), ['v', 'h', 'v']);
  assert.equal(C.rodDir(b, 2, 'u'), 'v');   // units rod stands
  assert.equal(C.rodDir(b, 2, 'b'), 'h');   // its five-rod lies across
  assert.equal(C.rodDir(b, 1, 'u'), 'h');   // tens rod lies
  assert.equal(C.rodDir(b, 1, 'b'), 'v');
  assert.equal(C.rodDir(b, -1, 'v'), 'v');
});
t('parse, print, evaluate', () => {
  assert.equal(C.str(C.parse('07+05=12')), '07+05=12');
  assert.throws(() => C.parse('7+05=12'));
  assert.equal(C.isTrue(C.parse('07+05=12')), true);
  assert.equal(C.isTrue(C.parse('34-01=35')), false);
  assert.equal(C.isTrue(C.parse('35=34+01')), true);
  assert.equal(C.isTrue(C.parse('02=09-07')), true);
  assert.equal(C.isTrue(C.parse('12-05-07')), false);       // no = at all
  assert.equal(C.wellFormed(C.parse('12=05=07')), false);   // two =
  assert.equal(C.wellFormed(C.parse('12-00=12')), false);   // an empty row
  assert.equal(C.arabic(C.parse('35=34-01')), '35 = 34 − 1');
});
t('moves: rods are only moved, never made or lost', () => {
  for (const s of ['07+05=12', '96-48=48', '105+020=125', '6+1=7']) {
    const b = C.parse(s);
    for (const m of C.moves(b)) {
      assert.equal(rods(m.board), rods(b), s + ' -> ' + m.s);
      assert.ok(C.wellFormed(m.board));
      assert.notEqual(m.s, s);
    }
  }
});
t('moves the rules allow and refuse', () => {
  const b = C.parse('6+1=3');
  const out = new Set(C.moves(b).map(m => m.s));
  assert.ok(out.has('2+1=3'), 'turning the five-rod of 6 upright makes 2 in place');
  assert.ok(out.has('6-1=4'), 'the + gives its upright rod to the 3');
  assert.ok(!out.has('5+1=3'), 'a five-rod alone is not 5');
  // taking the last rod of 6 apart leaves a lone five-rod: only putting it back works
  assert.deepEqual(C.targets(b, { r: 0, c: 0, p: 'u' }).filter(x => !x.home).length, 0);
  assert.equal(C.targets(b, { r: 0, c: 0, p: 'u' }).filter(x => x.home).length, 1);
  // = gives a rod to - : "a - b = c" becomes "a = b - c"
  const sw = new Set(C.moves(C.parse('9-4=5')).map(m => m.s));
  assert.ok(sw.has('9=4-5'));
  // a rod laid in an empty tens cell lies flat and is worth ten
  const e = new Set(C.moves(C.parse('05+05=11')).map(m => m.s));
  assert.ok(e.has('15+05=10'));
});
t('solver finds the one fix', () => {
  const b = C.parse('34-01=35');
  const s = C.solutions(b);
  assert.equal(s.length, 1);
  assert.equal(s[0].s, '35-01=34');
  assert.equal(C.solutions(C.parse('07+05=12')).length >= 0, true);
});
t('every day: a wrong sum, exactly one one-rod fix, its level, no repeats', () => {
  assert.equal(cfg.count, cfg.days.length);
  assert.ok(cfg.count >= 300, 'about a year of days');
  const seenS = new Set(), seenA = new Set();
  cfg.days.forEach((d, i) => {
    const b = C.parse(d.s);
    assert.ok(C.wellFormed(b), 'day ' + (i + 1) + ' is a sum');
    assert.ok(!C.evaluate(b).ok, 'day ' + (i + 1) + ' is wrong');
    const sol = C.solutions(b);
    assert.equal(sol.length, 1, 'day ' + (i + 1) + ' has one fix');
    assert.equal(rods(sol[0].board), rods(b));
    const f = C.features(b, sol[0]);
    assert.equal(f.level, d.lv, 'day ' + (i + 1) + ' level');
    assert.ok(!seenS.has(d.s) && !seenA.has(sol[0].s), 'day ' + (i + 1) + ' repeats');
    seenS.add(d.s); seenA.add(sol[0].s);
    assert.ok(b.cols >= 1 && b.cols <= 3 && b.rows.length === 3);
  });
});
t('days 1-9 bring one idea at a time, then the week runs easy to hard', () => {
  const f = (k) => { const b = C.parse(cfg.days[k - 1].s); return C.features(b, C.solutions(b)[0]); };
  assert.equal(f(1).ideas, 0);
  assert.ok(C.parse(cfg.days[0].s).rows.every(r => r.d.every(v => v <= 5)), 'day 1 has no five-rods to read');
  assert.equal(f(2).ideas, 0);
  assert.ok(f(3).five && !f(3).inPlace);
  assert.ok(f(4).op);
  assert.ok(f(5).placeShift);
  assert.ok(f(6).inPlace);
  assert.ok(f(7).fills || f(7).empties);
  const week = [2, 0, 0, 1, 1, 1, 2];
  for (let k = 10; k <= cfg.count; k++) {
    const wd = new Date(C.dateOfDay(k) + 'T00:00:00Z').getUTCDay();
    assert.equal(cfg.days[k - 1].lv, week[wd], 'day ' + k);
  }
});
t('layout: every rod stays inside its cell, in both forms, for every digit', () => {
  const G = C.G;
  for (const f of ['v', 'h']) {
    for (let v = 1; v <= 9; v++) {
      for (const q of C.digitRods(v, f, G.W / 2, G.H / 2)) {
        const w = q.a === 'h' ? G.L : G.T, h = q.a === 'h' ? G.T : G.L;
        assert.ok(q.x - w / 2 >= 3 && q.x + w / 2 <= G.W - 3, `x ${f}${v}`);
        assert.ok(q.y - h / 2 >= 3 && q.y + h / 2 <= G.H - 3, `y ${f}${v}`);
      }
    }
  }
  const b = C.parse('105+020=125');
  const L = C.layout(b);
  assert.equal(L.rods.length, rods(b));
  assert.equal(new Set(L.rods.map(q => q.key)).size, L.rods.length);
  assert.deepEqual(L.heads.map(h => h.label), ['百', '十', '个']);
  assert.ok(C.svg(b).startsWith('<svg'));
});
t('practice puzzles come fast at every level', () => {
  const rand = C.rng(7);
  const t0 = Date.now();
  for (const lv of [0, 1, 2]) {
    for (let i = 0; i < 12; i++) {
      let p = null;
      for (let k = 0; k < 60 && !p; k++) {
        const cols = lv === 0 ? (rand() < 0.25 ? 1 : 2) : lv === 1 ? 2 : (rand() < 0.3 ? 3 : 2);
        p = C.makePuzzle(rand, cols, (f) => f.level === lv);
      }
      assert.ok(p, 'level ' + lv);
      assert.equal(C.solutions(C.parse(p.s)).length, 1);
    }
  }
  assert.ok(Date.now() - t0 < 8000, 'took ' + (Date.now() - t0) + ' ms');
});
t('share text', () => {
  assert.equal(C.shareText(3, { tries: [{ ok: false }, { ok: true }], hints: 0, won: true }), '差一筹 #3 第 2 次摆对\n\ud83d\udfe5\ud83d\udfe9\nbogomind.com/chou/');
  assert.equal(C.shareText(1, { tries: [{ ok: true }], hints: 0, won: true }), '差一筹 #1 一次摆对\n\ud83d\udfe9\nbogomind.com/chou/');
  assert.equal(C.shareText(2, { tries: [{ ok: false }], hints: 2, won: false, revealed: true }), '差一筹 #2 看了答案 · 提示 2\n\ud83d\udfe5\u2b1c\nbogomind.com/chou/');
});
t('stats count only same-day games; streaks break on gaps and misses', () => {
  const W = (k) => ({ tries: Array.from({ length: k }, (_, i) => ({ ok: i === k - 1 })), won: true, done: true, onDay: true, hints: 0 });
  const recs = { 1: W(1), 2: W(2), 3: W(1), 5: W(3), 6: { tries: [{ ok: false }], revealed: true, done: true, onDay: true, won: false }, 7: W(1), 8: { ...W(1), onDay: false } };
  const s = C.stats(recs, 8);
  assert.equal(s.played, 6);
  assert.equal(s.won, 5);
  assert.equal(s.first, 3);
  assert.deepEqual(s.dist, [3, 1, 1, 0, 0]);
  assert.equal(s.best, 3);
  assert.equal(s.streak, 1);             // day 7 won, today 8 not yet played
  assert.equal(C.stats(recs, 10).streak, 0);
});
console.log(`\n${n} tests PASS`);
