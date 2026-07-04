import { expect, test } from 'bun:test';
import { pickLitellmFromEnv } from './env';

test('pickLitellmFromEnv: FORGEAX_3D_GATEWAY_KEY takes top priority', () => {
  const got = pickLitellmFromEnv({
    FORGEAX_3D_GATEWAY_KEY: 'gen3d-key',
    FORGEAX_3D_GATEWAY_BASE_URL: 'https://3d-gateway.example.com/v1/',
    ANTHROPIC_API_KEY: 'anthropic-key',
    LITELLM_PROXY_KEY: 'proxy-key',
  });
  expect(got).toEqual({
    apiKey: 'gen3d-key',
    baseUrl: 'https://3d-gateway.example.com',
  });
});

test('pickLitellmFromEnv: ANTHROPIC_API_KEY beats LITELLM_PROXY_KEY (3D ≠ chat proxy)', () => {
  // Studio .env typically has LITELLM_PROXY_KEY=Moonshot (chat) AND
  // ANTHROPIC_API_KEY=forgeax-proxy. 3D must use the forgeax proxy, not Moonshot.
  const got = pickLitellmFromEnv({
    LITELLM_PROXY_KEY: 'moonshot-chat-key',
    LITELLM_PROXY_BASE_URL: 'https://api.moonshot.cn/v1',
    ANTHROPIC_API_KEY: 'forgeax-proxy-key',
    ANTHROPIC_BASE_URL: 'https://llm-proxy.forgeax.com',
  });
  expect(got).toEqual({
    apiKey: 'forgeax-proxy-key',
    baseUrl: 'https://llm-proxy.forgeax.com',
  });
});

test('pickLitellmFromEnv: LITELLM_PROXY_BASE_URL is NOT consulted for 3D base URL', () => {
  // Even when LITELLM_PROXY_KEY is the only key, base URL must not come from
  // LITELLM_PROXY_BASE_URL (chat proxy) — fall back to default 3D gateway.
  const got = pickLitellmFromEnv({
    LITELLM_PROXY_KEY: 'k',
    LITELLM_PROXY_BASE_URL: 'https://api.moonshot.cn/v1',
  });
  expect(got).toEqual({
    apiKey: 'k',
    baseUrl: 'https://llm-proxy.forgeax.com',
  });
});

test('pickLitellmFromEnv: falls back to LITELLM_PROXY_KEY when no ANTHROPIC/3D key', () => {
  const got = pickLitellmFromEnv({
    LITELLM_PROXY_KEY: 'proxy-key',
  });
  expect(got).toEqual({
    apiKey: 'proxy-key',
    baseUrl: 'https://llm-proxy.forgeax.com',
  });
});

test('pickLitellmFromEnv: defaults base URL when only key is set', () => {
  expect(pickLitellmFromEnv({ FORGEAX_3D_GATEWAY_KEY: 'k' })?.baseUrl).toBe('https://llm-proxy.forgeax.com');
  expect(pickLitellmFromEnv({ ANTHROPIC_API_KEY: 'k' })?.baseUrl).toBe('https://llm-proxy.forgeax.com');
  expect(pickLitellmFromEnv({ LITELLM_PROXY_KEY: 'k' })?.baseUrl).toBe('https://llm-proxy.forgeax.com');
});

test('pickLitellmFromEnv: returns null when no gateway key is configured', () => {
  expect(pickLitellmFromEnv({})).toBeNull();
  expect(pickLitellmFromEnv({ LITELLM_PROXY_BASE_URL: 'https://proxy.example.com' })).toBeNull();
  expect(pickLitellmFromEnv({ ANTHROPIC_BASE_URL: 'https://proxy.example.com' })).toBeNull();
  expect(pickLitellmFromEnv({ FORGEAX_3D_GATEWAY_BASE_URL: 'https://3d.example.com' })).toBeNull();
});
