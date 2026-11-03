/* Zefira: a private rescue inhaler log.
   All records are kept in this browser's own storage on the phone. Nothing is sent anywhere. */
(function () {
  'use strict';

  // ---------- fixed lists ----------
  const SYMPTOMS = ['Shortness of breath', 'Wheezing', 'Coughing', 'Chest tightness', 'Other'];
  const TRIGGERS = ['Exercise', 'Allergies', 'Smoke (fire)', 'Air pollution', 'Illness', 'Strong smells', 'Cold air', 'Stress', 'Unknown', 'Other'];
  const HELPED = [['fully', 'Fully'], ['partly', 'Partly'], ['none', 'Not at all']];
  const HELPED_LABEL = { fully: 'Fully', partly: 'Partly', none: 'Not at all' };
  const STORE_KEY = 'zefira';
  const DAY = 86400000;
  const LOCK_GRACE_MS = 15000;

  // ---------- storage ----------
  function emptyData() {
    return { entries: [], settings: { passHash: null, passSalt: null, setupDone: false, usualPuffs: null, installDismissed: false, lastBackup: null } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyData();
      const d = JSON.parse(raw);
      const base = emptyData();
      return { entries: Array.isArray(d.entries) ? d.entries.map(cleanEntry).filter(Boolean) : [], settings: Object.assign(base.settings, d.settings || {}) };
    } catch (e) {
      return emptyData();
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      toast('Could not save. Your phone may be out of storage.');
    }
  }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const t = Number(e.t);
    if (!Number.isFinite(t)) return null;
    return {
      id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : newId(),
      t: t,
      type: e.type === 'prevention' ? 'prevention' : 'relief',
      puffs: Math.min(20, Math.max(1, parseInt(e.puffs, 10) || 2)),
      night: !!e.night,
      symptoms: Array.isArray(e.symptoms) ? e.symptoms.filter((s) => SYMPTOMS.includes(s)) : [],
      triggers: Array.isArray(e.triggers) ? e.triggers.filter((s) => TRIGGERS.includes(s)) : [],
      helped: HELPED_LABEL[e.helped] ? e.helped : '',
      note: typeof e.note === 'string' ? e.note.slice(0, 2000) : ''
    };
  }
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let data = load();
  const ui = { locked: !!data.settings.passHash, hiddenAt: null, selectedDay: null, returnTo: '#/', newEntryId: null, reportName: '', range: null, pass: null };

  // ---------- dates ----------
  function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function weekStart(ms) { const d = new Date(startOfDay(ms)); d.setDate(d.getDate() - d.getDay()); return d.getTime(); }
  function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(key) { const p = String(key).split('-').map(Number); if (p.length !== 3 || p.some(isNaN)) return null; return new Date(p[0], p[1] - 1, p[2]).getTime(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDay(ms) { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function fmtDayYear(ms) { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtShort(ms) { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function fmtTime(ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtWhen(ms) {
    const today = startOfDay(Date.now());
    const d = startOfDay(ms);
    const day = d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : fmtDay(ms);
    return day + ', ' + fmtTime(ms);
  }
  function toLocalInput(ms) { const d = new Date(ms); return dayKey(ms) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // ---------- counting ----------
  function inRange(from, toExclusive) { return data.entries.filter((e) => e.t >= from && e.t < toExclusive); }
  function reliefDays(entries) { return new Set(entries.filter((e) => e.type === 'relief').map((e) => dayKey(e.t))).size; }
  function sorted(list) { return list.slice().sort((a, b) => a.t - b.t); }

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  const ICON = {
    mark: '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round"><path d="M8 24 H38 C46 24 50 18 46 13 C42 9 35 12 37 18"/><path d="M8 36 H50"/><path d="M14 48 H34 C41 48 44 54 40 58 C37 61 31 59 32 54"/></g></svg>',
    tile: '<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#2A2466"/><g fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"><path d="M12 25 H38 C45 25 48 19 45 15 C42 11 36 13 37 18"/><path d="M12 35 H50"/><path d="M17 45 H34 C40 45 43 50 40 54 C37 57 32 55 33 51"/></g></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M10 12h5M10 16h5"/></svg>',
    moon: '<svg class="m" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11v14H9l-6-7z"/><path d="M13 9l4 6M17 9l-4 6"/></svg>'
  };

  function nav(current) {
    const item = (href, key, icon, label) => '<a href="' + href + '"' + (current === key ? ' aria-current="page"' : '') + '>' + icon + label + '</a>';
    return '<nav class="nav" aria-label="Main"><div class="nav-inner">' +
      item('#/', 'home', ICON.home, 'Log') +
      item('#/calendar', 'calendar', ICON.cal, 'Calendar') +
      item('#/summary', 'summary', ICON.doc, 'Summary') +
      '</div></nav>';
  }

  // ---------- passcode ----------
  async function hashCode(code, salt) {
    const bytes = new TextEncoder().encode(salt + ':' + code);
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function checkCode(code) {
    if (!data.settings.passHash) return true;
    return (await hashCode(code, data.settings.passSalt)) === data.settings.passHash;
  }
  async function setCode(code) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
    data.settings.passSalt = salt;
    data.settings.passHash = await hashCode(code, salt);
    save();
  }

  function keypad(digits, heading, error, extra) {
    const dots = [0, 1, 2, 3].map((i) => '<i class="' + (i < digits ? 'on' : '') + '"></i>').join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => '<button data-action="digit" data-d="' + k + '">' + k + '</button>').join('');
    return '<section class="screen lock" aria-labelledby="lock-h">' + ICON.tile +
      '<h1 id="lock-h">' + esc(heading) + '</h1>' +
      '<div class="dots" role="img" aria-label="' + digits + ' of 4 digits entered">' + dots + '</div>' +
      '<p class="error" role="alert">' + esc(error || '') + '</p>' +
      '<div class="keypad">' + keys +
      (extra || '<span></span>') +
      '<button data-action="digit" data-d="0">0</button>' +
      '<button class="plain" data-action="backspace" aria-label="Delete digit">' + ICON.del + '</button></div>';
  }

  function renderLock() {
    const p = ui.pass || (ui.pass = { mode: 'unlock', code: '', error: '' });
    return keypad(p.code.length, 'Enter passcode', p.error) +
      '<button class="link-btn" data-action="forgot">Forgot passcode?</button>' +
      '<p class="hint" style="max-width:300px">This lock keeps casual viewers out. It does not replace your phone\'s own lock.</p></section>';
  }

  function renderPasscodeFlow() {
    const p = ui.pass;
    const headings = { verify: 'Enter your current passcode', create: 'Choose a 4-digit passcode', confirm: 'Enter it again to confirm' };
    return keypad(p.code.length, headings[p.step], p.error, '<button class="plain" data-action="cancel-pass">Cancel</button>') + '</section>';
  }

  async function onDigit(d) {
    const p = ui.pass;
    if (!p || p.code.length >= 4) return;
    p.code += d;
    p.error = '';
    render();
    if (p.code.length < 4) return;
    const code = p.code;
    if (p.mode === 'unlock' || p.step === 'verify') {
      if (await checkCode(code)) {
        if (p.mode === 'unlock') { ui.locked = false; ui.pass = null; render(); return; }
        if (p.goal === 'off') {
          data.settings.passHash = null; data.settings.passSalt = null; save();
          ui.pass = null; toast('Passcode turned off'); location.hash = '#/settings'; render(); return;
        }
        p.step = 'create'; p.code = ''; render(); return;
      }
      p.code = ''; p.error = 'That passcode is not right.'; render(); shake(); return;
    }
    if (p.step === 'create') { p.first = code; p.step = 'confirm'; p.code = ''; render(); return; }
    if (p.step === 'confirm') {
      if (code === p.first) {
        await setCode(code);
        data.settings.setupDone = true; save();
        ui.pass = null; toast('Passcode saved');
        location.hash = p.returnTo || '#/settings'; render(); return;
      }
      p.step = 'create'; p.code = ''; p.first = null; p.error = 'The two didn\'t match. Try again.'; render(); shake();
    }
  }
  function shake() { const el = document.querySelector('.dots'); if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } }
  function startPass(goal, returnTo) {
    ui.pass = { mode: 'flow', goal: goal, step: goal === 'set' ? 'create' : 'verify', code: '', error: '', returnTo: returnTo };
    location.hash = '#/passcode';
  }

  // ---------- screens ----------
  function renderWelcome() {
    return '<section class="screen" style="justify-content:center;gap:20px">' +
      '<div style="display:flex;justify-content:center">' + ICON.tile.replace('width="64" height="64"', 'width="88" height="88"') + '</div>' +
      '<h1 style="text-align:center;font-size:28px">Welcome to Zefira</h1>' +
      '<p style="margin:0">Zefira keeps a record of when you use your rescue inhaler, so you can show your doctor a clear summary.</p>' +
      '<p style="margin:0">Your records stay on this phone. There is no account, and nothing is sent to anyone.</p>' +
      '<div class="section"><p class="label" id="dose-l">How many puffs does your doctor prescribe each time you use your rescue inhaler?</p>' + doseButtons('dose-l') + '</div>' +
      '<p style="margin:0">You can protect the app with a 4-digit passcode, which is useful if other people sometimes use your phone.</p>' +
      '<button class="primary" data-action="welcome-pass"' + (data.settings.usualPuffs ? '' : ' disabled') + '>Set a passcode</button>' +
      '<button class="secondary" data-action="welcome-skip"' + (data.settings.usualPuffs ? '' : ' disabled') + '>Not now</button>' +
      (data.settings.usualPuffs ? '' : '<p class="hint">Choose your usual dose to continue.</p>') +
      '<p class="hint">You can change this later in Settings.</p></section>';
  }

  function doseButtons(labelId, fallback) {
    const u = data.settings.usualPuffs || (fallback ? 2 : null);
    return '<div class="segmented" role="group" aria-labelledby="' + labelId + '">' +
      '<button data-action="dose" data-value="1" aria-pressed="' + (u === 1) + '">1 puff</button>' +
      '<button data-action="dose" data-value="2" aria-pressed="' + (u === 2) + '">2 puffs</button></div>';
  }

  function installCard() {
    if (isStandalone() || data.settings.installDismissed) return '';
    const how = isIOS()
      ? 'In Safari, tap the Share button, then choose <b>Add to Home Screen</b>.'
      : 'In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>.';
    const warn = isIOS()
      ? '<p>Do this before you start logging. On iPhone, records made in Safari do not carry over to the home screen app.</p>'
      : '';
    return '<div class="card install"><p><b>Add Zefira to your home screen</b></p><p>' + how + ' It will then open like an app and work without internet.</p>' + warn +
      '<button class="link-btn" style="align-self:flex-start;padding:0" data-action="dismiss-install">Dismiss</button></div>';
  }

  function renderHome() {
    const ws = weekStart(Date.now());
    const week = inRange(ws, addDays(ws, 7));
    const prev = week.filter((e) => e.type === 'prevention').length;
    const recent = sorted(data.entries).reverse().slice(0, 3);
    const recentHtml = recent.length
      ? '<div class="recent">' + recent.map((e) => '<button data-action="open-entry" data-id="' + e.id + '"><span>' + esc(fmtWhen(e.t)) + ' · ' + (e.type === 'relief' ? 'Relief' : 'Prevention') + '</span><span class="muted">' + (e.night ? 'woke me up' : plural(e.puffs, 'puff', 'puffs')) + '</span></button>').join('') + '</div>'
      : '<p class="hint">No uses recorded yet.</p>';
    return '<section class="screen with-nav">' +
      '<div class="topbar"><div class="brand">' + ICON.mark + '<span>zefira</span></div>' +
      '<a class="icon-btn" href="#/settings" aria-label="Settings">' + ICON.settings + '</a></div>' +
      installCard() +
      '<div class="home-main">' +
      '<button class="big-log" data-action="quick-log" data-type="relief">' + ICON.plus + '<strong>I used my<br>rescue inhaler</strong><span>Tap to log now</span></button>' +
      '<button class="pill" data-action="quick-log" data-type="prevention">' + ICON.shield + 'Log a prevention use (before exercise)</button>' +
      '</div>' +
      '<div class="card"><div class="card-head"><span>This week</span><span>' + esc(fmtShort(ws)) + ' – ' + esc(fmtShort(addDays(ws, 6))) + '</span></div>' +
      '<div class="stats"><div class="stat"><b>' + reliefDays(week) + '</b><span>' + (reliefDays(week) === 1 ? 'day' : 'days') + ' with relief use</span></div>' +
      '<div class="stat"><b>' + prev + '</b><span>prevention ' + (prev === 1 ? 'use' : 'uses') + '</span></div></div>' +
      recentHtml + '</div>' +
      '</section>' + nav('home');
  }

  function chipGroup(field, options, selected, labelId) {
    return '<div class="chips" role="group" aria-labelledby="' + labelId + '">' + options.map((o) =>
      '<button class="chip" data-action="toggle" data-field="' + field + '" data-value="' + esc(o) + '" aria-pressed="' + selected.includes(o) + '">' + esc(o) + '</button>').join('') + '</div>';
  }

  function renderEntry(id) {
    const e = data.entries.find((x) => x.id === id);
    if (!e) return '<section class="screen"><p>This entry no longer exists.</p><a href="#/">Back to start</a></section>';
    const isNew = ui.newEntryId === id;
    const relief = e.type === 'relief';
    const reliefParts = relief
      ? '<label class="row-between"><span class="label" style="display:flex;align-items:center;gap:8px"><span style="width:20px;height:20px;color:var(--primary);position:relative">' + ICON.moon.replace('class="m"', 'width="20" height="20"') + '</span>It woke me up at night</span>' +
        '<input class="check" type="checkbox" data-field="night"' + (e.night ? ' checked' : '') + '></label>' +
        '<div class="section"><p class="label" id="sym-l">Symptoms</p>' + chipGroup('symptoms', SYMPTOMS, e.symptoms, 'sym-l') +
        '<p class="hint">Leave blank if you did not notice any.</p></div>' +
        '<div class="section"><p class="label" id="trig-l">Possible trigger</p>' + chipGroup('triggers', TRIGGERS, e.triggers, 'trig-l') +
        '<p class="hint">Leave blank if you are not sure. If you choose Other, add it in the note.</p></div>' +
        '<div class="section"><p class="label" id="help-l">How much did it help?</p><div class="chips even" role="group" aria-labelledby="help-l">' +
        HELPED.map((h) => '<button class="chip" data-action="helped" data-value="' + h[0] + '" aria-pressed="' + (e.helped === h[0]) + '">' + h[1] + '</button>').join('') + '</div></div>'
      : '';
    return '<section class="screen">' +
      '<div class="topbar"><button class="icon-btn plain" data-action="done-entry" aria-label="Back">' + ICON.back + '</button><span class="title-center">Entry details</span><span style="width:44px"></span></div>' +
      '<div class="banner"><div><b>' + (isNew ? 'Logged' : 'Recorded') + '</b><span>' + esc(fmtWhen(e.t)) + '</span></div>' +
      '<label><span>Change date or time if needed</span><input type="datetime-local" data-field="t" value="' + toLocalInput(e.t) + '" max="' + toLocalInput(Date.now() + DAY) + '"></label></div>' +
      '<p class="hint">Everything below is optional. You can fill it in now or later. Changes save automatically.</p>' +
      '<div class="section"><p class="label" id="type-l">Why did you use it?</p><div class="segmented" role="group" aria-labelledby="type-l">' +
      '<button data-action="type" data-value="relief" aria-pressed="' + relief + '">Relief</button>' +
      '<button data-action="type" data-value="prevention" aria-pressed="' + !relief + '">Prevention</button></div>' +
      '<p class="hint">Relief: to help breathing. Prevention: before exercise, as your doctor advised.</p></div>' +
      '<div class="row-between"><p class="label" id="puff-l">Number of puffs</p><div class="stepper" role="group" aria-labelledby="puff-l">' +
      '<button data-action="puffs" data-d="-1" aria-label="Fewer puffs">−</button><output aria-live="polite">' + e.puffs + '</output>' +
      '<button data-action="puffs" data-d="1" aria-label="More puffs">+</button></div></div>' +
      reliefParts +
      '<label class="section"><span class="label">Note</span><textarea data-field="note" rows="3" maxlength="2000" placeholder="Anything you want your doctor to know">' + esc(e.note) + '</textarea></label>' +
      '<button class="primary" data-action="done-entry">Done</button>' +
      '<button class="link-btn danger" data-action="delete-entry">Delete this entry</button>' +
      '</section>';
  }

  function renderCalendar(monthKey) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) { y = +monthKey.slice(0, 4); m = +monthKey.slice(5) - 1; }
    const first = new Date(y, m, 1).getTime();
    const last = new Date(y, m + 1, 0).getTime();
    const title = new Date(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const prevKey = dayKey(new Date(y, m - 1, 1).getTime()).slice(0, 7);
    const nextKey = dayKey(new Date(y, m + 1, 1).getTime()).slice(0, 7);
    const today = startOfDay(Date.now());
    if (!ui.selectedDay || fromKey(ui.selectedDay) < first || fromKey(ui.selectedDay) > last) {
      ui.selectedDay = today >= first && today <= last ? dayKey(today) : null;
    }
    const byDay = {};
    data.entries.forEach((e) => { (byDay[dayKey(e.t)] = byDay[dayKey(e.t)] || []).push(e); });

    let weeks = '';
    for (let ws = weekStart(first); ws <= last; ws = addDays(ws, 7)) {
      let reliefDayCount = 0, cells = '';
      for (let i = 0; i < 7; i++) {
        const day = addDays(ws, i);
        const key = dayKey(day);
        const list = byDay[key] || [];
        const relief = list.filter((e) => e.type === 'relief');
        const prev = list.some((e) => e.type === 'prevention');
        const night = relief.some((e) => e.night);
        if (relief.length) reliefDayCount++;
        const inMonth = day >= first && day <= last;
        const lvl = relief.length >= 3 ? 'l3' : relief.length === 2 ? 'l2' : relief.length === 1 ? 'l1' : '';
        const d = new Date(day);
        if (!inMonth) { cells += '<div class="cell out" aria-hidden="true">' + d.getDate() + '</div>'; continue; }
        const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ': ' +
          (relief.length ? plural(relief.length, 'relief use', 'relief uses') : 'no relief use') + (prev ? ', prevention use' : '') + (night ? ', woke you up' : '');
        cells += '<button class="cell ' + lvl + (day === today ? ' today' : '') + '" data-action="pick-day" data-day="' + key + '" aria-pressed="' + (ui.selectedDay === key) + '" aria-label="' + esc(label) + '">' +
          d.getDate() + (prev ? '<span class="p"></span>' : '') + (night ? ICON.moon : '') + '</button>';
      }
      const hot = reliefDayCount >= 3;
      weeks += '<div class="wk' + (hot ? ' hot' : '') + '"' + (hot ? ' aria-label="Relief use on ' + reliefDayCount + ' days this week" role="group"' : '') + '>' + cells + '</div>';
    }

    let dayPanel = '';
    if (ui.selectedDay) {
      const list = sorted(byDay[ui.selectedDay] || []);
      const dayMs = fromKey(ui.selectedDay);
      dayPanel = '<div class="card"><b>' + esc(fmtDay(dayMs)) + '</b>' +
        (list.length ? list.map((e) => '<button class="entry-row" data-action="open-entry" data-id="' + e.id + '"><span>' + esc(fmtTime(e.t)) + ' · ' + (e.type === 'relief' ? 'Relief' : 'Prevention') + ' · ' + plural(e.puffs, 'puff', 'puffs') + (e.night ? ' · woke me up' : '') +
          (e.triggers.length || e.symptoms.length || e.helped ? '<br><span class="muted">' + esc([e.triggers.join(', '), e.symptoms.join(', ').toLowerCase(), e.helped ? 'helped ' + HELPED_LABEL[e.helped].toLowerCase() : ''].filter(Boolean).join(' · ')) + '</span>' : '') +
          '</span><span class="muted" aria-hidden="true">›</span></button>').join('') : '<p class="hint">Nothing recorded on this day.</p>') +
        (dayMs <= today ? '<button class="secondary" data-action="add-on-day" data-day="' + ui.selectedDay + '">Add a use on this day</button>' : '') + '</div>';
    }

    return '<section class="screen with-nav">' +
      '<div class="month-bar"><a class="icon-btn" href="#/calendar/' + prevKey + '" aria-label="Previous month">' + ICON.back + '</a><h1>' + esc(title) + '</h1>' +
      '<a class="icon-btn" href="#/calendar/' + nextKey + '" aria-label="Next month">' + ICON.next + '</a></div>' +
      '<div class="weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>' +
      '<div class="weeks">' + weeks + '</div>' +
      '<div class="legend-hot"><i></i>Framed week: relief use on 3 or more days</div>' +
      '<div class="legend"><span><i class="sw" style="background:var(--l1)"></i><i class="sw" style="background:var(--l2)"></i><i class="sw" style="background:var(--l3)"></i>1, 2, 3 or more relief uses</span>' +
      '<span><i class="ring"></i>prevention</span><span style="color:var(--primary-deep)"><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg><span class="muted">woke me up</span></span></div>' +
      dayPanel + '</section>' + nav('calendar');
  }

  function defaultRange() {
    const today = startOfDay(Date.now());
    return { preset: '4w', from: dayKey(addDays(today, -27)), to: dayKey(today) };
  }
  function applyPreset(preset) {
    const today = startOfDay(Date.now());
    if (preset === '4w') ui.range = { preset: preset, from: dayKey(addDays(today, -27)), to: dayKey(today) };
    else if (preset === '3m') { const d = new Date(today); d.setMonth(d.getMonth() - 3); ui.range = { preset: preset, from: dayKey(addDays(d.getTime(), 1)), to: dayKey(today) }; }
    else ui.range = Object.assign({}, ui.range, { preset: 'custom' });
  }

  function renderSummaryRange() {
    const r = ui.range || (ui.range = defaultRange());
    const from = fromKey(r.from), to = fromKey(r.to);
    const valid = from !== null && to !== null && from <= to;
    let preview = '<p class="error" role="alert">The start date must be on or before the end date.</p>';
    if (valid) {
      const list = inRange(from, addDays(to, 1));
      const relief = list.filter((e) => e.type === 'relief').length;
      preview = '<div class="card"><b>Included: ' + plural(list.length, 'entry', 'entries') + '</b><span class="muted">' + relief + ' relief, ' + (list.length - relief) + ' prevention</span></div>';
    }
    const pre = (key, label) => '<button class="chip" data-action="preset" data-value="' + key + '" aria-pressed="' + (r.preset === key) + '">' + label + '</button>';
    return '<section class="screen with-nav">' +
      '<h1>Summary for your doctor</h1>' +
      '<p class="hint" style="font-size:15px">Choose the dates to include. The summary opens as a page you can print or save as a PDF.</p>' +
      '<div class="chips">' + pre('4w', 'Last 4 weeks') + pre('3m', 'Last 3 months') + pre('custom', 'Custom dates') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<label class="field">From<input type="date" data-range="from" value="' + r.from + '"></label>' +
      '<label class="field">To<input type="date" data-range="to" value="' + r.to + '"></label></div>' +
      '<label class="field">Name on the summary (optional)<input type="text" data-range="name" maxlength="80" value="' + esc(ui.reportName) + '" placeholder="Leave blank to print without a name" autocomplete="off"></label>' +
      '<p class="hint">The name is used only for this printout and is not saved.</p>' +
      preview +
      '<button class="primary" data-action="open-report"' + (valid ? '' : ' disabled') + '>Open summary to print or save</button>' +
      '</section>' + nav('summary');
  }

  function countList(entries, field, options) {
    const counts = options.map((o) => [o, entries.filter((e) => e[field].includes(o)).length]).filter((c) => c[1] > 0).sort((a, b) => b[1] - a[1]);
    const none = entries.filter((e) => e[field].length === 0).length;
    if (none) counts.push(['Not recorded', none]);
    return counts;
  }
  function tableOf(rows) {
    if (!rows.length) return '<p>None recorded.</p>';
    return '<table>' + rows.map((r) => '<tr><td>' + esc(r[0]) + '</td><td class="n">' + r[1] + '</td></tr>').join('') + '</table>';
  }

  function renderReport(params) {
    const from = fromKey(params.get('from')), to = fromKey(params.get('to'));
    if (from === null || to === null || from > to) { location.hash = '#/summary'; return ''; }
    const end = addDays(to, 1);
    const list = sorted(inRange(from, end));
    const relief = list.filter((e) => e.type === 'relief');
    const prevention = list.length - relief.length;

    let weekRows = '', hotWeeks = 0, partial = false;
    for (let ws = weekStart(from); ws < end; ws = addDays(ws, 7)) {
      const a = Math.max(ws, from), b = Math.min(addDays(ws, 7), end);
      if (a !== ws || b !== addDays(ws, 7)) partial = true;
      const wk = list.filter((e) => e.t >= a && e.t < b);
      const wr = wk.filter((e) => e.type === 'relief');
      const rd = reliefDays(wk);
      const hot = rd >= 3;
      if (hot) hotWeeks++;
      const lastDay = addDays(b, -1);
      const label = fmtShort(a) + (lastDay !== a ? ' – ' + fmtShort(lastDay) : '');
      weekRows += '<tr><td' + (hot ? ' class="flag"' : '') + '>' + esc(label) + '</td><td class="n' + (hot ? ' flag' : '') + '">' + rd + '</td><td class="n">' + wr.length + '</td><td class="n">' + wr.filter((e) => e.night).length + '</td><td class="n">' + (wk.length - wr.length) + '</td><td' + (hot ? ' class="flag"' : '') + '>' + (hot ? 'Relief on 3+ days' : '') + '</td></tr>';
    }

    const helpedRows = HELPED.map((h) => [h[1], relief.filter((e) => e.helped === h[0]).length]).filter((r) => r[1] > 0);
    const noHelp = relief.filter((e) => !e.helped).length;
    if (noHelp) helpedRows.push(['Not recorded', noHelp]);

    const name = ui.reportName.trim();
    const rows = list.map((e) => '<tr><td>' + esc(fmtDay(e.t) + ', ' + fmtTime(e.t)) + (e.night ? ' (night)' : '') + '</td><td>' + (e.type === 'relief' ? 'Relief' : 'Prevention') + '</td><td class="n">' + e.puffs + '</td><td>' + esc(e.triggers.join(', ')) + '</td><td>' + esc(e.symptoms.join(', ')) + '</td><td>' + (e.helped ? HELPED_LABEL[e.helped] : '') + '</td><td>' + esc(e.note) + '</td></tr>').join('');

    return '<div class="report-actions"><button class="secondary" data-action="close-report">' + 'Back' + '</button><button class="primary" data-action="print">Print or save as PDF</button></div>' +
      '<article class="report">' +
      '<div class="meta"><h1>Rescue inhaler record</h1>' +
      (name ? '<span>Patient: ' + esc(name) + '</span>' : '') +
      '<span>Period: ' + esc(fmtDayYear(from)) + ' to ' + esc(fmtDayYear(to)) + '</span>' +
      '<span>Printed ' + esc(fmtDayYear(Date.now())) + ' · Recorded by the patient in Zefira</span></div>' +
      '<h2>Overview</h2><div class="report-wrap"><table><tr><th>Relief uses</th><th>Days with relief use</th><th>Weeks with relief on 3+ days</th><th>Night uses (woke up)</th><th>Did not help</th><th>Prevention uses</th></tr>' +
      '<tr><td class="n">' + relief.length + '</td><td class="n">' + reliefDays(list) + '</td><td class="n">' + hotWeeks + '</td><td class="n">' + relief.filter((e) => e.night).length + '</td><td class="n">' + relief.filter((e) => e.helped === 'none').length + '</td><td class="n">' + prevention + '</td></tr></table></div>' +
      '<h2>Week by week</h2><div class="report-wrap"><table><tr><th>Week</th><th>Days with relief use</th><th>Relief uses</th><th>Night uses</th><th>Prevention uses</th><th>Note</th></tr>' + weekRows + '</table></div>' +
      '<div class="two"><section><h2>Possible triggers (relief uses)</h2>' + tableOf(countList(relief, 'triggers', TRIGGERS)) + '</section>' +
      '<section><h2>Symptoms (relief uses)</h2>' + tableOf(countList(relief, 'symptoms', SYMPTOMS)) + '</section>' +
      '<section><h2>How much it helped</h2>' + tableOf(helpedRows) + '</section></div>' +
      '<h2>All entries</h2>' + (list.length ? '<div class="report-wrap"><table><tr><th>Date and time</th><th>Type</th><th>Puffs</th><th>Trigger</th><th>Symptoms</th><th>Helped</th><th>Note</th></tr>' + rows + '</table></div>' : '<p>No entries in this period.</p>') +
      '<p class="foot">This record was kept by the patient and has not been checked by a clinician. Weeks run Sunday to Saturday' + (partial ? '; the first or last week may be partial because of the dates chosen' : '') + '. Prevention uses are counted separately and are not included in the relief counts.</p>' +
      '</article>';
  }

  function renderSettings() {
    const s = data.settings;
    const pass = s.passHash
      ? '<button class="row" data-action="pass-change">Change passcode<span class="muted">›</span></button><button class="row" data-action="pass-off">Turn off passcode<span class="muted">›</span></button>'
      : '<button class="row" data-action="pass-on">Turn on passcode<span class="muted">›</span></button>';
    return '<section class="screen">' +
      '<div class="topbar" style="justify-content:flex-start"><a class="icon-btn plain" href="#/" aria-label="Back">' + ICON.back + '</a><h1>Settings</h1></div>' +
      '<p class="group-head" id="dose-s">Usual dose for each use</p>' + doseButtons('dose-s', true) +
      '<p class="note">New entries start with this number of puffs. You can still change it on any entry.</p>' +
      '<p class="group-head">Privacy</p><div class="group">' + pass + '</div>' +
      '<p class="group-head">Your records</p><div class="group">' +
      '<button class="row" data-action="backup">Save a backup file<span class="muted">›</span></button>' +
      '<button class="row" data-action="restore">Restore from a backup file<span class="muted">›</span></button></div>' +
      '<input type="file" id="restore-file" accept="application/json,.json" hidden>' +
      '<p class="note">Your records are stored only on this phone. Nobody else, including the makers of Zefira, can see them. If you lose this phone or delete the app, they are gone unless you have saved a backup file. Last backup: ' + (s.lastBackup ? esc(fmtDayYear(s.lastBackup)) : 'never') + '.</p>' +
      '<p class="note">' + plural(data.entries.length, 'record', 'records') + ' on this phone.</p>' +
      '<div class="group"><button class="row danger" data-action="wipe">Delete all records</button></div>' +
      '<a href="#/about" style="text-align:center;margin-top:8px;min-height:44px;display:flex;align-items:center;justify-content:center">About Zefira</a>' +
      '</section>';
  }

  function renderAbout() {
    return '<section class="screen">' +
      '<div class="topbar" style="justify-content:flex-start"><a class="icon-btn plain" href="#/settings" aria-label="Back">' + ICON.back + '</a><h1>About Zefira</h1></div>' +
      '<p style="margin:0">Zefira is a free, simple log of rescue inhaler use. It records what you enter and prints it as a summary. It does not interpret your records or give medical advice.</p>' +
      '<p style="margin:0">Privacy: there is no account, no tracking and no advertising. Your records never leave this phone unless you save a backup file or print a summary yourself.</p>' +
      '<p style="margin:0">Version 1.0</p>' +
      '</section>';
  }

  // ---------- render & routing ----------
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    const q = h.indexOf('?');
    const path = (q >= 0 ? h.slice(0, q) : h).split('/');
    return { name: path[0] || 'home', arg: path[1] || '', params: new URLSearchParams(q >= 0 ? h.slice(q + 1) : '') };
  }

  function render() {
    const app = document.getElementById('app');
    const r = parseRoute();
    document.body.classList.toggle('printing', r.name === 'report');
    let html;
    if (ui.locked) html = renderLock();
    else if (!data.settings.setupDone && r.name !== 'passcode') html = renderWelcome();
    else if (r.name === 'entry') html = renderEntry(r.arg);
    else if (r.name === 'calendar') html = renderCalendar(r.arg);
    else if (r.name === 'summary') html = renderSummaryRange();
    else if (r.name === 'report') html = renderReport(r.params);
    else if (r.name === 'settings') html = renderSettings();
    else if (r.name === 'about') html = renderAbout();
    else if (r.name === 'passcode' && ui.pass && ui.pass.mode === 'flow') html = renderPasscodeFlow();
    else html = renderHome();
    // Keep focus and typing position in text fields while re-rendering.
    const active = document.activeElement;
    const focusKey = active && (active.dataset.field || active.dataset.range);
    const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    app.innerHTML = html;
    if (focusKey) {
      const el = app.querySelector('[data-field="' + focusKey + '"],[data-range="' + focusKey + '"]');
      if (el) { el.focus(); if (caret !== null && el.setSelectionRange && el.type !== 'date' && el.type !== 'datetime-local') try { el.setSelectionRange(caret, caret); } catch (e) {} }
    }
  }

  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    const r = parseRoute();
    if (r.name !== 'passcode' && ui.pass && ui.pass.mode === 'flow') ui.pass = null;
    render();
    if (location.hash !== lastRoute) window.scrollTo(0, 0);
    lastRoute = location.hash;
  });

  // ---------- actions ----------
  function current() { const r = parseRoute(); return r.name === 'entry' ? data.entries.find((e) => e.id === r.arg) : null; }

  function createEntry(type, when) {
    const e = cleanEntry({ id: newId(), t: when, type: type, puffs: data.settings.usualPuffs || 2 });
    data.entries.push(e);
    save();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    return e;
  }

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const e = current();

    switch (a) {
      case 'digit': onDigit(btn.dataset.d); break;
      case 'backspace': if (ui.pass) { ui.pass.code = ui.pass.code.slice(0, -1); render(); } break;
      case 'cancel-pass': { const back = ui.pass && ui.pass.returnTo; ui.pass = null; location.hash = back || '#/settings'; break; }
      case 'forgot':
        if (confirm('The passcode cannot be recovered. The only way to reset it is to erase all records on this phone. Erase everything and start over?') &&
            confirm('This permanently deletes all your records. Continue?')) {
          data = emptyData(); save(); ui.locked = false; ui.pass = null; location.hash = '#/'; render();
        }
        break;
      case 'welcome-pass': startPass('set', '#/'); break;
      case 'dose': data.settings.usualPuffs = Number(btn.dataset.value); save(); render(); break;
      case 'welcome-skip': data.settings.setupDone = true; save(); render(); break;
      case 'dismiss-install': data.settings.installDismissed = true; save(); render(); break;
      case 'quick-log': {
        const n = createEntry(btn.dataset.type, Date.now());
        ui.newEntryId = n.id; ui.returnTo = '#/';
        toast(btn.dataset.type === 'relief' ? 'Relief use logged' : 'Prevention use logged');
        location.hash = '#/entry/' + n.id;
        break;
      }
      case 'open-entry': ui.newEntryId = null; ui.returnTo = location.hash || '#/'; location.hash = '#/entry/' + btn.dataset.id; break;
      case 'add-on-day': {
        const day = fromKey(btn.dataset.day);
        const now = new Date();
        let when = day + (now.getHours() * 60 + now.getMinutes()) * 60000;
        if (when > Date.now()) when = Date.now();
        const n = createEntry('relief', when);
        ui.newEntryId = n.id; ui.returnTo = location.hash;
        location.hash = '#/entry/' + n.id;
        break;
      }
      case 'type': if (e) { e.type = btn.dataset.value; save(); render(); } break;
      case 'puffs': if (e) { e.puffs = Math.min(20, Math.max(1, e.puffs + Number(btn.dataset.d))); save(); render(); } break;
      case 'toggle': if (e) { const f = btn.dataset.field, v = btn.dataset.value; e[f] = e[f].includes(v) ? e[f].filter((x) => x !== v) : e[f].concat(v); save(); render(); } break;
      case 'helped': if (e) { e.helped = e.helped === btn.dataset.value ? '' : btn.dataset.value; save(); render(); } break;
      case 'done-entry': ui.newEntryId = null; location.hash = ui.returnTo || '#/'; toast('Saved'); break;
      case 'delete-entry':
        if (e && confirm('Delete this entry?')) { data.entries = data.entries.filter((x) => x.id !== e.id); save(); location.hash = ui.returnTo || '#/'; toast('Entry deleted'); }
        break;
      case 'pick-day': ui.selectedDay = btn.dataset.day; render(); break;
      case 'preset': applyPreset(btn.dataset.value); render(); break;
      case 'open-report': {
        const r = ui.range || defaultRange();
        location.hash = '#/report?from=' + r.from + '&to=' + r.to;
        break;
      }
      case 'print': window.print(); break;
      case 'close-report': location.hash = '#/summary'; break;
      case 'pass-on': startPass('set', '#/settings'); break;
      case 'pass-change': startPass('change', '#/settings'); break;
      case 'pass-off': startPass('off', '#/settings'); break;
      case 'backup': backup(); break;
      case 'restore': document.getElementById('restore-file').click(); break;
      case 'wipe':
        if (confirm('Delete all ' + plural(data.entries.length, 'record', 'records') + ' on this phone?') && confirm('This cannot be undone. Delete everything?')) {
          data.entries = []; save(); render(); toast('All records deleted');
        }
        break;
    }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.range) {
      const r = ui.range || (ui.range = defaultRange());
      if (el.dataset.range === 'name') { ui.reportName = el.value; return; }
      if (el.value) { r[el.dataset.range] = el.value; r.preset = 'custom'; }
      render();
      return;
    }
    const e = current();
    if (!e || !el.dataset.field) return;
    if (el.dataset.field === 'note') { e.note = el.value.slice(0, 2000); save(); }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'restore-file') { restore(el.files && el.files[0]); el.value = ''; return; }
    const e = current();
    if (!e || !el.dataset.field) return;
    if (el.dataset.field === 'night') { e.night = el.checked; save(); }
    if (el.dataset.field === 't' && el.value) {
      const t = new Date(el.value).getTime();
      if (Number.isFinite(t)) { e.t = t; save(); render(); }
    }
  });

  // ---------- backup ----------
  async function backup() {
    const payload = JSON.stringify({ app: 'zefira', version: 1, exported: new Date().toISOString(), entries: data.entries }, null, 1);
    const name = 'zefira-backup-' + dayKey(Date.now()) + '.json';
    const blob = new Blob([payload], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Zefira backup' });
        markBackedUp();
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markBackedUp();
  }
  function markBackedUp() { data.settings.lastBackup = Date.now(); save(); render(); toast('Backup file saved'); }

  function restore(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { toast('That file is not a Zefira backup.'); return; }
      if (!parsed || parsed.app !== 'zefira' || !Array.isArray(parsed.entries)) { toast('That file is not a Zefira backup.'); return; }
      const incoming = parsed.entries.map(cleanEntry).filter(Boolean);
      if (!confirm('Add ' + plural(incoming.length, 'record', 'records') + ' from this backup? Records already on this phone are kept, and any duplicates are replaced.')) return;
      const byId = new Map(data.entries.map((e) => [e.id, e]));
      incoming.forEach((e) => byId.set(e.id, e));
      data.entries = Array.from(byId.values());
      save(); render(); toast('Backup restored');
    };
    reader.readAsText(file);
  }

  // ---------- lock when the app is put away ----------
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { ui.hiddenAt = Date.now(); return; }
    if (data.settings.passHash && ui.hiddenAt && Date.now() - ui.hiddenAt > LOCK_GRACE_MS) {
      ui.locked = true; ui.pass = null; render();
    }
    ui.hiddenAt = null;
    if (!ui.locked) render();
  });

  // ---------- start ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  lastRoute = location.hash;
  render();
})();
