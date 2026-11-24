/**
 * MotionCut Pro v2 — Real-Time 60fps Multi-Track Compositor, Keyframes,
 * Stackable Multi-VFX, Masks, Chroma Key, Blend Modes, Speed Ramps,
 * Vector Stickers, Hormozi Captions, WebAudio EQ/VU & Deterministic FFmpeg Export.
 */

export const TEXT_PRESETS = [
  { id: 'meta',     name: 'DIN Meta Hook',   text: 'FLORA + BLENDER\nIS NEW META', font: 'DIN Condensed, Impact, sans-serif', size: 112, color: '#ffffff', stroke: '#000000', strokeW: 0, bg: 'transparent', bgAlpha: 0, spacing: 2, anim: 'pop', y: -320 },
  { id: 'bold',     name: 'Viral Bold',      text: 'WATCH THIS', font: 'Impact, Arial Black, sans-serif', size: 108, color: '#fff200', stroke: '#000000', strokeW: 10, bg: 'transparent', bgAlpha: 0, spacing: 2, anim: 'pop', y: 0 },
  { id: 'pill',     name: 'CapCut Pill',     text: 'HOW THIS WAS MADE', font: '-apple-system, Inter, sans-serif', size: 52, color: '#081012', stroke: 'transparent', strokeW: 0, bg: '#00e5c3', bgAlpha: 0.96, spacing: 1, anim: 'slideUp', y: 310 },
  { id: 'scanner',  name: 'Scanner Plate',   text: 'PLATE 01  ·  1200 DPI', font: 'SF Mono, Menlo, monospace', size: 40, color: '#eef6ff', stroke: 'transparent', strokeW: 0, bg: '#050810', bgAlpha: 0.78, spacing: 6, anim: 'typewriter', y: -360 },
  { id: 'subtitle', name: 'Clean Caption',   text: 'one static image turned into a studio reel', font: '-apple-system, Inter, sans-serif', size: 46, color: '#ffffff', stroke: '#000000', strokeW: 5, bg: '#000000', bgAlpha: 0.55, spacing: 0, anim: 'fade', y: 360 },
  { id: 'neon',     name: 'Neon Cyber',      text: 'MOTIONVIZ', font: 'Avenir Next, Helvetica Neue, sans-serif', size: 96, color: '#00e5c3', stroke: '#00e5c3', strokeW: 2, bg: 'transparent', bgAlpha: 0, spacing: 12, anim: 'glitch', y: 0 },
  { id: 'minimal',  name: 'Swiss Editorial', text: 'FRAME 0001\nFLORA × BLENDER', font: 'Helvetica Neue, Inter, sans-serif', size: 58, color: '#f4f0e6', stroke: 'transparent', strokeW: 0, bg: 'transparent', bgAlpha: 0, spacing: 10, anim: 'fade', y: 0 },
  { id: 'callout',  name: 'Highlight Tag',   text: '0.00$ LOCAL RENDER', font: 'SF Mono, Menlo, monospace', size: 38, color: '#ffffff', stroke: 'transparent', strokeW: 0, bg: '#ff4d6d', bgAlpha: 0.94, spacing: 2, anim: 'pop', y: -260 },
];

export const GRAPHIC_PRESETS = [
  { id: 'recBadge',    name: 'REC ● Camera',     swatch: '#1a0a10', label: '● REC' },
  { id: 'viewfinder',  name: 'Viewfinder HUD',   swatch: '#0d1420', label: '[ + ]' },
  { id: 'progressBar', name: 'Timeline Bar',     swatch: '#091f1c', label: '━━━' },
  { id: 'lowerThird',  name: 'Lower Third',      swatch: '#161b26', label: '▎TITLE' },
  { id: 'arrowRight',  name: 'Accent Arrow',     swatch: '#1c1528', label: '➜' },
  { id: 'colorMatte',  name: 'Gradient Matte',   swatch: 'linear-gradient(135deg,#00e5c3,#3b82f6)', label: 'BG' },
];

export const EFFECT_PRESETS = [
  { id: 'rgbSplit',   name: 'RGB Split',       swatch: 'linear-gradient(90deg,#ff2a55,#00f0ff)', label: 'RGB' },
  { id: 'scannerBar', name: 'Optical Scanner', swatch: 'linear-gradient(90deg,#050814,#0033ff,#00f5ff,#fff)', label: 'SCAN' },
  { id: 'crt',        name: 'CRT Scanlines',   swatch: 'repeating-linear-gradient(0deg,#111,#111 2px,#2b3040 2px,#2b3040 4px)', label: 'CRT' },
  { id: 'vhsGlitch',  name: 'VHS Glitch',      swatch: 'linear-gradient(135deg,#2a0845,#ff006e)', label: 'VHS' },
  { id: 'grain',      name: '35mm Grain',      swatch: 'radial-gradient(circle,#444,#141414)', label: 'FILM' },
  { id: 'negative',   name: 'Negative X-Ray',  swatch: 'linear-gradient(135deg,#fff,#1b2438)', label: 'INV' },
  { id: 'pixelate',   name: 'PS2 Pixelate',    swatch: 'linear-gradient(135deg,#334155,#0f172a)', label: '480i' },
  { id: 'zoomPulse',  name: 'Beat Zoom Pulse', swatch: 'radial-gradient(circle,#00e5c3,#091418)', label: 'BEAT' },
  { id: 'softGlow',   name: 'Dream Glow',      swatch: 'radial-gradient(circle,#ffd6e7,#3b1d38)', label: 'GLOW' },
  { id: 'halftone',   name: 'Thermal Edge',    swatch: 'linear-gradient(135deg,#ff4d6d,#ffb84d,#00e5c3)', label: 'EDGE' },
];

export const TRANSITION_PRESETS = [
  { id: 'none',       name: 'Hard Cut',      label: '|' },
  { id: 'fade',       name: 'Cross Fade',    label: '◐' },
  { id: 'flashWhite', name: 'Flash White',   label: '✦' },
  { id: 'fadeBlack',  name: 'Dip to Black',  label: '●' },
  { id: 'zoomIn',     name: 'Zoom In',       label: '⊕' },
  { id: 'zoomOut',    name: 'Zoom Out',      label: '⊖' },
  { id: 'slideLeft',  name: 'Slide Left',    label: '←' },
  { id: 'slideRight', name: 'Slide Right',   label: '→' },
  { id: 'wipeRight',  name: 'Scanner Wipe',  label: '▌' },
  { id: 'glitchCut',  name: 'Glitch Cut',    label: '⚡' },
];

export const FILTER_PRESETS = [
  { id: 'none',      name: 'Original',     vals: { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, vignette: 0 } },
  { id: 'cinema',    name: 'Cinema Teal',  vals: { brightness: 96,  contrast: 118, saturate: 112, hue: -8,  blur: 0, vignette: 35 } },
  { id: 'y2k',       name: 'Y2K Gloss',    vals: { brightness: 106, contrast: 114, saturate: 128, hue: 4,   blur: 0, vignette: 18 } },
  { id: 'darkroom',  name: 'Darkroom',     vals: { brightness: 84,  contrast: 136, saturate: 92,  hue: -12, blur: 0, vignette: 55 } },
  { id: 'warmFilm',  name: 'Warm Kodak',   vals: { brightness: 104, contrast: 108, saturate: 118, hue: 14,  blur: 0, vignette: 26 } },
  { id: 'noir',      name: 'High Noir',    vals: { brightness: 98,  contrast: 148, saturate: 0,   hue: 0,   blur: 0, vignette: 48 } },
  { id: 'vivid',     name: 'Vivid Pop',    vals: { brightness: 105, contrast: 120, saturate: 145, hue: 0,   blur: 0, vignette: 10 } },
  { id: 'cyber',     name: 'Neon Cyber',   vals: { brightness: 96,  contrast: 132, saturate: 155, hue: -24, blur: 0, vignette: 40 } },
];

export const SPEED_CURVES = {
  normal:  { name: 'Constant',  fn: u => u },
  montage: { name: 'Montage',   fn: u => u < 0.25 ? u * 2.0 : u < 0.75 ? 0.5 + (u - 0.25) * 0.4 : 0.7 + (u - 0.75) * 1.2 },
  hero:    { name: 'Hero Slow', fn: u => u < 0.35 ? u * 1.6 : u < 0.7 ? 0.56 + (u - 0.35) * 0.35 : 0.6825 + (u - 0.7) * 1.058 },
  bullet:  { name: 'Bullet',    fn: u => Math.pow(u, 1.8) },
  flashIn: { name: 'Flash In',  fn: u => 1 - Math.pow(1 - u, 2.2) },
  jumpCut: { name: 'Ease S',    fn: u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2 },
};

export const SFX_PRESETS = [
  { id: 'whoosh',  name: 'Optical Whoosh', dur: 0.65 },
  { id: 'subDrop', name: '808 Sub Drop',   dur: 1.10 },
  { id: 'glitch',  name: 'Glitch Hit',     dur: 0.35 },
  { id: 'shutter', name: 'Camera Shutter', dur: 0.25 },
  { id: 'riser',   name: 'Tension Riser',  dur: 1.60 },
  { id: 'chime',   name: 'Lock-In Chime',  dur: 0.85 },
];

export function synthSfxWavUrl(sfxId) {
  const sr = 44100;
  const preset = SFX_PRESETS.find(s => s.id === sfxId) || SFX_PRESETS[0];
  const n = Math.floor(sr * preset.dur);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = i / n;
    let v = 0;
    if (sfxId === 'whoosh') {
      const env = Math.sin(Math.PI * u) ** 1.6;
      v = (Math.random() * 2 - 1) * env * 0.45 + Math.sin(2 * Math.PI * (180 + 520 * u) * t) * env * 0.22;
    } else if (sfxId === 'subDrop') {
      const f = 36 + 115 * Math.exp(-t * 5.2);
      v = Math.tanh(Math.sin(2 * Math.PI * f * t) * 1.8) * Math.exp(-t * 2.8) * 0.85;
    } else if (sfxId === 'glitch') {
      const step = Math.floor(t * 48);
      const f = 320 + ((step * 313) % 1900);
      v = (Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() * 2 - 1) * 0.4) * Math.exp(-t * 9.5);
    } else if (sfxId === 'shutter') {
      v = ((Math.random() * 2 - 1) * Math.exp(-t * 65) + Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t * 110) * 0.5) * 0.8;
    } else if (sfxId === 'riser') {
      const f = 140 * Math.pow(8, u);
      v = (Math.sin(2 * Math.PI * f * t) * 0.35 + (Math.random() * 2 - 1) * 0.25) * (u ** 1.8);
    } else {
      v = (Math.sin(2 * Math.PI * 1318.5 * t) + 0.55 * Math.sin(2 * Math.PI * 1760 * t)) * Math.exp(-t * 5.5) * 0.6;
    }
    data[i] = Math.max(-1, Math.min(1, v));
  }
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.round(data[i] * 32767), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function evalClipProp(clip, prop, localTime) {
  const kfs = clip.keyframes?.[prop];
  if (!kfs || kfs.length === 0) return clip[prop];
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  if (localTime <= sorted[0].t) return sorted[0].v;
  if (localTime >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (localTime >= a.t && localTime <= b.t) {
      let u = (localTime - a.t) / Math.max(0.0001, b.t - a.t);
      u = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      return a.v + (b.v - a.v) * u;
    }
  }
  return clip[prop];
}

function hexToRgb(hex) {
  const clean = (hex || '#00ff00').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class CompositorEngine {
  constructor(canvas, overlayCanvas, onMediaReady = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext('2d');
    this.onMediaReady = onMediaReady;
    this.mediaElements = new Map();
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
    this.chromaCanvas = document.createElement('canvas');
    this.chromaCtx = this.chromaCanvas.getContext('2d', { willReadFrequently: true });
    this.audioCtx = null;
    this.analyserL = null;
    this.analyserR = null;
    this.audioNodes = new Map();
    this.showGuides = false;
    this.lastLayerBounds = []; // [{ clipId, cx, cy, w, h, rot }] for on-canvas hit-testing!
    this.snapLines = { x: false, y: false };
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const splitter = this.audioCtx.createChannelSplitter(2);
      this.analyserL = this.audioCtx.createAnalyser();
      this.analyserR = this.audioCtx.createAnalyser();
      this.analyserL.fftSize = 256;
      this.analyserR.fftSize = 256;
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.connect(this.audioCtx.destination);
      this.masterGain.connect(splitter);
      splitter.connect(this.analyserL, 0);
      splitter.connect(this.analyserR, 1);
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
  }

  getVULevels() {
    if (!this.analyserL || !this.analyserR) return [0, 0];
    const read = an => {
      const buf = new Uint8Array(an.frequencyBinCount);
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
      return Math.min(1, peak * 1.45);
    };
    return [read(this.analyserL), read(this.analyserR)];
  }

  ensureMediaElement(clip, mediaItem) {
    if (!mediaItem) return null;
    let el = this.mediaElements.get(clip.id);
    if (el && el.dataset.url === mediaItem.url) return el;

    if (clip.type === 'video') {
      el = document.createElement('video');
      el.src = mediaItem.url;
      el.crossOrigin = 'anonymous';
      el.playsInline = true;
      el.preload = 'auto';
      el.muted = true;
      el.addEventListener('loadeddata', () => this.onMediaReady?.(), { once: true });
      el.addEventListener('seeked', () => this.onMediaReady?.());
    } else if (clip.type === 'audio') {
      el = document.createElement('audio');
      el.src = mediaItem.url;
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
    } else if (clip.type === 'image') {
      el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => this.onMediaReady?.();
      el.src = mediaItem.url;
    }
    if (el) {
      el.dataset.url = mediaItem.url;
      this.mediaElements.set(clip.id, el);
    }
    return el;
  }

  cleanupUnusedElements(activeIds) {
    for (const [id, el] of this.mediaElements.entries()) {
      if (!activeIds.has(id)) {
        try { if (el.pause) el.pause(); } catch {}
        this.mediaElements.delete(id);
        this.audioNodes.delete(id);
      }
    }
  }

  connectAudioElement(clip, el) {
    if (!this.audioCtx || !el || (clip.type !== 'video' && clip.type !== 'audio')) return null;
    if (this.audioNodes.has(clip.id)) return this.audioNodes.get(clip.id);
    try {
      el.muted = false;
      const src = this.audioCtx.createMediaElementSource(el);
      const bass = this.audioCtx.createBiquadFilter();
      bass.type = 'lowshelf'; bass.frequency.value = 180;
      const treble = this.audioCtx.createBiquadFilter();
      treble.type = 'highshelf'; treble.frequency.value = 3200;
      const bp = this.audioCtx.createBiquadFilter();
      bp.type = 'allpass';
      const gain = this.audioCtx.createGain();
      src.connect(bass); bass.connect(treble); treble.connect(bp); bp.connect(gain);
      gain.connect(this.masterGain);
      const chain = { src, bass, treble, bp, gain };
      this.audioNodes.set(clip.id, chain);
      return chain;
    } catch { return null; }
  }

  computeSourceTime(clip, media, localT) {
    const speed = Math.max(0.25, Math.min(8, clip.speed || 1));
    const curve = SPEED_CURVES[clip.speedCurve || 'normal'] || SPEED_CURVES.normal;
    const u = Math.max(0, Math.min(1, localT / Math.max(0.001, clip.duration)));
    const mappedLocal = curve.fn(u) * clip.duration;
    let mediaT = (clip.trimStart || 0) + mappedLocal * speed;
    if (clip.reverse) {
      const endSrc = (clip.trimStart || 0) + clip.duration * speed;
      mediaT = Math.max(0, endSrc - mappedLocal * speed);
    }
    if (media?.duration) mediaT = Math.max(0, Math.min(media.duration - 0.025, mediaT));
    return mediaT;
  }

  syncMediaForTime(state, t, isPlaying) {
    this.cleanupUnusedElements(new Set(state.clips.map(c => c.id)));
    for (const clip of state.clips) {
      if (clip.type === 'text' || clip.type === 'graphic') continue;
      const track = state.tracks.find(tr => tr.id === clip.trackId);
      const media = state.library.find(m => m.id === clip.mediaId);
      const el = this.ensureMediaElement(clip, media);
      if (!el || clip.type === 'image') continue;

      const inRange = t >= clip.start && t < clip.start + clip.duration;
      const speed = Math.max(0.25, Math.min(8, clip.speed || 1));
      const voiceRateMul = clip.voiceFx === 'chipmunk' ? 1.35 : clip.voiceFx === 'deep' ? 0.78 : 1.0;

      if (inRange) {
        const localT = t - clip.start;
        const mediaT = this.computeSourceTime(clip, media, localT);
        const trackMuted = track?.muted || clip.muted || state.masterMute;
        const canAudio = !trackMuted && (clip.type === 'audio' || (clip.type === 'video' && media?.hasAudio && !clip.audioDetached));
        let vol = canAudio ? (clip.volume ?? 1) : 0;
        if (vol > 0) {
          if ((clip.fadeIn || 0) > 0 && localT < clip.fadeIn) vol *= localT / clip.fadeIn;
          if ((clip.fadeOut || 0) > 0 && (clip.duration - localT) < clip.fadeOut) vol *= Math.max(0, (clip.duration - localT) / clip.fadeOut);
        }

        if (isPlaying) {
          this.ensureAudioContext();
          const chain = this.connectAudioElement(clip, el);
          if (chain) {
            chain.gain.gain.setTargetAtTime(vol, this.audioCtx.currentTime, 0.015);
            chain.bass.gain.setTargetAtTime(clip.eqBass || 0, this.audioCtx.currentTime, 0.02);
            chain.treble.gain.setTargetAtTime(clip.eqTreble || 0, this.audioCtx.currentTime, 0.02);
            if (clip.voiceFx === 'radio') {
              chain.bp.type = 'bandpass'; chain.bp.frequency.value = 1400; chain.bp.Q.value = 2.4;
            } else {
              chain.bp.type = 'allpass';
            }
          } else {
            el.muted = !canAudio; el.volume = Math.max(0, Math.min(1, vol));
          }
          el.playbackRate = Math.max(0.25, Math.min(4, speed * voiceRateMul));
          if (clip.reverse || (clip.speedCurve && clip.speedCurve !== 'normal')) {
            el.pause();
            if (Math.abs(el.currentTime - mediaT) > 0.03) el.currentTime = mediaT;
          } else {
            if (Math.abs(el.currentTime - mediaT) > 0.24) el.currentTime = mediaT;
            if (el.paused) el.play().catch(() => {});
          }
        } else {
          if (!el.paused) el.pause();
          const chain = this.audioNodes.get(clip.id);
          if (chain && this.audioCtx) chain.gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
          if (el.readyState >= 1 && Math.abs(el.currentTime - mediaT) > 0.02) el.currentTime = mediaT;
        }
      } else {
        if (!el.paused) el.pause();
        const chain = this.audioNodes.get(clip.id);
        if (chain && this.audioCtx) chain.gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      }
    }
  }

  async seekAllExact(state, t) {
    const promises = [];
    for (const clip of state.clips) {
      if (clip.type !== 'video') continue;
      if (t < clip.start || t >= clip.start + clip.duration) continue;
      const media = state.library.find(m => m.id === clip.mediaId);
      const el = this.ensureMediaElement(clip, media);
      if (!el) continue;
      if (el.readyState < 2) {
        await new Promise(res => {
          const ok = () => { el.removeEventListener('loadeddata', ok); res(); };
          el.addEventListener('loadeddata', ok, { once: true });
          setTimeout(res, 1500);
        });
      }
      const mediaT = this.computeSourceTime(clip, media, t - clip.start);
      if (Math.abs(el.currentTime - mediaT) > 0.012) {
        promises.push(new Promise(resolve => {
          const done = () => { el.removeEventListener('seeked', done); resolve(); };
          el.addEventListener('seeked', done, { once: true });
          setTimeout(done, 260);
          el.currentTime = mediaT;
        }));
      }
    }
    if (promises.length) await Promise.all(promises);
  }

  renderFrame(state, t, drawOverlay = true) {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W; this.canvas.height = H;
      this.overlay.width = W; this.overlay.height = H;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = state.bgMode === 'white' ? '#f3f1eb' : '#000000';
    ctx.fillRect(0, 0, W, H);

    const renderTracks = [...state.tracks].filter(tr => tr.type !== 'audio' && !tr.hidden).reverse();

    // CapCut blurred pillars backdrop
    if (state.bgMode === 'blur') {
      const mainTrack = renderTracks.find(tr => tr.type === 'video');
      const mainClip = mainTrack && state.clips.find(c => c.trackId === mainTrack.id && t >= c.start && t < c.start + c.duration);
      if (mainClip) {
        const media = state.library.find(m => m.id === mainClip.mediaId);
        const el = this.ensureMediaElement(mainClip, media);
        if (el && (el.readyState >= 2 || (el.complete && el.naturalWidth > 0))) {
          ctx.save();
          ctx.filter = 'blur(38px) brightness(0.6)';
          const sw = el.videoWidth || el.naturalWidth || W;
          const sh = el.videoHeight || el.naturalHeight || H;
          const sc = Math.max(W / sw, H / sh) * 1.12;
          ctx.drawImage(el, (W - sw * sc) / 2, (H - sh * sc) / 2, sw * sc, sh * sc);
          ctx.restore();
        }
      }
    }

    this.lastLayerBounds = [];
    let selectedBounds = null;

    for (const track of renderTracks) {
      const clips = state.clips.filter(c => c.trackId === track.id && t >= c.start && t < c.start + c.duration);
      for (const clip of clips) {
        const bounds = this.drawClip(ctx, state, clip, t - clip.start, W, H, t);
        if (bounds) {
          this.lastLayerBounds.push({ clipId: clip.id, ...bounds });
          if (clip.id === state.selectedClipId) selectedBounds = bounds;
        }
      }
    }

    // Active Captions (CC) overlay on very top
    for (const cap of state.captions || []) {
      if (t >= cap.start && t < cap.end) {
        this.drawCaption(ctx, cap, t, state.captionStyle || 'hormozi', W, H);
      }
    }

    ctx.restore();
    if (drawOverlay) this.renderOverlay(state, selectedBounds, W, H);
  }

  applyMaskClip(ctx, clip, dw, dh) {
    const m = clip.maskType || 'none';
    if (m === 'none') return;
    const size = (clip.maskSize ?? 55) / 100;
    const mx = ((clip.maskX ?? 0) / 100) * dw;
    const my = ((clip.maskY ?? 0) / 100) * dh;
    const rot = ((clip.maskRot ?? 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(rot);
    ctx.beginPath();
    if (clip.maskInvert) {
      ctx.rect(-dw * 2, -dh * 2, dw * 4, dh * 4);
    }
    if (m === 'circle') {
      const r = Math.min(dw, dh) * 0.5 * size;
      ctx.arc(0, 0, Math.max(10, r), 0, Math.PI * 2, Boolean(clip.maskInvert));
    } else if (m === 'rect') {
      const rw = dw * size, rh = dh * size;
      if (clip.maskInvert) {
        ctx.moveTo(-rw / 2, -rh / 2); ctx.lineTo(-rw / 2, rh / 2); ctx.lineTo(rw / 2, rh / 2); ctx.lineTo(rw / 2, -rh / 2); ctx.closePath();
      } else {
        ctx.rect(-rw / 2, -rh / 2, rw, rh);
      }
    } else if (m === 'split') {
      ctx.rect(-dw * 2, -dh * 2, dw * 2, dh * 4);
    } else if (m === 'mirror') {
      const band = dh * size;
      ctx.rect(-dw * 2, -band / 2, dw * 4, band);
    }
    ctx.restore();
    ctx.clip(clip.maskInvert ? 'evenodd' : 'nonzero');
  }

  getChromaKeyedSource(el, cL, cT, cw, ch, clip) {
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(cw, ch));
    const pw = Math.max(16, Math.round(cw * scale));
    const ph = Math.max(16, Math.round(ch * scale));
    this.chromaCanvas.width = pw;
    this.chromaCanvas.height = ph;
    this.chromaCtx.clearRect(0, 0, pw, ph);
    this.chromaCtx.drawImage(el, cL, cT, cw, ch, 0, 0, pw, ph);
    const imgData = this.chromaCtx.getImageData(0, 0, pw, ph);
    const d = imgData.data;
    const [kr, kg, kb] = hexToRgb(clip.chromaColor || '#00ff00');
    const sim = (clip.chromaSimilarity ?? 36) * 2.6;
    const smooth = Math.max(1, (clip.chromaSmoothness ?? 14) * 2.2);
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < sim) d[i + 3] = 0;
      else if (dist < sim + smooth) d[i + 3] = Math.round(((dist - sim) / smooth) * d[i + 3]);
    }
    this.chromaCtx.putImageData(imgData, 0, 0);
    return this.chromaCanvas;
  }

  drawClip(ctx, state, clip, localT, W, H, globalT) {
    const posX = evalClipProp(clip, 'x', localT) || 0;
    const posY = evalClipProp(clip, 'y', localT) || 0;
    const scalePct = evalClipProp(clip, 'scale', localT) ?? 100;
    const rotDeg = evalClipProp(clip, 'rotation', localT) || 0;
    let opacity = (evalClipProp(clip, 'opacity', localT) ?? 100) / 100;

    // Normalize effects map (supports stackable multi-VFX!)
    const fx = clip.effects || {};
    let trScale = 1, trX = 0, trY = 0, flashWhite = 0, fadeBlack = 0, wipeFrac = 1, glitchAmt = 0;
    const trDur = Math.min(clip.transitionDur || 0.4, clip.duration * 0.45);
    const applyTrans = (kind, p) => {
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      if (kind === 'fade') opacity *= e;
      else if (kind === 'flashWhite') { flashWhite = Math.max(flashWhite, 1 - e); opacity *= Math.min(1, p * 2.5); }
      else if (kind === 'fadeBlack') fadeBlack = Math.max(fadeBlack, 1 - e);
      else if (kind === 'zoomIn') { trScale *= 0.65 + 0.35 * e; opacity *= e; }
      else if (kind === 'zoomOut') { trScale *= 1.45 - 0.45 * e; opacity *= e; }
      else if (kind === 'slideLeft') trX += (1 - e) * W;
      else if (kind === 'slideRight') trX -= (1 - e) * W;
      else if (kind === 'wipeRight') wipeFrac = Math.min(wipeFrac, e);
      else if (kind === 'glitchCut') glitchAmt = Math.max(glitchAmt, 1 - e);
    };
    if (clip.transitionIn && clip.transitionIn !== 'none' && localT < trDur) applyTrans(clip.transitionIn, localT / trDur);
    if (clip.transitionOut && clip.transitionOut !== 'none' && (clip.duration - localT) < trDur) applyTrans(clip.transitionOut, (clip.duration - localT) / trDur);

    if (fx.zoomPulse) {
      const beat = (globalT * 2.0) % 1;
      trScale *= 1 + (0.09 * (fx.zoomPulse / 100)) * Math.exp(-beat * 7);
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    if (clip.blendMode && clip.blendMode !== 'source-over') {
      ctx.globalCompositeOperation = clip.blendMode;
    }
    if (wipeFrac < 0.999) {
      ctx.beginPath(); ctx.rect(0, 0, W * wipeFrac, H); ctx.clip();
    }

    let bounds = null;

    if (clip.type === 'text') {
      bounds = this.drawTextClip(ctx, clip, localT, W, H, posX + trX, posY + trY, (scalePct / 100) * trScale, rotDeg);
    } else if (clip.type === 'graphic') {
      bounds = this.drawGraphicClip(ctx, clip, localT, W, H, posX + trX, posY + trY, (scalePct / 100) * trScale, rotDeg, globalT, state.getProjectDuration());
    } else {
      const media = state.library.find(m => m.id === clip.mediaId);
      const el = this.ensureMediaElement(clip, media);
      if (el && ((clip.type === 'video' && el.readyState >= 2) || (clip.type === 'image' && el.complete && el.naturalWidth > 0))) {
        const sw = el.videoWidth || el.naturalWidth;
        const sh = el.videoHeight || el.naturalHeight;
        const cL = ((clip.cropLeft || 0) / 100) * sw;
        const cR = ((clip.cropRight || 0) / 100) * sw;
        const cT = ((clip.cropTop || 0) / 100) * sh;
        const cB = ((clip.cropBottom || 0) / 100) * sh;
        const cw = Math.max(8, sw - cL - cR);
        const ch = Math.max(8, sh - cT - cB);

        let dw = W, dh = H;
        const fit = clip.fitMode || 'contain';
        if (fit === 'contain') { const s = Math.min(W / cw, H / ch); dw = cw * s; dh = ch * s; }
        else if (fit === 'cover') { const s = Math.max(W / cw, H / ch); dw = cw * s; dh = ch * s; }
        dw *= (scalePct / 100) * trScale;
        dh *= (scalePct / 100) * trScale;

        const cx = W / 2 + posX + trX;
        const cy = H / 2 + posY + trY;

        ctx.translate(cx, cy);
        ctx.rotate((rotDeg * Math.PI) / 180);
        ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);

        // Apply CapCut Mask inside local clip space!
        this.applyMaskClip(ctx, clip, dw, dh);

        const br = clip.brightness ?? 100;
        const ct = clip.contrast ?? 100;
        const sat = clip.saturate ?? 100;
        const hue = (clip.hue ?? 0) + (fx.halftone ? (fx.halftone * 1.4) : 0);
        const bl = clip.blur ?? 0;
        const inv = fx.negative ? fx.negative : 0;
        ctx.filter = `brightness(${br}%) contrast(${ct}%) saturate(${sat}%) hue-rotate(${hue}deg) blur(${bl}px) invert(${inv}%)`;

        // Optional real per-pixel Chroma Key!
        let srcEl = el, sx = cL, sy = cT, sWidth = cw, sHeight = ch;
        if (clip.chromaEnabled) {
          srcEl = this.getChromaKeyedSource(el, cL, cT, cw, ch, clip);
          sx = 0; sy = 0; sWidth = srcEl.width; sHeight = srcEl.height;
        }

        if (fx.pixelate) {
          const factor = Math.max(4, Math.round(4 + (fx.pixelate / 100) * 24));
          const pw = Math.max(24, Math.round(dw / factor));
          const ph = Math.max(14, Math.round(dh / factor));
          this.offscreen.width = pw; this.offscreen.height = ph;
          this.offCtx.drawImage(srcEl, sx, sy, sWidth, sHeight, 0, 0, pw, ph);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(this.offscreen, -dw / 2, -dh / 2, dw, dh);
          ctx.imageSmoothingEnabled = true;
        } else {
          ctx.drawImage(srcEl, sx, sy, sWidth, sHeight, -dw / 2, -dh / 2, dw, dh);
        }

        ctx.filter = 'none';
        if (fx.rgbSplit || glitchAmt > 0.05) {
          const amt = fx.rgbSplit ? (fx.rgbSplit / 100) * 26 : glitchAmt * 38;
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.42 * (fx.rgbSplit ? fx.rgbSplit / 100 : 1);
          ctx.drawImage(srcEl, sx, sy, sWidth, sHeight, -dw / 2 - amt, -dh / 2, dw, dh);
          ctx.drawImage(srcEl, sx, sy, sWidth, sHeight, -dw / 2 + amt, -dh / 2, dw, dh);
          ctx.restore();
        }
        if (fx.softGlow) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.filter = `blur(${Math.round(8 + (fx.softGlow / 100) * 22)}px) brightness(1.15)`;
          ctx.globalAlpha = (fx.softGlow / 100) * 0.48;
          ctx.drawImage(srcEl, sx, sy, sWidth, sHeight, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
        if (fx.vhsGlitch || glitchAmt > 0.05) {
          const strength = fx.vhsGlitch ? fx.vhsGlitch / 100 : glitchAmt;
          for (let i = 0; i < 7; i++) {
            const sy2 = Math.floor(Math.sin(globalT * 29 + i * 7.3) * 0.5 * sHeight + sHeight * 0.5);
            const shs = Math.max(8, Math.floor(sHeight * 0.055));
            const offx = Math.sin(globalT * 61 + i * 13) * 34 * strength;
            ctx.drawImage(srcEl, sx, sy + Math.min(sHeight - shs, Math.max(0, sy2)), sWidth, shs,
              -dw / 2 + offx, -dh / 2 + (sy2 / sHeight) * dh, dw, (shs / sHeight) * dh);
          }
        }
        if (fx.scannerBar) {
          const scanU = (globalT * 0.45) % 1;
          const bx = -dw / 2 + scanU * dw;
          const a = fx.scannerBar / 100;
          const grad = ctx.createLinearGradient(bx - 55, 0, bx + 45, 0);
          grad.addColorStop(0, 'rgba(0,40,255,0)');
          grad.addColorStop(0.35, `rgba(0,60,255,${0.7 * a})`);
          grad.addColorStop(0.55, `rgba(0,245,255,${0.9 * a})`);
          grad.addColorStop(0.75, `rgba(255,255,255,${0.98 * a})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(bx - 55, -dh / 2, 100, dh);
        }
        if (fx.crt) {
          ctx.fillStyle = `rgba(0,0,0,${(fx.crt / 100) * 0.42})`;
          for (let y = -dh / 2; y < dh / 2; y += 6) ctx.fillRect(-dw / 2, y, dw, 2);
        }
        if (fx.grain) {
          ctx.fillStyle = `rgba(255,255,255,${(fx.grain / 100) * 0.14})`;
          for (let i = 0; i < 420; i++) {
            const gx = ((Math.sin(i * 12.9898 + globalT * 91) * 43758.5453) % 1 + 1) % 1;
            const gy = ((Math.sin(i * 78.233 + globalT * 53) * 43758.5453) % 1 + 1) % 1;
            ctx.fillRect(-dw / 2 + gx * dw, -dh / 2 + gy * dh, 3, 3);
          }
        }

        bounds = { cx, cy, w: dw, h: dh, rot: rotDeg };
      }
    }

    ctx.restore();

    if ((clip.vignette || 0) > 0) {
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,0,${(clip.vignette / 100) * 0.85})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }
    if (flashWhite > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flashWhite})`; ctx.fillRect(0, 0, W, H); }
    if (fadeBlack > 0.01)  { ctx.fillStyle = `rgba(0,0,0,${fadeBlack})`;        ctx.fillRect(0, 0, W, H); }
    return bounds;
  }

  drawGraphicClip(ctx, clip, localT, W, H, posX, posY, scale, rotDeg, globalT, totalDur) {
    const cx = W / 2 + posX, cy = H / 2 + posY;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.scale(scale, scale);

    let bw = 360, bh = 120;
    const k = clip.graphicType || 'recBadge';
    if (k === 'recBadge') {
      bw = 230; bh = 68;
      ctx.fillStyle = 'rgba(10,12,18,0.72)';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();
      const blink = Math.floor(globalT * 2) % 2 === 0;
      if (blink) { ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(-68, 0, 12, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.font = '700 32px SF Mono, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('REC', -42, 2);
    } else if (k === 'viewfinder') {
      bw = W * 0.82; bh = H * 0.82;
      ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = 4;
      const c = 48;
      for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const x = sx * bw / 2, y = sy * bh / 2;
        ctx.beginPath(); ctx.moveTo(x, y - sy * c); ctx.lineTo(x, y); ctx.lineTo(x - sx * c, y); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
    } else if (k === 'progressBar') {
      bw = W * 0.86; bh = 18;
      const pct = Math.min(1, globalT / Math.max(0.5, totalDur));
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 9); ctx.fill();
      ctx.fillStyle = '#00e5c3';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, Math.max(16, bw * pct), bh, 9); ctx.fill();
    } else if (k === 'lowerThird') {
      bw = 560; bh = 112;
      ctx.fillStyle = 'rgba(10,12,18,0.82)';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 10); ctx.fill();
      ctx.fillStyle = '#00e5c3'; ctx.fillRect(-bw / 2, -bh / 2, 10, bh);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 34px -apple-system, Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(clip.graphicTitle || 'MOTIONVIZ STUDIO', -bw / 2 + 30, -14);
      ctx.fillStyle = '#9aa6bd'; ctx.font = '600 22px SF Mono, Menlo, monospace';
      ctx.fillText(clip.graphicSub || 'NEON × FLORA × BLENDER MCP', -bw / 2 + 30, 24);
    } else if (k === 'arrowRight') {
      bw = 220; bh = 100;
      ctx.strokeStyle = '#00e5c3'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(72, 0); ctx.moveTo(30, -38); ctx.lineTo(76, 0); ctx.lineTo(30, 38); ctx.stroke();
    } else {
      bw = W; bh = H;
      const g = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
      g.addColorStop(0, '#071b24'); g.addColorStop(0.5, '#0b1021'); g.addColorStop(1, '#260b24');
      ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
    ctx.restore();
    return { cx, cy, w: bw * scale, h: bh * scale, rot: rotDeg };
  }

  drawTextClip(ctx, clip, localT, W, H, posX, posY, scale, rotDeg) {
    let raw = clip.text || 'TEXT';
    let animAlpha = 1, animY = 0, animScale = 1, glitchX = 0;
    const u = Math.min(1, localT / 0.45);
    const ease = 1 - Math.pow(1 - u, 3);

    if (clip.textAnim === 'fade') animAlpha = ease;
    else if (clip.textAnim === 'pop') animScale = 0.35 + 0.65 * (u < 0.75 ? (u / 0.75) * 1.12 : 1.12 - ((u - 0.75) / 0.25) * 0.12);
    else if (clip.textAnim === 'slideUp') { animY = (1 - ease) * 90; animAlpha = ease; }
    else if (clip.textAnim === 'typewriter') raw = raw.slice(0, Math.max(1, Math.ceil(raw.length * Math.min(1, localT / 1.1))));
    else if (clip.textAnim === 'glitch' && localT < 0.55) glitchX = Math.sin(localT * 95) * 18 * (1 - localT / 0.55);

    const cx = W / 2 + posX + glitchX;
    const cy = H / 2 + posY + animY;
    const fontSize = (clip.fontSize || 76) * scale * animScale;
    const lines = raw.split('\n');
    const lineH = fontSize * (clip.lineHeight || 1.15);

    ctx.save();
    ctx.globalAlpha *= animAlpha;
    ctx.translate(cx, cy);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.font = `${clip.fontItalic ? 'italic ' : ''}${clip.fontWeight || 800} ${fontSize}px ${clip.fontFamily || 'DIN Condensed, sans-serif'}`;
    ctx.textAlign = clip.textAlign || 'center';
    ctx.textBaseline = 'middle';

    let maxW = 0;
    for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
    const totalH = lines.length * lineH;

    if (clip.textBg && clip.textBg !== 'transparent' && (clip.textBgAlpha || 0) > 0) {
      const padX = fontSize * 0.42, padY = fontSize * 0.24;
      ctx.save();
      ctx.globalAlpha *= clip.textBgAlpha;
      ctx.fillStyle = clip.textBg;
      ctx.beginPath();
      ctx.roundRect(-maxW / 2 - padX, -totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2, Math.min(20, fontSize * 0.25));
      ctx.fill();
      ctx.restore();
    }

    ctx.shadowColor = 'rgba(0,0,0,0.48)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    lines.forEach((ln, idx) => {
      const ly = -totalH / 2 + lineH * (idx + 0.5);
      if ((clip.strokeWidth || 0) > 0 && clip.strokeColor && clip.strokeColor !== 'transparent') {
        ctx.lineWidth = clip.strokeWidth * scale;
        ctx.strokeStyle = clip.strokeColor;
        ctx.lineJoin = 'round';
        ctx.strokeText(ln, 0, ly);
      }
      ctx.fillStyle = clip.textColor || '#ffffff';
      ctx.fillText(ln, 0, ly);
    });

    ctx.restore();
    return { cx, cy, w: Math.max(120, maxW + 44), h: Math.max(60, totalH + 30), rot: rotDeg };
  }

  drawCaption(ctx, cap, t, style, W, H) {
    const words = (cap.text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const u = Math.max(0, Math.min(0.999, (t - cap.start) / Math.max(0.1, cap.end - cap.start)));
    const activeIdx = Math.floor(u * words.length);
    const fontSize = Math.round(Math.min(W, H) * 0.052);
    const y = H * 0.84;

    ctx.save();
    ctx.font = `900 ${fontSize}px -apple-system, Inter, Impact, sans-serif`;
    ctx.textBaseline = 'middle';

    if (style === 'hormozi') {
      const spaceW = ctx.measureText(' ').width;
      const widths = words.map(w => ctx.measureText(w.toUpperCase()).width);
      const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);
      let x = (W - totalW) / 2;
      words.forEach((w, i) => {
        const up = w.toUpperCase();
        const isAct = i === activeIdx;
        ctx.save();
        ctx.translate(x + widths[i] / 2, y);
        if (isAct) ctx.scale(1.14, 1.14);
        ctx.textAlign = 'center';
        ctx.lineWidth = fontSize * 0.16;
        ctx.strokeStyle = '#000000';
        ctx.lineJoin = 'round';
        ctx.strokeText(up, 0, 0);
        ctx.fillStyle = isAct ? '#00ffaa' : '#ffffff';
        ctx.fillText(up, 0, 0);
        ctx.restore();
        x += widths[i] + spaceW;
      });
    } else if (style === 'pill') {
      const full = cap.text;
      const tw = ctx.measureText(full).width;
      ctx.fillStyle = 'rgba(0, 229, 195, 0.94)';
      ctx.beginPath(); ctx.roundRect((W - tw) / 2 - 26, y - fontSize * 0.72, tw + 52, fontSize * 1.44, 14); ctx.fill();
      ctx.fillStyle = '#071012'; ctx.textAlign = 'center';
      ctx.fillText(full, W / 2, y + 2);
    } else {
      const full = cap.text;
      const tw = ctx.measureText(full).width;
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.beginPath(); ctx.roundRect((W - tw) / 2 - 22, y - fontSize * 0.68, tw + 44, fontSize * 1.36, 10); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      ctx.fillText(full, W / 2, y + 2);
    }
    ctx.restore();
  }

  renderOverlay(state, bounds, W, H) {
    const octx = this.octx;
    octx.clearRect(0, 0, W, H);

    if (this.showGuides) {
      octx.save();
      octx.strokeStyle = 'rgba(255,255,255,0.18)'; octx.lineWidth = 2;
      octx.beginPath();
      octx.moveTo(W / 3, 0); octx.lineTo(W / 3, H);
      octx.moveTo((2 * W) / 3, 0); octx.lineTo((2 * W) / 3, H);
      octx.moveTo(0, H / 3); octx.lineTo(W, H / 3);
      octx.moveTo(0, (2 * H) / 3); octx.lineTo(W, (2 * H) / 3);
      octx.stroke();
      octx.strokeStyle = 'rgba(0,229,195,0.32)'; octx.setLineDash([10, 8]);
      octx.strokeRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84);
      octx.restore();
    }

    // Dynamic center-axis alignment snap crosshairs while dragging!
    if (this.snapLines.x || this.snapLines.y) {
      octx.save();
      octx.strokeStyle = '#00e5c3'; octx.lineWidth = 2; octx.setLineDash([8, 6]);
      if (this.snapLines.x) { octx.beginPath(); octx.moveTo(W / 2, 0); octx.lineTo(W / 2, H); octx.stroke(); }
      if (this.snapLines.y) { octx.beginPath(); octx.moveTo(0, H / 2); octx.lineTo(W, H / 2); octx.stroke(); }
      octx.restore();
    }

    // Interactive Transform Gizmo (4 corner scale handles + top rotation knob!)
    if (bounds) {
      octx.save();
      octx.translate(bounds.cx, bounds.cy);
      octx.rotate((bounds.rot * Math.PI) / 180);
      octx.strokeStyle = '#00e5c3'; octx.lineWidth = 3;
      octx.strokeRect(-bounds.w / 2, -bounds.h / 2, bounds.w, bounds.h);
      // Rotation stem + circular knob above top edge
      const rotY = -bounds.h / 2 - 44;
      octx.beginPath(); octx.moveTo(0, -bounds.h / 2); octx.lineTo(0, rotY); octx.stroke();
      octx.fillStyle = '#00e5c3'; octx.beginPath(); octx.arc(0, rotY, 11, 0, Math.PI * 2); octx.fill();
      octx.strokeStyle = '#071210'; octx.lineWidth = 2; octx.stroke();
      // 4 corner scale squares
      const hs = 16;
      octx.fillStyle = '#ffffff'; octx.strokeStyle = '#00e5c3'; octx.lineWidth = 3;
      for (const [hx, hy] of [[-bounds.w / 2, -bounds.h / 2], [bounds.w / 2, -bounds.h / 2], [-bounds.w / 2, bounds.h / 2], [bounds.w / 2, bounds.h / 2]]) {
        octx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        octx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      octx.restore();
    }
  }

  // Hit-test gizmo handles (rotate / scale / move / layer pick)
  hitTestCanvas(px, py, selectedClipId) {
    const sel = this.lastLayerBounds.find(b => b.clipId === selectedClipId);
    if (sel) {
      const ang = -(sel.rot * Math.PI) / 180;
      const dx = px - sel.cx, dy = py - sel.cy;
      const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
      const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
      if (Math.hypot(lx, ly - (-sel.h / 2 - 44)) < 28) return { mode: 'rotate', clipId: sel.clipId, bounds: sel };
      for (const [hx, hy] of [[-sel.w / 2, -sel.h / 2], [sel.w / 2, -sel.h / 2], [-sel.w / 2, sel.h / 2], [sel.w / 2, sel.h / 2]]) {
        if (Math.hypot(lx - hx, ly - hy) < 28) return { mode: 'scale', clipId: sel.clipId, bounds: sel };
      }
      if (Math.abs(lx) <= sel.w / 2 && Math.abs(ly) <= sel.h / 2) return { mode: 'move', clipId: sel.clipId, bounds: sel };
    }
    // Check topmost layer under cursor
    for (let i = this.lastLayerBounds.length - 1; i >= 0; i--) {
      const b = this.lastLayerBounds[i];
      const ang = -(b.rot * Math.PI) / 180;
      const dx = px - b.cx, dy = py - b.cy;
      const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
      const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return { mode: 'move', clipId: b.clipId, bounds: b };
    }
    return null;
  }

  // TRUE Deterministic Frame-Accurate FFmpeg MP4 Export (Zero Dropped Frames + Real FFmpeg Multi-Track Audio Mix!)
  async exportDeterministicMP4(state, opts, onProgress) {
    const { width, height, fps, crf, name } = opts;
    const totalDuration = Math.max(0.5, state.getProjectDuration());
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    const prevW = state.canvasWidth, prevH = state.canvasHeight;
    state.canvasWidth = width;
    state.canvasHeight = height;

    // Collect all unmuted audio-bearing clips for native FFmpeg multi-track amix
    const audioClips = [];
    for (const c of state.clips) {
      const tr = state.tracks.find(t => t.id === c.trackId);
      if (tr?.muted || c.muted || state.masterMute) continue;
      if (c.type === 'audio' || (c.type === 'video' && !c.audioDetached)) {
        const m = state.library.find(x => x.id === c.mediaId);
        if (m && m.hasAudio && !m.url.startsWith('blob:')) {
          audioClips.push({
            mediaId: c.mediaId, start: c.start, duration: c.duration, trimStart: c.trimStart || 0,
            speed: c.speed || 1, volume: c.volume ?? 1, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0,
            eqBass: c.eqBass || 0, eqTreble: c.eqTreble || 0,
          });
        }
      }
    }

    onProgress(2, 'Starting local FFmpeg H.264 encoder...');
    const startResp = await fetch('/api/export-frames/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width, height, fps, crf, name, totalDuration, audioClips }),
    });
    const startData = await startResp.json();
    if (!startResp.ok || !startData.ok) throw new Error(startData.error || 'Could not start FFmpeg job');
    const jobId = startData.jobId;

    // Stream exact frames in small concatenated MJPEG batches (super fast & deterministic!)
    const BATCH_SIZE = 8;
    let batch = [];
    const flushBatch = async () => {
      if (!batch.length) return;
      const merged = new Blob(batch, { type: 'application/octet-stream' });
      batch = [];
      const r = await fetch(`/api/export-frames/push/${jobId}`, { method: 'POST', body: merged });
      if (!r.ok) throw new Error('Frame push failed');
    };

    try {
      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps;
        await this.seekAllExact(state, t);
        this.renderFrame(state, t, false);
        const jpegBlob = await new Promise(res => this.canvas.toBlob(res, 'image/jpeg', 0.94));
        batch.push(jpegBlob);
        if (batch.length >= BATCH_SIZE) {
          await flushBatch();
          const pct = Math.min(88, Math.round(5 + ((f + 1) / totalFrames) * 83));
          onProgress(pct, `Rendering frame ${f + 1} / ${totalFrames} (${width}×${height} @ ${fps}fps)...`);
        }
      }
      await flushBatch();
    } finally {
      state.canvasWidth = prevW;
      state.canvasHeight = prevH;
    }

    onProgress(92, 'Muxing multi-track audio & finalizing H.264 MP4...');
    const finResp = await fetch(`/api/export-frames/finish/${jobId}`, { method: 'POST' });
    const finData = await finResp.json();
    if (!finResp.ok || !finData.ok) throw new Error(finData.error || 'Finalize failed');
    onProgress(100, 'Studio MP4 export complete!');
    return finData;
  }
}
