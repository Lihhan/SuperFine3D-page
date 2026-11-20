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
    const hit = e.target.closest('.zoomable img, .zoomable.pane');
    if (!hit || e.target.closest('[data-dragged]')) return;
    const im = hit.tagName === 'IMG' ? hit : $('img', hit);
    openLb(im.currentSrc || im.src, im.alt);
  });
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });

  // ---------- interactive comparison: details (default) and whole-object turntable
  const ASSETS = [
    { key: 'g03', slug: 'nautilus', name: 'Clockwork nautilus' },
    { key: 'g08', slug: 'pangolin', name: 'Ceremonial pangolin' },
    { key: 'g04', slug: 'owl', name: 'Armoured owl' },
    { key: 'g06', slug: 'beetle', name: 'Armoured stag beetle' },
  ];
  // region of each close-up on the input image (x0, y0, x1, y1 as fractions), located in the video's own input thumbnail
  const BOXES = {
    nautilus: [[0.23, 0.22, 0.55, 0.41], [0.27, 0.43, 0.555, 0.59], [0.47, 0.21, 0.78, 0.4]],
    pangolin: [[0.45, 0.14, 0.67, 0.28], [0.13, 0.81, 0.41, 0.98], [0.74, 0.35, 0.94, 0.47]],
    owl: [[0.545, 0.07, 0.86, 0.25], [0.49, 0.14, 0.835, 0.43], [0.45, 0.14, 0.835, 0.72]],
    beetle: [[0.43, 0.32, 0.74, 0.505], [0.335, 0.63, 0.6, 0.785], [0.11, 0.24, 0.43, 0.42]],
  };
  const BASES = [
    { key: 'trellis2', name: 'TRELLIS.2', res: '1536³' },
    { key: 'hunyuan21', name: 'Hunyuan3D-2.1', res: '1024³' },
    { key: 'pixal3d', name: 'Pixal3D', res: '1536³' },
    { key: 'ultrashape', name: 'UltraShape', res: '4096³' },
  ];
  const tabs = (root, items, cur, on, fmt = (x) => x.name) => {
    root.innerHTML = items.map((x, i) => `<button role="tab" class="${i === cur ? 'active' : ''}">${fmt(x, i)}</button>`).join('');
    $$('button', root).forEach((b, i) => b.addEventListener('click', () => {
      $$('button', root).forEach((x, j) => x.classList.toggle('active', i === j)); on(i);
    }));
  };
  // ping-pong autoplay shared by both views; runs only while the section is on screen and the view is shown
  const loop = (state, n, render, icon, btn, ms) => {
    state.set = (p) => {
      state.playing = p; icon.setAttribute('d', p ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z');
      btn.setAttribute('aria-label', p ? 'Pause' : 'Play'); clearInterval(state.timer); state.timer = null;
      if (p && state.visible) state.timer = setInterval(() => {
        if (state.idx + state.dir < 0 || state.idx + state.dir >= n) state.dir *= -1;
        state.idx += state.dir; render();
      }, ms);
    };
    btn.addEventListener('click', () => state.set(!state.playing));
  };
  const dragTo = (root, state, n, render, gain) => {
    let drag = null;
    root.addEventListener('pointerdown', (e) => {
      const p = e.target.closest('.pane'); if (!p) return;
      drag = { x: e.clientX, idx: state.idx, w: p.clientWidth, moved: false };
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) > 4) { drag.moved = true; state.set(false); }
      if (!drag.moved) return;
      const k = Math.max(0, Math.min(n - 1, drag.idx + Math.round(((e.clientX - drag.x) / drag.w) * n * gain)));
      if (k !== state.idx) { state.idx = k; render(); }
    });
    const end = () => {
      if (drag && drag.moved) { root.dataset.dragged = '1'; setTimeout(() => { delete root.dataset.dragged; }, 0); }
      drag = null;
    };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  };
  const cmp = $('#cmp');
  if (cmp) {
    const st = { asset: 0, view: 'detail', onScreen: false };
    // ----- detail view
    const NV = 9, dv = { detail: 0, idx: 4, dir: 1, playing: !reduced, timer: null, visible: false };
    $('#dvBases').innerHTML = BASES.map((b) => `<div class="pane zoomable" data-m="${b.key}"><img alt="${b.name}" draggable="false"><span class="tag">${b.name} <small>${b.res}</small></span></div>`).join('');
    const dsrc = (m, i) => `static/detail/${ASSETS[st.asset].slug}/d${dv.detail}_${m}_${i}.webp`;
    const dPre = new Set();
    const dPreload = () => {
      const k = ASSETS[st.asset].slug + dv.detail; if (dPre.has(k)) return; dPre.add(k);
      ['ours', ...BASES.map((b) => b.key)].forEach((m) => { for (let i = 0; i < NV; i++) { const im = new Image(); im.src = dsrc(m, i); } });
    };
    const dRender = () => {
      $$('#dvView .dv-right .pane').forEach((p) => { $('img', p).src = dsrc(p.dataset.m, dv.idx); });
      $('#dvSlider').value = dv.idx;
      const v = -6 + 1.5 * dv.idx; $('#dvAngle').textContent = (v > 0 ? '+' : '') + v + '°';
    };
    const dSetDetail = () => {
      const a = ASSETS[st.asset].slug, b = BOXES[a][dv.detail], box = $('#dvBox');
      box.style.left = b[0] * 100 + '%'; box.style.top = b[1] * 100 + '%';
      box.style.width = (b[2] - b[0]) * 100 + '%'; box.style.height = (b[3] - b[1]) * 100 + '%';
      $('#dvCrop').src = `static/detail/${a}/d${dv.detail}_input.webp`;
      dPreload(); dRender();
    };
    const dSetAsset = () => {
      const a = ASSETS[st.asset];
      $('#dvInput').src = `static/detail/${a.slug}/input.webp`; $('#dvInput').alt = `Input image: ${a.name}`;
      dv.detail = 0;
      tabs($('#dvTabs'), [0, 1, 2], 0, (i) => { dv.detail = i; dSetDetail(); }, (x, i) => `Region ${i + 1}`);
      dSetDetail();
    };
    loop(dv, NV, dRender, $('#dvPlayIcon'), $('#dvPlay'), 160);
    $('#dvSlider').addEventListener('input', () => { dv.set(false); dv.idx = +$('#dvSlider').value; dRender(); });
    dragTo($('#dvView'), dv, NV, dRender, 1.5);
    $('.dv-input').addEventListener('click', () => { $$('#dvTabs button')[(dv.detail + 1) % 3].click(); });

    // ----- whole-object view (turntable)
    const NT = 25, ANG = (i) => -48 + 4 * i;
    const METHODS = [...BASES, { key: 'all', name: 'All methods' }];
    const tt = { method: 0, idx: 12, dir: 1, playing: !reduced, timer: null, visible: false };
    const panes = $('#ttPanes');
    const tsrc = (m, i) => `static/orbit/${ASSETS[st.asset].key}/${m}_${String(i).padStart(2, '0')}.webp`;
    const tPre = new Set();
    const tPreload = (m) => { const k = st.asset + m; if (tPre.has(k)) return; tPre.add(k); for (let i = 0; i < NT; i++) { const im = new Image(); im.src = tsrc(m, i); } };
    const shown = () => (METHODS[tt.method].key === 'all' ? ['ours', ...BASES.map((b) => b.key)] : ['ours', METHODS[tt.method].key]);
    const label = (m) => {
      if (m === 'ours') return 'SuperFine3D <small>4096³ · ours</small>';
      const d = BASES.find((x) => x.key === m); return `${d.name} <small>${d.res}</small>`;
    };
    const tRender = () => {
      $$('.pane', panes).forEach((p) => { $('img', p).src = tsrc(p.dataset.m, tt.idx); });
      $('#ttSlider').value = tt.idx;
      const v = ANG(tt.idx); $('#ttAngle').textContent = (v > 0 ? '+' : '') + v + '°';
    };
    const tBuild = () => {
      const ms = shown();
      panes.classList.toggle('all', ms.length > 2);
      panes.innerHTML = ms.map((m) => `<div class="pane${m === 'ours' ? ' is-ours' : ''}" data-m="${m}"><img alt="${m}" draggable="false"><span class="tag">${label(m)}</span></div>`).join('');
      if (st.view === 'whole') ms.forEach(tPreload);
      $('#ttInput').src = `static/detail/${ASSETS[st.asset].slug}/input.webp`;
      tRender();
    };
    tabs($('#ttView .method-tabs'), METHODS, 0, (i) => { tt.method = i; tBuild(); });
    loop(tt, NT, tRender, $('#ttPlayIcon'), $('#ttPlay'), 110);
    $('#ttSlider').addEventListener('input', () => { tt.set(false); tt.idx = +$('#ttSlider').value; tRender(); });
    dragTo(panes, tt, NT, tRender, 1.2);

    // ----- shared controls
    const refresh = () => {
      dv.visible = st.onScreen && st.view === 'detail'; tt.visible = st.onScreen && st.view === 'whole';
      dv.set(dv.playing); tt.set(tt.playing);
    };
    tabs($('#cmpAssets'), ASSETS, 0, (i) => { st.asset = i; dSetAsset(); tBuild(); });
    $$('.view-tabs button', cmp).forEach((b) => b.addEventListener('click', () => {
      $$('.view-tabs button', cmp).forEach((x) => x.classList.toggle('active', x === b));
      st.view = b.dataset.view;
      const whole = st.view === 'whole';
      $('#dvView').hidden = whole; $('#dvControls').hidden = whole; $('#ttView').hidden = !whole;
      if (whole) tBuild();
      refresh();
    }));
    dSetAsset(); tBuild();
    new IntersectionObserver((en) => { st.onScreen = en[0].isIntersecting; refresh(); }, { threshold: 0.2 }).observe(cmp);
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
