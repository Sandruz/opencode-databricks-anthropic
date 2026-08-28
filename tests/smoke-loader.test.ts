import { afterEach, describe, expect, it, vi } from "vitest"

import { validateLoaderResult } from "../scripts/smoke-loader-validation.mjs"

const secret = "synthetic-private-loader-token"
const privateConfig = JSON.stringify({
  model: "wrong/model",
  provider: {
    "private-anthropic": {
      options: { authToken: secret },
      models: { unexpected: {} },
    },
  },
})

afterEach(() => vi.restoreAllMocks())

describe("validateLoaderResult", () => {
  it.each([
    [{ code: 1, stdout: privateConfig, stderr: `failure ${secret}` }, "OpenCode loader smoke failed"],
    [{ code: 0, stdout: privateConfig, stderr: "" }, "OpenCode loader resolved unexpected config"],
  ])("sanitizes loader failure %#", (result, message) => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {})
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => validateLoaderResult(result, secret)).toThrow(message)
    let thrown = ""
    try {
      validateLoaderResult(result, secret)
    } catch (error) {
      thrown = (error as Error).message
    }

    expect(thrown).not.toContain(secret)
    expect(thrown).not.toContain(privateConfig)
    expect(stdout.mock.calls.flat().join(" ")).not.toContain(secret)
    expect(stderr.mock.calls.flat().join(" ")).not.toContain(secret)
  })
})
