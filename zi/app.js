/* 字小时候: the page. Rules live in core.js. No trackers, no accounts: progress stays in this browser (localStorage). */
(function () {
  'use strict';
  var Z = window.ZiCore;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'zi:v1';
  var STAGE_NOTE = { '甲骨文': '刻在龟甲兽骨上的字', '金文': '铸在青铜器上的字', '小篆': '秦朝统一的写法', '秦简': '写在竹简上的字，已经是早期的隶书' };
  var store = load();
  var cfg = null, today = 0, day = null, n = 0, svgCache = {}, composing = false, lastCompEnd = 0, viewIndex = -1;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { games: {}, seenHelp: false }; } catch (e) { return { games: {}, seenHelp: false }; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode: play on without saving */ }
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function md(dateStr) {
    var a = dateStr.split('-');
    return (+a[1]) + '月' + (+a[2]) + '日';
  }
  function glyph(src) {
    if (svgCache[src]) return Promise.resolve(svgCache[src]);
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error(src);
      return r.text();
    }).then(function (t) { svgCache[src] = t; return t; });
  }
  function putGlyph(box, src, label) {
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', label);
    return glyph(src).then(function (t) { box.innerHTML = t; }).catch(function () { box.textContent = '？'; });
  }
  function game() {
    var g = store.games[n];
    if (!g) g = store.games[n] = { guesses: [] };
    return g;
  }
  function params() {
    var q = new URLSearchParams(location.search);
    return { d: parseInt(q.get('d'), 10), view: location.hash.replace('#', '') };
  }

  // ---- boot -------------------------------------------------------------------------------------------------------
  function boot() {
    fetch('days.json').then(function (r) { return r.json(); }).then(function (c) {
      cfg = c;
      today = Z.dayNumber(new Date(), c.start, c.tz);
      route();
    }).catch(function () { fail('加载失败了。检查一下网络，再刷新试试。'); });
    window.addEventListener('hashchange', route);
    $('nav-help').addEventListener('click', function (e) { e.preventDefault(); openHelp(); });
    $('nav-stats').addEventListener('click', function (e) { e.preventDefault(); openStats(); });
    $('help-close').addEventListener('click', function () { $('help').close(); });
    $('stats-close').addEventListener('click', function () { $('stats').close(); });
    var inp = $('g');
    inp.addEventListener('compositionstart', function () { composing = true; });
    inp.addEventListener('compositionend', function () { composing = false; lastCompEnd = Date.now(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229 || composing || Date.now() - lastCompEnd < 80)) e.preventDefault();
    });
    $('guess').addEventListener('submit', function (e) {
      e.preventDefault();
      if (composing) return;
      submit(inp.value);
    });
    $('share').addEventListener('click', share);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  function fail(msg) {
    $('play').hidden = true; $('done').hidden = true; $('archive').hidden = true;
    var e = $('fail'); e.hidden = false; e.textContent = msg;
  }

  function route() {
    var p = params();
    var last = Math.min(today, cfg.count);
    if (p.view === 'archive') return showArchive(last);
    $('archive').hidden = true;
    var want = (p.d >= 1 && p.d <= last) ? p.d : today;
    if (want > cfg.count || want < 1) {
      $('play').hidden = true; $('done').hidden = true;
      var e = $('fail'); e.hidden = false;
      e.innerHTML = '';
      e.appendChild(el('p', null, today < 1 ? '还没开始。' : '这一轮的字已经放完了，往期的都还在。'));
      var a = el('a', null, '去看往期'); a.href = '#archive'; e.appendChild(a);
      return;
    }
    $('fail').hidden = true;
    openDay(want);
  }

  function openDay(k) {
    n = k;
    fetch('d/' + String(k).padStart(3, '0') + '.json').then(function (r) {
      if (!r.ok) throw new Error('day');
      return r.json();
    }).then(function (d) {
      day = d;
      viewIndex = -1;
      render();
      d.forms.forEach(function (f) { glyph(f.src).catch(function () {}); });   // the whole day, so it plays offline
      if (!store.seenHelp && k === today) { store.seenHelp = true; save(); openHelp(); }
    }).catch(function () { fail('这一天的字没加载出来。检查一下网络，再刷新试试。'); });
  }

  // ---- play -------------------------------------------------------------------------------------------------------
  function clues() {
    var out = day.forms.map(function (f, i) { return { kind: 'form', form: f, i: i }; });
    day.hints.forEach(function (h, i) { out.push({ kind: 'hint', text: h, i: i }); });
    return out;
  }

  function render() {
    var g = game();
    var st = Z.play(day, g.guesses);
    var past = n < today;
    $('dayno').textContent = '#' + n;
    $('daydate').textContent = md(day.date) + (past ? ' · 往期' : '');
    document.title = '字小时候 #' + n;
    renderSlots(st);
    renderTries(st);
    if (st.done) return finish(st, false);
    $('done').hidden = true;
    $('play').hidden = false;
    $('guess').hidden = false;
    var all = clues();
    var latestForm = Math.min(st.clues, day.forms.length) - 1;
    var showForm = viewIndex >= 0 ? viewIndex : latestForm;
    showStage(day.forms[showForm], showForm);
    var hints = $('hints');
    hints.innerHTML = '';
    all.slice(0, st.clues).filter(function (c) { return c.kind === 'hint'; }).forEach(function (c) {
      var li = el('li', null);
      li.appendChild(el('span', 'k', '提示' + '一二三'[c.i]));
      li.appendChild(el('span', null, c.text));
      hints.appendChild(li);
    });
    $('left').textContent = '还有 ' + (Z.TRIES - st.used) + ' 次机会';
  }

  function showStage(f, i) {
    var box = $('stage');
    box.classList.remove('in');
    putGlyph(box, f.src, '第' + (i + 1) + '个线索：' + f.stage + '（' + f.era + '）').then(function () {
      void box.offsetWidth;
      box.classList.add('in');
    });
    $('stagelabel').textContent = f.stage + ' · ' + f.era;
    $('stagenote').textContent = STAGE_NOTE[f.stage] || '';
  }

  function renderSlots(st) {
    var ol = $('slots');
    ol.innerHTML = '';
    clues().forEach(function (c, i) {
      var li = el('li', 'slot');
      if (i < st.clues) {
        if (c.kind === 'form') {
          var b = el('button', 'thumb');
          b.type = 'button';
          b.title = c.form.stage;
          putGlyph(b, c.form.src, c.form.stage);
          b.addEventListener('click', function () {
            if (Z.play(day, game().guesses).done) return;
            viewIndex = c.i; showStage(c.form, c.i); markSlot(i);
          });
          li.appendChild(b);
          li.appendChild(el('span', 'cap', c.form.stage));
        } else {
          li.appendChild(el('span', 'thumb hintmark', '提示'));
          li.appendChild(el('span', 'cap', '提示' + '一二三'[c.i]));
        }
        li.classList.add('open');
      } else {
        li.appendChild(el('span', 'thumb shut', ''));
        li.appendChild(el('span', 'cap', c.kind === 'form' ? '？' : '提示'));
      }
      ol.appendChild(li);
    });
    var cur = viewIndex >= 0 ? viewIndex : Math.min(st.clues, day.forms.length) - 1;
    markSlot(cur);
  }

  function markSlot(i) {
    Array.prototype.forEach.call($('slots').children, function (li, j) { li.classList.toggle('cur', j === i); });
  }

  function renderTries(st) {
    var ol = $('tries');
    ol.innerHTML = '';
    var g = game().guesses;
    for (var i = 0; i < Z.TRIES; i++) {
      var li = el('li', 'try');
      if (i < st.used) {
        li.textContent = g[i];
        li.classList.add(st.marks[i]);
        li.setAttribute('aria-label', g[i] + '：' + { wrong: '不对', near: '接近', right: '对了' }[st.marks[i]]);
      }
      ol.appendChild(li);
    }
  }

  function say(text, cls) {
    var m = $('msg');
    m.textContent = text;
    m.className = 'msg' + (cls ? ' ' + cls : '');
  }

  function submit(raw) {
    var g = game();
    var st0 = Z.play(day, g.guesses);
    if (st0.done) return;
    var p = Z.parseGuess(raw);
    if (!p.ok) return say({ empty: '先写一个字。', 'not-han': '要写汉字哦。', 'too-many': '只要一个字。' }[p.why], 'warn');
    if (g.guesses.indexOf(p.ch) >= 0) return say('“' + p.ch + '”已经猜过了。', 'warn');
    g.guesses.push(p.ch);
    var st = Z.play(day, g.guesses);
    if (st.done) { g.done = true; g.won = st.won; g.used = st.used; g.daily = n === today; }
    save();
    $('g').value = '';
    viewIndex = -1;
    var mark = st.marks[st.marks.length - 1];
    if (mark === 'right') { say(''); }
    else if (st.lost) { say(''); }
    else if (mark === 'near') { say(day.near[p.ch] + '它又长大了一点。', 'near'); }
    else { say('不是“' + p.ch + '”。它长大了一点。', 'wrong'); }
    if (!st.done) $('g').blur();
    render();
    if (st.done) finish(st, true);
  }

  // ---- finished ---------------------------------------------------------------------------------------------------
  function finish(st, fresh) {
    $('guess').hidden = true;
    $('play').hidden = true;
    var d = $('done');
    d.hidden = false;
    $('result').textContent = st.won ? (st.used === 1 ? '一眼就认出来了！' : '猜中了！第 ' + st.used + ' 次。') : '这次没猜中。它是：';
    var alb = $('album');
    alb.innerHTML = '';
    day.forms.forEach(function (f) {
      var li = el('li', null);
      var b = el('div', 'pic');
      putGlyph(b, f.src, f.stage + '（' + f.era + '）');
      li.appendChild(b);
      li.appendChild(el('span', 'cap', f.stage));
      li.appendChild(el('span', 'era', f.era));
      alb.appendChild(li);
    });
    var now = el('li', 'now');
    var nb = el('div', 'pic kai', day.simp);
    now.appendChild(nb);
    now.appendChild(el('span', 'cap', '今天'));
    now.appendChild(el('span', 'era', day.trad !== day.simp ? '繁体 ' + day.trad : '　'));
    alb.appendChild(now);
    $('answer').textContent = day.simp + (day.trad !== day.simp ? '（' + day.trad + '）' : '');
    $('pinyin').textContent = day.pinyin;
    var story = $('story');
    story.innerHTML = '';
    day.story.forEach(function (p) {
      var para = el('p', null, p.text);
      p.refs.forEach(function (r) {
        var a = el('a', 'ref', String(r));
        a.href = '#src-' + r;
        a.setAttribute('aria-label', '出处 ' + r);
        para.appendChild(a);
      });
      story.appendChild(para);
    });
    var src = $('sources');
    src.innerHTML = '';
    day.sources.forEach(function (s, i) {
      var li = el('li', null);
      li.id = 'src-' + (i + 1);
      var a = el('a', null, s.title);
      a.href = s.url;
      a.rel = 'noopener';
      li.appendChild(a);
      li.appendChild(document.createTextNode('，' + s.by + (s.note ? '（' + s.note + '）' : '')));
      src.appendChild(li);
    });
    $('sharetext').textContent = Z.shareText(n, st.marks, st.won);
    var nav = $('daynav');
    nav.innerHTML = '';
    if (n > 1) {
      var y = el('a', null, (n === today ? '昨天的字' : '前一天') + ' →');
      y.href = '?d=' + (n - 1);
      nav.appendChild(y);
    }
    if (n < Math.min(today, cfg.count)) {
      var t = el('a', null, n + 1 === today ? '回到今天' : '后一天');
      t.href = n + 1 === today ? './' : '?d=' + (n + 1);
      nav.appendChild(t);
    }
    var ar = el('a', null, '往期');
    ar.href = '#archive';
    nav.appendChild(ar);
    renderStatsInto($('statsbox'));
    if (fresh) d.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function share() {
    var t = $('sharetext').textContent;
    var done = function (m) { var b = $('share'); b.textContent = m; setTimeout(function () { b.textContent = '分享成绩'; }, 1800); };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      navigator.share({ text: t }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(t).then(function () { done('已复制'); }, function () { done('复制失败'); });
    } else {
      done('请手动复制');
    }
  }

  function renderStatsInto(box) {
    var s = Z.stats(store.games, today);
    box.innerHTML = '';
    var row = el('div', 'nums');
    [['玩过', s.played], ['猜中率', s.rate + '%'], ['连续', s.streak], ['最长连续', s.best]].forEach(function (x) {
      var c = el('div', 'num');
      c.appendChild(el('b', null, String(x[1])));
      c.appendChild(el('span', null, x[0]));
      row.appendChild(c);
    });
    box.appendChild(row);
    var max = Math.max.apply(null, s.dist.concat([1]));
    var ol = el('ol', 'dist');
    s.dist.forEach(function (v, i) {
      var li = el('li', null);
      li.appendChild(el('span', 'k', String(i + 1)));
      var bar = el('span', 'bar', String(v));
      bar.style.width = Math.max(8, Math.round(100 * v / max)) + '%';
      li.appendChild(bar);
      ol.appendChild(li);
    });
    box.appendChild(ol);
    box.appendChild(el('p', 'muted small', '只算当天玩的；往期的不算进来。记录只存在这个浏览器里。'));
  }

  function openStats() {
    if (!cfg) return;
    renderStatsInto($('statsbody'));
    $('stats').showModal();
  }

  function openHelp() { $('help').showModal(); }

  // ---- archive ----------------------------------------------------------------------------------------------------
  function showArchive(last) {
    $('play').hidden = true; $('done').hidden = true; $('fail').hidden = true;
    var a = $('archive');
    a.hidden = false;
    document.title = '往期 · 字小时候';
    var ol = $('archivelist');
    ol.innerHTML = '';
    for (var k = last; k >= 1; k--) {
      var g = store.games[k];
      var li = el('li', null);
      var link = el('a', null);
      link.href = k === today ? './' : '?d=' + k;
      link.appendChild(el('span', 'no', '#' + k));
      link.appendChild(el('span', 'date', md(Z.dateOfDay(k, cfg.start)) + (k === today ? ' · 今天' : '')));
      var res = !g || !g.guesses || !g.guesses.length ? '没玩' : (g.done ? (g.won ? '猜中 ' + g.used + '/6' : '没猜中') : '玩到一半');
      link.appendChild(el('span', 'res' + (g && g.won ? ' won' : ''), res));
      li.appendChild(link);
      ol.appendChild(li);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
}());
