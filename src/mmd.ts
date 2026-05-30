import * as THREE from "three";
import { MMDLoader } from "three/examples/jsm/loaders/MMDLoader.js";
import { MMDAnimationHelper } from "three/examples/jsm/animation/MMDAnimationHelper.js";
import type { MMDLoaderAnimationObject } from "three/examples/jsm/loaders/MMDLoader.js";

let ammoReady = false;

/** Base path for static assets (respects Vite's base config for deployment) */
const STATIC_BASE = import.meta.env.BASE_URL;

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

  /** Stored model/animation info for reload-on-loop support */
  private _lastModelPath: string | null = null;
  private _lastVmdPaths: string[] = [];
  private _looped = false;

  constructor(container: THREE.Object3D) {
    this.container = container;
    this.physicsEnabled = ammoReady;

    this.helper = new MMDAnimationHelper({
      afterglow: 2.0,
      resetPhysicsOnLoop: true,
    });

    this.loader = new MMDLoader();
  }

  /** Whether the animation has looped and a reload is needed */
  get looped(): boolean {
    return this._looped;
  }

  /**
   * Initialize Ammo.js WebAssembly physics engine.
   * Must be called once before loading any MMD model with physics enabled.
   */
  static async initAmmo(): Promise<void> {
    if (ammoReady) return;

    const AmmoFactory = await import("three/examples/jsm/libs/ammo.wasm.js");
    const ammoModule: Record<string, unknown> = {
      locateFile: (filename: string) => `${STATIC_BASE}libs/${filename}`,
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

          // Store model info for potential reload
          this._lastModelPath = modelPath;
          this._lastVmdPaths = vmdPaths;

          // Listen for animation loop to set the reload flag.
          // The helper already filters non-bone track loops — we piggyback
          // on its internal mixer to detect loops reliably.
          const mixer = (this.helper as any).objects?.get(mesh)?.mixer;
          if (mixer) {
            mixer.addEventListener("loop", (event: any) => {
              const tracks = event.action?._clip?.tracks;
              if (
                tracks?.length > 0 &&
                tracks[0].name.slice(0, 6) !== ".bones"
              )
                return;
              this._looped = true;
            });
          }

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
   * Call when `looped` is true to remove the current model and reload it
   * from scratch with fresh physics. Returns the new mesh.
   */
  async reload(): Promise<THREE.SkinnedMesh> {
    if (!this._lastModelPath) {
      throw new Error("No model has been loaded — cannot reload");
    }

    // Remove all existing meshes
    for (const mesh of [...this.meshes]) {
      this.remove(mesh);
    }

    this._looped = false;

    return this.load(this._lastModelPath, this._lastVmdPaths);
  }

  /**
   * Call every frame with the frame delta in seconds.
   */
  update(delta: number): void {
    this.helper.update(delta);
  }

  /**
   * Remove a loaded mesh from the scene.
   * Also disposes GPU resources (geometry, materials, textures).
   */
  remove(mesh: THREE.SkinnedMesh): void {
    const idx = this.meshes.indexOf(mesh);
    if (idx !== -1) {
      this.helper.remove(mesh);
      this.container.remove(mesh);
      this.meshes.splice(idx, 1);

      // Dispose GPU resources to avoid memory leaks on reload
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
  }

  /**
   * Fully dispose the manager, removing all meshes and freeing resources.
   */
  dispose(): void {
    for (const mesh of [...this.meshes]) {
      this.remove(mesh);
    }
    this._lastModelPath = null;
    this._lastVmdPaths = [];
  }
}
