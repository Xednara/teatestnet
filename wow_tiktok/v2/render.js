// Rendert index.html Frame für Frame (deterministisch) zu einem Video.
// Aufruf: node render.js out.mp4 [workers] [nurFrames=a,b,c -> PNGs]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const out = process.argv[2] || path.join(HERE, '_build', 'video.mp4');
const workers = parseInt(process.argv[3] || '4', 10);
const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
const tl = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const FPS = tl.fps, N = Math.round(tl.total * FPS);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
  await page.goto('file://' + path.join(HERE, 'index.html'));
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
  const browser = await chromium.launch();
  if (only) {
    const page = await openPage(browser);
    for (const f of only) {
      await page.evaluate(t => window.renderFrame(t), f / FPS);
      await page.screenshot({ path: path.join(path.dirname(out), `frame_${String(f).padStart(4, '0')}.png`) });
    }
    await browser.close(); return;
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
  await browser.close();
  const list = path.join(HERE, '_build', 'segs.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' })
    .on('close', c => c ? rej(c) : res()));
  console.log('Video:', out);
})();
