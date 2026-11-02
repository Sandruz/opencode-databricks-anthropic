import type { Config } from "@opencode-ai/plugin"

import { normalizeBaseUrl, type GatewaySettings } from "./settings.js"
import type { NormalizedOptions } from "./types.js"

const OWN_PROVIDER_NPM = "@ai-sdk/anthropic"
const OWN_PROVIDER_NAME = "Databricks Anthropic"

/**
 * Detects whether an existing `config.provider[providerId]` entry was
 * created by this same plugin on a prior invocation, rather than by a
 * different plugin/user config genuinely claiming the same providerId.
 *
 * Why this matters: opencode's host process may reuse/cache the same
 * `Config` object across multiple session/run invocations of the plugin's
 * `config` hook within one long-lived server process. Since `applyProvider`
 * mutates `config` in place, a second invocation against that same shared
 * object would otherwise see its own earlier mutation and mistake it for a
 * real conflict, permanently breaking the provider for every subsequent
 * session until the server process is fully restarted. Recognizing "this is
 * just me again" lets the hook safely re-apply (idempotent) instead of
 * throwing, while still throwing on a genuine third-party conflict.
 */
function isOwnProviderEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false
  const candidate = entry as { npm?: unknown; name?: unknown }
  return candidate.npm === OWN_PROVIDER_NPM && candidate.name === OWN_PROVIDER_NAME
}

export function applyProvider(
  config: Config,
  options: NormalizedOptions,
  settings: GatewaySettings,
): void {
  if (
    Object.hasOwn(config, "provider")
    && config.provider
    && Object.hasOwn(config.provider, options.providerId)
    && !isOwnProviderEntry(config.provider[options.providerId])
  ) {
    throw new Error(
      `opencode-databricks-anthropic: provider ${options.providerId} is already configured`,
    )
  }

  const configuredProviders = Object.hasOwn(config, "provider") && config.provider
    ? Object.fromEntries(Object.entries(config.provider))
    : {}

  const models = Object.fromEntries(Object.entries(options.models).map(([id, model]) => [
    id,
    {
      name: model.name,
      reasoning: model.reasoning,
      tool_call: model.toolCall,
      limit: { context: model.context, output: model.output },
      ...(model.compatibility === undefined ? {} : { compatibility: model.compatibility }),
      ...(settings.codingAgentMode === undefined
        ? {}
        : { headers: { "x-databricks-use-coding-agent-mode": settings.codingAgentMode } }),
    },
  ]))

  Object.defineProperty(configuredProviders, options.providerId, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      npm: "@ai-sdk/anthropic",
      name: "Databricks Anthropic",
      options: {
        authToken: settings.authToken,
        baseURL: normalizeBaseUrl(settings.baseUrl),
        setCacheKey: true,
      },
      whitelist: Object.keys(models),
      models,
    },
  })

  Object.defineProperties(config, {
    provider: { configurable: true, enumerable: true, writable: true, value: configuredProviders },
    model: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: `${options.providerId}/${options.defaultModel}`,
    },
    small_model: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: `${options.providerId}/${options.smallModel}`,
    },
  })
}
