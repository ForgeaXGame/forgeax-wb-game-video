// @source wb-character/src/core/SceneManager.ts
// wb-anim stub: spine/video pipelines do not use the 3D scene manager.
// This file satisfies the ISceneManager interface without importing Three.js.
import type { ISceneManager, SceneManifest } from './types'

export class SceneManager implements ISceneManager {
  private manifest: SceneManifest | null = null
  private currentSceneId: string | null = null

  async loadScene(id: string): Promise<void> {
    this.currentSceneId = id
  }

  getCurrentSceneId(): string | null {
    return this.currentSceneId
  }

  getManifest(): SceneManifest | null {
    return this.manifest
  }
}
