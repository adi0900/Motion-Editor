#!/usr/bin/env node
/**
 * MotionCut Pro v3 — Hardened Local CapCut-Style Video Editor Backend (Node 24 + FFmpeg, zero npm deps)
 *
 * Security & Reliability:
 *  - Localhost-only Host & CORS validation + per-boot session token (X-MC-Token) on mutating routes
 *  - Strict HTTP 206 Range validation (416 on invalid/OOB ranges, HEAD support, never throws after headersSent)
 *  - Streaming multipart/raw disk uploads (no RAM cap; supports multi-GB 4K clips)
 *  - Persistent catalog.json with missing-file detection (survives restarts, no stale 404s)
 *  - Export job stdin error guards, unhandled rejection guards, cancel endpoint, and TTL orphan reaper
 *  - Full preview-to-export audio parity: reverse (areverse), piecewise speed-ramp audio, voice FX, EQ,
 *    clamped fades, keyframed volume envelopes, and persisted procedural SFX / freeze frames.
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
const PROJECTS_DIR = path.join(__dirname, 'projects');
const CATALOG_PATH = path.join(__dirname, 'catalog.json');
const PORT = Number(process.env.PORT || 4321);
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

for (const d of [PUBLIC_DIR, UPLOADS_DIR, THUMBS_DIR, EXPORTS_DIR, PROJECTS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

process.on('uncaughtException', (err) => {
  console.error('[MotionCut uncaughtException]', err?.stack || err);
});
process.on('unhandledRejection', (err) => {
  console.error('[MotionCut unhandledRejection]', err?.stack || err);
});

const mediaMap = new Map();       // id -> internal media item (includes filePath)
const waveformCache = new Map();  // `${id}:${bins}` -> { peaks, beats }
const exportJobs = new Map();     // jobId -> active export job state

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
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

function detectKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(ext)) return 'video';
  if (['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image';
  return 'unknown';
}

function toPublicMedia(item) {
  const exists = fs.existsSync(item.filePath);
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    url: item.url,
    thumbUrl: item.thumbUrl,
    filmstripUrl: item.filmstripUrl,
    duration: item.duration,
    width: item.width,
    height: item.height,
    fps: item.fps,
    hasAudio: item.hasAudio,
    size: item.size,
    sourceTag: item.sourceTag || 'local',
    userAdded: Boolean(item.userAdded),
    missing: !exists,
  };
}

function saveCatalog() {
  try {
    const entries = [...mediaMap.values()].map(m => ({
      id: m.id,
      name: m.name,
      filePath: m.filePath,
      sourceTag: m.sourceTag || 'local',
      userAdded: Boolean(m.userAdded),
    }));
    fs.writeFileSync(CATALOG_PATH, JSON.stringify({ version: 3, entries }, null, 2));
  } catch (err) {
    console.error('[Catalog save error]', err.message);
  }
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath,
  ]);
  const info = JSON.parse(stdout);
  const vStream = (info.streams || []).find(s => s.codec_type === 'video');
  const aStream = (info.streams || []).find(s => s.codec_type === 'audio');
  const dur = parseFloat(info.format?.duration || vStream?.duration || aStream?.duration || '0');
  let fps = 30;
  if (vStream?.r_frame_rate && vStream.r_frame_rate.includes('/')) {
    const [n, d] = vStream.r_frame_rate.split('/').map(Number);
    if (d > 0 && n > 0 && n / d <= 240) fps = Math.round((n / d) * 100) / 100;
  }
  const parsedNb = Number(vStream?.nb_frames);
  return {
    duration: Number.isFinite(dur) && dur > 0 ? dur : 0,
    width: vStream?.width || 0,
    height: vStream?.height || 0,
    fps,
    nbFrames: Number.isFinite(parsedNb) && parsedNb > 0 ? parsedNb : 0,
    hasVideo: Boolean(vStream),
    hasAudio: Boolean(aStream),
  };
}

async function generateThumb(id, filePath, kind, force = false) {
  const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
  if (!force && fs.existsSync(thumbPath)) return `/thumbs/${id}.jpg`;
  try {
    if (kind === 'video') {
      await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-ss', '0.3', '-i', filePath, '-vframes', '1', '-vf', 'scale=320:-2', thumbPath]);
      if (!fs.existsSync(thumbPath)) {
        await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', filePath, '-vframes', '1', '-vf', 'scale=320:-2', thumbPath]);
      }
      return fs.existsSync(thumbPath) ? `/thumbs/${id}.jpg` : null;
    }
    if (kind === 'image') {
      await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', filePath, '-vf', 'scale=320:-2', thumbPath]);
      return fs.existsSync(thumbPath) ? `/thumbs/${id}.jpg` : null;
    }
  } catch {}
  return null;
}

async function generateFilmstrip(item) {
  const stripPath = path.join(THUMBS_DIR, `${item.id}_strip.jpg`);
  if (fs.existsSync(stripPath)) return stripPath;
  const count = 16;
  const dur = Math.max(0.5, item.duration || 5);
  const fpsVal = Math.max(0.05, count / dur);
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error', '-i', item.filePath,
    '-vf', `fps=${fpsVal.toFixed(4)},scale=120:68:force_original_aspect_ratio=increase,crop=120:68,tile=${count}x1`,
    '-frames:v', '1', '-q:v', '4', stripPath,
  ]);
  return stripPath;
}

async function registerMedia(filePath, customName = null, opts = {}) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return null;
  let stat;
  try { stat = fs.statSync(abs); } catch { return null; }
  if (!stat.isFile()) return null;

  const kind = detectKind(abs);
  if (kind === 'unknown') return null;

  const id = opts.forceId || ('m_' + crypto.createHash('sha256').update(abs).digest('hex').slice(0, 12));
  const existing = mediaMap.get(id);
  if (existing && !opts.refresh && existing.size === stat.size) {
    return existing;
  }

  let meta = null;
  try { meta = await probeFile(abs); } catch { return null; }
  if (!meta) return null;
  if (kind === 'video' && (!Number.isFinite(meta.duration) || meta.duration <= 0 || !meta.width || !meta.height)) return null;
  if (kind === 'audio' && (!Number.isFinite(meta.duration) || meta.duration <= 0 || !meta.hasAudio)) return null;
  if (kind === 'image') {
    if (!meta.width || !meta.height) return null;
    meta.duration = 5.0;
  }
  const thumbUrl = await generateThumb(id, abs, kind, Boolean(opts.refresh));
  const item = {
    id,
    name: customName || existing?.name || path.basename(abs),
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
    sourceTag: opts.sourceTag || existing?.sourceTag || 'local',
    userAdded: opts.userAdded !== undefined ? Boolean(opts.userAdded) : Boolean(existing?.userAdded),
  };
  mediaMap.set(id, item);
  if (!opts.skipSave) saveCatalog();
  return item;
}

async function seedDefaultLibrary() {
  // 1. Restore persisted catalog first
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
      for (const e of (saved.entries || [])) {
        if (e.filePath && fs.existsSync(e.filePath)) {
          await registerMedia(e.filePath, e.name, {
            forceId: e.id,
            sourceTag: e.sourceTag || 'local',
            userAdded: e.userAdded,
            skipSave: true,
          });
        }
      }
    } catch {}
  }

  // 2. Seed MotionViz sample assets (only if present on disk)
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
    if (fs.existsSync(p)) await registerMedia(p, label, { sourceTag: 'sample', userAdded: false, skipSave: true });
  }

  // 3. Scan uploads directory
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    const full = path.join(UPLOADS_DIR, f);
    try {
      if (fs.statSync(full).isFile()) {
        await registerMedia(full, null, { sourceTag: 'upload', userAdded: true, skipSave: true });
      }
    } catch {}
  }
  saveCatalog();
}

function sendJSON(res, code, obj) {
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return { invalid: true };
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return { invalid: true };
  let start, end;
  if (rawStart === '') {
    // Suffix range: bytes=-N
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
      return { invalid: true };
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function streamFileWithRange(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    if (!res.headersSent) { res.writeHead(404); res.end('Not found'); }
    return;
  }
  let stat;
  try { stat = fs.statSync(filePath); } catch {
    if (!res.headersSent) { res.writeHead(404); res.end('Not found'); }
    return;
  }
  if (!stat.isFile()) {
    if (!res.headersSent) { res.writeHead(404); res.end('Not found'); }
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const isHead = req.method === 'HEAD';
  const range = req.headers.range;

  if (range) {
    const parsed = parseRangeHeader(range, stat.size);
    if (!parsed || parsed.invalid || stat.size === 0) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
      res.end();
      return;
    }
    const { start, end } = parsed;
    const chunk = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunk,
      'Content-Type': mime,
    });
    if (isHead) { res.end(); return; }
    const s = fs.createReadStream(filePath, { start, end });
    s.on('error', () => { try { res.destroy(); } catch {} });
    s.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    if (isHead) { res.end(); return; }
    const s = fs.createReadStream(filePath);
    s.on('error', () => { try { res.destroy(); } catch {} });
    s.pipe(res);
  }
}

async function readBodyBuffer(req, maxBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const ch of req) {
    total += ch.length;
    if (total > maxBytes) {
      const err = new Error('Payload too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(ch);
  }
  return Buffer.concat(chunks);
}

async function streamRequestToFile(req, destPath, maxBytes = 8 * 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(destPath);
    let total = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { ws.destroy(); } catch {}
      try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
      reject(err);
    };
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const err = new Error('Upload exceeds 8GB limit');
        err.statusCode = 413;
        req.destroy();
        fail(err);
      }
    });
    req.on('aborted', () => fail(new Error('Upload aborted by client')));
    req.on('error', fail);
    ws.on('error', fail);
    ws.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve(total);
    });
    req.pipe(ws);
  });
}

async function computeWaveform(id, filePath, bins = 180) {
  const clampedBins = Math.max(16, Math.min(1000, Math.round(Number(bins) || 180)));
  const cacheKey = `${id}:${clampedBins}`;
  if (waveformCache.has(cacheKey)) return waveformCache.get(cacheKey);

  const { stdout } = await execFileAsync('ffmpeg', [
    '-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', '-',
  ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });

  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 2));
  if (samples.length === 0) return { peaks: Array(clampedBins).fill(0.05), beats: [] };

  const step = Math.max(1, Math.floor(samples.length / clampedBins));
  const peaks = [];
  for (let i = 0; i < clampedBins; i++) {
    let maxVal = 0;
    const s0 = i * step;
    const s1 = Math.min(samples.length, s0 + step);
    for (let j = s0; j < s1; j += 2) {
      const v = Math.abs(samples[j]);
      if (v > maxVal) maxVal = v;
    }
    peaks.push(Math.round((maxVal / 32768) * 1000) / 1000);
  }

  const win = 400; // 100ms @ 4kHz
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
  const res = { peaks, beats };
  waveformCache.set(cacheKey, res);
  return res;
}

async function detectCrop(filePath) {
  const { stderr } = await execFileAsync('ffmpeg', ['-i', filePath, '-t', '4', '-vf', 'cropdetect=24:2:0', '-f', 'null', '-']);
  const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return { w: Number(last[1]), h: Number(last[2]), x: Number(last[3]), y: Number(last[4]) };
}

function isValidJpegBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 128) return false;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return false;
  // Require EOI (FF D9) near the end (allow trailing zero padding)
  let end = buf.length - 1;
  while (end > 2 && buf[end] === 0x00) end--;
  if (buf[end - 1] !== 0xFF || buf[end] !== 0xD9) return false;
  // Walk JPEG segment headers until SOS (FF DA) and verify SOF + scan integrity
  let pos = 2;
  let hasSof = false;
  let hasSos = false;
  let scanStart = -1;
  while (pos + 1 < end) {
    if (buf[pos] !== 0xFF) return false;
    while (pos < end && buf[pos] === 0xFF) pos++;
    if (pos >= end) return false;
    const marker = buf[pos++];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
    if (marker === 0xD9) break;
    if (pos + 2 > end) return false;
    const segLen = buf.readUInt16BE(pos);
    if (segLen < 2 || pos + segLen > end) return false;
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      if (segLen < 8) return false;
      const h = buf.readUInt16BE(pos + 3);
      const w = buf.readUInt16BE(pos + 5);
      if (w <= 0 || h <= 0) return false;
      hasSof = true;
    }
    if (marker === 0xDA) {
      hasSos = true;
      scanStart = pos + segLen;
      break;
    }
    pos += segLen;
  }
  if (!hasSof || !hasSos || scanStart < 0 || end - scanStart < 16) return false;
  // Verify entropy scan has no unstuffed invalid markers before EOI
  for (let i = scanStart; i < end - 1; i++) {
    if (buf[i] === 0xFF) {
      const next = buf[i + 1];
      if (next === 0x00 || next === 0xFF || (next >= 0xD0 && next <= 0xD7)) {
        i++;
        continue;
      }
      if (next === 0xD9) return i === end - 1;
      return false;
    }
  }
  return true;
}

const reservedExportPaths = new Map(); // fullPath -> ownerId

function uniqueExportPath(baseName, ownerId = crypto.randomBytes(6).toString('hex')) {
  const clean = (baseName || `motioncut_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.mp4$/i, '');
  let candidate = `${clean}.mp4`;
  let fullPath = path.join(EXPORTS_DIR, candidate);
  let n = 2;
  while (fs.existsSync(fullPath) || reservedExportPaths.has(fullPath)) {
    candidate = `${clean}_${n++}.mp4`;
    fullPath = path.join(EXPORTS_DIR, candidate);
  }
  reservedExportPaths.set(fullPath, ownerId);
  return { fileName: candidate, fullPath, ownerId };
}

// Speed ramp curve definitions matching engine.js identically
const SPEED_CURVES = {
  none: null,
  montage: [[0, 2.2], [0.22, 0.45], [0.55, 0.45], [0.78, 2.2], [1, 1.4]],
  hero: [[0, 1.0], [0.3, 0.35], [0.65, 0.35], [0.85, 2.4], [1, 1.0]],
  bullet: [[0, 3.0], [0.2, 0.3], [0.75, 0.3], [1, 2.5]],
  flashin: [[0, 3.5], [0.25, 1.0], [1, 1.0]],
  smooth: [[0, 0.5], [0.5, 1.8], [1, 0.5]],
};

function evalRampSpeed(curveKey, u) {
  const pts = SPEED_CURVES[curveKey];
  if (!pts) return 1;
  const uc = Math.max(0, Math.min(1, u));
  for (let i = 0; i < pts.length - 1; i++) {
    const [u0, s0] = pts[i];
    const [u1, s1] = pts[i + 1];
    if (uc >= u0 && uc <= u1) {
      const f = (uc - u0) / Math.max(0.0001, u1 - u0);
      return s0 + (s1 - s0) * f;
    }
  }
  return pts[pts.length - 1][1];
}

function buildAtempoChain(speed) {
  const parts = [];
  let s = Math.max(0.25, Math.min(8.0, Number(speed) || 1));
  while (s > 2.0) { parts.push('atempo=2.0'); s /= 2.0; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1.0) > 0.008) parts.push(`atempo=${s.toFixed(4)}`);
  return parts;
}

function buildVoiceFxFilters(voiceFx) {
  switch (voiceFx) {
    case 'radio':
      return ['highpass=f=420', 'lowpass=f=2800'];
    case 'deep':
      return ['aresample=48000', 'asetrate=48000*0.80', 'aresample=48000', 'atempo=1.25'];
    case 'chipmunk':
      return ['aresample=48000', 'asetrate=48000*1.35', 'aresample=48000', 'atempo=0.7407'];
    case 'echo':
      return ['aecho=0.8:0.88:120:0.42'];
    default:
      return [];
  }
}

function buildVolumeExpr(baseVol, kfs) {
  if (!Array.isArray(kfs) || kfs.length === 0) {
    return `volume=${Math.max(0, Math.min(2, baseVol)).toFixed(3)}`;
  }
  const sorted = [...kfs]
    .filter(k => k && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
    .sort((a, b) => Number(a.t) - Number(b.t));
  if (sorted.length === 0) {
    return `volume=${Math.max(0, Math.min(2, baseVol)).toFixed(3)}`;
  }
  if (sorted.length === 1) {
    return `volume=${Math.max(0, Math.min(2, Number(sorted[0].v))).toFixed(3)}`;
  }
  const clampV = (v) => Math.max(0, Math.min(2, Number(v))).toFixed(3);
  let expr = clampV(sorted[sorted.length - 1].v);
  for (let i = sorted.length - 2; i >= 0; i--) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const t0 = Number(a.t);
    const t1 = Number(b.t);
    const v0 = Math.max(0, Math.min(2, Number(a.v)));
    const v1 = Math.max(0, Math.min(2, Number(b.v)));
    const dt = Math.max(0.001, t1 - t0);
    const p = `min(1,max(0,(t-${t0.toFixed(3)})/${dt.toFixed(3)}))`;
    // Match engine.js identically: read b.ease || a.ease || 'easeInOut', cubic exponents + bounce
    const easeKind = b.ease || a.ease || 'easeInOut';
    let eased;
    if (easeKind === 'linear') {
      eased = p;
    } else if (easeKind === 'easeIn') {
      eased = `pow(${p},3)`;
    } else if (easeKind === 'easeOut') {
      eased = `(1-pow(1-${p},3))`;
    } else if (easeKind === 'bounce') {
      // Exact cubic easeOutBack matching engine.js:77-81 (clamped to [0, 2])
      eased = `(1+2.70158*pow(${p}-1,3)+1.70158*pow(${p}-1,2))`;
    } else {
      // easeInOut cubic (default)
      eased = `if(lt(${p},0.5),4*pow(${p},3),1-pow(-2*${p}+2,3)/2)`;
    }
    const seg = `min(2,max(0,${v0.toFixed(3)}+(${(v1 - v0).toFixed(3)})*${eased}))`;
    expr = `if(lt(t,${t1.toFixed(3)}),${seg},${expr})`;
  }
  expr = `if(lt(t,${Number(sorted[0].t).toFixed(3)}),${clampV(sorted[0].v)},${expr})`;
  return `volume='${expr}':eval=frame`;
}

function spawnFfmpegCancellable(args, job = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (job) job.muxProc = proc;
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', (err) => {
      if (job && job.muxProc === proc) job.muxProc = null;
      reject(err);
    });
    proc.on('close', (code) => {
      if (job && job.muxProc === proc) job.muxProc = null;
      if (job?.cancelled) return reject(new Error('Export cancelled'));
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg mux exit ${code}: ${stderr.trim() || 'mux failure'}`));
    });
  });
}

async function muxAudioWithVideo(videoOnlyPath, finalPath, totalDuration, audioClips, job = null) {
  const valid = (audioClips || []).filter(c => {
    const m = mediaMap.get(c.mediaId);
    if (!m || !m.hasAudio || !fs.existsSync(m.filePath)) return false;
    const hasVolKf = Array.isArray(c.volumeKeyframes) && c.volumeKeyframes.length > 0;
    return hasVolKf || (c.volume ?? 1) > 0.001;
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
    const mediaDur = Math.max(0.05, Number(m.duration) || 5);
    const baseSpeed = Math.max(0.25, Math.min(8, Number(c.speed) || 1));
    const trimStart = Math.max(0, Math.min(mediaDur - 0.02, Number(c.trimStart) || 0));
    const dur = Math.max(0.04, Number(c.duration) || 1);
    const delaySec = Math.max(0, Number(c.start) || 0);
    const vol = Math.max(0, Math.min(2, Number(c.volume ?? 1)));
    const curve = c.speedCurve && SPEED_CURVES[c.speedCurve] ? c.speedCurve : 'none';
    const rawLbl = `araw${idx}`;
    const lbl = `a${idx}`;

    const postChain = [];
    const fi = Math.min(dur, Math.max(0, Number(c.fadeIn) || 0));
    const fo = Math.min(dur, Math.max(0, Number(c.fadeOut) || 0));
    if (fi > 0.01) postChain.push(`afade=t=in:st=0:d=${fi.toFixed(3)}`);
    if (fo > 0.01) postChain.push(`afade=t=out:st=${Math.max(0, dur - fo).toFixed(3)}:d=${fo.toFixed(3)}`);
    if ((c.eqBass || 0) !== 0) postChain.push(`bass=g=${Math.max(-18, Math.min(18, Number(c.eqBass))).toFixed(1)}`);
    if ((c.eqTreble || 0) !== 0) postChain.push(`treble=g=${Math.max(-18, Math.min(18, Number(c.eqTreble))).toFixed(1)}`);
    postChain.push(...buildVoiceFxFilters(c.voiceFx));
    // Subdivide to 256-sample (~5.3ms) frames before per-frame volume expression so all 5 easings have <0.015 error!
    if (Array.isArray(c.volumeKeyframes) && c.volumeKeyframes.length > 1) {
      postChain.push('asetnsamples=n=256:p=0');
    }
    postChain.push(buildVolumeExpr(vol, c.volumeKeyframes));
    postChain.push(`atrim=start=0:duration=${dur.toFixed(3)}`, 'asetpts=PTS-STARTPTS', 'aresample=48000:first_pts=0', 'aformat=sample_rates=48000:channel_layouts=stereo');

    if (curve !== 'none') {
      // Adaptive piecewise speed-ramp audio with 8ms triangular acrossfade between segments -> ZERO clicks & ZERO dropouts!
      const cU0 = Math.max(0, Math.min(1, Number(c.curveStartU ?? 0)));
      const cU1 = Math.max(cU0 + 0.001, Math.min(1, Number(c.curveEndU ?? 1)));
      const N = Math.max(4, Math.min(16, Math.round(dur / 0.16)));
      const xfade = 0.008;
      const segOutDur = dur / N;
      const segSpeeds = [];
      let totalSpan = 0;
      for (let k = 0; k < N; k++) {
        const uMid = cU0 + ((k + 0.5) / N) * (cU1 - cU0);
        const s = Math.max(0.25, Math.min(8, baseSpeed * evalRampSpeed(curve, uMid)));
        segSpeeds.push(s);
        totalSpan += segOutDur * s;
      }
      const clampedSpan = Math.max(0.04, Math.min(mediaDur - trimStart, totalSpan));
      const scaleFactor = totalSpan > 0 ? Math.min(1, clampedSpan / totalSpan) : 1;
      const lookahead = 0.08;

      // For reverse: reverse ONLY [trimStart, trimStart + clampedSpan] so source anchor NEVER shifts,
      // then pad 0.12s of tail silence AFTER reversing so WSOLA atempo never runs dry near EOF!
      const prepFilters = ['aformat=sample_rates=48000:channel_layouts=stereo'];
      let prepAvail;
      if (c.reverse) {
        prepFilters.push(
          `atrim=start=${trimStart.toFixed(4)}:duration=${clampedSpan.toFixed(4)}`,
          'asetpts=PTS-STARTPTS',
          'areverse',
          'asetpts=PTS-STARTPTS',
          'apad=pad_dur=0.14'
        );
        prepAvail = clampedSpan + 0.14;
      } else {
        const rawRead = Math.max(0.04, Math.min(mediaDur - trimStart, clampedSpan + lookahead));
        prepFilters.push(
          `atrim=start=${trimStart.toFixed(4)}:duration=${rawRead.toFixed(4)}`,
          'asetpts=PTS-STARTPTS',
          'apad=pad_dur=0.14'
        );
        prepAvail = rawRead + 0.14;
      }
      const splitLabels = [];
      for (let k = 0; k < N; k++) splitLabels.push(`[s${idx}_${k}]`);
      filterParts.push(`[${inIdx}:a]${prepFilters.join(',')},asplit=${N}${splitLabels.join('')}`);

      let srcCursor = 0;
      for (let k = 0; k < N; k++) {
        const segSpeed = segSpeeds[k];
        const segSrcDur = Math.max(0.02, segOutDur * segSpeed * scaleFactor);
        const effSpeed = Math.max(0.25, Math.min(8, segSrcDur / segOutDur));
        const extraOut = k < N - 1 ? xfade : 0;
        const targetSegOut = segOutDur + extraOut;
        const segStart = Math.min(Math.max(0, prepAvail - 0.03), srcCursor);
        const segReadDur = Math.max(0.025, Math.min(prepAvail - segStart, (targetSegOut + lookahead) * effSpeed));
        const segChain = [
          `atrim=start=${segStart.toFixed(4)}:duration=${segReadDur.toFixed(4)}`,
          'asetpts=PTS-STARTPTS',
          ...buildAtempoChain(effSpeed),
          `apad=whole_dur=${targetSegOut.toFixed(4)}`,
          `atrim=start=0:duration=${targetSegOut.toFixed(4)}`,
          'asetpts=PTS-STARTPTS',
        ];
        filterParts.push(`[s${idx}_${k}]${segChain.join(',')}[r${idx}_${k}]`);
        srcCursor += segSrcDur;
      }
      // Chain segments with 8ms triangular acrossfade to eliminate waveform discontinuity clicks
      let curLbl = `r${idx}_0`;
      for (let k = 1; k < N; k++) {
        const nextLbl = k === N - 1 ? `xf${idx}_end` : `xf${idx}_${k}`;
        filterParts.push(`[${curLbl}][r${idx}_${k}]acrossfade=d=${xfade.toFixed(4)}:c1=tri:c2=tri[${nextLbl}]`);
        curLbl = nextLbl;
      }
      filterParts.push(`[${curLbl}]asetpts=PTS-STARTPTS,${postChain.join(',')}[${rawLbl}]`);
    } else {
      const srcDur = Math.max(0.04, Math.min(mediaDur - trimStart, dur * baseSpeed));
      const chain = [
        'aformat=sample_rates=48000:channel_layouts=stereo',
        `atrim=start=${trimStart.toFixed(4)}:duration=${srcDur.toFixed(4)}`,
        'asetpts=PTS-STARTPTS',
        ...buildAtempoChain(baseSpeed),
        'asetpts=PTS-STARTPTS',
      ];
      if (c.reverse) chain.push('areverse', 'asetpts=PTS-STARTPTS');
      chain.push(...postChain);
      filterParts.push(`[${inIdx}:a]${chain.join(',')}[${rawLbl}]`);
    }

    // Exact sample-accurate timeline placement: prepend pure silence instead of adelay
    if (delaySec > 0.0005) {
      filterParts.push(
        `aevalsrc=0:s=48000:c=stereo:d=${delaySec.toFixed(4)}[sil${idx}]`,
        `[sil${idx}][${rawLbl}]concat=n=2:v=0:a=1,asetpts=PTS-STARTPTS[${lbl}]`
      );
    } else {
      filterParts.push(`[${rawLbl}]asetpts=PTS-STARTPTS[${lbl}]`);
    }
    mixLabels.push(`[${lbl}]`);
  });

  // Always apply fast true-peak-safe limiter (0.86 ceiling prevents post-AAC inter-sample clipping even on 6x sums!)
  const limiter = 'alimiter=limit=0.86:level=disabled:attack=0.5:release=40';
  if (mixLabels.length === 1) {
    filterParts.push(`${mixLabels[0]}${limiter},apad=whole_dur=${totalDuration.toFixed(4)},atrim=start=0:duration=${totalDuration.toFixed(4)},asetpts=PTS-STARTPTS[aout]`);
  } else {
    filterParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,${limiter},apad=whole_dur=${totalDuration.toFixed(4)},atrim=start=0:duration=${totalDuration.toFixed(4)},asetpts=PTS-STARTPTS[aout]`);
  }

  args.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    '-t', totalDuration.toFixed(4),
    finalPath,
  );
  await spawnFfmpegCancellable(args, job);
  try { fs.unlinkSync(videoOnlyPath); } catch {}
}

function cleanupExportJob(jobId, killProc = true, markCancelled = true) {
  const job = exportJobs.get(jobId);
  if (!job) return false;
  if (markCancelled) job.cancelled = true;
  job.cleanupScheduled = true;
  exportJobs.delete(jobId);
  if (killProc && job.proc && !job.proc.killed && job.proc.exitCode === null) {
    try { job.proc.stdin.destroy(); } catch {}
    try { job.proc.kill('SIGKILL'); } catch {}
  }
  if (killProc && job.muxProc && !job.muxProc.killed && job.muxProc.exitCode === null) {
    try { job.muxProc.kill('SIGKILL'); } catch {}
  }
  setTimeout(() => {
    try { if (fs.existsSync(job.videoOnlyPath)) fs.unlinkSync(job.videoOnlyPath); } catch {}
    // Only unlink & release reservation if this job still owns the path!
    if (job.finalPath && reservedExportPaths.get(job.finalPath) === jobId) {
      try { if (markCancelled && fs.existsSync(job.finalPath)) fs.unlinkSync(job.finalPath); } catch {}
      reservedExportPaths.delete(job.finalPath);
    }
  }, 400);
  return true;
}

// Reap idle/abandoned export jobs every 2 minutes (10-minute idle TTL)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of exportJobs.entries()) {
    if (now - job.lastActivity > 10 * 60 * 1000) {
      console.warn(`[MotionCut] Reaping abandoned export job ${id}`);
      cleanupExportJob(id, true);
    }
  }
}, 120_000).unref();

function isAllowedLocalHost(hostHeader) {
  if (!hostHeader) return false;
  const h = hostHeader.trim().toLowerCase();
  return h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}` || h === '127.0.0.1' || h === 'localhost';
}

function validateProjectSchemaServer(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const validTypes = new Set(['video', 'overlay', 'text', 'graphic', 'audio']);
  if (!Array.isArray(obj.tracks)) return false;
  for (const tr of obj.tracks) {
    if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return false;
    if (!validTypes.has(tr.type) || !Array.isArray(tr.clips)) return false;
    for (const c of tr.clips) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
      if (c.start !== undefined && (!Number.isFinite(Number(c.start)) || Number(c.start) < 0)) return false;
      if (c.duration !== undefined && (!Number.isFinite(Number(c.duration)) || Number(c.duration) <= 0)) return false;
    }
  }
  return true;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const o = origin.trim().toLowerCase();
  return o === `http://127.0.0.1:${PORT}` || o === `http://localhost:${PORT}`;
}

function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(String(str));
  } catch {
    const err = new Error('Malformed URI encoding');
    err.statusCode = 400;
    throw err;
  }
}

async function readJsonBody(req, maxBytes = 262144) {
  const raw = (await readBodyBuffer(req, maxBytes)).toString('utf8');
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const err = new Error('JSON body must be a plain object');
      err.statusCode = 400;
      throw err;
    }
    return parsed;
  } catch (e) {
    if (e.statusCode) throw e;
    const err = new Error(`Invalid JSON body: ${e.message}`);
    err.statusCode = 400;
    throw err;
  }
}

function checkCsrfToken(req, res) {
  const tok = req.headers['x-mc-token'];
  if (tok !== SESSION_TOKEN) {
    sendJSON(res, 403, { error: 'Forbidden: invalid or missing local session token' });
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isAllowedLocalHost(req.headers.host)) {
      return sendJSON(res, 403, { error: 'Forbidden Host header' });
    }
    const origin = req.headers.origin;
    if (origin) {
      if (!isAllowedOrigin(origin)) {
        return sendJSON(res, 403, { error: 'Forbidden cross-origin request' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename,X-MC-Token,X-Source-Tag');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    // ── Health & Library ───────────────────────────────────────────────────
    if (p === '/api/health' && req.method === 'GET') {
      return sendJSON(res, 200, { ok: true, version: '12.0', assets: mediaMap.size, activeExports: exportJobs.size });
    }

    if (p === '/api/library' && req.method === 'GET') {
      const items = [...mediaMap.values()].map(toPublicMedia).filter(i => !i.missing);
      const missingCount = [...mediaMap.values()].filter(m => !fs.existsSync(m.filePath)).length;
      return sendJSON(res, 200, { items, missingCount, exportsDirName: path.basename(EXPORTS_DIR) });
    }

    // ── Mutating APIs (Token-Protected) ────────────────────────────────────
    if (p === '/api/upload' && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const rawName = safeDecodeURIComponent(req.headers['x-filename'] || `clip_${Date.now()}.mp4`);
      const sourceTag = String(req.headers['x-source-tag'] || 'upload').replace(/[^a-zA-Z0-9_-]/g, '');
      const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (detectKind(safeName) === 'unknown') {
        return sendJSON(res, 400, { error: `Unsupported file extension: ${path.extname(safeName)}` });
      }
      const outPath = path.join(UPLOADS_DIR, `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${safeName}`);
      await streamRequestToFile(req, outPath);
      const item = await registerMedia(outPath, rawName, { sourceTag, userAdded: true });
      if (!item) {
        try { fs.unlinkSync(outPath); } catch {}
        return sendJSON(res, 400, { error: 'Unsupported or unreadable media file' });
      }
      return sendJSON(res, 200, { item: toPublicMedia(item) });
    }

    if (p === '/api/import-path' && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const body = await readJsonBody(req, 65536);
      const rawPath = String(body.path || '').trim().replace(/^~(?=\/|$)/, process.env.HOME || '');
      if (!rawPath) return sendJSON(res, 400, { error: 'Path is required' });
      const resolved = path.resolve(rawPath);
      if (!fs.existsSync(resolved)) return sendJSON(res, 404, { error: `File not found: ${path.basename(resolved)}` });
      const st = fs.statSync(resolved);
      if (!st.isFile()) return sendJSON(res, 400, { error: 'Path must be a regular file' });
      if (detectKind(resolved) === 'unknown') return sendJSON(res, 400, { error: 'Unsupported media format' });
      const item = await registerMedia(resolved, body.name || null, { sourceTag: 'imported', userAdded: true });
      if (!item) return sendJSON(res, 400, { error: 'Failed to probe media file' });
      return sendJSON(res, 200, { item: toPublicMedia(item) });
    }

    if (p.startsWith('/api/media/') && req.method === 'DELETE') {
      if (!checkCsrfToken(req, res)) return;
      const id = safeDecodeURIComponent(p.split('/').pop() || '');
      const item = mediaMap.get(id);
      if (!item) return sendJSON(res, 404, { ok: false });
      mediaMap.delete(id);
      // Delete managed files in uploads/ or exports/ and generated thumbs so they never resurrect on restart
      try {
        const abs = path.resolve(item.filePath || '');
        if (abs.startsWith(UPLOADS_DIR + path.sep) || abs.startsWith(EXPORTS_DIR + path.sep)) {
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        }
        const thumbP = path.join(THUMBS_DIR, `${id}.jpg`);
        const stripP = path.join(THUMBS_DIR, `${id}_strip.jpg`);
        if (fs.existsSync(thumbP)) fs.unlinkSync(thumbP);
        if (fs.existsSync(stripP)) fs.unlinkSync(stripP);
      } catch {}
      saveCatalog();
      return sendJSON(res, 200, { ok: true });
    }

    // ── Project Save / Load / Delete on Server (Unique IDs + Deep Validation) ──
    if (p === '/api/projects' && req.method === 'GET') {
      const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
      const details = files.map(f => {
        const fp = path.join(PROJECTS_DIR, f);
        try {
          const st = fs.statSync(fp);
          return { fileName: f, updatedAt: st.mtime.toISOString(), size: st.size };
        } catch { return { fileName: f, updatedAt: null, size: 0 }; }
      });
      return sendJSON(res, 200, { projects: files, details });
    }
    if (p.startsWith('/api/projects/') && req.method === 'GET') {
      const fname = path.basename(safeDecodeURIComponent(p.slice('/api/projects/'.length)));
      if (!fname || !fname.endsWith('.json')) return sendJSON(res, 400, { error: 'Invalid project filename' });
      const fp = path.resolve(PROJECTS_DIR, fname);
      if (!fp.startsWith(PROJECTS_DIR + path.sep) || !fs.existsSync(fp)) {
        return sendJSON(res, 404, { error: 'Project not found' });
      }
      let data;
      try {
        data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (!validateProjectSchemaServer(data)) {
          return sendJSON(res, 422, { error: 'Project file is corrupt or has an invalid schema' });
        }
      } catch {
        return sendJSON(res, 422, { error: 'Project file contains corrupt JSON' });
      }
      return sendJSON(res, 200, { fileName: fname, project: data });
    }
    if (p.startsWith('/api/projects/') && req.method === 'DELETE') {
      if (!checkCsrfToken(req, res)) return;
      const fname = path.basename(safeDecodeURIComponent(p.slice('/api/projects/'.length)));
      if (!fname || !fname.endsWith('.json')) return sendJSON(res, 400, { error: 'Invalid project filename' });
      const fp = path.resolve(PROJECTS_DIR, fname);
      if (!fp.startsWith(PROJECTS_DIR + path.sep) || !fs.existsSync(fp)) {
        return sendJSON(res, 404, { error: 'Project not found' });
      }
      fs.unlinkSync(fp);
      return sendJSON(res, 200, { ok: true });
    }
    if (p === '/api/projects' && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const body = await readJsonBody(req, 8 * 1024 * 1024);
      if (!validateProjectSchemaServer(body)) {
        return sendJSON(res, 422, { error: 'Invalid project payload: every track and clip must be a valid object with finite timings' });
      }
      const safe = String(body.title || 'project').replace(/[^a-zA-Z0-9._-]/g, '_');
      const pid = body.projectId ? '_' + String(body.projectId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) : '';
      const fp = path.join(PROJECTS_DIR, `${safe}${pid}.mcut.json`);
      const tmp = `${fp}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(body, null, 2));
      fs.renameSync(tmp, fp);
      return sendJSON(res, 200, { ok: true, fileName: path.basename(fp) });
    }

    // ── Analysis & Media Helper Endpoints ──────────────────────────────────
    if (p.startsWith('/api/filmstrip/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item || item.type !== 'video' || !fs.existsSync(item.filePath)) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const sp = await generateFilmstrip(item);
      return streamFileWithRange(req, res, sp);
    }

    if (p.startsWith('/api/waveform/') && req.method === 'GET') {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item || !fs.existsSync(item.filePath)) return sendJSON(res, 404, { error: 'Media not found' });
      if (!item.hasAudio) return sendJSON(res, 200, { peaks: [], beats: [] });
      const rawBins = url.searchParams.get('bins');
      const bins = rawBins ? Number(rawBins) : 180;
      if (!Number.isFinite(bins) || bins < 16 || bins > 1000) {
        return sendJSON(res, 400, { error: 'bins must be between 16 and 1000' });
      }
      return sendJSON(res, 200, await computeWaveform(item.id, item.filePath, bins));
    }

    if (p.startsWith('/api/cropdetect/') && req.method === 'GET') {
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item || !fs.existsSync(item.filePath)) return sendJSON(res, 404, { error: 'Media not found' });
      const crop = await detectCrop(item.filePath);
      const hasBars = Boolean(crop && (crop.w < item.width - 8 || crop.h < item.height - 8));
      return sendJSON(res, 200, { crop, width: item.width, height: item.height, hasBars });
    }

    if (p.startsWith('/api/cutout/') && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const id = p.split('/').pop();
      const item = mediaMap.get(id);
      if (!item || !fs.existsSync(item.filePath)) return sendJSON(res, 404, { error: 'Media not found' });
      const cutoutBin = path.join(process.env.HOME || '', 'tools', 'cutout');
      if (!fs.existsSync(cutoutBin)) return sendJSON(res, 400, { error: 'Local cutout tool not found' });
      const body = await readJsonBody(req, 65536);
      const atSec = Math.max(0, Number(body.time || 0));
      const tmpIn = path.join(UPLOADS_DIR, `cut_in_${Date.now()}.png`);
      const outPng = path.join(UPLOADS_DIR, `cutout_${Date.now()}.png`);
      try {
        if (item.type === 'video') {
          await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-ss', String(atSec), '-i', item.filePath, '-vframes', '1', tmpIn]);
        } else {
          fs.copyFileSync(item.filePath, tmpIn);
        }
        await execFileAsync(cutoutBin, [tmpIn, outPng]);
      } finally {
        try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      }
      const newItem = await registerMedia(outPng, `${path.parse(item.name).name} (Cutout)`, { sourceTag: 'cutout', userAdded: true });
      return sendJSON(res, 200, { item: toPublicMedia(newItem) });
    }

    // ── Deterministic Frame-Accurate FFmpeg Pipe Export ─────────────────────
    if (p === '/api/export-frames/start' && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const body = await readJsonBody(req, 512 * 1024);
      const rawW = Number(body.width ?? 1920);
      const rawH = Number(body.height ?? 1080);
      if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW < 160 || rawH < 160 || rawW > 5120 || rawH > 5120) {
        return sendJSON(res, 400, { error: 'Invalid dimensions (160..5120)' });
      }
      const width = Math.round(rawW / 2) * 2;
      const height = Math.round(rawH / 2) * 2;
      const fps = body.fps === undefined ? 30 : Number(body.fps);
      const crf = body.crf === undefined ? 17 : Number(body.crf);
      if (!Number.isFinite(fps) || fps < 1 || fps > 120) return sendJSON(res, 400, { error: 'Invalid FPS (1..120)' });
      if (!Number.isFinite(crf) || crf < 10 || crf > 40) return sendJSON(res, 400, { error: 'Invalid CRF (10..40)' });
      const rawTotalDur = body.totalDuration === undefined ? 1 : Number(body.totalDuration);
      if (!Number.isFinite(rawTotalDur) || rawTotalDur <= 0 || rawTotalDur > 36000) {
        return sendJSON(res, 400, { error: 'Invalid totalDuration (must be finite > 0)' });
      }
      const totalDuration = Math.max(1 / fps, rawTotalDur);
      if (body.audioClips !== undefined && !Array.isArray(body.audioClips)) {
        return sendJSON(res, 400, { error: 'Invalid audioClips (must be an array)' });
      }
      const audioClips = Array.isArray(body.audioClips) ? body.audioClips : [];
      for (let i = 0; i < audioClips.length; i++) {
        const ac = audioClips[i];
        if (!ac || typeof ac !== 'object' || Array.isArray(ac)) {
          return sendJSON(res, 400, { error: `Invalid audioClips[${i}]: expected object` });
        }
        if (typeof ac.mediaId !== 'string' || !mediaMap.has(ac.mediaId)) {
          return sendJSON(res, 400, { error: `Invalid audioClips[${i}].mediaId` });
        }
        const st = Number(ac.start ?? 0);
        const du = Number(ac.duration);
        const ts = Number(ac.trimStart ?? 0);
        const sp = Number(ac.speed ?? 1);
        const vol = Number(ac.volume ?? 1);
        if (!Number.isFinite(st) || st < 0 || !Number.isFinite(du) || du <= 0 || !Number.isFinite(ts) || ts < 0 || !Number.isFinite(sp) || sp < 0.25 || sp > 8 || !Number.isFinite(vol) || vol < 0) {
          return sendJSON(res, 400, { error: `Invalid numeric parameters in audioClips[${i}]` });
        }
      }
      const expectedFrames = Math.max(1, Math.round(totalDuration * fps));

      const jobId = 'job_' + crypto.randomBytes(6).toString('hex');
      const { fileName, fullPath: finalPath } = uniqueExportPath(body.name || `motioncut_${Date.now()}`, jobId);
      const videoOnlyPath = path.join(EXPORTS_DIR, `_vid_${jobId}.mp4`);

      const proc = spawn('ffmpeg', [
        '-y', '-v', 'error',
        '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', '-',
        '-vf', `scale=${width}:${height}:flags=lanczos:in_range=full:out_range=tv,setsar=1,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
        '-r', String(fps),
        '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
        '-crf', String(crf), '-pix_fmt', 'yuv420p',
        '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-movflags', '+faststart',
        videoOnlyPath,
      ], { stdio: ['pipe', 'ignore', 'pipe'] });

      let stderr = '';
      const job = {
        proc, videoOnlyPath, finalPath, fileName,
        width, height, fps, crf,
        totalDuration,
        expectedFrames,
        audioClips,
        framesWritten: 0,
        framesReserved: 0,
        lastActivity: Date.now(),
        failed: false,
        failError: null,
        cancelled: false,
        cleanupScheduled: false,
        getStderr: () => stderr,
        donePromise: null,
      };

      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.stdin.on('error', (err) => {
        job.failed = true;
        job.failError = err;
      });

      const donePromise = new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (job.cancelled) return resolve({ cancelled: true });
          if (code === 0) return resolve({ ok: true });
          const err = new Error(`FFmpeg exit ${code}: ${stderr.trim() || 'encoder failure'}`);
          job.failed = true;
          job.failError = err;
          reject(err);
        });
        proc.on('error', (err) => {
          job.failed = true;
          job.failError = err;
          reject(err);
        });
      });
      // Prevent unhandled rejection if FFmpeg fails before /finish is called
      donePromise.catch(() => {});
      job.donePromise = donePromise;

      exportJobs.set(jobId, job);
      return sendJSON(res, 200, { ok: true, jobId, fileName });
    }

    if (p.startsWith('/api/export-frames/push/') && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const jobId = p.split('/').pop();
      const job = exportJobs.get(jobId);
      if (!job) return sendJSON(res, 404, { error: 'Export job not found' });
      if (job.finishing) return sendJSON(res, 409, { error: 'Export is already finalizing; cannot push additional frames' });
      if (job.cancelled) return sendJSON(res, 409, { error: 'Export was cancelled' });
      if (job.failed || job.proc.killed || job.proc.exitCode !== null) {
        const msg = job.failError?.message || 'FFmpeg encoder stopped unexpectedly';
        cleanupExportJob(jobId, true);
        return sendJSON(res, 500, { error: msg });
      }
      if (job.expectedFrames && job.framesReserved >= job.expectedFrames) {
        return sendJSON(res, 400, { error: `Export already received all ${job.expectedFrames} expected frames` });
      }
      // Reserve frame slot synchronously BEFORE awaiting body so concurrent pushes never bypass expectedFrames!
      job.framesReserved++;
      job.lastActivity = Date.now();
      let buf;
      try {
        buf = await readBodyBuffer(req, 32 * 1024 * 1024);
      } catch (err) {
        job.framesReserved = Math.max(0, job.framesReserved - 1);
        throw err;
      }
      if (!isValidJpegBuffer(buf)) {
        job.framesReserved = Math.max(0, job.framesReserved - 1);
        return sendJSON(res, 400, { error: 'Invalid or corrupt JPEG frame buffer' });
      }

      try {
        const ok = job.proc.stdin.write(buf);
        if (!ok) {
          await new Promise((resolve, reject) => {
            const onDrain = () => { cleanup(); resolve(); };
            const onErr = (e) => { cleanup(); reject(e); };
            const onClose = () => { cleanup(); reject(new Error('FFmpeg closed pipe during push')); };
            const cleanup = () => {
              job.proc.stdin.off('drain', onDrain);
              job.proc.stdin.off('error', onErr);
              job.proc.off('close', onClose);
            };
            job.proc.stdin.once('drain', onDrain);
            job.proc.stdin.once('error', onErr);
            job.proc.once('close', onClose);
          });
        }
        job.framesWritten++;
      } catch (err) {
        cleanupExportJob(jobId, true);
        return sendJSON(res, 500, { error: err.message });
      }
      return sendJSON(res, 200, { ok: true, framesWritten: job.framesWritten });
    }

    if (p.startsWith('/api/export-frames/cancel/') && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const jobId = p.split('/').pop();
      const existed = cleanupExportJob(jobId, true);
      return sendJSON(res, 200, { ok: true, cancelled: existed });
    }

    if (p.startsWith('/api/export-frames/finish/') && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const jobId = p.split('/').pop();
      const job = exportJobs.get(jobId);
      if (!job) return sendJSON(res, 404, { error: 'Export job not found' });
      if (job.cancelled) {
        cleanupExportJob(jobId, true);
        return sendJSON(res, 409, { error: 'Export cancelled' });
      }
      if (job.framesWritten === 0) {
        cleanupExportJob(jobId, true);
        return sendJSON(res, 400, { error: 'No frames were pushed to export job' });
      }
      if (job.expectedFrames && job.framesWritten < job.expectedFrames) {
        cleanupExportJob(jobId, true);
        return sendJSON(res, 400, { error: `Incomplete export: received ${job.framesWritten} of ${job.expectedFrames} expected frames` });
      }
      if (job.finishing) {
        return sendJSON(res, 409, { error: 'Export is already finalizing' });
      }
      job.finishing = true;
      job.lastActivity = Date.now();
      const heartbeat = setInterval(() => { job.lastActivity = Date.now(); }, 15000);
      try {
        job.proc.stdin.end();
        await job.donePromise;
        if (job.cancelled) {
          cleanupExportJob(jobId, true);
          return sendJSON(res, 409, { error: 'Export cancelled' });
        }
        const encErr = job.getStderr ? job.getStderr() : '';
        if (/overread|corrupt|truncated|invalid data|mjpeg.*error/i.test(encErr)) {
          try { if (fs.existsSync(job.videoOnlyPath)) fs.unlinkSync(job.videoOnlyPath); } catch {}
          return sendJSON(res, 400, { error: `Corrupt or truncated JPEG frame detected: ${encErr.trim().slice(0, 140)}` });
        }
        await muxAudioWithVideo(job.videoOnlyPath, job.finalPath, job.totalDuration, job.audioClips, job);
        if (job.cancelled) {
          cleanupExportJob(jobId, true);
          return sendJSON(res, 409, { error: 'Export cancelled' });
        }
      } catch (err) {
        const wasCancelled = Boolean(job.cancelled);
        cleanupExportJob(jobId, true, wasCancelled);
        try { if (fs.existsSync(job.videoOnlyPath)) fs.unlinkSync(job.videoOnlyPath); } catch {}
        if (reservedExportPaths.get(job.finalPath) === jobId) {
          try { if (fs.existsSync(job.finalPath)) fs.unlinkSync(job.finalPath); } catch {}
        }
        return sendJSON(res, wasCancelled ? 409 : 500, { error: String(err.message || err) });
      } finally {
        clearInterval(heartbeat);
        exportJobs.delete(jobId);
        // Never release reservation early if a delayed cancel cleanup is still pending!
        if (!job.cleanupScheduled && reservedExportPaths.get(job.finalPath) === jobId) {
          reservedExportPaths.delete(job.finalPath);
        }
      }
      const stat = fs.statSync(job.finalPath);
      const meta = await probeFile(job.finalPath);
      if (!meta.hasVideo || meta.duration <= 0 || !meta.width || !meta.height) {
        try { fs.unlinkSync(job.finalPath); } catch {}
        return sendJSON(res, 500, { error: 'Export produced an empty or unreadable video file' });
      }
      if (job.expectedFrames) {
        let actualFrames = meta.nbFrames;
        if (actualFrames <= 0) {
          try {
            const { stdout } = await execFileAsync('ffprobe', [
              '-v', 'error', '-count_frames', '-select_streams', 'v:0',
              '-show_entries', 'stream=nb_read_frames', '-of', 'default=nk=1:nw=1', job.finalPath,
            ]);
            actualFrames = Number(stdout.trim()) || 0;
          } catch {}
        }
        if (actualFrames !== job.expectedFrames) {
          try { fs.unlinkSync(job.finalPath); } catch {}
          return sendJSON(res, 400, { error: `Decoded frame count (${actualFrames}) does not match expected (${job.expectedFrames})` });
        }
      }
      await registerMedia(job.finalPath, job.fileName, { sourceTag: 'export', userAdded: true, refresh: true });
      return sendJSON(res, 200, {
        ok: true,
        fileName: job.fileName,
        downloadUrl: `/exports/${encodeURIComponent(job.fileName)}`,
        size: stat.size,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
      });
    }

    // ── Fast Direct FFmpeg 1-Click Source Reframe ──────────────────────────
    if (p === '/api/quick-export' && req.method === 'POST') {
      if (!checkCsrfToken(req, res)) return;
      const body = await readJsonBody(req, 262144);
      const item = mediaMap.get(body.mediaId);
      if (!item || !fs.existsSync(item.filePath)) return sendJSON(res, 404, { error: 'Clip not found' });
      if (item.type !== 'video') return sendJSON(res, 400, { error: 'Quick Reframe requires a video clip' });
      const rawW = Number(body.width ?? 1920);
      const rawH = Number(body.height ?? 1080);
      if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW < 160 || rawH < 160 || rawW > 5120 || rawH > 5120) {
        return sendJSON(res, 400, { error: 'Invalid dimensions (160..5120)' });
      }
      const w = Math.round(rawW / 2) * 2;
      const h = Math.round(rawH / 2) * 2;
      const fps = body.fps === undefined ? 30 : Number(body.fps);
      const crf = body.crf === undefined ? 15 : Number(body.crf);
      if (!Number.isFinite(fps) || fps < 1 || fps > 120) return sendJSON(res, 400, { error: 'Invalid FPS (1..120)' });
      if (!Number.isFinite(crf) || crf < 10 || crf > 40) return sendJSON(res, 400, { error: 'Invalid CRF (10..40)' });
      const start = body.trimStart === undefined ? 0 : Number(body.trimStart);
      const dur = body.duration === undefined ? item.duration : Number(body.duration);
      const speed = body.speed === undefined ? 1 : Number(body.speed);
      if (!Number.isFinite(start) || start < 0 || start >= item.duration || (item.duration - start < 0.01)) {
        return sendJSON(res, 400, { error: `Invalid trimStart (must be >= 0 and < clip duration ${item.duration.toFixed(2)}s)` });
      }
      if (!Number.isFinite(dur) || dur <= 0) return sendJSON(res, 400, { error: 'Invalid duration' });
      if (!Number.isFinite(speed) || speed < 0.25 || speed > 8) return sendJSON(res, 400, { error: 'Invalid speed (0.25..8)' });
      if (body.speedCurve !== undefined && body.speedCurve !== null && body.speedCurve !== 'none') {
        return sendJSON(res, 400, { error: 'Quick Reframe does not support speed ramp curves — use Full Timeline Export' });
      }
      const mode = ['cover', 'contain', 'stretch', 'blur'].includes(body.fitMode) ? body.fitMode : 'cover';

      let vPre = '';
      if (body.cropRect) {
        const c = body.cropRect;
        if (!Number.isFinite(Number(c.w)) || !Number.isFinite(Number(c.h)) || !Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y)) || Number(c.w) <= 0 || Number(c.h) <= 0) {
          return sendJSON(res, 400, { error: 'Invalid cropRect dimensions' });
        }
        vPre += `crop=${Math.round(Number(c.w))}:${Math.round(Number(c.h))}:${Math.round(Number(c.x))}:${Math.round(Number(c.y))},`;
      }
      // Apply reverse BEFORE speed scaling + explicit fps filter inside graph for exact symmetric cut timing!
      if (body.reverse) vPre += 'reverse,setpts=PTS-STARTPTS,';
      if (Math.abs(speed - 1) > 0.01) vPre += `setpts=(PTS-STARTPTS)/${speed.toFixed(4)},`;
      vPre += `fps=${fps},`;

      const quickId = 'quick_' + crypto.randomBytes(6).toString('hex');
      const { fileName, fullPath: outMp4 } = uniqueExportPath(body.name || `${path.parse(item.name).name}_${w}x${h}`, quickId);

      // Compute exact source read duration = timeline dur * speed (clamped to available source)
      const srcSpan = Math.max(0.05, Math.min(Math.max(0.05, item.duration - start), dur * speed));
      const outDur = srcSpan / speed;

      const bt709Tail = ',format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709';
      let vfGraph = '';
      if (mode === 'cover') {
        vfGraph = `[0:v]${vPre}scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1${bt709Tail}[v]`;
      } else if (mode === 'contain') {
        vfGraph = `[0:v]${vPre}scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${bt709Tail}[v]`;
      } else if (mode === 'stretch') {
        vfGraph = `[0:v]${vPre}scale=${w}:${h}:flags=lanczos,setsar=1${bt709Tail}[v]`;
      } else {
        // Blur mode preserves crop, speed, and reverse BEFORE splitting bg/fg!
        vfGraph = `[0:v]${vPre}split[bg][fg];[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=28:4[b];[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos[f];[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1${bt709Tail}[v]`;
      }

      const ffArgs = ['-y', '-v', 'error', '-ss', start.toFixed(4), '-t', srcSpan.toFixed(4), '-i', item.filePath];
      if (item.hasAudio) {
        const aChain = ['aformat=sample_rates=48000:channel_layouts=stereo', 'asetpts=PTS-STARTPTS', ...buildAtempoChain(speed)];
        if (body.reverse) aChain.push('areverse', 'asetpts=PTS-STARTPTS');
        aChain.push(`atrim=start=0:duration=${outDur.toFixed(4)}`, 'asetpts=PTS-STARTPTS');
        ffArgs.push('-filter_complex', `${vfGraph};[0:a]${aChain.join(',')}[a]`, '-map', '[v]', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
      } else {
        ffArgs.push('-filter_complex', vfGraph, '-map', '[v]');
      }
      ffArgs.push(
        '-r', String(fps), '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
        '-crf', String(crf), '-pix_fmt', 'yuv420p',
        '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-movflags', '+faststart',
        '-t', outDur.toFixed(4), outMp4,
      );

      const quickJob = { cancelled: false, muxProc: null };
      const onClose = () => {
        if (!res.writableEnded) {
          quickJob.cancelled = true;
          if (quickJob.muxProc && !quickJob.muxProc.killed) {
            try { quickJob.muxProc.kill('SIGKILL'); } catch {}
          }
        }
      };
      // Listen on res.close (req.close already fired when readJsonBody consumed the body!)
      res.on('close', onClose);
      try {
        await spawnFfmpegCancellable(ffArgs, quickJob);
      } catch (err) {
        try { if (fs.existsSync(outMp4)) fs.unlinkSync(outMp4); } catch {}
        return sendJSON(res, quickJob.cancelled ? 499 : 500, { error: String(err.message || err) });
      } finally {
        res.off('close', onClose);
        if (reservedExportPaths.get(outMp4) === quickId) reservedExportPaths.delete(outMp4);
      }

      const stat = fs.statSync(outMp4);
      const meta = await probeFile(outMp4);
      if (!meta.hasVideo || meta.duration <= 0 || !meta.width || !meta.height) {
        try { fs.unlinkSync(outMp4); } catch {}
        return sendJSON(res, 500, { error: 'Quick export produced an empty or unreadable video file' });
      }
      await registerMedia(outMp4, fileName, { sourceTag: 'export', userAdded: true, refresh: true });
      return sendJSON(res, 200, {
        ok: true, fileName,
        downloadUrl: `/exports/${encodeURIComponent(fileName)}`, size: stat.size,
        duration: meta.duration, width: meta.width, height: meta.height, fps: meta.fps,
      });
    }

    // ── Stream Media / Thumbs / Exports ────────────────────────────────────
    if (p.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const id = safeDecodeURIComponent(p.split('/').pop() || '');
      const item = mediaMap.get(id);
      if (!item || !fs.existsSync(item.filePath)) { res.writeHead(404); res.end('Not found'); return; }
      return streamFileWithRange(req, res, item.filePath);
    }
    if (p.startsWith('/thumbs/') && (req.method === 'GET' || req.method === 'HEAD')) {
      return streamFileWithRange(req, res, path.join(THUMBS_DIR, path.basename(p)));
    }
    if (p.startsWith('/exports/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const fname = path.basename(safeDecodeURIComponent(p));
      const fp = path.join(EXPORTS_DIR, fname);
      if (url.searchParams.get('download') === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${fname.replace(/"/g, '')}"`);
      }
      return streamFileWithRange(req, res, fp);
    }

    // ── Static Frontend (Inject Per-Boot Session Token into index.html) ───
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJSON(res, 405, { error: 'Method not allowed' });
    }
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    if (rel === 'index.html') {
      const html = fs.readFileSync(filePath, 'utf8')
        .replace('</head>', `  <script>window.__MC_TOKEN__=${JSON.stringify(SESSION_TOKEN)};</script>\n</head>`);
      const buf = Buffer.from(html, 'utf8');
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : buf);
      return;
    }
    const st = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[MotionCut Error]', err?.message || err);
    const code = Number(err?.statusCode) || 500;
    sendJSON(res, code, { error: String(err?.message || err) });
  }
});

seedDefaultLibrary().then(() => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`MotionCut Pro v11 running at http://127.0.0.1:${PORT} (${mediaMap.size} assets)`);
  });
});
