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
  projectId: 'proj_' + Math.random().toString(36).slice(2, 10),
  mainTrackId: 't_vid1',
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

let projectEpoch = 0;

function getMainTrack() {
  const byId = state.tracks.find(tr => tr.id === state.mainTrackId);
  if (byId) return byId;
  // Fall back to bottom-most video track (never newly unshifted top tracks!)
  for (let i = state.tracks.length - 1; i >= 0; i--) {
    if (state.tracks[i].type === 'video') {
      state.mainTrackId = state.tracks[i].id;
      return state.tracks[i];
    }
  }
  return null;
}

function ensurePlayheadVisible() {
  const sc = $('#timelineScroll');
  if (!sc) return;
  const px = state.currentTime * state.zoom;
  const viewL = sc.scrollLeft;
  const viewR = viewL + sc.clientWidth;
  if (px > viewR - 48) sc.scrollLeft = px - sc.clientWidth * 0.25;
  else if (px < viewL + 24 && viewL > 0) sc.scrollLeft = Math.max(0, px - sc.clientWidth * 0.25);
}

function quantize(t) {
  const fps = Math.max(1, state.fps || 30);
  return Math.max(0, Math.round(t * fps) / fps);
}

function quantizeSigned(dt) {
  const fps = Math.max(1, state.fps || 30);
  return Math.round(dt * fps) / fps;
}

function validateProjectObject(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Invalid project file');
  const safeNum = (v, fb, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;
  };
  const safeStr = (v, fb = '') => (typeof v === 'string' ? v.slice(0, 2000) : fb);
  const validEases = new Set(['linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce']);
  const sanitizeKeyframes = (rawKf) => {
    const out = {};
    if (!rawKf || typeof rawKf !== 'object' || Array.isArray(rawKf)) return out;
    for (const [prop, list] of Object.entries(rawKf)) {
      if (!Array.isArray(list)) continue;
      const clean = list
        .filter(k => k && typeof k === 'object' && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
        .map(k => ({ t: Math.max(0, Number(k.t)), v: Number(k.v), ease: validEases.has(k.ease) ? k.ease : 'easeInOut' }));
      if (clean.length) out[prop] = clean;
    }
    return out;
  };
  const validTrackTypes = new Set(['video', 'overlay', 'text', 'graphic', 'audio']);
  const seenTrackIds = new Set();
  const seenClipIds = new Set();
  const validClipTypes = new Set(['video', 'audio', 'image', 'text', 'graphic']);
  const validFitModes = new Set(['contain', 'cover', 'stretch']);
  const validCurves = new Set(Object.keys(SPEED_CURVES));
  const tracks = Array.isArray(d.tracks) ? d.tracks.filter(tr => tr && typeof tr === 'object' && validTrackTypes.has(tr.type)).map(tr => {
    let tid = safeStr(tr.id, uid('tr'));
    if (seenTrackIds.has(tid)) tid = uid('tr');
    seenTrackIds.add(tid);
    return {
      id: tid,
      name: safeStr(tr.name, 'Track'),
      type: tr.type,
      color: /^#[0-9a-fA-F]{3,8}$/.test(tr.color || '') ? tr.color : '#3898d4',
      muted: Boolean(tr.muted),
      hidden: Boolean(tr.hidden),
      locked: Boolean(tr.locked),
      clips: Array.isArray(tr.clips) ? tr.clips.filter(c => c && typeof c === 'object').map(c => {
        const def = createDefaultClip({});
        let cid = safeStr(c.id, uid('clip'));
        if (seenClipIds.has(cid)) cid = uid('clip');
        seenClipIds.add(cid);
        const u0 = safeNum(c.curveStartU, 0, 0, 0.99);
        const u1 = Math.max(u0 + 0.005, safeNum(c.curveEndU, 1, 0.005, 1));
        return {
          ...def,
          ...c,
          id: cid,
          type: validClipTypes.has(c.type) ? c.type : (tr.type === 'audio' ? 'audio' : (tr.type === 'text' ? 'text' : 'video')),
          name: safeStr(c.name, 'Clip'),
          text: c.text !== undefined ? safeStr(c.text, '') : def.text,
          start: safeNum(c.start, 0, 0, 86400),
          duration: safeNum(c.duration, 1, 0.04, 86400),
          trimStart: safeNum(c.trimStart, 0, 0, 86400),
          speed: safeNum(c.speed, 1, 0.25, 8),
          speedCurve: validCurves.has(c.speedCurve) ? c.speedCurve : 'none',
          curveStartU: u0,
          curveEndU: Math.min(1, u1),
          reverse: Boolean(c.reverse),
          fadeIn: safeNum(c.fadeIn, 0, 0, 30),
          fadeOut: safeNum(c.fadeOut, 0, 0, 30),
          eqBass: safeNum(c.eqBass, 0, -18, 18),
          eqTreble: safeNum(c.eqTreble, 0, -18, 18),
          x: safeNum(c.x, 0, -8000, 8000),
          y: safeNum(c.y, 0, -8000, 8000),
          rotation: safeNum(c.rotation, 0, -3600, 3600),
          fitMode: validFitModes.has(c.fitMode) ? c.fitMode : 'contain',
          transInDur: safeNum(c.transInDur, 0.5, 0.05, 5),
          transOutDur: safeNum(c.transOutDur, 0.5, 0.05, 5),
          volume: safeNum(c.volume, 1, 0, 2),
          opacity: safeNum(c.opacity, 1, 0, 1),
          scale: safeNum(c.scale, 1, 0.05, 10),
          effects: Array.isArray(c.effects) ? c.effects.filter(x => typeof x === 'string') : [],
          effectIntensity: (c.effectIntensity && typeof c.effectIntensity === 'object' && !Array.isArray(c.effectIntensity)) ? c.effectIntensity : {},
          keyframes: sanitizeKeyframes(c.keyframes),
          mask: (c.mask && typeof c.mask === 'object' && !Array.isArray(c.mask)) ? { ...def.mask, ...c.mask } : def.mask,
          chromaKey: (c.chromaKey && typeof c.chromaKey === 'object' && !Array.isArray(c.chromaKey)) ? { ...def.chromaKey, ...c.chromaKey } : def.chromaKey,
        };
      }) : [],
    };
  }) : [];
  return {
    ...d,
    projectId: safeStr(d.projectId, state.projectId || uid('proj')),
    mainTrackId: safeStr(d.mainTrackId, 't_vid1'),
    title: safeStr(d.title, 'Untitled_Project'),
    aspect: ['16:9', '9:16', '1:1', '4:5', '21:9'].includes(d.aspect) ? d.aspect : '16:9',
    canvasWidth: safeNum(d.canvasWidth, 1920, 160, 5120),
    canvasHeight: safeNum(d.canvasHeight, 1080, 160, 5120),
    fps: safeNum(d.fps, 30, 1, 120),
    tracks: tracks.length ? tracks : makeEmptyTracks(),
    captions: Array.isArray(d.captions) ? d.captions.filter(c => c && typeof c === 'object').map(c => {
      const s = safeNum(c.start, 0, 0, 86400);
      const e = Math.max(s + 0.1, safeNum(c.end, s + 1, 0.1, 86400));
      return { id: safeStr(c.id, uid('cap')), start: s, end: e, text: safeStr(c.text, '') };
    }) : [],
    markers: Array.isArray(d.markers) ? d.markers.map(Number).filter(n => Number.isFinite(n) && n >= 0) : [],
  };
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
  engine.syncMediaForTime(state.currentTime, state.playing, shuttleSpeed);
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
    version: 7,
    projectId: state.projectId,
    mainTrackId: state.mainTrackId,
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
  projectEpoch++;
  const payload = buildProjectPayload();
  const snap = JSON.stringify(payload);
  if (state.history[state.historyIdx] === snap) return;
  state.history = state.history.slice(0, state.historyIdx + 1);
  state.history.push(snap);
  if (state.history.length > 60) state.history.shift();
  state.historyIdx = state.history.length - 1;
  try {
    localStorage.setItem(AUTOSAVE_KEY, snap);
    setSaveStatus('Saved locally');
  } catch (err) {
    setSaveStatus('Storage Full', 'error');
    showToast('Browser localStorage full — use Save button to export .mcut.json');
  }
}

function applySnapshot(snapStr, checkRelink = false, preserveSelection = false) {
  const prevPrimary = preserveSelection ? state.selectedClipId : null;
  const prevSet = preserveSelection ? new Set(state.selectedClipIds) : new Set();
  const d = validateProjectObject(JSON.parse(snapStr));
  projectEpoch++;
  state.projectId = d.projectId || state.projectId;
  state.mainTrackId = d.mainTrackId || 't_vid1';
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
  if (preserveSelection) {
    const existingIds = new Set(state.tracks.flatMap(t => t.clips.map(c => c.id)));
    state.selectedClipIds = new Set([...prevSet].filter(id => existingIds.has(id)));
    state.selectedClipId = (prevPrimary && existingIds.has(prevPrimary))
      ? prevPrimary : ([...state.selectedClipIds][0] || null);
  } else {
    state.selectedClipId = null;
    state.selectedClipIds.clear();
  }
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
  syncEffectsDrawer();
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
  applySnapshot(state.history[state.historyIdx], false, true);
  try { localStorage.setItem(AUTOSAVE_KEY, state.history[state.historyIdx]); } catch {}
  showToast('Undo');
}
function redo() {
  if (state.historyIdx >= state.history.length - 1) return showToast('Nothing to redo');
  state.historyIdx++;
  applySnapshot(state.history[state.historyIdx], false, true);
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

/** Magnetic Main Track: close gaps on the single designated Main Track sequentially */
function compactMainTrackIfMagnetic() {
  if (!state.magnetMain) return;
  const main = getMainTrack();
  if (!main || main.locked) return;
  main.clips.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const c of main.clips) {
    const delta = quantizeSigned(cursor - c.start);
    if (Math.abs(delta) > 0.001) {
      c.start = quantize(cursor);
      // Keep linked audio in sync with main track magnet when linkedSelection is active!
      if (c.linkGroupId && state.linkedSelection) {
        for (const tr of state.tracks) {
          if (tr.id === main.id || tr.locked) continue;
          for (const partner of tr.clips) {
            if (partner.linkGroupId === c.linkGroupId) {
              const desired = quantize(Math.max(0, partner.start + delta));
              partner.start = hasOverlap(tr, desired, partner.duration, new Set([partner.id]))
                ? resolveNonOverlappingStart(tr, desired, partner.duration, new Set([partner.id]))
                : desired;
            }
          }
        }
      }
    }
    cursor = quantize(c.start + c.duration);
  }
}

function findOrCreateFreeTrack(preferredType, start, duration) {
  // Never spawn a second 'video' track that could steal Main V1 — overflow video clips go to Overlay!
  const effectiveType = preferredType === 'video' ? 'overlay' : preferredType;
  const candidates = state.tracks.filter(t => (t.type === preferredType || t.type === effectiveType) && !t.locked);
  for (const tr of candidates) {
    if (!hasOverlap(tr, start, duration)) return tr;
  }
  const count = state.tracks.filter(t => t.type === effectiveType).length + 1;
  const colors = { video: '#3898d4', overlay: '#7c5dfa', text: '#f09b3a', audio: '#1fc496' };
  const labels = { overlay: `Overlay V${count + 1}`, text: `Text T${count}`, audio: `Audio A${count}` };
  const newTr = {
    id: uid('tr'),
    name: labels[effectiveType] || `Track ${count}`,
    type: effectiveType,
    color: colors[effectiveType] || '#7c5dfa',
    muted: false, hidden: false, locked: false, clips: [],
  };
  if (effectiveType === 'audio') state.tracks.push(newTr);
  else state.tracks.unshift(newTr);
  return newTr;
}

/** Reorder/insert a clip on the Magnetic Main Track at dropTime (respecting linkedSelection!) */
function insertOrReorderOnMainTrack(track, clip, dropTime) {
  const others = track.clips.filter(c => c.id !== clip.id).sort((a, b) => a.start - b.start);
  let insertIdx = others.length;
  for (let i = 0; i < others.length; i++) {
    const mid = others[i].start + others[i].duration * 0.5;
    if (dropTime < mid) { insertIdx = i; break; }
  }
  others.splice(insertIdx, 0, clip);
  track.clips = others;
  let cursor = 0;
  for (const c of track.clips) {
    const oldStart = c.start;
    const newStart = quantize(cursor);
    const delta = quantizeSigned(newStart - oldStart);
    c.start = newStart;
    if (c.linkGroupId && state.linkedSelection && Math.abs(delta) > 0.001) {
      for (const tr of state.tracks) {
        if (tr.id === track.id || tr.locked) continue;
        for (const p of tr.clips) {
          if (p.linkGroupId === c.linkGroupId) {
            const desired = quantize(Math.max(0, p.start + delta));
            p.start = hasOverlap(tr, desired, p.duration, new Set([p.id]))
              ? resolveNonOverlappingStart(tr, desired, p.duration, new Set([p.id]))
              : desired;
          }
        }
      }
    }
    cursor = quantize(c.start + c.duration);
  }
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
      const mainTr = getMainTrack();
      track = (mainTr && !mainTr.locked) ? mainTr : findOrCreateFreeTrack('video', 0, dur);
      start = dropTime !== null ? quantize(dropTime) : quantize(track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
    } else {
      start = dropTime !== null ? quantize(dropTime) : quantize(state.currentTime);
      track = findOrCreateFreeTrack(desiredType, start, dur);
    }
  } else {
    start = dropTime !== null ? quantize(dropTime) : quantize(track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
  }

  const isMagneticInsert = track.id === getMainTrack()?.id && state.magnetMain && dropTime !== null;
  if (!isMagneticInsert && hasOverlap(track, start, dur)) {
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
  if (isMagneticInsert) {
    insertOrReorderOnMainTrack(track, clip, start);
  } else {
    track.clips.push(clip);
    compactMainTrackIfMagnetic();
  }
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

function synthesizeSfxWavBuffer(preset) {
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
  return buf;
}

let previewAudioEl = null;
function auditionAudioUrl(url) {
  if (previewAudioEl) { try { previewAudioEl.pause(); } catch {} previewAudioEl = null; }
  const a = new Audio(url);
  previewAudioEl = a;
  a.play().catch(() => {});
}

function previewProceduralSfx(preset) {
  const buf = synthesizeSfxWavBuffer(preset);
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  auditionAudioUrl(url);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Synthesize WAV bytes & persist to server once per preset ID so SFX survive reload, deduplicate, and export cleanly! */
async function addProceduralSfx(preset) {
  const targetName = `SFX_${preset.id}.wav`;
  const existing = state.library.find(m => m.name === targetName && m.type === 'audio');
  if (existing) {
    addMediaToTimeline(existing, null, state.currentTime);
    showToast(`Added SFX: ${preset.name}`);
    return;
  }
  const buf = synthesizeSfxWavBuffer(preset);
  showToast(`Generating ${preset.name}...`);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: apiHeaders({
        'X-Filename': encodeURIComponent(targetName),
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

// ── PLAYBACK LOOP (Smooth 60fps + Auto-Scroll + J/K/L Shuttle + VU Meter) ───
let rafId = null;
let lastFrameTs = 0;
let shuttleSpeed = 1;

function tick(ts) {
  if (!state.playing) return;
  if (!lastFrameTs) lastFrameTs = ts;
  const dt = Math.min(0.05, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;
  state.currentTime = Math.max(0, state.currentTime + dt * shuttleSpeed);
  const maxDur = getProjectDuration();
  if (shuttleSpeed < 0 && state.currentTime <= 0) {
    state.currentTime = 0;
    shuttleSpeed = 1;
    togglePlay(false);
    return;
  }
  if (maxDur > 0 && state.currentTime >= maxDur) {
    if (state.loop) state.currentTime = 0;
    else { state.currentTime = maxDur; shuttleSpeed = 1; togglePlay(false); return; }
  }
  renderNow();
  // Auto-scroll timeline viewport to keep playhead visible during playback
  const sc = $('#timelineScroll');
  if (sc) {
    const px = state.currentTime * state.zoom;
    const viewL = sc.scrollLeft;
    const viewR = viewL + sc.clientWidth;
    if (px > viewR - 48) sc.scrollLeft = px - sc.clientWidth * 0.2;
    else if (px < viewL + 24 && viewL > 0) sc.scrollLeft = Math.max(0, px - sc.clientWidth * 0.2);
  }
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
    cancelAnimationFrame(rafId); // Prevent multiple stacked RAF loops on repeated J/L shuttle!
    engine.ensureAudioCtx();
    lastFrameTs = 0;
    rafId = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(rafId);
    rafId = null;
    shuttleSpeed = 1;
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

    // Click empty lane space to deselect clip/caption cleanly
    lane.addEventListener('mousedown', (e) => {
      if (e.target !== lane) return;
      if (state.selectedClipId || state.selectedClipIds.size || state.selectedCaptionId) {
        state.selectedClipId = null;
        state.selectedClipIds.clear();
        state.selectedCaptionId = null;
        $$('.tl-clip.selected').forEach(n => n.classList.remove('selected'));
        renderInspector();
        syncEffectsDrawer();
        renderNow();
      }
    });

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

      // Source-aligned filmstrip background (mirrors cleanly when reversed)!
      const media = clip.mediaId ? state.library.find(m => m.id === clip.mediaId) : null;
      if (media && media.filmstripUrl && clip.type === 'video') {
        const fsDiv = document.createElement('div');
        fsDiv.className = 'clip-filmstrip';
        if (clip.reverse) fsDiv.style.transform = 'scaleX(-1)';
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
  capLane.addEventListener('mousedown', (e) => {
    if (e.target !== capLane) return;
    if (state.selectedClipId || state.selectedClipIds.size || state.selectedCaptionId) {
      state.selectedClipId = null;
      state.selectedClipIds.clear();
      state.selectedCaptionId = null;
      $$('.tl-clip.selected').forEach(n => n.classList.remove('selected'));
      renderInspector(); syncEffectsDrawer(); renderNow();
    }
  });
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

function getSnapPoints(excludeClipIds = new Set(), excludeCaptionId = null) {
  const pts = [0, state.currentTime, ...state.markers];
  for (const tr of state.tracks) {
    for (const c of tr.clips) {
      if (excludeClipIds.has(c.id)) continue;
      pts.push(c.start, c.start + c.duration);
    }
  }
  for (const cap of state.captions) {
    if (excludeCaptionId && cap.id === excludeCaptionId) continue;
    pts.push(cap.start, cap.end);
  }
  return pts;
}

function snapBothEdges(rawStart, duration, excludeIds, excludeCaptionId = null) {
  if (!state.snap) { $('#snapGuide').classList.add('hidden'); return quantize(rawStart); }
  const thresh = 9 / state.zoom;
  const pts = getSnapPoints(excludeIds, excludeCaptionId);
  let bestStart = quantize(rawStart);
  let bestDist = thresh;
  let guideAt = null;
  for (const p of pts) {
    const dStart = Math.abs(rawStart - p);
    if (dStart < bestDist) { bestDist = dStart; bestStart = p; guideAt = p; }
    if (duration > 0.001) {
      const dEnd = Math.abs((rawStart + duration) - p);
      if (dEnd < bestDist) { bestDist = dEnd; bestStart = p - duration; guideAt = p; }
    }
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
    // Switch left rail to Captions tab for immediate editing
    const capTabBtn = $('.rail-btn[data-tab="captions"]');
    if (capTabBtn && !capTabBtn.classList.contains('active')) capTabBtn.click();
    const startX = e.clientX;
    const origStart = cap.start;
    const origEnd = cap.end;
    const dur = origEnd - origStart;
    const mode = e.target === hL ? 'trimL' : (e.target === hR ? 'trimR' : 'move');

    const onMove = (ev) => {
      const dt = (ev.clientX - startX) / state.zoom;
      if (mode === 'move') {
        const snapped = snapBothEdges(Math.max(0, origStart + dt), dur, new Set(), cap.id);
        cap.start = quantize(snapped);
        cap.end = quantize(cap.start + dur);
      } else if (mode === 'trimL') {
        const raw = Math.max(0, Math.min(origEnd - 0.15, origStart + dt));
        const snapped = snapBothEdges(raw, 0, new Set(), cap.id);
        cap.start = quantize(Math.max(0, Math.min(origEnd - 0.15, snapped)));
      } else {
        const raw = Math.max(origStart + 0.15, origEnd + dt);
        const snapped = snapBothEdges(raw, 0, new Set(), cap.id);
        cap.end = quantize(Math.max(origStart + 0.15, Math.abs(snapped - raw) < 9 / state.zoom ? snapped : raw));
      }
      cel.style.left = `${cap.start * state.zoom}px`;
      cel.style.width = `${Math.max(14, (cap.end - cap.start) * state.zoom)}px`;
      showDragHud(cap.start * state.zoom, cel.parentElement.offsetTop, `${formatTC(cap.start, state.fps)} – ${formatTC(cap.end, state.fps)}`);
      renderNow();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      $('#snapGuide').classList.add('hidden');
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
      if (state.selectedClipIds.has(clip.id)) {
        state.selectedClipIds.delete(clip.id);
        if (state.selectedClipId === clip.id) {
          state.selectedClipId = [...state.selectedClipIds][0] || null;
        }
      } else {
        state.selectedClipIds.add(clip.id);
        state.selectedClipId = clip.id;
      }
      renderTimeline();
      renderInspector();
      syncEffectsDrawer();
      return;
    }

    if (!state.selectedClipIds.has(clip.id)) {
      selectSingleClip(clip.id);
      $$('.tl-clip').forEach(node => node.classList.toggle('selected', state.selectedClipIds.has(node.dataset.clipId)));
      renderInspector();
      syncEffectsDrawer();
      renderNow();
    }

    if (track.locked) return showToast(`Track "${track.name}" is locked`);

    const startX = e.clientX;
    const scrollBox = $('#timelineScroll');
    const startScrollLeft = scrollBox ? scrollBox.scrollLeft : 0;
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
      curveStartU: Number(x.clip.curveStartU ?? 0),
      curveEndU: Number(x.clip.curveEndU ?? 1),
      keyframes: structuredClone(x.clip.keyframes || {}),
    }]));

    // Neighbor bounds on same track for collision-safe trimming
    const sameTrackOthers = track.clips.filter(c => c.id !== clip.id);
    const prevNeighborEnd = sameTrackOthers
      .filter(c => c.start + c.duration <= clip.start + 0.005)
      .reduce((mx, c) => Math.max(mx, c.start + c.duration), 0);
    const nextNeighborStart = sameTrackOthers
      .filter(c => c.start >= clip.start + clip.duration - 0.005)
      .reduce((mn, c) => Math.min(mn, c.start), Infinity);

    const isTrackCompatible = (srcClip, dstTrack) => {
      if (!dstTrack || dstTrack.locked) return false;
      if (srcClip.type === 'audio') return dstTrack.type === 'audio';
      if (srcClip.type === 'text') return dstTrack.type === 'text';
      if (srcClip.type === 'graphic') return dstTrack.type === 'overlay' || dstTrack.type === 'text';
      return dstTrack.type === 'video' || dstTrack.type === 'overlay';
    };

  // Check if the selection is a single logical unit (1 clip OR 1 primary clip + its linked partners)
    const isSingleLogicalUnit = initMap.size === 1 || (
      Boolean(clip.linkGroupId) && [...initMap.values()].every(x => x.clip.linkGroupId === clip.linkGroupId)
    );
    const linkedPartners = clip.linkGroupId
      ? state.tracks.flatMap(tr => tr.locked ? [] : tr.clips.filter(p => p.id !== clip.id && p.linkGroupId === clip.linkGroupId).map(p => ({
        clip: p, track: tr, el: $(`.tl-clip[data-clip-id="${p.id}"]`),
        origStart: p.start, origDur: p.duration, origTrim: p.trimStart || 0,
        origU0: Number(p.curveStartU ?? 0), origU1: Number(p.curveEndU ?? 1),
        origKeyframes: structuredClone(p.keyframes || {}),
        prevEnd: tr.clips.filter(o => o.id !== p.id && o.start + o.duration <= p.start + 0.005).reduce((mx, o) => Math.max(mx, o.start + o.duration), 0),
        nextStart: tr.clips.filter(o => o.id !== p.id && o.start >= p.start + p.duration - 0.005).reduce((mn, o) => Math.min(mn, o.start), Infinity),
      })))
      : [];

    let moved = false;
    let hoverTargetTrack = null;
    let lastDropTime = clip.start;

    const onMove = (ev) => {
      // Drag-edge autoscroll
      const sRect = scrollBox.getBoundingClientRect();
      if (ev.clientX > sRect.right - 36) scrollBox.scrollLeft += 14;
      else if (ev.clientX < sRect.left + 36) scrollBox.scrollLeft = Math.max(0, scrollBox.scrollLeft - 14);

      const dx = (ev.clientX - startX) + (scrollBox.scrollLeft - startScrollLeft);
      if (Math.abs(dx) > 2) moved = true;
      const dt = dx / state.zoom;

      if (mode === 'move') {
        const primary = initMap.get(clip.id);
        const snappedStart = snapBothEdges(Math.max(0, primary.start + dt), primary.duration, excludeIds);
        const appliedDt = snappedStart - primary.start;
        for (const item of initMap.values()) {
          item.clip.start = quantize(Math.max(0, item.start + appliedDt));
          if (item.el) item.el.style.left = `${item.clip.start * state.zoom}px`;
        }
        // Compute pointer drop time for Magnetic Main Track insert-before + visual insertion bar
        const laneRect = el.parentElement.getBoundingClientRect();
        lastDropTime = Math.max(0, (ev.clientX - laneRect.left) / state.zoom);
        if (isSingleLogicalUnit && track.id === getMainTrack()?.id && state.magnetMain) {
          const others = track.clips.filter(c => c.id !== clip.id).sort((a, b) => a.start - b.start);
          let insX = others.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
          for (const o of others) {
            if (lastDropTime < o.start + o.duration * 0.5) { insX = o.start; break; }
          }
          const sg = $('#snapGuide');
          sg.style.left = `${insX * state.zoom}px`;
          sg.classList.remove('hidden');
        }
        // Detect vertical cross-track drag target (works for single clip OR single linked unit!)
        $$('.track-lane.drop-target').forEach(l => l.classList.remove('drop-target'));
        hoverTargetTrack = null;
        if (isSingleLogicalUnit) {
          const lanes = $$('.track-lane[data-track-id]');
          for (const lane of lanes) {
            const lr = lane.getBoundingClientRect();
            if (ev.clientY >= lr.top && ev.clientY <= lr.bottom) {
              const cand = state.tracks.find(t => t.id === lane.dataset.trackId);
              if (cand && cand.id !== track.id && isTrackCompatible(clip, cand)) {
                hoverTargetTrack = cand;
                lane.classList.add('drop-target');
                moved = true;
              }
              break;
            }
          }
        }
        const laneLabel = hoverTargetTrack ? ` → ${hoverTargetTrack.name}` : '';
        showDragHud(clip.start * state.zoom, el.parentElement.offsetTop, `${formatTC(clip.start, state.fps)} (${initMap.size > 1 ? `${initMap.size} clips` : `${clip.duration.toFixed(2)}s`})${laneLabel}`);
      } else if (mode === 'trimL') {
        const orig = initMap.get(clip.id);
        const speed = clip.speed || 1;
        const avgMult = (clip.speedCurve && clip.speedCurve !== 'none') ? (getClipSourceSpan({ ...clip, duration: orig.duration, curveStartU: orig.curveStartU ?? 0, curveEndU: orig.curveEndU ?? 1 }) / Math.max(0.04, orig.duration)) : speed;
        let maxTrimIn = orig.duration - 0.12;
        let maxExtendByNeighbor = prevNeighborEnd - orig.start;
        let maxExtendBySource = clip.reverse
          ? -Math.max(0, (clip.sourceDuration - (orig.trimStart + orig.duration * avgMult)) / Math.max(0.1, avgMult))
          : -(orig.trimStart / Math.max(0.1, avgMult));
        if (state.linkedSelection) {
          for (const lp of linkedPartners) {
            const pSpeed = lp.clip.speed || 1;
            const pAvg = (lp.clip.speedCurve && lp.clip.speedCurve !== 'none')
              ? (getClipSourceSpan({ ...lp.clip, duration: lp.origDur, curveStartU: lp.origU0, curveEndU: lp.origU1 }) / Math.max(0.04, lp.origDur))
              : pSpeed;
            maxTrimIn = Math.min(maxTrimIn, lp.origDur - 0.12);
            maxExtendByNeighbor = Math.max(maxExtendByNeighbor, lp.prevEnd - lp.origStart);
            const pExtSrc = lp.clip.reverse
              ? -Math.max(0, (lp.clip.sourceDuration - (lp.origTrim + lp.origDur * pAvg)) / Math.max(0.1, pAvg))
              : -(lp.origTrim / Math.max(0.1, pAvg));
            maxExtendBySource = Math.max(maxExtendBySource, pExtSrc);
          }
        }
        const minDelta = Math.max(maxExtendByNeighbor, maxExtendBySource);
        let delta = Math.max(minDelta, Math.min(maxTrimIn, dt));
        // Snap ONLY the moving left edge (duration = 0) so the stationary right edge never hijacks snapping!
        const snappedStart = snapBothEdges(Math.max(prevNeighborEnd, orig.start + delta), 0, excludeIds);
        delta = Math.max(minDelta, Math.min(maxTrimIn, snappedStart - orig.start));
        clip.start = quantize(orig.start + delta);
        clip.duration = quantize(orig.duration - delta);
        if (!clip.reverse) {
          const baseClip = { ...clip, duration: orig.duration, trimStart: orig.trimStart, curveStartU: orig.curveStartU ?? 0, curveEndU: orig.curveEndU ?? 1 };
          clip.trimStart = delta >= 0
            ? Math.max(0, getSourceTime(baseClip, delta, clip.sourceDuration))
            : Math.max(0, orig.trimStart + delta * avgMult);
        }
        if (clip.speedCurve && clip.speedCurve !== 'none') {
          const u0 = Number(orig.curveStartU ?? 0), u1 = Number(orig.curveEndU ?? 1);
          clip.curveStartU = Math.max(0, Math.min(u1 - 0.01, u0 + (delta / Math.max(0.04, orig.duration)) * (u1 - u0)));
        }
        const rebaseKfsLeft = (origKfs, targetClip, d) => {
          const rebased = {};
          for (const [prop, list] of Object.entries(origKfs)) {
            const sorted = [...list].sort((a, b) => a.t - b.t);
            const hasBefore = sorted.some(k => k.t < d - 0.001);
            const hasAfter = sorted.some(k => k.t > d + 0.001);
            const hasExact = sorted.some(k => Math.abs(k.t - d) <= 0.001);
            const shifted = sorted.map(k => ({ ...k, t: quantize(k.t - d) })).filter(k => k.t >= 0 && k.t <= targetClip.duration);
            if (d > 0.001 && hasBefore && hasAfter && !hasExact) {
              const bVal = evalKeyframe({ ...targetClip, keyframes: origKfs }, prop, d, targetClip[prop] ?? 0);
              shifted.unshift({ t: 0, v: bVal, ease: 'easeInOut' });
            }
            if (shifted.length) rebased[prop] = shifted;
          }
          return rebased;
        };
        clip.keyframes = rebaseKfsLeft(orig.keyframes, clip, delta);
        // Sync linked partner clips using each partner's OWN speed & source bounds!
        if (state.linkedSelection) {
          for (const lp of linkedPartners) {
            const pSpeed = lp.clip.speed || 1;
            const pAvg = (lp.clip.speedCurve && lp.clip.speedCurve !== 'none')
              ? (getClipSourceSpan({ ...lp.clip, duration: lp.origDur, curveStartU: lp.origU0, curveEndU: lp.origU1 }) / Math.max(0.04, lp.origDur))
              : pSpeed;
            lp.clip.start = quantize(Math.max(0, lp.origStart + delta));
            lp.clip.duration = quantize(Math.max(0.12, lp.origDur - delta));
            if (!lp.clip.reverse) {
              const pBase = { ...lp.clip, duration: lp.origDur, trimStart: lp.origTrim, curveStartU: lp.origU0, curveEndU: lp.origU1 };
              lp.clip.trimStart = delta >= 0
                ? Math.max(0, getSourceTime(pBase, delta, lp.clip.sourceDuration))
                : Math.max(0, lp.origTrim + delta * pAvg);
            }
            if (lp.clip.speedCurve && lp.clip.speedCurve !== 'none') {
              lp.clip.curveStartU = Math.max(0, Math.min(lp.origU1 - 0.01, lp.origU0 + (delta / Math.max(0.04, lp.origDur)) * (lp.origU1 - lp.origU0)));
            }
            lp.clip.keyframes = rebaseKfsLeft(lp.origKeyframes, lp.clip, delta);
            if (lp.el) {
              lp.el.style.left = `${lp.clip.start * state.zoom}px`;
              lp.el.style.width = `${Math.max(14, lp.clip.duration * state.zoom)}px`;
            }
          }
        }
        el.style.left = `${clip.start * state.zoom}px`;
        el.style.width = `${Math.max(14, clip.duration * state.zoom)}px`;
        showDragHud(clip.start * state.zoom, el.parentElement.offsetTop, `In ${formatTC(clip.start, state.fps)} · Dur ${clip.duration.toFixed(2)}s`);
      } else if (mode === 'trimR') {
        const orig = initMap.get(clip.id);
        const speed = clip.speed || 1;
        const allowRippleExtend = track.id === getMainTrack()?.id && state.magnetMain;
        let maxDurDeltaByNeighbor = (!allowRippleExtend && Number.isFinite(nextNeighborStart))
          ? (nextNeighborStart - (orig.start + orig.duration)) : Infinity;
        const avgMult = (clip.speedCurve && clip.speedCurve !== 'none') ? (getClipSourceSpan({ ...clip, duration: orig.duration, curveStartU: orig.curveStartU ?? 0, curveEndU: orig.curveEndU ?? 1 }) / Math.max(0.04, orig.duration)) : speed;
        let maxDurBySource = (clip.type === 'text' || clip.type === 'image' || clip.type === 'graphic')
          ? 300
          : (clip.reverse
            ? Math.max(0.2, (orig.trimStart + orig.duration * avgMult) / Math.max(0.1, avgMult))
            : Math.max(0.2, (clip.sourceDuration - (orig.trimStart || 0)) / Math.max(0.1, avgMult)));
        let maxDurDeltaBySource = maxDurBySource - orig.duration;
        let minDurDelta = 0.12 - orig.duration;
        if (state.linkedSelection) {
          for (const lp of linkedPartners) {
            const pSpeed = lp.clip.speed || 1;
            const pAvg = (lp.clip.speedCurve && lp.clip.speedCurve !== 'none')
              ? (getClipSourceSpan({ ...lp.clip, duration: lp.origDur, curveStartU: lp.origU0, curveEndU: lp.origU1 }) / Math.max(0.04, lp.origDur))
              : pSpeed;
            if (Number.isFinite(lp.nextStart)) {
              maxDurDeltaByNeighbor = Math.min(maxDurDeltaByNeighbor, lp.nextStart - (lp.origStart + lp.origDur));
            }
            const pMaxSrc = lp.clip.reverse
              ? Math.max(0.2, (lp.origTrim + lp.origDur * pAvg) / Math.max(0.1, pAvg))
              : Math.max(0.2, (lp.clip.sourceDuration - lp.origTrim) / Math.max(0.1, pAvg));
            maxDurDeltaBySource = Math.min(maxDurDeltaBySource, pMaxSrc - lp.origDur);
            minDurDelta = Math.max(minDurDelta, 0.12 - lp.origDur);
          }
        }
        const maxDur = Math.max(0.12, orig.duration + Math.min(maxDurDeltaByNeighbor, maxDurDeltaBySource));
        const minDur = Math.max(0.12, orig.duration + minDurDelta);
        let nextDur = quantize(Math.max(minDur, Math.min(maxDur, orig.duration + dt)));
        if (state.snap) {
          const snappedEnd = snapBothEdges(orig.start + nextDur, 0, excludeIds);
          if (Math.abs(snappedEnd - (orig.start + nextDur)) < 9 / state.zoom) {
            nextDur = quantize(Math.max(minDur, Math.min(maxDur, snappedEnd - orig.start)));
          }
        }
        const clampKfsRight = (origKfs, targetClip, durLimit) => {
          const out = {};
          for (const [prop, list] of Object.entries(origKfs)) {
            const sorted = [...list].sort((a, b) => a.t - b.t);
            const hasBefore = sorted.some(k => k.t < durLimit - 0.001);
            const hasAfter = sorted.some(k => k.t > durLimit + 0.001);
            const hasExact = sorted.some(k => Math.abs(k.t - durLimit) <= 0.001);
            const kept = sorted.filter(k => k.t <= durLimit + 0.001).map(k => ({ ...k }));
            if (hasBefore && hasAfter && !hasExact) {
              const bVal = evalKeyframe({ ...targetClip, keyframes: origKfs }, prop, durLimit, targetClip[prop] ?? 0);
              kept.push({ t: quantize(durLimit), v: bVal, ease: 'easeInOut' });
            }
            if (kept.length) out[prop] = kept;
          }
          return out;
        };
        if (clip.reverse) {
          const baseClip = { ...clip, duration: orig.duration, trimStart: orig.trimStart, curveStartU: orig.curveStartU ?? 0, curveEndU: orig.curveEndU ?? 1 };
          clip.trimStart = nextDur <= orig.duration
            ? Math.max(0, getSourceTime(baseClip, nextDur, clip.sourceDuration))
            : Math.max(0, orig.trimStart - (nextDur - orig.duration) * avgMult);
        }
        if (clip.speedCurve && clip.speedCurve !== 'none') {
          const u0 = Number(orig.curveStartU ?? 0), u1 = Number(orig.curveEndU ?? 1);
          clip.curveEndU = Math.max(u0 + 0.01, Math.min(1, u0 + (nextDur / Math.max(0.04, orig.duration)) * (u1 - u0)));
        }
        clip.duration = nextDur;
        clip.keyframes = clampKfsRight(orig.keyframes, clip, nextDur);
        if (state.linkedSelection) {
          const durDelta = nextDur - orig.duration;
          for (const lp of linkedPartners) {
            const pSpeed = lp.clip.speed || 1;
            const pAvg = (lp.clip.speedCurve && lp.clip.speedCurve !== 'none')
              ? (getClipSourceSpan({ ...lp.clip, duration: lp.origDur, curveStartU: lp.origU0, curveEndU: lp.origU1 }) / Math.max(0.04, lp.origDur))
              : pSpeed;
            const pNextDur = quantize(Math.max(0.12, lp.origDur + durDelta));
            if (lp.clip.reverse) {
              const pBase = { ...lp.clip, duration: lp.origDur, trimStart: lp.origTrim, curveStartU: lp.origU0, curveEndU: lp.origU1 };
              lp.clip.trimStart = pNextDur <= lp.origDur
                ? Math.max(0, getSourceTime(pBase, pNextDur, lp.clip.sourceDuration))
                : Math.max(0, lp.origTrim - (pNextDur - lp.origDur) * pAvg);
            }
            if (lp.clip.speedCurve && lp.clip.speedCurve !== 'none') {
              lp.clip.curveEndU = Math.max(lp.origU0 + 0.01, Math.min(1, lp.origU0 + (pNextDur / Math.max(0.04, lp.origDur)) * (lp.origU1 - lp.origU0)));
            }
            lp.clip.duration = pNextDur;
            lp.clip.keyframes = clampKfsRight(lp.origKeyframes, lp.clip, pNextDur);
            if (lp.el) lp.el.style.width = `${Math.max(14, lp.clip.duration * state.zoom)}px`;
          }
        }
        el.style.width = `${Math.max(14, clip.duration * state.zoom)}px`;
        showDragHud((clip.start + clip.duration) * state.zoom, el.parentElement.offsetTop, `Out ${formatTC(clip.start + clip.duration, state.fps)} · Dur ${clip.duration.toFixed(2)}s`);
      }
      renderNow();
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      $('#snapGuide').classList.add('hidden');
      $$('.track-lane.drop-target').forEach(l => l.classList.remove('drop-target'));
      hideDragHud();
      if (moved) {
        if (mode === 'move') {
          if (hoverTargetTrack && hoverTargetTrack.id !== track.id) {
            track.clips = track.clips.filter(c => c.id !== clip.id);
            hoverTargetTrack.clips.push(clip);
            initMap.get(clip.id).track = hoverTargetTrack;
            showToast(`Moved "${clip.name}" to ${hoverTargetTrack.name}`);
          }
          const finalTrack = initMap.get(clip.id).track;
          if (isSingleLogicalUnit && finalTrack.id === getMainTrack()?.id && state.magnetMain) {
            for (const item of initMap.values()) {
              if (item.clip.id !== clip.id) item.clip.start = item.start;
            }
            clip.start = initMap.get(clip.id).start;
            insertOrReorderOnMainTrack(finalTrack, clip, lastDropTime);
          } else {
            // Converging group collision resolution: loop until ZERO members overlap any clip on any lane!
            for (let pass = 0; pass < 20; pass++) {
              let maxShift = 0;
              for (const item of initMap.values()) {
                const others = new Set(item.track.clips.filter(c => excludeIds.has(c.id)).map(c => c.id));
                if (hasOverlap(item.track, item.clip.start, item.clip.duration, others)) {
                  const resolved = resolveNonOverlappingStart(item.track, item.clip.start, item.clip.duration, others);
                  maxShift = Math.max(maxShift, resolved - item.clip.start);
                }
              }
              if (maxShift <= 0.001) break;
              for (const item of initMap.values()) {
                item.clip.start = quantize(item.clip.start + maxShift);
              }
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
/** Partition keyframes across a split point while preserving exact evaluated value at the cut! */
function partitionKeyframesAtCut(clip, cutLocal) {
  const leftKf = {};
  const rightKf = {};
  for (const [prop, list] of Object.entries(clip.keyframes || {})) {
    if (!Array.isArray(list) || !list.length) continue;
    const sorted = [...list].sort((a, b) => a.t - b.t);
    const hasBefore = sorted.some(k => k.t < cutLocal - 0.001);
    const hasAfter = sorted.some(k => k.t > cutLocal + 0.001);
    const hasExact = sorted.some(k => Math.abs(k.t - cutLocal) <= 0.001);
    const cutVal = evalKeyframe(clip, prop, cutLocal, clip[prop] ?? 0);

    const lList = sorted.filter(k => k.t <= cutLocal + 0.001).map(k => ({ ...k }));
    const rList = sorted.filter(k => k.t >= cutLocal - 0.001).map(k => ({ ...k, t: quantize(Math.max(0, k.t - cutLocal)) }));

    if (hasBefore && hasAfter && !hasExact) {
      lList.push({ t: quantize(cutLocal), v: cutVal, ease: 'linear' });
      rList.unshift({ t: 0, v: cutVal, ease: 'linear' });
    }
    if (lList.length) leftKf[prop] = lList;
    if (rList.length) rightKf[prop] = rList;
  }
  return { leftKf, rightKf };
}

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
  const origTrim = clip.trimStart || 0;
  const origTotalSpan = getClipSourceSpan(clip);

  // Partition & shift keyframes with boundary value preservation!
  const { leftKf, rightKf } = partitionKeyframesAtCut(clip, leftDur);

  const rightClip = structuredClone(clip);
  rightClip.id = uid('clip');
  rightClip.start = t;
  rightClip.duration = rightDur;
  rightClip.keyframes = rightKf;
  rightClip.transIn = 'none';
  rightClip.linkGroupId = null;

  if (clip.reverse) {
    // Reversed clip plays backwards from (origTrim + origTotalSpan) down to origTrim:
    // Left half covers [srcAtCut .. origTrim + origTotalSpan], Right half covers [origTrim .. srcAtCut]
    clip.trimStart = Math.max(0, srcAtCut);
    rightClip.trimStart = Math.max(0, origTrim);
  } else {
    rightClip.trimStart = Math.max(0, srcAtCut);
  }

  // Preserve speedCurve shape across split by slicing [curveStartU, curveEndU]!
  const splitCurveOnHalves = (leftC, rightC, origDur, lDur) => {
    if (leftC.speedCurve && leftC.speedCurve !== 'none') {
      const u0 = Number(leftC.curveStartU ?? 0);
      const u1 = Number(leftC.curveEndU ?? 1);
      const midU = u0 + (lDur / Math.max(0.04, origDur)) * (u1 - u0);
      leftC.curveStartU = u0;
      leftC.curveEndU = midU;
      rightC.curveStartU = midU;
      rightC.curveEndU = u1;
    }
  };
  splitCurveOnHalves(clip, rightClip, clip.duration, leftDur);

  clip.duration = leftDur;
  clip.keyframes = leftKf;
  clip.transOut = 'none';
  clip.fadeOut = 0;       // Clear internal fade-out at cut so split never dips audio
  rightClip.fadeIn = 0;   // Clear internal fade-in at cut
  track.clips.push(rightClip);

  // Split linked partner clip(s) with ONE shared right-side linkGroupId + clean fades
  if (clip.linkGroupId && state.linkedSelection) {
    const newLink = uid('lnk');
    let anyPartnerSplit = false;
    for (const tr of state.tracks) {
      if (tr.id === track.id || tr.locked) continue;
      const partner = tr.clips.find(p => p.linkGroupId === clip.linkGroupId && t > p.start + 0.06 && t < p.start + p.duration - 0.06);
      if (partner) {
        const pOrigDur = partner.duration;
        const pLeftDur = quantize(t - partner.start);
        const pRightDur = quantize(partner.duration - pLeftDur);
        const pOrigTrim = partner.trimStart || 0;
        const pSrcAtCut = getSourceTime(partner, pLeftDur, partner.sourceDuration);
        const { leftKf: pLeftKf, rightKf: pRightKf } = partitionKeyframesAtCut(partner, pLeftDur);
        const pRight = structuredClone(partner);
        pRight.id = uid('clip');
        pRight.start = t;
        pRight.duration = pRightDur;
        pRight.keyframes = pRightKf;
        pRight.fadeIn = 0;
        if (partner.reverse) {
          partner.trimStart = Math.max(0, pSrcAtCut);
          pRight.trimStart = Math.max(0, pOrigTrim);
        } else {
          pRight.trimStart = Math.max(0, pSrcAtCut);
        }
        splitCurveOnHalves(partner, pRight, pOrigDur, pLeftDur);
        pRight.linkGroupId = newLink;
        anyPartnerSplit = true;
        partner.duration = pLeftDur;
        partner.keyframes = pLeftKf;
        partner.fadeOut = 0;
        tr.clips.push(pRight);
      }
    }
    if (anyPartnerSplit) rightClip.linkGroupId = newLink;
  }

  selectSingleClip(rightClip.id);
  snapshotHistory();
  renderTimeline();
  renderInspector();
  syncEffectsDrawer();
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
  const origLink = f.clip.linkGroupId;
  const newLink = origLink && state.linkedSelection ? uid('lnk') : null;
  copy.linkGroupId = newLink;
  const targetStart = quantize(f.clip.start + f.clip.duration);
  if (f.track.id === getMainTrack()?.id && state.magnetMain) {
    copy.start = targetStart;
    insertOrReorderOnMainTrack(f.track, copy, targetStart);
  } else {
    copy.start = resolveNonOverlappingStart(f.track, targetStart, copy.duration);
    f.track.clips.push(copy);
  }
  if (origLink && newLink) {
    for (const tr of state.tracks) {
      if (tr.id === f.track.id || tr.locked) continue;
      const p = tr.clips.find(c => c.linkGroupId === origLink);
      if (p) {
        const pCopy = structuredClone(p);
        pCopy.id = uid('clip');
        pCopy.linkGroupId = newLink;
        pCopy.start = resolveNonOverlappingStart(tr, copy.start, pCopy.duration);
        tr.clips.push(pCopy);
      }
    }
  }
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
  const linkRemap = new Map();
  for (const item of state.copiedClips) {
    const c = structuredClone(item.clip);
    c.id = uid('clip');
    if (c.linkGroupId) {
      if (!linkRemap.has(c.linkGroupId)) linkRemap.set(c.linkGroupId, uid('lnk'));
      c.linkGroupId = linkRemap.get(c.linkGroupId);
    }
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

  // Remove all selected unlocked clips first
  for (const { clip, track } of unlocked) {
    track.clips = track.clips.filter(c => c.id !== clip.id);
  }

  if (ripple) {
    // True Interval-Union Ripple Delete: merge overlapping deleted ranges so no timeline span is EVER subtracted twice!
    const mergeIntervals = (intervals) => {
      if (!intervals.length) return [];
      const sorted = [...intervals].sort((a, b) => a.start - b.start);
      const out = [{ start: sorted[0].start, end: sorted[0].end }];
      for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        if (sorted[i].start <= last.end + 0.005) last.end = Math.max(last.end, sorted[i].end);
        else out.push({ start: sorted[i].start, end: sorted[i].end });
      }
      return out;
    };

    const mainId = getMainTrack()?.id;
    const mainDeleted = unlocked.filter(x => x.track.id === mainId);
    const hasMainVideo = mainDeleted.length > 0;
    const globalUnion = mergeIntervals(
      (hasMainVideo ? mainDeleted : unlocked).map(x => ({ start: x.clip.start, end: x.clip.start + x.clip.duration }))
    );

    const shiftTrackByIntervals = (tr, intervals) => {
      // Process merged disjoint intervals descending so indices/pivots stay exact
      const desc = [...intervals].sort((a, b) => b.start - a.start);
      for (const iv of desc) {
        const gap = quantize(iv.end - iv.start);
        if (gap <= 0.001) continue;
        const sorted = [...tr.clips].sort((a, b) => a.start - b.start);
        for (const c of sorted) {
          if (c.start >= iv.end - 0.01) {
            const desired = quantize(Math.max(0, c.start - gap));
            const prevEnd = tr.clips
              .filter(o => o.id !== c.id && o.start < c.start)
              .reduce((mx, o) => Math.max(mx, o.start + o.duration), 0);
            c.start = tr.id === mainId ? desired : Math.max(prevEnd, desired);
          }
        }
      }
    };

    for (const tr of state.tracks) {
      if (tr.locked) continue;
      if (hasMainVideo && (tr.id === mainId || state.linkedSelection)) {
        shiftTrackByIntervals(tr, globalUnion);
      } else {
        const trackIntervals = mergeIntervals(
          unlocked.filter(x => x.track.id === tr.id).map(x => ({ start: x.clip.start, end: x.clip.start + x.clip.duration }))
        );
        if (trackIntervals.length) shiftTrackByIntervals(tr, trackIntervals);
      }
    }

    // Shift captions & markers once using the disjoint union intervals
    const descUnion = [...globalUnion].sort((a, b) => b.start - a.start);
    for (const iv of descUnion) {
      const gap = quantize(iv.end - iv.start);
      if (gap <= 0.001) continue;
      for (const cap of state.captions) {
        if (cap.start >= iv.end - 0.01) {
          cap.start = quantize(Math.max(0, cap.start - gap));
          cap.end = quantize(Math.max(cap.start + 0.1, cap.end - gap));
        }
      }
      state.markers = state.markers.map(m => m >= iv.end - 0.01 ? quantize(Math.max(0, m - gap)) : m);
    }
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
  // Capture cut time & projectEpoch BEFORE async upload so undo/load during upload never mutates stale state!
  const cutT = quantize(state.currentTime);
  const startEpoch = projectEpoch;
  showToast('Capturing isolated freeze frame...');
  try {
    const blob = await engine.captureIsolatedClipBlob(f.clip, cutT);
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
    if (projectEpoch !== startEpoch) return showToast('Project changed during freeze capture — aborted');
    state.library.push(data.item);
    renderMediaLibrary();

    const freezeDur = 2.0;
    const origClip = f.clip;
    const track = f.track;
    const isMainTrack = track.id === getMainTrack()?.id;

    // True CapCut Freeze Frame: split clip + spanning linked audio at cutT, ripple-insert 2s still in-line
    const canSplit = cutT > origClip.start + 0.06 && cutT < origClip.start + origClip.duration - 0.06;
    const insertAt = canSplit ? cutT : (cutT <= origClip.start + 0.06 ? origClip.start : quantize(origClip.start + origClip.duration));

    if (canSplit) {
      const origDur = origClip.duration;
      const leftDur = quantize(cutT - origClip.start);
      const rightDur = quantize(origClip.duration - leftDur);
      const media = origClip.mediaId ? state.library.find(m => m.id === origClip.mediaId) : null;
      const srcAtCut = getSourceTime(origClip, leftDur, media?.duration || origClip.sourceDuration);
      const { leftKf, rightKf } = partitionKeyframesAtCut(origClip, leftDur);

      const rightClip = structuredClone(origClip);
      rightClip.id = uid('clip');
      rightClip.start = quantize(cutT + freezeDur);
      rightClip.duration = rightDur;
      rightClip.keyframes = rightKf;
      rightClip.transIn = 'none';
      rightClip.fadeIn = 0;
      rightClip.linkGroupId = null; // Fresh link assigned only if linked audio also splits!
      if (origClip.reverse) {
        const origTrim = origClip.trimStart || 0;
        origClip.trimStart = Math.max(0, srcAtCut);
        rightClip.trimStart = Math.max(0, origTrim);
      } else {
        rightClip.trimStart = Math.max(0, srcAtCut);
      }
      if (origClip.speedCurve && origClip.speedCurve !== 'none') {
        const u0 = Number(origClip.curveStartU ?? 0);
        const u1 = Number(origClip.curveEndU ?? 1);
        const midU = u0 + (leftDur / Math.max(0.04, origDur)) * (u1 - u0);
        origClip.curveStartU = u0; origClip.curveEndU = midU;
        rightClip.curveStartU = midU; rightClip.curveEndU = u1;
      }
      origClip.duration = leftDur;
      origClip.keyframes = leftKf;
      origClip.transOut = 'none';
      origClip.fadeOut = 0;

      for (const c of track.clips) {
        if (c.id !== origClip.id && c.start >= cutT - 0.01) {
          c.start = quantize(c.start + freezeDur);
        }
      }
      const newLink = uid('lnk');
      let anyPartnerSplit = false;
      for (const tr of state.tracks) {
        if (tr.id === track.id || tr.locked) continue;
        const toAdd = [];
        for (const c of tr.clips) {
          if (c.linkGroupId && c.linkGroupId === origClip.linkGroupId && cutT > c.start + 0.06 && cutT < c.start + c.duration - 0.06) {
            const pOrigDur = c.duration;
            const pLeft = quantize(cutT - c.start);
            const pRight = quantize(c.duration - pLeft);
            const pSrc = getSourceTime(c, pLeft, c.sourceDuration);
            const { leftKf: lk, rightKf: rk } = partitionKeyframesAtCut(c, pLeft);
            const rc = structuredClone(c);
            rc.id = uid('clip');
            rc.start = quantize(cutT + freezeDur);
            rc.duration = pRight;
            rc.keyframes = rk;
            rc.fadeIn = 0;
            if (c.reverse) { const ot = c.trimStart || 0; c.trimStart = Math.max(0, pSrc); rc.trimStart = Math.max(0, ot); }
            else rc.trimStart = Math.max(0, pSrc);
            if (c.speedCurve && c.speedCurve !== 'none') {
              const pu0 = Number(c.curveStartU ?? 0), pu1 = Number(c.curveEndU ?? 1);
              const pMid = pu0 + (pLeft / Math.max(0.04, pOrigDur)) * (pu1 - pu0);
              c.curveStartU = pu0; c.curveEndU = pMid;
              rc.curveStartU = pMid; rc.curveEndU = pu1;
            }
            rc.linkGroupId = newLink;
            anyPartnerSplit = true;
            c.duration = pLeft;
            c.keyframes = lk;
            c.fadeOut = 0;
            toAdd.push(rc);
          } else if (isMainTrack && state.linkedSelection && c.start >= cutT - 0.01) {
            c.start = quantize(c.start + freezeDur);
          }
        }
        tr.clips.push(...toAdd);
      }
      if (anyPartnerSplit) rightClip.linkGroupId = newLink;
      track.clips.push(rightClip);
    } else {
      for (const c of track.clips) {
        if (c.start >= insertAt - 0.01) c.start = quantize(c.start + freezeDur);
      }
      if (isMainTrack && state.linkedSelection) {
        for (const tr of state.tracks) {
          if (tr.id === track.id || tr.locked) continue;
          for (const c of tr.clips) {
            if (c.start >= insertAt - 0.01) c.start = quantize(c.start + freezeDur);
          }
        }
      }
    }

    if (isMainTrack) {
      for (const cap of state.captions) {
        if (cap.start >= insertAt - 0.01) {
          cap.start = quantize(cap.start + freezeDur);
          cap.end = quantize(cap.end + freezeDur);
        } else if (cap.end > insertAt + 0.01) {
          cap.end = quantize(cap.end + freezeDur);
        }
      }
      state.markers = state.markers.map(m => m >= insertAt - 0.01 ? quantize(m + freezeDur) : m);
    }

    const freezeClip = createDefaultClip({
      mediaId: data.item.id,
      name: `Freeze · ${origClip.name}`,
      type: 'image',
      start: insertAt,
      duration: freezeDur,
      sourceDuration: freezeDur,
      fitMode: 'contain',
    });
    track.clips.push(freezeClip);
    selectSingleClip(freezeClip.id);
    snapshotHistory();
    renderTimeline();
    renderInspector();
    renderNow();
    showToast('Inserted in-line 2s Freeze Frame (timeline & audio paused)');
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
    curveStartU: f.clip.curveStartU ?? 0,
    curveEndU: f.clip.curveEndU ?? 1,
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
    const clampDurToNeighbor = (dur) => {
      if (track === getMainTrack() && state.magnetMain) return dur;
      const nextStart = track.clips
        .filter(c => c.id !== clip.id && c.start >= clip.start + clip.duration - 0.005)
        .reduce((mn, c) => Math.min(mn, c.start), Infinity);
      return Number.isFinite(nextStart) ? Math.min(dur, Math.max(0.12, nextStart - clip.start)) : dur;
    };
    const syncLinkedSpeed = () => {
      if (!clip.linkGroupId || !state.linkedSelection) return;
      for (const tr of state.tracks) {
        if (tr.id === track.id || tr.locked) continue;
        for (const p of tr.clips) {
          if (p.linkGroupId === clip.linkGroupId) {
            p.speed = clip.speed;
            p.speedCurve = clip.speedCurve;
            p.curveStartU = clip.curveStartU ?? 0;
            p.curveEndU = clip.curveEndU ?? 1;
            p.reverse = clip.reverse;
            p.duration = clip.duration;
          }
        }
      }
    };
    const applySpeed = (sp) => {
      const oldSpan = getClipSourceSpan(clip);
      clip.speed = Math.max(0.25, Math.min(4, sp));
      // Account for active speedCurve average multiplier when computing new duration!
      const curveMult = (clip.speedCurve && clip.speedCurve !== 'none')
        ? (getClipSourceSpan({ ...clip, speed: 1, duration: 1 }) || 1)
        : 1;
      const availSrc = Math.max(0.2, (clip.sourceDuration || oldSpan) - (clip.trimStart || 0));
      const desiredSrc = Math.min(availSrc, oldSpan);
      const rawDur = quantize(Math.max(0.15, desiredSrc / Math.max(0.1, clip.speed * curveMult)));
      clip.duration = quantize(clampDurToNeighbor(rawDur));
      syncLinkedSpeed();
      compactMainTrackIfMagnetic();
      renderTimeline();
      renderNow();
    };
    bindSliderAndNumber('slSpeed', v => applySpeed(v), () => { snapshotHistory(); renderInspector(); });
    $$('.speed-pill').forEach(p => { p.onclick = () => { applySpeed(Number(p.dataset.sp)); snapshotHistory(); renderInspector(); }; });
    $('#selSpeedCurve').onchange = (e) => {
      const oldSpan = getClipSourceSpan(clip);
      clip.speedCurve = e.target.value;
      clip.curveStartU = 0; clip.curveEndU = 1;
      const newSpan = getClipSourceSpan(clip);
      const availSrc = Math.max(0.2, (clip.sourceDuration || oldSpan) - (clip.trimStart || 0));
      if (newSpan > availSrc + 0.01) {
        clip.duration = quantize(Math.max(0.15, clip.duration * (availSrc / newSpan)));
      }
      clip.duration = quantize(clampDurToNeighbor(clip.duration));
      syncLinkedSpeed();
      e.target.blur();
      compactMainTrackIfMagnetic();
      snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
    };
    $('#btnReverseClip').onclick = () => { clip.reverse = !clip.reverse; syncLinkedSpeed(); snapshotHistory(); renderTimeline(); renderInspector(); renderNow(); };
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
        <div class="prop-row">
          <div class="prop-head"><span>Font Family</span></div>
          <select id="selFontFamily" class="prop-select" ${dis}>
            ${[
              ['Inter, -apple-system, sans-serif', 'Inter (Sans)'],
              ['Impact, "Arial Black", sans-serif', 'Impact (Viral Bold)'],
              ['Georgia, "Times New Roman", serif', 'Georgia (Editorial Serif)'],
              ['"JetBrains Mono", Menlo, monospace', 'JetBrains Mono (Tech)'],
              ['"Helvetica Neue", Arial, sans-serif', 'Helvetica Neue'],
            ].map(([f, l]) => `<option value="${escHtml(f)}" ${(clip.fontFamily || 'Inter, -apple-system, sans-serif') === f ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
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
    $('#selFontFamily').onchange = (e) => { clip.fontFamily = e.target.value; e.target.blur(); snapshotHistory(); renderNow(); };
    $('#selFontWeight').onchange = (e) => { clip.fontWeight = e.target.value; e.target.blur(); snapshotHistory(); renderNow(); };
    $('#selTextAlign').onchange = (e) => { clip.align = e.target.value; e.target.blur(); snapshotHistory(); renderNow(); };
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
      if (prev !== undefined) { state.currentTime = quantize(clip.start + prev); ensurePlayheadVisible(); renderInspector(); renderNow(); }
    };
  });
  container.querySelectorAll('[data-kf-next]').forEach(btn => {
    btn.onclick = () => {
      const list = (clip.keyframes?.[btn.dataset.kfNext] || []).map(k => k.t).sort((a, b) => a - b);
      const next = list.find(kt => kt > localT + tol);
      if (next !== undefined) { state.currentTime = quantize(clip.start + next); ensurePlayheadVisible(); renderInspector(); renderNow(); }
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
    row.querySelector('[data-act="jump"]').onclick = () => { state.currentTime = quantize(cap.start); state.selectedCaptionId = cap.id; ensurePlayheadVisible(); renderCaptionsUI(); renderNow(); };
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
        const inUse = state.tracks.some(tr => tr.clips.some(c => c.mediaId === m.id));
        if (inUse && !confirm(`"${m.name}" is used on the current timeline. Removing it will permanently delete the uploaded file and mark those clips OFFLINE. Continue?`)) {
          return;
        }
        const res = await fetch(`/api/media/${encodeURIComponent(m.id)}`, { method: 'DELETE', headers: apiHeaders() });
        if (!res.ok) return showToast(`Failed to remove "${m.name}"`);
        state.library = state.library.filter(x => x.id !== m.id);
        state.waveforms.delete(m.id);
        engine.invalidateMediaCache(m.id, m.url);
        engine.pruneUnusedElements();
        renderMediaLibrary();
        renderTimeline();
        renderNow();
        showToast(`Removed "${m.name}" from library`);
      };
    }
    grid.appendChild(card);
  });

  state.library.filter(m => m.type === 'audio').forEach(m => {
    const row = document.createElement('div');
    row.className = 'audio-row';
    row.innerHTML = `<div style="min-width:0;flex:1"><div class="audio-row-name">${escHtml(m.name)}</div><div class="audio-row-dur">${formatTC(m.duration, state.fps)}</div></div><div style="display:flex;gap:4px"><button class="btn-mini" data-aud-play title="Preview">▶</button><button class="btn-mini" data-aud-add>+ Add</button></div>`;
    row.querySelector('[data-aud-play]').onclick = () => auditionAudioUrl(m.url);
    row.querySelector('[data-aud-add]').onclick = () => addMediaToTimeline(m, null, state.currentTime);
    audioList.appendChild(row);
  });
}

function syncEffectsDrawer() {
  const f = findClipAndTrack(state.selectedClipId);
  const activeFx = new Set(Array.isArray(f?.clip?.effects) ? f.clip.effects : []);
  $$('#effectsGrid .preset-card').forEach(btn => {
    btn.classList.toggle('active', activeFx.has(btn.dataset.fx));
  });
  renderEffectIntensityControls();
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
    const b = document.createElement('div');
    b.className = 'preset-card';
    b.style.cursor = 'pointer';
    b.innerHTML = `<div class="preset-preview" style="color:#00e5c3;display:flex;align-items:center;justify-content:center;gap:6px"><span>♫</span><button class="btn-micro" data-sfx-prev title="Audition SFX" style="padding:1px 5px">▶</button></div><div class="preset-label">${escHtml(p.name)}</div>`;
    b.querySelector('[data-sfx-prev]').onclick = (e) => { e.stopPropagation(); previewProceduralSfx(p); };
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
    // 1. Check corner/rotate gizmo handles of selected clip FIRST
    let hit = engine.hitTestGizmoHandles(px, py, state.currentTime);
    // 2. Otherwise search ALL visible layers strictly top-to-bottom so titles/overlays over a selected video always win!
    if (!hit) {
      const any = engine.hitTestAnyClip(px, py, state.currentTime);
      if (any) {
        if (any.id !== state.selectedClipId) {
          selectSingleClip(any.id);
          renderTimeline();
          renderInspector();
          syncEffectsDrawer();
          renderNow();
        }
        hit = { mode: 'move', clip: any, box: engine.getClipBoundingBox(any, state.currentTime) };
      } else {
        selectSingleClip(null);
        renderTimeline();
        renderInspector();
        syncEffectsDrawer();
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
    const media = state.library.find(m => m.id === f.clip.mediaId);
    const srcT = getSourceTime(f.clip, localT, media?.duration || f.clip.sourceDuration);
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
      <div><strong>${escHtml(info.name)}</strong><div class="media-sub">Expected: ${escHtml(info.type || 'media')} · ID: ${escHtml(mid)}</div></div>
      <div class="row-2" style="flex:0 0 auto;gap:6px">
        <button class="btn-mini" data-path="${escHtml(mid)}">Relink Path...</button>
        <button class="btn-mini" data-pick="${escHtml(mid)}">Upload File...</button>
      </div>`;
    const applyRelinkItem = (item) => {
      if (info.type && info.type !== 'media' && item.type !== info.type) {
        showToast(`Type mismatch: expected ${info.type}, got ${item.type}`);
        return false;
      }
      if (!state.library.find(x => x.id === item.id)) state.library.push(item);
      for (const tr of state.tracks) {
        for (const c of tr.clips) {
          if (c.mediaId === mid) {
            c.mediaId = item.id;
            c.sourceDuration = item.duration;
            if ((c.trimStart || 0) >= item.duration) c.trimStart = 0;
          }
        }
      }
      row.innerHTML = `<span style="color:#00e5c3">✓ Relinked → ${escHtml(item.name)}</span>`;
      snapshotHistory(); renderMediaLibrary(); renderTimeline(); renderNow();
      return true;
    };
    row.querySelector('[data-path]').onclick = async () => {
      const p = prompt(`Enter local file path for "${info.name}":`);
      if (!p || !p.trim()) return;
      const r = await fetch('/api/import-path', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path: p.trim() }),
      });
      const d = await r.json();
      if (!r.ok) return showToast(d.error || 'Path relink failed');
      applyRelinkItem(d.item);
    };
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
        applyRelinkItem(d.item);
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
    $('#btnExportStart').disabled = false;
    const frames = Math.max(1, Math.round(Math.max(1 / fps, dur) * fps));
    const aspectWarn = ratioStr !== state.aspect ? ` · ⚠ Aspect ${ratioStr} ≠ project ${state.aspect} (will letterbox; switch project ratio to reframe)` : '';
    sum.textContent = `Timeline Render: ${width}×${height} (${ratioStr}) · ${fps}fps · ${dur.toFixed(2)}s (${frames} frames) · Multi-track H.264/AAC${aspectWarn}`;
  } else {
    const f = findClipAndTrack(state.selectedClipId);
    const target = (f && f.clip.type === 'video') ? f.clip : null;
    const hasRamp = target && target.speedCurve && target.speedCurve !== 'none';
    $('#btnExportStart').disabled = !target || hasRamp;
    sum.textContent = !target
      ? `Quick Reframe requires selecting a video clip on the timeline.`
      : hasRamp
        ? `Quick Reframe does not support speed ramps ("${target.name}") — switch to Full Timeline Render.`
        : `Quick Reframe: "${target.name}" (${target.speed || 1}×${target.reverse ? ', Rev' : ''}) → ${width}×${height} (${ratioStr}) · ${fps}fps direct FFmpeg (omits overlays/text)`;
  }
}

let quickExportAbort = null;

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
      const vidClip = (f && f.clip.type === 'video') ? f.clip : null;
      if (!vidClip) throw new Error('Select a video clip on the timeline for Quick Reframe');
      progBar.style.width = '45%';
      quickExportAbort = new AbortController();
      const r = await fetch('/api/quick-export', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mediaId: vidClip.mediaId, width, height, fps, crf, name,
          fitMode: vidClip.fitMode || 'cover',
          trimStart: vidClip.trimStart || 0,
          duration: vidClip.duration,
          speed: vidClip.speed || 1,
          speedCurve: vidClip.speedCurve || 'none',
          reverse: Boolean(vidClip.reverse),
          cropRect: vidClip.cropRect,
        }),
        signal: quickExportAbort.signal,
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
    quickExportAbort = null;
    startBtn.disabled = false;
    cancelBtn.textContent = 'Close';
  }
}

async function closeOrCancelExportModal() {
  if (quickExportAbort) {
    quickExportAbort.abort();
    quickExportAbort = null;
    return;
  }
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

async function saveProjectJSON(downloadFile = true) {
  const payload = buildProjectPayload();
  const jsonStr = JSON.stringify(payload, null, 2);
  let localOk = false;
  try { localStorage.setItem(AUTOSAVE_KEY, jsonStr); localOk = true; } catch {}
  let serverOk = false;
  try {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: jsonStr,
    });
    serverOk = r.ok;
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      showToast(`Server backup warning: ${d.error || r.status}`);
    }
  } catch {
    showToast('Server backup unreachable — saved locally');
  }
  setSaveStatus(serverOk && localOk ? 'Saved' : (serverOk ? 'Server Only' : (localOk ? 'Local Only' : 'Save Failed')), (!serverOk && !localOk) ? 'error' : '');
  if (downloadFile) {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.title || 'motioncut'}.mcut.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Project exported (.mcut.json + server backup)');
  } else if (serverOk) {
    showToast('Project saved to server & local autosave (⌘S)');
  }
}

function startNewProject() {
  if (state.playing) togglePlay(false);
  projectEpoch++;
  state.projectId = uid('proj');
  state.mainTrackId = 't_vid1';
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
  state.history = [];
  state.historyIdx = -1;
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
  state.projectId = uid('proj');
  state.mainTrackId = 't_vid1';
  state.tracks = makeEmptyTracks();
  state.captions = [];
  state.markers = [];
  state.selectedClipId = null;
  state.selectedClipIds = new Set();
  state.history = [];
  state.historyIdx = -1;
  projectEpoch++;
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
      ensurePlayheadVisible();
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
  $('#btnJumpStart').onclick = () => { state.currentTime = 0; ensurePlayheadVisible(); renderNow(); };
  $('#btnJumpEnd').onclick = () => { state.currentTime = quantize(getProjectDuration()); ensurePlayheadVisible(); renderNow(); };
  $('#btnStepBack').onclick = () => { state.currentTime = quantize(Math.max(0, state.currentTime - 1 / state.fps)); ensurePlayheadVisible(); renderNow(); };
  $('#btnStepFwd').onclick = () => { state.currentTime = quantize(state.currentTime + 1 / state.fps); ensurePlayheadVisible(); renderNow(); };
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
    ensurePlayheadVisible();
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
    snapshotHistory(); renderTimeline(); syncEffectsDrawer(); renderNow();
  };
  $('#btnAutoCrop').onclick = runAutoCrop;
  $('#btnVisionCutout').onclick = runVisionCutout;
  $('#btnAutoBeats').onclick = runAutoBeats;

  // Save / Load Project (real dark-themed Server Projects Modal + local .mcut.json)
  $('#btnSaveProj').onclick = () => saveProjectJSON(true);
  $('#btnProjectsClose').onclick = () => $('#projectsModal').classList.add('hidden');
  $('#btnProjectsCancel').onclick = () => $('#projectsModal').classList.add('hidden');
  $('#btnOpenLocalProjFile').onclick = () => { $('#projectsModal').classList.add('hidden'); $('#projFileInput').click(); };
  $('#btnLoadProj').onclick = async () => {
    const listEl = $('#serverProjectsList');
    listEl.innerHTML = '<div class="drawer-tip">Loading saved server projects…</div>';
    $('#projectsModal').classList.remove('hidden');
    try {
      const r = await fetch('/api/projects');
      const d = await r.json();
      const details = d.details || (d.projects || []).map(f => ({ fileName: f, updatedAt: null }));
      if (!details.length) {
        listEl.innerHTML = '<div class="drawer-tip">No server backups yet. Click Save (⌘S) to create one, or browse a local .mcut.json file below.</div>';
        return;
      }
      listEl.innerHTML = '';
      details.forEach(item => {
        const fname = item.fileName;
        const when = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '';
        const row = document.createElement('div');
        row.className = 'relink-row';
        row.innerHTML = `<div><strong>${escHtml(fname)}</strong>${when ? `<div class="media-sub">${escHtml(when)}</div>` : ''}</div><div style="display:flex;gap:6px"><button class="btn-mini" data-open>Open</button><button class="btn-mini" data-del title="Delete backup">✕</button></div>`;
        row.querySelector('[data-open]').onclick = async () => {
          try {
            const pr = await fetch(`/api/projects/${encodeURIComponent(fname)}`);
            const pd = await pr.json();
            if (!pr.ok || !pd.project) return showToast(pd.error || 'Failed to load project');
            applySnapshot(JSON.stringify(pd.project), true);
            snapshotHistory();
            $('#projectsModal').classList.add('hidden');
            showToast(`Loaded ${fname}`);
          } catch (err) {
            showToast(`Failed to open project: ${err.message}`);
          }
        };
        row.querySelector('[data-del]').onclick = async () => {
          try {
            const dr = await fetch(`/api/projects/${encodeURIComponent(fname)}`, { method: 'DELETE', headers: apiHeaders() });
            if (dr.ok) { row.remove(); showToast(`Deleted ${fname}`); }
          } catch {}
        };
        listEl.appendChild(row);
      });
    } catch {
      listEl.innerHTML = '<div class="drawer-tip">Could not list server backups. Use Browse Local .mcut.json below.</div>';
    }
  };
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

  // Keyboard Shortcuts (Guard modals/SELECT/Cmd+S, wire J/K/L, Q/W, Up/Down, Home/End/- /=/B/V/Cmd+C/V/A/Y)
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const isTextInput = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && document.activeElement.type !== 'range' && document.activeElement.type !== 'button');
    const cmd = e.metaKey || e.ctrlKey;
    const anyModalOpen = !$('#exportModal').classList.contains('hidden')
      || !$('#relinkModal').classList.contains('hidden')
      || !$('#projectsModal').classList.contains('hidden')
      || !$('#shortcutsModal').classList.contains('hidden');

    if (e.key === 'Escape') {
      if (!$('#shortcutsModal').classList.contains('hidden')) { $('#shortcutsModal').classList.add('hidden'); return; }
      if (!$('#projectsModal').classList.contains('hidden')) { $('#projectsModal').classList.add('hidden'); return; }
      if (!$('#relinkModal').classList.contains('hidden')) { $('#relinkModal').classList.add('hidden'); return; }
      if (!$('#exportModal').classList.contains('hidden')) { closeOrCancelExportModal(); return; }
      closeContextMenu();
      return;
    }

    if (anyModalOpen) return;

    if (cmd && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProjectJSON(false);
      return;
    }

    if (isTextInput) return;

    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); shuttleSpeed = 1; togglePlay(); }
    else if (k === 'k' && !cmd) { e.preventDefault(); shuttleSpeed = 1; togglePlay(false); }
    else if (k === 'l' && !cmd) { e.preventDefault(); shuttleSpeed = state.playing && shuttleSpeed >= 1 ? Math.min(4, shuttleSpeed * 2) : 1; togglePlay(true); showToast(`Shuttle ${shuttleSpeed}×`); }
    else if (k === 'j' && !cmd) { e.preventDefault(); shuttleSpeed = state.playing && shuttleSpeed <= -1 ? Math.max(-4, shuttleSpeed * 2) : -1; togglePlay(true); showToast(`Shuttle ${shuttleSpeed}×`); }
    else if (k === 'v' && !cmd) setActiveTool('select');
    else if (k === 'b' && !cmd) setActiveTool('razor');
    else if ((k === 's' && !cmd) || (cmd && k === 'b')) { e.preventDefault(); splitSelectedClip(); }
    else if (k === 'q' && !cmd) {
      e.preventDefault();
      let f = findClipAndTrack(state.selectedClipId);
      if (!f) {
        const m = getMainTrack();
        const mainTr = (m && !m.locked) ? m : null;
        const under = mainTr?.clips.find(c => state.currentTime > c.start + 0.04 && state.currentTime < c.start + c.duration - 0.12);
        if (under) f = { clip: under, track: mainTr };
      }
      if (f && !f.track.locked && state.currentTime > f.clip.start + 0.04 && state.currentTime < f.clip.start + f.clip.duration - 0.12) {
        const trimOneLeft = (c) => {
          const delta = quantize(state.currentTime - c.start);
          const origDur = c.duration;
          const { rightKf } = partitionKeyframesAtCut(c, delta);
          const srcAtCut = getSourceTime(c, delta, c.sourceDuration);
          c.start = quantize(state.currentTime);
          c.duration = quantize(origDur - delta);
          if (!c.reverse) c.trimStart = Math.max(0, srcAtCut);
          if (c.speedCurve && c.speedCurve !== 'none') {
            const u0 = Number(c.curveStartU ?? 0), u1 = Number(c.curveEndU ?? 1);
            c.curveStartU = u0 + (delta / Math.max(0.04, origDur)) * (u1 - u0);
          }
          c.keyframes = rightKf;
        };
        const lg = f.clip.linkGroupId;
        trimOneLeft(f.clip);
        if (lg && state.linkedSelection) {
          for (const tr of state.tracks) {
            if (tr.id === f.track.id || tr.locked) continue;
            for (const p of tr.clips) {
              if (p.linkGroupId === lg && state.currentTime > p.start + 0.04 && state.currentTime < p.start + p.duration - 0.12) trimOneLeft(p);
            }
          }
        }
        compactMainTrackIfMagnetic(); snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
        showToast('Trimmed clip start to playhead (Q)');
      }
    }
    else if (k === 'w' && !cmd) {
      e.preventDefault();
      let f = findClipAndTrack(state.selectedClipId);
      if (!f) {
        const m = getMainTrack();
        const mainTr = (m && !m.locked) ? m : null;
        const under = mainTr?.clips.find(c => state.currentTime > c.start + 0.12 && state.currentTime < c.start + c.duration - 0.04);
        if (under) f = { clip: under, track: mainTr };
      }
      if (f && !f.track.locked && state.currentTime > f.clip.start + 0.12 && state.currentTime < f.clip.start + f.clip.duration - 0.04) {
        const trimOneRight = (c) => {
          const origDur = c.duration;
          const newDur = quantize(state.currentTime - c.start);
          const { leftKf } = partitionKeyframesAtCut(c, newDur);
          const srcAtCut = getSourceTime(c, newDur, c.sourceDuration);
          if (c.reverse) c.trimStart = Math.max(0, srcAtCut);
          if (c.speedCurve && c.speedCurve !== 'none') {
            const u0 = Number(c.curveStartU ?? 0), u1 = Number(c.curveEndU ?? 1);
            c.curveEndU = u0 + (newDur / Math.max(0.04, origDur)) * (u1 - u0);
          }
          c.duration = newDur;
          c.keyframes = leftKf;
        };
        const lg = f.clip.linkGroupId;
        trimOneRight(f.clip);
        if (lg && state.linkedSelection) {
          for (const tr of state.tracks) {
            if (tr.id === f.track.id || tr.locked) continue;
            for (const p of tr.clips) {
              if (p.linkGroupId === lg && state.currentTime > p.start + 0.12 && state.currentTime < p.start + p.duration - 0.04) trimOneRight(p);
            }
          }
        }
        compactMainTrackIfMagnetic(); snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
        showToast('Trimmed clip end to playhead (W)');
      }
    }
    else if (cmd && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((cmd && k === 'z' && e.shiftKey) || (cmd && k === 'y')) { e.preventDefault(); redo(); }
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
      renderInspector();
      syncEffectsDrawer();
      showToast(`Selected ${state.selectedClipIds.size} clip(s)`);
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedClips(e.shiftKey); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); state.currentTime = quantize(Math.max(0, state.currentTime - (e.shiftKey ? 10 : 1) / state.fps)); ensurePlayheadVisible(); renderNow(); renderInspector(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); state.currentTime = quantize(state.currentTime + (e.shiftKey ? 10 : 1) / state.fps); ensurePlayheadVisible(); renderNow(); renderInspector(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cuts = [...new Set([0, ...state.tracks.flatMap(t => t.clips.flatMap(c => [c.start, quantize(c.start + c.duration)]))])].sort((a, b) => a - b);
      const target = e.key === 'ArrowUp'
        ? ([...cuts].reverse().find(c => c < state.currentTime - 0.01) ?? 0)
        : (cuts.find(c => c > state.currentTime + 0.01) ?? cuts[cuts.length - 1]);
      state.currentTime = quantize(target);
      ensurePlayheadVisible(); renderNow(); renderInspector();
    }
    else if (e.key === 'Home') { e.preventDefault(); state.currentTime = 0; ensurePlayheadVisible(); renderNow(); renderInspector(); }
    else if (e.key === 'End') { e.preventDefault(); state.currentTime = quantize(getProjectDuration()); ensurePlayheadVisible(); renderNow(); renderInspector(); }
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
