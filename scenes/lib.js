// Shared drawing kit for every scene. Each scene calls setup(draw) where
// draw(ctx, t) must be a pure function of t (seconds), so any frame can be
// rendered independently and in parallel.
const W = 1920, H = 1080;
const C = {
  bg0: '#0a1230', bg1: '#162456', text: '#f4f1ea', dim: '#9aa6c8',
  na: '#ffc93c', k: '#b57bff', ca: '#4be3a0',
  membrane: '#ff7a8f', membraneDark: '#c94a63', lipid: '#ffd6dc',
  blood: '#e8475f', bloodBlue: '#5a7bea', muscle: '#e05a6a', muscleDark: '#a83347',
  spark: '#ffe680', node: '#ffb347', locked: '#ff5466', ready: '#4fa8ff',
};
const FONT = '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif';

let TIMING = window.TIMING || null;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const easeIO = p => (p = clamp(p), p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - clamp(p), 3);
const seg = (t, a, b) => clamp((t - a) / (b - a));
// Deterministic pseudo-random in [0,1) from an integer seed.
const rand = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const cue = i => TIMING.cues[Math.min(i, TIMING.cues.length - 1)];
const cs = i => cue(i).start;
const ce = i => cue(i).end;
// When the narration starts saying `phrase` inside cue i, from the voice's own per-word times.
// Letters and digits only are compared, so "A E D" in the script matches the spoken token "AED".
const _norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function wordAt(i, phrase) {
  const k = cue(i).text.indexOf(phrase);
  if (k < 0) throw new Error(`cue ${i} has no "${phrase}"`);
  return _timeAtChar(cue(i), k);
}
// When the voice reaches character k of cue c's text.
function _timeAtChar(c, k) {
  const want = _norm(c.text.slice(0, k)).length;
  let n = 0;
  for (const [w, start] of c.words || []) {
    const len = _norm(w).length;
    if (len && n + len > want) return start;
    n += len;
  }
  // No word times (an old timings file): spread the cue evenly by characters.
  return c.start + (c.end - c.start) * k / c.text.length;
}
// Progress through cue i (0 before it starts, 1 once `dur` seconds have passed, default whole cue).
const cp = (t, i, dur) => seg(t, cs(i), dur ? cs(i) + dur : ce(i));
// 0..1 visibility envelope: fades in at time a, out at b.
const env = (t, a, b, f = 0.5) => Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b));

function text(ctx, s, x, y, size, color = C.text, align = 'center', weight = 600, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

function bg(ctx) {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg0);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function glow(ctx, x, y, r, color, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const ION = { na: ['Na', C.na], k: ['K', C.k], ca: ['Ca', C.ca] };
function ion(ctx, x, y, type, r = 14, alpha = 1, label = false) {
  if (alpha <= 0) return;
  const [sym, col] = ION[type];
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1030'; ctx.font = `800 ${r * 1.1}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label ? sym : '+', x, y + 1);
  ctx.restore();
}

// Phospholipid bilayer band centred on y, spanning x0..x1, with gaps where channels sit.
function membrane(ctx, x0, x1, y, gaps = [], alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const band = 90;
  ctx.fillStyle = 'rgba(255,122,143,0.10)';
  ctx.fillRect(x0, y - band / 2, x1 - x0, band);
  for (let x = x0 + 11; x < x1; x += 22) {
    if (gaps.some(g => Math.abs(x - g) < 52)) continue;
    for (const side of [-1, 1]) {
      const hy = y + side * 34;
      ctx.strokeStyle = C.lipid; ctx.lineWidth = 3; ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath(); ctx.moveTo(x - 3, hy - side * 8); ctx.lineTo(x - 3, y + side * 4);
      ctx.moveTo(x + 3, hy - side * 8); ctx.lineTo(x + 3, y + side * 4); ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = C.membrane; ctx.beginPath(); ctx.arc(x, hy, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// Ion channel as two protein halves that slide apart by `open` (0..1).
// Optional lid (0 = clear, 1 = plugging the pore) drawn on the inside face.
function channel(ctx, x, y, open, color, label, alpha = 1, lid = 0) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const gap = 6 + 30 * clamp(open);
  for (const side of [-1, 1]) {
    const cx = x + side * (gap / 2 + 24);
    ctx.fillStyle = color;
    roundRect(ctx, cx - 24, y - 62, 48, 124, 22); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(ctx, cx - 24 + (side < 0 ? 30 : 0), y - 62, 18, 124, 9); ctx.fill();
  }
  if (lid > 0) {
    // Hinged lid swinging up under the pore from the left half.
    const hx = x - gap / 2 - 8, hy = y + 64;
    const ang = lerp(Math.PI * 0.55, 0, clamp(lid));
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-ang);
    ctx.fillStyle = '#ff9db0'; roundRect(ctx, 0, -9, gap + 22, 18, 9); ctx.fill();
    ctx.restore();
  }
  if (label) text(ctx, label, x, y - 92, 26, color, 'center', 700);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Panel with a voltage trace. vf(time) -> mV. Shows the last `span` seconds up to t.
function voltageGraph(ctx, x, y, w, h, vf, t, span, opts = {}) {
  const { lo = -100, hi = 40, marks = [], alpha = 1, t0 = -Infinity, color = C.spark, title = 'Voltage inside the cell' } = opts;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(5,10,30,0.55)'; roundRect(ctx, x, y, w, h, 24); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, title, x + 30, y + 36, 26, C.dim, 'left', 600);
  const px = x + 120, pw = w - 150, py = y + 70, ph = h - 100;
  const Y = v => py + ph * (hi - v) / (hi - lo);
  for (const m of marks) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, Y(m.v)); ctx.lineTo(px + pw, Y(m.v)); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, m.label, px - 14, Y(m.v), 22, m.color || C.dim, 'right', 600);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(px, Y(0)); ctx.lineTo(px + pw, Y(0)); ctx.stroke();
  text(ctx, '0', px - 14, Y(0), 22, C.dim, 'right');
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath();
  const n = 400; let started = false;
  for (let i = 0; i <= n; i++) {
    const tt = t - span + span * i / n;
    if (tt < t0) continue;
    const xx = px + pw * i / n, yy = Y(vf(tt));
    if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  if (t >= t0) {
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px + pw, Y(vf(t)), 9, 0, Math.PI * 2); ctx.fill();
    text(ctx, `${Math.round(vf(t))} mV`, px + pw - 14, Y(vf(t)) - 34, 26, '#fff', 'right', 700);
  }
  ctx.restore();
}

// Caption lines of at most about 58 characters, broken at punctuation where possible so a phrase or a
// single word is never left hanging. Clauses are packed greedily; a clause too long for one line is
// split at the space nearest its middle.
const CAPTION_MAX = 58;
function captionChunks(text) {
  const clauses = text.match(/[^.,?!]+[.,?!]*\s*/g).map(s => s.trim()).filter(Boolean);
  const pieces = [];
  for (const cl of clauses) {
    if (cl.length <= CAPTION_MAX) { pieces.push(cl); continue; }
    const mid = cl.length / 2;
    let best = -1;
    for (let i = cl.indexOf(' '); i >= 0; i = cl.indexOf(' ', i + 1)) if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
    pieces.push(cl.slice(0, best), cl.slice(best + 1));
  }
  const out = [];
  for (const pc of pieces) {
    const last = out[out.length - 1];
    // A scrap like "and dies." rides on the line before it, even if that line runs a little long.
    if (last != null && (last.length + 1 + pc.length <= CAPTION_MAX || pc.length < 14)) out[out.length - 1] = last + ' ' + pc;
    else out.push(pc);
  }
  return out;
}

// Captions: split each cue into short chunks; each chunk comes up just before its first word is spoken.
function caption(ctx, t) {
  for (const c of TIMING.cues) {
    if (t < _timeAtChar(c, 0) - 0.15 || t > c.end + 0.25) continue;
    const chunks = captionChunks(c.text);
    let line = chunks[0], k = 0;
    for (const s of chunks) {
      if (k > 0 && t >= _timeAtChar(c, k) - 0.1) line = s;
      k += s.length + 1;
    }
    ctx.save();
    ctx.font = `600 38px ${FONT}`;
    const w = ctx.measureText(line).width + 60;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, W / 2 - w / 2, H - 112, w, 64, 16); ctx.fill();
    ctx.restore();
    text(ctx, line, W / 2, H - 80, 38, '#fff', 'center', 600);
  }
}

function titleCard(ctx, t, num, title, a = 0.2, b = 3.4) {
  const al = env(t, a, b, 0.6);
  if (al <= 0) return;
  text(ctx, num, 120, 110, 30, C.node, 'left', 700, al);
  text(ctx, title, 120, 158, 54, C.text, 'left', 700, al);
}

// Stylised front view of the heart. Returns geometry used by scenes.
// Viewer's left = patient's right side (right atrium/ventricle).
function heart(ctx, cx, cy, s, o = {}) {
  const { alpha = 1, beat = 0, glowRA = 0, cutaway = 1, labels = 0 } = o;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy); ctx.scale(s * (1 - 0.03 * beat), s * (1 - 0.03 * beat));
  // great vessels
  ctx.fillStyle = '#c9455b';
  roundRect(ctx, -10, -330, 90, 190, 40); ctx.fill(); // aorta
  ctx.fillStyle = '#4c63c4';
  roundRect(ctx, -150, -320, 70, 190, 30); ctx.fill(); // superior vena cava
  ctx.fillStyle = '#5a72d6';
  roundRect(ctx, -60, -300, 70, 140, 30); ctx.fill(); // pulmonary artery
  // outer body
  ctx.fillStyle = C.muscle;
  ctx.beginPath();
  ctx.moveTo(-40, -170);
  ctx.bezierCurveTo(-220, -200, -270, -40, -220, 60);
  ctx.bezierCurveTo(-170, 170, -40, 260, 30, 330);
  ctx.bezierCurveTo(110, 250, 260, 140, 270, -10);
  ctx.bezierCurveTo(280, -160, 140, -210, 40, -160);
  ctx.closePath(); ctx.fill();
  if (cutaway > 0) {
    ctx.globalAlpha = alpha * cutaway;
    const ch = (path, col) => { ctx.fillStyle = col; ctx.beginPath(); path(); ctx.fill(); };
    // right atrium (viewer left top)
    ch(() => ctx.ellipse(-130, -70, 70, 75, 0, 0, Math.PI * 2), '#3d4f9e');
    // left atrium (viewer right top)
    ch(() => ctx.ellipse(140, -80, 70, 62, 0, 0, Math.PI * 2), '#9e2f45');
    // right ventricle
    ch(() => { ctx.moveTo(-170, 40); ctx.quadraticCurveTo(-120, 200, 0, 250); ctx.quadraticCurveTo(-20, 120, -10, 20); ctx.quadraticCurveTo(-90, 10, -170, 40); }, '#33427f');
    // left ventricle (thicker wall: smaller cavity inset)
    ch(() => { ctx.moveTo(40, 20); ctx.quadraticCurveTo(50, 150, 40, 240); ctx.quadraticCurveTo(170, 150, 190, 30); ctx.quadraticCurveTo(110, 0, 40, 20); }, '#7d2234');
  }
  ctx.restore();
  const geo = { ra: [cx - 130 * s, cy - 70 * s], la: [cx + 140 * s, cy - 80 * s], rv: [cx - 70 * s, cy + 120 * s], lv: [cx + 110 * s, cy + 110 * s], sa: [cx - 150 * s, cy - 140 * s], av: [cx - 10 * s, cy - 10 * s], apex: [cx + 30 * s, cy + 320 * s] };
  if (labels > 0) {
    const L = (k, s2, dx, dy) => text(ctx, s2, geo[k][0] + dx, geo[k][1] + dy, 28, C.text, 'center', 700, labels * alpha);
    L('ra', 'Right atrium', -150, -40); L('la', 'Left atrium', 160, -40);
    L('rv', 'Right ventricle', -200, 40); L('lv', 'Left ventricle', 200, 40);
  }
  if (glowRA > 0) glow(ctx, geo.sa[0], geo.sa[1], 70 * s * 2, C.node, glowRA * alpha);
  return geo;
}

function fadeEdges(ctx, t) {
  const a = Math.max(1 - seg(t, 0, 0.6), seg(t, TIMING.duration - 0.6, TIMING.duration));
  if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
}

function setup(draw) {
  // Scene scripts run in <head>, before <body> exists.
  if (!document.body) return document.addEventListener('DOMContentLoaded', () => setup(draw));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.width = '100%';
  document.body.style.margin = '0'; document.body.style.background = '#000';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  window.renderFrame = t => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    bg(ctx); draw(ctx, t); caption(ctx, t); fadeEdges(ctx, t);
  };
  window.frameJPEG = t => { window.renderFrame(t); return canvas.toDataURL('image/jpeg', 0.92); };
  // Manual preview in a browser: open scene.html?scene=<id>&play, timings fetched from build/.
  const params = new URLSearchParams(location.search);
  if (!TIMING && params.get('scene')) {
    fetch('../build/timings.json').then(r => r.json()).then(all => {
      TIMING = all[params.get('scene')];
      const t0 = performance.now() / 1000 - Number(params.get('t') || 0);
      const loop = () => { window.renderFrame((performance.now() / 1000 - t0) % TIMING.duration); requestAnimationFrame(loop); };
      loop();
    });
  }
  window.sceneReady = true;
}
