// node _tools/chou_days.mjs [--count N] [--check] : the day list of 差一筹 (chou/days.json), made by chou/core.js.
// Every day is a sum one rod away from exactly one true sum (proved by the solver). Days 1-9 bring in one idea at a
// time; from day 10 the week runs 易 易 中 中 中 难 难 (Monday to Sunday). Seeded, so the same run gives the same days;
// --check rebuilds in memory and fails if chou/days.json differs.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const require = createRequire(import.meta.url);
const C = require(path.join(root, 'chou', 'core.js'));
const args = process.argv.slice(2);
const COUNT = +(args[args.indexOf('--count') + 1] || 0) || 365;
const SEED = 20261107;

const noFives = (P) => P.rows.every(r => r.d.every(v => v <= 5));
const hasFive = (P) => P.rows.some(r => r.d.some(v => v >= 6));
const FLAGS = ['five', 'inPlace', 'op', 'placeShift', 'fills', 'empties'];
const only = (f, keys) => {            // exactly these ideas (turning a rod in place always involves the five-rod)
  const want = new Set(keys);
  if (want.has('inPlace')) want.add('five');
  return FLAGS.every(k => !!f[k] === want.has(k));
};
// days 1-9: one new idea a day (cols, filter)
const INTRO = [
  { cols: 2, ok: (f, P) => f.ideas === 0 && !f.zeros && noFives(P) && f.branching <= 40 },             // count the rods
  { cols: 2, ok: (f, P) => f.ideas === 0 && !f.zeros && hasFive(P) && f.branching <= 50 },             // read a five
  { cols: 2, ok: (f) => only(f, ['five']) && !f.zeros && f.branching <= 50 },                            // move a five-rod
  { cols: 2, ok: (f) => only(f, ['op']) && !f.zeros && f.branching <= 50 },                              // an operator rod
  { cols: 2, ok: (f) => only(f, ['placeShift']) && !f.zeros && f.branching <= 55 },                      // 个 <-> 十
  { cols: 2, ok: (f) => only(f, ['inPlace']) && !f.zeros && f.branching <= 55 },                         // turn a rod in place
  { cols: 2, ok: (f) => (f.fills || f.empties) && f.ideas === 1 && f.branching <= 55 },                 // an empty cell
  { cols: 2, ok: (f) => f.level === 2 && f.ideas === 2 && !f.zeros && f.branching <= 60 },
  { cols: 2, ok: (f) => f.level === 2 && f.ideas === 2 && !f.zeros && f.branching <= 70 },
];
const WEEK = [2, 0, 0, 1, 1, 1, 2];   // by getUTCDay(): Sun 难, Mon 易, Tue 易, Wed-Fri 中, Sat 难

function signature(f) {
  return FLAGS.filter(k => f[k]).join('+') || 'plain';
}

// a pool of puzzles per width, then each day picks from it (seeded)
function pool(rand) {
  const out = { 1: [], 2: [], 3: [] }, seen = new Set();
  for (const [cols, n] of [[1, 900], [2, 5000], [3, 1500]]) {
    for (let i = 0; i < n; i++) {
      const q = C.makePuzzle(rand, cols);
      if (!q || seen.has(q.s)) continue;
      seen.add(q.s);
      q.P = C.parse(q.s);
      q.sig = signature(q.f);
      out[cols].push(q);
    }
  }
  return out;
}

function build(count) {
  const rand = C.rng(SEED);
  const P = pool(rand);
  const days = [], usedS = new Set(), usedA = new Set();
  let prevSig = null;
  for (let n = 1; n <= count; n++) {
    let want, cols;
    if (n <= INTRO.length) { want = INTRO[n - 1]; cols = want.cols; }
    else {
      const lv = WEEK[new Date(C.dateOfDay(n) + 'T00:00:00Z').getUTCDay()];
      // 难 days: two ideas on two columns, now and then three columns; 易: mostly two columns, sometimes one
      const r = rand();
      cols = lv === 2 ? (r < 0.25 ? 3 : 2) : lv === 0 ? (r < 0.2 ? 1 : 2) : (r < 0.12 ? 1 : 2);
      want = {
        ok: (f) => f.level === lv && (lv === 2 || !f.zeros) && f.branching <= (cols === 3 ? 120 : 75) &&
          !(lv === 2 && cols === 2 && f.ideas < 2)
      };
    }
    const pick = (w) => P[w].filter(q => want.ok(q.f, q.P) && !usedS.has(q.s) && !usedA.has(q.answer) &&
      (n <= INTRO.length || q.sig === 'plain' || q.sig !== prevSig));
    let cand = pick(cols);
    if (!cand.length && cols !== 2) cand = pick(2);     // one column runs out of sums after a few months
    if (!cand.length) throw new Error('no puzzle for day ' + n + ' (cols ' + cols + ')');
    const p = cand[Math.floor(rand() * cand.length)];
    usedS.add(p.s); usedA.add(p.answer); prevSig = p.sig;
    days.push({ s: p.s, lv: p.f.level });
  }
  return { start: C.START, tz: C.TZ, count: days.length, days };
}

const out = build(COUNT);
const file = path.join(root, 'chou', 'days.json');
const text = JSON.stringify(out).replace(/\},\{/g, '},\n{') + '\n';
if (args.includes('--check')) {
  const cur = readFileSync(file, 'utf8');
  if (cur !== text) { console.log('chou_days --check FAIL: chou/days.json is not what the builder makes'); process.exit(1); }
  console.log(`chou_days --check PASS (${out.count} days)`);
} else {
  writeFileSync(file, text);
  const lv = [0, 0, 0];
  out.days.forEach(d => lv[d.lv]++);
  console.log(`wrote chou/days.json: ${out.count} days, levels 易/中/难 ${lv.join('/')}`);
}
