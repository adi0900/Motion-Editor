/**
 * MotionCut Pro v3 — Frame-Accurate Resolution-Independent Canvas Compositor,
 * WebAudio Mixer, A->B Transition Engine, Mask Feathering, Keyframes & Deterministic FFmpeg Exporter.
 */

export const SPEED_CURVES = {
  none: { label: 'Normal (Constant)', pts: null },
  montage: { label: 'Montage', pts: [[0, 2.2], [0.22, 0.45], [0.55, 0.45], [0.78, 2.2], [1, 1.4]] },
  hero: { label: 'Hero Slow-Mo', pts: [[0, 1.0], [0.3, 0.35], [0.65, 0.35], [0.85, 2.4], [1, 1.0]] },
  bullet: { label: 'Bullet Time', pts: [[0, 3.0], [0.2, 0.3], [0.75, 0.3], [1, 2.5]] },
  flashin: { label: 'Flash In', pts: [[0, 3.5], [0.25, 1.0], [1, 1.0]] },
  smooth: { label: 'Ease S-Curve', pts: [[0, 0.5], [0.5, 1.8], [1, 0.5]] },
};

export const EASING_TYPES = [
  { id: 'easeInOut', label: 'Ease In-Out' },
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease In' },
  { id: 'easeOut', label: 'Ease Out' },
  { id: 'bounce', label: 'Smooth Overshoot' },
];

export const LUT_FILTERS = [
  { id: 'none', name: 'Original', css: '' },
  { id: 'teal-orange', name: 'Teal & Orange', css: 'contrast(1.14) saturate(1.25) sepia(0.14) hue-rotate(-8deg)' },
  { id: 'cinematic', name: 'Cinema Moody', css: 'contrast(1.22) brightness(0.93) saturate(0.85)' },
  { id: 'cyberpunk', name: 'Cyber Neon', css: 'contrast(1.25) saturate(1.55) hue-rotate(12deg)' },
  { id: 'kodak', name: 'Kodak 2383', css: 'contrast(1.12) saturate(1.18) sepia(0.18) brightness(1.03)' },
  { id: 'vintage', name: '90s VHS', css: 'sepia(0.32) contrast(1.08) saturate(0.82) brightness(0.96)' },
  { id: 'bw-noir', name: 'Noir B&W', css: 'grayscale(1) contrast(1.38) brightness(0.95)' },
  { id: 'vivid', name: 'Vivid Pop', css: 'saturate(1.48) contrast(1.1) brightness(1.04)' },
  { id: 'matte', name: 'Matte Film', css: 'contrast(0.9) brightness(1.06) saturate(0.88)' },
  { id: 'cold-steel', name: 'Cold Steel', css: 'saturate(0.75) contrast(1.16) hue-rotate(18deg)' },
];

export const EFFECT_PRESETS = [
  { id: 'glitch', name: 'RGB Glitch', badge: 'VFX' },
  { id: 'shake', name: 'Camera Shake', badge: 'MOTION' },
  { id: 'vhs', name: 'VHS Scanlines', badge: 'RETRO' },
  { id: 'bloom', name: 'Dream Glow', badge: 'GLOW' },
  { id: 'vignette', name: 'Cinema Vignette', badge: 'FILM' },
  { id: 'letterbox', name: '2.39:1 Bars', badge: 'SCOPE' },
  { id: 'bw-flash', name: 'Strobe Flash', badge: 'BEAT' },
  { id: 'chromatic', name: 'Chromatic Split', badge: 'OPTIC' },
  { id: 'zoom-pulse', name: 'Beat Zoom Pulse', badge: 'BEAT' },
  { id: 'pixelate', name: 'Retro Pixelate', badge: '8-BIT' },
  { id: 'mirror-h', name: 'Mirror Split', badge: 'STYLE' },
];

export const TRANSITION_PRESETS = [
  { id: 'none', name: 'None (Hard Cut)', dur: 0 },
  { id: 'crossfade', name: 'Cross Dissolve', dur: 0.5 },
  { id: 'dip-black', name: 'Dip to Black', dur: 0.5 },
  { id: 'flash', name: 'White Flash', dur: 0.35 },
  { id: 'slide-left', name: 'Slide Push Left', dur: 0.45 },
  { id: 'slide-up', name: 'Slide Push Up', dur: 0.45 },
  { id: 'zoom-in', name: 'Zoom In Cut', dur: 0.45 },
  { id: 'wipe-left', name: 'Wipe Left', dur: 0.5 },
  { id: 'blur-dissolve', name: 'Blur Dissolve', dur: 0.5 },
];

export const GRAPHICS_PRESETS = [
  { id: 'rec-badge', name: 'REC ● HUD', label: 'REC 00:00' },
  { id: 'viewfinder', name: 'Camera Frame', label: '4K 60FPS' },
  { id: 'progress-bar', name: 'Progress Bar', label: 'AUTO BAR' },
  { id: 'lower-third', name: 'Lower Third', label: 'SPEAKER' },
  { id: 'arrow-callout', name: 'Neon Arrow', label: 'POINTER' },
  { id: 'gradient-matte', name: 'Bottom Matte', label: 'GRADIENT' },
];

export function evalEasing(type, u) {
  const x = Math.max(0, Math.min(1, u));
  switch (type) {
    case 'linear': return x;
    case 'easeIn': return x * x * x;
    case 'easeOut': return 1 - Math.pow(1 - x, 3);
    case 'bounce': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'easeInOut':
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

export function evalKeyframe(clip, prop, localTime, fallback) {
  const list = clip.keyframes?.[prop];
  if (!list || list.length === 0) return fallback;
  const sorted = [...list].sort((a, b) => a.t - b.t);
  if (localTime <= sorted[0].t) return sorted[0].v;
  if (localTime >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTime >= a.t && localTime <= b.t) {
      const u = (localTime - a.t) / Math.max(0.0001, b.t - a.t);
      const ease = evalEasing(b.ease || a.ease || 'easeInOut', u);
      return a.v + (b.v - a.v) * ease;
    }
  }
  return fallback;
}

export function evalSpeedCurve(curveKey, u) {
  const def = SPEED_CURVES[curveKey];
  if (!def || !def.pts) return 1;
  const pts = def.pts;
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

export function getSourceTime(clip, localTime, mediaDuration) {
  const baseSpeed = Math.max(0.1, Number(clip.speed) || 1);
  const dur = Math.max(0.04, Number(clip.duration) || 1);
  let srcOffset = 0;
  if (clip.speedCurve && clip.speedCurve !== 'none' && SPEED_CURVES[clip.speedCurve]?.pts) {
    const u0 = Math.max(0, Math.min(1, Number(clip.curveStartU ?? 0)));
    const u1 = Math.max(u0 + 0.0001, Math.min(1, Number(clip.curveEndU ?? 1)));
    const steps = 20;
    const clampedLocal = Math.max(0, Math.min(dur, localTime));
    const dt = clampedLocal / steps;
    for (let i = 0; i < steps; i++) {
      const frac = ((i + 0.5) * dt) / dur;
      const u = u0 + frac * (u1 - u0);
      srcOffset += dt * baseSpeed * evalSpeedCurve(clip.speedCurve, u);
    }
  } else {
    srcOffset = localTime * baseSpeed;
  }
  const maxDur = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : 9999;
  if (clip.reverse) {
    const span = getClipSourceSpan(clip);
    const revEnd = Math.min(maxDur - 0.02, (clip.trimStart || 0) + span);
    return Math.max(0, Math.min(maxDur - 0.02, revEnd - srcOffset));
  }
  return Math.max(0, Math.min(maxDur - 0.02, (clip.trimStart || 0) + srcOffset));
}

export function getClipSourceSpan(clip) {
  const baseSpeed = Math.max(0.1, Number(clip.speed) || 1);
  const dur = Math.max(0.04, Number(clip.duration) || 1);
  if (clip.speedCurve && clip.speedCurve !== 'none' && SPEED_CURVES[clip.speedCurve]?.pts) {
    const u0 = Math.max(0, Math.min(1, Number(clip.curveStartU ?? 0)));
    const u1 = Math.max(u0 + 0.0001, Math.min(1, Number(clip.curveEndU ?? 1)));
    const steps = 20;
    const dt = dur / steps;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const u = u0 + ((i + 0.5) / steps) * (u1 - u0);
      total += dt * baseSpeed * evalSpeedCurve(clip.speedCurve, u);
    }
    return total;
  }
  return dur * baseSpeed;
}

export function getSnapshotDuration(snap) {
  let maxT = 0;
  for (const tr of (snap.tracks || [])) {
    for (const c of (tr.clips || [])) {
      maxT = Math.max(maxT, (c.start || 0) + (c.duration || 0));
    }
  }
  for (const cap of (snap.captions || [])) {
    maxT = Math.max(maxT, cap.end || 0);
  }
  return maxT;
}

function getApiTokenHeaders(extra = {}) {
  return { 'X-MC-Token': window.__MC_TOKEN__ || '', ...extra };
}

export class VideoEngine {
  constructor(state, previewCanvas, overlayCanvas, callbacks = {}) {
    this.state = state;
    this.canvas = previewCanvas;
    this.ctx = previewCanvas.getContext('2d', { willReadFrequently: false });
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext('2d');
    this.onMediaReady = callbacks.onMediaReady || (() => {});
    this.onMediaError = callbacks.onMediaError || (() => {});

    this.mediaElements = new Map(); // key -> HTMLVideoElement | HTMLAudioElement | HTMLImageElement
    this.erroredMedia = new Set();  // mediaId set
    this.audioCtx = null;
    this.masterGain = null;
    this.analyserL = null;
    this.analyserR = null;
    this.clipAudioNodes = new WeakMap(); // HTMLMediaElement -> WebAudio node bundle
    this.decodedBuffers = new Map();     // mediaUrl -> AudioBuffer (or Promise)
    this.reversedBuffers = new Map();    // mediaUrl -> reversed AudioBuffer
    this.complexSources = new Map();     // clipId -> { src, gain, startedAt }

    // Reusable offscreen scratch canvases
    this.layerCanvas = document.createElement('canvas');
    this.layerCtx = this.layerCanvas.getContext('2d');
    this.layerCanvasB = document.createElement('canvas');
    this.layerCtxB = this.layerCanvasB.getContext('2d');
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.chromaCanvas = document.createElement('canvas');
    this.chromaCtx = this.chromaCanvas.getContext('2d', { willReadFrequently: true });
    this.fxCanvas = document.createElement('canvas');
    this.fxCtx = this.fxCanvas.getContext('2d');

    this.isExporting = false;
    this.activeExportJobId = null;
    this.exportAbortCtrl = null;
    this.snapXGuide = null; // null or logical X
    this.snapYGuide = null; // null or logical Y
  }

  ensureAudioCtx() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
      this.masterGain = this.audioCtx.createGain();
      const splitter = this.audioCtx.createChannelSplitter(2);
      this.analyserL = this.audioCtx.createAnalyser();
      this.analyserR = this.audioCtx.createAnalyser();
      this.analyserL.fftSize = 256;
      this.analyserR.fftSize = 256;
      this.masterGain.connect(this.audioCtx.destination);
      this.masterGain.connect(splitter);
      splitter.connect(this.analyserL, 0);
      splitter.connect(this.analyserR, 1);
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
    this.masterGain.gain.value = this.state.masterMuted ? 0 : 1;
    return this.audioCtx;
  }

  getVULevels() {
    if (!this.analyserL || !this.state.playing || this.state.masterMuted) return [0, 0];
    const bufL = new Uint8Array(this.analyserL.frequencyBinCount);
    const bufR = new Uint8Array(this.analyserR.frequencyBinCount);
    this.analyserL.getByteTimeDomainData(bufL);
    this.analyserR.getByteTimeDomainData(bufR);
    const peak = (arr) => {
      let m = 0;
      for (let i = 0; i < arr.length; i++) m = Math.max(m, Math.abs((arr[i] - 128) / 128));
      return Math.min(1, m * 1.85);
    };
    return [peak(bufL), peak(bufR)];
  }

  getMediaById(id, snap = this.state) {
    return (snap.library || this.state.library).find(m => m.id === id) || null;
  }

  getOrCreateElement(clip, snap = this.state) {
    if (!clip.mediaId) return null;
    const media = this.getMediaById(clip.mediaId, snap);
    if (!media) return null;
    const key = `${clip.id}::${media.id}::${media.url}`;
    if (this.mediaElements.has(key)) return this.mediaElements.get(key);

    if (media.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.erroredMedia.delete(media.id);
        if (!this.isExporting) this.onMediaReady();
      };
      img.onerror = () => {
        this.erroredMedia.add(media.id);
        if (!this.isExporting) this.onMediaError(media);
      };
      img.src = media.url;
      this.mediaElements.set(key, img);
      return img;
    }

    const el = document.createElement(media.type === 'audio' ? 'audio' : 'video');
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.playsInline = true;
    el.muted = false;
    el.addEventListener('loadeddata', () => {
      this.erroredMedia.delete(media.id);
      if (!this.isExporting) this.onMediaReady();
    });
    el.addEventListener('seeked', () => {
      if (!this.isExporting) this.onMediaReady();
    });
    el.addEventListener('error', () => {
      this.erroredMedia.add(media.id);
      if (!this.isExporting) this.onMediaError(media);
    });
    el.src = media.url;
    this.mediaElements.set(key, el);
    return el;
  }

  connectClipAudio(clipId, el) {
    if (this.clipAudioNodes.has(el)) return this.clipAudioNodes.get(el);
    const ac = this.ensureAudioCtx();
    try {
      el.volume = 1; // GainNode is the single volume control once connected
      const src = ac.createMediaElementSource(el);
      const low = ac.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;
      const high = ac.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4200;
      const band = ac.createBiquadFilter(); band.type = 'allpass'; band.frequency.value = 1200; band.Q.value = 1.2;
      const fxTone = ac.createBiquadFilter(); fxTone.type = 'allpass'; fxTone.frequency.value = 1000;
      const delay = ac.createDelay(0.5); delay.delayTime.value = 0.12;
      const delayFb = ac.createGain(); delayFb.gain.value = 0;
      const delayWet = ac.createGain(); delayWet.gain.value = 0;
      const gain = ac.createGain();

      src.connect(low);
      low.connect(high);
      high.connect(band);
      band.connect(fxTone);
      fxTone.connect(gain);
      // Parallel echo send
      fxTone.connect(delay);
      delay.connect(delayFb);
      delayFb.connect(delay);
      delay.connect(delayWet);
      delayWet.connect(gain);
      gain.connect(this.masterGain);

      const bundle = { src, low, high, band, fxTone, delay, delayFb, delayWet, gain };
      this.clipAudioNodes.set(el, bundle);
      return bundle;
    } catch {
      return null;
    }
  }

  _applyAudioFxParams(nodes, clip, vol) {
    if (!nodes || !this.audioCtx) return;
    nodes.gain.gain.setTargetAtTime(Math.max(0, Math.min(2, vol)), this.audioCtx.currentTime, 0.015);
    nodes.low.gain.value = clip.eqBass || 0;
    nodes.high.gain.value = clip.eqTreble || 0;
    const vfx = clip.voiceFx || 'none';
    if (vfx === 'radio') {
      nodes.band.type = 'bandpass'; nodes.band.frequency.value = 1350; nodes.band.Q.value = 1.6;
      nodes.fxTone.type = 'allpass';
      nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
    } else if (vfx === 'deep') {
      nodes.band.type = 'lowshelf'; nodes.band.frequency.value = 240; nodes.band.gain.value = 12;
      nodes.fxTone.type = 'lowpass'; nodes.fxTone.frequency.value = 1900;
      nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
    } else if (vfx === 'chipmunk') {
      nodes.band.type = 'highpass'; nodes.band.frequency.value = 520;
      nodes.fxTone.type = 'peaking'; nodes.fxTone.frequency.value = 3400; nodes.fxTone.gain.value = 10;
      nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
    } else if (vfx === 'echo') {
      nodes.band.type = 'allpass'; nodes.fxTone.type = 'allpass';
      nodes.delay.delayTime.value = 0.12;
      nodes.delayFb.gain.value = 0.38;
      nodes.delayWet.gain.value = 0.55;
    } else {
      nodes.band.type = 'allpass'; nodes.fxTone.type = 'allpass';
      nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
    }
  }

  _buildFxChain(srcNode) {
    const ac = this.audioCtx;
    const low = ac.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;
    const high = ac.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4200;
    const band = ac.createBiquadFilter(); band.type = 'allpass'; band.frequency.value = 1200; band.Q.value = 1.2;
    const fxTone = ac.createBiquadFilter(); fxTone.type = 'allpass'; fxTone.frequency.value = 1000;
    const delay = ac.createDelay(0.5); delay.delayTime.value = 0.12;
    const delayFb = ac.createGain(); delayFb.gain.value = 0;
    const delayWet = ac.createGain(); delayWet.gain.value = 0;
    const gain = ac.createGain();
    srcNode.connect(low);
    low.connect(high);
    high.connect(band);
    band.connect(fxTone);
    fxTone.connect(gain);
    fxTone.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(gain);
    gain.connect(this.masterGain);
    return { src: srcNode, low, high, band, fxTone, delay, delayFb, delayWet, gain };
  }

  _stopComplexAudio(clipId) {
    const entry = this.complexSources.get(clipId);
    if (!entry) return;
    try { entry.src.stop(); } catch {}
    try { entry.src.disconnect(); entry.gain.disconnect(); } catch {}
    this.complexSources.delete(clipId);
  }

  _stopAllComplexAudio() {
    for (const id of [...this.complexSources.keys()]) this._stopComplexAudio(id);
  }

  invalidateMediaCache(mediaId, mediaUrl) {
    if (mediaId) this.erroredMedia.add(mediaId);
    if (mediaUrl) {
      this.decodedBuffers.delete(mediaUrl);
      this.reversedBuffers.delete(mediaUrl);
    }
    this._stopAllComplexAudio();
  }

  _ensureDecodedBuffer(media, reverse = false) {
    if (!this.audioCtx || !media?.url) return null;
    const cacheKey = media.url;
    const existing = this.decodedBuffers.get(cacheKey);
    if (existing instanceof AudioBuffer) {
      if (!reverse) return existing;
      if (this.reversedBuffers.has(cacheKey)) return this.reversedBuffers.get(cacheKey);
      const rev = this.audioCtx.createBuffer(existing.numberOfChannels, existing.length, existing.sampleRate);
      for (let ch = 0; ch < existing.numberOfChannels; ch++) {
        const s = existing.getChannelData(ch);
        const d = rev.getChannelData(ch);
        for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i];
      }
      this.reversedBuffers.set(cacheKey, rev);
      return rev;
    }
    if (!existing) {
      const p = fetch(media.url)
        .then(r => r.arrayBuffer())
        .then(ab => this.audioCtx.decodeAudioData(ab))
        .then(buf => { this.decodedBuffers.set(cacheKey, buf); })
        .catch(() => { this.decodedBuffers.delete(cacheKey); });
      this.decodedBuffers.set(cacheKey, p);
    }
    return null;
  }

  pauseAllMedia() {
    this._stopAllComplexAudio();
    for (const el of this.mediaElements.values()) {
      if (el instanceof HTMLMediaElement && !el.paused) {
        try { el.pause(); } catch {}
      }
    }
  }

  pruneUnusedElements() {
    const activeKeys = new Set();
    for (const tr of this.state.tracks) {
      for (const c of tr.clips) {
        if (!c.mediaId) continue;
        const m = this.getMediaById(c.mediaId);
        if (m) activeKeys.add(`${c.id}::${m.id}::${m.url}`);
      }
    }
    for (const [key, el] of this.mediaElements.entries()) {
      if (!activeKeys.has(key)) {
        if (el instanceof HTMLMediaElement) {
          try { el.pause(); el.removeAttribute('src'); el.load(); } catch {}
        }
        this.mediaElements.delete(key);
      }
    }
  }

  /** Find if clip B has an adjacent preceding clip A on the same track for A->B transitions */
  findOutgoingTransitionClip(track, clipB, t) {
    if (!clipB.transIn || clipB.transIn === 'none') return null;
    const td = Math.min(clipB.transInDur || 0.5, clipB.duration * 0.5);
    if (td <= 0.01 || t < clipB.start || t > clipB.start + td) return null;
    // Find clip A whose end is within 0.06s of clipB.start
    let prev = null;
    for (const c of track.clips) {
      if (c.id === clipB.id) continue;
      if (Math.abs((c.start + c.duration) - clipB.start) <= 0.06) {
        prev = c;
        break;
      }
    }
    if (!prev) return null;
    const prog = Math.max(0, Math.min(1, (t - clipB.start) / td));
    return { clipA: prev, prog, dur: td };
  }

  syncMediaForTime(t, isPlaying, shuttleSpeed = 1) {
    if (this.isExporting) return;
    if (isPlaying) this.ensureAudioCtx();
    const activeKeys = new Set();
    const activeComplexIds = new Set();

    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (!clip.mediaId) continue;
        const media = this.getMediaById(clip.mediaId);
        if (!media || media.type === 'image') continue;

        const inClip = t >= clip.start && t < clip.start + clip.duration;
        // Also keep outgoing clip A synced during A->B transition tail!
        let isOutgoingTail = false;
        if (!inClip && (track.type === 'video' || track.type === 'overlay')) {
          const next = track.clips.find(n => n.id !== clip.id && n.transIn && n.transIn !== 'none' && Math.abs((clip.start + clip.duration) - n.start) <= 0.06);
          if (next) {
            const td = Math.min(next.transInDur || 0.5, next.duration * 0.5);
            if (t >= next.start && t <= next.start + td) isOutgoingTail = true;
          }
        }
        if (!inClip && !isOutgoingTail) continue;

        const el = this.getOrCreateElement(clip);
        if (!el) continue;
        const key = `${clip.id}::${media.id}::${media.url}`;
        activeKeys.add(key);

        const localT = t - clip.start;
        const target = getSourceTime(clip, localT, media.duration);
        const speed = Math.max(0.25, Math.min(8, Number(clip.speed) || 1));
        const hasCurve = clip.speedCurve && clip.speedCurve !== 'none';
        const isComplex = Boolean(clip.reverse) || hasCurve;

        // Compute audio gain (including keyframed volume, fades, and A->B audio crossfade!)
        let vol = evalKeyframe(clip, 'volume', Math.max(0, localT), clip.volume ?? 1);
        const fi = Math.min(clip.duration, Math.max(0, clip.fadeIn || 0));
        const fo = Math.min(clip.duration, Math.max(0, clip.fadeOut || 0));
        if (fi > 0.01 && localT < fi) vol *= Math.max(0, localT / fi);
        if (fo > 0.01 && localT > clip.duration - fo) vol *= Math.max(0, (clip.duration - localT) / fo);
        if (isOutgoingTail) {
          const next = track.clips.find(n => n.id !== clip.id && Math.abs((clip.start + clip.duration) - n.start) <= 0.06);
          const td = Math.min(next?.transInDur || 0.5, (next?.duration || 1) * 0.5);
          const p = Math.max(0, Math.min(1, (t - (clip.start + clip.duration)) / Math.max(0.01, td)));
          vol *= (1 - p);
        } else if (clip.transIn && clip.transIn !== 'none') {
          const trans = this.findOutgoingTransitionClip(track, clip, t);
          if (trans) vol *= trans.prog;
        }
        if (track.muted || clip.muted || this.state.masterMuted) vol = 0;

        if (isPlaying && this.audioCtx) {
          const nodes = this.connectClipAudio(clip.id, el);
          if (nodes) {
            if (el.volume !== 1) el.volume = 1; // Prevent double volume attenuation
            nodes.gain.gain.setTargetAtTime(Math.max(0, Math.min(2, vol)), this.audioCtx.currentTime, 0.015);
            nodes.low.gain.value = clip.eqBass || 0;
            nodes.high.gain.value = clip.eqTreble || 0;
            const vfx = clip.voiceFx || 'none';
            // Voice FX handled purely in WebAudio (never mutates el.playbackRate so video never jitters!)
            if (vfx === 'radio') {
              nodes.band.type = 'bandpass'; nodes.band.frequency.value = 1350; nodes.band.Q.value = 1.6;
              nodes.fxTone.type = 'allpass';
              nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
            } else if (vfx === 'deep') {
              nodes.band.type = 'lowshelf'; nodes.band.frequency.value = 240; nodes.band.gain.value = 12;
              nodes.fxTone.type = 'lowpass'; nodes.fxTone.frequency.value = 1900;
              nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
            } else if (vfx === 'chipmunk') {
              nodes.band.type = 'highpass'; nodes.band.frequency.value = 520;
              nodes.fxTone.type = 'peaking'; nodes.fxTone.frequency.value = 3400; nodes.fxTone.gain.value = 10;
              nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
            } else if (vfx === 'echo') {
              nodes.band.type = 'allpass'; nodes.fxTone.type = 'allpass';
              nodes.delay.delayTime.value = 0.12;
              nodes.delayFb.gain.value = 0.38;
              nodes.delayWet.gain.value = 0.55;
            } else {
              nodes.band.type = 'allpass'; nodes.fxTone.type = 'allpass';
              nodes.delayWet.gain.value = 0; nodes.delayFb.gain.value = 0;
            }
          }
        } else if (!this.clipAudioNodes.has(el)) {
          el.volume = Math.max(0, Math.min(1, vol));
        }

        if (isPlaying) {
          if (shuttleSpeed < 0) {
            // Reverse shuttle (J): pause media element, mute audio, scrub frame cleanly
            if (!el.paused) el.pause();
            if (Math.abs((el.currentTime || 0) - target) > 0.025) {
              try { el.currentTime = target; } catch {}
            }
          } else if (isComplex) {
            // Reversed or speed-ramped clip: scrub video frame + play real WebAudio AudioBuffer!
            if (!el.paused) el.pause();
            if (Math.abs((el.currentTime || 0) - target) > 0.025) {
              try { el.currentTime = target; } catch {}
            }
            if (media.hasAudio && vol > 0.001 && this.audioCtx) {
              activeComplexIds.add(clip.id);
              const buf = this._ensureDecodedBuffer(media, Boolean(clip.reverse));
              if (buf) {
                const u0 = Math.max(0, Math.min(1, Number(clip.curveStartU ?? 0)));
                const u1 = Math.max(u0 + 0.0001, Math.min(1, Number(clip.curveEndU ?? 1)));
                const u = u0 + Math.max(0, Math.min(1, localT / Math.max(0.04, clip.duration))) * (u1 - u0);
                const liveRate = Math.max(0.25, Math.min(8, speed * (hasCurve ? evalSpeedCurve(clip.speedCurve, u) : 1) * shuttleSpeed));
                let entry = this.complexSources.get(clip.id);
                // Restart AudioBufferSource on seek/loop jump (scaled for shuttleSpeed!) or reverse toggle
                const jumpThresh = Math.max(0.06, 0.055 * Math.abs(shuttleSpeed));
                const jumped = entry && (entry.reverse !== Boolean(clip.reverse) || Math.abs(t - entry.lastTimelineT) > jumpThresh);
                if (jumped) {
                  this._stopComplexAudio(clip.id);
                  entry = null;
                }
                if (!entry) {
                  const bufOffset = clip.reverse
                    ? Math.max(0, Math.min(buf.duration - 0.02, buf.duration - target))
                    : Math.max(0, Math.min(buf.duration - 0.02, target));
                  const src = this.audioCtx.createBufferSource();
                  src.buffer = buf;
                  src.playbackRate.value = liveRate;
                  const chain = this._buildFxChain(src);
                  this._applyAudioFxParams(chain, clip, vol);
                  try { src.start(0, bufOffset); } catch {}
                  entry = { ...chain, reverse: Boolean(clip.reverse), lastTimelineT: t };
                  this.complexSources.set(clip.id, entry);
                } else {
                  entry.src.playbackRate.setTargetAtTime(liveRate, this.audioCtx.currentTime, 0.02);
                  this._applyAudioFxParams(entry, clip, vol);
                  entry.lastTimelineT = t;
                }
              }
            }
          } else {
            const desiredRate = Math.max(0.25, Math.min(8, speed * shuttleSpeed));
            if (Math.abs(el.playbackRate - desiredRate) > 0.01) el.playbackRate = desiredRate;
            if (Math.abs((el.currentTime || 0) - target) > 0.08) {
              try { el.currentTime = target; } catch {}
            }
            if (el.paused && el.readyState >= 2) el.play().catch(() => {});
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs((el.currentTime || 0) - target) > 0.012) {
            try { el.currentTime = target; } catch {}
          }
        }
      }
    }

    for (const id of [...this.complexSources.keys()]) {
      if (!isPlaying || !activeComplexIds.has(id)) this._stopComplexAudio(id);
    }

    for (const [key, el] of this.mediaElements.entries()) {
      if (el instanceof HTMLMediaElement && !activeKeys.has(key) && !el.paused) {
        try { el.pause(); } catch {}
      }
    }
  }

  /** Wait deterministically for ALL active video frames & image overlays at time t */
  async seekAllExact(snap, t) {
    const tasks = [];
    for (const track of snap.tracks) {
      if (track.hidden) continue;
      for (const clip of track.clips) {
        if (!clip.mediaId) continue;
        const inClip = t >= clip.start && t < clip.start + clip.duration;
        let isOutgoingTail = false;
        if (!inClip && (track.type === 'video' || track.type === 'overlay')) {
          const next = track.clips.find(n => n.id !== clip.id && n.transIn && n.transIn !== 'none' && Math.abs((clip.start + clip.duration) - n.start) <= 0.06);
          if (next) {
            const td = Math.min(next.transInDur || 0.5, next.duration * 0.5);
            if (t >= next.start && t <= next.start + td) isOutgoingTail = true;
          }
        }
        if (!inClip && !isOutgoingTail) continue;

        const media = this.getMediaById(clip.mediaId, snap);
        if (!media) continue;
        const el = this.getOrCreateElement(clip, snap);
        if (!el) continue;

        if (media.type === 'image') {
          if (!el.complete || el.naturalWidth === 0) {
            tasks.push(new Promise((resolve) => {
              const done = () => resolve();
              const timer = setTimeout(done, 1500);
              el.addEventListener('load', () => { clearTimeout(timer); done(); }, { once: true });
              el.addEventListener('error', () => { clearTimeout(timer); done(); }, { once: true });
            }));
          }
          continue;
        }
        if (media.type !== 'video') continue;

        const target = getSourceTime(clip, t - clip.start, media.duration);
        tasks.push(this._seekVideoAccurate(el, target));
      }
    }
    if (tasks.length) await Promise.all(tasks);
  }

  async _seekVideoAccurate(el, target) {
    if (!el.paused) { try { el.pause(); } catch {} }
    // Ensure metadata/first frame loaded
    if (el.readyState < 2) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        const onReady = () => { clearTimeout(timer); resolve(); };
        el.addEventListener('loadeddata', onReady, { once: true });
        el.addEventListener('error', onReady, { once: true });
      });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Math.abs((el.currentTime || 0) - target) <= 0.008 && el.readyState >= 2) break;
      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const timer = setTimeout(finish, 1400);
        const onSeeked = () => {
          clearTimeout(timer);
          if (typeof el.requestVideoFrameCallback === 'function') {
            const rvfcTimer = setTimeout(finish, 90);
            el.requestVideoFrameCallback(() => { clearTimeout(rvfcTimer); finish(); });
          } else {
            finish();
          }
        };
        el.addEventListener('seeked', onSeeked, { once: true });
        try { el.currentTime = target; } catch { clearTimeout(timer); finish(); }
      });
    }
  }

  buildCssFilter(clip) {
    const parts = [];
    const lut = LUT_FILTERS.find(f => f.id === (clip.filter || 'none'));
    if (lut && lut.css) parts.push(lut.css);
    const b = 1 + (clip.brightness || 0) / 100;
    const c = 1 + (clip.contrast || 0) / 100;
    const s = 1 + (clip.saturation || 0) / 100;
    const temp = clip.temperature || 0;
    const blur = clip.blur || 0;
    if (Math.abs(b - 1) > 0.005) parts.push(`brightness(${b.toFixed(3)})`);
    if (Math.abs(c - 1) > 0.005) parts.push(`contrast(${c.toFixed(3)})`);
    if (Math.abs(s - 1) > 0.005) parts.push(`saturate(${s.toFixed(3)})`);
    if (temp > 1) parts.push(`sepia(${Math.min(0.6, temp / 120).toFixed(3)})`);
    if (temp < -1) parts.push(`hue-rotate(${(temp * 0.45).toFixed(1)}deg)`);
    if (blur > 0.2) parts.push(`blur(${blur.toFixed(1)}px)`);
    return parts.join(' ') || 'none';
  }

  /**
   * Render a single frame in resolution-independent project coordinates.
   * Supports isolated clip capture (Freeze Frame) and immutable export snapshots!
   */
  renderFrame(t, opts = {}) {
    const snap = opts.snapshot || this.state;
    const targetCanvas = opts.targetCanvas || this.canvas;
    const ctx = opts.targetCtx || this.ctx;
    const baseW = snap.canvasWidth || 1920;
    const baseH = snap.canvasHeight || 1080;
    const renderW = opts.renderW || targetCanvas.width || baseW;
    const renderH = opts.renderH || targetCanvas.height || baseH;
    const isExport = Boolean(opts.isExport);
    const isolateClipId = opts.isolateClipId || null;

    if (targetCanvas.width !== renderW || targetCanvas.height !== renderH) {
      targetCanvas.width = renderW;
      targetCanvas.height = renderH;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, renderW, renderH);

    // Uniform scale into project coordinate space (center-fit if export aspect differs)
    const scaleX = renderW / baseW;
    const scaleY = renderH / baseH;
    const uniformScale = Math.min(scaleX, scaleY);
    const offsetX = (renderW - baseW * uniformScale) / 2;
    const offsetY = (renderH - baseH * uniformScale) / 2;

    if (!isolateClipId) {
      ctx.fillStyle = snap.bgMode === 'white' ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, renderW, renderH);
    }

    ctx.translate(offsetX, offsetY);
    ctx.scale(uniformScale, uniformScale);
    ctx.beginPath();
    ctx.rect(0, 0, baseW, baseH);
    ctx.clip();

    // Backdrop CapCut Blur from active main video
    if (!isolateClipId && snap.bgMode === 'blur') {
      let mainTr = snap.tracks.find(tr => tr.id === snap.mainTrackId && tr.type === 'video' && !tr.hidden);
      if (!mainTr) {
        for (let i = snap.tracks.length - 1; i >= 0; i--) {
          if (snap.tracks[i].type === 'video' && !snap.tracks[i].hidden) { mainTr = snap.tracks[i]; break; }
        }
      }
      const mainClip = mainTr?.clips.find(c => t >= c.start && t < c.start + c.duration);
      if (mainClip) {
        const el = this.getOrCreateElement(mainClip, snap);
        const dims = this._mediaDims(el);
        if (el && dims.w > 0) {
          ctx.save();
          ctx.filter = 'blur(34px) brightness(0.68)';
          const sc = Math.max(baseW / dims.w, baseH / dims.h) * 1.12;
          ctx.drawImage(el, (baseW - dims.w * sc) / 2, (baseH - dims.h * sc) / 2, dims.w * sc, dims.h * sc);
          ctx.restore();
        }
      }
    }

    // Track draw order: strictly bottom-to-top matching the visual timeline stack
    // (state.tracks is top-to-bottom: Text -> Overlay -> Main Video -> Audio)
    const ordered = [...snap.tracks].reverse().filter(tr => !tr.hidden && tr.type !== 'audio');

    for (const track of ordered) {
      for (const clip of track.clips) {
        if (isolateClipId && clip.id !== isolateClipId) continue;
        if (t < clip.start || t >= clip.start + clip.duration) continue;

        if (clip.type === 'text') {
          this.drawTextClip(ctx, clip, t - clip.start, baseW, baseH);
        } else if (clip.type === 'graphic') {
          this.drawGraphicClip(ctx, clip, t - clip.start, t, baseW, baseH, snap);
        } else if (clip.type === 'video' || clip.type === 'image') {
          // Check real A->B clip-to-clip transition!
          const ab = !isolateClipId ? this.findOutgoingTransitionClip(track, clip, t) : null;
          if (ab) {
            this.drawABTransition(ctx, ab.clipA, clip, t, ab.prog, baseW, baseH, snap, isExport);
          } else {
            this.drawMediaClip(ctx, clip, t - clip.start, baseW, baseH, snap, isExport, 1, 0, 0, 1);
          }
        }
      }
    }

    // Global Timed Captions (skipped when isolating a clip for Freeze Frame)
    if (!isolateClipId) {
      for (const cap of (snap.captions || [])) {
        if (t >= cap.start && t < cap.end) {
          this.drawCaption(ctx, cap, t, baseW, baseH, snap);
        }
      }
    }

    ctx.restore();

    if (!opts.hideGuides && !isExport && !isolateClipId) {
      this.renderOverlayGuides(t);
    }
  }

  _mediaDims(el) {
    if (!el) return { w: 0, h: 0 };
    if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
    if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
    return { w: 0, h: 0 };
  }

  /** Real A->B transition between adjacent clips on the same track */
  drawABTransition(ctx, clipA, clipB, t, p, baseW, baseH, snap, isExport) {
    const ease = evalEasing('easeInOut', p);
    const kind = clipB.transIn;

    // Render clipA into layerCanvas and clipB into layerCanvasB for clean scoped blending
    this._ensureCanvasSize(this.layerCanvas, baseW, baseH);
    this._ensureCanvasSize(this.layerCanvasB, baseW, baseH);
    this.layerCtx.clearRect(0, 0, baseW, baseH);
    this.layerCtxB.clearRect(0, 0, baseW, baseH);

    // Outgoing clipA evaluated cleanly at t - clipA.start (skipTransOut=true so transOut never blanks A!)
    this.drawMediaClip(this.layerCtx, clipA, t - clipA.start, baseW, baseH, snap, isExport, 1, 0, 0, 1, true, true);
    this.drawMediaClip(this.layerCtxB, clipB, t - clipB.start, baseW, baseH, snap, isExport, 1, 0, 0, 1, true, false);

    ctx.save();
    if (kind === 'crossfade') {
      // Draw outgoing at full opacity and crossfade incoming over it so midpoint has 0% background bleed
      ctx.globalAlpha = 1;
      ctx.drawImage(this.layerCanvas, 0, 0);
      ctx.globalAlpha = ease;
      ctx.drawImage(this.layerCanvasB, 0, 0);
    } else if (kind === 'slide-left') {
      ctx.drawImage(this.layerCanvas, -baseW * ease, 0);
      ctx.drawImage(this.layerCanvasB, baseW * (1 - ease), 0);
    } else if (kind === 'slide-up') {
      ctx.drawImage(this.layerCanvas, 0, -baseH * ease);
      ctx.drawImage(this.layerCanvasB, 0, baseH * (1 - ease));
    } else if (kind === 'wipe-left') {
      ctx.drawImage(this.layerCanvas, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, baseW * ease, baseH);
      ctx.clip();
      ctx.drawImage(this.layerCanvasB, 0, 0);
      ctx.restore();
    } else if (kind === 'zoom-in') {
      const sA = 1 + ease * 0.28;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(baseW / 2, baseH / 2); ctx.scale(sA, sA);
      ctx.drawImage(this.layerCanvas, -baseW / 2, -baseH / 2);
      ctx.restore();
      const sB = 0.8 + ease * 0.2;
      ctx.save();
      ctx.globalAlpha = ease;
      ctx.translate(baseW / 2, baseH / 2); ctx.scale(sB, sB);
      ctx.drawImage(this.layerCanvasB, -baseW / 2, -baseH / 2);
      ctx.restore();
    } else if (kind === 'blur-dissolve') {
      const bAmt = Math.sin(ease * Math.PI) * 18;
      ctx.save();
      ctx.filter = `blur(${bAmt.toFixed(1)}px)`;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.layerCanvas, 0, 0);
      ctx.globalAlpha = ease;
      ctx.drawImage(this.layerCanvasB, 0, 0);
      ctx.restore();
    } else if (kind === 'dip-black') {
      // Scope black dip to active layer's alpha via source-atop so PiP/blur backdrops never bleed through
      const srcC = ease < 0.5 ? this.layerCanvas : this.layerCanvasB;
      const srcCtx = ease < 0.5 ? this.layerCtx : this.layerCtxB;
      const dip = ease < 0.5 ? (ease * 2) : ((1 - ease) * 2);
      srcCtx.save();
      srcCtx.globalCompositeOperation = 'source-atop';
      srcCtx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, dip)).toFixed(3)})`;
      srcCtx.fillRect(0, 0, baseW, baseH);
      srcCtx.restore();
      ctx.drawImage(srcC, 0, 0);
    } else if (kind === 'flash') {
      // Scope white flash to the active layer's alpha via source-atop so PiP overlays never flash V1!
      const srcC = ease < 0.5 ? this.layerCanvas : this.layerCanvasB;
      const srcCtx = ease < 0.5 ? this.layerCtx : this.layerCtxB;
      const peak = 1 - Math.abs(ease - 0.5) * 2;
      srcCtx.save();
      srcCtx.globalCompositeOperation = 'source-atop';
      srcCtx.fillStyle = `rgba(255,255,255,${(peak * 0.92).toFixed(3)})`;
      srcCtx.fillRect(0, 0, baseW, baseH);
      srcCtx.restore();
      ctx.drawImage(srcC, 0, 0);
    } else {
      ctx.drawImage(this.layerCanvasB, 0, 0);
    }
    ctx.restore();
  }

  _ensureCanvasSize(c, w, h) {
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  applyFeatheredMask(targetCtx, clip, localT, W, H, clipX = 0, clipY = 0, clipScale = 1, clipRot = 0) {
    const mask = clip.mask;
    if (!mask || mask.type === 'none') return;
    const mx = (evalKeyframe(clip, 'maskX', localT, mask.x ?? 0.5) - 0.5) * W;
    const my = (evalKeyframe(clip, 'maskY', localT, mask.y ?? 0.5) - 0.5) * H;
    const ms = evalKeyframe(clip, 'maskScale', localT, mask.scale ?? 0.48);
    const rot = ((mask.rotation || 0) * Math.PI) / 180;
    const feather = Math.max(0, Number(mask.feather || 0));

    this._ensureCanvasSize(this.maskCanvas, W, H);
    const mctx = this.maskCtx;
    mctx.save();
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, W, H);
    if (feather > 0.5) mctx.filter = `blur(${feather.toFixed(1)}px)`;

    const drawShape = () => {
      mctx.save();
      // Anchor mask in clip-local transform space so moving/scaling/rotating a PiP moves its mask with it
      mctx.translate(W / 2 + clipX, H / 2 + clipY);
      mctx.rotate((clipRot * Math.PI) / 180);
      mctx.scale(clipScale * (clip.flipH ? -1 : 1), clipScale * (clip.flipV ? -1 : 1));
      mctx.beginPath();
      if (mask.type === 'circle') {
        const r = Math.min(W, H) * ms * 0.55;
        mctx.ellipse(mx, my, r, r, rot, 0, Math.PI * 2);
      } else if (mask.type === 'rect') {
        const rw = W * ms, rh = H * ms;
        mctx.translate(mx, my); mctx.rotate(rot);
        mctx.roundRect(-rw / 2, -rh / 2, rw, rh, 18);
      } else if (mask.type === 'split') {
        mctx.translate(mx, my); mctx.rotate(rot);
        mctx.rect(-W * 2, -H * 2, W * 2, H * 4);
      } else if (mask.type === 'mirror') {
        const halfH = H * ms * 0.45;
        mctx.translate(mx, my); mctx.rotate(rot);
        mctx.rect(-W * 2, -halfH, W * 4, halfH * 2);
      }
      mctx.fill();
      mctx.restore();
    };

    if (mask.invert) {
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, W, H);
      mctx.globalCompositeOperation = 'destination-out';
      drawShape();
    } else {
      mctx.fillStyle = '#ffffff';
      drawShape();
    }
    mctx.restore();

    targetCtx.save();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    targetCtx.globalCompositeOperation = 'destination-in';
    targetCtx.drawImage(this.maskCanvas, 0, 0);
    targetCtx.restore();
  }

  getChromaKeyedSource(el, clip, isExport) {
    const dims = this._mediaDims(el);
    if (!dims.w || !dims.h) return el;
    // Full resolution during export (up to 1920px), fast 640px cap only during live interactive preview
    const maxDim = isExport ? 1920 : 640;
    const ratio = Math.min(1, maxDim / Math.max(dims.w, dims.h));
    const cw = Math.max(2, Math.round(dims.w * ratio));
    const ch = Math.max(2, Math.round(dims.h * ratio));
    this._ensureCanvasSize(this.chromaCanvas, cw, ch);
    this.chromaCtx.clearRect(0, 0, cw, ch);
    this.chromaCtx.drawImage(el, 0, 0, cw, ch);
    const imgData = this.chromaCtx.getImageData(0, 0, cw, ch);
    const d = imgData.data;
    const hex = clip.chromaKey.color || '#00ff00';
    const kr = parseInt(hex.slice(1, 3), 16) || 0;
    const kg = parseInt(hex.slice(3, 5), 16) || 255;
    const kb = parseInt(hex.slice(5, 7), 16) || 0;
    const tol = (clip.chromaKey.strength ?? 0.36) * 210;
    const feather = Math.max(6, (clip.chromaKey.feather ?? 0.14) * 140);
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
      if (dist < tol) d[i + 3] = 0;
      else if (dist < tol + feather) d[i + 3] = Math.round(((dist - tol) / feather) * d[i + 3]);
    }
    this.chromaCtx.putImageData(imgData, 0, 0);
    return this.chromaCanvas;
  }

  drawMediaClip(ctx, clip, localT, W, H, snap, isExport, extraAlpha = 1, extraX = 0, extraY = 0, extraScale = 1, skipTransIn = false, skipTransOut = false) {
    const media = clip.mediaId ? this.getMediaById(clip.mediaId, snap) : null;
    const el = this.getOrCreateElement(clip, snap);
    const dims = this._mediaDims(el);
    if (!el || dims.w === 0 || dims.h === 0) {
      if (clip.mediaId && (!media || media.missing || this.erroredMedia.has(clip.mediaId))) {
        ctx.save();
        ctx.fillStyle = '#2a1218';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff4f6d';
        ctx.font = '700 34px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Media Offline: ${clip.name || clip.mediaId}`, W / 2, H / 2);
        ctx.restore();
      }
      return;
    }

    let opacity = evalKeyframe(clip, 'opacity', localT, clip.opacity ?? 1) * extraAlpha;
    let x = evalKeyframe(clip, 'x', localT, clip.x || 0) + extraX;
    let y = evalKeyframe(clip, 'y', localT, clip.y || 0) + extraY;
    let scale = evalKeyframe(clip, 'scale', localT, clip.scale ?? 1) * extraScale;
    let rot = evalKeyframe(clip, 'rotation', localT, clip.rotation || 0);

    // Standalone Intro/Outro transitions (when NOT already rendered via A->B overlap)
    let transFilterExtra = '';
    let flashOverlay = 0;
    let dipOverlay = 0;
    let wipeProgress = null;

    if (!skipTransIn && clip.transIn && clip.transIn !== 'none' && localT < (clip.transInDur || 0.5)) {
      const p = Math.max(0, Math.min(1, localT / Math.max(0.05, clip.transInDur || 0.5)));
      const e = evalEasing('easeInOut', p);
      if (clip.transIn === 'crossfade') opacity *= e;
      else if (clip.transIn === 'dip-black') dipOverlay = 1 - e;
      else if (clip.transIn === 'flash') flashOverlay = 1 - e;
      else if (clip.transIn === 'slide-left') x += (1 - e) * W;
      else if (clip.transIn === 'slide-up') y += (1 - e) * H;
      else if (clip.transIn === 'zoom-in') scale *= (0.55 + 0.45 * e);
      else if (clip.transIn === 'wipe-left') wipeProgress = e;
      else if (clip.transIn === 'blur-dissolve') { opacity *= e; transFilterExtra = ` blur(${((1 - e) * 18).toFixed(1)}px)`; }
    }
    const rem = clip.duration - localT;
    if (!skipTransOut && clip.transOut && clip.transOut !== 'none' && rem < (clip.transOutDur || 0.5)) {
      const p = Math.max(0, Math.min(1, rem / Math.max(0.05, clip.transOutDur || 0.5)));
      const e = evalEasing('easeInOut', p);
      if (clip.transOut === 'crossfade') opacity *= e;
      else if (clip.transOut === 'dip-black') dipOverlay = Math.max(dipOverlay, 1 - e);
      else if (clip.transOut === 'flash') flashOverlay = Math.max(flashOverlay, 1 - e);
      else if (clip.transOut === 'slide-left') x -= (1 - e) * W;
      else if (clip.transOut === 'slide-up') y -= (1 - e) * H;
      else if (clip.transOut === 'wipe-left') wipeProgress = e;
      else if (clip.transOut === 'zoom-in') scale *= (1 + (1 - e) * 0.35);
      else if (clip.transOut === 'blur-dissolve') { opacity *= e; transFilterExtra = ` blur(${((1 - e) * 18).toFixed(1)}px)`; }
    }

    const fxList = Array.isArray(clip.effects) ? clip.effects : [];
    const fxInt = (id) => (clip.effectIntensity?.[id] ?? 0.65);

    if (fxList.includes('shake')) {
      const k = fxInt('shake');
      x += Math.sin(localT * 42) * 18 * k;
      y += Math.cos(localT * 51) * 12 * k;
      rot += Math.sin(localT * 33) * 1.4 * k;
    }
    if (fxList.includes('zoom-pulse')) {
      const k = fxInt('zoom-pulse');
      scale *= (1 + Math.pow(Math.abs(Math.sin(localT * Math.PI * 2)), 4) * 0.14 * k);
    }

    const fit = clip.fitMode || 'contain';
    const srcCrop = clip.cropRect;
    const sx = srcCrop ? srcCrop.x : 0;
    const sy = srcCrop ? srcCrop.y : 0;
    const sw = srcCrop ? srcCrop.w : dims.w;
    const sh = srcCrop ? srcCrop.h : dims.h;

    let drawW, drawH;
    const srcAR = sw / Math.max(1, sh);
    const dstAR = W / H;
    if (fit === 'cover') {
      if (srcAR > dstAR) { drawH = H; drawW = H * srcAR; } else { drawW = W; drawH = W / srcAR; }
    } else if (fit === 'stretch') {
      drawW = W; drawH = H;
    } else {
      if (srcAR > dstAR) { drawW = W; drawH = W / srcAR; } else { drawH = H; drawW = H * srcAR; }
    }

    const srcObj = clip.chromaKey?.enabled ? this.getChromaKeyedSource(el, clip, isExport) : el;
    const sRatioX = srcObj === el ? 1 : (srcObj.width / dims.w);
    const sRatioY = srcObj === el ? 1 : (srcObj.height / dims.h);

    // Use isolated offscreen layer whenever mask, VFX, or scoped flash/dip is active so opacity & blendMode ALWAYS hold!
    const needsOffscreen = (clip.mask && clip.mask.type !== 'none') || fxList.length > 0 || flashOverlay > 0 || dipOverlay > 0;
    let drawTarget = ctx;
    if (needsOffscreen && ctx !== this.layerCtx && ctx !== this.layerCtxB) {
      this._ensureCanvasSize(this.layerCanvas, W, H);
      this.layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.layerCtx.clearRect(0, 0, W, H);
      drawTarget = this.layerCtx;
    }

    drawTarget.save();
    if (drawTarget === ctx) {
      drawTarget.globalAlpha = Math.max(0, Math.min(1, opacity));
      drawTarget.globalCompositeOperation = clip.blendMode || 'source-over';
    }
    if (wipeProgress !== null) {
      drawTarget.beginPath();
      drawTarget.rect(0, 0, W * wipeProgress, H);
      drawTarget.clip();
    }

    drawTarget.translate(W / 2 + x, H / 2 + y);
    drawTarget.rotate((rot * Math.PI) / 180);
    drawTarget.scale(scale * (clip.flipH ? -1 : 1), scale * (clip.flipV ? -1 : 1));
    const baseFilter = this.buildCssFilter(clip);
    drawTarget.filter = baseFilter === 'none' ? (transFilterExtra.trim() || 'none') : (baseFilter + transFilterExtra);

    if (fxList.includes('pixelate')) {
      const k = fxInt('pixelate');
      const pxScale = Math.max(0.03, 0.25 - k * 0.2);
      const pw = Math.max(16, Math.round(drawW * pxScale));
      const ph = Math.max(16, Math.round(drawH * pxScale));
      // Use dedicated fxCanvas so Chroma Key (chromaCanvas) + Pixelate never collide
      this._ensureCanvasSize(this.fxCanvas, pw, ph);
      this.fxCtx.clearRect(0, 0, pw, ph);
      this.fxCtx.imageSmoothingEnabled = false;
      this.fxCtx.drawImage(srcObj, sx * sRatioX, sy * sRatioY, sw * sRatioX, sh * sRatioY, 0, 0, pw, ph);
      drawTarget.imageSmoothingEnabled = false;
      drawTarget.drawImage(this.fxCanvas, 0, 0, pw, ph, -drawW / 2, -drawH / 2, drawW, drawH);
      drawTarget.imageSmoothingEnabled = true;
    } else if (fxList.includes('mirror-h')) {
      drawTarget.drawImage(srcObj, sx * sRatioX, sy * sRatioY, (sw / 2) * sRatioX, sh * sRatioY, -drawW / 2, -drawH / 2, drawW / 2, drawH);
      drawTarget.save();
      drawTarget.scale(-1, 1);
      drawTarget.drawImage(srcObj, sx * sRatioX, sy * sRatioY, (sw / 2) * sRatioX, sh * sRatioY, -drawW / 2, -drawH / 2, drawW / 2, drawH);
      drawTarget.restore();
    } else {
      drawTarget.drawImage(srcObj, sx * sRatioX, sy * sRatioY, sw * sRatioX, sh * sRatioY, -drawW / 2, -drawH / 2, drawW, drawH);
    }

    if (fxList.includes('chromatic') || fxList.includes('glitch')) {
      const k = fxInt(fxList.includes('glitch') ? 'glitch' : 'chromatic');
      const shift = (fxList.includes('glitch') ? (Math.sin(localT * 60) * 18) : 12) * k;
      drawTarget.globalCompositeOperation = 'screen';
      drawTarget.globalAlpha = 0.42 * k;
      drawTarget.drawImage(srcObj, sx * sRatioX, sy * sRatioY, sw * sRatioX, sh * sRatioY, -drawW / 2 + shift, -drawH / 2, drawW, drawH);
      drawTarget.drawImage(srcObj, sx * sRatioX, sy * sRatioY, sw * sRatioX, sh * sRatioY, -drawW / 2 - shift, -drawH / 2, drawW, drawH);
    }
    drawTarget.restore();

    // Post-FX inside the isolated offscreen layer (respecting opacity + blendMode!)
    if (fxList.length > 0) {
      this.applyClipVFX(drawTarget, fxList, fxInt, localT, W, H);
    }
    if (clip.mask && clip.mask.type !== 'none') {
      this.applyFeatheredMask(drawTarget, clip, localT, W, H, x, y, scale, rot);
    }
    if (flashOverlay > 0.01) {
      drawTarget.save();
      drawTarget.globalCompositeOperation = 'source-atop';
      drawTarget.fillStyle = `rgba(255,255,255,${(flashOverlay * 0.92).toFixed(3)})`;
      drawTarget.fillRect(0, 0, W, H);
      drawTarget.restore();
    }
    if (dipOverlay > 0.01) {
      drawTarget.save();
      drawTarget.globalCompositeOperation = 'source-atop';
      drawTarget.fillStyle = `rgba(0,0,0,${dipOverlay.toFixed(3)})`;
      drawTarget.fillRect(0, 0, W, H);
      drawTarget.restore();
    }

    if (drawTarget !== ctx) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.globalCompositeOperation = clip.blendMode || 'source-over';
      ctx.drawImage(drawTarget.canvas, 0, 0);
      ctx.restore();
    }
  }

  applyClipVFX(ctx, fxList, fxInt, localT, W, H) {
    ctx.save();
    if (fxList.includes('vhs')) {
      const k = fxInt('vhs');
      ctx.fillStyle = `rgba(0,0,0,${(0.26 * k).toFixed(3)})`;
      for (let sy = 0; sy < H; sy += 6) ctx.fillRect(0, sy, W, 2);
      const bandY = ((localT * 210) % (H + 120)) - 60;
      ctx.fillStyle = `rgba(255,255,255,${(0.11 * k).toFixed(3)})`;
      ctx.fillRect(0, bandY, W, 22);
    }
    if (fxList.includes('glitch')) {
      const k = fxInt('glitch');
      const slices = Math.max(2, Math.round(6 * k));
      for (let i = 0; i < slices; i++) {
        const seed = Math.sin(localT * 40 + i * 19.3);
        if (seed > 0.25) {
          const gy = ((Math.abs(Math.sin(localT * 17 + i * 7.1)) * H) | 0);
          const gh = 8 + ((i * 11) % 34);
          ctx.fillStyle = i % 2 === 0 ? `rgba(0,229,195,${(0.24 * k).toFixed(2)})` : `rgba(255,79,109,${(0.24 * k).toFixed(2)})`;
          ctx.fillRect(0, gy, W, gh);
        }
      }
    }
    if (fxList.includes('bloom')) {
      const k = fxInt('bloom');
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.62);
      g.addColorStop(0, `rgba(255,244,225,${(0.26 * k).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (fxList.includes('vignette')) {
      const k = fxInt('vignette');
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.26, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${(0.82 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (fxList.includes('letterbox')) {
      const barH = Math.round(H * 0.12 * Math.max(0.4, fxInt('letterbox')));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }
    if (fxList.includes('bw-flash') && Math.sin(localT * 26) > 0.86) {
      ctx.fillStyle = `rgba(255,255,255,${(0.32 * fxInt('bw-flash')).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  drawGraphicClip(ctx, clip, localT, globalT, W, H, snap) {
    const x = evalKeyframe(clip, 'x', localT, clip.x || 0);
    const y = evalKeyframe(clip, 'y', localT, clip.y || 0);
    const sc = evalKeyframe(clip, 'scale', localT, clip.scale ?? 1);
    const rot = evalKeyframe(clip, 'rotation', localT, clip.rotation || 0);
    const op = evalKeyframe(clip, 'opacity', localT, clip.opacity ?? 1);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, op));
    ctx.globalCompositeOperation = clip.blendMode || 'source-over';
    ctx.translate(W / 2 + x, H / 2 + y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc, sc);

    const k = clip.graphicKind || 'rec-badge';
    if (k === 'rec-badge') {
      const blink = Math.floor(globalT * 2) % 2 === 0;
      ctx.fillStyle = 'rgba(10,12,16,0.74)';
      ctx.beginPath(); ctx.roundRect(-130, -34, 260, 68, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = blink ? '#ff3355' : 'rgba(255,51,85,0.25)';
      ctx.beginPath(); ctx.arc(-92, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const sec = Math.floor(globalT);
      const ms = Math.floor((globalT - sec) * 100);
      ctx.fillText(`REC ${String(sec).padStart(2, '0')}:${String(ms).padStart(2, '0')}`, -66, 2);
    } else if (k === 'viewfinder') {
      const bw = W * 0.88, bh = H * 0.86, arm = 54;
      ctx.strokeStyle = 'rgba(255,255,255,0.84)'; ctx.lineWidth = 4;
      for (const [cx, cy, dx, dy] of [[-bw / 2, -bh / 2, 1, 1], [bw / 2, -bh / 2, -1, 1], [-bw / 2, bh / 2, 1, -1], [bw / 2, bh / 2, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx, cy + dy * arm); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * arm, cy); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.moveTo(0, -24); ctx.lineTo(0, 24); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`RAW · ${snap.fps}FPS · ${W}×${H}`, -bw / 2 + 24, bh / 2 - 26);
    } else if (k === 'progress-bar') {
      const total = Math.max(0.5, getSnapshotDuration(snap));
      const pct = Math.min(1, Math.max(0, globalT / total));
      const bw = W * 0.86, bh = 14;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 7); ctx.fill();
      const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      grad.addColorStop(0, '#00e5c3'); grad.addColorStop(1, '#00b8ff');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw * pct, bh, 7); ctx.fill();
    } else if (k === 'lower-third') {
      const ease = Math.min(1, localT / 0.35);
      const slide = (1 - Math.pow(1 - ease, 3)) * 1;
      ctx.translate(-(1 - slide) * 180, 0);
      ctx.fillStyle = 'rgba(11,14,20,0.88)';
      ctx.beginPath(); ctx.roundRect(-290, -54, 580, 108, 12); ctx.fill();
      ctx.fillStyle = '#00e5c3';
      ctx.fillRect(-290, -54, 10, 108);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 36px Inter, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(clip.text || 'MOTIONVIZ STUDIO', -260, -14);
      ctx.fillStyle = '#00e5c3';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText(clip.subText || 'AI WORKFLOWS & VFX', -260, 26);
    } else if (k === 'arrow-callout') {
      ctx.strokeStyle = '#00e5c3'; ctx.fillStyle = '#00e5c3'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-110, 40); ctx.quadraticCurveTo(-20, -40, 95, -20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(110, -22); ctx.lineTo(68, -46); ctx.lineTo(76, 4); ctx.closePath(); ctx.fill();
    } else if (k === 'gradient-matte') {
      const g = ctx.createLinearGradient(0, -H * 0.25, 0, H * 0.25);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = g;
      ctx.fillRect(-W / 2, -H * 0.25, W, H * 0.5);
    }
    ctx.restore();
  }

  _wrapTextLines(ctx, rawText, maxWidth) {
    const paragraphs = String(rawText || '').split('\n');
    const lines = [];
    for (const para of paragraphs) {
      if (!maxWidth || maxWidth <= 0) { lines.push(para); continue; }
      const words = para.split(/\s+/);
      let current = '';
      for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = w;
        } else {
          current = test;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  drawTextClip(ctx, clip, localT, W, H) {
    let opacity = evalKeyframe(clip, 'opacity', localT, clip.opacity ?? 1);
    let x = evalKeyframe(clip, 'x', localT, clip.x || 0);
    let y = evalKeyframe(clip, 'y', localT, clip.y || 0);
    let scale = evalKeyframe(clip, 'scale', localT, clip.scale ?? 1);
    let rot = evalKeyframe(clip, 'rotation', localT, clip.rotation || 0);

    // Intro animation
    const anim = clip.animIn || 'none';
    const ad = Math.min(0.45, clip.duration * 0.4);
    let visibleText = clip.text || 'Text';
    if (anim !== 'none' && localT < ad) {
      const p = Math.max(0, Math.min(1, localT / Math.max(0.05, ad)));
      const ease = 1 - Math.pow(1 - p, 3);
      if (anim === 'pop') { scale *= (0.4 + 0.6 * ease); opacity *= ease; }
      else if (anim === 'slide-up') { y += (1 - ease) * 90; opacity *= ease; }
      else if (anim === 'fade') { opacity *= ease; }
      else if (anim === 'typewriter') { visibleText = visibleText.slice(0, Math.max(1, Math.ceil(visibleText.length * p))); }
    }

    // Outro animation
    const animOut = clip.animOut || 'none';
    const rem = clip.duration - localT;
    if (animOut !== 'none' && rem < ad) {
      const p = Math.max(0, Math.min(1, rem / Math.max(0.05, ad)));
      const ease = 1 - Math.pow(1 - p, 3);
      if (animOut === 'fade') opacity *= ease;
      else if (animOut === 'pop') { scale *= (0.4 + 0.6 * ease); opacity *= ease; }
      else if (animOut === 'slide-down') { y += (1 - ease) * 90; opacity *= ease; }
      else if (animOut === 'zoom-out') { scale *= (1 + (1 - ease) * 0.4); opacity *= ease; }
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.translate(W / 2 + x, H / 2 + y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(scale, scale);

    const fontSize = clip.fontSize || 76;
    const weight = clip.fontWeight || '900';
    const align = clip.align || 'center';
    const fontFamily = clip.fontFamily || 'Inter, -apple-system, sans-serif';
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Number(clip.spacing || 0)}px`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    const maxWrapW = clip.maxWidth > 0 ? clip.maxWidth : W * 0.86;
    const lines = this._wrapTextLines(ctx, visibleText, maxWrapW);
    const lineH = fontSize * 1.18;
    const totalH = lines.length * lineH;
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width), 40);

    const anchorX = align === 'left' ? -maxW / 2 : (align === 'right' ? maxW / 2 : 0);

    if (clip.bgAlpha > 0) {
      ctx.save();
      ctx.fillStyle = clip.bgColor || '#000000';
      ctx.globalAlpha *= clip.bgAlpha;
      const padX = fontSize * 0.42;
      const padY = fontSize * 0.24;
      ctx.beginPath();
      ctx.roundRect(-maxW / 2 - padX, -totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2, 16);
      ctx.fill();
      ctx.restore();
    }

    if ((clip.shadowBlur || 0) > 0) {
      ctx.shadowColor = clip.shadowColor || 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = clip.shadowBlur;
      ctx.shadowOffsetY = Math.round(clip.shadowBlur * 0.25);
    }

    lines.forEach((line, i) => {
      const ly = -totalH / 2 + lineH * (i + 0.5);
      if (clip.strokeWidth > 0) {
        ctx.lineWidth = clip.strokeWidth;
        ctx.strokeStyle = clip.strokeColor || '#000000';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, anchorX, ly);
      }
      ctx.fillStyle = clip.color || '#ffffff';
      ctx.fillText(line, anchorX, ly);
    });
    ctx.restore();
  }

  /** Multi-line auto-wrapping captions safe for both 16:9 and 9:16 */
  drawCaption(ctx, cap, t, W, H, snap) {
    const words = (cap.text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const style = snap.captionStyle || 'hormozi';
    const progress = Math.max(0, Math.min(0.999, (t - cap.start) / Math.max(0.1, cap.end - cap.start)));
    const activeIdx = Math.floor(progress * words.length);
    const fontSize = Math.round((snap.captionFontSize || 56) * (W < H ? 0.92 : 1));
    const yCenter = H * ((snap.captionYPos ?? 80) / 100);
    const maxLineW = W * 0.86;

    ctx.save();
    ctx.font = `900 ${fontSize}px Inter, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const displayWords = style === 'hormozi' ? words.map(w => w.toUpperCase()) : words;
    const spaceW = ctx.measureText(' ').width * 1.15;

    // Word-wrap into lines while tracking each word's original index
    const lines = [];
    let curLine = [];
    let curW = 0;
    displayWords.forEach((w, idx) => {
      const ww = ctx.measureText(w).width;
      if (curLine.length > 0 && curW + spaceW + ww > maxLineW) {
        lines.push({ items: curLine, width: curW });
        curLine = [{ word: w, idx, ww }];
        curW = ww;
      } else {
        if (curLine.length > 0) curW += spaceW;
        curLine.push({ word: w, idx, ww });
        curW += ww;
      }
    });
    if (curLine.length) lines.push({ items: curLine, width: curW });

    const lineH = fontSize * 1.26;
    const totalH = lines.length * lineH;
    const maxActualW = Math.max(...lines.map(l => l.width));

    if (style === 'pill') {
      ctx.fillStyle = 'rgba(8, 10, 14, 0.84)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - maxActualW / 2 - 28, yCenter - totalH / 2 - 14, maxActualW + 56, totalH + 28, 18);
      ctx.fill();
    }

    lines.forEach((line, li) => {
      const ly = yCenter - totalH / 2 + lineH * (li + 0.5);
      if (style === 'hormozi') {
        let curX = W / 2 - line.width / 2;
        for (const item of line.items) {
          const isAct = item.idx === activeIdx;
          const cx = curX + item.ww / 2;
          ctx.save();
          ctx.translate(cx, ly);
          if (isAct) ctx.scale(1.13, 1.13);
          ctx.lineWidth = Math.max(8, fontSize * 0.19);
          ctx.strokeStyle = '#000000';
          ctx.lineJoin = 'round';
          ctx.strokeText(item.word, 0, 0);
          ctx.fillStyle = isAct ? '#00e5c3' : '#ffffff';
          ctx.fillText(item.word, 0, 0);
          ctx.restore();
          curX += item.ww + spaceW;
        }
      } else {
        const lineText = line.items.map(i => i.word).join(' ');
        ctx.lineWidth = style === 'clean' ? 6 : 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        if (style === 'clean') ctx.strokeText(lineText, W / 2, ly);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(lineText, W / 2, ly);
      }
    });
    ctx.restore();
  }

  getClipBoundingBox(clip, t) {
    const W = this.state.canvasWidth;
    const H = this.state.canvasHeight;
    const localT = Math.max(0, t - clip.start);
    const x = evalKeyframe(clip, 'x', localT, clip.x || 0);
    const y = evalKeyframe(clip, 'y', localT, clip.y || 0);
    const sc = evalKeyframe(clip, 'scale', localT, clip.scale ?? 1);
    const rot = evalKeyframe(clip, 'rotation', localT, clip.rotation || 0);

    let bw = W * 0.42, bh = H * 0.2;
    if (clip.type === 'text') {
      const fs = clip.fontSize || 76;
      const weight = clip.fontWeight || '900';
      const fontFamily = clip.fontFamily || 'Inter, -apple-system, sans-serif';
      const maxWrapW = clip.maxWidth > 0 ? clip.maxWidth : W * 0.86;
      const ctx = this.ctx;
      ctx.save();
      ctx.font = `${weight} ${fs}px ${fontFamily}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Number(clip.spacing || 0)}px`;
      const lines = this._wrapTextLines(ctx, clip.text || 'Text', maxWrapW);
      const measuredMax = Math.max(80, ...lines.map(l => ctx.measureText(l).width));
      ctx.restore();
      const hasBg = (clip.bgAlpha || 0) > 0.01;
      const padX = hasBg ? fs * 0.42 * 2 : 28;
      const padY = hasBg ? fs * 0.24 * 2 : 18;
      const lineH = fs * 1.18;
      bw = Math.min(W * 0.94, measuredMax + padX);
      bh = Math.max(fs * 1.25, lines.length * lineH + padY);
    } else if (clip.type === 'graphic') {
      bw = clip.graphicKind === 'lower-third' ? 580 : (clip.graphicKind === 'rec-badge' ? 280 : (clip.graphicKind === 'arrow-callout' ? 240 : W * 0.85));
      bh = clip.graphicKind === 'lower-third' ? 120 : (clip.graphicKind === 'rec-badge' ? 84 : (clip.graphicKind === 'arrow-callout' ? 140 : H * 0.35));
    } else {
      // Compute actual drawn rectangle from media dimensions, cropRect, and fitMode
      const media = clip.mediaId ? this.getMediaById(clip.mediaId) : null;
      const el = clip.mediaId ? this.mediaElements.get(`${clip.id}::${clip.mediaId}::${media?.url || ''}`) : null;
      const dims = this._mediaDims(el);
      const rawW = dims.w || media?.width || W;
      const rawH = dims.h || media?.height || H;
      const sw = clip.cropRect?.w > 0 ? clip.cropRect.w : rawW;
      const sh = clip.cropRect?.h > 0 ? clip.cropRect.h : rawH;
      const fit = clip.fitMode || 'contain';
      const srcAR = sw / Math.max(1, sh);
      const dstAR = W / H;
      if (fit === 'cover') {
        if (srcAR > dstAR) { bh = H; bw = H * srcAR; } else { bw = W; bh = W / srcAR; }
      } else if (fit === 'stretch') {
        bw = W; bh = H;
      } else {
        if (srcAR > dstAR) { bw = W; bh = W / srcAR; } else { bh = H; bw = H * srcAR; }
      }
    }
    return { cx: W / 2 + x, cy: H / 2 + y, w: bw * sc, h: bh * sc, rot };
  }

  /** Computes handle points clamped inside visible canvas edges so full-frame clips stay draggable! */
  getHandlePoints(box) {
    const W = this.state.canvasWidth;
    const H = this.state.canvasHeight;
    const rad = (box.rot * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const toWorld = (lx, ly) => ({
      x: Math.max(18, Math.min(W - 18, box.cx + lx * cos - ly * sin)),
      y: Math.max(18, Math.min(H - 18, box.cy + lx * sin + ly * cos)),
    });
    const hw = Math.min(box.w / 2, W / 2 - 22);
    const hh = Math.min(box.h / 2, H / 2 - 22);
    const corners = [
      { id: 'tl', ...toWorld(-hw, -hh) },
      { id: 'tr', ...toWorld(hw, -hh) },
      { id: 'br', ...toWorld(hw, hh) },
      { id: 'bl', ...toWorld(-hw, hh) },
    ];
    const rawRot = {
      x: box.cx - (-hh - 46) * sin,
      y: box.cy + (-hh - 46) * cos,
    };
    const rotHandle = {
      x: Math.max(24, Math.min(W - 24, rawRot.x)),
      y: Math.max(24, Math.min(H - 24, rawRot.y)),
    };
    return { corners, rotHandle, hw, hh };
  }

  renderOverlayGuides(t) {
    const octx = this.octx;
    const W = this.state.canvasWidth;
    const H = this.state.canvasHeight;
    if (this.overlay.width !== W || this.overlay.height !== H) {
      this.overlay.width = W; this.overlay.height = H;
    }
    octx.clearRect(0, 0, W, H);

    if (this.state.showGuides) {
      octx.save();
      octx.strokeStyle = 'rgba(0, 229, 195, 0.35)';
      octx.lineWidth = 2;
      octx.setLineDash([10, 8]);
      octx.strokeRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84);
      octx.strokeStyle = 'rgba(255,255,255,0.2)';
      octx.beginPath();
      octx.moveTo(W / 3, 0); octx.lineTo(W / 3, H);
      octx.moveTo((W * 2) / 3, 0); octx.lineTo((W * 2) / 3, H);
      octx.moveTo(0, H / 3); octx.lineTo(W, H / 3);
      octx.moveTo(0, (H * 2) / 3); octx.lineTo(W, (H * 2) / 3);
      octx.stroke();
      octx.restore();
    }

    if (this.snapXGuide !== null) {
      octx.save(); octx.strokeStyle = '#ffb020'; octx.lineWidth = 2;
      octx.beginPath(); octx.moveTo(this.snapXGuide, 0); octx.lineTo(this.snapXGuide, H); octx.stroke();
      octx.restore();
    }
    if (this.snapYGuide !== null) {
      octx.save(); octx.strokeStyle = '#ffb020'; octx.lineWidth = 2;
      octx.beginPath(); octx.moveTo(0, this.snapYGuide); octx.lineTo(W, this.snapYGuide); octx.stroke();
      octx.restore();
    }

    const sel = this.findSelectedClip();
    if (!sel || sel.type === 'audio' || t < sel.start || t >= sel.start + sel.duration) return;
    const selTrack = this.state.tracks.find(tr => tr.clips.some(c => c.id === sel.id));
    if (selTrack?.locked || selTrack?.hidden) return;
    const box = this.getClipBoundingBox(sel, t);
    const { corners, rotHandle, hw, hh } = this.getHandlePoints(box);

    octx.save();
    octx.translate(box.cx, box.cy);
    octx.rotate((box.rot * Math.PI) / 180);
    octx.strokeStyle = '#00e5c3';
    octx.lineWidth = 3;
    octx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    octx.restore();

    // Draw inset corner handles + top rotate handle in screen/project space
    octx.save();
    octx.strokeStyle = '#00e5c3';
    octx.lineWidth = 2.5;
    octx.beginPath();
    octx.moveTo((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2);
    octx.lineTo(rotHandle.x, rotHandle.y);
    octx.stroke();

    octx.fillStyle = '#00e5c3';
    octx.beginPath();
    octx.arc(rotHandle.x, rotHandle.y, 13, 0, Math.PI * 2);
    octx.fill();
    octx.strokeStyle = '#051014'; octx.lineWidth = 3; octx.stroke();

    for (const c of corners) {
      octx.fillStyle = '#ffffff';
      octx.strokeStyle = '#00e5c3';
      octx.lineWidth = 3;
      octx.fillRect(c.x - 10, c.y - 10, 20, 20);
      octx.strokeRect(c.x - 10, c.y - 10, 20, 20);
    }
    octx.restore();
  }

  hitTestGizmoHandles(px, py, t) {
    const sel = this.findSelectedClip();
    if (!sel || sel.type === 'audio' || t < sel.start || t >= sel.start + sel.duration) return null;
    const ownerTrack = this.state.tracks.find(tr => tr.clips.some(c => c.id === sel.id));
    if (ownerTrack?.locked || ownerTrack?.hidden) return null;
    const box = this.getClipBoundingBox(sel, t);
    const { corners, rotHandle } = this.getHandlePoints(box);
    if (Math.hypot(px - rotHandle.x, py - rotHandle.y) < 30) return { mode: 'rotate', clip: sel, box };
    for (const c of corners) {
      if (Math.hypot(px - c.x, py - c.y) < 28) return { mode: 'scale', clip: sel, box };
    }
    return null;
  }

  hitTestGizmo(px, py, t) {
    const h = this.hitTestGizmoHandles(px, py, t);
    if (h) return h;
    const sel = this.findSelectedClip();
    if (!sel || sel.type === 'audio' || t < sel.start || t >= sel.start + sel.duration) return null;
    const selTrack = this.state.tracks.find(tr => tr.clips.some(c => c.id === sel.id));
    if (selTrack && (selTrack.locked || selTrack.hidden)) return null;
    const box = this.getClipBoundingBox(sel, t);
    const dx = px - box.cx, dy = py - box.cy;
    const rad = (-box.rot * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2) return { mode: 'move', clip: sel, box };
    return null;
  }

  hitTestAnyClip(px, py, t) {
    // state.tracks is ordered top-to-bottom (Text -> Overlay -> Main Video); skip hidden & locked tracks
    const layers = this.state.tracks.filter(tr => !tr.hidden && !tr.locked && tr.type !== 'audio');
    for (const tr of layers) {
      for (let i = tr.clips.length - 1; i >= 0; i--) {
        const clip = tr.clips[i];
        if (t < clip.start || t >= clip.start + clip.duration) continue;
        const box = this.getClipBoundingBox(clip, t);
        // Rotation-aware hit test in clip-local space
        const dx = px - box.cx;
        const dy = py - box.cy;
        const rad = (-box.rot * Math.PI) / 180;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        if (Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2) return clip;
      }
    }
    return null;
  }

  findSelectedClip() {
    for (const tr of this.state.tracks) {
      const c = tr.clips.find(x => x.id === this.state.selectedClipId);
      if (c) return c;
    }
    return null;
  }

  /** Render ONLY the selected clip (no text, captions, or other overlays) for clean Freeze Frame PNG */
  async captureIsolatedClipBlob(clip, t) {
    const off = document.createElement('canvas');
    off.width = this.state.canvasWidth;
    off.height = this.state.canvasHeight;
    const octx = off.getContext('2d');
    const snap = structuredClone({
      canvasWidth: this.state.canvasWidth,
      canvasHeight: this.state.canvasHeight,
      fps: this.state.fps,
      bgMode: 'black',
      tracks: this.state.tracks,
      captions: [],
      library: this.state.library,
    });
    await this.seekAllExact(snap, t);
    this.renderFrame(t, {
      snapshot: snap,
      targetCanvas: off,
      targetCtx: octx,
      renderW: off.width,
      renderH: off.height,
      hideGuides: true,
      isolateClipId: clip.id,
      isExport: true,
    });
    return new Promise((resolve) => off.toBlob(resolve, 'image/png'));
  }

  async cancelExport() {
    if (this.exportAbortCtrl) {
      this.exportAbortCtrl.abort();
    }
    if (this.activeExportJobId) {
      const jid = this.activeExportJobId;
      this.activeExportJobId = null;
      try {
        await fetch(`/api/export-frames/cancel/${jid}`, {
          method: 'POST',
          headers: getApiTokenHeaders(),
        });
      } catch {}
    }
  }

  /**
   * Deterministic Frame-Accurate MP4 Export:
   * - Renders from a deep-cloned immutable snapshot on a SEPARATE offscreen canvas
   * - Zero state mutation, zero seek races, resolution-independent scaling
   * - Supports cancellation + ETA + full audio parity (reverse, ramps, voiceFx, EQ, volume KFs)
   */
  async exportDeterministicMP4({ width, height, fps, crf, name, onProgress }) {
    this.pauseAllMedia();
    this.isExporting = true;
    this.exportAbortCtrl = new AbortController();
    const signal = this.exportAbortCtrl.signal;

    // Immutable project snapshot so edits/state never corrupt export
    const snap = structuredClone({
      mainTrackId: this.state.mainTrackId,
      canvasWidth: this.state.canvasWidth,
      canvasHeight: this.state.canvasHeight,
      fps: this.state.fps,
      bgMode: this.state.bgMode,
      captionStyle: this.state.captionStyle,
      captionYPos: this.state.captionYPos,
      captionFontSize: this.state.captionFontSize,
      tracks: this.state.tracks,
      captions: this.state.captions,
      library: this.state.library,
    });

    // Preflight: block export if any active timeline clip references offline/missing media
    const missingClips = [];
    for (const tr of snap.tracks) {
      if (tr.type === 'audio' && tr.muted) continue;
      if (tr.hidden && tr.muted) continue;
      for (const c of tr.clips) {
        if (!c.mediaId) continue;
        const m = snap.library.find(x => x.id === c.mediaId);
        if (!m || m.missing || this.erroredMedia.has(c.mediaId)) {
          missingClips.push(c.name || c.mediaId);
        }
      }
    }
    if (missingClips.length > 0) {
      this.isExporting = false;
      throw new Error(`Cannot export: ${missingClips.length} offline clip(s) need relinking (${missingClips.slice(0, 3).join(', ')})`);
    }

    const rawDur = getSnapshotDuration(snap);
    const totalDur = Math.max(1 / fps, rawDur);
    const totalFrames = Math.max(1, Math.round(totalDur * fps));

    // Separate offscreen export canvas (never mutates live preview!)
    const expCanvas = document.createElement('canvas');
    expCanvas.width = width;
    expCanvas.height = height;
    const expCtx = expCanvas.getContext('2d', { willReadFrequently: false });

    const audioClips = [];
    for (const tr of snap.tracks) {
      if (tr.muted) continue;
      for (const c of tr.clips) {
        if (!c.mediaId || c.muted) continue;
        const m = snap.library.find(x => x.id === c.mediaId);
        if (!m || !m.hasAudio) continue;
        // Include A->B overlap crossfade matching preview on normal constant-speed clips with handle
        let fadeIn = c.fadeIn || 0;
        let fadeOut = c.fadeOut || 0;
        let expDuration = c.duration;
        const isRampedOrRev = Boolean(c.reverse) || (c.speedCurve && c.speedCurve !== 'none');
        if ((tr.type === 'video' || tr.type === 'overlay') && c.transIn && c.transIn !== 'none') {
          const prev = tr.clips.find(p => p.id !== c.id && Math.abs((p.start + p.duration) - c.start) <= 0.06);
          if (prev) fadeIn = Math.max(fadeIn, Math.min(c.transInDur || 0.5, c.duration * 0.5));
        }
        if ((tr.type === 'video' || tr.type === 'overlay') && !isRampedOrRev) {
          const next = tr.clips.find(n => n.id !== c.id && n.transIn && n.transIn !== 'none' && Math.abs((c.start + c.duration) - n.start) <= 0.06);
          if (next) {
            const td = Math.min(next.transInDur || 0.5, next.duration * 0.5);
            const availHandle = Math.max(0, (m.duration - ((c.trimStart || 0) + c.duration * (c.speed || 1))) / (c.speed || 1));
            const ext = Math.min(td, availHandle);
            if (ext > 0.02) {
              expDuration = c.duration + ext;
              fadeOut = Math.max(fadeOut, ext);
            } else {
              fadeOut = Math.max(fadeOut, td);
            }
          }
        }
        audioClips.push({
          mediaId: c.mediaId,
          start: c.start,
          duration: expDuration,
          trimStart: c.trimStart || 0,
          speed: c.speed || 1,
          speedCurve: c.speedCurve || 'none',
          curveStartU: c.curveStartU ?? 0,
          curveEndU: c.curveEndU ?? 1,
          reverse: Boolean(c.reverse),
          volume: c.volume ?? 1,
          volumeKeyframes: c.keyframes?.volume || [],
          fadeIn,
          fadeOut,
          eqBass: c.eqBass || 0,
          eqTreble: c.eqTreble || 0,
          voiceFx: c.voiceFx || 'none',
        });
      }
    }

    let jobId = null;
    try {
      const startRes = await fetch('/api/export-frames/start', {
        method: 'POST',
        headers: getApiTokenHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ width, height, fps, crf, name, totalDuration: totalDur, audioClips }),
        signal,
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed to start export job');
      jobId = startData.jobId;
      this.activeExportJobId = jobId;

      const t0 = performance.now();
      for (let f = 0; f < totalFrames; f++) {
        if (signal.aborted) throw new Error('Export cancelled');
        const t = Math.min(totalDur - 0.001, f / fps);
        await this.seekAllExact(snap, t);
        if (signal.aborted) throw new Error('Export cancelled');

        this.renderFrame(t, {
          snapshot: snap,
          targetCanvas: expCanvas,
          targetCtx: expCtx,
          renderW: width,
          renderH: height,
          hideGuides: true,
          isExport: true,
        });

        const blob = await new Promise(r => expCanvas.toBlob(r, 'image/jpeg', 0.94));
        if (!blob) throw new Error(`Failed to encode frame ${f}`);
        const pushRes = await fetch(`/api/export-frames/push/${jobId}`, {
          method: 'POST',
          headers: getApiTokenHeaders({ 'Content-Type': 'image/jpeg' }),
          body: blob,
          signal,
        });
        if (!pushRes.ok) {
          const errData = await pushRes.json().catch(() => ({}));
          throw new Error(errData.error || `Failed pushing frame ${f}`);
        }
        if (f % 2 === 0 || f === totalFrames - 1) {
          const elapsed = (performance.now() - t0) / 1000;
          const rate = (f + 1) / Math.max(0.05, elapsed);
          const etaSec = Math.max(0, Math.round((totalFrames - (f + 1)) / Math.max(0.1, rate)));
          onProgress?.(
            Math.round(((f + 1) / totalFrames) * 88),
            `Rendering frame ${f + 1}/${totalFrames} · ETA ${etaSec}s...`
          );
        }
      }

      onProgress?.(93, 'Encoding H.264 + mixing multi-track AAC audio...');
      const finRes = await fetch(`/api/export-frames/finish/${jobId}`, {
        method: 'POST',
        headers: getApiTokenHeaders(),
        signal,
      });
      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || 'FFmpeg finalization failed');
      this.activeExportJobId = null;
      onProgress?.(100, 'Export complete!');
      return finData;
    } catch (err) {
      if (jobId) {
        try {
          await fetch(`/api/export-frames/cancel/${jobId}`, {
            method: 'POST',
            headers: getApiTokenHeaders(),
          });
        } catch {}
      }
      this.activeExportJobId = null;
      throw err;
    } finally {
      this.isExporting = false;
      this.exportAbortCtrl = null;
    }
  }
}
