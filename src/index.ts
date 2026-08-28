import type { Plugin } from "@opencode-ai/plugin"
import { parseOptions } from "./options.js"
import { applyProvider } from "./provider.js"
import { loadClaudeSettings, resolveSettingsPath } from "./settings.js"

export const DatabricksAnthropicPlugin: Plugin = async ({ directory }, rawOptions) => {
  const options = parseOptions(rawOptions)
  const settingsPath = resolveSettingsPath(options.settingsPath, directory)

  return {
    config: async (config) => {
      const settings = await loadClaudeSettings(settingsPath)
      applyProvider(config, options, settings)
    },
  }
}
