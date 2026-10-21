/* DOOMSDAY - ragdoll FPS, single level "THE DOWNSIDE YARD"
 * three.js r165 + cannon-es 0.20.0, vendored in ./vendor (no CDN at runtime).
 * WIN: every target eliminated. LOSE: player health reaches zero.
 * Dead enemies are simulated physics ragdolls: 11 cannon bodies + 10 point-to-point
 * joints, flung by the shot that killed them. No canned death animation.
 */
import * as THREE from './vendor/three.module.min.js';
import * as CANNON from './vendor/cannon-es.js';

const okThree = typeof THREE.Mesh === 'function' && typeof THREE.WebGLRenderer === 'function';
const okCannon = typeof CANNON.World === 'function' && typeof CANNON.PointToPointConstraint === 'function';
if (!okThree || !okCannon) {
  window.__game_boot_msg = 'DOOMSDAY: vendored library failed (' + (okThree ? 'cannon' : 'three') + ')';
  throw new Error('doomsday boot: missing library');
}
window.__game_boot = { mode: 'gl', three: 165, cannon: '0.20.0' };

/* capture module-eval + runtime errors for the harness, as early as possible */
window.__test_errors = [];
addEventListener('error', function (ev) {
  window.__test_errors.push(String(ev.message || 'unknown') + ' @' + String(ev.lineno || 0) + ':' + String(ev.colno || 0));
});

const V3 = CANNON.Vec3, Box = CANNON.Box, Sph = CANNON.Sphere, Body = CANNON.Body,
      P2P = CANNON.PointToPointConstraint, CPl = CANNON.Plane;

const ARENA = 33;            // yard half-extent (inner face at +-33)
const STEP = 1 / 60;         // fixed physics timestep

function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
function rr(a, b) { return a + Math.random() * (b - a); }
function sgn() { return Math.random() < 0.5 ? -1 : 1; }

const hudTxt = document.getElementById('hudTxt');
const xhEl = document.getElementById('xhair');
const vigEl = document.getElementById('vig');
const menuEl = document.getElementById('menu');
const wonEl = document.getElementById('won');
const lostEl = document.getElementById('lost');
const pauseEl = document.getElementById('pause');

/* ---------- renderer + scenes ---------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1117);
scene.fog = new THREE.Fog(0x0b1117, 30, 130);

const cam = new THREE.PerspectiveCamera(74, 1.7, 0.06, 260);
const wScene = new THREE.Scene();
const wCam = new THREE.PerspectiveCamera(62, 1.7, 0.01, 5);

scene.add(new THREE.HemisphereLight(0x9db6cc, 0x202018, 0.85));
const sun = new THREE.DirectionalLight(0xffd9a8, 1.15);
sun.position.set(26, 42, 20);
sun.castShadow = true;
sun.shadow.mapSize.width = 1536;
sun.shadow.mapSize.height = 1536;
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 140;
scene.add(sun);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  canvas.width = Math.round(w * pr);
  canvas.height = Math.round(h * pr);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  wCam.aspect = cam.aspect;
  wCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
/* ---------- physics world ---------- */
const world = new CANNON.World();
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 9;
world.allowSleep = true;
world.gravity.set(0, -27, 0);
world.defaultContactMaterial.friction = 0.45;
world.defaultContactMaterial.restitution = 0.22;
const GSTAT = 1, GLIVE = 2, GRAG = 4, GTHROW = 8;

/* ---------- level: THE DOWNSIDE YARD ---------- */
const ST = []; // occluder AABBs: minx,maxx,miny,maxy,minz,maxz
function addBox(cx, cy, cz, hx, hy, hz, col) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
    new THREE.MeshLambertMaterial({ color: col }));
  m.position.set(cx, cy, cz);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  const b = new Body({ mass: 0, position: new V3(cx, cy, cz),
    collisionFilterGroup: GSTAT, collisionFilterMask: -1 });
  b.addShape(new Box(new V3(hx, hy, hz)));
  world.addBody(b);
  ST.push([cx - hx, cx + hx, cy - hy, cy + hy, cz - hz, cz + hz]);
  return m;
}
const flr = new THREE.Mesh(new THREE.PlaneGeometry(220, 220),
  new THREE.MeshLambertMaterial({ color: 0x262b32 }));
flr.rotation.x = -Math.PI / 2;
flr.receiveShadow = true;
scene.add(flr);
const ground = new Body({ mass: 0, collisionFilterGroup: GSTAT, collisionFilterMask: -1 });
ground.addShape(new Box(new V3(240, 1, 240))); // top face at y=0 (a Plane's polyhedron has 0 faces and crashes clipAgainstHull)
ground.position.set(0, -1, 0);
world.addBody(ground);
const DK = 0x2b3640, MD = 0x44525e, RS = 0x6b4a3c, GR = 0x4d5d50, OR = 0xa0622e, MN = 0x39424c;
addBox(0, 9, -ARENA - 1.5, ARENA + 1.5, 9, 1.5, DK);
addBox(0, 9, ARENA + 1.5, ARENA + 1.5, 9, 1.5, DK);
addBox(-ARENA - 1.5, 9, 0, 1.5, 9, ARENA + 1.5, DK);
addBox(ARENA + 1.5, 9, 0, 1.5, 9, ARENA + 1.5, DK);

// shipping containers (axis-aligned; hd = long axis half-extent)
const CNT = [
  [-18, -14, 6.2, 1.35, 0, 0, RS], [6, -21, 5.4, 1.35, 1, 0, MN],
  [17, -7, 6.2, 1.35, 0, 0, GR], [-23, 9, 7.0, 1.35, 1, 0, RS],
  [-8, 19, 5.4, 1.35, 0, 1, MN], [14, 16, 5.4, 1.35, 1, 1, GR],
  [0, -3, 4.4, 1.35, 0, 0, OR], [24, 2, 6.2, 1.35, 1, 0, MN]];
for (const c of CNT) {
  const hw = c[2] / 2, hh = c[3], hx = c[4] ? hw : 1.35, hz = c[4] ? 1.35 : hw;
  addBox(c[0], hh + c[5] * 2.8, c[1], hx, hh, hz, c[6]);
  if (c[5]) addBox(c[0], hh, c[1], hx, hh, hz, c[6]);
}
for (const c of CNT) if (c[5]) for (let k = 0; k < 2; k++) // ladders-as-steps on stacked stacks
  addBox(c[0] - hwOf(c) + 0.5, 0.45 + k * 0.7, c[1] + 0.9, 0.45, 0.35, 0.45, OR);
function hwOf(c) { return c[2] / 2; }

// crates + low barriers
for (let i = 0; i < 10; i++) {
  const x = rr(-28, 28), z = rr(-28, 28);
  if (Math.hypot(x, z) < 5) continue;
  const s = rr(0.55, 0.95);
  addBox(x, s, z, s, s, s, i & 1 ? RS : MN);
}
for (let i = 0; i < 6; i++) {
  const a = i * Math.PI / 3, r = 11 + i * 1.6;
  addBox(Math.cos(a) * r, 0.55, Math.sin(a) * r, 2.3, 0.55, 0.22, MD);
}

// raised platform + climbable stairs + bridge (platform top = 2.1)
addBox(26, 1.05, -26, 7, 1.05, 7, MN);
addBox(26, 1.95, -26, 6.4, 0.15, 6.4, GR);
for (let k = 0; k < 7; k++)
  addBox(17.5 + k * 0.72, 0.15 * (k + 1), -26, 0.36, 0.15 * (k + 1), 1.7, MN);
addBox(26, 2.25, -16.2, 1.7, 0.15, 2.9, MN);
// lamp posts (visual heads are emissive, no extra lights)
for (const lp of [[-12, -26], [12, 6], [-24, -4], [8, 26]]) {
  addBox(lp[0], 2.6, lp[1], 0.12, 2.6, 0.12, MD);
  const head = addBox(lp[0], 5.4, lp[1], 0.3, 0.12, 0.3, 0xffd98a);
  head.castShadow = false;
}
/* ---------- player + input ---------- */
const hwP = 0.32, phP = 1.76, eyeH = 1.62, stepH = 0.42;
const P = { x: 22, y: 0, z: 28, vy: 0, yaw: 2.55, pitch: 0, hp: 100, grounded: true };
const keys = {};
function onKey(k, v) {
  if (k === 'shift') keys.run = v;
  else keys[k] = v;
}
addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  if (k === 'escape') { setFree(); return; }
  onKey(k, 1);
});
addEventListener('keyup', e => onKey((e.key || '').toLowerCase(), 0));
const input = { pointerCaptured: false, real: false, fire: false, fireAlt: false, sens: 0.0027 };
let lastMX = 0, lastMY = 0;
function setFree() {
  if (!input.pointerCaptured) return;
  input.pointerCaptured = false;
  input.real = false;
  canvas.style.cursor = '';
  try { document.exitPointerLock(); } catch (_) {}
}
function setCaptured(e) {
  lastMX = e.clientX || 0;
  lastMY = e.clientY || 0;
  input.pointerCaptured = true;
  canvas.style.cursor = 'none';
  try {
    const pr = canvas.requestPointerLock();
    if (pr && typeof pr.catch === 'function') pr.catch(() => {});
  } catch (_) {}
}
addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    input.pointerCaptured = true;
    input.real = true;
    canvas.style.cursor = 'none';
  } else setFree();
});
addEventListener('pointerlockerror', () => { input.real = false; });
canvas.addEventListener('mousedown', e => {
  if (!input.pointerCaptured) {
    if (state === 'play') setCaptured(e);
    return;
  }
  if (e.button === 0) input.fire = true;
  else if (e.button === 2) input.fireAlt = true;
});
canvas.addEventListener('mouseup', e => {
  if (e.button === 0) input.fire = false;
  else if (e.button === 2) input.fireAlt = false;
});
addEventListener('mousemove', e => {
  if (!input.pointerCaptured) return;
  let dx, dy;
  if (input.real) {
    dx = e.movementX || 0;
    dy = e.movementY || 0;
  } else {
    const w = innerWidth, h = innerHeight;
    let x = e.clientX, y = e.clientY;
    if (x === undefined || y === undefined) return;
    if (x < 0) x = 0; else if (x > w) x = w;
    if (y < 0) y = 0; else if (y > h) y = h;
    dx = x - lastMX; dy = y - lastMY;
    lastMX = x; lastMY = y;
    const clw = w * 0.25, clh = h * 0.25;
    if (dx > clw) dx = clw; else if (dx < -clw) dx = -clw;
    if (dy > clh) dy = clh; else if (dy < -clh) dy = -clh;
  }
  P.yaw -= dx * input.sens;
  P.pitch = cl(P.pitch - dy * input.sens, -1.45, 1.4);
});
function sideHit(nx, ny, nz) {
  for (const s of ST) {
    if (nx + hwP > s[0] && nx - hwP < s[1] && nz + hwP > s[4] && nz - hwP < s[5] &&
        s[3] > ny + stepH && s[2] < ny + phP - 0.05) return true;
  }
  return false;
}
function groundAt(x, z, y) {
  let g = 0;
  for (const s of ST) {
    if (x + hwP > s[0] && x - hwP < s[1] && z + hwP > s[4] && z - hwP < s[5] &&
        s[3] <= y + stepH && s[3] > g) g = s[3];
  }
  return g;
}
function playerStep(dt) {
  const f = (keys.w ? 1 : 0) + (keys.arrowup ? 1 : 0) - (keys.s ? 1 : 0) - (keys.arrowdown ? 1 : 0);
  const r = (keys.d ? 1 : 0) + (keys.arrowright ? 1 : 0) - (keys.a ? 1 : 0) - (keys.arrowleft ? 1 : 0);
  const s = Math.hypot(f, r) || 1;
  const sp = (keys.run ? 7.1 : 4.6) * (P.grounded ? 1 : 0.85);
  const wx = (-Math.sin(P.yaw) * f + Math.cos(P.yaw) * r) / s * sp * dt;
  const wz = (-Math.cos(P.yaw) * f - Math.sin(P.yaw) * r) / s * sp * dt;
  if (keys[' '] && P.grounded) { P.vy = 9.0; P.grounded = false; }
  const g = groundAt(P.x, P.z, P.y);
  if (!sideHit(P.x + wx, P.y, P.z)) P.x += wx;
  if (!sideHit(P.x, P.y, P.z + wz)) P.z += wz;
  const ny = P.y + (P.vy -= 30 * dt) * dt;
  const gg = groundAt(P.x, P.z, ny);
  if (ny <= gg + 0.03) { P.y = gg; P.vy = 0; P.grounded = true; } else P.y = ny;
  const lim = ARENA - 0.7;
  P.x = cl(P.x, -lim, lim);
  P.z = cl(P.z, -lim, lim);
}
/* ---------- targets + hitscan ---------- */
const EN = [];
const SPAWN = [
  [0, 8, 0], [-12, 2, 0], [10, 4, 0], [-4, -8, 0], [20, -12, 0], [-20, -20, 0],
  [8, 22, 0], [-26, 20, 0], [28, 12, 0], [-14, -22, 0], [30, 24, 0],
  [-18, -12, 2.7], [17, -5, 2.7], [0, -3, 2.7], [-23, 9, 5.5], [14, 16, 5.5],
  [24, 2, 2.7], [26, -26, 2.1]];
function losTo(x1, y1, z1, x2, y2, z2) {
  let dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.3) return true;
  dx /= d; dy /= d; dz /= d;
  for (let t = 0.6; t < d; t += Math.max(0.4, d / 24)) {
    const px = x1 + dx * t, py = y1 + dy * t, pz = z1 + dz * t;
    for (const s of ST) if (px > s[0] && px < s[1] && py > s[2] && py < s[3] && pz > s[4] && pz < s[5]) return false;
  }
  return true;
}
function rayAABB(ox, oy, oz, dx, dy, dz, s) {
  let t0 = -1e9, t1 = 1e9;
  const o = [ox, oy, oz], ax = [dx, dy, dz];
  const lo = [s[0], s[2], s[4]], hi = [s[1], s[3], s[5]];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ax[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; }
    else {
      let a = (lo[i] - o[i]) / ax[i], b = (hi[i] - o[i]) / ax[i];
      if (a > b) { const c = a; a = b; b = c; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  return t0 > 1e-4 ? t0 : (t1 > 1e-4 ? t1 : -1);
}
function rayHit(ox, oy, oz, dx, dy, dz, range) {
  let best = range, en = null, part = -1;
  for (const s of ST) { const t = rayAABB(ox, oy, oz, dx, dy, dz, s); if (t > 0 && t < best) best = t; }
  if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < best) best = t; }
  for (const e of EN) {
    if (!e.alive) continue;
    const cx = e.x, cy = e.y, cz = e.z;
    for (let i = 0; i < 3; i++) {
      const hy = i === 0 ? cy + 1.55 : (i === 1 ? cy + 0.98 : cy + 0.36);
      const r = i === 0 ? 0.26 : (i === 1 ? 0.44 : 0.5);
      const mx = cx - ox, my = hy - oy, mz = cz - oz;
      const b = mx * dx + my * dy + mz * dz;
      if (b <= 0) continue;
      const disc = r * r - (mx * mx + my * my + mz * mz - b * b);
      if (disc < 0) continue;
      const t = b - Math.sqrt(disc);
      if (t > 1e-4 && t < best) { best = t; en = e; part = i; }
    }
  }
  return { t: best, en, part };
}
function spawnEnemy(x, y, z) {
  const b = new Body({ mass: 0, type: Body.KINEMATIC, position: new V3(x, y + 0.85, z),
    collisionFilterGroup: GLIVE, collisionFilterMask: GSTAT });
  b.addShape(new Box(new V3(0.36, 0.85, 0.32)));
  world.addBody(b);
  const g = new THREE.Group();
  const M = (w, h, d, col) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col }));
  const L = M(0.2, 0.68, 0.22, 0x39434e); L.position.set(-0.12, 0.36, 0); g.add(L);
  const R = M(0.2, 0.68, 0.22, 0x39434e); R.position.set(0.12, 0.36, 0); g.add(R);
  const T = M(0.5, 0.62, 0.34, 0x7d93a2); T.position.set(0, 1.0, 0); g.add(T);
  const A = M(0.16, 0.5, 0.16, 0x5c6e7e); A.position.set(-0.33, 0.98, 0); g.add(A);
  const B = M(0.16, 0.5, 0.16, 0x5c6e7e); B.position.set(0.33, 0.98, 0); g.add(B);
  const H = M(0.26, 0.26, 0.26, 0xa7bac8); H.position.set(0, 1.58, 0); g.add(H);
  const V = M(0.2, 0.07, 0.02, 0xff7a4a); V.position.set(0, 1.6, -0.14); g.add(V);
  scene.add(g);
  EN.push({ x, y, z, hp: 100, alive: true, body: b, grp: g, cd: rr(0.4, 2.2), ph: rr(0, 6.3), sx: x, sz: z, kind: y > 0.5 ? 1 : 0 });
  return EN.length - 1;
}
for (let i = 0; i < SPAWN.length; i++) spawnEnemy(SPAWN[i][0], SPAWN[i][1], SPAWN[i][2]);
/* ---------- fx pool ---------- */
const flashEl = document.getElementById('flash');
const FX = [];
const sphGeo = new THREE.SphereGeometry(0.038, 6, 5);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0xc23b2b });
function tracer(x1, y1, z1, x2, y2, z2, col) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([x1, y1, z1, x2, y2, z2], 3));
  const m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
  scene.add(m);
  FX.push({ m, ttl: 0.07 });
}
function blood(x, y, z, dx, dy, dz, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sphGeo, bloodMat);
    m.position.set(x, y, z);
    scene.add(m);
    FX.push({ m, ttl: rr(0.5, 1.2), vx: dx * rr(0.4, 1.6) + rr(-1.6, 1.6), vy: dy + rr(1, 4.5), vz: dz * rr(0.4, 1.6) + rr(-1.6, 1.6) });
  }
}
function fxStep(dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i];
    f.ttl -= dt;
    if (f.ttl <= 0) { scene.remove(f.m); FX.splice(i, 1); continue; }
    if (f.grow) { const s = f.m.scale.x + f.grow * dt; f.m.scale.set(s, s, s); }
    if (f.vy !== undefined) {
      f.m.position.x += f.vx * dt;
      f.m.position.y += f.vy * dt;
      f.m.position.z += f.vz * dt;
      f.vy -= 19 * dt;
      if (f.m.position.y < 0.035) { f.m.position.y = 0.035; f.vy = 0; f.vx *= 0.3; f.vz *= 0.3; }
    }
  }
}
function hurtPlayer(v) {
  if (godMode) return;
  P.hp -= v;
  flashEl.style.opacity = String(Math.min(0.55, 0.15 + v * 0.02));
  if (P.hp <= 0) { P.hp = 0; loseState(); }
}
/* ---------- enemy AI ---------- */
function enemyAI(dt) {
  for (const e of EN) {
    if (!e.alive) continue;
    e.cd -= dt;
    e.ph += dt;
    const tx = e.sx + Math.sin(e.ph * 0.55) * 2.4, tz = e.sz + Math.cos(e.ph * 0.4) * 2.4;
    const k = Math.min(1, dt * 1.35);
    const ex = e.x + (tx - e.x) * k, ez = e.z + (tz - e.z) * k;
    if (!sideHit(ex, e.y, e.z)) e.x = ex;
    if (!sideHit(e.x, e.y, ez)) e.z = ez;
    e.y = groundAt(e.x, e.z, e.y);
    e.body.position.set(e.x, e.y + 0.85, e.z);
    e.grp.position.set(e.x, e.y, e.z);
    const dx = P.x - e.x, dz = P.z - e.z;
    const dist = Math.hypot(dx, dz);
    e.grp.rotation.y = Math.atan2(dx, dz);
    if (e.cd <= 0 && dist < 27) {
      const hy = e.y + 1.5, ey = P.y + eyeH;
      if (losTo(e.x, hy, e.z, P.x, ey, P.z)) {
        const hitc = dist < 9 ? 0.7 : dist < 18 ? 0.46 : 0.3;
        if (Math.random() < hitc) {
          tracer(e.x, hy, e.z, P.x, ey, P.z, 0xffc46a);
          hurtPlayer(rr(3, 8) * diff);
        } else {
          tracer(e.x, hy, e.z, P.x - dz / dist * rr(-1.8, 1.8), ey + rr(-0.7, 0.9), P.z + dx / dist * rr(-1.8, 1.8), 0xffc46a);
        }
        e.cd = rr(0.6, 1.7) / diff;
      } else e.cd = rr(0.2, 0.5);
    }
  }
}
/* ---------- ragdoll: 11 bodies, 10 point-to-point joints ---------- */
let kills = 0;
const RAGS = [];
// [hx,hy,hz, mass, ox,oy,oz(local from feet), color]
const RP = [
  [0.13, 0.13, 0.13, 2, 0, 1.62, 0, 0xa7bac8],
  [0.21, 0.24, 0.15, 8, 0, 1.12, 0, 0x7d93a2],
  [0.19, 0.17, 0.14, 6, 0, 0.76, 0, 0x51626f],
  [0.06, 0.16, 0.06, 2, -0.27, 1.24, 0, 0x5c6e7e],
  [0.055, 0.15, 0.055, 1.6, -0.27, 0.98, 0, 0x5c6e7e],
  [0.06, 0.16, 0.06, 2, 0.27, 1.24, 0, 0x5c6e7e],
  [0.055, 0.15, 0.055, 1.6, 0.27, 0.98, 0, 0x5c6e7e],
  [0.08, 0.21, 0.08, 3.4, -0.125, 0.41, 0, 0x39434e],
  [0.07, 0.19, 0.07, 2.6, -0.125, 0.15, 0, 0x303943],
  [0.08, 0.21, 0.08, 3.4, 0.125, 0.41, 0, 0x39434e],
  [0.07, 0.19, 0.07, 2.6, 0.125, 0.15, 0, 0x303943]];
// [a, b, joint pivot in ragdoll-local space]
const RJ = [[0, 1, 0, 1.47, 0], [1, 2, 0, 0.9, 0], [1, 3, -0.27, 1.3, 0], [3, 4, -0.27, 1.06, 0],
  [1, 5, 0.27, 1.3, 0], [5, 6, 0.27, 1.06, 0], [2, 7, -0.125, 0.6, 0], [7, 8, -0.125, 0.2, 0],
  [2, 9, 0.125, 0.6, 0], [9, 10, 0.125, 0.2, 0]];
function spawnRagdoll(x, y, z, yaw, ix, iy, iz) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const parts = [];
  for (const p of RP) {
    const b = new Body({ mass: p[3], position: new V3(x + p[4] * cy + p[6] * sy, y + p[5], z - p[4] * sy + p[6] * cy),
      collisionFilterGroup: GRAG, collisionFilterMask: GSTAT | GRAG });
    b.addShape(new Box(new V3(p[0], p[1], p[2])));
    b.linearDamping = 0.15; b.angularDamping = 0.15; b.restitution = 0.25; b.friction = 0.6;
    world.addBody(b);
    const g = new THREE.Group();
    g.position.copy(b.position);
    const m = new THREE.Mesh(new THREE.BoxGeometry(p[0] * 2, p[1] * 2, p[2] * 2), new THREE.MeshLambertMaterial({ color: p[7] }));
    m.castShadow = true;
    g.add(m);
    scene.add(g);
    parts.push({ b, g, lo: [p[4], p[5], p[6]] });
  }
  const jts = [];
  for (const j of RJ) {
    const a = parts[j[0]], b2 = parts[j[1]];
    const dax = j[2] - a.lo[0], day = j[3] - a.lo[1], daz = j[4] - a.lo[2];
    const dbx = j[2] - b2.lo[0], dby = j[3] - b2.lo[1], dbz = j[4] - b2.lo[2];
    const c = new P2P(a.b, new V3(dax * cy + daz * sy, day, -dax * sy + daz * cy),
      b2.b, new V3(dbx * cy + dbz * sy, dby, -dbx * sy + dbz * cy), 3e5);
    world.addConstraint(c);
    jts.push(c);
  }
  for (const i of [1, 2, 0]) parts[i].b.applyImpulse(new V3(ix * (i === 1 ? 1 : 0.6), iy, iz * (i === 1 ? 1 : 0.6)));
  RAGS.push({ parts, jts, ttl: 30 });
}
function killEnemy(e, part, hx, hy, hz, dx, dy, dz, power) {
  e.alive = false;
  world.removeBody(e.body);
  scene.remove(e.grp);
  blood(hx, hy, hz, dx, dy, dz, part === 0 ? 30 : 18);
  spawnRagdoll(e.x, e.y, e.z, e.grp.rotation.y, dx * power, rr(2, 6), dz * power);
  kills++;
  xhEl.classList.add('x');
  setTimeout(() => xhEl.classList.remove('x'), 130);
  if (kills >= EN.length) winState();
}
/* ---------- grenades + explosions ---------- */
const GRA = [];
const grenGeo = new THREE.SphereGeometry(0.09, 8, 6);
const grenMat = new THREE.MeshLambertMaterial({ color: 0x3f4d3a });
function throwGrenade(ox, oy, oz, dx, dy, dz) {
  const m = new THREE.Mesh(grenGeo, grenMat);
  m.position.set(ox, oy, oz);
  scene.add(m);
  GRA.push({ m, x: ox, y: oy, z: oz, vx: dx * 17, vy: dy * 17 + 6, vz: dz * 17, fuse: 2.1 });
}
function stepGrenades(dt) {
  for (let i = GRA.length - 1; i >= 0; i--) {
    const g = GRA[i];
    g.fuse -= dt;
    g.x += g.vx * dt; g.vy -= 21 * dt;
    g.y += g.vy * dt; g.z += g.vz * dt;
    const gy = groundAt(g.x, g.z, g.y + 1);
    if (g.y < gy + 0.09) {
      g.y = gy + 0.09;
      g.vy = Math.abs(g.vy) * 0.4;
      g.vx *= 0.55; g.vz *= 0.55;
      if (g.vy < 1.4) g.vy = 0;
    }
    if (g.x < -33) { g.x = -33; g.vx = 0; }
    if (g.x > 33) { g.x = 33; g.vx = 0; }
    if (g.z < -33) { g.z = -33; g.vz = 0; }
    if (g.z > 33) { g.z = 33; g.vz = 0; }
    g.m.position.set(g.x, g.y, g.z);
    if (g.fuse <= 0) {
      explode(g.x, g.y, g.z);
      scene.remove(g.m);
      GRA.splice(i, 1);
    }
  }
}
function explode(x, y, z, R) {
  if (R === undefined) R = 5;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.55 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
  m.position.set(x, y, z);
  m.scale.set(0.4, 0.4, 0.4);
  scene.add(m);
  FX.push({ m, ttl: 0.3, grow: 14 * (R / 5) });
  for (let i = 0; i < 10; i++) tracer(x, y, z, x + rr(-2.5, 2.5) * R / 5, y + rr(0, 3) * R / 5, z + rr(-2.5, 2.5) * R / 5, 0xffd08a);
  for (const e of EN) {
    if (!e.alive) continue;
    const ex = e.x, ey = e.y + 0.9, ez = e.z;
    const dx = ex - x, dy = ey - y, dz = ez - z;
    const d = Math.hypot(dx, dy, dz);
    if (d < R && losTo(x, y, z, ex, ey, ez)) {
      const p = 12 * (1 - d / R);
      killEnemy(e, 1, ex, ey, ez, dx / d, dy / d, dz / d, p);
    }
  }
  for (const rg of RAGS) for (const p of rg.parts) {
    const dx = p.b.position.x - x, dy = p.b.position.y - y, dz = p.b.position.z - z;
    const d = Math.hypot(dx, dy, dz);
    if (d < R && d > 0.01) p.b.applyImpulse(new V3(dx / d * 13 * (1 - d / R), rr(1, 7), dz / d * 13 * (1 - d / R)));
  }
  const pd = Math.hypot(P.x - x, P.y + eyeH - y, P.z - z);
  if (pd < 3.4 && losTo(x, y, z, P.x, P.y + eyeH, P.z)) hurtPlayer(34 * (1 - pd / 3.4));
}
/* ---------- F1: game state + weapons ---------- */
let state = 'menu', diff = 1, godMode = false;
let cur = 0, cool = 0, cool2 = 0, recoil = 0, headN = 0, startT = 0;
const STMP = 'BUILD 1 \u00b7 playtest \u00b7 three.js r165 + cannon-es 0.20';
const WPN = [
  { n: 'RIFLE', rate: 0.115, dmg: 26, pel: 1, sp: 0.014, pow: 5, splash: 0 },
  { n: 'SHOTGUN', rate: 0.78, dmg: 21, pel: 8, sp: 0.055, pow: 11, splash: 0 },
  { n: 'PLASMA', rate: 0.34, dmg: 46, pel: 1, sp: 0.006, pow: 7, splash: 1.8 },
  { n: 'GRENADE', rate: 0.9, dmg: 0, pel: 0, sp: 0, pow: 0, splash: 0, gren: 1 }
];
const TRC = [0xffe2b0, 0xffb37a, 0x69d8f2, 0xffd08a];
function spark(x, y, z, col, n) {
  const mat = new THREE.MeshBasicMaterial({ color: col });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sphGeo, mat);
    m.position.set(x, y, z);
    scene.add(m);
    FX.push({ m, ttl: rr(0.15, 0.4), vx: rr(-2.5, 2.5), vy: rr(1.5, 5), vz: rr(-2.5, 2.5) });
  }
}
/* ---------- F2: viewmodel ---------- */
function vbox(w, h, d, col, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col }));
  m.position.set(x, y, z);
  return m;
}
wScene.add(new THREE.AmbientLight(0xa9b6c6, 1.15));
{
  const wdl = new THREE.DirectionalLight(0xffffff, 1.5);
  wdl.position.set(1.4, 3, 2);
  wScene.add(wdl);
}
const WVM = [];
const rifle = new THREE.Group();
rifle.add(vbox(0.06, 0.08, 0.6, 0x464e58, 0, 0, 0));
rifle.add(vbox(0.034, 0.034, 0.3, 0x2b3138, 0, 0.014, -0.44));
rifle.add(vbox(0.055, 0.17, 0.09, 0x363e46, 0, -0.11, 0));
rifle.add(vbox(0.05, 0.09, 0.2, 0x5a4334, -0.005, -0.03, 0.34));
rifle.add(vbox(0.016, 0.036, 0.016, 0x9aa6b2, 0, 0.066, -0.28));
WVM.push(rifle);
const shott = new THREE.Group();
shott.add(vbox(0.062, 0.05, 0.66, 0x364046, 0, 0.02, 0));
shott.add(vbox(0.05, 0.042, 0.5, 0x2a3238, 0, -0.026, -0.06));
shott.add(vbox(0.058, 0.07, 0.12, 0x6a4a30, 0, -0.032, 0.1));
shott.add(vbox(0.06, 0.14, 0.16, 0x6a4a30, 0, -0.06, 0.34));
WVM.push(shott);
const plas = new THREE.Group();
plas.add(vbox(0.1, 0.13, 0.5, 0x39424d, 0, 0, 0));
plas.add(vbox(0.06, 0.16, 0.1, 0x2c343d, 0, -0.12, 0.06));
{
  const wco = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.26, 10), new THREE.MeshBasicMaterial({ color: 0x69d8f2 }));
  wco.rotation.x = Math.PI / 2;
  wco.position.set(0, 0.05, -0.34);
  plas.add(wco);
}
WVM.push(plas);
const grenvm = new THREE.Group();
grenvm.add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3f4d3a })));
grenvm.add(vbox(0.028, 0.055, 0.028, 0x2a342a, 0.025, 0.1, 0));
WVM.push(grenvm);
for (const wv of WVM) wScene.add(wv);
const VMPOS = [[0.27, -0.27, -0.55], [0.26, -0.29, -0.6], [0.24, -0.28, -0.52], [0.26, -0.32, -0.5]];
for (let i = 0; i < 4; i++) WVM[i].position.set(VMPOS[i][0], VMPOS[i][1], VMPOS[i][2]);
/* ---------- F3: shooting + rag sync ---------- */
function shot(dt) {
  if (cool > 0) cool -= dt;
  if (cool2 > 0) cool2 -= dt;
  recoil = Math.max(0, recoil - dt * 6);
  if (state !== 'play' || !input.pointerCaptured) return;
  const pc = Math.cos(P.pitch), ps = Math.sin(P.pitch);
  const yc = Math.cos(P.yaw), ys = Math.sin(P.yaw);
  const fx = -ys * pc, fy = ps, fz = -yc * pc;
  const ox = P.x + fx * 0.7 + yc * 0.16, oy = P.y + eyeH - 0.06, oz = P.z + fz * 0.7 - ys * 0.16;
  if (input.fireAlt && cool2 <= 0 && GRA.length < 4) {
    cool2 = 1;
    recoil = Math.min(0.2, recoil + 0.05);
    throwGrenade(ox, oy, oz, fx, fy, fz);
  }
  if (!input.fire) return;
  const wpn = WPN[cur];
  if (cool > 0) return;
  if (wpn.gren) {
    if (GRA.length < 4) {
      cool = wpn.rate;
      recoil = Math.min(0.2, recoil + 0.05);
      throwGrenade(ox, oy, oz, fx, fy, fz);
    } else cool = 0.4;
    return;
  }
  cool = wpn.rate;
  recoil = Math.min(0.22, recoil + wpn.pow * 0.0035 + 0.012);
  spark(ox + fx * 0.55, oy + fy * 0.55, oz + fz * 0.55, TRC[cur], 2);
  for (let i = 0; i < wpn.pel; i++) {
    let dx = fx + rr(-1, 1) * wpn.sp, dy = fy + rr(-1, 1) * wpn.sp, dz = fz + rr(-1, 1) * wpn.sp;
    const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx *= il; dy *= il; dz *= il;
    const h = rayHit(ox, oy, oz, dx, dy, dz, 160);
    const t = h.t;
    const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
    tracer(ox, oy, oz, hx, hy, hz, TRC[cur]);
    if (h.en) {
      const m2 = h.part === 0 ? 2.2 : (h.part === 2 ? 0.7 : 1);
      if (h.en.hp > 0) {
        h.en.hp -= wpn.dmg * m2;
        if (h.en.hp <= 0) {
          if (h.part === 0) headN++;
          killEnemy(h.en, h.part, hx, hy, hz, dx, dy, dz, wpn.pow);
        } else blood(hx, hy, hz, dx, dy, dz, 8);
      }
      if (wpn.splash > 0) explode(hx, hy, hz, wpn.splash);
    } else {
      spark(hx, hy, hz, 0xc9c4b2, 5);
      if (wpn.splash > 0 && t < 159) explode(hx, hy, hz, wpn.splash);
    }
  }
}
function syncRags() {
  for (const rg of RAGS) {
    for (const p of rg.parts) {
      p.g.position.set(p.b.position.x, p.b.position.y, p.b.position.z);
      p.g.quaternion.set(p.b.quaternion.x, p.b.quaternion.y, p.b.quaternion.z, p.b.quaternion.w);
    }
  }
}
function ragCleanup(dt) {
  for (let i = RAGS.length - 1; i >= 0; i--) {
    const rg = RAGS[i];
    rg.ttl -= dt;
    if (rg.ttl <= 0) {
      for (const p of rg.parts) { world.removeBody(p.b); scene.remove(p.g); }
      for (const c of rg.jts) world.removeConstraint(c);
      RAGS.splice(i, 1);
    }
  }
}
/* ---------- F4: HUD + cards + menu ---------- */
function setHUD() {
  const hp = Math.max(0, Math.round(P.hp));
  const wpn = WPN[cur];
  const hpTag = hp < 25 ? '<em class="blink">HP ' + hp + '</em>' : '<b>HP ' + hp + '</b>';
  hudTxt.innerHTML = hpTag + '<i>' + wpn.n + '</i><s>' + kills + ' / ' + EN.length + '</s><q>GRENADES ' + (4 - GRA.length) + '</q>';
  vigEl.style.opacity = String(cl(1 - hp / 60, 0, 0.58));
}
function mkBtn(txt) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.addEventListener('click', function () { location.reload(); });
  return b;
}
function winState() {
  if (state === 'won') return;
  state = 'won';
  wonEl.classList.add('k-won');
  wonEl.style.display = 'flex';
  const t = Math.round((performance.now() - startT) / 1000);
  document.getElementById('wonsub').textContent = 'Every target went limp. The yard is quiet.';
  document.getElementById('wonstats').textContent = 'Time ' + t + 's \u00b7 headshots ' + headN + ' \u00b7 difficulty x' + diff;
  document.getElementById('wonbtns').appendChild(mkBtn('RESTART'));
  document.getElementById('wonstamp').textContent = STMP;
}
function loseState() {
  if (state === 'lost') return;
  state = 'lost';
  lostEl.classList.add('k-lost');
  lostEl.style.display = 'flex';
  document.getElementById('lostsub').textContent = 'Something kept you standing in Downside Yard for too long.';
  document.getElementById('loststats').textContent = 'Kills ' + kills + ' / ' + EN.length + ' \u00b7 difficulty x' + diff;
  document.getElementById('lostbtns').appendChild(mkBtn('RESTART'));
  document.getElementById('loststamp').textContent = STMP;
}
function startGame(d) {
  diff = d;
  state = 'play';
  startT = performance.now();
  menuEl.style.display = 'none';
  setHUD();
}
{
  const btnsBox = document.getElementById('btns');
  const defs = [['EASY', 0.7], ['NORMAL', 1], ['HARD', 1.35]];
  for (const d of defs) {
    const b = document.createElement('button');
    b.textContent = d[0];
    if (d[1] === 1) b.className = 'hot';
    b.addEventListener('click', function () { startGame(d[1]); });
    btnsBox.appendChild(b);
  }
  document.getElementById('totline').textContent = EN.length + ' targets';
  document.getElementById('stamp').textContent = STMP;
}
/* ---------- F5: main loop ---------- */
cam.rotation.order = 'YXZ';
let lastT = performance.now(), acc = 0, paused = false, pLatch = false, wLatch = false;
let bobT = 0, pxOld = P.x, pzOld = P.z;
function frame() {
  const now = performance.now();
  const dtr = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const wk = keys['1'] || keys['2'] || keys['3'] || keys['4'];
  if (wk && !wLatch) {
    if (keys['1']) cur = 0; else if (keys['2']) cur = 1; else if (keys['3']) cur = 2; else cur = 3;
    cool = Math.min(cool, 0.1);
    setHUD();
  }
  wLatch = !!wk;
  const pk = keys['p'] === 1;
  if (pk && !pLatch && state === 'play') paused = !paused;
  pLatch = pk;
  if (state === 'play') {
    const unlocked = !input.pointerCaptured;
    const showPause = paused || unlocked;
    pauseEl.style.display = showPause ? 'flex' : 'none';
    if (showPause) {
      document.getElementById('pauseSub').textContent = unlocked
        ? 'Not capturing cursor \u00b7 click the view to capture \u00b7 Esc releases'
        : 'Press P to resume.';
      document.getElementById('pauseStats').textContent = 'kills ' + kills + ' / ' + EN.length + ' \u00b7 hp ' + Math.round(P.hp);
      document.getElementById('pauseStamp').textContent = STMP;
    }
  }
  if (state === 'play' && !paused && input.pointerCaptured) {
    acc += dtr;
    let guard = 0;
    while (acc >= STEP && guard < 10) {
      acc -= STEP; guard++;
      playerStep(STEP);
      enemyAI(STEP);
      shot(STEP);
      world.step(1 / 60);
      syncRags();
      stepGrenades(STEP);
      fxStep(STEP);
    }
    if (guard >= 10) acc = 0;
    ragCleanup(dtr);
    const fop = parseFloat(flashEl.style.opacity || '0');
    if (fop > 0) flashEl.style.opacity = String(Math.max(0, fop - dtr * 1.6));
    setHUD();
  }
  const rk = cur === 1 ? recoil * 1.7 : recoil;
  cam.position.set(P.x, P.y + eyeH, P.z);
  cam.rotation.set(P.pitch + rk, P.yaw, 0);
  const mvx = P.x - pxOld, mvz = P.z - pzOld;
  pxOld = P.x; pzOld = P.z;
  bobT += dtr;
  const mvs = Math.sqrt(mvx * mvx + mvz * mvz) / Math.max(dtr, 0.0001);
  const amp = Math.min(0.012, mvs * 0.0055);
  const bob = Math.sin(bobT * 9.5) * amp;
  const vm = WVM[cur];
  const vp = VMPOS[cur];
  vm.position.set(vp[0] + bob * 0.6, vp[1] + bob, vp[2] + Math.min(0.1, recoil * 1.2));
  vm.rotation.x = -recoil * 2.2;
  renderer.clear();
  renderer.render(scene, cam);
  renderer.clearDepth();
  renderer.render(wScene, wCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
/* ---------- F6: test hooks ---------- */
/* errors are captured by the listener installed right after the boot guard */
function aimAt(i) {
  const e = EN[i];
  const dx = e.x - P.x, dz = e.z - P.z;
  const dy = e.y + 0.98 - (P.y + eyeH);
  P.yaw = Math.atan2(-dx, -dz);
  P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  input.pointerCaptured = true;
}
window.__test = {
  ready: 1,
  errors: window.__test_errors,
  alive: function () { let c = 0; for (const e of EN) if (e.alive) c++; return c; },
  state: function () { return state; },
  start: function (d) { startGame(d === undefined ? 1 : d); },
  goto: function (x, z) { P.x = x; P.z = z; },
  aimAt: function (i) { aimAt(i); },
  fire: function (w) { if (w !== undefined && w !== null) cur = w; input.pointerCaptured = true; input.fire = true; },
  hold: function (v) { input.fire = !!v; },
  hurt: function (v) { hurtPlayer(v); },
  hp: function (v) { if (v === undefined) return P.hp; P.hp = v; },
  god: function (v) { godMode = !!v; },
  kill: function (i) { const e = EN[i]; if (e.alive) killEnemy(e, 1, e.x, e.y + 1, e.z, 0, 0.6, 0, 4); },
  nbadies: function () { return world.bodies.length; },
  bpos: function () { return world.bodies.map(b => [Math.round(b.position.x * 100) / 100, Math.round(b.position.y * 100) / 100, Math.round(b.position.z * 100) / 100]); },
  pos: function () { return [Math.round(P.x * 100) / 100, Math.round(P.y * 100) / 100, Math.round(P.z * 100) / 100]; },
  info: function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, progs: renderer.info.programs.length }; },
  snap: function () {
    renderer.render(scene, cam);
    const W = 240, H = Math.round(240 * canvas.height / canvas.width);
    const c2 = document.createElement('canvas');
    c2.width = W; c2.height = H;
    const g2 = c2.getContext('2d');
    g2.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, W, H);
    const d = g2.getImageData(0, 0, W, H).data;
    let sum = 0; const hist = {};
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      sum += (r + gg + b) / 3;
      const k = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
      hist[k] = (hist[k] || 0) + 1;
    }
    const n = d.length / 16;
    return { mean: Math.round(sum / n * 100) / 100, colors: Object.keys(hist).length,
      jpeg: c2.toDataURL('image/jpeg', 0.6).slice('data:image/jpeg;base64,'.length) };
  }
};
//@@END
