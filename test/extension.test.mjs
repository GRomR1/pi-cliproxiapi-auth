import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import cliproxyExtension, { resolveSettings } from '../dist/index.js';

// We replace `~/.pi/agent/cliproxy.json` by pointing XDG_DATA_HOME to a
// throwaway temp directory for the duration of each test.
const ORIGINAL_XDG = process.env.XDG_DATA_HOME;
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_BASE_URL = process.env.CLIPROXY_BASE_URL;
const ORIGINAL_API_KEY = process.env.CLIPROXY_API_KEY;
const ORIGINAL_FETCH = global.fetch;

let tempHome;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'cliproxy-omp-'));
  process.env.XDG_DATA_HOME = tempHome;
  process.env.HOME = tempHome;
  delete process.env.CLIPROXY_BASE_URL;
  delete process.env.CLIPROXY_API_KEY;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env.XDG_DATA_HOME = ORIGINAL_XDG;
  process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_BASE_URL === undefined) delete process.env.CLIPROXY_BASE_URL;
  else process.env.CLIPROXY_BASE_URL = ORIGINAL_BASE_URL;
  if (ORIGINAL_API_KEY === undefined) delete process.env.CLIPROXY_API_KEY;
  else process.env.CLIPROXY_API_KEY = ORIGINAL_API_KEY;
  rmSync(tempHome, { recursive: true, force: true });
});

function makePi() {
  const registered = [];
  const commands = new Map();

  const pi = {
    registerProvider: (name, config) => {
      registered.push({ name, config });
    },
    registerCommand: (name, options) => {
      commands.set(name, options);
    },
    sendUserMessage: () => {},
    sendMessage: () => {},
  };

  return { pi, registered, commands };
}

test('extension is exported as a function (default export)', () => {
  assert.equal(typeof cliproxyExtension, 'function');
});

test('extension registers the cliproxy provider with default baseURL', async () => {
  const { pi, registered, commands } = makePi();
  await cliproxyExtension(pi);

  assert.ok(registered.length >= 1, 'provider should be registered at least once');
  const last = registered[registered.length - 1];
  assert.equal(last.name, 'cliproxy');
  assert.equal(last.config.baseUrl, 'http://localhost:8317/v1');
  assert.equal(last.config.api, 'openai-completions');
  assert.equal(last.config.authHeader, true);
  assert.ok(Array.isArray(last.config.models));
  assert.ok(last.config.models.length > 0);

  assert.ok(commands.has('cliproxy-connect'));
  assert.ok(commands.has('cliproxy-refresh'));
  assert.ok(commands.has('cliproxy-status'));
  assert.ok(commands.has('cliproxy-logout'));
});

test('extension uses env vars when settings file is missing', async () => {
  process.env.CLIPROXY_BASE_URL = 'http://example:9000/v1';
  process.env.CLIPROXY_API_KEY = 'env-key';

  const { pi, registered } = makePi();
  await cliproxyExtension(pi);

  const last = registered[registered.length - 1];
  assert.equal(last.config.baseUrl, 'http://example:9000/v1');
  assert.equal(last.config.apiKey, 'env-key');
});

test('extension prefers settings file over env vars', async () => {
  process.env.CLIPROXY_BASE_URL = 'http://env-host:9000/v1';
  process.env.CLIPROXY_API_KEY = 'env-key';

  const settingsPath = join(tempHome, 'pi', 'agent', 'cliproxy.json');
  mkdirSync(join(tempHome, 'pi', 'agent'), { recursive: true });
  writeFileSync(
    settingsPath,
    JSON.stringify({ baseURL: 'http://file-host:8000/v1', apiKey: 'file-key' }),
    'utf-8',
  );

  const { pi, registered } = makePi();
  await cliproxyExtension(pi);

  const last = registered[registered.length - 1];
  assert.equal(last.config.baseUrl, 'http://file-host:8000/v1');
  assert.equal(last.config.apiKey, 'file-key');
});

test('extension substitutes $CLIPROXY_API_KEY when apiKey is empty', async () => {
  // No env var set, no settings file -> empty apiKey resolves to the
  // env-var reference so the OMP runtime picks up the env at request time.
  const { pi, registered } = makePi();
  await cliproxyExtension(pi);

  const last = registered[registered.length - 1];
  assert.equal(last.config.apiKey, '$CLIPROXY_API_KEY');
});

test('cliproxy-connect writes settings and re-registers provider', async () => {
  const { pi, registered, commands } = makePi();
  await cliproxyExtension(pi);

  const settingsPath = join(tempHome, 'pi', 'agent', 'cliproxy.json');
  const beforeCount = registered.length;

  const ctx = {
    hasUI: true,
    ui: {
      input: async (prompt) => {
        if (prompt.startsWith('CLIProxyAPI base URL')) return 'http://new-host:9000/v1';
        if (prompt.startsWith('API key')) return 'new-key';
        throw new Error(`Unexpected prompt: ${prompt}`);
      },
      notify: () => {},
    },
  };

  await commands.get('cliproxy-connect').handler('', ctx);

  assert.ok(existsSync(settingsPath), 'settings file should be written');
  const persisted = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  assert.equal(persisted.baseURL, 'http://new-host:9000/v1');
  assert.equal(persisted.apiKey, 'new-key');

  assert.ok(registered.length > beforeCount, 'provider should be re-registered');
  const last = registered[registered.length - 1];
  assert.equal(last.config.baseUrl, 'http://new-host:9000/v1');
  assert.equal(last.config.apiKey, 'new-key');
});

test('cliproxy-connect cancels when user dismisses the baseURL prompt', async () => {
  const { pi, commands } = makePi();
  await cliproxyExtension(pi);

  const settingsPath = join(tempHome, 'pi', 'agent', 'cliproxy.json');

  const ctx = {
    hasUI: true,
    ui: {
      input: async () => undefined,
      notify: () => {},
    },
  };

  await commands.get('cliproxy-connect').handler('', ctx);
  assert.equal(existsSync(settingsPath), false, 'no settings file should be written');
});

test('cliproxy-connect aborts with notification when ctx.hasUI is false', async () => {
  const { pi, commands } = makePi();
  await cliproxyExtension(pi);

  const notifications = [];
  const ctx = {
    hasUI: false,
    ui: {
      notify: (msg) => notifications.push(msg),
      input: async () => {
        throw new Error('input should not be called when hasUI is false');
      },
    },
  };

  await commands.get('cliproxy-connect').handler('', ctx);
  assert.deepEqual(notifications, ['cliproxy-connect requires an interactive UI']);
});

test('cliproxy-refresh re-registers with fresh models from the server', async () => {
  const modelsBody = { data: [{ id: 'm1' }, { id: 'm2' }] };
  global.fetch = async (url) => {
    if (String(url).endsWith('/models')) {
      return new Response(JSON.stringify(modelsBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  };

  const { pi, registered, commands } = makePi();
  await cliproxyExtension(pi);

  // Wait a microtask cycle for the background refresh started in the factory.
  await new Promise((resolve) => setTimeout(resolve, 10));

  const beforeCount = registered.length;
  const ctx = { hasUI: true, ui: { notify: () => {} } };

  await commands.get('cliproxy-refresh').handler('', ctx);

  // The factory registers once; background refresh registers again. The
  // /cliproxy-refresh command registers one more time with the live list.
  assert.ok(registered.length > beforeCount);
  const last = registered[registered.length - 1];
  assert.equal(last.config.models.length, 2);
  assert.deepEqual(last.config.models.map((m) => m.id), ['m1', 'm2']);
});

test('cliproxy-status reports current settings', async () => {
  process.env.CLIPROXY_BASE_URL = 'http://status-host:1234/v1';
  process.env.CLIPROXY_API_KEY = 'status-key';

  const { pi, commands } = makePi();
  await cliproxyExtension(pi);

  const notifications = [];
  const ctx = {
    hasUI: true,
    ui: { notify: (msg) => notifications.push(msg) },
  };

  await commands.get('cliproxy-status').handler('', ctx);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0], /http:\/\/status-host:1234\/v1/);
  assert.match(notifications[0], /\[set\]/);
});

test('cliproxy-logout deletes settings file', async () => {
  const settingsPath = join(tempHome, 'pi', 'agent', 'cliproxy.json');
  mkdirSync(join(tempHome, 'pi', 'agent'), { recursive: true });
  writeFileSync(
    settingsPath,
    JSON.stringify({ baseURL: 'http://old:1/v1', apiKey: 'old-key' }),
    'utf-8',
  );

  const { pi, commands } = makePi();
  await cliproxyExtension(pi);

  const ctx = { hasUI: true, ui: { notify: () => {} } };
  await commands.get('cliproxy-logout').handler('', ctx);

  assert.equal(existsSync(settingsPath), false, 'settings file should be deleted after logout');
});

test('resolveSettings normalizes a baseURL without trailing slash', async () => {
  const result = await resolveSettings({
    baseURL: 'http://example.com/v1///',
    apiKey: '',
    modelsJsonPath: 'http://registry.example/models.json',
  });
  assert.equal(result.baseURL, 'http://example.com/v1');
  assert.equal(result.apiKey, '');
  assert.equal(result.modelsJsonPath, 'http://registry.example/models.json');
});

test('resolveSettings falls back to default baseURL on garbage', async () => {
  const result = await resolveSettings({ baseURL: 'not a url', apiKey: '' });
  assert.equal(result.baseURL, 'http://localhost:8317/v1');
});
