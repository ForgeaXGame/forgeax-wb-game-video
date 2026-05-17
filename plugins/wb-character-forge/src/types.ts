export type PortraitView = 'front' | 'side' | 'back';
export type SpriteAction = 'walk' | 'idle' | 'attack';
export type SpriteDirection = 'down' | 'left' | 'right' | 'up';

export type StylePreset =
  | 'anime-hd-flat'
  | 'semi-realistic'
  | 'pixel-32'
  | 'cell-shaded'
  | 'watercolor'
  | 'cyberpunk';

export interface PromptInput {
  user: string;
  style: StylePreset;
  refImage?: string | null;
}

export interface CharacterManifest {
  schemaVersion: 1;
  charId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  prompt: PromptInput;
  portrait: Partial<Record<PortraitView, string>>;
  sprites: Partial<Record<SpriteAction, SpriteSheetEntry>>;
  variants: Array<{ id: string; label: string; portrait: Partial<Record<PortraitView, string>> }>;
}

export interface SpriteSheetEntry {
  sheet: string;
  framesPerDir: number;
  directions: SpriteDirection[];
  frameSize: { w: number; h: number };
  generatedAt: string;
}

export interface CharacterListItem {
  charId: string;
  name: string;
  portraitUrl: string | null;
  createdAt: string;
  hasSprites: boolean;
}

export interface GeneratePortraitArgs {
  slug: string;
  prompt: string;
  style?: StylePreset;
  views?: PortraitView[];
  name?: string;
  charId?: string;
  model?: 'seedream' | 'nano-banana' | 'azure-gpt-image';
  size?: '1k' | '2k' | '4k';
  refImageBase64?: string;
}

export interface GeneratePortraitResult {
  charId: string;
  name: string;
  files: Array<{ view: PortraitView; path: string; url: string }>;
  manifestPath: string;
  model: string;
  costEstimate?: { usd: number; vendor: string };
}

export interface GenerateSpriteSheetArgs {
  slug: string;
  charId: string;
  action?: SpriteAction;
  directions?: SpriteDirection[];
  framesPerDir?: number;
  frameSize?: 64 | 96 | 128;
  model?: 'nano-banana' | 'azure-gpt-image';
}

export interface GenerateSpriteSheetResult {
  charId: string;
  action: SpriteAction;
  sheet: { path: string; url: string };
  atlas: Array<{ dir: SpriteDirection; framesPerDir: number; frameSize: number }>;
}

export interface RouterCtx {
  /** kubeela project root, absolute */
  projectRoot: string;
  /** bus event emitter (loose-typed, plugin shouldn't depend on bus internals) */
  emit?: (name: string, args: Record<string, unknown>) => void;
  /** env reader; tests can inject overrides without polluting process.env */
  env: Record<string, string | undefined>;
}
