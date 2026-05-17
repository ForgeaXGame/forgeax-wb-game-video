/**
 * wb-character-forge backend.  Exported as a factory `createCharacterForgeRouter`
 * so the kubeela host can `app.route('/api/wb/character-forge', factory(ctx))`
 * without leaking process.env into the plugin (the host injects an env map).
 *
 * Endpoints — all under the mount prefix:
 *   GET  /status              → key readiness + plugin meta
 *   POST /portrait            → generate立绘 (optionally 多视图)
 *   POST /sprite-sheet        → generate 行动小人 sheet
 *   GET  /characters          → list characters in a slug
 *   GET  /characters/:charId  → single manifest + asset urls
 *   POST /characters/:charId/rename
 *   GET  /asset               → stream raw bytes (PNG / JSON) within the safe-path scope
 *
 * Why a roll-our-own /asset endpoint instead of /api/files: the latter only
 * returns the file as a JSON-wrapped string (utf-8 text).  We need raw binary
 * for PNG, so we stream from the same safe-path-validated absolute path.
 */

import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { ImageDispatcher } from './clients/dispatcher';
import { buildPortraitPrompt, getStylePreset, STYLE_IDS } from './prompts/portrait';
import { buildSpriteSheetPrompt } from './prompts/sprite';
import { assertCharId, assertSlug, deriveCharId, deriveName, ForgeError } from './lib/ids';
import {
  assetUrl,
  charDir,
  ensureAssetPath,
  fileExists,
  gameCharsDir,
  listCharacters,
  loadManifest,
  manifestPath as manifestPathOf,
  savePortraitFile,
  saveManifest,
  saveSpriteSheet,
} from './lib/storage';
import type {
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

const VALID_VIEWS: PortraitView[] = ['front', 'side', 'back'];
const VALID_DIRS: SpriteDirection[] = ['down', 'left', 'right', 'up'];

const PORTRAIT_TIMEOUT_MS = 90_000;
const SPRITE_TIMEOUT_MS = 120_000;

export function createCharacterForgeRouter(ctx: RouterCtx): Hono {
  const r = new Hono();
  const dispatcher = new ImageDispatcher(ctx.env);

  r.get('/status', (c) => {
    const k = dispatcher.isReady();
    return c.json({
      plugin: '@kubeela-plugin/wb-character-forge',
      version: '0.1.0',
      vendors: k,
      styles: STYLE_IDS,
      now: new Date().toISOString(),
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // POST /portrait — body = GeneratePortraitArgs (see schemas/)
  // ──────────────────────────────────────────────────────────────────────
  r.post('/portrait', async (c) => {
    let body: GeneratePortraitArgs;
    try { body = (await c.req.json()) as GeneratePortraitArgs; } catch {
      return c.json({ error: 'invalid-json' }, 400);
    }

    try {
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

      // Load-or-init manifest so re-running on an existing charId appends
      // views rather than wipes prior assets.
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

      const out: GeneratePortraitResult = {
        charId,
        name,
        files,
        manifestPath: friendly(manifestAbs, ctx.projectRoot),
        model: lastModel,
        costEstimate: { usd: 0.04 * files.length, vendor: lastModel.split('/')[0] || 'unknown' },
      };
      return c.json(out);
    } catch (e) {
      return mapError(c, e);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // POST /sprite-sheet
  // ──────────────────────────────────────────────────────────────────────
  r.post('/sprite-sheet', async (c) => {
    let body: GenerateSpriteSheetArgs;
    try { body = (await c.req.json()) as GenerateSpriteSheetArgs; } catch {
      return c.json({ error: 'invalid-json' }, 400);
    }

    try {
      const slug = assertSlug(body.slug);
      const charId = assertCharId(body.charId);
      const action = body.action ?? 'walk';
      const directions = (body.directions?.length
        ? body.directions.filter((d): d is SpriteDirection => VALID_DIRS.includes(d))
        : VALID_DIRS);
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

      const out: GenerateSpriteSheetResult = {
        charId,
        action,
        sheet: { path: rel, url: assetUrl(slug, charId, rel) },
        atlas: directions.map((dir) => ({ dir, framesPerDir, frameSize })),
      };
      return c.json(out);
    } catch (e) {
      return mapError(c, e);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET /characters
  // ──────────────────────────────────────────────────────────────────────
  r.get('/characters', async (c) => {
    try {
      const slug = assertSlug(c.req.query('slug') ?? '');
      const items = await listCharacters(ctx, slug);
      return c.json({ slug, items });
    } catch (e) {
      return mapError(c, e);
    }
  });

  r.get('/characters/:charId', async (c) => {
    try {
      const slug = assertSlug(c.req.query('slug') ?? '');
      const charId = assertCharId(c.req.param('charId'));
      const manifest = await loadManifest(ctx, slug, charId);
      const urls: Record<string, string> = {};
      for (const [view, rel] of Object.entries(manifest.portrait ?? {})) {
        if (rel) urls[`portrait/${view}`] = assetUrl(slug, charId, rel);
      }
      for (const [action, sheet] of Object.entries(manifest.sprites ?? {})) {
        if (sheet?.sheet) urls[`sprites/${action}`] = assetUrl(slug, charId, sheet.sheet);
      }
      return c.json({ manifest, urls });
    } catch (e) {
      return mapError(c, e);
    }
  });

  r.post('/characters/:charId/rename', async (c) => {
    let body: { slug?: string; name?: string };
    try { body = (await c.req.json()) as { slug?: string; name?: string }; } catch {
      return c.json({ error: 'invalid-json' }, 400);
    }
    try {
      const slug = assertSlug(body.slug);
      const charId = assertCharId(c.req.param('charId'));
      const name = (body.name ?? '').trim();
      if (!name || name.length > 80) throw new ForgeError('invalid-name', 'name must be 1-80 chars');
      const manifest = await loadManifest(ctx, slug, charId);
      manifest.name = name;
      await saveManifest(ctx, slug, manifest);
      ctx.emit?.('character-forge.character.renamed', { slug, charId, name });
      return c.json({ ok: true, name });
    } catch (e) {
      return mapError(c, e);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET /asset?path=.kubeela/games/<slug>/characters/<charId>/...
  // Streams raw bytes (PNG / JSON) for the browser <img src=> + AI fetch.
  // ──────────────────────────────────────────────────────────────────────
  r.get('/asset', async (c) => {
    const rel = c.req.query('path') ?? '';
    const abs = safeAssetPath(ctx.projectRoot, rel);
    if (!abs) return c.json({ error: 'path outside character-forge asset whitelist' }, 400);
    if (!(await fileExists(abs))) return c.json({ error: 'not-found' }, 404);
    const bytes = await readFile(abs);
    const mime = guessMime(abs);
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': mime, 'cache-control': 'no-cache' },
    });
  });

  return r;
}

// ──────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function mapError(c: import('hono').Context, e: unknown): Response {
  if (e instanceof ForgeError) {
    return c.json({ error: e.code, message: e.message }, e.status as 400);
  }
  const msg = (e as Error)?.message ?? String(e);
  // eslint-disable-next-line no-console
  console.warn('[wb-character-forge]', msg);
  return c.json({ error: 'internal-error', message: msg.slice(0, 500) }, 500);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new ForgeError('timeout', `${label} exceeded ${ms}ms`, 504)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/**
 * Restrict /asset to character-forge's own directory tree so a malicious or
 * confused caller can't pull arbitrary files (e.g. .env) through us.  Path
 * must resolve under `<projectRoot>/.kubeela/games/<slug>/characters/`.
 */
function safeAssetPath(root: string, rel: string): string | null {
  if (!rel || typeof rel !== 'string') return null;
  if (isAbsolute(rel)) return null;
  if (rel.includes('\0') || rel.includes('..')) return null;
  const abs = resolve(root, rel);
  const r = relative(root, abs);
  if (r.startsWith('..') || isAbsolute(r)) return null;
  // canonical layout enforced: .kubeela / games / <slug> / characters / ...
  const segs = r.split(/[/\\]/);
  if (segs[0] !== '.kubeela' || segs[1] !== 'games' || segs[3] !== 'characters') return null;
  return abs;
}

function guessMime(p: string): string {
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function friendly(p: string, root: string): string {
  const r = relative(root, p);
  return r.startsWith('..') || isAbsolute(r) ? p : r;
}
