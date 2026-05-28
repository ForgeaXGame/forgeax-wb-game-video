// @source wb-character/src/core/types.ts
// Note: THREE.js references replaced with unknown — wb-anim (spine/video) does
// not depend on Three.js. The pipeline contract types (IPipeline / PipelineContext
// / PipelineMeta / PipelinePanels) are reproduced in full; rendering engine types
// use unknown placeholders so the interfaces compile without the three package.

/* ── Pipeline Plugin Interface ───────────────────────────────────── */

export type PipelinePlacement = 'main' | 'drawer' | 'hidden'

export type PipelineInput =
  | 'conceptImage'
  | 'turnaroundSheet'
  | 'spriteSheet'
  | 'vehicleSheet'

export type PipelineOutput =
  | 'spriteZip'
  | 'vehicleZip'
  | 'vfxConfig'
  | 'videoClip'
  | 'spineSkel'

export interface PipelineMeta {
  id: string
  name: string
  icon: string
  description: string
  version: string
  author?: string
  placement?: PipelinePlacement
  agentTags?: string[]
  inputs?: PipelineInput[]
  outputs?: PipelineOutput[]
}

export interface PipelineContext {
  engine: IEngine
  sceneManager: ISceneManager
  characterPreview: ICharacterPreview
  eventBus: IEventBus
  workspacePath: string
}

export interface PipelinePanels {
  left: HTMLElement
  center: HTMLElement
  right: HTMLElement
  bottom: HTMLElement
}

export interface IPipeline {
  meta: PipelineMeta
  init(ctx: PipelineContext): Promise<void>
  dispose(): void
  createUI(container: HTMLElement, panels?: PipelinePanels): void
  destroyUI(): void
  getDefaultParams(): Record<string, unknown>
  resetForNewCharacter?(): void | Promise<void>
}

/* ── Model / Scene types (THREE-independent stubs) ──────────────── */

export interface ModelHandle {
  root: unknown
  animations: unknown[]
  mixer: unknown | null
}

export type SceneEntryKind = 'gltf' | 'procedural'

export interface SceneEntry {
  id: string
  name: string
  kind?: SceneEntryKind
  file?: string
  generator?: string
  generatorOptions?: Record<string, unknown>
  thumbnail?: string
  camera?: CameraPreset
  lighting?: string
}

export interface SceneManifest {
  scenes: SceneEntry[]
  defaultScene: string
}

export interface CameraPreset {
  name: string
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

/* ── Generation Result ───────────────────────────────────────────── */

export type AssetType = 'model' | 'sprite' | 'animation' | 'vfx' | 'video' | 'texture'

export interface GeneratedFile {
  name: string
  path: string
  mimeType: string
}

export interface GenerationResult {
  pipelineId: string
  type: AssetType
  files: GeneratedFile[]
  previewData?: unknown
}

/* ── Thin interfaces for decoupling (THREE replaced with unknown) ── */

export interface IEngine {
  renderer: unknown
  camera: unknown
  scene: unknown
  overlayScene: unknown
  start(): void
  pause(): void
  resume(): void
  onUpdate(cb: (dt: number) => void): void
  removeUpdate(cb: (dt: number) => void): void
}

export interface ISceneManager {
  loadScene(id: string): Promise<void>
  getCurrentSceneId(): string | null
  getManifest(): SceneManifest | null
}

export interface ICharacterPreview {
  showModel(handle: ModelHandle): void
  showSprite?(animator: { mesh: unknown; update(dt: number): void; dispose(): void }): void
  clear(): void
}

export interface IEventBus {
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
}
