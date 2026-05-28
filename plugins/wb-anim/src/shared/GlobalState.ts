// @source wb-character/src/shared/GlobalState.ts
// Minimal re-declaration for wb-anim (spine + video pipelines).
// Only the fields actually read by spine/video are kept.
// The ImageModel preference is read from the same localStorage key so the
// two plugins stay in sync without any cross-plugin import.

export type ImageModel = 'gemini' | 'gpt-image-2'
export type CombatType = 'melee' | 'ranged'
export type Gender = 'male' | 'female'

// Subset of CharacterProfile used by spine / video pipelines.
export interface CharacterProfile {
  name: string
  charId: string
  gender: Gender
  combatType: CombatType
  charClass: string
  age: string
  worldSetting: string
  extraDesc: string
}

export interface CharacterDesignResult {
  profile: CharacterProfile
  characterImage: string | null
  timestamp: number
}

const STORAGE_KEY = 'character-editor:global-design'
const IMAGE_MODEL_STORAGE_KEY = 'character-editor:image-model'

const DEFAULT_PROFILE: CharacterProfile = {
  name: '',
  charId: '',
  gender: 'male',
  combatType: 'melee',
  charClass: '',
  age: '',
  worldSetting: '',
  extraDesc: '',
}

function parseImageModelFromStorage(raw: string | null | undefined): ImageModel {
  if (raw === 'gemini' || raw === 'gpt-image-2') return raw
  return 'gemini'
}

type Listener = () => void

class GlobalStateManager {
  private design: CharacterDesignResult = {
    profile: { ...DEFAULT_PROFILE },
    characterImage: null,
    timestamp: 0,
  }
  private imageModel: ImageModel = 'gemini'
  private listeners = new Set<Listener>()
  private _slug: string = ''

  constructor() {
    this.load()
    this.loadImageModel()
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (ev: StorageEvent) => {
        if (ev.key === STORAGE_KEY) {
          this.load()
          this.notify()
        } else if (ev.key === IMAGE_MODEL_STORAGE_KEY) {
          this.loadImageModel()
          this.notify()
        }
      })
    }
  }

  get(): CharacterDesignResult { return this.design }
  get profile(): CharacterProfile { return this.design.profile }
  get hasCharacter(): boolean { return this.design.characterImage !== null }

  getImageModel(): ImageModel { return this.imageModel }

  getSlug(): string { return this._slug }

  setSlug(slug: string): void {
    if (!slug || slug === this._slug) return
    this._slug = slug
    this.notify()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify(): void {
    for (const fn of this.listeners) fn()
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.profile) Object.assign(this.design.profile, saved.profile)
        if (saved.characterImage) this.design.characterImage = saved.characterImage
        if (saved.timestamp) this.design.timestamp = saved.timestamp
      }
    } catch {}
  }

  private loadImageModel(): void {
    try {
      this.imageModel = parseImageModelFromStorage(localStorage.getItem(IMAGE_MODEL_STORAGE_KEY))
    } catch {
      this.imageModel = 'gemini'
    }
  }
}

export const globalState = new GlobalStateManager()
;(window as any).__globalState = globalState
