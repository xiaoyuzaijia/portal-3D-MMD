import * as THREE from "three";
import { HeadTracker } from "./head-tracker";
import { createCalibrationUI, applyCameraTransform } from "./calibration";
import { createScene } from "./scene";
import { MMDManager } from "./mmd";
import { DebugOverlay } from "./debug-overlay";
import type { CalibrationParams } from "./calibration";
import { ACTIVE_PRESET } from "./config";

/* ===================================================================
 *  BOOTSTRAP
 * =================================================================== */

const app = document.getElementById("app")!;
const video = document.getElementById("camera") as HTMLVideoElement;
const loadingEl = document.getElementById("loading")!;
const loadingStatus = document.getElementById("loading-status")!;

function setStatus(msg: string): void {
  loadingStatus.textContent = msg;
}

async function main(): Promise<void> {
  /* ---- debug overlay ---- */
  const debug = new DebugOverlay();
  debug.update("Starting...");

  /* ---- scene, room, box ---- */
  const { scene, calibrationGroup, mainGroup, box, room } = createScene();

  /* ---- camera: FOV=75, near=0.01 ---- */
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );

  /* ---- calibration UI (Tweakpane) ---- */
  const { params } = createCalibrationUI(app);
  const cal: CalibrationParams = params;

  /* ---- renderer ---- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  app.appendChild(renderer.domElement);

  /* ---- head tracker ---- */
  const tracker = new HeadTracker(video);
  try {
    setStatus("Starting head tracker...");
    debug.update("Loading MediaPipe FaceMesh from CDN...");
    await tracker.start();
    video.style.display = "block";
    debug.update("Head tracker running — move your head to see the effect.");
    cal.headTrack = true;
  } catch (err) {
    console.error("Head tracker failed to start:", err);
    const msg = err instanceof Error ? err.message : String(err);
    debug.update(
      `<span style="color:#f44">HEAD TRACKER FAILED:</span><br>${msg}<br><br>Demo mode (no tracking).`,
    );
    setStatus("Camera not available — demo mode (no tracking)");
    cal.headTrack = false;
  }

  /* ---- MMD model + animation (from config) ---- */
  const { model: modelCfg, animation: animCfg } = ACTIVE_PRESET;
  let mmd: MMDManager | null = null;
  let mmdMesh: THREE.SkinnedMesh | null = null;
  try {
    setStatus("Loading Ammo.js physics...");
    await MMDManager.initAmmo();
    setStatus("Loading MMD model...");
    mmd = new MMDManager(mainGroup);
    mmdMesh = await mmd.load(modelCfg.path, animCfg.vmdPaths);
    mmdMesh.scale.setScalar(modelCfg.scale);
    mmdMesh.position.set(...modelCfg.position);
    mmdMesh.rotation.y = modelCfg.rotationY;
    debug.update("MMD model loaded ✓");
  } catch {
    console.warn("MMD model not found (skipped):", modelCfg.path);
  }

  /* ---- loading complete ---- */
  setStatus("Ready");
  setTimeout(() => {
    loadingEl.style.transition = "opacity 0.5s";
    loadingEl.style.opacity = "0";
    setTimeout(() => {
      loadingEl.style.display = "none";
    }, 500);
  }, 500);

  /* ===================================================================
   *  RENDER LOOP
   * =================================================================== */

  let frames = 0;
  let fpsTime = 0;
  let fps = 0;
  const clock = new THREE.Clock();

  function render(): void {
    requestAnimationFrame(render);

    const dt = Math.min(clock.getDelta(), 0.1);
    const aspect = window.innerWidth / window.innerHeight;

    // toggle overlays
    video.style.display = cal.showFacePreview ? "block" : "none";
    const faceOverlay = document.getElementById("face-mesh-overlay");
    if (faceOverlay) faceOverlay.style.display = cal.showFacePreview ? "block" : "none";
    debug.el.style.display = cal.showFps ? "block" : "none";

    // FPS counter (update every 0.5 s)
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fps = Math.round(frames / fpsTime);
      frames = 0;
      fpsTime = 0;

      if (cal.headTrack && tracker.ready) {
        debug.update(
          `FPS: ${fps}` +
            ` | pupil: (${tracker.centralPupilX.toFixed(3)}, ${tracker.centralPupilY.toFixed(3)})` +
            ` | IPD: ${tracker.ipd.toFixed(4)} (pix: ${tracker.ipdPixels.toFixed(0)})` +
            ` | cam: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`,
        );
      } else if (!cal.headTrack) {
        debug.update(
          `FPS: ${fps} | <span style="color:#f44">HEAD TRACKING OFF</span>`,
        );
      } else {
        debug.update(
          `FPS: ${fps} | <span style="color:#fa0">Waiting for tracking...</span>`,
        );
      }
    }

    // toggle backgrounds: room (non-calibration) vs wireframe box (calibration)
    room.visible = !cal.calibrationScene;
    box.visible = cal.calibrationScene;
    calibrationGroup.visible = cal.calibrationScene;
    if (mmdMesh) mmdMesh.visible = !cal.calibrationScene;

    // frustum bounds from aspect ratio (old project pattern)
    let left = -1;
    let right = 1;
    let top = 1;
    let down = -1;

    if (aspect > 1) {
      left = -aspect;
      right = aspect;
    } else {
      down = -1 / aspect;
      top = 1 / aspect;
    }

    // scale both backgrounds to fill frustum
    const sx = right - left;
    const sy = top - down;
    box.scale.set(sx, sy, 8);
    room.scale.set(sx, sy, 8);

    // MMD animation
    if (mmd) mmd.update(dt);

    // head tracking → camera
    if (cal.headTrack && tracker.ready) {
      applyCameraTransform(
        camera,
        tracker.centralPupilX,
        tracker.centralPupilY,
        tracker.ipdPixels,
        left,
        right,
        top,
        down,
        cal,
      );
    } else {
      camera.position.set(0, 0, 8);
      camera.updateMatrix();

      const near = 0.01;
      camera.projectionMatrix.makePerspective(
        (left * near) / 8,
        (right * near) / 8,
        (-down * near) / 8,
        (-top * near) / 8,
        near,
        100,
      );
    }

    renderer.render(scene, camera);
  }

  /* ---- resize ---- */
  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---- kick off ---- */
  render();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  loadingEl.innerHTML = `<p>Startup error:</p><pre>${err}</pre>`;
});
