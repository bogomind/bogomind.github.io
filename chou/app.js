/* 差一筹: the page. Rules live in core.js. No trackers, no accounts: progress stays in this browser (localStorage). */
(function () {
  'use strict';
  var C = window.ChouCore;
  var G = C.G;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'chou:v1';
  var ROWS = ['第一行', '第二行', '第三行', '第四行'];
  var store = load();
  var cfg = null, notes = null, today = 0;
  var game = null;        // {mode: 'day'|'practice', n, start, board, sol, rec}
  var view = null;        // the board on screen
  var busy = false;

  function load() {
    var d = { days: {}, seenHelp: false, keyOpen: false, read: true, practice: { solved: 0, lv: 0 } };
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.days) { for (var k in d) if (!(k in s)) s[k] = d[k]; return s; } } catch (e) { /* fresh */ }
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode: play on */ } }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function md(s) { var a = s.split('-'); return (+a[1]) + '月' + (+a[2]) + '日'; }
  function show(id) {            // 'play' (the board, maybe with the result under it) or 'archive'
    $('play').hidden = id !== 'play';
    $('archive').hidden = id !== 'archive';
    if (id !== 'play') $('done').hidden = true;
  }
  function msg(text, cls) { var m = $('msg'); m.textContent = text || ''; m.className = 'msg' + (cls ? ' ' + cls : ''); }

  /* ---------- the board on screen ---------- */
  function scaleFor(lay) {
    var host = $('board');
    var w = host.clientWidth || 340;
    var s = Math.min(w / lay.w, 1.28);
    var room = window.innerHeight - 230;
    if (room > 260) s = Math.min(s, room / lay.h);
    return Math.max(s, 0.62);
  }
  function rodTransform(q, s, lift) {
    var len = G.L * s, th = G.T * s;
    var x = q.x * s - len / 2, y = q.y * s - th / 2 - (lift || 0);
    return 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + (q.a === 'v' ? 90 : 0) + 'deg)' + (lift ? ' scale(1.06)' : '');
  }
  function sizeRod(e, s) { e.style.width = (G.L * s).toFixed(2) + 'px'; e.style.height = (G.T * s).toFixed(2) + 'px'; }

  function build(board) {
    var host = $('board');
    host.innerHTML = '';
    host.classList.remove('won', 'shown', 'shake', 'holding');
    var lay = C.layout(board), s = scaleFor(lay);
    var stage = el('div', 'stage');
    stage.style.width = (lay.w * s) + 'px';
    stage.style.height = (lay.h * s) + 'px';
    stage.style.setProperty('--s', s);
    lay.heads.forEach(function (h) {
      var e = el('span', 'head', h.label);
      e.style.left = (h.x * s) + 'px'; e.style.top = (h.y * s) + 'px';
      stage.appendChild(e);
    });
    lay.cells.forEach(function (c) {
      var e = el('div', 'cell' + (c.c < 0 ? ' opcell' : ''));
      e.style.left = (c.x * s) + 'px'; e.style.top = (c.y * s) + 'px';
      e.style.width = (c.w * s) + 'px'; e.style.height = (c.h * s) + 'px';
      e.dataset.r = c.r; e.dataset.c = c.c;
      stage.appendChild(e);
    });
    var reads = [];
    board.rows.forEach(function (r, ri) {
      var e = el('span', 'rv');
      e.style.top = ((G.PAD + G.HEAD + ri * G.H + G.H - 21) * s) + 'px';
      e.style.right = (G.PAD * s + 5) + 'px';
      stage.appendChild(e);
      reads.push(e);
    });
    var els = {};
    lay.rods.forEach(function (q) {
      var e = el('div', 'rod');
      e.dataset.key = q.key;
      e.setAttribute('role', 'button');
      e.setAttribute('tabindex', '0');
      sizeRod(e, s);
      e.style.transform = rodTransform(q, s);
      stage.appendChild(e);
      els[q.key] = e;
    });
    var seal = el('div', 'seal', '成');
    seal.setAttribute('aria-hidden', 'true');
    seal.style.left = ((G.PAD + G.GUT / 2) * s) + 'px';
    seal.style.top = ((G.PAD + G.HEAD + G.H / 2) * s) + 'px';
    stage.appendChild(seal);
    host.appendChild(stage);
    view = { board: board, stage: stage, els: els, s: s, lay: lay, lifted: null, choice: null, reads: reads };
    labelRods();
    readout();
  }
  // move every rod to where the board says, by key
  function relayout(board) {
    var lay = C.layout(board), s = view.s;
    var seen = {};
    lay.rods.forEach(function (q) {
      var e = view.els[q.key];
      if (!e) {               // should not happen: rods are only ever moved, never made
        e = el('div', 'rod'); e.dataset.key = q.key; e.setAttribute('role', 'button'); e.setAttribute('tabindex', '0');
        sizeRod(e, s); view.stage.appendChild(e); view.els[q.key] = e;
      }
      e.style.transform = rodTransform(q, s);
      seen[q.key] = 1;
    });
    Object.keys(view.els).forEach(function (k) { if (!seen[k]) { view.els[k].remove(); delete view.els[k]; } });
    view.board = board; view.lay = lay;
    labelRods();
    readout();
  }
  function resize() {
    if (!view) return;
    var keep = view.board;
    var lifted = view.lifted;
    if (lifted) cancel();
    build(keep);
    if (game && (game.rec.won || game.rec.revealed)) view.stage.parentNode.classList.add(game.rec.won ? 'won' : 'shown');
  }
  function rodName(board, key) {
    var a = key.split(','), r = +a[0], c = +a[1], p = a[2];
    var dir = C.rodDir(board, c, p) === 'v' ? '竖' : '横';
    var where = ROWS[r] + (c < 0 ? '符号' : C.PLACE[C.place(board, c)] + '位');
    var what = c < 0 ? '一根' + dir + '筹' : p === 'b' ? '当五的' + dir + '筹' : '一根' + dir + '筹';
    return where + '，' + what;
  }
  function labelRods() {
    Object.keys(view.els).forEach(function (k) { view.els[k].setAttribute('aria-label', rodName(view.board, k)); });
  }
  function readout() {
    var on = !!store.read;
    view.stage.classList.toggle('reading', on);
    view.board.rows.forEach(function (r, i) {
      var v = C.rowValue(r);
      view.reads[i].textContent = (i ? (r.op === '-' ? '−' : r.op) + ' ' : '') + v;
    });
  }

  // keys: "r,c,p,k". Taking rod k out of (r,c,p) shifts the later ones down; a rod put into (r,c,p) goes last.
  function rekey(from, to, key) {
    var e = view.els[key];
    delete view.els[key];
    var k0 = +key.split(',')[3];
    var pre = from.r + ',' + from.c + ',' + from.p + ',';
    Object.keys(view.els).filter(function (k) { return k.indexOf(pre) === 0; })
      .map(function (k) { return +k.split(',')[3]; }).sort(function (a, b) { return a - b; })
      .forEach(function (k) { if (k > k0) { view.els[pre + (k - 1)] = view.els[pre + k]; delete view.els[pre + k]; } });
    var tp = to.r + ',' + to.c + ',' + to.p + ',';
    var n = Object.keys(view.els).filter(function (k) { return k.indexOf(tp) === 0; }).length;
    view.els[tp + n] = e;
    e.dataset.key = tp + n;
    return tp + n;
  }
  function lastKey(at) {
    var pre = at.r + ',' + at.c + ',' + at.p + ',';
    var ks = Object.keys(view.els).filter(function (k) { return k.indexOf(pre) === 0; });
    ks.sort(function (a, b) { return +b.split(',')[3] - +a.split(',')[3]; });
    return ks[0];
  }
  function whyStuck(board, from) {
    if (from.c < 0) {
      var op = board.rows[from.r].op;
      if (op === '-') return '拿走这根，这一行就没有符号了。';
      if (op === '+' && from.p === 'h') return '拿走横的这根，只剩一竖，就不是符号了。';
      return '这根挪到哪里，都摆不成一道算式。';
    }
    var v = board.rows[from.r].d[from.c];
    if (from.p === 'u' && v === 6) return '五不单张：只剩一根“五”，就不成数了。';
    return '这根挪到哪里，都摆不成一道算式。换一根试试。';
  }

  /* ---------- touching rods ---------- */
  // tap a cell (or a rod) to pick up the rod nearest the finger; while holding one, the cells it may go to glow:
  // tap one to put it there (when a cell takes it two ways, a small chooser shows both results).
  function pointOf(e) {
    var r = view.stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.s, y: (e.clientY - r.top) / view.s };
  }
  function cellAt(p) {
    for (var i = 0; i < view.lay.cells.length; i++) {
      var c = view.lay.cells[i];
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) return c;
    }
    return null;
  }
  function rodNear(c, p) {
    var best = null, bd = 1e9;
    view.lay.rods.forEach(function (q) {
      if (q.r !== c.r || q.c !== c.c) return;
      var hx = q.a === 'h' ? G.L / 2 : 0, hy = q.a === 'v' ? G.L / 2 : 0;
      var dx = Math.max(Math.abs(p.x - q.x) - hx, 0), dy = Math.max(Math.abs(p.y - q.y) - hy, 0);
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = q; }
    });
    return best;
  }
  function cellEl(r, c) { return view.stage.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]'); }
  function rodOf(key) { return view.lay.rods.filter(function (x) { return x.key === key; })[0]; }
  function onTap(e) {
    if (busy || !game || game.rec.done) return;
    var tg = e.target;
    if (tg.closest && tg.closest('.choice')) return;          // the chooser handles its own taps
    closeChooser();
    var p = e.clientX || e.clientY ? pointOf(e) : null;
    var c = p ? cellAt(p) : null;
    if (!c && tg.classList && tg.classList.contains('cell')) {
      c = view.lay.cells.filter(function (x) { return x.r === +tg.dataset.r && x.c === +tg.dataset.c; })[0];
    }
    var keyHit = tg.classList && tg.classList.contains('rod') ? tg.dataset.key : null;
    var L = view.lifted;
    if (L) {
      if (keyHit === L.key) { cancel(); return; }
      if (!c && keyHit) { var kq = rodOf(keyHit); c = view.lay.cells.filter(function (x) { return x.r === kq.r && x.c === kq.c; })[0]; }
      if (!c) { cancel(); return; }
      var opts = L.ts.filter(function (t) { return t.to.r === c.r && t.to.c === c.c; });
      var own = c.r === L.from.r && c.c === L.from.c;
      if (opts.length === 1 && !own) { drop(opts[0]); return; }
      if (opts.length) { chooser(c, opts, own); return; }
      if (own) { cancel(); return; }
      var q = keyHit ? rodOf(keyHit) : p ? rodNear(c, p) : null;
      cancel();
      if (q) lift(q.key);
      return;
    }
    var key = keyHit;
    if (!key && c && p) { var q2 = rodNear(c, p); if (q2) key = q2.key; }
    if (key) lift(key);
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (view && view.lifted) cancel(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (!t.classList || !(t.classList.contains('rod') || t.classList.contains('cell'))) return;
    e.preventDefault();
    onTap({ target: t });
  }
  function lift(key) {
    var a = key.split(','), from = { r: +a[0], c: +a[1], p: a[2] };
    var ts = C.targets(view.board, from).filter(function (t) { return !t.home; });
    var e = view.els[key];
    if (!ts.length) {
      msg(whyStuck(view.board, from));
      e.classList.remove('nope'); void e.offsetWidth; e.classList.add('nope');
      return;
    }
    var q = rodOf(key);
    view.lifted = { key: key, from: from, ts: ts, q: q };
    e.classList.add('up');
    e.style.transform = rodTransform(q, view.s, 7);
    $('board').classList.add('holding');
    var seen = {};
    ts.forEach(function (t) {
      var k = t.to.r + ',' + t.to.c;
      if (seen[k]) return;
      seen[k] = 1;
      var ce = cellEl(t.to.r, t.to.c);
      ce.classList.add('can');
      ce.setAttribute('tabindex', '0');
      ce.setAttribute('role', 'button');
      ce.setAttribute('aria-label', '放到' + ROWS[t.to.r] + (t.to.c < 0 ? '符号' : C.PLACE[C.place(view.board, t.to.c)] + '位'));
    });
    msg('它能去发亮的格子。再点它一下，就放回去。');
  }
  function clearCan() {
    Array.prototype.forEach.call(view.stage.querySelectorAll('.cell.can'), function (c) {
      c.classList.remove('can'); c.removeAttribute('tabindex'); c.removeAttribute('role'); c.removeAttribute('aria-label');
    });
    $('board').classList.remove('holding');
    closeChooser();
  }
  function cancel() {
    var L = view.lifted;
    if (!L) return;
    var e = view.els[L.key];
    e.classList.remove('up');
    e.style.transform = rodTransform(L.q, view.s);
    view.lifted = null;
    clearCan();
    msg('');
  }
  function drop(t) {
    var L = view.lifted;
    var e = view.els[L.key];
    e.classList.remove('up');
    clearCan();
    view.lifted = null;
    msg('');
    var nk = rekey(L.from, t.to, L.key);
    relayout(t.board);
    judge(t, L.from, nk);
  }
  // one cell of a board as a small picture (the chooser)
  function cellSVG(b, r, c) {
    var W = c < 0 ? G.GUT : G.W, H = G.H;
    var rods = c < 0 ? C.opRods(b.rows[r].op, W / 2, H / 2) : C.digitRods(b.rows[r].d[c], C.form(b, c), W / 2, H / 2);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
    rods.forEach(function (q) {
      var rw = q.a === 'h' ? G.L : G.T, rh = q.a === 'h' ? G.T : G.L;
      s += '<rect x="' + (q.x - rw / 2) + '" y="' + (q.y - rh / 2) + '" width="' + rw + '" height="' + rh + '" rx="' + G.T / 2 + '"/>';
    });
    return s + '</svg>';
  }
  function chooser(c, opts, own) {
    var box = el('div', 'choice');
    var items = opts.slice();
    if (own) items.unshift({ home: true });
    items.forEach(function (t) {
      var b = el('button', 'opt');
      b.type = 'button';
      var nb = t.home ? view.board : t.board;
      b.innerHTML = cellSVG(nb, c.r, c.c);
      var v = c.c < 0 ? (nb.rows[c.r].op === '-' ? '减号' : nb.rows[c.r].op === '+' ? '加号' : '等号') : String(nb.rows[c.r].d[c.c]);
      b.appendChild(el('span', null, t.home ? '放回' : v));
      b.setAttribute('aria-label', t.home ? '放回去' : '摆成' + v);
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        closeChooser();
        if (t.home) cancel(); else drop(t);
      });
      box.appendChild(b);
    });
    var s = view.s, above = c.y * s > 110;
    box.style.left = ((c.x + c.w / 2) * s) + 'px';
    box.style.top = ((above ? c.y : c.y + c.h) * s) + 'px';
    box.classList.add(above ? 'above' : 'below');
    view.stage.appendChild(box);
    view.choice = box;
    msg('这一格能放成两样，选一个。');
    var first = box.querySelector('button');
    if (first && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('cell')) first.focus();
  }
  function closeChooser() {
    if (view && view.choice) { view.choice.remove(); view.choice = null; }
  }
  function judge(t, from, nk) {
    var rec = game.rec, ok = C.isTrue(t.board);
    rec.tries.push({ s: C.str(t.board), ok: ok });
    drawTries();
    if (ok) { save(); win(); return; }
    var ev = C.evaluate(t.board);
    var num = function (v) { return v < 0 ? '−' + (-v) : String(v); };
    msg('摆成了 ' + C.arabic(t.board) + '，左边 ' + num(ev.left) + '，右边 ' + num(ev.right) + '，不成立。', 'warn');
    save();
    busy = true;
    var host = $('board');
    host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake');
    setTimeout(function () {
      // the rod goes back where it came from
      rekey(t.to, from, nk);
      relayout(game.start);
      busy = false;
      if (rec.tries.length >= 3 && !rec.hints) $('hint').classList.add('nudge');
    }, 1100);
  }
  function drawTries() {
    var box = $('tries');
    box.innerHTML = '';
    game.rec.tries.forEach(function (t) { box.appendChild(el('span', 't ' + (t.ok ? 'hit' : 'miss'))); });
    var n = game.rec.tries.filter(function (t) { return !t.ok; }).length;
    $('triesl').textContent = n ? '摆错 ' + n + ' 次' : '';
  }

  /* ---------- hints, answer, win ---------- */
  function hint() {
    if (busy || game.rec.won || game.rec.revealed) return;
    if (view.lifted) cancel();
    var rec = game.rec, m = game.sol;
    $('hint').classList.remove('nudge');
    if (rec.hints === 0) {
      rec.hints = 1;
      msg('提示：要挪的那根，在' + ROWS[m.from.r] + '。');
      markRow(m.from.r);
    } else if (rec.hints === 1) {
      rec.hints = 2;
      msg('提示：就是发亮的这根。它该去哪儿？');
      var k = lastKey(m.from);
      if (k) view.els[k].classList.add('hinted');
      $('hint').textContent = '看答案';
    } else {
      reveal();
      return;
    }
    save();
    drawHint();
  }
  function drawHint() {
    var rec = game.rec;
    $('hint').textContent = rec.hints >= 2 ? '看答案' : rec.hints === 1 ? '再提示' : '提示';
    if (rec.hints >= 1) markRow(game.sol.from.r);
    if (rec.hints >= 2) { var k = lastKey(game.sol.from); if (k) view.els[k].classList.add('hinted'); }
  }
  function markRow(r) {
    Array.prototype.forEach.call(view.stage.querySelectorAll('.cell'), function (c) { c.classList.toggle('mark', +c.dataset.r === r); });
  }
  function reveal() {
    if (view.lifted) cancel();
    var rec = game.rec, m = game.sol;
    rec.revealed = true;
    save();
    busy = true;
    var k = lastKey(m.from), e = view.els[k];
    var q = view.lay.rods.filter(function (x) { return x.key === k; })[0];
    e.classList.add('up');
    e.style.transform = rodTransform(q, view.s, 7);
    msg('');
    setTimeout(function () {
      e.classList.remove('up');
      rekey(m.from, m.to, k);
      relayout(m.board);
      busy = false;
      finish();
    }, 700);
  }
  function win() {
    var host = $('board');
    host.classList.add('won');
    msg('成了！' + C.arabic(view.board), 'ok');
    busy = true;
    setTimeout(function () { busy = false; finish(); }, 900);
  }
  function finish() {
    var rec = game.rec;
    markRow(-1);
    rec.done = true;
    rec.won = !rec.revealed && rec.tries.some(function (t) { return t.ok; });
    if (game.mode === 'day') {
      if (rec.onDay === undefined) rec.onDay = game.n === today;
      store.keyOpen = false;
    } else {
      if (rec.won) store.practice.solved = (store.practice.solved || 0) + 1;
    }
    save();
    $('board').classList.add(rec.won ? 'won' : 'shown');
    drawDone();
  }

  /* ---------- after the game ---------- */
  function moveText(b, m) {
    function at(x) { return ROWS[x.r] + (x.c < 0 ? '的符号' : C.PLACE[C.place(b, x.c)] + '位'); }
    function role(x, board) {
      var dir = C.rodDir(board, x.c, x.p) === 'v' ? '竖' : '横';
      if (x.c < 0) return '一根' + dir + '筹';
      return x.p === 'b' ? '当五的' + dir + '筹' : '一根' + dir + '筹';
    }
    var same = m.from.r === m.to.r && m.from.c === m.to.c;
    var r0 = role(m.from, b), r1 = role(m.to, m.board);
    if (same) return '挪的是' + at(m.from) + '的' + r0 + '：就地转个向，改成了' + r1 + '。';
    return '挪的是' + at(m.from) + '的' + r0 + '，放到了' + at(m.to) + (r1 === r0 ? '' : '，成了' + r1) + '。';
  }
  function drawDone() {
    var rec = game.rec, isDay = game.mode === 'day';
    $('done').hidden = false;
    $('tools').hidden = true;
    var wrong = rec.tries.filter(function (t) { return !t.ok; }).length;
    var head = rec.revealed ? (game.n === today ? '看了答案。明天还有一道。' : '看了答案。') : wrong === 0 ? (rec.hints ? '一次摆对（用了提示）。' : '一次就摆对了。') : '第 ' + (wrong + 1) + ' 次摆对了。';
    if (!isDay) head = rec.revealed ? '答案在这里。' : '解开了。';
    $('result').textContent = head;
    $('eq-before').textContent = C.arabic(game.start);
    $('eq-after').textContent = C.arabic(game.sol.board);
    $('movetext').textContent = moveText(game.start, game.sol);
    var note = $('note');
    note.innerHTML = '';
    if (isDay && notes && notes.length) {
      var x = notes[(game.n - 1) % notes.length];
      note.appendChild(el('p', 'nk', '算筹小识'));
      note.appendChild(el('h2', null, x.title));
      note.appendChild(el('p', null, x.text));
      if (x.orig) note.appendChild(el('blockquote', null, x.orig));
      var cite = el('p', 'cite');
      var a = el('a', null, x.cite);
      a.href = x.url; a.rel = 'noopener';
      cite.appendChild(document.createTextNode('出自 '));
      cite.appendChild(a);
      note.appendChild(cite);
      note.hidden = false;
    } else note.hidden = true;
    $('sharebox').hidden = !isDay;
    if (isDay) $('sharetext').textContent = C.shareText(game.n, rec);
    var nav = $('daynav');
    nav.innerHTML = '';
    if (isDay) {
      if (game.n > 1) { var y = el('a', null, '前一天'); y.href = '?d=' + (game.n - 1); nav.appendChild(y); }
      var ar = el('a', null, '往期'); ar.href = '#archive'; nav.appendChild(ar);
      if (game.n < today) { var t = el('a', null, '今天'); t.href = './'; nav.appendChild(t); }
    }
    var pr = el('a', null, isDay ? '再来一道（练习）' : '再来一道'); pr.href = '#practice'; pr.className = 'go';
    if (!isDay) pr.addEventListener('click', function (e) { e.preventDefault(); startPractice(); });
    nav.appendChild(pr);
    drawStats($('statsbox'));
    $('statsbox').hidden = !isDay;
    $('key').hidden = true;
    if (!game.quiet) {
      setTimeout(function () {
        var top = $('done').getBoundingClientRect().top + window.pageYOffset - window.innerHeight * 0.42;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }, 700);
    }
  }
  function drawStats(box) {
    var st = C.stats(store.days, today);
    box.innerHTML = '';
    var nums = el('div', 'nums');
    [['玩过', st.played], ['摆对', st.played ? Math.round(st.won / st.played * 100) + '%' : '–'], ['连续', st.streak], ['最长', st.best]].forEach(function (x) {
      var d = el('div', 'num'); d.appendChild(el('b', null, String(x[1]))); d.appendChild(el('span', null, x[0])); nums.appendChild(d);
    });
    box.appendChild(nums);
    var dist = el('ol', 'dist'), mx = Math.max.apply(null, st.dist.concat([1]));
    ['1', '2', '3', '4', '5+'].forEach(function (k, i) {
      var li = el('li'); li.appendChild(el('span', 'k', k));
      var bar = el('span', 'bar', String(st.dist[i])); bar.style.width = (8 + 82 * st.dist[i] / mx) + '%';
      li.appendChild(bar); dist.appendChild(li);
    });
    box.appendChild(el('p', 'muted small', '第几次摆对'));
    box.appendChild(dist);
  }
  function share() {
    var text = $('sharetext').textContent;
    var done = function (t) { var b = $('share'); b.textContent = t; setTimeout(function () { b.textContent = '分享成绩'; }, 1600); };
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { done('已复制'); }, function () { done('复制不了，请手动选中'); });
    } else done('请手动复制');
  }

  /* ---------- the key: how to read rods ---------- */
  function digitSVG(v, f) {
    var W = G.W, H = G.H, rods = C.digitRods(v, f, W / 2, H / 2);
    var s = '<svg viewBox="8 8 ' + (W - 16) + ' ' + (H - 16) + '" aria-hidden="true">';
    rods.forEach(function (q) {
      var rw = q.a === 'h' ? G.L : G.T, rh = q.a === 'h' ? G.T : G.L;
      s += '<rect x="' + (q.x - rw / 2) + '" y="' + (q.y - rh / 2) + '" width="' + rw + '" height="' + rh + '" rx="' + G.T / 2 + '"/>';
    });
    return s + '</svg>';
  }
  // a number laid in rods, one cell per digit (help page examples)
  function numSVG(ds) {
    var W = G.W, H = G.H, cols = ds.length;
    var s = '<svg viewBox="0 0 ' + (W * cols) + ' ' + H + '" aria-hidden="true">';
    ds.forEach(function (v, c) {
      var f = (cols - 1 - c) % 2 === 0 ? 'v' : 'h';
      s += '<rect class="kc" x="' + (c * W + 3) + '" y="3" width="' + (W - 6) + '" height="' + (H - 6) + '" rx="8"/>';
      C.digitRods(v, f, c * W + W / 2, H / 2).forEach(function (q) {
        var rw = q.a === 'h' ? G.L : G.T, rh = q.a === 'h' ? G.T : G.L;
        s += '<rect x="' + (q.x - rw / 2) + '" y="' + (q.y - rh / 2) + '" width="' + rw + '" height="' + rh + '" rx="' + G.T / 2 + '"/>';
      });
    });
    return s + '</svg>';
  }
  function helpKey() {
    var box = $('helpkey');
    if (box.childNodes.length) return;
    [[[3, 4], '34'], [[0, 7], '7'], [[6, 0], '60'], [[1, 9], '19']].forEach(function (x) {
      var f = el('span', 'hk');
      f.innerHTML = numSVG(x[0]);
      f.appendChild(el('b', null, x[1]));
      box.appendChild(f);
    });
  }
  function drawKey() {
    var box = $('keybody');
    if (box.childNodes.length) return;
    [['v', '竖着摆：个位、百位'], ['h', '横着摆：十位、千位']].forEach(function (x) {
      var row = el('div', 'krow');
      row.appendChild(el('p', 'kcap', x[1]));
      var ol = el('ol', 'kd');
      for (var v = 1; v <= 9; v++) {
        var li = el('li');
        li.innerHTML = digitSVG(v, x[0]);
        li.appendChild(el('span', null, String(v)));
        ol.appendChild(li);
      }
      row.appendChild(ol);
      box.appendChild(row);
    });
    box.appendChild(el('p', 'kfoot', '六到九：上面那根当五。空着的格子是零。符号也是算筹：加号一竖一横，减号一横，等号两横。'));
  }

  /* ---------- days and modes ---------- */
  function params() {
    var q = new URLSearchParams(location.search);
    return { d: parseInt(q.get('d'), 10), hash: location.hash.replace('#', '') };
  }
  function boot() {
    Promise.all([
      fetch('days.json').then(function (r) { return r.json(); }),
      fetch('notes.json').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (x) {
      cfg = x[0]; notes = x[1] && x[1].notes;
      today = C.dayNumber(new Date(), cfg.start, cfg.tz);
      route();
    }).catch(function () { fail('加载失败了。检查一下网络，再刷新试试。'); });
    window.addEventListener('hashchange', route);
    $('board').addEventListener('click', onTap);
    $('board').addEventListener('keydown', onKey);
    $('hint').addEventListener('click', hint);
    $('share').addEventListener('click', share);
    $('read').addEventListener('change', function () { store.read = this.checked; save(); if (view) readout(); });
    $('nav-help').addEventListener('click', function (e) { e.preventDefault(); openHelp(); });
    $('nav-stats').addEventListener('click', function (e) { e.preventDefault(); openStats(); });
    $('help-close').addEventListener('click', function () { $('help').close(); });
    $('stats-close').addEventListener('click', function () { $('stats').close(); });
    $('key').addEventListener('toggle', function () { store.keyOpen = $('key').open; save(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-lv]'), function (b) {
      b.addEventListener('click', function () { store.practice.lv = +b.dataset.lv; save(); startPractice(); });
    });
    $('newp').addEventListener('click', startPractice);
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(resize, 150); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  function fail(text) { var f = $('fail'); f.textContent = text; f.hidden = false; }
  function route() {
    var p = params();
    if (p.hash === 'archive') { drawArchive(); return; }
    if (p.hash === 'practice') { startPractice(); return; }
    if (today < 1) { fail('第一道题 ' + md(cfg.start) + ' 零点（北京时间）开始。'); return; }
    var n = p.d >= 1 && p.d <= Math.min(today, cfg.count) ? p.d : Math.min(today, cfg.count);
    if (today > cfg.count && !(p.d >= 1)) { fail('这一轮的题做完了。新题很快就来，先看看往期吧。'); drawArchive(); return; }
    startDay(n);
  }
  function startDay(n) {
    var d = cfg.days[n - 1];
    var start = C.parse(d.s);
    var sol = C.solutions(start)[0];
    var rec = store.days[n] || (store.days[n] = { tries: [], hints: 0, revealed: false, won: false, done: false });
    game = { mode: 'day', n: n, start: start, sol: sol, rec: rec };
    $('dayno').textContent = '#' + n;
    $('daydate').textContent = md(C.dateOfDay(n, cfg.start)) + (n === today ? '' : ' · 往期');
    $('level').textContent = C.LEVELS[d.lv];
    $('level').className = 'lv lv' + d.lv;
    $('modebar').hidden = true;
    $('task').textContent = '这道算式差一筹：挪动一根算筹，让它成立。';
    begin();
    if (!store.seenHelp) { store.seenHelp = true; save(); openHelp(); }
  }
  function startPractice() {
    if (location.hash !== '#practice') { history.replaceState(null, '', location.pathname + '#practice'); }
    var lv = store.practice.lv || 0;
    var rand = C.rng((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
    var p = null;
    for (var i = 0; i < 60 && !p; i++) {
      var r = rand();
      var cols = lv === 0 ? (r < 0.25 ? 1 : 2) : lv === 1 ? 2 : (r < 0.3 ? 3 : 2);
      p = C.makePuzzle(rand, cols, function (f) { return f.level === lv && f.branching <= (cols === 3 ? 130 : 80); });
    }
    if (!p) { fail('出题失败了，再点一次“换一道”。'); return; }
    var start = C.parse(p.s);
    game = { mode: 'practice', n: 0, start: start, sol: C.solutions(start)[0], rec: { tries: [], hints: 0, revealed: false, won: false, done: false } };
    $('dayno').textContent = '练习';
    $('daydate').textContent = '已解开 ' + (store.practice.solved || 0) + ' 道';
    $('level').textContent = C.LEVELS[lv];
    $('level').className = 'lv lv' + lv;
    $('modebar').hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll('[data-lv]'), function (b) { b.classList.toggle('on', +b.dataset.lv === lv); });
    $('task').textContent = '练习题不计成绩。挪动一根算筹，让它成立。';
    begin();
  }
  function begin() {
    show('play');
    $('done').hidden = true;
    $('fail').hidden = true;
    $('tools').hidden = false;
    $('hint').textContent = '提示';
    $('hint').classList.remove('nudge');
    $('read').checked = !!store.read;
    $('key').hidden = false;
    $('key').open = !!store.keyOpen;
    drawKey();
    msg('');
    var rec = game.rec;
    var finished = rec.done || rec.won || rec.revealed;
    build(finished ? game.sol.board : game.start);
    drawTries();
    if (finished) { $('board').classList.add(rec.won ? 'won' : 'shown'); game.quiet = true; drawDone(); }
    else if (rec.hints) drawHint();
    window.scrollTo(0, 0);
  }
  function drawArchive() {
    show('archive');
    var ol = $('archivelist');
    ol.innerHTML = '';
    var last = Math.min(today, cfg.count);
    for (var n = last; n >= 1; n--) {
      var d = cfg.days[n - 1], r = store.days[n];
      var li = el('li'), a = el('a');
      a.href = '?d=' + n;
      a.appendChild(el('span', 'an', '#' + n));
      a.appendChild(el('span', 'ad', md(C.dateOfDay(n, cfg.start))));
      a.appendChild(el('span', 'lv lv' + d.lv, C.LEVELS[d.lv]));
      var res = !r || !r.tries ? '' : r.revealed ? '看了答案' : r.won ? (r.tries.length === 1 ? '一次摆对' : '第 ' + r.tries.length + ' 次') : r.tries.length ? '没摆完' : '';
      a.appendChild(el('span', 'ar', res));
      li.appendChild(a);
      ol.appendChild(li);
    }
    if (!last) ol.appendChild(el('li', 'muted', '还没有往期。'));
    window.scrollTo(0, 0);
  }
  function openHelp() {
    helpKey();
    var h = $('help');
    if (h.showModal) h.showModal(); else h.setAttribute('open', '');
  }
  function openStats() {
    drawStats($('statsbody'));
    var s = $('stats');
    if (s.showModal) s.showModal(); else s.setAttribute('open', '');
  }

  boot();
}());
