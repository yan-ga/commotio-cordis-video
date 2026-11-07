// grid2d.js: clean 2D discrete-cell logic engine and diagrams (storyboard v3).
// Classic script. Load after lib.js (shared.js optional, nothing here clashes with it):
//   <script src="lib.js"></script><script src="grid2d.js"></script>
// Everything lives on window.G2. Deterministic (G2.hash, never Math.random or Date) and every draw
// call is a pure function of its arguments, so frames can render in any order.
//
// ============================================================================
// API
// ============================================================================
// COLOUR KEY (storyboard global rule 1)
//   G2.COL = { unlocked (teal-blue), half (amber), locked (red), firing (yellow-white), ink }
//   G2.key(ctx, x, y, o)              corner key: four bricks with padlocks + words. (x, y) = top-left.
//                                      o: { alpha, scale (1 = 330 x 236 px), firing: true, title }
//   G2.padlock(ctx, x, y, size, open, o)   open 0 closed, 0.5 half open, 1 open. o: { alpha, color }
//   G2.brick(ctx, x, y, w, h, st, o)   one cell. st = 'unlocked'|'half'|'locked'|'firing' or a cell
//                                      state from sim.cellAt. o: { alpha, padlock, bar, angle }
//
// TIME
//   Sim time is in "steps": one knock takes 1 step to reach the next cell. Scenes map seconds to
//   steps with G2.warp([[t0, s0], [t1, s1], ...]) (piecewise linear, clamped at both ends), so the
//   first lap can play slowly and later laps faster without changing the simulation.
//
// LAYOUTS
//   G2.gridLayout({ cols, rows, box: {x, y, w, h}, fill, fillY })   offset bricks, 6 neighbours each
//   G2.rowLayout({ n, x, y, w, h, gap, edges })                     1D row, ends knock into "nothing"
//   G2.gridXY(layout, c, r) -> [x, y]     screen point in brick units from the grid's top-left, no odd-row
//                                         offset (brick (c, r) sits at c + 0.5 on odd rows). For arrows and tags.
//   layout.idx(c, r) -> cell index (-1 outside). layout.cells[i] = { x, y, w, h, c, r }
//
// ENGINE
//   sim = G2.simulate(layout, {
//     lock: steps or (i, tFire, kind) => steps        fully locked time after firing
//     half: steps or (i, tFire, kind) => steps        half-unlocked time after that
//     init: i => ({ t, L, H }) | null                 a fire before t = 0 (sets the starting patchwork)
//     stim: [{ t, cells: [...], kind, strong, from, tag }]
//            kind 'spark' | 'fake' | 'pace' fire unlocked cells (and half ones if strong);
//            kind 'shock' fires unlocked AND half cells and re-locks locked ones (no knocks sent).
//            from 'left'|'right'|'top'|'bottom' draws an incoming knock from off the edge.
//     delay: 1, slow: 1.8 (knock time from a weak, half-unlocked fire), need: 2 (knocks within
//     `window` steps a half cell needs), until })
//   Rules: unlocked + knock = fires. Half unlocked fires only with 2+ knocks close together (or a
//   strong stimulus), and then knocks on slowly. Locked = knock ignored.
//   sim.cellAt(i, s) / sim.at(s) -> { state, level (1 locked, 0.5 half, 0 unlocked), open (padlock 0..1),
//       pulse (1 -> 0 just after a state change), fire 0..1 flash (1 step full, gone by 1.5), lockLeft 0..1
//       (lock-time bar), count (fires so far), weak }  sim.count(s) -> { unlocked, half, locked }
//   sim.fires   [{ cell, t, kind, from, n }]              every fire (n = that cell's nth fire)
//   sim.knocks  [{ from, to, t0, t1, outcome, recent, tail }]  outcome 'fires'|'ignored'|'tooWeak'|'edge'
//               recent = the target fired moments ago (the knock "behind" a wave)
//               tail = the target is locked by a fire inside this sim (the wave's own wake), not from init
//   sim.stimHits [{ cell, t, kind, outcome, state, tag }]
//   sim.knocksAt(s) active knocks with p (travel 0..1) and after (outcome anim 0..1)
//   sim.unlockTime(i, s), sim.lockEnd(i, s), sim.firesOf(i), sim.firstFire(i, after)
//   G2.rotorTracks(sim, t0, t1) -> [{ id, born, died, at(s) -> {x, y, dir} }] spinning loops found
//                                   by phase winding (used to circle and number loops)
//
// DRAWING
//   G2.drawGrid(ctx, sim, s, o)  o: { alpha, padlocks: true, bars: bool | i => bool,
//       dim: i => 0..1 alpha, knocks: 'auto' | 'fires' | 'all' | 'none' | k => bool, knockSize, tunnels: true,
//       words: false | true (write 'ignored' on bounces off cells locked from before) | 'all',
//       stimKnocks: true, stimKnockSize: 15 }
//       'auto' shows only bounces off cells that were locked from before (init), e.g. the clump; the
//       flashing bricks carry the wave. 'fires' adds the knocks that fire cells, 'all' adds the wake too.
//   G2.tag(ctx, s, x, y, o)          label on a dark pill. o: { size 32, color, alpha, to: [x, y] pointer }
//   G2.outline(ctx, layout, cells, o) dashed outline round a group; in a grid it hugs the offset-brick
//                                     staircase (o.hug false for a plain box). Returns {x0,y0,x1,y1,cx,cy}
//                                     even at alpha 0. o: { color, alpha, pad, label, labelAt }
//   G2.pathArrow(ctx, pts, p0, p1, o) smooth arrow along points, drawn from fraction p0 to p1.
//                                     o: { color, width, dash (false = solid), head (0 = none), alpha }
//   G2.chaseArrow(ctx, pts, f, o)     loop path with a bright solid stretch ending in a head at fraction f
//                                     over a faint dashed full loop (o.tail 0.35, o.ghost 0.35).
//   G2.loopMarker(ctx, x, y, r, num, s, o)  circle with a turning arrow and a number badge.
//   G2.lapBadge(ctx, x, y, lap, o)    "lap N" counter, pops when lap changes (o.pop 0..1).
//   G2.cellXY(layout, i) -> [x, y]
//
// PRESETS (each returns { layout, sim, meta }, box optional, everything else has sane defaults)
//   G2.normalWave({ cols, rows, box, from: 'left'|'top' })
//       meta: { tDie (last fire), tAllLocked, tFirstUnlock, tAllUnlocked, edgeCells }
//   G2.patchwork({ cols, rows, box, seed })
//       meta: { tMix (most even mix), tMostlyLocked, tMostlyUnlocked, trio: [i, j, k] neighbours that
//               are unlocked, half, locked at tMix, fast: [cells], slow: [cells] }
//   G2.reentryTrue({ box, patch: 0.3 })   9 x 8 (box 1180 x 760 to 1340 x 780). The fake knock fires
//       S (2 x 2, bottom). Next to it the clump K (2 x 5, touching the bottom edge) is still locked only
//       because it is behind in resetting (show its lock bars). Every knock that reaches K before step 6
//       finds it fully red and bounces ('ignored', never an amber 'too weak'). The wave climbs the column
//       left of K and goes over K's top while K turns amber then teal one row at a time from the bottom
//       up, passes straight down through K, comes out into S (unlocked again by then), fires it, and the
//       loop repeats every 11 steps. Every cell fires every lap; nothing stays still.
//       Timeline in steps: 0 hit, 1..5 bounces off K, K all red until 3.05, rows go amber 3.05..5.05 and
//       teal 3.95..5.95, 6 enters K top, 10 leaves K, 11 S fires again (lap 2), 22 lap 3, ...
//       Pacing that matches s08: cue 4 = steps 0..3.6, cue 5 = 3.6..11, cue 6 = lap 2 onwards.
//       meta: { S, K, tHit 0, tIgnored 1, kHalf / kUnlock: [per K cell], tKStillLocked (first amber),
//               tAllKUnlocked, tThrough, tOutK, tBack, laps: [S fire times], lapAt(s), period,
//               path: [[x, y], ...] the loop route (S, up the column left of K, over, down through K, S),
//               front(s) -> 0..1 fraction of path where the wave front is on the current lap
//               (pathArrow(path, 0, front(s)) in lap 1, chaseArrow(path, front(s)) after),
//               steps: [{ s, id, text }] label hooks: hit, ignored, around, unlocking, unlocked,
//               through, back, lap2, lap3 }
//   G2.takeover({ box })   16 x 8, the same loop on the left (period 11). Pacemaker beats (stimuli from
//       the top edge at meta.pace, about 14 and 26) land on just-relocked cells and are wiped out
//       (meta.wiped = fraction ignored). From tBreak (24) the slow resetters R lock for 14 steps, the
//       front breaks on them and curls into two more loops (born about 34). meta.tracks has exactly
//       three tracks: 1 the original loop, 2 and 3 the new ones; draw them with loopMarker at tr.at(s).
//       meta: { pace, wiped, tBreak, R, K, S, tracks, top, laps }
//   G2.shock({ box, tShock: 78 })   the takeover grid with its three loops; at tShock every cell flashes
//       (unlocked and half-unlocked ones fire, locked ones are re-locked), all lock for the same time,
//       the loops die, all unlock together at tAllUnlocked, then one clean wave from the top at tClean.
//       meta: { tShock, tAllUnlocked, tClean, tCleanDone, tracks, top, pace }
//   G2.smallBlowSpread({ cols, rows, box, centre: [c, r] })   a small patch fires, rings spread out.
//       meta: { patch, ring(i) -> ring number, tEdge }
//
// 1D ROW (lockout scene)
//   G2.rowSim({ n, x, y, w, h, gap, lock, half, speed: i => multiplier (>1 slow resetter),
//               start: [{ cell, t, from }], edges: true }) -> sim (sim.layout is the row)
//   G2.drawRow(ctx, sim, s, o)  o: { bars: true, words: true, knocks: 'all', labels: i => string,
//                                    tags: i => string drawn above the cell }
//
// CIRCULATION (pump scene)
//   G2.circulation(ctx, cx, cy, scale, u, o)   figure-8: lungs once on top, body once at the bottom,
//       heart in the middle (viewer's left = heart's RIGHT pump). u = blob position 0..4 along the
//       legs 0 right pump -> lungs, 1 lungs -> left pump, 2 left pump -> body, 3 body -> right pump.
//       o: { alpha, active (leg index, default floor(u); -1 = all bright), blob: true, labels: 1,
//            key: 1, legLabels: 1 }.  About 1100 x 880 px at scale 1, cy is the heart centre.
//   G2.CIRC_LEGS = ['right pump to lungs', 'lungs to left pump', 'left pump to body', 'body to right pump']
// ============================================================================
(function (root) {
'use strict';
const TAU = Math.PI * 2;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const p = cl((x - a) / (b - a)); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hash = (i, s = 1) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const FONT_ = () => (typeof FONT !== 'undefined' ? FONT : 'Helvetica, Arial, sans-serif');

const COL = { unlocked: '#2fb7da', half: '#ffa53c', locked: '#ff4d64', firing: '#fff07a', ink: 'rgba(8,14,40,0.82)', text: '#f4f1ea', dim: '#9aa6c8' };
const RGB = { unlocked: hex(COL.unlocked), half: hex(COL.half), locked: hex(COL.locked), firing: hex(COL.firing), white: [255, 255, 255], black: [0, 0, 0], glow: [255, 214, 80] };
const levelRGB = lv => (lv <= 0.5 ? mix(RGB.unlocked, RGB.half, lv * 2) : mix(RGB.half, RGB.locked, (lv - 0.5) * 2));
const NAMED = { unlocked: { level: 0, open: 1, fire: 0 }, half: { level: 0.5, open: 0.5, fire: 0 }, locked: { level: 1, open: 0, fire: 0 }, firing: { level: 1, open: 0, fire: 1 } };

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function say(ctx, s, x, y, size, color = COL.text, align = 'center', weight = 700, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${FONT_()}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y); ctx.restore();
}
function halo(ctx, x, y, r, c, a) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

// ============================================================ time
function warp(pts) {
  return t => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) {
      const [a, sa] = pts[k - 1], [b, sb] = pts[k];
      return sa + (sb - sa) * (t - a) / (b - a);
    }
    return pts[pts.length - 1][1];
  };
}

// ============================================================ layouts
function gridLayout(o) {
  const { cols, rows } = o;
  const box = o.box || { x: 200, y: 170, w: 1520, h: 740 };
  const px = box.w / (cols + 0.5), py = box.h / rows;
  const cw = px * (o.fill ?? 0.86), ch = py * (o.fillY ?? 0.76);
  const cells = [], nb = [];
  const idx = (c, r) => (c < 0 || c >= cols || r < 0 || r >= rows ? -1 : r * cols + c);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cells.push({ x: box.x + px * (c + 0.5) + (r % 2 ? px / 2 : 0), y: box.y + py * (r + 0.5), w: cw, h: ch, c, r });
    // Offset bricks: odd rows sit half a brick to the right, so each brick touches 2 above and 2 below.
    const d = r % 2 ? [0, 1] : [-1, 0];
    nb.push([idx(c - 1, r), idx(c + 1, r), idx(c + d[0], r - 1), idx(c + d[1], r - 1), idx(c + d[0], r + 1), idx(c + d[1], r + 1)].filter(j => j >= 0));
  }
  return { kind: 'grid', cols, rows, cells, nb, idx, px, py, box, n: cells.length };
}
function rowLayout(o) {
  const n = o.n, w = o.w || 130, h = o.h || 84, gap = o.gap ?? 44;
  const x0 = (o.x ?? 960) - ((n - 1) * (w + gap)) / 2;
  const cells = Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y: o.y ?? 540, w, h, c: i, r: 0 }));
  // -1 and n are "nothing there": knocks into them end with outcome 'edge'.
  const nb = cells.map((_, i) => (o.edges === false ? [i - 1, i + 1].filter(j => j >= 0 && j < n) : [i - 1, i + 1]));
  return { kind: 'row', cells, nb, n, idx: c => (c >= 0 && c < n ? c : -1), gap };
}
// Screen point in brick units from the grid's top-left (no odd-row offset), for arrows and labels.
const gridXY = (L, c, r) => [L.box.x + L.px * (c + 0.5), L.box.y + L.py * (r + 0.5)];
const cellXY = (L, i) => [L.cells[i].x, L.cells[i].y];

// ============================================================ engine
const fnOf = v => (typeof v === 'function' ? v : () => v);
function simulate(layout, o = {}) {
  const n = layout.n, nb = layout.nb;
  const lockF = fnOf(o.lock ?? 8), halfF = fnOf(o.half ?? 2);
  const delay = o.delay ?? 1, slow = o.slow ?? 1.8, until = o.until ?? 200;
  const win = o.window ?? 0.45, need = o.need ?? 2, recentWin = o.recent ?? 2.6 * delay;
  const flashLen = o.flash ?? 1.5;
  const recs = Array.from({ length: n }, (_, i) => {
    const s = o.init ? o.init(i) : null;
    return s ? [{ t: s.t, L: s.L, H: s.H ?? halfF(i, s.t), kind: 'init' }] : [];
  });
  const arrivals = Array.from({ length: n }, () => []);
  const knocks = [], fires = [], stimHits = [];
  const queue = [];
  let seq = 0;
  // Ties: stimuli before knocks, then insertion order, so the result never depends on sort stability.
  const push = e => {
    e.seq = seq++;
    let lo = 0, hi = queue.length;
    while (lo < hi) { const m = (lo + hi) >> 1; const q = queue[m]; if (q.t < e.t || (q.t === e.t && (q.pri < e.pri || (q.pri === e.pri && q.seq < e.seq)))) lo = m + 1; else hi = m; }
    queue.splice(lo, 0, e);
  };
  const lastRec = (i, t) => { const r = recs[i]; for (let k = r.length - 1; k >= 0; k--) if (r[k].t <= t + 1e-9) return r[k]; return null; };
  const stateAt = (i, t) => {
    const r = lastRec(i, t);
    if (!r) return 'unlocked';
    const d = t - r.t;
    return d < r.L ? 'locked' : d < r.L + r.H ? 'half' : 'unlocked';
  };
  const fire = (i, t, kind, from, emit = true) => {
    const rec = { t, L: lockF(i, t, kind), H: halfF(i, t, kind), kind, from, n: recs[i].filter(r => r.kind !== 'init' && r.kind !== 'relock').length + 1 };
    recs[i].push(rec);
    fires.push({ cell: i, t, kind, from, n: rec.n });
    if (!emit) return;
    const d = kind === 'weak' ? slow : delay;
    for (const j of nb[i]) {
      const k = { from: i, to: j, t0: t, t1: t + d, outcome: j < 0 || j >= n ? 'edge' : null, weak: kind === 'weak' };
      knocks.push(k);
      if (!k.outcome) push({ t: t + d, pri: 1, k });
    }
  };
  for (const s of o.stim || []) push({ t: s.t, pri: 0, s });
  let guard = 0;
  while (queue.length && guard++ < 400000) {
    const e = queue.shift();
    if (e.t > until) break;
    if (e.s) {
      const s = e.s, kind = s.kind || 'spark';
      for (const i of s.cells) {
        const st = stateAt(i, e.t);
        const r = lastRec(i, e.t);
        if (r && Math.abs(r.t - e.t) < 1e-9 && r.kind !== 'init') continue;
        let out = 'ignored';
        if (kind === 'shock') {
          if (st === 'locked') { recs[i].push({ t: e.t, L: lockF(i, e.t, 'shock'), H: halfF(i, e.t, 'shock'), kind: 'relock' }); out = 'relocked'; }
          else { fire(i, e.t, 'shock', -1, false); out = 'fires'; }
        } else if (st === 'unlocked' || (st === 'half' && s.strong)) { fire(i, e.t, kind, -1); out = 'fires'; }
        stimHits.push({ cell: i, t: e.t, kind, outcome: out, state: st, tag: s.tag, from: s.from, travel: s.travel ?? delay });
      }
      continue;
    }
    const k = e.k, j = k.to;
    const r = lastRec(j, e.t);
    if (r && Math.abs(r.t - e.t) < 1e-9 && r.kind !== 'init') { k.outcome = 'fires'; k.joined = true; continue; }
    arrivals[j].push(e.t);
    const st = stateAt(j, e.t);
    k.state = st;
    if (st === 'unlocked') { k.outcome = 'fires'; fire(j, e.t, 'normal', k.from); }
    else if (st === 'half') {
      const strength = arrivals[j].filter(a => a > e.t - win).length;
      if (strength >= need) { k.outcome = 'fires'; k.strong = true; fire(j, e.t, 'weak', k.from); }
      else { k.outcome = 'tooWeak'; k.tail = !!r && r.kind !== 'init'; }
    } else {
      k.outcome = 'ignored'; k.recent = !!r && r.kind !== 'init' && e.t - r.t < recentWin;
      // tail: the target is locked by a fire inside this simulation (the wave's own wake), not from before.
      k.tail = !!r && r.kind !== 'init';
    }
  }
  for (const k of knocks) if (!k.outcome) k.outcome = 'travel';
  knocks.sort((a, b) => a.t0 - b.t0);
  stimHits.sort((a, b) => a.t - b.t);

  function cellAt(i, t) {
    const r = lastRec(i, t);
    const out = { i, state: 'unlocked', level: 0, fire: 0, lockLeft: 0, count: 0, rec: r, weak: false };
    if (!r) return out;
    const d = t - r.t, L = r.L, H = r.H;
    out.state = d < L ? 'locked' : d < L + H ? 'half' : 'unlocked';
    // Colour changes in one clear step (a blend of amber and teal reads as a fourth, muddy state).
    // The padlock opens over a short moment instead, and `pulse` flags the change so it pops.
    out.level = out.state === 'locked' ? 1 : out.state === 'half' ? 0.5 : 0;
    const P = 0.45;
    out.open = d < L ? 0 : d < L + H ? 0.5 * sm(L, L + P, d) : 0.5 + 0.5 * sm(L + H, L + H + P, d);
    out.pulse = d >= L && d < L + P ? 1 - (d - L) / P : d >= L + H && d < L + H + P ? 1 - (d - L - H) / P : 0;
    out.lockLeft = cl((L + H - d) / (L + H));
    if (r.kind !== 'init') {
      if (r.kind !== 'relock') out.count = r.n;
      // Full brightness for about one knock step, so a wave always shows at least one bright row.
      if (d < flashLen) out.fire = Math.min(1, d / 0.06) * (1 - sm(flashLen - 0.5, flashLen, d));
      out.weak = r.kind === 'weak';
    }
    return out;
  }
  function knocksAt(t, outro = 0.75) {
    const res = [];
    for (const k of knocks) {
      if (k.t0 > t) break;
      if (t > k.t1 + outro) continue;
      const p = t <= k.t1 ? (t - k.t0) / (k.t1 - k.t0) : 1;
      res.push(Object.assign({}, k, { p, after: t > k.t1 ? (t - k.t1) / outro : 0 }));
    }
    return res;
  }
  return {
    layout, knocks, fires, stimHits, recs, delay,
    stateAt, cellAt, knocksAt,
    at: t => Array.from({ length: n }, (_, i) => cellAt(i, t)),
    firesOf: i => fires.filter(f => f.cell === i),
    firstFire: (i, after = -Infinity) => { const f = fires.find(f => f.cell === i && f.t > after); return f ? f.t : null; },
    unlockTime: (i, t) => { const r = lastRec(i, t); return r ? r.t + r.L + r.H : null; },
    lockEnd: (i, t) => { const r = lastRec(i, t); return r ? r.t + r.L : null; },
    count: t => { const c = { unlocked: 0, half: 0, locked: 0 }; for (let i = 0; i < n; i++) c[stateAt(i, t)]++; return c; },
  };
}

// ============================================================ rotor (spinning loop) detection
// A cell is the centre of a loop when the firing phase of its 6 neighbours winds once round it.
function rotorTracks(sim, t0, t1, o = {}) {
  const L = sim.layout, n = L.n, dt = o.dt ?? 0.5;
  const F = Array.from({ length: n }, () => []);
  for (const f of sim.fires) F[f.cell].push(f.t);
  const phase = (i, t) => {
    const a = F[i]; let k = -1;
    for (let q = 0; q < a.length; q++) if (a[q] <= t) k = q; else break;
    if (k < 0 || k + 1 >= a.length) return null;
    return (t - a[k]) / (a[k + 1] - a[k]);
  };
  const rings = L.cells.map((c, i) => (L.nb[i].length < 6 ? null :
    [...L.nb[i]].sort((a, b) => Math.atan2(L.cells[a].y - c.y, L.cells[a].x - c.x) - Math.atan2(L.cells[b].y - c.y, L.cells[b].x - c.x))));
  const raw = t => {
    const hits = [];
    for (let i = 0; i < n; i++) {
      const ring = rings[i]; if (!ring) continue;
      const ph = ring.map(j => phase(j, t)); if (ph.some(p => p === null)) continue;
      let w = 0; for (let k = 0; k < 6; k++) { let d = ph[(k + 1) % 6] - ph[k]; d -= Math.round(d); w += d; }
      if (Math.abs(w) > 0.5) hits.push({ i, dir: Math.sign(w) });
    }
    // Cluster neighbouring hits with the same turning direction.
    const seen = new Set(), out = [];
    for (const h of hits) {
      if (seen.has(h.i)) continue;
      const grp = [h]; seen.add(h.i);
      for (let g = 0; g < grp.length; g++) for (const j of L.nb[grp[g].i]) {
        const m = hits.find(x => x.i === j && x.dir === h.dir && !seen.has(j));
        if (m) { seen.add(j); grp.push(m); }
      }
      const x = grp.reduce((a, g) => a + L.cells[g.i].x, 0) / grp.length, y = grp.reduce((a, g) => a + L.cells[g.i].y, 0) / grp.length;
      out.push({ x, y, dir: h.dir });
    }
    return out;
  };
  const tracks = [], maxJump = (o.maxJump ?? 2.6) * L.px;
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const pts = raw(t), used = new Set();
    for (const tr of tracks) {
      if (tr.died !== null) continue;
      const last = tr.pts[tr.pts.length - 1];
      let best = -1, bd = maxJump;
      pts.forEach((p, k) => { if (used.has(k) || p.dir !== tr.dir) return; const d = Math.hypot(p.x - last.x, p.y - last.y); if (d < bd) { bd = d; best = k; } });
      if (best >= 0) { used.add(best); tr.pts.push({ t, x: pts[best].x, y: pts[best].y }); tr.miss = 0; }
      else if (++tr.miss * dt > (o.grace ?? 3)) tr.died = last.t;
    }
    pts.forEach((p, k) => { if (!used.has(k)) tracks.push({ dir: p.dir, born: t, died: null, miss: 0, pts: [{ t, x: p.x, y: p.y }] }); });
  }
  const minLife = o.minLife ?? 6;
  const keep = tracks.filter(tr => (tr.died ?? t1) - tr.born >= minLife);
  keep.forEach((tr, k) => {
    tr.id = k + 1;
    // Positions are averaged over about one turn so the circle drifts smoothly instead of jumping.
    const span = o.smooth ?? 6;
    tr.at = s => {
      const w = tr.pts.filter(p => Math.abs(p.t - s) <= span / 2);
      const use = w.length ? w : [tr.pts.reduce((a, p) => (Math.abs(p.t - s) < Math.abs(a.t - s) ? p : a))];
      return { x: use.reduce((a, p) => a + p.x, 0) / use.length, y: use.reduce((a, p) => a + p.y, 0) / use.length, dir: tr.dir };
    };
  });
  return keep;
}

// ============================================================ icons
function padlock(ctx, x, y, size, open = 0, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  open = cl(open);
  const bw = size * 0.8, bh = size * 0.6, by = y - bh * 0.1;
  const sr = size * 0.24, st = size * 0.13;
  const lift = size * 0.22 * sm(0, 0.5, open);
  const ink = o.color || COL.ink;
  ctx.save(); ctx.globalAlpha *= alpha;
  // Shackle: lifts out of the body at half open, swings away about its right leg when fully open.
  ctx.save();
  ctx.translate(x + sr, by - lift);
  ctx.rotate(-0.85 * sm(0.55, 1, open));
  ctx.translate(-sr, 0);
  ctx.strokeStyle = ink; ctx.lineWidth = st; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(-sr, bh * 0.15); ctx.lineTo(-sr, -sr * 0.7); ctx.arc(0, -sr * 0.7, sr, Math.PI, 0); ctx.lineTo(sr, bh * 0.15); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = ink;
  rr(ctx, x - bw / 2, by, bw, bh, size * 0.12); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(x, by + bh * 0.42, size * 0.075, 0, TAU); ctx.fill();
  ctx.fillRect(x - size * 0.03, by + bh * 0.42, size * 0.06, bh * 0.3);
  ctx.restore();
}

function brick(ctx, x, y, w, h, st, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  if (typeof st === 'string') st = NAMED[st];
  const fire = cl(st.fire || 0) * (st.weak ? 0.7 : 1), pulse = st.pulse || 0;
  const base = levelRGB(st.level);
  const body = mix(base, RGB.firing, fire);
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.translate(x, y); if (o.angle) ctx.rotate(o.angle);
  const k = 1 + 0.08 * fire + 0.1 * Math.sin(pulse * Math.PI); ctx.scale(k, k);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, rgba(mix(body, RGB.white, 0.22 + 0.5 * fire))); g.addColorStop(1, rgba(mix(body, RGB.black, 0.2 * (1 - fire))));
  ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, h * 0.28); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; rr(ctx, -w / 2 + 5, -h / 2 + 4, w - 10, h * 0.2, h * 0.1); ctx.fill();
  ctx.strokeStyle = fire > 0.2 ? `rgba(255,255,240,${0.6 + 0.4 * fire})` : pulse > 0 ? `rgba(255,255,255,${0.38 + 0.62 * pulse})` : 'rgba(255,255,255,0.38)';
  ctx.lineWidth = 2.5 + 3 * pulse;
  rr(ctx, -w / 2, -h / 2, w, h, h * 0.28); ctx.stroke();
  const bar = o.bar && st.lockLeft > 0.001;
  if (o.padlock !== false) {
    const ps = Math.min(h * 0.5, w * 0.36) * (o.lockScale || 1);
    padlock(ctx, 0, bar ? -h * 0.1 : 0, ps, st.open ?? 1 - st.level, { alpha: 1 - 0.6 * fire });
  }
  if (bar) {
    // Lock-time bar: how long until this cell is fully unlocked again.
    const bw = w * 0.72, bh = Math.max(7, h * 0.13), by = h / 2 - bh - h * 0.08;
    ctx.fillStyle = 'rgba(8,14,40,0.7)'; rr(ctx, -bw / 2, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, -bw / 2, by, Math.max(bh, bw * st.lockLeft), bh, bh / 2); ctx.fill();
  }
  ctx.restore();
}

function key(ctx, x, y, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const s = o.scale ?? 1;
  const items = [['Unlocked', 'unlocked'], ['Half unlocked', 'half'], ['Locked', 'locked']];
  if (o.firing !== false) items.push(['Firing', 'firing']);
  const rowH = 50 * s, top = o.title ? 46 * s : 18 * s;
  const w = 330 * s, h = top + items.length * rowH + 10 * s;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(5,10,30,0.66)'; rr(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
  if (o.title) say(ctx, o.title, x + 22 * s, y + 28 * s, 26 * s, COL.dim, 'left', 700);
  items.forEach(([label, st], k) => {
    const cy = y + top + rowH * (k + 0.5);
    if (st === 'firing') halo(ctx, x + 56 * s, cy, 44 * s, RGB.glow, 0.55);
    brick(ctx, x + 56 * s, cy, 64 * s, 38 * s, st, { lockScale: 1.05 });
    say(ctx, label, x + 104 * s, cy + 1, 30 * s, COL.text, 'left', 700);
  });
  ctx.restore();
  return { w, h };
}

function tag(ctx, s, x, y, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const size = o.size || 32, color = o.color || COL.text;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${FONT_()}`;
  const w = ctx.measureText(s).width + size * 0.9, h = size * 1.5;
  if (o.to) {
    ctx.strokeStyle = o.lineColor || color; ctx.lineWidth = 3; ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(o.to[0], o.to[1]); ctx.stroke();
    ctx.fillStyle = o.lineColor || color; ctx.beginPath(); ctx.arc(o.to[0], o.to[1], 6, 0, TAU); ctx.fill();
    ctx.globalAlpha /= 0.85;
  }
  ctx.fillStyle = 'rgba(6,11,34,0.86)'; rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  if (o.border !== false) { ctx.strokeStyle = o.borderColor || color; ctx.globalAlpha *= 0.55; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
  say(ctx, s, x, y + 1, size, color, 'center', 700, alpha);
}

// Offset rows make a group of bricks a staircase, and a plain box round it cuts through the bricks
// beside it. This traces the staircase instead: one band per row, joined halfway between rows.
// Returns null (use a box) unless the rows are consecutive and each row's bricks are side by side.
function hugPolygon(L, cells, pad) {
  const rows = new Map();
  for (const i of cells) { const c = L.cells[i]; if (!rows.has(c.r)) rows.set(c.r, []); rows.get(c.r).push(c); }
  const rs = [...rows.keys()].sort((a, b) => a - b);
  if (rs[rs.length - 1] - rs[0] !== rs.length - 1) return null;
  const band = rs.map((r, k) => {
    const cs = rows.get(r).sort((a, b) => a.c - b.c);
    if (cs[cs.length - 1].c - cs[0].c !== cs.length - 1) return null;
    const y = cs[0].y, h = cs[0].h;
    return { x0: cs[0].x - cs[0].w / 2 - pad, x1: cs[cs.length - 1].x + cs[cs.length - 1].w / 2 + pad,
      y0: k === 0 ? y - h / 2 - pad : y - L.py / 2, y1: k === rs.length - 1 ? y + h / 2 + pad : y + L.py / 2 };
  });
  if (band.includes(null)) return null;
  const pts = [];
  for (const b of band) pts.push([b.x1, b.y0], [b.x1, b.y1]);
  for (const b of band.slice().reverse()) pts.push([b.x0, b.y1], [b.x0, b.y0]);
  // Drop repeated and in-line points so every corner is a real corner.
  const out = [];
  for (const p of pts) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 0.5) out.push(p);
  if (Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.5) out.pop();
  return out.filter((p, k) => {
    const a = out[(k + out.length - 1) % out.length], b = out[(k + 1) % out.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 0.5;
  });
}
function roundPoly(ctx, pts, r) {
  const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const m0 = mid(pts[n - 1], pts[0]); ctx.moveTo(m0[0], m0[1]);
  for (let k = 0; k < n; k++) {
    const p = pts[k], a = pts[(k + n - 1) % n], b = pts[(k + 1) % n];
    const rk = Math.min(r, Math.hypot(p[0] - a[0], p[1] - a[1]) / 2, Math.hypot(b[0] - p[0], b[1] - p[1]) / 2);
    ctx.arcTo(p[0], p[1], b[0], b[1], rk);
  }
  ctx.closePath();
}
function outline(ctx, L, cells, o = {}) {
  const alpha = o.alpha ?? 1;
  if (!cells.length) return null;
  const pad = o.pad ?? 12;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of cells) { const c = L.cells[i]; x0 = Math.min(x0, c.x - c.w / 2); x1 = Math.max(x1, c.x + c.w / 2); y0 = Math.min(y0, c.y - c.h / 2); y1 = Math.max(y1, c.y + c.h / 2); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const box = { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  // The box is returned even when invisible, so callers can aim pointers at it.
  if (alpha <= 0) return box;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.strokeStyle = o.color || '#ffffff'; ctx.lineWidth = o.width || 4; ctx.setLineDash(o.dash || [14, 10]);
  ctx.lineDashOffset = o.dashOffset || 0;
  const poly = L.kind === 'grid' && o.hug !== false ? hugPolygon(L, cells, pad) : null;
  if (poly) roundPoly(ctx, poly, 16); else rr(ctx, x0, y0, x1 - x0, y1 - y0, 18);
  ctx.stroke();
  ctx.restore();
  if (o.label) {
    const at = o.labelAt || 'top';
    const p = at === 'top' ? [box.cx, y0 - 34] : at === 'bottom' ? [box.cx, y1 + 34] : at === 'left' ? [x0 - 20, box.cy] : [x1 + 20, box.cy];
    tag(ctx, o.label, p[0] + (o.labelDx || 0), p[1] + (o.labelDy || 0), { color: o.color, alpha, size: o.labelSize || 32 });
  }
  return box;
}

// Catmull-Rom through pts, sampled densely, drawn from fraction p0 to p1 of its length.
function pathPoints(pts, closed) {
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let k = 1; k < P.length - 2; k++) for (let q = 0; q < 16; q++) {
    const t = q / 16, a = P[k - 1], b = P[k], c = P[k + 1], d = P[k + 2];
    const f = (i) => 0.5 * ((2 * b[i]) + (-a[i] + c[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t * t + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t * t * t);
    out.push([f(0), f(1)]);
  }
  out.push(closed ? pts[0] : pts[pts.length - 1]);
  return out;
}
function pathArrow(ctx, pts, p0, p1, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0 || p1 <= p0) return;
  const S = pathPoints(pts, o.closed);
  const len = [0]; for (let k = 1; k < S.length; k++) len.push(len[k - 1] + Math.hypot(S[k][0] - S[k - 1][0], S[k][1] - S[k - 1][1]));
  const T = len[len.length - 1];
  const at = f => { const d = f * T; let k = 1; while (k < len.length - 1 && len[k] < d) k++; const u = (d - len[k - 1]) / (len[k] - len[k - 1] || 1); return [S[k - 1][0] + (S[k][0] - S[k - 1][0]) * u, S[k - 1][1] + (S[k][1] - S[k - 1][1]) * u]; };
  const col = o.color || '#ffffff', wd = o.width || 7;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.dash !== false) ctx.setLineDash(o.dash || [18, 14]);
  if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; }
  ctx.beginPath();
  const N = 120; const e = p1 - (o.head ?? 26) / T;
  for (let k = 0; k <= N; k++) { const f = p0 + (Math.max(p0, e) - p0) * k / N; const q = at(f); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  ctx.stroke(); ctx.setLineDash([]);
  const a = at(p1), b = at(Math.max(p0, p1 - 0.01)), ang = Math.atan2(a[1] - b[1], a[0] - b[0]), hd = o.head ?? 26;
  if (hd > 0) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] - Math.cos(ang - 0.5) * hd, a[1] - Math.sin(ang - 0.5) * hd); ctx.lineTo(a[0] - Math.cos(ang + 0.5) * hd, a[1] - Math.sin(ang + 0.5) * hd); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  return at;
}

// A loop path (start and end at the same spot) with the arrow head at fraction f: a faint full loop
// plus a bright solid stretch trailing the head, wrapping past the start, so a repeating wave reads as
// one thing going round. o: pathArrow options plus { tail: 0.35 (fraction of the loop), ghost: 0.35 }
function chaseArrow(ctx, pts, f, o = {}) {
  const alpha = o.alpha ?? 1, tail = o.tail ?? 0.35;
  if (alpha <= 0) return;
  const base = Object.assign({}, o, { alpha: alpha * (o.ghost ?? 0.35), head: 0, dash: [10, 14] });
  pathArrow(ctx, pts, 0, 1, base);
  const solid = Object.assign({ dash: false }, o);
  if (f - tail < 0) pathArrow(ctx, pts, 1 + f - tail, 1, Object.assign({}, solid, { head: 0 }));
  pathArrow(ctx, pts, Math.max(0, f - tail), Math.max(f, 0.001), solid);
}

function loopMarker(ctx, x, y, r, num, s, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const col = o.color || '#ffffff', dir = o.dir || 1;
  const rot = (o.spin ?? 0.5) * s * dir;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const a0 = rot + k * Math.PI, a1 = a0 + dir * Math.PI * 0.72;
    ctx.beginPath(); ctx.arc(0, 0, r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    const hx = Math.cos(a1) * r, hy = Math.sin(a1) * r, ta = a1 + dir * Math.PI / 2;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(hx + Math.cos(ta) * 16, hy + Math.sin(ta) * 16);
    ctx.lineTo(hx + Math.cos(ta + 2.4) * 13, hy + Math.sin(ta + 2.4) * 13);
    ctx.lineTo(hx + Math.cos(ta - 2.4) * 13, hy + Math.sin(ta - 2.4) * 13); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (num !== null && num !== undefined) {
    const bx = x + r * 0.72, by = y - r * 0.72;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, by, 24, 0, TAU); ctx.fill(); ctx.restore();
    say(ctx, String(num), bx, by + 1, 30, '#0a1230', 'center', 800, alpha);
  }
}

function lapBadge(ctx, x, y, lap, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const pop = o.pop ?? 1, k = 1 + 0.25 * Math.sin(cl(pop) * Math.PI);
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(6,11,34,0.88)'; rr(ctx, -110, -42, 220, 84, 42); ctx.fill();
  ctx.strokeStyle = o.color || '#ffe680'; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  say(ctx, (o.word || 'lap') + ' ' + lap, x, y + 2, 44 * k, o.color || '#ffe680', 'center', 800, alpha);
}

// ============================================================ drawing the grid
function edgePt(c, tx, ty, inset = 1) {
  const dx = tx - c.x, dy = ty - c.y, Ld = Math.hypot(dx, dy) || 1, ux = dx / Ld, uy = dy / Ld;
  const e = 1 / Math.max(Math.abs(ux) / (c.w / 2), Math.abs(uy) / (c.h / 2), 1e-6);
  return [c.x + ux * e * inset, c.y + uy * e * inset];
}
function knockDot(ctx, x, y, r, a, col = RGB.glow) {
  if (a <= 0) return;
  halo(ctx, x, y, r * 3, col, 0.75 * a);
  ctx.fillStyle = `rgba(255,252,232,${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
// One knock from cell a to cell b (or an off-grid point b with no w).
function drawKnock(ctx, a, b, k, o = {}) {
  const r = o.size || 11;
  const start = a.w ? (o.fromCentre ? [a.x + (b.x - a.x) * 0.25, a.y + (b.y - a.y) * 0.25] : edgePt(a, b.x, b.y, 0.9)) : [a.x, a.y];
  const end = b.w ? edgePt(b, a.x, a.y, 1.0) : [b.x, b.y];
  const dx = end[0] - start[0], dy = end[1] - start[1], Ld = Math.hypot(dx, dy) || 1, ux = dx / Ld, uy = dy / Ld;
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
  if (k.p < 1) {
    const q = k.p * k.p * (3 - 2 * k.p);
    for (let s = 3; s >= 1; s--) { const qq = Math.max(0, q - s * 0.07); knockDot(ctx, start[0] + dx * qq, start[1] + dy * qq, r * (1 - s * 0.18), 0.22 * (4 - s) / 3); }
    knockDot(ctx, start[0] + dx * q, start[1] + dy * q, r, 1);
  } else {
    const f = k.after;
    if (k.outcome === 'ignored' || k.outcome === 'tooWeak') {
      // Bounce: the knock squashes against the locked cell, springs back and fades, with a cross.
      const col = k.outcome === 'ignored' ? [255, 120, 140] : [255, 190, 100];
      const back = Math.sin(Math.min(1, f * 1.3) * Math.PI) * r * 2.6;
      const sq = 1 - 0.45 * Math.sin(Math.min(1, f * 2.5) * Math.PI);
      ctx.save(); ctx.translate(end[0] - ux * (r * 0.7 + back), end[1] - uy * (r * 0.7 + back)); ctx.rotate(Math.atan2(uy, ux)); ctx.scale(sq, 1 / sq);
      knockDot(ctx, 0, 0, r * 1.1, Math.max(0, 1 - f * 1.1));
      ctx.restore();
      const ang = Math.atan2(uy, ux), xa = Math.max(0, 1 - sm(0.55, 1, f)) * cl(f * 6);
      ctx.strokeStyle = rgba(col, 0.95 * (1 - f)); ctx.lineWidth = 5 * (1 - f) + 2;
      ctx.beginPath(); ctx.arc(end[0], end[1], r * (1.2 + f * 2.2), ang + Math.PI * 0.55, ang + Math.PI * 1.45); ctx.stroke();
      if (o.cross !== false && xa > 0) {
        const cx = end[0] - ux * r * 3.2 - uy * r * 2.2, cy = end[1] - uy * r * 3.2 + ux * r * 2.2, d = r * 0.85;
        ctx.lineCap = 'round'; ctx.lineWidth = r * 0.55;
        ctx.strokeStyle = `rgba(10,16,44,${0.8 * xa})`; ctx.beginPath(); ctx.arc(cx, cy, d * 1.6, 0, TAU); ctx.fillStyle = `rgba(10,16,44,${0.8 * xa})`; ctx.fill();
        ctx.strokeStyle = rgba(col, xa); ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
      }
    } else if (k.outcome === 'edge') {
      for (let i = 0; i < 5; i++) {
        const an = Math.atan2(uy, ux) + (i - 2) * 0.45, d = f * r * 3.5;
        knockDot(ctx, end[0] + Math.cos(an) * d, end[1] + Math.sin(an) * d, r * 0.4 * (1 - f), (1 - f) * 0.8);
      }
    }
  }
  ctx.restore();
  if (o.word && k.p >= 1) {
    const f = k.after, la = (o.alpha ?? 1) * Math.min(cl(f * 5), 1 - sm(0.8, 1, f));
    const word = typeof o.word === 'string' ? o.word : { ignored: 'ignored', tooWeak: 'too weak', edge: 'nothing left', fires: '' }[k.outcome];
    if (word) say(ctx, word, end[0], end[1] - (b.h || 50) * 0.5 - 30 - f * 10, o.wordSize || 30, k.outcome === 'ignored' ? '#ffc2cb' : COL.dim, 'center', 700, la);
  }
}
const OFF = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
function drawStimKnocks(ctx, sim, s, o = {}) {
  const L = sim.layout;
  for (const h of sim.stimHits) {
    if (!h.from || s < h.t - h.travel || s > h.t + 0.75) continue;
    const c = L.cells[h.cell], d = OFF[h.from];
    const dist = (d[0] ? L.px || c.w + (L.gap || 40) : L.py || c.h + 40) * 0.9;
    const a = { x: c.x + d[0] * dist, y: c.y + d[1] * dist };
    const p = s <= h.t ? 1 - (h.t - s) / h.travel : 1;
    drawKnock(ctx, a, c, { p, after: s > h.t ? (s - h.t) / 0.75 : 0, outcome: h.outcome === 'fires' ? 'fires' : 'ignored' }, { size: o.stimKnockSize || 15, alpha: o.alpha, word: o.stimWord });
  }
}
function drawGrid(ctx, sim, s, o = {}) {
  const L = sim.layout, alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const st = sim.at(s);
  const dimOf = i => alpha * (o.dim ? o.dim(i) : 1);
  const barOf = typeof o.bars === 'function' ? o.bars : () => !!o.bars;
  if (o.tunnels !== false) {
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < L.n; i++) for (const j of L.nb[i]) {
      if (j < i || j < 0 || j >= L.n) continue;
      const a = L.cells[i], b = L.cells[j];
      ctx.globalAlpha = Math.min(dimOf(i), dimOf(j)) * 0.5;
      ctx.strokeStyle = 'rgba(190,205,240,0.55)'; ctx.lineWidth = Math.min(a.h, b.h) * 0.16;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }
  for (let i = 0; i < L.n; i++) if (st[i].fire > 0) {
    const c = L.cells[i];
    ctx.save(); ctx.globalAlpha = dimOf(i); halo(ctx, c.x, c.y, Math.max(c.w, c.h) * 1.0, RGB.glow, 0.85 * st[i].fire * (st[i].weak ? 0.6 : 1)); ctx.restore();
  }
  for (let i = 0; i < L.n; i++) {
    const c = L.cells[i];
    brick(ctx, c.x, c.y, c.w, c.h, st[i], { alpha: dimOf(i), padlock: o.padlocks !== false, bar: barOf(i), lockScale: o.lockScale });
  }
  const mode = o.knocks ?? 'auto';
  if (mode !== 'none') {
    // In a grid the flashing bricks already show the wave, and six dots per brick read as bubbles,
    // so 'auto' keeps only the knocks the story needs: bounces off cells that were locked before.
    const bounce = k => (k.outcome === 'ignored' || k.outcome === 'tooWeak') && !k.tail;
    const show = typeof mode === 'function' ? mode
      : mode === 'all' ? () => true
      : mode === 'fires' ? k => k.outcome === 'fires' || k.outcome === 'travel' || bounce(k)
      : bounce;
    for (const k of sim.knocksAt(s)) {
      if (!show(k)) continue;
      if (k.to < 0 || k.to >= L.n) {
        const a = L.cells[k.from], dir = k.to < 0 ? -1 : 1;
        // A knock off the end the signal came in from would say "nothing left" at the wrong end.
        const f = sim.fires.find(q => q.cell === k.from && q.t === k.t0);
        const h = f && f.from < 0 && sim.stimHits.find(q => q.cell === k.from && q.t === k.t0);
        const back = f && (f.from >= 0 ? Math.sign(f.from - k.from) : h && h.from === 'left' ? -1 : h && h.from === 'right' ? 1 : 0);
        if (back === dir) continue;
        drawKnock(ctx, a, { x: a.x + dir * (a.w / 2 + (L.gap || 40) + 30), y: a.y }, k, { size: o.knockSize, alpha: alpha, word: !!o.words });
        continue;
      }
      drawKnock(ctx, L.cells[k.from], L.cells[k.to], k, { size: o.knockSize, alpha: Math.min(dimOf(k.from), dimOf(k.to)), word: o.words === 'all' ? true : !!o.words && !k.recent, fromCentre: L.kind === 'grid' });
    }
  }
  if (o.stimKnocks !== false) drawStimKnocks(ctx, sim, s, o);
}

// ============================================================ presets
function normalWave(o = {}) {
  const cols = o.cols ?? 12, rows = o.rows ?? 8;
  const layout = gridLayout({ cols, rows, box: o.box });
  const from = o.from || 'left';
  const edge = [];
  for (let i = 0; i < layout.n; i++) { const c = layout.cells[i]; if (from === 'left' ? c.c === 0 : c.r === 0) edge.push(i); }
  const span = from === 'left' ? cols : rows;
  const Lk = o.lock ?? span * 2.2, Hf = o.half ?? span * 0.35, jit = o.jitter ?? 0.05, catchUp = o.catchUp ?? 0.6;
  const sim = simulate(layout, {
    // Cells the wave reaches later reset a little sooner (as in a real heart), so the sheet unlocks nearly together.
    lock: (i, t) => Lk * (1 + jit * (2 * hash(i, 7) - 1)) - catchUp * Math.max(0, t),
    half: Hf, stim: [{ t: o.t0 ?? 0, cells: edge, kind: 'pace', from }], until: o.until ?? span * 5,
  });
  const ft = sim.fires.map(f => f.t);
  const tDie = Math.max(...ft);
  const un = layout.cells.map((_, i) => sim.unlockTime(i, tDie + 0.01));
  const lk = layout.cells.map((_, i) => sim.lockEnd(i, tDie + 0.01));
  return { layout, sim, meta: { tDie, tAllLocked: tDie + 0.2, tFirstUnlock: Math.min(...lk), tAllHalf: Math.max(...lk), tFirstFree: Math.min(...un), tAllUnlocked: Math.max(...un), edgeCells: edge } };
}

function patchwork(o = {}) {
  const cols = o.cols ?? 12, rows = o.rows ?? 8, seed = o.seed ?? 3;
  const layout = gridLayout({ cols, rows, box: o.box });
  const edge = layout.cells.map((c, i) => (c.c === 0 ? i : -1)).filter(i => i >= 0);
  // Reset speed differs cell to cell: about a third fast, a third slow resetters.
  const speed = i => { const h = hash(i, seed); return h < 0.33 ? 0.72 : h < 0.66 ? 1 : 1.32; };
  const Lb = o.lock ?? 16, Hb = o.half ?? 5;
  const sim = simulate(layout, { lock: i => Lb * speed(i), half: i => Hb * speed(i), stim: [{ t: 0, cells: edge, kind: 'pace', from: 'left' }], until: 80 });
  let best = null;
  for (let t = cols; t < cols + Lb * 2; t += 0.25) {
    const c = sim.count(t), m = Math.min(c.unlocked, c.half, c.locked);
    if (!best || m > best.m) best = { t, m };
  }
  const tMix = best.t;
  let trio = null;
  for (let r = 1; r < rows - 1 && !trio; r++) for (let c = 1; c < cols - 3 && !trio; c++) {
    const ids = [layout.idx(c, r), layout.idx(c + 1, r), layout.idx(c + 2, r)];
    if (new Set(ids.map(i => sim.stateAt(i, tMix))).size === 3) trio = ids;
  }
  let tL = null, tU = null;
  for (let t = cols; t < 80; t += 0.25) {
    const c = sim.count(t);
    if (tL === null && c.locked / layout.n >= 0.9) tL = t;
    if (tU === null && c.unlocked / layout.n >= 0.9) tU = t;
  }
  const fast = [], slow = [];
  for (let i = 0; i < layout.n; i++) (speed(i) < 1 ? fast : speed(i) > 1 ? slow : []).push(i);
  return { layout, sim, meta: { tMix, tMostlyLocked: tL, tMostlyUnlocked: tU, trio, fast, slow, speed } };
}

// The re-entry geometry shared by reentryTrue, takeover and shock. 8 rows; the clump K is 2 bricks
// wide, rows 3 to 7, touching the bottom edge; the hit S is the 2 x 2 patch just left of K's bottom.
// K unlocks from the bottom up while the wave climbs the left side, so the wave comes over K's top,
// passes straight down through it and comes out into S.
// K's timing is chosen so every knock that reaches it before s = 6 finds it fully locked (red, a clean
// "ignored" bounce, never an amber "too weak" one): left-side knocks land on rows 7 and 6 at 1, row 5 at 2,
// row 4 at 3 and 4, row 3 at 4 and 5. K stays all red until about 3, then each row goes amber for kH and
// teal, bottom row first, every kStep; the top row is free at k0, just before the wave arrives at 6.
const LOOP = { LK: 9, HK: 1.5, k0: 5.95, kStep: 0.5, kH: 0.9 };
function loopGeometry(layout) {
  const I = (c, r) => layout.idx(c, r);
  const K = []; for (let r = 3; r <= 7; r++) for (let c = 5; c <= 6; c++) K.push(I(c, r));
  const S = [I(3, 6), I(4, 6), I(3, 7), I(4, 7)];
  const kFree = i => LOOP.k0 - LOOP.kStep * (layout.cells[i].r - 3);
  const Kset = new Set(K);
  const kInit = i => (Kset.has(i) ? { t: kFree(i) - LOOP.LK - LOOP.kH, L: LOOP.LK, H: LOOP.kH } : null);
  return { I, K, S, Kset, kFree, kInit };
}
// Times the hit patch S fires, one per lap (S's four cells fire within a step of each other).
function lapTimes(sim, S) {
  const t = sim.fires.filter(f => S.includes(f.cell)).map(f => f.t).sort((a, b) => a - b);
  const laps = [];
  for (const x of t) if (!laps.length || x - laps[laps.length - 1] > 3) laps.push(x);
  return laps;
}

function reentryTrue(o = {}) {
  const cols = 9, rows = 8;
  const layout = gridLayout({ cols, rows, box: o.box });
  const G = loopGeometry(layout), { K, S, Kset, kFree, kInit } = G;
  const Sset = new Set(S);
  const base = { lock: LOOP.LK, half: LOOP.HK, until: o.until ?? 80, stim: [{ t: 0, cells: S, kind: 'fake', tag: 'hit' }] };
  // A light patchwork elsewhere: some half-unlocked (amber) cells, each fully free before the wave
  // reaches it, so the only thing in the wave's way is the clump.
  const patch = o.patch ?? 0.3;
  const first = simulate(layout, Object.assign({}, base, { init: kInit, until: 14 }));
  const init = i => {
    if (Kset.has(i)) return kInit(i);
    if (Sset.has(i) || hash(i, 11) > patch) return null;
    const arrive = first.firstFire(i, -1) ?? 14;
    const free = Math.max(0.6, arrive * (0.2 + 0.3 * hash(i, 12)));
    return { t: -LOOP.LK - 2, L: LOOP.LK, H: free + 2 };
  };
  const sim = simulate(layout, Object.assign({}, base, { init }));
  const kUnlock = K.map(kFree);
  const kFires = K.map(i => sim.firstFire(i, 0.5));
  const tThrough = Math.min(...kFires), tOutK = Math.max(...kFires);
  const laps = lapTimes(sim, S);
  const lapAt = s => laps.filter(t => t <= s + 1e-9).length;
  const P = (c, r) => gridXY(layout, c, r);
  // The loop as an arrow along the route the wave really takes: up the column just left of the clump,
  // over its top, straight down through it, back into S. front(s) puts the arrow head on the wave front:
  // each route point takes the firing time of the brick under it on the current lap (lap 1 climbs a
  // step sooner than later laps, so the times are read per lap, not fixed).
  const route = [[4.0, 6.5], [4.0, 5.0], [4.0, 4.0], [4.1, 3.0], [4.5, 2.1], [5.3, 1.85],
    [5.75, 2.8], [5.75, 4.0], [5.75, 5.0], [5.75, 6.0], [5.5, 6.85], [4.7, 7.0], [4.0, 6.5]];
  const path = route.map(q => P(q[0], q[1]));
  const S16 = pathPoints(path, false), acc = [0];
  for (let k = 1; k < S16.length; k++) acc.push(acc[k - 1] + Math.hypot(S16[k][0] - S16[k - 1][0], S16[k][1] - S16[k - 1][1]));
  const fracAt = route.map((_, k) => acc[Math.min(acc.length - 1, k * 16)] / acc[acc.length - 1]);
  const period = laps[2] - laps[1];
  const under = path.map(([x, y]) => {
    let best = 0, bd = Infinity;
    layout.cells.forEach((c, i) => { const d = Math.hypot((c.x - x) / layout.px, (c.y - y) / layout.py); if (d < bd) { bd = d; best = i; } });
    return best;
  });
  const lapRoute = [];
  const routeTimes = lap => {
    if (lapRoute[lap]) return lapRoute[lap];
    const t0 = laps[lap - 1], T = (laps[lap] ?? t0 + period) - t0;
    const ts = under.map((i, k) => (k === 0 ? 0 : k === under.length - 1 ? T : (sim.firstFire(i, t0 - 0.5) ?? t0 + T) - t0));
    for (let k = 1; k < ts.length; k++) ts[k] = Math.min(T, Math.max(ts[k], ts[k - 1] + 0.05));
    return (lapRoute[lap] = ts);
  };
  const front = s => {
    const lap = Math.max(1, lapAt(s)), ts = routeTimes(lap), u = cl(s - laps[lap - 1], 0, ts[ts.length - 1]);
    for (let k = 1; k < ts.length; k++) if (u <= ts[k]) return fracAt[k - 1] + (fracAt[k] - fracAt[k - 1]) * (u - ts[k - 1]) / (ts[k] - ts[k - 1]);
    return 1;
  };
  const kHalf = kUnlock.map(t => t - LOOP.kH);
  const steps = [
    { s: 0, id: 'hit', text: 'a fake knock' },
    { s: 1, id: 'ignored', text: 'still locked: ignored' },
    { s: 1.5, id: 'around', text: 'going around' },
    { s: Math.min(...kHalf), id: 'unlocking', text: 'unlocking one by one' },
    { s: Math.max(...kUnlock), id: 'unlocked', text: 'now unlocked' },
    { s: tThrough, id: 'through', text: 'straight through' },
    { s: laps[1], id: 'back', text: 'back to the start: ready again' },
    { s: laps[1], id: 'lap2', text: 'lap 2' },
    { s: laps[2], id: 'lap3', text: 'lap 3' },
  ];
  return { layout, sim, meta: { S, K, tHit: 0, tIgnored: 1, kHalf, kUnlock, tKStillLocked: Math.min(...kHalf), tAllKUnlocked: Math.max(...kUnlock), tThrough, tOutK, tBack: laps[1], laps, lapAt, path, front, steps, period } };
}

// 16 x 8: the same loop, plus slow resetters further right (R) that make its front break up.
function loopField(o, extraStim = [], lockAfter = null) {
  const cols = 16, rows = 8;
  const layout = gridLayout({ cols, rows, box: o.box });
  const G = loopGeometry(layout);
  const tBreak = o.tBreak ?? 24, LR = o.slowLock ?? 14;
  const R = [];
  for (const g of o.slow || [{ c0: 9, w: 3, r0: 5, r1: 7 }, { c0: 12, w: 2, r0: 0, r1: 1 }])
    for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c < g.c0 + g.w; c++) R.push(G.I(c, r));
  const Rset = new Set(R);
  const lock = (i, t, kind) => (lockAfter && t >= lockAfter.t - 1e-9 ? lockAfter.L : Rset.has(i) && t > tBreak ? LR : LOOP.LK);
  const half = (i, t) => (lockAfter && t >= lockAfter.t - 1e-9 ? lockAfter.H : LOOP.HK);
  const sim = simulate(layout, { lock, half, init: G.kInit, until: o.until ?? 140, stim: [{ t: 0, cells: G.S, kind: 'fake' }, ...extraStim] });
  return { layout, sim, G, R, tBreak };
}
const topRow = layout => layout.cells.map((c, i) => (c.r === 0 ? i : -1)).filter(i => i >= 0);
// Pacemaker beats are timed to land just after the loop's wave has swept the top row, so they meet
// freshly re-locked cells and are wiped out.
function paceTimes(o, wants) {
  const probe = loopField(o);
  const top = topRow(probe.layout), out = [];
  for (const want of wants) {
    let best = want, bv = -1;
    for (let t = want - 4; t <= want + 4; t += 0.25) { const v = top.filter(i => probe.sim.stateAt(i, t) === 'locked').length; if (v > bv) { bv = v; best = t; } }
    out.push(best);
  }
  return out;
}
function takeover(o = {}) {
  const pace = o.pace || paceTimes(o, o.paceAt || [13, 26]);
  const probe = loopField(o);
  const top = topRow(probe.layout);
  const F = loopField(o, pace.map(t => ({ t, cells: top, kind: 'pace', from: 'top', travel: 1.2, tag: 'pacemaker' })));
  const tracks = rotorTracks(F.sim, 6, (o.until ?? 140) - 8, { minLife: 15, grace: 6, maxJump: 3 });
  const wiped = pace.map(t => F.sim.stimHits.filter(h => h.t === t && h.outcome !== 'fires').length / top.length);
  return { layout: F.layout, sim: F.sim, meta: { pace, wiped, tBreak: F.tBreak, R: F.R, K: F.G.K, S: F.G.S, tracks, top, laps: lapTimes(F.sim, F.G.S) } };
}
function shock(o = {}) {
  const pace = o.pace || paceTimes(o, o.paceAt || [13, 26]);
  const tShock = o.tShock ?? 78, LS = o.shockLock ?? 9, HS = o.shockHalf ?? 1.5;
  const probe = loopField(o);
  const all = probe.layout.cells.map((_, i) => i), top = topRow(probe.layout);
  const tAllUnlocked = tShock + LS + HS, tClean = o.tClean ?? tAllUnlocked + 2.5;
  const F = loopField(Object.assign({}, o, { until: tClean + 20 }), [
    ...pace.map(t => ({ t, cells: top, kind: 'pace', from: 'top', travel: 1.2 })),
    { t: tShock, cells: all, kind: 'shock' },
    { t: tClean, cells: top, kind: 'pace', from: 'top', travel: 1.2 },
  ], { t: tShock, L: LS, H: HS });
  const tracks = rotorTracks(F.sim, 6, tShock, { minLife: 15, grace: 6, maxJump: 3 });
  const clean = F.sim.fires.filter(f => f.t >= tClean);
  return { layout: F.layout, sim: F.sim, meta: { tShock, tAllUnlocked, tClean, tCleanDone: Math.max(...clean.map(f => f.t)), tracks, top, pace } };
}

function smallBlowSpread(o = {}) {
  const cols = o.cols ?? 14, rows = o.rows ?? 8;
  const layout = gridLayout({ cols, rows, box: o.box });
  const [cc, cr] = o.centre || [6, 4];
  const I = (c, r) => layout.idx(c, r);
  const patch = [I(cc, cr), I(cc + 1, cr), I(cc, cr - 1)].filter(i => i >= 0);
  const sim = simulate(layout, { lock: o.lock ?? 14, half: o.half ?? 3, stim: [{ t: 0, cells: patch, kind: 'fake', tag: 'hit' }], until: 40 });
  const ring = i => { const t = sim.firstFire(i, -1); return t === null ? null : Math.round(t); };
  return { layout, sim, meta: { patch, ring, tEdge: Math.max(...sim.fires.map(f => f.t)) } };
}

// ============================================================ 1D row
function rowSim(o = {}) {
  const n = o.n ?? 10;
  const layout = rowLayout({ n, x: o.x, y: o.y, w: o.w, h: o.h, gap: o.gap, edges: o.edges });
  const speed = o.speed || (() => 1);
  const Lb = o.lock ?? 4, Hb = o.half ?? 1.2;
  const stim = (o.start || [{ cell: 0, t: 0, from: 'left' }]).map(s => ({ t: s.t, cells: [s.cell], kind: s.kind || 'spark', from: s.from, strong: s.strong, travel: s.travel ?? 1 }));
  return simulate(layout, { lock: i => Lb * speed(i), half: i => Hb * speed(i), stim, delay: o.delay ?? 1, init: o.init, until: o.until ?? 60, recent: o.recent });
}
function drawRow(ctx, sim, s, o = {}) {
  const L = sim.layout, alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'round';
  for (let i = 0; i < L.n - 1; i++) {
    const a = L.cells[i], b = L.cells[i + 1];
    ctx.strokeStyle = 'rgba(190,205,240,0.55)'; ctx.lineWidth = a.h * 0.26;
    ctx.beginPath(); ctx.moveTo(a.x + a.w / 2 - 4, a.y); ctx.lineTo(b.x - b.w / 2 + 4, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(15,25,60,0.85)'; ctx.lineWidth = a.h * 0.11;
    ctx.beginPath(); ctx.moveTo(a.x + a.w / 2 - 4, a.y); ctx.lineTo(b.x - b.w / 2 + 4, b.y); ctx.stroke();
  }
  ctx.restore();
  drawGrid(ctx, sim, s, { alpha, bars: o.bars ?? true, tunnels: false, knocks: o.knocks ?? 'all', words: o.words ?? 'all', knockSize: o.knockSize || 12, stimWord: o.stimWord, dim: o.dim });
  for (let i = 0; i < L.n; i++) {
    const c = L.cells[i];
    if (o.labels) { const t = o.labels(i); if (t) say(ctx, t, c.x, c.y + c.h / 2 + 34, 30, COL.dim, 'center', 700, alpha); }
    if (o.tags) { const t = o.tags(i); if (t) tag(ctx, t, c.x, c.y - c.h / 2 - 50, { size: 30, alpha, color: o.tagColor ? o.tagColor(i) : COL.text }); }
  }
}

// ============================================================ circulation figure-8
const CIRC_LEGS = ['right pump to lungs', 'lungs to left pump', 'left pump to body', 'body to right pump'];
const BLUE = [74, 120, 235], RED = [232, 64, 84];
// Local coords, heart centre at (0, 0), y down. Viewer's left = the heart's RIGHT side.
const CIRC = {
  legs: [
    [[-85, 80], [-42, 10], [-42, -120], [-70, -215], [-120, -300], [-55, -352], [0, -348]],
    [[0, -348], [55, -352], [120, -300], [70, -215], [60, -130], [88, -70], [85, 80]],
    [[85, 80], [140, 150], [245, 230], [190, 330], [70, 368], [0, 376]],
    [[0, 376], [-70, 368], [-190, 330], [-262, 220], [-285, 40], [-235, -95], [-150, -78], [-88, -70], [-85, 80]],
  ],
  tags: [[-330, -250, 'to the lungs'], [330, -250, 'back to the left pump'], [360, 120, 'round the body'], [-440, 250, 'back to the right pump']],
};
function circulation(ctx, cx, cy, sc, u, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const P = p => [cx + p[0] * sc, cy + p[1] * sc];
  const leg = Math.min(3, Math.floor(cl(u, 0, 3.999)));
  const active = o.active ?? leg;
  const on = k => (active === -1 || active === k ? 1 : 0.2);
  ctx.save(); ctx.globalAlpha *= alpha;
  // Lungs, drawn once at the top.
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
  ctx.strokeStyle = 'rgba(255,190,205,0.85)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -470); ctx.lineTo(0, -420); ctx.lineTo(-60, -395); ctx.moveTo(0, -420); ctx.lineTo(60, -395); ctx.stroke();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = 'rgba(255,170,190,0.16)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(sx * 110, -315, 88, 108, sx * 0.15, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // Body, drawn once at the bottom: a simple person.
  ctx.fillStyle = 'rgba(190,205,240,0.14)'; ctx.strokeStyle = 'rgba(190,205,240,0.8)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 300, 30, 0, TAU); ctx.fill(); ctx.stroke();
  rr(ctx, -66, 338, 132, 110, 30); ctx.fill(); ctx.stroke();
  rr(ctx, -104, 344, 30, 96, 15); ctx.fill(); ctx.stroke();
  rr(ctx, 74, 344, 30, 96, 15); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Vessels, coloured by the blood in them: used (blue) or fresh (red).
  const legCol = [[BLUE, RED], [RED, RED], [RED, BLUE], [BLUE, BLUE]];
  const draws = CIRC.legs.map((pts, k) => ({ k, S: pathPoints(pts.map(P), false) }));
  // Dimmed legs first so the active one is never covered.
  draws.sort((a, b) => on(a.k) - on(b.k));
  for (const { k, S } of draws) {
    ctx.save(); ctx.globalAlpha *= on(k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 32 * sc;
    ctx.beginPath(); S.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    for (let i = 1; i < S.length; i++) {
      const f = i / (S.length - 1), c = legCol[k][0] === legCol[k][1] ? legCol[k][0] : mix(legCol[k][0], legCol[k][1], sm(0.82, 1, f));
      ctx.strokeStyle = rgba(c); ctx.lineWidth = 22 * sc;
      ctx.beginPath(); ctx.moveTo(S[i - 1][0], S[i - 1][1]); ctx.lineTo(S[i][0], S[i][1]); ctx.stroke();
    }
    if (on(k) === 1 && active !== -1) {
      // Flow chevrons on the leg being described.
      for (let q = 0.1; q < 0.95; q += 0.12) {
        const i = Math.floor(q * (S.length - 1)), a = S[i], b = S[Math.min(S.length - 1, i + 2)], an = Math.atan2(b[1] - a[1], b[0] - a[0]), r = 10 * sc;
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
        ctx.moveTo(a[0] + Math.cos(an) * r, a[1] + Math.sin(an) * r);
        ctx.lineTo(a[0] + Math.cos(an + 2.5) * r, a[1] + Math.sin(an + 2.5) * r);
        ctx.lineTo(a[0] + Math.cos(an - 2.5) * r, a[1] + Math.sin(an - 2.5) * r); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
  // Heart outline with four chambers, drawn translucent over the vessels so the path inside shows.
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
  ctx.beginPath();
  ctx.moveTo(0, -125);
  ctx.bezierCurveTo(-60, -180, -200, -165, -195, -40);
  ctx.bezierCurveTo(-190, 60, -85, 145, 0, 205);
  ctx.bezierCurveTo(85, 145, 190, 60, 195, -40);
  ctx.bezierCurveTo(200, -165, 60, -180, 0, -125);
  ctx.closePath();
  ctx.fillStyle = 'rgba(160,52,72,0.45)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,210,0.95)'; ctx.lineWidth = 6; ctx.stroke();
  const ch = (x, y, w, h, c, a) => { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = 5; rr(ctx, x - w / 2, y - h / 2, w, h, 26); ctx.stroke(); };
  const rightOn = Math.max(on(3), on(0)), leftOn = Math.max(on(1), on(2));
  ch(-95, -70, 128, 76, mix(BLUE, RGB.white, 0.35), 0.3 + 0.7 * rightOn); ch(-88, 75, 132, 118, mix(BLUE, RGB.white, 0.35), 0.3 + 0.7 * rightOn);
  ch(95, -70, 128, 76, mix(RED, RGB.white, 0.35), 0.3 + 0.7 * leftOn); ch(88, 75, 132, 118, mix(RED, RGB.white, 0.35), 0.3 + 0.7 * leftOn);
  ctx.strokeStyle = 'rgba(255,200,210,0.95)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, -118); ctx.lineTo(0, 190); ctx.stroke();
  ctx.restore();
  ctx.restore();
  // The blob.
  if (o.blob !== false) {
    const S = pathPoints(CIRC.legs[leg].map(P), false);
    const f = cl(u - leg), i = Math.min(S.length - 1, Math.round(f * (S.length - 1)));
    const col = leg === 0 ? mix(BLUE, RED, sm(0.82, 1, f)) : leg === 1 ? RED : leg === 2 ? mix(RED, BLUE, sm(0.82, 1, f)) : BLUE;
    ctx.save(); ctx.globalAlpha *= alpha;
    halo(ctx, S[i][0], S[i][1], 52 * sc, col, 0.75);
    ctx.fillStyle = rgba(mix(col, RGB.white, 0.15)); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(S[i][0], S[i][1], 22 * sc, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  const la = alpha * (o.labels ?? 1);
  if (la > 0) {
    say(ctx, 'LUNGS', ...P([300, -330]), 34, '#ffd0da', 'center', 800, la);
    say(ctx, 'BODY', ...P([250, 400]), 34, '#d6deff', 'center', 800, la);
    say(ctx, 'RIGHT pump', ...P([-470, -40]), 34, COL.text, 'center', 800, la);
    say(ctx, '(its right = your left)', ...P([-470, 10]), 30, COL.dim, 'center', 700, la);
    say(ctx, 'LEFT pump', ...P([440, -40]), 34, COL.text, 'center', 800, la);
  }
  const ka = alpha * (o.key ?? 1);
  if (ka > 0) {
    const [kx, ky] = P(o.keyAt || [420, 190]);
    ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = 'rgba(5,10,30,0.7)'; rr(ctx, kx, ky, 430, 158, 18); ctx.fill(); ctx.restore();
    const dot = (y, c) => { ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.arc(kx + 36, y, 15, 0, TAU); ctx.fill(); ctx.restore(); };
    dot(ky + 36, BLUE); say(ctx, 'blue = used', kx + 64, ky + 37, 30, COL.text, 'left', 700, ka);
    dot(ky + 82, RED); say(ctx, 'red = fresh', kx + 64, ky + 83, 30, COL.text, 'left', 700, ka);
    say(ctx, '(real blood is always red)', kx + 22, ky + 128, 26, COL.dim, 'left', 600, ka);
  }
  const lla = alpha * (o.legLabels ?? 0);
  if (lla > 0 && active >= 0) {
    const [x, y, s] = CIRC.tags[active];
    tag(ctx, s, ...P([x, y]), { size: 30, alpha: lla });
  }
}

root.G2 = {
  COL, RGB, levelRGB, hash, sm, cl, warp,
  gridLayout, rowLayout, gridXY, cellXY, simulate, rotorTracks,
  padlock, brick, key, tag, outline, pathArrow, pathPoints, chaseArrow, loopMarker, lapBadge, drawKnock, drawGrid, drawStimKnocks,
  normalWave, patchwork, reentryTrue, takeover, shock, smallBlowSpread,
  rowSim, drawRow, circulation, CIRC_LEGS,
};
})(typeof window !== 'undefined' ? window : globalThis);
