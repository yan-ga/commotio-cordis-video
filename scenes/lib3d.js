// lib3d.js: realistic 3D toolkit (three.js r170) for the commotio cordis scenes.
//
// Load lib.js first as a classic script, then import this module:
//   <script src="lib.js"></script>
//   <script type="importmap">{"imports":{"three":"../node_modules/three/build/three.module.js","three/addons/":"../node_modules/three/examples/jsm/"}}</script>
//   <script type="module"> import * as L3 from './lib3d.js'; ... setup(draw); </script>
// Everything is procedural and synchronous, so a scene can call setup(draw) as soon as it has built its objects.
// Every update function takes t (or a 0..1 parameter) and never keeps state, so any frame renders on its own.
//
// ---------------------------------------------------------------------------------------------- STAGE
// createStage({ bloom, dof, ao, fog, fov, exposure, width, height, region, envIntensity, msaa, lightsFollowCamera })
//   bloom: true | false | { strength, radius, threshold }          default { 0.6, 0.4, 1.15 } (only emissives bloom)
//   dof:   false | true | { focus, aperture, maxblur }              focus is a distance in world units
//   ao:    true (default) | false | { radius = 0.45, intensity = 0.85, thickness } ground-truth ambient occlusion
//          that darkens crevices (between lipid heads, cells, ribs); radius is in world units
//   fog:   0 (off) or an exp2 density such as 0.04; fog colour matches the background
//   region: where the render will be drawn on the 1920x1080 frame (default the whole frame). The background
//           is the same navy radial gradient lib.js bg() paints, cut to that region, so a smaller 3D inset is seamless.
// -> { renderer, scene, camera, composer, canvas, lights: { key, rim, under, hemi }, region, bokeh, ao, bloom,
//      render(), draw(ctx, alpha = 1), frame(ctx, alpha = 1) (render + draw),
//      setCamera(state) ({ pos, target, fov }), focusOn(vec3 | distance), toScreen(vec3) -> { x, y, z } frame pixels,
//      pxPerUnitAt(vec3) (frame pixels per world unit at that depth) }
// Lit (non-emissive) surfaces get a soft ceiling on reflected light just under the bloom threshold, so only
// emissive things glow and depth of field never smears a hot highlight into a square blob.
// Transparent objects (glass torso, glow halos) and anything with userData.noDepth are left out of the depth
// and normal passes used by depth of field and ambient occlusion. Typical frame cost is 25 to 40 ms at 1080p.
//
// ---------------------------------------------------------------------------------------------- CAMERA
// cameraPath(keys, { smooth = true, drift = 0 }) -> t => { pos, target, fov }
//   keys: [{ t, pos: [x,y,z], target: [x,y,z], fov? }]. smooth: one ease across the whole path through Catmull-Rom
//   splines (a continuous flight). smooth: false eases in and out of every key (a sequence of moves with holds).
//   drift: amplitude of a slow deterministic hand-held float.
// pushIn(t, t0, t1, from, to) -> { pos, target, fov } eased between two { pos, target, fov } states.
// orbit(t, { target, radius, height, speed, phase, fov }) -> state circling the target.
//
// ---------------------------------------------------------------------------------------------- MATERIALS
// muscleMaterial({ color, striations = 1, repeat = [3, 1], sss }) striated, wet, soft-edged heart muscle.
// membraneMaterial({ color }) glossy phospholipid head material.   tailMaterial() pale waxy lipid tails.
// proteinMaterial(color) smooth glossy protein surface.            boneMaterial(), cartilageMaterial()
// glowMaterial(color, intensity) emissive material that blooms.    skinMaterial(color), fabricMaterial(color, repeat) (knit)
// glassMaterial({ color, rim, min, max, side }) fresnel x-ray glass (opaque at grazing angles, clear face-on).
// translucent(material, color, strength) adds a soft subsurface-style edge glow to any physical material.
// ION_COLOURS { na, k, ca } and STATE_COLOURS { ready, half, locked, firing } match lib.js and shared.js.
//
// ---------------------------------------------------------------------------------------------- CELLS
// createCellSheet({ cols, rows, length, height, depth, gap, vgap, stagger, seed, layout2D, unit })
//   Cardiomyocytes joined end to end by intercalated discs. Rows are laid out exactly like shared.js
//   sheetLayout (odd rows shifted half a pitch). Pass layout2D: { w, h, gap, vgap } (2D pixels) and unit
//   (world units per pixel, default 1/40) to build the 3D twin of a 2D sheetLayout; flatten it with
//   { pxPerUnit: 1 / unit } and the bricks land on the 2D bricks.
//   -> { group, cells: [{ mesh, row, col, x, y }], discs, size: { w, h }, index(row, col),
//        setCell(i, { state: 'ready' | 'half' | 'locked' | 'firing', tint: 0..1, fire: 0..1, squash: [sx, sy, sz] }),
//        setDisc(i, glow 0..1), reset() }
//   tint replaces the muscle colour with the state colour (with a faint glow), fire adds a blooming yellow-white flash.
// createCell(opts) one loose cell (same options as a sheet) -> { group, mesh, set(...) }.
//
// ---------------------------------------------------------------------------------------------- MEMBRANE
// createMembrane({ width, depth, spacing, doors: [{ kind, x, z, lid, cutaway }], seed })
//   Lipid bilayer patch in the XZ plane: outside of the cell is +Y, inside is -Y. Heads and tails are instanced.
//   -> { group, doors: [door], update(t, { stretch = 0, wave = 1 }), surface(x, z, t) -> y, thickness }
//   Call update every frame (it also moves the doors with the membrane). Put a door near the front cut edge
//   (z close to depth / 2) to show it in cross-section with its pore facing a camera on +Z.
// createDoor({ kind: 'na' | 'k' | 'ca' | 'leak' | 'stretch', lid, cutaway = true, color })
//   -> { group, kind, radius, set({ open 0..1, lid 0..1 (1 = plugged), stretch 0..1 }),
//        path(p, seed, dir = 'in') -> world Vector3 of an ion travelling through this door at progress p }
//   Doors are 3 visible subunits: the front one is cut away so the pore shows, the back one is the far wall,
//   and open slides the two side halves apart (with a soft glow in the pore in the ion's colour).
//   Flow example: ions.set(i, door.path(frac(rate * t - i / n), i, 'in').sub(parentWorldPosition)).
//   Sodium doors with lid: true carry a ball-and-chain lid on the inside face. Stretch doors carry two coiled
//   springs anchored in the membrane: stretch pulls the springs long and should be paired with open.
// createIons(kind, count, { radius = 0.13, halo = 1 }) instanced glowing spheres with soft halos.
//   -> { group, count, set(i, vec3 | [x, y, z], scale = 1), hideFrom(i), commit() }  call commit() after setting.
// ionCloud(seed, n, box: { min: [..], max: [..] }, t, amp = 0.15) -> Vector3[] deterministic drifting scatter.
// jitter(seed, t, amp) -> Vector3 small deterministic thermal wobble.
// createNegativeMolecule({ seed, radius }) dark blobby protein with a glowing minus sign that always faces camera.
//   -> { group, update(camera) }
//
// ---------------------------------------------------------------------------------------------- MOTOR PROTEINS
// createSarcomere({ heads = 3, beads = 48, seed }) actin strand (twisted double bead chain with lock knobs)
//   above a myosin thick filament with rowing heads.
//   -> { group, actin, update(cycles, { engage = 1, locks = 0, slide }) , stroke }
//   cycles: how many rowing cycles have run (a scene passes e.g. 0.8 * (t - t0)); freeze it to stop.
//   engage 0 parks the heads cocked and detached. locks 1 = lock knobs seated on the strand, 0 = popped off.
//   slide overrides the strand offset (to slide it back); by default it follows the rowing.
//
// ---------------------------------------------------------------------------------------------- PROPS
// createAED({ open }) generic green defibrillator -> { group, set({ open 0..1, flash 0..1 }) }
// createAEDPad() one electrode pad -> Group.   cable(points: Vector3[], radius) -> Mesh.
// createTorso() glassy human torso with ribcage -> { group, skin, ribs: Mesh[], bones: Group, heartAnchor,
//   set({ glass = 1, ribGlow = 0, ribColor }) }   (torso faces +Z, patient's left is +X, chest centre near y = 0.6)
//   The real heart: const h = await loadHeart(stage.renderer) from heart3d.js, h.group.scale.setScalar(0.42),
//   torso.heartAnchor.add(h.group); both use the same axes, so no rotation is needed (see _lib3d_demo.html).
// createCricketBall() -> Group (radius 0.22).  createLeg() bent knee in shorts, sock and trainer,
//   knee point at origin, shin hangs down -> Group.
// createArm() elbow-first arm in a short sleeve with a clenched fist, elbow point at origin -> Group.
//   Both lead towards +X and end in a rounded cut at the hip and shoulder, so frame shots with that end out of view.
// createImpactFlash(color) -> { group, update(p) } shock ring + flash; p 0..1 after contact (0 or 1 = invisible).
//
// ---------------------------------------------------------------------------------------------- FLATTEN
// flatten(obj, stage, p, { center: [px, py], pxPerUnit | fill, width, distance, thin }) eases obj from its own pose to
//   face the camera (its local +Z towards the viewer, local +Y up), centred at frame pixel `center`, scaled so one
//   local unit spans pxPerUnit frame pixels (or so `width` local units span `fill` of the frame width). It stays at
//   its starting depth unless `distance` is given.
//   thin squashes local Z at the end (1 = keep depth). Returns { e, pxPerUnit, center }. flattenReset(obj) restores it.
//   Typical: flatten(patch, stage, p); stage.frame(ctx, 1 - q); draw2D(ctx, q) with q a little after p ends.
//
// ---------------------------------------------------------------------------------------------- UTILITIES
// rng(seed) -> () => [0,1) deterministic.  noise3(x, y, z, seed) value noise.  fbm3(x, y, z, seed, oct)
// ease, clamp, lerp, seg re-exported for convenience: ease(p) is the same easeIO as lib.js.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

const FW = 1920, FH = 1080;
// lib.js declares C as a global lexical binding, which modules can read by name.
const LC = typeof C !== 'undefined' ? C : { bg0: '#0a1230', bg1: '#162456', na: '#ffc93c', k: '#b57bff', ca: '#4be3a0', membrane: '#ff7a8f', lipid: '#ffd6dc' };
export const ION_COLOURS = { na: LC.na, k: LC.k, ca: LC.ca };
export const STATE_COLOURS = { ready: '#4fa8ff', half: '#ffa53c', locked: '#ff5466', firing: '#ffe680' };

// ---------------------------------------------------------------------------------------------- math
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ease = p => (p = clamp(p), p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - clamp(p), 3);
const smooth = (a, b, x) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };
const frac = x => x - Math.floor(x);
const hash = i => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);
const gauss = (x, s) => Math.exp(-(x * x) / (s * s));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const toV = a => (a.isVector3 ? a.clone() : V(a[0], a[1], a[2]));

export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const h3 = (x, y, z, s) => frac(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453);
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += h3(ix + dx, iy + dy, iz + dz, seed) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return r * 2 - 1;
}
export function fbm3(x, y, z, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 7); a *= 0.5; f *= 2.03; }
  return s;
}
// Tileable 2D value noise on a period x period grid, for textures that repeat.
function tnoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const g = (a, b) => h3(((a % period) + period) % period, ((b % period) + period) % period, 0, seed);
  return lerp(lerp(g(ix, iy), g(ix + 1, iy), ux), lerp(g(ix, iy + 1), g(ix + 1, iy + 1), ux), uy) * 2 - 1;
}

// ---------------------------------------------------------------------------------------------- background
// The background is painted before tone mapping, so it is pre-distorted with the inverse of three's ACES
// curve: after OutputPass it comes out as exactly the sRGB gradient lib.js bg() paints.
function acesFwd(r, g, b, exp) {
  const k = exp / 0.6; r *= k; g *= k; b *= k;
  const x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const y = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const z = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const f = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const X = f(x), Y = f(y), Z = f(z);
  return [1.60475 * X - 0.53108 * Y - 0.07367 * Z, -0.10208 * X + 1.10813 * Y - 0.00605 * Z, -0.00327 * X - 0.07276 * Y + 1.07602 * Z];
}
function acesInverse(target, exp) {
  let x = target.slice();
  for (let it = 0; it < 30; it++) {
    const f0 = acesFwd(x[0], x[1], x[2], exp);
    const err = [f0[0] - target[0], f0[1] - target[1], f0[2] - target[2]];
    if (Math.abs(err[0]) + Math.abs(err[1]) + Math.abs(err[2]) < 1e-7) break;
    const J = [];
    for (let c = 0; c < 3; c++) {
      const h = 1e-5, xp = x.slice(); xp[c] += h;
      const f1 = acesFwd(xp[0], xp[1], xp[2], exp);
      J.push([(f1[0] - f0[0]) / h, (f1[1] - f0[1]) / h, (f1[2] - f0[2]) / h]);
    }
    // J[c][r] = d f_r / d x_c; solve J^T dx = err by Cramer's rule.
    const m = [[J[0][0], J[1][0], J[2][0]], [J[0][1], J[1][1], J[2][1]], [J[0][2], J[1][2], J[2][2]]];
    const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(m);
    if (Math.abs(D) < 1e-12) break;
    for (let c = 0; c < 3; c++) {
      const mc = m.map((row, r) => row.map((v, cc) => (cc === c ? err[r] : v)));
      x[c] = Math.max(0, x[c] - det(mc) / D);
    }
  }
  return x;
}
const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexSRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// Parameter of lib.js bg(): createRadialGradient(W/2, H*0.45, 100, W/2, H/2, W*0.75), solved for pixel (px, py).
function bgParam(px, py) {
  const c0x = FW / 2, c0y = FH * 0.45, r0 = 100, cdx = 0, cdy = FH * 0.05, dr = FW * 0.75 - 100;
  const pdx = px - c0x, pdy = py - c0y;
  const A = cdx * cdx + cdy * cdy - dr * dr, B = pdx * cdx + pdy * cdy + r0 * dr, Cc = pdx * pdx + pdy * pdy - r0 * r0;
  const s = Math.sqrt(Math.max(0, B * B - A * Cc));
  const t1 = (B + s) / A, t2 = (B - s) / A;
  let t = Math.max(t1, t2);
  if (r0 + t * dr < 0) t = Math.min(t1, t2);
  return clamp(t);
}
function bgColour(t, exp) {
  const a = hexSRGB(LC.bg1), b = hexSRGB(LC.bg0);
  return acesInverse([0, 1, 2].map(i => srgbToLin(lerp(a[i], b[i], t))), exp);
}
function backgroundTexture(region, exp) {
  const lut = [];
  for (let i = 0; i <= 256; i++) lut.push(bgColour(i / 256, exp));
  const w = 320, h = Math.max(2, Math.round(320 * region.h / region.w));
  const data = new Uint16Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = region.x + (x + 0.5) / w * region.w, py = region.y + (1 - (y + 0.5) / h) * region.h;
    const f = bgParam(px, py) * 256, i0 = Math.floor(f), i1 = Math.min(256, i0 + 1), q = f - i0;
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) data[o + c] = THREE.DataUtils.toHalfFloat(lerp(lut[i0][c], lut[i1][c], q));
    data[o + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------- stage
export function createStage(o = {}) {
  const width = o.width || FW, height = o.height || FH;
  const region = o.region || { x: 0, y: 0, w: FW, h: FH };
  const exposure = o.exposure ?? 1;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;

  const scene = new THREE.Scene();
  scene.background = backgroundTexture(region, exposure);
  const camera = new THREE.PerspectiveCamera(o.fov ?? 35, width / height, o.near ?? 0.05, o.far ?? 200);
  camera.position.set(0, 0, 10);
  scene.add(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = o.envIntensity ?? 0.4;
  pmrem.dispose();

  if (o.fog) {
    const c = bgColour(0.35, exposure);
    scene.fog = new THREE.FogExp2(new THREE.Color(c[0], c[1], c[2]), o.fog);
  }

  // Lights ride on a rig that copies the camera, so every shot keeps the same cinematic setup:
  // warm key from upper left front, cool rim from behind right, a warm under-rim and a soft sky fill.
  const rig = new THREE.Group();
  scene.add(rig);
  const dl = (col, inten, pos, tgt = [0, 0, -8]) => {
    const l = new THREE.DirectionalLight(col, inten);
    l.position.set(...pos); l.target.position.set(...tgt);
    rig.add(l, l.target);
    return l;
  };
  const lights = {
    key: dl('#fff1e2', 2.6, [-5, 6, 4]),
    rim: dl('#8fb8ff', 4.2, [7, 4, -16]),
    under: dl('#ff8f86', 1.4, [-6, -5, -12]),
    hemi: new THREE.HemisphereLight('#a8c0ff', '#3a1420', 0.45),
  };
  scene.add(lights.hemi);
  const follow = o.lightsFollowCamera ?? true;

  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: o.msaa ?? 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));

  // Depth-based passes would read the background texture and see-through glass or glow sprites as solid
  // surfaces, so those are hidden while such a pass renders its own depth and normals.
  const opaqueOnly = pass => {
    const raw = pass.render.bind(pass);
    pass.render = (...args) => {
      const hidden = [];
      scene.traverse(ob => {
        if (!ob.visible || !ob.material) return;
        const mats = Array.isArray(ob.material) ? ob.material : [ob.material];
        if (ob.userData.noDepth || mats.some(m => m.transparent)) { ob.visible = false; hidden.push(ob); }
      });
      const bg = scene.background, fog = scene.fog;
      scene.background = null; scene.fog = null;
      raw(...args);
      scene.background = bg; scene.fog = fog;
      for (const ob of hidden) ob.visible = true;
    };
    return pass;
  };
  let ao = null;
  if (o.ao !== false) {
    const a = typeof o.ao === 'object' ? o.ao : {};
    ao = opaqueOnly(new GTAOPass(scene, camera, width, height));
    ao.updateGtaoMaterial({ radius: a.radius ?? 0.45, distanceExponent: 1.5, thickness: a.thickness ?? 1, scale: 1, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = a.intensity ?? 0.85;
    composer.addPass(ao);
  }
  let bokeh = null;
  if (o.dof) {
    const d = o.dof === true ? {} : o.dof;
    bokeh = opaqueOnly(new BokehPass(scene, camera, { focus: d.focus ?? 10, aperture: d.aperture ?? 0.0025, maxblur: d.maxblur ?? 0.008 }));
    composer.addPass(bokeh);
  }
  let bloomPass = null;
  if (o.bloom !== false) {
    const b = typeof o.bloom === 'object' ? o.bloom : {};
    // Threshold above 1 so only emissive things (ions, firing cells, flashes) bloom, never lit surfaces.
    bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), b.strength ?? 0.6, b.radius ?? 0.4, b.threshold ?? 1.15);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());

  // Sharp key-light highlights on clearcoat reach 20+ in HDR: depth of field smears them into square blobs and
  // bloom turns them into sparkles. Every lit material in the scene gets a soft ceiling on its reflected light
  // (just under the bloom threshold) so only emissive light can glow.
  const tamed = new WeakSet();
  function tame() {
    scene.traverse(ob => {
      if (!ob.material) return;
      for (const m of Array.isArray(ob.material) ? ob.material : [ob.material]) {
        if (!m.isMeshStandardMaterial || tamed.has(m)) continue;
        tamed.add(m);
        const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
        m.onBeforeCompile = (sh, r) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{
            vec3 surf = max(outgoingLight - totalEmissiveRadiance, 0.0);
            float pk = max(surf.r, max(surf.g, surf.b));
            if (pk > 0.85) surf *= (0.85 + 0.27 * (1.0 - exp(-(pk - 0.85) / 0.27))) / pk;
            outgoingLight = surf + totalEmissiveRadiance;
          }
          #include <opaque_fragment>`);
          prev.call(m, sh, r);
        };
        m.customProgramCacheKey = () => 'tame|' + prevKey;
        m.needsUpdate = true;
      }
    });
  }

  function setCamera(s) {
    if (s.pos) camera.position.copy(toV(s.pos));
    if (s.fov && s.fov !== camera.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    camera.lookAt(s.target ? toV(s.target) : V());
    camera.updateMatrixWorld();
  }
  function render() {
    camera.updateMatrixWorld();
    if (follow) { rig.position.copy(camera.position); rig.quaternion.copy(camera.quaternion); }
    tame();
    composer.render();
  }
  function draw(ctx, alpha = 1, rect = region) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(renderer.domElement, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }
  function toScreen(v) {
    camera.updateMatrixWorld();
    const p = toV(v).project(camera);
    return { x: region.x + (p.x * 0.5 + 0.5) * region.w, y: region.y + (0.5 - p.y * 0.5) * region.h, z: p.z };
  }
  function pxPerUnitAt(v) {
    camera.updateMatrixWorld();
    const d = -toV(v).applyMatrix4(camera.matrixWorldInverse).z;
    return region.h / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
  function focusOn(target) {
    if (!bokeh) return;
    bokeh.uniforms.focus.value = typeof target === 'number' ? target : camera.position.distanceTo(toV(target));
  }
  return {
    renderer, scene, camera, composer, canvas: renderer.domElement, lights, region, bokeh, ao, bloom: bloomPass, rig,
    render, draw, frame: (ctx, alpha = 1) => { render(); draw(ctx, alpha); }, setCamera, toScreen, pxPerUnitAt, focusOn,
  };
}

// ---------------------------------------------------------------------------------------------- camera
export function cameraPath(keys, o = {}) {
  const smoothPath = o.smooth ?? true, drift = o.drift ?? 0, n = keys.length;
  const P = keys.map(k => toV(k.pos)), T = keys.map(k => toV(k.target || [0, 0, 0]));
  const pc = n > 1 ? new THREE.CatmullRomCurve3(P, false, 'centripetal') : null;
  const tc = n > 1 ? new THREE.CatmullRomCurve3(T, false, 'centripetal') : null;
  return t => {
    if (n === 1) return { pos: P[0].clone(), target: T[0].clone(), fov: keys[0].fov ?? 35 };
    let tt = t;
    if (smoothPath) tt = keys[0].t + ease(seg(t, keys[0].t, keys[n - 1].t)) * (keys[n - 1].t - keys[0].t);
    let i = 0;
    while (i < n - 2 && tt >= keys[i + 1].t) i++;
    let q = seg(tt, keys[i].t, keys[i + 1].t);
    if (!smoothPath) q = ease(q);
    const u = (i + q) / (n - 1);
    const pos = smoothPath ? pc.getPoint(u) : P[i].clone().lerp(P[i + 1], q);
    const target = smoothPath ? tc.getPoint(u) : T[i].clone().lerp(T[i + 1], q);
    if (drift) pos.add(V(Math.sin(t * 0.37 + 1.3) + 0.5 * Math.sin(t * 0.83), Math.sin(t * 0.29 + 0.4) + 0.4 * Math.sin(t * 0.71 + 2), 0.6 * Math.sin(t * 0.23 + 2.2)).multiplyScalar(drift));
    return { pos, target, fov: lerp(keys[i].fov ?? 35, keys[i + 1].fov ?? 35, q) };
  };
}
export function pushIn(t, t0, t1, from, to) {
  const q = ease(seg(t, t0, t1));
  return { pos: toV(from.pos).lerp(toV(to.pos), q), target: toV(from.target || [0, 0, 0]).lerp(toV(to.target || [0, 0, 0]), q), fov: lerp(from.fov ?? 35, to.fov ?? 35, q) };
}
export function orbit(t, o = {}) {
  const a = (o.phase ?? 0) + t * (o.speed ?? 0.15), r = o.radius ?? 8, tg = toV(o.target || [0, 0, 0]);
  return { pos: V(tg.x + Math.sin(a) * r, tg.y + (o.height ?? 1), tg.z + Math.cos(a) * r), target: tg, fov: o.fov ?? 35 };
}

// ---------------------------------------------------------------------------------------------- textures
function dataTex(w, h, fill, srgb, repeat = true) {
  const data = new Uint8Array(w * h * 4);
  fill(data);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
// Normal map (and optional grey map) from a height function h(x, y) sampled on a wrapping w x h grid.
function heightTextures(w, h, H, strength, colourOf) {
  const hg = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hg[y * w + x] = H(x, y);
  const at = (x, y) => hg[((y + h) % h) * w + ((x + w) % w)];
  const normal = dataTex(w, h, d => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
      d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (-dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
  }, false);
  const map = colourOf ? dataTex(w, h, d => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = colourOf(x, y, at(x, y)), o = (y * w + x) * 4;
      d[o] = clamp(c[0]) * 255; d[o + 1] = clamp(c[1]) * 255; d[o + 2] = clamp(c[2]) * 255; d[o + 3] = 255;
    }
  }, true) : null;
  return { normal, map };
}

// Cross-striations: 8 sarcomeres across the tile (Z lines, dark A bands, pale H zones), myofibril ridges
// running lengthwise, each fibril slightly out of register like real muscle.
let _striation = null;
function striationTextures() {
  if (_striation) return _striation;
  const w = 1024, h = 256, per = 8, fib = 20;
  const info = (x, y) => {
    const u = x / w, v = y / h;
    const f = Math.floor(v * fib);
    const off = 0.05 * hash(f + 3) + 0.018 * tnoise(v * 12, 0.5, 12, 9);
    const ph = frac(u * per + off);
    const zl = gauss(Math.min(ph, 1 - ph), 0.022);
    const A = smooth(0.18, 0.26, ph) * (1 - smooth(0.74, 0.82, ph));
    const Hz = gauss(ph - 0.5, 0.05) * A;
    const ridge = Math.pow(0.5 + 0.5 * Math.cos(v * Math.PI * 2 * fib), 0.7);
    const n = tnoise(u * 64, v * 16, 64, 4) * 0.6 + tnoise(u * 160, v * 40, 160, 5) * 0.4;
    return { zl, A, Hz, ridge, n };
  };
  _striation = heightTextures(w, h, (x, y) => {
    const s = info(x, y);
    return 0.5 * s.A - 0.3 * s.Hz - 0.9 * s.zl + 0.55 * s.ridge + 0.12 * s.n;
  }, 2.2, (x, y) => {
    const s = info(x, y);
    const l = 1 - 0.2 * s.A + 0.12 * s.Hz - 0.32 * s.zl - 0.1 * (1 - s.ridge) + 0.05 * s.n;
    return [l, l * 0.97, l * 0.97];
  });
  return _striation;
}

// Fine organic grain for membranes, proteins and skin.
let _grain = null;
function grainNormal() {
  if (_grain) return _grain;
  const w = 256;
  _grain = heightTextures(w, w, (x, y) => tnoise(x / 8, y / 8, 32, 11) * 0.6 + tnoise(x / 3, y / 3, 85.333, 12) * 0.25, 1.5).normal;
  return _grain;
}

// ---------------------------------------------------------------------------------------------- materials
// Soft subsurface-style glow at grazing angles: the silhouettes of tissue read as light passing through flesh.
export function translucent(m, color = '#ff5a6a', strength = 0.35, power = 2.2) {
  const u = { uSssColor: { value: new THREE.Color(color) }, uSssStrength: { value: strength }, uSssPow: { value: power } };
  m.userData.sss = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSssColor; uniform float uSssStrength; uniform float uSssPow;')
      .replace('#include <opaque_fragment>', `{
        float nv = saturate(dot(normal, geometryViewDir));
        outgoingLight += uSssColor * pow(1.0 - nv, uSssPow) * uSssStrength;
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'sss';
  return m;
}

export function muscleMaterial(o = {}) {
  const { map, normal } = striationTextures();
  const rep = o.repeat || [3, 1];
  const mp = map.clone(), nm = normal.clone();
  mp.repeat.set(rep[0], rep[1]); nm.repeat.set(rep[0], rep[1]);
  mp.needsUpdate = nm.needsUpdate = true;
  const s = o.striations ?? 1;
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? '#a8323f', map: mp, normalMap: nm, normalScale: new THREE.Vector2(0.8 * s, 0.8 * s),
    roughness: 0.52, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.32,
    sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff8f9e'), specularIntensity: 0.5,
  });
  return translucent(m, o.sss ?? '#ff5363', 0.32);
}
export function membraneMaterial(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? '#ee7d90', roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.3,
    sheen: 0.6, sheenColor: new THREE.Color('#ffd6dc'), sheenRoughness: 0.4,
  });
  return translucent(m, '#ff9aaa', 0.3);
}
export function tailMaterial() {
  return translucent(new THREE.MeshPhysicalMaterial({ color: '#d9b48c', roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color('#ffe6c8'), clearcoat: 0.4 }), '#ffc890', 0.2);
}
export function proteinMaterial(color = '#c9a24a', o = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c, roughness: o.roughness ?? 0.36, clearcoat: 0.55, clearcoatRoughness: 0.25,
    sheen: 0.7, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.5), sheenRoughness: 0.4,
    normalMap: grainNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
  });
  return translucent(m, c.clone().lerp(new THREE.Color('#ffffff'), 0.35).getStyle(), o.sss ?? 0.35);
}
export function glowMaterial(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 });
}
export function boneMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: '#cdbd9f', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: new THREE.Color('#fff2dc'), normalMap: grainNormal(), normalScale: new THREE.Vector2(0.3, 0.3) });
  return translucent(m, '#e8b884', 0.18);
}
export function cartilageMaterial() {
  return translucent(new THREE.MeshPhysicalMaterial({ color: '#c7d9ea', roughness: 0.3, clearcoat: 0.6, sheen: 0.4, sheenColor: new THREE.Color('#e8f4ff') }), '#bfe0ff', 0.3);
}
export function skinMaterial(color = '#c48d6c') {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.52, clearcoat: 0.12, clearcoatRoughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#ffd2bd'), sheenRoughness: 0.5, normalMap: grainNormal(), normalScale: new THREE.Vector2(0.12, 0.12) });
  return translucent(m, '#ff8a6a', 0.22, 2.6);
}
// Fine jersey knit: rows of small interlocking loops, tiled `repeat` times over the mesh UVs.
let _knit = null;
function knitNormal() {
  if (_knit) return _knit;
  _knit = heightTextures(64, 64, (x, y) => {
    const u = x / 64, v = y / 64;
    const col = frac(u * 8), loop = Math.abs(Math.sin((v * 8 + (col < 0.5 ? 0 : 0.5)) * Math.PI));
    return 0.6 * Math.sin(col * Math.PI) * loop + 0.08 * tnoise(x / 4, y / 4, 16, 41);
  }, 1.4).normal;
  return _knit;
}
export function fabricMaterial(color = '#c9cdd8', repeat = [36, 24]) {
  const nm = knitNormal().clone();
  nm.repeat.set(repeat[0], repeat[1]);
  nm.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, sheen: 0.7, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.45, normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45) });
}
// X-ray glass: nearly clear where the surface faces the camera and denser at the silhouette.
// A per-vertex aFade attribute (optional) fades open edges such as a cut-off neck or waist.
export function glassMaterial(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? '#9ec3ff', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    transparent: true, depthWrite: false, side: o.side ?? THREE.FrontSide, specularIntensity: 1,
  });
  const u = { uMinA: { value: o.min ?? 0.035 }, uMaxA: { value: o.max ?? 0.5 }, uRim: { value: new THREE.Color(o.rim ?? '#4f8fff').multiplyScalar(o.rimStrength ?? 0.55) }, uGlass: { value: 1 } };
  m.userData.glass = u;
  const fade = !!o.fade;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    if (fade) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uMinA, uMaxA, uGlass; uniform vec3 uRim;${fade ? ' varying float vFade;' : ''}`)
      .replace('#include <opaque_fragment>', `
        float fr = pow(1.0 - abs(dot(normal, geometryViewDir)), 2.0);
        outgoingLight += uRim * fr;
        gl_FragColor = vec4(outgoingLight, mix(uMinA, uMaxA, fr) * uGlass${fade ? ' * vFade' : ''});`);
  };
  m.customProgramCacheKey = () => 'glass' + (fade ? 'f' : '');
  return m;
}

// ---------------------------------------------------------------------------------------------- geometry helpers
// Smooth blob: a subdivided icosahedron pushed around by `shape(p) -> radius` (p on the unit sphere).
function blobGeometry(detail, shape) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = V();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    uv[i * 2] = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5; uv[i * 2 + 1] = v.y * 0.5 + 0.5;
    const r = shape(v);
    if (r.isVector3) p.setXYZ(i, r.x, r.y, r.z); else p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// Rounded box made the classic way (clamp to an inner box, push out by the corner radius), with an optional
// displacement d(p, dir) and u along X so striations run across the long axis. r may be [rx, ry, rz] so the
// ends can be squarer than the sides.
function roundedBox(L, Hh, D, r, segs, disp) {
  let g = new THREE.BoxGeometry(L, Hh, D, segs[0], segs[1], segs[2]);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const rr = Array.isArray(r) ? V(...r) : V(r, r, r);
  const ax = L / 2 - rr.x, ay = Hh / 2 - rr.y, az = D / 2 - rr.z;
  const q = V(), d = V(), s = V(), o = V();
  for (let i = 0; i < p.count; i++) {
    s.fromBufferAttribute(p, i);
    q.set(clamp(s.x, -ax, ax), clamp(s.y, -ay, ay), clamp(s.z, -az, az));
    d.subVectors(s, q).divide(rr);
    if (d.lengthSq() < 1e-10) d.set(0, 1, 0); else d.normalize();
    const extra = disp ? disp(s, d) : 0;
    o.copy(d).multiply(rr).add(q).addScaledVector(d, extra);
    p.setXYZ(i, o.x, o.y, o.z);
    uv[i * 2] = s.x / L + 0.5; uv[i * 2 + 1] = Math.atan2(s.z / D, s.y / Hh) / (Math.PI * 2) + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// Tube along a curve with a radius profile prof(s, a) (s 0..1 along the curve, a around it).
// The frame is fixed for curves in the XY plane: a = 0 points along T x Z, a = PI/2 along +Z.
// o.frame(P, T) -> unit vector perpendicular to T overrides the a = 0 direction.
function sweepGeometry(points, prof, o = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(toV), false, 'centripetal', 0.5);
  const nS = o.segs ?? 160, nR = o.radial ?? 48;
  const pos = [], idx = [], uv = [];
  const Z = V(0, 0, 1);
  for (let i = 0; i <= nS; i++) {
    const s = i / nS, P = curve.getPointAt(s), T = curve.getTangentAt(s);
    const N = o.frame ? o.frame(P, T) : V().crossVectors(T, Z).normalize(), B = V().crossVectors(N, T).normalize();
    for (let j = 0; j < nR; j++) {
      const a = (j / nR) * Math.PI * 2;
      const r = prof(s, a);
      const rx = Array.isArray(r) ? r[0] : r, rz = Array.isArray(r) ? r[1] : r;
      const q = P.clone().addScaledVector(N, Math.cos(a) * rx).addScaledVector(B, Math.sin(a) * rz);
      pos.push(q.x, q.y, q.z); uv.push(j / nR, s);
    }
  }
  for (let i = 0; i < nS; i++) for (let j = 0; j < nR; j++) {
    const a = i * nR + j, b = i * nR + ((j + 1) % nR), c = (i + 1) * nR + j, d = (i + 1) * nR + ((j + 1) % nR);
    idx.push(a, c, b, b, c, d);
  }
  // Close both ends with a centre vertex.
  for (const [ring, sgn] of [[0, -1], [nS, 1]]) {
    const ci = pos.length / 3, P = curve.getPointAt(ring / nS);
    pos.push(P.x, P.y, P.z); uv.push(0.5, ring / nS);
    for (let j = 0; j < nR; j++) {
      const a = ring * nR + j, b = ring * nR + ((j + 1) % nR);
      if (sgn < 0) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.curve = curve;
  return g;
}
// Radius from sorted [s, r] stops with smooth interpolation.
function stops(list) {
  return s => {
    if (s <= list[0][0]) return list[0][1];
    for (let i = 0; i < list.length - 1; i++) {
      const [s0, r0] = list[i], [s1, r1] = list[i + 1];
      if (s <= s1) { const q = (s - s0) / (s1 - s0); return lerp(r0, r1, q * q * (3 - 2 * q)); }
    }
    return list[list.length - 1][1];
  };
}

export function cable(points, radius = 0.03, color = '#2b2f3a') {
  const curve = new THREE.CatmullRomCurve3(points.map(toV));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, radius, 10, false), new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.6 }));
  return m;
}

// ---------------------------------------------------------------------------------------------- cells
const STATE_FIRE = { ready: 0, half: 0, locked: 0, firing: 1 };
function cellGeometry(L, Hh, D, seed) {
  const r = Math.min(Hh, D) * 0.4;
  return roundedBox(L, Hh, D, [Math.min(0.1, L * 0.05), r, r], [Math.max(40, Math.round(L * 22)), 16, 14], (s, d) => {
    // Organic swelling along the fibre, a nucleus bulge mid-cell, and full-width ends that meet the disc flush.
    const endW = smooth(L * 0.5 - 0.3, L * 0.5, Math.abs(s.x));
    const n = fbm3(s.x * 1.1, s.y * 1.8, s.z * 1.8, seed, 3) * 0.075 + Math.sin(s.x * 2.3 + seed) * 0.02;
    const nuc = 0.06 * gauss(s.x - (hash(seed) - 0.5) * 0.4, 0.5) * Math.max(0, d.y) * Math.max(0, 1 - Math.abs(d.z) * 1.5);
    return (n + nuc) * (1 - endW) - 0.012 * endW * (1 - Math.abs(d.x));
  });
}
export function createCellSheet(o = {}) {
  const unit = o.unit ?? 1 / 40;
  const l2 = o.layout2D;
  const cols = o.cols ?? 5, rows = o.rows ?? 4;
  const length = l2 ? l2.w * unit : (o.length ?? 3.2);
  const height = l2 ? l2.h * unit : (o.height ?? 0.95);
  const depth = o.depth ?? height * 0.8;
  const gap = l2 ? (l2.gap ?? 30) * unit : (o.gap ?? 0.07);
  const vgap = l2 ? (l2.vgap ?? 30) * unit : (o.vgap ?? 0.2);
  const stagger = o.stagger ?? true;
  const seed = o.seed ?? 1;
  const R = rng(seed);
  const geos = [0, 1, 2].map(k => cellGeometry(length, height, depth, seed * 10 + k));
  // Tight joints get an intercalated disc: a dark, slightly wavy plate filling the joint. Wide joints (a twin of
  // a 2D layout) get a narrower bridge like the 2D tunnel, so the flattened sheet matches the diagram.
  const md = Math.min(height, depth);
  const discGeo = gap < 0.2
    ? roundedBox(Math.max(0.05, gap * 1.6), height * 0.97, depth * 0.97, [Math.max(0.02, gap * 0.5), md * 0.38, md * 0.38], [6, 12, 12], (s, d) => 0.012 * Math.sin(s.y * 30) * Math.abs(d.x))
    : roundedBox(gap + 0.2, height * 0.3, depth * 0.3, [0.05, height * 0.14, depth * 0.14], [8, 6, 6], null);
  const base = muscleMaterial({ color: o.color, repeat: [Math.max(1, Math.round(length / 1.1)), 1] });
  const discBase = translucent(new THREE.MeshPhysicalMaterial({ color: '#5a1426', roughness: 0.4, clearcoat: 0.5, sheen: 0.5, sheenColor: new THREE.Color('#ff8fa0') }), '#ff6a8a', 0.25);
  const group = new THREE.Group();
  const pitch = length + gap, rowStep = height + vgap;
  const x0 = -((cols - 1) * pitch + (stagger ? pitch / 2 : 0)) / 2, y0 = ((rows - 1) * rowStep) / 2;
  const cells = [], discs = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const mat = base.clone();
    translucent(mat, '#ff5363', 0.32);
    mat.color.offsetHSL(0.012 * (R() - 0.5), 0.08 * (R() - 0.5), 0.05 * (R() - 0.5));
    mat.userData.base = mat.color.clone();
    const mesh = new THREE.Mesh(geos[(r * 2 + c) % 3], mat);
    const x = x0 + c * pitch + (stagger && r % 2 ? pitch / 2 : 0), y = y0 - r * rowStep;
    mesh.position.set(x, y, (R() - 0.5) * 0.06);
    mesh.rotation.set((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.02);
    group.add(mesh);
    cells.push({ mesh, row: r, col: c, x, y, base: mesh.position.clone() });
    if (c < cols - 1) {
      const dm = discBase.clone();
      translucent(dm, '#ff6a8a', 0.3);
      const disc = new THREE.Mesh(discGeo, dm);
      disc.position.set(x + pitch / 2, y, 0);
      group.add(disc);
      discs.push({ mesh: disc, a: cells.length - 1, b: cells.length });
    }
  }
  const tmp = new THREE.Color(), spark = new THREE.Color(STATE_COLOURS.firing), paleSpark = new THREE.Color('#fff6d8');
  function setCell(i, s = {}) {
    const cell = cells[i]; if (!cell) return;
    const m = cell.mesh.material;
    const tint = s.tint ?? (s.state ? 0.8 : 0);
    const fire = s.fire ?? (s.state ? STATE_FIRE[s.state] : 0);
    const st = new THREE.Color(STATE_COLOURS[s.state || 'ready']);
    // The muscle is red already, so a state tint has to replace it almost fully (and glow a little) for
    // locked red to read as different from plain muscle and for unlocked to stay a true teal-blue.
    m.color.copy(m.userData.base).lerp(tmp.copy(st).multiplyScalar(0.8), tint * 0.95);
    // Firing: the cell turns pale gold and glows yellow-white from inside, keeping its striations visible.
    m.color.lerp(paleSpark, fire * 0.6);
    // Firing emission goes past the bloom threshold, so a firing cell flashes rather than just turning pale.
    m.emissive.copy(st).multiplyScalar(0.32 * tint * (1 - fire)).add(tmp.copy(spark).multiplyScalar(1.25 * fire));
    m.userData.sss.uSssColor.value.set('#ff5363').lerp(st, tint).lerp(spark, fire);
    m.userData.sss.uSssStrength.value = 0.32 + 0.6 * fire;
    const sq = s.squash || [1, 1, 1];
    cell.mesh.scale.set(sq[0], sq[1], sq[2]);
  }
  function setDisc(i, glow = 0) {
    const d = discs[i]; if (!d) return;
    d.mesh.material.emissive.copy(spark).multiplyScalar(2.2 * glow);
  }
  function reset() { cells.forEach((_, i) => setCell(i, {})); discs.forEach((_, i) => setDisc(i, 0)); }
  return {
    group, cells, discs, setCell, setDisc, reset, pxPerUnit: 1 / unit,
    size: { w: (cols - 1) * pitch + (stagger ? pitch / 2 : 0) + length, h: (rows - 1) * rowStep + height },
    index: (r, c) => r * cols + c,
  };
}
export function createCell(o = {}) {
  const s = createCellSheet({ ...o, cols: 1, rows: 1 });
  return { group: s.group, mesh: s.cells[0].mesh, set: st => s.setCell(0, st) };
}

// ---------------------------------------------------------------------------------------------- ions
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 1 }, uIntensity: { value: 1 } },
    vertexShader: `
      uniform float uSize; varying vec2 vUv; varying vec3 vCol;
      void main() {
        vUv = uv;
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        c.xy += position.xy * s * uSize;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: `
      uniform float uIntensity; varying vec2 vUv; varying vec3 vCol;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.75, 1.0, d));
        gl_FragColor = vec4(vCol * a * uIntensity, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
export function createIons(kind, count, o = {}) {
  const col = new THREE.Color(ION_COLOURS[kind] || kind);
  const radius = o.radius ?? 0.13;
  const group = new THREE.Group();
  const sphereMat = new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: o.intensity ?? 1.15, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const spheres = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(radius, 3), sphereMat, count);
  const hm = haloMaterial();
  hm.uniforms.uSize.value = radius * 2 * (o.haloSize ?? 4.2);
  hm.uniforms.uIntensity.value = 0.9 * (o.halo ?? 1);
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), hm, count);
  halos.userData.noDepth = true;
  for (let i = 0; i < count; i++) halos.setColorAt(i, col);
  spheres.frustumCulled = halos.frustumCulled = false;
  group.add(spheres, halos);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), p = V();
  function set(i, v, s = 1) {
    if (i >= count) return;
    if (Array.isArray(v)) p.set(v[0], v[1], v[2]); else p.copy(v);
    sc.setScalar(Math.max(1e-4, s));
    m.compose(p, q, sc);
    spheres.setMatrixAt(i, m); halos.setMatrixAt(i, m);
  }
  function hideFrom(i) { for (let k = i; k < count; k++) set(k, [0, -1e4, 0], 1e-4); }
  hideFrom(0);
  function commit() { spheres.instanceMatrix.needsUpdate = true; halos.instanceMatrix.needsUpdate = true; }
  commit();
  return { group, count, set, hideFrom, commit, spheres, halos, material: sphereMat };
}
export function jitter(seed, t, amp = 0.05) {
  const a = hash(seed) * 6.28, b = hash(seed + 1) * 6.28, c = hash(seed + 2) * 6.28;
  return V(Math.sin(t * 1.3 + a) + 0.5 * Math.sin(t * 2.9 + b), Math.sin(t * 1.1 + b) + 0.5 * Math.sin(t * 3.1 + c), Math.sin(t * 1.7 + c) + 0.5 * Math.sin(t * 2.3 + a)).multiplyScalar(amp / 1.5);
}
export function ionCloud(seed, n, box, t = 0, amp = 0.15) {
  const R = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const v = V(lerp(box.min[0], box.max[0], R()), lerp(box.min[1], box.max[1], R()), lerp(box.min[2], box.max[2], R()));
    out.push(v.add(jitter(seed * 1000 + i, t, amp)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- doors
const DOOR_COLOURS = { na: '#c9973c', k: '#8a62c4', ca: '#3f9c79', leak: '#b07f86', stretch: '#8d97ab' };
const _subunitGeo = {};
function subunitGeometry(seed) {
  if (_subunitGeo[seed]) return _subunitGeo[seed];
  // Helix-bundle protein: bulging outer and inner domains, a narrower waist through the membrane,
  // ridges hinting at the alpha helices and lumpy molecular-surface noise.
  _subunitGeo[seed] = blobGeometry(5, p => {
    const y = p.y;
    const prof = 0.33 + 0.11 * gauss(y - 0.62, 0.32) + 0.13 * gauss(y + 0.66, 0.3) - 0.04 * gauss(y, 0.3);
    const ang = Math.atan2(p.z, p.x);
    // Four twisted lobes like a bundle of helices, plus a finer ripple.
    const ridge = 0.05 * Math.sin(ang * 4 + y * 2.6 + seed) + 0.015 * Math.sin(ang * 9 - y * 6);
    const n = fbm3(p.x * 2.2, p.y * 2.2, p.z * 2.2, seed, 4) * 0.13 + fbm3(p.x * 6, p.y * 6, p.z * 6, seed + 5, 2) * 0.035;
    const h = Math.hypot(p.x, p.z);
    const k = h > 1e-5 ? (prof + ridge + n) * Math.pow(h, 0.55) / h : 0;
    return V(p.x * k, y * 1.5 + n * 0.3, p.z * k);
  });
  return _subunitGeo[seed];
}
let _springGeo = null;
function springGeometry() {
  if (_springGeo) return _springGeo;
  const turns = 7, pts = [];
  for (let i = 0; i <= 280; i++) {
    const s = i / 280, a = s * turns * Math.PI * 2;
    const lead = smooth(0, 0.06, s) * (1 - smooth(0.94, 1, s));
    pts.push(V(s, Math.cos(a) * 0.13 * lead, Math.sin(a) * 0.13 * lead));
  }
  _springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.034, 10, false);
  return _springGeo;
}
export function createDoor(o = {}) {
  const kind = o.kind || 'na';
  const color = o.color || DOOR_COLOURS[kind];
  const group = new THREE.Group();
  const mat = proteinMaterial(color);
  const cut = o.cutaway ?? true;
  // Subunits sit left, back and right of the pore (and front when not cut away), as seen from +Z.
  // Angle a puts a subunit at (cos a, 0, -sin a) * r, so PI / 2 is the back and -PI / 2 the front.
  const angles = cut ? [Math.PI, Math.PI / 2, 0] : [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
  const subs = angles.map((a, k) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(subunitGeometry(k + (kind.length * 3)), mat);
    m.rotation.y = k * 1.7;
    m.scale.setScalar(1 + 0.04 * Math.sin(k * 2.3));
    pivot.add(m);
    group.add(pivot);
    // With the front cut away the back subunit is the far wall of the pore: it stays put, set back a little,
    // so the gap between the two side halves reads as an open tunnel.
    return { pivot, a, wall: cut && Math.abs(a - Math.PI / 2) < 1e-6 };
  });
  // Soft light inside the pore in the colour of the ion it passes, so an open door reads at a glance.
  const ionCol = new THREE.Color(ION_COLOURS[kind] || '#ffd6dc');
  const poreMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: ionCol }, uAlpha: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float ends = 1.0 - smoothstep(0.9, 1.4, abs(vY));
        float a = core * ends * uAlpha; gl_FragColor = vec4(uColor * a * 1.6, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pore = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.8, 24, 1, true), poreMat);
  pore.userData.noDepth = true;
  group.add(pore);

  let lid = null;
  if (o.lid) {
    // Ball-and-chain inactivation lid hinged under the left subunit; 1 = ball plugging the inner mouth.
    lid = new THREE.Group();
    const lidMat = proteinMaterial('#f2a0b4', { sss: 0.45 });
    // Chain along +X from the hinge to the ball, built for unit length and stretched to the current reach.
    const chainPts = [V(0, 0, 0), V(0.3, -0.18, 0.03), V(0.65, -0.16, -0.03), V(0.82, -0.05, 0)];
    const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts), 40, 0.045, 10), lidMat);
    const ball = new THREE.Mesh(blobGeometry(3, p => 0.22 + fbm3(p.x * 3, p.y * 3, p.z * 3, 77) * 0.05), lidMat);
    ball.scale.set(1.2, 0.85, 1.2);
    lid.add(chain, ball);
    lid.userData = { chain, ball };
    group.add(lid);
  }
  let springs = null;
  if (kind === 'stretch') {
    // A shiny metal coil: the spring is a metaphor, so it is drawn to read as a spring at a glance.
    const sm = new THREE.MeshPhysicalMaterial({ color: '#d8dee8', metalness: 0.9, roughness: 0.22, clearcoat: 0.5 });
    springs = [-1, 1].map(side => {
      const holder = new THREE.Group();
      holder.position.set(side * 0.6, 0.95, 0);
      holder.rotation.y = side < 0 ? Math.PI : 0;
      const spring = new THREE.Mesh(springGeometry(), sm);
      const anchor = new THREE.Mesh(blobGeometry(3, p => 0.17 + fbm3(p.x * 3, p.y * 3, p.z * 3, 31) * 0.04), proteinMaterial(color));
      anchor.scale.set(1, 1.6, 1);
      anchor.position.y = -0.45;
      holder.add(spring, anchor);
      group.add(holder);
      return { holder, spring, anchor };
    });
  }
  const state = { open: 0, lid: 0, stretch: 0 };
  function set(s = {}) {
    Object.assign(state, s);
    const op = clamp(state.open);
    for (const { pivot, a, wall } of subs) {
      const r = wall ? 0.6 : 0.42 + 0.3 * op;
      pivot.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
      // Tilt so the subunits open like petals at the inner end, the way real channel gates swing.
      pivot.rotation.set(0, 0, 0);
      if (!wall) pivot.rotateOnWorldAxis(V(-Math.sin(a), 0, -Math.cos(a)), -0.14 * op);
    }
    poreMat.uniforms.uAlpha.value = 0.55 * op * (1 - clamp(state.lid) * 0.8);
    if (lid) {
      // Hinged at the inner foot of the left half; reach is set so that at lid = 1 the ball sits under the pore.
      const l = clamp(state.lid), hx = -0.62 - 0.3 * op;
      lid.position.set(hx, -1.36, 0.05);
      lid.userData.ball.position.set(-hx, -0.02, 0);
      lid.userData.chain.scale.set(-hx, 1, 1);
      lid.rotation.z = lerp(-1.75, 0, easeOut(l));
    }
    if (springs) for (const sp of springs) {
      const len = 0.55 + 0.75 * clamp(state.stretch);
      sp.spring.scale.set(len, 1, 1);
      sp.anchor.position.x = len + 0.05;
    }
  }
  set({});
  const radius = 1.05;
  const R = V(), cache = {};
  // Ion path: from a spot in the bulk on one side, funnelling into the mouth, down the pore and out into the far side.
  function path(p, seed = 1, dir = 'in') {
    const key = seed + dir;
    if (!cache[key]) {
      const rr = rng(seed * 31 + 7);
      const a0 = rr() * Math.PI * 2, a1 = rr() * Math.PI * 2, d0 = 0.9 + rr() * 1.4, d1 = 0.9 + rr() * 1.4;
      const sgn = dir === 'in' ? 1 : -1;
      const pts = [V(Math.cos(a0) * d0, sgn * (2.3 + rr() * 0.9), Math.sin(a0) * d0), V(Math.cos(a0) * 0.3, sgn * 1.7, Math.sin(a0) * 0.3),
        V(0, sgn * 0.75, 0), V(0, 0, 0), V(0, -sgn * 0.75, 0), V(Math.cos(a1) * 0.35, -sgn * 1.75, Math.sin(a1) * 0.35),
        V(Math.cos(a1) * d1, -sgn * (2.3 + rr() * 0.9), Math.sin(a1) * d1)];
      cache[key] = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    }
    R.copy(cache[key].getPoint(clamp(p)));
    group.updateMatrixWorld();
    return R.clone().applyMatrix4(group.matrixWorld);
  }
  return { group, kind, radius, set, path, state };
}

// ---------------------------------------------------------------------------------------------- membrane
export function createMembrane(o = {}) {
  const width = o.width ?? 14, depth = o.depth ?? 9, sp = o.spacing ?? 0.3, headR = o.headR ?? 0.135;
  const thick = o.thickness ?? 1.12, seed = o.seed ?? 3;
  const R = rng(seed);
  const lip = [];
  const nz = Math.floor(depth / (sp * 0.866)), nx = Math.floor(width / sp);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    lip.push({
      x: -width / 2 + i * sp + (j % 2) * sp / 2 + (R() - 0.5) * 0.05, z: -depth / 2 + j * sp * 0.866 + (R() - 0.5) * 0.05,
      ph: R() * 6.28, ph2: R() * 6.28, sa: R() * 6.28, hs: 0.92 + R() * 0.16,
    });
  }
  const N = lip.length;
  const headGeo = new THREE.IcosahedronGeometry(headR, 2);
  const tailGeo = k => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = -0.2 + i * 0.05, kink = k ? 0.05 * smooth(0.45, 0.6, i / 8) : 0;
      pts.push(V(0.012 * Math.sin(i * 2.1) + kink, y, 0.012 * Math.cos(i * 1.7)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.021, 6);
  };
  const heads = new THREE.InstancedMesh(headGeo, membraneMaterial(), N * 2);
  const tm = tailMaterial();
  const tails = [new THREE.InstancedMesh(tailGeo(0), tm, N * 2), new THREE.InstancedMesh(tailGeo(1), tm, N * 2)];
  heads.frustumCulled = tails[0].frustumCulled = tails[1].frustumCulled = false;
  // Slight per-head colour variation keeps the sheet from looking like a texture.
  const hc = new THREE.Color();
  for (let k = 0; k < N * 2; k++) { hc.setHSL(0.0 + 0.02 * hash(k * 1.7), 0.15 * hash(k * 2.3), 0.82 + 0.18 * hash(k * 3.1)); heads.setColorAt(k, hc); }
  const group = new THREE.Group();
  group.add(heads, ...tails);
  const doors = (o.doors || []).map(d => {
    const door = createDoor(d);
    door.x = d.x ?? 0; door.z = d.z ?? 0;
    group.add(door.group);
    return door;
  });
  const surface = (x, z, t) => 0.13 * Math.sin(0.5 * x + 0.62 * t) * Math.cos(0.42 * z - 0.45 * t) + 0.06 * Math.sin(0.85 * x - 0.4 * z + 1.05 * t);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), s1 = V(1, 1, 1), up = V(0, 1, 0);
  const P = V(), n = V(), hp = V(), tp = V(), dirv = V(), side = V(), sc = V();
  function update(t, st = {}) {
    const stretch = st.stretch ?? 0, wave = st.wave ?? 1;
    const sx = 1 + 0.28 * stretch;
    const surf = (x, z) => surface(x, z, t) * wave;
    const dpos = doors.map(d => ({ x: d.x * sx, z: d.z }));
    for (let k = 0; k < N; k++) {
      const L = lip[k];
      const x = L.x * sx, z = L.z;
      let hide = 0;
      for (const d of dpos) { const dd = Math.hypot(x - d.x, z - d.z); hide = Math.max(hide, 1 - smooth(0.78, 1.05, dd)); }
      const y = surf(x, z);
      const e = 0.05;
      n.set(-(surf(x + e, z) - surf(x - e, z)) / (2 * e), 1, -(surf(x, z + e) - surf(x, z - e)) / (2 * e)).normalize();
      P.set(x, y, z);
      const vis = 1 - hide;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const bob = 0.035 * Math.sin(t * 1.6 + L.ph + sgn) ;
        hp.copy(P).addScaledVector(n, sgn * (thick / 2 + bob));
        sc.setScalar(Math.max(1e-4, vis * L.hs));
        m.compose(hp, q.identity(), sc);
        const hi = k * 2 + (sgn > 0 ? 1 : 0);
        heads.setMatrixAt(hi, m);
        // Two tails per head, splayed a little and wiggling, pointing into the middle of the bilayer.
        for (let tk = 0; tk < 2; tk++) {
          const a = L.sa + tk * Math.PI + 0.3 * Math.sin(t * 0.9 + L.ph2);
          side.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.05);
          dirv.copy(n).multiplyScalar(-sgn).addScaledVector(side, 0.9 + 0.6 * Math.sin(t * 1.3 + L.ph + tk)).normalize();
          tp.copy(hp).addScaledVector(side, 1).addScaledVector(dirv, headR * 0.55 + 0.21);
          qt.setFromUnitVectors(up, dirv);
          sc.set(vis, vis, vis).max(V(1e-4, 1e-4, 1e-4));
          m.compose(tp, qt, sc);
          tails[tk].setMatrixAt(k * 2 + (sgn > 0 ? 1 : 0), m);
        }
      }
    }
    heads.instanceMatrix.needsUpdate = true;
    tails[0].instanceMatrix.needsUpdate = tails[1].instanceMatrix.needsUpdate = true;
    doors.forEach((d, i) => {
      const x = dpos[i].x, z = dpos[i].z;
      d.group.position.set(x, surf(x, z), z);
      const e = 0.05;
      n.set(-(surf(x + e, z) - surf(x - e, z)) / (2 * e), 1, -(surf(x, z + e) - surf(x, z - e)) / (2 * e)).normalize();
      d.group.quaternion.setFromUnitVectors(up, n);
    });
  }
  update(0);
  return { group, doors, update, surface, thickness: thick, heads, tails };
}

// ---------------------------------------------------------------------------------------------- negative molecules
export function createNegativeMolecule(o = {}) {
  const seed = o.seed ?? 1, radius = o.radius ?? 0.6;
  const group = new THREE.Group();
  const geo = blobGeometry(4, p => radius * (1 + fbm3(p.x * 1.6, p.y * 1.6, p.z * 1.6, seed, 3) * 0.55 + 0.08 * Math.sin(p.x * 5 + seed) * Math.cos(p.y * 4)));
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#2b2240', roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.22, sheen: 0.5, sheenColor: new THREE.Color('#6f62b0'),
    normalMap: grainNormal(), normalScale: new THREE.Vector2(0.45, 0.45),
  });
  translucent(mat, '#5a4aa8', 0.22);
  const body = new THREE.Mesh(geo, mat);
  group.add(body);
  const holder = new THREE.Group();
  const glyph = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.11, radius * 0.62, 4, 12), glowMaterial('#e3ecff', 1.6));
  glyph.rotation.z = Math.PI / 2;
  holder.add(glyph);
  group.add(holder);
  const wp = V(), wq = new THREE.Quaternion(), dir = V();
  function update(camera) {
    group.updateMatrixWorld();
    group.getWorldPosition(wp);
    dir.copy(camera.position).sub(wp).normalize();
    group.getWorldQuaternion(wq);
    // Glyph sits just outside the surface towards the viewer and stays level on screen.
    holder.quaternion.copy(wq.clone().invert().multiply(camera.quaternion));
    const local = dir.clone().applyQuaternion(wq.clone().invert());
    holder.position.copy(local.multiplyScalar(radius * 1.32 / group.scale.x));
  }
  return { group, update };
}

// ---------------------------------------------------------------------------------------------- actin / myosin
export function createSarcomere(o = {}) {
  const nHeads = o.heads ?? 3, beads = o.beads ?? 48, seed = o.seed ?? 5;
  const group = new THREE.Group();
  const actin = new THREE.Group();
  group.add(actin);
  const bd = 0.36, pitch = 13 * bd, ar = 0.2;
  const beadGeo = blobGeometry(3, p => 0.2 + fbm3(p.x * 3, p.y * 3, p.z * 3, 2) * 0.035);
  const beadMat = proteinMaterial('#e0816f');
  const beadMesh = new THREE.InstancedMesh(beadGeo, beadMat, beads * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const x0 = -beads * bd / 2;
  const beadPos = [];
  for (let s = 0; s < 2; s++) for (let i = 0; i < beads; i++) {
    const x = x0 + i * bd + s * bd / 2, a = (x / pitch) * Math.PI * 2 + s * Math.PI;
    const p = V(x, Math.cos(a) * ar, Math.sin(a) * ar);
    beadPos.push(p);
    q.setFromEuler(new THREE.Euler(a, hash(i + s * 99) * 3, 0));
    m4.compose(p, q, V(1.12, 0.92, 0.95));
    beadMesh.setMatrixAt(s * beads + i, m4);
    c.set('#ffffff').multiplyScalar(0.86 + 0.14 * hash(i * 7 + s));
    beadMesh.setColorAt(s * beads + i, c);
  }
  actin.add(beadMesh);
  // Tropomyosin rope in each groove, and troponin "lock" knobs every half pitch.
  for (let s = 0; s < 2; s++) {
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const x = x0 + (i / 200) * beads * bd, a = (x / pitch) * Math.PI * 2 + s * Math.PI + Math.PI / 2;
      pts.push(V(x, Math.cos(a) * (ar + 0.12), Math.sin(a) * (ar + 0.12)));
    }
    actin.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, 0.05, 8), proteinMaterial('#b05a74')));
  }
  const lockMat = proteinMaterial('#7a2c4a', { sss: 0.5 });
  const lockGeo = blobGeometry(3, p => 0.14 + fbm3(p.x * 3, p.y * 3, p.z * 3, 9) * 0.03);
  const locks = [];
  for (let x = x0 + pitch * 0.25; x < x0 + beads * bd; x += pitch / 2) {
    const k = locks.length, s = k % 2, a = (x / pitch) * Math.PI * 2 + s * Math.PI + Math.PI / 2;
    const mesh = new THREE.Mesh(lockGeo, lockMat.clone());
    const home = V(x, Math.cos(a) * (ar + 0.2), Math.sin(a) * (ar + 0.2));
    mesh.position.copy(home);
    actin.add(mesh);
    locks.push({ mesh, home, dir: V(0, Math.cos(a), Math.sin(a)), spin: hash(k * 5.3) });
  }

  // Thick filament: a bundle of twisted myosin tails below the strand.
  const thickY = -1.55, filLen = 10;
  const tailMat = proteinMaterial('#d4a24c');
  for (let k = 0; k < 5; k++) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const x = -filLen / 2 + (i / 60) * filLen, a = x * 0.9 + k * 1.2566;
      pts.push(V(x, thickY + Math.cos(a) * 0.13, Math.sin(a) * 0.13));
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.09, 10), tailMat));
  }
  const headMat = proteinMaterial('#e6b04f');
  const motorGeo = blobGeometry(4, p => {
    // Pear-shaped motor domain with a cleft, narrowing towards the lever like a golf club head.
    const r = 0.27 + 0.08 * p.y + fbm3(p.x * 2.5, p.y * 2.5, p.z * 2.5, 21) * 0.05 - 0.04 * gauss(p.z, 0.2) * Math.max(0, p.y);
    return V(p.x * r * 1.25 + 0.06 * p.y * p.y, p.y * r * 1.9, p.z * r * 0.9);
  });
  const leverGeo = new THREE.CapsuleGeometry(0.11, 1, 4, 12);
  const spacing = 2.6;
  const heads = [];
  for (let h = 0; h < nHeads; h++) {
    const hinge = V((h - (nHeads - 1) / 2) * spacing, thickY + 0.12, 0);
    const lever = new THREE.Mesh(leverGeo, headMat);
    const motors = [0, 1].map(k => {
      const mm = new THREE.Mesh(motorGeo, headMat);
      if (k) mm.scale.setScalar(0.9);
      group.add(mm);
      return mm;
    });
    group.add(lever);
    heads.push({ hinge, lever, motors, phase: h / nHeads + 0.08 * hash(h + seed) });
  }
  const contactY = -ar - 0.42, L0 = contactY - thickY - 0.12, maxA = 0.62;
  const powerFrac = 0.43, stroke = 2 * L0 * Math.tan(maxA);
  const tmp = V(), yAxis = V(0, 1, 0);
  function placeHead(h, ang, lift) {
    const tip = V(h.hinge.x + L0 * Math.tan(ang), h.hinge.y + L0 - lift, 0);
    const d = tmp.subVectors(tip, h.hinge);
    const len = d.length();
    h.lever.position.copy(h.hinge).addScaledVector(d, 0.5);
    h.lever.quaternion.setFromUnitVectors(yAxis, d.clone().normalize());
    h.lever.scale.set(1, len / 1.19, 1);
    const tilt = Math.atan2(d.x, d.y);
    // Motor domains sit at the lever tip, bent off the lever line like a golf club head; the dimer
    // partner hangs a little behind and to one side so both heads read in silhouette.
    h.motors.forEach((mm, k) => {
      const bend = -tilt - (k ? 0.75 : 0.45);
      mm.position.set(tip.x + Math.sin(-bend) * 0.12 + (k ? -0.16 : 0), tip.y + 0.02 + (k ? -0.12 : 0), k ? -0.3 : 0.12);
      mm.rotation.set(k ? 0.3 : -0.15, 0, bend);
    });
  }
  function update(cycles, st = {}) {
    const engage = clamp(st.engage ?? 1), lk = clamp(st.locks ?? 0);
    for (const h of heads) {
      const ph = frac(cycles + h.phase);
      let ang, lift;
      if (ph < 0.12) { ang = maxA; lift = 0.45 * (1 - ease(ph / 0.12)); }
      else if (ph < 0.12 + powerFrac) { const q2 = (ph - 0.12) / powerFrac; ang = Math.atan(lerp(Math.tan(maxA), -Math.tan(maxA), q2)); lift = 0; }
      else if (ph < 0.65) { ang = -maxA; lift = 0.45 * ease((ph - 0.12 - powerFrac) / (0.65 - 0.12 - powerFrac)); }
      else { ang = lerp(-maxA, maxA, ease((ph - 0.65) / 0.35)); lift = 0.45; }
      ang = lerp(maxA, ang, engage); lift = lerp(0.45, lift, engage);
      placeHead(h, -ang, lift);
    }
    // The strand moves only while a head is pulling, so its offset follows the completed strokes.
    actin.position.x = st.slide ?? cycles * stroke / powerFrac;
    // Lock knobs pop off one after another as locks goes from 1 to 0.
    locks.forEach((l, k) => {
      const seat = clamp(lk * 1.4 - (k % 4) * 0.1), off = ease(1 - seat);
      l.mesh.position.copy(l.home).addScaledVector(l.dir, off * 1.1).add(V(0, off * 0.4, 0));
      l.mesh.rotation.set(l.spin * 6 * off, l.spin * 3 * off, 0);
      l.mesh.visible = seat > 0.02;
      l.mesh.scale.setScalar(0.4 + 0.6 * smooth(0, 0.4, seat));
    });
  }
  update(0);
  return { group, actin, heads, update, stroke };
}

// ---------------------------------------------------------------------------------------------- AED
function canvasTex(w, h, paint) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function heartBolt(g, cx, cy, s, heartCol, boltCol) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.fillStyle = heartCol;
  g.beginPath(); g.moveTo(0, 0.35); g.bezierCurveTo(-0.55, -0.05, -0.5, -0.55, 0, -0.28); g.bezierCurveTo(0.5, -0.55, 0.55, -0.05, 0, 0.35); g.fill();
  g.fillStyle = boltCol;
  g.beginPath(); g.moveTo(0.06, -0.42); g.lineTo(-0.14, 0.02); g.lineTo(0.0, 0.02); g.lineTo(-0.06, 0.4); g.lineTo(0.16, -0.06); g.lineTo(0.02, -0.06); g.closePath(); g.fill();
  g.restore();
}
export function createAED(o = {}) {
  const group = new THREE.Group();
  const W = 1.55, Hh = 1.75, D = 0.5;
  const green = new THREE.MeshPhysicalMaterial({ color: '#178a4a', roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.2 });
  const body = new THREE.Mesh(roundedBox(W, Hh, D, 0.16, [16, 16, 8]), green);
  group.add(body);
  // Front panel: dark rubberised face with printed step numbers and a pad diagram.
  const faceTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#26292f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#30343b'; g.fillRect(40, 40, w - 80, h - 80);
    const FONT3 = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
    g.font = `800 120px ${FONT3}`; g.fillStyle = '#f2f4f7'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AED', w / 2, 150);
    heartBolt(g, w / 2 + 240, 150, 150, '#e8424f', '#ffffff');
    heartBolt(g, w / 2 - 240, 150, 150, '#e8424f', '#ffffff');
    [['1', 300], ['2', 560], ['3', 820]].forEach(([n, y]) => {
      g.fillStyle = '#1fa45b'; g.beginPath(); g.arc(110, y, 46, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `800 60px ${FONT3}`; g.fillText(n, 110, y + 3);
    });
    // Pad placement diagram.
    g.strokeStyle = '#cfd5de'; g.lineWidth = 10; g.beginPath(); g.ellipse(560, 560, 120, 150, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f2f4f7'; g.fillRect(470, 470, 70, 90); g.fillRect(590, 590, 70, 90);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { g.fillStyle = '#1b1d22'; g.beginPath(); g.arc(760 + i * 34, 300 + j * 34, 10, 0, Math.PI * 2); g.fill(); }
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, Hh * 0.8), new THREE.MeshPhysicalMaterial({ map: faceTex, roughness: 0.55, clearcoat: 0.3 }));
  face.position.set(0, -0.02, D / 2 + 0.002);
  group.add(face);
  const shockMat = new THREE.MeshPhysicalMaterial({ color: '#ff6a2a', emissive: '#ff5a1a', emissiveIntensity: 0.2, roughness: 0.25, clearcoat: 1 });
  const shockTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ff6a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(150, 30); g.lineTo(80, 140); g.lineTo(128, 140); g.lineTo(100, 230); g.lineTo(180, 110); g.lineTo(132, 110); g.closePath(); g.fill(); });
  const shockTop = new THREE.MeshPhysicalMaterial({ map: shockTex, emissive: '#ff5a1a', emissiveMap: shockTex, emissiveIntensity: 0.2, roughness: 0.25, clearcoat: 1 });
  const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.08, 48), [shockMat, shockTop, shockMat]);
  shock.rotation.x = Math.PI / 2;
  shock.position.set(0.12, -0.42, D / 2 + 0.04);
  const power = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 40), new THREE.MeshPhysicalMaterial({ color: '#2fb86a', emissive: '#2bd06f', emissiveIntensity: 0.25, roughness: 0.3, clearcoat: 1 }));
  power.rotation.x = Math.PI / 2;
  power.position.set(-0.53, 0.32, D / 2 + 0.035);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.26), new THREE.MeshPhysicalMaterial({ color: '#0b1a14', emissive: '#1d6b45', emissiveIntensity: 0.35, roughness: 0.05, clearcoat: 1 }));
  screen.position.set(0.24, 0.3, D / 2 + 0.004);
  group.add(shock, power, screen);
  // Carry handle.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 16, 48, Math.PI), new THREE.MeshPhysicalMaterial({ color: '#25282e', roughness: 0.55, clearcoat: 0.3 }));
  handle.scale.set(1, 0.55, 1);
  handle.position.set(0, Hh / 2 - 0.04, 0);
  group.add(handle);
  // Lid hinged along the bottom front edge, with the label on its outside.
  const lidTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#1fa45b'; g.fillRect(0, 0, w, h);
    heartBolt(g, w / 2, h * 0.38, 380, '#ffffff', '#1fa45b');
    g.font = '800 170px "Avenir Next", "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AED', w / 2, h * 0.74);
  });
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, -Hh / 2 + 0.06, D / 2);
  const lidBox = new THREE.Mesh(roundedBox(W * 0.94, Hh * 0.9, 0.09, 0.04, [12, 12, 2]), green);
  lidBox.position.set(0, Hh * 0.45 - 0.02, 0.06);
  const lidLabel = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, Hh * 0.78), new THREE.MeshPhysicalMaterial({ map: lidTex, roughness: 0.32, clearcoat: 0.8 }));
  lidLabel.position.set(0, Hh * 0.45 - 0.02, 0.107);
  lidPivot.add(lidBox, lidLabel);
  group.add(lidPivot);
  function set(s = {}) {
    lidPivot.rotation.x = ease(clamp(s.open ?? 0)) * 1.9;
    const f = clamp(s.flash ?? 0);
    shockMat.emissiveIntensity = shockTop.emissiveIntensity = 0.2 + 3 * f;
  }
  set(o);
  return { group, set };
}
export function createAEDPad() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(roundedBox(0.7, 0.95, 0.04, 0.018, [8, 8, 2]), new THREE.MeshPhysicalMaterial({ color: '#d4d7de', roughness: 0.55, clearcoat: 0.3 }));
  const tex = canvasTex(256, 352, (c, w, h) => {
    c.fillStyle = '#d4d7de'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#2b2f3a'; c.lineWidth = 8; c.beginPath(); c.ellipse(w / 2, h / 2 + 20, 70, 110, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e8424f'; c.fillRect(w / 2 - 40, h / 2 - 20, 40, 50); c.fillRect(w / 2 + 10, h / 2 + 40, 40, 50);
    c.fillStyle = '#2b2f3a'; c.font = '700 34px Arial'; c.textAlign = 'center'; c.fillText('PAD', w / 2, 46);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.86), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5 }));
  face.position.z = 0.0205;
  g.add(pad, face);
  return g;
}

// ---------------------------------------------------------------------------------------------- torso
export function createTorso(o = {}) {
  const group = new THREE.Group();
  // Half-width, half-depth and squareness of the body cross-section up the torso (y from -2 to 2.45).
  const A = stops([[-2.0, 1.02], [-1.5, 0.98], [-0.9, 0.86], [-0.2, 0.96], [0.5, 1.06], [1.15, 1.17], [1.48, 1.27], [1.66, 1.18], [1.8, 0.92], [1.92, 0.58], [2.0, 0.4], [2.1, 0.36], [2.45, 0.35]]);
  const B = stops([[-2.0, 0.6], [-1.4, 0.6], [-0.9, 0.55], [-0.2, 0.6], [0.5, 0.66], [1.1, 0.64], [1.5, 0.56], [1.75, 0.48], [1.95, 0.4], [2.1, 0.36], [2.45, 0.35]]);
  const NP = stops([[-2, 2.2], [0, 2.3], [1.2, 2.6], [1.6, 2.8], [1.85, 2.3], [2.1, 2], [2.45, 2]]);
  const ny = 150, nu = 96;
  const ys = [];
  for (let i = 0; i <= ny; i++) { const s = i / ny; ys.push(-2 + 4.45 * (s < 0.7 ? s / 0.7 * 0.72 : 0.72 + (s - 0.7) / 0.3 * 0.28)); }
  const pos = [], fade = [], idx = [];
  for (let i = 0; i <= ny; i++) {
    const y = ys[i], a = A(y), b = B(y), np = NP(y);
    for (let j = 0; j < nu; j++) {
      const th = (j / nu) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      let x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / np);
      let z = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / np);
      const front = Math.max(0, s), back = Math.max(0, -s), xn = x / a;
      // Pectorals, sternum groove, belly, shoulder blades and spine groove.
      z += front * (0.09 * gauss(y - 0.85, 0.32) * gauss(Math.abs(xn) - 0.45, 0.3) - 0.035 * gauss(xn, 0.1) * gauss(y - 0.6, 0.8) + 0.04 * gauss(y + 1.1, 0.45) * gauss(xn, 0.6));
      z -= back * (-0.05 * gauss(y - 1.0, 0.35) * gauss(Math.abs(xn) - 0.42, 0.22) + 0.03 * gauss(xn, 0.08));
      // Deltoid caps round off the shoulders where the arms would start.
      x *= 1 + 0.03 * gauss(y - 1.45, 0.15) * Math.abs(c);
      pos.push(x, y, z);
      fade.push(smooth(-2, -1.45, y) * (1 - smooth(2.05, 2.42, y)));
    }
  }
  for (let i = 0; i < ny; i++) for (let j = 0; j < nu; j++) {
    const a = i * nu + j, b = i * nu + ((j + 1) % nu), c = (i + 1) * nu + j, d = (i + 1) * nu + ((j + 1) % nu);
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const back = new THREE.Mesh(geo, glassMaterial({ side: THREE.BackSide, fade: true, min: 0.02, max: 0.22, rimStrength: 0.25 }));
  const front = new THREE.Mesh(geo, glassMaterial({ side: THREE.FrontSide, fade: true }));
  back.renderOrder = 1; front.renderOrder = 2;
  group.add(back, front);

  // Ribcage.
  const bones = new THREE.Group();
  group.add(bones);
  const bm = boneMaterial(), cm = cartilageMaterial();
  // Rib k leaves the spine at the back, swings out and round, and drops steeply towards the front.
  const RX = [0.46, 0.64, 0.77, 0.86, 0.92, 0.95, 0.96, 0.95, 0.92, 0.87, 0.8, 0.72];
  const RZ = [0.4, 0.45, 0.48, 0.5, 0.5, 0.5, 0.5, 0.5, 0.49, 0.47, 0.44, 0.4];
  const ribs = [];
  const zBack = -0.43;
  const ribPoint = (k, side, phi) => {
    const ys = 1.52 - k * 0.19, drop = 0.36 + k * 0.035, rx = RX[k], rz = RZ[k];
    const u = phi / Math.PI;
    return V(side * (0.14 + (rx - 0.14) * Math.sin(phi) * (1 + 0.08 * Math.sin(phi * 2))),
      ys + 0.06 * Math.sin(phi) - drop * Math.pow(u, 1.6),
      zBack + rz - rz * Math.cos(phi));
  };
  // Ribs are flat bones: a thin, tall cross-section whose flat face follows the body wall.
  const ribFrame = cx => (P, T) => {
    const out = V(P.x - cx, 0, P.z - 0.07);
    out.addScaledVector(T, -out.dot(T));
    return out.lengthSq() > 1e-8 ? out.normalize() : V(1, 0, 0);
  };
  const ribTube = (pts, thick, tall, taper) => sweepGeometry(pts, (s, a) => {
    const w = 1 - taper * (1 - s);
    return [thick, tall * w].map(v => v * Math.sqrt(clamp(Math.min(s / 0.02, (1 - s) / 0.02))));
  }, { segs: 90, radial: 14, frame: ribFrame(0) });
  const sternumY = k => 1.4 - Math.min(k, 6.3) * 0.165;
  for (let k = 0; k < 12; k++) for (const side of [-1, 1]) {
    const end = k < 7 ? 0.84 : k < 10 ? 0.8 : k === 10 ? 0.62 : 0.48;
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push(ribPoint(k, side, Math.PI * end * i / 24));
    const rib = new THREE.Mesh(ribTube(pts, 0.024, 0.045 + 0.012 * Math.min(k, 6) / 6, 0.45), bm.clone());
    translucent(rib.material, '#e8b884', 0.18);
    bones.add(rib);
    ribs.push(rib);
    if (k < 10) {
      // Costal cartilage: true ribs climb to the sternum, false ribs curve up to join the cartilage above.
      const e = ribPoint(k, side, Math.PI * end);
      // True-rib cartilage tucks just under the sternum edge so no gap shows between them.
      const tgt = k < 7 ? V(side * 0.075, sternumY(k), 0.54) : ribPoint(k - 1, side, Math.PI * 0.84).lerp(V(side * 0.2, sternumY(6) - 0.1, 0.52), 0.25);
      const mid = e.clone().lerp(tgt, 0.55).add(V(0, -0.04, 0.03));
      const back = ribPoint(k, side, Math.PI * (end - 0.04));
      const tall = 0.045 + 0.012 * Math.min(k, 6) / 6;
      bones.add(new THREE.Mesh(sweepGeometry([back, e, mid, tgt], (s, a) => [0.024, tall * (1 - 0.25 * s)].map(v => v * Math.sqrt(clamp(Math.min(s / 0.03, (1 - s) / 0.03)))), { segs: 40, radial: 12, frame: ribFrame(0) }), cm));
    }
  }
  // Sternum (manubrium, body, xiphoid) and S-curved clavicles.
  const sternum = new THREE.Mesh(blobGeometry(4, p => V(p.x * (0.11 + 0.05 * Math.max(0, p.y - 0.3) - 0.04 * Math.max(0, -p.y - 0.6)), p.y * 0.62, p.z * 0.045)), bm);
  sternum.position.set(0, 0.86, 0.55);
  sternum.rotation.x = -0.16;
  bones.add(sternum);
  for (const side of [-1, 1]) {
    // S-curve: bowed forward near the sternum, swept back to the shoulder, knobbly at both ends.
    const pts = [V(side * 0.1, 1.49, 0.55), V(side * 0.36, 1.53, 0.56), V(side * 0.62, 1.58, 0.44), V(side * 0.84, 1.64, 0.22), V(side * 1.0, 1.68, 0.06)];
    const prof = stops([[0, 0.058], [0.15, 0.042], [0.6, 0.036], [0.88, 0.04], [1, 0.05]]);
    bones.add(new THREE.Mesh(sweepGeometry(pts, (s, a) => [prof(s) * 1.25, prof(s)].map(v => v * Math.sqrt(clamp(Math.min(s / 0.03, (1 - s) / 0.03)))), { segs: 60, radial: 16 }), bm));
  }
  // Spine: vertebral bodies with a spinous process each.
  const vb = new THREE.CylinderGeometry(0.11, 0.12, 0.13, 20), sp = new THREE.BoxGeometry(0.05, 0.08, 0.22);
  for (let i = 0; i < 26; i++) {
    const y = -2 + i * 0.165, z = -0.38 + 0.06 * Math.sin((y + 0.5) * 1.1);
    const v = new THREE.Mesh(vb, bm); v.position.set(0, y, z);
    const s = new THREE.Mesh(sp, bm); s.position.set(0, y - 0.03, z - 0.17); s.rotation.x = 0.4;
    bones.add(v, s);
  }
  const heartAnchor = new THREE.Object3D();
  heartAnchor.position.set(0.14, 0.55, 0.14);
  group.add(heartAnchor);
  const glow = new THREE.Color('#ffe9b8');
  function set(s = {}) {
    const g = s.glass ?? 1;
    front.material.userData.glass.uGlass.value = g;
    back.material.userData.glass.uGlass.value = g;
    front.visible = back.visible = g > 0.001;
    const rg = s.ribGlow ?? 0;
    for (const r of ribs) r.material.emissive.copy(s.ribColor ? new THREE.Color(s.ribColor) : glow).multiplyScalar(rg * 0.9);
  }
  set({});
  return { group, skin: front, skinBack: back, ribs, bones, heartAnchor, set };
}

// ---------------------------------------------------------------------------------------------- impact objects
let _ballTex = null;
function ballTextures() {
  if (_ballTex) return _ballTex;
  const w = 1024, h = 512;
  // Main seam around the equator with six rows of stitches, quarter seams along two meridians, leather grain.
  const info = (x, y) => {
    const u = x / w, v = y / h;
    const dv = (v - 0.5) * Math.PI;
    const seam = gauss(dv, 0.035);
    const row = Math.abs(dv) < 0.075 ? Math.abs(dv) : 1;
    const stitchRows = [0.022, 0.045, 0.066].some(r => Math.abs(row - r) < 0.006);
    const st = stitchRows && frac(u * 220) < 0.62 ? 1 : 0;
    const qd = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75)) * Math.PI * 2 * Math.cos(dv);
    const quarter = gauss(qd, 0.008) * smooth(0.12, 0.2, Math.abs(dv));
    const grain = tnoise(u * 180, v * 90, 180, 3) * 0.5 + tnoise(u * 60, v * 30, 60, 4) * 0.5;
    return { seam, st, quarter, grain };
  };
  const t = heightTextures(w, h, (x, y) => { const s = info(x, y); return 1.2 * s.seam + 0.5 * s.st - 0.5 * s.quarter + 0.06 * s.grain; }, 6, (x, y) => {
    const s = info(x, y);
    const base = [0.56 + 0.05 * s.grain, 0.09, 0.1];
    const thread = [0.93, 0.89, 0.82];
    const k = s.st * smooth(0.0, 0.5, s.seam);
    return [lerp(base[0] * (1 - 0.2 * s.quarter), thread[0], k), lerp(base[1], thread[1], k), lerp(base[2], thread[2], k)];
  });
  _ballTex = t;
  return t;
}
export function createCricketBall() {
  const { map, normal } = ballTextures();
  const m = new THREE.MeshPhysicalMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.16, sheen: 0.3, sheenColor: new THREE.Color('#ff8080') });
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 96, 64), m);
  g.add(ball);
  return g;
}
export function createLeg() {
  const g = new THREE.Group();
  // Thigh comes in from the left nearly level, knee at the origin, shin hangs down and slightly back.
  const pts = [[-3.2, 0.42, 0], [-2.1, 0.3, 0], [-1.0, 0.12, 0], [-0.25, 0.02, 0], [0, -0.1, 0], [-0.05, -0.45, 0], [-0.2, -1.4, 0], [-0.36, -2.5, 0]];
  // Arc-length fraction of the knee (the point nearest the origin).
  const probe = sweepGeometry(pts, () => 1, { segs: 4, radial: 4 }).userData.curve;
  let sK = 0, bd = 1e9;
  for (let i = 0; i <= 400; i++) { const d = probe.getPointAt(i / 400).length(); if (d < bd) { bd = d; sK = i / 400; } }
  const R = stops([[0, 0.5], [sK * 0.45, 0.45], [sK * 0.85, 0.35], [sK, 0.33], [sK + 0.06, 0.3], [sK + 0.22, 0.33], [sK + 0.42, 0.24], [0.94, 0.17], [1, 0.16]]);
  const geo = sweepGeometry(pts, (s, a) => {
    const c = Math.cos(a), back = Math.max(0, c), front = Math.max(0, -c);
    let r = R(s);
    r += 0.06 * gauss(s - sK, 0.03) * Math.pow(front, 3);                     // kneecap
    r += 0.04 * gauss(s - sK * 0.8, 0.08) * Math.pow(front, 2) * (1 + Math.sin(a) * 0.5); // quadriceps above the knee
    r += 0.07 * gauss(s - (sK + 0.2), 0.08) * Math.pow(back, 1.5);            // calf
    r -= 0.04 * gauss(s - 0.93, 0.05) * Math.pow(back, 2);                    // Achilles narrowing
    r *= 1 - 0.06 * Math.pow(Math.abs(Math.sin(a)), 2) * (s > sK ? 1 : 0);   // shin a little flatter side to side
    return r * Math.sqrt(clamp((1 - s) / 0.012));
  }, { segs: 220, radial: 64 });
  g.add(new THREE.Mesh(geo, skinMaterial()));
  // White shorts over the thigh, a sock and a sports shoe make it read as a sporting leg at a glance.
  // Loose shorts: soft drape folds that deepen towards a slightly flared hem, and a rounded top end.
  // Starts a little behind the thigh's end so its rounded top covers the skin.
  const shorts = sweepGeometry([[-3.36, 0.44, 0], ...pts.slice(0, 4)], (s, a) => {
    const fold = (0.012 + 0.02 * s) * Math.sin(a * 5 + s * 9 + 0.6 * Math.sin(a * 2)) + 0.01 * Math.sin(a * 11 - s * 14);
    return (R(s * sK) + 0.07 + fold + 0.035 * smooth(0.82, 1, s)) * Math.sqrt(clamp(s / 0.035));
  }, { segs: 90, radial: 96 });
  g.add(new THREE.Mesh(shorts, fabricMaterial('#dcdfe6', [40, 18])));
  const sock = sweepGeometry([[-0.22, -1.95, 0], [-0.3, -2.3, 0], [-0.38, -2.7, 0]], (s, a) => 0.19 - 0.02 * s + 0.006 * Math.sin(s * 60) * smooth(0, 0.25, 1 - s), { segs: 40, radial: 48 });
  g.add(new THREE.Mesh(sock, fabricMaterial('#f2f3f6', [30, 14])));
  // Trainer: dark upper with a flat bottom, a white midsole slab, toe spring and laces across the instep.
  const foot = [[-0.66, -2.8, 0], [-0.3, -2.84, 0], [0.12, -2.9, 0], [0.5, -2.93, 0]];
  const upperGeo = sweepGeometry(foot, (s, a) => {
    const c = Math.cos(a);
    const top = 0.27 * (1 - smooth(0.25, 0.95, s)) + 0.1, w = 0.21 - 0.03 * smooth(0.6, 1, s);
    const rx = c > 0 ? Math.min(top, 0.05 / c) : top;
    return [rx, w].map(v => v * Math.sqrt(clamp(Math.min(s / 0.1, (1 - s) / 0.16))));
  }, { segs: 90, radial: 56 });
  const upperMat = new THREE.MeshPhysicalMaterial({ color: '#1f3b6e', roughness: 0.5, clearcoat: 0.25, sheen: 0.6, sheenColor: new THREE.Color('#9fb6e8'), normalMap: knitNormal(), normalScale: new THREE.Vector2(0.3, 0.3) });
  g.add(new THREE.Mesh(upperGeo, upperMat));
  const soleGeo = sweepGeometry(foot.map(([x, y, z], i) => [x, y - 0.1 + (i === 3 ? 0.04 : 0), z]), (s, a) => {
    const c = Math.cos(a);
    const rx = c > 0 ? Math.min(0.11, 0.06 / c) : Math.min(0.11, 0.035 / -c);
    return [rx, 0.235 - 0.035 * smooth(0.6, 1, s)].map(v => v * Math.sqrt(clamp(Math.min(s / 0.05, (1 - s) / 0.08))));
  }, { segs: 90, radial: 56 });
  g.add(new THREE.Mesh(soleGeo, new THREE.MeshPhysicalMaterial({ color: '#eef0f3', roughness: 0.55, clearcoat: 0.2 })));
  const laceMat = new THREE.MeshPhysicalMaterial({ color: '#f4f5f8', roughness: 0.7, sheen: 0.5 });
  for (let i = 0; i < 4; i++) {
    const x = -0.12 + i * 0.11, q = (x + 0.66) / 1.16;
    const lace = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.2, 4, 10), laceMat);
    lace.position.set(x, -2.8 - 0.13 * q + 0.27 * (1 - smooth(0.25, 0.95, q)) + 0.1 - 0.012, 0);
    lace.rotation.set(Math.PI / 2, 0, -0.35 + i * 0.05);
    g.add(lace);
  }
  return g;
}
export function createArm() {
  const g = new THREE.Group();
  // Upper arm comes in from the left, the elbow at the origin leads, the forearm folds back up to a fist.
  const pts = [[-2.4, -0.55, 0], [-1.3, -0.3, 0], [-0.35, -0.06, 0], [0, 0.08, 0], [-0.15, 0.4, 0], [-0.75, 1.0, 0], [-1.35, 1.55, 0]];
  const probe = sweepGeometry(pts, () => 1, { segs: 4, radial: 4 }).userData.curve;
  let sE = 0, bd = 1e9;
  for (let i = 0; i <= 400; i++) { const d = probe.getPointAt(i / 400).length(); if (d < bd) { bd = d; sE = i / 400; } }
  const R = stops([[0, 0.34], [sE * 0.5, 0.32], [sE * 0.9, 0.26], [sE, 0.25], [sE + 0.1, 0.27], [sE + 0.3, 0.22], [0.97, 0.16], [1, 0.15]]);
  const geo = sweepGeometry(pts, (s, a) => {
    const c = Math.cos(a), out = Math.max(0, c), inn = Math.max(0, -c);
    let r = R(s);
    r += 0.06 * gauss(s - sE * 0.55, 0.12) * Math.pow(inn, 1.5);   // biceps
    r += 0.04 * gauss(s - sE * 0.6, 0.12) * Math.pow(out, 1.5);    // triceps
    r += 0.05 * gauss(s - sE, 0.025) * Math.pow(out, 4);           // point of the elbow
    r += 0.04 * gauss(s - (sE + 0.12), 0.07) * Math.pow(Math.abs(Math.sin(a)), 2); // forearm muscle
    return r * Math.sqrt(clamp((1 - s) / 0.01));
  }, { segs: 220, radial: 64 });
  g.add(new THREE.Mesh(geo, skinMaterial()));
  // Short sports sleeve: drape folds, a rolled hem above the elbow and a rounded shoulder end.
  const sleeve = sweepGeometry([[-2.56, -0.59, 0], ...pts.slice(0, 3)], (s, a) => {
    const fold = (0.01 + 0.018 * s) * Math.sin(a * 5 + s * 7) + 0.008 * Math.sin(a * 9 - s * 11);
    return (0.42 + fold + 0.03 * smooth(0.85, 1, s)) * Math.sqrt(clamp(s / 0.05));
  }, { segs: 70, radial: 96 });
  g.add(new THREE.Mesh(sleeve, fabricMaterial('#dcdfe6', [40, 14])));
  // Fist in a frame where +X runs out of the wrist and +Y faces the palm (the inside of the bent arm):
  // back of the hand, four knuckles with fingers curled into the palm, and the thumb across them.
  const fist = new THREE.Group();
  const skin = skinMaterial();
  const back = new THREE.Mesh(roundedBox(0.34, 0.24, 0.36, [0.09, 0.1, 0.1], [14, 12, 14], (s, d) => 0.012 * Math.max(0, -d.y) * Math.cos(s.z * 26)), skin);
  back.position.set(0.12, -0.03, 0);
  fist.add(back);
  for (let i = 0; i < 4; i++) {
    const z = -0.135 + i * 0.09, len = i === 0 || i === 3 ? 0.11 : 0.13;
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), skin);
    knuckle.position.set(0.27 - (i === 3 ? 0.02 : 0), -0.08, z);
    const prox = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, len, 6, 14), skin);
    prox.position.set(0.31 - (i === 3 ? 0.02 : 0), 0.0, z); prox.rotation.z = 0.25;
    const mid = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.08, 6, 14), skin);
    mid.position.set(0.24, 0.11, z); mid.rotation.z = Math.PI / 2 + 0.3;
    fist.add(knuckle, prox, mid);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.17, 6, 16), skin);
  thumb.position.set(0.2, 0.16, 0.06); thumb.rotation.set(Math.PI / 2, 0.25, 0);
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), skin);
  thenar.scale.set(1.3, 0.8, 0.9); thenar.position.set(0.06, 0.09, 0.13);
  fist.add(thumb, thenar);
  const end = probe.getPointAt(1), tan = probe.getTangentAt(1);
  fist.position.copy(end).addScaledVector(tan, 0.04);
  fist.quaternion.setFromUnitVectors(V(1, 0, 0), tan);
  g.add(fist);
  return g;
}
export function createImpactFlash(color = '#fff1c2') {
  const group = new THREE.Group();
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uWidth: { value: 0.15 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha, uWidth; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = exp(-pow((d - (1.0 - uWidth)) / uWidth, 2.0)) * uAlpha; gl_FragColor = vec4(uColor * a * 3.0, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat);
  ring.userData.noDepth = true;
  const fm = haloMaterial();
  const flash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fm, 1);
  flash.setColorAt(0, new THREE.Color(color));
  flash.userData.noDepth = true;
  const light = new THREE.PointLight(color, 0, 6, 1.5);
  group.add(ring, flash, light);
  function update(p) {
    const on = p > 0 && p < 1;
    group.visible = on;
    if (!on) return;
    const s = 0.15 + 1.5 * easeOut(p);
    ring.scale.setScalar(s);
    ringMat.uniforms.uAlpha.value = 0.8 * (1 - p) * (1 - p);
    ringMat.uniforms.uWidth.value = 0.08 + 0.12 * p;
    fm.uniforms.uSize.value = 1;
    fm.uniforms.uIntensity.value = 2.2 * Math.pow(1 - p, 4);
    flash.setMatrixAt(0, new THREE.Matrix4().makeScale(0.7 + 0.5 * p, 0.7 + 0.5 * p, 0.7 + 0.5 * p));
    flash.instanceMatrix.needsUpdate = true;
    light.intensity = 8 * Math.pow(1 - p, 2);
  }
  update(0);
  return { group, update };
}

// ---------------------------------------------------------------------------------------------- flatten
export function flatten(obj, stage, p, o = {}) {
  const cam = stage.camera, reg = stage.region;
  if (!obj.userData.flat0) obj.userData.flat0 = { pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() };
  const s0 = obj.userData.flat0;
  cam.updateMatrixWorld();
  const parent = obj.parent;
  if (parent) parent.updateMatrixWorld();
  const pm = parent ? parent.matrixWorld : new THREE.Matrix4();
  // Start pose in world space.
  const startM = new THREE.Matrix4().compose(s0.pos, s0.quat, s0.scale).premultiply(pm);
  const sp = V(), sq = new THREE.Quaternion(), ss = V();
  startM.decompose(sp, sq, ss);
  const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const center = o.center || [reg.x + reg.w / 2, reg.y + reg.h / 2];
  const ppu = o.pxPerUnit || (FW * (o.fill ?? 0.9)) / (o.width ?? 10);
  // Stay at the starting depth (or o.distance) and scale so one local unit spans ppu frame pixels there.
  const d = o.distance ?? Math.max(cam.near * 4, -sp.clone().applyMatrix4(cam.matrixWorldInverse).z);
  const k = (ppu * 2 * d * tanH) / reg.h;
  const nx = ((center[0] - reg.x) / reg.w) * 2 - 1, ny = 1 - ((center[1] - reg.y) / reg.h) * 2;
  const target = V(nx * d * tanH * cam.aspect, ny * d * tanH, -d).applyMatrix4(cam.matrixWorld);
  const e = ease(p);
  const wp = sp.clone().lerp(target, e), wq = sq.clone().slerp(cam.quaternion, e);
  const ws = ss.clone().lerp(V(k, k, k * (o.thin ?? 1)), e);
  const local = new THREE.Matrix4().compose(wp, wq, ws).premultiply(pm.clone().invert());
  local.decompose(obj.position, obj.quaternion, obj.scale);
  return { e, pxPerUnit: ppu, center };
}
export function flattenReset(obj) {
  const s0 = obj.userData.flat0;
  if (!s0) return;
  obj.position.copy(s0.pos); obj.quaternion.copy(s0.quat); obj.scale.copy(s0.scale);
  delete obj.userData.flat0;
}
