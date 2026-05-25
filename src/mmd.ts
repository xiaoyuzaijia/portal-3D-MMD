import * as THREE from "three";
import { MMDLoader } from "three/examples/jsm/loaders/MMDLoader.js";
import { MMDAnimationHelper } from "three/examples/jsm/animation/MMDAnimationHelper.js";
import type { MMDLoaderAnimationObject } from "three/examples/jsm/loaders/MMDLoader.js";

/**
 * Loads MMD (MikuMikuDance) models and optionally plays VMD animation.
 *
 * Expects MMD files under public/mmd/ (copy from the original
 * head-tracked-3d project's docs/mmd/ directory).
 */
export class MMDManager {
  readonly container: THREE.Object3D;
  readonly helper: MMDAnimationHelper;
  readonly loader: MMDLoader;

  private meshes: THREE.SkinnedMesh[] = [];
  private clock = new THREE.Clock();

  constructor(container: THREE.Object3D) {
    this.container = container;

    this.helper = new MMDAnimationHelper({
      afterglow: 2.0,
    });

    this.loader = new MMDLoader();
  }

  /**
   * Load a PMX model without any animation (static pose).
   *
   * Uses MMDLoader.load() (not loadPMX) because loadPMX returns raw
   * parsed data, not a built SkinnedMesh.
   */
  loadModel(modelPath: string): Promise<THREE.SkinnedMesh> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        modelPath,
        (mesh) => {
          mesh.scale.set(0.15, 0.15, 0.15);
          this.container.add(mesh);
          this.meshes.push(mesh);
          resolve(mesh);
        },
        undefined,
        (error: unknown) => {
          reject(new Error("MMD model not found: " + modelPath));
        },
      );
    });
  }

  /**
   * Load a PMX model with VMD motion files.
   */
  load(
    modelPath: string,
    vmdPaths: string[] = [],
  ): Promise<THREE.SkinnedMesh> {
    return new Promise((resolve, reject) => {
      this.loader.loadWithAnimation(
        modelPath,
        vmdPaths,
        (object: MMDLoaderAnimationObject) => {
          const mesh = object.mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          this.container.add(mesh);
          this.meshes.push(mesh);
          this.helper.add(mesh, {
            animation: object.animation,
            physics: false,
          });
          resolve(mesh);
        },
        (_progress: ProgressEvent) => {
          // progress callback
        },
        (error: unknown) => {
          console.warn("MMD loader warning:", error);
          reject(error);
        },
      );
    });
  }

  /**
   * Call every frame with the frame delta in seconds.
   */
  update(delta: number): void {
    this.helper.update(delta);
  }

  /**
   * Remove a loaded mesh from the scene.
   */
  remove(mesh: THREE.SkinnedMesh): void {
    const idx = this.meshes.indexOf(mesh);
    if (idx !== -1) {
      this.helper.remove(mesh);
      this.container.remove(mesh);
      this.meshes.splice(idx, 1);
    }
  }
}
