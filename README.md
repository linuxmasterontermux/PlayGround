# PlayGround

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

## KINETIC — Motion Lab

A real-time 3D motion-capture studio that runs entirely in the browser. MediaPipe Tasks
Vision tracks the full body, face, hands, feet, eyes and mouth, and a neon Three.js rig
mirrors the result live.

### Features

- **Full-body pose** — 33 landmarks, including feet and toe points.
- **Face mesh** — 478 landmarks with iris tracking plus 52 blendshapes for blink, jaw and smile.
- **Hands** — up to two 21-point hand skeletons.
- **Gaze, blink, jaw, smile and motion-energy readouts** in the HUD.
- **Synthetic demo loop** so the scene works without a camera.
- **Local by design** — video never leaves the device; models and WASM are served from `public/`.

### Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static output in dist/
npm run preview  # serve the production build
```

### Controls

| Input | Action |
| --- | --- |
| `C` | Start / stop the camera |
| `D` | Return to the demo loop |
| `R` | Reset the camera view |
| `S` | Save a frame as PNG |
| `F` | Toggle fullscreen |
| `1`–`6` | Toggle scene layers |
| Drag / scroll | Orbit / zoom the rig |

Camera access requires a secure context (`localhost` or HTTPS). On mobile, use the dock at
the bottom of the screen; the tracking matrix collapses into a compact chip row.
