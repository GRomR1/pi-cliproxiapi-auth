import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  CLIPROXY_DEFAULT_MODELS,
  CLIPROXY_ENDPOINTS,
  CLIPROXY_PROVIDER_ID,
  CLIPROXY_PROVIDER_NAME,
  DEFAULT_MODELS_JSON_URL,
} from './constants.js';
import type { CliproxyConfig, CliproxyExtensionSettings, CliproxyModel } from './types.js';
import { fetchModels, clearModelCache } from './model-fetcher.js';
import { toOmpModel, type OmpModel } from './normalizer.js';
import { readSettings, writeSettings, deleteSettings } from './config-store.js';
import { debug, formatErrorForLog, warn } from './logger.js';

interface ResolvedSettings {
  baseURL: string;
  apiKey: string;
  modelsJsonPath: string;
}

function readString(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Normalize a baseURL — strip trailing slashes, require http(s). */
function normalizeBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return CLIPROXY_ENDPOINTS.BASE_URL;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      warn(`Unsupported baseURL protocol: ${formatErrorForLog(parsed.protocol)}`);
      return CLIPROXY_ENDPOINTS.BASE_URL;
    }
    return trimmed;
  } catch {
    warn(`Invalid baseURL: ${formatErrorForLog(trimmed)}`);
    return CLIPROXY_ENDPOINTS.BASE_URL;
  }
}

function readEnvBaseURL(): string {
  const fromEnv = process.env.CLIPROXY_BASE_URL?.trim();
  return fromEnv ? normalizeBaseURL(fromEnv) : CLIPROXY_ENDPOINTS.BASE_URL;
}

function readEnvApiKey(): string {
  return process.env.CLIPROXY_API_KEY?.trim() ?? '';
}

/**
 * Resolve effective runtime settings: explicit settings file > env vars > defaults.
 * The settings file takes precedence because it represents the most recent
 * `/cliproxy-connect` configuration.
 */
export async function resolveSettings(
  stored: CliproxyExtensionSettings | null,
): Promise<ResolvedSettings> {
  const baseURL = stored?.baseURL
    ? normalizeBaseURL(stored.baseURL)
    : readEnvBaseURL();
  const apiKey = stored?.apiKey?.trim() || readEnvApiKey();
  const modelsJsonPath = stored?.modelsJsonPath?.trim() || DEFAULT_MODELS_JSON_URL;
  return { baseURL, apiKey, modelsJsonPath };
}

function buildFetcherConfig(settings: ResolvedSettings): CliproxyConfig {
  return {
    baseUrl: settings.baseURL,
    apiKey: settings.apiKey,
    modelsJsonPath: settings.modelsJsonPath,
  };
}

/**
 * Convert normalized models to OMP model format. Returns at least the fallback
 * defaults so the provider is never empty.
 */
function toOmpModels(models: CliproxyModel[]): OmpModel[] {
  return models.map(toOmpModel);
}

/** OMP extension factory — the default export. */
export default async function cliproxyExtension(pi: ExtensionAPI): Promise<void> {
  const stored = await readSettings();
  let settings = await resolveSettings(stored);

  let cachedModels: CliproxyModel[] = CLIPROXY_DEFAULT_MODELS;

  async function refreshModels(): Promise<CliproxyModel[]> {
    try {
      const config = buildFetcherConfig(settings);
      const models = await fetchModels(config, false);
      cachedModels = models;
      debug(`Fetched ${models.length} models from ${settings.baseURL}`);
      if (models.length < 10) {
        warn(`Only ${models.length} models loaded from ${settings.baseURL} — check server and settings`);
      }
      return models;
    } catch (error) {
      warn(`Model fetch failed, using defaults: ${formatErrorForLog(error)}`);
      return cachedModels;
    }
  }

  function registerProvider(models: CliproxyModel[]): void {
    const ompModels = toOmpModels(models);
    pi.registerProvider(CLIPROXY_PROVIDER_ID, {
      name: CLIPROXY_PROVIDER_NAME,
      baseUrl: settings.baseURL,
      apiKey: settings.apiKey || '$CLIPROXY_API_KEY',
      api: 'openai-completions',
      authHeader: true,
      models: ompModels,
    });
  }

  // Fetch live models first, then register. OMP snapshots the model list
  // at registerProvider time — a second call does not update it.
  const liveModels = await refreshModels();
  registerProvider(liveModels);
  debug(`Initial model registration: ${liveModels.length} models from ${settings.baseURL}`);

  // /cliproxy-connect — interactive setup (baseURL + optional apiKey).
  pi.registerCommand('cliproxy-connect', {
    description: 'Configure CLIProxyAPI base URL and API key',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify('cliproxy-connect requires an interactive UI', 'error');
        return;
      }

      const baseURLInput = await ctx.ui.input(
        'CLIProxyAPI base URL',
        settings.baseURL,
      );
      if (baseURLInput === undefined) {
        ctx.ui.notify('Cancelled', 'warning');
        return;
      }
      const baseURL = normalizeBaseURL(baseURLInput);

      const apiKeyInput = await ctx.ui.input(
        'API key (leave empty if CLIProxyAPI has no api-keys)',
        settings.apiKey,
      );
      if (apiKeyInput === undefined) {
        ctx.ui.notify('Cancelled', 'warning');
        return;
      }
      const apiKey = apiKeyInput.trim();

      const next: CliproxyExtensionSettings = {
        baseURL,
        apiKey,
        modelsJsonPath: settings.modelsJsonPath === DEFAULT_MODELS_JSON_URL
          ? undefined
          : settings.modelsJsonPath,
      };

      try {
        await writeSettings(next);
      } catch (error) {
        ctx.ui.notify(`Failed to save settings: ${formatErrorForLog(error)}`, 'error');
        return;
      }

      settings = {
        baseURL,
        apiKey,
        modelsJsonPath: settings.modelsJsonPath,
      };
      clearModelCache();
      const models = await refreshModels();
      registerProvider(models);
      ctx.ui.notify(`Connected to ${baseURL}`, 'info');
    },
  });

  // /cliproxy-refresh — force a model list refresh.
  pi.registerCommand('cliproxy-refresh', {
    description: 'Force-refresh the CLIProxyAPI model list',
    handler: async (_args, ctx) => {
      clearModelCache();
      const models = await refreshModels();
      registerProvider(models);
      ctx.ui.notify(`Refreshed ${models.length} models`, 'info');
    },
  });

  // /cliproxy-status — show current configuration.
  pi.registerCommand('cliproxy-status', {
    description: 'Show current CLIProxyAPI connection settings',
    handler: async (_args, ctx) => {
      const lines = [
        `Base URL: ${settings.baseURL}`,
        `API key: ${settings.apiKey ? '[set]' : '[empty — using env or none]'}`,
        `models.json: ${settings.modelsJsonPath}`,
        `Models: ${cachedModels.length}`,
      ];
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

  // /cliproxy-logout — clear saved credentials.
  pi.registerCommand('cliproxy-logout', {
    description: 'Clear saved CLIProxyAPI credentials',
    handler: async (_args, ctx) => {
      try {
        await deleteSettings();
      } catch (error) {
        ctx.ui.notify(`Failed to clear settings: ${formatErrorForLog(error)}`, 'error');
        return;
      }
      settings = await resolveSettings(null);
      clearModelCache();
      const models = await refreshModels();
      registerProvider(models);
      ctx.ui.notify('Cleared saved credentials', 'info');
    },
  });
}
