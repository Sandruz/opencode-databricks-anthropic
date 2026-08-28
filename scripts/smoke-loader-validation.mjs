export function validateLoaderResult(result, syntheticToken) {
  if (result.code !== 0) throw new Error("OpenCode loader smoke failed")
  if (result.stderr.includes(syntheticToken)) {
    throw new Error("OpenCode loader smoke wrote synthetic credentials to stderr")
  }

  let resolvedConfig
  try {
    resolvedConfig = JSON.parse(result.stdout)
  } catch {
    throw new Error("OpenCode loader returned invalid config output")
  }
  const provider = resolvedConfig.provider?.["private-anthropic"]
  const models = Object.keys(provider?.models ?? {}).sort()
  const expected = ["private-large", "private-small"]
  if (
    resolvedConfig.model !== "private-anthropic/private-large"
    || resolvedConfig.small_model !== "private-anthropic/private-small"
    || JSON.stringify(models) !== JSON.stringify(expected)
    || JSON.stringify(provider?.whitelist) !== JSON.stringify(expected)
  ) {
    throw new Error("OpenCode loader resolved unexpected config")
  }
}
