import { existsSync } from 'fs';
import { chmod, mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type { CliproxyExtensionSettings } from './types.js';
import { CLIPROXY_ENDPOINTS } from './constants.js';
import { warn, formatErrorForLog } from './logger.js';

/**
 * Compute the settings file path from current env vars. Re-evaluated on every
 * call so test harnesses that override `XDG_DATA_HOME` / `HOME` get a fresh
 * path without having to reload the module.
 */
export function getSettingsPath(): string {
  const dir = join(
    process.env.XDG_DATA_HOME || join(process.env.HOME || homedir(), '.local', 'share'),
    'pi',
    'agent',
  );
  return join(dir, 'cliproxy.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Read settings from disk. Returns `null` if the file is missing or invalid. */
export async function readSettings(): Promise<CliproxyExtensionSettings | null> {
  const path = getSettingsPath();
  try {
    if (!existsSync(path)) return null;
    const raw = await readFile(path, 'utf-8');
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return null;
    return normalizeSettings(data);
  } catch (error) {
    warn(`Failed to read settings: ${formatErrorForLog(error)}`);
    return null;
  }
}

function normalizeSettings(
  data: Record<string, unknown>,
): CliproxyExtensionSettings {
  const baseURL = isString(data.baseURL) ? data.baseURL.trim() : '';
  const apiKey = isString(data.apiKey) ? data.apiKey.trim() : '';
  const modelsJsonPath = isString(data.modelsJsonPath) ? data.modelsJsonPath.trim() : undefined;

  const modelsDev = isRecord(data.modelsDev) ? sanitizeModelsDev(data.modelsDev) : undefined;
  const compat = isRecord(data.compat) ? sanitizeCompat(data.compat) : undefined;
  const modelCompat = isRecord(data.modelCompat) ? sanitizeModelCompat(data.modelCompat) : undefined;

  return {
    baseURL: baseURL || CLIPROXY_ENDPOINTS.BASE_URL,
    apiKey,
    ...(modelsJsonPath ? { modelsJsonPath } : {}),
    ...(modelsDev ? { modelsDev } : {}),
    ...(compat ? { compat } : {}),
    ...(modelCompat ? { modelCompat } : {}),
  };
}

function sanitizeModelsDev(
  raw: Record<string, unknown>,
): CliproxyExtensionSettings['modelsDev'] {
  const enabled = isBoolean(raw.enabled) ? raw.enabled : undefined;
  const url = isString(raw.url) && raw.url.trim() ? raw.url.trim() : undefined;
  const cacheTtl = isPositiveNumber(raw.cacheTtl) ? raw.cacheTtl : undefined;
  const timeoutMs = isPositiveNumber(raw.timeoutMs) ? raw.timeoutMs : undefined;

  const providerAliases = isRecord(raw.providerAliases)
    ? Object.fromEntries(
        Object.entries(raw.providerAliases).filter(
          (entry): entry is [string, string] => isString(entry[1]) && entry[1].trim().length > 0,
        ),
      )
    : undefined;

  const hasAny =
    enabled !== undefined ||
    url !== undefined ||
    cacheTtl !== undefined ||
    timeoutMs !== undefined ||
    (providerAliases && Object.keys(providerAliases).length > 0);

  if (!hasAny) return undefined;

  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(cacheTtl !== undefined ? { cacheTtl } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(providerAliases && Object.keys(providerAliases).length > 0 ? { providerAliases } : {}),
  };
}

const VALID_THINKING_FORMATS = new Set([
  'openai',
  'openrouter',
  'deepseek',
  'together',
  'zai',
  'qwen',
  'chat-template',
  'qwen-chat-template',
  'string-thinking',
  'ant-ling',
]);

function sanitizeCompat(raw: Record<string, unknown>): CliproxyExtensionSettings['compat'] {
  const thinkingFormat =
    isString(raw.thinkingFormat) && VALID_THINKING_FORMATS.has(raw.thinkingFormat)
      ? (raw.thinkingFormat as CliproxyExtensionSettings['compat'] extends infer C ? C extends { thinkingFormat?: infer F } ? F : never : never)
      : undefined;
  const supportsReasoningEffort = isBoolean(raw.supportsReasoningEffort) ? raw.supportsReasoningEffort : undefined;
  const maxTokensField =
    raw.maxTokensField === 'max_completion_tokens' || raw.maxTokensField === 'max_tokens'
      ? raw.maxTokensField
      : undefined;

  const hasAny = thinkingFormat !== undefined || supportsReasoningEffort !== undefined || maxTokensField !== undefined;
  if (!hasAny) return undefined;

  return {
    ...(thinkingFormat ? { thinkingFormat } : {}),
    ...(supportsReasoningEffort !== undefined ? { supportsReasoningEffort } : {}),
    ...(maxTokensField ? { maxTokensField } : {}),
  };
}

function sanitizeModelCompat(raw: Record<string, unknown>): CliproxyExtensionSettings['modelCompat'] {
  const result: NonNullable<CliproxyExtensionSettings['modelCompat']> = {};
  for (const [modelId, config] of Object.entries(raw)) {
    if (isRecord(config)) {
      const sanitized = sanitizeCompat(config);
      if (sanitized) {
        result[modelId] = sanitized;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Persist settings to disk. Creates parent directory if needed. */
export async function writeSettings(settings: CliproxyExtensionSettings): Promise<void> {
  const path = getSettingsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await chmod(path, 0o600);
}

/** Delete settings file from disk. Resolves to env vars / defaults on next read. */
export async function deleteSettings(): Promise<void> {
  const path = getSettingsPath();
  try {
    if (existsSync(path)) await unlink(path);
  } catch (error) {
    warn(`Failed to delete settings: ${formatErrorForLog(error)}`);
  }
}
