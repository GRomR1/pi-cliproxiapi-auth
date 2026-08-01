# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/GRomR1/pi-cliproxiapi-auth/compare/v1.0.0...main
[1.0.0]: https://github.com/GRomR1/pi-cliproxiapi-auth/releases/tag/v1.0.0
