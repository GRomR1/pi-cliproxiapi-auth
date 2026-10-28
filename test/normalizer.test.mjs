import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildThinkingLevelMap,
  inferThinkingFormat,
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
test('normalizeApiModel preserves context_length and max_tokens from API', () => {
  const apiModel = normalizeApiModel({
    id: 'qwen38-27b',
    owned_by: 'vllm',
    context_length: 262144,
    max_tokens: 32768,
  });
  assert.equal(apiModel.contextWindow, 262144);
  assert.equal(apiModel.maxTokens, 32768);
});

test('buildThinkingLevelMap disables unsupported levels with null', () => {
  const map = buildThinkingLevelMap({ levels: ['low', 'high'] }, true);
  assert.ok(map);
  assert.equal(map.low, 'low');
  assert.equal(map.high, 'high');
  assert.equal(map.minimal, null);
  assert.equal(map.medium, null);
  assert.equal(map.xhigh, null);
  assert.equal(map.max, null);
});

test('inferThinkingFormat detects provider dialects with owner taking precedence', () => {
  assert.equal(inferThinkingFormat('deepseek-r1', 'deepseek'), 'deepseek');
  assert.equal(inferThinkingFormat('qwen-max', 'alibaba'), 'qwen');
  assert.equal(inferThinkingFormat('glm-4', 'zai'), 'zai');
  assert.equal(inferThinkingFormat('custom-model', 'together'), 'together');
  assert.equal(inferThinkingFormat('custom-model', 'openrouter'), 'openrouter');
  assert.equal(inferThinkingFormat('gpt-5', 'openai'), 'openai');

  // Transport provider takes precedence over model architecture in ID
  assert.equal(inferThinkingFormat('deepseek/deepseek-r1', 'together'), 'together');
  assert.equal(inferThinkingFormat('qwen/qwen-2.5-72b', 'openrouter'), 'openrouter');
});

test('toOmpModel applies thinkingLevelMap and user compat overrides', () => {
  const model = {
    id: 'my-custom-qwen',
    name: 'Custom Qwen',
    supportsReasoning: true,
    thinking: { levels: ['low', 'medium'] },
  };

  // Default inference
  const defaultOmp = toOmpModel(model);
  assert.equal(defaultOmp.reasoning, true);
  assert.equal(defaultOmp.thinkingLevelMap?.low, 'low');
  assert.equal(defaultOmp.thinkingLevelMap?.high, null);
  assert.equal(defaultOmp.compat?.thinkingFormat, 'qwen');

  // User override via compat / modelCompat
  const overriddenOmp = toOmpModel(model, {
    modelCompat: {
      'my-custom-qwen': {
        thinkingFormat: 'chat-template',
        supportsReasoningEffort: false,
      },
    },
  });
  assert.equal(overriddenOmp.compat?.thinkingFormat, 'chat-template');
  assert.equal(overriddenOmp.compat?.supportsReasoningEffort, false);
});

test('toOmpModel infers reasoning from r1/thinking/reasoner names and honors explicit reasoning override', () => {
  // Inferred from name
  const r1Model = { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'R1 Distill' };
  assert.equal(toOmpModel(r1Model).reasoning, true);

  // Unknown self-hosted model forced to reasoning: true via modelCompat
  const customModel = { id: 'corp-fin-model-v2', name: 'Custom Finance' };
  assert.equal(toOmpModel(customModel).reasoning, false);

  const forcedOmp = toOmpModel(customModel, {
    modelCompat: {
      'corp-fin-model-v2': {
        reasoning: true,
        thinkingFormat: 'qwen',
      },
    },
  });
  assert.equal(forcedOmp.reasoning, true);
  assert.equal(forcedOmp.compat?.thinkingFormat, 'qwen');
});
