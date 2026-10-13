'use strict';
/* 竹簡樂府立體書｜〈桃花源記〉四幕狀態機
   流程：書架選本 → 移到桌面 → 開卷 → 四幕（收景→翻頁→升景）→ 三題回顧 → 朱印入藏 → 合書回架。
   原型來源：../06_Three互動原型（Three.js 0.128.0，同引擎版本，未升版）。
   文字與題目全部來自 data.js；歌曲只用原站〈桃花源記〉音檔，不自行編歌詞時間。 */

const T = window.THREE, D = window.STORY, $ = id => document.getElementById(id);

/* 既有三張 PNG 的透明邊界，沿用 ../06_Three互動原型/assets/alpha-check.json */
const BB = { mountain: [156, 43, 1653, 856], peach: [24, 11, 1198, 1268], boat: [58, 339, 1501, 745] };
const CANCEL = { cancelled: true };

let renderer, scene, camera, camLook, book, leftCover, turnLeaf, pageMat, reward, shelfGroup;
const roomDecor = [];
let tex = {}, acts = [], pageTex = [], quizPaper, leafBase = null, raf = 0, shelfLabels = [];
let clock = 0, last = 0, pendingResize = true, toastTimer = 0, audioCtx = null, quiz = null, run = null;

const view = { distance: 14 };
const pointer = { x: 0, y: 0 };
const ray = new (T ? T.Raycaster : class { })();
const mouse = new (T ? T.Vector2 : class { })();
const hotEls = new Map();
const compactReading = () => matchMedia('(max-width:760px) and (orientation:portrait), (max-width:960px) and (max-height:560px) and (orientation:landscape)').matches;

const S = {
  phase: 'loading', act: -1, busy: true, reading: false, framing: 'shelf',
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  sfx: true, gen: 0, missing: [], stamped: false, plain: false, booting: false,
  visited: [new Set(), new Set(), new Set(), new Set()]
};

/* ── 小工具 ───────────────────────────────────────────── */
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function tween(ms, update) {
  const gen = S.gen, dur = Math.max(40, S.reduced ? Math.min(ms, 150) : ms);
  const owner = run;
  return new Promise((res, rej) => {
    let previous, elapsed = 0;
    function step(now) {
      if (gen !== S.gen) { rej(CANCEL); return; }
      const dt = previous === undefined ? 0 : now - previous;
      previous = now;
      if (!(owner && owner === run && owner.paused)) elapsed += dt;
      const t = Math.min(1, elapsed / dur);
      update(ease(t), t);
      t < 1 ? requestAnimationFrame(step) : res();
    }
    requestAnimationFrame(step);
  });
}

function toast(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}

/* 翻紙／點擊音效：Web Audio 低音量合成，使用者按下才建立，可關閉，沒有旁白。 */
function sfx(kind) {
  if (!S.sfx) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime, g = audioCtx.createGain();
    g.connect(audioCtx.destination);
    if (kind === 'page') {
      const len = Math.floor(audioCtx.sampleRate * .42), buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) { const e = 1 - i / len; d[i] = (Math.random() * 2 - 1) * e * e * .5; }
      const src = audioCtx.createBufferSource(), bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = .7;
      src.buffer = buf; src.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(.09, t0);
      src.start();
    } else {
      const o = audioCtx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(kind === 'stamp' ? 320 : 760, t0);
      o.frequency.exponentialRampToValueAtTime(kind === 'stamp' ? 140 : 420, t0 + .16);
      o.connect(g);
      g.gain.setValueAtTime(.055, t0);
      g.gain.exponentialRampToValueAtTime(.0008, t0 + .22);
      o.start(); o.stop(t0 + .24);
    }
  } catch (e) { /* 音效失敗不影響閱讀 */ }
}

/* ── 貼圖 ─────────────────────────────────────────────── */
function prep(t) {
  t.encoding = T.sRGBEncoding;
  if (renderer) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}

function drawTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return prep(new T.CanvasTexture(c));
}

function cropTexture(t, bbox) {
  const w = t.image.width, h = t.image.height, pad = 4;
  const x = Math.max(0, bbox[0] - pad), y = Math.max(0, bbox[1] - pad);
  const r = Math.min(w, bbox[2] + pad), b = Math.min(h, bbox[3] + pad);
  t.offset.set(x / w, 1 - b / h);
  t.repeat.set((r - x) / w, (b - y) / h);
  prep(t);
  return (r - x) / (b - y);
}

function woodTexture() {
  return drawTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#352312'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 19; i++) {
      const x = i * w / 18;
      c.fillStyle = i % 2 ? '#3a2916' : '#4e351b'; c.fillRect(x, 0, w / 18 - 2, h);
      c.fillStyle = '#1a120b'; c.fillRect(x, 0, 2, h);
      c.fillStyle = '#ab813b55'; c.fillRect(x + 3, 0, 1, h);
    }
    c.strokeStyle = '#ba914d'; c.lineWidth = 2; c.strokeRect(16, 16, w - 32, h - 32);
    c.strokeStyle = '#9a7438'; c.strokeRect(23, 23, w - 46, h - 46);
    for (const y of [85, 427]) { c.fillStyle = '#1e130be0'; c.fillRect(0, y, w, 7); c.fillStyle = '#92704f'; c.fillRect(0, y, w, 1); }
  });
}

function paperBase(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f4e8cd'); g.addColorStop(.5, '#e7d4ad'); g.addColorStop(1, '#f1e4c6');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#8f73511b';
  for (let y = 15; y < h; y += 13) {
    c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y + 3, w * .7, y - 4, w, y + 2); c.stroke();
  }
  c.strokeStyle = '#ad956244'; c.strokeRect(30, 25, w - 60, h - 50);
  const sh = c.createLinearGradient(w * .46, 0, w * .54, 0);
  sh.addColorStop(0, '#60442600'); sh.addColorStop(.5, '#60442655'); sh.addColorStop(1, '#60442600');
  c.fillStyle = sh; c.fillRect(w * .46, 0, w * .08, h);
}

function paperTexture() { return drawTexture(1536, 960, paperBase); }

/* 第二幕頁面：田壟與阡陌；第三幕：村中田畦與小路；第四幕：溪路與薄霧。都是程序繪製。 */
function fieldPage() {
  return drawTexture(1536, 960, (c, w, h) => {
    paperBase(c, w, h);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = i % 2 ? '#cbc39a55' : '#b9bd8f4a';
      c.beginPath();
      const y = h * .42 + i * 62;
      c.moveTo(0, y); c.bezierCurveTo(w * .35, y - 16, w * .7, y + 14, w, y - 6);
      c.lineTo(w, y + 34); c.bezierCurveTo(w * .7, y + 48, w * .35, y + 20, 0, y + 38);
      c.closePath(); c.fill();
    }
    c.strokeStyle = '#9d8c5e55'; c.lineWidth = 3;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(w * (.1 + i * .2), h * .38); c.lineTo(w * (.16 + i * .18), h); c.stroke(); }
  });
}

function villagePage() {
  return drawTexture(1536, 960, (c, w, h) => {
    paperBase(c, w, h);
    c.strokeStyle = '#9b8a5c4d'; c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      c.strokeRect(w * .08 + (i % 3) * w * .29, h * .5 + Math.floor(i / 3) * h * .22, w * .22, h * .16);
    }
    c.strokeStyle = '#b08b5566'; c.lineWidth = 26;
    c.beginPath(); c.moveTo(w * .1, h); c.bezierCurveTo(w * .35, h * .74, w * .6, h * .92, w * .92, h * .6); c.stroke();
  });
}

function mistPage() {
  return drawTexture(1536, 960, (c, w, h) => {
    paperBase(c, w, h);
    c.strokeStyle = '#9fae9e55'; c.lineWidth = 20;
    c.beginPath(); c.moveTo(0, h * .72); c.bezierCurveTo(w * .3, h * .62, w * .62, h * .84, w, h * .66); c.stroke();
    c.fillStyle = '#8a7a5a33';
    for (let i = 0; i < 16; i++) c.fillRect(w * .12 + i * w * .05, h * .5 + (i % 4) * 26, 7, 22);
    const g = c.createLinearGradient(0, h * .3, 0, h);
    g.addColorStop(0, '#f6efdd00'); g.addColorStop(1, '#f6efddaa');
    c.fillStyle = g; c.fillRect(0, h * .3, w, h * .7);
  });
}

function glowTexture() {
  return drawTexture(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff4d2ff'); g.addColorStop(.45, '#f3d79b88'); g.addColorStop(1, '#f3d79b00');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

function mistTexture() {
  return drawTexture(512, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f2ecdd00'); g.addColorStop(.5, '#efe7d6b0'); g.addColorStop(1, '#efe7d600');
    c.fillStyle = g;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(w * (.12 + i * .2), h * .5, w * .16, h * .3, 0, 0, 7); c.fill(); }
  });
}

function spineLabel(item) {
  return drawTexture(256, 1024, (c, w, h) => {
    c.fillStyle = '#2a1b0f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c0984e'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = '#f0dcb0'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '112px HuiWen,serif';
    [...item.title].forEach((ch, i) => c.fillText(ch, w / 2, 170 + i * 128));
    c.fillStyle = '#9e2b25'; c.fillRect(w / 2 - 36, h - 150, 72, 84);
    c.fillStyle = '#f3e7d2'; c.font = '56px HuiWen,serif'; c.fillText(item.seal, w / 2, h - 106);
  });
}

/* 缺圖替代：明顯的簡化墨色剪影，只在正式素材讀不到時使用。 */
function placeholder(key) {
  if (key === 'cave') {
    return drawTexture(1024, 768, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#5d5243';
      c.beginPath(); c.moveTo(w * .04, h); c.bezierCurveTo(w * .1, h * .2, w * .9, h * .2, w * .96, h); c.closePath(); c.fill();
      c.fillStyle = '#2b2a26';
      c.beginPath(); c.ellipse(w / 2, h * .74, w * .13, h * .26, 0, 0, 7); c.fill();
    });
  }
  if (key === 'village') {
    return drawTexture(1024, 512, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const x = w * (.1 + i * .3), bw = w * .22, bh = h * .4;
        c.fillStyle = '#6b5a44'; c.fillRect(x, h - bh, bw, bh);
        c.fillStyle = '#3f372c';
        c.beginPath(); c.moveTo(x - bw * .12, h - bh); c.lineTo(x + bw / 2, h - bh - h * .2); c.lineTo(x + bw * 1.12, h - bh); c.closePath(); c.fill();
      }
    });
  }
  return drawTexture(1024, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = w * (.18 + i * .32), s = i === 1 ? 1 : .82;
      c.fillStyle = '#4a4034';
      c.beginPath(); c.arc(x, h * (.3 + (1 - s) * .2), h * .09 * s, 0, 7); c.fill();
      c.beginPath();
      c.moveTo(x - h * .13 * s, h); c.lineTo(x - h * .07 * s, h * (.4 + (1 - s) * .2));
      c.lineTo(x + h * .07 * s, h * (.4 + (1 - s) * .2)); c.lineTo(x + h * .13 * s, h);
      c.closePath(); c.fill();
    }
  });
}

/* ── 書本與書架 ───────────────────────────────────────── */
function pageGeometry(sign = 1) {
  const nx = 32, nz = 12, W = 3.9, Dp = 4.6, positions = [], uv = [], indices = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / nz;
    positions.push(sign * u * W, .11 + Math.sin(u * Math.PI) * .085, (v - .5) * Dp);
    uv.push(.5 + sign * u * .5, 1 - v);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    sign > 0 ? indices.push(a, b, a + 1, b, b + 1, a + 1) : indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function box(w, h, d, mat, x, y, z, parent) {
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildRoom() {
  const table = new T.Mesh(new T.CylinderGeometry(7.5, 8.1, .35, 72),
    new T.MeshStandardMaterial({ color: new T.Color(0x24170d).convertSRGBToLinear(), roughness: .85 }));
  table.position.y = -.55;
  scene.add(table); roomDecor.push(table);
  const trim = new T.Mesh(new T.TorusGeometry(7.48, .012, 5, 90), new T.MeshBasicMaterial({ color: 0x796035 }));
  trim.rotation.x = Math.PI / 2; trim.position.y = -.365;
  scene.add(trim); roomDecor.push(trim);

  shelfGroup = new T.Group();
  shelfGroup.position.set(0, 0, -7.4);
  scene.add(shelfGroup);
  const shelfMat = new T.MeshStandardMaterial({ map: woodTexture(), roughness: .8, metalness: .1 });
  box(7.4, .3, 2.6, shelfMat, 0, .6, 0, shelfGroup);
  box(7.4, .3, 2.6, shelfMat, 0, 4.4, 0, shelfGroup);
  box(.3, 4.1, 2.6, shelfMat, -3.55, 2.5, 0, shelfGroup);
  box(.3, 4.1, 2.6, shelfMat, 3.55, 2.5, 0, shelfGroup);
  box(7.4, 4.1, .18, shelfMat, 0, 2.5, -1.25, shelfGroup);

  const slots = [-1.5, .1, 1.6];
  shelfLabels = [];
  D.shelf.forEach((item, i) => {
    if (i > 0) {
      const slab = new T.Mesh(new T.BoxGeometry(.42, 2.1, 2.2),
        new T.MeshStandardMaterial({ color: new T.Color(i === 1 ? 0x4b3420 : 0x56392a).convertSRGBToLinear(), roughness: .9 }));
      slab.position.set(slots[i] + .2, 1.8, 0);
      slab.userData.bookIndex = i;
      shelfGroup.add(slab);
    }
    const label = new T.Mesh(new T.PlaneGeometry(.44, 1.76),
      new T.MeshBasicMaterial({ map: spineLabel(item), transparent: true, toneMapped: false }));
    label.position.set(slots[i] + .2, 1.75, 1.18);
    label.userData.bookIndex = i;
    shelfGroup.add(label);
    shelfLabels.push(label);
  });
}

function buildBook(coverMat) {
  book = new T.Group();
  scene.add(book);
  const edgeMat = new T.MeshStandardMaterial({ color: new T.Color(0xd3bd91).convertSRGBToLinear(), roughness: 1 });
  pageMat = new T.MeshBasicMaterial({ map: pageTex[0], side: T.DoubleSide, toneMapped: false });

  box(4.03, .15, 4.8, coverMat, 1.98, 0, 0, book);
  box(3.89, .32, 4.56, edgeMat, 1.95, .24, 0, book);
  const right = new T.Mesh(pageGeometry(1), pageMat);
  right.position.y = .32;
  book.add(right);

  leftCover = new T.Group();
  leftCover.position.y = .32;
  leftCover.rotation.z = -Math.PI;
  book.add(leftCover);
  box(4.03, .15, 4.8, coverMat, -1.98, -.09, 0, leftCover);
  box(3.89, .14, 4.56, edgeMat, -1.95, .02, 0, leftCover);
  leftCover.add(new T.Mesh(pageGeometry(-1), pageMat));

  for (const side of [-1, 1]) for (let j = 0; j < 6; j++) {
    const line = new T.Mesh(new T.BoxGeometry(3.85, .009, 4.58),
      new T.MeshBasicMaterial({ color: j % 2 ? 0xc0a779 : 0xead7b2 }));
    line.position.set(side * 1.95, side < 0 ? -.005 - j * .025 : .08 + j * .029, 0);
    (side < 0 ? leftCover : book).add(line);
  }
  const spine = new T.Mesh(new T.CylinderGeometry(.14, .14, 4.77, 16), coverMat);
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, .11, 0);
  book.add(spine);

  turnLeaf = new T.Mesh(pageGeometry(1), new T.MeshBasicMaterial({ map: pageTex[0], side: T.DoubleSide, toneMapped: false }));
  turnLeaf.position.y = .33;
  turnLeaf.visible = false;
  book.add(turnLeaf);
  leafBase = Array.from(turnLeaf.geometry.attributes.position.array);

  const stamp = drawTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#9e3028'; c.fillRect(25, 25, 206, 206);
    c.strokeStyle = '#edcc9d'; c.lineWidth = 5; c.strokeRect(35, 35, 186, 186);
    c.fillStyle = '#f2dfba'; c.font = '150px HuiWen,serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(D.reward.seal, 128, 137);
  });
  reward = new T.Mesh(new T.PlaneGeometry(1.2, 1.2), new T.MeshBasicMaterial({ map: stamp, transparent: true, side: T.DoubleSide }));
  reward.position.set(0, 1.4, .3);
  reward.visible = false;
  book.add(reward);

  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const slip = new T.Mesh(new T.CylinderGeometry(.1, .12, 4.6 + (i % 3) * .4, 8),
      new T.MeshStandardMaterial({ color: new T.Color(0x352614).convertSRGBToLinear(), roughness: .8 }));
    slip.position.set(side * (5.6 + i * .26), 1.4, -3.4 - i * .16);
    slip.rotation.z = side * .16;
    scene.add(slip); roomDecor.push(slip);
  }
}

/* ── 分層景物 ─────────────────────────────────────────── */
function newAct(i) {
  const group = new T.Group();
  group.visible = false;
  book.add(group);
  return { index: i, group, items: [], hot: {}, p: 0, fx: {} };
}

function addItem(act, obj, { h, x, z, y = .47, delay = 0, rotY = 0, alpha = 1 }) {
  const anchor = new T.Group();
  anchor.position.set(x, y, z);
  anchor.rotation.y = rotY;
  anchor.add(obj);
  act.group.add(anchor);
  const item = { anchor, mesh: obj, mat: obj.material, h, delay, x, z, baseY: y, alpha, q: 0 };
  act.items.push(item);
  return item;
}

function addPopup(act, o) {
  const t = o.tex.clone();
  t.needsUpdate = true;
  let ratio;
  if (o.bbox) ratio = cropTexture(t, o.bbox);
  else if (o.slice) {
    const [a, b] = o.slice;
    t.offset.set(a, 0); t.repeat.set(b - a, 1); prep(t);
    ratio = (t.image.width * (b - a)) / t.image.height;
  } else { prep(t); ratio = t.image.width / t.image.height; }
  const h = o.width / ratio;
  const mesh = new T.Mesh(new T.PlaneGeometry(o.width, h), new T.MeshBasicMaterial({
    map: t, transparent: true, alphaTest: .35, side: T.DoubleSide, toneMapped: false,
    color: o.tint ? new T.Color(o.tint) : 0xffffff
  }));
  mesh.position.y = h / 2;
  if (o.flip) mesh.scale.x = -1;
  return addItem(act, mesh, { ...o, h });
}

function addSlab(act, o) {
  const mesh = new T.Mesh(new T.BoxGeometry(o.w, o.h, o.d),
    new T.MeshStandardMaterial({ color: new T.Color(o.color).convertSRGBToLinear(), roughness: .9, transparent: true }));
  mesh.position.y = o.h / 2;
  return addItem(act, mesh, { ...o, h: o.h });
}

function addGlow(act, { x, y, z, size }) {
  const mesh = new T.Mesh(new T.PlaneGeometry(size, size),
    new T.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
  mesh.position.set(x, y, z);
  act.group.add(mesh);
  return mesh;
}

function ringSet(act, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ring = new T.Mesh(new T.RingGeometry(.22, .228, 40),
      new T.MeshBasicMaterial({ color: 0xa0b49b, transparent: true, opacity: .2, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-.75, .445, 1.25);
    ring.scale.set(3 + i * .6, 1 + i * .3, 1);
    act.group.add(ring);
    out.push(ring);
  }
  return out;
}

function petalSet(act, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = new T.Mesh(new T.SphereGeometry(.025, 5, 4),
      new T.MeshBasicMaterial({ color: i % 3 ? 0xe4b8a6 : 0xf2d5bf, transparent: true, opacity: .75 }));
    p.scale.set(1.4, .35, 1);
    p.visible = false;
    p.userData = { seed: i * .381, x: (i % 7 - 3) * .85, z: (i % 5 - 2) * .7 };
    act.group.add(p);
    out.push(p);
  }
  return out;
}

function buildAct1() {
  const a = newAct(0);
  a.fx = { glow: 0, boatT: 0, burst: 0 };
  const mountain = addPopup(a, { tex: tex.mountain, width: 6.9, x: 0, z: -1.55, bbox: BB.mountain, delay: 0, rotY: -.02 });
  const treeL = addPopup(a, { tex: tex.peach, width: 1.9, x: -2.9, z: .66, bbox: BB.peach, delay: .14, rotY: .12 });
  addPopup(a, { tex: tex.peach, width: 1.75, x: 2.92, z: .18, bbox: BB.peach, delay: .25, flip: true });
  addPopup(a, { tex: tex.peach, width: 1, x: -2.05, z: -.75, bbox: BB.peach, delay: .2, tint: 0xd1d0b4 });
  const boat = addPopup(a, { tex: tex.boat, width: 2.85, x: -.85, z: 1.35, bbox: BB.boat, delay: .35, rotY: -.025 });
  a.rings = ringSet(a, 3);
  a.petals = petalSet(a, 27);
  a.glow = addGlow(a, { x: .45, y: 1.22, z: -1.5, size: 1.3 });
  a.boat = boat;
  a.hot = { boat: { anchor: boat.anchor, mesh: boat.mesh }, peach: { anchor: treeL.anchor, mesh: treeL.mesh }, source: { anchor: mountain.anchor, mesh: mountain.mesh, oy: 1.1 } };
  a.update = (dt, idle) => {
    const f = a.fx;
    boat.anchor.position.x = boat.x + 1.05 * f.boatT;
    boat.anchor.position.z = boat.z - .46 * f.boatT;
    a.glow.material.opacity = f.glow * .85;
    a.glow.scale.setScalar(.7 + f.glow * .5);
    if (!idle) return;
    const p = S.reduced ? 0 : 1;
    boat.anchor.position.y = boat.baseY + p * Math.sin(clock * 1.2) * .025;
    boat.anchor.rotation.z = p * Math.sin(clock * .85) * .009;
    a.rings.forEach((r, i) => {
      r.position.x = boat.anchor.position.x;
      r.position.z = boat.anchor.position.z;
      r.material.opacity = (.07 + .06 * (1 + Math.sin(clock * 1.2 + i * 1.6))) * a.p;
      r.scale.set(2.9 + i * .5 + .1 * Math.sin(clock + i), 1 + i * .3, 1);
    });
    a.petals.forEach(pt => {
      const v = pt.userData, extra = f.burst;
      pt.visible = a.p > .95;
      pt.position.set(v.x + p * Math.sin(clock * .3 + v.seed) * .3,
        .75 + (S.reduced ? (v.seed % 2) : ((3 - clock * .1 + v.seed) % 2.5 + 2.5) % 2.5),
        v.z);
      pt.rotation.z = clock * .3 + v.seed;
      pt.material.opacity = .45 + .35 * extra;
      pt.scale.setScalar(1 + extra * .5);
    });
  };
  return a;
}

function buildAct2() {
  const a = newAct(1);
  a.fx = { caveOpen: 0, light: 0, boatAside: 0, ridge: 0, far: 0, path: 0 };
  addPopup(a, { tex: tex.mountain, width: 7.8, x: 0, z: -2.3, bbox: BB.mountain, delay: 0 });
  const cave = addPopup(a, { tex: tex.cave, width: 3.1, x: 0, z: -1.05, delay: .12 });
  a.caveLight = addGlow(a, { x: 0, y: cave.h * .45, z: -1.2, size: 2.4 });
  const boat = addPopup(a, { tex: tex.boat, width: 2.1, x: -3.05, z: 1.5, bbox: BB.boat, delay: .3, rotY: .14 });
  a.ridges = [0, 1, 2, 3].map(i => addSlab(a, {
    w: 3.2 - i * .25, h: .12 + i * .03, d: .3, color: i % 2 ? 0x6e6b3f : 0x7c7347,
    x: (i % 2 ? .5 : -.6), z: .15 + i * .46, delay: .42 + i * .09
  }));
  const far = addPopup(a, { tex: tex.village, width: 2.5, x: 2.05, z: -1.8, delay: .86, tint: 0xcfc6ae, alpha: 0 });
  a.far = far;
  a.lanes = [0, 1, 2].map(i => {
    const m = new T.Mesh(new T.BoxGeometry(i === 1 ? .08 : 5.2, .02, i === 1 ? 4.2 : .08),
      new T.MeshBasicMaterial({ color: 0xb09a62, transparent: true, opacity: 0 }));
    m.position.set(i === 1 ? .4 : 0, .46, i === 1 ? .9 : .5 + i * .9);
    a.group.add(m);
    return m;
  });
  a.petals = petalSet(a, 10);
  a.hot = {
    cave: { anchor: cave.anchor, mesh: cave.mesh, oy: cave.h * .5 },
    field: { anchor: a.ridges[1].anchor, mesh: a.ridges[1].mesh, oy: .4 },
    path: { anchor: a.ridges[3].anchor, mesh: a.ridges[3].mesh, oy: .3 }
  };
  a.cave = cave;
  a.update = (dt, idle) => {
    const f = a.fx;
    cave.anchor.scale.x = 1;
    cave.anchor.rotation.y = -.18 * f.caveOpen;
    cave.alpha = 1 - .4 * f.caveOpen;
    a.caveLight.material.opacity = f.light * .9;
    a.caveLight.scale.setScalar(.5 + f.caveOpen * .7);
    boat.anchor.position.x = boat.x + f.boatAside * .5;
    a.ridges.forEach((r, i) => { r.anchor.scale.z = 1 + f.ridge * .35; r.alpha = 1; });
    far.alpha = f.far;
    a.lanes.forEach((m, i) => { m.material.opacity = clamp(f.path * 3 - i, 0, 1) * .75 * a.p; });
    if (!idle) return;
    const p = S.reduced ? 0 : 1;
    a.caveLight.material.opacity = f.light * (.75 + p * .15 * Math.sin(clock * 1.6));
    a.petals.forEach(pt => {
      const v = pt.userData;
      pt.visible = a.p > .95;
      pt.position.set(v.x * .6 + p * Math.sin(clock * .25 + v.seed) * .25, .7 + ((2 - clock * .08 + v.seed) % 2 + 2) % 2, v.z * .5 + 1);
      pt.material.opacity = .3;
    });
  };
  return a;
}

function buildAct3() {
  const a = newAct(2);
  a.fx = { pop: [0, 0, 0], lantern: 0, layer2: 0, sway: 0, bow: 0 };
  addPopup(a, { tex: tex.mountain, width: 7.2, x: 0, z: -2.65, bbox: BB.mountain, delay: 0, tint: 0xd8d2bd });
  const main = addPopup(a, { tex: tex.village, width: 4.7, x: -.3, z: -1.15, delay: .12 });
  const back = addPopup(a, { tex: tex.village, width: 2.9, x: 2.5, z: -2.05, delay: .3, tint: 0xd6ccb4, alpha: 0 });
  addPopup(a, { tex: tex.peach, width: 1.7, x: -3.15, z: .25, bbox: BB.peach, delay: .2 });
  a.ridges = [0, 1].map(i => addSlab(a, {
    w: 2.6, h: .11, d: .28, color: 0x74703e, x: i ? 1.5 : -1.4, z: .35 + i * .5, delay: .4 + i * .08
  }));
  // 新人物圖保留全圖；互動區另設，避免等寬裁切截斷人物。
  const n = 1;
  const cuts = n === 3 ? [[0, .35], [.33, .67], [.65, 1]] : n === 2 ? [[0, .5], [.5, 1]] : [[0, 1]];
  a.people = cuts.map((slice, i) => addPopup(a, {
    tex: tex.villagers, width: n === 1 ? 3.2 : 1.25, x: n === 1 ? .1 : (-1.35 + i * 1.45), z: 1.15 - (i % 2) * .3,
    slice: n === 1 ? null : slice, delay: .54 + i * .12
  }));
  a.lantern = addGlow(a, { x: -.5, y: 1.05, z: -.9, size: 1.8 });
  a.back = back;
  function personHotspot(x, y) {
    const hit = new T.Mesh(new T.PlaneGeometry(.85, 1.55), new T.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide
    }));
    hit.position.set(x, y, 1.22);
    a.group.add(hit);
    return { anchor: hit, mesh: hit, oy: .35 };
  }
  a.hot = {
    meet: personHotspot(.12, 1.35),
    origin: { anchor: main.anchor, mesh: main.mesh, oy: main.h * .55 },
    dynasty: personHotspot(-.92, 1.55),
    farewell: personHotspot(1.13, 1.05)
  };
  a.update = (dt, idle) => {
    const f = a.fx;
    const lastIdx = a.people.length - 1;
    /* 每個村民各自彈起：f.pop[i] 走一遍 0→1 就是一次獨立的跳動。 */
    a.people.forEach((pp, i) => {
      const hop = Math.sin(clamp(f.pop[i] ?? 0, 0, 1) * Math.PI);
      pp.anchor.scale.x = 1 + .22 * hop;
      pp.hop = .16 * hop;
      pp.anchor.position.y = pp.baseY + (1 - pp.q) * .02 + pp.hop;
      pp.alpha = i === lastIdx ? 1 - .4 * f.bow : 1;
    });
    back.alpha = f.layer2;
    back.anchor.position.y = back.baseY + (1 - back.q) * .02 - (1 - f.layer2) * .25;
    a.lantern.material.opacity = f.lantern * .75;
    if (!idle) return;
    const p = S.reduced ? 0 : 1;
    a.people.forEach((pp, i) => {
      pp.anchor.rotation.z = p * Math.sin(clock * 1.1 + i) * .012 * (1 + f.sway * 2);
      pp.anchor.position.y = pp.baseY + pp.hop + p * Math.sin(clock * 1.4 + i * 2) * .012;
    });
    a.lantern.material.opacity = f.lantern * (.6 + p * .18 * Math.sin(clock * 2.1));
  };
  return a;
}

function buildAct4() {
  const a = newAct(3);
  a.fx = { marks: 1, pathFade: 1, mist: 0, dim: 0, lift: 0 };
  const mountain = addPopup(a, { tex: tex.mountain, width: 7.4, x: 0, z: -1.95, bbox: BB.mountain, delay: 0, tint: 0xd7d4c8 });
  addPopup(a, { tex: tex.peach, width: 1.7, x: -2.85, z: .55, bbox: BB.peach, delay: .18 });
  addPopup(a, { tex: tex.peach, width: 1.5, x: 2.95, z: .1, bbox: BB.peach, delay: .26, flip: true });
  const boat = addPopup(a, { tex: tex.boat, width: 2.6, x: -.5, z: 1.5, bbox: BB.boat, delay: .34 });
  a.boat = boat;

  const curve = t => new T.Vector3(-2.1 + t * 4.1 + Math.sin(t * 3.1) * .35, .46, 1.35 - t * 2.3);
  a.path = [];
  for (let i = 0; i < 14; i++) {
    const t0 = i / 14, p0 = curve(t0), p1 = curve((i + 1) / 14);
    const seg = new T.Mesh(new T.PlaneGeometry(p0.distanceTo(p1) * 1.15, .2),
      new T.MeshBasicMaterial({ color: 0xb49a63, transparent: true, opacity: 0, side: T.DoubleSide }));
    seg.position.copy(p0.clone().lerp(p1, .5));
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    a.group.add(seg);
    a.path.push(seg);
  }
  a.marks = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const p0 = curve(.08 + i * .14);
    return addSlab(a, { w: .08, h: .42, d: .06, color: 0x6a5436, x: p0.x + .18, z: p0.z, delay: .44 + i * .05 });
  });
  a.mists = [0, 1, 2].map(i => {
    const m = new T.Mesh(new T.PlaneGeometry(5.4, 1.5),
      new T.MeshBasicMaterial({ map: mistTexture(), transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(0, .75 + i * .3, -.3 + i * .9);
    a.group.add(m);
    return m;
  });
  a.hot = {
    marks: { anchor: a.marks[2].anchor, mesh: a.marks[2].mesh, oy: .5 },
    search: { anchor: a.marks[5].anchor, mesh: a.marks[5].mesh, oy: .5 },
    liu: { anchor: mountain.anchor, mesh: mountain.mesh, oy: mountain.h * .72 }
  };
  a.update = (dt, idle) => {
    const f = a.fx;
    mountain.alpha = 1 - f.dim * .45;
    boat.alpha = 1 - f.dim * .25;
    a.path.forEach((s, i) => { s.material.opacity = clamp(f.pathFade * 1.4 - i / 20, 0, 1) * .5 * a.p * f.lift; });
    a.marks.forEach((m, i) => { m.alpha = clamp(f.marks * 8 - i, 0, 1); });
    a.mists.forEach((m, i) => { m.material.opacity = f.mist * (.5 - i * .1); });
    if (!idle) return;
    const p = S.reduced ? 0 : 1;
    a.boat.anchor.position.y = a.boat.baseY + p * Math.sin(clock * 1.1) * .02;
    a.mists.forEach((m, i) => { m.position.x = p * Math.sin(clock * .18 + i * 2) * .9; });
  };
  return a;
}

function poseAct(a, p) {
  a.p = p;
  const ordered = [...a.items].sort((a,b) => a.delay - b.delay);
  for (const [index, it] of ordered.entries()) {
    // One paper layer finishes rising before the next begins.
    const q = ease(clamp(p * ordered.length - index, 0, 1));
    it.anchor.visible = q > 0;
    it.q = q;
    it.anchor.scale.y = Math.max(.001, q);
    it.anchor.rotation.x = -(1 - q) * Math.PI * .48;
    it.anchor.position.y = it.baseY + (1 - q) * .02;
  }
  if (a.update) a.update(0, false);
  applyAlpha(a);
}

function applyAlpha(a) {
  for (const it of a.items) {
    if (!it.mat.transparent) continue;
    it.mat.opacity = clamp(it.q * 2, 0, 1) * (it.alpha ?? 1);
  }
}

async function popIn(a) {
  a.group.visible = true;
  await tween(a.items.length * 650, (t, raw) => poseAct(a, raw));
  poseAct(a, 1);
}

async function popOut(a) {
  await tween(620, t => poseAct(a, 1 - t));
  poseAct(a, 0);
  a.group.visible = false;
}

function resetAct(a) {
  if (a.index === 0) { a.fx.glow = 0; a.fx.boatT = 0; a.fx.burst = 0; }
  if (a.index === 1) Object.assign(a.fx, { caveOpen: 0, light: 0, boatAside: 0, ridge: 0, far: 0, path: 0 });
  if (a.index === 2) Object.assign(a.fx, { pop: [0, 0, 0], lantern: 0, layer2: 0, sway: 0, bow: 0 });
  if (a.index === 3) Object.assign(a.fx, { marks: 1, pathFade: 1, mist: 0, dim: 0, lift: 0 });
  S.visited[a.index].clear();
  poseAct(a, 0);
}

/* ── 介面狀態 ─────────────────────────────────────────── */
const PHASE_LABEL = {
  moving: '取書中…', opening: '展卷中…', turning: '翻頁中…',
  closing: '收卷中…', returning: '回架中…', rewarding: '藏印中…'
};

function controls() {
  const p = S.phase, acting = p === 'act';
  document.body.dataset.phase = p;
  document.body.dataset.busy = String(S.busy);
  $('loader').classList.toggle('hidden', p !== 'loading');
  $('coverTitle').style.opacity = p === 'cover' && !S.busy ? '1' : '0';
  $('shelfPanel').hidden = p !== 'shelf';

  document.body.classList.toggle('performing', !!run);
  const lock = S.busy;
  $('backShelf').disabled = lock || !['cover', 'act', 'quiz', 'finished'].includes(p);
  $('prev').disabled = lock || !(acting && S.act > 0 || p === 'quiz');
  $('next').disabled = lock || !(acting || p === 'cover');
  $('replay').disabled = lock || !acting;
  $('study').disabled = lock || !['act', 'quiz', 'finished'].includes(p);
  $('auto').disabled = lock && !run || !['shelf', 'cover', 'act'].includes(p) && !run;
  $('autoStop').hidden = !run;
  $('auto').textContent = run ? (run.paused ? '續播' : '暫停') : '展演';
  $('primary').disabled = lock || p === 'loading' || p === 'plain';

  const label = PHASE_LABEL[p];
  if (label) { $('primary').textContent = label; return; }
  $('primary').innerHTML =
    p === 'shelf' ? '取桃花源記 <span>↗</span>' :
      p === 'cover' ? '展卷入境 <span>↗</span>' :
        acting ? (S.act < 3 ? '下一幕 <span>›</span>' : '學習回顧 <span>›</span>') :
          p === 'quiz' ? '作答區 <span>›</span>' :
            p === 'finished' ? '合書回架 <span>✓</span>' : '選書';
}

function setStatus(title, hint) {
  $('phaseLabel').textContent = title;
  $('hint').textContent = hint;
  $('sceneProgress').textContent = title;
}

function panel(open) {
  const wasOpen = S.reading;
  S.reading = open;
  document.body.classList.toggle('reading', open);
  $('reader').inert = !open;
  $('study').setAttribute('aria-expanded', String(open));
  $('study').textContent = open ? '收起' : '研讀';
  if (open) $('reader').querySelector('.paper').scrollTop = 0;
  resize();
  if (compactReading() && open) {
    $('moreControls').open = false;
    requestAnimationFrame(() => $('dismissReader').focus({preventScroll:true}));
  } else if (compactReading() && wasOpen) $('study').focus({preventScroll:true});
}

async function action(fn, autoToken = null) {
  if (S.busy) return false;
  if (!autoToken && run) stopAuto('quiet');
  const generation = S.gen;
  S.busy = true;
  controls();
  try { await fn(); }
  catch (e) {
    if (e !== CANCEL) { console.error(e); toast('這個動作沒有完成，可以用「重播本幕」或「回書架」重新開始。'); }
  }
  finally { if (generation === S.gen) { S.busy = false; controls(); } }
  return true;
}

/* ── 閱讀區內容 ───────────────────────────────────────── */
function listOf(arr, cls) {
  const box = document.createElement('div');
  arr.forEach(t => {
    const el = document.createElement(cls === 'orig' ? 'blockquote' : 'p');
    el.className = cls;
    el.textContent = t;
    box.append(el);
  });
  return box;
}

function glossOf(gloss) {
  const box = document.createElement('dl');
  gloss.forEach(g => {
    const dt = document.createElement('dt');
    dt.textContent = g.y ? `${g.t}（${g.y}）` : g.t;
    const dd = document.createElement('dd');
    dd.textContent = g.d;
    box.append(dt, dd);
  });
  return box;
}

function renderAct(i) {
  const a = D.acts[i];
  $('actTitle').textContent = a.title;
  $('actLead').textContent = a.lead;
  $('originalBlock').replaceChildren(listOf(a.original, 'orig'));
  $('plainBlock').replaceChildren(listOf(a.plain, 'plain'));
  $('glossBlock').replaceChildren(glossOf(a.gloss));
  $('focusBox').hidden = true;
  $('readLabel').textContent = a.label;
  $('readingHint').textContent = a.hint;
  $('sceneCaption').textContent = a.lead;
  $('reading').hidden = false;
  $('quizHost').hidden = true;
  $('reader').querySelector('.paper').scrollTop = 0;

  const chips = $('chips');
  chips.replaceChildren();
  a.hotspots.forEach(h => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.hot = h.id;
    b.textContent = h.chip;
    b.onclick = () => action(() => triggerHotspot(h.id));
    chips.append(b);
  });
  syncChips();
  buildHotLabels();
}

function syncChips() {
  if (S.act < 0) return;
  const seen = S.visited[S.act];
  $('chips').querySelectorAll('.chip').forEach(b => {
    b.classList.toggle('done', seen.has(b.dataset.hot));
  });
  for (const [id, el] of hotEls) el.classList.toggle('done', seen.has(id));
}

function showFocus(h) {
  $('sceneCaption').textContent = h.original;
  $('focusOriginal').textContent = h.original;
  $('focusPlain').textContent = h.plain;
  $('focusBox').hidden = false;
}

function buildHotLabels() {
  hotEls.clear();
  const host = $('hotspots');
  host.replaceChildren();
  if (S.act < 0) return;
  D.acts[S.act].hotspots.forEach(h => {
    const b = document.createElement('button');
    b.className = 'hot';
    b.textContent = h.chip;
    b.onclick = () => action(() => triggerHotspot(h.id));
    host.append(b);
    hotEls.set(h.id, b);
  });
  syncChips();
}

function clearHotLabels() {
  hotEls.clear();
  $('hotspots').replaceChildren();
}

/* ── 景物互動 ─────────────────────────────────────────── */
async function triggerHotspot(id) {
  if (S.phase !== 'act' || S.act < 0) return;
  const a = acts[S.act], data = D.acts[S.act].hotspots.find(h => h.id === id);
  if (!data) return;
  sfx('tap');
  showFocus(data);
  if (!compactReading()) panel(true);
  S.visited[S.act].add(id);
  syncChips();
  const f = a.fx;

  if (S.act === 0) {
    if (id === 'boat' && f.boatT < 1) await tween(1500, t => { f.boatT = t; });
    if (id === 'peach') { await tween(900, t => { f.burst = t; }); await tween(1400, t => { f.burst = 1 - t; }); }
    if (id === 'source') await tween(1100, t => { f.glow = t; });
  }
  if (S.act === 1) {
    if (id === 'cave') {
      await tween(1500, t => { f.caveOpen = t; f.light = t; });
      await tween(900, t => { f.boatAside = t; });
    }
    if (id === 'field') {
      if (f.caveOpen < 1) await tween(900, t => { f.caveOpen = Math.max(f.caveOpen, t); f.light = Math.max(f.light, t); });
      await tween(1200, t => { f.ridge = t; });
      await tween(900, t => { f.far = t; });
    }
    if (id === 'path') await tween(1300, t => { f.path = t; });
  }
  if (S.act === 2) {
    if (id === 'meet') for (let i = 0; i < a.people.length; i++) await tween(520, t => { f.pop[i] = t; });
    if (id === 'origin') { await tween(1000, t => { f.layer2 = t; }); await tween(900, t => { f.lantern = t; }); }
    if (id === 'dynasty') {
      await tween(560, t => { f.pop[0] = t; });
      await tween(1200, t => { f.sway = t; f.layer2 = Math.max(f.layer2, t); });
    }
    if (id === 'farewell') {
      const lastIdx = a.people.length - 1;
      await tween(560, t => { f.pop[lastIdx] = t; });
      await tween(900, t => { f.sway = 1 - t * .6; f.bow = t; });
    }
  }
  if (S.act === 3) {
    if (id === 'marks') await tween(1200, t => { f.lift = t; });
    if (id === 'search') {
      if (f.lift < 1) await tween(700, t => { f.lift = Math.max(f.lift, t); });
      await tween(2200, t => { f.marks = 1 - t; f.pathFade = 1 - t * .85; f.mist = t; });
    }
    if (id === 'liu') await tween(1500, t => { f.mist = Math.max(f.mist, t * .8); f.dim = t; });
  }
  const left = D.acts[S.act].hotspots.filter(h => !S.visited[S.act].has(h.id)).length;
  setStatus(D.acts[S.act].label, left ? `還有 ${left} 處景物可看 · 或直接翻到下一頁` : D.acts[S.act].outro);
}

/* ── 轉場 ─────────────────────────────────────────────── */
async function turnPage(dir, toTex) {
  sfx('page');
  const pos = turnLeaf.geometry.attributes.position;
  for (let i = 0; i < pos.array.length; i++) pos.array[i] = leafBase[i];
  pos.needsUpdate = true;
  turnLeaf.material.map = dir > 0 ? pageMat.map : toTex;
  turnLeaf.material.needsUpdate = true;
  turnLeaf.visible = true;
  pageMat.map = toTex;
  pageMat.needsUpdate = true;
  await tween(1400, (t, raw) => {
    const v = dir > 0 ? t : 1 - t;
    turnLeaf.rotation.z = Math.PI * v;
    turnLeaf.position.y = .33 + .34 * Math.sin(raw * Math.PI) * .9;
    for (let i = 0; i < pos.count; i++) {
      const x = leafBase[i * 3];
      pos.setY(i, .11 + Math.sin(x / 3.9 * Math.PI) * (.085 + .48 * Math.sin(raw * Math.PI)));
    }
    pos.needsUpdate = true;
    turnLeaf.geometry.computeVertexNormals();
  });
  turnLeaf.visible = false;
}

async function enterAct(i, dir) {
  const prev = S.act >= 0 ? acts[S.act] : null;
  S.phase = 'turning';
  clearHotLabels();
  panel(false);
  setStatus('轉場中', '景物完全收合後，書頁才會翻動。');
  controls();
  if (prev) await popOut(prev);
  if (prev || dir !== 0) await turnPage(dir || 1, pageTex[i]);
  else pageMat.map = pageTex[i];
  S.act = i;
  resetAct(acts[i]);
  renderAct(i);
  S.phase = 'act';
  controls();
  await popIn(acts[i]);
  setStatus(D.acts[i].label, D.acts[i].hint);
  // Keep the scene visible on a narrow portrait screen; the reader button remains available.
  panel(!compactReading());
}

async function openBook() {
  panel(false);
  S.phase = 'opening';
  setStatus('展卷 · 桃源將啟', '書頁攤開，山水依序升起。');
  controls();
  sfx('page');
  pageMat.map = pageTex[0];
  reward.visible = false;
  await tween(1200, t => { leftCover.rotation.z = -Math.PI * (1 - t); book.position.x = -1.95 * (1 - t); });
  S.act = -1;
  await enterAct(0, 0);
}

async function enterQuiz() {
  const prev = S.act >= 0 ? acts[S.act] : null;
  S.phase = 'turning';
  clearHotLabels();
  panel(false);
  controls();
  if (prev) await popOut(prev);
  await turnPage(1, quizPaper);
  S.act = -1;
  S.phase = 'quiz';
  $('reading').hidden = true;
  $('quizHost').hidden = false;
  $('readLabel').textContent = '卷末 · 三題學習回顧';
  makeQuiz($('quizHost'), () => action(collect));
  setStatus('學習回顧 · 三題', '緣、妻子、結局各一題；答錯會給對應提示，可以再答。');
  controls();
  panel(true);
}

async function collect() {
  S.phase = 'rewarding';
  controls();
  panel(false);
  sfx('stamp');
  reward.visible = true;
  reward.material.opacity = 1;
  reward.scale.setScalar(.05);
  await tween(1000, t => {
    reward.scale.setScalar(.05 + .95 * t);
    reward.position.y = .6 + 1.3 * t;
    reward.rotation.y = (1 - t) * Math.PI;
  });
  await tween(1100, t => {
    reward.position.y = 1.9 + t * 2;
    reward.scale.setScalar(1 - t * .95);
    reward.material.opacity = 1 - t;
  });
  reward.visible = false;
  reward.material.opacity = 1;
  S.stamped = true;
  $('collection').innerHTML = '藏印 <b>一</b>';
  $('collection').classList.add('received');
  S.phase = 'finished';
  setStatus('朱印入藏 · ' + D.reward.name, '本次體驗完成；可以合書回架，或再讀一次。');
  showReward($('quizHost'));
  panel(true);
  controls();
}

function showReward(host) {
  host.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = D.reward.title + ' · ' + D.reward.name;
  const p = document.createElement('p');
  p.textContent = D.reward.text;
  const again = document.createElement('button');
  again.className = 'ink-button';
  again.textContent = '從第一幕再讀一次';
  again.onclick = () => {
    if (S.plain) {
      makeQuiz(host, () => showReward(host));
      $('plainBody').firstElementChild?.scrollIntoView({ behavior: 'auto', block: 'start' });
    } else action(() => enterAct(0, -1));
  };
  host.append(h, p, again);
  host.hidden = false;
}

async function closeBook() {
  panel(false);
  S.phase = 'closing';
  clearHotLabels();
  setStatus('收卷', '景物折回書頁。');
  controls();
  if (S.act >= 0 && acts[S.act].group.visible) await popOut(acts[S.act]);
  S.act = -1;
  reward.visible = false;
  turnLeaf.visible = false;
  sfx('page');
  await tween(1000, t => { leftCover.rotation.z = -Math.PI * t; book.position.x = -1.95 * t; });
  S.phase = 'cover';
  setStatus('第一卷 · 桃花源記', '點選展卷，讓桃源從書頁升起。');
  controls();
}

async function toShelf() {
  stopAuto('quiet');
  stopSong();
  if (S.phase !== 'cover') await closeBook();
  S.phase = 'returning';
  controls();
  S.framing = 'shelf';
  await tween(1300, t => {
    book.position.set(-1.95 + (-1.3 + 1.95) * t, 1.4 * Math.sin(t * Math.PI) + .75 * t, -7.4 * t);
    book.rotation.z = Math.PI / 2 * t;
    book.scale.setScalar(1 - .5 * t);
  });
  if (shelfLabels[0]) shelfLabels[0].visible = true;
  S.phase = 'shelf';
  S.act = -1;
  quiz = null;
  acts.forEach(resetAct);
  $('quizHost').hidden = true;
  $('reading').hidden = false;
  setStatus('書架 · 選一冊', '點書架上的桃花源記，或用右邊的書名按鈕。');
  controls();
}

async function selectBook(i) {
  if (i !== 0) {
    toast(D.shelf[i].title + '：本冊在原站聽曲與研讀，立體版尚未製作。');
    return;
  }
  S.phase = 'moving';
  setStatus('取書', '書從架上移到桌面。');
  controls();
  S.framing = 'table';
  if (shelfLabels[0]) shelfLabels[0].visible = false;
  sfx('tap');
  await tween(1300, t => {
    book.position.set(-1.3 + (-1.95 + 1.3) * t, .75 * (1 - t) + 1.4 * Math.sin(t * Math.PI), -7.4 * (1 - t));
    book.rotation.z = Math.PI / 2 * (1 - t);
    book.scale.setScalar(.5 + .5 * t);
  });
  book.position.set(-1.95, 0, 0);
  book.rotation.z = 0;
  book.scale.setScalar(1);
  S.phase = 'cover';
  setStatus('第一卷 · 桃花源記', '點選展卷，讓桃源從書頁升起。');
  controls();
}

/* ── 三題 ─────────────────────────────────────────────── */
function makeQuiz(host, onDone) {
  let idx = 0, ok = false;
  host.replaceChildren();
  const count = document.createElement('p'); count.className = 'sub';
  const q = document.createElement('h2'); q.tabIndex = -1;
  const cite = document.createElement('p'); cite.className = 'cite';
  const opts = document.createElement('div'); opts.className = 'answers';
  const fb = document.createElement('p'); fb.className = 'feedback'; fb.setAttribute('role', 'status');
  const next = document.createElement('button'); next.className = 'ink-button'; next.hidden = true;
  host.append(count, q, cite, opts, fb, next);

  function draw() {
    const item = D.quiz[idx];
    ok = false;
    count.textContent = `第 ${idx + 1} 題 ／ 共三題`;
    q.textContent = item.q;
    cite.textContent = item.cite;
    fb.textContent = '';
    next.hidden = true;
    opts.replaceChildren();
    item.options.forEach(o => {
      const b = document.createElement('button');
      b.textContent = o.t;
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => {
        if (ok) return;
        for (const x of opts.children) x.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        fb.textContent = o.n;
        sfx('tap');
        if (o.ok) {
          ok = true;
          next.textContent = idx === D.quiz.length - 1 ? '收下桃源朱印' : '下一題';
          next.hidden = false;
          next.focus();
        }
      };
      opts.append(b);
    });
    q.focus();
  }
  next.onclick = () => {
    if (!ok) return;
    if (idx < D.quiz.length - 1) { idx++; draw(); }
    else onDone();
  };
  draw();
  quiz = { host };
}

/* ── 自動展演 ─────────────────────────────────────────── */
function autoWait(ms) {
  const token = run;
  return new Promise((res, rej) => {
    let left = S.reduced ? Math.min(ms, 700) : ms, t0 = performance.now();
    (function tick() {
      if (!token || token.cancelled) return rej(CANCEL);
      const now = performance.now();
      if (!token.paused) left -= now - t0;
      t0 = now;
      left <= 0 ? res() : setTimeout(tick, 90);
    })();
  });
}

async function autoStep(fn) {
  const token = run;
  while (S.busy || token?.paused) { if (!token || token.cancelled) throw CANCEL; await new Promise(r => setTimeout(r, 90)); }
  if (!token || token.cancelled) throw CANCEL;
  await action(fn, token);
  if (!token || token.cancelled) throw CANCEL;
}

async function autoplay() {
  const token = run;
  const tempo = D.tempo;
  if (compactReading()) panel(false);
  if (S.phase === 'shelf') { await autoStep(() => selectBook(0)); await autoWait(tempo.turn); }
  if (S.phase === 'cover') { await autoStep(openBook); await autoWait(tempo.enter); }
  for (let i = Math.max(0, S.act); i < D.acts.length; i++) {
    if (S.phase !== 'act') break;
    if (S.act !== i) { await autoStep(() => enterAct(i, i > S.act ? 1 : -1)); await autoWait(tempo.enter); }
    for (const h of D.acts[i].hotspots) {
      if (token.cancelled) throw CANCEL;
      if (S.visited[i].has(h.id)) continue;
      await autoStep(() => triggerHotspot(h.id));
      await autoWait(tempo.hotspot);
    }
    await autoWait(tempo.beat);
  }
  if (S.phase === 'act' && S.act === D.acts.length - 1) await autoStep(enterQuiz);
  stopAuto('done');
}

function startAuto() {
  if (run) { run.paused = !run.paused; controls(); toast(run.paused ? '展演已暫停。' : '展演續播。'); return; }
  run = { cancelled: false, paused: false };
  controls();
  toast('自動展演開始。三題仍然由你自己作答。');
  autoplay().catch(e => { if (e !== CANCEL) { console.error(e); toast('展演中斷，可以手動繼續。'); stopAuto('quiet'); } });
}

function stopAuto(reason) {
  if (!run) return;
  run.cancelled = true;
  run = null;
  controls();
  if (reason === 'done') toast('展演走完四幕。三題請自己作答。');
  else if (reason === 'exit') toast(S.busy ? '已退出展演；目前動作收尾後可手動操作。' : '已退出展演，改由你操作。');
}

/* ── 聲音 ─────────────────────────────────────────────── */
function stopSong() {
  const s = $('song');
  if (!s.paused) s.pause();
  s.currentTime = 0;
  $('sound').textContent = '聽曲';
  $('sound').setAttribute('aria-pressed', 'false');
}

async function toggleSong() {
  const s = $('song');
  if (s.paused) {
    try {
      s.volume = .4;
      await s.play();
      $('sound').textContent = '停止歌曲';
      $('sound').setAttribute('aria-pressed', 'true');
    } catch (e) {
      toast('歌曲未能播放。請再按一次「聽曲」，或確認瀏覽器允許聲音。');
    }
  } else {
    s.pause();
    $('sound').textContent = '聽曲';
    $('sound').setAttribute('aria-pressed', 'false');
  }
}

/* ── 簡化閱讀（WebGL 不可用時的完整文字） ─────────────── */
function buildPlain() {
  const host = $('plainBody');
  if (host.childElementCount) return;
  D.acts.forEach(a => {
    const sec = document.createElement('section');
    sec.className = 'plain-act';
    const h = document.createElement('h2');
    h.textContent = a.label;
    const lead = document.createElement('p');
    lead.className = 'sub';
    lead.textContent = a.lead;
    const h1 = document.createElement('h3'); h1.textContent = '原文';
    const h2 = document.createElement('h3'); h2.textContent = '白話';
    const h3 = document.createElement('h3'); h3.textContent = '景物與短句';
    const spots = document.createElement('div');
    a.hotspots.forEach(s => {
      const wrap = document.createElement('div');
      wrap.className = 'plain-spot';
      const t = document.createElement('p');
      t.className = 'spot-name';
      t.textContent = s.chip + '｜' + s.name;
      const o = document.createElement('blockquote');
      o.className = 'orig';
      o.textContent = s.original;
      const pl = document.createElement('p');
      pl.className = 'plain';
      pl.textContent = s.plain;
      wrap.append(t, o, pl);
      spots.append(wrap);
    });
    const gl = document.createElement('details');
    const sm = document.createElement('summary');
    sm.textContent = '字義箋注';
    gl.append(sm, glossOf(a.gloss));
    sec.append(h, lead, h1, listOf(a.original, 'orig'), h2, listOf(a.plain, 'plain'), h3, spots, gl);
    host.append(sec);
  });
  const quizSec = document.createElement('section');
  quizSec.className = 'plain-act';
  const qh = document.createElement('h2');
  qh.textContent = '三題學習回顧';
  const qhost = document.createElement('div');
  quizSec.append(qh, qhost);
  host.append(quizSec);
  makeQuiz(qhost, () => {
    showReward(qhost);
    $('collection').innerHTML = '藏印 <b>一</b>';
    toast('三題完成。此版印記只記本次體驗。');
  });
}

function showPlain(message) {
  stopAuto('quiet');
  S.gen++;
  clearHotLabels();
  panel(false);
  S.plain = true;
  S.phase = 'plain';
  buildPlain();
  $('plainRead').hidden = false;
  $('loader').classList.add('hidden');
  $('loader').hidden = true;
  $('failure').hidden = false;
  $('failText').textContent = message;
  document.body.classList.add('plain-mode');
  document.body.dataset.phase = 'plain';
  S.busy = false;
  controls();
}

function hidePlain() {
  S.plain = false;
  $('plainRead').hidden = true;
  $('failure').hidden = true;
  document.body.classList.remove('plain-mode');
}

/* ── 畫面與輸入 ───────────────────────────────────────── */
function resize() { pendingResize = true; }

function applyResize() {
  pendingResize = false;
  if (!renderer) return;
  const rect = $('canvas').getBoundingClientRect();
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  view.distance = compactReading()
    ? Math.max(10.5, 9.7 / (2 * Math.tan(37 * Math.PI / 360) * camera.aspect))
    : Math.max(11, 9.6 / (camera.aspect * .67));
}

function placeHotLabels() {
  if (!hotEls.size || S.act < 0 || S.busy) {
    $('hotspots').classList.toggle('dim', true);
    return;
  }
  $('hotspots').classList.toggle('dim', false);
  // The narrow portrait view uses a separate row of touch targets. Projecting
  // all three anchors into a small scene made them overlap on mobile Safari.
  if (compactReading()) {
    for (const el of hotEls.values()) el.hidden = false;
    return;
  }
  const a = acts[S.act], rect = $('canvas').getBoundingClientRect(), v = new T.Vector3();
  for (const [id, el] of hotEls) {
    const h = a.hot[id];
    if (!h) { el.hidden = true; continue; }
    h.anchor.getWorldPosition(v);
    v.y += h.oy ?? .3;
    v.project(camera);
    const inside = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
    el.hidden = !inside;
    el.style.left = (v.x * .5 + .5) * rect.width + 'px';
    el.style.top = (-v.y * .5 + .5) * rect.height + 'px';
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!renderer) return;
  if (pendingResize) applyResize();
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  if (!document.hidden && !run?.paused) clock += dt;
  const par = S.reduced ? 0 : 1;

  book.rotation.y = T.MathUtils.lerp(book.rotation.y, par * pointer.x * .055, .05);
  const d = view.distance, a = 1 - Math.exp(-dt * 3);
  const shelf = S.framing === 'shelf';
  shelfGroup.visible = shelf;
  for (const decoration of roomDecor) decoration.visible = shelf;
  const target = shelf
    ? new T.Vector3(par * pointer.x * .5, 3.1, d * .44)
    : new T.Vector3(par * pointer.x * .22, d * .48 + .7, d * .877);
  const look = shelf ? new T.Vector3(0, 2.1, -7.4) : new T.Vector3(0, 1.05, 0);
  camera.position.lerp(target, a);
  camLook.lerp(look, a);
  camera.lookAt(camLook);

  if (S.act >= 0) {
    const act = acts[S.act];
    if (act.group.visible) {
      act.update(dt, !S.busy && S.phase === 'act');
      applyAlpha(act);
    }
  }
  placeHotLabels();
  renderer.render(scene, camera);
}

function bind() {
  const stage = $('canvas');
  $('moreControls').addEventListener('click', e => {
    if (e.target.closest('button, a')) $('moreControls').open = false;
  });
  document.addEventListener('pointerdown', e => {
    if (!$('moreControls').contains(e.target)) $('moreControls').open = false;
  });
  stage.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect();
    pointer.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
    pointer.y = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
  });
  stage.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; });

  let down = null;
  stage.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || S.busy) return;
    const rect = stage.getBoundingClientRect();
    mouse.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    if (S.phase === 'shelf') {
      if (ray.intersectObjects([book], true).length) { action(() => selectBook(0)); return; }
      const hit = ray.intersectObjects(shelfGroup.children, false)[0];
      if (!hit) return;
      const idx = hit.object.userData.bookIndex;
      if (idx === undefined) return;
      action(() => selectBook(idx));
      return;
    }
    if (S.phase === 'cover') { action(openBook); return; }
    if (S.phase !== 'act' || S.act < 0) return;
    const a = acts[S.act];
    const list = Object.entries(a.hot).map(([id, h]) => ({ id, m: h.mesh }));
    const hits = ray.intersectObjects(list.map(x => x.m), false);
    if (!hits.length) return;
    const pick = list.find(x => x.m === hits[0].object);
    if (pick) action(() => triggerHotspot(pick.id));
  });

  $('primary').onclick = () => action(async () => {
    const p = S.phase;
    if (p === 'shelf') await selectBook(0);
    else if (p === 'cover') await openBook();
    else if (p === 'act') S.act < 3 ? await enterAct(S.act + 1, 1) : await enterQuiz();
    else if (p === 'quiz') panel(true);
    else if (p === 'finished') await toShelf();
  });
  $('next').onclick = () => action(async () => {
    if (S.phase === 'cover') await openBook();
    else if (S.phase === 'act') S.act < 3 ? await enterAct(S.act + 1, 1) : await enterQuiz();
  });
  $('prev').onclick = () => action(async () => {
    if (S.phase === 'quiz') await enterAct(3, -1);
    else if (S.phase === 'act' && S.act > 0) await enterAct(S.act - 1, -1);
  });
  $('replay').onclick = () => action(async () => {
    if (S.phase !== 'act') return;
    const a = acts[S.act];
    await popOut(a);
    resetAct(a);
    renderAct(S.act);
    setStatus(D.acts[S.act].label, D.acts[S.act].hint);
    await popIn(a);
  });
  $('backShelf').onclick = () => action(toShelf);
  $('study').onclick = () => panel(!S.reading);
  $('dismissReader').onclick = () => panel(false);
  $('auto').onclick = startAuto;
  $('autoStop').onclick = () => stopAuto('exit');

  $('sound').onclick = toggleSong;
  $('song').onended = () => { $('sound').textContent = '聽曲'; $('sound').setAttribute('aria-pressed', 'false'); };
  $('sfx').onclick = () => {
    S.sfx = !S.sfx;
    $('sfx').setAttribute('aria-pressed', String(S.sfx));
    $('sfx').textContent = S.sfx ? '音效' : '音效關';
    if (S.sfx) sfx('tap');
  };
  $('motion').onclick = () => {
    S.reduced = !S.reduced;
    document.body.classList.toggle('reduce', S.reduced);
    $('motion').setAttribute('aria-pressed', String(S.reduced));
    toast(S.reduced ? '已減少動態：粒子與浮動停止，流程與文字不變。' : '已開啟景物浮動與平滑翻頁。');
  };
  $('motion').setAttribute('aria-pressed', String(S.reduced));
  document.body.classList.toggle('reduce', S.reduced);

  $('retry').onclick = () => { hidePlain(); boot(true); };
  $('toPlain').onclick = () => { $('failure').hidden = true; };

  new ResizeObserver(resize).observe($('canvas'));
  addEventListener('orientationchange', resize);
  addEventListener('resize', resize);

  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape') {
      if ($('moreControls').open) { $('moreControls').open = false; return; }
      if (run) { stopAuto('exit'); return; }
      if (S.reading) panel(false);
      return;
    }
    if (S.plain) return;
    if (e.key === 'ArrowRight') { $('next').disabled || $('next').click(); }
    else if (e.key === 'ArrowLeft') { $('prev').disabled || $('prev').click(); }
    else if (e.key === 'r' || e.key === 'R') { $('replay').disabled || $('replay').click(); }
    else if (e.key === 's' || e.key === 'S') { $('study').disabled || $('study').click(); }
  });
}

function buildShelfList() {
  const list = $('shelfList');
  list.replaceChildren();
  D.shelf.forEach((item, i) => {
    const li = document.createElement('li');
    if (item.mode === 'solid') {
      const b = document.createElement('button');
      b.className = 'shelf-pick';
      b.innerHTML = `<b>${item.title}</b><span>${item.author}　${item.note}</span>`;
      b.onclick = () => action(() => selectBook(i));
      li.append(b);
    } else {
      li.className = 'shelf-off';
      li.innerHTML = `<b>${item.title}</b><span>${item.author}　${item.note}</span>`;
    }
    list.append(li);
  });
}

function noteMissing() {
  const el = $('assetNote');
  if (!S.missing.length) { el.hidden = true; return; }
  const names = S.missing.map(k => {
    const a = D.assets.find(x => x.key === k);
    return `assets/${a.file}（${a.label}）`;
  }).join('、');
  el.textContent = `缺少素材：${names}。目前用程式畫的簡化替代圖，補上檔案後重新整理即可。`;
  el.hidden = false;
}

/* ── 啟動 ─────────────────────────────────────────────── */
async function loadAssets() {
  const loader = new T.TextureLoader();
  S.missing = [];
  await Promise.all(D.assets.map(async a => {
    try {
      tex[a.key] = prep(await loader.loadAsync('assets/' + a.file));
    } catch (e) {
      if (a.required) throw new Error('必需素材讀取失敗：assets/' + a.file);
      S.missing.push(a.key);
      tex[a.key] = placeholder(a.key);
    }
  }));
}

async function init() {
  if (!T) throw new Error('Three.js 未載入');
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  $('canvas').replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  scene = new T.Scene();
  camera = new T.PerspectiveCamera(37, 1, .1, 120);
  camLook = new T.Vector3(0, 2.1, -7.4);
  scene.add(new T.AmbientLight(0xffefd6, .85));
  const key = new T.DirectionalLight(0xffe0ac, 1);
  key.position.set(-3, 8, 6);
  scene.add(key);
  const fill = new T.DirectionalLight(0xc3d6ce, .35);
  fill.position.set(5, 3, -3);
  scene.add(fill);

  await loadAssets();
  await Promise.race([document.fonts.load('24px HuiWen'), new Promise(r => setTimeout(r, 3500))]);

  pageTex = [tex.ground, fieldPage(), villagePage(), mistPage()];
  quizPaper = paperTexture();
  const coverMat = new T.MeshStandardMaterial({ map: woodTexture(), roughness: .72, metalness: .15 });
  buildRoom();
  buildBook(coverMat);
  acts = [buildAct1(), buildAct2(), buildAct3(), buildAct4()];
  acts.forEach(a => poseAct(a, 0));

  book.position.set(-1.3, .75, -7.4);
  book.rotation.z = Math.PI / 2;
  book.scale.setScalar(.5);
  leftCover.rotation.z = -Math.PI;

  buildShelfList();
  noteMissing();
  applyResize();
  camera.position.set(0, 3.1, view.distance * .44);
  camera.lookAt(camLook);

  S.phase = 'shelf';
  S.framing = 'shelf';
  S.busy = false;
  setStatus('書架 · 選一冊', '點書架上的桃花源記，或用右邊的書名按鈕。');
  controls();
  $('loader').classList.add('hidden');
  if (!raf) raf = requestAnimationFrame(frame);

  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    renderer = null;
    showPlain('繪圖內容被瀏覽器中斷。下面是同一份完整文字；可以按「重試立體書」。');
  });
}

let bound = false;
async function boot(retry) {
  if (S.booting) return;
  S.booting = true;
  stopAuto('quiet');
  S.gen++;
  S.act = -1;
  S.busy = true;
  S.phase = 'loading';
  S.visited.forEach(s => s.clear());
  clearHotLabels();
  panel(false);
  $('loader').hidden = false;
  $('loader').classList.remove('hidden');
  $('loadText').textContent = retry ? '重新備紙・研墨・展卷' : '備紙・研墨・展卷';
  document.body.dataset.phase = 'loading';
  if (!bound) { bind(); bound = true; }
  try {
    if (renderer) { cancelAnimationFrame(raf); raf = 0; renderer.dispose(); renderer = null; }
    await init();
  } catch (e) {
    console.error(e);
    showPlain(String(e.message || e).includes('素材')
      ? '立體書的必需圖片沒有讀到。下面是同一份完整文字；可以按「重試立體書」。'
      : '立體書未能啟動（需要可用的 WebGL）。下面是同一份完整文字；可以按「重試立體書」。');
  } finally {
    S.booting = false;
  }
}

if (!D) {
  document.addEventListener('DOMContentLoaded', () => {
    $('loadText').textContent = '故事資料 data.js 未載入，請重新整理。';
  });
} else {
  boot(false);
}
