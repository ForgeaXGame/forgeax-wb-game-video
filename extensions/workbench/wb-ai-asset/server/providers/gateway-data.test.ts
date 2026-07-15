// gateway-data smoke — the LiteLLM 3D gateway tags the rendered thumbnail AND
// every PBR texture map alike as type:'preview'. These fixtures mirror a real
// captured Meshy task response; the regression they lock is a black preview
// caused by the last type:'preview' entry (texture_0_emission.png) clobbering
// the real render (preview.png).

import { test, expect } from 'bun:test';
import { extractGatewayUrls } from './gateway-data';

const OUT = 'https://assets.meshy.ai/acct/tasks/019f2163/output';

// A textured Meshy result: mesh + preview.png + PBR maps, ALL non-mesh PNGs
// tagged type:'preview' (exactly as the gateway returns them).
const TEXTURED = {
  status: 'succeeded',
  data: [
    { url: `${OUT}/model.glb`, type: 'mesh', format: 'glb' },
    { url: `${OUT}/model.mtl`, type: null, format: 'mtl' },
    { url: `${OUT}/preview.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0_metallic.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0_roughness.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0_normal.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0_emission.png`, type: 'preview', format: 'png' },
  ],
};

test('thumbnail is preview.png, NOT the last type:preview (emission) entry', () => {
  const urls = extractGatewayUrls(TEXTURED);
  expect(urls.__thumbnail).toBe(`${OUT}/preview.png`);
  expect(urls.__thumbnail).not.toContain('emission');
  expect(urls.__thumbnail).not.toContain('texture_');
});

test('meshes are keyed by format; the .mtl (non-image, no mesh type) is dropped', () => {
  const urls = extractGatewayUrls(TEXTURED);
  expect(urls.glb).toBe(`${OUT}/model.glb`);
  expect(urls.mtl).toBeUndefined();
});

test('texture maps route to __texture_<kind> matching TEXTURE_KINDS', () => {
  const urls = extractGatewayUrls(TEXTURED);
  expect(urls.__texture_base_color).toBe(`${OUT}/texture_0.png`);
  expect(urls.__texture_metallic).toBe(`${OUT}/texture_0_metallic.png`);
  expect(urls.__texture_roughness).toBe(`${OUT}/texture_0_roughness.png`);
  expect(urls.__texture_normal).toBe(`${OUT}/texture_0_normal.png`);
  expect(urls.__texture_emission).toBe(`${OUT}/texture_0_emission.png`);
});

test('clean gateway shape (type:texture + texture_kind) still routes correctly', () => {
  const urls = extractGatewayUrls({
    data: [
      { url: `${OUT}/m.glb`, type: 'mesh', format: 'glb' },
      { url: `${OUT}/m.png`, type: 'preview', format: 'png' },
      { url: `${OUT}/tex-base.png`, type: 'texture', format: 'png', texture_kind: 'base_color' },
      { url: `${OUT}/tex-metal.png`, type: 'texture', format: 'png', texture_kind: 'metallic' },
    ],
  });
  // m.png is the render via the image fallback; textures keep their kinds.
  expect(urls.__thumbnail).toBe(`${OUT}/m.png`);
  expect(urls.__texture_base_color).toBe(`${OUT}/tex-base.png`);
  expect(urls.__texture_metallic).toBe(`${OUT}/tex-metal.png`);
});

test('a lone texture map is never mistaken for the thumbnail', () => {
  const urls = extractGatewayUrls({
    data: [{ url: `${OUT}/texture_0_emission.png`, type: 'preview', format: 'png' }],
  });
  expect(urls.__thumbnail).toBeUndefined();
  expect(urls.__texture_emission).toBe(`${OUT}/texture_0_emission.png`);
});

test('signed query strings do not confuse filename classification', () => {
  const urls = extractGatewayUrls({
    data: [
      { url: `${OUT}/preview.png?Expires=123&Signature=abc`, type: 'preview', format: 'png' },
      { url: `${OUT}/texture_0.png?Expires=123&Signature=xyz`, type: 'preview', format: 'png' },
    ],
  });
  expect(urls.__thumbnail).toBe(`${OUT}/preview.png?Expires=123&Signature=abc`);
  expect(urls.__texture_base_color).toBe(`${OUT}/texture_0.png?Expires=123&Signature=xyz`);
});

test('non-array / missing data yields an empty map', () => {
  expect(extractGatewayUrls({})).toEqual({});
  expect(extractGatewayUrls({ data: null })).toEqual({});
});
