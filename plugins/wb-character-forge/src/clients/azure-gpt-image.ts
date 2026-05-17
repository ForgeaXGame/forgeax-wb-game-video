import { ImageGenClient, ImageGenOpts, ImageGenResult, ImageVendorError, decodeBase64Png, sizeToWxH, withRetry } from './_shared';

const DEFAULT_ENDPOINT =
  'https://tence-mol3yp23-swedencentral.cognitiveservices.azure.com';
const DEFAULT_DEPLOYMENT = 'gpt-image-2';
const API_VERSION = '2024-02-01';

/**
 * Azure-hosted gpt-image-2.  Secondary vendor for both立绘 (when Seedream errors
 * 429/5xx) and sprite-sheets (when Gemini drops responseModalities=IMAGE).
 *
 * Auth = header `api-key` (NOT `Authorization: Bearer` despite the OpenAI
 * shape — Azure stamps its own scheme).  Sizes restricted to
 * 1024x1024 / 1024x1536 / 1536x1024; we map our 1k/2k/4k label set onto the
 * closest legal cell, falling back to portrait 1024x1536 when 4K is requested
 * because Azure doesn't go higher than 1536 on either axis.
 */
export class AzureGptImageClient implements ImageGenClient {
  readonly vendor = 'azure-gpt-image';
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly deployment: string;

  constructor(env: Record<string, string | undefined>) {
    this.apiKey = env.AZURE_GPT_IMAGE_KEY;
    this.endpoint = env.AZURE_GPT_IMAGE_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.deployment = env.AZURE_GPT_IMAGE_DEPLOYMENT ?? DEFAULT_DEPLOYMENT;
  }

  isReady(): boolean { return Boolean(this.apiKey); }

  async generate(opts: ImageGenOpts): Promise<ImageGenResult> {
    if (!this.apiKey) throw new ImageVendorError(this.vendor, 401, 'missing AZURE_GPT_IMAGE_KEY');
    const { w, h } = sizeToWxH(opts.size);
    const cappedW = Math.min(w, 1536);
    const cappedH = Math.min(h, 1536);
    const url = `${this.endpoint}/openai/deployments/${this.deployment}/images/generations?api-version=${API_VERSION}`;

    return withRetry(async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': this.apiKey!, 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: opts.prompt,
          size: `${cappedW}x${cappedH}`,
          n: 1,
          response_format: 'b64_json',
        }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new ImageVendorError(this.vendor, r.status, `${r.status} ${r.statusText} :: ${txt.slice(0, 240)}`);
      }
      const j = (await r.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) throw new ImageVendorError(this.vendor, 502, 'no b64_json in response');
      return {
        pngBytes: decodeBase64Png(b64),
        mime: 'image/png',
        vendor: this.vendor,
        modelId: this.deployment,
        estimateUSD: 0.05,
      };
    }, { label: 'azure-gpt-image' });
  }
}
