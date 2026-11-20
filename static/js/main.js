(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- nav background on scroll
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- reveal on scroll + count-up + bars
  const countUp = (el) => {
    const to = parseFloat(el.dataset.to), dec = parseInt(el.dataset.dec || '0', 10);
    if (reduced) { el.textContent = to.toFixed(dec); return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toFixed(dec);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      $$('.count', en.target).forEach(countUp);
      $$('.bar', en.target).forEach((b) => { b.style.width = b.dataset.w + '%'; });
      io.unobserve(en.target);
    });
  }, { threshold: 0.15 });
  $$('.reveal').forEach((el) => io.observe(el));

  // ---------- hero example switch
  const hv = $('#heroVideo'), hi = $('#heroInput');
  $$('.stage-switch button').forEach((b) => b.addEventListener('click', () => {
    $$('.stage-switch button').forEach((x) => x.classList.toggle('active', x === b));
    hv.style.opacity = 0; hi.style.opacity = 0;
    setTimeout(() => {
      hv.src = b.dataset.video; hi.src = b.dataset.input;
      hv.play().catch(() => {});
      hv.style.opacity = 1; hi.style.opacity = 1;
    }, 250);
  }));

  // ---------- lightbox
  const lb = $('#lightbox'), lbImg = $('img', lb);
  const openLb = (src, alt) => { lbImg.src = src; lbImg.alt = alt || ''; lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); };
  const closeLb = () => { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); };
  document.addEventListener('click', (e) => {
    const img = e.target.closest('.zoomable img');
    if (img) openLb(img.currentSrc || img.src, img.alt);
  });
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });

  // ---------- interactive turntable
  const ASSETS = [
    { key: 'g03', name: 'Clockwork nautilus' },
    { key: 'g08', name: 'Ceremonial pangolin' },
    { key: 'g04', name: 'Armoured owl' },
    { key: 'g06', name: 'Armoured stag beetle' },
  ];
  const METHODS = [
    { key: 'trellis2', name: 'TRELLIS.2', res: '1536³' },
    { key: 'hunyuan21', name: 'Hunyuan3D-2.1', res: '1024³' },
    { key: 'pixal3d', name: 'Pixal3D', res: '1536³' },
    { key: 'ultrashape', name: 'UltraShape', res: '4096³' },
    { key: 'all', name: 'All methods' },
  ];
  const N = 25, ANG = (i) => -48 + 4 * i;
  const tt = { asset: 0, method: 0, idx: 12, playing: !reduced, dir: 1, timer: null };
  const panes = $('#ttPanes'), slider = $('#ttSlider'), angleEl = $('#ttAngle'), input = $('#ttInput');
  const src = (a, m, i) => `static/orbit/${a}/${m}_${String(i).padStart(2, '0')}.webp`;
  const cache = new Map();
  const preload = (a, m) => {
    const k = a + '/' + m; if (cache.has(k)) return; cache.set(k, true);
    for (let i = 0; i < N; i++) { const im = new Image(); im.src = src(a, m, i); }
  };
  const shown = () => (METHODS[tt.method].key === 'all' ? ['ours', 'trellis2', 'hunyuan21', 'pixal3d', 'ultrashape'] : ['ours', METHODS[tt.method].key]);
  const label = (m) => {
    if (m === 'ours') return 'SuperFine3D <small>4096³ · ours</small>';
    const d = METHODS.find((x) => x.key === m); return `${d.name} <small>${d.res}</small>`;
  };
  const buildPanes = () => {
    const ms = shown(), a = ASSETS[tt.asset].key;
    panes.classList.toggle('all', ms.length > 2);
    panes.innerHTML = ms.map((m) => `<div class="pane${m === 'ours' ? ' is-ours' : ''}" data-m="${m}"><img alt="${m}" draggable="false"><span class="tag">${label(m)}</span></div>`).join('');
    ms.forEach((m) => preload(a, m));
    input.src = `static/orbit/${a}/input.webp`;
    input.alt = `Input image: ${ASSETS[tt.asset].name}`;
    render();
  };
  const render = () => {
    const a = ASSETS[tt.asset].key;
    $$('.pane', panes).forEach((p) => { $('img', p).src = src(a, p.dataset.m, tt.idx); });
    slider.value = tt.idx;
    const v = ANG(tt.idx); angleEl.textContent = (v > 0 ? '+' : '') + v + '°';
  };
  const tabs = (root, items, cur, on) => {
    root.innerHTML = items.map((x, i) => `<button role="tab" class="${i === cur ? 'active' : ''}">${x.name}</button>`).join('');
    $$('button', root).forEach((b, i) => b.addEventListener('click', () => {
      $$('button', root).forEach((x, j) => x.classList.toggle('active', i === j)); on(i);
    }));
  };
  const playIcon = $('#ttPlayIcon');
  const setPlaying = (p) => {
    tt.playing = p;
    playIcon.setAttribute('d', p ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z');
    $('#ttPlay').setAttribute('aria-label', p ? 'Pause rotation' : 'Play rotation');
    clearInterval(tt.timer);
    if (p) tt.timer = setInterval(() => {
      if (tt.idx + tt.dir < 0 || tt.idx + tt.dir >= N) tt.dir *= -1;
      tt.idx += tt.dir; render();
    }, 110);
  };
  if (panes) {
    tabs($('.asset-tabs'), ASSETS, 0, (i) => { tt.asset = i; buildPanes(); });
    tabs($('.method-tabs'), METHODS, 0, (i) => { tt.method = i; buildPanes(); });
    slider.addEventListener('input', () => { setPlaying(false); tt.idx = +slider.value; render(); });
    $('#ttPlay').addEventListener('click', () => setPlaying(!tt.playing));
    let drag = null;
    panes.addEventListener('pointerdown', (e) => {
      const p = e.target.closest('.pane'); if (!p) return;
      drag = { x: e.clientX, idx: tt.idx, w: p.clientWidth }; setPlaying(false);
      p.setPointerCapture(e.pointerId);
    });
    panes.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const d = Math.round(((e.clientX - drag.x) / drag.w) * N * 1.2);
      const k = Math.max(0, Math.min(N - 1, drag.idx + d));
      if (k !== tt.idx) { tt.idx = k; render(); }
    });
    const end = () => { drag = null; };
    panes.addEventListener('pointerup', end); panes.addEventListener('pointercancel', end);
    buildPanes();
    // preload the other assets' "ours" frames lazily, start rotating once visible
    const vis = new IntersectionObserver((en) => {
      if (en[0].isIntersecting) {
        if (tt.playing && !tt.timer) setPlaying(true);
        ASSETS.forEach((a) => preload(a.key, 'ours'));
      } else if (tt.timer) { clearInterval(tt.timer); tt.timer = null; }
    }, { threshold: 0.2 });
    vis.observe($('#turntable'));
  }

  // ---------- close-up gallery
  const CLOSE = [
    { name: 'Clockwork nautilus', src: 'static/img/closeup_nautilus.webp' },
    { name: 'Ceremonial pangolin', src: 'static/img/closeup_pangolin.webp' },
    { name: 'Armoured owl', src: 'static/img/closeup_owl.webp' },
    { name: 'Armoured stag beetle', src: 'static/img/closeup_beetle.webp' },
  ];
  const gal = $('#closeups');
  if (gal) {
    const gimg = $('.gallery-view img', gal);
    const show = (i) => { gimg.style.opacity = 0; setTimeout(() => { gimg.src = CLOSE[i].src; gimg.alt = `Close-up comparison: ${CLOSE[i].name}`; gimg.style.opacity = 1; }, 180); };
    tabs($('.gallery-tabs', gal), CLOSE, 0, show);
    gimg.src = CLOSE[0].src; gimg.alt = `Close-up comparison: ${CLOSE[0].name}`;
  }

  // ---------- latency charts (log scale)
  const DATA = {
    AttnFull: [[143440, 475.8], [230786, 1238.82], [307193, 2199.68], [403109, 3801.81], [441897, 4587.46], [456422, 4889.75], [602807, 8778.97], [708592, 12256.57]],
    AttnOurs: [[143440, 4.31], [230786, 7.21], [307193, 11.15], [403109, 13.72], [441897, 15.41], [456422, 14.93], [602807, 18.48], [708592, 23.34]],
    Official: [[143440, 570.9], [230786, 1402.57], [307193, 2465.62], [403109, 4203.51], [441897, 5037.58], [456422, 5354.57], [602807, 9334.76], [708592, 12957.92]],
    Ours: [[143440, 85.13], [230786, 139.09], [307193, 192.08], [403109, 255.25], [441897, 280.35], [456422, 287.21], [602807, 382.41], [708592, 458.29]],
  };
  const fmtMs = (v) => (v >= 1000 ? (v / 1000).toFixed(2) + ' s' : (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' ms');
  const chart = (el, title, sub, big, series) => {
    if (!el) return;
    const W = 560, H = 300, m = { l: 52, r: 18, t: 16, b: 36 };
    const xs = [100000, 750000], ys = [2, 30000];
    const X = (x) => m.l + ((x - xs[0]) / (xs[1] - xs[0])) * (W - m.l - m.r);
    const Y = (y) => m.t + (1 - (Math.log10(y) - Math.log10(ys[0])) / (Math.log10(ys[1]) - Math.log10(ys[0]))) * (H - m.t - m.b);
    const yt = [10, 100, 1000, 10000], xt = [200000, 300000, 400000, 500000, 600000, 700000];
    let g = `<g class="grid">${yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>`;
    g += `<g class="axis">${yt.map((v) => `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v >= 1000 ? v / 1000 + ' s' : v + ' ms'}</text>`).join('')}`;
    g += xt.map((v) => `<text x="${X(v)}" y="${H - 12}" text-anchor="middle">${v / 1000}k</text>`).join('') + `</g>`;
    series.forEach((s) => {
      const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
      const len = 1200;
      g += `<g class="series"><path d="${d}" stroke="${s.color}" stroke-dasharray="${len}" stroke-dashoffset="${len}" style="transition:stroke-dashoffset 1.6s ease"/>`;
      g += s.pts.map((p) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.6" fill="${s.color}"/>`).join('');
      const last = s.pts[s.pts.length - 1];
      g += `<text x="${X(last[0]) - 6}" y="${Y(last[1]) - 10}" text-anchor="end" fill="${s.color}" font-size="12" font-weight="600">${fmtMs(last[1])}</text></g>`;
    });
    g += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3" opacity="0"/>`;
    el.innerHTML = `<h3>${title}</h3><div class="sub">${sub}</div><div class="big"><b>${big}</b><span>faster at 708k tokens</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: latency vs high-resolution tokens">${g}</svg>
      <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div><div class="tip"></div>`;
    const svg = $('svg', el), tip = $('.tip', el), cross = $('.cross', svg);
    const reveal = new IntersectionObserver((en) => {
      if (en[0].isIntersecting) { $$('.series path', svg).forEach((p) => { p.style.strokeDashoffset = 0; }); reveal.disconnect(); }
    }, { threshold: 0.3 });
    reveal.observe(el);
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * W;
      const pts = series[0].pts; let k = 0;
      pts.forEach((p, i) => { if (Math.abs(X(p[0]) - sx) < Math.abs(X(pts[k][0]) - sx)) k = i; });
      const x = X(pts[k][0]);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 1);
      tip.innerHTML = `<b>${(pts[k][0] / 1000).toFixed(0)}k tokens</b><br>` + series.map((s) => `<span style="color:${s.color}">●</span> ${s.name}: <b>${fmtMs(s.pts[k][1])}</b>`).join('<br>') +
        `<br><span style="color:var(--ours-2)">${(series[0].pts[k][1] / series[1].pts[k][1]).toFixed(0)}× faster</span>`;
      const er = el.getBoundingClientRect();
      tip.style.left = Math.min(er.width - 190, Math.max(8, (x / W) * r.width + (r.left - er.left) + 12)) + 'px';
      tip.style.top = (r.top - er.top + 30) + 'px'; tip.style.opacity = 1;
    });
    svg.addEventListener('pointerleave', () => { tip.style.opacity = 0; cross.setAttribute('opacity', 0); });
  };
  chart($('#chartAttn'), 'One attention layer', 'Full self-attention (FlashAttention-2) vs. spatial-cell attention', '525×',
    [{ name: 'Full attention', color: '#6d93ff', pts: DATA.AttnFull }, { name: 'Ours', color: '#ff9a4a', pts: DATA.AttnOurs }]);
  chart($('#chartBlock'), 'One DiT block', 'TRELLIS.2 block (full attention) vs. ours with fused kernels', '28×',
    [{ name: 'TRELLIS.2 block', color: '#6d93ff', pts: DATA.Official }, { name: 'Ours', color: '#ff9a4a', pts: DATA.Ours }]);

  // ---------- bibtex copy
  const cb = $('#copyBib');
  if (cb) cb.addEventListener('click', () => {
    navigator.clipboard.writeText($('#bibText').textContent).then(() => {
      cb.textContent = 'Copied'; setTimeout(() => { cb.textContent = 'Copy'; }, 1500);
    }).catch(() => {});
  });
})();
