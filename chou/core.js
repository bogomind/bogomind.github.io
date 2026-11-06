/* 差一筹: the rules, without the page. The page, the day list builder and the tests all load this file.
   A board is a sum laid in counting rods, one number per row, top to bottom: row 0 is a number, every later row
   is an operator (+ - =) and a number. Columns are places (个 十 百 from the right); a number is right-aligned and
   an empty cell is 0. Digits follow the old rule: units, hundreds... lie upright (纵), tens, thousands... lie flat
   (横); 1-5 are that many rods, 6-9 put one crossing rod for five on top (五在上方, 六不积聚, 五不单张).
   Operators are rods too: + is one upright and one flat, - is one flat, = is two flat.
   Text form: the first row's digits, then each later row as its operator and digits: "07+05=12". */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChouCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var START = '2026-11-07';          // day #1, in Asia/Shanghai
  var TZ = 'Asia/Shanghai';
  var TITLE = '差一筹';
  var URL_TEXT = 'bogomind.com/chou/';
  var PLACE = ['个', '十', '百', '千', '万'];

  /* ---------- days ---------- */
  function ymd(date, tz) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }
  function toUTC(s) { var a = s.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function dayNumber(date, start, tz) { return daysBetween(start || START, ymd(date || new Date(), tz)) + 1; }
  function dateOfDay(n, start) { return new Date(toUTC(start || START) + (n - 1) * 86400000).toISOString().slice(0, 10); }

  /* ---------- shapes ---------- */
  // digit value <-> {b: five-rod present, u: unit rods}
  function dshape(v) { return v >= 6 ? { b: 1, u: v - 5 } : { b: 0, u: v }; }
  function dvalue(b, u) {
    if (b === 0 && u >= 0 && u <= 5) return u;
    if (b === 1 && u >= 1 && u <= 4) return 5 + u;
    return -1;                                   // 五不单张: a lone five-rod, or too many rods, is no digit
  }
  var OPS = { '+': { v: 1, h: 1 }, '-': { v: 0, h: 1 }, '=': { v: 0, h: 2 } };
  function oshape(op) { return op ? { v: OPS[op].v, h: OPS[op].h } : { v: 0, h: 0 }; }
  function ovalue(v, h) {
    if (v === 1 && h === 1) return '+';
    if (v === 0 && h === 1) return '-';
    if (v === 0 && h === 2) return '=';
    return null;
  }
  function rodCount(v) { var s = dshape(v); return s.b + s.u; }

  /* ---------- boards ---------- */
  function parse(s) {
    var m = /^(\d+)((?:[+\-=]\d+)+)$/.exec(String(s));
    if (!m) throw new Error('bad board ' + s);
    var cols = m[1].length;
    var rows = [{ op: null, d: m[1].split('').map(Number) }];
    var re = /([+\-=])(\d+)/g, x;
    while ((x = re.exec(m[2]))) {
      if (x[2].length !== cols) throw new Error('ragged board ' + s);
      rows.push({ op: x[1], d: x[2].split('').map(Number) });
    }
    return { cols: cols, rows: rows };
  }
  function str(b) {
    return b.rows.map(function (r, i) { return (i ? r.op : '') + r.d.join(''); }).join('');
  }
  function clone(b) {
    return { cols: b.cols, rows: b.rows.map(function (r) { return { op: r.op, d: r.d.slice() }; }) };
  }
  function rowValue(r) { var n = 0; r.d.forEach(function (x) { n = n * 10 + x; }); return n; }
  // the place of column c (0 = units) and the way its digits lie: 'v' upright (个 百 万), 'h' flat (十 千)
  function place(b, c) { return b.cols - 1 - c; }
  function form(b, c) { return place(b, c) % 2 === 0 ? 'v' : 'h'; }
  // which way a rod lies on the board: 'v' or 'h'
  function rodDir(b, c, p) {
    if (c < 0) return p;                         // operator rods: part is the direction
    var f = form(b, c);
    if (p === 'u') return f;
    return f === 'v' ? 'h' : 'v';                // the five-rod crosses the units
  }

  // is it a sum at all: every operator a real one, exactly one =, no empty row
  function wellFormed(b) {
    var eq = 0;
    for (var i = 0; i < b.rows.length; i++) {
      var r = b.rows[i];
      if (i > 0) {
        if (!r.op || !OPS[r.op]) return false;
        if (r.op === '=') eq++;
      }
      if (rowValue(r) === 0) return false;
    }
    return eq === 1;
  }
  // {left, right, ok}: both sides of the sum
  function evaluate(b) {
    var side = [0, 0], k = 0;
    b.rows.forEach(function (r, i) {
      var v = rowValue(r);
      if (i === 0) { side[0] = v; return; }
      if (r.op === '=') { k = 1; side[1] = v; return; }
      side[k] += r.op === '-' ? -v : v;
    });
    return { left: side[0], right: side[1], ok: side[0] === side[1] };
  }
  function isTrue(b) { return wellFormed(b) && evaluate(b).ok; }
  function arabic(b) {
    return b.rows.map(function (r, i) {
      return (i ? ' ' + (r.op === '-' ? '−' : r.op) + ' ' : '') + rowValue(r);
    }).join('');
  }

  /* ---------- moves ---------- */
  // every rod that can be picked up: {r, c, p} (c = -1 is the operator cell; p = 'u' unit, 'b' five, 'v'/'h' op rod)
  function sources(b) {
    var out = [];
    b.rows.forEach(function (r, ri) {
      if (ri > 0 && r.op) {
        var o = oshape(r.op);
        if (o.v) out.push({ r: ri, c: -1, p: 'v' });
        if (o.h) out.push({ r: ri, c: -1, p: 'h' });
      }
      r.d.forEach(function (v, ci) {
        var s = dshape(v);
        if (s.u) out.push({ r: ri, c: ci, p: 'u' });
        if (s.b) out.push({ r: ri, c: ci, p: 'b' });
      });
    });
    return out;
  }
  // remove one rod and put it at `to` (put back = no move). Returns the new board, or null when a cell would be no
  // digit or no operator. The result may still not be a well-formed sum (checked separately).
  function apply(b, from, to) {
    var x = clone(b);
    // shapes as counts, so a cell may pass through a broken shape while the rod is in the hand
    var sh = x.rows.map(function (r) {
      return { o: r.op ? oshape(r.op) : (null), d: r.d.map(dshape) };
    });
    function cellOf(a) { return a.c < 0 ? sh[a.r].o : sh[a.r].d[a.c]; }
    var f = cellOf(from), t = cellOf(to);
    if (!f || !t) return null;
    if (f[from.p] < 1) return null;
    f[from.p] -= 1;
    t[to.p] += 1;
    for (var i = 0; i < sh.length; i++) {
      if (i > 0) {
        var op = ovalue(sh[i].o.v, sh[i].o.h);
        if (!op) return null;
        x.rows[i].op = op;
      } else if (sh[i].o) return null;
      for (var j = 0; j < sh[i].d.length; j++) {
        var v = dvalue(sh[i].d[j].b, sh[i].d[j].u);
        if (v < 0) return null;
        x.rows[i].d[j] = v;
      }
    }
    return x;
  }
  function targetsOf(b) {
    var out = [];
    b.rows.forEach(function (r, ri) {
      if (ri > 0) { out.push({ r: ri, c: -1, p: 'v' }); out.push({ r: ri, c: -1, p: 'h' }); }
      r.d.forEach(function (v, ci) { out.push({ r: ri, c: ci, p: 'u' }); out.push({ r: ri, c: ci, p: 'b' }); });
    });
    return out;
  }
  // where the rod at `from` may go: [{to, board, home}], home = put back where it was
  function targets(b, from) {
    var start = str(b), out = [];
    targetsOf(b).forEach(function (to) {
      var nb = apply(b, from, to);
      if (!nb) return;
      var s = str(nb);
      if (s === start) { if (to.r === from.r && to.c === from.c && to.p === from.p) out.push({ to: to, board: nb, home: true }); return; }
      if (!wellFormed(nb)) return;
      out.push({ to: to, board: nb, home: false });
    });
    return out;
  }
  // every one-rod move that changes the board into a well-formed sum: [{from, to, board, s}]
  function moves(b) {
    var start = str(b), out = [], seen = {};
    sources(b).forEach(function (from) {
      targets(b, from).forEach(function (t) {
        if (t.home) return;
        var s = str(t.board);
        if (s === start) return;
        out.push({ from: from, to: t.to, board: t.board, s: s, first: !seen[s] });
        seen[s] = 1;
      });
    });
    return out;
  }
  // the distinct true sums one move away
  function solutions(b) {
    var seen = {}, out = [];
    moves(b).forEach(function (m) {
      if (!seen[m.s] && evaluate(m.board).ok) { seen[m.s] = 1; out.push(m); }
    });
    return out;
  }
  function samePlace(a, b) { return a.r === b.r && a.c === b.c && a.p === b.p; }

  /* ---------- difficulty ---------- */
  // what kind of move solves a puzzle, and a rough score (higher = harder)
  function features(b, m) {
    var fromDigit = m.from.c >= 0, toDigit = m.to.c >= 0;
    var f = {
      cols: b.cols,
      op: !fromDigit || !toDigit,
      five: (fromDigit && m.from.p === 'b') || (toDigit && m.to.p === 'b'),
      inPlace: m.from.r === m.to.r && m.from.c === m.to.c,
      sameRow: m.from.r === m.to.r,
      turn: rodDir(b, m.from.c, m.from.p) !== rodDir(b, m.to.c, m.to.p),
      fills: toDigit && b.rows[m.to.r].d[m.to.c] === 0,
      empties: fromDigit && m.board.rows[m.from.r].d[m.from.c] === 0,
      placeShift: fromDigit && toDigit && place(b, m.from.c) !== place(b, m.to.c),
      branching: 0,
      fives: 0,
      zeros: 0,
      opsChanged: (b.rows.map(function (r) { return r.op; }).join() !== m.board.rows.map(function (r) { return r.op; }).join())
    };
    var seen = {};
    moves(b).forEach(function (x) { seen[x.s] = 1; });
    f.branching = Object.keys(seen).length;
    b.rows.forEach(function (r) {
      var lead = true;
      r.d.forEach(function (v) {
        if (v >= 6) f.fives++;
        if (v === 0 && !lead) f.zeros++;
        if (v) lead = false;
      });
    });
    // ideas a solver has to have: a five-rod, turning a rod inside one digit, an operator, a rod changing place
    // (个 <-> 十), a cell going empty or filling up
    f.ideas = (f.five && !f.inPlace ? 1 : 0) + (f.inPlace ? 1 : 0) + (f.op ? 1 : 0) + (f.placeShift ? 1 : 0) +
      (f.fills || f.empties ? 1 : 0);
    f.level = levelOf(f);
    return f;
  }
  var LEVELS = ['易', '中', '难'];
  // 0 易, 1 中, 2 难
  function levelOf(f) {
    var n = f.ideas + (f.zeros ? 1 : 0);
    if (f.cols === 1) return n <= 1 ? 0 : n === 2 ? 1 : 2;
    if (f.cols === 2) return n === 0 ? 0 : n === 1 ? 1 : 2;
    return n === 0 ? 1 : 2;
  }

  /* ---------- making puzzles ---------- */
  // a small seeded random (mulberry32), so the day list and tests can repeat a run
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pad(n, cols) { var s = String(n); while (s.length < cols) s = '0' + s; return s; }
  // a random true sum on `cols` columns: a+b=c, a-b=c, a=b+c or a=b-c, using the whole width at least once
  function randomTrue(rand, cols) {
    var max = Math.pow(10, cols) - 1, lo = cols > 1 ? Math.pow(10, cols - 1) : 1;
    for (var tries = 0; tries < 200; tries++) {
      var kind = Math.floor(rand() * 4);
      var a = 1 + Math.floor(rand() * max), bb = 1 + Math.floor(rand() * max);
      // keep sums small enough to fit
      var c = a + bb;
      if (c > max) continue;
      if (Math.max(a, bb, c) < lo) continue;
      var s;
      if (kind === 0) s = pad(a, cols) + '+' + pad(bb, cols) + '=' + pad(c, cols);          // a + b = c
      else if (kind === 1) s = pad(c, cols) + '-' + pad(a, cols) + '=' + pad(bb, cols);     // c - a = b
      else if (kind === 2) s = pad(c, cols) + '=' + pad(a, cols) + '+' + pad(bb, cols);     // c = a + b
      else s = pad(a, cols) + '=' + pad(c, cols) + '-' + pad(bb, cols);                     // a = c - b
      return s;
    }
    return null;
  }
  // one puzzle: a true sum with one rod moved wrong, whose only fix is moving it back. {s, answer, f} or null
  function makePuzzle(rand, cols, accept) {
    for (var tries = 0; tries < 400; tries++) {
      var e = randomTrue(rand, cols);
      if (!e) continue;
      var E = parse(e);
      var ms = moves(E).filter(function (m) { return !evaluate(m.board).ok; });
      if (!ms.length) continue;
      var m = ms[Math.floor(rand() * ms.length)];
      var P = m.board;
      var sol = solutions(P);
      if (sol.length !== 1 || sol[0].s !== e) continue;
      var f = features(P, sol[0]);
      if (accept && !accept(f, P, E)) continue;
      return { s: str(P), answer: e, f: f };
    }
    return null;
  }

  /* ---------- the board on screen ---------- */
  // sizes in board units; the page scales them
  var G = { W: 96, H: 120, GUT: 80, L: 60, T: 9, D: 14, GAP: 2, PAD: 10, HEAD: 28 };
  // rods of one digit in a cell centred at (cx, cy); each rod {p, k, x, y, a} with a = 'v' upright or 'h' flat
  function digitRods(v, f, cx, cy) {
    var s = dshape(v), out = [], i;
    var L = G.L, T = G.T, D = G.D, GAP = G.GAP;
    if (f === 'v') {
      if (!s.b) {
        for (i = 0; i < s.u; i++) out.push({ p: 'u', k: i, x: cx + (i - (s.u - 1) / 2) * D, y: cy, a: 'v' });
      } else {
        var tot = T + GAP + L, top = cy - tot / 2;
        out.push({ p: 'b', k: 0, x: cx, y: top + T / 2, a: 'h' });
        for (i = 0; i < s.u; i++) out.push({ p: 'u', k: i, x: cx + (i - (s.u - 1) / 2) * D, y: top + T + GAP + L / 2, a: 'v' });
      }
    } else {
      if (!s.b) {
        for (i = 0; i < s.u; i++) out.push({ p: 'u', k: i, x: cx, y: cy + (i - (s.u - 1) / 2) * D, a: 'h' });
      } else {
        var tot2 = L + GAP + (s.u - 1) * D + T, top2 = cy - tot2 / 2;
        out.push({ p: 'b', k: 0, x: cx, y: top2 + L / 2, a: 'v' });
        for (i = 0; i < s.u; i++) out.push({ p: 'u', k: i, x: cx, y: top2 + L + GAP + T / 2 + i * D, a: 'h' });
      }
    }
    return out;
  }
  function opRods(op, cx, cy) {
    if (op === '+') return [{ p: 'h', k: 0, x: cx, y: cy, a: 'h' }, { p: 'v', k: 0, x: cx, y: cy, a: 'v' }];
    if (op === '-') return [{ p: 'h', k: 0, x: cx, y: cy, a: 'h' }];
    if (op === '=') return [{ p: 'h', k: 0, x: cx, y: cy - 10, a: 'h' }, { p: 'h', k: 1, x: cx, y: cy + 10, a: 'h' }];
    return [];
  }
  // the whole board: {w, h, cells, rods, heads}; rod keys are "r,c,p,k"
  function layout(b) {
    var w = G.PAD * 2 + G.GUT + b.cols * G.W, h = G.PAD * 2 + G.HEAD + b.rows.length * G.H;
    var cells = [], rods = [], heads = [];
    for (var c = 0; c < b.cols; c++) {
      heads.push({ c: c, x: G.PAD + G.GUT + c * G.W + G.W / 2, y: G.PAD + G.HEAD / 2, label: PLACE[place(b, c)] || '' });
    }
    b.rows.forEach(function (r, ri) {
      var y0 = G.PAD + G.HEAD + ri * G.H;
      if (ri > 0) {
        cells.push({ r: ri, c: -1, x: G.PAD, y: y0, w: G.GUT, h: G.H });
        opRods(r.op, G.PAD + G.GUT / 2, y0 + G.H / 2).forEach(function (q) {
          q.r = ri; q.c = -1; q.key = ri + ',-1,' + q.p + ',' + q.k; rods.push(q);
        });
      }
      r.d.forEach(function (v, ci) {
        var x0 = G.PAD + G.GUT + ci * G.W;
        cells.push({ r: ri, c: ci, x: x0, y: y0, w: G.W, h: G.H });
        digitRods(v, form(b, ci), x0 + G.W / 2, y0 + G.H / 2).forEach(function (q) {
          q.r = ri; q.c = ci; q.key = ri + ',' + ci + ',' + q.p + ',' + q.k; rods.push(q);
        });
      });
    });
    return { w: w, h: h, cells: cells, rods: rods, heads: heads };
  }
  // the board as a small static SVG (front page card, share pictures)
  function svg(b, opts) {
    opts = opts || {};
    var L = layout(b), g = G;
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.w + ' ' + L.h + '" role="img" aria-label="' + (opts.label || '算筹算式') + '">'];
    var line = opts.line || 'rgba(232,206,160,.16)', rod = opts.rod || '#e9d8b4';
    L.cells.forEach(function (c) {
      if (c.c >= 0) parts.push('<rect x="' + (c.x + 2) + '" y="' + (c.y + 2) + '" width="' + (c.w - 4) + '" height="' + (c.h - 4) + '" rx="6" fill="none" stroke="' + line + '" stroke-width="1.5"/>');
    });
    L.rods.forEach(function (q) {
      var rw = q.a === 'h' ? g.L : g.T, rh = q.a === 'h' ? g.T : g.L;
      parts.push('<rect x="' + (q.x - rw / 2) + '" y="' + (q.y - rh / 2) + '" width="' + rw + '" height="' + rh + '" rx="' + (g.T / 2) + '" fill="' + rod + '"/>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  /* ---------- a day's game ---------- */
  // tries: [{s: board after the move, ok}]; state of the day
  function play(tries) {
    var won = tries.some(function (t) { return t.ok; });
    var used = won ? tries.findIndex(function (t) { return t.ok; }) + 1 : tries.length;
    return { won: won, used: used };
  }
  var SQ = { miss: '\ud83d\udfe5', hit: '\ud83d\udfe9', shown: '\u2b1c' };
  function shareText(n, rec) {
    var marks = (rec.tries || []).map(function (t) { return t.ok ? SQ.hit : SQ.miss; });
    if (rec.revealed && !rec.won) marks.push(SQ.shown);
    var head = TITLE + ' #' + n + ' ' + (rec.won ? (rec.tries.length === 1 ? '一次摆对' : '第 ' + rec.tries.length + ' 次摆对') : '看了答案');
    if (rec.hints) head += ' · 提示 ' + rec.hints;
    return head + '\n' + marks.join('') + '\n' + URL_TEXT;
  }
  // stats over day records {n: rec}; only games finished on their own day count. A streak is days in a row solved
  // without looking at the answer; it is still alive if the last one was today or yesterday.
  function stats(recs, today) {
    var ns = Object.keys(recs).map(Number).filter(function (n) {
      var r = recs[n];
      return r && r.onDay && (r.done || r.won || r.revealed);
    }).sort(function (a, b) { return a - b; });
    var won = 0, first = 0, dist = [0, 0, 0, 0, 0], best = 0, run = 0, prev = null;
    ns.forEach(function (n) {
      var r = recs[n], ok = !!r.won && !r.revealed;
      if (ok) {
        won++;
        dist[Math.min(r.tries.length, 5) - 1]++;
        if (r.tries.length === 1 && !r.hints) first++;
        run = prev !== null && n === prev + 1 && run > 0 ? run + 1 : 1;
      } else run = 0;
      prev = n;
      if (run > best) best = run;
    });
    var last = ns.length ? ns[ns.length - 1] : null;
    return { played: ns.length, won: won, first: first, dist: dist, streak: last !== null && last >= today - 1 ? run : 0, best: best };
  }

  return {
    START: START, TZ: TZ, TITLE: TITLE, URL_TEXT: URL_TEXT, PLACE: PLACE, G: G, LEVELS: LEVELS,
    ymd: ymd, dayNumber: dayNumber, dateOfDay: dateOfDay,
    dshape: dshape, dvalue: dvalue, oshape: oshape, ovalue: ovalue, rodCount: rodCount,
    parse: parse, str: str, clone: clone, rowValue: rowValue, place: place, form: form, rodDir: rodDir,
    wellFormed: wellFormed, evaluate: evaluate, isTrue: isTrue, arabic: arabic,
    sources: sources, apply: apply, targets: targets, moves: moves, solutions: solutions, samePlace: samePlace,
    features: features, levelOf: levelOf, rng: rng, randomTrue: randomTrue, makePuzzle: makePuzzle,
    digitRods: digitRods, opRods: opRods, layout: layout, svg: svg, play: play, shareText: shareText, stats: stats
  };
}));
