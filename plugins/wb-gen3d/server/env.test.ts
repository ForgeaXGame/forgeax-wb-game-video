import { expect, test } from 'bun:test';
import { pickLitellmFromEnv } from './env';

test('pickLitellmFromEnv: LITELLM_PROXY_KEY takes priority over ANTHROPIC', () => {
  const got = pickLitellmFromEnv({
    LITELLM_PROXY_KEY: 'proxy-key',
    LITELLM_PROXY_BASE_URL: 'https://llm-proxy.example.com/v1/',
    ANTHROPIC_API_KEY: 'anthropic-key',
    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  });
  expect(got).toEqual({
    apiKey: 'proxy-key',
    baseUrl: 'https://llm-proxy.example.com',
  });
});

test('pickLitellmFromEnv: falls back to ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL', () => {
  const got = pickLitellmFromEnv({
    ANTHROPIC_API_KEY: 'sk-anthropic-key',
    ANTHROPIC_BASE_URL: 'https://llm-proxy.forgeax.com/v1',
  });
  expect(got).toEqual({
    apiKey: 'sk-anthropic-key',
    baseUrl: 'https://llm-proxy.forgeax.com',
  });
});

test('pickLitellmFromEnv: defaults base URL when only key is set', () => {
  expect(pickLitellmFromEnv({ LITELLM_PROXY_KEY: 'k' })?.baseUrl).toBe('https://llm-proxy.forgeax.com');
  expect(pickLitellmFromEnv({ ANTHROPIC_API_KEY: 'k' })?.baseUrl).toBe('https://llm-proxy.forgeax.com');
});

test('pickLitellmFromEnv: returns null when no gateway key is configured', () => {
  expect(pickLitellmFromEnv({})).toBeNull();
  expect(pickLitellmFromEnv({ LITELLM_PROXY_BASE_URL: 'https://proxy.example.com' })).toBeNull();
  expect(pickLitellmFromEnv({ ANTHROPIC_BASE_URL: 'https://proxy.example.com' })).toBeNull();
});
