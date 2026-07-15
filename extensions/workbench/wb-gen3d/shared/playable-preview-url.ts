// Preview URL for playable delivery GLBs (PLAN §5.8 PREV1).
//
// Delivery trio lives at `assets/characters/<stem>-merged.glb`, OUTSIDE the
// server's `/api/game-assets/:slug/3d/**` mount (that route only serves gen3d
// source assets under assets/3d/). The Play/Edit engine vite already exposes
// the game tree at `/preview/.forgeax/games/<slug>/…` (proxied by Studio UI),
// so ModelViewer must use that path — not /api/game-assets/…/characters/….

export function playableDeliveryLocalUrl(slug: string, modelPath: string): string {
  const cleaned = modelPath.replace(/^\/+/, '');
  const parts = cleaned.split('/').filter(Boolean).map(encodeURIComponent);
  return `/preview/.forgeax/games/${encodeURIComponent(slug)}/${parts.join('/')}`;
}
