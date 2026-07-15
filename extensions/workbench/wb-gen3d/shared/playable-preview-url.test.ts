import { expect, test } from 'bun:test';
import { playableDeliveryLocalUrl } from './playable-preview-url';

test('playableDeliveryLocalUrl uses engine /preview mount, not /api/game-assets/3d', () => {
  expect(playableDeliveryLocalUrl('hellforge', 'assets/characters/gta-01-merged.glb')).toBe(
    '/preview/.forgeax/games/hellforge/assets/characters/gta-01-merged.glb',
  );
});

test('playableDeliveryLocalUrl encodes path segments', () => {
  expect(playableDeliveryLocalUrl('my game', 'assets/characters/hero merged.glb')).toBe(
    '/preview/.forgeax/games/my%20game/assets/characters/hero%20merged.glb',
  );
});
