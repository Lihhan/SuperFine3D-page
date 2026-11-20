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
