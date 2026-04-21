import { ApiProvider, ApiProviderConfig } from '../types';

export const API_CONFIG_STORAGE_KEY = 'renderx_api_config';
export const LEGACY_GEMINI_API_KEY_STORAGE_KEY = 'renderx_gemini_api_key';
export const YORO_DEFAULT_BASE_URL = 'https://api.yoro.ren';

export const getProviderLabel = (provider: ApiProvider): string => {
  if (provider === ApiProvider.VERTEX_AI) return 'Vertex AI';
  if (provider === ApiProvider.YORO_GEMINI) return 'Yoro Gemini';
  return 'AI Studio';
};

export const createEmptyApiConfig = (provider: ApiProvider = ApiProvider.AI_STUDIO): ApiProviderConfig => ({
  provider,
  apiKey: '',
  vertexProject: '',
  vertexLocation: '',
  baseUrl: provider === ApiProvider.YORO_GEMINI ? YORO_DEFAULT_BASE_URL : '',
});

export const normalizeApiConfig = (value?: Partial<ApiProviderConfig> | null): ApiProviderConfig => {
  const provider =
    value?.provider === ApiProvider.VERTEX_AI
      ? ApiProvider.VERTEX_AI
      : value?.provider === ApiProvider.YORO_GEMINI
        ? ApiProvider.YORO_GEMINI
        : ApiProvider.AI_STUDIO;

  return {
    provider,
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey.trim() : '',
    vertexProject: typeof value?.vertexProject === 'string' ? value.vertexProject.trim() : '',
    vertexLocation:
      provider === ApiProvider.VERTEX_AI
        ? (typeof value?.vertexLocation === 'string' ? value.vertexLocation.trim() : '')
        : '',
    baseUrl:
      provider === ApiProvider.YORO_GEMINI
        ? (typeof value?.baseUrl === 'string' ? value.baseUrl.trim() : YORO_DEFAULT_BASE_URL)
        : '',
  };
};

export const hasConfiguredApi = (config: ApiProviderConfig): boolean => {
  return config.provider === ApiProvider.YORO_GEMINI
    ? Boolean(config.apiKey.trim() && config.baseUrl?.trim())
    : Boolean(config.apiKey.trim());
};

export const loadStoredApiConfig = (): ApiProviderConfig => {
  const storedConfig = localStorage.getItem(API_CONFIG_STORAGE_KEY);
  const legacyApiKey = localStorage.getItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY);

  if (storedConfig) {
    try {
      const normalizedStoredConfig = normalizeApiConfig(JSON.parse(storedConfig) as Partial<ApiProviderConfig>);
      if (hasConfiguredApi(normalizedStoredConfig) || !legacyApiKey?.trim()) {
        return normalizedStoredConfig;
      }
    } catch {
      localStorage.removeItem(API_CONFIG_STORAGE_KEY);
    }
  }

  if (legacyApiKey && legacyApiKey.trim()) {
    const migratedConfig = normalizeApiConfig({
      provider: ApiProvider.AI_STUDIO,
      apiKey: legacyApiKey,
    });
    saveApiConfig(migratedConfig);
    return migratedConfig;
  }

  return createEmptyApiConfig();
};

export const saveApiConfig = (config: ApiProviderConfig): ApiProviderConfig => {
  const normalized = normalizeApiConfig(config);
  localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.removeItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY);
  return normalized;
};

export const clearStoredApiConfig = (): void => {
  localStorage.removeItem(API_CONFIG_STORAGE_KEY);
  localStorage.removeItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY);
};

export const getMissingApiConfigMessage = (provider: ApiProvider): string => {
  if (provider === ApiProvider.YORO_GEMINI) {
    return '请先配置 Yoro Gemini Base URL 和 API Key。';
  }

  return `请先配置 ${getProviderLabel(provider)} API Key。`;
};
