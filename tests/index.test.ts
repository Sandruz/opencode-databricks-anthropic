import { describe, expect, it } from "vitest"

import { DatabricksAnthropicPlugin } from "../src/index.js"

describe("DatabricksAnthropicPlugin", () => {
  it("exports a plugin function", () => {
    expect(typeof DatabricksAnthropicPlugin).toBe("function")
  })
})
