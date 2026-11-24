# MotionCut Pro (Motion Editor)

A local, zero-dependency, browser-based multi-track video editor inspired by CapCut Desktop Pro, powered by HTML5 Canvas, WebAudio, and local FFmpeg for deterministic frame-accurate H.264/AAC MP4 exports.

## Features

- **Multi-Track Timeline**: Video, Overlay/PiP, Text/Caption/Sticker, and Audio tracks with magnetic snap, filmstrip thumbnails, audio waveforms, onset beat markers, select (`V`) & razor blade (`B`) tools, split (`Cmd+B`), ripple delete, copy/paste clip styles, and right-click context menus.
- **Interactive Preview Canvas**: Real-time 60fps compositor with direct drag-to-move (with center snap guides), 4-corner scale handles, top rotation handle, double-click inline text editing, safe-zone overlays, and aspect ratio switching (`16:9`, `9:16`, `1:1`, `4:5`, `21:9`).
- **Visual FX & Compositing**: Stackable effects with intensity sliders, blend modes, canvas masks (`Split`, `Circle`, `Rectangle`, `Mirror` + invert), per-pixel Chroma Key, LUT/color filters + full color grading, and transition presets.
- **Text, Captions & Stickers**: Styled title presets, word-popping captions (Hormozi / Minimal / CapCut Pill) with `.SRT` import/export, and animated vector graphic stickers (`REC`, Viewfinder, Progress Bar, Lower Third, Arrow, Matte).
- **Speed, Keyframes & Audio**: Speed ramping curves (`Montage`, `Hero`, `Bullet`, `Flash In`, `Ease S`), keyframe animation & keyframe stepper, WebAudio 3-band EQ, Voice FX, fade in/out, and live Stereo VU meters.
- **Local AI & Smart Tools**: FFmpeg auto black-bar crop detection, beat detection, freeze frame, audio detach, and macOS Vision cutout support.
- **Deterministic MP4 Export**: Frame-accurate Canvas + FFmpeg H.264/AAC multi-track audio mixdown export plus fast direct FFmpeg quick-export.

## Quick Start

Requires **Node.js 20+** and **FFmpeg/FFprobe** on `PATH`.

```bash
./start.sh
# or
node server.mjs
```

Open `http://127.0.0.1:4321` in your browser.
