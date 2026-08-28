import { describe, expect, it } from "vitest"

import { parseOptions } from "../src/options.js"

describe("parseOptions", () => {
  it("returns normalized defaults", () => {
    const options = parseOptions(undefined)

    expect(options.providerId).toBe("databricks-anthropic")
    expect(options.defaultModel).toBe("system.ai.claude-opus-5")
    expect(options.smallModel).toBe("system.ai.claude-haiku-4-5")
    expect(Object.keys(options.models)).toEqual([
      "system.ai.claude-opus-5",
      "system.ai.claude-sonnet-5",
      "system.ai.claude-haiku-4-5",
    ])
    expect(options.models["system.ai.claude-opus-5"]).toEqual({
      name: "Claude Opus 5 (Databricks)",
      context: 200000,
      output: 64000,
      reasoning: true,
      toolCall: true,
    })
  })

  it("returns isolated default models", () => {
    const first = parseOptions(undefined)
    first.models["system.ai.claude-opus-5"].name = "Mutated"

    const second = parseOptions(undefined)
    expect(second.models["system.ai.claude-opus-5"].name).toBe("Claude Opus 5 (Databricks)")
  })

  it("ignores inherited top-level options", () => {
    const input = Object.create({
      settingsPath: "/inherited/settings.json",
      providerId: "inherited",
      defaultModel: "inherited",
      smallModel: "inherited",
      models: { inherited: {} },
    })

    expect(parseOptions(input)).toEqual(parseOptions(undefined))
  })

  it("replaces default models with a custom model map", () => {
    const options = parseOptions({
      defaultModel: "custom-claude",
      smallModel: "custom-claude",
      models: {
        "custom-claude": {
          name: "Custom Claude",
          context: 123456,
          output: 7890,
          reasoning: false,
          toolCall: false,
        },
      },
    })

    expect(options.models).toEqual({
      "custom-claude": {
        name: "Custom Claude",
        context: 123456,
        output: 7890,
        reasoning: false,
        toolCall: false,
      },
    })
  })

  it("rejects an inherited default model reference", () => {
    expect(() => parseOptions({
      models: { x: {} },
      defaultModel: "toString",
      smallModel: "x",
    })).toThrow("defaultModel must reference a configured model")
  })

  it("rejects an inherited small model reference", () => {
    expect(() => parseOptions({
      models: { x: {} },
      defaultModel: "x",
      smallModel: "toString",
    })).toThrow("smallModel must reference a configured model")
  })

  it.each([
    [{ models: {} }, "models must be a nonempty object"],
    [{ models: { "": {}, x: {} }, defaultModel: "x", smallModel: "x" }, "model ID must be a nonempty string"],
    [{ models: { "  ": {}, x: {} }, defaultModel: "x", smallModel: "x" }, "model ID must be a nonempty string"],
    [{ models: [] }, "models must be a nonempty object"],
    [{ models: "invalid" }, "models must be a nonempty object"],
    [{ providerId: "" }, "providerId must be a nonempty string"],
    [{ settingsPath: 42 }, "settingsPath must be a nonempty string"],
    [
      { models: { x: { context: 0 } }, defaultModel: "x", smallModel: "x" },
      "models.x.context must be a positive integer",
    ],
    [
      { models: { x: { reasoning: "yes" } }, defaultModel: "x", smallModel: "x" },
      "models.x.reasoning must be a boolean",
    ],
    [
      { models: { x: { name: 1 } }, defaultModel: "x", smallModel: "x" },
      "models.x.name must be a nonempty string",
    ],
    [
      { models: { x: { output: 1.5 } }, defaultModel: "x", smallModel: "x" },
      "models.x.output must be a positive integer",
    ],
    [
      { models: { x: { toolCall: "yes" } }, defaultModel: "x", smallModel: "x" },
      "models.x.toolCall must be a boolean",
    ],
    [
      { models: { x: {} }, defaultModel: "missing", smallModel: "x" },
      "defaultModel must reference a configured model",
    ],
    [
      { models: { x: {} }, defaultModel: "x", smallModel: "missing" },
      "smallModel must reference a configured model",
    ],
  ])("rejects malformed options %#", (input, message) => {
    expect(() => parseOptions(input)).toThrow(message)
  })
})
