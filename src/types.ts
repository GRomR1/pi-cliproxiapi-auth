/**
 * CLIProxyAPI thinking/reasoning configuration from models.json.
 */
export interface CliproxyThinking {
  min?: number;
  max?: number;
  zero_allowed?: boolean;
  dynamic_allowed?: boolean;
  levels?: string[];
}

/**
 * Raw model entry from CLIProxyAPI models.json.
 */
export interface CliproxyRegistryModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  type?: string;
  display_name?: string;
  name?: string;
  description?: string;
  context_length?: number;
  max_completion_tokens?: number;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  thinking?: CliproxyThinking;
  supportedInputModalities?: string[];
  input_modalities?: string[];
  [key: string]: unknown;
}

/** CLIProxyAPI models.json root structure (provider buckets). */
export type CliproxyModelsJson = Record<string, CliproxyRegistryModel[]>;

/**
 * OpenAI-compatible /v1/models response.
 */
export interface CliproxyModelsResponse {
  object?: string;
  data?: Array<{
    id?: string;
    slug?: string;
    object?: string;
    created?: number;
    owned_by?: string;
    [key: string]: unknown;
  }>;
  models?: Array<{
    id?: string;
    slug?: string;
    display_name?: string;
    name?: string;
    context_window?: number;
    max_context_window?: number;
    input_modalities?: string[];
    supported_reasoning_levels?: Array<{ effort?: string; description?: string } | string>;
    [key: string]: unknown;
  }>;
}

/**
 * Internal normalized model used by the extension. We keep enough metadata
 * around to feed the OMP `Model` shape and to preserve registry metadata for
 * downstream consumers via the runtime API.
 */
export interface CliproxyModel {
  id: string;
  name: string;
  description?: string;
  ownedBy?: string;
  type?: string;

  contextWindow?: number;
  maxTokens?: number;

  supportsStreaming?: boolean;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsTemperature?: boolean;
  supportsReasoning?: boolean;
  supportsAttachment?: boolean;

  thinking?: CliproxyThinking;

  pricing?: {
    input?: number;
    output?: number;
  };
}

export type CliproxyThinkingFormat =
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'together'
  | 'zai'
  | 'qwen'
  | 'chat-template'
  | 'qwen-chat-template'
  | 'string-thinking'
  | 'ant-ling';

export interface CliproxyCompatConfig {
  reasoning?: boolean;
  thinkingFormat?: CliproxyThinkingFormat;
  supportsReasoningEffort?: boolean;
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  contextWindow?: number;
  maxTokens?: number;
  vision?: boolean;
}

export interface CliproxyModelsDevConfig {
  enabled?: boolean;
  url?: string;
  cacheTtl?: number;
  timeoutMs?: number;
  providerAliases?: Record<string, string>;
}
/**
 * Internal configuration consumed by the model fetcher.
 */
export interface CliproxyConfig {
  baseUrl: string;
  apiKey: string;
  defaultModels?: CliproxyModel[];
  modelCacheTtl?: number;
  modelsDev?: CliproxyModelsDevConfig;
  /** Local path or URL to CLIProxyAPI models.json for metadata enrichment. */
  modelsJsonPath?: string;
  /** Default or model-specific compat overrides (e.g. for custom providers in CLIProxyAPI). */
  compat?: CliproxyCompatConfig;
  modelCompat?: Record<string, CliproxyCompatConfig>;
}

/**
 * Effective settings the extension keeps in `~/.pi/agent/cliproxy.json`.
 */
export interface CliproxyExtensionSettings {
  baseURL: string;
  apiKey: string;
  modelsJsonPath?: string;
  modelsDev?: CliproxyModelsDevConfig;
  compat?: CliproxyCompatConfig;
  modelCompat?: Record<string, CliproxyCompatConfig>;
}
