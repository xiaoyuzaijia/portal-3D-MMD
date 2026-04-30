/// <reference path="./types.d.ts" />

/**
 * HeadTracker — loads MediaPipe FaceMesh from CDN and tracks the user's
 * iris positions and inter-pupillary distance (IPD) in real time.
 *
 * Draws a face-mesh wireframe overlay on a canvas so users can verify
 * tracking is working correctly at a glance.
 */

const FACEMESH_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

/* MediaPipe FaceMesh landmark connection groups for wireframe drawing */
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const LEFT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
const RIGHT_EYE = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382];

export class HeadTracker {
  readonly video: HTMLVideoElement;
  private faceMesh: FaceMeshInstance | null = null;
  private stream: MediaStream | null = null;
  private animFrameId = 0;
  private _ready = false;
  private _running = false;

  /* ---- face-mesh overlay canvas ---- */
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  /* ---- smoothed output (normalized units) ---- */
  centralPupilX = 0;
  centralPupilY = 0;
  ipd = 0.08;

  private rawPupilX = 0;
  private rawPupilY = 0;
  private rawIpd = 0.08;

  /* smoothing coefficients (closer to 1 = heavier damping) */
  private readonly smoothPupil = 0.5;
  private readonly smoothIpd = 0.9;

  /* iris landmark indices (MediaPipe refineLandmarks=true) */
  private static readonly LEFT_IRIS = 468;
  private static readonly RIGHT_IRIS = 473;
  private static readonly LEFT_EYE = 33;
  private static readonly RIGHT_EYE = 263;

  private firstDetectionLogged = false;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  get ready(): boolean {
    return this._ready && this._running;
  }

  async init(): Promise<void> {
    // MUST register locateFile on the global Module BEFORE loading the
    // CDN script. The packed_assets_loader registers a preRun callback
    // that uses Module.locateFile() to resolve the .data file URL.
    // If locateFile is undefined at that point, addRunDependency(undefined)
    // will throw an assertion error.
    (window as any).Module = (window as any).Module || {};
    (window as any).Module.locateFile = (file: string) =>
      `${FACEMESH_CDN}/${file}`;

    await loadScript(`${FACEMESH_CDN}/face_mesh.js`);

    const FaceMesh = window.FaceMesh;

    this.faceMesh = new FaceMesh({
      locateFile: (file: string) => `${FACEMESH_CDN}/${file}`,
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.faceMesh.onResults((results: FaceMeshResults) =>
      this.onResults(results),
    );

    this._ready = true;
  }

  async start(): Promise<void> {
    if (!this._ready) await this.init();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: 640, height: 480, facingMode: "user" },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    this.createOverlayCanvas();

    this._running = true;

    // Start the detection chain: call send() once; onResults chains
    // the next send() via rAF.
    this.scheduleNextFrame();
  }

  stop(): void {
    this._running = false;
    cancelAnimationFrame(this.animFrameId);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.faceMesh?.close();
    this.faceMesh = null;
    this._ready = false;
    this.removeOverlayCanvas();
  }

  /* ---- internal ---- */

  private createOverlayCanvas(): void {
    const canvas = document.createElement("canvas");
    canvas.id = "face-mesh-overlay";
    canvas.width = this.video.videoWidth || 640;
    canvas.height = this.video.videoHeight || 480;
    canvas.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 160px;
      height: 120px;
      z-index: 11;
      pointer-events: none;
      transform: scaleX(-1);
    `;
    document.body.appendChild(canvas);
    this.overlayCanvas = canvas;
    this.overlayCtx = canvas.getContext("2d")!;
  }

  private removeOverlayCanvas(): void {
    this.overlayCanvas?.remove();
    this.overlayCanvas = null;
    this.overlayCtx = null;
  }

  /**
   * Schedule send() via rAF — but only after the previous frame's
   * onResults has finished.  This avoids the classic MediaPipe CDN
   * bug where concurrent send() calls cause Emscripten's WASM runtime
   * to double-initialise and throw addRunDependency(undefined).
   */
  private scheduleNextFrame = (): void => {
    if (!this._running) return;

    this.animFrameId = requestAnimationFrame(() => {
      if (!this._running) return;
      if (this.faceMesh && this.video.readyState >= 2) {
        void this.faceMesh.send({ image: this.video });
      }
      // onResults will call scheduleNextFrame() again → continuous loop
    });
  };

  private onResults(results: FaceMeshResults): void {
    const landmarks = results.multiFaceLandmarks?.[0];

    if (!this.firstDetectionLogged) {
      this.firstDetectionLogged = true;
      console.log(
        "[HeadTracker] First face detected:",
        landmarks ? `${landmarks.length} landmarks` : "no face",
      );
    }

    this.drawWireframe(landmarks);

    if (landmarks) {
      const leftIris = landmarks[HeadTracker.LEFT_IRIS];
      const rightIris = landmarks[HeadTracker.RIGHT_IRIS];

      // Iris midpoint in normalized [0, 1] coordinates
      const irisMx = (leftIris.x + rightIris.x) / 2;
      const irisMy = (leftIris.y + rightIris.y) / 2;

      // Map to [-1, 1] — same as the original project.
      // The old project does NOT negate here; negation only happens
      // in camera.position (calibration.ts) so we match that exactly.
      this.rawPupilX = irisMx * 2 - 1;
      this.rawPupilY = irisMy * 2 - 1;

      // IPD — distance between irises in normalized coords
      this.rawIpd = Math.hypot(
        rightIris.x - leftIris.x,
        rightIris.y - leftIris.y,
        rightIris.z - leftIris.z,
      );

      // exponential moving average
      const sp = this.smoothPupil;
      this.centralPupilX = this.centralPupilX * sp + this.rawPupilX * (1 - sp);
      this.centralPupilY = this.centralPupilY * sp + this.rawPupilY * (1 - sp);

      const si = this.smoothIpd;
      this.ipd = this.ipd * si + this.rawIpd * (1 - si);
    }

    this.scheduleNextFrame();
  }

  /* ---- wireframe drawing ---- */

  private drawWireframe(landmarks: NormalizedLandmark[] | undefined): void {
    const ctx = this.overlayCtx;
    const canvas = this.overlayCanvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!landmarks || landmarks.length === 0) return;

    const toPixel = (lm: NormalizedLandmark): [number, number] => [
      lm.x * w,
      lm.y * h,
    ];

    ctx.lineWidth = 1;

    // face oval
    ctx.strokeStyle = "rgba(100,180,255,0.8)";
    this.drawPolyline(ctx, FACE_OVAL.map((i) => landmarks[i]), toPixel, true);

    // left eye
    ctx.strokeStyle = "rgba(100,255,100,0.9)";
    this.drawPolyline(ctx, LEFT_EYE.map((i) => landmarks[i]), toPixel, true);

    // right eye
    this.drawPolyline(ctx, RIGHT_EYE.map((i) => landmarks[i]), toPixel, true);

    // iris centres (red dots)
    if (landmarks.length > HeadTracker.RIGHT_IRIS) {
      const leftIrisPx = toPixel(landmarks[HeadTracker.LEFT_IRIS]);
      const rightIrisPx = toPixel(landmarks[HeadTracker.RIGHT_IRIS]);

      ctx.fillStyle = "rgba(255,40,40,0.9)";
      [leftIrisPx, rightIrisPx].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  private drawPolyline(
    ctx: CanvasRenderingContext2D,
    pts: NormalizedLandmark[],
    toPixel: (lm: NormalizedLandmark) => [number, number],
    close: boolean,
  ): void {
    if (pts.length === 0) return;
    ctx.beginPath();
    const [sx, sy] = toPixel(pts[0]);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = toPixel(pts[i]);
      ctx.lineTo(x, y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }
}
