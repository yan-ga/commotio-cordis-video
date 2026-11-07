// heart3d.js: the hero 3D heart for the commotio cordis video (semi-realistic, stylised, animatable).
// Self-contained ES module. Needs the import map entries "three" and "three/addons/".
//
// ============================================================================
// API REFERENCE
// ============================================================================
// const heart = await loadHeart(renderer, { url = '../assets/heart.glb' })
//   Loads assets/heart.glb, recolours it, bakes AO and the electrical distance fields (about 1.6 s).
//   heart.group          THREE.Group to add to any scene. Model space ("heart space"):
//                        +Y up (aorta arch on top), +Z = anterior (front view = camera on +Z looking -Z),
//                        -X = patient's right = viewer's LEFT in the front view. Bounding box height is
//                        exactly 2 (y -1..1), width about 1.3, depth about 1.0, centred on the origin.
//                        Move/rotate/scale heart.group freely; everything else follows.
//   heart.anchors        { name: THREE.Vector3 } in heart space (see ANCHORS below), plus
//                        heart.anchorNormals { name: Vector3 } (outward surface normal at surface anchors).
//   heart.world(name, out?)               anchor in world space (uses group.matrixWorld)
//   heart.screen(name, camera, w=1920, h=1080) -> { x, y, facing }  pixel position for 2D labels;
//                        facing < 0 means the point is on the far side of the heart.
//   heart.update(state)  Sets the whole look for this frame. Pure: omitted keys go back to defaults,
//                        so call it once per frame with everything you need. Keys (all optional):
//     t              seconds, drives quiver, spirals and node pulsing (default 0)
//     squeezeA       0..1 atria squeeze               squeezeV  0..1 ventricles squeeze (toward apex + long axis)
//                    Use beat(phase) to get both for a normal heartbeat.
//     quiver         0..1 fibrillation shimmer: small chaotic local twitching, no coordinated squeeze
//     wave           null | 0..1 electrical wave progress (glowing band on the surface), timeline WAVE:
//                    0-0.32 spreads from the SA node over both atria, 0.32-0.52 held at the AV node (pulsing),
//                    0.52-0.82 sweeps the ventricles from the septum and apex upward, 0.82-1 afterglow fades.
//     paths          null | 0..1 conduction wiring drawn as glowing tubes, same timeline as wave
//                    (SA->AV in the RA wall, slow crossing of the AV node during the pause, left and right
//                    bundle branches down the inside of the septum, then Purkinje fibres up inside the walls).
//                    The wiring is internal, so it is drawn X-ray style over the surface (far side fainter);
//                    pair it with dim 0.3-0.4 so it reads as glowing through the tissue.
//     pathsGhost     0..1 faint full wiring shown ahead of the progress (default 0)
//     nodes          0..1 glow on the SA and AV nodes (pulses with t)
//     fib            0..1 several thin, bright, spinning two-armed spirals (rotors) wandering over the ventricle
//                    walls (pair with quiver)
//     shock          0..1 whole-heart white-yellow flash with crackling filaments (shockEnvelope(t, t0) gives a nice curve)
//     highlight      { atria, ventricles, ra, la, rv, lv, patch, all: 0..1 } soft glow for labels
//     highlightColor css colour (default warm gold)
//     patch          { at: anchor name or Vector3 (heart space), radius = 0.22 } where 'patch' glows
//     cutaway        0..1 four-chamber cutaway; it wipes open from the top (0 closed, 1 fully open).
//                    The front of the heart is removed along a plane tilted back 22 degrees at the top, the cut
//                    face is solid muscle, and each chamber is a real hollow you can see into. squeezeA/squeezeV
//                    shrink the cavities (the walls visibly thicken). Reads well within about 40 degrees of front.
//     fill           { ra, la, rv, lv: 0..1 } blood level in each chamber of the cutaway (0 = empty)
//     blood          { ra, la, rv, lv: css colour } blood tint per chamber (default red)
//     dim            0..1 darken the whole heart (for "faded into the background" moments)
//   heart.dispose()
//
// beat(phase) -> { squeezeA, squeezeV }   one cardiac cycle, phase 0..1 (wraps). Atrial kick at
//                        0..0.18, ventricular squeeze 0.14..0.58, rest after that.
// beatAt(t, bpm = 70, t0 = 0)   same, from seconds.
// shockEnvelope(t, t0)   0 before t0, instant flash, fades over about 0.9 s.
// WAVE                   timeline constants used by wave/paths.
//
// const stage = createStage({ width = 1920, height = 1080, bloom = 0.6, vignette = 0.38, particles = true })
//   Self-contained renderer + scene + lighting rig + post (ACES, bloom, vignette, soft bokeh motes).
//   stage.renderer, stage.scene, stage.camera (PerspectiveCamera fov 30), stage.canvas
//   stage.render(t)        renders one frame (t only moves the background motes)
//   stage.orbit(yawDeg, pitchDeg, dist, target = (0,-0.05,0))   camera helper around the heart
//   addHeartLights(scene, renderer)   the same lighting + environment, for a scene you own
//   To show it in a lib.js scene: setup((ctx, t) => { heart.update({...}); stage.render(t);
//   ctx.drawImage(stage.canvas, 0, 0); ...2D labels... }). The stage paints lib's navy background itself.
//
// ANCHORS (heart space, surface points unless noted):
//   sa          SA node: upper right atrium where the superior vena cava enters (viewer's left)
//   av          AV node as seen on the front surface (right AV groove beside the septum)
//   avCore      AV node inside the heart, where the four chambers meet on the cutaway face
//   apex        tip of the left ventricle
//   septumTop / septumMid / septumBack   points on the septum line (front groove top, mid, back groove)
//   lvWall, rvWall   centre of each ventricle's free wall (front-lateral surface)
//   lvLat       lateral wall of the LV (the side away from the viewer's right)
//   chestHit    point on the front of the LV where a chest blow lands
//   ra, la, rv, lv   chamber centres (inside the heart; good targets for labels and arrows)
//   atriaTop / ventMid   label points on the top-chamber and bottom-chamber regions
//   crux, rvBase, lvBase, laAur   extra surface waypoints (back crux, base of each ventricle, LA appendage)
//   cutRa, cutLa, cutRv, cutLv   the middle of each open cavity on the cutaway face (labels in the cutaway)
// Regions: per-vertex weights split the surface into atria / ventricles / great vessels
// (classified from the texture and grown over the mesh), and a septum plane splits left from right.
// heart.regions = { septumPlane: THREE.Plane (positive = left heart), cutPlane: THREE.Plane (positive = the
// removed front part), longAxis: {apex, base} }.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ---------------------------------------------------------------------------- palette (sRGB)
export const HEART_PALETTE = {
  muscle: '#a5223a', muscleWarm: '#d24a46', muscleDeep: '#4e0a1c', atria: '#b03a4c', artery: '#8e1a2e', vein: '#545b98',
  fat: '#b39587', coronary: '#7a1a30', interior: '#5c1220', cut: '#962634', chamber: '#9a2a3a',
  sss: '#ff4a32', electric: '#ffc040', hot: '#fff1c4', shockCol: '#fff3cf', blood: '#b51530',
};

export const WAVE = { atria: [0, 0.32], av: [0.32, 0.52], vent: [0.52, 0.82], fade: [0.82, 1] };

// Fibrillation: number of rotor cores, and spiral winding (radians per unit of distance from the core).
const FIB_CORES = 6, FIB_K = 58;

// Cutaway plane, tilted back at the top so one flat cut passes through all four chambers.
// Plane frame: u = +X, v = up along the plane, n = out of the front half (which is removed).
const CUT = (() => {
  const a = 22 * Math.PI / 180;
  return { off: -0.12, u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, Math.cos(a), -Math.sin(a)), n: new THREE.Vector3(0, Math.sin(a), Math.cos(a)) };
})();
const planeToHeart = (u, v, w = 0) => CUT.u.clone().multiplyScalar(u).addScaledVector(CUT.v, v).addScaledVector(CUT.n, w + CUT.off);

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function beat(phase) {
  const p = ((phase % 1) + 1) % 1;
  return {
    squeezeA: sstep(0.0, 0.07, p) * (1 - sstep(0.09, 0.2, p)),
    squeezeV: sstep(0.14, 0.3, p) * (1 - sstep(0.38, 0.58, p)),
  };
}
export const beatAt = (t, bpm = 70, t0 = 0) => beat(Math.max(0, t - t0) * bpm / 60);
export const shockEnvelope = (t, t0) => (t < t0 ? 0 : Math.min(1, (t - t0) / 0.04) * Math.exp(-Math.max(0, t - t0 - 0.06) / 0.32));

// ---------------------------------------------------------------------------- mesh graph tools
function weld(P, n) {
  const q = 1e5, SIZE = 1 << 21, mask = SIZE - 1;
  const table = new Int32Array(SIZE).fill(-1);
  const remap = new Int32Array(n);
  const qx = [], qy = [], qz = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round(P[3 * i] * q), y = Math.round(P[3 * i + 1] * q), z = Math.round(P[3 * i + 2] * q);
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      const j = table[h];
      if (j < 0) { table[h] = qx.length; remap[i] = qx.length; qx.push(x); qy.push(y); qz.push(z); break; }
      if (qx[j] === x && qy[j] === y && qz[j] === z) { remap[i] = j; break; }
      h = (h + 1) & mask;
    }
  }
  return { nv: qx.length, remap };
}

function buildAdj(nv, tris) {
  const deg = new Int32Array(nv + 1);
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { deg[tris[t + k]] += 2; }
  const start = new Int32Array(nv + 1);
  for (let i = 0; i < nv; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, nv), list = new Int32Array(start[nv]);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    list[fill[a]++] = b; list[fill[a]++] = c; list[fill[b]++] = a; list[fill[b]++] = c; list[fill[c]++] = a; list[fill[c]++] = b;
  }
  return { start, list };
}

// Jacobi neighbour averaging of a field with `comps` components. lambda < 0 inflates (Taubin step).
function smoothField(F, comps, adj, iters, lambda = 1) {
  const { start, list } = adj, nv = start.length - 1;
  let a = F, b = new Float32Array(F.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < nv; i++) {
      const s = start[i], e = start[i + 1];
      if (e === s) { for (let c = 0; c < comps; c++) b[i * comps + c] = a[i * comps + c]; continue; }
      for (let c = 0; c < comps; c++) {
        let acc = 0;
        for (let k = s; k < e; k++) acc += a[list[k] * comps + c];
        const v = a[i * comps + c];
        b[i * comps + c] = v + lambda * (acc / (e - s) - v);
      }
    }
    const t = a; a = b; b = t;
  }
  if (a !== F) F.set(a);
  return F;
}

function vertexNormals(pos, tris, nv) {
  const N = new Float32Array(nv * 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
  }
  for (let i = 0; i < nv; i++) {
    const l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1;
    N[3 * i] /= l; N[3 * i + 1] /= l; N[3 * i + 2] /= l;
  }
  return N;
}

// Dijkstra over the vertex graph. seeds: [[vertex, startDist]]. cost(i) multiplies edge length (Infinity blocks).
function dijkstra(pos, adj, seeds, cost = null, maxD = Infinity) {
  const { start, list } = adj, nv = start.length - 1;
  const dist = new Float64Array(nv).fill(Infinity), prev = new Int32Array(nv).fill(-1);
  let cap = 1 << 16, hk = new Float64Array(cap), hv = new Int32Array(cap), size = 0;
  const push = (k, v) => {
    if (size === cap) { cap *= 2; const k2 = new Float64Array(cap); k2.set(hk); hk = k2; const v2 = new Int32Array(cap); v2.set(hv); hv = v2; }
    let i = size++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
    const v = hv[0], k = hk[--size], kv = hv[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= size) break;
      if (c + 1 < size && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c]; hv[i] = hv[c]; i = c;
    }
    hk[i] = k; hv[i] = kv;
    return v;
  };
  for (const [s, d0] of seeds) if (d0 < dist[s]) { dist[s] = d0; push(d0, s); }
  while (size > 0) {
    const d = hk[0], u = pop();
    if (d > dist[u] || d > maxD) continue;
    const cu = cost ? cost[u] : 1;
    for (let k = start[u]; k < start[u + 1]; k++) {
      const w = list[k];
      const cw = cost ? cost[w] : 1;
      if (cw === Infinity) continue;
      const len = Math.hypot(pos[3 * u] - pos[3 * w], pos[3 * u + 1] - pos[3 * w + 1], pos[3 * u + 2] - pos[3 * w + 2]);
      const nd = d + len * 0.5 * (cu + cw);
      if (nd < dist[w]) { dist[w] = nd; prev[w] = u; push(nd, w); }
    }
  }
  return { dist, prev };
}

function tracePath(prev, target) {
  const out = [];
  for (let v = target; v >= 0; v = prev[v]) out.push(v);
  return out.reverse();
}

// Pick the surface vertex a ray hits first: the vertex within `r` of the ray that is closest to its origin.
function pickVertex(pos, nrm, nv, origin, dir, r = 0.02) {
  let best = -1, bestT = Infinity;
  const [ox, oy, oz] = origin, [dx, dy, dz] = dir;
  for (let i = 0; i < nv; i++) {
    const px = pos[3 * i] - ox, py = pos[3 * i + 1] - oy, pz = pos[3 * i + 2] - oz;
    const t = px * dx + py * dy + pz * dz;
    if (t <= 0 || t >= bestT) continue;
    if (nrm[3 * i] * dx + nrm[3 * i + 1] * dy + nrm[3 * i + 2] * dz > 0.1) continue; // must face the ray
    const qx = px - t * dx, qy = py - t * dy, qz = pz - t * dz;
    if (qx * qx + qy * qy + qz * qz < r * r) { best = i; bestT = t; }
  }
  return best;
}

// ---------------------------------------------------------------------------- texture classification
function imageDataOf(tex) {
  const img = tex.image, c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}

// Returns class weights [atria(pink), artery, vein, fat, dark] for one texel. Muscle = the rest.
// Arteries and ventricle muscle share a hue in this texture, but the arteries are much rougher.
function classify(r, g, b, rough, out) {
  out.fill(0);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn + 1e-6, s = d / (mx + 1e-6);
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  const hh = h > 180 ? h - 360 : h;
  if (h >= 175 && h < 300 && s > 0.2) { out[2] = 1; return; }
  if (mx < 0.36) { if (s < 0.35) out[2] = 1; else out[4] = 1; return; }
  if (hh >= 13 && hh < 75) { out[3] = 1; return; }
  if (hh >= 4 && hh < 13) { out[3] = (hh - 4) / 9; return; }
  if (hh < -11) { out[0] = 1; return; }
  if (hh < -7) { out[0] = (-7 - hh) / 4; }
  if (rough > 154) out[1] = 1 - out[0];
}

// ---------------------------------------------------------------------------- GPU ambient-occlusion bake
// Renders the mesh depth from 64 directions into one atlas, then every vertex checks its visibility
// in all 64 maps in a single point-sprite pass. About 100 ms on the M2 Pro.
function bakeAO(renderer, pos, nrm, tris, nv) {
  const DIRS = 64, TILE = 256, COLS = 8, R = 1.25;
  const dirs = [], rights = [], ups = [];
  for (let k = 0; k < DIRS; k++) {
    const y = 1 - 2 * (k + 0.5) / DIRS, rr = Math.sqrt(1 - y * y), phi = k * Math.PI * (3 - Math.sqrt(5));
    const d = new THREE.Vector3(Math.cos(phi) * rr, y, Math.sin(phi) * rr);
    const helper = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(helper, d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right);
    dirs.push(d); rights.push(right); ups.push(up);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(tris, 1));
  const depthMat = new THREE.ShaderMaterial({
    uniforms: { uDir: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() } },
    vertexShader: `uniform vec3 uDir, uRight, uUp; varying float vD;
      void main(){ vD = ${R.toFixed(3)} - dot(position, uDir);
        gl_Position = vec4(dot(position,uRight)/${R.toFixed(3)}, dot(position,uUp)/${R.toFixed(3)}, vD/${(2 * R).toFixed(3)}*2.0-1.0, 1.0); }`,
    fragmentShader: `varying float vD; void main(){ gl_FragColor = vec4(vD, 0.0, 0.0, 1.0); }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, depthMat); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  const cam = new THREE.Camera();
  const atlas = new THREE.WebGLRenderTarget(TILE * COLS, TILE * (DIRS / COLS), { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  renderer.setRenderTarget(atlas);
  renderer.setClearColor(new THREE.Color(100, 100, 100), 1); renderer.clear();
  renderer.autoClear = false;
  for (let k = 0; k < DIRS; k++) {
    const tx = k % COLS, ty = Math.floor(k / COLS);
    atlas.viewport.set(tx * TILE, ty * TILE, TILE, TILE);
    atlas.scissor.set(tx * TILE, ty * TILE, TILE, TILE); atlas.scissorTest = true;
    renderer.setRenderTarget(atlas);
    depthMat.uniforms.uDir.value.copy(dirs[k]); depthMat.uniforms.uRight.value.copy(rights[k]); depthMat.uniforms.uUp.value.copy(ups[k]);
    renderer.render(sc, cam);
  }
  atlas.scissorTest = false;
  // gather pass
  const S = Math.ceil(Math.sqrt(nv));
  const ids = new Float32Array(nv); for (let i = 0; i < nv; i++) ids[i] = i;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aN', new THREE.BufferAttribute(nrm, 3));
  pg.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
  const gatherMat = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas.texture }, uDirs: { value: dirs }, uRights: { value: rights }, uUps: { value: ups } },
    vertexShader: `uniform sampler2D uAtlas; uniform vec3 uDirs[${DIRS}], uRights[${DIRS}], uUps[${DIRS}];
      attribute vec3 aN; attribute float aId; varying float vAO;
      void main(){
        vec3 p = position + aN * 0.006; float vis = 0.0, wsum = 0.0;
        for (int k = 0; k < ${DIRS}; k++) {
          float w = max(dot(aN, uDirs[k]), 0.0); if (w <= 0.0) continue;
          vec2 uv = vec2(dot(p, uRights[k]), dot(p, uUps[k])) / ${R.toFixed(3)} * 0.5 + 0.5;
          vec2 tile = vec2(float(k % ${COLS}), float(k / ${COLS}));
          vec2 at = (tile + uv) * vec2(${(1 / COLS).toFixed(6)}, ${(COLS / DIRS).toFixed(6)});
          float occ = texture2D(uAtlas, at).r;
          float d = ${R.toFixed(3)} - dot(p, uDirs[k]);
          vis += w * step(d, occ + 0.01); wsum += w;
        }
        vAO = wsum > 0.0 ? vis / wsum : 1.0;
        float x = mod(aId, ${S}.0), y = floor(aId / ${S}.0);
        gl_Position = vec4((x + 0.5) / ${S}.0 * 2.0 - 1.0, (y + 0.5) / ${S}.0 * 2.0 - 1.0, 0.0, 1.0);
        gl_PointSize = 1.0;
      }`,
    fragmentShader: `varying float vAO; void main(){ gl_FragColor = vec4(vAO, 0.0, 0.0, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const pts = new THREE.Points(pg, gatherMat); pts.frustumCulled = false;
  const sc2 = new THREE.Scene(); sc2.add(pts);
  const out = new THREE.WebGLRenderTarget(S, S, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  renderer.setRenderTarget(out); renderer.setClearColor(0xffffff, 1); renderer.clear();
  renderer.render(sc2, cam);
  const buf = new Float32Array(S * S * 4);
  renderer.readRenderTargetPixels(out, 0, 0, S, S, buf);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevAlpha); renderer.autoClear = prevAuto;
  const ao = new Float32Array(nv); for (let i = 0; i < nv; i++) ao[i] = buf[i * 4];
  [atlas, out].forEach(r => r.dispose()); [geo, pg].forEach(g => g.dispose()); [depthMat, gatherMat].forEach(m => m.dispose());
  return ao;
}

// ---------------------------------------------------------------------------- shared GLSL
const GLSL_NOISE = /* glsl */`
float h3n(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3n(i), h3n(i + vec3(1,0,0)), f.x), mix(h3n(i + vec3(0,1,0)), h3n(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3n(i + vec3(0,0,1)), h3n(i + vec3(1,0,1)), f.x), mix(h3n(i + vec3(0,1,1)), h3n(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// Displacement shared by the heart surface, the wiring tubes and the cutaway cap so they move together.
// def = (atria weight, ventricle weight), heavily smoothed so the surface never tears.
const GLSL_DISPLACE = /* glsl */`
uniform float uSqA, uSqV, uQuiver, uTime;
uniform vec3 uApex, uAxis, uRAc, uLAc;
uniform vec4 uSeptum;
uniform float uBaseH;
vec3 heartDisplace(vec3 p, vec3 n, vec2 def) {
  vec3 d = vec3(0.0);
  float h = dot(p - uApex, uAxis);
  vec3 radial = (p - uApex) - uAxis * h;
  float hc = clamp(h, 0.0, uBaseH);
  float girth = sin(3.14159 * clamp(h / uBaseH, 0.0, 1.0) * 0.85 + 0.25);
  // ventricles: wring toward the long axis, base pulled down toward the apex; vessels ride along
  d += uSqV * def.y * (-radial * 0.11 * girth);
  d += uSqV * (-uAxis * hc * 0.075) * max(def.y, 0.55);
  // atria: contract toward their own centres
  float left = smoothstep(-0.05, 0.05, dot(p, uSeptum.xyz) + uSeptum.w);
  vec3 c = mix(uRAc, uLAc, left);
  d += uSqA * def.x * (c - p) * 0.10;
  // fibrillation: chaotic local twitching along the normal
  float q = vnoise(p * 7.0 + vec3(0.0, 0.0, uTime * 9.0)) - 0.5;
  q += 0.7 * (vnoise(p * 15.0 + vec3(uTime * 13.0, 1.7, 0.0)) - 0.5);
  q += 0.5 * (vnoise(p * 4.0 + vec3(3.1, uTime * 6.0, 0.0)) - 0.5);
  d += n * q * 0.036 * uQuiver * def.y;
  return d;
}
`;

// ---------------------------------------------------------------------------- heart surface material
function makeHeartMaterial(U) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.48, metalness: 0, clearcoat: 0.42, clearcoatRoughness: 0.26,
    sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff8f8a'), side: THREE.DoubleSide,
    envMapIntensity: 0.6,
  });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aCls; attribute vec4 aMisc; attribute vec4 aReg; attribute vec4 aDist;
        varying vec4 vCls; varying vec4 vMisc; varying vec4 vReg; varying vec4 vDist; varying vec3 vRest; varying vec3 vRestN; varying vec3 vPosD;
        ${GLSL_NOISE}${GLSL_DISPLACE}`)
      .replace('#include <begin_vertex>', `vec3 transformed = position + heartDisplace(position, normal, aReg.zw);
        vCls = aCls; vMisc = aMisc; vReg = aReg; vDist = aDist; vRest = position; vRestN = normal; vPosD = transformed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vCls; varying vec4 vMisc; varying vec4 vReg; varying vec4 vDist; varying vec3 vRest; varying vec3 vRestN; varying vec3 vPosD;
        uniform vec3 cMuscle, cMuscleWarm, cMuscleDeep, cAtria, cArtery, cVein, cFat, cCoronary, cInterior, cSSS, cElec, cHot, cShock, cHi, cCutIn;
        uniform float uWave, uFib, uShock, uNodes, uDim, uCutY, uTime; uniform vec4 uCutN;
        uniform vec4 uHiCh; uniform float uHiAll, uHiPatch; uniform vec4 uPatch;
        uniform vec3 uSA, uAV;
        uniform vec3 uCoreP[${FIB_CORES}], uCoreT[${FIB_CORES}], uCoreB[${FIB_CORES}];
        uniform vec4 uSeptumF;
        ${GLSL_NOISE}
        float band(float x, float w){ return exp(-x * x / (w * w)); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (dot(vPosD, uCutN.xyz) > uCutN.w && vRest.y > uCutY) discard;`)
      .replace('#include <map_fragment>', `
        float wAt = smoothstep(0.25, 0.7, vCls.x), wAr = smoothstep(0.3, 0.7, vCls.y), wVe = smoothstep(0.3, 0.7, vCls.z);
        float wFat = smoothstep(0.25, 0.7, vCls.w), wDark = smoothstep(0.3, 0.7, vMisc.z);
        float ao = vMisc.x, cav = vMisc.y;
        float n1 = vnoise(vRest * 3.0), n2 = vnoise(vRest * 9.0 + 4.0);
        vec3 muscle = mix(cMuscle, cMuscleWarm, smoothstep(0.25, 0.8, n1) * 0.8 + 0.25 * smoothstep(0.0, -0.8, cav));
        muscle = mix(muscle, cMuscleDeep, clamp(0.45 * smoothstep(0.15, 1.0, cav) + 0.6 * (1.0 - ao), 0.0, 1.0));
        muscle *= 0.96 + 0.07 * n2;
        vec3 col = muscle;
        col = mix(col, cAtria * (0.92 + 0.12 * n1), wAt);
        col = mix(col, mix(cCoronary, cAtria, vReg.x), wDark * (1.0 - wFat));
        col = mix(col, cFat * (0.9 + 0.12 * n1), wFat * 0.8);
        col = mix(col, cArtery * (0.95 + 0.1 * n1), wAr);
        col = mix(col, cVein * (0.95 + 0.1 * n1), wVe);
        col *= mix(1.0, ao, 0.45);
        if (!gl_FrontFacing) {
          float depth = smoothstep(0.0, 0.5, uCutN.w - dot(vRest, uCutN.xyz));
          col = cInterior * mix(0.9, 0.35, depth);
          // in front of the cut plane (seen past the wipe edge) the inside reads as solid cut muscle
          if (dot(vRest, uCutN.xyz) > uCutN.w) col = cCutIn * 0.75;
        }
        diffuseColor.rgb = col * (1.0 - 0.75 * uDim);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
        roughnessFactor = mix(roughnessFactor, 0.5, wFat); roughnessFactor = mix(roughnessFactor, 0.34, max(wVe, wAr));
        if (!gl_FrontFacing) roughnessFactor = 0.75;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat *= gl_FrontFacing ? (0.65 + 0.35 * ao) * (1.0 - 0.6 * wFat) : 0.0;`)
      .replace('#include <aomap_fragment>', `
        float ambientOcclusion = gl_FrontFacing ? mix(1.0, vMisc.x, 0.85) : 0.35;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_CLEARCOAT )
          clearcoatSpecularIndirect *= ambientOcclusion;
        #endif
        #if defined( USE_SHEEN )
          sheenSpecularIndirect *= ambientOcclusion;
        #endif
        reflectedLight.indirectSpecular *= ambientOcclusion;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gl_FrontFacing) {
          // faint satin micro-texture so the surface reads as tissue, not plastic (none on vessels)
          float hgt = (vnoise(vRest * 42.0) + 0.5 * vnoise(vRest * 95.0 + 3.0)) * 0.0005 * (1.0 - max(wVe, wAr));
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float dhx = dFdx(hgt), dhy = dFdy(hgt);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (gl_FrontFacing) {
          vec3 V = normalize(vViewPosition);
          float ndv = clamp(dot(normal, V), 0.0, 1.0);
          float fres = pow(1.0 - ndv, 2.5);
          // soft translucency: warm light bleeding at grazing angles, weaker on fat and vessels
          totalEmissiveRadiance += cSSS * fres * 0.28 * (1.0 - 0.6 * max(wFat, max(wVe, wAr))) * (1.0 - 0.7 * uDim);
          // a soft cool edge light so the silhouette always separates from the navy background
          totalEmissiveRadiance += vec3(0.32, 0.45, 0.95) * pow(1.0 - ndv, 5.0) * 0.35 * (1.0 - 0.7 * uDim);
          float rA = vReg.x, rV = vReg.y;
          float left = smoothstep(-0.03, 0.03, dot(vRest, uSeptumF.xyz) + uSeptumF.w);
          vec3 glow = vec3(0.0);
          // electrical wave
          if (uWave >= 0.0) {
            float pa = clamp(uWave / ${WAVE.atria[1].toFixed(3)}, 0.0, 1.0);
            float fa = pa * 1.08;
            float dA = vDist.x;
            float e = band(dA - fa, 0.055) * step(pa, 0.999) * 1.4 + step(dA, fa) * (0.07 + 0.24 * exp(-max(fa - dA, 0.0) * 2.5));
            float fade = 1.0 - smoothstep(${WAVE.fade[0].toFixed(3)}, 1.0, uWave);
            float atrFade = 1.0 - 0.75 * smoothstep(${WAVE.vent[0].toFixed(3)}, ${WAVE.vent[1].toFixed(3)}, uWave);
            glow += cElec * e * rA * atrFade * fade;
            float pv = clamp((uWave - ${WAVE.vent[0].toFixed(3)}) / ${(WAVE.vent[1] - WAVE.vent[0]).toFixed(3)}, 0.0, 1.0);
            float fv = pv * 1.08;
            float dV = vDist.y;
            float ev = band(dV - fv, 0.055) * step(0.001, pv) * step(pv, 0.999) * 1.5 + step(dV, fv) * step(0.001, pv) * (0.04 + 0.16 * exp(-max(fv - dV, 0.0) * 2.5));
            glow += cElec * ev * rV * fade;
            // AV node holds the signal
            float hold = smoothstep(${WAVE.av[0].toFixed(3)} - 0.03, ${WAVE.av[0].toFixed(3)}, uWave) * (1.0 - smoothstep(${WAVE.vent[0].toFixed(3)}, ${WAVE.vent[0].toFixed(3)} + 0.06, uWave));
            float dav = length(vRest - uAV);
            glow += cHot * band(dav, 0.07) * hold * (0.9 + 0.5 * sin(uTime * 14.0)) * 1.6;
            float sap = 1.0 - smoothstep(0.0, 0.08, uWave);
            glow += cHot * band(length(vRest - uSA), 0.06) * (sap + 0.15) * 1.4 * fade;
          }
          // nodes
          if (uNodes > 0.0) {
            float pulse = 0.75 + 0.25 * sin(uTime * 6.2832 * 1.1);
            glow += cElec * (band(length(vRest - uSA), 0.065) + band(length(vRest - uAV), 0.06)) * uNodes * pulse * 1.8;
          }
          // fibrillation spirals
          if (uFib > 0.0) {
            float f = 0.0, trail = 0.0;
            for (int i = 0; i < ${FIB_CORES}; i++) {
              vec3 cn = cross(uCoreT[i], uCoreB[i]);
              // flat projection around each core: keep it off the far side of the heart
              float facing = smoothstep(0.2, 0.6, dot(vRestN, cn));
              if (facing <= 0.0) continue;
              float fi = float(i);
              // each rotor wanders slowly across the wall
              vec2 drift = 0.16 * vec2(sin(uTime * (0.29 + 0.06 * fi) + fi * 2.1), sin(uTime * (0.21 + 0.05 * fi) + fi * 1.3 + 0.8));
              vec3 q = vRest - uCoreP[i];
              vec2 xy = vec2(dot(q, uCoreT[i]), dot(q, uCoreB[i])) - drift;
              float rho = length(xy);
              // brightest near the eye of each swirl, fading toward its rim
              float env = (1.0 - smoothstep(0.15, 0.29, rho)) * smoothstep(0.008, 0.03, rho) * mix(1.4, 0.6, rho / 0.29) * facing;
              if (env <= 0.0) continue;
              float sp = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
              // two thin arms (Archimedean spiral) spinning about the core and spreading outward
              float ph = 2.0 * sp * atan(xy.y, xy.x) + ${FIB_K.toFixed(1)} * rho - uTime * (7.0 + 0.8 * fi) + fi * 1.7;
              // u runs 0 -> 1 after a front passes; turn it into distances on the wall behind and ahead of the front
              float u = 1.0 - fract(ph / 6.28318);
              float gap = 6.28318 / sqrt(4.0 / (rho * rho) + ${(FIB_K * FIB_K).toFixed(1)});
              float behind = u * gap, ahead = gap - behind;
              float edge = smoothstep(0.0, 0.004, ahead);   // crisp, anti-aliased leading edge
              // a thin bright line with only a short glow behind it: any longer tail reads as a wash
              f = max(f, exp(-behind * behind / 0.00004) * edge * env);
              trail = max(trail, exp(-behind * behind / 0.00012) * edge * env);
            }
            glow += (cHot * f * 1.15 + cElec * trail * 0.06) * rV * uFib;
          }
          // highlight for labels
          float hi = uHiAll + (rA * mix(uHiCh.x, uHiCh.y, left)) + (rV * mix(uHiCh.z, uHiCh.w, left));
          float dp = length(vRest - uPatch.xyz);
          hi += uHiPatch * smoothstep(uPatch.w, uPatch.w * 0.45, dp);
          glow += cHi * clamp(hi, 0.0, 1.5) * (0.3 + 0.9 * fres);
          glow += cHi * uHiPatch * band(dp - uPatch.w * 0.92, 0.012) * 1.2;
          // defibrillator shock
          if (uShock > 0.0) {
            vec3 sq = vRest * 4.5 + vec3(0.0, uTime * 2.0, uTime * 1.3);
            float sn = (vnoise(sq) + 0.5 * vnoise(sq * 2.3 + 7.0)) / 1.5;
            float arcs = pow(1.0 - abs(sn * 2.0 - 1.0), 12.0);
            glow += uShock * (mix(cElec, cShock, 0.5) * (0.07 + 1.1 * fres) + cHot * arcs * 0.9) * mix(0.6, 1.0, rA + rV);
          }
          totalEmissiveRadiance += glow;
        }`);
  };
  return mat;
}

// ---------------------------------------------------------------------------- wiring tubes
function makeTubeMaterial(U, p0, p1) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uP0: { value: p0 }, uP1: { value: p1 } }, U),
    vertexShader: `attribute vec3 aCentre; attribute vec3 aSN; attribute vec2 aDef; attribute float aU;
      varying float vU; varying vec3 vRest; varying vec3 vPosD; varying vec3 vN; varying vec3 vV; varying float vNear;
      ${GLSL_NOISE}${GLSL_DISPLACE}
      void main(){
        vec3 d = heartDisplace(aCentre, aSN, aDef);
        vec3 p = position + d;
        vU = aU; vRest = aCentre; vPosD = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        // wiring on the far side of the heart glows more faintly, as if seen through the tissue
        vNear = clamp(0.62 + (mv.z - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z) * 1.3, 0.22, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uPaths, uGhost, uP0, uP1, uCutY, uDim; uniform vec4 uCutN; uniform vec3 cElec, cHot;
      varying float vU; varying vec3 vRest; varying vec3 vPosD; varying vec3 vN; varying vec3 vV; varying float vNear;
      void main(){
        if (dot(vPosD, uCutN.xyz) > uCutN.w && vRest.y > uCutY) discard;
        float head = (uPaths - uP0) / max(uP1 - uP0, 1e-4);
        float lit = step(vU, head) * step(0.0, uPaths);
        float after = clamp((uPaths - uP1) / 0.12, 0.0, 1.0);
        float core = pow(clamp(dot(vN, vV), 0.0, 1.0), 0.6);
        float tip = exp(-pow((head - vU) * 9.0, 2.0)) * step(vU, head) * (1.0 - after);
        vec3 c = cElec * (1.6 + 1.2 * core) * lit * (1.0 - 0.35 * after) + cHot * tip * 5.0 * lit;
        float a = max(lit, uGhost * 0.45);
        c += cElec * uGhost * 0.5 * (1.0 - lit);
        if (a <= 0.001) discard;
        gl_FragColor = vec4(c * vNear * (1.0 - 0.6 * uDim), 1.0) * a;
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
  });
}

function buildTube(points, normals, defs, radius = 0.0075, sides = 8) {
  // points: array of Vector3 (already lifted off the surface), centres: surface points
  const n = points.length;
  const P = new Float32Array(n * sides * 3), N = new Float32Array(n * sides * 3);
  const C = new Float32Array(n * sides * 3), SN = new Float32Array(n * sides * 3), D = new Float32Array(n * sides * 2), Uu = new Float32Array(n * sides);
  let total = 0; const acc = [0];
  for (let i = 1; i < n; i++) { total += points[i].distanceTo(points[i - 1]); acc.push(total); }
  const tan = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tan.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    up.copy(normals[i]).addScaledVector(tan, -normals[i].dot(tan)).normalize();
    side.crossVectors(tan, up);
    const taper = Math.min(1, acc[i] / 0.03, (total - acc[i]) / 0.03) * 0.6 + 0.4;
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2, j = i * sides + k;
      const nx = Math.cos(a) * side.x + Math.sin(a) * up.x, ny = Math.cos(a) * side.y + Math.sin(a) * up.y, nz = Math.cos(a) * side.z + Math.sin(a) * up.z;
      P[3 * j] = points[i].x + nx * radius * taper; P[3 * j + 1] = points[i].y + ny * radius * taper; P[3 * j + 2] = points[i].z + nz * radius * taper;
      N[3 * j] = nx; N[3 * j + 1] = ny; N[3 * j + 2] = nz;
      C[3 * j] = points[i].x; C[3 * j + 1] = points[i].y; C[3 * j + 2] = points[i].z;
      SN[3 * j] = normals[i].x; SN[3 * j + 1] = normals[i].y; SN[3 * j + 2] = normals[i].z;
      D[2 * j] = defs[i][0]; D[2 * j + 1] = defs[i][1];
      Uu[j] = total > 0 ? acc[i] / total : 0;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('aCentre', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aSN', new THREE.BufferAttribute(SN, 3));
  g.setAttribute('aDef', new THREE.BufferAttribute(D, 2));
  g.setAttribute('aU', new THREE.BufferAttribute(Uu, 1));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------- cutaway cap
// Slices the rest mesh at z = zc, rasterises the section and stores a signed distance (inside > 0)
// to the outline. The cap shader opens the four chamber cavities in it.
function sliceSection(pos, tris, zc, box) {
  const segs = [];
  for (let t = 0; t < tris.length; t += 3) {
    const ids = [tris[t], tris[t + 1], tris[t + 2]];
    const d = ids.map(i => pos[3 * i + 2] - zc);
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3], da = d[k], db = d[(k + 1) % 3];
      if ((da < 0) !== (db < 0)) {
        const s = da / (da - db);
        pts.push([pos[3 * a] + s * (pos[3 * b] - pos[3 * a]), pos[3 * a + 1] + s * (pos[3 * b + 1] - pos[3 * a + 1])]);
      }
    }
    if (pts.length === 2) segs.push(pts);
  }
  const [x0, x1, y0, y1] = box, RES = 0.0025;
  const W = Math.ceil((x1 - x0) / RES), H = Math.ceil((y1 - y0) / RES);
  // even-odd scanline fill
  const inside = new Uint8Array(W * H);
  const rows = Array.from({ length: H }, () => []);
  for (const [a, b] of segs) {
    const ya = (a[1] - y0) / RES - 0.5, yb = (b[1] - y0) / RES - 0.5;
    const lo = Math.ceil(Math.min(ya, yb)), hi = Math.floor(Math.max(ya, yb) - 1e-9);
    for (let r = Math.max(0, lo); r <= Math.min(H - 1, hi); r++) {
      const s = (r - ya) / (yb - ya);
      rows[r].push((a[0] + s * (b[0] - a[0]) - x0) / RES - 0.5);
    }
  }
  for (let r = 0; r < H; r++) {
    const xs = rows[r].sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let c = Math.max(0, Math.ceil(xs[k])); c <= Math.min(W - 1, Math.floor(xs[k + 1])); c++) inside[r * W + c] = 1;
    }
  }
  const din = edt(inside, W, H, 1), dout = edt(inside, W, H, 0);
  const sd = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) sd[i] = (inside[i] ? Math.sqrt(din[i]) - 0.5 : 0.5 - Math.sqrt(dout[i])) * RES;
  // a light blur takes the pixel staircase out of the outline, which the bevel lighting would otherwise show
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < W) { a += sd[y * W + xx]; n++; } }
      tmp[y * W + x] = a / n;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < H) { a += tmp[yy * W + x]; n++; } }
      sd[y * W + x] = a / n;
    }
  }
  return { W, H, sd, segs };
}

// squared euclidean distance from each pixel with mask == want to the nearest pixel with mask != want
function edt(mask, W, H, want) {
  const INF = 1e20, f = new Float64Array(Math.max(W, H)), d = new Float64Array(W * H);
  const v = new Int32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1), tmp = new Float64Array(Math.max(W, H));
  const pass = (n) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; tmp[q] = (q - p) * (q - p) + f[p]; }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = mask[y * W + x] === want ? INF : 0;
    pass(H); for (let y = 0; y < H; y++) d[y * W + x] = tmp[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = d[y * W + x];
    pass(W); for (let x = 0; x < W; x++) d[y * W + x] = tmp[x];
  }
  return d;
}

// Chambers are ellipsoids centred on the cut plane, given in plane coordinates (u across, v up the plane).
// Each: [u, v, half-width, half-length, depth behind the plane, tilt in degrees (long axis leans toward the apex)].
// Order matches fill/blood/highlight: ra, la, rv, lv.
const CHAMBERS = [
  [-0.27, -0.07, 0.19, 0.2, 0.13, 0],
  [0.17, 0.0, 0.19, 0.13, 0.15, 0],
  [-0.13, -0.46, 0.27, 0.19, 0.12, 15],
  [0.37, -0.43, 0.16, 0.29, 0.2, 30],
];
const GLSL_CHAMBER = /* glsl */`
uniform vec4 uChA[4], uChB[4];
// cavity scale: atria shrink a little with their kick, ventricles a lot (the wall visibly thickens)
float chamberK(int i){ return i < 2 ? 1.0 - 0.16 * uSqA : 1.0 - 0.3 * uSqV; }
`;

function makeCapMaterial(U) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.5, side: THREE.DoubleSide });
  mat.alphaToCoverage = true;   // smooth cavity edges under MSAA
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aDef; attribute vec2 aPl; varying vec3 vRest; varying vec2 vSec; varying vec2 vPl;
        uniform vec4 uSecBox, uCutN;
        ${GLSL_NOISE}${GLSL_DISPLACE}`)
      .replace('#include <begin_vertex>', `vec3 dd = heartDisplace(position, uCutN.xyz, aDef);
        vec3 transformed = position + dd - uCutN.xyz * dot(dd, uCutN.xyz);   // stays flat on the cut plane
        vRest = position; vPl = aPl; vSec = (aPl - uSecBox.xy) / uSecBox.zw;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest; varying vec2 vSec; varying vec2 vPl; float capBevel = 0.0;
        uniform sampler2D uSection; uniform float uCutY, uCutOn, uDim, uSqA, uSqV;
        uniform vec3 cCut, cMuscleDeep, cBloodRA, cBloodLA, cBloodRV, cBloodLV, cHi;
        uniform vec4 uFill, uHiCh; uniform float uHiAll;
        ${GLSL_NOISE}${GLSL_CHAMBER}`)
      .replace('#include <map_fragment>', `
        if (uCutOn < 0.5) discard;
        // below the wipe line the cap stays solid: it is only seen through the gap at the wipe edge
        float closed = step(vRest.y, uCutY);
        float dOut = texture2D(uSection, vSec).r;
        float aaO = fwidth(dOut);
        if (dOut <= -aaO) discard;
        vec2 p = vPl;
        // nearest chamber (signed distance, negative inside its cavity)
        float best = 1e3; int ci = 0;
        for (int i = 0; i < 4; i++) {
          float k = chamberK(i);
          vec2 d = p - uChA[i].xy;
          vec2 q = vec2(dot(d, uChB[i].xy), dot(d, vec2(-uChB[i].y, uChB[i].x)));
          float e = (length(q / (uChA[i].zw * k)) - 1.0) * min(uChA[i].z, uChA[i].w) * k;
          if (e < best) { best = e; ci = i; }
        }
        // great vessels above the heart and the vena cava stub below it are cut tubes: thin wall, open lumen
        float tube = max(smoothstep(0.17, 0.24, p.y), step(p.y, -0.58) * step(p.x, -0.22));
        float hole = mix(max(-best, mix(-1.0, dOut - 0.024, tube)), -1.0, closed);
        float aa = fwidth(hole) * 1.2;
        float inCav = smoothstep(-aa, aa, hole);
        vec4 sel = ci == 0 ? vec4(1,0,0,0) : ci == 1 ? vec4(0,1,0,0) : ci == 2 ? vec4(0,0,1,0) : vec4(0,0,0,1);
        float k = chamberK(ci);
        float ext = length(vec2(uChA[ci].z * uChB[ci].y, uChA[ci].w * uChB[ci].x)) * k;
        float y0 = uChA[ci].y - ext, fillAmt = dot(sel, uFill);
        float level = y0 + 2.0 * ext * fillAmt;
        float filled = fillAmt > 0.001 && best < 0.0 ? smoothstep(level + 0.004, level - 0.004, p.y) : 0.0;
        // open cavity: let the 3D chamber behind show through
        diffuseColor.a = smoothstep(-aaO, aaO, dOut) * (1.0 - inCav * (1.0 - filled));
        vec3 blood = sel.x * cBloodRA + sel.y * cBloodLA + sel.z * cBloodRV + sel.w * cBloodLV;
        float fib = vnoise(vec3(p * vec2(30.0, 9.0), 0.0)) * 0.65 + vnoise(vec3(p * 70.0, 2.0)) * 0.35;
        float edge = min(dOut, -hole);                       // distance to the nearest cut edge inside the wall
        float inner = smoothstep(0.0, 0.035, edge);
        vec3 wallCol = mix(cMuscleDeep, cCut, 0.45 + 0.55 * inner) * (0.86 + 0.24 * fib);
        // thin glossy linings: epicardium outside, endocardium at the cavity
        wallCol = mix(wallCol, vec3(0.95, 0.62, 0.6), 0.45 * (1.0 - smoothstep(0.0, 0.006, -hole)) * step(-hole, 0.006));
        // liquid face: brighter at the surface, deeper below, a soft shadow along the cavity rim
        float depthIn = clamp((level - p.y) / max(2.0 * ext, 0.05), 0.0, 1.0);
        vec3 bl = blood * mix(0.85, 0.5, depthIn) * mix(0.5, 1.0, smoothstep(0.0, 0.035, hole));
        bl += vec3(1.0, 0.9, 0.9) * 0.3 * smoothstep(level - 0.014, level, p.y);
        vec3 col = mix(wallCol * 0.85, bl, inCav * filled);
        capBevel = 0.012 * smoothstep(0.0, 0.025, edge) * (1.0 - inCav);
        float hi = uHiAll + dot(sel, uHiCh);
        diffuseColor.rgb = col * (1.0 - 0.75 * uDim);
        vec3 capGlow = cHi * hi * 0.3 * (1.0 - smoothstep(0.0, 0.04, best)) * (1.0 - inCav);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // rounded cut edges: tilt the normal along the bevel so the walls catch light like real slices
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float dhx = dFdx(capBevel), dhy = dFdy(capBevel);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += capGlow;`);
  };
  return mat;
}

// The inside of one chamber: the back half of its ellipsoid, seen from inside through the hole in the cap.
function makeChamberMaterial(U, idx) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.22, side: THREE.BackSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uIdx: { value: idx } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aDef; uniform int uIdx; uniform vec4 uCutN; uniform vec3 uPlU, uPlV;
        varying vec3 vS; varying vec2 vPc; varying float vPlaneY;
        ${GLSL_NOISE}${GLSL_DISPLACE}${GLSL_CHAMBER}`)
      .replace('#include <begin_vertex>', `
        float k = chamberK(uIdx);
        vec4 A = uChA[uIdx], B = uChB[uIdx];
        vec2 l = position.xy * A.zw * k;
        vec2 pc = A.xy + l.x * B.xy + l.y * vec2(-B.y, B.x);
        float w = min(position.z, 0.02) * B.z * k;
        vec3 rest = uPlU * pc.x + uPlV * pc.y + uCutN.xyz * (w + ${CUT.off.toFixed(4)});
        vec3 transformed = rest + heartDisplace(rest, uCutN.xyz, aDef);
        vS = position; vPc = pc; vPlaneY = dot(uPlU * pc.x + uPlV * pc.y + uCutN.xyz * ${CUT.off.toFixed(4)}, vec3(0.0, 1.0, 0.0));`)
      .replace('#include <beginnormal_vertex>', `
        vec4 A0 = uChA[uIdx], B0 = uChB[uIdx];
        vec3 ln = normal / vec3(A0.z, A0.w, B0.z);          // ellipsoid normal in chamber space
        vec2 np = ln.x * B0.xy + ln.y * vec2(-B0.y, B0.x);
        vec3 objectNormal = normalize(uPlU * np.x + uPlV * np.y + uCutN.xyz * ln.z);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vS; varying vec2 vPc; varying float vPlaneY;
        uniform float uCutY, uCutOn, uDim, uSqA, uSqV; uniform int uIdx; uniform vec4 uFill, uHiCh; uniform float uHiAll;
        uniform vec3 cChamber, cMuscleDeep, cBloodRA, cBloodLA, cBloodRV, cBloodLV, cHi;
        ${GLSL_NOISE}${GLSL_CHAMBER}`)
      .replace('#include <map_fragment>', `
        if (uCutOn < 0.5 || vS.z > 0.0 || vPlaneY < uCutY) discard;
        vec4 uSel = vec4(equal(ivec4(uIdx), ivec4(0, 1, 2, 3)));
        float depth = clamp(-vS.z, 0.0, 1.0);
        // soft trabeculae: long gentle ridges down the chamber
        float ridge = vnoise(vec3(vPc * vec2(10.0, 3.0), vS.z * 2.0 + float(uIdx) * 3.1));
        vec3 col = mix(cChamber, cMuscleDeep, 0.15 + 0.5 * depth) * (0.85 + 0.3 * ridge);
        float k = chamberK(uIdx);
        vec4 A = uChA[uIdx], B = uChB[uIdx];
        float ext = length(vec2(A.z * B.y, A.w * B.x)) * k;
        float fillAmt = dot(uSel, uFill);
        float level = A.y - ext + 2.0 * ext * fillAmt;
        vec3 blood = uSel.x * cBloodRA + uSel.y * cBloodLA + uSel.z * cBloodRV + uSel.w * cBloodLV;
        if (fillAmt > 0.001 && vPc.y < level) col = blood * mix(0.8, 0.45, depth);
        diffuseColor.rgb = col * (1.0 - 0.75 * uDim);
        vec3 chGlow = cHi * (uHiAll + dot(uSel, uHiCh)) * 0.35 * (1.0 - 0.6 * depth);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += chGlow;`)
      .replace('#include <aomap_fragment>', `
        // the walls shade the deep end of the cavity
        float ambientOcclusion = mix(1.0, 0.35, depth);
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        reflectedLight.directDiffuse *= mix(1.0, 0.55, depth);
        reflectedLight.indirectSpecular *= ambientOcclusion;`);
  };
  return mat;
}

// ---------------------------------------------------------------------------- loading + processing
export async function loadHeart(renderer, { url = '../assets/heart.glb' } = {}) {
  const T0 = performance.now();
  const gltf = await new GLTFLoader().loadAsync(url);
  const src = gltf.scene.getObjectByProperty('isMesh', true);
  const g0 = src.geometry;
  const Praw = g0.attributes.position.array, UV = g0.attributes.uv.array, nsoup = g0.attributes.position.count;
  const idx0 = g0.index ? g0.index.array : Uint32Array.from({ length: nsoup }, (_, i) => i);

  // canonical frame: the GLB's anterior is +X, the patient's right is +Z. Turn it so front = +Z.
  const { nv, remap } = weld(Praw, nsoup);
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nsoup; i++) { const j = remap[i]; pos[3 * j] = -Praw[3 * i + 2]; pos[3 * j + 1] = Praw[3 * i + 1]; pos[3 * j + 2] = Praw[3 * i]; }
  const bb = new THREE.Box3().setFromArray(pos), ctr = bb.getCenter(new THREE.Vector3()), k = 2 / (bb.max.y - bb.min.y);
  for (let i = 0; i < nv; i++) { pos[3 * i] = (pos[3 * i] - ctr.x) * k; pos[3 * i + 1] = (pos[3 * i + 1] - ctr.y) * k; pos[3 * i + 2] = (pos[3 * i + 2] - ctr.z) * k; }
  const triList = [];
  for (let t = 0; t < idx0.length; t += 3) {
    const a = remap[idx0[t]], b = remap[idx0[t + 1]], c = remap[idx0[t + 2]];
    if (a !== b && b !== c && a !== c) triList.push(a, b, c);
  }
  const tris = Uint32Array.from(triList);
  const adj = buildAdj(nv, tris);

  // classes from the baseColor + roughness textures, averaged over each vertex's UV copies
  const base = imageDataOf(src.material.map), mr = imageDataOf(src.material.roughnessMap);
  const cls = new Float32Array(nv * 5), cnt = new Float32Array(nv), tmp = new Float32Array(5);
  const TW = base.width, TH = base.height, MW = mr.width, MH = mr.height;
  for (let i = 0; i < nsoup; i++) {
    const j = remap[i], u = UV[2 * i], v = UV[2 * i + 1];
    for (const [ox, oy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const x = Math.min(TW - 1, Math.max(0, Math.floor(u * TW) + ox)), y = Math.min(TH - 1, Math.max(0, Math.floor(v * TH) + oy));
      const o = (y * TW + x) * 4;
      const mx = Math.min(MW - 1, Math.floor(x * MW / TW)), my = Math.min(MH - 1, Math.floor(y * MH / TH));
      classify(base.data[o] / 255, base.data[o + 1] / 255, base.data[o + 2] / 255, mr.data[(my * MW + mx) * 4 + 1], tmp);
      for (let c = 0; c < 5; c++) cls[5 * j + c] += tmp[c];
      cnt[j]++;
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let c = 0; c < 5; c++) cls[5 * j + c] /= cnt[j] || 1;
    // the texture has a few rough red patches low on the ventricles; real arteries are all up top
    cls[5 * j + 1] *= sstep(-0.3, -0.05, pos[3 * j + 1]);
  }

  // soften sculpted bumps (Taubin smoothing keeps the volume), then normals
  for (let it = 0; it < 8; it++) { smoothField(pos, 3, adj, 1, 0.5); smoothField(pos, 3, adj, 1, -0.53); }
  // the fat in the grooves is sculpted as lumpy blobs: melt it down much further than the muscle
  {
    const fw = new Float32Array(nv);
    for (let j = 0; j < nv; j++) fw[j] = sstep(0.1, 0.5, cls[5 * j + 3] + 0.5 * cls[5 * j + 4]);
    smoothField(fw, 1, adj, 4);
    const before = new Float32Array(pos.length);
    for (let it = 0; it < 16; it++) {
      before.set(pos);
      smoothField(pos, 3, adj, 1, 0.5); smoothField(pos, 3, adj, 1, -0.53);
      for (let j = 0; j < nv; j++) for (let c = 0; c < 3; c++) pos[3 * j + c] = before[3 * j + c] + (pos[3 * j + c] - before[3 * j + c]) * fw[j];
    }
  }
  // the underside of the ventricles has small sculpted lumps that break the lower silhouette: melt them too.
  // The x ramp spares the inferior vena cava stub, which hangs lower on the viewer's left.
  {
    const bw = new Float32Array(nv);
    for (let j = 0; j < nv; j++) bw[j] = sstep(-0.48, -0.7, pos[3 * j + 1]) * sstep(-0.3, -0.12, pos[3 * j]);
    smoothField(bw, 1, adj, 4);
    const before = new Float32Array(pos.length);
    for (let it = 0; it < 40; it++) {
      before.set(pos);
      smoothField(pos, 3, adj, 1, 0.6);
      for (let j = 0; j < nv; j++) for (let c = 0; c < 3; c++) pos[3 * j + c] = before[3 * j + c] + (pos[3 * j + c] - before[3 * j + c]) * bw[j];
    }
  }
  const nrm = vertexNormals(pos, tris, nv);

  smoothField(cls, 5, adj, 2);

  // regions: atria vs ventricles vs vessels. Fat and dark coronary bits join their nearest chamber muscle.
  const isA = j => cls[5 * j] > 0.5;
  const isVes = j => cls[5 * j + 1] + cls[5 * j + 2] > 0.5;
  const isM = j => !isA(j) && !isVes(j) && cls[5 * j + 3] < 0.3 && cls[5 * j + 4] < 0.3;
  const seedsA = [], seedsM = [];
  for (let j = 0; j < nv; j++) { if (isA(j)) seedsA.push([j, 0]); else if (isM(j)) seedsM.push([j, 0]); }
  const dToA = dijkstra(pos, adj, seedsA).dist, dToM = dijkstra(pos, adj, seedsM).dist;
  const reg = new Float32Array(nv * 3);
  for (let j = 0; j < nv; j++) {
    if (isVes(j)) reg[3 * j + 2] = 1;
    else if (dToA[j] < dToM[j]) reg[3 * j] = 1; else reg[3 * j + 1] = 1;
  }
  const regDef = reg.slice();
  smoothField(reg, 3, adj, 3);
  smoothField(regDef, 3, adj, 40);

  // concavity: how far the surface sits below a smoothed copy of itself (grooves > 0)
  const sm = pos.slice(); smoothField(sm, 3, adj, 20);
  const cav = new Float32Array(nv);
  for (let j = 0; j < nv; j++) {
    const c = (sm[3 * j] - pos[3 * j]) * nrm[3 * j] + (sm[3 * j + 1] - pos[3 * j + 1]) * nrm[3 * j + 1] + (sm[3 * j + 2] - pos[3 * j + 2]) * nrm[3 * j + 2];
    cav[j] = Math.max(-1, Math.min(1, c / 0.012));
  }

  const ao = bakeAO(renderer, pos, nrm, tris, nv);
  smoothField(ao, 1, adj, 2);

  // ---------------------------------------------------------------- anchors
  const V3 = i => new THREE.Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  const N3 = i => new THREE.Vector3(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]);
  const ray = (from, a, b) => {
    const o = { front: [a, b, 5], back: [a, b, -5], left: [-5, b, a], right: [5, b, a], bottom: [a, -5, b] }[from];
    const d = { front: [0, 0, -1], back: [0, 0, 1], left: [1, 0, 0], right: [-1, 0, 0], bottom: [0, 1, 0] }[from];
    return pickVertex(pos, nrm, nv, o, d, 0.02);
  };
  // picked from labelled debug renders of the front, back and side views (heart space x, y or z, y)
  const A = {
    sa: ray('front', -0.36, 0.25),
    av: ray('front', -0.12, 0.06),
    septumTop: ray('front', 0.22, 0.05),
    septumMid: ray('front', 0.33, -0.4),
    septumBack: ray('back', -0.08, -0.25),
    crux: ray('back', 0.0, 0.05),
    rvWall: ray('front', -0.02, -0.32),
    lvWall: ray('front', 0.5, -0.32),
    lvLat: ray('right', -0.1, -0.35),
    chestHit: ray('front', 0.46, -0.28),
    rvBase: ray('front', -0.3, -0.45),
    lvBase: ray('right', -0.05, 0.02),
    laAur: ray('front', 0.36, 0.17),
  };
  // apex: the lowest point along the tilted long axis
  let apexI = 0, best = -Infinity;
  for (let j = 0; j < nv; j++) { const s = 0.36 * pos[3 * j] - 0.93 * pos[3 * j + 1]; if (s > best && reg[3 * j + 1] > 0.5) { best = s; apexI = j; } }
  A.apex = apexI;

  const anchors = {}, anchorNormals = {};
  for (const [kk, i] of Object.entries(A)) { anchors[kk] = V3(Math.max(0, i)); anchorNormals[kk] = N3(Math.max(0, i)); }

  // septum plane through the front groove, the back groove and the apex; positive = left heart
  const septumPlane = new THREE.Plane().setFromCoplanarPoints(anchors.septumTop, anchors.septumBack, anchors.apex);
  if (septumPlane.distanceToPoint(anchors.lvLat) < 0) septumPlane.negate();
  const side = j => septumPlane.normal.x * pos[3 * j] + septumPlane.normal.y * pos[3 * j + 1] + septumPlane.normal.z * pos[3 * j + 2] + septumPlane.constant;

  // chamber centres and long axis from the region weights
  const cent = { ra: [0, 0, 0, 0], la: [0, 0, 0, 0], rv: [0, 0, 0, 0], lv: [0, 0, 0, 0], base: [0, 0, 0, 0] };
  for (let j = 0; j < nv; j++) {
    const l = side(j) > 0;
    const key = reg[3 * j] > 0.6 ? (l ? 'la' : 'ra') : reg[3 * j + 1] > 0.6 ? (l ? 'lv' : 'rv') : null;
    if (key) { const c = cent[key]; c[0] += pos[3 * j]; c[1] += pos[3 * j + 1]; c[2] += pos[3 * j + 2]; c[3]++; }
    if (reg[3 * j + 1] > 0.3 && reg[3 * j] > 0.3) { const c = cent.base; c[0] += pos[3 * j]; c[1] += pos[3 * j + 1]; c[2] += pos[3 * j + 2]; c[3]++; }
  }
  for (const [kk, c] of Object.entries(cent)) anchors[kk] = new THREE.Vector3(c[0] / c[3], c[1] / c[3], c[2] / c[3]);
  const baseC = anchors.base; delete anchors.base;
  const axis = baseC.clone().sub(anchors.apex).normalize();
  const baseH = baseC.clone().sub(anchors.apex).dot(axis);

  // the AV node sits at the crux of the four chambers, on the cutaway plane
  anchors.avCore = planeToHeart(0.02, -0.17);
  anchors.atriaTop = anchors.ra.clone().lerp(anchors.la, 0.5).setY(Math.max(anchors.ra.y, anchors.la.y));
  anchors.ventMid = anchors.rv.clone().lerp(anchors.lv, 0.5);

  // ---------------------------------------------------------------- electrical fields
  const rA = j => reg[3 * j], rV = j => reg[3 * j + 1], rVes = j => reg[3 * j + 2];
  const costAtria = new Float32Array(nv), costVent = new Float32Array(nv), costGroove = new Float32Array(nv);
  for (let j = 0; j < nv; j++) {
    costAtria[j] = rV(j) > 0.6 ? Infinity : 1 + 3 * rVes(j);
    costVent[j] = rA(j) > 0.6 ? Infinity : 1 + 6 * rVes(j);
    costGroove[j] = (1 + 8 * rVes(j)) / (1 + 2.5 * cls[5 * j + 3] + 3 * Math.max(0, cav[j]));
  }
  // Bachmann's bundle carries the signal to the left atrium almost at once, so seed it there too
  const dA = dijkstra(pos, adj, [[A.sa, 0], [A.laAur, 0.45]], costAtria).dist;
  // ventricles: fast wiring reaches the septum and apex first, then the walls fill in upward
  const gA = dijkstra(pos, adj, [[A.av, 0]], costGroove);
  const septFront = tracePath(dijkstra(pos, adj, [[A.septumTop, 0]], costGroove).prev, A.apex);
  const septBack = tracePath(dijkstra(pos, adj, [[A.crux, 0]], costGroove).prev, A.apex);
  const seedsV = [];
  for (const path of [septFront, septBack]) path.forEach((j, i) => seedsV.push([j, 0.25 * (1 - i / (path.length - 1)) * 0.6]));
  const dV = dijkstra(pos, adj, seedsV, costVent).dist;
  const pct = (arr, w, q) => { const v = []; for (let j = 0; j < nv; j++) if (w(j) && isFinite(arr[j])) v.push(arr[j]); v.sort((a, b) => a - b); return v[Math.floor(q * (v.length - 1))] || 1; };
  const nA = pct(dA, j => rA(j) > 0.5, 0.86), nV = pct(dV, j => rV(j) > 0.5, 0.95);

  // fibrillation rotor cores: three on the front of the ventricles, one on the side, two behind
  const backWall = ray('back', 0.25, -0.45);
  const cores = [ray('front', -0.12, -0.3), ray('front', 0.42, -0.18), ray('front', 0.2, -0.6), A.lvLat, backWall, ray('back', -0.22, -0.3)]
    .map(i => Math.max(0, i));

  // ---------------------------------------------------------------- geometry
  const aCls = new Float32Array(nv * 4), aMisc = new Float32Array(nv * 4), aReg = new Float32Array(nv * 4), aDist = new Float32Array(nv * 4);
  for (let j = 0; j < nv; j++) {
    aCls.set([cls[5 * j], cls[5 * j + 1], cls[5 * j + 2], cls[5 * j + 3]], 4 * j);
    aMisc.set([ao[j], cav[j], cls[5 * j + 4], 0], 4 * j);
    aReg.set([reg[3 * j], reg[3 * j + 1], regDef[3 * j], regDef[3 * j + 1]], 4 * j);
    // the few far-off, hidden patches (behind vessels) all light up as the front finishes
    aDist.set([isFinite(dA[j]) ? Math.min(1, dA[j] / nA) : 1, isFinite(dV[j]) ? Math.min(1, dV[j] / nV) : 1, 0, 0], 4 * j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  for (const [name, arr] of Object.entries({ aCls, aMisc, aReg, aDist })) geo.setAttribute(name, new THREE.BufferAttribute(arr, 4));
  geo.setIndex(new THREE.BufferAttribute(tris, 1));
  geo.computeBoundingSphere();

  // ---------------------------------------------------------------- uniforms
  const col = c => new THREE.Color(c);
  const P = HEART_PALETTE;
  const coreFrames = cores.map(c => {
    const n = N3(c), t = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), b = new THREE.Vector3().crossVectors(n, t);
    return { p: V3(c), t, b };
  });
  const U = {
    uSqA: { value: 0 }, uSqV: { value: 0 }, uQuiver: { value: 0 }, uTime: { value: 0 },
    uApex: { value: anchors.apex.clone() }, uAxis: { value: axis }, uBaseH: { value: baseH },
    uRAc: { value: anchors.ra.clone() }, uLAc: { value: anchors.la.clone() },
    uSeptum: { value: new THREE.Vector4(septumPlane.normal.x, septumPlane.normal.y, septumPlane.normal.z, septumPlane.constant) },
    uSeptumF: { value: new THREE.Vector4(septumPlane.normal.x, septumPlane.normal.y, septumPlane.normal.z, septumPlane.constant) },
    cMuscle: { value: col(P.muscle) }, cMuscleWarm: { value: col(P.muscleWarm) }, cMuscleDeep: { value: col(P.muscleDeep) }, cAtria: { value: col(P.atria) },
    cArtery: { value: col(P.artery) }, cVein: { value: col(P.vein) }, cFat: { value: col(P.fat) }, cCoronary: { value: col(P.coronary) },
    cInterior: { value: col(P.interior) }, cSSS: { value: col(P.sss) }, cElec: { value: col(P.electric).multiplyScalar(2.2) },
    cHot: { value: col(P.hot).multiplyScalar(2.5) }, cShock: { value: col(P.shockCol) }, cHi: { value: col('#ffd27a') },
    cCut: { value: col(P.cut) }, cCutIn: { value: col(P.cut) }, cChamber: { value: col(P.chamber) },
    uWave: { value: -1 }, uFib: { value: 0 }, uShock: { value: 0 }, uNodes: { value: 0 }, uDim: { value: 0 },
    uCutN: { value: new THREE.Vector4(CUT.n.x, CUT.n.y, CUT.n.z, 99) }, uPlU: { value: CUT.u }, uPlV: { value: CUT.v }, uCutY: { value: 99 }, uCutOn: { value: 0 },
    uHiCh: { value: new THREE.Vector4() }, uHiAll: { value: 0 }, uHiPatch: { value: 0 }, uPatch: { value: new THREE.Vector4(0, 0, 0, 0.22) },
    uSA: { value: anchors.sa.clone() }, uAV: { value: anchors.av.clone() },
    uCoreP: { value: coreFrames.map(f => f.p) }, uCoreT: { value: coreFrames.map(f => f.t) }, uCoreB: { value: coreFrames.map(f => f.b) },
    uPaths: { value: -1 }, uGhost: { value: 0 },
    cBloodRA: { value: col(P.blood) }, cBloodLA: { value: col(P.blood) }, cBloodRV: { value: col(P.blood) }, cBloodLV: { value: col(P.blood) },
    uFill: { value: new THREE.Vector4() },
  };

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, makeHeartMaterial(U));
  group.add(mesh);

  // ---------------------------------------------------------------- conduction tubes
  const lifted = (path, off = 0.012) => {
    // smooth the vertex chain, then lift it off the surface (off < 0 sinks it into the wall)
    const raw = path.map(V3), ns = path.map(N3);
    const pull = off < 0 ? 0.015 : 0.08;   // wiring inside the wall need not hug every groove
    for (let it = 0; it < (off < 0 ? 160 : 40); it++) for (let i = 1; i < raw.length - 1; i++) { raw[i].lerpVectors(raw[i - 1], raw[i + 1], 0.5).lerp(V3(path[i]), pull); }
    const step = 0.012, pts = [], nn = [], defs = [];
    let carry = 0;
    for (let i = 0; i < raw.length; i++) {
      if (i > 0) carry += raw[i].distanceTo(raw[i - 1]);
      if (i === 0 || i === raw.length - 1 || carry >= step) {
        carry = 0;
        pts.push(raw[i].clone().addScaledVector(ns[i], off)); nn.push(ns[i]);
        defs.push([regDef[3 * path[i]], regDef[3 * path[i] + 1]]);
      }
    }
    return [pts, nn, defs];
  };
  const route = (a, b, cost) => tracePath(dijkstra(pos, adj, [[a, 0]], cost).prev, b);
  const costWire = new Float32Array(nv);
  for (let j = 0; j < nv; j++) costWire[j] = costGroove[j] * (rVes(j) > 0.5 ? 6 : 1);
  // The real wiring runs inside the heart, so the tubes sit in the walls and the septum and are drawn
  // X-ray style on top of the surface (pair paths with dim for the clearest read).
  const sn = septumPlane.normal;
  const spline = (ctrl, def) => {
    const c = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const n = Math.max(2, Math.ceil(c.getLength() / 0.012));
    const pts = c.getSpacedPoints(n);
    return [pts, pts.map(() => sn), pts.map(() => def)];
  };
  const inside = (i, d) => V3(i).addScaledVector(N3(i), -d);
  const avIn = inside(A.av, 0.03), apexIn = inside(A.apex, 0.05);
  const longDown = anchors.apex.clone().sub(baseC).normalize();
  // the His bundle leaves the AV node heading down toward the apex and settles into the septum
  const hisTop = anchors.avCore.clone().addScaledVector(longDown, 0.1);
  hisTop.lerp(septumPlane.projectPoint(hisTop, new THREE.Vector3()), 0.5);
  const branch = side => spline([hisTop, hisTop.clone().addScaledVector(longDown, 0.08).addScaledVector(sn, 0.02 * side),
    hisTop.clone().lerp(apexIn, 0.55).addScaledVector(sn, 0.04 * side), apexIn.clone().addScaledVector(sn, 0.02 * side)], [0, 1]);
  const W0 = WAVE.atria, W1 = WAVE.av, W2 = WAVE.vent;
  const wires = [
    [lifted(route(A.sa, A.av, costWire), -0.015), W0[0], W0[1]],                                  // internodal pathway in the RA wall
    [spline([avIn, anchors.avCore, hisTop], [0.5, 0.5]), W1[0], W1[1]], // slow crossing of the AV node
    [branch(1), W2[0], W2[0] + 0.1],                                                               // left bundle branch down the septum
    [branch(-1), W2[0], W2[0] + 0.1],                                                              // right bundle branch
    [lifted(route(A.apex, A.lvLat, costWire).concat(route(A.lvLat, A.lvBase, costWire).slice(1)), -0.03), W2[0] + 0.09, W2[1] - 0.02], // Purkinje up the LV
    [lifted(route(A.apex, A.lvWall, costWire), -0.03), W2[0] + 0.09, W2[1] - 0.06],
    [lifted(route(A.apex, A.rvWall, costWire).concat(route(A.rvWall, A.rvBase, costWire).slice(1)), -0.03), W2[0] + 0.09, W2[1] - 0.03],
    [lifted(route(A.apex, backWall, costWire), -0.03), W2[0] + 0.09, W2[1] - 0.05],
  ];
  const tubes = new THREE.Group();
  for (const [[pts, nn, defs], p0, p1] of wires) {
    if (pts.length < 2) continue;
    const m = new THREE.Mesh(buildTube(pts, nn, defs), makeTubeMaterial(U, p0, p1));
    m.frustumCulled = false; m.renderOrder = 2;
    tubes.add(m);
  }
  group.add(tubes);

  // ---------------------------------------------------------------- cutaway: cap + chamber interiors
  const pf = new Float32Array(nv * 3);   // positions in cut-plane coordinates (u, v, w)
  for (let j = 0; j < nv; j++) {
    const x = pos[3 * j], y = pos[3 * j + 1], z = pos[3 * j + 2];
    pf[3 * j] = x; pf[3 * j + 1] = y * CUT.v.y + z * CUT.v.z; pf[3 * j + 2] = y * CUT.n.y + z * CUT.n.z - CUT.off;
  }
  const SB = [-0.8, 0.8, -1.05, 1.05];
  const sec = sliceSection(pf, tris, 0, SB);
  const half = new Uint16Array(sec.W * sec.H);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(sec.sd[i]);
  const secTex = new THREE.DataTexture(half, sec.W, sec.H, THREE.RedFormat, THREE.HalfFloatType);
  secTex.minFilter = secTex.magFilter = THREE.LinearFilter; secTex.needsUpdate = true;
  // deformation weights on the plane: nearest mesh vertex close to the cut, blurred on the cap grid so the
  // cut face and the chamber rims move smoothly and identically
  const near = [];
  for (let j = 0; j < nv; j++) if (Math.abs(pf[3 * j + 2]) < 0.06) near.push(j);
  const GX = 48, GY = 64;
  const capGeo = new THREE.PlaneGeometry(SB[1] - SB[0], SB[3] - SB[2], GX, GY);
  const cp = capGeo.attributes.position, capDef = new Float32Array(cp.count * 2);
  for (let i = 0; i < cp.count; i++) {
    let bi = -1, bd = Infinity;
    for (const j of near) { const d = (pf[3 * j] - cp.getX(i)) ** 2 + (pf[3 * j + 1] - cp.getY(i)) ** 2; if (d < bd) { bd = d; bi = j; } }
    capDef[2 * i] = bi >= 0 ? regDef[3 * bi] : 0; capDef[2 * i + 1] = bi >= 0 ? regDef[3 * bi + 1] : 0;
  }
  {
    // PlaneGeometry rows run top to bottom: vertex (ix, iy) is iy * (GX + 1) + ix
    const W1 = GX + 1, tmpD = new Float32Array(capDef.length);
    for (let pass = 0; pass < 6; pass++) {
      for (let iy = 0; iy <= GY; iy++) for (let ix = 0; ix <= GX; ix++) for (let c = 0; c < 2; c++) {
        let a = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = ix + dx, y = iy + dy;
          if (x >= 0 && x <= GX && y >= 0 && y <= GY) { a += capDef[2 * (y * W1 + x) + c]; n++; }
        }
        tmpD[2 * (iy * W1 + ix) + c] = a / n;
      }
      capDef.set(tmpD);
    }
  }
  const defAt = (u, v, out, o) => {
    const fx = Math.min(GX, Math.max(0, (u - SB[0]) / (SB[1] - SB[0]) * GX)), fy = Math.min(GY, Math.max(0, (SB[3] - v) / (SB[3] - SB[2]) * GY));
    const x0 = Math.min(GX - 1, Math.floor(fx)), y0 = Math.min(GY - 1, Math.floor(fy)), tx = fx - x0, ty = fy - y0, W1 = GX + 1;
    for (let c = 0; c < 2; c++) {
      const g = (x, y) => capDef[2 * (y * W1 + x) + c];
      out[o + c] = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
    }
  };
  {
    const pl = new Float32Array(cp.count * 2);
    for (let i = 0; i < cp.count; i++) { pl[2 * i] = cp.getX(i); pl[2 * i + 1] = cp.getY(i); }
    capGeo.setAttribute('aDef', new THREE.BufferAttribute(capDef, 2));
    capGeo.setAttribute('aPl', new THREE.BufferAttribute(pl, 2));
    capGeo.applyMatrix4(new THREE.Matrix4().makeBasis(CUT.u, CUT.v, CUT.n).setPosition(CUT.n.clone().multiplyScalar(CUT.off)));
  }
  U.uSection = { value: secTex };
  U.uSecBox = { value: new THREE.Vector4(SB[0], SB[2], SB[1] - SB[0], SB[3] - SB[2]) };
  U.uChA = { value: CHAMBERS.map(c => new THREE.Vector4(c[0], c[1], c[2], c[3])) };
  U.uChB = { value: CHAMBERS.map((c, i) => new THREE.Vector4(Math.cos(c[5] * Math.PI / 180), Math.sin(c[5] * Math.PI / 180), c[4], i < 2 ? 0 : 1)) };
  const cap = new THREE.Mesh(capGeo, makeCapMaterial(U));
  cap.frustumCulled = false; cap.visible = false;
  group.add(cap);
  const chambers = new THREE.Group();
  CHAMBERS.forEach((c, i) => {
    const g = new THREE.SphereGeometry(1, 48, 32);
    const cp = g.attributes.position, def = new Float32Array(cp.count * 2);
    const cs = Math.cos(c[5] * Math.PI / 180), sn = Math.sin(c[5] * Math.PI / 180);
    for (let k = 0; k < cp.count; k++) {
      const lx = cp.getX(k) * c[2], ly = cp.getY(k) * c[3];
      defAt(c[0] + lx * cs - ly * sn, c[1] + lx * sn + ly * cs, def, 2 * k);
    }
    g.setAttribute('aDef', new THREE.BufferAttribute(def, 2));
    const m = new THREE.Mesh(g, makeChamberMaterial(U, i));
    m.frustumCulled = false; chambers.add(m);
  });
  chambers.visible = false;
  group.add(chambers);
  // label points: the middle of each open cavity on the cut face
  ['cutRa', 'cutLa', 'cutRv', 'cutLv'].forEach((k, i) => { anchors[k] = planeToHeart(CHAMBERS[i][0], CHAMBERS[i][1]); });

  const buildMs = Math.round(performance.now() - T0);

  // ---------------------------------------------------------------- per-frame state
  const tmpV = new THREE.Vector3();
  const heart = {
    group, mesh, cap, chambers, tubes, anchors, anchorNormals, uniforms: U, buildMs,
    regions: { septumPlane, cutPlane: new THREE.Plane(CUT.n.clone(), -CUT.off), longAxis: { apex: anchors.apex.clone(), base: baseC } },
    world(name, out = new THREE.Vector3()) { group.updateMatrixWorld(); return out.copy(anchors[name]).applyMatrix4(group.matrixWorld); },
    screen(name, camera, w = 1920, h = 1080) {
      const p = this.world(name, tmpV).clone();
      let facing = 1;
      if (anchorNormals[name]) {
        const n = anchorNormals[name].clone().transformDirection(group.matrixWorld);
        facing = n.dot(camera.position.clone().sub(p).normalize());
      }
      p.project(camera);
      return { x: (p.x * 0.5 + 0.5) * w, y: (0.5 - p.y * 0.5) * h, facing };
    },
    update(s = {}) {
      U.uTime.value = s.t || 0;
      U.uSqA.value = s.squeezeA || 0; U.uSqV.value = s.squeezeV || 0; U.uQuiver.value = s.quiver || 0;
      U.uWave.value = s.wave == null ? -1 : s.wave;
      U.uPaths.value = s.paths == null ? -1 : s.paths; U.uGhost.value = s.pathsGhost || 0;
      tubes.visible = s.paths != null || (s.pathsGhost || 0) > 0;
      U.uNodes.value = s.nodes || 0; U.uFib.value = s.fib || 0; U.uShock.value = s.shock || 0; U.uDim.value = s.dim || 0;
      const h = s.highlight || {};
      U.uHiCh.value.set((h.atria || 0) + (h.ra || 0), (h.atria || 0) + (h.la || 0), (h.ventricles || 0) + (h.rv || 0), (h.ventricles || 0) + (h.lv || 0));
      U.uHiAll.value = h.all || 0; U.uHiPatch.value = h.patch || 0;
      U.cHi.value.set(s.highlightColor || '#ffc65c');
      const pa = s.patch || {};
      const at = pa.at == null ? anchors.chestHit : (typeof pa.at === 'string' ? anchors[pa.at] : pa.at);
      U.uPatch.value.set(at.x, at.y, at.z, pa.radius || 0.22);
      const cut = s.cutaway || 0;
      U.uCutOn.value = cut > 0 ? 1 : 0;
      U.uCutN.value.w = cut > 0 ? CUT.off : 99;
      U.uCutY.value = 1.12 - 2.3 * cut;
      cap.visible = chambers.visible = cut > 0;
      const f = s.fill || {};
      U.uFill.value.set(f.ra || 0, f.la || 0, f.rv || 0, f.lv || 0);
      const b = s.blood || {};
      U.cBloodRA.value.set(b.ra || P.blood); U.cBloodLA.value.set(b.la || P.blood); U.cBloodRV.value.set(b.rv || P.blood); U.cBloodLV.value.set(b.lv || P.blood);
    },
    dispose() { geo.dispose(); mesh.material.dispose(); capGeo.dispose(); cap.material.dispose(); secTex.dispose(); chambers.children.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); tubes.children.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); },
  };
  heart.update();
  return heart;
}

// ---------------------------------------------------------------------------- lighting + stage
// Inverse of three's ACES fit, so the background lands on lib.js's exact navy after tone mapping.
function preToneMapped(hex) {
  const t = new THREE.Color(hex);
  const out = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
  const inp = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777);
  const a = new THREE.Vector3(t.r, t.g, t.b).applyMatrix3(out.invert());
  const rrtInv = y => {
    const A = 1 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(0.000090537 + 0.238081 * y);
    return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  };
  const v = new THREE.Vector3(rrtInv(a.x), rrtInv(a.y), rrtInv(a.z)).applyMatrix3(inp.invert()).multiplyScalar(0.6);
  return new THREE.Color(Math.max(0, v.x), Math.max(0, v.y), Math.max(0, v.z));
}

export function addHeartLights(scene, renderer) {
  // environment: a dark studio with a big warm softbox, a cool rim strip each side and a faint top light
  const env = new THREE.Scene();
  env.background = new THREE.Color(0.012, 0.016, 0.04);
  const box = (w, h, color, intensity, p, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...p); m.lookAt(...look); env.add(m);
  };
  box(4, 3, '#fff1e2', 6, [-3, 3.5, 4.5], [0, 0, 0]);
  box(3, 2.5, '#ffd9c2', 0.6, [4.5, -0.5, 3], [0, 0, 0]);
  box(1, 6, '#9cc2ff', 2.6, [-5, 1, -3.5], [0, 0, 0]);
  box(1, 6, '#b4c8ff', 2.2, [5, 1.5, -3], [0, 0, 0]);
  box(5, 2, '#ffffff', 1.2, [0, 6, 0], [0, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  const add = (color, intensity, p) => { const l = new THREE.DirectionalLight(color, intensity); l.position.set(...p); scene.add(l); return l; };
  return {
    key: add('#fff0e4', 2.8, [-4, 3.4, 2.6]),
    fill: add('#ffb8a0', 0.35, [3.5, -1.2, 2.5]),
    rimL: add('#7fb2ff', 1.8, [-3.5, 1.5, -3.5]),
    rimR: add('#9fb8ff', 2.5, [4.2, 1.6, -2.2]),
    top: add('#ffffff', 0.5, [0, 5, 0.5]),
  };
}

export function createStage({ width = 1920, height = 1080, bloom = 0.6, vignette = 0.38, particles = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 100);
  camera.position.set(0, 0, 4.8); camera.lookAt(0, -0.05, 0);
  const lights = addHeartLights(scene, renderer);

  // background: lib.js's radial navy gradient, pre-compensated for tone mapping
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { c0: { value: preToneMapped('#0a1230') }, c1: { value: preToneMapped('#162456') }, uAspect: { value: width / height } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }',
    fragmentShader: `uniform vec3 c0, c1; uniform float uAspect; varying vec2 vUv;
      void main(){ vec2 p = (vUv - vec2(0.5, 0.55)) * vec2(uAspect, 1.0) * 1080.0;
        float r = length(p); float t = clamp((r - 100.0) / (1920.0 * 0.75 - 100.0), 0.0, 1.0);
        gl_FragColor = vec4(mix(c1, c0, t), 1.0); }`,
    depthWrite: false, depthTest: false,
  }));
  bg.frustumCulled = false; bg.renderOrder = -1000; scene.add(bg);

  // soft out-of-focus motes far behind the heart
  let motes = null;
  if (particles) {
    const N = 70, P = new Float32Array(N * 3), S = new Float32Array(N), Ph = new Float32Array(N);
    const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < N; i++) {
      P[3 * i] = (rnd(i) - 0.5) * 16; P[3 * i + 1] = (rnd(i + 99) - 0.5) * 9; P[3 * i + 2] = -4 - rnd(i + 7) * 8;
      S[i] = 30 + rnd(i + 3) * 90; Ph[i] = rnd(i + 11) * 6.28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aS', new THREE.BufferAttribute(S, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(Ph, 1));
    motes = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `attribute float aS, aPh; uniform float uT; varying float vA; varying float vTint;
        void main(){ vec3 p = position + vec3(sin(uT * 0.07 + aPh) * 0.6, sin(uT * 0.05 + aPh * 1.3) * 0.4 + uT * 0.02, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aS * 6.0 / -mv.z; vA = 0.05 + 0.05 * sin(aPh * 3.0); vTint = fract(aPh); }`,
      fragmentShader: `varying float vA; varying float vTint; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.75, r) * (0.7 + 0.3 * smoothstep(0.6, 0.95, r)) * vA;
          vec3 c = mix(vec3(0.45, 0.6, 1.0), vec3(1.0, 0.55, 0.6), step(0.7, vTint));
          gl_FragColor = vec4(c * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    motes.frustumCulled = false; motes.renderOrder = -999;
    scene.add(motes);
  }

  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), bloom, 0.5, 1.6);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const vig = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmt: { value: vignette }, uAspect: { value: width / height } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt, uAspect; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float v = smoothstep(0.35, 1.15, length(p)); c.rgb *= 1.0 - uAmt * v; gl_FragColor = c; }`,
  });
  composer.addPass(vig);

  return {
    renderer, scene, camera, composer, lights, bloomPass, canvas: renderer.domElement,
    render(t = 0) { if (motes) motes.material.uniforms.uT.value = t; composer.render(); },
    orbit(yawDeg, pitchDeg, dist, target = new THREE.Vector3(0, -0.05, 0)) {
      const y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
      camera.position.set(target.x + Math.sin(y) * Math.cos(p) * dist, target.y + Math.sin(p) * dist, target.z + Math.cos(y) * Math.cos(p) * dist);
      camera.lookAt(target);
    },
  };
}
