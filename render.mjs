// Render a scene to MP4: node render.mjs <sceneId> [--fps 30] [--workers 6]
// Stills for checking: node render.mjs <sceneId> --stills 3.5,20,41
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(ROOT, 'build');
const FFMPEG = execFileSync(path.join(ROOT, '.venv/bin/python'), ['-c', 'import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())']).toString().trim();

const [sceneId, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
const FPS = Number(opt('fps') || 30);
const WORKERS = Number(opt('workers') || 6);
const timing = JSON.parse(fs.readFileSync(path.join(BUILD, 'timings.json'), 'utf8'))[sceneId];
if (!timing) throw new Error(`No timings for ${sceneId}; run tts.py first`);
// Scenes load ES modules and 3D models, which browsers refuse over file://, so serve the project locally.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/scenes/${sceneId}.html`;

// Reuse the Chromium already cached on this Mac instead of downloading the build this Playwright version expects.
// Metal flags give WebGL the real GPU; the default software renderer is about 3x slower.
const browser = await chromium.launch({
  executablePath: path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(t => { window.TIMING = t; }, timing);
  page.on('pageerror', e => { console.error(`[${sceneId}] page error: ${e.message}`); process.exitCode = 1; });
  await page.goto(url);
  await page.waitForFunction(() => window.sceneReady, null, { timeout: 120000 });
  return page;
}
const jpeg = async (page, t) => Buffer.from((await page.evaluate(async t => await window.frameJPEG(t), t)).split(',')[1], 'base64');

const stills = opt('stills');
if (stills) {
  const page = await openPage();
  const dir = path.join(BUILD, 'stills', sceneId);
  fs.mkdirSync(dir, { recursive: true });
  for (const t of stills.split(',').map(Number)) fs.writeFileSync(path.join(dir, `${t}.jpg`), await jpeg(page, t));
  await browser.close();
  server.close();
  console.log(dir);
  process.exit();
}

const total = Math.ceil(timing.duration * FPS);
const segDir = path.join(BUILD, 'segments', sceneId);
fs.rmSync(segDir, { recursive: true, force: true });
fs.mkdirSync(segDir, { recursive: true });
const per = Math.ceil(total / WORKERS);

async function worker(k) {
  const from = k * per, to = Math.min(total, from + per);
  if (from >= to) return null;
  const page = await openPage();
  const out = path.join(segDir, `${k}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-color_range', 'tv', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = from; f < to; f++) {
    const buf = await jpeg(page, f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error(`ffmpeg exit ${c}`)) : res())));
  await page.close();
  return out;
}

const segs = (await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)))).filter(Boolean);
await browser.close();
server.close();
const list = path.join(segDir, 'list.txt');
fs.writeFileSync(list, segs.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
const outDir = path.join(BUILD, 'scenes');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${sceneId}.mp4`);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(BUILD, 'audio', `${sceneId}.wav`),
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', out]);
console.log(out);
