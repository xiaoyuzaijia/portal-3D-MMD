import { Pane } from "tweakpane";
import * as THREE from "three";

/**
 * User-tweakable calibration parameters.
 * Wired to a Tweakpane overlay so the user can dial in the
 * glasses-free 3-D effect for their screen size and viewing distance.
 */
export interface CalibrationParams {
  headTrack: boolean;
  calibrationScene: boolean;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  depthBase: number;
}

const DEFAULTS: CalibrationParams = {
  headTrack: true,
  calibrationScene: false,
  offsetX: 0,
  offsetY: 0,
  scaleX: 1.5,
  scaleY: 1.5,
  scaleZ: 1,
  depthBase: 0,
};

/**
 * Builds the Tweakpane UI and returns the live params object + the pane instance.
 */
export function createCalibrationUI(container: HTMLElement): {
  params: CalibrationParams;
  pane: Pane;
} {
  const params = { ...DEFAULTS };

  const pane = new Pane({ title: "Head-Tracked 3D — Calibration" });
  pane.element.style.position = "fixed";
  pane.element.style.left = "8px";
  pane.element.style.top = "8px";
  pane.element.style.zIndex = "100";
  container.appendChild(pane.element);

  // Tweakpane 4 type definitions are incomplete — addFolder/addBinding exist
  // at runtime. We cast through any for the blade-creation calls.

  // -- toggles --
  const fGeneral = (pane as any).addFolder({ title: "General" });
  fGeneral.addBinding(params, "headTrack", { label: "Head tracking" });
  fGeneral.addBinding(params, "calibrationScene", { label: "Calibration scene" });

  // -- position tuning --
  const fPos = (pane as any).addFolder({ title: "Position" });
  fPos.addBinding(params, "offsetX", {
    min: -1, max: 1, step: 0.01, label: "Offset X",
  });
  fPos.addBinding(params, "offsetY", {
    min: -1, max: 1, step: 0.01, label: "Offset Y",
  });
  fPos.addBinding(params, "scaleX", {
    min: 0, max: 5, step: 0.1, label: "Scale X",
  });
  fPos.addBinding(params, "scaleY", {
    min: 0, max: 5, step: 0.1, label: "Scale Y",
  });

  // -- depth tuning --
  const fDepth = (pane as any).addFolder({ title: "Depth" });
  fDepth.addBinding(params, "scaleZ", {
    min: 0, max: 5, step: 0.1, label: "Scale Z",
  });
  fDepth.addBinding(params, "depthBase", {
    min: -3, max: 3, step: 0.1, label: "Depth base",
  });

  return { params, pane };
}

/**
 * Applies the head-tracked camera position and off-axis projection.
 *
 * Matches the original project's approach: distance controls both camera
 * position and the effective field-of-view via frustum scaling.
 *
 *   dist = (depthBase / ipd) * scaleZ   →  larger scaleZ = farther = narrower FOV
 *   frustum bounds are in world-space, then scaled by near/dist
 */
export function applyCameraTransform(
  camera: THREE.PerspectiveCamera,
  pupilX: number,
  pupilY: number,
  ipd: number,
  p: CalibrationParams,
  aspect: number,
): void {
  const offsetX = (pupilX + p.offsetX) * p.scaleX;
  const offsetY = (pupilY + p.offsetY) * p.scaleY;
  const dist = (0.5 / ipd) * p.scaleZ + p.depthBase;

  camera.position.set(-offsetX, -offsetY, dist);

  // frustum bounds in world space (centered at origin)
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

  const near = 0.1;
  const far = 100;
  const scale = near / dist;

  camera.projectionMatrix.makePerspective(
    (left + offsetX) * scale,
    (right + offsetX) * scale,
    (-down + offsetY) * scale,
    (-top + offsetY) * scale,
    near,
    far,
  );
}
