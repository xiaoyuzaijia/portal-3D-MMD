import * as THREE from "three";
import { MMDLoader } from "three/examples/jsm/loaders/MMDLoader.js";
import { MMDAnimationHelper } from "three/examples/jsm/animation/MMDAnimationHelper.js";
import type { MMDLoaderAnimationObject } from "three/examples/jsm/loaders/MMDLoader.js";

let ammoReady = false;

/**
 * Loads MMD (MikuMikuDance) models and optionally plays VMD animation.
 *
 * Expects MMD files under public/mmd/ (copy from the original
 * head-tracked-3d project's docs/mmd/ directory).
 *
 * Call MMDManager.initAmmo() once before creating any instance to enable
 * physics (hair, skirt, etc.).
 */
export class MMDManager {
  readonly container: THREE.Object3D;
  readonly helper: MMDAnimationHelper;
  readonly loader: MMDLoader;

  private meshes: THREE.SkinnedMesh[] = [];
  private physicsEnabled: boolean;

  constructor(container: THREE.Object3D) {
    this.container = container;
    this.physicsEnabled = ammoReady;

    this.helper = new MMDAnimationHelper({
      afterglow: 2.0,
    });

    this.loader = new MMDLoader();
  }

  /**
   * Initialize Ammo.js WebAssembly physics engine.
   * Must be called once before loading any MMD model with physics enabled.
   */
  static async initAmmo(): Promise<void> {
    if (ammoReady) return;

    const AmmoFactory = await import("three/examples/jsm/libs/ammo.wasm.js");
    const ammoModule: Record<string, unknown> = {
      locateFile: (filename: string) => `/libs/${filename}`,
    };

    // CJS interop: bundled builds may emit .default or put the function
    // directly on the module namespace.
    const AmmoFn =
      typeof (AmmoFactory as any).default === "function"
        ? (AmmoFactory as any).default
        : AmmoFactory;

    // .call() fixes strict-mode ESM: the ammo.wasm.js UMD code does
    // `this.Ammo = b` which fails with `this === undefined` in modules.
    await AmmoFn.call(window, ammoModule);

    (window as any).Ammo = ammoModule;
    ammoReady = true;
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
            physics: this.physicsEnabled,
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
