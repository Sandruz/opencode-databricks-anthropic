import type { Config } from "@opencode-ai/plugin"
import { describe, expect, it } from "vitest"

import { applyProvider } from "../src/provider.js"
import type { NormalizedOptions } from "../src/types.js"
import type { GatewaySettings } from "../src/settings.js"

const options: NormalizedOptions = {
  providerId: "custom-provider",
  defaultModel: "model-large",
  smallModel: "model-small",
  models: {
    "model-large": {
      name: "Large Model",
      context: 200000,
      output: 64000,
      reasoning: true,
      toolCall: true,
    },
    "model-small": {
      name: "Small Model",
      context: 100000,
      output: 8192,
      reasoning: false,
      toolCall: false,
    },
  },
}

const settings: GatewaySettings = {
  baseUrl: "https://workspace.example/gateway/",
  authToken: "synthetic-secret",
  codingAgentMode: "enabled",
}

describe("applyProvider", () => {
  it("adds the complete provider and selects its models", () => {
    const config: Config = {}

    applyProvider(config, options, settings)

    expect(config).toEqual({
      provider: {
        "custom-provider": {
          npm: "@ai-sdk/anthropic",
          name: "Databricks Anthropic",
          options: {
            authToken: "synthetic-secret",
            baseURL: "https://workspace.example/gateway/v1",
            setCacheKey: true,
          },
          whitelist: ["model-large", "model-small"],
          models: {
            "model-large": {
              name: "Large Model",
              reasoning: true,
              tool_call: true,
              limit: { context: 200000, output: 64000 },
              headers: { "x-databricks-use-coding-agent-mode": "enabled" },
            },
            "model-small": {
              name: "Small Model",
              reasoning: false,
              tool_call: false,
              limit: { context: 100000, output: 8192 },
              headers: { "x-databricks-use-coding-agent-mode": "enabled" },
            },
          },
        },
      },
      model: "custom-provider/model-large",
      small_model: "custom-provider/model-small",
    })
  })

  it("omits model headers when coding-agent mode is absent", () => {
    const config: Config = {}

    applyProvider(config, options, { ...settings, codingAgentMode: undefined })

    expect(config.provider?.["custom-provider"].models?.["model-large"].headers).toBeUndefined()
    expect(config.provider?.["custom-provider"].models?.["model-small"].headers).toBeUndefined()
  })

  it("rejects an existing own provider ID without exposing the token", () => {
    const config: Config = { provider: { "custom-provider": { name: "Existing" } } }

    expect(() => applyProvider(config, options, settings)).toThrow(
      "opencode-databricks-anthropic: provider custom-provider is already configured",
    )
    expect(() => applyProvider(config, options, settings)).not.toThrow("synthetic-secret")
  })

  it("rejects a non-enumerable own provider ID", () => {
    const provider = {}
    Object.defineProperty(provider, "custom-provider", {
      value: { name: "Hidden Existing" },
    })
    const config: Config = { provider }

    expect(() => applyProvider(config, options, settings)).toThrow(
      "opencode-databricks-anthropic: provider custom-provider is already configured",
    )
  })

  it("re-applies idempotently when the config hook runs twice against the same shared config object", () => {
    // Regression test: opencode's host process can cache/reuse the same
    // Config object across multiple session/run invocations of the plugin's
    // config hook within one long-lived server process. Since applyProvider
    // mutates config in place, a naive "already configured" guard would
    // mistake its own earlier mutation for a genuine third-party conflict on
    // the second invocation, permanently breaking the provider. Verify the
    // second call on the same object succeeds and still yields a correct,
    // freshly-built provider entry rather than throwing.
    const config: Config = {}

    applyProvider(config, options, settings)
    expect(() => applyProvider(config, options, settings)).not.toThrow()

    expect(config).toEqual({
      provider: {
        "custom-provider": {
          npm: "@ai-sdk/anthropic",
          name: "Databricks Anthropic",
          options: {
            authToken: "synthetic-secret",
            baseURL: "https://workspace.example/gateway/v1",
            setCacheKey: true,
          },
          whitelist: ["model-large", "model-small"],
          models: {
            "model-large": {
              name: "Large Model",
              reasoning: true,
              tool_call: true,
              limit: { context: 200000, output: 64000 },
              headers: { "x-databricks-use-coding-agent-mode": "enabled" },
            },
            "model-small": {
              name: "Small Model",
              reasoning: false,
              tool_call: false,
              limit: { context: 100000, output: 8192 },
              headers: { "x-databricks-use-coding-agent-mode": "enabled" },
            },
          },
        },
      },
      model: "custom-provider/model-large",
      small_model: "custom-provider/model-small",
    })
  })

  it("still rejects a same-named own-looking entry from a genuinely different plugin", () => {
    // A third-party entry that happens to share the npm package and display
    // name is treated as "own" by design (best-effort self-detection); this
    // test documents that boundary rather than asserting a false conflict.
    // A different npm package or name must still be rejected as a conflict.
    const config: Config = {
      provider: {
        "custom-provider": { npm: "@ai-sdk/anthropic", name: "Some Other Plugin" },
      },
    }

    expect(() => applyProvider(config, options, settings)).toThrow(
      "opencode-databricks-anthropic: provider custom-provider is already configured",
    )
  })

  it("ignores an inherited provider ID and creates an own entry", () => {
    const inherited = { "custom-provider": { name: "Inherited" } }
    const config: Config = { provider: Object.create(inherited) }

    applyProvider(config, options, settings)

    expect(Object.hasOwn(config.provider ?? {}, "custom-provider")).toBe(true)
    expect(inherited["custom-provider"]).toEqual({ name: "Inherited" })
  })

  it("safely creates an own entry if internal input bypasses parser validation", () => {
    const config: Config = {}

    applyProvider(config, { ...options, providerId: "__proto__" }, settings)

    expect(Object.hasOwn(config.provider ?? {}, "__proto__")).toBe(true)
    expect(Object.getPrototypeOf(config.provider)).toBe(Object.prototype)
  })

  it("does not mutate an inherited provider object", () => {
    const inheritedProvider = { existing: { name: "Inherited" } }
    const config = Object.create({ provider: inheritedProvider }) as Config

    applyProvider(config, options, settings)

    expect(Object.hasOwn(config, "provider")).toBe(true)
    expect(inheritedProvider).toEqual({ existing: { name: "Inherited" } })
  })

  it("creates isolated provider, model, limit, and header objects", () => {
    const first: Config = {}
    const second: Config = {}

    applyProvider(first, options, settings)
    applyProvider(second, options, settings)

    const firstProvider = first.provider?.["custom-provider"]
    const secondProvider = second.provider?.["custom-provider"]
    const firstLarge = firstProvider?.models?.["model-large"]
    const firstSmall = firstProvider?.models?.["model-small"]
    expect(firstProvider).not.toBe(secondProvider)
    expect(firstLarge).not.toBe(firstSmall)
    expect(firstLarge?.limit).not.toBe(firstSmall?.limit)
    expect(firstLarge?.headers).not.toBe(firstSmall?.headers)
    expect(firstProvider?.options).not.toBe(settings)
    expect(firstLarge).not.toBe(options.models["model-large"])
  })
})
