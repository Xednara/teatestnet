// 3D-Szenen (three.js) für das WoW-Fakten-Video. Alles ist eine reine Funktion der Zeit -> deterministisch.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const W = 1080, H = 1920;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eo = t => 1 - Math.pow(1 - clamp(t), 3);
const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(x, y, s = 0) { let h = Math.imul((x * 374761393 + y * 668265263 + s * 1442695041) | 0, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash(xi, yi, s), hash(xi + 1, yi, s), u), lerp(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), u), v); }
function fbm(x, y, o = 5, s = 0) { let a = .5, f = 1, r = 0; for (let i = 0; i < o; i++) { r += a * vnoise(x * f, y * f, s + i); a *= .5; f *= 2; } return r; }

// ------------------------------------------------------------------ Renderer
const glc = document.createElement('canvas'); glc.width = W; glc.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 1, .6, .8);
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());

// ------------------------------------------------------------------ Texturen
function canvasTex(w, h, draw, rx = 1, ry = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const GLOW = canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
function brickDraw(base, vari, mortar) {
  return (x, w, h) => {
    const R = rng(3); x.fillStyle = mortar; x.fillRect(0, 0, w, h);
    const rows = 8, bh = h / rows;
    for (let r = 0; r < rows; r++) {
      let px = (r % 2) * -40;
      while (px < w) {
        const bw = 60 + R() * 60; const l = base + (R() - .5) * vari;
        x.fillStyle = `hsl(${20 + R() * 20},${8 + R() * 8}%,${l}%)`; x.fillRect(px + 3, r * bh + 3, bw - 6, bh - 6);
        for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(0,0,0,${R() * .25})`; x.fillRect(px + 3 + R() * bw, r * bh + 3 + R() * bh, 6 + R() * 14, 3 + R() * 6); }
        px += bw;
      }
    }
  };
}
const TEX = {};
function tex(name, mk) { return TEX[name] ??= mk(); }
const brickTex = (rx, ry) => { const t = tex('brick', () => canvasTex(512, 512, brickDraw(30, 14, '#0c0a09'))).clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; };
const brickBump = (rx, ry) => { const t = tex('brickb', () => canvasTex(512, 512, brickDraw(60, 20, '#000'), 1, 1, false)).clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; };
function cobbleDraw(x, w, h) {
  const R = rng(9); x.fillStyle = '#17130f'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const px = R() * w, py = R() * h, r = 12 + R() * 14; for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { x.fillStyle = `hsl(${25 + R() * 15},10%,${22 + R() * 22}%)`; x.beginPath(); x.ellipse(px + ox, py + oy, r, r * .78, R() * 3, 0, 7); x.fill(); } }
}
function rockDraw(x, w, h) {
  const im = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const n = fbm(i / 40, j / 40, 5, 7), c = 40 + n * 120; const k = (j * w + i) * 4; im.data[k] = c; im.data[k + 1] = c * .92; im.data[k + 2] = c * .88; im.data[k + 3] = 255; }
  x.putImageData(im, 0, 0);
}
function waveNormal() {
  return canvasTex(256, 256, (x, w, h) => {
    const im = x.createImageData(w, h); const hgt = (i, j) => fbm(((i + w) % w) / 24, ((j + h) % h) / 24, 4, 3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const dx = (hgt(i + 1, j) - hgt(i - 1, j)) * 6, dy = (hgt(i, j + 1) - hgt(i, j - 1)) * 6; const k = (j * w + i) * 4; im.data[k] = 128 + dx * 127; im.data[k + 1] = 128 + dy * 127; im.data[k + 2] = 255; im.data[k + 3] = 255; }
    x.putImageData(im, 0, 0);
  }, 30, 30, false);
}

// ------------------------------------------------------------------ Bausteine
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0, ...o });
const hdr = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; return m; }
function glowPoints(n, size, color, opacity = 1) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  p.frustumCulled = false; return p;
}
function skyDome(top, mid, hor, glowCol, glowDir, glowPow = 6) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, hor: { value: new THREE.Color(hor) }, gcol: { value: new THREE.Color(glowCol) }, gdir: { value: glowDir.clone().normalize() }, gpow: { value: glowPow } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top,mid,hor,gcol,gdir; uniform float gpow; varying vec3 vd; void main(){ vec3 d=normalize(vd); float h=clamp(d.y,0.0,1.0); vec3 c=mix(hor,mid,smoothstep(0.0,0.22,h)); c=mix(c,top,smoothstep(0.18,0.75,h)); float g=pow(max(dot(normalize(vec3(d.x,0.0,d.z)),normalize(vec3(gdir.x,0.0,gdir.z))),0.0),gpow)*(1.0-smoothstep(0.0,0.4,h)); c+=gcol*g; gl_FragColor=vec4(c,1.0); }',
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), m); s.frustumCulled = false; return s;
}
function stars(n = 1400, seed = 1) {
  const R = rng(seed), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = R() * 6.283, y = R() * .95 + .04, r = Math.sqrt(1 - y * y); pos[i * 3] = Math.cos(a) * r * 1300; pos[i * 3 + 1] = y * 1300; pos[i * 3 + 2] = Math.sin(a) * r * 1300; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, color: new THREE.Color(1.6, 1.6, 2), fog: false, transparent: true, depthWrite: false })); p.frustumCulled = false; return p;
}
function moon(pos, size, tint = [1, 1, 1]) {
  const t = canvasTex(256, 256, (x) => { x.fillStyle = '#fff3dc'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill(); x.fillStyle = 'rgba(190,160,130,.4)';[[90, 90, 28], [160, 140, 20], [130, 70, 13], [100, 170, 18], [180, 95, 11]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }); });
  const g = new THREE.Group();
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, color: new THREE.Color(1.25 * tint[0], 1.2 * tint[1], 1.1 * tint[2]) })); m.scale.setScalar(size);
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, fog: false, blending: THREE.AdditiveBlending, color: new THREE.Color(.1, .1, .17), depthWrite: false })); h.scale.setScalar(size * 3);
  g.add(h, m); g.position.copy(pos); g.userData = { m, h }; return g;
}
const pineGeo = (() => { const a = new THREE.ConeGeometry(1.5, 3.2, 7).translate(0, 2.6, 0), b = new THREE.ConeGeometry(1.1, 2.6, 7).translate(0, 4.4, 0), c = new THREE.ConeGeometry(.7, 2, 7).translate(0, 5.9, 0), d = new THREE.CylinderGeometry(.2, .25, 1.2, 5).translate(0, .6, 0); return mergeGeometries([a, b, c, d]); })();
function pines(list, color = 0x0b1a12) {
  const im = new THREE.InstancedMesh(pineGeo, std(color, { roughness: 1 }), list.length), d = new THREE.Object3D();
  list.forEach(([x, y, z, s], i) => { d.position.set(x, y, z); d.scale.set(s, s * (1 + .3 * hash(i, 7)), s); d.rotation.y = i; d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.castShadow = true; return im;
}

// Held aus Grundformen (dicke Schulterplatten, Umhang, leuchtendes Schwert)
function makeHero({ armor = 0x56607a, cloth = 0x8a1515, eyes = null, blade = [1.2, 1.5, 2.2], trim = 0xc9a23a } = {}) {
  const g = new THREE.Group(), mA = std(armor, { metalness: .8, roughness: .35 }), mT = std(trim, { metalness: .9, roughness: .3 }), mD = std(0x14141a, { roughness: .7 }), mC = std(cloth, { side: THREE.DoubleSide, roughness: .95 });
  const body = new THREE.Group(); body.position.y = 1.02; g.add(body);
  const add = (p, m) => { p.add(m); return m; };
  const torso = add(body, mesh(new THREE.CapsuleGeometry(.3, .42, 4, 12), mA, 0, .56, 0)); torso.scale.set(1.2, 1, .82);
  add(body, mesh(new THREE.SphereGeometry(.3, 12, 8), mD, 0, .12, 0)).scale.set(1.12, .7, .85);
  add(body, mesh(new THREE.TorusGeometry(.3, .05, 6, 16), mT, 0, .22, 0)).rotation.x = Math.PI / 2;
  const head = add(body, mesh(new THREE.SphereGeometry(.2, 14, 12), mA, 0, 1.14, 0));
  add(head, mesh(new THREE.BoxGeometry(.26, .05, .1), mD, 0, .02, .16));
  add(head, mesh(new THREE.ConeGeometry(.05, .34, 6), mT, 0, .26, -.02));
  for (const s of [-1, 1]) {
    const hn = add(head, mesh(new THREE.ConeGeometry(.045, .3, 6), mT, s * .2, .12, 0)); hn.rotation.z = -s * 1.0;
    const pd = add(body, mesh(new THREE.SphereGeometry(.26, 12, 10), mA, s * .5, .93, 0)); pd.scale.set(1.15, .85, 1.15);
    const sp = add(body, mesh(new THREE.ConeGeometry(.08, .34, 6), mT, s * .6, 1.16, 0)); sp.rotation.z = -s * .5;
    add(body, mesh(new THREE.TorusGeometry(.25, .035, 6, 14), mT, s * .5, .9, 0)).rotation.set(Math.PI / 2, 0, 0);
  }
  if (eyes) for (const s of [-1, 1]) add(head, mesh(new THREE.SphereGeometry(.035, 6, 6), hdr(...eyes), s * .07, .02, .19, false));
  const limb = (px, py, r1, l1, r2, l2, mat) => {
    const a = new THREE.Group(); a.position.set(px, py, 0); body.add(a);
    add(a, mesh(new THREE.CapsuleGeometry(r1, l1, 3, 8), mat, 0, -(l1 / 2 + r1 * .6), 0));
    const b = new THREE.Group(); b.position.y = -(l1 + r1 * 1.2); a.add(b);
    add(b, mesh(new THREE.CapsuleGeometry(r2, l2, 3, 8), mat, 0, -(l2 / 2 + r2 * .6), 0));
    return [a, b];
  };
  const [armL, elbowL] = limb(-.5, .86, .1, .3, .09, .28, mA), [armR, elbowR] = limb(.5, .86, .1, .3, .09, .28, mA);
  const [legL, kneeL] = limb(-.17, 0, .13, .34, .11, .36, mD), [legR, kneeR] = limb(.17, 0, .13, .34, .11, .36, mD);
  for (const k of [kneeL, kneeR]) add(k, mesh(new THREE.BoxGeometry(.2, .14, .36), mA, 0, -.5, .07));
  const sword = new THREE.Group(); sword.position.y = -.42; elbowR.add(sword);
  add(sword, mesh(new THREE.BoxGeometry(.42, .06, .1), mT, 0, -.04, 0));
  const bm = new THREE.MeshStandardMaterial({ color: 0xdde8ff, metalness: 1, roughness: .2, emissive: new THREE.Color(...blade), emissiveIntensity: .9 });
  add(sword, mesh(new THREE.BoxGeometry(.035, 1.5, .15), bm, 0, -.84, 0));
  const cg = new THREE.PlaneGeometry(.95, 1.35, 6, 8); cg.translate(0, -.675, 0);
  const cape = add(body, mesh(cg, mC, 0, .98, -.27)); const base = cg.attributes.position.array.slice();
  function pose(ph, mode = 'run') {
    const s = Math.sin(ph), c = Math.cos(ph);
    if (mode === 'run') {
      body.rotation.x = .26; body.position.y = 1.02 + Math.abs(s) * .07;
      legL.rotation.x = s * 1.0; legR.rotation.x = -s * 1.0; kneeL.rotation.x = Math.max(0, -c) * 1.3 + .2; kneeR.rotation.x = Math.max(0, c) * 1.3 + .2;
      armL.rotation.x = -s * .9; elbowL.rotation.x = -.9; armR.rotation.x = Math.PI * .9 + Math.sin(ph * 2) * .08; armR.rotation.z = -.15; elbowR.rotation.x = -.15;
    } else {
      body.rotation.x = 0; body.position.y = 1.02; legL.rotation.x = -.12; legR.rotation.x = .12; kneeL.rotation.x = kneeR.rotation.x = .1;
      armL.rotation.x = .1; armL.rotation.z = -.2; elbowL.rotation.x = -.3; armR.rotation.x = Math.PI * .9 + Math.sin(ph) * .1; armR.rotation.z = -.15; elbowR.rotation.x = -.1;
    }
    const p = cg.attributes.position.array, fl = mode === 'run' ? 1 : .35;
    for (let i = 0; i < p.length; i += 3) { const u = -base[i + 1] / 1.35; p[i + 2] = -(u * (.25 + .5 * fl) + Math.sin(ph * 2 - u * 4 + base[i] * 2) * .13 * u * fl); p[i + 1] = base[i + 1] * (1 - .25 * fl * u); }
    cg.attributes.position.needsUpdate = true; cg.computeVertexNormals();
  }
  return { g, body, armR, elbowR, pose };
}
function crowdGeo(low) {
  if (low) return mergeGeometries([new THREE.CylinderGeometry(.2, .26, 1.25, 5).translate(0, .62, 0), new THREE.OctahedronGeometry(.19, 0).translate(0, 1.48, 0), new THREE.BoxGeometry(.66, .2, .3).translate(0, 1.2, 0)].map(g => g.index ? g.toNonIndexed() : g));
  return mergeGeometries([new THREE.CapsuleGeometry(.09, .6, 2, 6).translate(-.11, .4, 0), new THREE.CapsuleGeometry(.09, .6, 2, 6).translate(.11, .4, 0), new THREE.CapsuleGeometry(.21, .42, 3, 8).scale(1.15, 1, .75).translate(0, 1.08, 0), new THREE.SphereGeometry(.16, 8, 6).translate(0, 1.62, 0), new THREE.CapsuleGeometry(.07, .5, 2, 6).translate(-.33, 1.05, 0), new THREE.CapsuleGeometry(.07, .5, 2, 6).translate(.33, 1.05, 0)]);
}
function makeDragon(color = 0x1a0606, emissive = 0x000000) {
  const g = new THREE.Group(), m = std(color, { roughness: .6, emissive, emissiveIntensity: .6, side: THREE.DoubleSide });
  g.add(mesh(new THREE.SphereGeometry(.5, 10, 8).scale(1.6, .55, .55), m));
  const neck = mesh(new THREE.ConeGeometry(.2, 1, 6), m, 1.1, .15, 0); neck.rotation.z = -1.2; g.add(neck);
  g.add(mesh(new THREE.SphereGeometry(.2, 8, 6).scale(1.6, .8, .8), m, 1.6, .32, 0));
  const tail = mesh(new THREE.ConeGeometry(.2, 1.9, 6), m, -1.6, 0, 0); tail.rotation.z = 1.57; g.add(tail);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(.5, 0); sh.lineTo(.2, 2.2); sh.lineTo(-.15, 1.3); sh.lineTo(-.55, 1.7); sh.lineTo(-.6, .9); sh.lineTo(-1.0, 1.0); sh.lineTo(-.55, 0);
  const wg = new THREE.ShapeGeometry(sh); wg.rotateX(Math.PI / 2);
  const wings = [1, -1].map(s => { const p = new THREE.Group(); const w = mesh(wg, m); w.scale.z = s; p.add(w); p.position.set(.15, .15, s * .2); g.add(p); return [p, s]; });
  return { g, flap(ph) { for (const [p, s] of wings) p.rotation.x = s * Math.sin(ph) * .9; } };
}

// ------------------------------------------------------------------ Szene: Landschaft (Hook / Outro / TV)
function landH(x, z) {
  const n = fbm(x * .012 + 3, z * .012 + 7, 5, 1);
  const v = sstep(16, 60, Math.abs(x) + Math.max(0, -(z + 50)) * 1.3);
  let h = -3 + v * (7 + n * 26);
  const far = sstep(70, 190, Math.hypot(x, z + 20)) * lerp(1, sstep(22, 75, Math.abs(x)), sstep(-95, -45, z)); const rd = 1 - Math.abs(2 * fbm(x * .009 + 11, z * .009 + 5, 5, 4) - 1);
  h += far * 85 * rd * rd;
  h += 27 * Math.exp(-((x + 6) ** 2 + (z + 80) ** 2) / (2 * 15 * 15));
  return h;
}
function buildCastle() {
  const g = new THREE.Group(), st = std(0x6a6478, { map: brickTex(3, 3), bumpMap: brickBump(3, 3), bumpScale: 2 }), rf = std(0x2a1a3a, { roughness: .6 });
  const tower = (x, z, r, h, rh) => { g.add(mesh(new THREE.CylinderGeometry(r, r * 1.12, h, 12), st, x, h / 2, z)); g.add(mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.1, 1, 12), st, x, h, z)); g.add(mesh(new THREE.ConeGeometry(r * 1.35, rh, 12), rf, x, h + .5 + rh / 2, z)); };
  g.add(mesh(new THREE.BoxGeometry(18, 9, 12), st, 0, 4.5, 0)); g.add(mesh(new THREE.BoxGeometry(9, 15, 8), st, 0, 7.5, -1));
  tower(-9, 6, 2, 15, 6); tower(9, 6, 2, 15, 6); tower(-9, -6, 2.2, 19, 7); tower(9, -6, 2.2, 22, 7); tower(0, -2, 2.8, 33, 10); tower(-4.5, 2, 1.5, 24, 6); tower(5, 1, 1.4, 20, 5);
  const R = rng(5), wm = hdr(5, 2.6, .7), wins = new THREE.InstancedMesh(new THREE.BoxGeometry(.45, .9, .2), wm, 60), d = new THREE.Object3D();
  const tw = [[-9, 6, 2, 15], [9, 6, 2, 15], [-9, -6, 2.2, 19], [9, -6, 2.2, 22], [0, -2, 2.8, 33], [-4.5, 2, 1.5, 24], [5, 1, 1.4, 20]];
  for (let i = 0; i < 60; i++) { const [x, z, r, h] = tw[i % 7]; const a = (R() - .5) * 2.2 + Math.PI / 2; d.position.set(x + Math.cos(a) * r * 1.02, 4 + R() * (h - 6), z + Math.sin(a) * r * 1.02); d.rotation.y = -a + Math.PI / 2; d.updateMatrix(); wins.setMatrixAt(i, d.matrix); }
  g.add(wins); g.add(mesh(new THREE.BoxGeometry(2.6, 4, .3), hdr(3, 1.4, .4), 0, 2, 6.1));
  return g;
}
function sceneLand() {
  const sc = new THREE.Scene(); sc.fog = new THREE.FogExp2(0x2a1444, .0052);
  const moonPos = new THREE.Vector3(70, 125, -330);
  sc.add(skyDome(0x04020e, 0x23104a, 0xd8552e, 0xff7a2a, new THREE.Vector3(-.2, 0, -1), 3), stars(), moon(moonPos, 52));
  const g = new THREE.PlaneGeometry(700, 700, 260, 260); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) p.setY(i, landH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i), sl = 1 - nr.getY(i), n = fbm(p.getX(i) * .08, p.getZ(i) * .08, 3, 9);
    let c = [.05 + n * .04, .11 + n * .05, .07]; const rock = sstep(.12, .3, sl) + sstep(20, 34, h);
    c = c.map((v, k) => lerp(v, [.2, .17, .22][k] * (.7 + n * .6), clamp(rock)));
    const snow = sstep(40, 60, h + n * 14) * (1 - sstep(.35, .6, sl)); c = c.map((v, k) => lerp(v, [.8, .82, .95][k], snow));
    if (h < 1.2) c = c.map((v, k) => lerp([.09, .08, .08][k], v, sstep(0, 1.2, h)));
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sc.add(mesh(g, std(0xffffff, { vertexColors: true, roughness: 1 }), 0, 0, 0, false));
  const R = rng(21), tl = [];
  while (tl.length < 2600) { const x = (R() - .5) * 420, z = 90 - R() * 330, h = landH(x, z); if (h > .8 && h < 22 && Math.hypot(x + 6, z + 80) > 17) tl.push([x, h - .3, z, 1 + R() * 1.6]); }
  sc.add(pines(tl));
  const castle = buildCastle(); castle.scale.setScalar(1.7); castle.position.set(-6, landH(-6, -80) - 3, -80); sc.add(castle);
  const cl = new THREE.PointLight(0xff8a3a, 900, 70); cl.position.set(-6, landH(-6, -80) + 6, -66); sc.add(cl);
  const water = mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x070a14, metalness: 1, roughness: .2, normalMap: waveNormal(), normalScale: new THREE.Vector2(.18, .18), envMapIntensity: 1.1 }), 0, 0, 0, false); water.rotation.x = -Math.PI / 2; sc.add(water);
  sc.add(new THREE.HemisphereLight(0x5a3a9a, 0x0a0812, 1.1));
  const ml = new THREE.DirectionalLight(0xbfd0ff, 1.5); ml.position.copy(moonPos); sc.add(ml);
  const sl = new THREE.DirectionalLight(0xff7a3a, 2.0); sl.position.set(-200, 30, -300); sc.add(sl);
  const fl = new THREE.DirectionalLight(0x6a7ac8, 1.3); fl.position.set(40, 60, 200); sc.add(fl);
  const dr = makeDragon(0x05020a); dr.g.scale.setScalar(5); sc.add(dr.g);
  const em = glowPoints(260, .28, new THREE.Color(2.4, 1.1, .3), .9); sc.add(em);
  const emR = rng(8), emB = [...Array(260)].map(() => [(emR() - .5) * 60, emR() * 30, emR() * 90 - 60, .6 + emR() * 2, emR() * 6.28]);
  const cam = new THREE.PerspectiveCamera(52, W / H, .5, 3000), camTV = new THREE.PerspectiveCamera(42, 16 / 9, .5, 3000);
  // Wasser-Spiegelung: einmalig Umgebung aufnehmen
  const crt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }), cc = new THREE.CubeCamera(1, 3000, crt); cc.position.set(0, 2, 30);
  water.visible = false; cc.update(renderer, sc); water.visible = true; water.material.envMap = crt.texture;
  function update(t, mode, lt) {
    water.material.normalMap.offset.set(t * .012, t * .02);
    const dt = (t % 9) / 9; dr.g.position.set(lerp(-150, 190, dt), 68 + 10 * Math.sin(dt * 3.14), -170); dr.g.rotation.y = 0; dr.g.rotation.z = .1 * Math.sin(t * 2); dr.flap(t * 6);
    const pa = em.geometry.attributes.position.array;
    emB.forEach(([x, y, z, sp, ph], i) => { pa[i * 3] = x + Math.sin(t * .8 + ph) * 2; pa[i * 3 + 1] = (y + t * sp) % 30; pa[i * 3 + 2] = z; }); em.geometry.attributes.position.needsUpdate = true;
    cl.intensity = 900 * (.85 + .15 * Math.sin(t * 9));
    if (mode === 'hook') { const k = eio(lt / 3.8); cam.position.set(Math.sin(lt * .5) * 1.5 + 2, lerp(2.0, 7, k), lerp(70, 22, k)); cam.lookAt(-5, lerp(46, 38, k), -80); cam.fov = 52; }
    else if (mode === 'outro') { const a = .55 - lt * .07; cam.position.set(-6 + Math.sin(a) * 125, 78 - lt * 1.5, -80 + Math.cos(a) * 150); cam.lookAt(-6, 30, -80); cam.fov = 50; }
    else { camTV.position.set(8 + Math.sin(t * .2) * 6, 9, 46 - (t % 20) * .6); camTV.lookAt(-6, 36, -80); camTV.updateProjectionMatrix(); }
    cam.updateProjectionMatrix();
  }
  return { sc, cam, camTV, update, bloom: [.45, .6, .95], exp: 1.1 };
}

// ------------------------------------------------------------------ Szene: Seuche auf dem Stadtplatz
function scenePlague() {
  const sc = new THREE.Scene(), fogA = new THREE.Color(0x0b1226), fogB = new THREE.Color(0x3a0606); sc.fog = new THREE.FogExp2(fogA.getHex(), .013); sc.background = new THREE.Color(fogA);
  const cob = canvasTex(512, 512, cobbleDraw, 40, 40), cobB = canvasTex(512, 512, cobbleDraw, 40, 40, false);
  const gr = mesh(new THREE.PlaneGeometry(260, 260), std(0x9a9088, { map: cob, bumpMap: cobB, bumpScale: 3, roughness: .75 }), 0, 0, 0); gr.rotation.x = -Math.PI / 2; gr.castShadow = false; sc.add(gr);
  const R = rng(4), walls = [0x7a6a58, 0x8a7a62, 0x665648, 0x8f7f6a], roofs = [0x5a2a22, 0x3a3a4c, 0x4a2f20], wm = hdr(4, 2.2, .7);
  const house = (a, r, big) => {
    const w = 7 + R() * 5, d = 7 + R() * 4, h = (big ? 12 : 6) + R() * 7, g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w, h, d), std(walls[R() * 4 | 0]), 0, h / 2, 0));
    const rf = mesh(new THREE.ConeGeometry(Math.max(w, d) * .8, 4 + R() * 3, 4), std(roofs[R() * 3 | 0], { roughness: .7 }), 0, h + 2.4, 0); rf.rotation.y = Math.PI / 4; g.add(rf);
    for (let i = 0; i < 6; i++) if (R() > .35) g.add(mesh(new THREE.BoxGeometry(.8, 1.2, .1), wm, -w / 2 + 1.2 + (i % 3) * (w - 2.4) / 2, 2 + Math.floor(i / 3) * 3, d / 2 + .03, false));
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.lookAt(0, 0, 0); sc.add(g);
  };
  for (let i = 0; i < 26; i++) house(i / 26 * 6.283 + R() * .08, 35 + R() * 5, false);
  for (let i = 0; i < 22; i++) house(i / 22 * 6.283 + R() * .2, 52 + R() * 10, true);
  const st = std(0x6a665f, { map: brickTex(2, 1) });
  sc.add(mesh(new THREE.BoxGeometry(9, 46, 9), st, -30, 23, -52), mesh(new THREE.ConeGeometry(8, 14, 4), std(0x3a3a4c), -30, 53, -52));
  sc.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, .9, 20), st, 8, .45, -6), mesh(new THREE.CylinderGeometry(.5, .6, 3, 8), st, 8, 1.5, -6), mesh(new THREE.CylinderGeometry(3, 3, .1, 20), std(0x1b4a6a, { roughness: .1, metalness: .6 }), 8, .86, -6));
  const lg = glowPoints(8, 5, new THREE.Color(2.5, 1.4, .5)), lp = lg.geometry.attributes.position.array;
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + .3, x = Math.cos(a) * 17, z = Math.sin(a) * 17; sc.add(mesh(new THREE.CylinderGeometry(.09, .12, 4.4, 6), std(0x15151a), x, 2.2, z), mesh(new THREE.SphereGeometry(.28, 8, 8), hdr(6, 3.4, 1.2), x, 4.5, z, false)); lp.set([x, 4.5, z], i * 3); if (i % 2 === 0) { const l = new THREE.PointLight(0xffa050, 140, 34); l.position.set(x, 4.3, z); sc.add(l); } }
  sc.add(lg);
  const hemi = new THREE.HemisphereLight(0x4a5c99, 0x0a0a12, 1.3); sc.add(hemi);
  const ml = new THREE.DirectionalLight(0xa8baff, 2.2); ml.position.set(30, 55, 25); ml.castShadow = true; ml.shadow.mapSize.set(2048, 2048); Object.assign(ml.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 160 }); ml.shadow.bias = -.0006; sc.add(ml);
  const red = new THREE.PointLight(0xff2010, 0, 120); red.position.set(0, 9, 0); sc.add(red);
  const N = 280, geo = crowdGeo(false), cloth = [0x7a5a3a, 0x3a4a6a, 0x6a2a2a, 0x4a5a3a, 0x80704a, 0x5a3a5a];
  const healthy = new THREE.InstancedMesh(geo, std(0xffffff), N), sick = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8aff3a, emissive: 0xff2a08, emissiveIntensity: 2.2, roughness: .6 }), N), dead = new THREE.InstancedMesh(geo, std(0x2a0808), N);
  for (const m of [healthy, sick, dead]) { m.castShadow = true; m.frustumCulled = false; sc.add(m); }
  const ag = [...Array(N)].map((_, i) => { let x = 0, z = 0; if (i) do { const a = R() * 6.283, r = 1.6 + Math.sqrt(R()) * 28; x = Math.cos(a) * r; z = Math.sin(a) * r; } while (Math.hypot(x - 8, z + 6) < 4.5); const d = Math.hypot(x, z); healthy.setColorAt(i, new THREE.Color(cloth[R() * 6 | 0])); return { x, z, d, ti: i ? .75 + d / 9.2 + R() * .4 : .5, w1: .5 + R(), w2: .5 + R(), p: R() * 6.28, fa: R() * 6.28 }; });
  const mia = glowPoints(N, 2.2, new THREE.Color(1.6, .22, .1), .55); sc.add(mia);
  const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(.93, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, .16, .1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.y = .12; sc.add(r); return r; });
  const cam = new THREE.PerspectiveCamera(55, W / H, .1, 600), d = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0), fc = new THREE.Color();
  function update(t, lt) {
    let inf = 0; const mp = mia.geometry.attributes.position.array;
    ag.forEach((a, i) => {
      const x = a.x + .5 * Math.sin(lt * a.w1 + a.p), z = a.z + .4 * Math.cos(lt * a.w2 + a.p), k = lt - a.ti;
      d.position.set(x, 0, z); d.rotation.set(0, a.fa + .3 * Math.sin(lt * a.w1), 0); d.scale.setScalar(1); d.updateMatrix();
      healthy.setMatrixAt(i, k < 0 ? d.matrix : zero);
      if (k >= 0 && k < 1.5) { d.rotation.z = Math.sin(lt * 14 + a.p) * .12; d.updateMatrix(); sick.setMatrixAt(i, d.matrix); } else sick.setMatrixAt(i, zero);
      if (k >= 1.5) { const f = eo((k - 1.5) / .35); d.rotation.set(-f * 1.5, a.fa, 0); d.position.y = f * .22; d.updateMatrix(); dead.setMatrixAt(i, d.matrix); } else dead.setMatrixAt(i, zero);
      if (k >= 0) { inf++; mp[i * 3] = x + Math.sin(lt * 3 + a.p) * .3; mp[i * 3 + 1] = 1.2 + ((lt * .9 + a.p) % 1.6); mp[i * 3 + 2] = z; } else mp[i * 3 + 1] = -50;
    });
    for (const m of [healthy, sick, dead]) m.instanceMatrix.needsUpdate = true; mia.geometry.attributes.position.needsUpdate = true;
    const fr = inf / N; fc.copy(fogA).lerp(fogB, fr); sc.fog.color.copy(fc); sc.background.copy(fc);
    red.intensity = fr * 2600 * (.8 + .2 * Math.sin(lt * 8)); hemi.intensity = 1.3 - .5 * fr;
    rings.forEach((r, i) => { const rad = (lt - .7 - i * .4) * 9.2; r.visible = rad > 0; r.scale.setScalar(Math.max(.01, rad)); r.material.opacity = clamp(1 - rad / 34); });
    const k = eio((lt - .3) / 3.8), a = .5 + lt * .11, rad = lerp(4.6, 50, k), h = lerp(1.5, 36, k);
    cam.position.set(Math.sin(a) * rad, h, Math.cos(a) * rad); cam.lookAt(0, lerp(1.2, 0, k), lerp(0, -2, k)); cam.updateProjectionMatrix();
    return fr;
  }
  return { sc, cam, update, bloom: [.45, .5, .95], exp: 1.05 };
}

// ------------------------------------------------------------------ Szene: Dungeon-Gang + Brutstätte
function sceneCorridor() {
  const sc = new THREE.Scene(); sc.fog = new THREE.FogExp2(0x0a0503, .04); sc.background = new THREE.Color(0x050302);
  const L = 200, wallM = std(0x8a8078, { map: brickTex(50, 2), bumpMap: brickBump(50, 2), bumpScale: 4 });
  const fl = mesh(new THREE.PlaneGeometry(7.4, L), std(0x70665c, { map: brickTex(2, 50), bumpMap: brickBump(2, 50), bumpScale: 2, roughness: .45, metalness: .2 }), 0, 0, -L / 2 + 30); fl.rotation.x = -Math.PI / 2; sc.add(fl);
  for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(L, 7.4), wallM, s * 3.7, 3.7, -L / 2 + 30); w.rotation.y = -s * Math.PI / 2; sc.add(w); }
  const ce = mesh(new THREE.PlaneGeometry(7.4, L), std(0x2a2522), 0, 7.4, -L / 2 + 30); ce.rotation.x = Math.PI / 2; sc.add(ce);
  const NP = 24, pil = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, 7.4, .9), std(0x5a5450, { map: brickTex(.5, 3) }), NP * 2), arch = new THREE.InstancedMesh(new THREE.BoxGeometry(7.4, .9, .9), std(0x4a4440), NP), d = new THREE.Object3D();
  const fgeo = new THREE.SphereGeometry(.16, 8, 8), flames = new THREE.InstancedMesh(fgeo, hdr(8, 3.2, .7), NP * 2), tg = glowPoints(NP * 2, 1.5, new THREE.Color(1.6, .7, .25), .9), tp = tg.geometry.attributes.position.array;
  for (let k = 0; k < NP; k++) { const z = 24 - k * 8; for (const s of [0, 1]) { const x = s ? 3.25 : -3.25; d.position.set(x, 3.7, z); d.updateMatrix(); pil.setMatrixAt(k * 2 + s, d.matrix); d.position.set(x * .82, 3.3, z); d.updateMatrix(); flames.setMatrixAt(k * 2 + s, d.matrix); tp.set([x * .82, 3.4, z], (k * 2 + s) * 3); } d.position.set(0, 6.9, z); d.updateMatrix(); arch.setMatrixAt(k, d.matrix); }
  pil.castShadow = pil.receiveShadow = true; sc.add(pil, arch, flames, tg);
  sc.add(mesh(new THREE.PlaneGeometry(7.4, 7.4), hdr(6, 2.2, .5), 0, 3.7, -168, false));
  const lights = [...Array(6)].map(() => { const l = new THREE.PointLight(0xff8a3a, 26, 20); sc.add(l); return l; });
  sc.add(new THREE.HemisphereLight(0x3a2a22, 0x0a0806, .7));
  const hero = makeHero({ armor: 0x6a7696, cloth: 0xa01818 }); hero.g.scale.setScalar(1.25); hero.g.rotation.y = Math.PI; sc.add(hero.g);
  const key = new THREE.SpotLight(0xb4c8ff, 160, 30, .6, .6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); sc.add(key, key.target);
  const rim = new THREE.PointLight(0xff7a2a, 45, 16); sc.add(rim);
  const dust = glowPoints(300, .07, new THREE.Color(1.2, .8, .5), .6); sc.add(dust); const dR = rng(2), dB = [...Array(300)].map(() => [(dR() - .5) * 6.5, dR() * 6.5, dR() * 60]);
  const cam = new THREE.PerspectiveCamera(55, W / H, .1, 400);
  function update(t, lt, tl) {
    const hz = 14 - lt * 13; hero.g.position.set(Math.sin(lt * 3) * .2, 0, hz); hero.pose(lt * 15, 'run');
    const k0 = Math.round((24 - hz) / 8);
    lights.forEach((l, i) => { const k = k0 - 2 + i; l.position.set((k % 2 ? 1 : -1) * 2.6, 3.4, 24 - k * 8); l.intensity = 26 * (.85 + .15 * Math.sin(t * 17 + k)); });
    tg.material.opacity = .8 + .2 * Math.sin(t * 20);
    const post = lt > tl, kd = post ? eo((lt - tl) / .5) : 0;
    const dist = lerp(lerp(11, 5.2, eio(lt / tl)), 3.3, kd);
    cam.position.set(Math.sin(lt * 1.3) * .7, .95 + .06 * Math.sin(lt * 15), hz - dist); cam.lookAt(hero.g.position.x * .5, lerp(1.7, 2.0, kd), hz); cam.fov = lerp(55, 78, kd); cam.updateProjectionMatrix();
    key.position.set(1.5, 3.5, hz - 5); key.target.position.set(0, 1.5, hz); rim.position.set(0, 2.8, hz + 2.5);
    const dp = dust.geometry.attributes.position.array; dB.forEach(([x, y, z], i) => { dp[i * 3] = x; dp[i * 3 + 1] = (y + t * .2) % 6.5; dp[i * 3 + 2] = hz + 20 - ((z + lt * 4) % 60); }); dust.geometry.attributes.position.needsUpdate = true;
  }
  return { sc, cam, update, bloom: [.45, .5, .95], exp: 1.0 };
}
function sceneRookery() {
  const sc = new THREE.Scene(); sc.fog = new THREE.FogExp2(0x1c0502, .02); sc.background = new THREE.Color(0x0c0201);
  const rock = canvasTex(256, 256, rockDraw, 6, 6), lava = canvasTex(1024, 1024, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); const R = rng(6); x.strokeStyle = '#fff'; x.lineCap = 'round'; x.shadowColor = '#fff'; x.shadowBlur = 12; for (let i = 0; i < 70; i++) { let px = R() * w, py = R() * h; x.lineWidth = 2 + R() * 6; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += (R() - .5) * 150; py += (R() - .5) * 150; x.lineTo(px, py); } x.stroke(); } }, 1, 1);
  const fl = mesh(new THREE.CircleGeometry(46, 48), std(0x4a3a34, { map: rock, emissiveMap: lava, emissive: new THREE.Color(1.6, .42, .06), roughness: .8 }), 0, 0, 0); fl.rotation.x = -Math.PI / 2; sc.add(fl);
  sc.add(mesh(new THREE.CylinderGeometry(44, 44, 30, 40, 1, true), std(0x3a2a26, { map: rock, side: THREE.BackSide }), 0, 15, 0, false));
  const R = rng(13), d = new THREE.Object3D();
  const spk = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 7, 6), std(0x2a1c18, { map: rock }), 90);
  for (let i = 0; i < 90; i++) { const a = R() * 6.283, r = 14 + R() * 28, up = i % 3 === 0; d.position.set(Math.cos(a) * r, up ? 24 - R() * 4 : 2.5 + R() * 2, Math.sin(a) * r); d.rotation.set(up ? Math.PI : 0, R() * 3, 0); d.scale.set(1 + R(), 1 + R() * 1.5, 1 + R()); d.updateMatrix(); spk.setMatrixAt(i, d.matrix); } sc.add(spk);
  const eggM = new THREE.MeshStandardMaterial({ color: 0x4a2418, roughness: .45, emissive: 0xff5a10, emissiveIntensity: .25 }), eggs = new THREE.InstancedMesh(new THREE.SphereGeometry(.5, 10, 8).scale(1, 1.35, 1), eggM, 520);
  for (let i = 0; i < 520; i++) { const a = R() * 6.283, r = R() < .12 ? 2.5 + R() * 2.5 : 13 + Math.sqrt(R()) * 27, s = .7 + R() * .8; d.position.set(Math.cos(a) * r, .45 * s, Math.sin(a) * r); d.rotation.set((R() - .5) * .5, R() * 3, (R() - .5) * .5); d.scale.setScalar(s); d.updateMatrix(); eggs.setMatrixAt(i, d.matrix); } eggs.castShadow = true; sc.add(eggs);
  sc.add(new THREE.HemisphereLight(0xff5a30, 0x2a0500, .35));
  const top = new THREE.PointLight(0xff7a2a, 420, 120); top.position.set(0, 14, 0); top.castShadow = true; top.shadow.mapSize.set(1024, 1024); sc.add(top);
  const fill = new THREE.PointLight(0xffb070, 30, 20); sc.add(fill);
  const hero = makeHero({ armor: 0x6a7696, cloth: 0xa01818 }); hero.g.scale.setScalar(1.25); sc.add(hero.g);
  const wh = [...Array(44)].map((_, i) => { const dr = makeDragon(0x5a140c, 0xff3a10); const s = .55 + R() * .5; dr.g.scale.setScalar(s); sc.add(dr.g); return { dr, a: R() * 6.283, sp: .5 + R() * .9, r1: 1.6 + R() * 6, h1: 1 + R() * 3.5, p: R() * 6, dly: R() * .8 }; });
  const em = glowPoints(200, .16, new THREE.Color(2, .8, .15), .9); sc.add(em); const eB = [...Array(200)].map(() => [(R() - .5) * 30, R() * 12, (R() - .5) * 30, .5 + R() * 2]);
  const cam = new THREE.PerspectiveCamera(58, W / H, .1, 300), v = new THREE.Vector3();
  function update(t, k, kw) {
    hero.pose(t * 4, 'stand'); const f = kw > 0 ? eo(kw / .45) : 0; hero.g.rotation.x = -f * 1.5; hero.g.position.y = f * .3;
    wh.forEach(w => { const pr = eo((k - w.dly * .5) * w.sp * .9), ang = w.a + k * (1.2 + w.sp), rad = lerp(30, w.r1, pr), y = lerp(16, w.h1, pr) + Math.sin(t * 3 + w.p) * .4; w.dr.g.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad); v.set(Math.cos(ang + .3) * rad, y, Math.sin(ang + .3) * rad); w.dr.g.lookAt(v); w.dr.g.rotateY(-Math.PI / 2); w.dr.flap(t * 16 + w.p); });
    eggM.emissiveIntensity = .22 + .12 * Math.sin(t * 5);
    const ep = em.geometry.attributes.position.array; eB.forEach(([x, y, z, sp], i) => { ep[i * 3] = x; ep[i * 3 + 1] = (y + t * sp) % 12; ep[i * 3 + 2] = z; }); em.geometry.attributes.position.needsUpdate = true;
    const a = .6 + k * .42, rad = lerp(10.5, 7.2, eo(k / 2.5)); cam.position.set(Math.sin(a) * rad, lerp(1.6, 2.6, eo(k / 2)), Math.cos(a) * rad); cam.lookAt(0, lerp(1.9, 1.0, f), 0); cam.updateProjectionMatrix();
    fill.position.copy(cam.position).multiplyScalar(.6); fill.position.y = 3;
  }
  return { sc, cam, update, bloom: [.5, .55, .95], exp: 1.0 };
}

// ------------------------------------------------------------------ Szene: 12 Millionen (Menschenmeer)
function sceneArmy() {
  const sc = new THREE.Scene(); sc.fog = new THREE.FogExp2(0x1d1407, .0075);
  sc.add(skyDome(0x050302, 0x1c1206, 0xc27a1c, 0xffa030, new THREE.Vector3(0, 0, -1), 2), stars(600, 4));
  const gr = mesh(new THREE.PlaneGeometry(900, 900), std(0x15110c), 0, 0, -200, false); gr.rotation.x = -Math.PI / 2; sc.add(gr);
  const cols = 110, rows = 170, N = cols * rows, R = rng(17), im = new THREE.InstancedMesh(crowdGeo(true), std(0xffffff, { roughness: .8 }), N), d = new THREE.Object3D(), pal = [0x39405e, 0x5a2e2e, 0x2e4a3a, 0x5a4c2a, 0x45385a, 0x6a6a72].map(c => new THREE.Color(c));
  const tp = []; let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c - cols / 2 + .5) * 1.05 + (R() - .5) * .5, z = -1.5 - r * 1.3 + (R() - .5) * .5; if (Math.hypot(x, z) < 2.6) continue;
    d.position.set(x, 0, z); d.rotation.y = (R() - .5) * .5; d.scale.setScalar(.9 + R() * .25); d.updateMatrix(); im.setMatrixAt(n, d.matrix); im.setColorAt(n, pal[R() * 6 | 0]); n++;
    if (R() < .3) tp.push(x + .3, 2.2 + R() * .3, z);
  }
  im.count = n; im.frustumCulled = false; sc.add(im);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tp), 3));
  const torches = new THREE.Points(tg, new THREE.PointsMaterial({ size: .95, map: GLOW, color: new THREE.Color(3, 1.6, .45), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); torches.frustumCulled = false; sc.add(torches);
  const hero = makeHero({ armor: 0xc9a23a, cloth: 0x1a2a7a, trim: 0xfff0b0, blade: [3, 2.2, .8] }); hero.g.scale.setScalar(1.3); sc.add(hero.g);
  sc.add(new THREE.HemisphereLight(0x6a5530, 0x070504, 1.3));
  const dl = new THREE.DirectionalLight(0xffc070, 2.6); dl.position.set(-40, 60, 50); sc.add(dl);
  const bl = new THREE.DirectionalLight(0x6a8cff, 1.2); bl.position.set(30, 40, -80); sc.add(bl);
  const hl = new THREE.PointLight(0xffb050, 60, 14); hl.position.set(1, 3, 3); sc.add(hl);
  const cam = new THREE.PerspectiveCamera(50, W / H, .1, 1500);
  function update(t, lt) {
    hero.pose(t * 3, 'stand'); torches.material.opacity = .85 + .15 * Math.sin(t * 13);
    const k = eio((lt - .15) / 3.3), dr = Math.max(0, lt - 3.3) * 1.2;
    cam.position.set(lerp(1.0, 0, k), lerp(1.5, 44, k) + dr, lerp(4.6, 30, k) - dr * 2); cam.lookAt(0, lerp(1.9, 0, k), lerp(0, -75, k)); cam.fov = lerp(48, 60, k); cam.updateProjectionMatrix();
  }
  return { sc, cam, update, bloom: [.8, .6, .8], exp: 1.2 };
}

// ------------------------------------------------------------------ Szene: Trauerfeier am See
function shoreH(x, z) {
  const n = fbm(x * .04 + 2, z * .04 + 9, 4, 2); const d = -2 - z;
  let h = d < 0 ? .25 + (-d) * .04 + n * .7 : -clamp(d * .3, 0, 3);
  h += sstep(15, 55, Math.abs(x)) * (3 + 18 * fbm(x * .02, z * .02, 4, 5)) * (d < 0 ? 1 : sstep(60, 0, d) * .8 + .2);
  h += sstep(120, 190, -z) * (4 + 60 * Math.pow(1 - Math.abs(2 * fbm(x * .008 + 4, 3, 4, 6) - 1), 2));
  return h;
}
function sceneFuneral() {
  const sc = new THREE.Scene(), fogA = new THREE.Color(0x0e1434), fogB = new THREE.Color(0x3a0606); sc.fog = new THREE.FogExp2(fogA.getHex(), .011);
  const moonPos = new THREE.Vector3(-45, 62, -430), sky = skyDome(0x02030c, 0x101a48, 0x56659c, 0x8090d0, new THREE.Vector3(-.1, 0, -1), 5), mo = moon(moonPos, 46);
  sc.add(sky, stars(1200, 9), mo);
  const g = new THREE.PlaneGeometry(520, 420, 180, 150); g.rotateX(-Math.PI / 2); g.translate(0, 0, -100);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const h = shoreH(p.getX(i), p.getZ(i)); p.setY(i, h); const n = fbm(p.getX(i) * .1, p.getZ(i) * .1, 3, 4); col.set(h > 30 ? [.5, .55, .7] : [.06 + n * .05, .1 + n * .06, .09], i * 3); }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ter = mesh(g, std(0xffffff, { vertexColors: true, roughness: 1 })); ter.castShadow = false; sc.add(ter);
  const water = mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x060a18, metalness: 1, roughness: .05, normalMap: waveNormal(), normalScale: new THREE.Vector2(.06, .06), envMapIntensity: 1.2 }), 0, 0, -300, false); water.rotation.x = -Math.PI / 2; sc.add(water);
  const R = rng(33), tl = []; while (tl.length < 500) { const x = (R() - .5) * 240, z = 40 - R() * 120, h = shoreH(x, z); if (h > .6 && Math.abs(x) > 11 && h < 22) tl.push([x, h - .2, z, 1 + R() * 1.4]); } sc.add(pines(tl, 0x0a1620));
  const stone = std(0x6a6a78, { map: brickTex(1, 1) });
  sc.add(mesh(new THREE.BoxGeometry(2.4, .8, 1.1), stone, 0, .7, -.6), mesh(new THREE.BoxGeometry(3, .25, 1.6), stone, 0, .28, -.6));
  const sw = mesh(new THREE.BoxGeometry(.1, 1.7, .03), new THREE.MeshStandardMaterial({ color: 0xcfd8ff, metalness: 1, roughness: .25, emissive: 0x6a8cff, emissiveIntensity: .5 }), 0, 1.9, -.6); sc.add(sw, mesh(new THREE.BoxGeometry(.6, .08, .08), std(0xc9a23a, { metalness: .9, roughness: .3 }), 0, 1.5, -.6));
  const cpos = [];
  for (let i = 0; i < 9; i++) { const x = -1 + i * .25, y = 1.1 + (i % 2) * .08, z = -.3 - (i % 3) * .15; sc.add(mesh(new THREE.CylinderGeometry(.03, .03, .2, 5), std(0xe8e0c8), x, y, z, false)); cpos.push([x, y + .17, z]); }
  const mM = std(0x1a1826, { roughness: 1 }), mourn = [];
  for (let i = 0; i < 17; i++) {
    const row = i < 8 ? 0 : 1, n = row ? 9 : 8, k = row ? i - 8 : i, a = lerp(-1.05, 1.05, k / (n - 1)), rad = row ? 5.6 : 3.7, x = Math.sin(a) * rad, z = -.6 + Math.cos(a) * rad, kneel = (i % 3 === 0) ? .72 : 1, y = shoreH(x, z);
    const m = new THREE.Group(); m.add(mesh(new THREE.ConeGeometry(.45, 1.6 * kneel, 10), mM, 0, .8 * kneel, 0), mesh(new THREE.SphereGeometry(.2, 10, 8), mM, 0, 1.62 * kneel, .02), mesh(new THREE.SphereGeometry(.24, 10, 8), mM, 0, 1.66 * kneel, -.06));
    m.position.set(x, y - .05, z); m.rotation.y = Math.atan2(-x, -.6 - z); sc.add(m); mourn.push({ m, x, ry: m.rotation.y });
    const hx = x - Math.sin(a) * .5, hz = z - Math.cos(a) * .5; sc.add(mesh(new THREE.CylinderGeometry(.025, .025, .22, 5), std(0xe8e0c8), hx, y + 1.0 * kneel, hz, false)); cpos.push([hx, y + 1.0 * kneel + .18, hz, i]);
  }
  const flames = new THREE.InstancedMesh(new THREE.SphereGeometry(.035, 6, 6).scale(1, 1.8, 1), hdr(9, 5, 1.4), cpos.length), cg = glowPoints(cpos.length, .5, new THREE.Color(1.5, .8, .25), .9), d = new THREE.Object3D();
  sc.add(flames, cg);
  const cl = [[-.6, 1.6, -.2], [.7, 1.6, -.2], [0, 1.4, 3.5]].map(q => { const l = new THREE.PointLight(0xffa050, 14, 14); l.position.set(...q); sc.add(l); return l; });
  const ff = glowPoints(90, .28, new THREE.Color(2, 1.8, .6), .9); sc.add(ff); const fB = [...Array(90)].map(() => [(R() - .5) * 40, .5 + R() * 5, 4 - R() * 28, R() * 6.28]);
  const hemi = new THREE.HemisphereLight(0x44579c, 0x05060c, 1.0); sc.add(hemi);
  const ml = new THREE.DirectionalLight(0xb4c8ff, 1.7); ml.position.set(-9, 13, -60); ml.castShadow = true; ml.shadow.mapSize.set(2048, 2048); Object.assign(ml.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, far: 140 }); ml.shadow.bias = -.0008; sc.add(ml);
  const fill = new THREE.DirectionalLight(0x5a6ab0, .5); fill.position.set(5, 10, 30); sc.add(fill);
  const redL = new THREE.PointLight(0xff2010, 0, 60); redL.position.set(4, 5, 4); sc.add(redL);
  const att = [...Array(9)].map((_, i) => { const h = makeHero({ armor: 0x22161a, cloth: 0x5a0808, eyes: [9, .6, .3], blade: [3, .4, .2], trim: 0x5a2020 }); h.g.scale.setScalar(1.2); h.g.visible = false; sc.add(h.g); return { h, sx: 24 + i * 2.4 + R() * 2, tx: -5.5 + i * 1.35, z: -.5 + R() * 6.5, p: R() * 6 }; });
  const cam = new THREE.PerspectiveCamera(50, W / H, .1, 2500);
  const crt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }), cc = new THREE.CubeCamera(1, 3000, crt); cc.position.set(0, 1.5, -20);
  water.visible = false; cc.update(renderer, sc); water.visible = true; water.material.envMap = crt.texture;
  const cA = new THREE.Color(0xb4c8ff), cB = new THREE.Color(0xff4530), hA = new THREE.Color(0x44579c), hB = new THREE.Color(0xa01c1c);
  function update(t, lt, ka) {
    water.material.normalMap.offset.set(t * .008, t * .015);
    const red = clamp(ka / .35);
    sc.fog.color.copy(fogA).lerp(fogB, red); ml.color.copy(cA).lerp(cB, red); hemi.color.copy(hA).lerp(hB, red);
    sky.material.uniforms.mid.value.set(0x101a48).lerp(new THREE.Color(0x3a0508), red); sky.material.uniforms.hor.value.set(0x56659c).lerp(new THREE.Color(0xb02a18), red);
    mo.userData.m.material.color.setRGB(1.25, lerp(1.2, .5, red), lerp(1.1, .4, red));
    redL.intensity = ka > 0 ? 900 * Math.max(.25, 1 - ka / .8) : 0;
    cpos.forEach(([x, y, z, mi], i) => { const out = ka > 0 && mi !== undefined && ka > .6 + mi * .05; d.position.set(x, out ? -9 : y, z); d.scale.setScalar(.85 + .3 * Math.sin(t * 15 + i * 2)); d.updateMatrix(); flames.setMatrixAt(i, d.matrix); cg.geometry.attributes.position.array.set([x, out ? -9 : y, z], i * 3); });
    flames.instanceMatrix.needsUpdate = true; cg.geometry.attributes.position.needsUpdate = true;
    cl.forEach((l, i) => l.intensity = 14 * (.8 + .2 * Math.sin(t * 11 + i * 2)));
    const fp = ff.geometry.attributes.position.array; fB.forEach(([x, y, z, ph], i) => { fp[i * 3] = x + Math.sin(t * .5 + ph) * 1.5; fp[i * 3 + 1] = y + Math.sin(t * .8 + ph * 2) * .6; fp[i * 3 + 2] = z + Math.cos(t * .4 + ph) * 1.5; }); ff.geometry.attributes.position.needsUpdate = true; ff.material.opacity = .9 * (1 - red);
    mourn.forEach((o, i) => { const f = ka > 0 ? eo((ka - .6 - (5.5 - o.x) * .06) / .4) : 0; o.m.rotation.set(0, o.ry, 0); o.m.rotateZ(f * 1.45); });
    att.forEach((a, i) => { a.h.g.visible = ka > 0; if (ka <= 0) return; const k = eo((ka - i * .04) / .95), x = lerp(a.sx, a.tx, k); a.h.g.position.set(x, shoreH(x, a.z), a.z); a.h.g.rotation.y = -Math.PI / 2; a.h.pose(ka * 16 + a.p, 'run'); if (k > .97) a.h.armR.rotation.x = Math.PI * .6 + Math.sin(ka * 14 + a.p) * .9; });
    const k = eio(lt / 5), ks = ka > 0 ? eo(ka / .5) : 0;
    cam.position.set(lerp(.4, -2.6, ks), lerp(3.6, 3.0, k), lerp(12.5, 9.5, k) + ks * .5); cam.lookAt(lerp(-.5, 3.2, ks), lerp(1.5, 1.6, ks), -8); cam.fov = lerp(50, 64, ks); cam.updateProjectionMatrix();
  }
  return { sc, cam, update, bloom: [.45, .6, .95], exp: 1.15 };
}

// ------------------------------------------------------------------ Szene: Zeittunnel + Wohnzimmer
function sceneTunnel() {
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x010305);
  const N = 80, im = new THREE.InstancedMesh(new THREE.TorusGeometry(5, .07, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffffff }), N), d = new THREE.Object3D(), c = new THREE.Color(); im.frustumCulled = false; sc.add(im);
  const hex = new THREE.InstancedMesh(new THREE.TorusGeometry(7.5, .05, 4, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), N); hex.frustumCulled = false; sc.add(hex);
  const R = rng(3), st = glowPoints(900, .14, new THREE.Color(1, 1.4, 1.4), .8), sB = [...Array(900)].map(() => { const a = R() * 6.283, r = 1.5 + R() * 9; return [Math.cos(a) * r, Math.sin(a) * r, R() * 320]; }); sc.add(st);
  const cam = new THREE.PerspectiveCamera(78, W / H, .1, 600);
  function update(t, lt) {
    const D = lt < 2.3 ? 60 * lt - 9 * lt * lt * (lt / 2.3) * .5 : 60 * 2.3 - 9 * 2.3 * 2.3 * .5 + 8 * (lt - 2.3), hue = lerp(.48, .11, clamp(lt / 2.3));
    for (let i = 0; i < N; i++) {
      const z = -((((i * 4 - D) % 320) + 320) % 320), f = clamp(1 + z / 300);
      d.position.set(Math.sin(z * .03) * 2.5, Math.cos(z * .04) * 1.8, z); d.rotation.set(0, 0, i * .4 + lt * .4); d.scale.setScalar(1 + .08 * Math.sin(i + lt * 5)); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      c.setHSL((hue + i * .004) % 1, .95, .55).multiplyScalar(1.1 * f * f); im.setColorAt(i, c);
      d.rotation.z = -i * .3 - lt * .25; d.updateMatrix(); hex.setMatrixAt(i, d.matrix); c.setHSL((hue + .08) % 1, .9, .5).multiplyScalar(.6 * f * f); hex.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = hex.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = hex.instanceColor.needsUpdate = true;
    const sp = st.geometry.attributes.position.array; sB.forEach(([x, y, z], i) => { sp[i * 3] = x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = -((((z - D * 1.5) % 320) + 320) % 320); }); st.geometry.attributes.position.needsUpdate = true;
    cam.position.set(0, 0, 0); cam.rotation.set(0, 0, lt * .3); cam.updateProjectionMatrix();
  }
  return { sc, cam, update, bloom: [.7, .6, .55], exp: 1.0 };
}
function sceneRoom(land) {
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x020205);
  const tv = new THREE.WebGLRenderTarget(960, 540, { type: THREE.HalfFloatType });
  const wood = canvasTex(256, 256, (x, w, h) => { const R = rng(1); for (let i = 0; i < 8; i++) { x.fillStyle = `hsl(25,35%,${14 + R() * 8}%)`; x.fillRect(0, i * 32, w, 31); } x.fillStyle = 'rgba(0,0,0,.4)'; for (let i = 0; i < 8; i++) x.fillRect(R() * w, i * 32, 2, 32); }, 5, 5);
  const fl = mesh(new THREE.PlaneGeometry(16, 16), std(0xffffff, { map: wood, roughness: .35 }), 0, 0, 0); fl.rotation.x = -Math.PI / 2; sc.add(fl);
  sc.add(mesh(new THREE.PlaneGeometry(16, 7), std(0x2a2638), 0, 3.5, -3.3));
  const rug = mesh(new THREE.CircleGeometry(2.3, 32), std(0x5a2030, { roughness: 1 }), 0, .01, -.6); rug.rotation.x = -Math.PI / 2; sc.add(rug);
  sc.add(mesh(new THREE.BoxGeometry(4.2, .55, .7), std(0x1a1410, { roughness: .5 }), 0, .28, -2.8), mesh(new THREE.BoxGeometry(3.7, 2.15, .12), std(0x08080a, { roughness: .3 }), 0, 1.78, -2.95));
  sc.add(mesh(new THREE.PlaneGeometry(3.5, 1.97), new THREE.MeshBasicMaterial({ map: tv.texture, color: new THREE.Color(1.7, 1.7, 1.7) }), 0, 1.78, -2.88, false));
  const sofa = std(0x4a3a6a, { roughness: .95 });
  sc.add(mesh(new THREE.BoxGeometry(3.8, .5, 1.3), sofa, 0, .38, 1.3), mesh(new THREE.BoxGeometry(3.8, 1.0, .35), sofa, 0, .75, 1.95), mesh(new THREE.BoxGeometry(.4, .85, 1.5), sofa, -2.05, .55, 1.35), mesh(new THREE.BoxGeometry(.4, .85, 1.5), sofa, 2.05, .55, 1.35));
  const R = rng(8); sc.add(mesh(new THREE.BoxGeometry(1.6, 3.4, .5), std(0x241a14), -4.2, 1.7, -2.9));
  for (let s = 0; s < 4; s++) for (let b = 0; b < 7; b++) sc.add(mesh(new THREE.BoxGeometry(.14, .45 + R() * .15, .3), std(new THREE.Color().setHSL(R(), .5, .3)), -4.8 + b * .19, .55 + s * .8, -2.8));
  sc.add(mesh(new THREE.CylinderGeometry(.05, .05, 1.7, 6), std(0x15151a), 3.6, .85, -2.4), mesh(new THREE.ConeGeometry(.42, .5, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, .8), side: THREE.DoubleSide }), 3.6, 1.9, -2.4, false));
  const lamp = new THREE.PointLight(0xffa050, 9, 12); lamp.position.set(3.6, 1.8, -2.2); sc.add(lamp);
  const skin = std(0xc89878), person = (x, s, shirt, hair) => {
    const g = new THREE.Group(); const to = mesh(new THREE.CapsuleGeometry(.27, .45, 4, 10), std(shirt), 0, .95, 0); to.scale.set(1.25, 1, .8); g.add(to);
    g.add(mesh(new THREE.SphereGeometry(.2, 14, 12), skin, 0, 1.6, 0)); const h = mesh(new THREE.SphereGeometry(.215, 14, 12, 0, 6.3, 0, 1.9), std(hair, { roughness: 1 }), 0, 1.62, .02); h.rotation.x = .5; g.add(h);
    const arms = [-1, 1].map(sd => { const a = new THREE.Group(); a.position.set(sd * .36, 1.25, 0); a.add(mesh(new THREE.CapsuleGeometry(.075, .55, 3, 8), std(shirt), 0, -.3, 0)); g.add(a); return a; });
    g.position.set(x, .25, 1.25); g.scale.setScalar(s); sc.add(g); return arms;
  };
  person(-.42, 1.0, 0x2a3a5a, 0x1a120c); const kid = person(.42, .72, 0x9a2a2a, 0x3a2410);
  sc.add(new THREE.HemisphereLight(0x3a3a6a, 0x0a0806, .5));
  const bk = new THREE.PointLight(0x7a6ad8, 5, 14); bk.position.set(-1.5, 3, 4.5); sc.add(bk);
  const tl = new THREE.SpotLight(0x9a7aff, 700, 16, 1.15, .7); tl.position.set(0, 1.8, -2.7); tl.target.position.set(0, 1, 2); tl.castShadow = true; tl.shadow.mapSize.set(1024, 1024); sc.add(tl, tl.target);
  const cam = new THREE.PerspectiveCamera(50, W / H, .1, 100);
  function update(t, k) {
    land.update(t, 'tv'); renderer.setRenderTarget(tv); renderer.render(land.sc, land.camTV); renderer.setRenderTarget(null);
    tl.intensity = 700 * (.85 + .15 * Math.sin(t * 7) * Math.sin(t * 3.3));
    const ch = Math.max(0, Math.sin(k * 6.5)); kid[0].rotation.set(0, 0, 0); kid[1].rotation.set(0, 0, 0); kid[0].rotation.z = -2.6 * ch - .15; kid[1].rotation.z = 2.6 * ch + .15;
    cam.position.set(.25 + Math.sin(k * .6) * .15, 1.95, lerp(5.0, 4.3, eo(k / 2.5))); cam.lookAt(0, 1.6, -2.9); cam.updateProjectionMatrix();
  }
  return { sc, cam, update, bloom: [.7, .7, .82], exp: 1.15 };
}

// ------------------------------------------------------------------ API
const cache = {}; const get = (n, f) => cache[n] ??= f();
function draw(s) { renderPass.scene = s.sc; renderPass.camera = s.cam; bloom.strength = s.bloom[0]; bloom.radius = s.bloom[1]; bloom.threshold = s.bloom[2]; renderer.toneMappingExposure = s.exp; composer.render(); return glc; }
window.R3D = {
  canvas: glc,
  render(key, t, lt, S) {
    let s, info = {};
    if (key === 'hook' || key === 'outro') { s = get('land', sceneLand); s.update(t, key, lt); }
    else if (key === 'plague') { s = get('plague', scenePlague); info.frac = s.update(t, lt); }
    else if (key === 'leeroy') {
      const tg = S.ev.gruppe - S.start;
      if (lt < tg) { s = get('corr', sceneCorridor); s.update(t, lt, S.ev.leeroy - S.start); } else { s = get('rook', sceneRookery); s.update(t, lt - tg, lt - (S.ev.wipe - S.start)); }
    }
    else if (key === 'subs') { s = get('army', sceneArmy); s.update(t, lt); }
    else if (key === 'funeral') { s = get('fun', sceneFuneral); s.update(t, lt, lt - (S.ev.attack - S.start)); }
    else if (key === 'years') { const ek = S.ev.kids - S.start; if (lt < ek) { s = get('tun', sceneTunnel); s.update(t, lt); } else { s = get('room', () => sceneRoom(get('land', sceneLand))); s.update(t, lt - ek); } }
    draw(s); return info;
  },
};
window.R3D_READY = true;
