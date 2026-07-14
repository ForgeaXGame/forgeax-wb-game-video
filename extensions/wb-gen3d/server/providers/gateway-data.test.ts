// gateway-data smoke — the LiteLLM 3D gateway tags the rendered thumbnail AND
// every PBR texture map alike as type:'preview'. These fixtures mirror a real
// captured Meshy task response; the regression they lock is a black preview
// caused by the last type:'preview' entry (texture_0_emission.png) clobbering
// the real render (preview.png).

import { test, expect } from 'bun:test';
import { extractGatewayUrls } from './gateway-data';

const OUT = 'https://assets.meshy.ai/acct/tasks/019f2163/output';

// A textured Meshy result: 5 meshes + an .mtl + preview.png + 5 texture maps,
// ALL non-mesh PNGs tagged type:'preview' (exactly as the gateway returns them).
const TEXTURED = {
  status: 'succeeded',
  data: [
    { url: `${OUT}/model.glb`, type: 'mesh', format: 'glb' },
    { url: `${OUT}/model.fbx`, type: 'mesh', format: 'fbx' },
    { url: `${OUT}/model.usdz`, type: 'mesh', format: 'usdz' },
    { url: `${OUT}/model.obj`, type: 'mesh', format: 'obj' },
    { url: `${OUT}/model.mtl`, type: null, format: 'mtl' },
    { url: `${OUT}/model.stl`, type: 'mesh', format: 'stl' },
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
  expect(urls.fbx).toBe(`${OUT}/model.fbx`);
  expect(urls.obj).toBe(`${OUT}/model.obj`);
  expect(urls.usdz).toBe(`${OUT}/model.usdz`);
  expect(urls.stl).toBe(`${OUT}/model.stl`);
  expect(urls.mtl).toBeUndefined();
});

test('texture maps route to __texture_<kind>; texture_0 is base_color', () => {
  const urls = extractGatewayUrls(TEXTURED);
  expect(urls.__texture_base_color).toBe(`${OUT}/texture_0.png`);
  expect(urls.__texture_metallic).toBe(`${OUT}/texture_0_metallic.png`);
  expect(urls.__texture_roughness).toBe(`${OUT}/texture_0_roughness.png`);
  expect(urls.__texture_normal).toBe(`${OUT}/texture_0_normal.png`);
  expect(urls.__texture_emission).toBe(`${OUT}/texture_0_emission.png`);
});

test('untextured preview stage (only preview.png) still yields the thumbnail', () => {
  const urls = extractGatewayUrls({
    status: 'succeeded',
    data: [
      { url: `${OUT}/model.glb`, type: 'mesh', format: 'glb' },
      { url: `${OUT}/preview.png`, type: 'preview', format: 'png' },
    ],
  });
  expect(urls.__thumbnail).toBe(`${OUT}/preview.png`);
  expect(urls.glb).toBe(`${OUT}/model.glb`);
});

test('fallback: a differently-named render is taken as the thumbnail', () => {
  const urls = extractGatewayUrls({
    data: [
      { url: `${OUT}/model.mtl`, type: null, format: 'mtl' },
      { url: `${OUT}/render.jpg`, type: 'preview', format: 'jpg' },
    ],
  });
  // .mtl is non-image and must not win; render.jpg is the first image.
  expect(urls.__thumbnail).toBe(`${OUT}/render.jpg`);
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
  expect(extractGatewayUrls({ data: 'nope' })).toEqual({});
});
