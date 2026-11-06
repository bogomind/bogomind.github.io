/* 字小时候: the rules, without the page (node tests load this file directly: _tools/test_core.mjs). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZiCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var START = '2026-11-06';          // day #1, in Asia/Shanghai (build.py has the same date)
  var TZ = 'Asia/Shanghai';
  var TRIES = 6;
  var TITLE = '字小时候';
  var URL_TEXT = 'bogomind.com/zi/';
  var HAN = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|^[\ud840-\ud87f][\udc00-\udfff]/;

  // 'YYYY-MM-DD' of an instant, on the wall clock of tz
  function ymd(date, tz) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }

  function toUTC(s) {
    var a = s.split('-');
    return Date.UTC(+a[0], +a[1] - 1, +a[2]);
  }

  function daysBetween(a, b) {
    return Math.round((toUTC(b) - toUTC(a)) / 86400000);
  }

  // day number on a given instant: #1 on START (Shanghai date), +1 at each Shanghai midnight
  function dayNumber(date, start, tz) {
    return daysBetween(start || START, ymd(date || new Date(), tz)) + 1;
  }

  function dateOfDay(n, start) {
    var t = toUTC(start || START) + (n - 1) * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }

  // split a string into characters (surrogate pairs kept whole)
  function chars(s) {
    return Array.from ? Array.from(s) : s.split('');
  }

  function isHan(ch) {
    return HAN.test(ch) && chars(ch).length === 1;
  }

  // what the player typed -> {ok, ch} or {ok:false, why: 'empty' | 'not-han' | 'too-many'}
  function parseGuess(raw) {
    var s = String(raw == null ? '' : raw).normalize('NFC').replace(/[\s\u3000，。、！？,.!?'"“”‘’「」]/g, '');
    if (!s) return { ok: false, why: 'empty' };
    var cs = chars(s);
    var han = cs.filter(isHan);
    if (!han.length) return { ok: false, why: 'not-han' };
    if (han.length > 1 || cs.length > 1) return { ok: false, why: 'too-many' };
    return { ok: true, ch: han[0] };
  }

  // 'right' | 'near' | 'wrong' for one character against a day
  function judge(day, ch) {
    if (day.accept.indexOf(ch) >= 0) return 'right';
    if (day.near && Object.prototype.hasOwnProperty.call(day.near, ch)) return 'near';
    return 'wrong';
  }

  // the state of one game from its guesses
  function play(day, guesses) {
    var marks = guesses.map(function (g) { return judge(day, g); });
    var won = marks.indexOf('right') >= 0;
    var used = won ? marks.indexOf('right') + 1 : guesses.length;
    var lost = !won && used >= TRIES;
    var shown = Math.min(won || lost ? day.forms.length + day.hints.length : used + 1, day.forms.length + day.hints.length);
    return { marks: marks.slice(0, used), won: won, lost: lost, done: won || lost, used: used, clues: shown };
  }

  var SQUARE = { wrong: '\u2b1b', near: '\ud83d\udfe8', right: '\ud83d\udfe9' };

  function shareText(n, marks, won) {
    var sq = marks.map(function (m) { return SQUARE[m]; }).join('');
    return TITLE + ' #' + n + ' ' + sq + ' ' + (won ? marks.length : 'X') + '/' + TRIES + '\n' + URL_TEXT;
  }

  // stats from the saved games: only games finished on their own day count (the archive is for fun)
  function stats(games, today) {
    var played = 0, won = 0, dist = [0, 0, 0, 0, 0, 0], streak = 0, best = 0, run = 0;
    var days = Object.keys(games).map(Number).sort(function (a, b) { return a - b; });
    var prev = null;
    days.forEach(function (n) {
      var g = games[n];
      if (!g || !g.daily || !g.done) return;
      played++;
      if (g.won) {
        won++;
        dist[Math.min(g.used, TRIES) - 1]++;
        run = (prev === n - 1) ? run + 1 : 1;
        prev = n;
      } else {
        run = 0;
        prev = null;
      }
      if (run > best) best = run;
    });
    // the current streak ends today, or yesterday when today is not finished yet
    var t = games[today];
    var end = (t && t.daily && t.done) ? today : today - 1;
    for (var n = end; n >= 1; n--) {
      var g = games[n];
      if (g && g.daily && g.done && g.won) streak++;
      else break;
    }
    return { played: played, won: won, rate: played ? Math.round(100 * won / played) : 0, streak: streak, best: best, dist: dist };
  }

  return {
    START: START, TZ: TZ, TRIES: TRIES, TITLE: TITLE,
    ymd: ymd, daysBetween: daysBetween, dayNumber: dayNumber, dateOfDay: dateOfDay,
    parseGuess: parseGuess, judge: judge, play: play, shareText: shareText, stats: stats, isHan: isHan
  };
}));
