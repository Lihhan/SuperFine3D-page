// Interactive 3D comparison for the hero: SuperFine3D next to a chosen comparison, one shared camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const root = document.getElementById('v3d');
if (root) init(root);

function init(root) {
  const OBJECTS = [
    { slug: 'pangolin', name: 'Ceremonial pangolin', input: 'static/models/pangolin/input.webp' },
  ];
  const canvas = root.querySelector('canvas');
  const ui = {
    objects: root.querySelector('.v3d-objects'), compare: document.querySelector('.v3d-compare'), hot: root.querySelector('.v3d-hot'),
    labelA: root.querySelector('.v3d-label-a'), labelB: root.querySelector('.v3d-label-b'), divider: root.querySelector('.v3d-divider'),
    back: root.querySelector('.v3d-back'), status: root.querySelector('.v3d-status'), bar: root.querySelector('.v3d-bar i'),
    input: root.querySelector('.v3d-input img'), full: root.querySelector('.v3d-full'), hint: document.querySelector('.v3d-hint'),
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
  const st = { obj: 0, cmp: 0, scene: null, hot: -1, meshes: [null, null], token: 0 };

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
    st.obj = i; st.hot = -1; st.cmp = 0; const tok = ++st.token; const o = OBJECTS[i];
    ui.input.src = o.input; ui.input.alt = 'Input image: ' + o.name; ui.back.hidden = true; root.classList.remove('in-hot');
    setStatus('Loading ' + o.name + '…', 0.02);
    st.scene = await (await fetch(`static/models/${o.slug}/scene.json`)).json(); if (tok !== st.token) return;
    const ci = st.scene.methods.findIndex((m) => m.key === opts.cmp); if (ci > 0) st.cmp = ci;   // deep link: ?obj=owl&cmp=trellis2&hot=1
    const hi = st.scene.hotspots.findIndex((h) => h.label === opts.hot);
    buildCompareTabs(); buildHotspots(); resetView(false);
    if (hi >= 0) {
      st.hot = hi; const h = st.scene.hotspots[hi]; ui.back.hidden = false; root.classList.add('in-hot');
      camera.position.set(...h.view); controls.target.set(...h.p); controls.update();
    }
    await showMeshes(tok);
  }
  function file(name) { const f = st.scene.files[name]; return f ? `static/models/${st.scene.slug}/${name}.bin.gz` : null; }
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
    const ms = st.scene.methods;
    ui.compare.innerHTML = '<span>Compare with</span>' + ms.map((m, i) => `<button class="${i === st.cmp ? 'active' : ''}" data-i="${i}">${i === 0 ? 'None' : m.name}</button>`).join('');
    ui.compare.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      st.cmp = +b.dataset.i; ui.compare.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      showMeshes(++st.token);
    }));
  }
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
  new ResizeObserver(layout).observe(canvas);
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
    requestAnimationFrame(frame); if (!visible) return;
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
  loadObject(first, { cmp: qs.get('cmp'), hot: qs.get('hot') });
}
