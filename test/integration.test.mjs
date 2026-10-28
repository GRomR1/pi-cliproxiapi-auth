/**
 * Live integration tests against CLIProxyAPI.
 * Requires .env (see .env.example) and CLIPROXY_INTEGRATION=1.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

import { fetchModels, clearModelCache, toOmpModel } from '../dist/runtime.js';
import { loadEnv, requireEnv } from './load-env.mjs';

const EXTENSION_PATH = new URL('../dist/index.js', import.meta.url).pathname;
const INTEGRATION_ENABLED = process.env.CLIPROXY_INTEGRATION === '1';

let projectDir;
let config;

function runCommand(cmd, args, options = {}) {
  const { cwd, timeoutMs = 120_000, env = process.env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Command failed (code=${code}, signal=${signal}): ${cmd} ${args.join(' ')}\n${stderr || stdout}`,
        ),
      );
    });
  });
}

before(async () => {
  if (!INTEGRATION_ENABLED) return;

  await loadEnv();
  const baseUrl = requireEnv('CLIPROXY_BASE_URL');
  const apiKey = process.env.CLIPROXY_API_KEY?.trim() ?? '';

  config = {
    baseUrl,
    apiKey,
    modelsJsonPath:
      'https://raw.githubusercontent.com/router-for-me/CLIProxyAPI/refs/heads/main/internal/registry/models/models.json',
  };

  projectDir = join(tmpdir(), `cliproxy-integration-${Date.now()}`);
  await mkdir(projectDir, { recursive: true });
});

test('live /v1/models returns models', { skip: !INTEGRATION_ENABLED }, async () => {
  clearModelCache();
  const models = await fetchModels(config, true);
  assert.ok(models.length >= 1, 'expected at least one model');
  assert.ok(models.every((m) => typeof m.id === 'string'));
});

test('live models include thinkingLevelMap and reasoning metadata', {
  skip: !INTEGRATION_ENABLED,
}, async () => {
  clearModelCache();
  const models = await fetchModels(config, true);
  const withThinkingLevels = models.find((m) => m.thinking?.levels && m.thinking.levels.length > 0);
  assert.ok(withThinkingLevels, 'expected at least one model with thinking.levels');

  const target = toOmpModel(withThinkingLevels, {
    modelCompat: {
      [withThinkingLevels.id]: { thinkingFormat: 'deepseek' },
    },
  });
  assert.ok(target.reasoning, 'expected target model to have reasoning enabled');
  assert.equal(target.compat?.thinkingFormat, 'deepseek');
  assert.ok(target.thinkingLevelMap, 'expected thinkingLevelMap to be populated');
});

test('live models populate contextWindow and vision from client_version endpoint and support overrides', {
  skip: !INTEGRATION_ENABLED,
}, async () => {
  clearModelCache();
  const models = await fetchModels(config, true);
  const visionModels = models.filter((m) => m.supportsVision);
  assert.ok(visionModels.length > 0, 'expected at least one model with vision support');

  const laguna = models.find((m) => m.id.includes('laguna'));
  if (laguna) {
    assert.equal(laguna.contextWindow, 872000, 'expected laguna contextWindow to be 872000 from max_context_window');
    assert.equal(laguna.supportsVision, true, 'expected laguna to support vision from input_modalities');
  }

  const sample = models[0];
  const overridden = toOmpModel(sample, {
    modelCompat: {
      [sample.id]: {
        contextWindow: 524288,
        vision: false,
      },
    },
  });
  assert.equal(overridden.contextWindow, 524288);
  assert.deepEqual(overridden.input, ['text']);
});

test('omp lists cliproxy provider models with thinking column populated', {
  skip: !INTEGRATION_ENABLED,
}, async () => {
  const { stdout } = await runCommand('omp', ['models', '-e', EXTENSION_PATH, 'cliproxy'], {
    cwd: projectDir,
    timeoutMs: 120_000,
  });
  assert.match(stdout, /cliproxy/);
  // Verify thinking column contains populated levels (not just '-')
  assert.match(stdout, /(?:minimal|low|medium|high)/);
});
test('live chat completion via /v1/chat/completions', { skip: !INTEGRATION_ENABLED }, async () => {
  clearModelCache();
  const models = await fetchModels(config, true);
  const preferred = process.env.CLIPROXY_TEST_MODEL?.trim();
  const modelId =
    (preferred && models.find((m) => m.id === preferred)?.id) ||
    models.find((m) => m.id === 'gpt-5.4-mini')?.id ||
    models[0]?.id;
  assert.ok(modelId, 'no model available for chat completion test');

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: 'Reply with exactly: API_OK' }],
      max_tokens: 64,
    }),
  });

  assert.equal(response.status, 200, `chat completion failed: ${response.status}`);
  const body = await response.json();
  const message = body.choices?.[0]?.message;
  const text = (message?.content ?? '') + (message?.reasoning ?? '') + (message?.reasoning_content ?? '');
  assert.match(text, /API_OK/i);
});

test('invalid API key falls back to default models', { skip: !INTEGRATION_ENABLED }, async () => {
  clearModelCache();
  const badConfig = { ...config, apiKey: 'sk-invalid-key-12345' };
  const models = await fetchModels(badConfig, true);
  assert.ok(models.length >= 1, 'should fall back to default models');
  assert.ok(models.every((m) => typeof m.id === 'string'));
});

test('unreachable server falls back to default models', { skip: !INTEGRATION_ENABLED }, async () => {
  clearModelCache();
  const badConfig = { ...config, baseUrl: 'http://192.0.2.1:99999/v1' };
  const models = await fetchModels(badConfig, true);
  assert.ok(models.length >= 1, 'should fall back to default models');
});

after(async () => {
  if (projectDir) await rm(projectDir, { recursive: true, force: true }).catch(() => {});
});