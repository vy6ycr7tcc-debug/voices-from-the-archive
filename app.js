/* ==========================================================================
   Voices from the Archive — app logic
   Vanilla JS, no build step. Loads episodes.json at runtime.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* Icons                                                                   */
  /* ---------------------------------------------------------------------- */

  var ICON_PLAY =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 6.7c0-.8.9-1.3 1.6-.9l8.6 5.3c.7.4.7 1.4 0 1.8l-8.6 5.3c-.7.4-1.6-.1-1.6-.9Z" fill="currentColor" stroke="none"/></svg>';
  var ICON_PAUSE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.4" y="5.2" width="2.8" height="13.6" rx="1.2" fill="currentColor" stroke="none"/><rect x="12.8" y="5.2" width="2.8" height="13.6" rx="1.2" fill="currentColor" stroke="none"/></svg>';
  var ICON_BOOKMARK =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 5.6c0-.9.7-1.6 1.6-1.6h6.4c.9 0 1.6.7 1.6 1.6v14.6c0 .6-.7 1-1.2.6L12 17.6l-3.6 3.2c-.5.4-1.2 0-1.2-.6V5.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  var ICON_SHARE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.4v10.4"/><path d="M8.2 7 12 3.2 15.8 7"/><path d="M6.4 11.8v6.8c0 1.1.9 2 2 2h7.2c1.1 0 2-.9 2-2v-6.8"/></svg>';

  /* Terrain motif for empty states: ridge above, still lake below */
  var MOTIF_RIDGE =
    '<svg viewBox="0 0 240 86" aria-hidden="true">' +
    '<defs><linearGradient id="emptyLake" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#1b1a38"/><stop offset="1" stop-color="#0a0b1f"/>' +
    '</linearGradient></defs>' +
    '<circle cx="176" cy="18" r="5.5" fill="#ffe0bc" opacity="0.85"/>' +
    '<path fill="#232249" d="M0 54 L18 40 L34 50 L58 28 L82 46 L110 32 L136 50 L162 34 L188 48 L214 36 L240 52 L240 58 L0 58 Z"/>' +
    '<rect x="0" y="58" width="240" height="28" fill="url(#emptyLake)"/>' +
    '<g opacity="0.22" transform="translate(0 116) scale(1 -1)">' +
    '<path fill="#2b2a52" d="M0 54 L18 40 L34 50 L58 28 L82 46 L110 32 L136 50 L162 34 L188 48 L214 36 L240 52 L240 58 L0 58 Z"/>' +
    '</g>' +
    '<rect x="150" y="62" width="52" height="1.5" rx="0.75" fill="#e9c37d" opacity="0.52"/>' +
    '<rect x="158" y="70" width="38" height="1.3" rx="0.65" fill="#b8d1ff" opacity="0.30"/>' +
    '</svg>';

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

  /* Live site root. Share links point at the static share page per episode
     (episode/<id>/) which carries Open Graph tags for chat previews and
     redirects humans into the player. */
  var SITE_ROOT = 'https://vy6ycr7tcc-debug.github.io/voices-from-the-archive/';

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
  var tCur = $('tCur');
  var tDur = $('tDur');

  var miniEl = $('mini');
  var miniPlay = $('miniPlay');
  var miniTitle = $('miniTitle');
  var miniTime = $('miniTime');
  var miniScrub = $('miniScrub');
  var miniFill = $('miniFill');
  var miniThumb = $('miniThumb');

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
      emptyEl.innerHTML = MOTIF_RIDGE + '<p>' + (tab === 'bookmarks'
        ? 'No bookmarks yet \u2014 tap the bookmark on any episode to save it here.'
        : 'Nothing matches \u2014 try clearing a filter or search term.') + '</p>';
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
        ICON_BOOKMARK + '</button>' +
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
    slice.forEach(function (e, i) {
      var row = buildRow(e, q);
      row.style.setProperty('--rise-delay', Math.min(i * 55, 660) + 'ms');
      frag.appendChild(row);
    });
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
    miniThumb.style.left = pct;

    tCur.textContent = fmt(known ? cur : 0);
    tDur.textContent = fmt(known ? d : 0);
    miniTime.textContent = fmt(known ? cur : 0);

    var pctRound = String(Math.round(frac * 100));
    scrubEl.setAttribute('aria-valuenow', pctRound);
    miniScrub.setAttribute('aria-valuenow', pctRound);
  }

  function setPlaying(playing) {
    document.body.classList.toggle('audio-playing', playing);
    btnPlay.classList.toggle('playing', playing);
    miniPlay.classList.toggle('playing', playing);
    var icon = playing ? ICON_PAUSE : ICON_PLAY;
    btnPlay.innerHTML = icon;
    miniPlay.innerHTML = icon;
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
      if (hasDuration()) seekTo(previewFrac * audio.duration);
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

  function seekTo(t) {
    audio._wantTime = t;
    audio.currentTime = t;
  }

  function initPlayer() {
    audio.addEventListener('seeked', function () { audio._wantTime = null; });

    // Some static servers (e.g. python http.server) ignore HTTP Range requests,
    // Chromium then reports nothing seekable and currentTime silently no-ops.
    // Fall back to a fully-buffered blob URL so the scrubber always seeks.
    function ensureSeekable() {
      var src = audio.currentSrc;
      if (!src || audio._blobSrc === src) return;
      if (audio.seekable.length && audio.seekable.end(audio.seekable.length - 1) > 0) return;
      var wasPlaying = !audio.paused && !audio.ended;
      fetch(src).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function (b) {
        var url = URL.createObjectURL(b);
        audio._blobSrc = url;
        audio.src = url;
        audio.load();
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          var at = (audio._wantTime != null) ? audio._wantTime : (audio.currentTime || 0);
          audio._wantTime = null;
          try { audio.currentTime = at; } catch (err) {}
          if (wasPlaying) {
            var p = audio.play();
            if (p && p.catch) p.catch(function () {});
          }
          renderProgress();
        });
      }).catch(function () {});
    }

    btnPlay.addEventListener('click', togglePlay);
    miniPlay.addEventListener('click', togglePlay);

    function skip(sec) {
      if (!hasDuration()) return;
      seekTo(Math.max(0,
        Math.min(audio.duration, (audio.currentTime || 0) + sec)));
      renderProgress();
    }

    $('btnSkipBack').addEventListener('click', function () { skip(-15); });
    $('btnSkipFwd').addEventListener('click', function () { skip(15); });
    $('miniBack').addEventListener('click', function () { skip(-15); });
    $('miniFwd').addEventListener('click', function () { skip(15); });

    $('miniClose').addEventListener('click', function () {
      audio.pause();
      hideMini();
    });

    setupScrubber(scrubEl, 'detail');
    setupScrubber(miniScrub, 'mini');

    audio.addEventListener('loadedmetadata', function () {
      renderProgress();
      ensureSeekable();
    });
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
    document.body.style.paddingBottom = (miniEl.offsetHeight + 24) + 'px';
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

    var shareUrl = SITE_ROOT + 'episode/' + encodeURIComponent(e.id) + '/';

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
