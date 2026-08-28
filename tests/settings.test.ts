import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  loadClaudeSettings,
  normalizeBaseUrl,
  parseCodingAgentHeader,
  resolveSettingsPath,
} from "../src/settings.js"

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const temporaryDirectories: string[] = []

async function writeSettings(contents: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "databricks-anthropic-"))
  temporaryDirectories.push(directory)
  const path = join(directory, "settings.json")
  await writeFile(path, typeof contents === "string" ? contents : JSON.stringify(contents))
  return path
}

afterEach(async () => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe("resolveSettingsPath", () => {
  it("prefers an explicit path and expands home", () => {
    process.env.CLAUDE_CONFIG_DIR = "/ignored"
    expect(resolveSettingsPath("~/.claude/custom.json", "/work")).toBe(join(homedir(), ".claude/custom.json"))
  })

  it("expands a bare home path", () => {
    expect(resolveSettingsPath("~", "/work")).toBe(homedir())
  })

  it("uses CLAUDE_CONFIG_DIR before the default", () => {
    const configDirectory = resolve("claude-config-root")
    process.env.CLAUDE_CONFIG_DIR = configDirectory
    expect(resolveSettingsPath(undefined, resolve("work"))).toBe(join(configDirectory, "settings.json"))
  })

  it("resolves a relative CLAUDE_CONFIG_DIR from startup cwd", () => {
    const cwd = resolve("work")
    process.env.CLAUDE_CONFIG_DIR = "claude-config"
    expect(resolveSettingsPath(undefined, cwd)).toBe(resolve(cwd, "claude-config/settings.json"))
  })

  it("uses the default home settings path", () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(resolveSettingsPath(undefined, "/work")).toBe(join(homedir(), ".claude/settings.json"))
  })

  it("resolves relative explicit paths from startup cwd", () => {
    const cwd = resolve("work")
    expect(resolveSettingsPath("config/claude.json", cwd)).toBe(resolve(cwd, "config/claude.json"))
  })
})

describe("loadClaudeSettings", () => {
  it("loads required values and the coding-agent mode", async () => {
    const path = await writeSettings({
      env: {
        ANTHROPIC_BASE_URL: "https://workspace.example/ai-gateway/anthropic/",
        ANTHROPIC_AUTH_TOKEN: "synthetic-secret",
        ANTHROPIC_CUSTOM_HEADERS: "Other: ignored\nX-Databricks-Use-Coding-Agent-Mode: true",
      },
    })

    await expect(loadClaudeSettings(path)).resolves.toEqual({
      baseUrl: "https://workspace.example/ai-gateway/anthropic/",
      authToken: "synthetic-secret",
      codingAgentMode: "true",
    })
  })

  it.each([
    [{ env: {} }, "ANTHROPIC_BASE_URL"],
    [{ env: { ANTHROPIC_BASE_URL: "https://example.com" } }, "ANTHROPIC_AUTH_TOKEN"],
    [{ env: { ANTHROPIC_BASE_URL: "  ", ANTHROPIC_AUTH_TOKEN: "token" } }, "ANTHROPIC_BASE_URL"],
  ])("rejects missing or empty setting %#", async (contents, key) => {
    const path = await writeSettings(contents)
    await expect(loadClaudeSettings(path)).rejects.toThrow(key)
  })

  it.each([null, [], {}, { env: null }, { env: [] }, { env: "invalid" }])(
    "rejects malformed settings shape %#",
    async (contents) => {
      const path = await writeSettings(contents)
      await expect(loadClaudeSettings(path)).rejects.toThrow(`env object is missing in ${path}`)
    },
  )

  it("identifies malformed JSON without exposing its contents", async () => {
    const path = await writeSettings('{"env":{"ANTHROPIC_AUTH_TOKEN":"synthetic-secret"')
    const error = await loadClaudeSettings(path).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(`${path} contains invalid JSON`)
    expect((error as Error).message).not.toContain("synthetic-secret")
  })

  it("identifies unreadable settings", async () => {
    const path = join(tmpdir(), "missing-databricks-anthropic-settings.json")
    await expect(loadClaudeSettings(path)).rejects.toThrow(`${path} cannot be read`)
  })

  it("ignores inherited credential properties", async () => {
    const path = await writeSettings({ env: {} })
    Object.defineProperties(Object.prototype, {
      ANTHROPIC_BASE_URL: { configurable: true, value: "https://inherited.example" },
      ANTHROPIC_AUTH_TOKEN: { configurable: true, value: "inherited-secret" },
    })

    try {
      await expect(loadClaudeSettings(path)).rejects.toThrow("ANTHROPIC_BASE_URL")
    } finally {
      delete (Object.prototype as Record<string, unknown>).ANTHROPIC_BASE_URL
      delete (Object.prototype as Record<string, unknown>).ANTHROPIC_AUTH_TOKEN
    }
  })
})

describe("parseCodingAgentHeader", () => {
  it("returns undefined for an absent header setting", () => {
    expect(parseCodingAgentHeader(undefined)).toBeUndefined()
  })

  it("rejects a non-string header setting", () => {
    expect(() => parseCodingAgentHeader(42)).toThrow("ANTHROPIC_CUSTOM_HEADERS must be a string")
  })

  it("parses the exact coding-agent header case-insensitively", () => {
    expect(parseCodingAgentHeader("Other: no\nx-DATABRICKS-use-coding-agent-mode:  enabled  ")).toBe("enabled")
  })

  it("ignores partial header-name matches and malformed lines", () => {
    expect(parseCodingAgentHeader("malformed\nPrefix-X-Databricks-Use-Coding-Agent-Mode: yes")).toBeUndefined()
  })

  it("returns undefined for an empty coding-agent header", () => {
    expect(parseCodingAgentHeader("X-Databricks-Use-Coding-Agent-Mode:   ")).toBeUndefined()
  })
})

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://example.com/gateway", "https://example.com/gateway/v1"],
    ["https://example.com/gateway/", "https://example.com/gateway/v1"],
    ["https://example.com/gateway/v1", "https://example.com/gateway/v1"],
    ["https://example.com/gateway/v1/", "https://example.com/gateway/v1"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected)
  })

  it("preserves path segments ending in v1-like text", () => {
    expect(normalizeBaseUrl("https://example.com/gateway/v11")).toBe("https://example.com/gateway/v11/v1")
  })

  it("rejects a query component", () => {
    expect(() => normalizeBaseUrl("https://example.com/gateway?route=one")).toThrow(
      "ANTHROPIC_BASE_URL must not contain a query or hash",
    )
  })

  it("rejects a hash component", () => {
    expect(() => normalizeBaseUrl("https://example.com/gateway#anchor")).toThrow(
      "ANTHROPIC_BASE_URL must not contain a query or hash",
    )
  })

  it.each([
    "https://example.com/gateway?",
    "https://example.com/gateway#",
  ])("rejects an empty query or hash component in %s", (input) => {
    expect(() => normalizeBaseUrl(input)).toThrow("ANTHROPIC_BASE_URL must not contain a query or hash")
  })

  it("rejects a username without exposing it", () => {
    let message = ""
    try {
      normalizeBaseUrl("https://sensitive-user@example.com/gateway")
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain("ANTHROPIC_BASE_URL must not contain credentials")
    expect(message).not.toContain("sensitive-user")
  })

  it("rejects a password without exposing it", () => {
    let message = ""
    try {
      normalizeBaseUrl("https://user:sensitive-password@example.com/gateway")
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain("ANTHROPIC_BASE_URL must not contain credentials")
    expect(message).not.toContain("user")
    expect(message).not.toContain("sensitive-password")
  })

  it("rejects malformed URLs", () => {
    expect(() => normalizeBaseUrl("not a URL")).toThrow("valid URL")
  })

  it("rejects non-HTTP URLs", () => {
    expect(() => normalizeBaseUrl("file:///tmp/gateway")).toThrow("HTTP or HTTPS")
  })
})
