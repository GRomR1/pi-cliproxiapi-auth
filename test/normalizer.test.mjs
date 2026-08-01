import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  thinkingToVariants,
  normalizeRegistryModel,
  mergeModelMetadata,
  normalizeApiModel,
  toOmpModel,
} from '../dist/runtime.js';

test('thinkingToVariants maps CLIProxyAPI levels to reasoning variants', () => {
  const variants = thinkingToVariants({
    levels: ['low', 'medium', 'high', 'xhigh', 'max'],
  });

  assert.deepEqual(variants.low, {});
  assert.deepEqual(variants.xhigh, {});
  assert.deepEqual(variants.max, {});
});

test('thinkingToVariants falls back to default levels when min/dynamic_allowed is set', () => {
  const variants = thinkingToVariants({ dynamic_allowed: true });
  assert.deepEqual(Object.keys(variants), ['low', 'medium', 'high']);
});

test('thinkingToVariants returns undefined for empty thinking config', () => {
  assert.equal(thinkingToVariants(undefined), undefined);
  assert.equal(thinkingToVariants({}), undefined);
});

test('normalizeRegistryModel reads gemini token limits', () => {
  const model = normalizeRegistryModel({
    id: 'gemini-2.5-pro',
    display_name: 'Gemini 2.5 Pro',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    thinking: { dynamic_allowed: true },
  });

  assert.equal(model.contextWindow, 1048576);
  assert.equal(model.maxTokens, 65536);
  assert.equal(model.supportsReasoning, true);
});

test('mergeModelMetadata prefers registry enrichment', () => {
  const api = normalizeApiModel({ id: 'claude-sonnet-4-6', owned_by: 'anthropic' });
  const registry = normalizeRegistryModel({
    id: 'claude-sonnet-4-6',
    display_name: 'Claude 4.6 Sonnet',
    context_length: 200000,
    max_completion_tokens: 64000,
    thinking: { levels: ['low', 'high'] },
  });

  const merged = mergeModelMetadata(api, registry);
  assert.equal(merged.name, 'Claude 4.6 Sonnet');
  assert.equal(merged.contextWindow, 200000);
  assert.equal(merged.supportsReasoning, true);
});

test('toOmpModel maps supportsVision to image input', () => {
  const omp = toOmpModel({
    id: 'gpt-4o',
    name: 'GPT-4o',
    supportsVision: true,
    contextWindow: 128000,
    maxTokens: 16384,
  });

  assert.deepEqual(omp.input, ['text', 'image']);
  assert.equal(omp.reasoning, false);
  assert.equal(omp.contextWindow, 128000);
  assert.equal(omp.maxTokens, 16384);
});

test('toOmpModel omits image input when vision is not supported', () => {
  const omp = toOmpModel({
    id: 'claude-haiku-4-5',
    name: 'Haiku 4.5',
    supportsVision: false,
    contextWindow: 200000,
    maxTokens: 8192,
  });

  assert.deepEqual(omp.input, ['text']);
});

test('toOmpModel sets reasoning flag from supportsReasoning', () => {
  const omp = toOmpModel({
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    supportsReasoning: true,
    contextWindow: 200000,
    maxTokens: 64000,
  });

  assert.equal(omp.reasoning, true);
});

test('toOmpModel applies default limits when context/max are missing', () => {
  const omp = toOmpModel({ id: 'unknown', name: 'Unknown' });
  assert.equal(omp.contextWindow, 128_000);
  assert.equal(omp.maxTokens, 8_192);
});
