import { Pane } from "tweakpane";
import * as THREE from "three";
import { CALIBRATION_DEFAULTS } from "./config";

/**
 * Calibration parameters — based on old/head-tracked-3d.
 */
export interface CalibrationParams {
  headTrack: boolean;
  calibrationScene: boolean;
  showFacePreview: boolean;
  showFps: boolean;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

/**
 * Tweakpane UI.
 */
export function createCalibrationUI(container: HTMLElement): {
  params: CalibrationParams;
  pane: Pane;
} {
  const params: CalibrationParams = {
    headTrack: true,
    calibrationScene: false,
    ...CALIBRATION_DEFAULTS,
    ...loadFromStorage(),  // localStorage overrides JSON defaults
  };

  const pane = new Pane({ title: "Head-Tracked 3D — Calibration" });
  pane.element.style.position = "fixed";
  pane.element.style.left = "0";
  pane.element.style.top = "0";
  pane.element.style.zIndex = "100";
  pane.element.style.transition = "opacity 0.25s, transform 0.25s";
  pane.element.style.transformOrigin = "top left";
  container.appendChild(pane.element);

  /* ---- auto-hide: show on hover, hide on leave ---- */
  const handle = document.createElement("div");
  handle.textContent = "☰";
  handle.style.cssText =
    "position:fixed;left:0;top:0;z-index:101;" +
    "width:28px;height:22px;line-height:22px;text-align:center;" +
    "font-size:13px;color:#888;background:rgba(0,0,0,0.4);" +
    "border-radius:0 0 6px 0;cursor:pointer;user-select:none;";
  container.appendChild(handle);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let pinned = false;

  function show(): void {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    pane.element.style.opacity = "1";
    pane.element.style.transform = "scale(1)";
    pane.element.style.pointerEvents = "auto";
  }

  function hide(): void {
    if (pinned) return;
    hideTimer = setTimeout(() => {
      pane.element.style.opacity = "0";
      pane.element.style.transform = "scale(0.95)";
      pane.element.style.pointerEvents = "none";
    }, 600);
  }

  handle.addEventListener("mouseenter", show);
  pane.element.addEventListener("mouseenter", show);
  handle.addEventListener("mouseleave", () => hide());
  pane.element.addEventListener("mouseleave", () => hide());

  handle.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned = !pinned;
    handle.style.color = pinned ? "#fff" : "#888";
    if (!pinned) hide();
  });

  // auto-collapse after 3 seconds on first load
  setTimeout(() => hide(), 3000);

  // Tweakpane 4 types are incomplete — addFolder/addBinding exist at runtime
  const p = pane as any;

  const fGeneral = p.addFolder({ title: "General" });
  fGeneral.addBinding(params, "headTrack", { label: "Head track" });
  fGeneral.addBinding(params, "calibrationScene", { label: "Calibration scene" });
  fGeneral.addBinding(params, "showFacePreview", { label: "Face preview" });
  fGeneral.addBinding(params, "showFps", { label: "FPS overlay" });

  const fPos = p.addFolder({ title: "Position" });
  fPos.addBinding(params, "offsetX", { min: -1, max: 1, step: 0.01, label: "Offset X" });
  fPos.addBinding(params, "offsetY", { min: -1, max: 1, step: 0.01, label: "Offset Y" });
  fPos.addBinding(params, "scaleX", { min: 0.1, max: 5, step: 0.1, label: "Scale X" });
  fPos.addBinding(params, "scaleY", { min: 0.1, max: 5, step: 0.1, label: "Scale Y" });
  fPos.addBinding(params, "scaleZ", { min: 10, max: 30, step: 0.1, label: "Scale Z" });

  /* ---- persist calibration changes to localStorage ---- */
  const SYNC_KEYS = new Set([
    "offsetX", "offsetY", "scaleX", "scaleY", "scaleZ",
    "showFacePreview", "showFps",
  ]);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  (pane as any).on("change", () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveToStorage(params, SYNC_KEYS), 500);
  });

  return { params, pane };
}

/**
 * Applies head-tracked camera position and off-axis projection.
 *
 * Exact match of old/head-tracked-3d/src/index.ts camera math:
 *   offsetX = (pupilX + cal.offsetX) * cal.scaleX
 *   offsetY = (pupilY + cal.offsetY) * cal.scaleY
 *   dist     = (100 / ipdPixels) * cal.scaleZ
 *
 * Camera: z comes first, then x=-offsetX, y=-offsetY (negated for
 * "window parallax" inversion).
 * Projection: asymmetric frustum scaled by near/dist.
 */
export function applyCameraTransform(
  camera: THREE.PerspectiveCamera,
  pupilX: number,
  pupilY: number,
  ipdPixels: number,
  left: number,
  right: number,
  top: number,
  down: number,
  p: CalibrationParams,
): void {
  const offsetX = (pupilX + p.offsetX) * p.scaleX;
  const offsetY = (pupilY + p.offsetY) * p.scaleY;
  const dist = (100 / ipdPixels) * p.scaleZ;

  camera.position.z = dist;
  camera.position.x = -offsetX;
  camera.position.y = -offsetY;

  const near = 0.01;
  const scale = near / dist;

  camera.projectionMatrix.makePerspective(
    (left + offsetX) * scale,
    (right + offsetX) * scale,
    (-down + offsetY) * scale,
    (-top + offsetY) * scale,
    near,
    100,
  );
}

/* ===================================================================
 *  localStorage persistence
 * =================================================================== */

const LS_KEY = "ht3d_calibration";

function loadFromStorage(): Partial<CalibrationParams> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // partial validation: at least the critical keys present
    if (typeof saved.scaleZ !== "number") return null;
    return saved as Partial<CalibrationParams>;
  } catch {
    return null;
  }
}

function saveToStorage(params: CalibrationParams, keys: Set<string>): void {
  const partial: Record<string, unknown> = {};
  for (const k of keys) {
    partial[k] = (params as any)[k];
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(partial));
  } catch {
    // storage full or unavailable — ignore
  }
}
