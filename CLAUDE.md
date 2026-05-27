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

Glasses-free 3D display demo. A head-tracked Three.js scene that uses off-axis projection to create motion parallax — when you move your head, the 3D perspective shifts as if the screen were a window into a real 3D space. Renders an MMD model (Luo Tianyi) with VMD dance animation inside a cream-coloured room.

Two older projects live under `old/` for reference:
- `old/head-tracked-3d/` — original prototype (TF.js + Three.js 0.130, Tweakpane calibration, MMD, Webpack)
- `old/3d-web/` — full-stack rewrite (React Router 7 + Vite + MediaPipe CDN, no calibration/MMD)

## Architecture

```
index.html → src/main.ts (bootstrap + render loop)
                ├── head-tracker.ts     (MediaPipe FaceMesh CDN, rAF-driven)
                ├── calibration.ts      (Tweakpane 4 UI + off-axis projection + localStorage)
                ├── scene.ts            (cream room + wireframe box + lighting)
                ├── mmd.ts              (MMDLoader + MMDAnimationHelper)
                ├── config.ts           (typed wrappers around config/scene_config.json)
                ├── debug-overlay.ts    (on-screen FPS/tracking/error display)
                └── types.d.ts          (MediaPipe global type declarations)

config/
  scene_config.json   ← user-editable JSON: MMD model/animation + calibration defaults
```

The render loop in main.ts:
1. Toggles overlays (face preview, FPS) from calibration params.
2. Switches between cream-room (non-calibration) and wireframe-box (calibration) backgrounds, and hides the MMD model during calibration.
3. Computes frustum bounds from aspect ratio, scales both backgrounds to fill.
4. Runs MMD animation update.
5. Applies head-tracked off-axis camera projection.
6. Renders.

## Config system

`config/scene_config.json` is the single source for MMD model/animation and calibration defaults. `src/config.ts` imports it via Vite's JSON module transform and re-exports typed constants (`ACTIVE_PRESET`, `CALIBRATION_DEFAULTS`).

To switch models or animations, edit the JSON file — no code changes needed.

```
config/scene_config.json
  mmd.model        — path, scale, position[3], rotationY
  mmd.animation    — vmdPaths[] (empty array = static pose)
  calibration      — offsetX/Y, scaleX/Y/Z, showFacePreview, showFps
```

`tsconfig.json` includes both `"src"` and `"config"` so the JSON import type-checks.

## Head tracking pipeline

`HeadTracker` loads `@mediapipe/face_mesh@0.4` from jsdelivr CDN. The tracking loop is rAF-driven (`scheduleNextFrame()` → `faceMesh.send()` → `onResults()` → `scheduleNextFrame()`), NOT using the `@mediapipe/camera_utils` Camera class.

Key design decisions in head-tracker.ts:
- `Module.locateFile` MUST be set on `window` BEFORE loading the CDN script, or MediaPipe throws `addRunDependency(undefined)`.
- `scheduleNextFrame()` chains through `onResults()` — one frame at a time, avoiding concurrent `send()` calls that cause WASM double-initialisation.
- Iris landmarks: index 468 (left), 473 (right) — only available when `refineLandmarks: true`.
- Pupil coordinates mapped from [0,1] to [-1,1] via `irisMid * 2 - 1`. No negation here — negation happens in `applyCameraTransform`.
- `ipdPixels` getter converts normalized IPD to approximate pixel space (`ipd * videoWidth`) for compatibility with the old calibration formula.
- Smoothing: pupil 50/50 (responsive), IPD 90/10 (heavily damped).
- Draws a face-mesh wireframe on an overlay canvas so users can verify tracking.

## Off-axis projection

`calibration.ts:applyCameraTransform()`:
1. Sets `camera.position` with NEGATED X and Y (`position.z = dist`, `position.x = -offsetX`, `position.y = -offsetY`). This is the "window parallax" inverse.
2. Replaces `camera.projectionMatrix` with an asymmetric frustum via `makePerspective()`, shifted by `offsetX/offsetY` and scaled by `near/dist`.

Distance formula matches old project: `dist = (100 / ipdPixels) * scaleZ`.
FOV = 75, near = 0.01, far = 100.

## Calibration UI

Tweakpane 4 overlay at top-left. Parameters in two folders:

- **General**: `headTrack`, `calibrationScene` (toggles wireframe box + hides model), `showFacePreview` (top-right camera overlay), `showFps` (bottom-left debug panel).
- **Position**: `offsetX/Y` (-1..1), `scaleX/Y` (0.1..5), `scaleZ` (10..30, default 15).

Tweakpane 4's published `.d.ts` types are incomplete: `addFolder()`, `addBinding()`, and `on()` exist at runtime but are missing from the type declarations. Cast through `any` when calling these methods.

### Auto-hide / pin

The panel auto-collapses (fades out) 3 seconds after page load. A small `☰` tab remains visible at top-left:

- **Mouse over `☰` or panel** → panel fades in. Mouse leaves → 600ms delay then fades out.
- **Click `☰`** → toggles pin. When pinned (white `☰`), the panel stays visible. Click again to unpin.

### localStorage persistence

Calibration params (`offsetX/Y`, `scaleX/Y/Z`, `showFacePreview`, `showFps`) persist to `localStorage` under key `ht3d_calibration`. Saved on every change (500ms debounce via `pane.on("change")`).

On load, param priority is: `localStorage > JSON config defaults > hardcoded fallbacks`. Transient UI state (`headTrack`, `calibrationScene`) is NOT persisted.

## Scene backgrounds (scene.ts)

Two interchangeable backgrounds, both in `mainGroup` and scaled to frustum each frame:

- **Cream room** (non-calibration): 5 `PlaneGeometry` faces (floor, 4 walls, ceiling) with `MeshStandardMaterial` in off-white `0xfaf8f5` / floor `0xf0ece4`, all `DoubleSide`. Receives shadows.
- **Wireframe box** (calibration): 5 `GridHelper` planes forming a 1×1×1 wireframe space.

Both are built in a 1×1 unit box-local coordinate system (floor at y=-0.5, back at z=-1, etc.) and scaled to `(sx, sy, 8)` each frame where sx/sy come from frustum bounds.

## Lighting (scene.ts)

- `HemisphereLight(sky 0xffeedd, ground 0x8d7c6b, 0.6)` — natural ambient.
- `DirectionalLight(0xfff5eb, 0.6)` — main shadow-casting sun, 2048 shadow map, `PCFSoftShadowMap`.
- Several `PointLight`s for room atmosphere — note: MMD custom shaders **ignore point lights** (only respond to DirectionalLight + AmbientLight).

Renderer uses `logarithmicDepthBuffer: true` to fix MMD clothing z-fighting.
Renderer uses `ACESFilmicToneMapping` with exposure 1.0.

## MMD support

`MMDManager` wraps `MMDLoader` and `MMDAnimationHelper`. **Three.js 0.170 is pinned** — last version with MMD examples (deprecated r172, removed after). Do not upgrade.

Two loading methods:
- `loadModel(path)` — static pose via `MMDLoader.load()` (not `loadPMX` — returns raw data, not a SkinnedMesh).
- `load(path, vmdPaths)` — with animation via `loadWithAnimation()`. Physics disabled.

MMD files under `public/mmd/` (gitignored):
```
public/mmd/
  model/   — PMX models (miku-yyb, 牛肉式 洛天依AI Ver1.01, etc.)
  vmd/     — VMD animations
```

Files are referenced relative to site root (no `public/` prefix in URLs). Model scale, position, and rotation are applied in main.ts from `ACTIVE_PRESET`.

### Ammo.js physics

`MMDManager.initAmmo()` dynamically imports `three/examples/jsm/libs/ammo.wasm.js` and stashes the result on `window.Ammo`. Must be called once before loading any model. The WASM file is served from `/libs/` via Vite's public directory.

## Debug overlay

`DebugOverlay` (bottom-left, green monospace) shows FPS, pupil coords, IPD (normalized + pixel), and camera position. Also captures `window.error` and `unhandledrejection`. Toggle with `showFps` in calibration UI. `el` is public (`readonly`) for external visibility control.

## CSS caveats

- `<video>` element (`#camera`) mirrored via `transform: scaleX(-1)` for mirror preview. Tracking data is NOT mirrored — negation in `applyCameraTransform` handles spatial inversion.
- `#face-mesh-overlay` canvas created programmatically by HeadTracker, also mirrored.
- Tweakpane pane positioned `fixed` top-left, z-index 100. The `☰` handle is z-index 101.

## Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `three` | ^0.170.0 | Last version with MMD examples |
| `@types/three` | ^0.170.0 | TypeScript types for Three.js |
| `tweakpane` | ^4.0.5 | Calibration UI (types incomplete) |
| `vite` | ^6.3.0 | Dev server + bundler |
| `typescript` | ^5.8.0 | Type checking (strict mode) |
| `@types/node` | ^25.9.1 | Node types for Vite config |

No runtime deps beyond `three` and `tweakpane`. MediaPipe FaceMesh loads from CDN at runtime.
