// @source wb-character/src/core/Engine.ts
// wb-anim stub: spine/video pipelines do not use the 3D rendering engine.
// This file satisfies the IEngine interface without importing Three.js
// so that the typecheck gate passes without a three dependency.
import type { IEngine } from './types'

export class Engine implements IEngine {
  renderer: unknown = null
  camera: unknown = null
  scene: unknown = null
  overlayScene: unknown = null

  start(): void {}
  pause(): void {}
  resume(): void {}
  onUpdate(_cb: (dt: number) => void): void {}
  removeUpdate(_cb: (dt: number) => void): void {}
}
