# PlayGround

## SpiderMotion

A real-time, on-device 3D motion-capture playground. Your webcam drives a fully rigged, stylized Peter Parker built with Three.js primitives: full-body pose, head movement, and facial expressions are mapped onto the character as you move. Camera frames stay in the browser; nothing is recorded or uploaded.

### Features

- **Full-body 3D pose** — MediaPipe Pose Landmarker (lite) with quaternion retargeting and smoothing.
- **Face tracking** — 478 landmarks for head yaw/pitch/roll plus blendshapes for blink, jaw, smile, brow, and anger.
- **Mask / unmask** — switch between the classic Spider-Man mask and Peter Parker's expressive face.
- **Adaptive performance** — automatic ECO/BALANCED/HIGH render quality, capped pixel ratio, and face inference throttling based on measured latency.
- **Demo mode** — a synthetic feed and idle animation keep the scene usable when a camera is unavailable.
- **Responsive UI** — camera monitor, skeleton overlay, mirror toggle, and touch-friendly controls on desktop, tablet, portrait mobile, and landscape mobile.

### Run

```bash
PORT=3000 ./start.sh
```

Then open <http://localhost:3000>. Camera access requires `https` or `localhost`. All models, WASM, and Three.js are vendored locally under `vendor/`.

### Controls

| Control | Action |
| --- | --- |
| Start | Request the camera and begin tracking |
| Watch demo | Run the synthetic demo feed |
| Mask | Toggle mask / Peter Parker's face |
| Face | Toggle face tracking |
| Overlay | Toggle skeleton and face landmarks |
| Mirror | Mirror the camera feed and skeleton |
| Reset | Recenture the 3D camera |

Keyboard shortcuts: `M` mask, `F` face, `O` overlay, `R` reset view.

### Structure

- `index.html` — shell, start overlay, HUD, and control dock.
- `styles.css` — visual system and responsive layouts.
- `src/main.js` — app state, camera startup, vision callbacks, adaptive quality.
- `src/tracking.js` — MediaPipe model setup and inference loop.
- `src/character.js` — procedural rig, suit/face materials, pose and face retargeting, idle animation.
- `src/scene.js` — Three.js renderer, environment, lighting, and camera framing.
- `src/preview.js` — camera monitor overlay and synthetic demo feed.
- `src/textures.js` — generated suit web, mask, emblem, and scene textures.

Fan-made tech demo. Spider-Man © Marvel.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/linuxmasterontermux/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/linuxmasterontermux/PlayGround)

- 🎮 [Open the project](https://omgithub.com/linuxmasterontermux/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=linuxmasterontermux%2FPlayGround).
- 💻 [Explore the source](https://github.com/linuxmasterontermux/PlayGround).
- 🛠️ [Check build runs](https://github.com/linuxmasterontermux/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/linuxmasterontermux/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/linuxmasterontermux).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
