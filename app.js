/* ==========================================================================
   Voices from the Archive — app logic
   Vanilla JS, no build step. Loads episodes.json at runtime.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* Icons                                                                   */
  /* ---------------------------------------------------------------------- */

  var ICON_STAR =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z"/></svg>';
  var ICON_SHARE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';
  var ICON_BACK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var ICON_SEARCH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';

  /* ---------------------------------------------------------------------- */
  /* State                                                                   */
  /* ---------------------------------------------------------------------- */

  var EPS = [];
  var BOOKMARKS = [];
  var filtered = [];
  var shown = 0;
  var PAGE = 40;
  var tab = 'episodes';
  var current = null;
  var dragTarget = null; // 'detail' | 'mini' | null
  var previewFrac = 0;

  var BOOKMARK_KEY = 'vfa-bookmarks';

  /* ---------------------------------------------------------------------- */
  /* DOM refs                                                                */
  /* ---------------------------------------------------------------------- */

  var $ = function (id) { return document.getElementById(id); };

  var listEl = $('list');
  var countEl = $('count');
  var emptyEl = $('empty');
  var moreBtn = $('more');
  var moreWrap = $('moreWrap');
  var qInput = $('q');
  var qClear = $('qClear');
  var fTheme = $('fTheme');
  var fEntity = $('fEntity');
  var fSeason = $('fSeason');

  var audio = $('audio');

  var detailEl = $('detail');
  var dKicker = $('dKicker');
  var dTitle = $('dTitle');
  var dMeta = $('dMeta');
  var dTranscript = $('dTranscript');
  var dSources = $('dSources');
  var dRelated = $('dRelated');
  var detailBookmark = $('detailBookmark');
  var detailShare = $('detailShare');

  var btnPlay = $('btnPlay');
  var scrubEl = $('scrub');
  var scrubFill = $('scrubFill');
  var scrubThumb = $('scrubThumb');
  var timeReadout = $('timeReadout');

  var miniEl = $('mini');
  var miniPlay = $('miniPlay');
  var miniTitle = $('miniTitle');
  var miniTime = $('miniTime');
  var miniScrub = $('miniScrub');
  var miniFill = $('miniFill');

  var toastEl = $('toast');

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                 */
  /* ---------------------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function seasonLabel(e) {
    return 'Season ' + e.season + (e.season_name ? ' \u00b7 ' + e.season_name : '');
  }

  function episodeDate(e) {
    return (e.sources && e.sources[0] && e.sources[0].date) || '';
  }

  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var needle = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return safe.replace(new RegExp('(' + needle + ')', 'gi'), '<mark>$1</mark>');
    } catch (err) {
      return safe;
    }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------------------------------------------------------------------- */
  /* Bookmarks                                                               */
  /* ---------------------------------------------------------------------- */

  function loadBookmarks() {
    try {
      var raw = localStorage.getItem(BOOKMARK_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      BOOKMARKS = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      BOOKMARKS = [];
    }
  }

  function saveBookmarks() {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(BOOKMARKS)); } catch (err) {}
  }

  function isBookmarked(id) { return BOOKMARKS.indexOf(id) !== -1; }

  function toggleBookmark(id) {
    var i = BOOKMARKS.indexOf(id);
    if (i === -1) BOOKMARKS.push(id); else BOOKMARKS.splice(i, 1);
    saveBookmarks();
    syncBookmarkUI(id);
    if (tab === 'bookmarks') applyFilters();
  }

  function syncBookmarkUI(id) {
    var on = isBookmarked(id);
    var btns = document.querySelectorAll('button[data-action="bookmark"][data-id="' + id + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      btns[i].setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark episode');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Filters                                                                 */
  /* ---------------------------------------------------------------------- */

  function initFilters() {
    var entities = {}, themes = {}, seasons = {};
    EPS.forEach(function (e) {
      (e.entities || []).forEach(function (x) { entities[x] = true; });
      if (e.theme) themes[e.theme] = true;
      if (e.season != null) seasons[e.season] = e.season_name || '';
    });

    Object.keys(themes).sort().forEach(function (t) {
      var o = document.createElement('option');
      o.value = t; o.textContent = t;
      fTheme.appendChild(o);
    });

    Object.keys(entities).sort().forEach(function (x) {
      var o = document.createElement('option');
      o.value = x; o.textContent = x;
      fEntity.appendChild(o);
    });

    Object.keys(seasons).sort(function (a, b) { return a - b; }).forEach(function (s) {
      var o = document.createElement('option');
      o.value = s;
      o.textContent = 'Season ' + s + (seasons[s] ? ' \u00b7 ' + seasons[s] : '');
      fSeason.appendChild(o);
    });
  }

  function applyFilters() {
    var q = qInput.value.trim().toLowerCase();
    var ft = fTheme.value, fe = fEntity.value, fs = fSeason.value;

    filtered = EPS.filter(function (e) {
      if (tab === 'bookmarks' && !isBookmarked(e.id)) return false;
      if (ft && e.theme !== ft) return false;
      if (fe && (e.entities || []).indexOf(fe) === -1) return false;
      if (fs && String(e.season) !== fs) return false;
      if (q) {
        var hay = (e.title + ' ' + e.transcript + ' ' + e.theme + ' ' +
          (e.entities || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    shown = 0;
    listEl.innerHTML = '';
    renderMore();

    if (filtered.length === EPS.length) {
      countEl.textContent = EPS.length.toLocaleString() + ' episodes';
    } else {
      countEl.textContent = filtered.length.toLocaleString() + ' of ' +
        EPS.length.toLocaleString();
    }

    if (filtered.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = tab === 'bookmarks'
        ? 'No bookmarks yet \u2014 tap the star on any episode to save it here.'
        : 'Nothing matches \u2014 try clearing a filter or search term.';
    } else {
      emptyEl.hidden = true;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* List rendering                                                          */
  /* ---------------------------------------------------------------------- */

  function buildRow(e, q) {
    var row = document.createElement('article');
    row.className = 'ep-row';
    row.dataset.id = e.id;

    var main = document.createElement('div');
    main.className = 'ep-main';
    main.innerHTML =
      '<div class="ep-kicker">Episode ' + String(e.n).padStart(2, '0') + ' \u00b7 ' +
        esc(seasonLabel(e)) + '</div>' +
      '<h2 class="ep-title">' + highlight(e.title, q) + '</h2>' +
      '<div class="ep-meta">' +
        '<span>' + esc(episodeDate(e)) + '</span>' +
        '<span class="sep">\u00b7</span>' +
        '<span>' + esc(e.theme) + '</span>' +
        '<span class="sep">\u00b7</span>' +
        '<span>' + fmt(e.duration_sec) + '</span>' +
      '</div>';

    var actions = document.createElement('div');
    actions.className = 'ep-actions';
    actions.innerHTML =
      '<button class="icon-btn bookmark' + (isBookmarked(e.id) ? ' active' : '') +
        '" data-action="bookmark" data-id="' + esc(e.id) + '" aria-pressed="' +
        (isBookmarked(e.id) ? 'true' : 'false') + '" aria-label="Bookmark episode">' +
        ICON_STAR + '</button>' +
      '<button class="icon-btn" data-action="share" data-id="' + esc(e.id) +
        '" aria-label="Share episode">' + ICON_SHARE + '</button>';

    row.appendChild(main);
    row.appendChild(actions);
    return row;
  }

  function renderMore() {
    var q = qInput.value.trim();
    var slice = filtered.slice(shown, shown + PAGE);
    var frag = document.createDocumentFragment();
    slice.forEach(function (e) { frag.appendChild(buildRow(e, q)); });
    listEl.appendChild(frag);
    shown += slice.length;
    moreWrap.hidden = shown >= filtered.length;
  }

  /* ---------------------------------------------------------------------- */
  /* Player                                                                  */
  /* ---------------------------------------------------------------------- */

  function hasDuration() {
    return isFinite(audio.duration) && audio.duration > 0;
  }

  function renderProgress() {
    var d = audio.duration;
    var known = isFinite(d) && d > 0;
    var cur = (dragTarget && known) ? previewFrac * d : (audio.currentTime || 0);
    var frac = known ? Math.max(0, Math.min(1, cur / d)) : 0;
    var pct = (frac * 100) + '%';

    scrubFill.style.width = pct;
    scrubThumb.style.left = pct;
    miniFill.style.width = pct;

    timeReadout.textContent = fmt(known ? cur : 0) + ' / ' + fmt(known ? d : 0);
    miniTime.textContent = fmt(known ? cur : 0);
  }

  function setPlaying(playing) {
    btnPlay.textContent = playing ? '\u23F8' : '\u25B6';
    miniPlay.textContent = playing ? '\u23F8' : '\u25B6';
    btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    miniPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function setupScrubber(el, kind) {
    function fracFrom(ev) {
      var r = el.getBoundingClientRect();
      if (!r.width) return 0;
      return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    }

    el.addEventListener('pointerdown', function (ev) {
      if (!hasDuration()) return;
      dragTarget = kind;
      previewFrac = fracFrom(ev);
      try { el.setPointerCapture(ev.pointerId); } catch (err) {}
      renderProgress();
      ev.preventDefault();
    });

    el.addEventListener('pointermove', function (ev) {
      if (dragTarget !== kind) return;
      previewFrac = fracFrom(ev);
      renderProgress();
      ev.preventDefault();
    });

    function finish(ev) {
      if (dragTarget !== kind) return;
      previewFrac = fracFrom(ev);
      dragTarget = null;
      try { el.releasePointerCapture(ev.pointerId); } catch (err) {}
      if (hasDuration()) audio.currentTime = previewFrac * audio.duration;
      renderProgress();
    }

    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', function (ev) {
      if (dragTarget !== kind) return;
      dragTarget = null;
      try { el.releasePointerCapture(ev.pointerId); } catch (err) {}
      renderProgress();
    });
  }

  function togglePlay() {
    if (!current) return;
    if (audio.paused) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      audio.pause();
    }
  }

  function initPlayer() {
    btnPlay.addEventListener('click', togglePlay);
    miniPlay.addEventListener('click', togglePlay);

    setupScrubber(scrubEl, 'detail');
    setupScrubber(miniScrub, 'mini');

    audio.addEventListener('loadedmetadata', renderProgress);
    audio.addEventListener('durationchange', renderProgress);
    audio.addEventListener('timeupdate', function () {
      if (!dragTarget) renderProgress();
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { setPlaying(false); });
    audio.addEventListener('ended', function () { setPlaying(false); renderProgress(); });
    audio.addEventListener('error', function () {
      if (current) toast('Audio unavailable');
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Mini player                                                             */
  /* ---------------------------------------------------------------------- */

  function showMini() {
    if (!current || !detailEl.hidden) return;
    miniEl.hidden = false;
    document.body.style.paddingBottom = '84px';
  }

  function hideMini() {
    miniEl.hidden = true;
    document.body.style.paddingBottom = '';
  }

  function updateMini() {
    if (!current) return;
    miniTitle.textContent = current.title;
    renderProgress();
  }

  /* ---------------------------------------------------------------------- */
  /* Detail view                                                             */
  /* ---------------------------------------------------------------------- */

  function openDetail(id, opts) {
    var e = EPS.find(function (x) { return x.id === id; });
    if (!e) return;
    opts = opts || {};
    current = e;

    dKicker.textContent = 'Episode ' + String(e.n).padStart(2, '0') + ' \u00b7 ' +
      seasonLabel(e);
    dTitle.textContent = e.title;
    dMeta.innerHTML =
      '<span>' + esc(episodeDate(e)) + '</span>' +
      '<span class="sep">\u00b7</span>' +
      '<span>' + esc(e.theme) + '</span>' +
      '<span class="sep">\u00b7</span>' +
      '<span>' + fmt(e.duration_sec) + '</span>' +
      ((e.entities && e.entities.length)
        ? '<span class="sep">\u00b7</span><span>' + esc(e.entities.join(', ')) + '</span>'
        : '');

    detailBookmark.dataset.id = e.id;
    detailShare.dataset.id = e.id;
    syncBookmarkUI(e.id);

    dTranscript.textContent = e.transcript || '';

    var srcHtml = '<div class="note">An interpretive narration \u2014 not a verbatim channeling.</div>';
    (e.sources || []).forEach(function (s) {
      srcHtml += '<div class="src">After ' + esc(s.entity) +
        (s.session_label ? ' \u00b7 ' + esc(s.session_label) : '') +
        (s.date ? ' \u00b7 ' + esc(s.date) : '') + '</div>';
    });
    dSources.innerHTML = srcHtml;

    var rel = EPS.filter(function (x) { return x.theme === e.theme && x.id !== e.id; }).slice(0, 4);
    if (rel.length) {
      dRelated.innerHTML = '<h3>Related episodes</h3>' + rel.map(function (x) {
        return '<button class="rel" data-id="' + esc(x.id) + '">' +
          '<span class="rel-title">' + esc(x.title) + '</span>' +
          '<span class="rel-meta">' + esc(seasonLabel(x)) + ' \u00b7 ' + fmt(x.duration_sec) + '</span>' +
          '</button>';
      }).join('');
    } else {
      dRelated.innerHTML = '';
    }

    if (audio.dataset.ep !== e.id) {
      audio.dataset.ep = e.id;
      audio.src = e.audio;
      audio.load();
      setPlaying(false);
      renderProgress();
    }

    detailEl.hidden = false;
    document.body.classList.add('no-scroll');
    hideMini();
    updateMini();

    if (!opts.noHistory) {
      try {
        var url = new URL(location.href);
        url.search = '?episode=' + encodeURIComponent(e.id);
        url.hash = '';
        history.pushState({ episode: e.id }, '', url.toString());
      } catch (err) {}
    }

    $('detailScroll').scrollTop = 0;
  }

  function closeDetail(opts) {
    if (detailEl.hidden) return;
    detailEl.hidden = true;
    document.body.classList.remove('no-scroll');
    if (current) showMini();
    opts = opts || {};
    if (!opts.noHistory) {
      try {
        var url = new URL(location.href);
        url.search = '';
        url.hash = '';
        history.pushState({}, '', url.toString());
      } catch (err) {}
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Share                                                                   */
  /* ---------------------------------------------------------------------- */

  function shareEpisode(id) {
    var e = EPS.find(function (x) { return x.id === id; });
    if (!e) return;

    var shareUrl;
    try {
      var url = new URL(location.href);
      url.search = '?episode=' + encodeURIComponent(e.id);
      url.hash = '';
      shareUrl = url.toString();
    } catch (err) {
      shareUrl = '?episode=' + encodeURIComponent(e.id);
    }

    function copyFallback() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(function () {
          toast('Link copied');
        }).catch(function () { toast(shareUrl); });
      } else {
        toast(shareUrl);
      }
    }

    if (navigator.share) {
      navigator.share({
        title: e.title,
        text: 'Voices from the Archive: ' + e.title,
        url: shareUrl
      }).catch(function (err) {
        if (!err || err.name !== 'AbortError') copyFallback();
      });
    } else {
      copyFallback();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Events                                                                  */
  /* ---------------------------------------------------------------------- */

  function initEvents() {
    // Tabs
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tab = btn.dataset.tab;
        document.querySelectorAll('.tab').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        applyFilters();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Search
    qInput.addEventListener('input', debounce(function () {
      qClear.classList.toggle('visible', qInput.value.length > 0);
      applyFilters();
    }, 200));

    qClear.addEventListener('click', function () {
      qInput.value = '';
      qClear.classList.remove('visible');
      applyFilters();
      qInput.focus();
    });

    // Filters
    [fTheme, fEntity, fSeason].forEach(function (sel) {
      sel.addEventListener('change', applyFilters);
    });

    moreBtn.addEventListener('click', renderMore);

    // List delegation
    listEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-action]');
      if (btn) {
        ev.stopPropagation();
        if (btn.dataset.action === 'bookmark') toggleBookmark(btn.dataset.id);
        else if (btn.dataset.action === 'share') shareEpisode(btn.dataset.id);
        return;
      }
      var row = ev.target.closest('.ep-row');
      if (row) openDetail(row.dataset.id);
    });

    // Detail bar
    $('detailBack').addEventListener('click', function () { closeDetail(); });
    detailBookmark.addEventListener('click', function () {
      if (current) toggleBookmark(current.id);
    });
    detailShare.addEventListener('click', function () {
      if (current) shareEpisode(current.id);
    });

    // Related
    dRelated.addEventListener('click', function (ev) {
      var rel = ev.target.closest('.rel');
      if (rel) openDetail(rel.dataset.id);
    });

    // Mini title opens detail
    miniTitle.addEventListener('click', function () {
      if (current) openDetail(current.id);
    });

    // Keyboard
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !detailEl.hidden) closeDetail();
      if (ev.key === '/' && ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'TEXTAREA') {
        ev.preventDefault();
        qInput.focus();
      }
    });

    // Back/forward
    window.addEventListener('popstate', function () {
      var id = new URLSearchParams(location.search).get('episode');
      if (id && EPS.some(function (x) { return x.id === id; })) {
        openDetail(id, { noHistory: true });
      } else {
        closeDetail({ noHistory: true });
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                    */
  /* ---------------------------------------------------------------------- */

  function boot() {
    loadBookmarks();
    initPlayer();
    initEvents();

    fetch('episodes.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        EPS = data;
        initFilters();
        applyFilters();

        var deepId = new URLSearchParams(location.search).get('episode');
        if (deepId && EPS.some(function (x) { return x.id === deepId; })) {
          openDetail(deepId, { noHistory: true });
        }
      })
      .catch(function () {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Could not load episodes.json.';
        countEl.textContent = '';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
