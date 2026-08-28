import type { Config } from "@opencode-ai/plugin"

import { normalizeBaseUrl, type GatewaySettings } from "./settings.js"
import type { NormalizedOptions } from "./types.js"

export function applyProvider(
  config: Config,
  options: NormalizedOptions,
  settings: GatewaySettings,
): void {
  if (
    Object.hasOwn(config, "provider")
    && config.provider
    && Object.hasOwn(config.provider, options.providerId)
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
