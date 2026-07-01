import { expect, test } from 'bun:test';
import { pickLitellmFromEnv } from './env';

test('pickLitellmFromEnv: LITELLM_PROXY_KEY takes priority over ANTHROPIC', () => {
  const got = pickLitellmFromEnv({
    LITELLM_PROXY_KEY: 'proxy-key',
    LITELLM_PROXY_BASE_URL: 'https://llm-proxy.example.com/v1/',
    ANTHROPIC_API_KEY: 'anthropic-key',
  });
  expect(got?.apiKey).toBe('proxy-key');
  expect(got?.baseUrl).toBe('https://llm-proxy.example.com');
});

test('pickLitellmFromEnv: falls back to ANTHROPIC_API_KEY', () => {
  const got = pickLitellmFromEnv({
    ANTHROPIC_API_KEY: 'sk-anthropic-key',
    ANTHROPIC_BASE_URL: 'https://llm-proxy.forgeax.com',
  });
  expect(got).toEqual({
    apiKey: 'sk-anthropic-key',
    baseUrl: 'https://llm-proxy.forgeax.com',
  });
});

test('pickLitellmFromEnv: returns null when unset', () => {
  expect(pickLitellmFromEnv({})).toBeNull();
});
