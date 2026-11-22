// Interactive comparison for the hero: by default the input image | SuperFine3D slider; 3D: SuperFine3D next to a chosen method, one shared camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const root = document.getElementById('v3d');
if (root) init(root);

function init(root) {
  const MODEL_V = '20261121a';   // bump when the model files change (cache busting)
  const OBJECTS = [
    { slug: 'pangolin', name: 'Ceremonial pangolin', input: 'static/models/pangolin/input.webp', ab: true },
    { slug: 'nautilus', name: 'Clockwork nautilus', input: 'static/models/nautilus/input.webp', ab: true },
    { slug: 'owl', name: 'Armoured owl', input: 'static/models/owl/input.webp', ab: true, abOnly: true },               // slider only (no 3D files)
    { slug: 'helmet', name: 'Octopus diving helmet', input: 'static/models/helmet/input.webp', ab: true, abOnly: true },
  ];
  const canvas = root.querySelector('canvas');
  const ui = {
    objects: root.querySelector('.v3d-objects'), compare: document.querySelector('.v3d-compare'), hot: root.querySelector('.v3d-hot'),
    labelA: root.querySelector('.v3d-label-a'), labelB: root.querySelector('.v3d-label-b'), divider: root.querySelector('.v3d-divider'),
    back: root.querySelector('.v3d-back'), status: root.querySelector('.v3d-status'), bar: root.querySelector('.v3d-bar i'),
    input: root.querySelector('.v3d-input img'), full: root.querySelector('.v3d-full'), hint: document.querySelector('.v3d-hint'),
    inputBtn: root.querySelector('.v3d-input'), ab: root.querySelector('.v3d-ab'), abR: root.querySelector('.v3d-ab-r img'), abP: root.querySelector('.v3d-ab-p img'),
    abPL: root.querySelector('.v3d-ab-p'), abLine: root.querySelector('.v3d-ab-line'), abTagP: root.querySelector('.v3d-ab-tag-p'), abTagR: root.querySelector('.v3d-ab-tag-r'),
  };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setScissorTest(true);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.9;
  controls.minDistance = 0.04; controls.maxDistance = 9;
  const makeScene = () => {
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xdfe6f5, 0x1d1a18, 0.55));
    const k = new THREE.DirectionalLight(0xfff3e6, 3.1); k.name = 'key'; s.add(k); s.add(k.target);
    const fill = new THREE.DirectionalLight(0xb9c8ff, 0.5); fill.name = 'fill'; s.add(fill); s.add(fill.target);
    const rim = new THREE.DirectionalLight(0xcfd9ff, 0.9); rim.name = 'rim'; s.add(rim); s.add(rim.target);
    return s;
  };
  const scenes = [makeScene(), makeScene()];
  // face normals from screen-space derivatives: always facing the viewer, independent of triangle winding (as in the video renders)
  const material = new THREE.MeshStandardMaterial({ color: 0xe2ded6, roughness: 0.62, metalness: 0.0, flatShading: true, side: THREE.DoubleSide });
  const cache = new Map();
  const st = { obj: 0, cmp: 0, scene: null, hot: -1, meshes: [null, null], token: 0, ab: false };

  // ---------- geometry loading (SF3D: quantized positions + delta-coded indices, gzip)
  async function fetchMesh(url, onProgress) {
    if (cache.has(url)) return cache.get(url);
    const p = (async () => {
      const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
      const total = +res.headers.get('content-length') || 0; const reader = res.body.getReader(); const chunks = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (total && onProgress) onProgress(got / total); }
      let buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'SF3D') throw new Error('bad mesh ' + url);
      const nV = dv.getUint32(4, true), nF = dv.getUint32(8, true), lo = [0, 1, 2].map((i) => dv.getFloat32(12 + 4 * i, true)), hi = [0, 1, 2].map((i) => dv.getFloat32(24 + 4 * i, true));
      const q = new Uint16Array(buf.slice(36, 36 + 6 * nV).buffer), pos = new Float32Array(3 * nV);
      for (let i = 0; i < 3 * nV; i++) { const a = i % 3; pos[i] = lo[a] + (q[i] / 65535) * (hi[a] - lo[a]); }
      const d = new Int32Array(buf.slice(36 + 6 * nV, 36 + 6 * nV + 12 * nF).buffer), idx = new Uint32Array(3 * nF); let acc = 0;
      for (let i = 0; i < 3 * nF; i++) { acc += d[i]; idx[i] = acc; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere(); g.userData.faces = nF; return g;
    })();
    cache.set(url, p); p.catch(() => cache.delete(url)); return p;
  }
  const fmtFaces = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : Math.round(n / 1e3) + 'k');
  function setStatus(text, frac) { ui.status.textContent = text || ''; root.classList.toggle('loading', frac !== null && frac !== undefined && frac < 1); ui.bar.style.width = ((frac || 0) * 100) + '%'; }

  // ---------- scene switching
  async function loadObject(i, opts = {}) {
    const prevKey = !st.ab && st.cmp && st.scene ? st.scene.methods[st.cmp].key : null;   // keep a chosen baseline across objects
    st.obj = i; st.hot = -1; st.cmp = 0; const tok = ++st.token; const o = OBJECTS[i];
    ui.input.src = o.input; ui.input.alt = 'Input image: ' + o.name; ui.back.hidden = true; root.classList.remove('in-hot');
    if (o.abOnly) {   // input image | 3D slider only: no scene, no meshes
      st.scene = { slug: o.slug, methods: [{ key: 'ours', name: 'SuperFine3D', res: '4096³' }], hotspots: [], files: {} };
      st.ab = true; buildCompareTabs(); buildHotspots(); setAB(true, opts); setStatus('', null); root.classList.remove('split'); return;
    }
    setStatus('Loading ' + o.name + '…', 0.02);
    st.scene = await (await fetch(`static/models/${o.slug}/scene.json?v=${MODEL_V}`)).json(); if (tok !== st.token) return;
    const ci = st.scene.methods.findIndex((m) => m.key === (opts.cmp || prevKey)); if (ci > 0) st.cmp = ci;   // deep link: ?obj=owl&cmp=trellis2&hot=1
    const hi = st.scene.hotspots.findIndex((h) => h.label === opts.hot);
    st.ab = !!o.ab && (opts.cmp === 'input' || (ci <= 0 && hi < 0));   // default view: the input image | 3D slider (?cut=0.3&zoom=3&at=0.5,0.2)
    buildCompareTabs(); buildHotspots(); resetView(false);
    setAB(st.ab, opts);
    if (hi >= 0) {
      st.hot = hi; const h = st.scene.hotspots[hi]; ui.back.hidden = false; root.classList.add('in-hot');
      camera.position.set(...h.view); controls.target.set(...h.p); controls.update();
    }
    if (st.ab) { setStatus('', null); root.classList.remove('split'); return; }   // meshes are loaded when a 3D comparison is chosen
    await showMeshes(tok);
  }
  function file(name) { const f = st.scene.files[name]; return f ? `static/models/${st.scene.slug}/${name}.bin.gz?v=${MODEL_V}` : null; }
  async function showMeshes(tok) {
    const part = st.hot < 0 ? 'whole' : 'h' + st.hot;
    const keys = ['ours', st.cmp ? st.scene.methods[st.cmp].key : null];
    const urls = keys.map((k) => (k ? file(`${part}_${k}`) : null));
    const loads = urls.map((u, j) => (u ? fetchMesh(u, (f) => { if (j === 0 || !urls[0]) setStatus(null, f); }) : Promise.resolve(null)));
    if (urls.some((u) => u && !cache.has(u))) setStatus('Loading geometry…', 0.05);
    let geos;
    try { geos = await Promise.all(loads); } catch (e) { setStatus('Could not load the model.', null); console.error(e); return; }
    if (tok !== st.token) return;
    geos.forEach((g, j) => {
      const sc = scenes[j]; if (st.meshes[j]) { sc.remove(st.meshes[j]); st.meshes[j] = null; }
      if (g) { const m = new THREE.Mesh(g, material); sc.add(m); st.meshes[j] = m; }
    });
    const m0 = st.scene.methods[0], m1 = st.scene.methods[st.cmp]; const res = (m) => (m.name.includes(m.res) ? '' : ' ' + m.res);
    const fa = st.scene.files[`${part}_ours`], fb = st.cmp ? st.scene.files[`${part}_${m1.key}`] : null;
    ui.labelA.innerHTML = `<b>${m0.name}</b>${res(m0)}` + (st.hot >= 0 ? ` <small>${fmtFaces(fa.faces_full)} faces here</small>` : '');
    ui.labelB.innerHTML = st.cmp ? `<b>${m1.name}</b>${res(m1)}` + (st.hot >= 0 && fb ? ` <small>${fmtFaces(fb.faces_full)} faces here</small>` : '') : '';
    root.classList.toggle('split', !!st.cmp);
    setStatus(st.hot >= 0 ? 'Full-resolution geometry of region ' + st.scene.hotspots[st.hot].label : '', null);
    layout();
  }
  function buildCompareTabs() {
    const ms = st.scene.methods, btn = (i, label) => `<button data-i="${i}">${label}</button>`;
    ui.compare.innerHTML = '<span>Compare with</span>' + (OBJECTS[st.obj].ab ? btn(-1, 'Input image') : '')
      + ms.slice(1).map((m, i) => btn(i + 1, m.name)).join('');
    markCompareTabs();
    ui.compare.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      if (i < 0) { setAB(true); return; }
      st.cmp = i; setAB(false); showMeshes(++st.token);   // cached meshes are reused
    }));
  }
  function markCompareTabs() { ui.compare.querySelectorAll('button').forEach((x) => x.classList.toggle('active', st.ab ? x.dataset.i === '-1' : +x.dataset.i === st.cmp)); }

  // ---------- input image | 3D slider (pre-rendered full mesh from the fitted input camera: pixel-aligned with the photo crop)
  const HINT3D = ui.hint ? ui.hint.innerHTML : '';
  const HINTAB = 'Drag the line to compare the input image with the 3D result &middot; scroll to zoom &middot; drag to pan when zoomed &middot; double-click to reset';
  const ab = { z: 1, uc: 0.5, vc: 0.5, cut: 0.5, N: 3072, ptrs: new Map(), mode: null, last: null, pinch: null, tok: 0, slug: null };
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  function setAB(on, opts = {}) {
    on = !!on && !!OBJECTS[st.obj].ab; const changed = on !== st.ab; st.ab = on;
    root.classList.toggle('ab', on); ui.ab.hidden = !on; if (ui.hint) ui.hint.innerHTML = on ? HINTAB : HINT3D;
    markCompareTabs();
    if (!on) return;
    if (changed || ab.slug !== OBJECTS[st.obj].slug) { ab.z = 1; ab.uc = 0.5; ab.vc = 0.5; ab.cut = 0.5; }
    if (opts.cut) ab.cut = clamp(+opts.cut || 0.5, 0, 1);
    if (opts.zoom) ab.z = +opts.zoom || 1;
    if (opts.at) { const [u, v] = opts.at.split(',').map(Number); if (isFinite(u) && isFinite(v)) { ab.uc = u; ab.vc = v; } }
    if (ab.slug !== OBJECTS[st.obj].slug) abLoad();
    abLayout();
  }
  function abLoad() {
    const o = OBJECTS[st.obj], tok = ++ab.tok, base = `static/models/${o.slug}/ab_`; ab.slug = o.slug;
    ui.abP.src = `${base}photo_1k.webp?v=${MODEL_V}`; ui.abR.src = `${base}render_1k.webp?v=${MODEL_V}`;   // small previews first
    ui.abP.alt = 'Input image: ' + o.name; ui.abR.alt = 'SuperFine3D result for ' + o.name + ', rendered from the input view';
    const hi = (k) => new Promise((res) => { const im = new Image(); im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im)); im.onerror = () => res(null); im.src = `${base}${k}.webp?v=${MODEL_V}`; });
    Promise.all([hi('photo'), hi('render')]).then(([p, r]) => {
      if (tok !== ab.tok || !p || !r) return;
      ab.N = p.naturalWidth; ui.abP.src = p.src; ui.abR.src = r.src; abLayout();   // swap both together: same sharpness on both sides
    });
  }
  function abGeom() {
    const r = ui.ab.getBoundingClientRect(), W = r.width, H = r.height, S0 = Math.min(W, H);
    return { r, W, H, S0, zmax: Math.max(3, (1.5 * ab.N) / Math.max(S0, 1)) };
  }
  function abLayout() {
    if (!st.ab) return;
    const { W, H, S0, zmax } = abGeom(); if (!W || !H) return;
    ab.z = clamp(ab.z, 1, zmax); const s = S0 * ab.z;
    let ox = W / 2 - ab.uc * s, oy = H / 2 - ab.vc * s;
    ox = s <= W ? (W - s) / 2 : clamp(ox, W - s, 0); oy = s <= H ? (H - s) / 2 : clamp(oy, H - s, 0);
    ab.uc = (W / 2 - ox) / s; ab.vc = (H / 2 - oy) / s; ab.ox = ox; ab.oy = oy; ab.s = s;
    for (const img of [ui.abR, ui.abP]) { img.style.width = img.style.height = s + 'px'; img.style.transform = `translate(${ox}px, ${oy}px)`; }
    const x0 = Math.max(0, ox), x1 = Math.min(W, ox + s), lx = clamp(ab.cut * W, x0, x1); ab.lx = lx;
    ui.abPL.style.clipPath = `inset(0 ${W - lx}px 0 0)`; ui.abLine.style.left = lx + 'px';
    ui.abLine.setAttribute('aria-valuenow', String(Math.round(((lx - x0) / Math.max(x1 - x0, 1)) * 100)));
    ui.abTagP.style.left = x0 + 14 + 'px'; ui.abTagP.style.opacity = lx - x0 > ui.abTagP.offsetWidth + 32 ? 1 : 0;
    ui.abTagR.style.right = W - x1 + 14 + 'px'; ui.abTagR.classList.remove('compact');
    if (x1 - lx < ui.abTagR.offsetWidth + 32) ui.abTagR.classList.add('compact');   // short label first, hidden only if even that does not fit
    ui.abTagR.style.opacity = x1 - lx > ui.abTagR.offsetWidth + 32 ? 1 : 0;
    ui.ab.classList.toggle('pan', ab.z > 1.001);
  }
  function abZoomAt(cx, cy, k) {
    const { r, W, H, S0 } = abGeom(), px = cx - r.left, py = cy - r.top, s = S0 * ab.z;
    const u = (px - (W / 2 - ab.uc * s)) / s, v = (py - (H / 2 - ab.vc * s)) / s;   // image point under the cursor stays put
    ab.z = ab.z * k; abLayout(); const s2 = S0 * ab.z;
    ab.uc = (W / 2 - (px - u * s2)) / s2; ab.vc = (H / 2 - (py - v * s2)) / s2; abLayout();
  }
  const abCut = (clientX) => { const { r, W } = abGeom(); ab.cut = clamp((clientX - r.left) / W, 0, 1); abLayout(); };
  ui.ab.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    ui.ab.setPointerCapture(e.pointerId); ab.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ab.ptrs.size === 2) {
      const [a, b] = [...ab.ptrs.values()]; ab.mode = 'pinch'; ab.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ab.cut = ab.cut0; abLayout(); ui.ab.classList.remove('dragging', 'panning'); return;   // the first finger did not mean to move the line
    }
    if (ab.ptrs.size > 2) return;
    const x = e.clientX - ui.ab.getBoundingClientRect().left; ab.cut0 = ab.cut;
    if (ab.z <= 1.001 || Math.abs(x - ab.lx) < 26) { ab.mode = 'line'; ui.ab.classList.add('dragging'); abCut(e.clientX); }
    else { ab.mode = 'pan'; ui.ab.classList.add('panning'); }
    ab.last = { x: e.clientX, y: e.clientY };
  });
  ui.ab.addEventListener('pointermove', (e) => {
    if (!ab.ptrs.has(e.pointerId)) return; ab.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ab.mode === 'pinch' && ab.ptrs.size === 2) {
      const [a, b] = [...ab.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ab.uc -= (mx - ab.pinch.x) / ab.s; ab.vc -= (my - ab.pinch.y) / ab.s; abLayout();
      if (ab.pinch.d > 0) abZoomAt(mx, my, d / ab.pinch.d); ab.pinch = { d, x: mx, y: my };
    } else if (ab.mode === 'line') abCut(e.clientX);
    else if (ab.mode === 'pan') { ab.uc -= (e.clientX - ab.last.x) / ab.s; ab.vc -= (e.clientY - ab.last.y) / ab.s; ab.last = { x: e.clientX, y: e.clientY }; abLayout(); }
  });
  const abUp = (e) => {
    ab.ptrs.delete(e.pointerId);
    if (ab.ptrs.size === 0 || ab.mode === 'pinch') { ab.mode = ab.ptrs.size ? 'idle' : null; ui.ab.classList.remove('dragging', 'panning'); }
  };
  ui.ab.addEventListener('pointerup', abUp); ui.ab.addEventListener('pointercancel', abUp);
  ui.ab.addEventListener('wheel', (e) => { e.preventDefault(); abZoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  ui.ab.addEventListener('dblclick', () => { ab.z = 1; ab.uc = 0.5; ab.vc = 0.5; abLayout(); });
  ui.abLine.addEventListener('keydown', (e) => {
    const { W } = abGeom(), x0 = Math.max(0, ab.ox), x1 = Math.min(W, ab.ox + ab.s), step = (0.04 * (x1 - x0)) / W;
    const k = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
    if (k) ab.cut = clamp(ab.lx / W + k, x0 / W, x1 / W); else if (e.key === 'Home') ab.cut = x0 / W; else if (e.key === 'End') ab.cut = x1 / W; else return;
    e.preventDefault(); abLayout();
  });
  ui.inputBtn.addEventListener('click', () => setAB(true));
  function buildHotspots() {
    ui.hot.innerHTML = st.scene.hotspots.map((h, i) => `<button class="v3d-spot" data-i="${i}" title="Load the full-resolution geometry of this region">${h.label}</button>`).join('');
    ui.hot.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); goHot(+b.dataset.i); }));
  }
  function goHot(i) {
    st.hot = i; const h = st.scene.hotspots[i]; ui.back.hidden = false; root.classList.add('in-hot');
    fly(new THREE.Vector3(...h.view), new THREE.Vector3(...h.p)); showMeshes(++st.token);
  }
  function leaveHot() { st.hot = -1; ui.back.hidden = true; root.classList.remove('in-hot'); resetView(true); showMeshes(++st.token); }
  ui.back.addEventListener('click', leaveHot);

  // ---------- camera
  function resetView(animate) {
    const c = st.scene.camera; camera.fov = Math.min(Math.max(c.fov, 18), 40); camera.up.set(...c.up);
    const pos = new THREE.Vector3(...c.pos), tgt = new THREE.Vector3(...c.target);
    const dir = pos.clone().sub(tgt); const dist = 1.18 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); pos.copy(tgt).addScaledVector(dir.normalize(), dist);
    setLimits();
    if (animate) fly(pos, tgt); else { camera.position.copy(pos); controls.target.copy(tgt); camera.updateProjectionMatrix(); controls.update(); }
  }
  // keep the camera on the front side: azimuth within +-60 deg and polar within +-35 deg of the input view
  function setLimits() {
    const c = st.scene.camera, off = new THREE.Vector3(...c.pos).sub(new THREE.Vector3(...c.target));
    off.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(camera.up.clone().normalize(), new THREE.Vector3(0, 1, 0)));
    const sph = new THREE.Spherical().setFromVector3(off), A = THREE.MathUtils.degToRad(60), P = THREE.MathUtils.degToRad(35);
    controls.minAzimuthAngle = sph.theta - A; controls.maxAzimuthAngle = sph.theta + A;
    controls.minPolarAngle = Math.max(0.05, sph.phi - P); controls.maxPolarAngle = Math.min(Math.PI - 0.05, sph.phi + P);
  }
  let anim = null;
  function fly(pos, tgt, ms = 900) {
    anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, s: performance.now(), ms };
  }
  function stepAnim(now) {
    if (!anim) return; const k = Math.min(1, Math.max(0, (performance.now() - anim.s) / anim.ms)), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0, anim.t1, e); if (k >= 1) anim = null;
  }
  // click (not drag) on the model: zoom towards that point
  const ray = new THREE.Raycaster(); let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; anim = null; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 400) { down = null; return; }
    down = null; const r = canvas.getBoundingClientRect(); const half = root.classList.contains('split');
    const vw = half ? r.width / 2 : r.width; const lx = (e.clientX - r.left) % vw;
    const ndc = new THREE.Vector2((lx / vw) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const j = half && e.clientX - r.left > vw ? 1 : 0; const m = st.meshes[j] || st.meshes[0]; if (!m) return;
    const hit = ray.intersectObject(m, false)[0]; if (!hit) return;
    const d = camera.position.distanceTo(hit.point), nd = Math.max(d * 0.42, 0.06);
    fly(hit.point.clone().addScaledVector(camera.position.clone().sub(hit.point).normalize(), nd), hit.point.clone(), 700);
  });
  canvas.addEventListener('dblclick', () => { if (st.hot >= 0) leaveHot(); else resetView(true); });

  // ---------- layout and render loop
  function layout() {
    const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false);
    const split = root.classList.contains('split'); camera.aspect = (split ? r.width / 2 : r.width) / r.height; camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { layout(); abLayout(); }).observe(canvas);
  const tmp = new THREE.Vector3();
  function placeSpots() {
    if (!st.scene) return; const r = canvas.getBoundingClientRect(); const split = root.classList.contains('split'); const vw = split ? r.width / 2 : r.width;
    ui.hot.querySelectorAll('.v3d-spot').forEach((b, i) => {
      const h = st.scene.hotspots[i]; tmp.set(...h.p).project(camera);
      const vis = st.hot < 0 && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      b.style.display = vis ? '' : 'none'; b.style.transform = `translate(${((tmp.x + 1) / 2) * vw}px, ${((1 - tmp.y) / 2) * r.height}px) translate(-50%, -50%)`;
    });
  }
  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(root);
  function lights(sc) {
    const key = sc.getObjectByName('key'), fill = sc.getObjectByName('fill');
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = camera.up.clone(), back = camera.position.clone().sub(controls.target).normalize();
    key.position.copy(controls.target).addScaledVector(back, 3).addScaledVector(right, -1.6).addScaledVector(up, 2.2); key.target.position.copy(controls.target);
    fill.position.copy(controls.target).addScaledVector(back, 2).addScaledVector(right, 2.2).addScaledVector(up, -0.4); fill.target.position.copy(controls.target);
    const rim = sc.getObjectByName('rim'); rim.position.copy(controls.target).addScaledVector(back, -2.5).addScaledVector(up, 1.5).addScaledVector(right, 1.0); rim.target.position.copy(controls.target);
  }
  function frame(now) {
    requestAnimationFrame(frame); if (!visible || st.ab) return;   // the slider shows images: no 3D rendering meanwhile
    stepAnim(now); controls.update(); placeSpots();
    const r = canvas.getBoundingClientRect(), w = r.width, h = r.height, split = root.classList.contains('split');
    const views = split ? [[0, 0, w / 2, h], [w / 2, 0, w / 2, h]] : [[0, 0, w, h]];
    views.forEach(([x, y, vw, vh], j) => {
      renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh); renderer.setClearColor(0x0f131c, 1);
      lights(scenes[j]); renderer.render(scenes[j], camera);
    });
  }
  requestAnimationFrame(frame);

  // ---------- object tabs, fullscreen
  ui.objects.innerHTML = OBJECTS.length > 1 ? OBJECTS.map((o, i) => `<button class="${i === 0 ? 'active' : ''}" data-i="${i}">${o.name}</button>`).join('')
    : `<span class="v3d-title">${OBJECTS[0].name}</span>`;   // a single object: a title instead of tabs
  ui.objects.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    ui.objects.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); loadObject(+b.dataset.i);
  }));
  ui.full.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen && root.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => setTimeout(layout, 50));
  const want = OBJECTS.findIndex((o) => o.slug === new URLSearchParams(location.search).get('obj'));
  const first = want >= 0 ? want : 0;
  ui.objects.querySelectorAll('button').forEach((x, j) => x.classList.toggle('active', j === first));
  const qs = new URLSearchParams(location.search);
  loadObject(first, { cmp: qs.get('cmp'), hot: qs.get('hot'), cut: qs.get('cut'), zoom: qs.get('zoom'), at: qs.get('at') });
}
