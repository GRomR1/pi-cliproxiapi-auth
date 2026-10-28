import type {
  CliproxyCompatConfig,
  CliproxyModel,
  CliproxyRegistryModel,
  CliproxyThinking,
  CliproxyThinkingFormat,
} from './types.js';
import { DEFAULT_CONTEXT_LIMIT, DEFAULT_OUTPUT_LIMIT } from './constants.js';

/**
 * Result of `thinkingToVariants` — kept for backwards compatibility with
 * tests and the runtime API. The OMP port no longer attaches this to models
 * (OMP uses a global `reasoning: true` flag plus per-session thinking level
 * selection) but downstream consumers can still introspect it.
 */
export interface CliproxyModelVariant {
  disabled?: boolean;
}

const REASONING_LEVELS: Record<string, true> = {
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
};

/** Map CLIProxyAPI thinking config to OMP-style reasoning levels. */
export function thinkingToVariants(
  thinking?: CliproxyThinking,
): Record<string, CliproxyModelVariant> | undefined {
  if (!thinking) return undefined;

  const levels = thinking.levels?.length
    ? thinking.levels
    : thinking.zero_allowed || thinking.dynamic_allowed || thinking.min !== undefined
      ? ['low', 'medium', 'high']
      : undefined;

  if (!levels?.length) return undefined;

  const variants: Record<string, CliproxyModelVariant> = {};
  for (const level of levels) {
    const key = level.toLowerCase();
    if (REASONING_LEVELS[key]) {
      variants[key] = {};
    }
  }

  return Object.keys(variants).length > 0 ? variants : undefined;
}

/** Normalize a /v1/models entry. */
export function normalizeApiModel(model: {
  id: string;
  owned_by?: string;
  [key: string]: unknown;
}): CliproxyModel {
  const contextWindow =
    (typeof model.context_length === 'number' && model.context_length > 0 ? model.context_length : undefined) ??
    (typeof model.context_window === 'number' && model.context_window > 0 ? model.context_window : undefined) ??
    (typeof model.inputTokenLimit === 'number' && model.inputTokenLimit > 0 ? model.inputTokenLimit : undefined);

  const maxTokens =
    (typeof model.max_completion_tokens === 'number' && model.max_completion_tokens > 0 ? model.max_completion_tokens : undefined) ??
    (typeof model.max_tokens === 'number' && model.max_tokens > 0 ? model.max_tokens : undefined) ??
    (typeof model.outputTokenLimit === 'number' && model.outputTokenLimit > 0 ? model.outputTokenLimit : undefined);

  return {
    id: model.id,
    name: typeof model.name === 'string' ? model.name : model.id,
    ownedBy: typeof model.owned_by === 'string' ? model.owned_by : undefined,
    description: `CLIProxyAPI model: ${model.id}`,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    supportsStreaming: true,
    supportsTools: true,
    supportsTemperature: true,
  };
}

/** Normalize a models.json registry entry with rich metadata. */
export function normalizeRegistryModel(model: CliproxyRegistryModel): CliproxyModel {
  const contextWindow =
    model.context_length ??
    (typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : undefined);

  const maxTokens =
    model.max_completion_tokens ??
    (typeof model.outputTokenLimit === 'number' ? model.outputTokenLimit : undefined);

  return {
    id: model.id,
    name: model.display_name || model.name || model.id,
    description: model.description,
    ownedBy: model.owned_by,
    type: model.type,
    contextWindow,
    maxTokens,
    supportsStreaming: true,
    supportsTools: true,
    supportsTemperature: true,
    supportsReasoning: Boolean(model.thinking),
    thinking: model.thinking,
  };
}

/** Merge registry metadata into API model (registry wins for known fields). */
export function mergeModelMetadata(
  apiModel: CliproxyModel,
  registry?: CliproxyModel,
): CliproxyModel {
  if (!registry) return apiModel;

  return {
    ...apiModel,
    ...registry,
    id: apiModel.id,
    name: registry.name || apiModel.name,
    description: registry.description || apiModel.description,
    supportsStreaming: registry.supportsStreaming ?? apiModel.supportsStreaming,
    supportsTools: registry.supportsTools ?? apiModel.supportsTools,
    supportsTemperature: registry.supportsTemperature ?? apiModel.supportsTemperature,
    supportsReasoning: registry.supportsReasoning ?? apiModel.supportsReasoning,
    supportsVision: registry.supportsVision ?? apiModel.supportsVision,
    supportsAttachment: registry.supportsAttachment ?? apiModel.supportsAttachment,
    contextWindow: registry.contextWindow ?? apiModel.contextWindow,
    maxTokens: registry.maxTokens ?? apiModel.maxTokens,
    thinking: registry.thinking ?? apiModel.thinking,
  };
}

/** Derive a stable model family from id (kept for runtime introspection). */
export function getModelFamily(modelId: string): string {
  const segment = modelId.includes('/') ? modelId.split('/').pop() : modelId;
  const base = segment?.trim() || modelId;
  const [family] = base.split('-');
  return family || base;
}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

const ALL_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** Build pi thinkingLevelMap from CLIProxyAPI thinking metadata. */
export function buildThinkingLevelMap(
  thinking?: CliproxyThinking,
  supportsReasoning?: boolean,
): ThinkingLevelMap | undefined {
  if (!supportsReasoning && !thinking) return undefined;

  if (thinking?.levels && thinking.levels.length > 0) {
    const supported = new Set(thinking.levels.map((l) => l.toLowerCase()));
    const map: ThinkingLevelMap = {};
    for (const level of ALL_THINKING_LEVELS) {
      if (supported.has(level)) {
        map[level] = level;
      } else {
        map[level] = null;
      }
    }
    return map;
  }

  return undefined;
}

/** Infer default thinking format based on model ID, provider, or vendor. */
export function inferThinkingFormat(
  modelId: string,
  ownedBy?: string,
): CliproxyThinkingFormat {
  const lowerOwner = ownedBy?.toLowerCase().trim() ?? '';
  const lowerId = modelId.toLowerCase();

  // Transport providers take precedence over model architecture
  if (lowerOwner === 'together') return 'together';
  if (lowerOwner === 'openrouter') return 'openrouter';
  if (lowerOwner === 'deepseek') return 'deepseek';
  if (lowerOwner === 'alibaba' || lowerOwner === 'qwen' || lowerOwner === 'bailian') return 'qwen';
  if (lowerOwner === 'zai') return 'zai';

  // Fallback: infer from model ID keywords
  if (lowerId.includes('deepseek')) return 'deepseek';
  if (lowerId.includes('qwen')) return 'qwen';
  if (lowerId.includes('glm')) return 'zai';
  return 'openai';
}

/**
 * Shape of a model that the OMP `registerProvider` API expects. We keep this
 * as a local type so the rest of the codebase can stay agnostic of OMP's
 * internal `Model` type, which makes future pi-mono upgrades less painful.
 */
export interface OmpModel {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  compat?: {
    thinkingFormat?: CliproxyThinkingFormat;
    supportsReasoningEffort?: boolean;
    maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  };
  input: ('text' | 'image')[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

/** Convert a normalized `CliproxyModel` to the OMP `Model` shape with thinking config. */
export function toOmpModel(
  model: CliproxyModel,
  options?: {
    compat?: CliproxyCompatConfig;
    modelCompat?: Record<string, CliproxyCompatConfig>;
  },
): OmpModel {
  const supportsVision = model.supportsVision === true;
  const userModelCompat = options?.modelCompat?.[model.id];
  const userDefaultCompat = options?.compat;

  const isReasonerName = /(?:^|[-_/])(r1|thinking|reasoner)(?:[-_.]|$)/i.test(model.id);
  const supportsReasoning =
    userModelCompat?.reasoning ??
    userDefaultCompat?.reasoning ??
    (model.supportsReasoning === true || isReasonerName);
  const thinkingLevelMap = buildThinkingLevelMap(model.thinking, supportsReasoning);

  let compat: OmpModel['compat'] = undefined;
  if (supportsReasoning) {
    const defaultFormat = inferThinkingFormat(model.id, model.ownedBy);
    const format = userModelCompat?.thinkingFormat ?? userDefaultCompat?.thinkingFormat ?? defaultFormat;
    const supportsReasoningEffort =
      userModelCompat?.supportsReasoningEffort ??
      userDefaultCompat?.supportsReasoningEffort ??
      (format === 'openai' || format === 'openrouter' || format === 'deepseek' || format === 'together');
    const maxTokensField = userModelCompat?.maxTokensField ?? userDefaultCompat?.maxTokensField;

    compat = {
      thinkingFormat: format,
      supportsReasoningEffort,
      ...(maxTokensField ? { maxTokensField } : {}),
    };
  }

  return {
    id: model.id,
    name: model.name || model.id,
    reasoning: supportsReasoning,
    ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
    ...(compat ? { compat } : {}),
    input: supportsVision ? ['text', 'image'] : ['text'],
    cost: {
      input: model.pricing?.input ?? 0,
      output: model.pricing?.output ?? 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: model.contextWindow ?? DEFAULT_CONTEXT_LIMIT,
    maxTokens: model.maxTokens ?? DEFAULT_OUTPUT_LIMIT,
  };
}
