#!/usr/bin/env node
/* ==========================================================================
   Voices from the Archive — static share page generator
   One tiny page per episode at episode/<id>/index.html. Each carries
   per-episode Open Graph / Twitter Card tags so chat apps render a rich
   preview, then redirects real browsers straight into the player at
   /?episode=<id>. Run once and commit the output:

       npm run gen:episodes
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://vy6ycr7tcc-debug.github.io/voices-from-the-archive/';
const EPISODES = path.join(ROOT, 'episodes.json');
const OUT_DIR = path.join(ROOT, 'episode');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function plain(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function trimTo(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[\s,;:.—-]+$/, '') + '\u2026';
}

function kicker(e) {
  return 'Episode ' + String(e.n).padStart(2, '0') + ' \u00b7 Season ' + e.season +
    (e.season_name ? ' \u00b7 ' + e.season_name : '');
}

function description(e) {
  const opening = trimTo(plain(String(e.transcript || '').split(/\n{2,}/)[0]), 150);
  return opening ? kicker(e) + ' \u2014 ' + opening : kicker(e);
}

function page(e) {
  const appUrl = SITE + '?episode=' + encodeURIComponent(e.id);
  const selfUrl = SITE + 'episode/' + encodeURIComponent(e.id) + '/';
  const ogImage = SITE + 'og-share.jpg';
  const ogTitle = e.title + ' \u2014 Voices from the Archive';
  const ogDesc = description(e);

  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="theme-color" content="#0A0B1F">\n' +
    '<meta name="description" content="' + esc(ogDesc) + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:site_name" content="Voices from the Archive">\n' +
    '<meta property="og:title" content="' + esc(ogTitle) + '">\n' +
    '<meta property="og:description" content="' + esc(ogDesc) + '">\n' +
    '<meta property="og:image" content="' + ogImage + '">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta property="og:url" content="' + selfUrl + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + esc(ogTitle) + '">\n' +
    '<meta name="twitter:description" content="' + esc(ogDesc) + '">\n' +
    '<meta name="twitter:image" content="' + ogImage + '">\n' +
    '<title>' + esc(ogTitle) + '</title>\n' +
    '<link rel="canonical" href="' + selfUrl + '">\n' +
    '<script>location.replace(' + JSON.stringify(appUrl) + ');</script>\n' +
    '<noscript><meta http-equiv="refresh" content="0;url=' + appUrl + '"></noscript>\n' +
    '</head>\n' +
    '<body><a href="' + appUrl + '">Continue to \u201c' + esc(e.title) + '\u201d</a></body>\n' +
    '</html>\n';
}

function main() {
  const eps = JSON.parse(fs.readFileSync(EPISODES, 'utf8'));
  if (!Array.isArray(eps) || !eps.length) throw new Error('episodes.json is empty');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  let written = 0;
  for (const e of eps) {
    const id = String(e.id || '');
    if (!/^[A-Za-z0-9._-]+$/.test(id)) {
      console.warn('skipping unsafe id: ' + id);
      continue;
    }
    const dir = path.join(OUT_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page(e), 'utf8');
    written++;
  }
  console.log('generated ' + written + ' share pages under episode/');
}

main();
