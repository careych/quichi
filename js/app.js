(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const LEVELS = [
    { id: '1', label: 'HSK 1', band: 'Beginner', color: '#2f9e6b', blurb: 'First words and greetings' },
    { id: '2', label: 'HSK 2', band: 'Beginner', color: '#1c9aa8', blurb: 'Daily life basics' },
    { id: '3', label: 'HSK 3', band: 'Elementary', color: '#3b7dd8', blurb: 'Everyday conversations' },
    { id: '4', label: 'HSK 4', band: 'Intermediate', color: '#6366d9', blurb: 'A wider range of topics' },
    { id: '5', label: 'HSK 5', band: 'Intermediate', color: '#9353d3', blurb: 'News, films and discussions' },
    { id: '6', label: 'HSK 6', band: 'Upper-intermediate', color: '#c9488f', blurb: 'Fluent, nuanced expression' },
    { id: '7', label: 'HSK 7–9', band: 'Advanced', color: '#d9534a', blurb: 'Academic and professional' },
  ];
  const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
  const COUNTS = (window.QUICHI_INDEX && window.QUICHI_INDEX.counts) || {};
  const TOTAL_WORDS = (window.QUICHI_INDEX && window.QUICHI_INDEX.total) || 0;

  const POS = {
    n: 'noun', v: 'verb', vn: 'verb / noun', a: 'adjective', an: 'adjective / noun', ad: 'adjective / adverb',
    d: 'adverb', b: 'attributive', q: 'measure word', qv: 'measure word', qt: 'measure word', mq: 'measure word',
    t: 'time word', tg: 'time word', l: 'phrase', f: 'direction', c: 'conjunction', cc: 'conjunction',
    r: 'pronoun', Rg: 'pronoun', nr: 'name', ns: 'place name', nt: 'organisation', nz: 'proper noun',
    p: 'preposition', s: 'place word', m: 'numeral', Mg: 'numeral', z: 'descriptive', u: 'particle',
    y: 'modal particle', e: 'interjection', o: 'onomatopoeia', k: 'suffix', h: 'prefix', g: 'morpheme',
  };

  const MASTERED_INTERVAL = 21; // days
  const MAX_INTERVAL = 365;
  const REVIEW_BATCH = 40;
  const QUIZ_LENGTH = 10;
  const PAGE_SIZE = 80;
  const GRADES = [
    { g: 0, label: 'Again' },
    { g: 1, label: 'Hard' },
    { g: 2, label: 'Good' },
    { g: 3, label: 'Easy' },
  ];
  const QUIZ_MODES = [
    { id: 'meaning', emoji: '💡', title: 'Meaning', desc: 'See the word, pick its meaning' },
    { id: 'hanzi', emoji: '字', title: 'Characters', desc: 'See the meaning, pick the word' },
    { id: 'pinyin', emoji: '🗣️', title: 'Pinyin', desc: 'See the word, pick its reading' },
    { id: 'listen', emoji: '🎧', title: 'Listening', desc: 'Hear the word, pick what you heard' },
  ];

  // ------------------------------------------------------------------ helpers
  const $ = (sel, root) => (root || document).querySelector(sel);
  const app = $('#app');
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const rand = (n) => Math.floor(Math.random() * n);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Local calendar day as an integer, so "due" and streaks follow the user's midnight.
  function today() {
    const d = new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  function norm(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function fmtInterval(days) {
    if (days <= 0) return 'soon';
    if (days < 14) return `${days}d`;
    if (days < 60) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}mo`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const ICON = {
    speak: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };

  // -------------------------------------------------------------------- store
  const STORE_KEY = window.QUICHI_STORE_KEY || 'quichi.v1'; // tests/smoke.html overrides the key
  const DEFAULT_SETTINGS = { script: 's', newPerSession: 10, theme: 'auto', autoSpeak: true, pinyinOnFront: false, lastLevel: '1' };

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (raw && typeof raw === 'object') return normalizeState(raw);
    } catch (e) { /* fall through to a fresh state */ }
    return normalizeState({});
  }

  function normalizeState(raw) {
    const cards = {};
    const src = raw.cards && typeof raw.cards === 'object' ? raw.cards : {};
    for (const key in src) {
      const c = src[key];
      if (!c || !LEVEL_BY_ID[c.l] || !Number.isFinite(c.due)) continue;
      cards[key] = { l: c.l, iv: +c.iv || 0, ef: +c.ef || 2.5, r: +c.r || 0, x: +c.x || 0, due: c.due };
    }
    const log = {};
    const srcLog = raw.log && typeof raw.log === 'object' ? raw.log : {};
    for (const day in srcLog) {
      const e = srcLog[day] || {};
      log[day] = { n: +e.n || 0, r: +e.r || 0, q: +e.q || 0 };
    }
    return { settings: Object.assign({}, DEFAULT_SETTINGS, raw.settings), cards, log };
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save progress in this browser');
    }
  }

  function logActivity(field) {
    const day = today();
    const entry = state.log[day] || (state.log[day] = { n: 0, r: 0, q: 0 });
    entry[field]++;
  }

  const dayTotal = (day) => {
    const e = state.log[day];
    return e ? e.n + e.r + e.q : 0;
  };

  function streak() {
    let day = today();
    if (!dayTotal(day)) day--; // today not studied yet: the streak is still alive
    let n = 0;
    while (dayTotal(day)) { n++; day--; }
    return n;
  }

  function levelCounts() {
    const out = { all: { started: 0, mastered: 0, due: 0 } };
    LEVELS.forEach((l) => { out[l.id] = { started: 0, mastered: 0, due: 0 }; });
    const t = today();
    for (const key in state.cards) {
      const c = state.cards[key];
      for (const o of [out[c.l], out.all]) {
        o.started++;
        if (c.iv >= MASTERED_INTERVAL) o.mastered++;
        if (c.due <= t) o.due++;
      }
    }
    return out;
  }

  function statusOf(word) {
    const c = state.cards[word.s];
    if (!c) return 'new';
    return c.iv >= MASTERED_INTERVAL ? 'mastered' : 'learning';
  }

  // ---------------------------------------------------------------------- SRS
  // A compact SM-2 variant: day-based intervals, an ease factor per card.
  function schedule(card, grade, day) {
    let { iv, ef, r, x } = card;
    if (grade === 0) {
      r = 0; iv = 0; x++;
      ef = Math.max(1.3, ef - 0.2);
    } else {
      if (grade === 1) {
        iv = r === 0 ? 1 : Math.max(iv + 1, Math.round(iv * 1.2));
        ef = Math.max(1.3, ef - 0.15);
      } else if (grade === 2) {
        iv = r === 0 ? 1 : r === 1 ? 3 : Math.max(iv + 1, Math.round(iv * ef));
      } else {
        iv = r === 0 ? 4 : Math.max(iv + 2, Math.round(iv * ef * 1.3));
        ef = Math.min(3, ef + 0.15);
      }
      r++;
    }
    iv = Math.min(iv, MAX_INTERVAL);
    return { l: card.l, iv, ef: Math.round(ef * 100) / 100, r, x, due: day + iv };
  }

  const newCard = (level) => ({ l: level, iv: 0, ef: 2.5, r: 0, x: 0, due: today() });

  // --------------------------------------------------------------------- data
  const levelCache = {};
  const WORDS = new Map(); // simplified -> word, for every loaded level

  function toWord(row, level, index) {
    const [s, t, p, m, pos, alt] = row;
    return {
      s, t: t || s, p, m, pos: pos || [], alt: alt || [], lv: level, i: index,
      pk: norm(p).replace(/[\s'’\-]/g, ''),
      mk: norm(m.join(' | ')),
    };
  }

  function loadLevel(id) {
    if (levelCache[id]) return levelCache[id];
    levelCache[id] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `data/hsk${id}.js`;
      script.onload = () => {
        const rows = (window.QUICHI_DATA || {})[id];
        if (!rows) return reject(new Error(`No data for level ${id}`));
        const words = rows.map((row, i) => toWord(row, id, i));
        words.forEach((w) => WORDS.set(w.s, w));
        resolve(words);
      };
      script.onerror = () => {
        delete levelCache[id];
        reject(new Error(`Could not load data/hsk${id}.js`));
      };
      document.head.appendChild(script);
    });
    return levelCache[id];
  }

  const loadAll = () => Promise.all(LEVELS.map((l) => loadLevel(l.id))).then((lists) => lists.flat());

  const disp = (w) => (state.settings.script === 't' ? w.t : w.s);

  function shortMeaning(w, max) {
    const text = w.m.slice(0, 2).join('; ');
    const limit = max || 80;
    return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
  }

  function searchWords(words, query) {
    const raw = query.trim();
    if (!raw) return words;
    const hasHan = /[㐀-鿿]/.test(raw);
    const n = norm(raw);
    const nk = n.replace(/[\s'’\-]/g, '');
    const isLetter = (ch) => ch >= 'a' && ch <= 'z';
    const hits = [];
    for (const w of words) {
      let score = 0;
      if (hasHan) {
        if (w.s === raw || w.t === raw) score = 100;
        else if (w.s.includes(raw) || w.t.includes(raw)) score = 60;
      } else {
        if (nk && w.pk === nk) score = 90;
        else if (nk && w.pk.startsWith(nk)) score = 70;
        const idx = w.mk.indexOf(n);
        if (idx >= 0) {
          const startsWord = idx === 0 || !isLetter(w.mk[idx - 1]);
          const end = idx + n.length;
          const endsWord = end === w.mk.length || !isLetter(w.mk[end]);
          score = Math.max(score, startsWord && endsWord ? 80 : startsWord ? 50 : 20);
        } else if (!score && nk.length >= 2 && w.pk.includes(nk)) {
          score = 30;
        }
      }
      if (score) hits.push([score, w]);
    }
    hits.sort((a, b) => b[0] - a[0] || a[1].lv - b[1].lv || a[1].i - b[1].i);
    return hits.map((h) => h[1]);
  }

  // ------------------------------------------------------------------- speech
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let zhVoice = null;

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    zhVoice = voices.find((v) => /^zh[-_]CN/i.test(v.lang)) || voices.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if (canSpeak) {
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  function speak(text) {
    if (!canSpeak) return toast('Audio is not supported in this browser');
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.85;
    if (zhVoice) u.voice = zhVoice;
    window.speechSynthesis.speak(u);
  }

  const speakBtn = (w, cls) =>
    `<button class="icon-btn ${cls || ''}" data-act="speak" data-w="${esc(w.s)}" aria-label="Play pronunciation of ${esc(w.s)}" title="Listen">${ICON.speak}</button>`;

  // -------------------------------------------------------------------- theme
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => state.settings.theme === 'dark' || (state.settings.theme === 'auto' && darkQuery.matches);
  function applyTheme() {
    document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
  }
  darkQuery.addEventListener('change', applyTheme);

  // ------------------------------------------------------------ shared pieces
  function updateChrome(routeName) {
    $('#streak-chip b').textContent = streak();
    const section = routeName === 'stats' || routeName === 'settings' ? routeName : 'home';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
    document.body.classList.toggle('in-session', ['learn', 'review', 'quiz'].includes(routeName));
  }

  const lvBadge = (id) => `<span class="lv-badge" style="--lv:${LEVEL_BY_ID[id].color}">${LEVEL_BY_ID[id].label}</span>`;

  function wordRow(w, showLevel) {
    const st = statusOf(w);
    return `<div class="row" role="button" tabindex="0" data-act="word" data-w="${esc(w.s)}">
      <span class="dot dot-${st}" title="${st}"></span>
      <span class="row-hz" lang="zh">${esc(disp(w))}</span>
      <span class="row-main"><span class="row-py">${esc(w.p)}</span><span class="row-m">${esc(shortMeaning(w, 120))}</span></span>
      ${showLevel ? lvBadge(w.lv) : ''}
      ${speakBtn(w)}
    </div>`;
  }

  function emptyBox(emoji, title, text, actions) {
    return `<div class="card empty"><span class="big" aria-hidden="true">${emoji}</span><b>${title}</b><p>${text}</p>${actions ? `<p style="margin-top:14px">${actions}</p>` : ''}</div>`;
  }

  function pageHead(backHref, title, sub, extra) {
    return `<div class="page-head">
      <a class="back" href="${backHref}" aria-label="Back">${ICON.back}</a>
      <div style="flex:1;min-width:0"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      ${extra || ''}
    </div>`;
  }

  // --------------------------------------------------------------------- home
  function viewHome() {
    const counts = levelCounts();
    const due = counts.all.due;
    const last = LEVEL_BY_ID[state.settings.lastLevel] || LEVELS[0];
    const started = counts.all.started;
    const cta = due
      ? `<a class="btn btn-primary" href="#/review/all">Review ${plural(due, 'due card')}</a>
         <a class="btn" href="#/learn/${last.id}">Learn new · ${last.label}</a>`
      : `<a class="btn btn-primary" href="#/learn/${last.id}">${started ? 'Continue' : 'Start'} ${last.label}</a>
         <a class="btn" href="#/quiz/${last.id}">Take a quiz</a>`;

    app.innerHTML = `<div class="stack">
      <section class="card hero">
        <div>
          <h1><span lang="zh">你好!</span> ${started ? 'Ready for today’s words?' : 'Let’s learn Chinese.'}</h1>
          <p>${TOTAL_WORDS.toLocaleString()} words from HSK 1 to HSK 9, with flashcards that remember what you forget.</p>
        </div>
        <div class="hero-stats">
          <div class="stat"><b>🔥 ${streak()}</b><span>day streak</span></div>
          <div class="stat"><b>${due}</b><span>due today</span></div>
          <div class="stat"><b>${started}</b><span>words studied</span></div>
          <div class="stat"><b>${counts.all.mastered}</b><span>mastered</span></div>
        </div>
        <div class="hero-cta">${cta}</div>
      </section>

      <section class="stack" style="gap:12px">
        <label class="search">
          <span class="sr-only">Search all words</span>${ICON.search}
          <input id="gsearch" type="search" placeholder="Search any word: 谢谢, xiexie, thanks…" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <div id="gresults"></div>
      </section>

      <section class="stack" style="gap:12px">
        <h2 class="section-title">Choose your level</h2>
        <div class="level-grid">${LEVELS.map((l) => levelCard(l, counts[l.id])).join('')}</div>
      </section>
      <p class="foot">Progress is saved in this browser. Word data: <a href="https://github.com/drkameleon/complete-hsk-vocabulary" target="_blank" rel="noopener">complete-hsk-vocabulary</a> (MIT), HSK 3.0 lists.</p>
    </div>`;
  }

  function levelCard(l, c) {
    const total = COUNTS[l.id] || 0;
    const pct = total ? Math.round((c.started / total) * 100) : 0;
    const R = 26;
    const C = 2 * Math.PI * R;
    return `<a class="card level-card" href="#/level/${l.id}" style="--lv:${l.color}">
      <div class="band">${l.band}</div>
      <div class="ring" role="img" aria-label="${pct}% studied">
        <svg width="64" height="64" viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${R}"/><circle class="fill" cx="32" cy="32" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg>
        <b>${pct}%</b>
      </div>
      <h3>${l.label}</h3>
      <div class="blurb">${l.blurb}</div>
      <div class="meta"><span>${c.started} / ${total.toLocaleString()} words</span>${c.due ? `<span class="due">${c.due} due</span>` : ''}</div>
    </a>`;
  }

  let searchTimer;
  let searchSeq = 0;
  function onGlobalSearch(input) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const box = $('#gresults');
      const q = input.value;
      const seq = ++searchSeq;
      if (!box) return;
      if (!q.trim()) { box.innerHTML = ''; return; }
      if (!box.innerHTML) box.innerHTML = '<p class="muted small">Searching…</p>';
      let all;
      try {
        all = await loadAll();
      } catch (e) {
        box.innerHTML = emptyBox('⚠️', 'Could not load the dictionary', esc(e.message));
        return;
      }
      if (seq !== searchSeq || !$('#gresults')) return;
      const hits = searchWords(all, q);
      box.innerHTML = hits.length
        ? `<div class="card list">${hits.slice(0, 30).map((w) => wordRow(w, true)).join('')}</div>
           ${hits.length > 30 ? `<p class="count-note" style="margin-top:8px">Showing 30 of ${hits.length} matches. Keep typing to narrow down.</p>` : ''}`
        : emptyBox('🔍', 'No matches', 'Try characters, pinyin without tones, or an English word.');
    }, 180);
  }

  // -------------------------------------------------------------------- level
  let listCtx = null;
  let listObserver = null;

  async function viewLevel(id, token) {
    const level = LEVEL_BY_ID[id];
    app.innerHTML = '<p class="muted">Loading words…</p>';
    const words = await loadLevel(id);
    if (token !== renderToken) return;
    state.settings.lastLevel = id;
    save();

    const c = levelCounts()[id];
    const fresh = words.length - c.started;
    const batch = Math.min(fresh, state.settings.newPerSession);
    listCtx = { words, q: '', filter: 'all', results: words, shown: 0 };

    app.innerHTML = `<div class="stack" style="--lv:${level.color}">
      ${pageHead('#/', level.label, `${level.band} · ${words.length.toLocaleString()} words · ${c.started} studied · ${c.mastered} mastered`)}
      <div class="actions">
        <a class="card action is-primary" href="#/learn/${id}"><span class="emoji" aria-hidden="true">🌱</span><span><b>Learn new words</b><span>${fresh ? `Next ${batch} of ${fresh.toLocaleString()} left` : 'All words started'}</span></span></a>
        <a class="card action" href="#/review/${id}"><span class="emoji" aria-hidden="true">🔁</span><span><b>Review</b><span>${c.due ? plural(c.due, 'card') + ' due' : 'Nothing due right now'}</span></span></a>
        <a class="card action" href="#/quiz/${id}"><span class="emoji" aria-hidden="true">🎯</span><span><b>Quiz</b><span>4 game modes</span></span></a>
      </div>
      <section class="stack" style="gap:12px">
        <h2 class="section-title">Word list</h2>
        <label class="search">
          <span class="sr-only">Search this level</span>${ICON.search}
          <input id="lsearch" type="search" placeholder="Search ${level.label}: characters, pinyin or English" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <div class="filters" role="group" aria-label="Filter by status">
          ${[['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['mastered', 'Mastered']].map(([f, label]) =>
            `<button class="pill" data-act="filter" data-f="${f}" aria-pressed="${f === 'all'}">${f === 'all' ? '' : `<span class="dot dot-${f}"></span>`}${label}</button>`).join('')}
        </div>
        <div class="count-note" id="list-count"></div>
        <div class="card list" id="list"></div>
        <div id="list-more" style="height:1px"></div>
      </section>
    </div>`;

    if (listObserver) listObserver.disconnect();
    if ('IntersectionObserver' in window) {
      listObserver = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) appendRows();
      }, { rootMargin: '600px' });
      listObserver.observe($('#list-more'));
    }
    refreshList();
  }

  function refreshList() {
    if (!listCtx || !$('#list')) return;
    let res = searchWords(listCtx.words, listCtx.q);
    if (listCtx.filter !== 'all') res = res.filter((w) => statusOf(w) === listCtx.filter);
    listCtx.results = res;
    listCtx.shown = 0;
    $('#list').innerHTML = res.length ? '' : '<div class="empty"><span class="big" aria-hidden="true">🔍</span>No words match.</div>';
    $('#list-count').textContent = `${plural(res.length, 'word')}${listCtx.q.trim() ? '' : ' · most common first'}`;
    appendRows();
  }

  function appendRows() {
    const list = $('#list');
    if (!listCtx || !list || listCtx.shown >= listCtx.results.length) return;
    // Without IntersectionObserver there is no lazy paging, so render everything once.
    const size = 'IntersectionObserver' in window ? PAGE_SIZE : listCtx.results.length;
    const next = listCtx.results.slice(listCtx.shown, listCtx.shown + size);
    list.insertAdjacentHTML('beforeend', next.map((w) => wordRow(w, false)).join(''));
    listCtx.shown += next.length;
  }

  // --------------------------------------------------------------- word modal
  let modalWord = null;
  let writers = [];

  function openWord(key) {
    const w = WORDS.get(key);
    if (!w) return;
    modalWord = w;
    drawModal();
    if (state.settings.autoSpeak && canSpeak) speak(w.s);
  }

  function closeModal() {
    modalWord = null;
    writers = [];
    $('#modal-root').innerHTML = '';
  }

  function drawModal() {
    const w = modalWord;
    const c = state.cards[w.s];
    const st = statusOf(w);
    const hz = disp(w);
    const chars = Array.from(hz).filter((ch) => /[㐀-鿿]/.test(ch)).slice(0, 4);
    const posTags = [...new Set(w.pos.map((p) => POS[p]).filter(Boolean))];
    const other = w.t !== w.s ? (state.settings.script === 't' ? `Simplified: ${w.s}` : `Traditional: ${w.t}`) : '';
    const statusText = st === 'new' ? 'Not studied yet'
      : `${st === 'mastered' ? 'Mastered' : 'Learning'} · next review ${c.due <= today() ? 'today' : `in ${fmtInterval(c.due - today())}`}`;

    $('#modal-root').innerHTML = `<div class="modal-bg" data-act="modal-bg">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(w.s)}">
        <button class="icon-btn x" data-act="modal-x" aria-label="Close">${ICON.close}</button>
        <div class="modal-head">
          <div class="hz-big${Array.from(hz).length > 3 ? ' long' : ''}" lang="zh">${esc(hz)}</div>
          <div>
            <div class="py-big">${esc(w.p)} ${speakBtn(w)}</div>
            <div class="tags">${lvBadge(w.lv)}${posTags.map((t) => `<span class="tag-pos">${t}</span>`).join('')}</div>
          </div>
        </div>
        <ol class="defs">${w.m.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
        ${other ? `<div class="muted small" lang="zh">${esc(other)}</div>` : ''}
        ${w.alt.length ? `<div class="alt"><span>Other readings</span>${w.alt.map(([p, m]) => `<div><b>${esc(p)}</b> ${esc(m.slice(0, 3).join('; '))}</div>`).join('')}</div>` : ''}
        ${window.HanziWriter && chars.length ? `<div>
          <div class="muted small" style="margin-bottom:8px">Stroke order · tap a character to replay</div>
          <div class="strokes">${chars.map((ch, i) => `<div class="stroke-box" data-act="stroke" data-i="${i}" role="button" tabindex="0" aria-label="Animate strokes of ${esc(ch)}"></div>`).join('')}</div>
        </div>` : ''}
        <div class="modal-foot">
          <span class="status"><span class="dot dot-${st}"></span>${statusText}</span>
          <span>
            ${st === 'mastered' ? '' : '<button class="btn btn-ghost small" data-act="mark-known">I know this</button>'}
            ${st === 'new' ? '' : '<button class="btn btn-ghost small btn-danger" data-act="reset-word">Reset</button>'}
          </span>
        </div>
      </div>
    </div>`;

    writers = [];
    if (window.HanziWriter && chars.length) {
      const css = getComputedStyle(document.documentElement);
      document.querySelectorAll('.stroke-box').forEach((box, i) => {
        try {
          writers[i] = window.HanziWriter.create(box, chars[i], {
            width: 90, height: 90, padding: 6, showOutline: true,
            strokeColor: css.getPropertyValue('--ink').trim(),
            outlineColor: css.getPropertyValue('--line').trim(),
            strokeAnimationSpeed: 1.3, delayBetweenStrokes: 120,
            onLoadCharDataError: () => { box.style.display = 'none'; },
          });
        } catch (e) { box.style.display = 'none'; }
      });
    }
    $('.modal .x').focus();
  }

  // --------------------------------------------------- flashcards (learn/review)
  let session = null;

  async function startLearn(id, token) {
    app.innerHTML = '<p class="muted">Loading words…</p>';
    const words = await loadLevel(id);
    if (token !== renderToken) return;
    state.settings.lastLevel = id;
    save();
    const fresh = words.filter((w) => !state.cards[w.s]).slice(0, state.settings.newPerSession);
    if (!fresh.length) {
      app.innerHTML = `<div class="session">${emptyBox('🏆', `You have started every ${LEVEL_BY_ID[id].label} word`, 'Keep them alive with reviews, or test yourself.',
        `<a class="btn btn-primary" href="#/review/${id}">Review</a> <a class="btn" href="#/quiz/${id}">Quiz</a>`)}</div>`;
      return;
    }
    const queue = fresh.map((w) => ({ w, kind: 'intro' })).concat(fresh.map((w) => ({ w, kind: 'test' })));
    beginCards({ mode: 'learn', lv: id, title: `Learn · ${LEVEL_BY_ID[id].label}`, queue });
  }

  async function startReview(id, token) {
    app.innerHTML = '<p class="muted">Loading cards…</p>';
    const t = today();
    const due = Object.entries(state.cards)
      .filter(([, c]) => c.due <= t && (id === 'all' || c.l === id))
      .sort((a, b) => a[1].due - b[1].due)
      .slice(0, REVIEW_BATCH);
    await Promise.all([...new Set(due.map(([, c]) => c.l))].map(loadLevel));
    if (token !== renderToken) return;
    const queue = shuffle(due.map(([key]) => WORDS.get(key)).filter(Boolean).map((w) => ({ w, kind: 'test' })));
    const back = id === 'all' ? '#/' : `#/level/${id}`;
    if (!queue.length) {
      app.innerHTML = `<div class="session">${emptyBox('🎉', 'Nothing to review', 'You are all caught up. New cards come back when you are about to forget them.',
        `<a class="btn btn-primary" href="#/learn/${id === 'all' ? state.settings.lastLevel : id}">Learn new words</a> <a class="btn" href="${back}">Back</a>`)}</div>`;
      return;
    }
    beginCards({ mode: 'review', lv: id, title: id === 'all' ? 'Review · all levels' : `Review · ${LEVEL_BY_ID[id].label}`, queue });
  }

  function beginCards(opts) {
    session = Object.assign({ type: 'cards', total: opts.queue.length, done: 0, revealed: false, counted: new Set(), again: 0, graded: 0 }, opts);
    drawCard();
  }

  const sessionBack = () => (session.lv === 'all' ? '#/' : `#/level/${session.lv}`);

  function sessionTop() {
    const pct = session.total ? Math.round((session.done / session.total) * 100) : 0;
    return `<div class="session-top">
      <a class="icon-btn" href="${sessionBack()}" aria-label="End session">${ICON.close}</a>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(session.title)}"><i style="width:${pct}%"></i></div>
      <span class="n">${Math.min(session.done + 1, session.total)} / ${session.total}</span>
    </div>`;
  }

  function answerBlock(w) {
    const more = w.m.slice(2, 5).join('; ');
    return `<div class="reveal">
      <div class="py-big">${esc(w.p)}</div>
      <div class="meaning">${esc(w.m.slice(0, 2).join('; '))}</div>
      ${more ? `<div class="meaning-more">${esc(more)}</div>` : ''}
      <button class="btn btn-ghost small" data-act="word" data-w="${esc(w.s)}">Details &amp; stroke order</button>
    </div>`;
  }

  function drawCard() {
    const item = session.queue[0];
    if (!item) return drawCardsDone();
    const w = item.w;
    const hz = disp(w);
    const long = Array.from(hz).length > 3 ? ' long' : '';
    const intro = item.kind === 'intro';
    const open = intro || session.revealed;
    const frontPinyin = !open && state.settings.pinyinOnFront ? `<div class="py-big">${esc(w.p)}</div>` : '';

    let controls;
    if (intro) {
      controls = '<button class="btn btn-primary btn-block" data-act="next-intro">Got it <kbd>Space</kbd></button>';
    } else if (!session.revealed) {
      controls = '<button class="btn btn-primary btn-block" data-act="reveal">Show answer <kbd>Space</kbd></button>';
    } else {
      const base = state.cards[w.s] || newCard(w.lv);
      controls = `<div class="grades">${GRADES.map(({ g, label }) =>
        `<button class="grade" data-act="grade" data-g="${g}">${label}<small>${fmtInterval(schedule(base, g, today()).iv)}</small><kbd>${g + 1}</kbd></button>`).join('')}</div>`;
    }

    app.innerHTML = `<div class="session">
      ${sessionTop()}
      <div class="card flash">
        <span class="tag">${intro ? 'New word' : session.mode === 'learn' ? 'Do you remember?' : 'Review'}</span>
        ${speakBtn(w, 'speak')}
        <div class="hz-big${long}" lang="zh">${esc(hz)}</div>
        ${frontPinyin}
        ${open ? answerBlock(w) : '<div class="hint">Say it, recall the meaning, then check.</div>'}
      </div>
      ${controls}
    </div>`;
    if (open && state.settings.autoSpeak && canSpeak) speak(w.s);
  }

  function gradeCard(g) {
    if (!session || session.type !== 'cards' || !session.revealed) return;
    const item = session.queue.shift();
    const w = item.w;
    const prev = state.cards[w.s];
    state.cards[w.s] = schedule(prev || newCard(w.lv), g, today());
    if (!session.counted.has(w.s)) {
      session.counted.add(w.s);
      logActivity(prev ? 'r' : 'n');
    }
    session.graded++;
    if (g === 0) {
      session.again++;
      session.total++;
      session.queue.splice(Math.min(3, session.queue.length), 0, { w, kind: 'test' });
    }
    session.done++;
    session.revealed = false;
    save();
    updateChrome(parseRoute().name);
    drawCard();
  }

  function drawCardsDone() {
    const words = session.counted.size;
    const accuracy = session.graded ? Math.round(((session.graded - session.again) / session.graded) * 100) : 100;
    const lv = session.lv === 'all' ? state.settings.lastLevel : session.lv;
    const dueLeft = levelCounts()[session.lv].due;
    app.innerHTML = `<div class="session"><div class="card done">
      <span class="big" aria-hidden="true">🎉</span>
      <h2>${session.mode === 'learn' ? 'New words learned!' : 'Review complete!'}</h2>
      <div class="done-stats">
        <div class="stat"><b>${words}</b><span>${session.mode === 'learn' ? 'new words' : 'cards reviewed'}</span></div>
        <div class="stat"><b>${accuracy}%</b><span>recalled</span></div>
        <div class="stat"><b>🔥 ${streak()}</b><span>day streak</span></div>
      </div>
      <div class="btns">
        ${dueLeft ? `<a class="btn btn-primary" href="#/review/${session.lv}" data-act="rerun">Review ${dueLeft} more</a>` : ''}
        <a class="btn ${dueLeft ? '' : 'btn-primary'}" href="#/learn/${lv}" data-act="rerun">Learn ${state.settings.newPerSession} more</a>
        <a class="btn" href="#/quiz/${lv}">Quiz</a>
        <a class="btn btn-ghost" href="${sessionBack()}">Done</a>
      </div>
    </div></div>`;
    session = null;
  }

  // --------------------------------------------------------------------- quiz
  let quizSetup = { pool: 'auto' };

  async function viewQuizSetup(id, token) {
    app.innerHTML = '<p class="muted">Loading words…</p>';
    const words = await loadLevel(id);
    if (token !== renderToken) return;
    const level = LEVEL_BY_ID[id];
    const studied = words.filter((w) => state.cards[w.s]);
    const canStudied = studied.length >= 4;
    const pool = quizSetup.pool === 'all' || !canStudied ? 'all' : 'studied';
    quizSetup = { pool, id };

    app.innerHTML = `<div class="stack">
      ${pageHead(`#/level/${id}`, `Quiz · ${level.label}`, `${QUIZ_LENGTH} quick questions`)}
      <div>
        <div class="muted small" style="margin-bottom:6px">Questions from</div>
        <div class="seg" role="group" aria-label="Question pool">
          <button data-act="quiz-pool" data-pool="studied" aria-pressed="${pool === 'studied'}" ${canStudied ? '' : 'disabled title="Study at least 4 words first"'}>Words I studied (${studied.length})</button>
          <button data-act="quiz-pool" data-pool="all" aria-pressed="${pool === 'all'}">All ${words.length.toLocaleString()} words</button>
        </div>
      </div>
      <div class="modes">
        ${QUIZ_MODES.filter((m) => m.id !== 'listen' || canSpeak).map((m) =>
          `<button class="card action" data-act="quiz-start" data-mode="${m.id}"><span class="emoji" aria-hidden="true">${m.emoji}</span><span><b>${m.title}</b><span>${m.desc}</span></span></button>`).join('')}
      </div>
    </div>`;
  }

  function optionText(w, mode) {
    if (mode === 'meaning') return shortMeaning(w, 70);
    if (mode === 'pinyin') return w.p;
    return disp(w);
  }

  function buildQuiz(words, pool, mode) {
    return shuffle(pool.slice()).slice(0, QUIZ_LENGTH).map((w) => {
      const used = new Set([optionText(w, mode), w.s]);
      const opts = [w];
      for (let guard = 0; opts.length < 4 && guard < 400; guard++) {
        const d = words[rand(words.length)];
        const text = optionText(d, mode);
        if (used.has(text) || used.has(d.s)) continue;
        // Homophones would make a listening or pinyin question unanswerable.
        if ((mode === 'listen' || mode === 'pinyin') && d.p === w.p) continue;
        used.add(text);
        used.add(d.s);
        opts.push(d);
      }
      return { w, opts: shuffle(opts), picked: -1 };
    });
  }

  async function startQuiz(mode) {
    const id = quizSetup.id;
    const words = await loadLevel(id);
    const studied = words.filter((w) => state.cards[w.s]);
    const pool = quizSetup.pool === 'studied' && studied.length >= 4 ? studied : words;
    session = { type: 'quiz', mode, lv: id, title: `Quiz · ${LEVEL_BY_ID[id].label}`, qs: buildQuiz(words, pool, mode), i: 0, right: 0, done: 0 };
    session.total = session.qs.length;
    drawQuiz(true);
  }

  function drawQuiz(fresh) {
    const q = session.qs[session.i];
    if (!q) return drawQuizDone();
    const { mode } = session;
    const w = q.w;
    const answered = q.picked >= 0;
    const hz = disp(w);
    const long = Array.from(hz).length > 3 ? ' long' : '';

    let prompt;
    if (mode === 'hanzi') prompt = `<div class="prompt-meaning">${esc(shortMeaning(w, 90))}</div>`;
    else if (mode === 'listen') prompt = `<button class="listen-btn" data-act="speak" data-w="${esc(w.s)}" aria-label="Play the word again"><span style="transform:scale(1.9);display:grid">${ICON.speak}</span></button><div class="hint">Tap to listen again</div>`;
    else prompt = `<div class="hz-big${long}" lang="zh">${esc(hz)}</div>`;

    const opts = q.opts.map((o, i) => {
      let cls = mode === 'hanzi' || mode === 'listen' ? 'opt hz' : 'opt';
      let mark = '';
      if (answered) {
        if (o === w) { cls += ' right'; mark = '<span class="mark" aria-label="correct">✓</span>'; }
        else if (i === q.picked) { cls += ' wrong'; mark = '<span class="mark" aria-label="your answer, incorrect">✕</span>'; }
      }
      return `<button class="${cls}" data-act="quiz-pick" data-i="${i}" ${answered ? 'disabled' : ''}><kbd>${i + 1}</kbd><span class="txt"${mode === 'meaning' ? '' : ' lang="zh"'}>${esc(optionText(o, mode))}</span>${mark}</button>`;
    }).join('');

    const feedback = answered ? `<div class="card feedback">
        <div class="who"><b lang="zh">${esc(hz)}</b><i>${esc(w.p)}</i><p>${esc(shortMeaning(w, 110))}</p></div>
        ${speakBtn(w)}
        <button class="btn btn-primary" data-act="quiz-next">${session.i + 1 < session.total ? 'Next' : 'Finish'} <kbd>Enter</kbd></button>
      </div>` : '';

    app.innerHTML = `<div class="session">
      ${sessionTop()}
      <div class="card flash" style="min-height:220px">
        <span class="tag">${QUIZ_MODES.find((m) => m.id === mode).title}</span>
        ${prompt}
      </div>
      <div class="opts">${opts}</div>
      ${feedback}
    </div>`;
    if (fresh && mode === 'listen') speak(w.s);
    if (answered) $('[data-act="quiz-next"]').focus();
  }

  function pickAnswer(i) {
    if (!session || session.type !== 'quiz') return;
    const q = session.qs[session.i];
    if (!q || q.picked >= 0 || !q.opts[i]) return;
    q.picked = i;
    const correct = q.opts[i] === q.w;
    if (correct) session.right++;
    else if (state.cards[q.w.s]) state.cards[q.w.s].due = today(); // missed in a quiz: bring it back for review
    logActivity('q');
    save();
    session.done++;
    updateChrome('quiz');
    if (state.settings.autoSpeak && canSpeak && session.mode !== 'listen') speak(q.w.s);
    drawQuiz(false);
  }

  function nextQuestion() {
    if (!session || session.type !== 'quiz' || session.qs[session.i].picked < 0) return;
    session.i++;
    drawQuiz(true);
  }

  function drawQuizDone() {
    const { right, total, lv } = session;
    const missed = session.qs.filter((q) => q.opts[q.picked] !== q.w).map((q) => q.w);
    const pct = total ? right / total : 0;
    const [emoji, title] = pct === 1 ? ['🏆', 'Perfect score!'] : pct >= 0.7 ? ['🎉', 'Nicely done!'] : ['💪', 'Good practice. Go again?'];
    app.innerHTML = `<div class="session"><div class="card done">
      <span class="big" aria-hidden="true">${emoji}</span>
      <h2>${title}</h2>
      <div class="done-stats"><div class="stat"><b>${right} / ${total}</b><span>correct</span></div><div class="stat"><b>🔥 ${streak()}</b><span>day streak</span></div></div>
      ${missed.length ? `<div class="missed"><div class="muted small" style="margin-bottom:6px">Worth another look</div><div class="card list" style="box-shadow:none">${missed.map((w) => wordRow(w, false)).join('')}</div></div>` : ''}
      <div class="btns">
        <button class="btn btn-primary" data-act="quiz-start" data-mode="${session.mode}">Play again</button>
        <a class="btn" href="#/quiz/${lv}" data-act="rerun">Change mode</a>
        <a class="btn btn-ghost" href="#/level/${lv}">Done</a>
      </div>
    </div></div>`;
    session = null;
  }

  // -------------------------------------------------------------------- stats
  function viewStats() {
    const counts = levelCounts();
    const t = today();
    const days = [];
    for (let d = t - 13; d <= t; d++) days.push({ d, v: dayTotal(d) });
    const max = Math.max(1, ...days.map((x) => x.v));
    const peak = days.reduce((a, b) => (b.v >= a.v ? b : a));
    const dateOf = (d) => new Date(d * 86400000 + new Date().getTimezoneOffset() * 60000);
    const dayName = (d) => dateOf(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    app.innerHTML = `<div class="stack">
      <div class="page-head"><div><h1>Your progress</h1><div class="sub">Saved in this browser</div></div></div>
      <div class="tiles">
        <div class="card tile"><b>🔥 ${streak()}</b><span>day streak</span></div>
        <div class="card tile"><b>${counts.all.started.toLocaleString()}</b><span>words studied of ${TOTAL_WORDS.toLocaleString()}</span></div>
        <div class="card tile"><b>${counts.all.mastered.toLocaleString()}</b><span>mastered (3+ weeks apart)</span></div>
        <div class="card tile"><b>${counts.all.due.toLocaleString()}</b><span>due for review</span></div>
      </div>

      <section class="card panel">
        <div><h2 class="section-title">Answers per day</h2><div class="muted small">Flashcards and quiz questions, last 14 days</div></div>
        <div>
          <div class="chart" role="list" aria-label="Answers per day, last 14 days">
            ${days.map(({ d, v }) => `<div class="col${v ? '' : ' zero'}" role="listitem" tabindex="0" aria-label="${dayName(d)}: ${plural(v, 'answer')}" data-tip="${dayName(d)} · ${v}">
              <div class="bar-v" style="height:${(v / max) * 100}%">${v && (d === t || d === peak.d) ? `<span class="val">${v}</span>` : ''}</div>
            </div>`).join('')}
          </div>
          <div class="chart-x" aria-hidden="true">${days.map(({ d }) => `<span class="${d === t ? 'today' : ''}">${d === t ? 'Today' : dateOf(d).getDate()}</span>`).join('')}</div>
        </div>
      </section>

      <section class="card panel">
        <div><h2 class="section-title">By level</h2>
          <div class="legend"><span><i></i>Mastered</span><span><i class="light"></i>Learning</span></div></div>
        <div class="lv-rows">
          ${LEVELS.map((l) => {
            const c = counts[l.id];
            const total = COUNTS[l.id] || 1;
            const learning = c.started - c.mastered;
            return `<a class="lv-row" href="#/level/${l.id}" style="--lv:${l.color}">
              <b>${l.label}</b>
              <div class="meter" role="img" aria-label="${c.mastered} mastered, ${learning} learning, of ${total}">
                ${c.mastered ? `<i style="width:${(c.mastered / total) * 100}%"></i>` : '<i style="width:0"></i>'}
                ${learning ? `<i style="width:${(learning / total) * 100}%"></i>` : ''}
              </div>
              <span class="num">${c.started} / ${total.toLocaleString()}</span>
            </a>`;
          }).join('')}
        </div>
      </section>
    </div>`;
  }

  // ----------------------------------------------------------------- settings
  function seg(key, options) {
    return `<div class="seg" role="group">${options.map(([value, label]) =>
      `<button data-act="set" data-key="${key}" data-value="${value}" aria-pressed="${String(state.settings[key]) === String(value)}">${label}</button>`).join('')}</div>`;
  }

  const toggle = (key, label) =>
    `<button class="switch" role="switch" data-act="toggle" data-key="${key}" aria-checked="${!!state.settings[key]}" aria-label="${label}"></button>`;

  function viewSettings() {
    app.innerHTML = `<div class="stack" style="max-width:680px;margin:0 auto">
      <div class="page-head"><h1>Settings</h1></div>
      <section class="card panel" style="gap:0">
        <div class="setting"><div><b>Characters</b><p>Which script to show on cards and lists.</p></div>${seg('script', [['s', '简体 Simplified'], ['t', '繁體 Traditional']])}</div>
        <div class="setting"><div><b>New words per session</b><p>Smaller batches are easier to remember.</p></div>${seg('newPerSession', [[5, '5'], [10, '10'], [15, '15'], [20, '20']])}</div>
        <div class="setting"><div><b>Theme</b></div>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
        <div class="setting"><div><b>Play audio automatically</b><p>${canSpeak ? 'Uses your device’s Chinese voice when an answer is shown.' : 'This browser has no speech synthesis, so audio is unavailable.'}</p></div>${toggle('autoSpeak', 'Play audio automatically')}</div>
        <div class="setting"><div><b>Show pinyin on the front</b><p>Easier, but you learn to read characters more slowly.</p></div>${toggle('pinyinOnFront', 'Show pinyin on the front of cards')}</div>
      </section>
      <section class="card panel" style="gap:0">
        <div class="setting"><div><b>Back up progress</b><p>Download a file with your cards and history, or restore one on another device.</p></div>
          <span><button class="btn" data-act="export">Export</button> <button class="btn" data-act="import">Import</button></span></div>
        <div class="setting"><div><b>Reset everything</b><p>Deletes all cards, streaks and history in this browser.</p></div><button class="btn btn-danger" data-act="reset-all">Reset</button></div>
      </section>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <p class="foot">Quichi · vocabulary from <a href="https://github.com/drkameleon/complete-hsk-vocabulary" target="_blank" rel="noopener">complete-hsk-vocabulary</a> (MIT), definitions based on CC-CEDICT · stroke data by <a href="https://hanziwriter.org" target="_blank" rel="noopener">Hanzi Writer</a>.</p>
    </div>`;
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(Object.assign({ app: 'quichi', version: 1 }, state))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quichi-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);
        if (!raw || raw.app !== 'quichi' || typeof raw.cards !== 'object') throw new Error('not a Quichi backup');
        const next = normalizeState(raw);
        if (!window.confirm(`Replace your current progress with this backup (${plural(Object.keys(next.cards).length, 'card')})?`)) return;
        state = next;
        save();
        applyTheme();
        render();
        toast('Progress restored');
      } catch (e) {
        toast('That file is not a Quichi backup');
      }
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------------- router
  let renderToken = 0;

  function parseRoute() {
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: name || 'home', arg: arg || '' };
  }

  async function render() {
    const token = ++renderToken;
    const { name, arg } = parseRoute();
    session = null;
    listCtx = null;
    closeModal();
    if (canSpeak) window.speechSynthesis.cancel();
    updateChrome(name);
    window.scrollTo(0, 0);
    const needsLevel = ['level', 'learn', 'quiz'].includes(name);
    try {
      if (needsLevel && !LEVEL_BY_ID[arg]) { location.hash = '#/'; return; }
      if (name === 'level') await viewLevel(arg, token);
      else if (name === 'learn') await startLearn(arg, token);
      else if (name === 'review') await startReview(LEVEL_BY_ID[arg] ? arg : 'all', token);
      else if (name === 'quiz') await viewQuizSetup(arg, token);
      else if (name === 'stats') viewStats();
      else if (name === 'settings') viewSettings();
      else viewHome();
    } catch (e) {
      if (token !== renderToken) return;
      app.innerHTML = emptyBox('⚠️', 'Something went wrong', esc(e.message), '<a class="btn" href="#/">Back home</a>');
    }
  }

  // ------------------------------------------------------------------- events
  const actions = {
    'toggle-theme'() {
      state.settings.theme = isDark() ? 'light' : 'dark';
      save();
      applyTheme();
      if (parseRoute().name === 'settings') viewSettings();
    },
    speak(el) { speak(el.dataset.w); },
    word(el) { openWord(el.dataset.w); },
    'modal-bg'(el, e) { if (e.target === el) closeModal(); },
    'modal-x'() { closeModal(); },
    stroke(el) { const wr = writers[+el.dataset.i]; if (wr) wr.animateCharacter(); },
    'mark-known'() {
      const w = modalWord;
      const isNew = !state.cards[w.s];
      state.cards[w.s] = { l: w.lv, iv: 30, ef: 2.5, r: 3, x: 0, due: today() + 30 };
      if (isNew) logActivity('n');
      save();
      afterWordChange();
    },
    'reset-word'() {
      delete state.cards[modalWord.s];
      save();
      afterWordChange();
    },
    filter(el) {
      listCtx.filter = el.dataset.f;
      document.querySelectorAll('[data-act="filter"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      refreshList();
    },
    reveal() {
      if (!session || session.type !== 'cards') return;
      session.revealed = true;
      drawCard();
    },
    'next-intro'() {
      if (!session || session.type !== 'cards' || session.queue[0].kind !== 'intro') return;
      session.queue.shift();
      session.done++;
      drawCard();
    },
    grade(el) { gradeCard(+el.dataset.g); },
    // Same-hash links (e.g. "Learn 10 more" from #/learn/1) fire no hashchange, so re-render by hand.
    rerun(el) { if (el.getAttribute('href') === location.hash) render(); },
    'quiz-pool'(el) { quizSetup.pool = el.dataset.pool; render(); },
    'quiz-start'(el) { startQuiz(el.dataset.mode); },
    'quiz-pick'(el) { pickAnswer(+el.dataset.i); },
    'quiz-next'() { nextQuestion(); },
    set(el) {
      const { key, value } = el.dataset;
      state.settings[key] = key === 'newPerSession' ? +value : value;
      save();
      applyTheme();
      viewSettings();
    },
    toggle(el) {
      state.settings[el.dataset.key] = !state.settings[el.dataset.key];
      save();
      viewSettings();
    },
    export() { exportProgress(); },
    import() { $('#import-file').click(); },
    'reset-all'() {
      if (!window.confirm('Delete all progress in this browser? This cannot be undone.')) return;
      state = normalizeState({ settings: state.settings });
      save();
      render();
      toast('Progress reset');
    },
  };

  function afterWordChange() {
    drawModal();
    updateChrome(parseRoute().name);
    // Keep the level list in sync without losing scroll position.
    const row = document.querySelector(`.row[data-w="${CSS.escape(modalWord.s)}"] .dot`);
    if (row) row.className = `dot dot-${statusOf(modalWord)}`;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'gsearch') onGlobalSearch(e.target);
    else if (e.target.id === 'lsearch' && listCtx) {
      listCtx.q = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refreshList, 120);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) importProgress(e.target.files[0]);
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && modalWord) return closeModal();
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const onButton = tag === 'BUTTON' || tag === 'A';
    const isActivate = e.key === 'Enter' || e.key === ' ';

    // Rows and stroke boxes are div[role=button]: make them keyboard-operable.
    if (isActivate && e.target.matches && e.target.matches('div[role="button"][data-act]')) {
      e.preventDefault();
      e.target.click();
      return;
    }
    if (modalWord || !session) return;

    if (session.type === 'cards') {
      const item = session.queue[0];
      if (!item) return;
      if (isActivate && !onButton) {
        e.preventDefault();
        if (item.kind === 'intro') actions['next-intro']();
        else if (!session.revealed) actions.reveal();
      } else if (session.revealed && e.key >= '1' && e.key <= '4') {
        gradeCard(+e.key - 1);
      }
    } else if (session.type === 'quiz') {
      if (e.key >= '1' && e.key <= '4') pickAnswer(+e.key - 1);
      else if (e.key === 'Enter' && !onButton) nextQuestion();
    }
  });

  window.addEventListener('hashchange', render);

  // Test hook for the pure logic (used by tests/smoke.html; harmless otherwise).
  window.__quichi = { schedule, searchWords, toWord, norm, fmtInterval, buildQuiz, normalizeState };

  applyTheme();
  render();
})();
