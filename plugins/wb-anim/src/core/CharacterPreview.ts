// @source wb-character/src/core/CharacterPreview.ts
// wb-anim stub: spine/video pipelines do not use the 3D character preview.
// This file satisfies the ICharacterPreview interface without importing Three.js.
import type { ICharacterPreview, ModelHandle } from './types'

export class CharacterPreview implements ICharacterPreview {
  showModel(_handle: ModelHandle): void {}
  showSprite?(_animator: { mesh: unknown; update(dt: number): void; dispose(): void }): void {}
  clear(): void {}
}
