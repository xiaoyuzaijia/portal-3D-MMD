import { Pane } from "tweakpane";
import * as THREE from "three";

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

const DEFAULTS: CalibrationParams = {
  headTrack: true,
  calibrationScene: false,
  showFacePreview: true,
  showFps: true,
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 15,
};

/**
 * Tweakpane UI.
 */
export function createCalibrationUI(container: HTMLElement): {
  params: CalibrationParams;
  pane: Pane;
} {
  const params = { ...DEFAULTS };

  const pane = new Pane({ title: "Head-Tracked 3D — Calibration" });
  pane.element.style.position = "fixed";
  pane.element.style.left = "0";
  pane.element.style.top = "0";
  pane.element.style.zIndex = "100";
  container.appendChild(pane.element);

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
