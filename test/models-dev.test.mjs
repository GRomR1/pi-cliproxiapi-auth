import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeModelKey,
  resolveProviderAlias,
  buildModelsDevIndex,
  enrichWithModelsDev,
} from '../dist/src/models-dev.js';

test('normalizeModelKey strips date and preview suffixes', () => {
  assert.equal(normalizeModelKey('gpt-4o-2024-11-20'), 'gpt-4o');
  assert.equal(normalizeModelKey('claude-3-preview'), 'claude-3');
});

test('resolveProviderAlias maps claude to anthropic and qwen to alibaba', () => {
  assert.equal(resolveProviderAlias('claude'), 'anthropic');
  assert.equal(resolveProviderAlias('gemini'), 'google');
  assert.equal(resolveProviderAlias('qwen'), 'alibaba');
  assert.equal(resolveProviderAlias('bailian'), 'alibaba');
  assert.equal(resolveProviderAlias(undefined, undefined, 'qwen38-27b'), 'alibaba');
  assert.equal(resolveProviderAlias('antigravity', undefined, 'qwen38-27b'), 'alibaba');
});

test('enrichWithModelsDev fills missing limits from provider match', () => {
  const index = buildModelsDevIndex({
    anthropic: {
      id: 'anthropic',
      models: {
        'claude-sonnet-4-6': {
          id: 'claude-sonnet-4-6',
          name: 'Claude Sonnet',
          limit: { context: 200000, output: 64000 },
          reasoning: true,
        },
      },
    },
  });

  assert.ok(index);
  const enriched = enrichWithModelsDev(
    { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', ownedBy: 'anthropic' },
    index,
  );

  assert.equal(enriched.contextWindow, 200000);
  assert.equal(enriched.maxTokens, 64000);
  assert.equal(enriched.supportsReasoning, true);
});

test('enrichWithModelsDev skips ambiguous global matches', () => {
  const index = buildModelsDevIndex({
    openai: {
      id: 'openai',
      models: {
        'shared-model': { id: 'shared-model', name: 'OpenAI', limit: { context: 1000 } },
      },
    },
    anthropic: {
      id: 'anthropic',
      models: {
        'shared-model': { id: 'shared-model', name: 'Anthropic', limit: { context: 2000 } },
      },
    },
  });

  assert.ok(index);
  const enriched = enrichWithModelsDev(
    { id: 'shared-model', name: 'shared-model' },
    index,
  );

  assert.equal(enriched.contextWindow, undefined);
});
test('enrichWithModelsDev resolves qwen38-27b to qwen3.8-27b with consistent limits', () => {
  const index = buildModelsDevIndex({
    groq: {
      id: 'groq',
      models: {
        'qwen3.8-27b': {
          id: 'qwen3.8-27b',
          name: 'Qwen3.8 27B',
          limit: { context: 262144, output: 32768 },
        },
      },
    },
    vultr: {
      id: 'vultr',
      models: {
        'qwen3.8-27b': {
          id: 'qwen3.8-27b',
          name: 'Qwen3.8 27B',
          limit: { context: 262144, output: 32768 },
        },
      },
    },
  });

  assert.ok(index);
  const enriched = enrichWithModelsDev({ id: 'qwen38-27b', name: 'qwen38-27b' }, index);
  assert.equal(enriched.contextWindow, 262144);
  assert.equal(enriched.maxTokens, 32768);
});

test('enrichWithModelsDev strips model namespace prefix', () => {
  const index = buildModelsDevIndex({
    alibaba: {
      id: 'alibaba',
      models: {
        'qwen3.5-27b': {
          id: 'qwen3.5-27b',
          name: 'Qwen3.5 27B',
          limit: { context: 262144, output: 16384 },
        },
      },
    },
  });

  assert.ok(index);
  const enriched = enrichWithModelsDev({ id: 'qwen/qwen3.5-27b', name: 'qwen/qwen3.5-27b', ownedBy: 'alibaba' }, index);
  assert.equal(enriched.contextWindow, 262144);
});