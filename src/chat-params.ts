import type { Hooks } from "@opencode-ai/plugin"

import type { NormalizedOptions } from "./types.js"

type ChatParamsHook = NonNullable<Hooks["chat.params"]>
type ChatParamsInput = Parameters<ChatParamsHook>[0]
type ChatParamsOutput = Parameters<ChatParamsHook>[1]

/**
 * opencode core auto-injects `providerOptions.thinking.blockBinding` for any
 * `@ai-sdk/anthropic` model whose id resolves to Claude >= 5.1 (see opencode's
 * internal `Ey()` helper), to support the Anthropic Messages API's adaptive
 * thinking block-binding feature. Databricks' Anthropic-compatible proxy does
 * not implement `blockBinding` and rejects any request that includes it with
 * `thinking.adaptive.block_binding: Extra inputs are not permitted`.
 *
 * opencode core's own injection logic treats an explicit
 * `providerOptions.thinking.blockBinding === false` as an opt-out signal and
 * strips the key again, but nothing in the plugin/model config surface flows
 * into that object before injection happens - so the only way to suppress it
 * is to remove the key after the fact, via the `chat.params` hook, which runs
 * after opencode core builds `output.options`.
 *
 * Databricks' proxy never supports `blockBinding` for any model it serves, so
 * this strips it unconditionally for every model registered under this
 * plugin's provider.
 */
export function stripUnsupportedBlockBinding(
  options: NormalizedOptions,
  input: ChatParamsInput,
  output: ChatParamsOutput,
): void {
  if (input.model.providerID !== options.providerId) return
  const thinking = output.options?.thinking as Record<string, unknown> | undefined
  if (thinking === undefined || thinking === null) return
  if (!Object.hasOwn(thinking, "blockBinding")) return
  delete thinking.blockBinding
  if (Object.keys(thinking).length === 0) delete output.options.thinking
}
