# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Start Vite dev server (http://localhost:5173)
npm run build       # Type-check (tsc --noEmit) then bundle (vite build) → dist/
npm run preview     # Preview production build locally
npx tsc --noEmit    # Type-check only (no output)
```

There are no tests yet. When adding them, use Vitest (add as devDependency).

## Project purpose

Glasses-free 3D display demo. A head-tracked Three.js scene that uses off-axis projection to create motion parallax — when you move your head, the 3D perspective shifts as if the screen were a window into a real 3D space. Supports MMD (MikuMikuDance) model rendering with VMD animation.

Two older projects live under `old/` for reference:
- `old/head-tracked-3d/` — original prototype (TF.js + Three.js 0.130, Tweakpane calibration, MMD, Webpack)
- `old/3d-web/` — full-stack rewrite (React Router 7 + Vite + MediaPipe CDN, no calibration/MMD)

## Architecture

```
index.html → src/main.ts (bootstrap + render loop)
                ├── head-tracker.ts   (MediaPipe FaceMesh, no TF.js)
                ├── calibration.ts    (Tweakpane UI + off-axis projection matrix)
                ├── scene.ts          (Three.js scene: lights, ground, decorations, calibration cube)
                ├── mmd.ts            (MMDLoader + MMDAnimationHelper, optional)
                └── debug-overlay.ts  (on-screen FPS/tracking/error display)
```

### Head tracking pipeline

`HeadTracker` loads `@mediapipe/face_mesh@0.4` from jsdelivr CDN (a single script tag — no TF.js, no npm package). The tracking loop is driven by `requestAnimationFrame` calling `faceMesh.send({ image: videoElement })`, NOT by the `@mediapipe/camera_utils` Camera class (its API is fragile across versions).

Key design decisions in head-tracker.ts:
- `Module.locateFile` MUST be set on `window` BEFORE loading the CDN script. MediaPipe's packed_assets_loader registers a preRun callback that reads `Module.locateFile()` to resolve the `.data` WASM file URL. If undefined, it throws `addRunDependency(undefined)`.
- `scheduleNextFrame()` is called from `onResults()` — one frame at a time, chained. This avoids concurrent `send()` calls that cause Emscripten WASM double-initialisation.
- Iris landmarks: index 468 (left), 473 (right) — only available when `refineLandmarks: true`.
- Pupil coordinates mapped from [0,1] to [-1,1] via `irisMid * 2 - 1`. No negation — negation happens at camera position assignment in calibration.ts.
- Smoothing: pupil 50/50 (responsive), IPD 90/10 (heavily damped).

### Off-axis projection (the core 3D trick)

`calibration.ts:applyCameraTransform()` does two things:
1. Moves `camera.position` based on tracked pupil + calibration params. NEGATES both X and Y (`camera.position.set(-offsetX, -offsetY, dist)`) — this is the "window parallax" inverse: when you move your head right, the camera moves left so objects appear to shift correctly relative to the screen.
2. Replaces `camera.projectionMatrix` with an asymmetric frustum via `makePerspective()`. The frustum bounds are shifted by `offsetX/offsetY` and scaled by `near/dist`. This keeps the screen plane (z=0) visually fixed while the view shifts.

Distance formula: `dist = (0.5 / ipd) * scaleZ + depthBase`. Larger IPD (closer to camera) → smaller dist → scene feels closer.

### Calibration UI

Tweakpane 4 overlay (top-left). Parameters:
- `headTrack` toggle, `calibrationScene` toggle (shows checkerboard + axes)
- `offsetX/Y` (-1..1), `scaleX/Y` (0..5), `scaleZ` (0..5), `depthBase` (-3..3)

Tweakpane 4's published `.d.ts` types are incomplete: `addFolder()` and `addBinding()` exist at runtime but are missing from the type declarations. Cast `pane` through `any` when calling these methods.

### MMD support

`MMDManager` uses `MMDLoader` and `MMDAnimationHelper` from Three.js examples. **Three.js 0.170 is pinned intentionally** — it is the last version that bundles MMD examples (deprecated in r172, removed after). Do not upgrade Three.js without verifying MMD module availability.

MMD model files go in `public/mmd/` (not tracked). The loader expects the same directory structure as `old/head-tracked-3d/docs/mmd/`. Loading fails gracefully (404s are caught, logged, and skipped).

MMD physics is disabled (`physics: false` in helper.add()) — models are purely kinematic.

### Debug overlay

`DebugOverlay` (bottom-left corner, green monospace) shows FPS, pupil coordinates, IPD, and camera position in real time. Also captures `window.error` and `unhandledrejection` events. This exists so the user doesn't need to open DevTools to see tracking state.

## CSSCaveats

- The `<video>` element (`#camera`) is mirrored via `transform: scaleX(-1)` so it acts as a natural mirror preview. The tracking data itself is NOT mirrored — the negation in `applyCameraTransform` handles the spatial inversion.
- The face-mesh overlay canvas (`#face-mesh-overlay`) is created programmatically by HeadTracker, also mirrored.
- Tweakpane's root element is positioned `fixed` at top-left with `z-index: 100`.

## Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `three` | ^0.170.0 | Last version with MMD examples |
| `@types/three` | ^0.170.0 | TypeScript types for Three.js |
| `tweakpane` | ^4.0.5 | Calibration UI (types incomplete, see above) |
| `vite` | ^6.3.0 | Dev server + bundler |
| `typescript` | ^5.8.0 | Type checking (strict mode) |

No runtime dependencies beyond `three` and `tweakpane`. MediaPipe FaceMesh loads from CDN at runtime — no npm package needed.
