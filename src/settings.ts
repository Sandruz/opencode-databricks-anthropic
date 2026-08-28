/// <reference types="node" />

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

export type GatewaySettings = {
  baseUrl: string
  authToken: string
  codingAgentMode?: string
}

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

export function resolveSettingsPath(explicitPath: string | undefined, cwd: string): string {
  const configured = explicitPath
    ?? (process.env.CLAUDE_CONFIG_DIR
      ? join(process.env.CLAUDE_CONFIG_DIR, "settings.json")
      : "~/.claude/settings.json")

  if (configured === "~") return homedir()
  if (configured.startsWith("~/")) return join(homedir(), configured.slice(2))
  return isAbsolute(configured) ? configured : resolve(cwd, configured)
}

function requiredString(env: Record<string, unknown>, key: string, path: string): string {
  const value = hasOwn(env, key) ? env[key] : undefined
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`opencode-databricks-anthropic: ${key} is missing or empty in ${path}`)
  }
  return value
}

export function parseCodingAgentHeader(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new Error("opencode-databricks-anthropic: ANTHROPIC_CUSTOM_HEADERS must be a string")
  }

  for (const line of value.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator < 0) continue
    const name = line.slice(0, separator).trim().toLowerCase()
    if (name === "x-databricks-use-coding-agent-mode") {
      return line.slice(separator + 1).trim() || undefined
    }
  }
  return undefined
}

export function normalizeBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("opencode-databricks-anthropic: ANTHROPIC_BASE_URL must be a valid URL")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("opencode-databricks-anthropic: ANTHROPIC_BASE_URL must use HTTP or HTTPS")
  }
  if (url.username || url.password) {
    throw new Error("opencode-databricks-anthropic: ANTHROPIC_BASE_URL must not contain credentials")
  }
  if (url.search || url.hash || value.includes("?") || value.includes("#")) {
    throw new Error("opencode-databricks-anthropic: ANTHROPIC_BASE_URL must not contain a query or hash")
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`
  return url.toString()
}

export async function loadClaudeSettings(path: string): Promise<GatewaySettings> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    const reason = error instanceof SyntaxError ? "contains invalid JSON" : "cannot be read"
    throw new Error(`opencode-databricks-anthropic: Claude settings ${path} ${reason}`)
  }

  const root = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined
  const candidate = root && hasOwn(root, "env") ? root.env : undefined
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`opencode-databricks-anthropic: env object is missing in ${path}`)
  }
  const env = candidate as Record<string, unknown>
  const customHeaders = hasOwn(env, "ANTHROPIC_CUSTOM_HEADERS") ? env.ANTHROPIC_CUSTOM_HEADERS : undefined

  return {
    baseUrl: requiredString(env, "ANTHROPIC_BASE_URL", path),
    authToken: requiredString(env, "ANTHROPIC_AUTH_TOKEN", path),
    codingAgentMode: parseCodingAgentHeader(customHeaders),
  }
}
