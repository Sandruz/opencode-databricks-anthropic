import type {
  ModelOptions,
  NormalizedModel,
  NormalizedOptions,
  PluginOptions,
} from "./types.js"

export const DEFAULT_CONTEXT = 200000
export const DEFAULT_OUTPUT = 64000

const DEFAULT_PROVIDER_ID = "databricks-anthropic"
const DEFAULT_MODEL = "system.ai.claude-opus-5-5"
const DEFAULT_SMALL_MODEL = "system.ai.claude-haiku-4-5"
const ERROR_PREFIX = "opencode-databricks-anthropic:"
const RESERVED_IDS = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"])

export const DEFAULT_MODELS: Record<string, NormalizedModel> = {
  "system.ai.claude-opus-5-5": {
    name: "Claude Opus 5.5 (Databricks)",
    context: DEFAULT_CONTEXT,
    output: DEFAULT_OUTPUT,
    reasoning: true,
    toolCall: true,
  },
  "system.ai.claude-sonnet-5-5": {
    name: "Claude Sonnet 5.5 (Databricks)",
    context: DEFAULT_CONTEXT,
    output: DEFAULT_OUTPUT,
    reasoning: true,
    toolCall: true,
  },
  "system.ai.claude-haiku-4-5": {
    name: "Claude Haiku 4.5 (Databricks)",
    context: DEFAULT_CONTEXT,
    output: DEFAULT_OUTPUT,
    reasoning: true,
    toolCall: true,
  },
}

function fail(message: string): never {
  throw new Error(`${ERROR_PREFIX} ${message}`)
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${path} must be a nonempty string`)
  }
  return value
}

function identifier(value: unknown, path: string): string {
  const id = nonempty(value, path)
  if (RESERVED_IDS.has(id)) fail(`${path} must not be reserved: ${id}`)
  return id
}

function positiveInteger(value: unknown, fallback: number, path: string): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) <= 0) {
    fail(`${path} must be a positive integer`)
  }
  return value as number
}

function boolean(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") fail(`${path} must be a boolean`)
  return value
}

function normalizeModel(id: string, value: unknown): NormalizedModel {
  const path = `models.${id}`
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`)
  }
  const model = Object.fromEntries(Object.entries(value)) as ModelOptions
  return {
    name: model.name === undefined ? id : nonempty(model.name, `${path}.name`),
    context: positiveInteger(model.context, DEFAULT_CONTEXT, `${path}.context`),
    output: positiveInteger(model.output, DEFAULT_OUTPUT, `${path}.output`),
    reasoning: boolean(model.reasoning, true, `${path}.reasoning`),
    toolCall: boolean(model.toolCall, true, `${path}.toolCall`),
  }
}

export function parseOptions(input: unknown): NormalizedOptions {
  if (input !== undefined && (typeof input !== "object" || input === null || Array.isArray(input))) {
    fail("options must be an object")
  }
  const options = Object.fromEntries(Object.entries(input ?? {})) as PluginOptions
  const providerId = options.providerId === undefined
    ? DEFAULT_PROVIDER_ID
    : identifier(options.providerId, "providerId")
  const defaultModel = options.defaultModel === undefined
    ? DEFAULT_MODEL
    : nonempty(options.defaultModel, "defaultModel")
  const smallModel = options.smallModel === undefined
    ? DEFAULT_SMALL_MODEL
    : nonempty(options.smallModel, "smallModel")

  let models = structuredClone(DEFAULT_MODELS)
  if (options.models !== undefined) {
    if (typeof options.models !== "object" || options.models === null || Array.isArray(options.models)) {
      fail("models must be a nonempty object")
    }
    const entries = Object.entries(options.models)
    if (entries.length === 0) fail("models must be a nonempty object")
    models = Object.fromEntries(entries.map(([id, model]) => {
      identifier(id, "model ID")
      return [id, normalizeModel(id, model)]
    }))
  }

  if (!Object.hasOwn(models, defaultModel)) fail("defaultModel must reference a configured model")
  if (!Object.hasOwn(models, smallModel)) fail("smallModel must reference a configured model")

  return {
    ...(options.settingsPath === undefined
      ? {}
      : { settingsPath: nonempty(options.settingsPath, "settingsPath") }),
    providerId,
    defaultModel,
    smallModel,
    models,
  }
}
