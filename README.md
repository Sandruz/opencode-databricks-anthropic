# opencode-databricks-anthropic

OpenCode plugin for Anthropic Messages API models served through Databricks AI Gateway.

## Requirements

- OpenCode with plugin tuple options support
- Node.js `^20.19.0 || >=22.12.0`
- Claude settings containing `env.ANTHROPIC_BASE_URL` and `env.ANTHROPIC_AUTH_TOKEN`

## Install

```json
{
  "plugin": ["opencode-databricks-anthropic"]
}
```

Default credential source: `$CLAUDE_CONFIG_DIR/settings.json`, or `~/.claude/settings.json` when `CLAUDE_CONFIG_DIR` is unset.

## Configure

OpenCode tuple configuration passes plugin options as the second tuple item:

```json
{
  "plugin": [
    [
      "opencode-databricks-anthropic",
      {
        "settingsPath": "~/.claude/settings.json",
        "providerId": "databricks-anthropic",
        "defaultModel": "system.ai.claude-opus-5",
        "smallModel": "system.ai.claude-haiku-4-5"
      }
    ]
  ]
}
```

Defaults:

- `settingsPath`: `$CLAUDE_CONFIG_DIR/settings.json`, otherwise `~/.claude/settings.json`
- `providerId`: `databricks-anthropic`
- `defaultModel`: `system.ai.claude-opus-5`
- `smallModel`: `system.ai.claude-haiku-4-5`
- `models`: Opus 5, Sonnet 5, and Haiku 4.5 Databricks endpoints; each defaults to 200,000 context tokens, 64,000 output tokens, reasoning enabled, and tool calls enabled

Supplying `models` replaces the complete default map; it does not merge with defaults. Both `defaultModel` and `smallModel` must reference entries in that replacement map.

Each model field is optional:

- `name`: display name; defaults to the model ID
- `context`: positive integer context-token limit; defaults to `200000`
- `output`: positive integer output-token limit; defaults to `64000`
- `reasoning`: whether OpenCode exposes reasoning support; defaults to `true`
- `toolCall`: whether OpenCode exposes tool-call support; defaults to `true`

## Claude Settings

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://workspace.example/ai-gateway/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "replace-with-your-token",
    "ANTHROPIC_CUSTOM_HEADERS": "x-databricks-use-coding-agent-mode: true"
  }
}
```

`ANTHROPIC_CUSTOM_HEADERS` is optional. The plugin copies only `x-databricks-use-coding-agent-mode`, matched case-insensitively, into model requests.

The provider uses Bearer-token authentication, normalizes the gateway endpoint to end in `/v1`, and registers `@ai-sdk/anthropic`. Only gateways implementing the Anthropic Messages API are supported.

## Credential Lifecycle

Claude settings are read on each OpenCode `config` hook invocation, typically during configuration load. The token is then passed in memory to the provider runtime. Changes take effect on the next hook invocation; restarting or reloading OpenCode configuration is normally required.

## Security

The plugin never writes credentials to OpenCode auth storage and does not log credential values. Protect Claude settings with user-only filesystem permissions, use short-lived tokens where available, and never commit settings or tokens. Avoid URLs containing credentials; they are rejected.

## Troubleshooting

- Missing setting: verify required keys are strings inside the Claude settings `env` object and verify `settingsPath` or `CLAUDE_CONFIG_DIR`.
- `401 Unauthorized`: verify token validity and Databricks gateway permissions for the selected endpoint.
- Unknown API path: set `ANTHROPIC_BASE_URL` to the gateway endpoint without query or fragment; the plugin adds or normalizes `/v1`.
- Provider collision: remove the existing provider with the same ID or choose another `providerId`.
- Unknown default model: include both `defaultModel` and `smallModel` in a custom replacement `models` map.
- Unsupported response or protocol error: confirm the gateway exposes Anthropic Messages API semantics, not an OpenAI-compatible endpoint.

## Migration From Inline Provider

Validate the plugin before changing working global configuration. Add the package to the OpenCode plugin list and test model discovery plus a Haiku request. Only after validation succeeds, remove the inline provider, plugin-owned `model` and `small_model` values, and any custom launcher. Keep rollback copies until direct `opencode` launch passes.

## Development

```sh
npm ci
npm run check
```

`npm run check` runs tests, type checking, a clean build, then packed-artifact validation. Package creation also performs a clean build, while publishing runs the complete check first. Publishing remains an explicit maintainer action; neither build nor CI publishes packages.
