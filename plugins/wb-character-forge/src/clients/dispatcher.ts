import type { ImageGenClient, ImageGenOpts, ImageGenResult } from './_shared';
import { ImageVendorError } from './_shared';
import { SeedreamClient } from './seedream';
import { GeminiImageClient } from './gemini-image';
import { AzureGptImageClient } from './azure-gpt-image';

export type ChannelRole = 'concept-art' | 'sprite-frame';

export interface DispatchResult extends ImageGenResult {
  triedVendors: string[];
}

/**
 * `ImageDispatcher` — main → fallback chain per role.
 *   - concept-art (立绘 / 三视图): Seedream → Gemini → Azure
 *   - sprite-frame (行动小人):     Gemini → Azure → Seedream  (image-edit ranks first)
 *
 * `preferred` overrides the first attempt only; later fallbacks still follow
 * the role's natural order so a flaky primary doesn't strand the request.
 */
export class ImageDispatcher {
  private readonly clients: Record<string, ImageGenClient>;

  constructor(env: Record<string, string | undefined>) {
    this.clients = {
      seedream: new SeedreamClient(env),
      'nano-banana': new GeminiImageClient(env),
      'azure-gpt-image': new AzureGptImageClient(env),
    };
  }

  isReady(): { ready: string[]; missing: string[] } {
    const ready: string[] = [];
    const missing: string[] = [];
    for (const [k, c] of Object.entries(this.clients)) {
      (c.isReady() ? ready : missing).push(k);
    }
    return { ready, missing };
  }

  async generate(
    role: ChannelRole,
    opts: ImageGenOpts,
    preferred?: string,
  ): Promise<DispatchResult> {
    const chain = this.chainFor(role, preferred);
    const tried: string[] = [];
    let lastErr: Error | undefined;
    for (const id of chain) {
      const c = this.clients[id];
      if (!c) continue;
      if (!c.isReady()) {
        tried.push(`${id}:no-key`);
        continue;
      }
      try {
        const r = await c.generate(opts);
        return { ...r, triedVendors: [...tried, id] };
      } catch (e) {
        const code = e instanceof ImageVendorError ? `${id}:${e.status}` : `${id}:err`;
        tried.push(code);
        lastErr = e as Error;
        // Helpful when the primary keeps quietly bouncing the request and we
        // can't see why from outside.  Truncated to keep log noise bounded.
        // eslint-disable-next-line no-console
        console.warn(`[char-forge dispatcher] ${code}: ${(e as Error).message.slice(0, 240)}`);
      }
    }
    const e = new Error(
      `all image vendors failed for role=${role}: ${tried.join(', ')} :: ${lastErr?.message ?? 'no key configured'}`,
    ) as Error & { triedVendors: string[] };
    e.triedVendors = tried;
    throw e;
  }

  private chainFor(role: ChannelRole, preferred?: string): string[] {
    const natural = role === 'sprite-frame'
      ? ['nano-banana', 'azure-gpt-image', 'seedream']
      : ['seedream', 'nano-banana', 'azure-gpt-image'];
    if (!preferred || !this.clients[preferred]) return natural;
    return [preferred, ...natural.filter((id) => id !== preferred)];
  }
}
