import { beforeEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../types';
import { API_CONFIG_STORAGE_KEY, LEGACY_GEMINI_API_KEY_STORAGE_KEY, createEmptyApiConfig, loadStoredApiConfig, normalizeApiConfig } from './apiConfig';

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
    });

    expect(createEmptyApiConfig(ApiProvider.VERTEX_AI)).toEqual({
      provider: ApiProvider.VERTEX_AI,
      apiKey: '',
      vertexProject: '',
      vertexLocation: '',
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
    });
  });
});
