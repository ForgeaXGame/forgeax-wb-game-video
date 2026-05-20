/**
 * wb-character-forge —— plain-function handler SSOT.
 *
 * Two parallel consumers share this module:
 *   1. server.ts —— Hono router 把每条 endpoint thin-wrap 到对应 handler
 *   2. forgeax-server builtin/commands/character-forge.ts + builtin/kits/character-forge/tools/*.ts
 *      —— agent / CLI / cron 直接调 handler 拿 JSON,不走 HTTP
 *
 * 两路径共享同一份业务实现 + 同一个 character-forge.* 事件名 —— ledger / ws 看到的
 * 事件形状统一,与 caller 无关。
 *
 * HandlerCtx 字段 = RouterCtx 字段（projectRoot / env / emit?）.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ImageDispatcher } from './clients/dispatcher';
import { buildPortraitPrompt, getStylePreset, STYLE_IDS } from './prompts/portrait';
import { buildSpriteSheetPrompt } from './prompts/sprite';
import { assertCharId, assertSlug, deriveCharId, deriveName, ForgeError } from './lib/ids';
import {
  assetUrl,
  charDir,
  fileExists,
  listCharacters as listCharactersStorage,
  loadManifest,
  manifestPath as manifestPathOf,
  savePortraitFile,
  saveManifest,
  saveSpriteSheet,
} from './lib/storage';
import type {
  CharacterListItem,
  CharacterManifest,
  GeneratePortraitArgs,
  GeneratePortraitResult,
  GenerateSpriteSheetArgs,
  GenerateSpriteSheetResult,
  PortraitView,
  RouterCtx,
  SpriteDirection,
  StylePreset,
} from './types';

export { ForgeError };
export type HandlerCtx = RouterCtx;

const VALID_VIEWS: PortraitView[] = ['front', 'side', 'back'];
const VALID_DIRS: SpriteDirection[] = ['down', 'left', 'right', 'up'];

const PORTRAIT_TIMEOUT_MS = 90_000;
const SPRITE_TIMEOUT_MS = 120_000;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new ForgeError('timeout', `${label} exceeded ${ms}ms`, 504)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

function friendly(p: string, root: string): string {
  const rel = resolve(p);
  if (!rel.startsWith(root)) return p;
  const r = rel.slice(root.length);
  return r.startsWith('/') ? r.slice(1) : r;
}

// Per-ctx dispatcher cache —— 同一 ctx.env 复用同一个 ImageDispatcher（包含
// vendor SDK 实例 + key 状态）,避免每次 handler call 重新构造。projectRoot
// 用作弱键足够 —— forgeax-server 只跑一个 projectRoot,plugin host 注入一个 env。
const dispatcherCache = new WeakMap<HandlerCtx, ImageDispatcher>();
function dispatcherFor(ctx: HandlerCtx): ImageDispatcher {
  let d = dispatcherCache.get(ctx);
  if (!d) {
    d = new ImageDispatcher(ctx.env);
    dispatcherCache.set(ctx, d);
  }
  return d;
}

export interface StatusResult {
  plugin: string;
  version: string;
  vendors: ReturnType<ImageDispatcher['isReady']>;
  styles: typeof STYLE_IDS;
  now: string;
}

export function getStatus(ctx: HandlerCtx): StatusResult {
  return {
    plugin: '@forgeax-plugin/wb-character-forge',
    version: '0.1.0',
    vendors: dispatcherFor(ctx).isReady(),
    styles: STYLE_IDS,
    now: new Date().toISOString(),
  };
}

export async function listCharacters(ctx: HandlerCtx, slug: string): Promise<{ slug: string; items: CharacterListItem[] }> {
  const s = assertSlug(slug);
  const items = await listCharactersStorage(ctx, s);
  return { slug: s, items };
}

export async function getCharacter(
  ctx: HandlerCtx,
  slug: string,
  charId: string,
): Promise<{ manifest: CharacterManifest; urls: Record<string, string> }> {
  const s = assertSlug(slug);
  const c = assertCharId(charId);
  const manifest = await loadManifest(ctx, s, c);
  const urls: Record<string, string> = {};
  for (const [view, rel] of Object.entries(manifest.portrait ?? {})) {
    if (rel) urls[`portrait/${view}`] = assetUrl(s, c, rel);
  }
  for (const [action, sheet] of Object.entries(manifest.sprites ?? {})) {
    if (sheet?.sheet) urls[`sprites/${action}`] = assetUrl(s, c, sheet.sheet);
  }
  return { manifest, urls };
}

export async function generatePortrait(
  ctx: HandlerCtx,
  body: GeneratePortraitArgs,
): Promise<GeneratePortraitResult> {
  const dispatcher = dispatcherFor(ctx);
  const slug = assertSlug(body.slug);
  const prompt = (body.prompt ?? '').trim();
  if (!prompt) throw new ForgeError('empty-prompt', 'prompt is required');
  const style = (body.style ?? 'anime-hd-flat') as StylePreset;
  const views = body.views?.length
    ? body.views.filter((v): v is PortraitView => VALID_VIEWS.includes(v))
    : ['front' as PortraitView];
  if (views.length === 0) throw new ForgeError('invalid-views', 'at least one view required');

  const charId = body.charId ? assertCharId(body.charId) : deriveCharId(prompt);
  const name = body.name?.trim() || deriveName(prompt);
  const nowIso = new Date().toISOString();

  let manifest: CharacterManifest;
  const existingPath = manifestPathOf(ctx, slug, charId);
  if (existsSync(existingPath)) {
    manifest = await loadManifest(ctx, slug, charId);
  } else {
    manifest = {
      schemaVersion: 1,
      charId,
      name,
      createdAt: nowIso,
      updatedAt: nowIso,
      prompt: { user: prompt, style, refImage: body.refImageBase64 ?? null },
      portrait: {},
      sprites: {},
      variants: [],
    };
  }

  const files: GeneratePortraitResult['files'] = [];
  let lastModel = '';
  let consistencyHint: string | undefined;
  for (const view of views) {
    const promptText = buildPortraitPrompt({
      userDescription: prompt,
      style: getStylePreset(style),
      view,
      consistencyHint,
    });
    const dispatchPromise = dispatcher.generate('concept-art', {
      prompt: promptText,
      size: body.size ?? '2k',
      refImageBase64: body.refImageBase64,
    }, body.model);
    const r2 = await withTimeout(dispatchPromise, PORTRAIT_TIMEOUT_MS, `portrait:${view}`);
    const { rel } = await savePortraitFile(ctx, slug, charId, { view, pngBytes: r2.pngBytes });
    manifest.portrait[view] = rel;
    files.push({ view, path: rel, url: assetUrl(slug, charId, rel) });
    lastModel = `${r2.vendor}/${r2.modelId}`;
    if (!consistencyHint) {
      consistencyHint = `Same character as the ${view} portrait: ${prompt}.`;
    }
  }

  const manifestAbs = await saveManifest(ctx, slug, manifest);

  ctx.emit?.('character-forge.portrait.generated', {
    slug, charId, name, views, model: lastModel, fileCount: files.length,
  });

  return {
    charId,
    name,
    files,
    manifestPath: friendly(manifestAbs, ctx.projectRoot),
    model: lastModel,
    costEstimate: { usd: 0.04 * files.length, vendor: lastModel.split('/')[0] || 'unknown' },
  };
}

export async function generateSpriteSheet(
  ctx: HandlerCtx,
  body: GenerateSpriteSheetArgs,
): Promise<GenerateSpriteSheetResult> {
  const dispatcher = dispatcherFor(ctx);
  const slug = assertSlug(body.slug);
  const charId = assertCharId(body.charId);
  const action = body.action ?? 'walk';
  const directions = body.directions?.length
    ? body.directions.filter((d): d is SpriteDirection => VALID_DIRS.includes(d))
    : VALID_DIRS;
  const framesPerDir = clamp(body.framesPerDir ?? 4, 2, 8);
  const frameSize = (body.frameSize ?? 96) as 64 | 96 | 128;

  const manifest = await loadManifest(ctx, slug, charId);
  const portraitRel = manifest.portrait.front;
  let refBase64: string | undefined;
  if (portraitRel) {
    const portraitAbs = resolve(charDir(ctx, slug, charId), portraitRel);
    if (await fileExists(portraitAbs)) {
      const bytes = await readFile(portraitAbs);
      refBase64 = Buffer.from(bytes).toString('base64');
    }
  }

  const promptText = buildSpriteSheetPrompt({
    userDescription: manifest.prompt.user,
    style: manifest.prompt.style,
    action,
    directions,
    framesPerDir,
    hasReferenceImage: Boolean(refBase64),
  });

  const r2 = await withTimeout(
    dispatcher.generate('sprite-frame', {
      prompt: promptText,
      size: '2k',
      refImageBase64: refBase64,
    }, body.model),
    SPRITE_TIMEOUT_MS,
    `sprite-sheet:${action}`,
  );
  const { rel } = await saveSpriteSheet(ctx, slug, charId, action, r2.pngBytes);

  manifest.sprites[action] = {
    sheet: rel,
    framesPerDir,
    directions,
    frameSize: { w: frameSize, h: frameSize },
    generatedAt: new Date().toISOString(),
  };
  await saveManifest(ctx, slug, manifest);

  ctx.emit?.('character-forge.sprite.generated', {
    slug, charId, action, model: `${r2.vendor}/${r2.modelId}`, directions: directions.length,
  });

  return {
    charId,
    action,
    sheet: { path: rel, url: assetUrl(slug, charId, rel) },
    atlas: directions.map((dir) => ({ dir, framesPerDir, frameSize })),
  };
}

export async function renameCharacter(
  ctx: HandlerCtx,
  slug: string,
  charId: string,
  name: string,
): Promise<{ ok: true; name: string }> {
  const s = assertSlug(slug);
  const c = assertCharId(charId);
  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.length > 80) {
    throw new ForgeError('invalid-name', 'name must be 1-80 chars');
  }
  const manifest = await loadManifest(ctx, s, c);
  manifest.name = trimmed;
  await saveManifest(ctx, s, manifest);
  ctx.emit?.('character-forge.character.renamed', { slug: s, charId: c, name: trimmed });
  return { ok: true, name: trimmed };
}
