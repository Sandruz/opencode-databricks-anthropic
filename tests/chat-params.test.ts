import { describe, expect, it } from "vitest"

import { stripUnsupportedBlockBinding } from "../src/chat-params.js"
import type { NormalizedOptions } from "../src/types.js"

const options: NormalizedOptions = {
  providerId: "databricks-anthropic",
  defaultModel: "model-large",
  smallModel: "model-small",
  models: {
    "model-large": {
      name: "Large Model",
      context: 200000,
      output: 64000,
      reasoning: true,
      toolCall: true,
    },
  },
}

function input(providerID: string) {
  return {
    sessionID: "session",
    agent: "build",
    model: { providerID } as any,
    provider: {} as any,
    message: {} as any,
  }
}

function output(options: Record<string, unknown>) {
  return {
    temperature: 0,
    topP: 1,
    topK: 0,
    maxOutputTokens: undefined,
    options,
  }
}

describe("stripUnsupportedBlockBinding", () => {
  it("removes blockBinding from thinking options for this provider's models", () => {
    const out = output({ thinking: { type: "adaptive", blockBinding: { prefixMismatchBehavior: "drop_block" } } })

    stripUnsupportedBlockBinding(options, input("databricks-anthropic"), out)

    expect(out.options.thinking).toEqual({ type: "adaptive" })
  })

  it("removes the thinking key entirely when blockBinding was the only field", () => {
    const out = output({ thinking: { blockBinding: { prefixMismatchBehavior: "drop_block" } } })

    stripUnsupportedBlockBinding(options, input("databricks-anthropic"), out)

    expect(out.options).not.toHaveProperty("thinking")
  })

  it("ignores models from a different provider", () => {
    const out = output({ thinking: { type: "adaptive", blockBinding: { prefixMismatchBehavior: "drop_block" } } })

    stripUnsupportedBlockBinding(options, input("some-other-provider"), out)

    expect(out.options.thinking).toHaveProperty("blockBinding")
  })

  it("is a no-op when there is no thinking option", () => {
    const out = output({})

    expect(() => stripUnsupportedBlockBinding(options, input("databricks-anthropic"), out)).not.toThrow()
    expect(out.options).toEqual({})
  })

  it("is a no-op when thinking has no blockBinding key", () => {
    const out = output({ thinking: { type: "adaptive" } })

    stripUnsupportedBlockBinding(options, input("databricks-anthropic"), out)

    expect(out.options.thinking).toEqual({ type: "adaptive" })
  })
})
