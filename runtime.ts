export type {
  CliproxyConfig,
  CliproxyExtensionSettings,
  CliproxyModel,
  CliproxyModelsDevConfig,
  CliproxyThinking,
} from './src/types.js';

export type { CliproxyModelVariant, OmpModel } from './src/normalizer.js';

export { fetchModels, clearModelCache, refreshModels, getCachedModels, isCacheValid } from './src/model-fetcher.js';

export {
  CLIPROXY_PROVIDER_ID,
  CLIPROXY_PROVIDER_NAME,
  CLIPROXY_DEFAULT_MODELS,
  CLIPROXY_ENDPOINTS,
  MODEL_CACHE_TTL,
  REQUEST_TIMEOUT,
  DEFAULT_MODELS_JSON_URL,
} from './src/constants.js';

export { clearModelsDevCache, normalizeModelKey, resolveProviderAlias } from './src/models-dev.js';

export { loadModelsJson, parseModelsJson, clearModelsJsonCache } from './src/models-json.js';

export {
  normalizeApiModel,
  normalizeRegistryModel,
  mergeModelMetadata,
  thinkingToVariants,
  getModelFamily,
  toOmpModel,
} from './src/normalizer.js';

export { readSettings, writeSettings, deleteSettings, getSettingsPath } from './src/config-store.js';

export { resolveSettings } from './src/extension.js';
