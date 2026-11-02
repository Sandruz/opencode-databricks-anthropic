import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Config, PluginInput } from "@opencode-ai/plugin"
import { describe, expect, it } from "vitest"

import { DatabricksAnthropicPlugin } from "../src/index.js"

const settings = {
  env: {
    ANTHROPIC_BASE_URL: "https://example.com/ai-gateway/anthropic/",
    ANTHROPIC_AUTH_TOKEN: "synthetic-secret",
    ANTHROPIC_CUSTOM_HEADERS: "x-databricks-use-coding-agent-mode: true",
  },
}

async function settingsFile(): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "databricks-anthropic-"))
  const path = join(directory, "settings.json")
  await writeFile(path, JSON.stringify(settings))
  return { directory, path }
}

function pluginInput(directory: string): PluginInput {
  return { directory } as PluginInput
}

describe("DatabricksAnthropicPlugin", () => {
  it("configures defaults through the real config hook", async () => {
    const fixture = await settingsFile()
    const hooks = await DatabricksAnthropicPlugin(pluginInput("/workspace"), {
      settingsPath: fixture.path,
    })
    const config: Config = {}

    await hooks.config?.(config)

    expect(config.model).toBe("databricks-anthropic/system.ai.claude-opus-5-5")
    expect(config.small_model).toBe("databricks-anthropic/system.ai.claude-haiku-4-5")
    expect(Object.keys(config.provider?.["databricks-anthropic"].models ?? {})).toHaveLength(3)
    expect(config.provider?.["databricks-anthropic"].options).toMatchObject({
      authToken: "synthetic-secret",
      baseURL: "https://example.com/ai-gateway/anthropic/v1",
    })
  })

  it("reads settings when each config hook invocation runs", async () => {
    const fixture = await settingsFile()
    const hooks = await DatabricksAnthropicPlugin(pluginInput("/workspace"), {
      settingsPath: fixture.path,
    })
    await writeFile(fixture.path, "invalid after plugin initialization")

    await expect(hooks.config?.({})).rejects.toThrow("contains invalid JSON")
  })

  it("resolves a custom relative path and applies custom options", async () => {
    const fixture = await settingsFile()
    const hooks = await DatabricksAnthropicPlugin(pluginInput(fixture.directory), {
      settingsPath: "settings.json",
      providerId: "gateway",
      defaultModel: "large",
      smallModel: "small",
      models: {
        large: {
          name: "Large",
          compatibility: { supportsThinkingBlockBinding: false, supportsEffortUpdates: false },
        },
        small: { name: "Small" },
      },
    })
    const config: Config = {}

    await hooks.config?.(config)

    expect(config.model).toBe("gateway/large")
    expect(config.small_model).toBe("gateway/small")
    expect(Object.keys(config.provider?.gateway.models ?? {})).toEqual(["large", "small"])
    expect(config.provider?.gateway.models.large.compatibility).toEqual({
      supportsThinkingBlockBinding: false,
      supportsEffortUpdates: false,
    })
    expect(config.provider?.gateway.models.small).not.toHaveProperty("compatibility")
  })

  it("strips the unsupported thinking.blockBinding field injected by opencode core", async () => {
    const fixture = await settingsFile()
    const hooks = await DatabricksAnthropicPlugin(pluginInput("/workspace"), {
      settingsPath: fixture.path,
    })
    const output = {
      temperature: 0,
      topP: 1,
      topK: 0,
      maxOutputTokens: undefined,
      options: { thinking: { type: "adaptive", blockBinding: { prefixMismatchBehavior: "drop_block" } } },
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "session",
        agent: "build",
        model: { providerID: "databricks-anthropic" } as any,
        provider: {} as any,
        message: {} as any,
      },
      output,
    )

    expect(output.options.thinking).toEqual({ type: "adaptive" })
  })

  it("rejects invalid options during initialization before reading settings", async () => {
    await expect(DatabricksAnthropicPlugin(pluginInput("/missing"), {
      settingsPath: "does-not-exist.json",
      providerId: "",
    })).rejects.toThrow("providerId must be a nonempty string")
  })
})
