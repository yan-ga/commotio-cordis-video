// shared.js: reusable drawing tools and the tissue simulation for every scene.
// Load after lib.js:  <script src="lib.js"></script><script src="shared.js"></script>
// Everything is deterministic (rand(i), never Math.random or Date) and every
// draw function is a pure function of its arguments, so frames render in any order.
//
// ============================================================================
// API REFERENCE
// ============================================================================
// Extra colours added to lib's C: C.half (amber, half unlocked), C.firing (= C.spark),
// C.insulator (grey insulating layer), C.ecg (monitor green).
// Cell "state" everywhere = { fire: 0..1 flash, lock: 0..1 } where lock 1 = locked (red),
// 0.5 = half unlocked (amber), 0 = ready (blue). Strings 'ready' | 'firing' | 'locked' | 'half'
// are accepted wherever a state is.
//
// ICONS
//   padlock(ctx, x, y, size, open, o)      open: 0 closed .. 1 open, or 'closed'|'half'|'open'.
//                                           o: { alpha, color (body colour, default by state) }
//   stamp(ctx, x, y, size, kind, o)        kind 'tick' | 'cross'. o: { alpha, pop 0..1 (scale-in), color, label }
//   clockIcon(ctx, x, y, r, frac, o)       countdown clock, frac = remaining 0..1. o: { alpha, color, label }
//   timerBar(ctx, x, y, w, h, frac, o)     horizontal duration bar filled to frac.
//                                           o: { alpha, color, label (above left), value (text after the bar), track }
//                                           Compare durations by giving both bars the same w and frac = d / dMax.
//   lockColour(lock) -> 'rgb(...)'          blue -> amber -> red for lock 0 -> 0.5 -> 1.
//   pillText(ctx, s, x, y, size, color, align, alpha)   label on a dark pill (readable over drawings)
//
// HEART
//   heartFull(ctx, cx, cy, s, o) -> geo     Front view, four-chamber cutaway, ~640 x 780 px at s = 1
//                                           (local box x -330..340, y -440..340; origin near the AV groove).
//     o.alpha, o.labels (0..1 chamber labels), o.cutaway (0..1, default 1)
//     o.squeezeA, o.squeezeV                 0..1 squeeze of atria / ventricles
//     o.quiver, o.time                       0..1 ventricular quiver (VF), needs o.time (s) to animate
//     o.tint  { ra, la, rv, lv: colour | { color, alpha } }   recolour a chamber's blood
//     o.glow  { ra, la, rv, lv: 0..1 }        soft glow on a chamber
//     o.nodes 0..1                           show SA and AV nodes (labels with o.nodeLabels 0..1)
//     o.wiring 0..1                          faint conduction pathway (SA, internodal, AV, His, branches, Purkinje)
//     o.wave  number | null                  electrical wave progress:
//                                             0 .. 0.33  golden front spreads over both atria from the SA node
//                                             0.30 .. 0.60 held at the AV node (pulsing)
//                                             0.60 .. 1   His bundle -> branches -> Purkinje -> walls light up
//                                             1 .. 1.25 everything fades back. HEART_WAVE has these boundaries.
//     o.insulator 0..1                       grey insulating ring between atria and ventricles, gap at the AV node
//     o.pattern(ctx, box)                    paint the ventricles (ctx is in heart-local units and clipped to the
//                                             ventricles; box = {x,y,w,h} local). e.g. drawTissue(ctx, snap, box.x, ...).
//     o.patternArea 'walls' | 'all'          'walls' keeps the blood cavities drawn on top (default)
//   geo: screen points [x, y]: sa, av, his, ra, la, rv, lv, apex, svc, ivc, aortaArch, aortaDown, pulm,
//        lungR (viewer's left), lungL (viewer's right), pvein, toBody, fromBody, plus
//        ventBox {x,y,w,h} (screen), s, toScreen(lx, ly), ventPath (Path2D in screen coords).
//
// CELL SCHEMATICS
//   rowLayout(x, y, n, o)                   centred row. o: { w=150, h=88, gap=50 } -> layout
//   sheetLayout(x, y, cols, rows, o)        brick-offset sheet, centred. o: { w, h, gap, vgap }
//   ringLayout(cx, cy, n, rx, ry, o)        cells round an ellipse (re-entry track), o: { w, h, start angle a0 }
//     layout = { cells: [{x, y, w, h, angle}], links: [[i, j]], neighbours(i) -> [j...] }
//     rowLayout's neighbours include -1 (left edge) and n (right edge) for "knock into nothing".
//     edgePoint(layout, i, toward) gives a point just past a cell's edge.
//   drawCells(ctx, layout, states, o)       states: array or fn(i). o: { alpha, padlocks (true|false|'auto'),
//                                             tunnels (default true), lockSize, labels: fn(i) -> string }
//   cellBrick(ctx, x, y, w, h, state, o)    one cell. o: { alpha, angle, padlock, lockSize, label }
//   tunnel(ctx, a, b, o)                    gap-junction tube between two cells
//   knock(ctx, a, b, p, outcome, o)         pulse from cell a into cell b (b may be a point for 'edge').
//                                             p 0..KNOCK_TRAVEL travels, KNOCK_TRAVEL..1 shows the outcome:
//                                             'fires' burst ring | 'ignored' thud ring + bounce + fade |
//                                             'edge' fizzles out into nothing | 'travel' just travels.
//                                             o: { size, label (true = default word, or string), alpha }
//   cellWave(o) -> wave                      discrete knock-by-knock wave (precomputed, exact):
//     o: { layout | neighbours(i), n, starts: [{ cell, time }], step (s per hop), lock (s locked),
//          recover (s ramp red->amber->blue), flash (s), jitter (0..0.5 per-cell lock spread), seed,
//          fired: fn(i) -> time the cell last fired before the start (for a pre-locked block), or null
//          accept (max lock a knock can fire, default 0.05: only blue cells fire),
//          until (s, default 60) }
//     wave.at(t) -> { cells: [{ fire, lock, state, fireCount, lastFire }], knocks: [{ from, to, p, outcome }] }
//     Every firing cell knocks every neighbour. The knock back into the cell that just fired it arrives
//     while that cell is locked, so it is 'ignored': that is why the wave only goes forwards.
//     Knocks into the row edge (-1 or n) are 'edge'. wave.fireTimes[i] lists each cell's firing times.
//
// ECG
//   ecgValue(phase)            one normal beat, phase 0..1 (P 0.12, QRS 0.26, T peak 0.52). ~ -0.3..1.2
//   ECG_BEAT                   { p, qrs, tStart, tPeak, tEnd, vulnStart, vulnEnd } as beat phases
//   ecgNormal(t, bpm=72)        normal rhythm at time t (s)
//   ecgVF(t, seed=1)            chaotic ventricular fibrillation squiggle
//   ecgFlat(t)                  flatline with a faint wander
//   drawECG(ctx, x, y, w, h, fn, t, span, o)   monitor panel showing fn over `span` seconds.
//     o: { mode 'sweep' | 'scroll', panel 'green' | 'navy', color, alpha, lo=-0.6, hi=1.5, t0 (no trace before),
//          bands: [{ t0, t1, period?, color, label }] highlighted time bands (period repeats them),
//          title, cursor (true), lineWidth }
//     returns { xOf(tt) (screen x of signal time tt, or null), yOf(v) }
//
// TISSUE SIMULATION (Barkley excitable medium with the Bar-Eiswirth recovery term)
//   createTissue({ w=160, h=100, params, mask(x,y,nx,ny), obstacle(x,y,nx,ny) }) -> sim
//     params: { a=0.84, b=0.07, eps=0.06, hs=0.2, dt=0.009 }  (eps 0.06 = stable spiral, 0.09 = breakup)
//     sim.u, sim.v (Float32Array), sim.type (0 tissue, 1 outside mask, 2 obstacle)
//     sim.setState(fn(x,y,nx,ny) -> [u, v]), sim.setRates(fn -> recovery-rate multiplier, 1 = normal)
//     sim.stimulate(region, strength=1)    region: fn(x,y,nx,ny) | {x,y,r} (normalised, r as a fraction of height)
//                                           | {x0,y0,x1,y1} normalised. Locked cells ignore it.
//     sim.globalShock(strength=1)           1: every cell is forced to fire at once -> whole sheet flashes, all red,
//                                           then all recover together. < 1: only cells whose threshold is below
//                                           strength fire (half-unlocked cells need more than ready ones).
//     sim.setParams(p), sim.step(n), sim.snapshot() -> Uint8Array, sim.cell(x, y) -> { u, v }
//   Snapshot byte per cell: 0..63 ready, 64..127 half unlocked, 128..191 locked, 192..255 firing.
//   tissueCategory(byte) -> 'ready' | 'half' | 'locked' | 'firing'
//   recordTissue({ w, h, params, mask, obstacle, rates, init(sim), frames, stepsPerFrame, fps=30, events })
//     events: [{ frame | when(sim, f), type: 'stim' | 'shock' | 'params' | 'rates' | 'call', ... }]
//       stim { region, strength }, shock { strength }, params { params }, rates { fn }, call { fn(sim, f) }
//       a `when` event fires on the first frame its test is true; its frame is stored in ev.firedAt.
//     -> rec { w, h, fps, frames: [snap], stats: [{ ready, half, locked, firing, fronts }], at(t), frame(f),
//              sample(t, nx, ny) -> byte, events }
//     snap = { w, h, data: Uint8Array, type }
//   drawTissue(ctx, snap, x, y, w, h, o)    o: { alpha, radius=22, glow=true, border=true, clip: Path2D | fn(ctx),
//                                             bricks (px brick texture size, 0 = none), bg, dim (0..1 grey-out),
//                                             soft (default true: slight blur of the cell grid) }
//   tissueLegend(ctx, x, y, o)              colour key (ready, half, locked, firing). o: { alpha, size, vertical }
//
// TISSUE PRESETS (30 fps, cached per options; each returns a rec with rec.moments = frame indices).
// Measured with default options; moments are computed from the recording, so read rec.moments in scenes.
// Build cost in Chrome: planar ~0.5 s, patchwork ~0.2 s, spiral / fibrillation ~1.1 s, shock ~1.4 s.
//   tissuePlanar({ w=80, h=50, frames=240, stimFrame=12, from='left' | 'top' })
//     A normal wave sweeps across and dies at the far edge. Cells stay locked ~2.4x longer than the wave
//     takes to cross (storyboard: 0.1 s vs 0.25 s), so the sheet is all red when the wave dies, then all blue.
//     moments: stim 12, reachFar 49 (crossing ~1.2 s), allLocked 49, waveGone 57, allReady 141.
//     The first-fired edge stays locked until frame ~101.
//   tissuePatchwork({ w=80, h=50, frames=300, stimFrame=10, seed=3 })
//     Wave from the top fires everything, then cells unlock unevenly (fired-first unlock a little earlier,
//     plus natural fast and slow patches): blotchy red / amber / blue.
//     moments: stim 10, allLocked 48, patchwork 95 (best red + amber + blue mix, good ~85..110), allReady 151
//   tissueSpiral({ w=160, h=100, frames=900, s1Frame=10, from='left' | 'top', pacing: { from, every } })
//     S1 normal wave, then the blow (S2) over a region that straddles the back of the S1 wave: locked on
//     one side, unlocked on the other. The S2 wave can only escape into unlocked tissue, its free end curls
//     round, and a single spiral forms and keeps rotating for the whole recording (41 frames = 1.37 s a lap).
//     S2 fires automatically when the S1 tail is in place. Optional pacing knocks from the S1 edge fizzle out
//     against the spiral's locked cells ("takes over").
//     moments (left): s1 10, s2 86, spiralFormed 125, firstLap 156, period 41, pacing [frames]
//     moments (top):  s1 10, s2 67, spiralFormed 106, firstLap 138, period 41
//   tissueFibrillation({ ...spiral options, breakFrame=330, seed=5 })
//     As tissueSpiral, then at breakFrame the tissue turns breakup-prone (eps 0.09, finer scale) and gets a
//     few slow-recovering "dead end" patches: the spiral shatters into several chaotic spirals, which persist.
//     moments: s1 10, s2 86, spiralFormed 125, firstLap 156, breakup 330, chaos 409 (>= 4 separate fronts)
//   tissueShock({ w=160, h=100, frames=600, shockFrame=150, seed=5, sinus: { first, every } })
//     Starts already fibrillating (warmed up off camera). At shockFrame every cell fires at once (whole sheet
//     flashes), all go red, every spiral dies, the sheet recovers uniformly to blue, then optional clean
//     pacemaker waves from the left edge, the first `first` frames after allReady, then every `every` frames.
//     moments: shock 150, allLocked 150, allReady 212, sinus [232, 307, 382, ...] with { first: 20, every: 75 }
//   rec.stats[f] = { ready, half, locked, firing (fractions), fronts (separate firing fronts) } for custom cues.
//   Spiral, fibrillation and shock are tuned for 160 x 100: a much smaller sheet may not fit a spiral.
//   Draw any of them with drawTissue(ctx, rec.at(t - start), x, y, w, h) (keep the 1.6 aspect ratio).
// ============================================================================

Object.assign(C, { half: '#ffa53c', firing: C.spark, insulator: '#aab3c8', ecg: '#5cf08f' });
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- colour utils
const _RGB = { ready: [79, 168, 255], half: [255, 165, 60], locked: [255, 84, 102], spark: [255, 230, 128], white: [255, 255, 255], black: [0, 0, 0] };
const mixRGB = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];
const rgbStr = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
// Short transitions with plateaus, so a cell is clearly blue, amber or red and never a muddy blend for long.
const _step = (a, b, x) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };
function lockRGB(lock) {
  lock = clamp(lock);
  return lock < 0.5 ? mixRGB(_RGB.ready, _RGB.half, _step(0.1, 0.3, lock)) : mixRGB(_RGB.half, _RGB.locked, _step(0.62, 0.85, lock));
}
const lockColour = lock => rgbStr(lockRGB(lock));
const STATE_OF = { ready: { fire: 0, lock: 0 }, firing: { fire: 1, lock: 1 }, locked: { fire: 0, lock: 1 }, half: { fire: 0, lock: 0.5 } };
const cellState = s => (typeof s === 'string' ? STATE_OF[s] : s || STATE_OF.ready);
const stateName = st => (st.fire > 0.3 ? 'firing' : st.lock > 0.6 ? 'locked' : st.lock > 0.05 ? 'half' : 'ready');

// ---------------------------------------------------------------- icons
function padlock(ctx, x, y, size, open = 0, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  if (typeof open === 'string') open = { closed: 0, half: 0.5, open: 1 }[open];
  open = clamp(open);
  const bw = size * 0.78, bh = size * 0.6, by = y - bh * 0.15;
  const sr = size * 0.24, st = size * 0.1;
  const lift = size * 0.26 * easeOut(open);
  ctx.save();
  ctx.globalAlpha *= alpha;
  // Shackle: lifts out of the body, then swings open about its right leg.
  ctx.save();
  ctx.translate(x + sr, by - lift);
  ctx.rotate(-0.5 * clamp((open - 0.6) / 0.4));
  ctx.translate(-sr, 0);
  ctx.strokeStyle = '#e9eef8'; ctx.lineWidth = st; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(-sr, bh * 0.1); ctx.lineTo(-sr, -sr * 0.9); ctx.arc(0, -sr * 0.9, sr, Math.PI, 0); ctx.lineTo(sr, bh * 0.1); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = o.color || lockColour(1 - open);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1.5, size * 0.04);
  roundRect(ctx, x - bw / 2, by, bw, bh, size * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, x - bw / 2 + size * 0.06, by + size * 0.05, bw - size * 0.12, bh * 0.25, size * 0.06); ctx.fill();
  ctx.fillStyle = 'rgba(20,10,30,0.75)';
  ctx.beginPath(); ctx.arc(x, by + bh * 0.48, size * 0.07, 0, TAU); ctx.fill();
  ctx.fillRect(x - size * 0.03, by + bh * 0.48, size * 0.06, bh * 0.28);
  ctx.restore();
}

function stamp(ctx, x, y, size, kind = 'tick', o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const pop = o.pop ?? 1;
  const k = pop >= 1 ? 1 : 1.4 - 0.4 * easeOut(pop);
  const col = o.color || (kind === 'tick' ? C.ca : C.locked);
  ctx.save();
  ctx.globalAlpha *= alpha * clamp(pop * 3);
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = rgbStr([10, 18, 48], 0.85); ctx.strokeStyle = col; ctx.lineWidth = size * 0.09;
  ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = size * 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'tick') { ctx.moveTo(-size * 0.2, 0); ctx.lineTo(-size * 0.05, size * 0.16); ctx.lineTo(size * 0.22, -size * 0.16); }
  else { const d = size * 0.17; ctx.moveTo(-d, -d); ctx.lineTo(d, d); ctx.moveTo(d, -d); ctx.lineTo(-d, d); }
  ctx.stroke();
  ctx.restore();
  if (o.label) text(ctx, o.label, x + size * 0.7, y, size * 0.5, C.text, 'left', 700, alpha * clamp(pop * 2));
}

function clockIcon(ctx, x, y, r, frac, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const col = o.color || C.locked;
  frac = clamp(frac);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = rgbStr([10, 18, 48], 0.9);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = col; ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.86, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.85;
  }
  ctx.strokeStyle = '#e9eef8'; ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#e9eef8'; ctx.fillRect(x - r * 0.18, y - r * 1.32, r * 0.36, r * 0.2);
  ctx.lineWidth = r * 0.06;
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); ctx.stroke();
  }
  const ha = -Math.PI / 2 + TAU * frac;
  ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ha) * r * 0.7, y + Math.sin(ha) * r * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.1, 0, TAU); ctx.fill();
  ctx.restore();
  if (o.label) text(ctx, o.label, x, y + r * 1.55, r * 0.55, C.text, 'center', 700, alpha);
}

function timerBar(ctx, x, y, w, h, frac, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const col = o.color || C.locked;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = o.track || 'rgba(255,255,255,0.08)';
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  const fw = Math.max(0, w * clamp(frac));
  if (fw > 0) {
    ctx.save(); roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
    const g = ctx.createLinearGradient(x, 0, x + fw, 0);
    g.addColorStop(0, rgbStr(mixRGB(hexRGB(col), _RGB.black, 0.25))); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 16;
    roundRect(ctx, x, y, fw, h, h / 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  if (o.label) text(ctx, o.label, x, y - h * 0.5 - 16, Math.max(22, h * 0.7), C.text, 'left', 700, alpha);
  if (o.value) text(ctx, o.value, x + fw + 18, y + h / 2, Math.max(22, h * 0.75), col, 'left', 800, alpha);
}
function hexRGB(c) {
  if (Array.isArray(c)) return c;
  if (c[0] === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
}

// Text on a translucent dark pill, readable on top of busy drawings.
function pillText(ctx, s, x, y, size, color = C.text, align = 'center', alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(s).width + size * 0.8, h = size * 1.45;
  const x0 = align === 'left' ? x - size * 0.4 : align === 'right' ? x - w + size * 0.4 : x - w / 2;
  ctx.fillStyle = 'rgba(8,14,40,0.72)'; roundRect(ctx, x0, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.restore();
  text(ctx, s, x, y, size, color, align, 700, alpha);
}

// ---------------------------------------------------------------- heart
const HEART_WAVE = { atriaEnd: 0.33, avStart: 0.3, avEnd: 0.6, ventEnd: 1, fadeEnd: 1.25 };
let _HG = null;
// Heart geometry in local units, built once (Path2D needs a browser).
function heartGeometry() {
  if (_HG) return _HG;
  const P = f => { const p = new Path2D(); f(p); return p; };
  const g = {};
  g.atria = P(p => {
    p.moveTo(-246, -22);
    p.bezierCurveTo(-305, -110, -262, -246, -150, -246);
    p.bezierCurveTo(-90, -246, -40, -214, -5, -196);
    p.bezierCurveTo(50, -236, 200, -258, 252, -178);
    p.bezierCurveTo(284, -128, 276, -86, 258, -58);
    p.quadraticCurveTo(10, -18, -246, -22);
  });
  g.vent = P(p => {
    p.moveTo(-238, -36);
    p.bezierCurveTo(-262, 92, -128, 252, 92, 338);
    p.bezierCurveTo(206, 276, 288, 120, 258, -72);
    p.quadraticCurveTo(10, -34, -238, -36);
  });
  g.raCav = P(p => p.ellipse(-142, -126, 84, 70, -0.15, 0, TAU));
  g.laCav = P(p => p.ellipse(152, -146, 72, 54, 0.12, 0, TAU));
  g.rvCav = P(p => {
    p.moveTo(-202, -22);
    p.quadraticCurveTo(-112, -40, -40, -34);
    p.bezierCurveTo(-30, 60, -22, 160, 22, 246);
    p.bezierCurveTo(-90, 196, -204, 104, -202, -22);
  });
  g.lvCav = P(p => {
    p.moveTo(44, -46);
    p.quadraticCurveTo(116, -62, 186, -56);
    p.bezierCurveTo(198, 60, 166, 196, 106, 256);
    p.bezierCurveTo(62, 200, 36, 84, 44, -46);
  });
  // AV groove (top edge of the ventricles), sampled for the insulating ring.
  g.groove = s => { const a = [258, -72], c = [10, -34], b = [-238, -36]; const m = 1 - s; return [m * m * a[0] + 2 * m * s * c[0] + s * s * b[0], m * m * a[1] + 2 * m * s * c[1] + s * s * b[1]]; };
  g.SA = [-182, -206]; g.AV = [-30, -52];
  g.atrialPaths = [
    [g.SA, [-120, -196], [-64, -128], g.AV],
    [g.SA, [-150, -140], [-80, -84], g.AV],
    [g.SA, [-205, -120], [-130, -56], g.AV],
    [g.SA, [-90, -222], [30, -214], [150, -196], [214, -160]],
  ];
  g.his = [g.AV, [-6, -22], [8, 16]];
  g.lbb = [[8, 16], [28, 60], [36, 130], [52, 200], [82, 256], [112, 286], [152, 254], [186, 178], [204, 90], [204, 10]];
  g.rbb = [[8, 16], [-12, 60], [-16, 130], [0, 206], [-52, 196], [-126, 152], [-184, 76], [-196, 0]];
  // Purkinje twigs: short forks off the branches, pointing away from the cavity into the wall.
  const twigs = (path, centre, seed, arr0, arr1) => {
    const out = [];
    const lens = [0]; for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const total = lens[lens.length - 1];
    for (let k = 1; k <= 9; k++) {
      const d = total * (k / 10 + (rand(seed + k) - 0.5) * 0.04);
      let i = 1; while (i < path.length - 1 && lens[i] < d) i++;
      const f = (d - lens[i - 1]) / (lens[i] - lens[i - 1]);
      const px = lerp(path[i - 1][0], path[i][0], f), py = lerp(path[i - 1][1], path[i][1], f);
      let nx = -(path[i][1] - path[i - 1][1]), ny = path[i][0] - path[i - 1][0];
      const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      if (nx * (px - centre[0]) + ny * (py - centre[1]) < 0) { nx = -nx; ny = -ny; }
      const L = 30 + rand(seed + k * 7) * 18, tip = [px + nx * L, py + ny * L];
      const arr = lerp(arr0, arr1, d / total);
      out.push({ pts: [[px, py], tip], arr: [arr, arr + 0.08] });
      for (const side of [-1, 1]) {
        const a = Math.atan2(ny, nx) + side * 0.6;
        const l2 = L * 0.45;
        out.push({ pts: [tip, [tip[0] + Math.cos(a) * l2, tip[1] + Math.sin(a) * l2]], arr: [arr + 0.08, arr + 0.12] });
      }
    }
    return out;
  };
  g.twigs = [...twigs(g.lbb, [116, 110], 11, 0.16, 0.55), ...twigs(g.rbb, [-110, 90], 31, 0.16, 0.5)];
  g.walls = new Path2D(); g.walls.addPath(g.vent); g.walls.addPath(g.rvCav); g.walls.addPath(g.lvCav);
  g.ventBox = { x: -265, y: -80, w: 532, h: 422 };
  _HG = g;
  return g;
}

// Polyline lit up to progress q, given arrival values at its two ends (linear in length).
function _litPath(ctx, pts, arr, q, width, base) {
  if (base > 0) {
    ctx.save(); ctx.globalAlpha *= base; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = width * 0.6;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.restore();
  }
  if (q === null || q <= arr[0]) return null;
  const f = clamp((q - arr[0]) / (arr[1] - arr[0]));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = f * lens[lens.length - 1];
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  let head = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] <= target) { ctx.lineTo(pts[i][0], pts[i][1]); head = pts[i]; continue; }
    const k = (target - lens[i - 1]) / (lens[i] - lens[i - 1]);
    head = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
    ctx.lineTo(head[0], head[1]);
    break;
  }
  ctx.stroke();
  return f < 1 ? head : null;
}

function heartFull(ctx, cx, cy, s, o = {}) {
  const g = heartGeometry();
  const alpha = o.alpha ?? 1;
  const sqA = clamp(o.squeezeA || 0), sqV = clamp(o.squeezeV || 0);
  const cut = o.cutaway ?? 1;
  const wave = o.wave ?? null;
  // Squeeze transforms (local): atria shrink towards the groove, ventricles towards base and centre.
  const aK = 1 - 0.07 * sqA, aO = [0, -40];
  const qv = o.quiver || 0, tt = o.time || 0;
  const vKx = 1 - 0.06 * sqV + qv * 0.012 * Math.sin(tt * 41), vKy = 1 - 0.1 * sqV + qv * 0.012 * Math.sin(tt * 53 + 1);
  const vO = [10, -50], vRot = qv * 0.012 * Math.sin(tt * 29 + 2);
  const vDx = qv * 3 * Math.sin(tt * 47), vDy = qv * 3 * Math.sin(tt * 37 + 1);
  const atrT = (lx, ly) => [aO[0] + (lx - aO[0]) * aK, aO[1] + (ly - aO[1]) * aK];
  const venT = (lx, ly) => {
    const x = (lx - vO[0]) * vKx, y = (ly - vO[1]) * vKy, c = Math.cos(vRot), si = Math.sin(vRot);
    return [vO[0] + x * c - y * si + vDx, vO[1] + x * si + y * c + vDy];
  };
  const applyA = () => { ctx.translate(aO[0], aO[1]); ctx.scale(aK, aK); ctx.translate(-aO[0], -aO[1]); };
  const applyV = () => { ctx.translate(vO[0] + vDx, vO[1] + vDy); ctx.rotate(vRot); ctx.scale(vKx, vKy); ctx.translate(-vO[0], -vO[1]); };
  const toScreen = (lx, ly) => [cx + lx * s, cy + ly * s];
  const geo = {
    s, toScreen,
    sa: toScreen(...atrT(...g.SA)), av: toScreen(...atrT(...g.AV)), his: toScreen(...venT(8, 16)),
    ra: toScreen(...atrT(-142, -126)), la: toScreen(...atrT(152, -146)),
    rv: toScreen(...venT(-110, 90)), lv: toScreen(...venT(116, 110)), apex: toScreen(...venT(92, 338)),
    svc: toScreen(-165, -440), ivc: toScreen(-262, 190), aortaArch: toScreen(150, -440), aortaDown: toScreen(262, -220),
    pulm: toScreen(-28, -250), lungR: toScreen(-335, -300), lungL: toScreen(330, -282), pvein: toScreen(335, -150),
    toBody: toScreen(150, -440), fromBody: toScreen(-165, -440),
    ventBox: { x: cx + g.ventBox.x * s, y: cy + g.ventBox.y * s, w: g.ventBox.w * s, h: g.ventBox.h * s },
  };
  geo.ventPath = new Path2D();
  geo.ventPath.addPath(g.vent, new DOMMatrix().translateSelf(cx, cy).scaleSelf(s, s)
    .translateSelf(vO[0] + vDx, vO[1] + vDy).rotateSelf(vRot * 180 / Math.PI).scaleSelf(vKx, vKy).translateSelf(-vO[0], -vO[1]));
  if (alpha <= 0) return geo;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tube = (pts, wdt, col, dark) => {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = dark; ctx.lineWidth = wdt + 8; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.stroke();
  };
  const curve = (f, wdt, col, dark) => {
    ctx.beginPath(); f();
    ctx.strokeStyle = dark; ctx.lineWidth = wdt + 8; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = wdt * 0.25; ctx.stroke();
  };
  const BLUE = '#4f68cf', BLUE_D = '#2a3a86', RED = '#d4455c', RED_D = '#7e2034';
  // Behind the heart: pulmonary veins, inferior vena cava, pulmonary artery branches, superior vena cava.
  tube([[230, -178], [335, -198]], 34, RED, RED_D);
  tube([[236, -124], [338, -120]], 34, RED, RED_D);
  tube([[-214, -40], [-262, 190]], 58, BLUE, BLUE_D);
  curve(() => { ctx.moveTo(-28, -250); ctx.quadraticCurveTo(-180, -300, -335, -300); }, 40, '#6178dc', BLUE_D);
  curve(() => { ctx.moveTo(-28, -250); ctx.quadraticCurveTo(150, -300, 330, -282); }, 40, '#6178dc', BLUE_D);
  tube([[-165, -440], [-160, -196]], 64, BLUE, BLUE_D);

  // Atria.
  ctx.save(); applyA();
  const bodyFill = (path, gx, gy) => {
    const gr = ctx.createRadialGradient(gx, gy, 20, gx, gy, 420);
    gr.addColorStop(0, '#f07a86'); gr.addColorStop(0.55, C.muscle); gr.addColorStop(1, C.muscleDark);
    ctx.fillStyle = gr; ctx.fill(path);
    ctx.strokeStyle = '#6e1a2c'; ctx.lineWidth = 5; ctx.stroke(path);
  };
  bodyFill(g.atria, -120, -220);
  if (cut > 0) {
    ctx.save(); ctx.globalAlpha *= cut;
    _cavity(ctx, g.raCav, C.bloodBlue, o, 'ra', [-142, -126]);
    _cavity(ctx, g.laCav, C.blood, o, 'la', [152, -146]);
    ctx.restore();
  }
  // Atrial wave: golden front expanding from the SA node, trail fading as the atria finish.
  if (wave !== null && wave < HEART_WAVE.avEnd + 0.1) {
    const q = clamp(wave / HEART_WAVE.atriaEnd), R = 30 + q * 470;
    const trail = 1 - seg(wave, 0.38, 0.62);
    ctx.save(); ctx.clip(g.atria);
    const gr = ctx.createRadialGradient(g.SA[0], g.SA[1], 0, g.SA[0], g.SA[1], R + 14);
    const f = R / (R + 14);
    gr.addColorStop(0, `rgba(255,190,90,${0.32 * trail})`);
    gr.addColorStop(Math.max(0, f - 0.12), `rgba(255,200,100,${0.4 * trail})`);
    gr.addColorStop(f, `rgba(255,240,170,${q < 1 ? 0.95 : 0.4 * trail})`);
    gr.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = gr; ctx.fillRect(-320, -270, 640, 280);
    ctx.restore();
  }
  const wiring = o.wiring || 0;
  if (wiring > 0 || wave !== null) {
    ctx.save(); ctx.strokeStyle = C.spark; ctx.shadowColor = C.spark; ctx.shadowBlur = 10; ctx.lineWidth = 5;
    for (const pth of g.atrialPaths) {
      const fade = wave === null ? 0 : 1 - seg(wave, 0.62, 0.8);
      ctx.globalAlpha = alpha * Math.max(wiring * 0.9, 0) * (wave === null ? 1 : Math.max(0.35, fade));
      _litPath(ctx, pth, [0, 0.3], wave === null ? null : wave, 6, wiring * 0.5);
    }
    ctx.restore();
  }
  ctx.restore();

  // Great arteries in front of the atria.
  curve(() => { ctx.moveTo(56, -84); ctx.lineTo(44, -300); ctx.bezierCurveTo(44, -440, 262, -446, 262, -300); ctx.lineTo(262, -220); }, 72, RED, RED_D);
  for (const [bx, by, ang] of [[86, -392, -1.75], [140, -412, -1.6], [196, -404, -1.4]]) {
    tube([[bx, by], [bx + Math.cos(ang) * 64, by + Math.sin(ang) * 64]], 22, RED, RED_D);
  }
  curve(() => { ctx.moveTo(-52, -70); ctx.bezierCurveTo(-60, -170, -40, -220, -28, -250); }, 62, '#5d74da', BLUE_D);

  // Ventricles.
  ctx.save(); applyV();
  bodyFill(g.vent, 40, 60);
  if (o.pattern) {
    ctx.save(); ctx.clip(g.vent);
    o.pattern(ctx, g.ventBox);
    ctx.restore();
    ctx.strokeStyle = '#6e1a2c'; ctx.lineWidth = 5; ctx.stroke(g.vent);
  }
  if (cut > 0 && (!o.pattern || o.patternArea !== 'all')) {
    ctx.save(); ctx.globalAlpha *= cut;
    _cavity(ctx, g.rvCav, C.bloodBlue, o, 'rv', [-110, 90]);
    _cavity(ctx, g.lvCav, C.blood, o, 'lv', [116, 110]);
    // Valves: tricuspid and mitral leaflets, pulmonary and aortic cusps.
    ctx.strokeStyle = 'rgba(255,236,224,0.85)'; ctx.lineWidth = 5;
    for (const [x0, y0, x1, y1] of [[-170, -30, -146, 6], [-78, -34, -100, 4], [72, -50, 92, -14], [160, -56, 140, -18]]) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + (x1 > x0 ? -8 : 8), (y0 + y1) / 2, x1, y1); ctx.stroke();
    }
    ctx.restore();
  }
  for (const [vx, vy] of [[-52, -66], [54, -78]]) {
    ctx.strokeStyle = 'rgba(255,236,224,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(vx - 12, vy, 12, 0, Math.PI); ctx.arc(vx + 12, vy, 12, 0, Math.PI); ctx.stroke();
  }
  // Ventricular activation: walls light from the inside out as the Purkinje network fires.
  const vq = wave === null ? null : seg(wave, HEART_WAVE.avEnd, HEART_WAVE.ventEnd);
  const vFade = wave === null ? 0 : 1 - seg(wave, HEART_WAVE.ventEnd, HEART_WAVE.fadeEnd);
  if (vq !== null && vq > 0.3 && vFade > 0) {
    const k = seg(vq, 0.3, 0.9), R = 60 + 420 * k;
    ctx.save(); ctx.clip(g.walls, 'evenodd');
    const gr = ctx.createRadialGradient(20, 120, 0, 20, 120, R);
    gr.addColorStop(0, `rgba(255,214,110,${0.45 * vFade})`);
    gr.addColorStop(Math.max(0, 1 - 40 / R), `rgba(255,214,110,${0.5 * vFade})`);
    gr.addColorStop(1, `rgba(255,240,170,${k < 1 ? 0.0 : 0.5 * vFade})`);
    ctx.fillStyle = gr; ctx.fillRect(-300, -90, 600, 450);
    ctx.restore();
  }
  if (wiring > 0 || (vq !== null && vq > 0)) {
    ctx.save(); ctx.strokeStyle = C.spark; ctx.shadowColor = C.spark; ctx.shadowBlur = 12; ctx.lineWidth = 6;
    const base = wiring * 0.55;
    const qq = vq === null || vq <= 0 ? null : vq;
    ctx.globalAlpha = alpha * Math.max(wiring, qq === null ? 0 : vFade);
    const heads = [];
    heads.push(_litPath(ctx, g.his, [0, 0.16], qq, 8, base));
    heads.push(_litPath(ctx, g.lbb, [0.16, 0.55], qq, 7, base));
    heads.push(_litPath(ctx, g.rbb, [0.16, 0.5], qq, 7, base));
    ctx.lineWidth = 3.5;
    ctx.save(); ctx.clip(g.vent);
    for (const tw of g.twigs) _litPath(ctx, tw.pts, tw.arr, qq, 4, base * 0.8);
    ctx.restore();
    ctx.shadowBlur = 0;
    for (const h of heads) if (h) glow(ctx, h[0], h[1], 34, '#fff6c8', 1);
    ctx.restore();
  }
  ctx.restore();

  // Insulating ring between atria and ventricles, with its one gap at the AV node.
  const ins = o.insulator || 0;
  if (ins > 0) {
    ctx.save(); ctx.globalAlpha *= ins;
    ctx.strokeStyle = C.insulator; ctx.lineWidth = 14; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
    ctx.beginPath();
    let on = false;
    for (let k = 0; k <= 80; k++) {
      const p = g.groove(k / 80);
      const gap = p[0] > -58 && p[0] < -4;
      if (gap) { on = false; continue; }
      if (!on) { ctx.moveTo(p[0], p[1] + 2); on = true; } else ctx.lineTo(p[0], p[1] + 2);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Nodes.
  const nodes = o.nodes || 0;
  const avPulse = wave === null ? 0 : seg(wave, 0.26, 0.32) * (1 - seg(wave, 0.62, 0.7)) * (0.7 + 0.3 * Math.sin(wave * 90));
  const saFlash = wave === null ? 0 : 1 - seg(wave, 0.02, 0.2);
  if (nodes > 0 || avPulse > 0 || saFlash > 0) {
    ctx.save(); applyA();
    const node = (p, a, flash) => {
      if (a <= 0) return;
      glow(ctx, p[0], p[1], 46 + 30 * flash, C.node, a * (0.6 + 0.4 * flash));
      ctx.fillStyle = flash > 0.05 ? '#fff6d8' : C.node; ctx.globalAlpha = alpha * a;
      ctx.beginPath(); ctx.ellipse(p[0], p[1], 15, 11, -0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(80,30,0,0.6)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = alpha;
    };
    node(g.SA, Math.max(nodes, saFlash), saFlash);
    node(g.AV, Math.max(nodes, avPulse), avPulse);
    ctx.restore();
  }
  ctx.restore();

  const nl = (o.nodeLabels || 0) * alpha;
  if (nl > 0) {
    pillText(ctx, 'SA node', geo.sa[0] - 30, geo.sa[1] - 42, 28, C.node, 'right', nl);
    pillText(ctx, 'AV node', geo.av[0] - 36, geo.av[1] + 40, 28, C.node, 'right', nl);
  }
  const lab = (o.labels || 0) * alpha;
  if (lab > 0) {
    const L = (name, at, tx, ty, align) => {
      const p = toScreen(tx, ty);
      ctx.save(); ctx.globalAlpha *= lab; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(p[0] + (align === 'right' ? 10 : -10), p[1]); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(at[0], at[1], 5, 0, TAU); ctx.fill();
      ctx.restore();
      pillText(ctx, name, p[0], p[1], 30, C.text, align, lab);
    };
    L('Right atrium', geo.ra, -345, -170, 'right');
    L('Left atrium', geo.la, 360, -40, 'left');
    L('Right ventricle', geo.rv, -330, 150, 'right');
    L('Left ventricle', geo.lv, 330, 190, 'left');
  }
  return geo;
}
function _cavity(ctx, path, col, o, key, c) {
  ctx.fillStyle = col; ctx.fill(path);
  const tint = o.tint && o.tint[key];
  if (tint) {
    const tc = typeof tint === 'string' ? tint : tint.color, ta = typeof tint === 'string' ? 1 : tint.alpha ?? 1;
    ctx.save(); ctx.globalAlpha *= ta; ctx.fillStyle = tc; ctx.fill(path); ctx.restore();
  }
  // Inner shading for depth.
  ctx.save(); ctx.clip(path);
  const gr = ctx.createRadialGradient(c[0] - 20, c[1] - 30, 10, c[0], c[1], 160);
  gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = gr; ctx.fill(path);
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,10,25,0.8)'; ctx.lineWidth = 4; ctx.stroke(path);
  const gl = o.glow && o.glow[key];
  if (gl > 0) { ctx.save(); ctx.clip(path); glow(ctx, c[0], c[1], 170, C.spark, gl); ctx.restore(); }
}

// ---------------------------------------------------------------- cell schematics
function rowLayout(x, y, n, o = {}) {
  const w = o.w || 150, h = o.h || 88, gap = o.gap ?? 50;
  const x0 = x - ((n - 1) * (w + gap)) / 2;
  const cells = Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h, angle: 0 }));
  const links = []; for (let i = 0; i < n - 1; i++) links.push([i, i + 1]);
  return { kind: 'row', cells, links, n, neighbours: i => [i - 1, i + 1] };
}
function sheetLayout(x, y, cols, rows, o = {}) {
  const w = o.w || 110, h = o.h || 60, gap = o.gap ?? 30, vgap = o.vgap ?? 30;
  const pitch = w + gap, x0 = x - ((cols - 1) * pitch + pitch / 2) / 2, y0 = y - ((rows - 1) * (h + vgap)) / 2;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    cells.push({ x: x0 + c * pitch + (r % 2) * pitch / 2, y: y0 + r * (h + vgap), w, h, angle: 0, col: c, row: r });
  const links = [];
  const nb = cells.map(() => []);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j];
    const sameRow = a.row === b.row && Math.abs(a.col - b.col) === 1;
    const adjRow = Math.abs(a.row - b.row) === 1 && Math.abs(a.x - b.x) < pitch * 0.75;
    if (sameRow || adjRow) { links.push([i, j]); nb[i].push(j); nb[j].push(i); }
  }
  return { kind: 'sheet', cells, links, n: cells.length, neighbours: i => nb[i] };
}
function ringLayout(cx, cy, n, rx, ry, o = {}) {
  const w = o.w || 100, h = o.h || 60, a0 = o.a0 ?? -Math.PI / 2;
  const cells = Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * TAU;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, w, h, angle: Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx) };
  });
  const links = cells.map((_, i) => [i, (i + 1) % n]);
  return { kind: 'ring', cells, links, n, neighbours: i => [(i + n - 1) % n, (i + 1) % n] };
}
// Point on cell c's outline in the direction of point p (rect boundary in the cell's own frame).
function _edge(c, px, py, inset = 1) {
  const dx = px - c.x, dy = py - c.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, ca = Math.cos(-(c.angle || 0)), sa = Math.sin(-(c.angle || 0));
  const lx = ux * ca - uy * sa, ly = ux * sa + uy * ca;
  const e = 1 / Math.max(Math.abs(lx) / (c.w / 2), Math.abs(ly) / (c.h / 2), 1e-6);
  return [c.x + ux * e * inset, c.y + uy * e * inset];
}
// Where a knock into the row edge ends: just past the outer end of the end cell.
function edgePoint(layout, i, toward) {
  const c = layout.cells[i];
  if (toward === -1 || toward === layout.n) {
    const dir = toward === -1 ? -1 : 1;
    return { x: c.x + dir * (c.w / 2 + 70), y: c.y, w: 0, h: 0, point: true };
  }
  return layout.cells[toward];
}
function tunnel(ctx, a, b, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const p = _edge(a, b.x, b.y, 0.92), q = _edge(b, a.x, a.y, 0.92);
  const th = o.width || Math.min(a.h, b.h) * 0.26;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(190,205,240,0.55)'; ctx.lineWidth = th;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(15,25,60,0.85)'; ctx.lineWidth = th * 0.45;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  ctx.restore();
}
function cellBrick(ctx, x, y, w, h, state, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const st = cellState(state);
  const fire = clamp(st.fire), base = lockRGB(st.lock);
  const top = mixRGB(mixRGB(base, _RGB.white, 0.22), [255, 250, 225], fire * 0.85);
  const bot = mixRGB(mixRGB(base, _RGB.black, 0.3), _RGB.spark, fire * 0.8);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (fire > 0) glow(ctx, x, y, Math.max(w, h) * 1.05, C.spark, fire * 0.85);
  ctx.translate(x, y); ctx.rotate(o.angle || 0);
  const k = 1 + 0.06 * fire; ctx.scale(k, k);
  const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, rgbStr(top)); gr.addColorStop(1, rgbStr(bot));
  ctx.fillStyle = gr; roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.3); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 2;
  for (let i = 1; i < 9; i++) { const xx = -w / 2 + (w * i) / 9; ctx.beginPath(); ctx.moveTo(xx, -h / 2); ctx.lineTo(xx + 4, h / 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(ctx, -w / 2 + 6, -h / 2 + 5, w - 12, h * 0.22, h * 0.1); ctx.fill();
  ctx.fillStyle = 'rgba(20,10,40,0.28)'; ctx.beginPath(); ctx.ellipse(0, 2, w * 0.13, h * 0.2, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = fire > 0.2 ? 'rgba(255,255,230,0.9)' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.3); ctx.stroke();
  ctx.restore();
  if (o.padlock) {
    const ls = o.lockSize || Math.min(w, h) * 0.5;
    padlock(ctx, x, y - h / 2 - ls * 0.62, ls, 1 - st.lock, { alpha });
  }
  if (o.label) text(ctx, o.label, x, y + h / 2 + 30, 24, C.dim, 'center', 700, alpha);
}
function drawCells(ctx, layout, states, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const S = i => cellState(typeof states === 'function' ? states(i) : states ? states[i] : 'ready');
  if (o.tunnels !== false) for (const [i, j] of layout.links) tunnel(ctx, layout.cells[i], layout.cells[j], { alpha });
  layout.cells.forEach((c, i) => {
    const st = S(i);
    const pl = o.padlocks === 'auto' ? st.lock > 0.02 : !!o.padlocks;
    cellBrick(ctx, c.x, c.y, c.w, c.h, st, { alpha, angle: c.angle, padlock: pl, lockSize: o.lockSize, label: o.labels ? o.labels(i) : '' });
  });
}

const KNOCK_TRAVEL = 0.55;
const KNOCK_WORD = { ignored: 'ignored', edge: 'nothing left', fires: '' };
function knock(ctx, a, b, p, outcome = 'fires', o = {}) {
  if (p <= 0 || p >= 1) return;
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const r = o.size || 13;
  const start = _edge(a, b.x, b.y, 0.55);
  const end = b.w ? _edge(b, a.x, a.y, 1.02) : [b.x, b.y];
  const dx = end[0] - start[0], dy = end[1] - start[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  ctx.save(); ctx.globalAlpha *= alpha;
  const dot = (x, y, rr, al) => {
    glow(ctx, x, y, rr * 3.2, C.spark, al * 0.9);
    ctx.fillStyle = `rgba(255,252,230,${al})`; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
  };
  if (p < KNOCK_TRAVEL) {
    const q = easeIO(p / KNOCK_TRAVEL);
    for (let k = 4; k >= 1; k--) {
      const qq = Math.max(0, q - k * 0.05);
      dot(start[0] + dx * qq, start[1] + dy * qq, r * (1 - k * 0.15), 0.18 * (5 - k) / 4);
    }
    dot(start[0] + dx * q, start[1] + dy * q, r, 1);
  } else {
    const k = (p - KNOCK_TRAVEL) / (1 - KNOCK_TRAVEL);
    if (outcome === 'fires') {
      ctx.strokeStyle = `rgba(255,240,170,${1 - k})`; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(end[0], end[1], r + k * (b.h || 60) * 0.7, 0, TAU); ctx.stroke();
      dot(end[0] + ux * k * 20, end[1] + uy * k * 20, r * (1 - k), 1 - k);
    } else if (outcome === 'ignored') {
      const back = Math.sin(Math.min(1, k * 1.6) * Math.PI) * r * 1.6;
      const sq = 1 - 0.45 * Math.sin(Math.min(1, k * 2.5) * Math.PI);
      ctx.save(); ctx.translate(end[0] - ux * (r * 0.6 + back), end[1] - uy * (r * 0.6 + back)); ctx.rotate(Math.atan2(uy, ux)); ctx.scale(sq, 1 / sq);
      dot(0, 0, r, Math.max(0, 1 - k * 1.2));
      ctx.restore();
      ctx.strokeStyle = `rgba(255,190,200,${0.9 * (1 - k)})`; ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(end[0], end[1], r * (1 + k * 2.6), Math.atan2(uy, ux) + Math.PI / 2, Math.atan2(uy, ux) + Math.PI * 1.5); ctx.stroke();
    } else if (outcome === 'edge') {
      for (let i = 0; i < 5; i++) {
        const a = Math.atan2(uy, ux) + (i - 2) * 0.45, d = k * r * 3.5;
        dot(end[0] + Math.cos(a) * d, end[1] + Math.sin(a) * d, r * 0.4 * (1 - k), (1 - k) * 0.8);
      }
      dot(end[0], end[1], r * (1 - k * 0.6), 1 - k);
    }
  }
  ctx.restore();
  const word = o.label === true ? KNOCK_WORD[outcome] : o.label;
  if (word && p > KNOCK_TRAVEL) {
    const k = (p - KNOCK_TRAVEL) / (1 - KNOCK_TRAVEL);
    const la = alpha * Math.min(clamp(k * 5), 1 - seg(k, 0.85, 1));
    text(ctx, word, end[0], end[1] - (b.h || 60) * 0.5 - 38 - k * 10, o.labelSize || 26, outcome === 'ignored' ? '#ffc2cb' : C.dim, 'center', 700, la);
  }
}

function cellWave(o) {
  const n = o.n ?? o.layout.n;
  const nbs = o.neighbours || o.layout.neighbours;
  const step = o.step ?? 0.6, lockT = o.lock ?? step * 4, rec = o.recover ?? step * 2, flash = o.flash ?? Math.min(step * 0.8, 0.45);
  const jitter = o.jitter || 0, seed = o.seed || 1, until = o.until ?? 60, accept = o.accept ?? 0.05;
  const Li = Array.from({ length: n }, (_, i) => lockT * (1 + jitter * (2 * rand(seed * 97 + i) - 1)));
  const fireTimes = Array.from({ length: n }, () => []);
  const pre = Array.from({ length: n }, (_, i) => (o.fired ? o.fired(i) : null));
  const lastFireBefore = (i, t) => {
    let lf = pre[i] ?? -Infinity;
    for (const ft of fireTimes[i]) if (ft <= t + 1e-9) lf = ft; else break;
    return lf;
  };
  const lockAt = (i, t) => {
    const s = t - lastFireBefore(i, t);
    if (s < Li[i]) return 1;
    if (s < Li[i] + rec) return 1 - (s - Li[i]) / rec;
    return 0;
  };
  // Event queue of knock arrivals, processed in time order.
  const queue = [];
  const knocks = [];
  const push = e => { queue.push(e); queue.sort((a, b) => a.t - b.t); };
  const fire = (i, t) => {
    fireTimes[i].push(t);
    for (const j of nbs(i)) {
      const edge = j < 0 || j >= n;
      const k = { from: i, to: j, t0: t, dur: step / KNOCK_TRAVEL, outcome: edge ? 'edge' : null };
      knocks.push(k);
      if (!edge) push({ t: t + step, k });
    }
  };
  for (const s of o.starts || []) push({ t: s.time, start: s.cell });
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    const e = queue.shift();
    if (e.t > until) break;
    if (e.start !== undefined) { fire(e.start, e.t); continue; }
    const j = e.k.to;
    const lf = lastFireBefore(j, e.t);
    if (Math.abs(lf - e.t) < 1e-9) { e.k.outcome = 'fires'; continue; }
    if (lockAt(j, e.t) <= accept) { e.k.outcome = 'fires'; fire(j, e.t); } else e.k.outcome = 'ignored';
  }
  for (const k of knocks) if (!k.outcome) k.outcome = 'travel';
  return {
    fireTimes, Li, knocks,
    at(t) {
      const cells = [];
      for (let i = 0; i < n; i++) {
        const lf = lastFireBefore(i, t), s = t - lf;
        const lock = lockAt(i, t);
        const f = s >= 0 && s < flash ? Math.min(1, s / 0.06) * (1 - s / flash) : 0;
        const st = { fire: f, lock, lastFire: lf, fireCount: fireTimes[i].filter(x => x <= t).length };
        st.state = stateName(st);
        cells.push(st);
      }
      const active = [];
      for (const k of knocks) {
        const p = (t - k.t0) / k.dur;
        if (p > 0 && p < 1) active.push({ from: k.from, to: k.to, p, outcome: k.outcome });
      }
      return { cells, knocks: active };
    },
  };
}

// ---------------------------------------------------------------- ECG
const _gauss = (x, c, s) => Math.exp(-0.5 * ((x - c) / s) ** 2);
const ECG_BEAT = { p: 0.12, qrs: 0.258, tStart: 0.4, tPeak: 0.52, tEnd: 0.64, vulnStart: 0.47, vulnEnd: 0.505 };
function ecgValue(ph) {
  ph = ((ph % 1) + 1) % 1;
  const m = ph * 1000;
  return 0.15 * _gauss(m, 120, 22) - 0.1 * _gauss(m, 240, 7) + 1.2 * _gauss(m, 258, 8) - 0.28 * _gauss(m, 276, 9)
    + 0.35 * (m < 520 ? _gauss(m, 520, 55) : _gauss(m, 520, 38));
}
const ecgNormal = (t, bpm = 72) => ecgValue((t * bpm) / 60);
function ecgVF(t, seed = 1) {
  let v = 0;
  for (let k = 0; k < 4; k++) {
    const f = 4.2 + 2.6 * rand(seed * 13 + k), drift = 0.6 * Math.sin(t * (0.3 + 0.2 * k) + k * 2);
    v += (0.18 + 0.1 * rand(seed * 7 + k)) * Math.sin(TAU * f * t + drift * 3 + k * 1.7);
  }
  return 0.75 * v * (0.75 + 0.3 * Math.sin(t * 1.3 + seed));
}
const ecgFlat = t => 0.015 * Math.sin(t * 1.7) + 0.008 * Math.sin(t * 5.3);

function drawECG(ctx, x, y, w, h, fn, t, span, o = {}) {
  const alpha = o.alpha ?? 1;
  const lo = o.lo ?? -0.6, hi = o.hi ?? 1.5, mode = o.mode || 'sweep', col = o.color || C.ecg;
  const pad = 18, px = x + pad, pw = w - pad * 2, py = y + (o.title ? 56 : pad), ph = y + h - pad - py;
  const yOf = v => py + ph * (hi - v) / (hi - lo);
  const sweepStart = Math.floor(t / span) * span, cur = (t - sweepStart) / span, gap = 0.04;
  // Signal time shown at screen fraction f (null in the erase gap).
  const timeAt = f => {
    if (mode === 'scroll') return t - span + f * span;
    if (f <= cur) return sweepStart + f * span;
    if (f < cur + gap) return null;
    return sweepStart - span + f * span;
  };
  const xOf = tt => {
    if (mode === 'scroll') { const f = (tt - (t - span)) / span; return f >= 0 && f <= 1 ? px + f * pw : null; }
    for (const base of [sweepStart, sweepStart - span]) {
      const f = (tt - base) / span;
      if (f >= 0 && f <= 1 && timeAt(f) !== null && Math.abs(timeAt(f) - tt) < 1e-6) return px + f * pw;
    }
    return null;
  };
  const api = { xOf, yOf };
  if (alpha <= 0) return api;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const navy = o.panel === 'navy';
  ctx.fillStyle = navy ? 'rgba(5,10,30,0.7)' : 'rgba(2,14,10,0.92)';
  roundRect(ctx, x, y, w, h, 22); ctx.fill();
  ctx.strokeStyle = navy ? 'rgba(255,255,255,0.14)' : 'rgba(92,240,143,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  if (o.title) text(ctx, o.title, x + 26, y + 32, 26, navy ? C.dim : '#8fe8b0', 'left', 700);
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  // Grid: small squares every 0.04 s, big every 0.2 s (scaled to span).
  const gc = navy ? '255,255,255' : '92,240,143';
  for (const [stepT, a] of [[0.04, 0.05], [0.2, 0.12]]) {
    const dx = (stepT / span) * pw;
    if (dx < 6) continue;
    ctx.strokeStyle = `rgba(${gc},${a})`; ctx.lineWidth = stepT > 0.1 ? 1.5 : 1;
    ctx.beginPath();
    for (let gx = px; gx <= px + pw; gx += dx) { ctx.moveTo(gx, py); ctx.lineTo(gx, py + ph); }
    for (let gy = yOf(0); gy <= py + ph; gy += dx) { ctx.moveTo(px, gy); ctx.lineTo(px + pw, gy); }
    for (let gy = yOf(0) - dx; gy >= py; gy -= dx) { ctx.moveTo(px, gy); ctx.lineTo(px + pw, gy); }
    ctx.stroke();
  }
  // Highlight bands.
  for (const b of o.bands || []) {
    const bc = b.color || C.locked;
    let labelX = null;
    const cols = 240;
    for (let i = 0; i < cols; i++) {
      const f = (i + 0.5) / cols, tt = timeAt(f);
      if (tt === null || (o.t0 !== undefined && tt < o.t0)) continue;
      let rel = tt - b.t0;
      if (b.period) rel = ((rel % b.period) + b.period) % b.period;
      if (rel >= 0 && rel <= b.t1 - b.t0) {
        ctx.fillStyle = bc; ctx.globalAlpha = alpha * (b.alpha ?? 0.3);
        ctx.fillRect(px + (i / cols) * pw, py, pw / cols + 0.5, ph);
        if (mode === 'scroll' || f <= cur) labelX = px + f * pw;
      }
    }
    ctx.globalAlpha = alpha;
    if (b.label && labelX !== null) text(ctx, b.label, clamp(labelX, px + 90, px + pw - 90), py + 26, 24, bc, 'center', 800, alpha);
  }
  // Trace.
  ctx.strokeStyle = col; ctx.lineWidth = o.lineWidth || 4; ctx.lineJoin = 'round'; ctx.shadowColor = col; ctx.shadowBlur = 14;
  ctx.beginPath();
  let pen = false;
  const N = Math.max(200, Math.round(pw / 2));
  for (let i = 0; i <= N; i++) {
    const f = i / N, tt = timeAt(f);
    if (tt === null || (o.t0 !== undefined && tt < o.t0)) { pen = false; continue; }
    const xx = px + f * pw, yy = yOf(fn(tt));
    if (!pen) { ctx.moveTo(xx, yy); pen = true; } else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  if (o.cursor !== false && (o.t0 === undefined || t >= o.t0)) {
    const cx = mode === 'scroll' ? px + pw : px + cur * pw;
    ctx.shadowBlur = 0;
    glow(ctx, cx, yOf(fn(t)), 26, col, 0.9);
    ctx.fillStyle = '#eafff0'; ctx.beginPath(); ctx.arc(cx, yOf(fn(t)), 6, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  return api;
}

// ---------------------------------------------------------------- tissue engine
const TISSUE_PARAMS = { a: 0.84, b: 0.07, eps: 0.06, hs: 0.2, dt: 0.009 };
// Display thresholds on the recovery variable v (and u for "excited").
const TISSUE_V = { uOn: 0.4, vf: 0.25, v1: 0.35, v2: 0.12, vTop: 0.6 };

function _region(r, w, h) {
  if (typeof r === 'function') return r;
  if (r.r !== undefined) return (x, y) => ((x + 0.5) / h - (r.x * w) / h) ** 2 + ((y + 0.5) / h - r.y) ** 2 <= r.r * r.r;
  return (x, y, nx, ny) => nx >= r.x0 && nx <= r.x1 && ny >= r.y0 && ny <= r.y1;
}

function createTissue(o = {}) {
  const w = o.w || 160, h = o.h || 100, N = w * h;
  const P = Object.assign({}, TISSUE_PARAMS, o.params);
  let u = new Float32Array(N), un = new Float32Array(N);
  const v = new Float32Array(N), rr = new Float32Array(N).fill(1), type = new Uint8Array(N);
  const nb = new Int32Array(N * 4);
  let act = null;
  const each = f => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f(x, y, y * w + x, w > 1 ? x / (w - 1) : 0, h > 1 ? y / (h - 1) : 0); };
  if (o.mask) each((x, y, i, nx, ny) => { if (!o.mask(x, y, nx, ny)) type[i] = 1; });
  if (o.obstacle) each((x, y, i, nx, ny) => { if (!type[i] && o.obstacle(x, y, nx, ny)) type[i] = 2; });
  function rebuild() {
    const list = [];
    each((x, y, i) => {
      if (type[i]) return;
      list.push(i);
      const ok = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && !type[yy * w + xx];
      nb[i * 4] = ok(x - 1, y) ? i - 1 : i; nb[i * 4 + 1] = ok(x + 1, y) ? i + 1 : i;
      nb[i * 4 + 2] = ok(x, y - 1) ? i - w : i; nb[i * 4 + 3] = ok(x, y + 1) ? i + w : i;
    });
    act = Int32Array.from(list);
  }
  rebuild();
  const sim = {
    w, h, N, P, v, rr, type,
    get u() { return u; },
    setParams(p) { Object.assign(P, p); },
    setState(fn) { each((x, y, i, nx, ny) => { const s = fn(x, y, nx, ny); if (s) { u[i] = s[0]; v[i] = s[1]; } }); },
    setRates(fn) { each((x, y, i, nx, ny) => { rr[i] = fn(x, y, nx, ny); }); },
    stimulate(region, strength = 1) {
      const f = _region(region, w, h);
      each((x, y, i, nx, ny) => { if (!type[i] && f(x, y, nx, ny) && u[i] < strength) u[i] = strength; });
    },
    globalShock(strength = 1) {
      for (const i of act) {
        // A full shock depolarises every cell at once (locked ones included), so the whole sheet then
        // recovers in step. 0.9 rather than 1: u = 1 is an exact fixed point, so a uniform sheet would stick.
        if (strength >= 1) { u[i] = 0.9; v[i] = 0; } else if ((v[i] + P.b) / P.a < strength) u[i] = 0.9;
      }
    },
    cell(x, y) { const i = y * w + x; return { u: u[i], v: v[i] }; },
    step(n = 1) {
      const { a, b, eps, dt, hs } = P;
      const k1 = dt / eps, kD = dt / (hs * hs), ia = 1 / a, M = act.length;
      for (let s = 0; s < n; s++) {
        for (let c = 0; c < M; c++) {
          const i = act[c], uu = u[i], vv = v[i], o4 = i * 4;
          const lap = u[nb[o4]] + u[nb[o4 + 1]] + u[nb[o4 + 2]] + u[nb[o4 + 3]] - 4 * uu;
          let x = uu + k1 * uu * (1 - uu) * (uu - (vv + b) * ia) + kD * lap;
          un[i] = x < 0 ? 0 : x > 1.2 ? 1.2 : x;
          const g = uu < 1 / 3 ? 0 : uu <= 1 ? 1 - 6.75 * uu * (uu - 1) * (uu - 1) : 1;
          v[i] = vv + dt * rr[i] * (g - vv);
        }
        const tmp = u; u = un; un = tmp;
      }
    },
    snapshot(stats) {
      const d = new Uint8Array(N), T = TISSUE_V;
      let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
      for (const i of act) {
        const uu = u[i], vv = v[i];
        let k;
        if (uu > T.uOn) k = vv < T.vf ? 192 + Math.round(63 * Math.min(1, (uu - T.uOn) / 0.5) * (1 - vv / T.vf)) : 191;
        else if (vv >= T.v1) k = 128 + Math.round(63 * Math.min(1, (vv - T.v1) / (T.vTop - T.v1)));
        else if (vv >= T.v2) k = 64 + Math.round(63 * (vv - T.v2) / (T.v1 - T.v2));
        else k = Math.round(63 * vv / T.v2);
        d[i] = k;
        if (k >= 192) c3++; else if (k >= 128) c2++; else if (k >= 64) c1++; else c0++;
      }
      if (stats) { const M = act.length || 1; Object.assign(stats, { ready: c0 / M, half: c1 / M, locked: c2 / M, firing: c3 / M }); }
      return d;
    },
  };
  return sim;
}
const tissueCategory = k => (k >= 192 ? 'firing' : k >= 128 ? 'locked' : k >= 64 ? 'half' : 'ready');

// Number of separate firing fronts (4-connected components of firing cells, ignoring specks).
function _fronts(d, w, h) {
  const seen = new Uint8Array(w * h), stack = [];
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || d[i] < 192) continue;
    let size = 0; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); size++;
      const x = j % w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) {
        if (k < 0 || k >= w * h || seen[k] || d[k] < 192) continue;
        seen[k] = 1; stack.push(k);
      }
    }
    if (size > 6) n++;
  }
  return n;
}

function recordTissue(o) {
  const sim = createTissue(o);
  if (o.rates) sim.setRates(o.rates);
  if (o.init) o.init(sim);
  const F = o.frames, spf = o.stepsPerFrame || 12, fps = o.fps || 30;
  const events = (o.events || []).map(e => ({ ...e }));
  const frames = new Array(F), stats = new Array(F);
  for (let f = 0; f < F; f++) {
    for (const e of events) {
      const due = e.frame !== undefined ? e.frame === f : e.firedAt === undefined && f >= (e.after || 0) && e.when(sim, f);
      if (!due) continue;
      if (e.frame === undefined) e.firedAt = f;
      if (e.type === 'stim') sim.stimulate(e.region, e.strength ?? 1);
      else if (e.type === 'shock') sim.globalShock(e.strength ?? 1);
      else if (e.type === 'params') sim.setParams(e.params);
      else if (e.type === 'rates') sim.setRates(e.fn);
      else if (e.type === 'call') e.fn(sim, f);
    }
    const st = {};
    const data = sim.snapshot(st);
    st.fronts = _fronts(data, sim.w, sim.h);
    frames[f] = { w: sim.w, h: sim.h, data, type: sim.type };
    stats[f] = st;
    if (f < F - 1) sim.step(spf);
  }
  const rec = {
    w: sim.w, h: sim.h, fps, frames, stats, events, stepsPerFrame: spf,
    frame: f => frames[Math.max(0, Math.min(F - 1, Math.round(f)))],
    at: t => rec.frame(t * fps),
    sample: (t, nx, ny) => rec.at(t).data[Math.round(ny * (sim.h - 1)) * sim.w + Math.round(nx * (sim.w - 1))],
  };
  return rec;
}

// Colour lookup for snapshot bytes (r, g, b per entry).
const _TLUT = (() => {
  const lut = new Uint8Array(256 * 3);
  const ramp = (k0, k1, c0, c1) => { for (let k = k0; k <= k1; k++) { const c = mixRGB(c0, c1, (k - k0) / Math.max(1, k1 - k0)); lut.set([c[0], c[1], c[2]].map(Math.round), k * 3); } };
  ramp(0, 63, [70, 156, 250], [112, 186, 255]);
  ramp(64, 127, [255, 196, 92], [255, 140, 62]);
  ramp(128, 159, [255, 108, 92], [255, 84, 102]);
  ramp(160, 191, [255, 84, 102], [222, 54, 86]);
  ramp(192, 215, [255, 196, 120], [255, 230, 128]);
  ramp(216, 255, [255, 232, 140], [255, 252, 236]);
  return lut;
})();
let _tCan = null, _tGlow = null;
function _canvas(c, w, h) {
  if (!c) c = document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
function drawTissue(ctx, snap, x, y, w, h, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0 || !snap) return;
  const { w: sw, h: sh, data, type } = snap;
  _tCan = _canvas(_tCan, sw, sh); _tGlow = _canvas(_tGlow, sw, sh);
  const tc = _tCan.getContext('2d'), gc = _tGlow.getContext('2d');
  const img = tc.createImageData(sw, sh), gimg = gc.createImageData(sw, sh);
  const px = img.data, gp = gimg.data, dim = o.dim || 0;
  let anyFire = false;
  for (let i = 0; i < sw * sh; i++) {
    const p = i * 4;
    if (type[i] === 1) continue;
    if (type[i] === 2) { px[p] = 96; px[p + 1] = 104; px[p + 2] = 128; px[p + 3] = 255; continue; }
    const k = data[i];
    let r = _TLUT[k * 3], g = _TLUT[k * 3 + 1], b = _TLUT[k * 3 + 2];
    if (dim) { const m = (r + g + b) / 3; r = lerp(r, m * 0.6, dim); g = lerp(g, m * 0.6, dim); b = lerp(b, m * 0.7, dim); }
    px[p] = r; px[p + 1] = g; px[p + 2] = b; px[p + 3] = 255;
    if (k >= 200) { gp[p] = 255; gp[p + 1] = 236; gp[p + 2] = 150; gp[p + 3] = Math.min(255, (k - 192) * 4); anyFire = true; }
  }
  tc.putImageData(img, 0, 0);
  if (anyFire) gc.putImageData(gimg, 0, 0);
  const rad = o.radius ?? 22;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.save();
  if (o.clip) { if (typeof o.clip === 'function') { ctx.beginPath(); o.clip(ctx); ctx.clip(); } else ctx.clip(o.clip); }
  else if (rad > 0) { roundRect(ctx, x, y, w, h, rad); ctx.clip(); }
  if (o.bg !== false) { ctx.fillStyle = o.bg || 'rgba(5,10,30,0.8)'; ctx.fillRect(x, y, w, h); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // A slight blur hides the cell grid steps on sharp fronts when the sheet is scaled up a lot.
  const cellPx = w / sw;
  if (o.soft !== false && cellPx > 2) ctx.filter = `blur(${(cellPx * 0.3).toFixed(2)}px)`;
  ctx.drawImage(_tCan, x, y, w, h);
  ctx.filter = 'none';
  if (anyFire && o.glow !== false && !dim) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${Math.max(2, (w / sw) * 1.6)}px)`;
    ctx.globalAlpha *= 0.55;
    ctx.drawImage(_tGlow, x, y, w, h);
    ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  }
  if (o.bricks) {
    const bw = o.bricks * 2, bh = o.bricks;
    ctx.strokeStyle = 'rgba(10,15,40,0.22)'; ctx.lineWidth = 1.5; ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let r = 0, yy = y; yy < y + h; r++, yy += bh) {
      ctx.moveTo(x, yy); ctx.lineTo(x + w, yy);
      for (let xx = x - (r % 2) * bw / 2; xx < x + w; xx += bw) { ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + bh); }
    }
    ctx.stroke();
  }
  ctx.restore();
  if (o.border !== false && !o.clip && rad > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, rad); ctx.stroke();
  }
  ctx.restore();
}
function tissueLegend(ctx, x, y, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const sz = o.size || 26;
  const items = [['Ready', [79, 168, 255]], ['Half unlocked', _RGB.half], ['Locked', _RGB.locked], ['Firing', _RGB.spark]];
  let xx = x, yy = y;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `700 ${sz}px ${FONT}`;
  for (const [name, c] of items) {
    ctx.fillStyle = rgbStr(c); roundRect(ctx, xx, yy - sz * 0.45, sz * 0.9, sz * 0.9, sz * 0.25); ctx.fill();
    const tw = ctx.measureText(name).width;
    text(ctx, name, xx + sz * 1.25, yy, sz, C.text, 'left', 700);
    if (o.vertical) yy += sz * 1.6; else xx += sz * 2.2 + tw;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- presets
const _presetCache = {};
const _memo = (name, o, f) => {
  const key = name + JSON.stringify(o, (k, v) => (typeof v === 'function' ? String(v) : v));
  return _presetCache[key] || (_presetCache[key] = f());
};
// Smooth deterministic value noise in [0, 1].
function vnoise(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const hsh = (i, j) => rand(i * 157 + j * 311 + seed * 1013);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hsh(xi, yi), hsh(xi + 1, yi), sx), lerp(hsh(xi, yi + 1), hsh(xi + 1, yi + 1), sx), sy);
}
const _firstFrame = (rec, from, test) => { for (let f = from; f < rec.frames.length; f++) if (test(rec.stats[f], f)) return f; return null; };
// Fast-conduction scale: the wave crosses the small sheet in well under the locked time.
const FAST = { hs: 0.06, dt: 0.0008 };

function tissuePlanar(opts = {}) {
  const o = { w: 80, h: 50, frames: 240, stimFrame: 12, from: 'left', ...opts };
  return _memo('planar', o, () => {
    const edge = o.from === 'top' ? (x, y, nx, ny) => ny < 0.1 : (x, y, nx) => nx < 0.08;
    const rec = recordTissue({ w: o.w, h: o.h, params: FAST, frames: o.frames, stepsPerFrame: 60,
      events: [{ frame: o.stimFrame, type: 'stim', region: edge }] });
    const far = (f) => { const d = rec.frames[f].data; for (let k = 0; k < (o.from === 'top' ? o.w : o.h); k++) { const i = o.from === 'top' ? (o.h - 2) * o.w + k : k * o.w + o.w - 2; if (d[i] >= 192) return true; } return false; };
    const reachFar = _firstFrame(rec, o.stimFrame, (s, f) => far(f));
    const allLocked = _firstFrame(rec, o.stimFrame, s => s.ready + s.half < 0.005);
    const waveGone = _firstFrame(rec, reachFar ?? o.stimFrame, s => s.firing === 0);
    const allReady = _firstFrame(rec, waveGone ?? o.stimFrame, s => s.ready > 0.995);
    rec.moments = { stim: o.stimFrame, reachFar, allLocked, waveGone, allReady };
    return rec;
  });
}

function tissuePatchwork(opts = {}) {
  const o = { w: 80, h: 50, frames: 300, stimFrame: 10, seed: 3, ...opts };
  return _memo('patch', o, () => {
    const rates = (x, y, nx, ny) => { const n = 0.7 * vnoise(nx * 4, ny * 2.6, o.seed) + 0.3 * vnoise(nx * 9, ny * 6, o.seed + 9); return 0.4 + 1.3 * easeIO(n); };
    // Weaker coupling than FAST so neighbouring patches can keep different recovery speeds.
    const rec = recordTissue({ w: o.w, h: o.h, params: { hs: 0.1, dt: 0.0024 }, rates, frames: o.frames, stepsPerFrame: 20,
      events: [{ frame: o.stimFrame, type: 'stim', region: (x, y, nx, ny) => ny < 0.1 }] });
    const allLocked = _firstFrame(rec, o.stimFrame, s => s.ready + s.half < 0.005);
    let patchwork = allLocked, best = -1;
    for (let f = allLocked ?? o.stimFrame; f < o.frames; f++) {
      const s = rec.stats[f], mix = Math.min(s.ready, s.half, s.locked);
      if (mix > best) { best = mix; patchwork = f; }
    }
    const allReady = _firstFrame(rec, patchwork, s => s.ready > 0.995);
    rec.moments = { stim: o.stimFrame, allLocked, patchwork, allReady };
    return rec;
  });
}

// Shared S1-S2 recipe. Returns { events, probe } for recordTissue.
function _s1s2(o) {
  const top = o.from === 'top';
  const along = (x, y) => (top ? y / (o.h - 1) : x / (o.w - 1));
  const across = (x, y) => (top ? x / (o.w - 1) : y / (o.h - 1));
  // S2 fires once the back of the S1 wave (its locked tail) has passed this far.
  const tailAt = top ? 0.4 : 0.43, s2Reach = top ? 0.58 : 0.55;
  const px = top ? Math.round(o.w * 0.75) : Math.round((o.w - 1) * tailAt), py = top ? Math.round((o.h - 1) * tailAt) : Math.round(o.h * 0.75);
  let seenFire = false;
  const events = [
    { frame: o.s1Frame, type: 'stim', region: (x, y) => along(x, y) * (top ? o.h : o.w) < 3 },
    { after: o.s1Frame + 1, type: 'stim', name: 's2', region: (x, y) => across(x, y) > 0.5 && along(x, y) < s2Reach,
      when: sim => { const c = sim.cell(px, py); if (c.u > 0.5) seenFire = true; return seenFire && c.u < TISSUE_V.uOn && c.v < TISSUE_V.v1; } },
  ];
  const s2Probe = top ? [0.75, 0.25] : [0.25, 0.75];
  return { events, s2Probe };
}
function _spiralMoments(rec, s2, probe) {
  const fireAt = f => tissueCategory(rec.frames[f].data[Math.round(probe[1] * (rec.h - 1)) * rec.w + Math.round(probe[0] * (rec.w - 1))]) === 'firing';
  const fires = [];
  for (let f = s2 + 1; f < rec.frames.length; f++) if (fireAt(f) && !fireAt(f - 1)) fires.push(f);
  const firstLap = fires.find(f => f > s2 + 5) ?? null;
  const period = fires.length > 3 ? Math.round((fires[fires.length - 1] - fires[1]) / (fires.length - 2)) : null;
  return { firstLap, period, spiralFormed: firstLap !== null ? Math.round(s2 + (firstLap - s2) * 0.55) : null };
}

function tissueSpiral(opts = {}) {
  const o = { w: 160, h: 100, frames: 900, s1Frame: 10, from: 'left', ...opts };
  return _memo('spiral', o, () => {
    const { events, s2Probe } = _s1s2(o);
    if (o.pacing) for (let f = o.pacing.from; f < o.frames; f += o.pacing.every)
      events.push({ frame: f, type: 'stim', name: 'pace', region: o.from === 'top' ? (x, y) => y < 3 : x => x < 3 });
    const rec = recordTissue({ w: o.w, h: o.h, frames: o.frames, stepsPerFrame: 12, events });
    const s2 = rec.events.find(e => e.name === 's2').firedAt;
    rec.moments = { s1: o.s1Frame, s2, ..._spiralMoments(rec, s2, s2Probe), pacing: rec.events.filter(e => e.name === 'pace').map(e => e.frame) };
    return rec;
  });
}

// Slow-recovering blobs that act as extra dead ends once the tissue turns breakup-prone.
// Breakup-prone tissue: faster recovery dynamics and a finer spatial scale (more, smaller spirals).
const BREAKUP = { eps: 0.09, hs: 0.26 };
const _deadEnds = seed => (x, y, nx, ny) => 1 - 0.45 * clamp((vnoise(nx * 6, ny * 4, seed) - 0.6) / 0.15);
function tissueFibrillation(opts = {}) {
  const o = { w: 160, h: 100, frames: 900, s1Frame: 10, from: 'left', breakFrame: 330, seed: 5, ...opts };
  return _memo('fib', o, () => {
    const { events, s2Probe } = _s1s2(o);
    events.push({ frame: o.breakFrame, type: 'params', params: BREAKUP });
    events.push({ frame: o.breakFrame, type: 'rates', fn: _deadEnds(o.seed) });
    const rec = recordTissue({ w: o.w, h: o.h, frames: o.frames, stepsPerFrame: 12, events });
    const s2 = rec.events.find(e => e.name === 's2').firedAt;
    const sp = _spiralMoments(rec, s2, s2Probe);
    const chaos = _firstFrame(rec, o.breakFrame, (s, f) => [0, 6, 12, 18].every(d => f + d < o.frames && rec.stats[f + d].fronts >= 4));
    rec.moments = { s1: o.s1Frame, s2, spiralFormed: sp.spiralFormed, firstLap: sp.firstLap, period: sp.period, breakup: o.breakFrame, chaos };
    return rec;
  });
}

function tissueShock(opts = {}) {
  const o = { w: 160, h: 100, frames: 600, shockFrame: 150, seed: 5, warm: 450, sinus: null, ...opts };
  return _memo('shock', o, () => {
    const init = sim => {
      // Warm up unrecorded: S1-S2 spiral, then breakup, so the sheet is already fibrillating at frame 0.
      sim.stimulate(x => x < 3);
      let seen = false, f = 0;
      const px = Math.round((o.w - 1) * 0.43), py = Math.round(o.h * 0.75);
      for (; f < 400; f++) {
        const c = sim.cell(px, py);
        if (c.u > 0.5) seen = true;
        if (seen && c.u < TISSUE_V.uOn && c.v < TISSUE_V.v1) break;
        sim.step(12);
      }
      sim.stimulate((x, y, nx, ny) => ny > 0.5 && nx < 0.55);
      sim.step(12 * 200);
      sim.setParams(BREAKUP); sim.setRates(_deadEnds(o.seed));
      sim.step(12 * o.warm);
    };
    // Pacemaker waves are placed relative to the frame the sheet is ready again, found during the run.
    let readyFrame = null;
    const allReadyNow = sim => { for (let i = 0; i < sim.N; i++) if (!sim.type[i] && (sim.u[i] > TISSUE_V.uOn || sim.v[i] > TISSUE_V.v2)) return false; return true; };
    // The tissue returns to normal properties at the shock, so the recovery and the waves after it are clean.
    const events = [{ frame: o.shockFrame, type: 'shock' }, { frame: o.shockFrame, type: 'params', params: { eps: TISSUE_PARAMS.eps, hs: TISSUE_PARAMS.hs } },
      { frame: o.shockFrame, type: 'rates', fn: () => 1 },
      { after: o.shockFrame + 1, type: 'call', when: allReadyNow, fn: (sim, f) => { readyFrame = f; } }];
    if (o.sinus) for (let k = 0; k < 20; k++)
      events.push({ after: o.shockFrame + 2, type: 'stim', name: 'sinus', region: x => x < 3,
        when: (sim, f) => readyFrame !== null && f === readyFrame + o.sinus.first + k * o.sinus.every });
    const rec = recordTissue({ w: o.w, h: o.h, init, frames: o.frames, stepsPerFrame: 12, events });
    const allLocked = _firstFrame(rec, o.shockFrame, s => s.ready + s.half < 0.005);
    const allReady = _firstFrame(rec, o.shockFrame, s => s.ready > 0.995);
    rec.moments = { shock: o.shockFrame, allLocked, allReady, sinus: rec.events.filter(e => e.name === 'sinus' && e.firedAt !== undefined).map(e => e.firedAt) };
    return rec;
  });
}
