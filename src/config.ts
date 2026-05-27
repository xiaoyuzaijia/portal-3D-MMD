/**
 * Typed wrappers around config/scene_config.json.
 * Edit the JSON file to switch models, animations, or tune calibration.
 */

import raw from "../config/scene_config.json";

/* ===================================================================
 *  TYPES
 * =================================================================== */

export interface MmdModelConfig {
  path: string;
  scale: number;
  position: [number, number, number];
  rotationY: number;
}

export interface MmdAnimationConfig {
  vmdPaths: string[];
}

export interface MmdPreset {
  model: MmdModelConfig;
  animation: MmdAnimationConfig;
}

export interface CalibrationDefaults {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  showFacePreview: boolean;
  showFps: boolean;
}

/* ===================================================================
 *  VALUES  (from JSON)
 * =================================================================== */

const cfg = raw as unknown as {
  mmd: MmdPreset;
  calibration: CalibrationDefaults;
};

export const ACTIVE_PRESET: MmdPreset = cfg.mmd;

export const CALIBRATION_DEFAULTS: CalibrationDefaults = cfg.calibration;
