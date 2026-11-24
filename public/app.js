import {
  VideoEngine, LUT_FILTERS, EFFECT_PRESETS, TRANSITION_PRESETS,
  SPEED_CURVES, GRAPHICS_PRESETS, EASING_TYPES,
  evalKeyframe, getSourceTime, getClipSourceSpan, getSnapshotDuration,
} from './engine.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const AUTOSAVE_KEY = 'motioncut_autosave_v3';

function uid(prefix = 'c') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function apiHeaders(extra = {}) {
  return { 'X-MC-Token': window.__MC_TOKEN__ || '', ...extra };
}

function formatTC(sec, fps = 30) {
  const s = Math.max(0, Number(sec) || 0);
  const totalFrames = Math.round(s * fps);
  const ff = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const mins = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

function parseTC(input, fps = 30) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / fps;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

const state = {
  title: 'Untitled_Project',
  aspect: '16:9',
  canvasWidth: 1920,
  canvasHeight: 1080,
  fps: 30,
  bgMode: 'black',
  showGuides: false,
  playing: false,
  loop: true,
  masterMuted: false,
  currentTime: 0,
  zoom: 72,
  snap: true,
  magnetMain: true,
  linkedSelection: true,
  activeTool: 'select',
  mediaFilter: 'all',
  selectedMediaId: null,
  selectedClipId: null,
  selectedClipIds: new Set(),
  selectedCaptionId: null,
  activeInspectorTab: 'basic',
  transSide: 'in',
  captionStyle: 'hormozi',
  captionYPos: 80,
  captionFontSize: 56,
  copiedAttrs: null,
  copiedClips: null,
  exportMode: 'deterministic',
  library: [],
  waveforms: new Map(),
  markers: [],
  captions: [],
  tracks: [
    { id: 't_text1', name: 'Text T1', type: 'text', color: '#f09b3a', muted: false, hidden: false, locked: false, clips: [] },
    { id: 't_ov1', name: 'Overlay V2', type: 'overlay', color: '#7c5dfa', muted: false, hidden: false, locked: false, clips: [] },
    { id: 't_vid1', name: 'Main V1', type: 'video', color: '#3898d4', muted: false, hidden: false, locked: false, clips: [] },
    { id: 't_aud1', name: 'Audio A1', type: 'audio', color: '#1fc496', muted: false, hidden: false, locked: false, clips: [] },
  ],
  history: [],
  historyIdx: -1,
};

function quantize(t) {
  const fps = Math.max(1, state.fps || 30);
  return Math.max(0, Math.round(t * fps) / fps);
}

const TEXT_PRESETS = [
  { id: 'bold-hook', name: 'Viral Hook', text: 'THIS CHANGED EVERYTHING', color: '#ffffff', strokeColor: '#000000', strokeWidth: 10, bgColor: '#000000', bgAlpha: 0, fontSize: 84, fontWeight: '900', spacing: 1, animIn: 'pop', animOut: 'fade' },
  { id: 'pill-badge', name: 'CapCut Pill', text: 'NEW WORKFLOW', color: '#041315', strokeColor: '#000000', strokeWidth: 0, bgColor: '#00e5c3', bgAlpha: 0.96, fontSize: 58, fontWeight: '800', spacing: 2, animIn: 'slide-up', animOut: 'fade' },
  { id: 'cinema-sub', name: 'Cinema Title', text: 'MOTIONVIZ STUDIO', color: '#f4f0e6', strokeColor: '#000000', strokeWidth: 2, bgColor: '#000000', bgAlpha: 0, fontSize: 64, fontWeight: '700', spacing: 8, animIn: 'fade', animOut: 'fade' },
  { id: 'neon-cyber', name: 'Cyber Neon', text: 'BLENDER × FLORA', color: '#00e5c3', strokeColor: '#041315', strokeWidth: 8, bgColor: '#07141b', bgAlpha: 0.72, fontSize: 74, fontWeight: '900', spacing: 3, animIn: 'pop', animOut: 'zoom-out' },
  { id: 'subtitle-bar', name: 'Subtitle Box', text: 'Type your caption here', color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, bgColor: '#000000', bgAlpha: 0.76, fontSize: 48, fontWeight: '700', spacing: 0, animIn: 'fade', animOut: 'fade', y: 360 },
  { id: 'typewriter', name: 'Typewriter', text: 'LIVE CAPTURE // 01', color: '#ffb020', strokeColor: '#000000', strokeWidth: 4, bgColor: '#000000', bgAlpha: 0.5, fontSize: 54, fontWeight: '700', spacing: 2, animIn: 'typewriter', animOut: 'none' },
];

const SFX_PRESETS = [
  { id: 'whoosh', name: 'Fast Whoosh', dur: 0.55 },
  { id: 'boom', name: 'Cinema Boom', dur: 1.4 },
  { id: 'riser', name: 'Tension Riser', dur: 1.8 },
  { id: 'pop', name: 'UI Click Pop', dur: 0.16 },
  { id: 'shutter', name: 'Camera Shutter', dur: 0.22 },
  { id: 'glitch-zap', name: 'Glitch Zap', dur: 0.35 },
];

let toastTimer = null;
function showToast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function setSaveStatus(text, cls = '') {
  const el = $('#saveIndicator');
  if (!el) return;
  el.textContent = text;
  el.className = `save-ind ${cls}`.trim();
}

const engine = new VideoEngine(state, $('#previewCanvas'), $('#overlayCanvas'), {
  onMediaReady: () => { if (!state.playing && !engine.isExporting) renderNow(); },
  onMediaError: (media) => {
    showToast(`Media offline or unreadable: ${media.name}`, 3400);
    renderNow();
  },
});

function getProjectDuration() {
  return Math.max(0, getSnapshotDuration(state));
}

function getTimelineViewDuration() {
  return Math.max(12, getProjectDuration() + 6);
}

function renderNow() {
  if (engine.isExporting) return;
  engine.syncMediaForTime(state.currentTime, state.playing);
  engine.renderFrame(state.currentTime);
  const tcInput = $('#timecodeInput');
  if (document.activeElement !== tcInput) {
    tcInput.value = formatTC(state.currentTime, state.fps);
  }
  $('#durationDisplay').textContent = formatTC(getProjectDuration(), state.fps);
  updatePlayheadDOM();
}

function buildProjectPayload() {
  const manifest = {};
  for (const tr of state.tracks) {
    for (const c of tr.clips) {
      if (c.mediaId) {
        const m = state.library.find(x => x.id === c.mediaId);
        if (m) manifest[m.id] = { id: m.id, name: m.name, type: m.type, duration: m.duration };
      }
    }
  }
  return {
    version: 3,
    title: state.title,
    aspect: state.aspect,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    fps: state.fps,
    bgMode: state.bgMode,
    captionStyle: state.captionStyle,
    captionYPos: state.captionYPos,
    captionFontSize: state.captionFontSize,
    tracks: state.tracks,
    captions: state.captions,
    markers: state.markers,
    assetManifest: manifest,
  };
}

function snapshotHistory() {
  const payload = buildProjectPayload();
  const snap = JSON.stringify(payload);
  if (state.history[state.historyIdx] === snap) return;
  state.history = state.history.slice(0, state.historyIdx + 1);
  state.history.push(snap);
  if (state.history.length > 60) state.history.shift();
  state.historyIdx = state.history.length - 1;
  try {
    localStorage.setItem(AUTOSAVE_KEY, snap);
    setSaveStatus('Saved');
  } catch (err) {
    setSaveStatus('Storage Full', 'error');
    showToast('Browser localStorage full — use Save button to export .mcut.json');
  }
}

function applySnapshot(snapStr, checkRelink = false) {
  const d = JSON.parse(snapStr);
  state.title = d.title || 'Untitled_Project';
  state.aspect = d.aspect || '16:9';
  state.canvasWidth = d.canvasWidth || 1920;
  state.canvasHeight = d.canvasHeight || 1080;
  state.fps = Number(d.fps) || 30;
  state.bgMode = d.bgMode || 'black';
  state.captionStyle = d.captionStyle || 'hormozi';
  state.captionYPos = d.captionYPos ?? 80;
  state.captionFontSize = d.captionFontSize ?? 56;
  state.tracks = Array.isArray(d.tracks) && d.tracks.length ? d.tracks : makeEmptyTracks();
  state.captions = Array.isArray(d.captions) ? d.captions : [];
  state.markers = Array.isArray(d.markers) ? d.markers : [];
  state.selectedClipId = null;
  state.selectedClipIds.clear();
  state.selectedCaptionId = null;

  $('#projectTitle').value = state.title;
  $('#fpsSelect').value = String(state.fps);
  $('#capYPos').value = String(state.captionYPos);
  $('#capFontSize').value = String(state.captionFontSize);
  $$('#aspectGroup .aspect-btn').forEach(b => b.classList.toggle('active', b.dataset.ratio === state.aspect));
  $$('#captionStyleRow button').forEach(b => b.classList.toggle('active', b.dataset.cstyle === state.captionStyle));
  $$('.bg-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.bg === state.bgMode));
  updateCanvasResBadge();
  engine.pruneUnusedElements();
  renderTimeline();
  renderCaptionsUI();
  renderInspector();
  renderNow();

  if (checkRelink) checkMissingMediaAndPrompt(d.assetManifest || {});
}

function makeEmptyTracks() {
  return [
    { id: 't_text1', name: 'Text T1', type: 'text', color: '#f09b3a', muted: false, hidden: false, locked: false, clips: [] },
    { id: 't_ov1', name: 'Overlay V2', type: 'overlay', color: '#7c5dfa', muted: false, hidden: false, locked: false, clips: [] },
    { id: 't_vid1', name: 'Main V1', type: 'video', color: '#3898d4', muted: false, hidden: false, locked: false, clips: [] },
    { id: 't_aud1', name: 'Audio A1', type: 'audio', color: '#1fc496', muted: false, hidden: false, locked: false, clips: [] },
  ];
}

function undo() {
  if (state.historyIdx <= 0) return showToast('Nothing to undo');
  state.historyIdx--;
  applySnapshot(state.history[state.historyIdx]);
  try { localStorage.setItem(AUTOSAVE_KEY, state.history[state.historyIdx]); } catch {}
  showToast('Undo');
}
function redo() {
  if (state.historyIdx >= state.history.length - 1) return showToast('Nothing to redo');
  state.historyIdx++;
  applySnapshot(state.history[state.historyIdx]);
  try { localStorage.setItem(AUTOSAVE_KEY, state.history[state.historyIdx]); } catch {}
  showToast('Redo');
}

function findClipAndTrack(id) {
  for (const tr of state.tracks) {
    const c = tr.clips.find(x => x.id === id);
    if (c) return { clip: c, track: tr };
  }
  return null;
}

function getSelectedClips() {
  const list = [];
  for (const id of state.selectedClipIds) {
    const found = findClipAndTrack(id);
    if (found) list.push(found);
  }
  if (!list.length && state.selectedClipId) {
    const found = findClipAndTrack(state.selectedClipId);
    if (found) list.push(found);
  }
  return list;
}

function selectSingleClip(clipId, addToSelection = false) {
  state.selectedCaptionId = null;
  if (!addToSelection) state.selectedClipIds.clear();
  if (clipId) {
    state.selectedClipId = clipId;
    state.selectedClipIds.add(clipId);
    // Include linked partner if linked selection is enabled
    if (state.linkedSelection) {
      const f = findClipAndTrack(clipId);
      if (f?.clip.linkGroupId) {
        for (const tr of state.tracks) {
          for (const c of tr.clips) {
            if (c.linkGroupId === f.clip.linkGroupId) state.selectedClipIds.add(c.id);
          }
        }
      }
    }
  } else {
    state.selectedClipId = null;
  }
}

function isTrackLocked(track) {
  return Boolean(track && track.locked);
}

function isClipLocked(clipId) {
  const f = findClipAndTrack(clipId);
  return Boolean(f && f.track.locked);
}

function createDefaultClip(overrides) {
  return {
    id: uid('clip'),
    mediaId: null,
    name: 'Clip',
    type: 'video',
    start: 0,
    duration: 4,
    trimStart: 0,
    sourceDuration: 4,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
    flipH: false, flipV: false,
    fitMode: 'contain',
    blendMode: 'source-over',
    mask: { type: 'none', x: 0.5, y: 0.5, scale: 0.48, rotation: 0, feather: 0, invert: false },
    chromaKey: { enabled: false, color: '#00ff00', strength: 0.36, feather: 0.14 },
    cropRect: null,
    speed: 1,
    speedCurve: 'none',
    reverse: false,
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0, eqBass: 0, eqTreble: 0, voiceFx: 'none',
    filter: 'none', brightness: 0, contrast: 0, saturation: 0, temperature: 0, blur: 0,
    effects: [],
    effectIntensity: {},
    transIn: 'none', transInDur: 0.5,
    transOut: 'none', transOutDur: 0.5,
    text: '', subText: '', fontSize: 72, fontWeight: '900', align: 'center', spacing: 0,
    color: '#ffffff', strokeColor: '#000000', strokeWidth: 4, bgColor: '#000000', bgAlpha: 0,
    shadowBlur: 0, shadowColor: '#000000', maxWidth: 0,
    animIn: 'pop', animOut: 'none',
    graphicKind: null,
    linkGroupId: null,
    audioDetached: false,
    keyframes: {},
    ...overrides,
  };
}

/** Prevent overlaps on a track (or return next non-overlapping start) */
function hasOverlap(track, start, duration, ignoreIds = new Set()) {
  const end = start + duration;
  for (const c of track.clips) {
    if (ignoreIds.has(c.id)) continue;
    if (start < c.start + c.duration - 0.002 && end > c.start + 0.002) return true;
  }
  return false;
}

function resolveNonOverlappingStart(track, desiredStart, duration, ignoreIds = new Set()) {
  let s = quantize(Math.max(0, desiredStart));
  const others = track.clips.filter(c => !ignoreIds.has(c.id)).sort((a, b) => a.start - b.start);
  for (const o of others) {
    if (s < o.start + o.duration - 0.002 && s + duration > o.start + 0.002) {
      // Push cleanly after the blocking clip
      s = quantize(o.start + o.duration);
    }
  }
  return s;
}

/** Magnetic Main Track: close gaps on Main V1 sequentially */
function compactMainTrackIfMagnetic() {
  if (!state.magnetMain) return;
  const main = state.tracks.find(tr => tr.type === 'video');
  if (!main || main.locked) return;
  main.clips.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const c of main.clips) {
    const delta = quantize(cursor - c.start);
    if (Math.abs(delta) > 0.001) {
      c.start = quantize(cursor);
      // Keep linked audio in sync with main track magnet!
      if (c.linkGroupId) {
        for (const tr of state.tracks) {
          if (tr.id === main.id || tr.locked) continue;
          for (const partner of tr.clips) {
            if (partner.linkGroupId === c.linkGroupId) {
              partner.start = quantize(Math.max(0, partner.start + delta));
            }
          }
        }
      }
    }
    cursor = c.start + c.duration;
  }
}

function findOrCreateFreeTrack(preferredType, start, duration) {
  const candidates = state.tracks.filter(t => t.type === preferredType && !t.locked);
  for (const tr of candidates) {
    if (!hasOverlap(tr, start, duration)) return tr;
  }
  // Auto-create a new unlocked track of that type so clips never stack invisibly!
  const count = state.tracks.filter(t => t.type === preferredType).length + 1;
  const colors = { video: '#3898d4', overlay: '#7c5dfa', text: '#f09b3a', audio: '#1fc496' };
  const labels = { video: `Video V${count}`, overlay: `Overlay V${count + 1}`, text: `Text T${count}`, audio: `Audio A${count}` };
  const newTr = {
    id: uid('tr'),
    name: labels[preferredType] || `Track ${count}`,
    type: preferredType,
    color: colors[preferredType] || '#7c5dfa',
    muted: false, hidden: false, locked: false, clips: [],
  };
  if (preferredType === 'audio') state.tracks.push(newTr);
  else state.tracks.unshift(newTr);
  return newTr;
}

function addMediaToTimeline(media, targetTrackId = null, dropTime = null) {
  let track = targetTrackId ? state.tracks.find(t => t.id === targetTrackId) : null;
  if (track && track.locked) {
    showToast(`Track "${track.name}" is locked`);
    return null;
  }
  const desiredType = media.type === 'audio' ? 'audio' : (media.type === 'image' ? 'overlay' : 'video');
  if (track) {
    const compat = (desiredType === 'audio' && track.type === 'audio') ||
      (desiredType !== 'audio' && (track.type === 'video' || track.type === 'overlay'));
    if (!compat) track = null;
  }

  let start;
  const dur = quantize(Math.max(0.2, media.duration || 5));
  if (!track) {
    if (desiredType === 'video') {
      track = state.tracks.find(t => t.type === 'video' && !t.locked) || findOrCreateFreeTrack('video', 0, dur);
      start = dropTime !== null ? quantize(dropTime) : quantize(track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
    } else {
      start = dropTime !== null ? quantize(dropTime) : quantize(state.currentTime);
      track = findOrCreateFreeTrack(desiredType, start, dur);
    }
  } else {
    start = dropTime !== null ? quantize(dropTime) : quantize(track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
  }

  if (hasOverlap(track, start, dur)) {
    start = resolveNonOverlappingStart(track, start, dur);
  }

  const clip = createDefaultClip({
    mediaId: media.id,
    name: media.name,
    type: media.type,
    start,
    duration: dur,
    sourceDuration: media.duration || 5,
    fitMode: (media.width === state.canvasWidth && media.height === state.canvasHeight) ? 'contain' : 'cover',
  });
  track.clips.push(clip);
  compactMainTrackIfMagnetic();
  selectSingleClip(clip.id);
  snapshotHistory();
  if (media.hasAudio && !state.waveforms.has(media.id)) fetchWaveform(media.id);
  renderTimeline();
  renderInspector();
  renderNow();
  return clip;
}

function addTextClip(preset = TEXT_PRESETS[0]) {
  const start = quantize(state.currentTime);
  const dur = 3.0;
  const tr = findOrCreateFreeTrack('text', start, dur);
  const clip = createDefaultClip({
    name: preset.name,
    type: 'text',
    start,
    duration: dur,
    sourceDuration: 60,
    text: preset.text,
    color: preset.color,
    strokeColor: preset.strokeColor,
    strokeWidth: preset.strokeWidth,
    bgColor: preset.bgColor,
    bgAlpha: preset.bgAlpha,
    fontSize: preset.fontSize,
    fontWeight: preset.fontWeight || '900',
    spacing: preset.spacing || 0,
    animIn: preset.animIn,
    animOut: preset.animOut || 'none',
    y: preset.y || 0,
  });
  tr.clips.push(clip);
  selectSingleClip(clip.id);
  state.activeInspectorTab = 'text';
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast(`Added "${preset.name}" on ${tr.name}`);
}

function addGraphicClip(preset) {
  const start = quantize(state.currentTime);
  const dur = 4.0;
  const tr = findOrCreateFreeTrack('overlay', start, dur);
  const clip = createDefaultClip({
    name: preset.name,
    type: 'graphic',
    graphicKind: preset.id,
    start,
    duration: dur,
    sourceDuration: 60,
    x: preset.id === 'rec-badge' ? -state.canvasWidth * 0.34 : 0,
    y: preset.id === 'rec-badge' ? -state.canvasHeight * 0.38 : (preset.id === 'progress-bar' ? state.canvasHeight * 0.44 : (preset.id === 'lower-third' ? state.canvasHeight * 0.32 : 0)),
    text: 'MOTIONVIZ STUDIO',
    subText: 'AI WORKFLOWS & VFX',
  });
  tr.clips.push(clip);
  selectSingleClip(clip.id);
  state.activeInspectorTab = 'basic';
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast(`Added "${preset.name}"`);
}

async function fetchWaveform(mediaId) {
  try {
    const r = await fetch(`/api/waveform/${mediaId}?bins=200`);
    if (!r.ok) return;
    const data = await r.json();
    state.waveforms.set(mediaId, data);
    renderTimeline();
  } catch {}
}

/** Synthesize WAV bytes & persist to server via /api/upload so SFX survive reload AND export cleanly! */
async function addProceduralSfx(preset) {
  const sr = 44100;
  const n = Math.floor(sr * preset.dur);
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const wStr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wStr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wStr(8, 'WAVE');
  wStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wStr(36, 'data'); dv.setUint32(40, n * 2, true);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = t / preset.dur;
    let s = 0;
    if (preset.id === 'whoosh') s = (Math.random() * 2 - 1) * Math.sin(u * Math.PI) * Math.sin(2 * Math.PI * (220 + 900 * u) * t) * 0.7;
    else if (preset.id === 'boom') s = Math.sin(2 * Math.PI * (110 * Math.exp(-3 * u) + 32) * t) * Math.exp(-2.8 * u) * 0.92;
    else if (preset.id === 'riser') s = Math.sin(2 * Math.PI * (120 + 1800 * u * u) * t) * Math.pow(u, 1.5) * 0.65;
    else if (preset.id === 'pop') s = Math.sin(2 * Math.PI * (760 * Math.exp(-10 * u) + 180) * t) * Math.exp(-16 * u) * 0.88;
    else if (preset.id === 'shutter') s = ((Math.random() * 2 - 1) * Math.exp(-28 * u) + (u > 0.4 ? (Math.random() * 2 - 1) * Math.exp(-32 * (u - 0.4)) : 0)) * 0.78;
    else if (preset.id === 'glitch-zap') s = (Math.sign(Math.sin(2 * Math.PI * (420 + 900 * Math.sin(u * 40)) * t)) * 0.5) * (1 - u);
    dv.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.floor(s * 32767))), true);
  }

  showToast(`Generating ${preset.name}...`);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: apiHeaders({
        'X-Filename': encodeURIComponent(`SFX_${preset.id}.wav`),
        'X-Source-Tag': 'sfx',
      }),
      body: new Blob([buf], { type: 'audio/wav' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'SFX save failed');
    if (!state.library.find(m => m.id === data.item.id)) state.library.push(data.item);
    renderMediaLibrary();
    addMediaToTimeline(data.item, null, state.currentTime);
    showToast(`Added export-ready SFX: ${preset.name}`);
  } catch (err) {
    showToast(`SFX error: ${err.message}`);
  }
}

// ── PLAYBACK LOOP (Smooth 60fps + VU Meter) ─────────────────────────────────
let rafId = null;
let lastFrameTs = 0;

function tick(ts) {
  if (!state.playing) return;
  if (!lastFrameTs) lastFrameTs = ts;
  const dt = Math.min(0.05, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;
  state.currentTime += dt;
  const maxDur = getProjectDuration();
  if (maxDur > 0 && state.currentTime >= maxDur) {
    if (state.loop) state.currentTime = 0;
    else { state.currentTime = maxDur; togglePlay(false); return; }
  }
  renderNow();
  const [vl, vr] = engine.getVULevels();
  $('#vuL').style.width = `${Math.round(vl * 100)}%`;
  $('#vuR').style.width = `${Math.round(vr * 100)}%`;
  rafId = requestAnimationFrame(tick);
}

function togglePlay(forceState = null) {
  const next = forceState !== null ? forceState : !state.playing;
  state.playing = next;
  $('#btnPlayPause').textContent = next ? '❚❚' : '▶';
  if (next) {
    engine.ensureAudioCtx();
    lastFrameTs = 0;
    rafId = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(rafId);
    engine.pauseAllMedia();
    $('#vuL').style.width = '0%';
    $('#vuR').style.width = '0%';
    renderNow();
  }
}

// ── TIMELINE RENDERING (Source-Aligned Filmstrips, Sliced Waveforms, Caption Lane, Draggable KFs) ──
function updatePlayheadDOM() {
  $('#playhead').style.left = `${state.currentTime * state.zoom}px`;
}

function drawRuler() {
  const canvas = $('#rulerCanvas');
  const totalSec = getTimelineViewDuration();
  const width = Math.max($('#timelineScroll').clientWidth, Math.ceil(totalSec * state.zoom));
  canvas.width = width;
  canvas.height = 28;
  $('#timelineWrap').style.width = `${width}px`;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, 28);
  ctx.fillStyle = '#12141a';
  ctx.fillRect(0, 0, width, 28);

  const step = state.zoom >= 150 ? 0.5 : (state.zoom >= 80 ? 1 : (state.zoom >= 40 ? 2 : 5));
  const subDivs = state.zoom >= 150 ? Math.min(state.fps, 10) : 5;
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b93a7';
  ctx.strokeStyle = '#343b4d';

  for (let s = 0; s <= totalSec; s += step) {
    const x = Math.round(s * state.zoom) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, 28); ctx.stroke();
    ctx.fillText(formatTC(s, state.fps), x + 4, 11);
    for (let k = 1; k < subDivs; k++) {
      const mx = Math.round((s + (step * k) / subDivs) * state.zoom) + 0.5;
      ctx.beginPath(); ctx.moveTo(mx, 21); ctx.lineTo(mx, 28); ctx.stroke();
    }
  }

  const mLayer = $('#markerLayer');
  mLayer.innerHTML = '';
  state.markers.forEach((mSec, idx) => {
    const mk = document.createElement('div');
    mk.className = 'beat-marker';
    mk.style.left = `${mSec * state.zoom}px`;
    mk.title = `Marker ${formatTC(mSec, state.fps)} (Click: jump · Right-click: remove)`;
    mk.addEventListener('click', (e) => { e.stopPropagation(); state.currentTime = quantize(mSec); renderNow(); });
    mk.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      state.markers.splice(idx, 1);
      snapshotHistory();
      drawRuler();
      showToast('Marker removed');
    });
    mLayer.appendChild(mk);
  });
}

function renderTimeline() {
  drawRuler();
  const hdrList = $('#trackHeaderList');
  const tracksEl = $('#tracksContainer');
  hdrList.innerHTML = '';
  tracksEl.innerHTML = '';

  state.tracks.forEach((tr) => {
    const h = document.createElement('div');
    h.className = 'track-header';
    const canDelete = state.tracks.filter(x => x.type === tr.type).length > 1 || (tr.type !== 'video' && tr.type !== 'audio');
    h.innerHTML = `
      <div class="track-name" title="${escHtml(tr.name)}">
        <span class="track-dot" style="background:${escHtml(tr.color)}"></span>
        <span>${escHtml(tr.name)}</span>
      </div>
      <div class="track-ctrls">
        <button class="track-ctrl ${tr.muted ? 'on' : ''}" data-act="mute" title="Mute Track">M</button>
        <button class="track-ctrl ${tr.hidden ? 'on' : ''}" data-act="hide" title="Hide Track">👁</button>
        <button class="track-ctrl ${tr.locked ? 'on' : ''}" data-act="lock" title="Lock Track">🔒</button>
        ${canDelete ? `<button class="track-ctrl" data-act="delTrack" title="Delete Track">✕</button>` : ''}
      </div>`;
    h.querySelector('[data-act="mute"]').onclick = () => { tr.muted = !tr.muted; snapshotHistory(); renderTimeline(); renderNow(); };
    h.querySelector('[data-act="hide"]').onclick = () => { tr.hidden = !tr.hidden; snapshotHistory(); renderTimeline(); renderNow(); };
    h.querySelector('[data-act="lock"]').onclick = () => { tr.locked = !tr.locked; snapshotHistory(); renderTimeline(); renderInspector(); };
    const delBtn = h.querySelector('[data-act="delTrack"]');
    if (delBtn) {
      delBtn.onclick = () => {
        if (tr.locked) return showToast('Unlock track before deleting');
        state.tracks = state.tracks.filter(x => x.id !== tr.id);
        snapshotHistory();
        renderTimeline();
        renderInspector();
        renderNow();
      };
    }
    hdrList.appendChild(h);

    const lane = document.createElement('div');
    lane.className = `track-lane ${tr.locked ? 'locked-lane' : ''}`;
    lane.dataset.trackId = tr.id;

    // Drag-and-drop Media from Library -> Timeline
    lane.addEventListener('dragover', (e) => {
      if (tr.locked) return;
      e.preventDefault();
      lane.classList.add('drop-target');
    });
    lane.addEventListener('dragleave', () => lane.classList.remove('drop-target'));
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('drop-target');
      if (tr.locked) return showToast(`Track "${tr.name}" is locked`);
      const mediaId = e.dataTransfer.getData('text/motioncut-media-id');
      if (!mediaId) return;
      const media = state.library.find(m => m.id === mediaId);
      if (!media) return;
      const rect = lane.getBoundingClientRect();
      const dropSec = Math.max(0, (e.clientX - rect.left) / state.zoom);
      addMediaToTimeline(media, tr.id, dropSec);
    });

    const sortedClips = [...tr.clips].sort((a, b) => a.start - b.start);
    sortedClips.forEach((clip) => {
      const el = document.createElement('div');
      const isSelected = state.selectedClipIds.has(clip.id) || clip.id === state.selectedClipId;
      const isMissing = clip.mediaId && (!state.library.some(m => m.id === clip.mediaId) || engine.erroredMedia.has(clip.mediaId));
      el.className = `tl-clip type-${clip.type} ${isSelected ? 'selected' : ''} ${isMissing ? 'missing-clip' : ''}`;
      el.dataset.clipId = clip.id;
      const clipW = Math.max(14, clip.duration * state.zoom);
      el.style.left = `${clip.start * state.zoom}px`;
      el.style.width = `${clipW}px`;

      // Source-aligned filmstrip background!
      const media = clip.mediaId ? state.library.find(m => m.id === clip.mediaId) : null;
      if (media && media.filmstripUrl && clip.type === 'video') {
        const fsDiv = document.createElement('div');
        fsDiv.className = 'clip-filmstrip';
        const srcDur = Math.max(0.2, media.duration || clip.sourceDuration || 5);
        const span = getClipSourceSpan(clip);
        const fullPx = Math.max(clipW, (srcDur / Math.max(0.05, span)) * clipW);
        const offsetPx = ((clip.trimStart || 0) / srcDur) * fullPx;
        fsDiv.style.backgroundImage = `url('${media.filmstripUrl}')`;
        fsDiv.style.backgroundSize = `${Math.round(fullPx)}px 100%`;
        fsDiv.style.backgroundPosition = `${-Math.round(offsetPx)}px 0px`;
        el.appendChild(fsDiv);
      }

      // Source-aligned & trimmed waveform!
      const wf = clip.mediaId ? state.waveforms.get(clip.mediaId) : null;
      if (wf && wf.peaks && wf.peaks.length && (clip.type === 'audio' || clip.type === 'video')) {
        const wCan = document.createElement('canvas');
        wCan.className = 'clip-wave';
        wCan.width = Math.max(30, Math.min(1800, Math.round(clipW)));
        wCan.height = 22;
        const wctx = wCan.getContext('2d');
        wctx.fillStyle = clip.type === 'audio' ? 'rgba(0, 229, 195, 0.78)' : 'rgba(130, 214, 255, 0.56)';
        const srcDur = Math.max(0.1, media?.duration || clip.sourceDuration || clip.duration);
        const span = getClipSourceSpan(clip);
        const startRatio = Math.max(0, Math.min(1, (clip.trimStart || 0) / srcDur));
        const endRatio = Math.max(startRatio + 0.005, Math.min(1, ((clip.trimStart || 0) + span) / srcDur));
        const i0 = Math.floor(startRatio * wf.peaks.length);
        const i1 = Math.max(i0 + 1, Math.ceil(endRatio * wf.peaks.length));
        let slice = wf.peaks.slice(i0, i1);
        if (clip.reverse) slice = slice.reverse();
        const barW = wCan.width / Math.max(1, slice.length);
        slice.forEach((pk, i) => {
          const bh = Math.max(2, pk * 20);
          wctx.fillRect(i * barW, 22 - bh, Math.max(1, barW - 0.5), bh);
        });
        el.appendChild(wCan);
      }

      const badges = [];
      if (isMissing) badges.push('<span class="clip-badge warn">OFFLINE</span>');
      if (clip.speed !== 1 || (clip.speedCurve && clip.speedCurve !== 'none')) {
        badges.push(`<span class="clip-badge">${clip.speedCurve !== 'none' ? escHtml(clip.speedCurve) : `${clip.speed.toFixed(1)}×`}</span>`);
      }
      if (clip.reverse) badges.push('<span class="clip-badge">REV</span>');
      if (clip.linkGroupId) badges.push('<span class="clip-badge">🔗</span>');
      if (clip.effects?.length) badges.push(`<span class="clip-badge">FX×${clip.effects.length}</span>`);
      if (clip.mask?.type && clip.mask.type !== 'none') badges.push('<span class="clip-badge">MASK</span>');

      const lblBar = document.createElement('div');
      lblBar.className = 'clip-label-bar';
      lblBar.innerHTML = `<span class="clip-label">${escHtml(clip.type === 'text' ? (clip.text || clip.name) : clip.name)}</span><span class="clip-badges">${badges.join('')}</span>`;
      el.appendChild(lblBar);

      // A->B transition badge at cut junction
      if (clip.transIn && clip.transIn !== 'none') {
        const tp = document.createElement('div');
        tp.className = 'clip-trans-pill';
        tp.title = `Transition In: ${clip.transIn} (${clip.transInDur}s)`;
        tp.textContent = '⇄';
        el.appendChild(tp);
      }

      // Draggable keyframe diamonds
      const kfMap = new Map();
      for (const [prop, list] of Object.entries(clip.keyframes || {})) {
        for (const k of list) {
          const rk = Math.round(k.t * state.fps);
          if (!kfMap.has(rk)) kfMap.set(rk, []);
          kfMap.get(rk).push({ prop, kf: k });
        }
      }
      for (const [, entries] of kfMap.entries()) {
        const kt = entries[0].kf.t;
        const d = document.createElement('div');
        d.className = 'kf-diamond';
        d.style.left = `${kt * state.zoom}px`;
        d.title = `Keyframe @ ${formatTC(kt, state.fps)} (${entries.map(e => e.prop).join(', ')}) — Drag to retime`;
        d.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (tr.locked) return showToast('Track is locked');
          const startX = e.clientX;
          const origT = kt;
          const onMove = (ev) => {
            const nt = quantize(Math.max(0, Math.min(clip.duration, origT + (ev.clientX - startX) / state.zoom)));
            for (const entry of entries) entry.kf.t = nt;
            d.style.left = `${nt * state.zoom}px`;
            state.currentTime = quantize(clip.start + nt);
            renderNow();
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            snapshotHistory();
            renderTimeline();
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
        el.appendChild(d);
      }

      const hL = document.createElement('div'); hL.className = 'trim-handle left';
      const hR = document.createElement('div'); hR.className = 'trim-handle right';
      el.appendChild(hL); el.appendChild(hR);

      attachClipInteractions(el, clip, tr, hL, hR);
      lane.appendChild(el);
    });

    tracksEl.appendChild(lane);
  });

  // ── DEDICATED CAPTION LANE ON TIMELINE ───────────────────────────────────
  const capHdr = document.createElement('div');
  capHdr.className = 'track-header caption-hdr';
  capHdr.innerHTML = `<div class="track-name"><span class="track-dot" style="background:#e066e6"></span><span>Captions CC</span></div>
    <div class="track-ctrls"><button class="track-ctrl" id="btnQuickAddCap" title="Add Caption Line at Playhead">+</button></div>`;
  capHdr.querySelector('#btnQuickAddCap').onclick = addCaptionAtPlayhead;
  hdrList.appendChild(capHdr);

  const capLane = document.createElement('div');
  capLane.className = 'track-lane caption-lane';
  capLane.dataset.trackId = '__captions__';
  state.captions.forEach((cap) => {
    const cel = document.createElement('div');
    cel.className = `tl-clip caption-clip ${state.selectedCaptionId === cap.id ? 'selected' : ''}`;
    cel.style.left = `${cap.start * state.zoom}px`;
    cel.style.width = `${Math.max(14, (cap.end - cap.start) * state.zoom)}px`;
    cel.innerHTML = `<div class="clip-label-bar"><span class="clip-label">${escHtml(cap.text)}</span></div>
      <div class="trim-handle left"></div><div class="trim-handle right"></div>`;
    attachCaptionClipInteractions(cel, cap);
    capLane.appendChild(cel);
  });
  tracksEl.appendChild(capLane);

  updatePlayheadDOM();
}

function getSnapPoints(excludeClipIds = new Set()) {
  const pts = [0, state.currentTime, ...state.markers];
  for (const tr of state.tracks) {
    for (const c of tr.clips) {
      if (excludeClipIds.has(c.id)) continue;
      pts.push(c.start, c.start + c.duration);
    }
  }
  for (const cap of state.captions) pts.push(cap.start, cap.end);
  return pts;
}

function snapBothEdges(rawStart, duration, excludeIds) {
  if (!state.snap) { $('#snapGuide').classList.add('hidden'); return quantize(rawStart); }
  const thresh = 9 / state.zoom;
  const pts = getSnapPoints(excludeIds);
  let bestStart = quantize(rawStart);
  let bestDist = thresh;
  let guideAt = null;
  for (const p of pts) {
    const dStart = Math.abs(rawStart - p);
    if (dStart < bestDist) { bestDist = dStart; bestStart = p; guideAt = p; }
    const dEnd = Math.abs((rawStart + duration) - p);
    if (dEnd < bestDist) { bestDist = dEnd; bestStart = p - duration; guideAt = p; }
  }
  const sg = $('#snapGuide');
  if (guideAt !== null) {
    sg.style.left = `${guideAt * state.zoom}px`;
    sg.classList.remove('hidden');
  } else {
    sg.classList.add('hidden');
  }
  return quantize(Math.max(0, bestStart));
}

function showDragHud(pxLeft, pxTop, text) {
  const hud = $('#dragHud');
  hud.textContent = text;
  hud.style.left = `${Math.max(4, pxLeft)}px`;
  hud.style.top = `${Math.max(30, pxTop)}px`;
  hud.classList.remove('hidden');
}
function hideDragHud() { $('#dragHud').classList.add('hidden'); }

function attachCaptionClipInteractions(cel, cap) {
  const hL = cel.querySelector('.trim-handle.left');
  const hR = cel.querySelector('.trim-handle.right');

  cel.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    state.selectedCaptionId = cap.id;
    state.selectedClipId = null;
    state.selectedClipIds.clear();
    const startX = e.clientX;
    const origStart = cap.start;
    const origEnd = cap.end;
    const dur = origEnd - origStart;
    const mode = e.target === hL ? 'trimL' : (e.target === hR ? 'trimR' : 'move');

    const onMove = (ev) => {
      const dt = (ev.clientX - startX) / state.zoom;
      if (mode === 'move') {
        cap.start = quantize(Math.max(0, origStart + dt));
        cap.end = quantize(cap.start + dur);
      } else if (mode === 'trimL') {
        cap.start = quantize(Math.max(0, Math.min(origEnd - 0.15, origStart + dt)));
      } else {
        cap.end = quantize(Math.max(origStart + 0.15, origEnd + dt));
      }
      cel.style.left = `${cap.start * state.zoom}px`;
      cel.style.width = `${Math.max(14, (cap.end - cap.start) * state.zoom)}px`;
      showDragHud(cap.start * state.zoom, cel.parentElement.offsetTop, `${formatTC(cap.start, state.fps)} – ${formatTC(cap.end, state.fps)}`);
      renderNow();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      hideDragHud();
      snapshotHistory();
      renderTimeline();
      renderCaptionsUI();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function attachClipInteractions(el, clip, track, hL, hR) {
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.selectedClipIds.has(clip.id)) selectSingleClip(clip.id);
    renderTimeline();
    renderInspector();
    openContextMenu(e.clientX, e.clientY);
  });

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // Razor Blade tool respects track lock!
    if (state.activeTool === 'razor') {
      if (track.locked) return showToast(`Track "${track.name}" is locked`);
      const rect = el.parentElement.getBoundingClientRect();
      const clickSec = quantize(Math.max(0, (e.clientX - rect.left) / state.zoom));
      selectSingleClip(clip.id);
      splitClipAt(clip, track, clickSec);
      return;
    }

    if (e.shiftKey) {
      if (state.selectedClipIds.has(clip.id)) state.selectedClipIds.delete(clip.id);
      else { state.selectedClipIds.add(clip.id); state.selectedClipId = clip.id; }
      renderTimeline();
      renderInspector();
      return;
    }

    if (!state.selectedClipIds.has(clip.id)) {
      selectSingleClip(clip.id);
      $$('.tl-clip').forEach(node => node.classList.toggle('selected', state.selectedClipIds.has(node.dataset.clipId)));
      renderInspector();
      renderNow();
    }

    if (track.locked) return showToast(`Track "${track.name}" is locked`);

    const startX = e.clientX;
    const mode = e.target === hL ? 'trimL' : (e.target === hR ? 'trimR' : 'move');
    const selectedEntries = getSelectedClips().filter(x => !x.track.locked);
    const excludeIds = new Set(selectedEntries.map(x => x.clip.id));
    const initMap = new Map(selectedEntries.map(x => [x.clip.id, {
      clip: x.clip,
      track: x.track,
      el: $(`.tl-clip[data-clip-id="${x.clip.id}"]`),
      start: x.clip.start,
      duration: x.clip.duration,
      trimStart: x.clip.trimStart || 0,
      keyframes: structuredClone(x.clip.keyframes || {}),
    }]));

    let moved = false;
    const scrollBox = $('#timelineScroll');

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const dt = dx / state.zoom;

      // Drag-edge autoscroll
      const sRect = scrollBox.getBoundingClientRect();
      if (ev.clientX > sRect.right - 36) scrollBox.scrollLeft += 14;
      else if (ev.clientX < sRect.left + 36) scrollBox.scrollLeft = Math.max(0, scrollBox.scrollLeft - 14);

      if (mode === 'move') {
        const primary = initMap.get(clip.id);
        const snappedStart = snapBothEdges(Math.max(0, primary.start + dt), primary.duration, excludeIds);
        const appliedDt = snappedStart - primary.start;
        for (const item of initMap.values()) {
          item.clip.start = quantize(Math.max(0, item.start + appliedDt));
          if (item.el) item.el.style.left = `${item.clip.start * state.zoom}px`;
        }
        showDragHud(clip.start * state.zoom, el.parentElement.offsetTop, `${formatTC(clip.start, state.fps)} (${initMap.size > 1 ? `${initMap.size} clips` : `${clip.duration.toFixed(2)}s`})`);
      } else if (mode === 'trimL') {
        const orig = initMap.get(clip.id);
        const maxTrim = orig.duration - 0.12;
        let delta = Math.max(-orig.trimStart / (clip.speed || 1), Math.min(maxTrim, dt));
        const snappedStart = snapBothEdges(Math.max(0, orig.start + delta), orig.duration - delta, excludeIds);
        delta = snappedStart - orig.start;
        delta = Math.max(-orig.trimStart / (clip.speed || 1), Math.min(maxTrim, delta));
        clip.start = quantize(orig.start + delta);
        clip.duration = quantize(orig.duration - delta);
        clip.trimStart = Math.max(0, orig.trimStart + delta * (clip.speed || 1));
        // Rebase keyframes smoothly on left-trim!
        const rebased = {};
        for (const [prop, list] of Object.entries(orig.keyframes)) {
          const shifted = list.map(k => ({ ...k, t: quantize(k.t - delta) })).filter(k => k.t >= 0 && k.t <= clip.duration);
          if (shifted.length) rebased[prop] = shifted;
        }
        clip.keyframes = rebased;
        el.style.left = `${clip.start * state.zoom}px`;
        el.style.width = `${Math.max(14, clip.duration * state.zoom)}px`;
        showDragHud(clip.start * state.zoom, el.parentElement.offsetTop, `In ${formatTC(clip.start, state.fps)} · Dur ${clip.duration.toFixed(2)}s`);
      } else if (mode === 'trimR') {
        const orig = initMap.get(clip.id);
        const maxDur = (clip.type === 'text' || clip.type === 'image' || clip.type === 'graphic')
          ? 300 : Math.max(0.2, (clip.sourceDuration - (clip.trimStart || 0)) / (clip.speed || 1));
        let nextDur = quantize(Math.max(0.12, Math.min(maxDur, orig.duration + dt)));
        if (state.snap) {
          const snappedEnd = snapBothEdges(orig.start + nextDur, 0, excludeIds);
          if (Math.abs(snappedEnd - (orig.start + nextDur)) < 9 / state.zoom) {
            nextDur = quantize(Math.max(0.12, Math.min(maxDur, snappedEnd - orig.start)));
          }
        }
        clip.duration = nextDur;
        el.style.width = `${Math.max(14, clip.duration * state.zoom)}px`;
        showDragHud((clip.start + clip.duration) * state.zoom, el.parentElement.offsetTop, `Out ${formatTC(clip.start + clip.duration, state.fps)} · Dur ${clip.duration.toFixed(2)}s`);
      }
      renderNow();
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      $('#snapGuide').classList.add('hidden');
      hideDragHud();
      if (moved) {
        if (mode === 'move') {
          // Resolve accidental same-track overlaps cleanly
          for (const item of initMap.values()) {
            const others = new Set(item.track.clips.filter(c => excludeIds.has(c.id)).map(c => c.id));
            if (hasOverlap(item.track, item.clip.start, item.clip.duration, others)) {
              item.clip.start = resolveNonOverlappingStart(item.track, item.clip.start, item.clip.duration, others);
            }
          }
        }
        compactMainTrackIfMagnetic();
        snapshotHistory();
        renderTimeline();
        renderInspector();
        renderNow();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ── CONTEXT MENU ────────────────────────────────────────────────────────────
function openContextMenu(x, y) {
  const m = $('#clipContextMenu');
  m.style.left = `${Math.min(window.innerWidth - 220, x)}px`;
  m.style.top = `${Math.min(window.innerHeight - 310, y)}px`;
  m.classList.remove('hidden');
}
function closeContextMenu() { $('#clipContextMenu').classList.add('hidden'); }
window.addEventListener('click', closeContextMenu);
$('#clipContextMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  closeContextMenu();
  const act = btn.dataset.act;
  if (act === 'split') splitSelectedClip();
  else if (act === 'duplicate') duplicateSelectedClip();
  else if (act === 'copyClip') copySelectedClips();
  else if (act === 'copyAttrs') copyClipAttrs();
  else if (act === 'pasteAttrs') pasteClipAttrs();
  else if (act === 'autoCrop') runAutoCrop();
  else if (act === 'freeze') freezeFrameAtPlayhead();
  else if (act === 'detach') detachAudioFromSelected();
  else if (act === 'unlink') unlinkSelectedClips();
  else if (act === 'rippleDelete') deleteSelectedClips(true);
  else if (act === 'delete') deleteSelectedClips(false);
});

// ── EDITING OPERATIONS (100% LOCK-ENFORCED + KEYFRAME/SOURCE CONTINUITY) ────
function splitClipAt(clip, track, splitTime) {
  if (track.locked) return showToast(`Track "${track.name}" is locked`);
  const t = quantize(splitTime);
  if (t <= clip.start + 0.06 || t >= clip.start + clip.duration - 0.06) {
    return showToast('Move playhead inside the selected clip to split');
  }
  const leftDur = quantize(t - clip.start);
  const rightDur = quantize(clip.duration - leftDur);
  const media = clip.mediaId ? state.library.find(m => m.id === clip.mediaId) : null;
  const srcAtCut = getSourceTime(clip, leftDur, media?.duration || clip.sourceDuration);

  // Partition & shift keyframes cleanly across the split!
  const leftKf = {};
  const rightKf = {};
  for (const [prop, list] of Object.entries(clip.keyframes || {})) {
    const lList = list.filter(k => k.t <= leftDur + 0.001).map(k => ({ ...k }));
    const rList = list.filter(k => k.t >= leftDur - 0.001).map(k => ({ ...k, t: quantize(Math.max(0, k.t - leftDur)) }));
    if (lList.length) leftKf[prop] = lList;
    if (rList.length) rightKf[prop] = rList;
  }

  const rightClip = structuredClone(clip);
  rightClip.id = uid('clip');
  rightClip.start = t;
  rightClip.duration = rightDur;
  rightClip.keyframes = rightKf;
  rightClip.transIn = 'none';
  rightClip.linkGroupId = null;

  if (clip.reverse) {
    // Reversed clip plays backwards from (trimStart + totalSpan) down to trimStart:
    // Left half covers [srcAtCut .. trimStart + totalSpan], Right half covers [trimStart .. srcAtCut]
    const origTrim = clip.trimStart || 0;
    clip.trimStart = Math.max(0, srcAtCut);
    rightClip.trimStart = Math.max(0, origTrim);
  } else {
    rightClip.trimStart = Math.max(0, srcAtCut);
  }
  // If clip had a speed ramp, bake constant equivalent speed on split halves so curve doesn't replay from 0!
  if (clip.speedCurve && clip.speedCurve !== 'none') {
    const totalSpan = getClipSourceSpan(clip);
    const leftSpan = Math.max(0.05, srcAtCut - (clip.trimStart || 0));
    const rightSpan = Math.max(0.05, totalSpan - leftSpan);
    clip.speed = Math.round((leftSpan / Math.max(0.05, leftDur)) * 100) / 100;
    rightClip.speed = Math.round((rightSpan / Math.max(0.05, rightDur)) * 100) / 100;
    clip.speedCurve = 'none';
    rightClip.speedCurve = 'none';
  }

  clip.duration = leftDur;
  clip.keyframes = leftKf;
  clip.transOut = 'none';
  track.clips.push(rightClip);

  // Split linked partner clip if present and unlocked
  if (clip.linkGroupId && state.linkedSelection) {
    for (const tr of state.tracks) {
      if (tr.id === track.id || tr.locked) continue;
      const partner = tr.clips.find(p => p.linkGroupId === clip.linkGroupId && t > p.start + 0.06 && t < p.start + p.duration - 0.06);
      if (partner) {
        const pRight = structuredClone(partner);
        pRight.id = uid('clip');
        const pLeftDur = quantize(t - partner.start);
        pRight.start = t;
        pRight.duration = quantize(partner.duration - pLeftDur);
        pRight.trimStart = getSourceTime(partner, pLeftDur, partner.sourceDuration);
        const newLink = uid('lnk');
        rightClip.linkGroupId = newLink;
        pRight.linkGroupId = newLink;
        partner.duration = pLeftDur;
        tr.clips.push(pRight);
      }
    }
  }

  selectSingleClip(rightClip.id);
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast('Split clip (keyframes & source preserved)');
}

function splitSelectedClip() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f) return showToast('Select a clip to split');
  splitClipAt(f.clip, f.track, state.currentTime);
}

function duplicateSelectedClip() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f) return showToast('Select a clip to duplicate');
  if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
  const copy = structuredClone(f.clip);
  copy.id = uid('clip');
  copy.linkGroupId = null;
  copy.start = resolveNonOverlappingStart(f.track, f.clip.start + f.clip.duration, copy.duration);
  f.track.clips.push(copy);
  compactMainTrackIfMagnetic();
  selectSingleClip(copy.id);
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast('Duplicated clip');
}

function copySelectedClips() {
  const sel = getSelectedClips();
  if (!sel.length) return showToast('Select clip(s) to copy');
  const minStart = Math.min(...sel.map(x => x.clip.start));
  state.copiedClips = sel.map(x => ({
    trackType: x.track.type,
    relStart: x.clip.start - minStart,
    clip: structuredClone(x.clip),
  }));
  showToast(`Copied ${sel.length} clip(s)`);
}

function pasteCopiedClips() {
  if (!state.copiedClips?.length) return showToast('Clipboard empty');
  state.selectedClipIds.clear();
  for (const item of state.copiedClips) {
    const c = structuredClone(item.clip);
    c.id = uid('clip');
    c.linkGroupId = null;
    const desiredStart = quantize(state.currentTime + item.relStart);
    const tr = findOrCreateFreeTrack(item.trackType, desiredStart, c.duration);
    c.start = resolveNonOverlappingStart(tr, desiredStart, c.duration);
    tr.clips.push(c);
    state.selectedClipIds.add(c.id);
    state.selectedClipId = c.id;
  }
  compactMainTrackIfMagnetic();
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast(`Pasted ${state.copiedClips.length} clip(s) at playhead`);
}

function copyClipAttrs() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f) return;
  const c = f.clip;
  state.copiedAttrs = structuredClone({
    x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, opacity: c.opacity,
    fitMode: c.fitMode, blendMode: c.blendMode, filter: c.filter,
    brightness: c.brightness, contrast: c.contrast, saturation: c.saturation,
    temperature: c.temperature, blur: c.blur, effects: c.effects, effectIntensity: c.effectIntensity,
    mask: c.mask,
  });
  showToast('Copied clip style, color & FX');
}

function pasteClipAttrs() {
  if (!state.copiedAttrs) return showToast('No copied attributes');
  const sel = getSelectedClips().filter(x => !x.track.locked);
  if (!sel.length) return showToast('Select an unlocked clip first');
  for (const { clip } of sel) Object.assign(clip, structuredClone(state.copiedAttrs));
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast(`Pasted attributes to ${sel.length} clip(s)`);
}

function unlinkSelectedClips() {
  const sel = getSelectedClips().filter(x => !x.track.locked);
  for (const { clip } of sel) clip.linkGroupId = null;
  snapshotHistory();
  renderTimeline();
  showToast('Unlinked selected clips');
}

function deleteSelectedClips(ripple = false) {
  if (state.selectedCaptionId) {
    state.captions = state.captions.filter(c => c.id !== state.selectedCaptionId);
    state.selectedCaptionId = null;
    snapshotHistory();
    renderTimeline();
    renderCaptionsUI();
    renderNow();
    return showToast('Deleted caption');
  }
  const sel = getSelectedClips();
  if (!sel.length) return;
  const unlocked = sel.filter(x => !x.track.locked);
  if (!unlocked.length) return showToast('Selected track(s) are locked');

  // If ripple delete on a single clip or main track, shift subsequent clips, captions & markers cleanly
  let ripplePivot = null;
  let rippleGap = 0;
  if (ripple) {
    const mainTarget = unlocked.find(x => x.track.type === 'video') || unlocked[0];
    ripplePivot = mainTarget.clip.start + mainTarget.clip.duration;
    rippleGap = mainTarget.clip.duration;
  }

  for (const { clip, track } of unlocked) {
    track.clips = track.clips.filter(c => c.id !== clip.id);
    if (ripple && track.type !== 'video') {
      for (const c of track.clips) {
        if (c.start >= clip.start + clip.duration - 0.01) {
          c.start = quantize(Math.max(0, c.start - clip.duration));
        }
      }
    }
  }

  if (ripple && ripplePivot !== null) {
    for (const tr of state.tracks) {
      if (tr.locked) continue;
      if (tr.type === 'video' || state.linkedSelection) {
        for (const c of tr.clips) {
          if (c.start >= ripplePivot - 0.01) c.start = quantize(Math.max(0, c.start - rippleGap));
        }
      }
    }
    for (const cap of state.captions) {
      if (cap.start >= ripplePivot - 0.01) {
        cap.start = quantize(Math.max(0, cap.start - rippleGap));
        cap.end = quantize(Math.max(cap.start + 0.1, cap.end - rippleGap));
      }
    }
    state.markers = state.markers.map(m => m >= ripplePivot - 0.01 ? quantize(Math.max(0, m - rippleGap)) : m);
  }

  compactMainTrackIfMagnetic();
  state.selectedClipId = null;
  state.selectedClipIds.clear();
  engine.pruneUnusedElements();
  snapshotHistory();
  renderTimeline();
  renderCaptionsUI();
  renderInspector();
  renderNow();
  showToast(ripple ? 'Ripple deleted (timeline & captions shifted)' : `Deleted ${unlocked.length} clip(s)`);
}

async function freezeFrameAtPlayhead() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f || (f.clip.type !== 'video' && f.clip.type !== 'image')) {
    return showToast('Select a video clip to freeze frame');
  }
  if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
  if (state.currentTime < f.clip.start || state.currentTime >= f.clip.start + f.clip.duration) {
    return showToast('Move playhead inside the selected clip first');
  }
  showToast('Capturing isolated freeze frame...');
  try {
    const blob = await engine.captureIsolatedClipBlob(f.clip, state.currentTime);
    if (!blob) throw new Error('Could not capture frame');
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: apiHeaders({
        'X-Filename': encodeURIComponent(`Freeze_${f.clip.name.replace(/\.[^.]+$/, '')}_${Date.now()}.png`),
        'X-Source-Tag': 'freeze',
      }),
      body: blob,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Freeze upload failed');
    state.library.push(data.item);
    renderMediaLibrary();

    const freezeDur = 2.0;
    const freezeClip = createDefaultClip({
      mediaId: data.item.id,
      name: `Freeze · ${f.clip.name}`,
      type: 'image',
      start: quantize(state.currentTime),
      duration: freezeDur,
      sourceDuration: freezeDur,
      fitMode: 'contain',
    });

    // Insert cleanly on an unlocked overlay track or split main track
    const ov = findOrCreateFreeTrack('overlay', freezeClip.start, freezeClip.duration);
    ov.clips.push(freezeClip);
    selectSingleClip(freezeClip.id);
    snapshotHistory();
    renderTimeline();
    renderInspector();
    renderNow();
    showToast('Added isolated 2s Freeze Frame (persisted & export-ready)');
  } catch (err) {
    showToast(`Freeze failed: ${err.message}`);
  }
}

function detachAudioFromSelected() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f || f.clip.type !== 'video') return showToast('Select a video clip with audio');
  if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
  if (f.clip.audioDetached) return showToast('Audio is already detached from this clip');
  const m = state.library.find(x => x.id === f.clip.mediaId);
  if (!m || !m.hasAudio) return showToast('Selected video has no audio track');

  const audTr = findOrCreateFreeTrack('audio', f.clip.start, f.clip.duration);
  const linkId = f.clip.linkGroupId || uid('lnk');
  f.clip.linkGroupId = linkId;
  f.clip.audioDetached = true;

  const audClip = createDefaultClip({
    mediaId: m.id,
    name: `${m.name} (Audio)`,
    type: 'audio',
    start: f.clip.start,
    duration: f.clip.duration,
    trimStart: f.clip.trimStart,
    sourceDuration: f.clip.sourceDuration,
    speed: f.clip.speed,
    speedCurve: f.clip.speedCurve,
    reverse: f.clip.reverse,
    volume: f.clip.volume,
    fadeIn: f.clip.fadeIn,
    fadeOut: f.clip.fadeOut,
    eqBass: f.clip.eqBass,
    eqTreble: f.clip.eqTreble,
    voiceFx: f.clip.voiceFx,
    linkGroupId: linkId,
    keyframes: f.clip.keyframes?.volume ? { volume: structuredClone(f.clip.keyframes.volume) } : {},
  });
  f.clip.muted = true;
  audTr.clips.push(audClip);
  selectSingleClip(audClip.id);
  snapshotHistory();
  renderTimeline();
  renderInspector();
  renderNow();
  showToast('Audio detached & linked (mix settings preserved)');
}

// ── CONTEXT-AWARE INSPECTOR WITH NUMERIC INPUTS + EASING + KEYFRAME STEPPER ──
function getAllowedTabsForClip(clip) {
  if (!clip) return ['basic', 'mask', 'audio', 'speed', 'color', 'text'];
  if (clip.type === 'audio') return ['audio', 'speed'];
  if (clip.type === 'text') return ['basic', 'text'];
  if (clip.type === 'graphic') return ['basic'];
  if (clip.type === 'image') return ['basic', 'mask', 'color'];
  return ['basic', 'mask', 'audio', 'speed', 'color'];
}

function propSliderRow(label, id, val, min, max, step, unit = '', kfProp = null, clip = null, disabled = false) {
  const localT = clip ? quantize(Math.max(0, state.currentTime - clip.start)) : 0;
  const kfs = kfProp && clip ? (clip.keyframes?.[kfProp] || []) : [];
  const tol = 1 / Math.max(15, state.fps);
  const hasKfHere = kfs.some(k => Math.abs(k.t - localT) <= tol);
  const disAttr = disabled ? 'disabled' : '';
  const kfControls = kfProp ? `
    <button class="kf-nav-btn" data-kf-prev="${kfProp}" title="Prev Keyframe" ${disAttr}>◂</button>
    <button class="kf-btn ${hasKfHere ? 'has-kf' : ''}" data-kf="${kfProp}" title="Toggle Keyframe at Playhead" ${disAttr}>◆</button>
    <button class="kf-nav-btn" data-kf-next="${kfProp}" title="Next Keyframe" ${disAttr}>▸</button>` : '';
  const dispVal = Number.isInteger(step) ? Math.round(val) : Number(val).toFixed(step < 0.1 ? 2 : 1);
  return `
    <div class="prop-row">
      <div class="prop-head">
        <span>${escHtml(label)}</span>
        <div class="prop-val-group">
          ${kfControls}
          <input class="prop-num-in" id="${id}_num" type="number" min="${min}" max="${max}" step="${step}" value="${dispVal}" ${disAttr} />
          ${unit ? `<span class="prop-unit">${escHtml(unit)}</span>` : ''}
        </div>
      </div>
      <input class="prop-slider" id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" ${disAttr} />
    </div>`;
}

function bindSliderAndNumber(id, onVal, onCommit = () => snapshotHistory()) {
  const sl = $(`#${id}`);
  const num = $(`#${id}_num`);
  if (!sl) return;
  sl.oninput = () => {
    const v = Number(sl.value);
    if (num) num.value = sl.step.includes('.') ? v.toFixed(sl.step.split('.')[1].length) : Math.round(v);
    onVal(v);
  };
  sl.onchange = () => { sl.blur(); onCommit(); };
  sl.addEventListener('pointerup', () => sl.blur());
  if (num) {
    num.onchange = () => {
      const clamped = Math.max(Number(sl.min), Math.min(Number(sl.max), Number(num.value) || 0));
      sl.value = clamped;
      num.value = sl.step.includes('.') ? clamped.toFixed(sl.step.split('.')[1].length) : Math.round(clamped);
      onVal(clamped);
      onCommit();
      num.blur();
    };
  }
}

/** Lightweight in-place update of transform numeric fields during canvas drag (zero DOM rebuild!) */
function syncTransformInputsInPlace(clip) {
  const localT = Math.max(0, state.currentTime - clip.start);
  const map = {
    slScale: Math.round(evalKeyframe(clip, 'scale', localT, clip.scale) * 100),
    slX: Math.round(evalKeyframe(clip, 'x', localT, clip.x)),
    slY: Math.round(evalKeyframe(clip, 'y', localT, clip.y)),
    slRot: Math.round(evalKeyframe(clip, 'rotation', localT, clip.rotation)),
  };
  for (const [id, v] of Object.entries(map)) {
    const sl = $(`#${id}`);
    const num = $(`#${id}_num`);
    if (sl) sl.value = v;
    if (num) num.value = v;
  }
}

function renderInspector() {
  const body = $('#inspectorBody');
  const f = findClipAndTrack(state.selectedClipId);
  const allowed = getAllowedTabsForClip(f?.clip);
  $$('#inspectorTabs .insp-tab').forEach(btn => {
    const ok = allowed.includes(btn.dataset.itab);
    btn.classList.toggle('disabled-tab', !ok);
  });
  if (f && !allowed.includes(state.activeInspectorTab)) {
    state.activeInspectorTab = allowed[0];
  }
  $$('#inspectorTabs .insp-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.itab === state.activeInspectorTab));

  if (!f) {
    body.innerHTML = `<div class="empty-inspector"><div class="empty-icon">◆</div><p>Select a clip on the timeline or click directly on the player to inspect properties, masks, chroma key, keyframes, speed, color, audio, or text.</p></div>`;
    return;
  }

  const { clip, track } = f;
  const locked = Boolean(track.locked);
  const tab = state.activeInspectorTab;
  const localT = quantize(Math.max(0, state.currentTime - clip.start));
  const dis = locked ? 'disabled' : '';
  const lockBanner = locked ? `<div class="locked-banner">🔒 Track "${escHtml(track.name)}" is locked. Unlock to edit.</div>` : '';

  if (tab === 'basic') {
    const curScale = Math.round(evalKeyframe(clip, 'scale', localT, clip.scale) * 100);
    const curX = Math.round(evalKeyframe(clip, 'x', localT, clip.x));
    const curY = Math.round(evalKeyframe(clip, 'y', localT, clip.y));
    const curRot = Math.round(evalKeyframe(clip, 'rotation', localT, clip.rotation));
    const curOp = Math.round(evalKeyframe(clip, 'opacity', localT, clip.opacity) * 100);
    const curEase = clip.defaultEase || 'easeInOut';

    body.innerHTML = `${lockBanner}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Transform &amp; Keyframes</span><button id="btnResetTransform" class="btn-micro" ${dis}>Reset</button></div>
        ${clip.type === 'video' || clip.type === 'image' ? `
        <div class="prop-row">
          <div class="prop-head"><span>Aspect Fit</span></div>
          <select id="selFitMode" class="prop-select" ${dis}>
            <option value="cover" ${clip.fitMode === 'cover' ? 'selected' : ''}>Cover (Fill Frame)</option>
            <option value="contain" ${clip.fitMode === 'contain' ? 'selected' : ''}>Contain (Fit Full)</option>
            <option value="stretch" ${clip.fitMode === 'stretch' ? 'selected' : ''}>Stretch</option>
          </select>
        </div>` : ''}
        <div class="prop-row">
          <div class="prop-head"><span>Blend Mode</span></div>
          <select id="selBlendMode" class="prop-select" ${dis}>
            ${['source-over', 'screen', 'multiply', 'overlay', 'lighten', 'darken', 'difference'].map(m =>
              `<option value="${m}" ${clip.blendMode === m ? 'selected' : ''}>${m === 'source-over' ? 'Normal' : m}</option>`
            ).join('')}
          </select>
        </div>
        <div class="prop-row">
          <div class="prop-head"><span>Keyframe Easing</span></div>
          <select id="selKfEase" class="prop-select" ${dis}>
            ${EASING_TYPES.map(e => `<option value="${e.id}" ${curEase === e.id ? 'selected' : ''}>${e.label}</option>`).join('')}
          </select>
        </div>
        ${propSliderRow('Scale', 'slScale', curScale, 10, 350, 1, '%', 'scale', clip, locked)}
        ${propSliderRow('Position X', 'slX', curX, -1920, 1920, 1, 'px', 'x', clip, locked)}
        ${propSliderRow('Position Y', 'slY', curY, -1920, 1920, 1, 'px', 'y', clip, locked)}
        ${propSliderRow('Rotation', 'slRot', curRot, -180, 180, 1, '°', 'rotation', clip, locked)}
        ${propSliderRow('Opacity', 'slOp', curOp, 0, 100, 1, '%', 'opacity', clip, locked)}
        <div class="row-2">
          <button id="btnFlipH" class="btn-mini ${clip.flipH ? 'active' : ''}" ${dis}>⇄ Flip H</button>
          <button id="btnFlipV" class="btn-mini ${clip.flipV ? 'active' : ''}" ${dis}>⇅ Flip V</button>
        </div>
      </div>
      ${clip.type === 'graphic' && clip.graphicKind === 'lower-third' ? `
      <div class="insp-section">
        <div class="insp-sec-head"><span>Lower Third Labels</span></div>
        <input id="gTitle" class="prop-input" value="${escHtml(clip.text)}" placeholder="Speaker Name" ${dis} />
        <input id="gSub" class="prop-input" value="${escHtml(clip.subText)}" placeholder="Subtitle" ${dis} />
      </div>` : ''}
      ${clip.type === 'video' || clip.type === 'image' ? `
      <div class="insp-section">
        <div class="insp-sec-head"><span>Chroma Key (Green Screen)</span></div>
        <div class="row-2">
          <button id="btnToggleChroma" class="btn-mini ${clip.chromaKey?.enabled ? 'active' : ''}" ${dis}>${clip.chromaKey?.enabled ? '✓ Key Enabled' : 'Enable Chroma Key'}</button>
          <input id="colChroma" type="color" value="${escHtml(clip.chromaKey?.color || '#00ff00')}" ${dis} />
        </div>
        ${propSliderRow('Tolerance', 'slChromaStr', Math.round((clip.chromaKey?.strength ?? 0.36) * 100), 5, 85, 1, '%', null, null, locked)}
        ${propSliderRow('Edge Feather', 'slChromaFea', Math.round((clip.chromaKey?.feather ?? 0.14) * 100), 0, 60, 1, '%', null, null, locked)}
      </div>` : ''}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Transition Durations</span></div>
        ${propSliderRow(`Intro (${clip.transIn})`, 'slTransInDur', clip.transInDur || 0.5, 0.1, 2.0, 0.05, 's', null, null, locked)}
        ${propSliderRow(`Outro (${clip.transOut})`, 'slTransOutDur', clip.transOutDur || 0.5, 0.1, 2.0, 0.05, 's', null, null, locked)}
      </div>`;

    if (locked) return;

    const setOrKey = (prop, value) => {
      const kfs = clip.keyframes?.[prop];
      if (kfs && kfs.length > 0) {
        const tol = 1 / Math.max(15, state.fps);
        const ex = kfs.find(k => Math.abs(k.t - localT) <= tol);
        if (ex) ex.v = value;
        else kfs.push({ t: localT, v: value, ease: clip.defaultEase || 'easeInOut' });
      } else {
        clip[prop] = value;
      }
      renderNow();
    };

    if ($('#selFitMode')) $('#selFitMode').onchange = (e) => { clip.fitMode = e.target.value; snapshotHistory(); renderNow(); };
    $('#selBlendMode').onchange = (e) => { clip.blendMode = e.target.value; snapshotHistory(); renderNow(); };
    $('#selKfEase').onchange = (e) => {
      clip.defaultEase = e.target.value;
      for (const list of Object.values(clip.keyframes || {})) {
        for (const k of list) {
          if (Math.abs(k.t - localT) <= 1 / Math.max(15, state.fps)) k.ease = e.target.value;
        }
      }
      snapshotHistory();
      renderNow();
    };
    bindSliderAndNumber('slScale', v => setOrKey('scale', v / 100));
    bindSliderAndNumber('slX', v => setOrKey('x', v));
    bindSliderAndNumber('slY', v => setOrKey('y', v));
    bindSliderAndNumber('slRot', v => setOrKey('rotation', v));
    bindSliderAndNumber('slOp', v => setOrKey('opacity', v / 100));
    bindSliderAndNumber('slTransInDur', v => { clip.transInDur = v; renderNow(); });
    bindSliderAndNumber('slTransOutDur', v => { clip.transOutDur = v; renderNow(); });
    $('#btnFlipH').onclick = () => { clip.flipH = !clip.flipH; snapshotHistory(); renderInspector(); renderNow(); };
    $('#btnFlipV').onclick = () => { clip.flipV = !clip.flipV; snapshotHistory(); renderInspector(); renderNow(); };
    $('#btnResetTransform').onclick = () => {
      Object.assign(clip, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false, cropRect: null, blendMode: 'source-over', keyframes: {} });
      snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
    };
    if ($('#btnToggleChroma')) {
      $('#btnToggleChroma').onclick = () => { clip.chromaKey.enabled = !clip.chromaKey.enabled; snapshotHistory(); renderInspector(); renderNow(); };
      $('#colChroma').oninput = (e) => { clip.chromaKey.color = e.target.value; renderNow(); };
      $('#colChroma').onchange = () => snapshotHistory();
      bindSliderAndNumber('slChromaStr', v => { clip.chromaKey.strength = v / 100; renderNow(); });
      bindSliderAndNumber('slChromaFea', v => { clip.chromaKey.feather = v / 100; renderNow(); });
    }
    if ($('#gTitle')) {
      $('#gTitle').oninput = (e) => { clip.text = e.target.value; renderNow(); };
      $('#gTitle').onchange = () => snapshotHistory();
      $('#gSub').oninput = (e) => { clip.subText = e.target.value; renderNow(); };
      $('#gSub').onchange = () => snapshotHistory();
    }
    wireKeyframeButtons(body, clip, localT);
  } else if (tab === 'mask') {
    const m = clip.mask || (clip.mask = { type: 'none', x: 0.5, y: 0.5, scale: 0.48, rotation: 0, feather: 0, invert: false });
    const mx = Math.round(evalKeyframe(clip, 'maskX', localT, m.x) * 100);
    const my = Math.round(evalKeyframe(clip, 'maskY', localT, m.y) * 100);
    const ms = Math.round(evalKeyframe(clip, 'maskScale', localT, m.scale) * 100);
    body.innerHTML = `${lockBanner}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Feathered Shape Mask</span></div>
        <div class="preset-grid" id="maskTypeGrid">
          ${[['none', 'None'], ['split', 'Split Screen'], ['circle', 'Circle'], ['rect', 'Rectangle'], ['mirror', 'Horizontal Strip']].map(([id, nm]) =>
            `<button class="preset-card ${m.type === id ? 'active' : ''}" data-mtype="${id}" ${dis}><div class="preset-label">${nm}</div></button>`
          ).join('')}
        </div>
        ${propSliderRow('Mask Center X', 'slMX', mx, 0, 100, 1, '%', 'maskX', clip, locked)}
        ${propSliderRow('Mask Center Y', 'slMY', my, 0, 100, 1, '%', 'maskY', clip, locked)}
        ${propSliderRow('Mask Size', 'slMS', ms, 5, 130, 1, '%', 'maskScale', clip, locked)}
        ${propSliderRow('Mask Feather', 'slMFea', m.feather || 0, 0, 80, 1, 'px', null, null, locked)}
        ${propSliderRow('Mask Rotation', 'slMR', m.rotation || 0, -180, 180, 1, '°', null, null, locked)}
        <button id="btnMaskInvert" class="btn-mini ${m.invert ? 'active' : ''}" ${dis}>${m.invert ? '✓ Inverted Mask' : 'Invert Mask'}</button>
      </div>`;
    if (locked) return;
    $$('#maskTypeGrid button').forEach(b => { b.onclick = () => { m.type = b.dataset.mtype; snapshotHistory(); renderTimeline(); renderInspector(); renderNow(); }; });
    const setMaskKey = (kfProp, field, val) => {
      const kfs = clip.keyframes?.[kfProp];
      if (kfs && kfs.length > 0) {
        const ex = kfs.find(k => Math.abs(k.t - localT) <= 1 / Math.max(15, state.fps));
        if (ex) ex.v = val; else kfs.push({ t: localT, v: val, ease: clip.defaultEase || 'easeInOut' });
      } else m[field] = val;
      renderNow();
    };
    bindSliderAndNumber('slMX', v => setMaskKey('maskX', 'x', v / 100));
    bindSliderAndNumber('slMY', v => setMaskKey('maskY', 'y', v / 100));
    bindSliderAndNumber('slMS', v => setMaskKey('maskScale', 'scale', v / 100));
    bindSliderAndNumber('slMFea', v => { m.feather = v; renderNow(); });
    bindSliderAndNumber('slMR', v => { m.rotation = v; renderNow(); });
    $('#btnMaskInvert').onclick = () => { m.invert = !m.invert; snapshotHistory(); renderInspector(); renderNow(); };
    wireKeyframeButtons(body, clip, localT);
  } else if (tab === 'audio') {
    const curVol = Math.round(evalKeyframe(clip, 'volume', localT, clip.volume ?? 1) * 100);
    body.innerHTML = `${lockBanner}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Audio Mixer &amp; Keyframes</span><button id="btnClipMute" class="btn-micro ${clip.muted ? 'active' : ''}" ${dis}>${clip.muted ? 'Muted' : 'Mute'}</button></div>
        ${propSliderRow('Volume', 'slVol', curVol, 0, 200, 1, '%', 'volume', clip, locked)}
        ${propSliderRow('Fade In', 'slFadeIn', clip.fadeIn || 0, 0, 5, 0.1, 's', null, null, locked)}
        ${propSliderRow('Fade Out', 'slFadeOut', clip.fadeOut || 0, 0, 5, 0.1, 's', null, null, locked)}
      </div>
      <div class="insp-section">
        <div class="insp-sec-head"><span>EQ &amp; Voice FX (Export-Synced)</span></div>
        ${propSliderRow('Bass EQ', 'slBass', clip.eqBass || 0, -15, 15, 1, 'dB', null, null, locked)}
        ${propSliderRow('Treble EQ', 'slTreble', clip.eqTreble || 0, -15, 15, 1, 'dB', null, null, locked)}
        <div class="prop-row">
          <div class="prop-head"><span>Voice Effect</span></div>
          <select id="selVoiceFx" class="prop-select" ${dis}>
            <option value="none" ${clip.voiceFx === 'none' ? 'selected' : ''}>Natural</option>
            <option value="radio" ${clip.voiceFx === 'radio' ? 'selected' : ''}>Lo-Fi Radio Bandpass</option>
            <option value="deep" ${clip.voiceFx === 'deep' ? 'selected' : ''}>Deep Voice</option>
            <option value="chipmunk" ${clip.voiceFx === 'chipmunk' ? 'selected' : ''}>High Pitch</option>
            <option value="echo" ${clip.voiceFx === 'echo' ? 'selected' : ''}>Studio Echo</option>
          </select>
        </div>
      </div>`;
    if (locked) return;
    $('#btnClipMute').onclick = () => { clip.muted = !clip.muted; snapshotHistory(); renderInspector(); renderNow(); };
    bindSliderAndNumber('slVol', v => {
      const kfs = clip.keyframes?.volume;
      if (kfs && kfs.length > 0) {
        const ex = kfs.find(k => Math.abs(k.t - localT) <= 1 / Math.max(15, state.fps));
        if (ex) ex.v = v / 100; else kfs.push({ t: localT, v: v / 100, ease: clip.defaultEase || 'easeInOut' });
      } else clip.volume = v / 100;
      renderNow();
    });
    bindSliderAndNumber('slFadeIn', v => { clip.fadeIn = v; });
    bindSliderAndNumber('slFadeOut', v => { clip.fadeOut = v; });
    bindSliderAndNumber('slBass', v => { clip.eqBass = v; renderNow(); });
    bindSliderAndNumber('slTreble', v => { clip.eqTreble = v; renderNow(); });
    $('#selVoiceFx').onchange = (e) => { clip.voiceFx = e.target.value; snapshotHistory(); renderNow(); };
    wireKeyframeButtons(body, clip, localT);
  } else if (tab === 'speed') {
    body.innerHTML = `${lockBanner}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Speed &amp; Ramping Curves</span></div>
        ${propSliderRow('Base Speed', 'slSpeed', clip.speed || 1, 0.25, 4, 0.05, '×', null, null, locked)}
        <div class="speed-pills">
          ${[0.25, 0.5, 1, 1.5, 2].map(v => `<button class="speed-pill ${Math.abs((clip.speed || 1) - v) < 0.02 ? 'active' : ''}" data-sp="${v}" ${dis}>${v}×</button>`).join('')}
        </div>
        <div class="prop-row">
          <div class="prop-head"><span>CapCut Speed Ramp Curve (Audio-Synced Export)</span></div>
          <select id="selSpeedCurve" class="prop-select" ${dis}>
            ${Object.entries(SPEED_CURVES).map(([k, v]) => `<option value="${k}" ${(clip.speedCurve || 'none') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <button id="btnReverseClip" class="btn-mini ${clip.reverse ? 'active' : ''}" ${dis}>${clip.reverse ? '✓ Reverse Active (Video + Audio)' : '◀ Reverse Clip'}</button>
      </div>`;
    if (locked) return;
    const applySpeed = (sp) => {
      const oldSpan = getClipSourceSpan(clip);
      clip.speed = Math.max(0.25, Math.min(4, sp));
      // Preserve source range: expand when slowing down (up to available media), shrink when speeding up!
      const availSrc = Math.max(0.2, (clip.sourceDuration || oldSpan) - (clip.trimStart || 0));
      const desiredSrc = Math.min(availSrc, oldSpan);
      clip.duration = quantize(Math.max(0.15, desiredSrc / clip.speed));
      compactMainTrackIfMagnetic();
      renderTimeline();
      renderNow();
    };
    bindSliderAndNumber('slSpeed', v => applySpeed(v), () => { snapshotHistory(); renderInspector(); });
    $$('.speed-pill').forEach(p => { p.onclick = () => { applySpeed(Number(p.dataset.sp)); snapshotHistory(); renderInspector(); }; });
    $('#selSpeedCurve').onchange = (e) => { clip.speedCurve = e.target.value; snapshotHistory(); renderTimeline(); renderNow(); };
    $('#btnReverseClip').onclick = () => { clip.reverse = !clip.reverse; snapshotHistory(); renderTimeline(); renderInspector(); renderNow(); };
  } else if (tab === 'color') {
    body.innerHTML = `${lockBanner}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Color Grading</span><button id="btnResetColor" class="btn-micro" ${dis}>Reset</button></div>
        ${propSliderRow('Brightness', 'slBright', clip.brightness || 0, -60, 60, 1, '', null, null, locked)}
        ${propSliderRow('Contrast', 'slCont', clip.contrast || 0, -60, 80, 1, '', null, null, locked)}
        ${propSliderRow('Saturation', 'slSat', clip.saturation || 0, -100, 100, 1, '', null, null, locked)}
        ${propSliderRow('Temperature', 'slTemp', clip.temperature || 0, -60, 60, 1, '', null, null, locked)}
        ${propSliderRow('Blur', 'slBlur', clip.blur || 0, 0, 24, 0.5, 'px', null, null, locked)}
      </div>`;
    if (locked) return;
    bindSliderAndNumber('slBright', v => { clip.brightness = v; renderNow(); });
    bindSliderAndNumber('slCont', v => { clip.contrast = v; renderNow(); });
    bindSliderAndNumber('slSat', v => { clip.saturation = v; renderNow(); });
    bindSliderAndNumber('slTemp', v => { clip.temperature = v; renderNow(); });
    bindSliderAndNumber('slBlur', v => { clip.blur = v; renderNow(); });
    $('#btnResetColor').onclick = () => {
      Object.assign(clip, { filter: 'none', brightness: 0, contrast: 0, saturation: 0, temperature: 0, blur: 0 });
      snapshotHistory(); renderInspector(); renderNow();
    };
  } else if (tab === 'text') {
    if (clip.type !== 'text') {
      body.innerHTML = `<div class="empty-inspector"><p>Select a Text clip to style typography, spacing, alignment, shadow, and animations.</p><button id="btnQuickText" class="btn-accent">+ Add Text at Playhead</button></div>`;
      $('#btnQuickText').onclick = () => addTextClip();
      return;
    }
    body.innerHTML = `${lockBanner}
      <div class="insp-section">
        <div class="insp-sec-head"><span>Typography &amp; Layout</span></div>
        <textarea id="txtContent" class="prop-textarea" ${dis}>${escHtml(clip.text)}</textarea>
        ${propSliderRow('Font Size', 'slFontSize', clip.fontSize || 72, 20, 200, 1, 'px', null, null, locked)}
        ${propSliderRow('Letter Spacing', 'slSpacing', clip.spacing || 0, -4, 30, 1, 'px', null, null, locked)}
        <div class="row-2">
          <select id="selFontWeight" class="prop-select" ${dis}>
            ${[['400', 'Regular'], ['700', 'Bold'], ['800', 'ExtraBold'], ['900', 'Black']].map(([w, l]) =>
              `<option value="${w}" ${(clip.fontWeight || '900') === w ? 'selected' : ''}>${l}</option>`
            ).join('')}
          </select>
          <select id="selTextAlign" class="prop-select" ${dis}>
            ${[['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([a, l]) =>
              `<option value="${a}" ${(clip.align || 'center') === a ? 'selected' : ''}>${l}</option>`
            ).join('')}
          </select>
        </div>
        ${propSliderRow('Stroke Width', 'slStroke', clip.strokeWidth || 0, 0, 24, 1, 'px', null, null, locked)}
        ${propSliderRow('Shadow Blur', 'slShadow', clip.shadowBlur || 0, 0, 40, 1, 'px', null, null, locked)}
        <div class="color-row">
          <label>Text</label><input id="txtColor" type="color" value="${escHtml(clip.color || '#ffffff')}" ${dis} />
          <label>Stroke</label><input id="txtStroke" type="color" value="${escHtml(clip.strokeColor || '#000000')}" ${dis} />
          <label>Box</label><input id="txtBg" type="color" value="${escHtml(clip.bgColor || '#000000')}" ${dis} />
        </div>
        ${propSliderRow('Box Opacity', 'slBgA', Math.round((clip.bgAlpha || 0) * 100), 0, 100, 1, '%', null, null, locked)}
        <div class="row-2">
          <div class="prop-row">
            <div class="prop-head"><span>Intro Anim</span></div>
            <select id="txtAnimIn" class="prop-select" ${dis}>
              ${['none', 'pop', 'slide-up', 'fade', 'typewriter'].map(a => `<option value="${a}" ${clip.animIn === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="prop-row">
            <div class="prop-head"><span>Outro Anim</span></div>
            <select id="txtAnimOut" class="prop-select" ${dis}>
              ${['none', 'fade', 'pop', 'slide-down', 'zoom-out'].map(a => `<option value="${a}" ${(clip.animOut || 'none') === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`;
    if (locked) return;
    $('#txtContent').oninput = (e) => { clip.text = e.target.value; renderNow(); };
    $('#txtContent').onchange = () => { snapshotHistory(); renderTimeline(); };
    bindSliderAndNumber('slFontSize', v => { clip.fontSize = v; renderNow(); });
    bindSliderAndNumber('slSpacing', v => { clip.spacing = v; renderNow(); });
    bindSliderAndNumber('slStroke', v => { clip.strokeWidth = v; renderNow(); });
    bindSliderAndNumber('slShadow', v => { clip.shadowBlur = v; renderNow(); });
    bindSliderAndNumber('slBgA', v => { clip.bgAlpha = v / 100; renderNow(); });
    $('#selFontWeight').onchange = (e) => { clip.fontWeight = e.target.value; snapshotHistory(); renderNow(); };
    $('#selTextAlign').onchange = (e) => { clip.align = e.target.value; snapshotHistory(); renderNow(); };
    $('#txtColor').oninput = (e) => { clip.color = e.target.value; renderNow(); };
    $('#txtColor').onchange = () => snapshotHistory();
    $('#txtStroke').oninput = (e) => { clip.strokeColor = e.target.value; renderNow(); };
    $('#txtStroke').onchange = () => snapshotHistory();
    $('#txtBg').oninput = (e) => { clip.bgColor = e.target.value; renderNow(); };
    $('#txtBg').onchange = () => snapshotHistory();
    $('#txtAnimIn').onchange = (e) => { clip.animIn = e.target.value; snapshotHistory(); renderNow(); };
    $('#txtAnimOut').onchange = (e) => { clip.animOut = e.target.value; snapshotHistory(); renderNow(); };
  }
}

function wireKeyframeButtons(container, clip, localT) {
  const tol = 1 / Math.max(15, state.fps);
  container.querySelectorAll('.kf-btn').forEach(btn => {
    btn.onclick = () => {
      const prop = btn.dataset.kf;
      if (!clip.keyframes[prop]) clip.keyframes[prop] = [];
      const idx = clip.keyframes[prop].findIndex(k => Math.abs(k.t - localT) <= tol);
      if (idx >= 0) clip.keyframes[prop].splice(idx, 1);
      else {
        const fallback = prop.startsWith('mask') ? (clip.mask?.[prop.slice(4).toLowerCase()] ?? 0.5) : (clip[prop] ?? 1);
        clip.keyframes[prop].push({ t: localT, v: evalKeyframe(clip, prop, localT, fallback), ease: clip.defaultEase || 'easeInOut' });
      }
      snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
    };
  });
  container.querySelectorAll('[data-kf-prev]').forEach(btn => {
    btn.onclick = () => {
      const list = (clip.keyframes?.[btn.dataset.kfPrev] || []).map(k => k.t).sort((a, b) => a - b);
      const prev = [...list].reverse().find(kt => kt < localT - tol);
      if (prev !== undefined) { state.currentTime = quantize(clip.start + prev); renderInspector(); renderNow(); }
    };
  });
  container.querySelectorAll('[data-kf-next]').forEach(btn => {
    btn.onclick = () => {
      const list = (clip.keyframes?.[btn.dataset.kfNext] || []).map(k => k.t).sort((a, b) => a - b);
      const next = list.find(kt => kt > localT + tol);
      if (next !== undefined) { state.currentTime = quantize(clip.start + next); renderInspector(); renderNow(); }
    };
  });
}

// ── CAPTIONS (CC / SRT + EDITABLE START/END TIMESTAMPS) ─────────────────────
function parseSRT(text) {
  const blocks = text.replace(/\r/g, '').trim().split(/\n\n+/);
  const toSec = (ts) => {
    const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
  };
  const out = [];
  for (const b of blocks) {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const tsLine = lines.find(l => l.includes('-->'));
    if (!tsLine) continue;
    const [a, c] = tsLine.split('-->').map(s => s.trim());
    const idx = lines.indexOf(tsLine);
    out.push({ id: uid('cap'), start: quantize(toSec(a)), end: quantize(toSec(c)), text: lines.slice(idx + 1).join(' ') });
  }
  return out;
}

function toSRT(captions) {
  const fmt = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return captions.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n');
}

function addCaptionAtPlayhead() {
  const st = quantize(state.currentTime);
  const cap = { id: uid('cap'), start: st, end: quantize(st + 2.2), text: 'New caption line here' };
  state.captions.push(cap);
  state.captions.sort((a, b) => a.start - b.start);
  state.selectedCaptionId = cap.id;
  snapshotHistory();
  renderTimeline();
  renderCaptionsUI();
  renderNow();
}

function renderCaptionsUI() {
  const box = $('#captionList');
  if (!state.captions.length) {
    box.innerHTML = `<div class="drawer-tip">No captions yet. Click "+ Line" or import an .SRT file. Captions also appear on the purple CC lane in the timeline!</div>`;
    return;
  }
  box.innerHTML = '';
  state.captions.forEach((cap) => {
    const row = document.createElement('div');
    row.className = `caption-item ${state.selectedCaptionId === cap.id ? 'active' : ''}`;
    row.innerHTML = `
      <div class="caption-top">
        <input class="cap-time-in" data-field="start" value="${cap.start.toFixed(2)}" title="Start time (seconds)" />
        <span>→</span>
        <input class="cap-time-in" data-field="end" value="${cap.end.toFixed(2)}" title="End time (seconds)" />
        <button class="btn-micro" data-act="jump">Go</button>
        <button class="btn-micro" data-act="del">✕</button>
      </div>
      <input class="cap-text-in" value="${escHtml(cap.text)}" />`;
    const sIn = row.querySelector('[data-field="start"]');
    const eIn = row.querySelector('[data-field="end"]');
    sIn.onchange = () => {
      const v = Number(sIn.value);
      if (Number.isFinite(v) && v >= 0 && v < cap.end - 0.1) {
        cap.start = quantize(v);
        state.captions.sort((a, b) => a.start - b.start);
        snapshotHistory(); renderTimeline(); renderCaptionsUI(); renderNow();
      } else sIn.value = cap.start.toFixed(2);
    };
    eIn.onchange = () => {
      const v = Number(eIn.value);
      if (Number.isFinite(v) && v > cap.start + 0.1) {
        cap.end = quantize(v);
        snapshotHistory(); renderTimeline(); renderCaptionsUI(); renderNow();
      } else eIn.value = cap.end.toFixed(2);
    };
    row.querySelector('[data-act="jump"]').onclick = () => { state.currentTime = quantize(cap.start); state.selectedCaptionId = cap.id; renderCaptionsUI(); renderNow(); };
    row.querySelector('[data-act="del"]').onclick = () => {
      state.captions = state.captions.filter(x => x.id !== cap.id);
      snapshotHistory(); renderTimeline(); renderCaptionsUI(); renderNow();
    };
    const tIn = row.querySelector('.cap-text-in');
    tIn.oninput = (e) => { cap.text = e.target.value; renderNow(); };
    tIn.onchange = () => { snapshotHistory(); renderTimeline(); };
    box.appendChild(row);
  });
}

// ── LEFT DRAWERS (Safe Escaping, Click Select + Explicit Insert/Delete) ────
function renderMediaLibrary() {
  const grid = $('#mediaGrid');
  const audioList = $('#audioList');
  grid.innerHTML = '';
  audioList.innerHTML = '';
  const filtered = state.library.filter(m => state.mediaFilter === 'all' || m.type === state.mediaFilter);

  filtered.forEach(m => {
    const card = document.createElement('div');
    card.className = `media-card ${state.selectedMediaId === m.id ? 'selected' : ''}`;
    card.draggable = true;
    card.innerHTML = `
      <div class="media-thumb">
        ${m.thumbUrl ? `<img src="${escHtml(m.thumbUrl)}" alt="" />` : `<span style="font-size:22px;color:#00e5c3">♫</span>`}
        <span class="media-kind">${escHtml(m.type)}</span>
        <span class="media-dur">${formatTC(m.duration, state.fps)}</span>
        <button class="media-add-btn" title="Add to Timeline">+</button>
        ${m.userAdded ? `<button class="media-del-btn" title="Remove from Library">✕</button>` : ''}
      </div>
      <div class="media-meta">
        <div class="media-title" title="${escHtml(m.name)}">${escHtml(m.name)}</div>
        <div class="media-sub">${m.type === 'audio' ? 'Audio' : `${m.width}×${m.height}`}</div>
      </div>`;
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/motioncut-media-id', m.id);
    });
    card.onclick = () => { state.selectedMediaId = m.id; renderMediaLibrary(); };
    card.ondblclick = () => addMediaToTimeline(m);
    card.querySelector('.media-add-btn').onclick = (e) => { e.stopPropagation(); addMediaToTimeline(m); };
    const delBtn = card.querySelector('.media-del-btn');
    if (delBtn) {
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        await fetch(`/api/media/${encodeURIComponent(m.id)}`, { method: 'DELETE', headers: apiHeaders() });
        state.library = state.library.filter(x => x.id !== m.id);
        renderMediaLibrary();
        showToast(`Removed "${m.name}" from library`);
      };
    }
    grid.appendChild(card);
  });

  state.library.filter(m => m.type === 'audio').forEach(m => {
    const row = document.createElement('div');
    row.className = 'audio-row';
    row.innerHTML = `<div style="min-width:0"><div class="audio-row-name">${escHtml(m.name)}</div><div class="audio-row-dur">${formatTC(m.duration, state.fps)}</div></div><button class="btn-mini">+ Add</button>`;
    row.querySelector('button').onclick = () => addMediaToTimeline(m, null, state.currentTime);
    audioList.appendChild(row);
  });
}

function renderEffectIntensityControls() {
  const wrap = $('#effectIntensityWrap');
  wrap.innerHTML = '';
  const f = findClipAndTrack(state.selectedClipId);
  if (!f || !f.clip.effects?.length) return;
  f.clip.effects.forEach(fxId => {
    const def = EFFECT_PRESETS.find(x => x.id === fxId);
    const val = Math.round((f.clip.effectIntensity?.[fxId] ?? 0.65) * 100);
    const row = document.createElement('div');
    row.className = 'fx-active-row';
    row.innerHTML = `
      <div class="fx-active-top"><span>${escHtml(def?.name || fxId)}</span><span>${val}%</span></div>
      <input type="range" class="prop-slider" min="10" max="100" value="${val}" ${f.track.locked ? 'disabled' : ''} />`;
    const sl = row.querySelector('input');
    sl.oninput = (e) => {
      if (!f.clip.effectIntensity) f.clip.effectIntensity = {};
      f.clip.effectIntensity[fxId] = Number(e.target.value) / 100;
      row.querySelector('.fx-active-top span:last-child').textContent = `${e.target.value}%`;
      renderNow();
    };
    sl.onchange = () => { sl.blur(); snapshotHistory(); };
    wrap.appendChild(row);
  });
}

function renderPresets() {
  const sg = $('#sfxGrid'); sg.innerHTML = '';
  SFX_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset-card';
    b.innerHTML = `<div class="preset-preview" style="color:#00e5c3">♫</div><div class="preset-label">${escHtml(p.name)}</div>`;
    b.onclick = () => addProceduralSfx(p);
    sg.appendChild(b);
  });

  const tg = $('#textPresetGrid'); tg.innerHTML = '';
  TEXT_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset-card';
    b.innerHTML = `<div class="preset-preview" style="color:${p.color};font-size:13px">Aa</div><div class="preset-label">${escHtml(p.name)}</div>`;
    b.onclick = () => addTextClip(p);
    tg.appendChild(b);
  });

  const gg = $('#graphicsGrid'); gg.innerHTML = '';
  GRAPHICS_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset-card';
    b.innerHTML = `<div class="preset-preview" style="color:#ec5698;font-size:11px;font-family:var(--mono)">${escHtml(p.label)}</div><div class="preset-label">${escHtml(p.name)}</div>`;
    b.onclick = () => addGraphicClip(p);
    gg.appendChild(b);
  });

  const eg = $('#effectsGrid'); eg.innerHTML = '';
  EFFECT_PRESETS.forEach(fx => {
    const b = document.createElement('button');
    b.className = 'preset-card';
    b.dataset.fx = fx.id;
    b.innerHTML = `<div class="preset-preview" style="font-size:10px;color:#00e5c3">${escHtml(fx.badge)}</div><div class="preset-label">${escHtml(fx.name)}</div>`;
    b.onclick = () => {
      const f = findClipAndTrack(state.selectedClipId);
      if (!f || (f.clip.type !== 'video' && f.clip.type !== 'image')) return showToast('Select a video or image clip first');
      if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
      if (!Array.isArray(f.clip.effects)) f.clip.effects = [];
      const i = f.clip.effects.indexOf(fx.id);
      if (i >= 0) f.clip.effects.splice(i, 1);
      else { f.clip.effects.push(fx.id); f.clip.effectIntensity[fx.id] = 0.65; }
      b.classList.toggle('active', f.clip.effects.includes(fx.id));
      snapshotHistory(); renderTimeline(); renderEffectIntensityControls(); renderNow();
    };
    eg.appendChild(b);
  });

  const trg = $('#transitionsGrid'); trg.innerHTML = '';
  TRANSITION_PRESETS.forEach(tr => {
    const b = document.createElement('button');
    b.className = 'preset-card';
    b.innerHTML = `<div class="preset-preview" style="color:#00b8ff">⇄</div><div class="preset-label">${escHtml(tr.name)}</div>`;
    b.onclick = () => {
      const f = findClipAndTrack(state.selectedClipId);
      if (!f || (f.clip.type !== 'video' && f.clip.type !== 'image')) return showToast('Select a video or image clip first');
      if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
      if (state.transSide === 'in') {
        f.clip.transIn = tr.id; f.clip.transInDur = tr.dur || 0.5;
        // Warn user if preceding clip has tight source handle
        const prev = f.track.clips.find(p => p.id !== f.clip.id && Math.abs((p.start + p.duration) - f.clip.start) <= 0.06);
        if (prev && tr.id !== 'none') {
          const remainingHandle = (prev.sourceDuration || prev.duration) - ((prev.trimStart || 0) + getClipSourceSpan(prev));
          if (remainingHandle < f.clip.transInDur) {
            showToast(`Applied ${tr.name} (note: outgoing clip handle is short; tail frame will hold smoothly)`);
          } else {
            showToast(`Applied A→B ${tr.name} (${f.clip.transInDur}s)`);
          }
        } else {
          showToast(`Applied ${tr.name} (In)`);
        }
      } else {
        f.clip.transOut = tr.id; f.clip.transOutDur = tr.dur || 0.5;
        showToast(`Applied ${tr.name} (Out)`);
      }
      snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
    };
    trg.appendChild(b);
  });

  const fg = $('#filtersGrid'); fg.innerHTML = '';
  LUT_FILTERS.forEach(lut => {
    const b = document.createElement('button');
    b.className = 'preset-card';
    b.innerHTML = `<div class="preset-preview" style="width:36px;height:20px;border-radius:4px;background:linear-gradient(135deg,#00e5c3,#ff4f6d);filter:${lut.css}"></div><div class="preset-label">${escHtml(lut.name)}</div>`;
    b.onclick = () => {
      const f = findClipAndTrack(state.selectedClipId);
      if (!f || (f.clip.type !== 'video' && f.clip.type !== 'image')) return showToast('Select a video or image clip first');
      if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
      f.clip.filter = lut.id;
      snapshotHistory(); renderInspector(); renderNow();
      showToast(`Applied LUT: ${lut.name}`);
    };
    fg.appendChild(b);
  });
}

// ── CANVAS INTERACTION (LOCK-SAFE, IN-PLACE INSPECTOR UPDATES, ESC CANCELS INLINE TEXT) ──
let inlineEditorClip = null;
let inlineEditorOrigText = '';
let inlineCancelFlag = false;

function openInlineTextEditor(clip) {
  const f = findClipAndTrack(clip.id);
  if (f?.track.locked) return showToast(`Track "${f.track.name}" is locked`);
  const ed = $('#inlineTextEditor');
  const shell = $('#canvasShell');
  const scaleX = shell.clientWidth / state.canvasWidth;
  const scaleY = shell.clientHeight / state.canvasHeight;
  const box = engine.getClipBoundingBox(clip, state.currentTime);
  inlineEditorClip = clip;
  inlineEditorOrigText = clip.text || '';
  inlineCancelFlag = false;

  ed.value = clip.text || '';
  ed.style.fontSize = `${Math.max(13, Math.round((clip.fontSize || 72) * scaleY))}px`;
  ed.style.color = clip.color || '#ffffff';
  ed.style.left = `${Math.max(8, (box.cx - box.w / 2) * scaleX)}px`;
  ed.style.top = `${Math.max(8, (box.cy - box.h / 2) * scaleY)}px`;
  ed.style.width = `${Math.max(140, Math.min(shell.clientWidth - 16, box.w * scaleX + 24))}px`;
  ed.style.height = `${Math.max(44, box.h * scaleY + 18)}px`;
  ed.classList.remove('hidden');
  ed.focus();
  ed.select();
}

function closeInlineTextEditor(commit = true) {
  const ed = $('#inlineTextEditor');
  if (!inlineEditorClip) return;
  if (commit && !inlineCancelFlag) {
    inlineEditorClip.text = ed.value;
    snapshotHistory();
    renderTimeline();
    renderInspector();
    renderNow();
  } else {
    inlineEditorClip.text = inlineEditorOrigText;
    renderNow();
  }
  inlineEditorClip = null;
  ed.classList.add('hidden');
}

$('#inlineTextEditor').addEventListener('input', (e) => {
  if (inlineEditorClip) { inlineEditorClip.text = e.target.value; renderNow(); }
});
$('#inlineTextEditor').addEventListener('blur', () => closeInlineTextEditor(!inlineCancelFlag));
$('#inlineTextEditor').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    inlineCancelFlag = true;
    closeInlineTextEditor(false);
    showToast('Cancelled text edit');
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    closeInlineTextEditor(true);
  }
});

function setupCanvasInteractions() {
  const ov = $('#overlayCanvas');
  const toCanvasXY = (e) => {
    const r = ov.getBoundingClientRect();
    return [(e.clientX - r.left) * (state.canvasWidth / r.width), (e.clientY - r.top) * (state.canvasHeight / r.height)];
  };

  ov.addEventListener('dblclick', (e) => {
    const [px, py] = toCanvasXY(e);
    const hit = engine.hitTestAnyClip(px, py, state.currentTime);
    if (hit && hit.type === 'text') {
      selectSingleClip(hit.id);
      renderTimeline();
      openInlineTextEditor(hit);
    }
  });

  ov.addEventListener('mousedown', (e) => {
    const [px, py] = toCanvasXY(e);
    let hit = engine.hitTestGizmo(px, py, state.currentTime);
    if (!hit) {
      const any = engine.hitTestAnyClip(px, py, state.currentTime);
      if (any) {
        selectSingleClip(any.id);
        renderTimeline();
        renderInspector();
        renderNow();
        hit = { mode: 'move', clip: any, box: engine.getClipBoundingBox(any, state.currentTime) };
      } else {
        selectSingleClip(null);
        renderTimeline();
        renderInspector();
        renderNow();
        return;
      }
    }

    const found = findClipAndTrack(hit.clip.id);
    if (found?.track.locked) return showToast(`Track "${found.track.name}" is locked`);

    const clip = hit.clip;
    const localT = quantize(Math.max(0, state.currentTime - clip.start));
    const origX = evalKeyframe(clip, 'x', localT, clip.x || 0);
    const origY = evalKeyframe(clip, 'y', localT, clip.y || 0);
    const origScale = evalKeyframe(clip, 'scale', localT, clip.scale ?? 1);
    const origRot = evalKeyframe(clip, 'rotation', localT, clip.rotation || 0);
    const startDist = Math.max(10, Math.hypot(px - hit.box.cx, py - hit.box.cy));
    const startAngle = Math.atan2(py - hit.box.cy, px - hit.box.cx);
    const W = state.canvasWidth, H = state.canvasHeight;
    let changed = false;

    const setVal = (prop, val) => {
      const kfs = clip.keyframes?.[prop];
      if (kfs && kfs.length > 0) {
        const tol = 1 / Math.max(15, state.fps);
        const ex = kfs.find(k => Math.abs(k.t - localT) <= tol);
        if (ex) ex.v = val; else kfs.push({ t: localT, v: val, ease: clip.defaultEase || 'easeInOut' });
      } else clip[prop] = val;
    };

    const onMove = (ev) => {
      changed = true;
      const [nx, ny] = toCanvasXY(ev);
      engine.snapXGuide = null;
      engine.snapYGuide = null;
      if (hit.mode === 'move') {
        let tx = origX + (nx - px);
        let ty = origY + (ny - py);
        // Snap to Center + Rule-of-Thirds guides
        const snapXs = [0, -W / 6, W / 6];
        const snapYs = [0, -H / 6, H / 6];
        for (const sx of snapXs) {
          if (Math.abs(tx - sx) < 16) { tx = sx; engine.snapXGuide = W / 2 + sx; break; }
        }
        for (const sy of snapYs) {
          if (Math.abs(ty - sy) < 16) { ty = sy; engine.snapYGuide = H / 2 + sy; break; }
        }
        setVal('x', Math.round(tx));
        setVal('y', Math.round(ty));
      } else if (hit.mode === 'scale') {
        const dist = Math.max(10, Math.hypot(nx - hit.box.cx, ny - hit.box.cy));
        setVal('scale', Math.max(0.1, Math.min(4.0, origScale * (dist / startDist))));
      } else if (hit.mode === 'rotate') {
        const ang = Math.atan2(ny - hit.box.cy, nx - hit.box.cx);
        let deg = origRot + ((ang - startAngle) * 180) / Math.PI;
        for (const snapDeg of [0, 90, -90, 180, -180]) {
          if (Math.abs(deg - snapDeg) < 4) deg = snapDeg;
        }
        setVal('rotation', Math.round(deg));
      }
      // Update inspector numeric fields in-place without rebuilding DOM!
      syncTransformInputsInPlace(clip);
      renderNow();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      engine.snapXGuide = null;
      engine.snapYGuide = null;
      if (changed) { snapshotHistory(); renderInspector(); renderNow(); }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ── SMART TOOLS ─────────────────────────────────────────────────────────────
async function runAutoCrop() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f || f.clip.type !== 'video') return showToast('Select a video clip to auto-crop');
  if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
  showToast('Running FFmpeg cropdetect...');
  try {
    const r = await fetch(`/api/cropdetect/${f.clip.mediaId}`);
    const d = await r.json();
    if (!r.ok || !d.crop) return showToast('Could not detect crop bounds');
    if (!d.hasBars) {
      return showToast(`No black bars detected — frame is already full ${d.width}×${d.height}`);
    }
    f.clip.cropRect = d.crop;
    f.clip.fitMode = 'cover';
    snapshotHistory(); renderInspector(); renderNow();
    showToast(`Stripped letterbox bars -> ${d.crop.w}×${d.crop.h}`);
  } catch (e) { showToast(`Auto-crop error: ${e.message}`); }
}

async function runVisionCutout() {
  const f = findClipAndTrack(state.selectedClipId);
  if (!f || (f.clip.type !== 'video' && f.clip.type !== 'image')) return showToast('Select a video or image clip first');
  showToast('Running macOS Apple Vision cutout...');
  try {
    const localT = Math.max(0, state.currentTime - f.clip.start);
    const srcT = (f.clip.trimStart || 0) + localT * (f.clip.speed || 1);
    const r = await fetch(`/api/cutout/${f.clip.mediaId}`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ time: srcT }),
    });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Cutout failed');
    state.library.push(d.item);
    renderMediaLibrary();
    addMediaToTimeline(d.item, null, state.currentTime);
    showToast('Added transparent Vision Cutout PNG on overlay!');
  } catch (e) { showToast(`Cutout error: ${e.message}`); }
}

async function runAutoBeats() {
  const f = findClipAndTrack(state.selectedClipId);
  const clip = f?.clip || state.tracks.flatMap(t => t.clips).find(c => c.mediaId && state.library.find(m => m.id === c.mediaId)?.hasAudio);
  if (!clip) return showToast('Add an audio/video clip first');
  showToast('Analyzing audio transients...');
  try {
    const r = await fetch(`/api/waveform/${clip.mediaId}?bins=200`);
    const d = await r.json();
    state.waveforms.set(clip.mediaId, d);
    const newMarkers = (d.beats || [])
      .filter(b => b >= (clip.trimStart || 0) && b <= (clip.trimStart || 0) + getClipSourceSpan(clip))
      .map(b => quantize(clip.start + (b - (clip.trimStart || 0)) / (clip.speed || 1)));
    state.markers = [...new Set([...state.markers, ...newMarkers])].sort((a, b) => a - b);
    snapshotHistory(); renderTimeline();
    showToast(`Dropped ${newMarkers.length} magnetic beat markers`);
  } catch (e) { showToast(`Beat sync error: ${e.message}`); }
}

// ── RELINK MISSING MEDIA MODAL ──────────────────────────────────────────────
function checkMissingMediaAndPrompt(manifest) {
  const libIds = new Set(state.library.map(m => m.id));
  const missingIds = new Set();
  for (const tr of state.tracks) {
    for (const c of tr.clips) {
      if (c.mediaId && !libIds.has(c.mediaId)) missingIds.add(c.mediaId);
    }
  }
  if (!missingIds.size) return;

  const list = $('#relinkList');
  list.innerHTML = '';
  for (const mid of missingIds) {
    const info = manifest[mid] || { name: mid, type: 'media' };
    const row = document.createElement('div');
    row.className = 'relink-row';
    row.innerHTML = `
      <div><strong>${escHtml(info.name)}</strong><div class="media-sub">ID: ${escHtml(mid)}</div></div>
      <div class="row-2" style="flex:0 0 auto">
        <button class="btn-mini" data-pick="${escHtml(mid)}">Relink File...</button>
      </div>`;
    row.querySelector('[data-pick]').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'video/*,audio/*,image/*';
      inp.onchange = async () => {
        const file = inp.files?.[0];
        if (!file) return;
        const r = await fetch('/api/upload', {
          method: 'POST',
          headers: apiHeaders({ 'X-Filename': encodeURIComponent(file.name) }),
          body: file,
        });
        const d = await r.json();
        if (!r.ok) return showToast(d.error || 'Relink upload failed');
        state.library.push(d.item);
        for (const tr of state.tracks) {
          for (const c of tr.clips) {
            if (c.mediaId === mid) { c.mediaId = d.item.id; c.sourceDuration = d.item.duration; }
          }
        }
        row.innerHTML = `<span style="color:#00e5c3">✓ Relinked → ${escHtml(d.item.name)}</span>`;
        snapshotHistory(); renderMediaLibrary(); renderTimeline(); renderNow();
      };
      inp.click();
    };
    list.appendChild(row);
  }
  $('#relinkModal').classList.remove('hidden');
}

// ── EXPORT MODAL (SEPARATE MODES, PROJECT FPS DEFAULT, LIVE ETA & CANCEL) ───
function getExportDims() {
  const aspectVal = $('#expAspect').value;
  const res = Number($('#expRes').value);
  const ratioStr = aspectVal === 'current' ? state.aspect : aspectVal;
  const [rw, rh] = ratioStr.split(':').map(Number);
  let w, h;
  if (rw >= rh) { h = res; w = Math.round((res * rw) / rh / 2) * 2; }
  else { w = res; h = Math.round((res * rh) / rw / 2) * 2; }
  return { width: w, height: h, ratioStr };
}

function updateExportSummary() {
  const { width, height, ratioStr } = getExportDims();
  const fps = Number($('#expFps').value);
  const dur = getProjectDuration();
  const sum = $('#exportSummaryLine');
  if (state.exportMode === 'deterministic') {
    const frames = Math.max(1, Math.round(Math.max(1 / fps, dur) * fps));
    sum.textContent = `Timeline Render: ${width}×${height} (${ratioStr}) · ${fps}fps · ${dur.toFixed(2)}s (${frames} frames) · Multi-track H.264/AAC`;
  } else {
    const f = findClipAndTrack(state.selectedClipId);
    sum.textContent = f && f.clip.type === 'video'
      ? `Quick Reframe: "${f.clip.name}" → ${width}×${height} (${ratioStr}) · ${fps}fps direct FFmpeg (~2s)`
      : `Quick Reframe requires selecting a video clip on the timeline.`;
  }
}

async function runExport() {
  const { width, height } = getExportDims();
  const fps = Number($('#expFps').value);
  const crf = Number($('#expCrf').value);
  const name = $('#expName').value.trim() || `motioncut_${Date.now()}`;
  const progWrap = $('#exportProgressWrap');
  const progBar = $('#exportProgressBar');
  const progText = $('#exportStatusText');
  const resBox = $('#exportResultBox');
  const startBtn = $('#btnExportStart');
  const cancelBtn = $('#btnExportCancel');

  progWrap.classList.remove('hidden');
  resBox.classList.add('hidden');
  startBtn.disabled = true;
  cancelBtn.textContent = 'Cancel Export';
  progBar.style.width = '3%';
  progText.textContent = 'Starting studio FFmpeg render...';

  try {
    let data;
    if (state.exportMode === 'quick') {
      const f = findClipAndTrack(state.selectedClipId);
      const vidClip = (f && f.clip.type === 'video') ? f.clip : state.tracks.flatMap(t => t.clips).find(c => c.type === 'video');
      if (!vidClip) throw new Error('Select a video clip for Quick Reframe');
      progBar.style.width = '45%';
      const r = await fetch('/api/quick-export', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mediaId: vidClip.mediaId, width, height, fps, crf, name,
          fitMode: vidClip.fitMode || 'cover',
          trimStart: vidClip.trimStart || 0,
          duration: vidClip.duration,
          cropRect: vidClip.cropRect,
        }),
      });
      data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Quick export failed');
      progBar.style.width = '100%';
    } else {
      data = await engine.exportDeterministicMP4({
        width, height, fps, crf, name,
        onProgress: (pct, msg) => {
          progBar.style.width = `${pct}%`;
          progText.textContent = msg;
        },
      });
    }

    resBox.innerHTML = `
      <div><strong>✓ Exported:</strong> ${escHtml(data.fileName)}</div>
      <div>${data.width}×${data.height} · ${data.fps} fps · ${Number(data.duration).toFixed(2)}s · ${(data.size / 1024 / 1024).toFixed(2)} MB</div>
      <div><a href="${escHtml(data.downloadUrl)}?download=1" download="${escHtml(data.fileName)}">Download MP4</a></div>`;
    resBox.classList.remove('hidden');
    showToast(`Exported ${data.fileName}`);
    await refreshLibrary();
  } catch (err) {
    if (String(err.message).toLowerCase().includes('cancel') || err.name === 'AbortError') {
      progText.textContent = 'Export cancelled and cleaned up.';
      showToast('Export cancelled');
    } else {
      progText.textContent = `Error: ${err.message}`;
      showToast(`Export error: ${err.message}`);
    }
  } finally {
    startBtn.disabled = false;
    cancelBtn.textContent = 'Close';
  }
}

async function closeOrCancelExportModal() {
  if (engine.isExporting) {
    await engine.cancelExport();
    return;
  }
  $('#exportModal').classList.add('hidden');
}

// ── SPLITTER + SIDEBAR COLLAPSE + PLAYHEAD-ANCHORED ZOOM ────────────────────
function setupSplitter() {
  const sp = $('#timelineSplitter');
  const dock = $('#timelineDock');
  sp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sp.classList.add('dragging');
    const startY = e.clientY;
    const startH = dock.getBoundingClientRect().height;
    const onMove = (ev) => {
      const nextH = Math.max(170, Math.min(window.innerHeight - 230, startH - (ev.clientY - startY)));
      dock.style.height = `${nextH}px`;
      dock.style.flexBasis = `${nextH}px`;
    };
    const onUp = () => {
      sp.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function setZoomAnchored(nextZoom) {
  const clamped = Math.max(20, Math.min(260, Math.round(nextZoom)));
  const scroll = $('#timelineScroll');
  const oldPlayheadPx = state.currentTime * state.zoom;
  const playheadViewportOffset = oldPlayheadPx - scroll.scrollLeft;
  state.zoom = clamped;
  $('#zoomSlider').value = String(clamped);
  renderTimeline();
  // Keep playhead visually anchored in viewport when zooming!
  const newPlayheadPx = state.currentTime * state.zoom;
  if (playheadViewportOffset >= 0 && playheadViewportOffset <= scroll.clientWidth) {
    scroll.scrollLeft = Math.max(0, newPlayheadPx - playheadViewportOffset);
  }
}

function setActiveTool(tool) {
  state.activeTool = tool;
  $('#btnToolSelect').classList.toggle('active', tool === 'select');
  $('#btnToolRazor').classList.toggle('active', tool === 'razor');
  $('#timelineScroll').classList.toggle('razor-mode', tool === 'razor');
}

function updateCanvasResBadge() {
  const shell = $('#canvasShell');
  shell.style.aspectRatio = `${state.canvasWidth} / ${state.canvasHeight}`;
  $('#previewCanvas').width = state.canvasWidth;
  $('#previewCanvas').height = state.canvasHeight;
  $('#overlayCanvas').width = state.canvasWidth;
  $('#overlayCanvas').height = state.canvasHeight;
  $('#canvasResBadge').textContent = `${state.canvasWidth} × ${state.canvasHeight} · ${state.aspect}`;
}

function saveProjectJSON() {
  const payload = buildProjectPayload();
  const jsonStr = JSON.stringify(payload, null, 2);
  try { localStorage.setItem(AUTOSAVE_KEY, jsonStr); setSaveStatus('Saved'); } catch {}
  // Also backup on server quietly
  fetch('/api/projects', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: jsonStr,
  }).catch(() => {});
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.title || 'motioncut'}.mcut.json`;
  a.click();
  showToast('Project saved (.mcut.json + autosave)');
}

function startNewProject() {
  if (state.playing) togglePlay(false);
  state.title = 'Untitled_Project';
  state.aspect = '16:9';
  state.canvasWidth = 1920;
  state.canvasHeight = 1080;
  state.fps = 30;
  state.bgMode = 'black';
  state.currentTime = 0;
  state.tracks = makeEmptyTracks();
  state.captions = [];
  state.markers = [];
  state.selectedClipId = null;
  state.selectedClipIds.clear();
  state.selectedCaptionId = null;
  $('#projectTitle').value = state.title;
  $('#fpsSelect').value = '30';
  $$('#aspectGroup .aspect-btn').forEach(b => b.classList.toggle('active', b.dataset.ratio === '16:9'));
  updateCanvasResBadge();
  engine.pruneUnusedElements();
  snapshotHistory();
  renderTimeline();
  renderCaptionsUI();
  renderInspector();
  renderNow();
  showToast('Started new clean project');
}

function loadStarterDemo() {
  if (state.playing) togglePlay(false);
  state.tracks = makeEmptyTracks();
  state.captions = [];
  state.markers = [];
  state.currentTime = 0;
  state.title = 'Scanner_16x9_Edit';
  $('#projectTitle').value = state.title;
  const starter = state.library.find(m => m.name.includes('16:9')) || state.library.find(m => m.type === 'video');
  if (starter) {
    addMediaToTimeline(starter, 't_vid1', 0);
    state.currentTime = 0;
    renderNow();
    showToast(`Loaded demo: ${starter.name}`);
  } else {
    snapshotHistory();
    renderTimeline();
    showToast('No sample videos found — import media to begin');
  }
}

// ── WIRE UI EVENTS & KEYBOARD SHORTCUTS ─────────────────────────────────────
function setupUIEvents() {
  setupSplitter();
  setupCanvasInteractions();

  // Collapsible side panels
  $('#btnToggleLeft').onclick = () => {
    const collapsed = $('#leftPanel').classList.toggle('collapsed');
    $('#btnToggleLeft').classList.toggle('active', collapsed);
  };
  $('#btnToggleRight').onclick = () => {
    const collapsed = $('#rightPanel').classList.toggle('collapsed');
    $('#btnToggleRight').classList.toggle('active', collapsed);
  };

  $('#projectTitle').oninput = (e) => { state.title = e.target.value; setSaveStatus('Unsaved', 'dirty'); };
  $('#projectTitle').onchange = () => snapshotHistory();
  $('#btnNewProject').onclick = startNewProject;
  $('#btnLoadDemo').onclick = loadStarterDemo;

  $$('#toolRail .rail-btn').forEach(btn => {
    btn.onclick = () => {
      $('#leftPanel').classList.remove('collapsed');
      $$('#toolRail .rail-btn').forEach(b => b.classList.remove('active'));
      $$('.drawer-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#pane-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'effects') renderEffectIntensityControls();
      if (btn.dataset.tab === 'captions') renderCaptionsUI();
    };
  });

  $$('#mediaFilterChips .chip').forEach(ch => {
    ch.onclick = () => {
      state.mediaFilter = ch.dataset.filter;
      $$('#mediaFilterChips .chip').forEach(x => x.classList.toggle('active', x === ch));
      renderMediaLibrary();
    };
  });

  $$('#inspectorTabs .insp-tab').forEach(btn => {
    btn.onclick = () => { state.activeInspectorTab = btn.dataset.itab; renderInspector(); };
  });

  $$('#aspectGroup .aspect-btn').forEach(btn => {
    btn.onclick = () => {
      state.aspect = btn.dataset.ratio;
      state.canvasWidth = Number(btn.dataset.w);
      state.canvasHeight = Number(btn.dataset.h);
      $$('#aspectGroup .aspect-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCanvasResBadge();
      snapshotHistory();
      renderNow();
    };
  });

  $('#fpsSelect').onchange = (e) => { state.fps = Number(e.target.value); snapshotHistory(); renderTimeline(); renderNow(); };
  $$('.trans-target-row .seg-btn').forEach(b => {
    b.onclick = () => {
      state.transSide = b.dataset.transSide;
      $$('.trans-target-row .seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  $$('.bg-mode-btn').forEach(b => {
    b.onclick = () => {
      state.bgMode = b.dataset.bg;
      $$('.bg-mode-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      snapshotHistory(); renderNow();
    };
  });

  // Editable timecode input
  $('#timecodeInput').onchange = () => {
    const parsed = parseTC($('#timecodeInput').value, state.fps);
    if (parsed !== null) {
      state.currentTime = quantize(Math.max(0, Math.min(getTimelineViewDuration(), parsed)));
      renderNow();
    } else {
      $('#timecodeInput').value = formatTC(state.currentTime, state.fps);
    }
    $('#timecodeInput').blur();
  };

  // Upload & Import
  $('#btnUploadTrigger').onclick = () => $('#mediaUploadInput').click();
  const handleFiles = async (files) => {
    for (const file of files) {
      showToast(`Uploading ${file.name}...`);
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: apiHeaders({ 'X-Filename': encodeURIComponent(file.name) }),
        body: file,
      });
      const d = await r.json();
      if (r.ok && d.item) {
        if (!state.library.find(m => m.id === d.item.id)) state.library.push(d.item);
        renderMediaLibrary();
        showToast(`Imported ${d.item.name}`);
      } else showToast(d.error || 'Upload failed');
    }
  };
  $('#mediaUploadInput').onchange = (e) => { handleFiles(e.target.files); e.target.value = ''; };
  const dz = $('#dropZone');
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); };

  $('#btnImportPath').onclick = async () => {
    const p = $('#localPathInput').value.trim();
    if (!p) return;
    const r = await fetch('/api/import-path', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ path: p }),
    });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Path import failed');
    if (!state.library.find(m => m.id === d.item.id)) state.library.push(d.item);
    $('#localPathInput').value = '';
    renderMediaLibrary();
    addMediaToTimeline(d.item);
    showToast(`Imported ${d.item.name}`);
  };

  // Transport
  $('#btnPlayPause').onclick = () => togglePlay();
  $('#btnJumpStart').onclick = () => { state.currentTime = 0; renderNow(); };
  $('#btnJumpEnd').onclick = () => { state.currentTime = quantize(getProjectDuration()); renderNow(); };
  $('#btnStepBack').onclick = () => { state.currentTime = quantize(Math.max(0, state.currentTime - 1 / state.fps)); renderNow(); };
  $('#btnStepFwd').onclick = () => { state.currentTime = quantize(state.currentTime + 1 / state.fps); renderNow(); };
  $('#btnLoop').onclick = (e) => { state.loop = !state.loop; e.currentTarget.classList.toggle('active', state.loop); };
  $('#btnMasterMute').onclick = (e) => { state.masterMuted = !state.masterMuted; e.currentTarget.textContent = state.masterMuted ? '🔇' : '🔊'; renderNow(); };
  $('#btnFitPreview').onclick = (e) => { state.showGuides = !state.showGuides; e.currentTarget.classList.toggle('active', state.showGuides); renderNow(); };
  $('#btnFullscreen').onclick = () => { if (!document.fullscreenElement) $('#viewportStage').requestFullscreen?.(); else document.exitFullscreen?.(); };
  $('#btnSnapshot').onclick = () => {
    const a = document.createElement('a');
    a.href = $('#previewCanvas').toDataURL('image/png');
    a.download = `${state.title || 'frame'}_${Math.round(state.currentTime * 100)}.png`;
    a.click();
    showToast('Saved frame snapshot PNG');
  };

  // Timeline Toolbar
  $('#btnToolSelect').onclick = () => setActiveTool('select');
  $('#btnToolRazor').onclick = () => setActiveTool('razor');
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnSplit').onclick = splitSelectedClip;
  $('#btnDuplicate').onclick = duplicateSelectedClip;
  $('#btnFreeze').onclick = freezeFrameAtPlayhead;
  $('#btnDetachAudio').onclick = detachAudioFromSelected;
  $('#btnRippleDelete').onclick = () => deleteSelectedClips(true);
  $('#btnDelete').onclick = () => deleteSelectedClips(false);
  $('#btnAddMarker').onclick = () => {
    const t = quantize(state.currentTime);
    if (!state.markers.includes(t)) state.markers.push(t);
    state.markers.sort((a, b) => a - b);
    snapshotHistory(); drawRuler();
    showToast(`Marker at ${formatTC(t, state.fps)}`);
  };
  $('#btnClearMarkers').onclick = () => { state.markers = []; snapshotHistory(); drawRuler(); showToast('Cleared all markers'); };
  $('#btnToggleSnap').onclick = (e) => { state.snap = !state.snap; e.currentTarget.classList.toggle('active', state.snap); };
  $('#btnToggleMagnet').onclick = (e) => {
    state.magnetMain = !state.magnetMain;
    e.currentTarget.classList.toggle('active', state.magnetMain);
    if (state.magnetMain) { compactMainTrackIfMagnetic(); snapshotHistory(); renderTimeline(); renderNow(); }
  };
  $('#btnToggleLinked').onclick = (e) => { state.linkedSelection = !state.linkedSelection; e.currentTarget.classList.toggle('active', state.linkedSelection); };

  $('#btnAddTrackV').onclick = () => {
    const n = state.tracks.filter(t => t.type === 'overlay' || t.type === 'video').length + 1;
    state.tracks.unshift({ id: uid('tr'), name: `Overlay V${n}`, type: 'overlay', color: '#7c5dfa', muted: false, hidden: false, locked: false, clips: [] });
    snapshotHistory(); renderTimeline();
  };
  $('#btnAddTrackT').onclick = () => {
    const n = state.tracks.filter(t => t.type === 'text').length + 1;
    state.tracks.unshift({ id: uid('tr'), name: `Text T${n}`, type: 'text', color: '#f09b3a', muted: false, hidden: false, locked: false, clips: [] });
    snapshotHistory(); renderTimeline();
  };
  $('#btnAddTrackA').onclick = () => {
    const n = state.tracks.filter(t => t.type === 'audio').length + 1;
    state.tracks.push({ id: uid('tr'), name: `Audio A${n}`, type: 'audio', color: '#1fc496', muted: false, hidden: false, locked: false, clips: [] });
    snapshotHistory(); renderTimeline();
  };

  $('#zoomSlider').oninput = (e) => setZoomAnchored(Number(e.target.value));
  $('#zoomSlider').onchange = (e) => e.target.blur();
  $('#btnZoomIn').onclick = () => setZoomAnchored(state.zoom + 24);
  $('#btnZoomOut').onclick = () => setZoomAnchored(state.zoom - 24);
  $('#btnZoomFit').onclick = () => {
    const avail = Math.max(300, $('#timelineScroll').clientWidth - 40);
    setZoomAnchored(avail / Math.max(4, getProjectDuration() + 1));
  };

  // Cmd/Ctrl + Wheel Zoom (playhead-anchored) & Vertical scroll sync with track headers
  $('#timelineScroll').addEventListener('wheel', (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 18 : -18;
      setZoomAnchored(state.zoom + delta);
    }
  }, { passive: false });
  $('#timelineScroll').addEventListener('scroll', (e) => {
    $('#trackHeaderList').scrollTop = e.target.scrollTop;
  });

  // Ruler scrubbing (zero DOM thrashing — only updates playhead & timecode!)
  const scrubAt = (e) => {
    const rect = $('#timelineWrap').getBoundingClientRect();
    state.currentTime = quantize(Math.max(0, (e.clientX - rect.left) / state.zoom));
    renderNow();
  };
  const startScrub = (e) => {
    e.preventDefault();
    if (state.playing) togglePlay(false);
    scrubAt(e);
    const onMove = (ev) => scrubAt(ev);
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); renderInspector(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  $('#timelineRuler').addEventListener('mousedown', startScrub);
  $('.playhead-cap').addEventListener('mousedown', startScrub);

  // Empty Timeline Lane Click (Move Playhead) + Drag Marquee Multi-Select!
  $('#tracksContainer').addEventListener('mousedown', (e) => {
    if (e.target.closest('.tl-clip')) return;
    if (e.button !== 0) return;
    const wrapRect = $('#timelineWrap').getBoundingClientRect();
    const startX = e.clientX - wrapRect.left;
    const startY = e.clientY - wrapRect.top;
    const marquee = $('#marqueeBox');
    let isDragging = false;

    const onMove = (ev) => {
      const curX = ev.clientX - wrapRect.left;
      const curY = ev.clientY - wrapRect.top;
      if (Math.hypot(curX - startX, curY - startY) > 6) {
        isDragging = true;
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);
        marquee.style.left = `${left}px`;
        marquee.style.top = `${top}px`;
        marquee.style.width = `${width}px`;
        marquee.style.height = `${height}px`;
        marquee.classList.remove('hidden');

        // Hit-test clips inside marquee box
        const mRect = marquee.getBoundingClientRect();
        state.selectedClipIds.clear();
        let first = null;
        $$('#tracksContainer .tl-clip[data-clip-id]').forEach(el => {
          const r = el.getBoundingClientRect();
          const hit = !(r.right < mRect.left || r.left > mRect.right || r.bottom < mRect.top || r.top > mRect.bottom);
          el.classList.toggle('selected', hit);
          if (hit) {
            state.selectedClipIds.add(el.dataset.clipId);
            if (!first) first = el.dataset.clipId;
          }
        });
        state.selectedClipId = first;
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      marquee.classList.add('hidden');
      if (!isDragging) {
        // Plain click on empty lane moves playhead directly!
        const sec = quantize(Math.max(0, (ev.clientX - wrapRect.left) / state.zoom));
        state.currentTime = sec;
        renderNow();
      } else {
        renderInspector();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Captions
  $('#btnAddCaptionAtPlayhead').onclick = addCaptionAtPlayhead;
  $$('#captionStyleRow button').forEach(b => {
    b.onclick = () => {
      state.captionStyle = b.dataset.cstyle;
      $$('#captionStyleRow button').forEach(x => x.classList.toggle('active', x === b));
      snapshotHistory(); renderNow();
    };
  });
  $('#capYPos').oninput = (e) => { state.captionYPos = Number(e.target.value); renderNow(); };
  $('#capYPos').onchange = (e) => { e.target.blur(); snapshotHistory(); };
  $('#capFontSize').oninput = (e) => { state.captionFontSize = Number(e.target.value); renderNow(); };
  $('#capFontSize').onchange = (e) => { e.target.blur(); snapshotHistory(); };
  $('#btnImportSrt').onclick = () => $('#srtFileInput').click();
  $('#srtFileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    state.captions = parseSRT(await file.text());
    snapshotHistory(); renderTimeline(); renderCaptionsUI(); renderNow();
    showToast(`Imported ${state.captions.length} caption lines`);
    e.target.value = '';
  };
  $('#btnExportSrt').onclick = () => {
    if (!state.captions.length) return showToast('No captions to export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toSRT(state.captions)], { type: 'text/plain' }));
    a.download = `${state.title || 'captions'}.srt`;
    a.click();
  };

  // Text, FX & Smart Tools
  $('#btnAddDefaultText').onclick = () => addTextClip(TEXT_PRESETS[0]);
  $('#btnClearEffects').onclick = () => {
    const f = findClipAndTrack(state.selectedClipId);
    if (!f) return;
    if (f.track.locked) return showToast(`Track "${f.track.name}" is locked`);
    f.clip.effects = [];
    snapshotHistory(); renderTimeline(); renderEffectIntensityControls(); renderNow();
  };
  $('#btnAutoCrop').onclick = runAutoCrop;
  $('#btnVisionCutout').onclick = runVisionCutout;
  $('#btnAutoBeats').onclick = runAutoBeats;

  // Save / Load Project
  $('#btnSaveProj').onclick = saveProjectJSON;
  $('#btnLoadProj').onclick = () => $('#projFileInput').click();
  $('#projFileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      applySnapshot(txt, true);
      snapshotHistory();
      showToast('Project loaded');
    } catch { showToast('Invalid project JSON'); }
    e.target.value = '';
  };

  // Export Modal & Relink Modal & Shortcuts Modal
  $$('#exportModeTabs .seg-btn').forEach(b => {
    b.onclick = () => {
      state.exportMode = b.dataset.expmode;
      $$('#exportModeTabs .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      updateExportSummary();
    };
  });
  ['#expAspect', '#expRes', '#expFps', '#expCrf'].forEach(sel => {
    $(sel).onchange = updateExportSummary;
  });

  $('#btnExportOpen').onclick = () => {
    $('#expName').value = state.title || 'motioncut_export';
    $('#expFps').value = String(state.fps);
    $('#exportProgressWrap').classList.add('hidden');
    $('#exportResultBox').classList.add('hidden');
    updateExportSummary();
    $('#exportModal').classList.remove('hidden');
    $('#expName').focus();
  };
  $('#btnExportClose').onclick = closeOrCancelExportModal;
  $('#btnExportCancel').onclick = closeOrCancelExportModal;
  $('#btnExportStart').onclick = runExport;

  $('#btnRelinkClose').onclick = () => $('#relinkModal').classList.add('hidden');
  $('#btnRelinkDone').onclick = () => $('#relinkModal').classList.add('hidden');

  $('#btnShortcutsOpen').onclick = () => $('#shortcutsModal').classList.remove('hidden');
  $('#btnShortcutsClose').onclick = () => $('#shortcutsModal').classList.add('hidden');

  // Keyboard Shortcuts (Guard Cmd+S, wire Home/End/- /=/B/V/Cmd+C/V/A, ignore text inputs cleanly)
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const isTextInput = tag === 'TEXTAREA' || (tag === 'INPUT' && document.activeElement.type !== 'range' && document.activeElement.type !== 'button');
    const cmd = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape') {
      if (!$('#shortcutsModal').classList.contains('hidden')) { $('#shortcutsModal').classList.add('hidden'); return; }
      if (!$('#relinkModal').classList.contains('hidden')) { $('#relinkModal').classList.add('hidden'); return; }
      if (!$('#exportModal').classList.contains('hidden')) { closeOrCancelExportModal(); return; }
      closeContextMenu();
      return;
    }

    if (cmd && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProjectJSON();
      return;
    }

    if (isTextInput) return;

    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (k === 'v' && !cmd) setActiveTool('select');
    else if (k === 'b' && !cmd) setActiveTool('razor');
    else if ((k === 's' && !cmd) || (cmd && k === 'b')) { e.preventDefault(); splitSelectedClip(); }
    else if (cmd && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (cmd && k === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    else if (cmd && k === 'd') { e.preventDefault(); duplicateSelectedClip(); }
    else if (cmd && k === 'c') { e.preventDefault(); copySelectedClips(); }
    else if (cmd && k === 'v') { e.preventDefault(); pasteCopiedClips(); }
    else if (cmd && k === 'a') {
      e.preventDefault();
      state.selectedClipIds.clear();
      for (const tr of state.tracks) {
        if (tr.locked) continue;
        for (const c of tr.clips) { state.selectedClipIds.add(c.id); if (!state.selectedClipId) state.selectedClipId = c.id; }
      }
      renderTimeline();
      showToast(`Selected ${state.selectedClipIds.size} clip(s)`);
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedClips(e.shiftKey); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); state.currentTime = quantize(Math.max(0, state.currentTime - (e.shiftKey ? 10 : 1) / state.fps)); renderNow(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); state.currentTime = quantize(state.currentTime + (e.shiftKey ? 10 : 1) / state.fps); renderNow(); }
    else if (e.key === 'Home') { e.preventDefault(); state.currentTime = 0; renderNow(); }
    else if (e.key === 'End') { e.preventDefault(); state.currentTime = quantize(getProjectDuration()); renderNow(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoomAnchored(state.zoom - 22); }
    else if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoomAnchored(state.zoom + 22); }
    else if (k === 'm' && !cmd) $('#btnAddMarker').click();
    else if (e.key === '[') $('#btnToggleLeft').click();
    else if (e.key === ']') $('#btnToggleRight').click();
    else if (e.key === '?') $('#shortcutsModal').classList.toggle('hidden');
  });
}

async function refreshLibrary() {
  const r = await fetch('/api/library');
  const data = await r.json();
  state.library = data.items || [];
  renderMediaLibrary();
}

async function boot() {
  setupUIEvents();
  renderPresets();
  updateCanvasResBadge();
  await refreshLibrary();

  // Restore autosave cleanly if present!
  let restored = false;
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      applySnapshot(saved, true);
      state.history = [saved];
      state.historyIdx = 0;
      setSaveStatus('Restored');
      restored = true;
      // Fetch waveforms for restored audio/video clips
      const mediaIds = new Set(state.tracks.flatMap(t => t.clips).map(c => c.mediaId).filter(Boolean));
      for (const mid of mediaIds) {
        const m = state.library.find(x => x.id === mid);
        if (m && m.hasAudio && !state.waveforms.has(mid)) fetchWaveform(mid);
      }
    }
  } catch {}

  if (!restored) {
    loadStarterDemo();
  }
}

boot();
