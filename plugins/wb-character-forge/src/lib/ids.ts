const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const CHAR_ID_RE = /^[a-z0-9][a-z0-9_]{1,40}$/;

export function assertSlug(slug: unknown): string {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new ForgeError('invalid-slug', `slug must match ${SLUG_RE}, got ${String(slug)}`);
  }
  return slug;
}

export function assertCharId(charId: unknown): string {
  if (typeof charId !== 'string' || !CHAR_ID_RE.test(charId)) {
    throw new ForgeError('invalid-char-id', `charId must match ${CHAR_ID_RE}, got ${String(charId)}`);
  }
  return charId;
}

export function deriveCharId(prompt: string, salt = Date.now()): string {
  const head = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'char';
  const suffix = salt.toString(36).slice(-4);
  return `${head}_${suffix}`.slice(0, 42);
}

export function deriveName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 14) return trimmed || 'Unnamed';
  return trimmed.slice(0, 14) + '…';
}

export class ForgeError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'ForgeError';
  }
}
