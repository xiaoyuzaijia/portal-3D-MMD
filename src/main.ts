import * as THREE from "three";
import { HeadTracker } from "./head-tracker";
import { createCalibrationUI, applyCameraTransform } from "./calibration";
import { createScene, animateScene } from "./scene";
import { MMDManager } from "./mmd";
import { DebugOverlay } from "./debug-overlay";
import type { CalibrationParams } from "./calibration";

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
  /* ---- Three.js renderer ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  app.appendChild(renderer.domElement);

  /* ---- scene & camera ---- */
  const { scene, calibrationGroup, mainGroup } = createScene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 0, 4);

  /* ---- calibration UI (Tweakpane) ---- */
  const { params } = createCalibrationUI(app);
  // keep a typed ref for the render loop
  const cal: CalibrationParams = params;

  /* ---- head tracker ---- */
  const tracker = new HeadTracker(video);
  try {
    setStatus("Starting head tracker...");
    debug.update("Loading MediaPipe FaceMesh from CDN...");
    await tracker.start();
    video.style.display = "block";
    debug.update("Head tracker running ✓<br>Move your head to see the effect.");
    cal.headTrack = true;
  } catch (err) {
    console.error("Head tracker failed to start:", err);
    const msg = err instanceof Error ? err.message : String(err);
    debug.update(
      `<span style="color:#f44">HEAD TRACKER FAILED:</span><br>${msg}<br><br>Falling back to demo mode.`
    );
    setStatus("Camera not available — demo mode (no tracking)");
    cal.headTrack = false;
  }

  /* ---- MMD models (optional — loads if files exist) ---- */
  let mmd: MMDManager | null = null;
  const mmdLoadPromises: Promise<void>[] = [];

  try {
    mmd = new MMDManager(mainGroup);

    // Create platforms like the old project
    function createPlatform(x: number): void {
      const geo = new THREE.BoxGeometry();
      const mat = new THREE.MeshStandardMaterial({
        opacity: 0.4,
        transparent: true,
        color: 0x8888ff,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(0.4, 0.01, 8);
      mesh.position.set(x, -0.25, 2);
      mesh.receiveShadow = true;
      mainGroup.add(mesh);
    }

    async function tryLoadMiku(
      modelPath: string,
      x: number,
    ): Promise<THREE.SkinnedMesh | null> {
      try {
        setStatus(`Loading MMD model: ${modelPath}`);
        const mesh = await mmd!.load(modelPath, [
          "./mmd/vmds/wavefile_v2.vmd",
        ]);
        mesh.position.set(x, -0.25, 2);
        mesh.rotation.y = 0;
        createPlatform(x);
        return mesh;
      } catch {
        console.warn(`MMD model not found (skipped): ${modelPath}`);
        return null;
      }
    }

    mmdLoadPromises.push(
      tryLoadMiku("./mmd/miku-yyb/miku.pmx", -0.5).then(() => {}),
      tryLoadMiku("./mmd/牛肉式 洛天依AI Ver1.01/牛肉式 洛天依AI Ver1.01.pmx", 0.5).then(() => {}),
    );
  } catch {
    console.warn("MMD modules unavailable — skipping MMD support");
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

  const clock = new THREE.Clock();

  // FPS tracking
  let frames = 0;
  let fpsTime = 0;
  let fps = 0;

  function render(): void {
    requestAnimationFrame(render);

    const dt = Math.min(clock.getDelta(), 0.1); // cap to avoid spiral
    const aspect = window.innerWidth / window.innerHeight;

    // FPS counter
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fps = Math.round(frames / fpsTime);
      frames = 0;
      fpsTime = 0;

      // Update debug overlay with tracking info
      if (cal.headTrack && tracker.ready) {
        debug.update(
          `FPS: ${fps}` +
            ` | pupil: (${tracker.centralPupilX.toFixed(3)}, ${tracker.centralPupilY.toFixed(3)})` +
            ` | IPD: ${tracker.ipd.toFixed(4)}` +
            ` | cam: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`,
        );
      } else if (!cal.headTrack) {
        debug.update(
          `FPS: ${fps} | <span style="color:#f44">HEAD TRACKING OFF</span> (check Tweakpane toggle)`,
        );
      } else {
        debug.update(
          `FPS: ${fps} | <span style="color:#fa0">Waiting for tracking...</span>`,
        );
      }
    }

    // toggle groups
    calibrationGroup.visible = cal.calibrationScene;
    mainGroup.visible = !cal.calibrationScene;

    // head tracking → camera
    if (cal.headTrack && tracker.ready) {
      applyCameraTransform(
        camera,
        tracker.centralPupilX,
        tracker.centralPupilY,
        tracker.ipd,
        cal,
        aspect,
      );
    } else {
      // fallback: static camera at a comfortable distance
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      camera.projectionMatrix.makePerspective(
        -(aspect * 0.6),
        aspect * 0.6,
        0.6,
        -0.6,
        0.1,
        100,
      );
    }

    // MMD animation
    if (mmd) mmd.update(dt);

    // floating-object animation
    animateScene(mainGroup, clock.elapsedTime);

    // stars slow rotation
    const stars = mainGroup.children.find(
      (c: THREE.Object3D) => c instanceof THREE.Points,
    ) as THREE.Points | undefined;
    if (stars) stars.rotation.y += dt * 0.02;

    renderer.render(scene, camera);
  }

  /* ---- resize ---- */
  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  /* ---- kick off ---- */
  render();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  loadingEl.innerHTML = `<p>Startup error:</p><pre>${err}</pre>`;
});
