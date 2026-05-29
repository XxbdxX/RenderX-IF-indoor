import { ApiProvider, ApiProviderConfig } from '../types';

export const API_CONFIG_STORAGE_KEY = 'renderx_api_config';
export const API_CONFIGS_STORAGE_KEY = 'renderx_api_configs';
export const LEGACY_GEMINI_API_KEY_STORAGE_KEY = 'renderx_gemini_api_key';
export const YORO_DEFAULT_BASE_URL = 'https://api.yoro.ren';
export const IMAGE_2_DEFAULT_MODEL = 'gpt-image-2';

export type ApiProviderConfigMap = Partial<Record<ApiProvider, ApiProviderConfig>>;

export interface ApiConfigStore {
  activeProvider: ApiProvider;
  configs: ApiProviderConfigMap;
}

export const NANO_BANANA_PROVIDERS = [
  ApiProvider.AI_STUDIO,
  ApiProvider.YORO_GEMINI,
  ApiProvider.VERTEX_AI,
];

export const getProviderLabel = (provider: ApiProvider): string => {
  if (provider === ApiProvider.VERTEX_AI) return 'Vertex AI';
  if (provider === ApiProvider.YORO_GEMINI) return 'Yoro Gemini';
  if (provider === ApiProvider.IMAGE_2) return 'Image-2';
  return 'AI Studio';
};

export const createEmptyApiConfig = (provider: ApiProvider = ApiProvider.AI_STUDIO): ApiProviderConfig => ({
  provider,
  apiKey: '',
  vertexProject: '',
  vertexLocation: '',
  baseUrl: provider === ApiProvider.YORO_GEMINI ? YORO_DEFAULT_BASE_URL : '',
  imageModel: provider === ApiProvider.IMAGE_2 ? IMAGE_2_DEFAULT_MODEL : '',
});

export const normalizeApiConfig = (value?: Partial<ApiProviderConfig> | null): ApiProviderConfig => {
  const provider =
    value?.provider === ApiProvider.VERTEX_AI
      ? ApiProvider.VERTEX_AI
      : value?.provider === ApiProvider.YORO_GEMINI
        ? ApiProvider.YORO_GEMINI
        : value?.provider === ApiProvider.IMAGE_2
          ? ApiProvider.IMAGE_2
          : ApiProvider.AI_STUDIO;

  const imageModel = typeof value?.imageModel === 'string' ? value.imageModel.trim() : '';

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
        : provider === ApiProvider.IMAGE_2
          ? (typeof value?.baseUrl === 'string' ? value.baseUrl.trim() : '')
        : '',
    imageModel:
      provider === ApiProvider.IMAGE_2
        ? (imageModel && imageModel !== 'image-2'
            ? imageModel
            : IMAGE_2_DEFAULT_MODEL)
        : '',
  };
};

export const hasConfiguredApi = (config: ApiProviderConfig): boolean => {
  return config.provider === ApiProvider.YORO_GEMINI || config.provider === ApiProvider.IMAGE_2
    ? Boolean(config.apiKey.trim() && config.baseUrl?.trim())
    : Boolean(config.apiKey.trim());
};

export const getConfiguredProviderConfig = (
  configs: ApiProviderConfigMap,
  provider: ApiProvider,
): ApiProviderConfig => {
  return normalizeApiConfig(configs[provider] || createEmptyApiConfig(provider));
};

export const normalizeApiConfigStore = (value?: Partial<ApiConfigStore> | null): ApiConfigStore => {
  const configs: ApiProviderConfigMap = {};
  Object.values(ApiProvider).forEach((provider) => {
    const normalized = normalizeApiConfig(value?.configs?.[provider] || createEmptyApiConfig(provider));
    configs[provider] = normalized;
  });

  const activeProvider = value?.activeProvider && Object.values(ApiProvider).includes(value.activeProvider)
    ? value.activeProvider
    : ApiProvider.AI_STUDIO;

  return {
    activeProvider,
    configs,
  };
};

export const getFirstConfiguredNanoBananaProvider = (
  configs: ApiProviderConfigMap,
  preferredProvider?: ApiProvider,
): ApiProvider | null => {
  const orderedProviders = [
    ...(preferredProvider && preferredProvider !== ApiProvider.IMAGE_2 ? [preferredProvider] : []),
    ...NANO_BANANA_PROVIDERS,
  ].filter((provider, index, array) => array.indexOf(provider) === index);

  return orderedProviders.find((provider) => hasConfiguredApi(getConfiguredProviderConfig(configs, provider))) || null;
};

export const loadStoredApiConfigStore = (): ApiConfigStore => {
  const storedConfigStore = localStorage.getItem(API_CONFIGS_STORAGE_KEY);
  if (storedConfigStore) {
    try {
      return normalizeApiConfigStore(JSON.parse(storedConfigStore) as Partial<ApiConfigStore>);
    } catch {
      localStorage.removeItem(API_CONFIGS_STORAGE_KEY);
    }
  }

  const legacyConfig = loadStoredApiConfig();
  return normalizeApiConfigStore({
    activeProvider: legacyConfig.provider,
    configs: {
      [legacyConfig.provider]: legacyConfig,
    },
  });
};

export const saveApiConfigStore = (store: ApiConfigStore): ApiConfigStore => {
  const normalized = normalizeApiConfigStore(store);
  localStorage.setItem(API_CONFIGS_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(getConfiguredProviderConfig(normalized.configs, normalized.activeProvider)));
  localStorage.removeItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY);
  return normalized;
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
  localStorage.removeItem(API_CONFIGS_STORAGE_KEY);
  localStorage.removeItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY);
};

export const getMissingApiConfigMessage = (provider: ApiProvider): string => {
  if (provider === ApiProvider.YORO_GEMINI) {
    return '请先配置 Yoro Gemini Base URL 和 API Key。';
  }
  if (provider === ApiProvider.IMAGE_2) {
    return '请先配置 Image-2 Base URL 和 API Key。';
  }

  return `请先配置 ${getProviderLabel(provider)} API Key。`;
};
