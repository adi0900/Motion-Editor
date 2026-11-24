#!/usr/bin/env node
/**
 * MotionCut Pro v2 — Local CapCut-Style Video Editor Backend (Node 24 + FFmpeg, zero npm deps)
 * Endpoints:
 *  - GET  /api/library                   : Media catalog (preloaded MotionViz assets + uploads)
 *  - POST /api/upload                    : Upload video/audio/image + ffprobe + thumb
 *  - POST /api/import-path               : Import existing local Mac file path
 *  - DELETE /api/media/:id               : Remove item from library
 *  - GET  /api/filmstrip/:id             : Real 10-frame FFmpeg filmstrip sprite for timeline clips
 *  - GET  /api/waveform/:id              : Real FFmpeg PCM peaks + onset beat detection
 *  - GET  /api/cropdetect/:id            : Real FFmpeg letterbox black-bar auto-detection
 *  - POST /api/cutout/:id                : Local macOS Apple Vision foreground cutout ($0)
 *  - POST /api/export-frames/start       : Start deterministic frame-accurate FFmpeg MP4 pipe
 *  - POST /api/export-frames/push/:jobId : Push frame JPEG bytes into FFmpeg stdin
 *  - POST /api/export-frames/finish/:id  : Close video pipe & mix multi-track audio via FFmpeg -> MP4
 *  - POST /api/quick-export              : Instant 2s FFmpeg direct reframe/trim export
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBS_DIR = path.join(__dirname, 'thumbs');
const EXPORTS_DIR = path.join(__dirname, 'exports');
const PORT = Number(process.env.PORT || 4321);

for (const d of [PUBLIC_DIR, UPLOADS_DIR, THUMBS_DIR, EXPORTS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const mediaMap = new Map();
const exportJobs = new Map(); // jobId -> { proc, videoOnlyPath, finalPath, fileName, width, height, fps, crf, audioTracks, donePromise }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

function detectKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(ext)) return 'video';
  if (['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image';
  return 'unknown';
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath,
  ]);
  const info = JSON.parse(stdout);
  const vStream = (info.streams || []).find(s => s.codec_type === 'video');
  const aStream = (info.streams || []).find(s => s.codec_type === 'audio');
  const dur = parseFloat(info.format?.duration || vStream?.duration || aStream?.duration || '5');
  let fps = 30;
  if (vStream?.r_frame_rate && vStream.r_frame_rate.includes('/')) {
    const [n, d] = vStream.r_frame_rate.split('/').map(Number);
    if (d > 0 && n > 0) fps = Math.round((n / d) * 100) / 100;
  }
  return {
    duration: Number.isFinite(dur) && dur > 0 ? dur : 5,
    width: vStream?.width || 1920,
    height: vStream?.height || 1080,
    fps,
    hasAudio: Boolean(aStream),
  };
}

async function generateThumb(id, filePath, kind) {
  const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
  if (fs.existsSync(thumbPath)) return `/thumbs/${id}.jpg`;
  try {
    if (kind === 'video') {
      await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-ss', '0.5', '-i', filePath, '-vframes', '1', '-vf', 'scale=320:-2', thumbPath]);
      if (!fs.existsSync(thumbPath)) {
        await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', filePath, '-vframes', '1', '-vf', 'scale=320:-2', thumbPath]);
      }
      return `/thumbs/${id}.jpg`;
    }
    if (kind === 'image') {
      await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', filePath, '-vf', 'scale=320:-2', thumbPath]);
      return `/thumbs/${id}.jpg`;
    }
  } catch {}
  return null;
}

async function generateFilmstrip(item) {
  const stripPath = path.join(THUMBS_DIR, `${item.id}_strip.jpg`);
  if (fs.existsSync(stripPath)) return stripPath;
  const count = 10;
  const fpsVal = Math.max(0.1, count / Math.max(0.5, item.duration));
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error', '-i', item.filePath,
    '-vf', `fps=${fpsVal.toFixed(4)},scale=120:68:force_original_aspect_ratio=increase,crop=120:68,tile=${count}x1`,
    '-frames:v', '1', '-q:v', '4', stripPath,
  ]);
  return stripPath;
}

async function registerMedia(filePath, customName = null) {
  if (!fs.existsSync(filePath)) return null;
  const abs = path.resolve(filePath);
  for (const m of mediaMap.values()) {
    if (m.filePath === abs) return m;
  }
  const kind = detectKind(abs);
  if (kind === 'unknown') return null;
  const id = 'm_' + crypto.createHash('md5').update(abs).digest('hex').slice(0, 10);
  let meta = { duration: 5, width: 1920, height: 1080, fps: 30, hasAudio: false };
  try { meta = await probeFile(abs); } catch {}
  if (kind === 'image') meta.duration = 5.0;
  const thumbUrl = await generateThumb(id, abs, kind);
  const stat = fs.statSync(abs);
  const item = {
    id,
    name: customName || path.basename(abs),
    type: kind,
    filePath: abs,
    url: `/media/${id}`,
    thumbUrl,
    filmstripUrl: kind === 'video' ? `/api/filmstrip/${id}` : null,
    duration: Math.round(meta.duration * 1000) / 1000,
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    hasAudio: meta.hasAudio || kind === 'audio',
    size: stat.size,
  };
  mediaMap.set(id, item);
  return item;
}

async function seedDefaultLibrary() {
  const candidates = [
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-ig-Df90f4rB60D/renders/flora_scanner_plate_14s_16x9.mp4', 'Scanner Plate 14.5s (16:9)'],
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-ig-Df90f4rB60D/renders/flora_scanner_plate_14s.mp4', 'Scanner Plate 14.5s (9:16)'],
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-blender-meta/renders/flora_blender_meta.mp4', 'FLORA + Blender Meta (18s)'],
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-blender-meta/flora_assets/seedance_ref_8s_720p.mp4', 'Seedance Subway Girl (8s)'],
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-blender-meta/flora_assets/seedance_empty_subway_pan.mp4', 'Seedance Empty Subway Pan (5s)'],
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-ig-Df90f4rB60D/audio/scanner_soundtrack_14s.wav', 'Scanner Synth Track (14.5s)'],
    ['/Users/shadowslave/MotionViz/videos/2026-11-24-flora-blender-meta/audio/soundtrack.wav', 'Meta Electronic Track (18s)'],
  ];
  for (const [p, label] of candidates) {
    if (fs.existsSync(p)) await registerMedia(p, label);
  }
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    const full = path.join(UPLOADS_DIR, f);
    if (fs.statSync(full).isFile()) await registerMedia(full);
  }
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function streamFileWithRange(req, res, filePath) {
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunk = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunk,
      'Content-Type': mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
  }
}

async function readBodyBuffer(req, maxBytes = 512 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const ch of req) {
    total += ch.length;
    if (total > maxBytes) throw new Error('Payload too large');
    chunks.push(ch);
  }
  return Buffer.concat(chunks);
}

async function computeWaveform(filePath, bins = 120) {
  const { stdout } = await execFileAsync('ffmpeg', [
    '-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', '-',
  ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });

  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 2));
  if (samples.length === 0) return { peaks: Array(bins).fill(0.1), beats: [] };

  const step = Math.max(1, Math.floor(samples.length / bins));
  const peaks = [];
  for (let i = 0; i < bins; i++) {
    let maxVal = 0;
    const s0 = i * step;
    const s1 = Math.min(samples.length, s0 + step);
    for (let j = s0; j < s1; j += 2) {
      const v = Math.abs(samples[j]);
      if (v > maxVal) maxVal = v;
    }
    peaks.push(Math.round((maxVal / 32768) * 1000) / 1000);
  }

  const win = 400;
  const energies = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) { const v = samples[j] / 32768; sum += v * v; }
    energies.push(Math.sqrt(sum / win));
  }
  const avgE = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
  const beats = [];
  let lastBeat = -1;
  for (let i = 1; i < energies.length - 1; i++) {
    const t = i * 0.1;
    if (energies[i] > avgE * 1.42 && energies[i] > energies[i - 1] * 1.15 && t - lastBeat >= 0.35) {
      beats.push(Math.round(t * 100) / 100);
      lastBeat = t;
    }
  }
  return { peaks, beats };
}

async function detectCrop(filePath) {
  const { stderr } = await execFileAsync('ffmpeg', ['-i', filePath, '-t', '4', '-vf', 'cropdetect=24:2:0', '-f', 'null', '-']);
  const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return { w: Number(last[1]), h: Number(last[2]), x: Number(last[3]), y: Number(last[4]) };
}

function buildAtempoChain(speed) {
  const parts = [];
  let s = Math.max(0.25, Math.min(8.0, Number(speed) || 1));
  while (s > 2.0) { parts.push('atempo=2.0'); s /= 2.0; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1.0) > 0.01) parts.push(`atempo=${s.toFixed(3)}`);
  return parts;
}

async function muxAudioWithVideo(videoOnlyPath, finalPath, totalDuration, audioClips) {
  const valid = (audioClips || []).filter(c => {
    const m = mediaMap.get(c.mediaId);
    return m && m.hasAudio && fs.existsSync(m.filePath) && (c.volume ?? 1) > 0.001;
  });
  if (!valid.length) {
    fs.renameSync(videoOnlyPath, finalPath);
    return;
  }

  const args = ['-y', '-v', 'error', '-i', videoOnlyPath];
  const filterParts = [];
  const mixLabels = [];

  valid.forEach((c, idx) => {
    const m = mediaMap.get(c.mediaId);
    args.push('-i', m.filePath);
    const inIdx = idx + 1;
    const speed = Math.max(0.25, Math.min(8, Number(c.speed) || 1));
    const trimStart = Math.max(0, Number(c.trimStart) || 0);
    const srcDur = Math.max(0.05, Number(c.duration) * speed);
    const delayMs = Math.max(0, Math.round((Number(c.start) || 0) * 1000));
    const vol = Math.max(0, Math.min(2, Number(c.volume ?? 1)));

    const chain = [`atrim=start=${trimStart.toFixed(3)}:duration=${srcDur.toFixed(3)}`, 'asetpts=PTS-STARTPTS'];
    chain.push(...buildAtempoChain(speed));
    if ((c.fadeIn || 0) > 0.01) chain.push(`afade=t=in:st=0:d=${Number(c.fadeIn).toFixed(2)}`);
    if ((c.fadeOut || 0) > 0.01 && c.duration > c.fadeOut) {
      chain.push(`afade=t=out:st=${Math.max(0, c.duration - c.fadeOut).toFixed(2)}:d=${Number(c.fadeOut).toFixed(2)}`);
    }
    if ((c.eqBass || 0) !== 0) chain.push(`bass=g=${Number(c.eqBass).toFixed(1)}`);
    if ((c.eqTreble || 0) !== 0) chain.push(`treble=g=${Number(c.eqTreble).toFixed(1)}`);
    chain.push(`volume=${vol.toFixed(3)}`);
    if (delayMs > 0) chain.push(`adelay=${delayMs}|${delayMs}`);
    const lbl = `a${idx}`;
    filterParts.push(`[${inIdx}:a]${chain.join(',')}[${lbl}]`);
    mixLabels.push(`[${lbl}]`);
  });

  if (mixLabels.length === 1) {
    filterParts.push(`${mixLabels[0]}apad=whole_dur=${totalDuration.toFixed(3)},atrim=0:${totalDuration.toFixed(3)}[aout]`);
  } else {
    filterParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,apad=whole_dur=${totalDuration.toFixed(3)},atrim=0:${totalDuration.toFixed(3)}[aout]`);
  }

  args.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    '-shortest',
    finalPath,
  );
  await execFileAsync('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 });
  try { fs.unlinkSync(videoOnlyPath); } catch {}
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── Library & Media Management ─────────────────────────────────────────
    if (p === '/api/library' && req.method === 'GET') {
      return sendJSON(res, 200, { items: [...mediaMap.values()], exportsDir: EXPORTS_DIR });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const rawName = decodeURIComponent(req.headers['x-filename'] || `clip_${Date.now()}.mp4`);
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const outPath = path.join(UPLOADS_DIR, `${Date.now()}_${safeName}`);
      fs.writeFileSync(outPath, await readBodyBuffer(req));
      const item = await registerMedia(outPath, rawName);
      if (!item) return sendJSON(res, 400, { error: 'Unsupported media file' });
      return sendJSON(res, 200, { item });
    }

    if (p === '/api/import-path' && req.method === 'POST') {
      const body = JSON.parse((await readBodyBuffer(req, 65536)).toString('utf8'));
      const rawPath = (body.path || '').replace(/^~/, process.env.HOME || '');
      if (!fs.existsSync(rawPath)) return sendJSON(res, 404, { error: `File not found: ${rawPath}` });
      const item = await registerMedia(rawPath);
      if (!item) return sendJSON(res, 400, { error: 'Unsupported media format' });
      return sendJSON(res, 200, { item });
    }

    if (p.startsWith('/api/media/') && req.method === 'DELETE') {
      const id = p.split('/').pop();
      mediaMap.delete(id);
      return sendJSON(res, 200, { ok: true });
    }

    if (p.startsWith('/api/filmstrip/') && req.method === 'GET') {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item || item.type !== 'video') { res.writeHead(404); res.end('Not found'); return; }
      const sp = await generateFilmstrip(item);
      return streamFileWithRange(req, res, sp);
    }

    if (p.startsWith('/api/waveform/') && req.method === 'GET') {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item) return sendJSON(res, 404, { error: 'Media not found' });
      if (!item.hasAudio) return sendJSON(res, 200, { peaks: [], beats: [] });
      return sendJSON(res, 200, await computeWaveform(item.filePath, Number(url.searchParams.get('bins') || 120)));
    }

    if (p.startsWith('/api/cropdetect/') && req.method === 'GET') {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item) return sendJSON(res, 404, { error: 'Media not found' });
      return sendJSON(res, 200, { crop: await detectCrop(item.filePath), width: item.width, height: item.height });
    }

    if (p.startsWith('/api/cutout/') && req.method === 'POST') {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item) return sendJSON(res, 404, { error: 'Media not found' });
      const cutoutBin = path.join(process.env.HOME || '', 'tools', 'cutout');
      if (!fs.existsSync(cutoutBin)) return sendJSON(res, 400, { error: 'Local cutout tool not found' });
      const body = JSON.parse((await readBodyBuffer(req, 65536)).toString('utf8') || '{}');
      const atSec = Number(body.time || 0);
      const tmpIn = path.join(UPLOADS_DIR, `cut_in_${Date.now()}.png`);
      const outPng = path.join(UPLOADS_DIR, `cutout_${Date.now()}.png`);
      if (item.type === 'video') {
        await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-ss', String(atSec), '-i', item.filePath, '-vframes', '1', tmpIn]);
      } else {
        fs.copyFileSync(item.filePath, tmpIn);
      }
      await execFileAsync(cutoutBin, [tmpIn, outPng]);
      try { fs.unlinkSync(tmpIn); } catch {}
      const newItem = await registerMedia(outPng, `${path.parse(item.name).name} (Cutout)`);
      return sendJSON(res, 200, { item: newItem });
    }

    // ── Deterministic Frame-Accurate FFmpeg Pipe Export (Zero Dropped Frames!) ──
    if (p === '/api/export-frames/start' && req.method === 'POST') {
      const body = JSON.parse((await readBodyBuffer(req, 262144)).toString('utf8'));
      const width = Math.round(Number(body.width || 1920) / 2) * 2;
      const height = Math.round(Number(body.height || 1080) / 2) * 2;
      const fps = Number(body.fps || 30);
      const crf = Number(body.crf || 16);
      const name = (body.name || `motioncut_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const jobId = 'job_' + crypto.randomBytes(6).toString('hex');
      const videoOnlyPath = path.join(EXPORTS_DIR, `_vid_${jobId}.mp4`);
      const finalPath = path.join(EXPORTS_DIR, `${name}.mp4`);

      const proc = spawn('ffmpeg', [
        '-y', '-v', 'error',
        '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', '-',
        '-vf', `scale=${width}:${height}:flags=lanczos,setsar=1`,
        '-r', String(fps),
        '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
        '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        videoOnlyPath,
      ], { stdio: ['pipe', 'ignore', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      const donePromise = new Promise((resolve, reject) => {
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}: ${stderr}`)));
        proc.on('error', reject);
      });

      exportJobs.set(jobId, {
        proc, videoOnlyPath, finalPath, fileName: `${name}.mp4`,
        width, height, fps, crf,
        totalDuration: Number(body.totalDuration || 5),
        audioClips: body.audioClips || [],
        donePromise,
      });
      return sendJSON(res, 200, { ok: true, jobId });
    }

    if (p.startsWith('/api/export-frames/push/') && req.method === 'POST') {
      const jobId = p.split('/').pop();
      const job = exportJobs.get(jobId);
      if (!job) return sendJSON(res, 404, { error: 'Export job not found' });
      const buf = await readBodyBuffer(req, 64 * 1024 * 1024);
      if (!job.proc.stdin.write(buf)) {
        await new Promise(r => job.proc.stdin.once('drain', r));
      }
      return sendJSON(res, 200, { ok: true });
    }

    if (p.startsWith('/api/export-frames/finish/') && req.method === 'POST') {
      const jobId = p.split('/').pop();
      const job = exportJobs.get(jobId);
      if (!job) return sendJSON(res, 404, { error: 'Export job not found' });
      exportJobs.delete(jobId);
      job.proc.stdin.end();
      await job.donePromise;
      await muxAudioWithVideo(job.videoOnlyPath, job.finalPath, job.totalDuration, job.audioClips);
      const stat = fs.statSync(job.finalPath);
      const meta = await probeFile(job.finalPath);
      await registerMedia(job.finalPath, job.fileName);
      return sendJSON(res, 200, {
        ok: true,
        fileName: job.fileName,
        filePath: job.finalPath,
        downloadUrl: `/exports/${job.fileName}`,
        size: stat.size,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
      });
    }

    // ── Fast Direct FFmpeg 1-Click Reframe / Trim Export ───────────────────
    if (p === '/api/quick-export' && req.method === 'POST') {
      const body = JSON.parse((await readBodyBuffer(req, 262144)).toString('utf8'));
      const item = mediaMap.get(body.mediaId);
      if (!item) return sendJSON(res, 404, { error: 'Clip not found' });
      const w = Math.round(Number(body.width || 1920) / 2) * 2;
      const h = Math.round(Number(body.height || 1080) / 2) * 2;
      const fps = Number(body.fps || 30);
      const crf = Number(body.crf || 15);
      const start = Math.max(0, Number(body.trimStart || 0));
      const dur = Math.max(0.2, Number(body.duration || item.duration));
      const mode = body.fitMode || 'cover';
      const name = (body.name || `${path.parse(item.name).name}_${w}x${h}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const outMp4 = path.join(EXPORTS_DIR, `${name}.mp4`);

      let vf = '';
      if (body.cropRect && body.cropRect.w > 0 && body.cropRect.h > 0) {
        const c = body.cropRect;
        vf += `crop=${c.w}:${c.h}:${c.x}:${c.y},`;
      }
      if (mode === 'cover') {
        vf += `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`;
      } else if (mode === 'contain') {
        vf += `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
      } else {
        const prefix = (body.cropRect && body.cropRect.w > 0) ? `crop=${body.cropRect.w}:${body.cropRect.h}:${body.cropRect.x}:${body.cropRect.y},` : '';
        vf = `${prefix}split[bg][fg];[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=28:4[b];[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos[f];[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1`;
      }

      await execFileAsync('ffmpeg', [
        '-y', '-v', 'error', '-ss', String(start), '-t', String(dur), '-i', item.filePath,
        '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '0:a?',
        '-r', String(fps), '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
        '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-c:a', 'aac', '-b:a', '192k', outMp4,
      ], { maxBuffer: 16 * 1024 * 1024 });

      const stat = fs.statSync(outMp4);
      const meta = await probeFile(outMp4);
      await registerMedia(outMp4, `${name}.mp4`);
      return sendJSON(res, 200, {
        ok: true, fileName: `${name}.mp4`, filePath: outMp4,
        downloadUrl: `/exports/${name}.mp4`, size: stat.size,
        duration: meta.duration, width: meta.width, height: meta.height, fps: meta.fps,
      });
    }

    // ── Stream Media / Thumbs / Exports ────────────────────────────────────
    if (p.startsWith('/media/')) {
      const item = mediaMap.get(p.split('/').pop());
      if (!item) { res.writeHead(404); res.end('Not found'); return; }
      return streamFileWithRange(req, res, item.filePath);
    }
    if (p.startsWith('/thumbs/')) return streamFileWithRange(req, res, path.join(THUMBS_DIR, path.basename(p)));
    if (p.startsWith('/exports/')) {
      const fp = path.join(EXPORTS_DIR, path.basename(p));
      if (url.searchParams.get('download') === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(p)}"`);
      }
      return streamFileWithRange(req, res, fp);
    }

    // ── Static Frontend ────────────────────────────────────────────────────
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[MotionCut Error]', err);
    sendJSON(res, 500, { error: String(err.message || err) });
  }
});

seedDefaultLibrary().then(() => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`MotionCut Pro v2 running at http://127.0.0.1:${PORT} (${mediaMap.size} assets)`);
  });
});
