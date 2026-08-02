# pi-cliproxiapi-auth

OMP / [pi-mono](https://github.com/earendil-works/pi) extension for
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI). Connect pi to a
running CLIProxyAPI instance, authenticate with an optional API key, and
discover models from `/v1/models` with enrichment from CLIProxyAPI's
`models.json` registry and [models.dev](https://models.dev/).

> **Based on [`opencode-cliproxiapi-auth`](https://github.com/GRomR1/opencode-cliproxiapi-auth).**
> v1 of this project shipped as an [OpenCode](https://opencode.ai) plugin. v2
> is a clean port to the pi-mono extension API — see [CHANGELOG.md](./CHANGELOG.md)
> for the full list of breaking changes.

## Features

- **`/cliproxy-connect`** — interactive setup (base URL + optional API key), persisted to `~/.local/share/pi/agent/cliproxy.json`
- **Provider `cliproxy`** — auto-registered with the live model list
- **Dynamic models** — fetched from CLIProxyAPI `/v1/models` with TTL cache and singleflight dedup
- **models.json enrichment** — defaults to the CLIProxyAPI registry URL; override with a local path or custom URL
- **models.dev enrichment** — fills missing metadata (graceful fallback)
- **Thinking / reasoning** — sets OMP `reasoning: true` from CLIProxyAPI `thinking.levels`; the level itself is picked per-session via `/thinking`
- **Optional API key** — works when CLIProxyAPI runs without `api-keys`
- **Fallback models** — sensible defaults when the server is unreachable
- **Safe logging** — API keys, bearer tokens, and `sk-*` values are redacted from logs
- **`/cliproxy-refresh` / `/cliproxy-status` / `/cliproxy-logout`** — manual control over the registered provider

## Requirements

- [pi-mono](https://github.com/earendil-works/pi) ≥ 0.80.7 (extension API with `registerProvider` / `registerCommand`)
- Node.js ≥ 22.14 (matches the pi-mono runtime)
- Running [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (default port `8317`)

## Installation

### Quick install

```bash
omp install npm:pi-cliproxiapi-auth
✔ Installed pi-cliproxiapi-auth@1.0.1
```

### Manual (via pi settings)

Add the package to `~/.pi/settings.json` or project-local `.pi/settings.json`:

```json
{
  "packages": [
    "npm:pi-cliproxiapi-auth@^1.0.0"
  ]
}
```

Then restart pi. The `cliproxy` provider is registered automatically on
startup.

### Local development

```bash
git clone https://github.com/GRomR1/pi-cliproxiapi-auth.git
cd pi-cliproxiapi-auth
npm install
npm run build
```

Either install as a local package (recommended):

```json
{
  "packages": [
    "/absolute/path/to/pi-cliproxiapi-auth"
  ]
}
```

…or load the built file directly for quick iteration:

```bash
pi -e /absolute/path/to/pi-cliproxiapi-auth/dist/index.js
```

## Quick Start

### 1. Start CLIProxyAPI

Default endpoint: `http://localhost:8317/v1`.

If `api-keys` is set in CLIProxyAPI's `config.yaml`, use one of those keys.
If omitted, no key is required.

### 2. Connect in pi

```
/cliproxy-connect
```

Prompts:

| Field | Default | Notes |
|-------|---------|-------|
| Base URL | `http://localhost:8317/v1` | Include `/v1` suffix |
| API key | *(empty)* | Optional if CLIProxyAPI has no `api-keys` |

Credentials are stored in `~/.local/share/pi/agent/cliproxy.json`.

### 3. Verify models

```bash
pi --list-models
```

Models appear as `cliproxy/<model-id>`, e.g. `cliproxy/claude-sonnet-4-6`.

### 4. Use a model

```bash
pi -m cliproxy/gpt-5.4-mini
```

## Commands

| Command | Description |
|---------|-------------|
| `/cliproxy-connect` | Configure base URL and API key (interactive). |
| `/cliproxy-refresh` | Force-refresh the model list from the server. |
| `/cliproxy-status` | Show the current base URL, API key state, and model count. |
| `/cliproxy-logout` | Clear the saved credentials. |

## Configuration

The runtime reads (in order of precedence):

1. `~/.local/share/pi/agent/cliproxy.json` (written by `/cliproxy-connect`)
2. `CLIPROXY_BASE_URL` and `CLIPROXY_API_KEY` environment variables
3. Built-in defaults (`http://localhost:8317/v1`, no API key)

The settings file shape:

```json
{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "your-key-from-config.yaml",
  "modelsJsonPath": "https://raw.githubusercontent.com/router-for-me/CLIProxyAPI/refs/heads/main/internal/registry/models/models.json",
  "modelsDev": {
    "enabled": true
  }
}
```

### `models.json` enrichment

`/v1/models` typically returns minimal metadata. By default the extension
loads CLIProxyAPI's registry from GitHub (`DEFAULT_MODELS_JSON_URL`), so
thinking levels and token limits are populated in most setups without
additional configuration.

| CLIProxyAPI `models.json` field | OMP model field |
|----------------------------------|-----------------|
| `context_length` / `inputTokenLimit` | `contextWindow` |
| `max_completion_tokens` / `outputTokenLimit` | `maxTokens` |
| `display_name` | `name` |
| `description` | `description` |
| `thinking.levels` | sets `reasoning: true` on the model |

Override with a local path or custom URL via the `modelsJsonPath` setting.

### `modelsDev` enrichment

When `modelsDev.enabled` is `true` (default), the extension enriches each
model with metadata from [models.dev](https://models.dev/) (context window,
output tokens, modality flags, pricing). Set `enabled: false` to disable
network access.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modelsDev.enabled` | boolean | `true` | Enrich from models.dev |
| `modelsDev.url` | string | `https://models.dev/api.json` | models.dev API URL |
| `modelsDev.cacheTtl` | number | `86400000` | models.dev cache TTL (ms) |
| `modelsDev.timeoutMs` | number | `5000` | models.dev fetch timeout (ms) |
| `modelsDev.providerAliases` | object | — | Map `owned_by` → models.dev provider |

## Runtime API

For scripts and manual cache control:

```typescript
import {
  fetchModels,
  clearModelCache,
  refreshModels,
  resolveSettings,
  readSettings,
  writeSettings,
  deleteSettings,
  CLIPROXY_PROVIDER_ID,
  CLIPROXY_ENDPOINTS,
  toOmpModel,
} from 'pi-cliproxiapi-auth/runtime';
```

## Development

```bash
npm run build              # tsc -> dist/
npm test                   # build + unit tests (mocked, no network)
npm run test:integration   # build + live tests against CLIProxyAPI (requires .env)
npm run check:exports      # validate extension exports for OMP loader
npm run prepublishOnly     # clean + build + check:exports
```

Test files live in `test/`. They import from `dist/`, so `npm test` always
runs the latest compiled output.

## Releasing

```bash
# 1. Bump version (updates package.json)
npm version patch --no-git-tag-version   # 1.0.2 → 1.0.3
# or: npm version minor --no-git-tag-version
# or: npm version major --no-git-tag-version

# 2. Update CHANGELOG.md — move [Unreleased] items into new version section

# 3. Commit
git add -A
git commit -m "release: v1.0.3"

# 4. Tag and push (push tag separately!)
git tag v1.0.3
git push origin v1.0.3

# 5. Push branch
git push origin master
```

CI publishes to npm automatically via OIDC trusted publishing. Check status:

```bash
gh run list --workflow=publish.yml --limit 3
```

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- Original [OpenCode plugin](https://github.com/GRomR1/opencode-cliproxiapi-auth) — same author, v1.x.
- OMP / pi-mono — see [earendil-works/pi](https://github.com/earendil-works/pi) and the [extensions API reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).
