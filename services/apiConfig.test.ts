import { beforeEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../types';
import {
  API_CONFIG_STORAGE_KEY,
  API_CONFIGS_STORAGE_KEY,
  IMAGE_2_DEFAULT_MODEL,
  LEGACY_GEMINI_API_KEY_STORAGE_KEY,
  YORO_DEFAULT_BASE_URL,
  createEmptyApiConfig,
  getConfiguredProviderConfig,
  loadStoredApiConfig,
  loadStoredApiConfigStore,
  normalizeApiConfig,
  saveApiConfigStore,
} from './apiConfig';

describe('apiConfig storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not force a default location when vertex config fields are blank', () => {
    expect(normalizeApiConfig({ provider: ApiProvider.VERTEX_AI, apiKey: 'vertex-key' })).toEqual({
      provider: ApiProvider.VERTEX_AI,
      apiKey: 'vertex-key',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: '',
      imageModel: '',
    });

    expect(createEmptyApiConfig(ApiProvider.VERTEX_AI)).toEqual({
      provider: ApiProvider.VERTEX_AI,
      apiKey: '',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: '',
      imageModel: '',
    });
  });

  it('preserves the Yoro base URL and defaults it when omitted', () => {
    expect(normalizeApiConfig({ provider: ApiProvider.YORO_GEMINI, apiKey: 'yoro-key' })).toEqual({
      provider: ApiProvider.YORO_GEMINI,
      apiKey: 'yoro-key',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: YORO_DEFAULT_BASE_URL,
      imageModel: '',
    });

    expect(createEmptyApiConfig(ApiProvider.YORO_GEMINI)).toEqual({
      provider: ApiProvider.YORO_GEMINI,
      apiKey: '',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: YORO_DEFAULT_BASE_URL,
      imageModel: '',
    });
  });

  it('preserves Image-2 base URL and defaults its model', () => {
    expect(normalizeApiConfig({
      provider: ApiProvider.IMAGE_2,
      apiKey: 'image-key',
      baseUrl: 'https://relay.example.com/v1/',
    })).toEqual({
      provider: ApiProvider.IMAGE_2,
      apiKey: 'image-key',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: 'https://relay.example.com/v1/',
      imageModel: IMAGE_2_DEFAULT_MODEL,
    });

    expect(createEmptyApiConfig(ApiProvider.IMAGE_2)).toEqual({
      provider: ApiProvider.IMAGE_2,
      apiKey: '',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: '',
      imageModel: IMAGE_2_DEFAULT_MODEL,
    });
  });

  it('migrates the old Image-2 model alias to gpt-image-2', () => {
    expect(normalizeApiConfig({
      provider: ApiProvider.IMAGE_2,
      apiKey: 'image-key',
      baseUrl: 'https://relay.example.com/v1',
      imageModel: 'image-2',
    })).toEqual({
      provider: ApiProvider.IMAGE_2,
      apiKey: 'image-key',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: 'https://relay.example.com/v1',
      imageModel: IMAGE_2_DEFAULT_MODEL,
    });
  });

  it('migrates the legacy Gemini key when the new config is empty', () => {
    localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify({ provider: ApiProvider.AI_STUDIO, apiKey: '' }));
    localStorage.setItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY, 'legacy-key');

    expect(loadStoredApiConfig()).toEqual({
      provider: ApiProvider.AI_STUDIO,
      apiKey: 'legacy-key',
      vertexProject: '',
      vertexLocation: '',
      baseUrl: '',
      imageModel: '',
    });
  });

  it('stores multiple provider configs and preserves the active provider', () => {
    const saved = saveApiConfigStore({
      activeProvider: ApiProvider.IMAGE_2,
      configs: {
        [ApiProvider.AI_STUDIO]: {
          provider: ApiProvider.AI_STUDIO,
          apiKey: 'banana-key',
          vertexProject: '',
          vertexLocation: '',
          baseUrl: '',
          imageModel: '',
        },
        [ApiProvider.IMAGE_2]: {
          provider: ApiProvider.IMAGE_2,
          apiKey: 'image-key',
          vertexProject: '',
          vertexLocation: '',
          baseUrl: 'https://relay.example.com/v1',
          imageModel: 'gpt-image-2',
        },
      },
    });

    expect(saved.activeProvider).toBe(ApiProvider.IMAGE_2);
    expect(JSON.parse(localStorage.getItem(API_CONFIGS_STORAGE_KEY) || '{}')).toMatchObject({
      activeProvider: ApiProvider.IMAGE_2,
      configs: {
        [ApiProvider.AI_STUDIO]: { apiKey: 'banana-key' },
        [ApiProvider.IMAGE_2]: { apiKey: 'image-key' },
      },
    });

    const loaded = loadStoredApiConfigStore();
    expect(getConfiguredProviderConfig(loaded.configs, ApiProvider.AI_STUDIO).apiKey).toBe('banana-key');
    expect(getConfiguredProviderConfig(loaded.configs, ApiProvider.IMAGE_2).baseUrl).toBe('https://relay.example.com/v1');
  });
});
