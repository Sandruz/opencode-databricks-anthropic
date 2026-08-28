import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { preflightClaudeSettings, resolveClaudeSettingsPath } from "../scripts/live-validate.mjs"

const temporaryDirectories: string[] = []
const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/live-validate.mjs")

async function writeSettings(contents: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "live-validate-"))
  temporaryDirectories.push(directory)
  const path = join(directory, "settings.json")
  await writeFile(path, typeof contents === "string" ? contents : JSON.stringify(contents))
  return path
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe("resolveClaudeSettingsPath", () => {
  it("resolves CLAUDE_CONFIG_DIR from startup cwd", () => {
    expect(resolveClaudeSettingsPath({ CLAUDE_CONFIG_DIR: "claude" }, "/home/test", "/work"))
      .toBe(resolve("/work", "claude/settings.json"))
  })

  it("uses the default Claude settings path", () => {
    expect(resolveClaudeSettingsPath({}, "/home/test", "/work"))
      .toBe("/home/test/.claude/settings.json")
  })
})

describe("preflightClaudeSettings", () => {
  it("validates own nonempty settings and prints only their path", async () => {
    const path = await writeSettings({
      env: {
        ANTHROPIC_BASE_URL: "https://sensitive.example/gateway",
        ANTHROPIC_AUTH_TOKEN: "sensitive-token",
      },
    })
    const output: string[] = []

    await expect(preflightClaudeSettings(path, (line) => output.push(line))).resolves.toBe(path)
    expect(output).toEqual([`Claude settings preflight passed: ${path}`])
    expect(output.join("\n")).not.toContain("sensitive.example")
    expect(output.join("\n")).not.toContain("sensitive-token")
  })

  it("rejects inherited credential properties", async () => {
    const path = await writeSettings({ env: {} })
    Object.defineProperties(Object.prototype, {
      ANTHROPIC_BASE_URL: { configurable: true, value: "https://inherited.example" },
      ANTHROPIC_AUTH_TOKEN: { configurable: true, value: "inherited-token" },
    })

    try {
      await expect(preflightClaudeSettings(path)).rejects.toThrow(`ANTHROPIC_BASE_URL is missing or empty in ${path}`)
    } finally {
      delete (Object.prototype as Record<string, unknown>).ANTHROPIC_BASE_URL
      delete (Object.prototype as Record<string, unknown>).ANTHROPIC_AUTH_TOKEN
    }
  })

  it("rejects malformed settings without exposing contents", async () => {
    const path = await writeSettings('{"env":{"ANTHROPIC_AUTH_TOKEN":"sensitive-token"')
    const error = await preflightClaudeSettings(path).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(`Claude settings ${path} contains invalid JSON`)
    expect((error as Error).message).not.toContain("sensitive-token")
  })

  it.each([null, [], {}, { env: null }, { env: [] }, { env: "invalid" }])(
    "rejects malformed env shape %#",
    async (contents) => {
      const path = await writeSettings(contents)
      await expect(preflightClaudeSettings(path)).rejects.toThrow(`env object is missing in ${path}`)
    },
  )
})

describe("live-validate CLI", () => {
  it("exits nonzero with sanitized stderr for missing settings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "live-validate-cli-"))
    temporaryDirectories.push(directory)

    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, CLAUDE_CONFIG_DIR: directory },
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe(`Claude settings ${join(directory, "settings.json")} cannot be read\n`)
  })

  it("exits nonzero without leaking malformed settings content", async () => {
    const secret = "synthetic-secret-cli-value"
    const path = await writeSettings(`{"env":{"ANTHROPIC_AUTH_TOKEN":"${secret}"`)

    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, CLAUDE_CONFIG_DIR: dirname(path) },
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe(`Claude settings ${path} contains invalid JSON\n`)
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret)
  })
})
