# Agent Guidelines for pi-cliproxiapi-auth

Guidelines for AI agents working in this repository.

## Overview

`pi-cliproxiapi-auth` is a [pi-mono](https://github.com/earendil-works/pi) (omp) extension for
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI). It is a direct
port of [`opencode-cliproxiapi-auth`](https://github.com/GRomR1/opencode-cliproxiapi-auth)
v1.x — same author, same feature set, retargeted at the OMP extension API.

The extension registers the `cliproxy` provider, supports
`/cliproxy-connect`, fetches models from `/v1/models`, enriches metadata
from CLIProxyAPI `models.json` and [models.dev](https://models.dev/), and
maps `thinking.levels` to OMP's `reasoning` flag.

OMP extension guide: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>

## Common Commands

```bash
# Build (required before tests)
npm run build

# Watch mode
npm run dev

# Unit tests (mocked, no network)
npm test

# Single unit test file
npm run build && node --test test/normalizer.test.mjs

# Live integration tests (requires .env — see below)
npm run test:integration

# Validate extension exports for the OMP loader
npm run check:exports

# Full publish prep
npm run prepublishOnly
```

## Secrets & Environment

**Never commit credentials.** Use `.env` (gitignored):

```bash
cp .env.example .env
# edit CLIPROXY_BASE_URL and CLIPROXY_API_KEY
```

| Variable | Used by |
|----------|---------|
| `CLIPROXY_BASE_URL` | `test/integration.test.mjs` (required), runtime default if no settings file |
| `CLIPROXY_API_KEY` | `test/integration.test.mjs` (optional), runtime fallback if not in settings file |
| `CLIPROXY_TEST_MODEL` | `test/integration.test.mjs` — override chat-completion test model |
| `CLIPROXY_DEBUG=1` | `src/logger.ts` debug output |
| `XDG_DATA_HOME` | Tests override this to redirect `~/.local/share/pi/agent/cliproxy.json` to a temp dir |

Integration tests load `.env` via `test/load-env.mjs` and only run when `CLIPROXY_INTEGRATION=1`.

No `NPM_TOKEN` GitHub secret — npm publish uses [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC).

## Architecture

### Entry Points

| File | Role |
|------|------|
| `index.ts` | Default export `cliproxyExtension` (an OMP `ExtensionFactory`). All consumers load this through `pi.extensions` or `pi -e`. |
| `runtime.ts` | Programmatic API: `fetchModels`, `clearModelCache`, `refreshModels`, normalizers, `resolveSettings`, settings I/O. |

### Core Modules

| File | Responsibility |
|------|----------------|
| `src/extension.ts` | OMP extension factory. `pi.registerProvider()`, `pi.registerCommand()` for `cliproxy-connect` / `-refresh` / `-status` / `-logout`. Initial + on-demand model registration. |
| `src/config-store.ts` | Read/write/delete `~/.local/share/pi/agent/cliproxy.json`. Path resolved lazily on every call (re-reads `XDG_DATA_HOME` / `HOME`) so tests can isolate state. |
| `src/model-fetcher.ts` | Fetches `/v1/models`, merges `models.json` + models.dev, TTL cache, singleflight dedup, fallback models. |
| `src/models-json.ts` | Loads CLIProxyAPI `models.json` from local path or URL; flattens provider buckets into `id → model` map. |
| `src/normalizer.ts` | Normalizes API/registry fields; `thinkingToVariants()` maps `thinking.levels` → OMP reasoning levels; `toOmpModel()` emits the OMP `Model` shape. |
| `src/models-dev.ts` | Fetches and indexes models.dev; fills missing context/output/capabilities. |
| `src/cache.ts` | Generic `TtlCache<T>` used by model fetcher. |
| `src/logger.ts` | Async file logging to OMP log dir (`~/.local/share/pi/log/`); `sanitizeForLog()` + `formatErrorForLog()` redact keys/tokens/`sk-*`. |
| `src/constants.ts` | `CLIPROXY_PROVIDER_ID`, endpoints, defaults, TTLs, fallback model list. |
| `src/types.ts` | Shared TypeScript interfaces (`CliproxyModel`, `CliproxyConfig`, `CliproxyExtensionSettings`, …). |

### Auth / Settings Flow

1. **`/cliproxy-connect`** — prompts for `baseURL` (default `http://localhost:8317/v1`) and optional `apiKey`.
2. **`writeSettings()`** persists JSON to `~/.local/share/pi/agent/cliproxy.json` (`{baseURL, apiKey, modelsJsonPath?, modelsDev?}`).
3. **`parseAuthKey` is gone** — credentials live in our own settings file, not in OMP's auth store.
4. **`resolveSettings()`** (exported) merges: settings file → env vars → defaults.
5. **baseURL priority:** settings file → `CLIPROXY_BASE_URL` → `http://localhost:8317/v1`.
6. **API key priority:** settings file → `CLIPROXY_API_KEY` → `$CLIPROXY_API_KEY` literal (OMP interpolates at request time) → empty.
7. **`/cliproxy-logout`** deletes the settings file so env vars take precedence on next startup.
8. **`pi.registerProvider(..., { authHeader: true })`** is what drives the `Authorization: Bearer …` header — no custom fetch interceptor in this port.

### Provider Registration

```ts
pi.registerProvider(CLIPROXY_PROVIDER_ID, {
  name: 'CLIProxyAPI',
  baseUrl: settings.baseURL,
  apiKey: settings.apiKey || '$CLIPROXY_API_KEY',
  api: 'openai-completions',
  authHeader: true,
  models: ompModels,
});
```

The factory awaits the first `/v1/models` fetch before calling
`registerProvider`. OMP snapshots the model list at registration time —
a second call does not update it. The `/cliproxy-refresh` command
clears the cache, re-fetches, and re-registers.

### Caching

| Cache | Location | Default TTL |
|-------|----------|-------------|
| Models | `src/model-fetcher.ts` | 5 min (`modelCacheTtl`) |
| models.json | `src/models-json.ts` | 10 min |
| models.dev | `src/models-dev.ts` | 24 h |
| In-flight fetches | `src/model-fetcher.ts` | Per `cacheKey`; concurrent callers share one promise |

`clearModelCache()` clears the model list cache and in-flight map.

## Local pi-mono Development

Before publishing, load the built extension via `pi -e`:

```bash
npm run build
pi -e /absolute/path/to/pi-cliproxiapi-auth/dist/index.js
```

Or add it to `~/.pi/settings.json` (or project-local `.pi/settings.json`):

```json
{
  "extensions": [
    "/absolute/path/to/pi-cliproxiapi-auth/dist/index.js"
  ]
}
```

Then:

```bash
npm run build
/cliproxy-connect      # set baseURL + apiKey interactively
pi --list-models        # verify models load (look for cliproxy/*)
```

## Code Style

### TypeScript

- **Target:** ES2022, **Module:** NodeNext (ESM), **strict:** true.
- **Imports:** Always use `.js` extensions for relative paths.
- **No `any`**. Validate API responses before casting.
- Named exports in `src/`; default export only in `index.ts` for the extension function.

### Naming

| Kind | Convention | Example |
|------|------------|---------|
| Constants | `UPPER_SNAKE_CASE` | `CLIPROXY_PROVIDER_ID` |
| Functions/vars | `camelCase` | `fetchModels` |
| Types | `PascalCase` | `CliproxyConfig` |
| Provider slug | `cliproxy` | `settings.json` `extensions` / `packages` keys |

### Security

- Never log API keys, bearer tokens, or full auth payloads.
- Use `sanitizeForLog()` / `formatErrorForLog()` from `src/logger.ts` before writing sensitive strings or errors.
- Optional API key: CLIProxyAPI may run without `api-keys` in `config.yaml`.

### Error Handling

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
try {
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  // validate shape before cast
} finally {
  clearTimeout(timeoutId);
}
```

Graceful degradation order for model fetch:

1. Fresh `/v1/models` + enrichment
2. Stale cache (even if TTL expired)
3. `CLIPROXY_DEFAULT_MODELS`

## Testing

### Unit (`npm test`)

| File | Covers |
|------|--------|
| `test/models.test.mjs` | Cache, singleflight dedup, fetch mocks, models.json enrichment |
| `test/normalizer.test.mjs` | Thinking variants, registry merge, OMP model conversion |
| `test/models-json.test.mjs` | `parseModelsJson()` |
| `test/models-dev.test.mjs` | models.dev enrichment and ambiguous-match skip |
| `test/logger.test.mjs` | `sanitizeForLog()`, `formatErrorForLog()` |
| `test/config-store.test.mjs` | Settings file I/O, env-driven path resolution, sanitizer |
| `test/extension.test.mjs` | Extension factory wiring, command handlers, env/file precedence, graceful-degradation paths |

### Integration (`npm run test:integration`)

Requires `.env` with `CLIPROXY_BASE_URL`. `CLIPROXY_API_KEY` is optional. Chat test model: `CLIPROXY_TEST_MODEL` or `gpt-5.4-mini` or first from `/v1/models`.

| Test | What it verifies |
|------|------------------|
| live /v1/models | `fetchModels()` against real server |
| reasoning metadata | `models.json` thinking enrichment |
| extension loads | `cliproxy` provider registers |
| chat completion API | Direct `/v1/chat/completions` works |
| invalid API key | Graceful fallback to default models |
| unreachable server | Graceful fallback to default models |

## Common Tasks

### Add a config option

1. Add type in `src/types.ts` (`CliproxyExtensionSettings` or `CliproxyConfig`).
2. Parse in `normalizeSettings()` (settings file) or `resolveSettings()` (runtime) in `src/extension.ts`.
3. Use in `src/extension.ts` / `src/model-fetcher.ts` if fetch-related.
4. Document in `README.md`.
5. Add unit test in `test/extension.test.mjs` or `test/config-store.test.mjs`.

### Add a new extension command

1. Add `pi.registerCommand('cliproxy-…', { description, handler })` in `src/extension.ts`.
2. Document in `README.md`.
3. Add a `test('cliproxy-… does X', …)` case in `test/extension.test.mjs` that exercises the handler with a mock `ctx`.

### Add export to runtime API

1. Export from source module.
2. Re-export in `runtime.ts` with `.js` paths.
3. Run `npm run build && npm run check:exports`.

### Debug the extension in pi

```bash
CLIPROXY_DEBUG=1 pi -e /path/to/dist/index.js
```

Check logs under `~/.local/share/pi/log/` (`service=cliproxy`).

## Release Checklist

1. Bump `package.json` version (must be **new** — npm rejects already-published versions).
2. Update `CHANGELOG.md`.
3. `npm run prepublishOnly` — must pass.
4. `npm test` and optionally `npm run test:integration`.
5. Push tag `vX.Y.Z` (must match `package.json` version, e.g. `v2.0.1` ↔ `2.0.1`).
6. Tag push triggers **Publish to npm** (`.github/workflows/publish.yml`), or run workflow manually on `main`.

### npm trusted publishing

| Setting | Value |
|---------|-------|
| npm package | [pi-cliproxiapi-auth](https://www.npmjs.com/package/pi-cliproxiapi-auth) |
| GitHub user | `GRomR1` (**case-sensitive** — not `gromr1`) |
| Repository | `pi-cliproxiapi-auth` |
| Workflow file | `publish.yml` |
| Allowed action | `npm publish` |

`package.json` → `repository.url` must use `GRomR1` casing. CI/publish: Node 24, `checkout@v6`, `setup-node@v6`.

**CI:** `.github/workflows/ci.yml` on push/PR.

Package name: **`pi-cliproxiapi-auth`**. Provider slug: **`cliproxy`**.
