import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../types';
import {
  createEmptyApiConfig,
  getConfiguredProviderConfig,
  getFirstConfiguredNanoBananaProvider,
  hasConfiguredApi,
  loadStoredApiConfigStore,
  normalizeApiConfig,
  saveApiConfigStore,
  YORO_DEFAULT_BASE_URL,
} from './apiConfig';

describe('api config helpers', () => {
  it('defaults to AI Studio and preserves Yoro base URL', () => {
    expect(createEmptyApiConfig()).toEqual({ provider: ApiProvider.AI_STUDIO, apiKey: '', baseUrl: '' });
    expect(createEmptyApiConfig(ApiProvider.YORO_GEMINI)).toEqual({
      provider: ApiProvider.YORO_GEMINI,
      apiKey: '',
      baseUrl: YORO_DEFAULT_BASE_URL,
    });
  });

  it('requires base URL for Yoro but only API key for AI Studio', () => {
    expect(hasConfiguredApi(normalizeApiConfig({ provider: ApiProvider.AI_STUDIO, apiKey: 'key' }))).toBe(true);
    expect(hasConfiguredApi(normalizeApiConfig({ provider: ApiProvider.YORO_GEMINI, apiKey: 'key', baseUrl: '' }))).toBe(false);
    expect(hasConfiguredApi(normalizeApiConfig({ provider: ApiProvider.YORO_GEMINI, apiKey: 'key', baseUrl: 'https://relay.example.com' }))).toBe(true);
  });

  it('falls back to AI Studio when the stored active provider is unsupported', () => {
    localStorage.setItem('renderx_api_configs', JSON.stringify({
      activeProvider: 'removed-provider',
      configs: {
        'removed-provider': { provider: 'removed-provider', apiKey: 'removed-key' },
        [ApiProvider.YORO_GEMINI]: { provider: ApiProvider.YORO_GEMINI, apiKey: 'yoro-key', baseUrl: 'https://relay.example.com/v1' },
      },
    }));

    const loaded = loadStoredApiConfigStore();
    expect(loaded.activeProvider).toBe(ApiProvider.AI_STUDIO);
    expect((loaded.configs as any)['removed-provider']).toBeUndefined();
    expect(getConfiguredProviderConfig(loaded.configs, ApiProvider.YORO_GEMINI).baseUrl).toBe('https://relay.example.com/v1');
  });

  it('saves only supported provider configs', () => {
    const saved = saveApiConfigStore({
      activeProvider: ApiProvider.YORO_GEMINI,
      configs: {
        [ApiProvider.AI_STUDIO]: { provider: ApiProvider.AI_STUDIO, apiKey: 'studio-key' },
        [ApiProvider.YORO_GEMINI]: { provider: ApiProvider.YORO_GEMINI, apiKey: 'yoro-key', baseUrl: 'https://relay.example.com/v1' },
      },
    });

    expect(saved.activeProvider).toBe(ApiProvider.YORO_GEMINI);
    expect(JSON.parse(localStorage.getItem('renderx_api_config') || '{}')).toMatchObject({
      provider: ApiProvider.YORO_GEMINI,
      apiKey: 'yoro-key',
      baseUrl: 'https://relay.example.com/v1',
    });
  });

  it('finds the first configured NanoBanana provider', () => {
    expect(getFirstConfiguredNanoBananaProvider({
      [ApiProvider.AI_STUDIO]: { provider: ApiProvider.AI_STUDIO, apiKey: 'studio-key' },
    })).toBe(ApiProvider.AI_STUDIO);
  });
});
