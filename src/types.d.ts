// Type declarations for MediaPipe globals (loaded from CDN)

export {};

declare global {
  interface NormalizedLandmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }

  interface FaceMeshResults {
    multiFaceLandmarks: NormalizedLandmark[][];
    image?: unknown;
  }

  interface FaceMeshInstance {
    setOptions(options: FaceMeshOptions): void;
    onResults(
      callback: (results: FaceMeshResults) => Promise<void> | void,
    ): void;
    send(input: { image: HTMLVideoElement }): Promise<void>;
    close(): void;
  }

  interface FaceMeshOptions {
    maxNumFaces: number;
    refineLandmarks: boolean;
    minDetectionConfidence: number;
    minTrackingConfidence: number;
  }

  interface CameraInstance {
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  interface Window {
    FaceMesh: {
      new (config: {
        locateFile: (file: string) => string;
      }): FaceMeshInstance;
    };
    Camera: {
      new (
        videoElement: HTMLVideoElement,
        options: {
          onFrame: () => Promise<void>;
          width: number;
          height: number;
        },
      ): CameraInstance;
    };
  }
}
