import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { readSettings, writeSettings, getSettingsPath } from '../dist/runtime.js';

const ORIGINAL_XDG = process.env.XDG_DATA_HOME;
const ORIGINAL_HOME = process.env.HOME;
let tempHome;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'cliproxy-cfg-'));
  process.env.XDG_DATA_HOME = tempHome;
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.XDG_DATA_HOME = ORIGINAL_XDG;
  process.env.HOME = ORIGINAL_HOME;
  rmSync(tempHome, { recursive: true, force: true });
});

test('readSettings returns null when file is missing', async () => {
  const result = await readSettings();
  assert.equal(result, null);
});

test('writeSettings + readSettings roundtrip', async () => {
  await writeSettings({ baseURL: 'http://example.com/v1', apiKey: 'abc' });
  const path = getSettingsPath();
  assert.ok(existsSync(path));

  const result = await readSettings();
  assert.equal(result.baseURL, 'http://example.com/v1');
  assert.equal(result.apiKey, 'abc');
});

test('readSettings returns null for malformed JSON', async () => {
  const dir = join(tempHome, 'pi', 'agent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cliproxy.json'), '{ not valid json', 'utf-8');

  const result = await readSettings();
  assert.equal(result, null);
});

test('readSettings normalizes missing fields to defaults', async () => {
  const dir = join(tempHome, 'pi', 'agent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cliproxy.json'), '{}', 'utf-8');

  const result = await readSettings();
  assert.equal(result.baseURL, 'http://localhost:8317/v1');
  assert.equal(result.apiKey, '');
});

test('readSettings sanitizes modelsDev sub-config', async () => {
  const dir = join(tempHome, 'pi', 'agent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'cliproxy.json'),
    JSON.stringify({
      baseURL: 'http://example.com/v1',
      apiKey: 'k',
      modelsDev: {
        enabled: false,
        cacheTtl: 'not-a-number',
        providerAliases: { anthropic: 'anthropic', bad: 42 },
      },
    }),
    'utf-8',
  );

  const result = await readSettings();
  assert.equal(result.modelsDev?.enabled, false);
  assert.equal(result.modelsDev?.cacheTtl, undefined);
  assert.equal(result.modelsDev?.providerAliases?.anthropic, 'anthropic');
  assert.equal(result.modelsDev?.providerAliases?.bad, undefined);
});
