/**
 * MotionCut Pro v2 — CapCut-Style Application Controller
 * Features: Drag-Drop Media->Timeline, Select/Razor Blade Tools, Multi-Frame Filmstrips,
 * Live Stereo VU Meter, Right-Click Context Menu, On-Canvas Move/Scale/Rotate + Double-Click Inline Text,
 * Multi-Effect Stack + Intensity, Masks, Chroma Key, Speed Curves, Captions (.SRT), Ripple Delete, Keyframe Stepper.
 */
import {
  CompositorEngine,
  TEXT_PRESETS,
  GRAPHIC_PRESETS,
  EFFECT_PRESETS,
  TRANSITION_PRESETS,
  FILTER_PRESETS,
  SPEED_CURVES,
  SFX_PRESETS,
  synthSfxWavUrl,
  evalClipProp,
} from '/engine.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const uid = (p = 'c') => `${p}_${Math.random().toString(36).slice(2, 9)}`;

const state = {
  title: 'Scanner_16x9_Edit',
  aspect: '16:9',
  canvasWidth: 1920,
  canvasHeight: 1080,
  fps: 30,
  bgMode: 'black',
  playhead: 0,
  playing: false,
  loop: true,
  masterMute: false,
  snap: true,
  tool: 'select', // select | razor
  pxPerSec: 72,
  selectedClipId: null,
  activeInspectorTab: 'basic',
  transSide: 'in',
  mediaFilter: 'all',
  captionStyle: 'hormozi',
  copiedAttrs: null,
  library: [],
  waveforms: new Map(),
  markers: [],
  captions: [],
  tracks: [
    { id: 't_text1', name: 'Text 1',     type: 'text',  muted: false, hidden: false, locked: false },
    { id: 't_vid2',  name: 'Overlay 1',  type: 'video', muted: false, hidden: false, locked: false },
    { id: 't_vid1',  name: 'Main Video', type: 'video', muted: false, hidden: false, locked: false },
    { id: 't_aud1',  name: 'Audio 1',    type: 'audio', muted: false, hidden: false, locked: false },
  ],
  clips: [],
  history: [],
  future: [],
  getProjectDuration() {
    const clipEnd = this.clips.length ? Math.max(...this.clips.map(c => c.start + c.duration)) : 0;
    const capEnd = this.captions.length ? Math.max(...this.captions.map(c => c.end)) : 0;
    return Math.max(5, clipEnd, capEnd);
  },
};

const engine = new CompositorEngine($('#previewCanvas'), $('#overlayCanvas'), () => {
  if (!state.playing) renderNow();
});

function toast(msg, dur = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), dur);
}

function fmtTC(sec) {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  const whole = Math.floor(rem);
  const cs = Math.floor((rem - whole) * 100);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function snapshotHistory() {
  const snap = JSON.stringify({
    tracks: state.tracks, clips: state.clips, markers: state.markers,
    captions: state.captions, captionStyle: state.captionStyle,
    aspect: state.aspect, canvasWidth: state.canvasWidth, canvasHeight: state.canvasHeight, bgMode: state.bgMode,
  });
  if (state.history[state.history.length - 1] !== snap) {
    state.history.push(snap);
    if (state.history.length > 60) state.history.shift();
    state.future = [];
  }
  $('#saveIndicator').textContent = 'Saved';
  try { localStorage.setItem('motioncut_autosave_v2', snap); } catch {}
}

function undo() {
  if (state.history.length <= 1) return toast('Nothing to undo');
  state.future.push(state.history.pop());
  applySnapshot(state.history[state.history.length - 1]);
  toast('Undid last action');
}

function redo() {
  if (!state.future.length) return toast('Nothing to redo');
  const next = state.future.pop();
  state.history.push(next);
  applySnapshot(next);
  toast('Redid action');
}

function applySnapshot(jsonStr) {
  const d = JSON.parse(jsonStr);
  state.tracks = d.tracks;
  state.clips = d.clips;
  state.markers = d.markers || [];
  state.captions = d.captions || [];
  state.captionStyle = d.captionStyle || 'hormozi';
  state.aspect = d.aspect || '16:9';
  state.canvasWidth = d.canvasWidth || 1920;
  state.canvasHeight = d.canvasHeight || 1080;
  state.bgMode = d.bgMode || 'black';
  updateAspectUI();
  renderTimeline();
  renderInspector();
  renderCaptionsList();
  renderEffectIntensityPanel();
  renderNow();
}

function getSelectedClip() { return state.clips.find(c => c.id === state.selectedClipId) || null; }

function selectClip(id) {
  state.selectedClipId = id;
  const clip = getSelectedClip();
  if (clip) {
    if (clip.type === 'text') state.activeInspectorTab = 'text';
    else if (clip.type === 'audio') state.activeInspectorTab = 'audio';
    else if (state.activeInspectorTab === 'text') state.activeInspectorTab = 'basic';
    syncInspectorTabUI();
  }
  renderTimeline();
  renderInspector();
  renderEffectIntensityPanel();
  renderNow();
}

function makeDefaultClip(media, trackId, start) {
  return {
    id: uid('clip'), mediaId: media.id, name: media.name, type: media.type,
    trackId, start, duration: media.duration, trimStart: 0,
    maxDuration: media.type === 'image' ? 60 : media.duration,
    x: 0, y: 0, scale: 100, rotation: 0, opacity: 100,
    fitMode: 'contain', blendMode: 'source-over', flipH: false, flipV: false,
    cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
    maskType: 'none', maskSize: 55, maskX: 0, maskY: 0, maskRot: 0, maskInvert: false,
    chromaEnabled: false, chromaColor: '#00ff00', chromaSimilarity: 36, chromaSmoothness: 14,
    speed: 1, speedCurve: 'normal', reverse: false,
    volume: 1, fadeIn: 0, fadeOut: 0, eqBass: 0, eqTreble: 0, voiceFx: 'normal', muted: false, audioDetached: false,
    brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, vignette: 0,
    effects: {},
    transitionIn: 'none', transitionOut: 'none', transitionDur: 0.4,
    keyframes: {},
  };
}

function addMediaToTimeline(media, atTime = null, explicitTrackId = null) {
  let targetTrack = explicitTrackId ? state.tracks.find(t => t.id === explicitTrackId) : null;
  if (!targetTrack) {
    targetTrack = media.type === 'audio'
      ? state.tracks.find(t => t.type === 'audio')
      : state.tracks.find(t => t.id === 't_vid1') || state.tracks.find(t => t.type === 'video');
  }
  if (!targetTrack) return;
  let start = atTime;
  if (start === null) {
    const onTrack = state.clips.filter(c => c.trackId === targetTrack.id);
    start = onTrack.length ? Math.max(...onTrack.map(c => c.start + c.duration)) : 0;
  }
  const clip = makeDefaultClip(media, targetTrack.id, Math.max(0, start));
  state.clips.push(clip);
  if (media.hasAudio && !state.waveforms.has(media.id)) loadWaveform(media);
  snapshotHistory();
  selectClip(clip.id);
  toast(`Added "${media.name}"`);
}

function addTextClip(preset) {
  const track = state.tracks.find(t => t.type === 'text');
  if (!track) return;
  const clip = {
    id: uid('txt'), mediaId: null, name: preset.name, type: 'text',
    trackId: track.id, start: state.playhead, duration: 3.5, trimStart: 0, maxDuration: 60,
    x: 0, y: preset.y || 0, scale: 100, rotation: 0, opacity: 100, blendMode: 'source-over',
    text: preset.text, fontFamily: preset.font, fontSize: preset.size, fontWeight: 800, fontItalic: false, lineHeight: 1.15,
    textColor: preset.color, strokeColor: preset.stroke, strokeWidth: preset.strokeW,
    textBg: preset.bg, textBgAlpha: preset.bgAlpha, textAlign: 'center', textAnim: preset.anim,
    transitionIn: 'none', transitionOut: 'none', transitionDur: 0.35, keyframes: {},
  };
  state.clips.push(clip);
  snapshotHistory();
  selectClip(clip.id);
  toast(`Added text: ${preset.name}`);
}

function addGraphicClip(preset) {
  const track = state.tracks.find(t => t.id === 't_vid2') || state.tracks.find(t => t.type === 'video');
  if (!track) return;
  const clip = {
    id: uid('gfx'), mediaId: null, name: preset.name, type: 'graphic', graphicType: preset.id,
    graphicTitle: 'MOTIONVIZ STUDIO', graphicSub: 'NEON × FLORA × BLENDER MCP',
    trackId: track.id, start: state.playhead, duration: 4.0, trimStart: 0, maxDuration: 60,
    x: preset.id === 'recBadge' ? -720 : 0,
    y: preset.id === 'recBadge' ? -420 : preset.id === 'progressBar' ? 480 : preset.id === 'lowerThird' ? 350 : 0,
    scale: 100, rotation: 0, opacity: 100, blendMode: 'source-over',
    transitionIn: 'fade', transitionOut: 'fade', transitionDur: 0.3, keyframes: {},
  };
  state.clips.push(clip);
  snapshotHistory();
  selectClip(clip.id);
  toast(`Added graphic: ${preset.name}`);
}

async function loadWaveform(media) {
  if (!media.hasAudio || media.url.startsWith('blob:')) return;
  try {
    const r = await fetch(`/api/waveform/${media.id}?bins=110`);
    const d = await r.json();
    if (d.peaks?.length) { state.waveforms.set(media.id, d); renderTimeline(); }
  } catch {}
}

// ── PREVIEW SIZING, PLAYBACK & LIVE STEREO VU METER ─────────────────────────
function fitPreviewCanvas() {
  const stage = $('#viewportStage'), shell = $('#canvasShell');
  const aw = Math.max(120, stage.clientWidth - 28), ah = Math.max(120, stage.clientHeight - 28);
  const ar = state.canvasWidth / state.canvasHeight;
  let w = aw, h = aw / ar;
  if (h > ah) { h = ah; w = ah * ar; }
  shell.style.width = `${Math.floor(w)}px`;
  shell.style.height = `${Math.floor(h)}px`;
  $('#canvasResBadge').textContent = `${state.canvasWidth} × ${state.canvasHeight} · ${state.aspect}`;
}

function updateAspectUI() {
  $$('.aspect-btn').forEach(b => b.classList.toggle('active', b.dataset.ratio === state.aspect));
  fitPreviewCanvas();
}

function renderNow() {
  engine.syncMediaForTime(state, state.playhead, state.playing);
  engine.renderFrame(state, state.playhead, true);
  $('#timecodeDisplay').textContent = fmtTC(state.playhead);
  $('#durationDisplay').textContent = fmtTC(state.getProjectDuration());
  $('#playhead').style.left = `${state.playhead * state.pxPerSec}px`;
}

let lastTick = 0;
function playbackLoop(now) {
  if (!state.playing) {
    $('#vuL').style.width = '0%'; $('#vuR').style.width = '0%';
    return;
  }
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  const dur = state.getProjectDuration();
  state.playhead += dt;
  if (state.playhead >= dur) {
    if (state.loop) state.playhead = 0;
    else { state.playhead = dur; togglePlay(false); return; }
  }
  renderNow();
  const [vl, vr] = engine.getVULevels();
  $('#vuL').style.width = `${Math.round(vl * 100)}%`;
  $('#vuR').style.width = `${Math.round(vr * 100)}%`;

  const scroll = $('#timelineScroll');
  const px = state.playhead * state.pxPerSec;
  if (px > scroll.scrollLeft + scroll.clientWidth - 40) scroll.scrollLeft = px - 80;
  requestAnimationFrame(playbackLoop);
}

function togglePlay(force = null) {
  const next = force !== null ? force : !state.playing;
  state.playing = next;
  $('#btnPlayPause').textContent = next ? '❚❚' : '▶';
  if (next) {
    engine.ensureAudioContext();
    lastTick = performance.now();
    requestAnimationFrame(playbackLoop);
  } else {
    engine.syncMediaForTime(state, state.playhead, false);
    $('#vuL').style.width = '0%'; $('#vuR').style.width = '0%';
    renderNow();
  }
}

// ── TIMELINE RENDERING (Filmstrips, Waveforms, Keyframes, Drag-Drop, Razor) ─
function drawRuler() {
  const dur = Math.max(state.getProjectDuration() + 8, 25);
  const totalW = Math.max($('#timelineScroll').clientWidth, Math.ceil(dur * state.pxPerSec));
  $('#timelineWrap').style.width = `${totalW}px`;
  const rc = $('#rulerCanvas');
  rc.width = totalW; rc.height = 28;
  const ctx = rc.getContext('2d');
  ctx.fillStyle = '#12141b'; ctx.fillRect(0, 0, totalW, 28);

  const step = state.pxPerSec >= 100 ? 1 : state.pxPerSec >= 45 ? 2 : 5;
  ctx.strokeStyle = '#343c52'; ctx.fillStyle = '#8b95ab'; ctx.font = '10px SF Mono, Menlo, monospace';

  for (let s = 0; s <= dur; s += step) {
    const x = Math.round(s * state.pxPerSec) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, 28); ctx.stroke();
    ctx.fillText(fmtTC(s).slice(0, 5), x + 4, 11);
    for (let k = 1; k < 4; k++) {
      const sx = Math.round((s + (step / 4) * k) * state.pxPerSec) + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, 21); ctx.lineTo(sx, 28); ctx.stroke();
    }
  }

  const ml = $('#markerLayer');
  ml.innerHTML = '';
  for (const m of state.markers) {
    const el = document.createElement('div');
    el.className = 'beat-marker';
    el.style.left = `${m * state.pxPerSec}px`;
    ml.appendChild(el);
  }
}

function renderTimeline() {
  drawRuler();
  const hList = $('#trackHeaderList'), container = $('#tracksContainer');
  hList.innerHTML = ''; container.innerHTML = '';

  for (const tr of state.tracks) {
    const th = document.createElement('div');
    th.className = `track-head ${tr.type}`;
    th.innerHTML = `
      <span class="track-label"><span class="track-dot ${tr.type}"></span>${tr.name}</span>
      <div class="track-ctrls">
        ${tr.type !== 'audio' ? `<button class="tk-btn ${tr.hidden ? 'active' : ''}" data-act="hide" title="Hide Track">👁</button>` : ''}
        <button class="tk-btn ${tr.muted ? 'active' : ''}" data-act="mute" title="Mute Track">🔇</button>
        <button class="tk-btn ${tr.locked ? 'active' : ''}" data-act="lock" title="Lock Track">🔒</button>
      </div>
    `;
    th.querySelectorAll('.tk-btn').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.act === 'hide') tr.hidden = !tr.hidden;
        if (btn.dataset.act === 'mute') tr.muted = !tr.muted;
        if (btn.dataset.act === 'lock') tr.locked = !tr.locked;
        snapshotHistory(); renderTimeline(); renderNow();
      };
    });
    hList.appendChild(th);

    const lane = document.createElement('div');
    lane.className = `track-lane ${tr.type} ${tr.muted || tr.hidden ? 'muted' : ''}`;
    lane.dataset.trackId = tr.id;

    // Accept direct Drag-and-Drop from Media Library onto any track!
    lane.ondragover = e => {
      if (!e.dataTransfer.types.includes('application/x-motioncut-media')) return;
      e.preventDefault();
      lane.classList.add('drop-hover');
    };
    lane.ondragleave = () => lane.classList.remove('drop-hover');
    lane.ondrop = e => {
      lane.classList.remove('drop-hover');
      const mediaId = e.dataTransfer.getData('application/x-motioncut-media');
      if (!mediaId) return;
      e.preventDefault();
      const media = state.library.find(m => m.id === mediaId);
      if (!media) return;
      const rect = $('#timelineWrap').getBoundingClientRect();
      const dropT = Math.max(0, (e.clientX - rect.left) / state.pxPerSec);
      const snapped = snapTime(dropT, getSnapTargets(null));
      const compatTrack = (media.type === 'audio' && tr.type === 'audio') || (media.type !== 'audio' && tr.type === 'video') ? tr.id : null;
      addMediaToTimeline(media, snapped, compatTrack);
    };

    for (const clip of state.clips.filter(c => c.trackId === tr.id)) {
      const el = document.createElement('div');
      el.className = `tl-clip type-${clip.type} ${clip.id === state.selectedClipId ? 'selected' : ''}`;
      el.style.left = `${clip.start * state.pxPerSec}px`;
      el.style.width = `${Math.max(18, clip.duration * state.pxPerSec)}px`;
      el.dataset.clipId = clip.id;

      const media = state.library.find(m => m.id === clip.mediaId);
      // Real multi-frame FFmpeg filmstrip on video clips!
      if (clip.type === 'video' && media?.filmstripUrl) {
        const bg = document.createElement('div');
        bg.className = 'clip-filmstrip';
        bg.style.backgroundImage = `url(${media.filmstripUrl})`;
        el.appendChild(bg);
      } else if (clip.type === 'image' && media?.thumbUrl) {
        const bg = document.createElement('div');
        bg.className = 'clip-filmstrip';
        bg.style.backgroundImage = `url(${media.thumbUrl})`;
        el.appendChild(bg);
      }

      const wf = media && state.waveforms.get(media.id);
      if (wf?.peaks?.length && (clip.type === 'audio' || (clip.type === 'video' && !clip.audioDetached))) {
        const wc = document.createElement('canvas');
        wc.className = 'clip-wave-canvas';
        const cw = Math.max(24, Math.floor(clip.duration * state.pxPerSec));
        wc.width = cw; wc.height = 44;
        const wctx = wc.getContext('2d');
        wctx.fillStyle = clip.type === 'audio' ? 'rgba(0,229,195,0.72)' : 'rgba(255,255,255,0.22)';
        const bars = wf.peaks.length;
        for (let i = 0; i < bars; i++) {
          const h = Math.max(2, wf.peaks[i] * (clip.type === 'audio' ? 36 : 15));
          wctx.fillRect((i / bars) * cw, 44 - h, Math.max(1.2, cw / bars - 1), h);
        }
        el.appendChild(wc);
      }

      const title = document.createElement('div');
      title.className = 'clip-title';
      title.textContent = clip.type === 'text' ? `T  ${(clip.text || '').replace(/\n/g, ' ')}` : clip.name;
      el.appendChild(title);

      const badges = document.createElement('div');
      badges.className = 'clip-badges';
      if ((clip.speed || 1) !== 1) badges.innerHTML += `<span class="clip-pill">${clip.speed}x</span>`;
      if (clip.speedCurve && clip.speedCurve !== 'normal') badges.innerHTML += `<span class="clip-pill">${clip.speedCurve}</span>`;
      const fxCount = Object.keys(clip.effects || {}).length;
      if (fxCount > 0) badges.innerHTML += `<span class="clip-pill">FX×${fxCount}</span>`;
      if (clip.maskType && clip.maskType !== 'none') badges.innerHTML += `<span class="clip-pill">Mask</span>`;
      if (clip.chromaEnabled) badges.innerHTML += `<span class="clip-pill">Key</span>`;
      if (clip.transitionIn && clip.transitionIn !== 'none') badges.innerHTML += `<span class="clip-pill">In:${clip.transitionIn}</span>`;
      el.appendChild(badges);

      // Clickable keyframe diamonds!
      const allKfTimes = new Set();
      Object.values(clip.keyframes || {}).forEach(arr => arr.forEach(k => allKfTimes.add(Math.round(k.t * 100) / 100)));
      for (const kt of allKfTimes) {
        if (kt >= 0 && kt <= clip.duration) {
          const kd = document.createElement('div');
          kd.className = 'clip-kf-dot';
          kd.style.left = `${kt * state.pxPerSec}px`;
          kd.title = `Jump to keyframe ${fmtTC(kt)}`;
          kd.onmousedown = ev => { ev.stopPropagation(); state.playhead = clip.start + kt; selectClip(clip.id); };
          el.appendChild(kd);
        }
      }

      const hL = document.createElement('div'); hL.className = 'trim-handle left';
      const hR = document.createElement('div'); hR.className = 'trim-handle right';
      el.appendChild(hL); el.appendChild(hR);

      // Right-click CapCut context menu!
      el.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        selectClip(clip.id);
        openContextMenu(e.clientX, e.clientY);
      });

      attachClipDrag(el, clip, tr, hL, hR);
      lane.appendChild(el);
    }

    container.appendChild(lane);
  }
  $('#playhead').style.left = `${state.playhead * state.pxPerSec}px`;
}

function getSnapTargets(excludeClipId) {
  if (!state.snap) return [];
  const pts = [0, state.playhead, ...state.markers];
  for (const c of state.clips) {
    if (c.id === excludeClipId) continue;
    pts.push(c.start, c.start + c.duration);
  }
  return pts;
}

function snapTime(t, targets, showGuide = false) {
  const thresh = 10 / state.pxPerSec;
  let best = t, bestD = thresh, snapped = false;
  for (const p of targets) {
    const d = Math.abs(t - p);
    if (d < bestD) { best = p; bestD = d; snapped = true; }
  }
  if (showGuide) {
    const sg = $('#snapGuide');
    if (snapped) { sg.style.left = `${best * state.pxPerSec}px`; sg.classList.remove('hidden'); }
    else sg.classList.add('hidden');
  }
  return Math.max(0, best);
}

function attachClipDrag(el, clip, track, hL, hR) {
  const beginDrag = (mode, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Razor Blade Mode: clicking anywhere on clip slices immediately at clicked time!
    if (state.tool === 'razor' && mode === 'move') {
      const rect = $('#timelineWrap').getBoundingClientRect();
      const clickT = Math.max(0, (e.clientX - rect.left) / state.pxPerSec);
      state.playhead = clickT;
      selectClip(clip.id);
      splitSelectedClip();
      return;
    }

    selectClip(clip.id);
    if (track.locked) return toast('Track is locked');
    const startX = e.clientX;
    const origStart = clip.start, origDur = clip.duration, origTrim = clip.trimStart || 0;
    const targets = getSnapTargets(clip.id);

    const onMove = ev => {
      const dx = (ev.clientX - startX) / state.pxPerSec;
      if (mode === 'move') {
        clip.start = snapTime(Math.max(0, origStart + dx), targets, true);
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n.classList?.contains('track-lane'));
        if (under) {
          const targetTr = state.tracks.find(tr => tr.id === under.dataset.trackId);
          if (targetTr && !targetTr.locked) {
            const ok = (clip.type === 'audio' && targetTr.type === 'audio')
              || (clip.type === 'text' && targetTr.type === 'text')
              || ((clip.type === 'video' || clip.type === 'image' || clip.type === 'graphic') && targetTr.type === 'video');
            if (ok) clip.trackId = targetTr.id;
          }
        }
      } else if (mode === 'left') {
        const speed = clip.speed || 1;
        const delta = Math.max(-origTrim / speed, Math.min(origDur - 0.15, dx));
        const snapped = snapTime(origStart + delta, targets, true) - origStart;
        const clamped = Math.max(-origTrim / speed, Math.min(origDur - 0.15, snapped));
        clip.start = origStart + clamped;
        clip.trimStart = Math.max(0, origTrim + clamped * speed);
        clip.duration = origDur - clamped;
      } else if (mode === 'right') {
        const speed = clip.speed || 1;
        const maxDur = (clip.type === 'image' || clip.type === 'text' || clip.type === 'graphic')
          ? 120 : Math.max(0.2, (clip.maxDuration - origTrim) / speed);
        const newEnd = snapTime(origStart + Math.max(0.15, Math.min(maxDur, origDur + dx)), targets, true);
        clip.duration = Math.max(0.15, Math.min(maxDur, newEnd - origStart));
      }
      renderTimeline();
      renderNow();
    };
    const onUp = () => {
      $('#snapGuide').classList.add('hidden');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      snapshotHistory();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  el.addEventListener('mousedown', e => beginDrag('move', e));
  hL.addEventListener('mousedown', e => beginDrag('left', e));
  hR.addEventListener('mousedown', e => beginDrag('right', e));
}

// ── TIMELINE OPERATIONS ─────────────────────────────────────────────────────
function splitSelectedClip() {
  const clip = getSelectedClip();
  if (!clip) return toast('Select a clip to split');
  const t = state.playhead;
  if (t <= clip.start + 0.06 || t >= clip.start + clip.duration - 0.06) return toast('Place playhead inside the clip to split');
  const leftDur = t - clip.start, rightDur = clip.duration - leftDur, speed = clip.speed || 1;
  const rightClip = JSON.parse(JSON.stringify(clip));
  rightClip.id = uid(clip.type === 'text' ? 'txt' : 'clip');
  rightClip.start = t;
  rightClip.duration = rightDur;
  rightClip.trimStart = (clip.trimStart || 0) + leftDur * speed;
  rightClip.transitionIn = 'none';
  rightClip.keyframes = {};
  clip.duration = leftDur;
  clip.transitionOut = 'none';
  state.clips.push(rightClip);
  snapshotHistory();
  selectClip(rightClip.id);
  toast('Split clip');
}

function duplicateSelectedClip() {
  const clip = getSelectedClip();
  if (!clip) return toast('Select a clip to duplicate');
  const copy = JSON.parse(JSON.stringify(clip));
  copy.id = uid('clip');
  copy.start = clip.start + clip.duration;
  state.clips.push(copy);
  snapshotHistory();
  selectClip(copy.id);
  toast('Duplicated clip');
}

function deleteSelectedClip(ripple = false) {
  const clip = getSelectedClip();
  if (!clip) return;
  const { trackId, start, duration } = clip;
  state.clips = state.clips.filter(c => c.id !== clip.id);
  if (ripple) {
    for (const c of state.clips) {
      if (c.trackId === trackId && c.start >= start + duration - 0.02) c.start = Math.max(0, c.start - duration);
    }
  }
  state.selectedClipId = null;
  snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
  toast(ripple ? 'Ripple deleted clip' : 'Deleted clip');
}

function freezeFrameAtPlayhead() {
  const clip = getSelectedClip();
  if (!clip || clip.type !== 'video') return toast('Select a video clip at playhead');
  const dataUrl = $('#previewCanvas').toDataURL('image/png');
  const media = { id: uid('frz'), name: `Freeze ${fmtTC(state.playhead)}`, type: 'image', url: dataUrl, thumbUrl: dataUrl, duration: 2.5, width: state.canvasWidth, height: state.canvasHeight, hasAudio: false };
  state.library.unshift(media);
  renderMediaLibrary();
  const track = state.tracks.find(t => t.id === 't_vid2') || state.tracks.find(t => t.type === 'video');
  const frzClip = makeDefaultClip(media, track.id, state.playhead);
  state.clips.push(frzClip);
  snapshotHistory(); selectClip(frzClip.id);
  toast('Created 2.5s Freeze Frame');
}

function detachAudioFromSelected() {
  const clip = getSelectedClip();
  if (!clip || clip.type !== 'video') return toast('Select a video clip with audio');
  const media = state.library.find(m => m.id === clip.mediaId);
  if (!media?.hasAudio) return toast('Selected video has no audio');
  const aTrack = state.tracks.find(t => t.type === 'audio');
  clip.audioDetached = true;
  const aClip = makeDefaultClip({ ...media, type: 'audio', name: `${clip.name} (Audio)` }, aTrack.id, clip.start);
  aClip.duration = clip.duration; aClip.trimStart = clip.trimStart; aClip.speed = clip.speed;
  state.clips.push(aClip);
  snapshotHistory(); selectClip(aClip.id);
  toast('Detached audio to Audio track');
}

// ── RIGHT-CLICK CONTEXT MENU ────────────────────────────────────────────────
function openContextMenu(x, y) {
  const m = $('#clipContextMenu');
  m.classList.remove('hidden');
  m.style.left = `${Math.min(window.innerWidth - 210, x)}px`;
  m.style.top  = `${Math.min(window.innerHeight - 280, y)}px`;
}
function closeContextMenu() { $('#clipContextMenu').classList.add('hidden'); }

// ── RIGHT INSPECTOR ─────────────────────────────────────────────────────────
function syncInspectorTabUI() {
  $$('.insp-tab').forEach(b => b.classList.toggle('active', b.dataset.itab === state.activeInspectorTab));
}

function toggleKeyframe(clip, prop) {
  const localT = Math.max(0, Math.min(clip.duration, state.playhead - clip.start));
  clip.keyframes = clip.keyframes || {};
  const arr = clip.keyframes[prop] || [];
  const idx = arr.findIndex(k => Math.abs(k.t - localT) < 0.08);
  if (idx >= 0) { arr.splice(idx, 1); toast(`Removed ${prop} keyframe`); }
  else { arr.push({ t: Math.round(localT * 100) / 100, v: evalClipProp(clip, prop, localT) }); arr.sort((a, b) => a.t - b.t); toast(`Added ${prop} keyframe`); }
  clip.keyframes[prop] = arr;
  snapshotHistory(); renderTimeline(); renderInspector();
}

function jumpKeyframe(clip, dir) {
  const all = [...new Set(Object.values(clip.keyframes || {}).flat().map(k => k.t))].sort((a, b) => a - b);
  if (!all.length) return toast('No keyframes on this clip');
  const localT = state.playhead - clip.start;
  const target = dir > 0 ? all.find(t => t > localT + 0.05) : [...all].reverse().find(t => t < localT - 0.05);
  if (target !== undefined) { state.playhead = clip.start + target; renderNow(); renderInspector(); }
}

function setClipProp(clip, prop, val) {
  const localT = Math.max(0, Math.min(clip.duration, state.playhead - clip.start));
  const arr = clip.keyframes?.[prop];
  if (arr && arr.length > 0) {
    const hit = arr.find(k => Math.abs(k.t - localT) < 0.08);
    if (hit) hit.v = val;
    else { arr.push({ t: Math.round(localT * 100) / 100, v: val }); arr.sort((a, b) => a.t - b.t); }
  } else {
    clip[prop] = val;
  }
  renderNow();
}

function renderSliderRow(clip, label, prop, min, max, step, suffix = '', allowKf = true) {
  const localT = Math.max(0, Math.min(clip.duration, state.playhead - clip.start));
  const cur = allowKf ? evalClipProp(clip, prop, localT) : (clip[prop] ?? 0);
  const kfs = clip.keyframes?.[prop] || [];
  const onKf = kfs.some(k => Math.abs(k.t - localT) < 0.08);
  const row = document.createElement('div');
  row.className = `prop-row ${allowKf ? '' : 'no-kf'}`;
  row.innerHTML = `
    <span class="prop-label">${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${cur}" />
    <span class="prop-val">${Math.round(cur * 10) / 10}${suffix}</span>
    ${allowKf ? `<button class="kf-btn ${onKf ? 'on-kf' : kfs.length ? 'has-kf' : ''}" title="Add/Remove Keyframe">◆</button>` : ''}
  `;
  const range = row.querySelector('input'), valEl = row.querySelector('.prop-val');
  range.oninput = () => {
    const v = parseFloat(range.value);
    valEl.textContent = `${Math.round(v * 10) / 10}${suffix}`;
    setClipProp(clip, prop, v);
  };
  range.onchange = () => { snapshotHistory(); renderTimeline(); };
  row.querySelector('.kf-btn')?.addEventListener('click', () => toggleKeyframe(clip, prop));
  return row;
}

function renderInspector() {
  const body = $('#inspectorBody');
  const clip = getSelectedClip();
  if (!clip) {
    body.innerHTML = `<div class="empty-inspector"><div class="empty-icon">◆</div><p>Select a clip on the timeline or click directly on the player to edit transform, masks, chroma key, keyframes, speed, color, audio, or text.</p></div>`;
    return;
  }
  body.innerHTML = '';
  const tab = state.activeInspectorTab;

  if (tab === 'basic') {
    const s1 = document.createElement('div');
    s1.className = 'insp-section';
    s1.innerHTML = `
      <div class="insp-section-head">
        <span>Transform &amp; Keyframes</span>
        <div class="kf-nav-group">
          <button class="btn-micro" id="btnKfPrev" title="Prev Keyframe">◂◆</button>
          <button class="btn-micro" id="btnKfNext" title="Next Keyframe">◆▸</button>
          <button class="btn-micro" id="btnResetTrans">Reset</button>
        </div>
      </div>`;
    s1.appendChild(renderSliderRow(clip, 'Scale',   'scale',    10, 350, 1, '%', true));
    s1.appendChild(renderSliderRow(clip, 'Pos X',   'x',      -1200, 1200, 2, 'px', true));
    s1.appendChild(renderSliderRow(clip, 'Pos Y',   'y',      -1200, 1200, 2, 'px', true));
    s1.appendChild(renderSliderRow(clip, 'Rotate',  'rotation', -180, 180, 1, '°', true));
    s1.appendChild(renderSliderRow(clip, 'Opacity', 'opacity',   0, 100, 1, '%', true));

    const blendWrap = document.createElement('div');
    blendWrap.className = 'prop-grid-2';
    blendWrap.innerHTML = `
      <select class="prop-select" id="selBlend">
        <option value="source-over">Blend: Normal</option>
        <option value="screen">Blend: Screen</option>
        <option value="multiply">Blend: Multiply</option>
        <option value="overlay">Blend: Overlay</option>
        <option value="lighten">Blend: Lighten</option>
        <option value="darken">Blend: Darken</option>
        <option value="hard-light">Blend: Hard Light</option>
        <option value="difference">Blend: Difference</option>
      </select>
      <div class="row-2">
        <button class="btn-mini ${clip.flipH ? 'active' : ''}" id="btnFlipH">Flip H</button>
        <button class="btn-mini ${clip.flipV ? 'active' : ''}" id="btnFlipV">Flip V</button>
      </div>`;
    blendWrap.querySelector('#selBlend').value = clip.blendMode || 'source-over';
    blendWrap.querySelector('#selBlend').onchange = e => { clip.blendMode = e.target.value; snapshotHistory(); renderNow(); };
    blendWrap.querySelector('#btnFlipH').onclick = () => { clip.flipH = !clip.flipH; snapshotHistory(); renderInspector(); renderNow(); };
    blendWrap.querySelector('#btnFlipV').onclick = () => { clip.flipV = !clip.flipV; snapshotHistory(); renderInspector(); renderNow(); };
    s1.appendChild(blendWrap);

    const fitRow = document.createElement('div');
    fitRow.className = 'row-2';
    fitRow.innerHTML = `
      <button class="btn-mini ${clip.fitMode === 'contain' ? 'active' : ''}" data-fit="contain">Fit</button>
      <button class="btn-mini ${clip.fitMode === 'cover' ? 'active' : ''}" data-fit="cover">Fill Canvas</button>
      <button class="btn-mini ${clip.fitMode === 'stretch' ? 'active' : ''}" data-fit="stretch">Stretch</button>`;
    fitRow.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => { clip.fitMode = b.dataset.fit; snapshotHistory(); renderInspector(); renderNow(); });
    s1.appendChild(fitRow);

    s1.querySelector('#btnKfPrev').onclick = () => jumpKeyframe(clip, -1);
    s1.querySelector('#btnKfNext').onclick = () => jumpKeyframe(clip,  1);
    s1.querySelector('#btnResetTrans').onclick = () => {
      Object.assign(clip, { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, flipH: false, flipV: false, blendMode: 'source-over', keyframes: {} });
      snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
    };
    body.appendChild(s1);

    if (clip.type === 'video' || clip.type === 'image') {
      const s2 = document.createElement('div');
      s2.className = 'insp-section';
      s2.innerHTML = `<div class="insp-section-head"><span>Crop (%)</span><button class="btn-micro" id="btnResetCrop">Reset</button></div>`;
      s2.appendChild(renderSliderRow(clip, 'Top',    'cropTop',    0, 45, 0.5, '%', false));
      s2.appendChild(renderSliderRow(clip, 'Bottom', 'cropBottom', 0, 45, 0.5, '%', false));
      s2.appendChild(renderSliderRow(clip, 'Left',   'cropLeft',   0, 45, 0.5, '%', false));
      s2.appendChild(renderSliderRow(clip, 'Right',  'cropRight',  0, 45, 0.5, '%', false));
      s2.querySelector('#btnResetCrop').onclick = () => { Object.assign(clip, { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 }); snapshotHistory(); renderInspector(); renderNow(); };
      body.appendChild(s2);
    }

    const s3 = document.createElement('div');
    s3.className = 'insp-section';
    s3.innerHTML = `<div class="insp-section-head"><span>Transition Timing</span></div>`;
    s3.appendChild(renderSliderRow(clip, 'Duration', 'transitionDur', 0.1, 1.5, 0.05, 's', false));
    body.appendChild(s3);
  }

  else if (tab === 'mask') {
    const s1 = document.createElement('div');
    s1.className = 'insp-section';
    s1.innerHTML = `
      <div class="insp-section-head"><span>CapCut Mask</span></div>
      <div class="row-2">
        ${['none','split','circle','rect','mirror'].map(m => `<button class="btn-mini ${(clip.maskType||'none')===m?'active':''}" data-mask="${m}">${m.toUpperCase()}</button>`).join('')}
      </div>`;
    s1.querySelectorAll('[data-mask]').forEach(b => b.onclick = () => { clip.maskType = b.dataset.mask; snapshotHistory(); renderTimeline(); renderInspector(); renderNow(); });
    s1.appendChild(renderSliderRow(clip, 'Size',   'maskSize', 5, 100, 1, '%', false));
    s1.appendChild(renderSliderRow(clip, 'Mask X', 'maskX',  -50, 50,  1, '%', false));
    s1.appendChild(renderSliderRow(clip, 'Mask Y', 'maskY',  -50, 50,  1, '%', false));
    s1.appendChild(renderSliderRow(clip, 'Rotate', 'maskRot', -180, 180, 1, '°', false));
    const inv = document.createElement('label');
    inv.className = 'prop-check';
    inv.innerHTML = `<input type="checkbox" ${clip.maskInvert ? 'checked' : ''} /> Invert Mask`;
    inv.querySelector('input').onchange = e => { clip.maskInvert = e.target.checked; snapshotHistory(); renderNow(); };
    s1.appendChild(inv);
    body.appendChild(s1);

    const s2 = document.createElement('div');
    s2.className = 'insp-section';
    s2.innerHTML = `
      <div class="insp-section-head"><span>Chroma Key (Green/Blue Screen)</span></div>
      <div class="prop-grid-2">
        <label class="prop-check"><input type="checkbox" id="chkChroma" ${clip.chromaEnabled ? 'checked' : ''} /> Enable Key</label>
        <label class="prop-label">Key Color <input type="color" id="colChroma" value="${clip.chromaColor || '#00ff00'}" /></label>
      </div>`;
    s2.querySelector('#chkChroma').onchange = e => { clip.chromaEnabled = e.target.checked; snapshotHistory(); renderTimeline(); renderNow(); };
    s2.querySelector('#colChroma').oninput = e => { clip.chromaColor = e.target.value; renderNow(); };
    s2.appendChild(renderSliderRow(clip, 'Strength', 'chromaSimilarity', 5, 95, 1, '%', false));
    s2.appendChild(renderSliderRow(clip, 'Smooth',   'chromaSmoothness', 1, 50, 1, '%', false));
    body.appendChild(s2);
  }

  else if (tab === 'audio') {
    const s = document.createElement('div');
    s.className = 'insp-section';
    s.innerHTML = `<div class="insp-section-head"><span>Audio Mix &amp; EQ</span></div>`;
    s.appendChild(renderSliderRow(clip, 'Volume',   'volume',   0, 2, 0.05, 'x', false));
    s.appendChild(renderSliderRow(clip, 'Fade In',  'fadeIn',   0, 3, 0.1,  's', false));
    s.appendChild(renderSliderRow(clip, 'Fade Out', 'fadeOut',  0, 3, 0.1,  's', false));
    s.appendChild(renderSliderRow(clip, 'Bass EQ',  'eqBass', -12, 12, 1,  'dB', false));
    s.appendChild(renderSliderRow(clip, 'Treble',   'eqTreble',-12,12, 1,  'dB', false));
    const vfx = document.createElement('select');
    vfx.className = 'prop-select';
    vfx.innerHTML = `
      <option value="normal">Voice FX: Normal</option>
      <option value="radio">Voice FX: Vintage Radio</option>
      <option value="deep">Voice FX: Deep Cinema</option>
      <option value="chipmunk">Voice FX: High Pitch</option>`;
    vfx.value = clip.voiceFx || 'normal';
    vfx.onchange = e => { clip.voiceFx = e.target.value; snapshotHistory(); renderNow(); };
    s.appendChild(vfx);
    const chk = document.createElement('label');
    chk.className = 'prop-check';
    chk.innerHTML = `<input type="checkbox" ${clip.muted ? 'checked' : ''} /> Mute this clip`;
    chk.querySelector('input').onchange = e => { clip.muted = e.target.checked; snapshotHistory(); renderNow(); };
    s.appendChild(chk);
    body.appendChild(s);
  }

  else if (tab === 'speed') {
    const s = document.createElement('div');
    s.className = 'insp-section';
    s.innerHTML = `<div class="insp-section-head"><span>Speed &amp; Curve Ramps</span></div>`;
    const row = renderSliderRow(clip, 'Speed', 'speed', 0.25, 4.0, 0.05, 'x', false);
    row.querySelector('input').onchange = () => {
      const sp = parseFloat(row.querySelector('input').value);
      const srcSpan = (clip.maxDuration || clip.duration) - (clip.trimStart || 0);
      clip.speed = sp;
      if (clip.type === 'video' || clip.type === 'audio') clip.duration = Math.max(0.2, Math.min(clip.duration, srcSpan / sp));
      snapshotHistory(); renderTimeline(); renderNow();
    };
    s.appendChild(row);
    const curveBox = document.createElement('div');
    curveBox.className = 'row-2';
    curveBox.innerHTML = Object.entries(SPEED_CURVES).map(([k, v]) => `<button class="btn-mini ${(clip.speedCurve||'normal')===k?'active':''}" data-curve="${k}">${v.name}</button>`).join('');
    curveBox.querySelectorAll('[data-curve]').forEach(b => b.onclick = () => {
      clip.speedCurve = b.dataset.curve; snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
      toast(`Speed curve: ${SPEED_CURVES[clip.speedCurve].name}`);
    });
    s.appendChild(curveBox);
    const rev = document.createElement('label');
    rev.className = 'prop-check';
    rev.innerHTML = `<input type="checkbox" ${clip.reverse ? 'checked' : ''} /> Reverse Clip Playback`;
    rev.querySelector('input').onchange = e => { clip.reverse = e.target.checked; snapshotHistory(); renderNow(); };
    s.appendChild(rev);
    body.appendChild(s);
  }

  else if (tab === 'color') {
    const s = document.createElement('div');
    s.className = 'insp-section';
    s.innerHTML = `<div class="insp-section-head"><span>Color Grading</span><button class="btn-micro" id="btnResetColor">Reset</button></div>`;
    s.appendChild(renderSliderRow(clip, 'Brightness', 'brightness', 20, 200, 1, '%', false));
    s.appendChild(renderSliderRow(clip, 'Contrast',   'contrast',   20, 220, 1, '%', false));
    s.appendChild(renderSliderRow(clip, 'Saturation', 'saturate',   0,  250, 1, '%', false));
    s.appendChild(renderSliderRow(clip, 'Hue',        'hue',       -180, 180, 1, '°', false));
    s.appendChild(renderSliderRow(clip, 'Blur',       'blur',       0,  24,  0.5, 'px', false));
    s.appendChild(renderSliderRow(clip, 'Vignette',   'vignette',   0,  100, 1, '%', false));
    s.querySelector('#btnResetColor').onclick = () => {
      Object.assign(clip, { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, vignette: 0 });
      snapshotHistory(); renderInspector(); renderNow();
    };
    body.appendChild(s);
  }

  else if (tab === 'text') {
    if (clip.type === 'graphic' && clip.graphicType === 'lowerThird') {
      const s = document.createElement('div');
      s.className = 'insp-section';
      s.innerHTML = `
        <div class="insp-section-head"><span>Lower Third Copy</span></div>
        <input class="prop-input" id="gTitle" value="${clip.graphicTitle || ''}" />
        <input class="prop-input" id="gSub" value="${clip.graphicSub || ''}" />`;
      s.querySelector('#gTitle').oninput = e => { clip.graphicTitle = e.target.value; renderNow(); };
      s.querySelector('#gSub').oninput   = e => { clip.graphicSub   = e.target.value; renderNow(); };
      body.appendChild(s);
      return;
    }
    if (clip.type !== 'text') {
      body.innerHTML = `<div class="empty-inspector"><p>Select a Text clip (or add one from the Text tab) to edit typography.</p></div>`;
      return;
    }
    const s = document.createElement('div');
    s.className = 'insp-section';
    s.innerHTML = `
      <div class="insp-section-head"><span>Typography &amp; Animation</span></div>
      <textarea class="prop-textarea" id="txtContent">${clip.text || ''}</textarea>
      <div class="prop-grid-2">
        <select class="prop-select" id="txtFont">
          <option value="DIN Condensed, Impact, sans-serif">DIN Condensed</option>
          <option value="-apple-system, Inter, sans-serif">SF / Inter Bold</option>
          <option value="Impact, Arial Black, sans-serif">Impact Heavy</option>
          <option value="SF Mono, Menlo, monospace">Monospace HUD</option>
          <option value="Avenir Next, Helvetica Neue, sans-serif">Avenir Next</option>
          <option value="Georgia, serif">Editorial Serif</option>
        </select>
        <select class="prop-select" id="txtAnim">
          <option value="none">No Animation</option>
          <option value="fade">Fade In</option>
          <option value="pop">Pop Bounce</option>
          <option value="slideUp">Slide Up</option>
          <option value="typewriter">Typewriter</option>
          <option value="glitch">Glitch In</option>
        </select>
      </div>
      <div class="prop-grid-2">
        <label class="prop-label">Color <input type="color" id="txtColor" value="${clip.textColor || '#ffffff'}" /></label>
        <label class="prop-label">Stroke <input type="color" id="txtStroke" value="${clip.strokeColor && clip.strokeColor !== 'transparent' ? clip.strokeColor : '#000000'}" /></label>
      </div>
      <div class="prop-grid-2">
        <label class="prop-label">BG Box <input type="color" id="txtBg" value="${clip.textBg && clip.textBg !== 'transparent' ? clip.textBg : '#000000'}" /></label>
        <label class="prop-label">BG Alpha <input type="range" id="txtBgA" min="0" max="1" step="0.05" value="${clip.textBgAlpha || 0}" /></label>
      </div>`;
    s.querySelector('#txtFont').value = clip.fontFamily || 'DIN Condensed, Impact, sans-serif';
    s.querySelector('#txtAnim').value = clip.textAnim || 'none';
    s.querySelector('#txtContent').oninput = e => { clip.text = e.target.value; renderTimeline(); renderNow(); };
    s.querySelector('#txtContent').onchange = snapshotHistory;
    s.querySelector('#txtFont').onchange = e => { clip.fontFamily = e.target.value; snapshotHistory(); renderNow(); };
    s.querySelector('#txtAnim').onchange = e => { clip.textAnim = e.target.value; snapshotHistory(); renderNow(); };
    s.querySelector('#txtColor').oninput = e => { clip.textColor = e.target.value; renderNow(); };
    s.querySelector('#txtStroke').oninput = e => { clip.strokeColor = e.target.value; renderNow(); };
    s.querySelector('#txtBg').oninput = e => { clip.textBg = e.target.value; if (!clip.textBgAlpha) clip.textBgAlpha = 0.85; renderNow(); };
    s.querySelector('#txtBgA').oninput = e => { clip.textBgAlpha = parseFloat(e.target.value); if (clip.textBg === 'transparent') clip.textBg = '#000000'; renderNow(); };
    s.appendChild(renderSliderRow(clip, 'Font Size', 'fontSize', 18, 220, 2, 'px', false));
    s.appendChild(renderSliderRow(clip, 'Stroke W',  'strokeWidth', 0, 24, 1, 'px', false));
    body.appendChild(s);
  }
}

// ── STACKABLE VFX INTENSITY PANEL & CAPTIONS LIST ───────────────────────────
function renderEffectIntensityPanel() {
  const wrap = $('#effectIntensityWrap');
  const clip = getSelectedClip();
  $$('#effectsGrid .preset-card').forEach(c => {
    c.classList.toggle('active', Boolean(clip?.effects?.[c.dataset.fxId]));
  });
  if (!clip || !Object.keys(clip.effects || {}).length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '';
  for (const [fxId, val] of Object.entries(clip.effects)) {
    const meta = EFFECT_PRESETS.find(e => e.id === fxId);
    const row = document.createElement('div');
    row.className = 'fx-chip-row';
    row.innerHTML = `
      <div class="fx-chip-head"><span>${meta?.name || fxId}</span><span>${val}%</span></div>
      <input type="range" min="10" max="100" step="2" value="${val}" />`;
    const inp = row.querySelector('input');
    const lbl = row.querySelector('.fx-chip-head span:last-child');
    inp.oninput = () => { clip.effects[fxId] = Number(inp.value); lbl.textContent = `${clip.effects[fxId]}%`; renderNow(); };
    inp.onchange = snapshotHistory;
    wrap.appendChild(row);
  }
}

function renderCaptionsList() {
  const list = $('#captionList');
  list.innerHTML = '';
  state.captions.sort((a, b) => a.start - b.start).forEach(cap => {
    const row = document.createElement('div');
    row.className = 'caption-row';
    row.innerHTML = `
      <div class="caption-row-head">
        <span>${fmtTC(cap.start)} → ${fmtTC(cap.end)}</span>
        <div>
          <button class="btn-micro" data-act="go">Jump</button>
          <button class="btn-micro" data-act="del">✕</button>
        </div>
      </div>
      <input type="text" value="${(cap.text || '').replace(/"/g, '&quot;')}" />`;
    row.querySelector('input').oninput = e => { cap.text = e.target.value; renderNow(); };
    row.querySelector('input').onchange = snapshotHistory;
    row.querySelector('[data-act="go"]').onclick = () => { state.playhead = cap.start; renderNow(); };
    row.querySelector('[data-act="del"]').onclick = () => {
      state.captions = state.captions.filter(c => c.id !== cap.id);
      snapshotHistory(); renderCaptionsList(); renderNow();
    };
    list.appendChild(row);
  });
}

function parseSrt(srtText) {
  const blocks = srtText.trim().replace(/\r/g, '').split(/\n\n+/);
  const toSec = s => {
    const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
  };
  const out = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const [a, c] = timeLine.split('-->');
    const txt = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (txt) out.push({ id: uid('cc'), start: toSec(a), end: toSec(c), text: txt });
  }
  return out;
}

function exportSrtText() {
  const fmtSrt = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };
  return state.captions.map((c, i) => `${i + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${c.text}\n`).join('\n');
}

// ── MEDIA LIBRARY & PRESETS ─────────────────────────────────────────────────
function renderMediaLibrary() {
  const grid = $('#mediaGrid'), aList = $('#audioList');
  grid.innerHTML = ''; aList.innerHTML = '';
  for (const item of state.library) {
    if (item.type === 'audio') {
      const row = document.createElement('div');
      row.className = 'audio-row';
      row.innerHTML = `<div class="audio-row-info"><div class="audio-row-name">${item.name}</div><div class="audio-row-dur">${fmtTC(item.duration)}</div></div><button class="btn-mini">+ Add</button>`;
      row.querySelector('button').onclick = () => addMediaToTimeline(item, state.playhead);
      aList.appendChild(row);
    }
    if (state.mediaFilter !== 'all' && item.type !== state.mediaFilter) continue;
    const card = document.createElement('div');
    card.className = 'media-card';
    card.draggable = true;
    card.ondragstart = e => e.dataTransfer.setData('application/x-motioncut-media', item.id);
    card.innerHTML = `
      <div class="media-thumb">
        ${item.thumbUrl ? `<img src="${item.thumbUrl}" loading="lazy" />` : `<span class="audio-glyph">♫</span>`}
        ${item.type === 'video' ? `<span class="media-res">${item.width}×${item.height}</span>` : ''}
        <span class="media-badge">${fmtTC(item.duration)}</span>
        <button class="media-add-btn" title="Add to Timeline">+</button>
      </div>
      <div class="media-meta"><div class="media-name" title="${item.name}">${item.name}</div></div>`;
    card.onclick = () => addMediaToTimeline(item);
    grid.appendChild(card);
  }
}

function populatePresets() {
  for (const sfx of SFX_PRESETS) {
    const c = document.createElement('div'); c.className = 'preset-card';
    c.innerHTML = `<div class="preset-swatch" style="background:#0d2825;color:#00e5c3">♫ ${sfx.dur}s</div><div class="preset-name">${sfx.name}</div>`;
    c.onclick = () => {
      const item = { id: uid('sfx'), name: sfx.name, type: 'audio', url: synthSfxWavUrl(sfx.id), duration: sfx.dur, hasAudio: true };
      state.library.push(item); addMediaToTimeline(item, state.playhead);
    };
    $('#sfxGrid').appendChild(c);
  }
  for (const p of TEXT_PRESETS) {
    const c = document.createElement('div'); c.className = 'preset-card';
    c.innerHTML = `<div class="preset-swatch" style="background:#111319;color:${p.color};font-family:${p.font}">${p.text.split('\n')[0].slice(0, 12)}</div><div class="preset-name">${p.name}</div>`;
    c.onclick = () => addTextClip(p);
    $('#textPresetGrid').appendChild(c);
  }
  for (const g of GRAPHIC_PRESETS) {
    const c = document.createElement('div'); c.className = 'preset-card';
    c.innerHTML = `<div class="preset-swatch" style="background:${g.swatch};color:#00e5c3">${g.label}</div><div class="preset-name">${g.name}</div>`;
    c.onclick = () => addGraphicClip(g);
    $('#graphicsGrid').appendChild(c);
  }
  for (const ef of EFFECT_PRESETS) {
    const c = document.createElement('div'); c.className = 'preset-card'; c.dataset.fxId = ef.id;
    c.innerHTML = `<div class="preset-swatch" style="background:${ef.swatch};color:#fff">${ef.label}</div><div class="preset-name">${ef.name}</div>`;
    c.onclick = () => {
      const clip = getSelectedClip();
      if (!clip || clip.type === 'audio' || clip.type === 'text') return toast('Select a video or image clip first');
      clip.effects = clip.effects || {};
      if (clip.effects[ef.id]) delete clip.effects[ef.id];
      else clip.effects[ef.id] = 72;
      snapshotHistory(); renderTimeline(); renderEffectIntensityPanel(); renderNow();
    };
    $('#effectsGrid').appendChild(c);
  }
  for (const tr of TRANSITION_PRESETS) {
    const c = document.createElement('div'); c.className = 'preset-card';
    c.innerHTML = `<div class="preset-swatch" style="background:#181d29;color:#00e5c3;font-size:18px">${tr.label}</div><div class="preset-name">${tr.name}</div>`;
    c.onclick = () => {
      const clip = getSelectedClip();
      if (!clip) return toast('Select a clip first');
      if (state.transSide === 'in') clip.transitionIn = tr.id; else clip.transitionOut = tr.id;
      snapshotHistory(); renderTimeline(); renderNow();
      toast(`Set ${state.transSide.toUpperCase()}: ${tr.name}`);
    };
    $('#transitionsGrid').appendChild(c);
  }
  for (const fl of FILTER_PRESETS) {
    const c = document.createElement('div'); c.className = 'preset-card';
    const cssF = `brightness(${fl.vals.brightness}%) contrast(${fl.vals.contrast}%) saturate(${fl.vals.saturate}%) hue-rotate(${fl.vals.hue}deg)`;
    c.innerHTML = `<div class="preset-swatch" style="background:linear-gradient(135deg,#ff4d6d,#4c8dff,#00e5c3);filter:${cssF}"></div><div class="preset-name">${fl.name}</div>`;
    c.onclick = () => {
      const clip = getSelectedClip();
      if (!clip || clip.type === 'audio' || clip.type === 'text') return toast('Select a video or image clip first');
      Object.assign(clip, fl.vals);
      snapshotHistory(); renderInspector(); renderNow();
      toast(`Filter: ${fl.name}`);
    };
    $('#filtersGrid').appendChild(c);
  }
}

// ── FULL ON-CANVAS INTERACTION (Select, Move, 4-Corner Scale, Rotate, Double-Click Text!) ──
function setupCanvasInteraction() {
  const ov = $('#overlayCanvas');
  const toCanvasCoords = e => {
    const rect = ov.getBoundingClientRect();
    return [(e.clientX - rect.left) * (state.canvasWidth / rect.width), (e.clientY - rect.top) * (state.canvasHeight / rect.height), rect];
  };

  ov.addEventListener('mousemove', e => {
    const [px, py] = toCanvasCoords(e);
    const hit = engine.hitTestCanvas(px, py, state.selectedClipId);
    ov.style.cursor = !hit ? 'default' : hit.mode === 'rotate' ? 'grab' : hit.mode === 'scale' ? 'nwse-resize' : 'move';
  });

  ov.addEventListener('dblclick', e => {
    const [px, py, rect] = toCanvasCoords(e);
    const hit = engine.hitTestCanvas(px, py, state.selectedClipId);
    if (!hit) return;
    const clip = state.clips.find(c => c.id === hit.clipId);
    if (!clip || clip.type !== 'text') return;
    selectClip(clip.id);
    const ed = $('#inlineTextEditor');
    ed.value = clip.text || '';
    ed.style.left = `${(hit.bounds.cx / state.canvasWidth) * rect.width}px`;
    ed.style.top  = `${(hit.bounds.cy / state.canvasHeight) * rect.height}px`;
    ed.classList.remove('hidden');
    ed.focus(); ed.select();
    const finish = () => {
      clip.text = ed.value;
      ed.classList.add('hidden');
      snapshotHistory(); renderTimeline(); renderInspector(); renderNow();
    };
    ed.onblur = finish;
    ed.onkeydown = ev => { if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) ed.blur(); };
  });

  ov.addEventListener('mousedown', e => {
    const [px, py] = toCanvasCoords(e);
    const hit = engine.hitTestCanvas(px, py, state.selectedClipId);
    if (!hit) { selectClip(null); return; }
    selectClip(hit.clipId);
    const clip = getSelectedClip();
    if (!clip) return;

    const localT = Math.max(0, Math.min(clip.duration, state.playhead - clip.start));
    const origX = evalClipProp(clip, 'x', localT) || 0;
    const origY = evalClipProp(clip, 'y', localT) || 0;
    const origScale = evalClipProp(clip, 'scale', localT) ?? 100;
    const origRot = evalClipProp(clip, 'rotation', localT) || 0;
    const startDist = Math.max(20, Math.hypot(px - hit.bounds.cx, py - hit.bounds.cy));
    const startAng = Math.atan2(py - hit.bounds.cy, px - hit.bounds.cx);

    const onMove = ev => {
      const [cx, cy] = toCanvasCoords(ev);
      if (hit.mode === 'move') {
        let nx = origX + (cx - px), ny = origY + (cy - py);
        engine.snapLines.x = Math.abs(nx) < 18;
        engine.snapLines.y = Math.abs(ny) < 18;
        if (engine.snapLines.x) nx = 0;
        if (engine.snapLines.y) ny = 0;
        setClipProp(clip, 'x', Math.round(nx));
        setClipProp(clip, 'y', Math.round(ny));
      } else if (hit.mode === 'scale') {
        const dist = Math.max(10, Math.hypot(cx - hit.bounds.cx, cy - hit.bounds.cy));
        const ns = Math.max(10, Math.min(350, Math.round(origScale * (dist / startDist))));
        setClipProp(clip, 'scale', ns);
      } else if (hit.mode === 'rotate') {
        const ang = Math.atan2(cy - hit.bounds.cy, cx - hit.bounds.cx);
        let deg = origRot + ((ang - startAng) * 180) / Math.PI;
        if (Math.abs(deg % 90) < 4) deg = Math.round(deg / 90) * 90;
        setClipProp(clip, 'rotation', Math.round(deg));
      }
      renderInspector();
    };
    const onUp = () => {
      engine.snapLines = { x: false, y: false };
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      snapshotHistory(); renderNow();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ── SMART TOOLS & EXPORT ────────────────────────────────────────────────────
async function uploadFiles(fileList) {
  for (const file of fileList) {
    toast(`Importing ${file.name}...`);
    const resp = await fetch('/api/upload', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name) }, body: file });
    const data = await resp.json();
    if (data.item) { state.library.unshift(data.item); renderMediaLibrary(); toast(`Imported "${data.item.name}"`); }
    else toast(`Import failed: ${data.error || 'Error'}`);
  }
}

async function runAutoCrop() {
  const clip = getSelectedClip();
  if (!clip || clip.type !== 'video') return toast('Select a video clip on the timeline first');
  toast('Running FFmpeg cropdetect...');
  const resp = await fetch(`/api/cropdetect/${clip.mediaId}`);
  const data = await resp.json();
  if (!data.crop) return toast('No black bars detected');
  const { w, h, x, y } = data.crop;
  clip.cropLeft = Math.round((x / data.width) * 1000) / 10;
  clip.cropRight = Math.round(((data.width - x - w) / data.width) * 1000) / 10;
  clip.cropTop = Math.round((y / data.height) * 1000) / 10;
  clip.cropBottom = Math.round(((data.height - y - h) / data.height) * 1000) / 10;
  clip.fitMode = 'cover';
  snapshotHistory(); renderInspector(); renderNow();
  toast(`Auto-cropped to ${w}×${h} active content!`);
}

async function runVisionCutout() {
  const clip = getSelectedClip();
  if (!clip || (clip.type !== 'video' && clip.type !== 'image')) return toast('Select a video or image clip first');
  const srcT = (clip.trimStart || 0) + Math.max(0, state.playhead - clip.start) * (clip.speed || 1);
  toast('Running Apple Vision foreground cutout...');
  const resp = await fetch(`/api/cutout/${clip.mediaId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time: srcT }) });
  const data = await resp.json();
  if (!resp.ok || !data.item) return toast(`Cutout error: ${data.error || 'failed'}`);
  state.library.unshift(data.item); renderMediaLibrary();
  const ovTrack = state.tracks.find(t => t.id === 't_vid2') || state.tracks.find(t => t.type === 'video');
  const c = makeDefaultClip(data.item, ovTrack.id, state.playhead);
  state.clips.push(c); snapshotHistory(); selectClip(c.id);
  toast('Added Apple Vision transparent cutout layer!');
}

async function runAutoBeats() {
  const clip = getSelectedClip();
  if (!clip) return toast('Select an audio or video clip');
  toast('Detecting audio beats...');
  const resp = await fetch(`/api/waveform/${clip.mediaId}?bins=120`);
  const data = await resp.json();
  if (!data.beats?.length) return toast('No beats detected');
  const speed = clip.speed || 1;
  const fresh = data.beats.map(b => clip.start + (b - (clip.trimStart || 0)) / speed).filter(t => t >= clip.start && t <= clip.start + clip.duration);
  state.markers = [...new Set([...state.markers, ...fresh.map(v => Math.round(v * 100) / 100)])].sort((a, b) => a - b);
  snapshotHistory(); renderTimeline();
  toast(`Dropped ${fresh.length} beat markers onto timeline!`);
}

function computeExportSize() {
  const ratioChoice = $('#expAspect').value, res = Number($('#expRes').value);
  const ratio = ratioChoice === 'current' ? state.aspect : ratioChoice;
  const map = { '16:9': [Math.round((res * 16) / 9), res], '9:16': [res, Math.round((res * 16) / 9)], '1:1': [res, res], '4:5': [res, Math.round((res * 5) / 4)], '21:9': [Math.round((res * 21) / 9), res] };
  let [w, h] = map[ratio] || [1920, 1080];
  return { width: Math.round(w / 2) * 2, height: Math.round(h / 2) * 2 };
}

async function startExport() {
  if (!state.clips.length) return toast('Add at least one clip first');
  togglePlay(false);
  const btn = $('#btnExportStart'), progWrap = $('#exportProgressWrap'), progBar = $('#exportProgressBar'), progText = $('#exportStatusText'), resBox = $('#exportResultBox');
  btn.disabled = true; progWrap.classList.remove('hidden'); resBox.classList.add('hidden');

  const { width, height } = computeExportSize();
  const fps = Number($('#expFps').value), crf = Number($('#expCrf').value);
  const name = $('#expName').value.trim() || `motioncut_${Date.now()}`;
  const mode = $('#expEngine').value;

  try {
    let result;
    if (mode === 'quick') {
      const clip = getSelectedClip() || state.clips.find(c => c.type === 'video');
      if (!clip || clip.type !== 'video') throw new Error('Select a video clip for Instant FFmpeg Reframe');
      progBar.style.width = '45%'; progText.textContent = 'Running native FFmpeg hardware reframe...';
      const media = state.library.find(m => m.id === clip.mediaId);
      const cropRect = (clip.cropTop || clip.cropBottom || clip.cropLeft || clip.cropRight) ? {
        x: Math.round((clip.cropLeft / 100) * media.width), y: Math.round((clip.cropTop / 100) * media.height),
        w: Math.round(((100 - clip.cropLeft - clip.cropRight) / 100) * media.width), h: Math.round(((100 - clip.cropTop - clip.cropBottom) / 100) * media.height),
      } : null;
      const resp = await fetch('/api/quick-export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: clip.mediaId, width, height, fps, crf, name, trimStart: clip.trimStart || 0, duration: clip.duration, fitMode: state.bgMode === 'blur' ? 'blur' : (clip.fitMode === 'cover' ? 'cover' : 'contain'), cropRect }),
      });
      result = await resp.json();
      if (!resp.ok || !result.ok) throw new Error(result.error || 'Quick export failed');
      progBar.style.width = '100%'; progText.textContent = 'Export complete!';
    } else {
      result = await engine.exportDeterministicMP4(state, { width, height, fps, crf, name }, (pct, msg) => {
        progBar.style.width = `${pct}%`; progText.textContent = msg;
      });
    }
    const mb = (result.size / (1024 * 1024)).toFixed(2);
    resBox.innerHTML = `
      <div><strong>Exported ${result.fileName}</strong> (${result.width}×${result.height} · ${result.fps}fps · ${result.duration.toFixed(2)}s · ${mb} MB)</div>
      <code>${result.filePath}</code>
      <div><a href="${result.downloadUrl}?download=1" download="${result.fileName}">⬇ Download MP4</a> &nbsp;·&nbsp; <a href="${result.downloadUrl}" target="_blank">▶ Open in New Tab</a></div>`;
    resBox.classList.remove('hidden');
    toast('Studio MP4 Export Complete!');
    await refreshLibrary();
  } catch (err) {
    progText.textContent = `Error: ${err.message}`;
    toast(`Export failed: ${err.message}`, 4000);
  } finally {
    btn.disabled = false; fitPreviewCanvas(); renderNow();
  }
}

function setTool(mode) {
  state.tool = mode;
  $('#btnToolSelect').classList.toggle('active', mode === 'select');
  $('#btnToolRazor').classList.toggle('active', mode === 'razor');
  $('#timelineScroll').classList.toggle('razor-mode', mode === 'razor');
}

// ── UI WIRING & SHORTCUTS ───────────────────────────────────────────────────
function setupUI() {
  $$('.rail-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.rail-btn').forEach(b => b.classList.remove('active'));
      $$('.drawer-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active'); $(`#pane-${btn.dataset.tab}`).classList.add('active');
    };
  });
  $$('.insp-tab').forEach(btn => {
    btn.onclick = () => { state.activeInspectorTab = btn.dataset.itab; syncInspectorTabUI(); renderInspector(); };
  });
  $$('#mediaFilterChips .chip').forEach(btn => {
    btn.onclick = () => {
      $$('#mediaFilterChips .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); state.mediaFilter = btn.dataset.filter; renderMediaLibrary();
    };
  });
  $$('.aspect-btn').forEach(btn => {
    btn.onclick = () => {
      state.aspect = btn.dataset.ratio; state.canvasWidth = Number(btn.dataset.w); state.canvasHeight = Number(btn.dataset.h);
      updateAspectUI(); snapshotHistory(); renderNow();
      toast(`Canvas ${state.aspect} (${state.canvasWidth}×${state.canvasHeight})`);
    };
  });
  $('#fpsSelect').onchange = e => { state.fps = Number(e.target.value); };
  $$('.bg-mode-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.bg-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); state.bgMode = btn.dataset.bg; snapshotHistory(); renderNow();
    };
  });
  $$('[data-trans-side]').forEach(btn => {
    btn.onclick = () => { $$('[data-trans-side]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); state.transSide = btn.dataset.transSide; };
  });

  // Captions tab wiring
  $('#btnAddCaptionAtPlayhead').onclick = () => {
    state.captions.push({ id: uid('cc'), start: Math.round(state.playhead * 100) / 100, end: Math.round((state.playhead + 2.2) * 100) / 100, text: 'Type your caption here' });
    snapshotHistory(); renderCaptionsList(); renderNow();
  };
  $$('#captionStyleRow .btn-mini').forEach(b => b.onclick = () => {
    $$('#captionStyleRow .btn-mini').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); state.captionStyle = b.dataset.cstyle; snapshotHistory(); renderNow();
  });
  $('#btnImportSrt').onclick = () => $('#srtFileInput').click();
  $('#srtFileInput').onchange = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    const parsed = parseSrt(await f.text());
    state.captions.push(...parsed);
    snapshotHistory(); renderCaptionsList(); renderNow();
    toast(`Imported ${parsed.length} captions from ${f.name}`);
    e.target.value = '';
  };
  $('#btnExportSrt').onclick = () => {
    if (!state.captions.length) return toast('No captions to export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportSrtText()], { type: 'text/plain' }));
    a.download = `${$('#projectTitle').value || 'captions'}.srt`; a.click();
    toast('Exported .SRT file');
  };
  $('#btnClearEffects').onclick = () => {
    const clip = getSelectedClip(); if (!clip) return;
    clip.effects = {}; snapshotHistory(); renderTimeline(); renderEffectIntensityPanel(); renderNow();
  };

  // Transport
  $('#btnPlayPause').onclick = () => togglePlay();
  $('#btnJumpStart').onclick = () => { state.playhead = 0; renderNow(); };
  $('#btnJumpEnd').onclick = () => { state.playhead = state.getProjectDuration(); renderNow(); };
  $('#btnStepBack').onclick = () => { togglePlay(false); state.playhead = Math.max(0, state.playhead - 1 / state.fps); renderNow(); };
  $('#btnStepFwd').onclick = () => { togglePlay(false); state.playhead = Math.min(state.getProjectDuration(), state.playhead + 1 / state.fps); renderNow(); };
  $('#btnLoop').onclick = e => { state.loop = !state.loop; e.currentTarget.classList.toggle('active', state.loop); };
  $('#btnMasterMute').onclick = e => { state.masterMute = !state.masterMute; e.currentTarget.textContent = state.masterMute ? '🔇' : '🔊'; renderNow(); };
  $('#btnFullscreen').onclick = () => { const el = $('#canvasShell'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };
  $('#btnFitPreview').onclick = e => { engine.showGuides = !engine.showGuides; e.currentTarget.classList.toggle('active', engine.showGuides); renderNow(); };
  $('#btnSnapshot').onclick = () => { const a = document.createElement('a'); a.href = $('#previewCanvas').toDataURL('image/png'); a.download = `frame_${fmtTC(state.playhead).replace(/[:.]/g, '-')}.png`; a.click(); toast('Saved frame PNG'); };

  // Timeline toolbar & Splitter
  $('#btnToolSelect').onclick = () => setTool('select');
  $('#btnToolRazor').onclick = () => setTool('razor');
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnSplit').onclick = splitSelectedClip;
  $('#btnDuplicate').onclick = duplicateSelectedClip;
  $('#btnFreeze').onclick = freezeFrameAtPlayhead;
  $('#btnDetachAudio').onclick = detachAudioFromSelected;
  $('#btnRippleDelete').onclick = () => deleteSelectedClip(true);
  $('#btnDelete').onclick = () => deleteSelectedClip(false);
  $('#btnAddMarker').onclick = () => { state.markers.push(Math.round(state.playhead * 100) / 100); snapshotHistory(); renderTimeline(); toast(`Marker @ ${fmtTC(state.playhead)}`); };
  $('#btnToggleSnap').onclick = e => { state.snap = !state.snap; e.currentTarget.classList.toggle('active', state.snap); };
  $('#btnAddTrackV').onclick = () => { const n = state.tracks.filter(t => t.type === 'video').length + 1; state.tracks.splice(1, 0, { id: uid('tv'), name: `Overlay ${n - 1}`, type: 'video', muted: false, hidden: false, locked: false }); snapshotHistory(); renderTimeline(); };
  $('#btnAddTrackA').onclick = () => { const n = state.tracks.filter(t => t.type === 'audio').length + 1; state.tracks.push({ id: uid('ta'), name: `Audio ${n}`, type: 'audio', muted: false, hidden: false, locked: false }); snapshotHistory(); renderTimeline(); };
  $('#zoomSlider').oninput = e => { state.pxPerSec = Number(e.target.value); renderTimeline(); };
  $('#btnZoomOut').onclick = () => { state.pxPerSec = Math.max(20, state.pxPerSec - 16); $('#zoomSlider').value = state.pxPerSec; renderTimeline(); };
  $('#btnZoomIn').onclick = () => { state.pxPerSec = Math.min(240, state.pxPerSec + 16); $('#zoomSlider').value = state.pxPerSec; renderTimeline(); };
  $('#btnZoomFit').onclick = () => { state.pxPerSec = Math.max(20, Math.min(240, Math.floor(Math.max(300, $('#timelineScroll').clientWidth - 40) / Math.max(5, state.getProjectDuration())))); $('#zoomSlider').value = state.pxPerSec; renderTimeline(); };

  // Draggable vertical timeline splitter
  const sp = $('#timelineSplitter'), dock = $('#timelineDock');
  sp.onmousedown = e => {
    sp.classList.add('dragging');
    const startY = e.clientY, startH = dock.offsetHeight;
    const onMove = ev => { dock.style.height = `${Math.max(170, Math.min(window.innerHeight * 0.6, startH - (ev.clientY - startY)))}px`; fitPreviewCanvas(); };
    const onUp = () => { sp.classList.remove('dragging'); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  // Context menu actions
  $('#clipContextMenu').querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.act, clip = getSelectedClip();
      closeContextMenu();
      if (!clip) return;
      if (act === 'split') splitSelectedClip();
      else if (act === 'duplicate') duplicateSelectedClip();
      else if (act === 'copyAttrs') {
        state.copiedAttrs = { brightness: clip.brightness, contrast: clip.contrast, saturate: clip.saturate, hue: clip.hue, blur: clip.blur, vignette: clip.vignette, effects: JSON.parse(JSON.stringify(clip.effects || {})), blendMode: clip.blendMode };
        toast('Copied clip style & color');
      } else if (act === 'pasteAttrs') {
        if (!state.copiedAttrs) return toast('Copy attributes from a clip first');
        Object.assign(clip, JSON.parse(JSON.stringify(state.copiedAttrs)));
        snapshotHistory(); renderTimeline(); renderInspector(); renderEffectIntensityPanel(); renderNow();
        toast('Pasted style & color');
      } else if (act === 'autoCrop') runAutoCrop();
      else if (act === 'freeze') freezeFrameAtPlayhead();
      else if (act === 'detach') detachAudioFromSelected();
      else if (act === 'rippleDelete') deleteSelectedClip(true);
      else if (act === 'delete') deleteSelectedClip(false);
    };
  });
  window.addEventListener('click', closeContextMenu);

  // Ruler & playhead scrubbing
  const scrub = e => {
    const rect = $('#timelineWrap').getBoundingClientRect();
    state.playhead = Math.max(0, (e.clientX - rect.left) / state.pxPerSec);
    renderNow(); renderInspector();
  };
  const startScrub = e => {
    togglePlay(false); scrub(e);
    const onMove = ev => scrub(ev);
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };
  $('#timelineRuler').addEventListener('mousedown', startScrub);
  $('.playhead-cap').addEventListener('mousedown', startScrub);
  $('#timelineScroll').addEventListener('scroll', () => { $('#trackHeaderList').scrollTop = $('#timelineScroll').scrollTop; });

  // Uploads & Local Path
  $('#btnUploadTrigger').onclick = () => $('#mediaUploadInput').click();
  $('#mediaUploadInput').onchange = e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; };
  const dz = $('#dropZone');
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files); };
  $('#btnImportPath').onclick = async () => {
    const p = $('#localPathInput').value.trim(); if (!p) return;
    const resp = await fetch('/api/import-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
    const data = await resp.json();
    if (data.item) { if (!state.library.some(m => m.id === data.item.id)) state.library.unshift(data.item); renderMediaLibrary(); addMediaToTimeline(data.item); $('#localPathInput').value = ''; }
    else toast(data.error || 'Import failed');
  };

  // Text, Smart Tools, Save/Load, Modals
  $('#btnAddDefaultText').onclick = () => addTextClip(TEXT_PRESETS[0]);
  $('#btnAutoCrop').onclick = runAutoCrop;
  $('#btnVisionCutout').onclick = runVisionCutout;
  $('#btnAutoBeats').onclick = runAutoBeats;
  $('#btnShortcutsOpen').onclick = () => $('#shortcutsModal').classList.remove('hidden');
  $('#btnShortcutsClose').onclick = () => $('#shortcutsModal').classList.add('hidden');

  $('#btnSaveProj').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ title: $('#projectTitle').value, aspect: state.aspect, canvasWidth: state.canvasWidth, canvasHeight: state.canvasHeight, fps: state.fps, bgMode: state.bgMode, tracks: state.tracks, clips: state.clips, markers: state.markers, captions: state.captions, captionStyle: state.captionStyle }, null, 2)], { type: 'application/json' }));
    a.download = `${$('#projectTitle').value || 'project'}.mcut.json`; a.click(); toast('Saved .mcut.json');
  };
  $('#btnLoadProj').onclick = () => $('#projFileInput').click();
  $('#projFileInput').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; applySnapshot(await f.text()); snapshotHistory(); toast(`Loaded ${f.name}`); e.target.value = ''; };

  $('#btnExportOpen').onclick = () => { $('#expName').value = `${($('#projectTitle').value || 'motioncut').replace(/\s+/g, '_')}_${state.aspect.replace(':', 'x')}`; $('#exportModal').classList.remove('hidden'); };
  $('#btnExportClose').onclick = () => $('#exportModal').classList.add('hidden');
  $('#btnExportCancel').onclick = () => $('#exportModal').classList.add('hidden');
  $('#btnExportStart').onclick = startExport;

  window.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'v' || e.key === 'V') setTool('select');
    else if (e.key === 'b' && !cmd) setTool('razor');
    else if (e.key === 's' || e.key === 'S' || (cmd && e.key.toLowerCase() === 'b')) { e.preventDefault(); splitSelectedClip(); }
    else if (cmd && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (cmd && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) { e.preventDefault(); redo(); }
    else if (cmd && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelectedClip(); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && e.shiftKey) { e.preventDefault(); deleteSelectedClip(true); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSelectedClip(false); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); togglePlay(false); state.playhead = Math.max(0, state.playhead - 1 / state.fps); renderNow(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); togglePlay(false); state.playhead = Math.min(state.getProjectDuration(), state.playhead + 1 / state.fps); renderNow(); }
    else if (e.key === 'm' || e.key === 'M') { state.markers.push(Math.round(state.playhead * 100) / 100); snapshotHistory(); renderTimeline(); }
    else if (e.key === '?') $('#shortcutsModal').classList.toggle('hidden');
  });

  window.addEventListener('resize', () => { fitPreviewCanvas(); drawRuler(); });
}

async function refreshLibrary() {
  const resp = await fetch('/api/library');
  const data = await resp.json();
  state.library = data.items || [];
  renderMediaLibrary();
}

async function boot() {
  setupUI();
  populatePresets();
  setupCanvasInteraction();
  await refreshLibrary();
  const starter = state.library.find(m => m.name.includes('16:9')) || state.library.find(m => m.type === 'video');
  if (starter && state.clips.length === 0) {
    addMediaToTimeline(starter, 0);
    $('#projectTitle').value = 'Scanner_16x9_Edit';
  }
  updateAspectUI();
  renderTimeline();
  renderInspector();
  renderCaptionsList();
  renderNow();
}

boot();
