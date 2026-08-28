# Databricks Anthropic Plugin Design

## Goal

Publish `opencode-databricks-anthropic`, an OpenCode plugin that configures Anthropic models served through a Databricks AI Gateway. The plugin reads existing Claude settings at startup, so users do not copy Databricks credentials into OpenCode configuration or auth storage.

## Scope

The plugin supports gateways exposing the Anthropic Messages API. It does not support OpenAI-compatible, Gemini, or other model protocols. Initial defaults target the three Databricks model endpoints already used by the reference setup:

- `system.ai.claude-opus-5`
- `system.ai.claude-sonnet-5`
- `system.ai.claude-haiku-4-5`

Users may override model mappings through plugin configuration. Supporting another protocol requires a separate adapter or plugin.

## Package And Runtime

The npm package and repository use the name `opencode-databricks-anthropic`. It is a TypeScript package built as ESM and exports one OpenCode plugin entry point.

Runtime dependencies are limited to `@opencode-ai/plugin` and the provider integration expected by OpenCode. Development dependencies provide TypeScript compilation and tests. Package metadata declares compatible OpenCode and Node.js versions and includes only built output and user documentation in the published artifact.

## Configuration

Users add `opencode-databricks-anthropic` to OpenCode's plugin list. Optional settings use OpenCode's plugin tuple syntax, where the second element is passed to this plugin only:

```json
{
  "plugin": [
    [
      "opencode-databricks-anthropic",
      {
        "settingsPath": "~/.claude/settings.json",
        "providerId": "databricks-anthropic",
        "models": {
          "system.ai.claude-opus-5": {
            "name": "Claude Opus 5"
          }
        }
      }
    ]
  ]
}
```

Defaults are:

- Settings path: `$CLAUDE_CONFIG_DIR/settings.json` when `CLAUDE_CONFIG_DIR` is set, otherwise `~/.claude/settings.json`
- Provider ID: `databricks-anthropic`
- Default model: `system.ai.claude-opus-5`
- Small model: `system.ai.claude-haiku-4-5`
- Context limit: `200000`
- Output limit: `64000`
- Reasoning and tool calls: enabled for all default models

Model configuration is a replacement map, not a merge with the three defaults. If `models` is omitted, all three defaults are registered. If provided, only listed models are registered. Each model can set its display name, context limit, output limit, reasoning support, and tool-call support. Default and small model IDs must reference registered models; invalid combinations fail startup with a clear error.

## Claude Settings Input

The plugin reads these keys from the Claude settings file's `env` object:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_CUSTOM_HEADERS`

`ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` must be nonempty strings. `ANTHROPIC_CUSTOM_HEADERS` is optional. Its value uses Claude's newline-delimited `Name: value` format. The plugin extracts `x-databricks-use-coding-agent-mode` case-insensitively and ignores unrelated headers.

The settings path supports `~` expansion. Relative paths resolve from OpenCode's startup working directory. The plugin reads the file once during configuration and does not log, persist, return, or copy the token into OpenCode auth storage.

## Provider Registration

The OpenCode `config` hook mutates runtime configuration to add one provider:

- Provider package: `@ai-sdk/anthropic`
- Base URL: normalized gateway URL with exactly one `/v1` suffix
- Credential option: `authToken`, producing `Authorization: Bearer <token>`
- Header: `x-databricks-use-coding-agent-mode` when supplied by Claude settings
- Models: configured replacement map or three defaults

The hook also sets OpenCode's default and small models when their plugin options are present or defaulted. Fully qualified model IDs use `<providerId>/<modelId>`.

Provider collision is rejected: if another configuration source already defines the selected provider ID, startup fails rather than silently replacing it. This makes plugin ownership explicit and prevents ambiguous auth behavior.

## Data Flow

1. OpenCode loads plugin and passes mutable runtime configuration to its `config` hook.
2. Plugin validates its optional tuple configuration.
3. Plugin resolves and reads Claude settings.
4. Plugin validates gateway URL and token, then parses optional coding-agent header.
5. Plugin builds provider and model definitions in memory.
6. Plugin adds provider and qualified default model IDs to runtime configuration.
7. OpenCode's Anthropic adapter sends Messages API requests to `<gateway>/v1/messages` with Bearer auth.

No launcher script or shell environment translation remains after migration.

## Errors And Security

Startup fails with actionable messages for unreadable JSON, missing required keys, invalid URLs, malformed plugin options, empty model maps, unknown default model IDs, and provider collisions. Errors identify key or file path but never include credential values.

The token necessarily exists in plugin process memory and provider runtime options because the Anthropic adapter needs it. It is not written elsewhere. Tests use synthetic tokens and temporary settings files. Logging and thrown errors are checked to ensure synthetic secrets never appear.

## Testing

Unit tests cover:

- Default and custom settings-path resolution
- Required Claude settings validation
- Header parsing and case handling
- `/v1` URL normalization without duplicate suffixes
- Default model definitions and replacement-map semantics
- Qualified default and small model selection
- Invalid model references and provider collisions
- Secret redaction in failure output

Integration tests invoke the plugin's real `config` hook against an in-memory OpenCode configuration and temporary Claude settings file. They verify the exact provider object consumed by OpenCode, including `authToken`, normalized base URL, header, model capabilities, and limits.

Release validation installs the packed npm artifact into an isolated OpenCode configuration, confirms all expected model IDs, and performs a minimal Haiku request through the Databricks gateway. Live validation consumes the operator's existing Claude settings and prints no credentials.

## Migration

Migration occurs only after package tests, packed-artifact validation, model discovery, and live Haiku inference succeed:

1. Add the published plugin package to global OpenCode configuration.
2. Remove the inline `databricks-anthropic` provider, its model definitions, and related default fields now owned by the plugin.
3. Remove `/home/sf01522/.local/bin/opencode-anthropic`.
4. Launch standard OpenCode directly and repeat model discovery plus live Haiku inference.

Existing unrelated plugins remain unchanged. Migration must be reversible by restoring the prior OpenCode configuration and launcher until direct launch verification passes.

## Repository Deliverables

- TypeScript plugin source with focused configuration, settings parsing, and provider-building modules
- Unit and integration test suite
- Build and package scripts
- README covering installation, configuration, security behavior, troubleshooting, and migration
- npm package metadata and license
- CI for tests, type checking, build, and package-content validation

Publishing credentials and automated npm release workflows are outside initial implementation scope. First publication is a separate explicit operator action after local and live validation.
