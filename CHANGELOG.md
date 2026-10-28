# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-10-27

### Fixed

- Ported live integration tests from `opencode` to native `omp models` CLI.
- Updated live chat-completion integration assertions to handle reasoning outputs and thinking content.
- Cleaned up legacy OpenCode/plugin references across CI workflows, test suite, and LICENSE copyright.

## [1.1.0] - 2026-10-27

### Added

- Dynamic `thinkingLevelMap` generation based on CLIProxyAPI `thinking.levels` metadata; unsupported levels are set to `null` so pi disables them in the TUI selector.
- Automatic thinking format inference (`compat.thinkingFormat`) prioritizing transport providers over model architecture (`together`, `openrouter`, `deepseek`, `qwen`/`alibaba`, `zai`, `openai`).
- `compat` and `modelCompat` configuration in `cliproxy.json` allowing user-defined custom provider thinking formats (`openai`, `qwen`, `deepseek`, `together`, `zai`, `chat-template`, etc.) and explicit `reasoning: true | false` overrides.
- Automatic `reasoning: true` detection for self-hosted models by name patterns (`-r1`, `-thinking`, `-reasoner`).
- `/cliproxy-models` command to list all registered CLIProxyAPI models with context limits, vision, and thinking capabilities.

## [1.0.3] - 2026-10-27

### Fixed

- Correct context window and limits for Qwen and open-weights models (e.g. `qwen38-27b`, `qwen3.8-27b`) by adding Alibaba/Qwen provider aliases, normalizing version formats, and matching consensus limits across multi-host providers.
- Preserved `modelsDev` user configuration in `resolveSettings` and during `/cliproxy-connect` command execution.
- Set secure `0o600` file permissions on `cliproxy.json` on both new and existing files.
- Preserved upstream `/v1/models` context and token limits (`context_length`, `max_tokens`) during API model normalization.
- Handled concurrent log rotation errors gracefully in `findLogFile`.
- Stripped trailing slash from `baseUrl` in `model-fetcher.ts` (API call and cache key) to prevent malformed URLs and duplicate fetches.

## [1.0.2] - 2026-08-01

### Added

- `omp install` one-liner installation instructions in README.

### Fixed

- Documentation: correct settings file path is `~/.local/share/pi/agent/cliproxy.json`, not `~/.pi/agent/cliproxy.json`.
- Added `antigravity` provider inference from model ID prefix (CLIProxyAPI uses `owned_by: "antigravity"` for all providers).
- `normalizeModelKey` now strips `-low/-high/-medium/-extra` suffixes to match more models.dev entries. Keeps `-lite` and `-agent` as they are separate models.

## [1.0.1] - 2026-08-01

### Fixed

- `registerProvider` now awaits the first `/v1/models` fetch before registering — OMP snapshots models at registration time, a second call does not update them.
- `/cliproxy-logout` deletes the settings file instead of writing defaults, so env vars take precedence after logout.
- Error sanitization in `models.json` loader (`formatErrorForLog()` applied consistently).
- `publish.yml` checks the correct package name for npm version verification.

### Changed

- Removed `sleep()` retry loop from `models.dev` fetcher — single attempt + stale cache fallback reduces startup latency.
- Removed persistent `setStatus` widget from `session_start` handler.
- Added `deleteSettings()` to runtime API.
- Warns if fewer than 10 models are loaded (visible without `CLIPROXY_DEBUG=1`).

### Added

- `test:integration` script in `package.json`.
- Negative integration tests: invalid API key, unreachable server.

## [1.0.0] - 2026-08-01

Initial release as a [pi-mono](https://github.com/earendil-works/pi) (OMP) extension.

### Features

- **`/cliproxy-connect`** — interactive setup (base URL + optional API key), persisted to `~/.local/share/pi/agent/cliproxy.json`
- **Provider `cliproxy`** — auto-registered with the live model list
- **Dynamic models** — fetched from CLIProxyAPI `/v1/models` with TTL cache and singleflight dedup
- **models.json enrichment** — defaults to the CLIProxyAPI registry URL; override with a local path or custom URL
- **models.dev enrichment** — fills missing metadata (graceful fallback)
- **Thinking / reasoning** — sets OMP `reasoning: true` from CLIProxyAPI `thinking.levels`
- **Optional API key** — works when CLIProxyAPI runs without `api-keys`
- **Fallback models** — sensible defaults when the server is unreachable
- **Safe logging** — API keys, bearer tokens, and `sk-*` values are redacted from logs
- **`/cliproxy-refresh` / `/cliproxy-status` / `/cliproxy-logout`** — manual control over the registered provider
- **Runtime API** — `fetchModels`, `clearModelCache`, `refreshModels`, `resolveSettings`, `readSettings`, `writeSettings`, `deleteSettings`, normalizers
- Unit tests (42) + integration tests (6)

[Unreleased]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.1.1...main
[1.1.1]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/GRomR1/pi-cliproxiapi-auth/releases/tag/v1.0.0
