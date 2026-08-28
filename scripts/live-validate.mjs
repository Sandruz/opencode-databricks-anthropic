import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export function resolveClaudeSettingsPath(env = process.env, home = homedir(), cwd = process.cwd()) {
  const directory = env.CLAUDE_CONFIG_DIR
  return directory ? resolve(cwd, directory, "settings.json") : join(home, ".claude", "settings.json")
}

export async function preflightClaudeSettings(path, log = console.log) {
  let contents
  try {
    contents = await readFile(path, "utf8")
  } catch {
    throw new Error(`Claude settings ${path} cannot be read`)
  }

  let parsed
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error(`Claude settings ${path} contains invalid JSON`)
  }

  const root = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined
  const candidate = root && hasOwn(root, "env") ? root.env : undefined
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`env object is missing in ${path}`)
  }

  for (const key of ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]) {
    const value = hasOwn(candidate, key) ? candidate[key] : undefined
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${key} is missing or empty in ${path}`)
    }
  }

  log(`Claude settings preflight passed: ${path}`)
  return path
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await preflightClaudeSettings(resolveClaudeSettingsPath())
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Claude settings preflight failed")
    process.exitCode = 1
  }
}
