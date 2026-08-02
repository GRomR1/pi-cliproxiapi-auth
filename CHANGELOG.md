# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `omp install` one-liner installation instructions in README.

### Fixed

- Documentation: correct settings file path is `~/.local/share/pi/agent/cliproxy.json`, not `~/.pi/agent/cliproxy.json`.
- Added `antigravity → anthropic` provider alias for CLIProxyAPI models.dev enrichment.

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

- **`/cliproxy-connect`** — interactive setup (base URL + optional API key), persisted to `~/.pi/agent/cliproxy.json`
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

[Unreleased]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.1...main
[1.0.1]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/GRomR1/pi-cliproxiapi-auth/releases/tag/v1.0.0
