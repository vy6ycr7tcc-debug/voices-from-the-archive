(function () {
  'use strict';

  var motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  var root = document.querySelector('.ambient');
  var canvas = root && root.querySelector('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!root || !canvas || !ctx) return;

  var dpr = 1;
  var vw = 0;
  var vh = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = Math.max(1, window.innerWidth);
    vh = Math.max(1, window.innerHeight);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeSprite(r, g, b, alpha) {
    var s = document.createElement('canvas');
    s.width = 64;
    s.height = 64;
    var c = s.getContext('2d');
    var grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')');
    grad.addColorStop(0.4, 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha * 0.4) + ')');
    grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    return s;
  }

  var goldSprite = makeSprite(216, 181, 107, 0.95);
  var blueSprite = makeSprite(176, 136, 70, 0.7);

  var motes = [];

  function seed() {
    var count = Math.max(50, Math.min(120, Math.round((vw * vh) / 15000)));
    motes.length = 0;
    for (var i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * vw,
        y: Math.random() * vh,
        r: 1.0 + Math.random() * 2.5,
        vx: (Math.random() * 2 - 1) * 2.0,
        vy: -(0.5 + Math.random() * 2.0),
        a: 0.1 + Math.random() * 0.3,
        tw: 5 + Math.random() * 10,
        ph: Math.random() * Math.PI * 2,
        gold: Math.random() < 0.6
      });
    }
  }

  var raf = 0;
  var last = 0;

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
    last = ts;

    ctx.clearRect(0, 0, vw, vh);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (m.y < -20) { m.y = vh + 20; m.x = Math.random() * vw; }
      if (m.x < -20) m.x = vw + 20;
      else if (m.x > vw + 20) m.x = -20;

      var tw = 0.6 + 0.4 * Math.sin((ts / 1000) * (Math.PI * 2 / m.tw) + m.ph);
      ctx.globalAlpha = m.a * tw;
      var rad = m.r * 4;
      ctx.drawImage(m.gold ? goldSprite : blueSprite,
        m.x - rad, m.y - rad, rad * 2, rad * 2);
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (raf || (motionQuery && motionQuery.matches)) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
    ctx.clearRect(0, 0, vw, vh);
  }

  var queued = false;
  var hero = document.querySelector('.hero-content');

  function parallax() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      if (motionQuery && motionQuery.matches) return;
      var y = Math.min(window.scrollY || window.pageYOffset || 0, 300);
      if (hero) hero.style.transform = 'translateY(' + (y * 0.15).toFixed(2) + 'px)';
    });
  }

  function syncMotionPref() {
    if (motionQuery && motionQuery.matches) {
      stop();
      if (hero) hero.style.transform = 'translateY(0)';
    } else {
      start();
    }
  }

  resize();
  seed();
  syncMotionPref();

  window.addEventListener('resize', function () {
    resize();
    seed();
  });

  window.addEventListener('scroll', parallax, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else syncMotionPref();
  });

  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', syncMotionPref);
    else if (motionQuery.addListener) motionQuery.addListener(syncMotionPref);
  }
})();
