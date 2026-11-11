// Rendert index.html Frame für Frame (deterministisch) zu einem Video.
// Aufruf: node render.js out.mp4 [workers] [nurFrames=a,b,c -> PNGs]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const http = require('http');
const HERE = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(HERE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(HERE) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const out = process.argv[2] || path.join(HERE, '_build', 'video.mp4');
const workers = parseInt(process.argv[3] || '4', 10);
const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
const tl = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const FPS = tl.fps, N = Math.round(tl.total * FPS);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.R3D_READY, null, { timeout: 60000 });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.fonts].map(f => f.load())); });
  await page.evaluate(t => window.setTimeline(t), tl);
  return page;
}

function encoder(file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  return ff;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  if (only) {
    const page = await openPage(browser);
    for (const f of only) {
      await page.evaluate(t => window.renderFrame(t), f / FPS);
      await page.screenshot({ path: path.join(path.dirname(out), `frame_${String(f).padStart(4, '0')}.png`) });
    }
    await browser.close(); server.close(); return;
  }
  fs.mkdirSync(path.join(HERE, '_build'), { recursive: true });
  const per = Math.ceil(N / workers); const segs = [];
  const t0 = Date.now(); let done = 0;
  await Promise.all([...Array(workers)].map(async (_, w) => {
    const a = w * per, b = Math.min(N, a + per); if (a >= b) return;
    const seg = path.join(HERE, '_build', `seg_${w}.mp4`); segs[w] = seg;
    const page = await openPage(browser); const ff = encoder(seg);
    const closed = new Promise(r => ff.on('close', r));
    for (let f = a; f < b; f++) {
      await page.evaluate(t => window.renderFrame(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (++done % 100 === 0) console.log(`  ${done}/${N} Frames (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    ff.stdin.end(); await closed;
  }));
  await browser.close(); server.close();
  const list = path.join(HERE, '_build', 'segs.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' })
    .on('close', c => c ? rej(c) : res()));
  console.log('Video:', out);
})();
