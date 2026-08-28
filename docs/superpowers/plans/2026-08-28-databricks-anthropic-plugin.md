# Databricks Anthropic Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate an npm-ready OpenCode plugin that reads Databricks Anthropic gateway credentials from Claude settings and registers configurable Anthropic models without copying credentials into OpenCode auth storage.

**Architecture:** Pure modules validate plugin options, read Claude settings, and construct an OpenCode provider definition. A thin plugin entry point connects those modules to OpenCode's `config` hook. Tests use temporary settings files and synthetic secrets; packed-artifact and live-gateway checks happen before any global migration.

**Tech Stack:** TypeScript ESM, Node.js 20+, `@opencode-ai/plugin`, Vitest, npm, GitHub Actions

---

## File Structure

- `package.json`: npm metadata, scripts, exports, runtime compatibility, published files.
- `tsconfig.json`: strict ESM compilation from `src` to `dist`.
- `vitest.config.ts`: isolated Node test configuration.
- `src/types.ts`: plugin option and normalized model types.
- `src/options.ts`: defaults and plugin-option validation.
- `src/settings.ts`: settings-path resolution, Claude settings loading, header parsing, URL normalization.
- `src/provider.ts`: provider/model construction and config collision checks.
- `src/index.ts`: OpenCode plugin export and `config` hook orchestration.
- `tests/options.test.ts`: option defaults, replacement semantics, and invalid-reference tests.
- `tests/settings.test.ts`: path, JSON, credential, header, URL, and redaction tests.
- `tests/provider.test.ts`: exact OpenCode provider-object tests.
- `tests/index.test.ts`: package export and real plugin-hook integration tests.
- `README.md`: installation, options, security, troubleshooting, and migration.
- `LICENSE`: MIT license.
- `.gitignore`: generated and local files.
- `.github/workflows/ci.yml`: test, typecheck, build, and package validation.
- `scripts/validate-package.mjs`: packed-tarball content assertions.
- `scripts/live-validate.mjs`: secret-safe model discovery and Haiku inference instructions/checks.

### Task 1: Package Skeleton And Export

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Write package metadata and compiler configuration**

Create `package.json`:

```json
{
  "name": "opencode-databricks-anthropic",
  "version": "0.1.0",
  "description": "OpenCode plugin for Anthropic models behind Databricks AI Gateway",
  "type": "module",
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "pack:check": "npm pack --dry-run && node scripts/validate-package.mjs",
    "check": "npm run test && npm run typecheck && npm run build && npm run pack:check"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.18.25"
  },
  "devDependencies": {
    "@types/node": "^22.18.0",
    "typescript": "^7.0.2",
    "vitest": "^4.1.11"
  },
  "keywords": [
    "opencode",
    "databricks",
    "anthropic",
    "ai-gateway"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Sandruz/opencode-databricks-anthropic.git"
  },
  "bugs": {
    "url": "https://github.com/Sandruz/opencode-databricks-anthropic/issues"
  },
  "homepage": "https://github.com/Sandruz/opencode-databricks-anthropic#readme"
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
  },
})
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
*.tgz
coverage/
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: exit `0`; `package-lock.json` created; no dependency-resolution errors.

- [ ] **Step 3: Write failing export test**

Create `tests/index.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { DatabricksAnthropicPlugin } from "../src/index.js"

describe("DatabricksAnthropicPlugin", () => {
  it("exports an OpenCode plugin function", () => {
    expect(DatabricksAnthropicPlugin).toBeTypeOf("function")
  })
})
```

- [ ] **Step 4: Run test and verify RED**

Run: `npm test -- tests/index.test.ts`

Expected: FAIL because `src/index.ts` does not exist or has no `DatabricksAnthropicPlugin` export.

- [ ] **Step 5: Add minimal plugin export**

Create `src/index.ts`:

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const DatabricksAnthropicPlugin: Plugin = async () => ({})
```

- [ ] **Step 6: Run test and typecheck**

Run: `npm test -- tests/index.test.ts && npm run typecheck`

Expected: one passing test; TypeScript exits `0`.

- [ ] **Step 7: Commit package skeleton**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/index.ts tests/index.test.ts
git commit -m "chore: scaffold OpenCode plugin package"
```

### Task 2: Plugin Option Validation

**Files:**
- Create: `src/types.ts`
- Create: `src/options.ts`
- Create: `tests/options.test.ts`

- [ ] **Step 1: Write failing option tests**

Create `tests/options.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseOptions } from "../src/options.js"

describe("parseOptions", () => {
  it("returns documented defaults", () => {
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

  it("uses a supplied model map as a replacement", () => {
    const options = parseOptions({
      defaultModel: "custom-claude",
      smallModel: "custom-claude",
      models: {
        "custom-claude": {
          name: "Custom Claude",
          context: 100000,
          output: 8192,
          reasoning: false,
          toolCall: true,
        },
      },
    })

    expect(options.models).toEqual({
      "custom-claude": {
        name: "Custom Claude",
        context: 100000,
        output: 8192,
        reasoning: false,
        toolCall: true,
      },
    })
  })

  it.each([
    [{ models: {} }, "models must contain at least one model"],
    [{ providerId: "" }, "providerId must be a nonempty string"],
    [{ settingsPath: 42 }, "settingsPath must be a nonempty string"],
    [{ models: { x: { context: 0 } }, defaultModel: "x", smallModel: "x" }, "models.x.context must be a positive integer"],
    [{ models: { x: { reasoning: "yes" } }, defaultModel: "x", smallModel: "x" }, "models.x.reasoning must be a boolean"],
    [{ models: { x: {} }, defaultModel: "missing", smallModel: "x" }, "defaultModel must reference a configured model"],
    [{ models: { x: {} }, defaultModel: "x", smallModel: "missing" }, "smallModel must reference a configured model"],
  ])("rejects invalid options %#", (input, message) => {
    expect(() => parseOptions(input)).toThrow(message)
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/options.test.ts`

Expected: FAIL because `src/options.ts` does not exist.

- [ ] **Step 3: Define option types**

Create `src/types.ts`:

```ts
export type ModelOptions = {
  name?: string
  context?: number
  output?: number
  reasoning?: boolean
  toolCall?: boolean
}

export type PluginOptions = {
  settingsPath?: string
  providerId?: string
  defaultModel?: string
  smallModel?: string
  models?: Record<string, ModelOptions>
}

export type NormalizedModel = {
  name: string
  context: number
  output: number
  reasoning: boolean
  toolCall: boolean
}

export type NormalizedOptions = {
  settingsPath?: string
  providerId: string
  defaultModel: string
  smallModel: string
  models: Record<string, NormalizedModel>
}
```

- [ ] **Step 4: Implement minimal option parser**

Create `src/options.ts`:

```ts
import type {
  ModelOptions,
  NormalizedModel,
  NormalizedOptions,
  PluginOptions,
} from "./types.js"

const DEFAULT_CONTEXT = 200000
const DEFAULT_OUTPUT = 64000

const DEFAULT_MODELS: Record<string, NormalizedModel> = {
  "system.ai.claude-opus-5": {
    name: "Claude Opus 5 (Databricks)",
    context: DEFAULT_CONTEXT,
    output: DEFAULT_OUTPUT,
    reasoning: true,
    toolCall: true,
  },
  "system.ai.claude-sonnet-5": {
    name: "Claude Sonnet 5 (Databricks)",
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

function nonempty(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`opencode-databricks-anthropic: ${key} must be a nonempty string`)
  }
  return value
}

function positiveInteger(value: unknown, key: string, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`opencode-databricks-anthropic: ${key} must be a positive integer`)
  }
  return value as number
}

function boolean(value: unknown, key: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") {
    throw new Error(`opencode-databricks-anthropic: ${key} must be a boolean`)
  }
  return value
}

function normalizeModel(id: string, input: ModelOptions): NormalizedModel {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`opencode-databricks-anthropic: models.${id} must be an object`)
  }
  return {
    name: input.name === undefined ? id : nonempty(input.name, `models.${id}.name`),
    context: positiveInteger(input.context, `models.${id}.context`, DEFAULT_CONTEXT),
    output: positiveInteger(input.output, `models.${id}.output`, DEFAULT_OUTPUT),
    reasoning: boolean(input.reasoning, `models.${id}.reasoning`, true),
    toolCall: boolean(input.toolCall, `models.${id}.toolCall`, true),
  }
}

export function parseOptions(input: unknown): NormalizedOptions {
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
    throw new Error("opencode-databricks-anthropic: plugin options must be an object")
  }
  const options = (input ?? {}) as PluginOptions
  const providerId = options.providerId === undefined
    ? "databricks-anthropic"
    : nonempty(options.providerId, "providerId")
  const defaultModel = options.defaultModel === undefined
    ? "system.ai.claude-opus-5"
    : nonempty(options.defaultModel, "defaultModel")
  const smallModel = options.smallModel === undefined
    ? "system.ai.claude-haiku-4-5"
    : nonempty(options.smallModel, "smallModel")
  const models = options.models === undefined
    ? structuredClone(DEFAULT_MODELS)
    : Object.fromEntries(Object.entries(options.models).map(([id, model]) => [
        nonempty(id, "model ID"),
        normalizeModel(id, model),
      ]))

  if (Object.keys(models).length === 0) {
    throw new Error("opencode-databricks-anthropic: models must contain at least one model")
  }
  if (!(defaultModel in models)) {
    throw new Error("opencode-databricks-anthropic: defaultModel must reference a configured model")
  }
  if (!(smallModel in models)) {
    throw new Error("opencode-databricks-anthropic: smallModel must reference a configured model")
  }

  return {
    settingsPath: options.settingsPath === undefined
      ? undefined
      : nonempty(options.settingsPath, "settingsPath"),
    providerId,
    defaultModel,
    smallModel,
    models,
  }
}
```

- [ ] **Step 5: Run option tests and full typecheck**

Run: `npm test -- tests/options.test.ts && npm run typecheck`

Expected: all option tests pass; TypeScript exits `0`.

- [ ] **Step 6: Commit option validation**

```bash
git add src/types.ts src/options.ts tests/options.test.ts
git commit -m "feat: validate Databricks plugin options"
```

### Task 3: Claude Settings And Gateway Parsing

**Files:**
- Create: `src/settings.ts`
- Create: `tests/settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Create `tests/settings.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  loadClaudeSettings,
  normalizeBaseUrl,
  parseCodingAgentHeader,
  resolveSettingsPath,
} from "../src/settings.js"

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
})

describe("resolveSettingsPath", () => {
  it("prefers an explicit path and expands home", () => {
    expect(resolveSettingsPath("~/.claude/custom.json", "/work")).toBe(join(homedir(), ".claude/custom.json"))
  })

  it("uses CLAUDE_CONFIG_DIR before the default", () => {
    process.env.CLAUDE_CONFIG_DIR = "/claude-config"
    expect(resolveSettingsPath(undefined, "/work")).toBe("/claude-config/settings.json")
  })

  it("resolves relative paths from startup working directory", () => {
    expect(resolveSettingsPath("config/claude.json", "/work")).toBe("/work/config/claude.json")
  })
})

describe("Claude settings", () => {
  it("loads required values without exposing token in errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "databricks-anthropic-"))
    const path = join(dir, "settings.json")
    await writeFile(path, JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: "https://workspace.example/ai-gateway/anthropic/",
        ANTHROPIC_AUTH_TOKEN: "synthetic-secret",
        ANTHROPIC_CUSTOM_HEADERS: "Other: ignored\nX-Databricks-Use-Coding-Agent-Mode: true",
      },
    }))

    await expect(loadClaudeSettings(path)).resolves.toEqual({
      baseUrl: "https://workspace.example/ai-gateway/anthropic/",
      authToken: "synthetic-secret",
      codingAgentMode: "true",
    })
  })

  it.each([
    [{ env: {} }, "ANTHROPIC_BASE_URL"],
    [{ env: { ANTHROPIC_BASE_URL: "https://example.com" } }, "ANTHROPIC_AUTH_TOKEN"],
  ])("rejects missing setting %#", async (contents, key) => {
    const dir = await mkdtemp(join(tmpdir(), "databricks-anthropic-"))
    const path = join(dir, "settings.json")
    await writeFile(path, JSON.stringify(contents))
    await expect(loadClaudeSettings(path)).rejects.toThrow(key)
  })
})

describe("gateway parsing", () => {
  it.each([
    ["https://example.com/gateway", "https://example.com/gateway/v1"],
    ["https://example.com/gateway/", "https://example.com/gateway/v1"],
    ["https://example.com/gateway/v1", "https://example.com/gateway/v1"],
    ["https://example.com/gateway/v1/", "https://example.com/gateway/v1"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected)
  })

  it("rejects non-HTTP URLs", () => {
    expect(() => normalizeBaseUrl("file:///tmp/gateway")).toThrow("HTTP or HTTPS")
  })

  it("parses coding-agent header case-insensitively", () => {
    expect(parseCodingAgentHeader("Other: no\nx-DATABRICKS-use-coding-agent-mode: enabled")).toBe("enabled")
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/settings.test.ts`

Expected: FAIL because `src/settings.ts` does not exist.

- [ ] **Step 3: Implement settings loader**

Create `src/settings.ts`:

```ts
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

export type GatewaySettings = {
  baseUrl: string
  authToken: string
  codingAgentMode?: string
}

export function resolveSettingsPath(explicitPath: string | undefined, cwd: string): string {
  const configured = explicitPath
    ?? (process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, "settings.json") : "~/.claude/settings.json")
  if (configured === "~") return homedir()
  if (configured.startsWith("~/")) return join(homedir(), configured.slice(2))
  return isAbsolute(configured) ? configured : resolve(cwd, configured)
}

function requiredString(value: unknown, key: string, path: string): string {
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
      const headerValue = line.slice(separator + 1).trim()
      return headerValue || undefined
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
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`
  return url.toString().replace(/\/$/, "")
}

export async function loadClaudeSettings(path: string): Promise<GatewaySettings> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    const reason = error instanceof SyntaxError ? "contains invalid JSON" : "cannot be read"
    throw new Error(`opencode-databricks-anthropic: Claude settings ${path} ${reason}`)
  }
  const env = (parsed as { env?: Record<string, unknown> } | null)?.env
  if (env === null || typeof env !== "object") {
    throw new Error(`opencode-databricks-anthropic: env object is missing in ${path}`)
  }
  return {
    baseUrl: requiredString(env.ANTHROPIC_BASE_URL, "ANTHROPIC_BASE_URL", path),
    authToken: requiredString(env.ANTHROPIC_AUTH_TOKEN, "ANTHROPIC_AUTH_TOKEN", path),
    codingAgentMode: parseCodingAgentHeader(env.ANTHROPIC_CUSTOM_HEADERS),
  }
}
```

- [ ] **Step 4: Run settings tests and typecheck**

Run: `npm test -- tests/settings.test.ts && npm run typecheck`

Expected: all settings tests pass; TypeScript exits `0`; no synthetic token appears in failure output.

- [ ] **Step 5: Commit settings parsing**

```bash
git add src/settings.ts tests/settings.test.ts
git commit -m "feat: load Databricks credentials from Claude settings"
```

### Task 4: Provider Construction

**Files:**
- Create: `src/provider.ts`
- Create: `tests/provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `tests/provider.test.ts`:

```ts
import type { Config } from "@opencode-ai/plugin"
import { describe, expect, it } from "vitest"
import { applyProvider } from "../src/provider.js"

const options = {
  providerId: "databricks-anthropic",
  defaultModel: "opus",
  smallModel: "haiku",
  models: {
    opus: { name: "Opus", context: 200000, output: 64000, reasoning: true, toolCall: true },
    haiku: { name: "Haiku", context: 100000, output: 8192, reasoning: false, toolCall: true },
  },
}

describe("applyProvider", () => {
  it("adds exact Anthropic provider and qualified defaults", () => {
    const config: Config = {}
    applyProvider(config, options, {
      baseUrl: "https://example.com/gateway/",
      authToken: "synthetic-secret",
      codingAgentMode: "true",
    })

    expect(config).toEqual({
      provider: {
        "databricks-anthropic": {
          npm: "@ai-sdk/anthropic",
          name: "Databricks Anthropic",
          options: {
            authToken: "synthetic-secret",
            baseURL: "https://example.com/gateway/v1",
            setCacheKey: true,
          },
          models: {
            opus: {
              name: "Opus",
              reasoning: true,
              tool_call: true,
              limit: { context: 200000, output: 64000 },
              headers: { "x-databricks-use-coding-agent-mode": "true" },
            },
            haiku: {
              name: "Haiku",
              reasoning: false,
              tool_call: true,
              limit: { context: 100000, output: 8192 },
              headers: { "x-databricks-use-coding-agent-mode": "true" },
            },
          },
        },
      },
      model: "databricks-anthropic/opus",
      small_model: "databricks-anthropic/haiku",
    })
  })

  it("omits the model header when Claude settings do not define it", () => {
    const config: Config = {}
    applyProvider(config, options, {
      baseUrl: "https://example.com/gateway",
      authToken: "synthetic-secret",
    })
    expect(config.provider?.["databricks-anthropic"].models?.opus.headers).toBeUndefined()
  })

  it("rejects provider collisions", () => {
    const config: Config = { provider: { "databricks-anthropic": { name: "existing" } } }
    expect(() => applyProvider(config, options, {
      baseUrl: "https://example.com/gateway",
      authToken: "synthetic-secret",
    })).toThrow("provider databricks-anthropic is already configured")
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/provider.test.ts`

Expected: FAIL because `src/provider.ts` does not exist.

- [ ] **Step 3: Implement provider construction**

Create `src/provider.ts`:

```ts
import type { Config } from "@opencode-ai/plugin"
import type { NormalizedOptions } from "./types.js"
import { normalizeBaseUrl, type GatewaySettings } from "./settings.js"

export function applyProvider(
  config: Config,
  options: NormalizedOptions,
  settings: GatewaySettings,
): void {
  if (config.provider?.[options.providerId] !== undefined) {
    throw new Error(`opencode-databricks-anthropic: provider ${options.providerId} is already configured`)
  }

  const headers = settings.codingAgentMode === undefined
    ? undefined
    : { "x-databricks-use-coding-agent-mode": settings.codingAgentMode }
  const models = Object.fromEntries(Object.entries(options.models).map(([id, model]) => [id, {
    name: model.name,
    reasoning: model.reasoning,
    tool_call: model.toolCall,
    limit: {
      context: model.context,
      output: model.output,
    },
    ...(headers === undefined ? {} : { headers }),
  }]))

  config.provider ??= {}
  type ProviderConfig = NonNullable<Config["provider"]>[string]
  config.provider[options.providerId] = {
    npm: "@ai-sdk/anthropic",
    name: "Databricks Anthropic",
    options: {
      authToken: settings.authToken,
      baseURL: normalizeBaseUrl(settings.baseUrl),
      setCacheKey: true,
    },
    models,
  } as ProviderConfig
  config.model = `${options.providerId}/${options.defaultModel}`
  config.small_model = `${options.providerId}/${options.smallModel}`
}
```

- [ ] **Step 4: Run provider tests and typecheck**

Run: `npm test -- tests/provider.test.ts && npm run typecheck`

Expected: all provider tests pass; TypeScript accepts `authToken` through provider's extensible runtime options.

- [ ] **Step 5: Commit provider builder**

```bash
git add src/provider.ts tests/provider.test.ts
git commit -m "feat: register Databricks Anthropic provider"
```

### Task 5: OpenCode Config Hook Integration

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Replace smoke test with failing hook integration tests**

Replace `tests/index.test.ts` with:

```ts
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Config, PluginInput } from "@opencode-ai/plugin"
import { describe, expect, it } from "vitest"
import { DatabricksAnthropicPlugin } from "../src/index.js"

async function settingsFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "databricks-anthropic-"))
  const path = join(directory, "settings.json")
  await writeFile(path, JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: "https://example.com/ai-gateway/anthropic",
      ANTHROPIC_AUTH_TOKEN: "synthetic-secret",
      ANTHROPIC_CUSTOM_HEADERS: "x-databricks-use-coding-agent-mode: true",
    },
  }))
  return path
}

const pluginInput = { directory: "/workspace" } as PluginInput

describe("DatabricksAnthropicPlugin", () => {
  it("configures defaults through the real config hook", async () => {
    const hooks = await DatabricksAnthropicPlugin(pluginInput, {
      settingsPath: await settingsFile(),
    })
    const config: Config = {}

    await hooks.config?.(config)

    expect(config.model).toBe("databricks-anthropic/system.ai.claude-opus-5")
    expect(config.small_model).toBe("databricks-anthropic/system.ai.claude-haiku-4-5")
    expect(Object.keys(config.provider?.["databricks-anthropic"].models ?? {})).toHaveLength(3)
    expect(config.provider?.["databricks-anthropic"].options).toMatchObject({
      authToken: "synthetic-secret",
      baseURL: "https://example.com/ai-gateway/anthropic/v1",
    })
  })

  it("reads settings once when the config hook runs", async () => {
    const path = await settingsFile()
    const hooks = await DatabricksAnthropicPlugin(pluginInput, { settingsPath: path })
    await writeFile(path, "invalid after plugin initialization")

    await expect(hooks.config?.({})).rejects.toThrow("contains invalid JSON")
  })
})
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm test -- tests/index.test.ts`

Expected: FAIL because current plugin returns no `config` hook.

- [ ] **Step 3: Implement config-hook orchestration**

Replace `src/index.ts` with:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { parseOptions } from "./options.js"
import { applyProvider } from "./provider.js"
import { loadClaudeSettings, resolveSettingsPath } from "./settings.js"

export const DatabricksAnthropicPlugin: Plugin = async ({ directory }, rawOptions) => {
  const options = parseOptions(rawOptions)
  const settingsPath = resolveSettingsPath(options.settingsPath, directory)

  return {
    config: async (config) => {
      const settings = await loadClaudeSettings(settingsPath)
      applyProvider(config, options, settings)
    },
  }
}
```

- [ ] **Step 4: Run complete automated suite**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests pass; typecheck and build exit `0`; `dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 5: Inspect built output for accidental credential literals**

Run: `rg "synthetic-secret|dapi" dist src`

Expected: no matches and exit `1`.

- [ ] **Step 6: Commit plugin integration**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: configure gateway through OpenCode hook"
```

### Task 6: Package Validation, Documentation, And CI

**Files:**
- Create: `scripts/validate-package.mjs`
- Create: `README.md`
- Create: `LICENSE`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Write package-content validator**

Create `scripts/validate-package.mjs`:

```js
import { execFileSync } from "node:child_process"

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })
const [{ files }] = JSON.parse(output)
const names = files.map(({ path }) => path).sort()
const required = ["LICENSE", "README.md", "dist/index.d.ts", "dist/index.js", "package.json"]

for (const file of required) {
  if (!names.includes(file)) throw new Error(`packed artifact is missing ${file}`)
}
for (const file of names) {
  if (file.startsWith("src/") || file.startsWith("tests/") || file.startsWith("docs/")) {
    throw new Error(`packed artifact contains development file ${file}`)
  }
}

console.log(`packed artifact validated: ${names.length} files`)
```

- [ ] **Step 2: Correct pack-check script to avoid duplicate dry runs**

Change `package.json` script:

```json
"pack:check": "node scripts/validate-package.mjs"
```

- [ ] **Step 3: Write README**

Create `README.md`:

````markdown
# opencode-databricks-anthropic

OpenCode plugin for Anthropic Messages API models served through Databricks AI Gateway.

## Requirements

- OpenCode with plugin tuple options support
- Node.js 20 or newer
- Claude settings containing `env.ANTHROPIC_BASE_URL` and `env.ANTHROPIC_AUTH_TOKEN`

## Install

```json
{
  "plugin": ["opencode-databricks-anthropic"]
}
```

Default credential source: `$CLAUDE_CONFIG_DIR/settings.json`, or `~/.claude/settings.json` when `CLAUDE_CONFIG_DIR` is unset.

## Configure

```json
{
  "plugin": [
    [
      "opencode-databricks-anthropic",
      {
        "settingsPath": "~/.claude/settings.json",
        "providerId": "databricks-anthropic",
        "defaultModel": "system.ai.claude-opus-5",
        "smallModel": "system.ai.claude-haiku-4-5"
      }
    ]
  ]
}
```

Supplying `models` replaces defaults. Each model accepts `name`, `context`, `output`, `reasoning`, and `toolCall`.

## Claude Settings

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://workspace.example/ai-gateway/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-databricks-token",
    "ANTHROPIC_CUSTOM_HEADERS": "x-databricks-use-coding-agent-mode: true"
  }
}
```

Plugin uses `Authorization: Bearer`, normalizes gateway path to `/v1`, and registers `@ai-sdk/anthropic`. It supports Anthropic Messages API gateways only.

## Security

Token is read once per OpenCode configuration load and passed in memory to provider runtime. Plugin never writes it to OpenCode auth storage or logs it. Protect Claude settings with user-only filesystem permissions.

## Troubleshooting

- Missing setting errors: verify keys are inside Claude settings `env` object.
- `401 Unauthorized`: verify Databricks token remains active and gateway permissions allow selected endpoint.
- Unknown API path: ensure `ANTHROPIC_BASE_URL` ends at gateway endpoint; plugin adds `/v1`.
- Provider collision: remove existing inline provider with same ID or choose another `providerId`.
- Unknown default model: include both `defaultModel` and `smallModel` in custom `models` map.

## Migration From Inline Provider

Validate plugin first. Then add package to OpenCode plugin list, remove inline `databricks-anthropic` provider plus plugin-owned `model` and `small_model`, remove custom launcher, and verify model discovery plus a Haiku request using standard `opencode` command.

## Development

```sh
npm install
npm run check
```

Publishing is an explicit maintainer action and is not performed by build or CI.
````

- [ ] **Step 4: Add MIT license**

Create `LICENSE` with standard MIT text, copyright line:

```text
MIT License

Copyright (c) 2026 Sandruz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 6: Run complete package validation**

Run: `npm run check`

Expected: tests pass; typecheck/build exit `0`; validator prints `packed artifact validated: <N> files`; package contains no `src`, `tests`, or `docs` paths.

- [ ] **Step 7: Commit documentation and CI**

```bash
git add package.json package-lock.json scripts/validate-package.mjs README.md LICENSE .github/workflows/ci.yml
git commit -m "docs: prepare plugin package for release"
```

### Task 7: Packed Artifact And Live Gateway Validation

**Files:**
- Create: `scripts/live-validate.mjs`
- Test: packed npm artifact and temporary OpenCode config

- [ ] **Step 1: Add secret-safe preflight script**

Create `scripts/live-validate.mjs`:

```js
import { access, readFile } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const path = process.env.CLAUDE_CONFIG_DIR
  ? join(process.env.CLAUDE_CONFIG_DIR, "settings.json")
  : join(homedir(), ".claude", "settings.json")

await access(path, constants.R_OK)
const parsed = JSON.parse(await readFile(path, "utf8"))
for (const key of ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]) {
  if (typeof parsed?.env?.[key] !== "string" || parsed.env[key].trim() === "") {
    throw new Error(`${key} is missing or empty in ${path}`)
  }
}

console.log(`Claude settings preflight passed: ${path}`)
```

- [ ] **Step 2: Build and create local tarball**

Run: `npm run check && npm pack`

Expected: all checks pass and `opencode-databricks-anthropic-0.1.0.tgz` is created.

- [ ] **Step 3: Verify installed tarball export in isolation**

Run:

```bash
tmpdir="$(mktemp -d)"
npm install --prefix "$tmpdir" ./opencode-databricks-anthropic-0.1.0.tgz
node --input-type=module -e "import('$tmpdir/node_modules/opencode-databricks-anthropic/dist/index.js').then((m) => { if (typeof m.DatabricksAnthropicPlugin !== 'function') process.exit(1) })"
```

Expected: both commands exit `0`; no credentials printed.

- [ ] **Step 4: Run Claude settings preflight**

Run: `node scripts/live-validate.mjs`

Expected: prints settings path only and exits `0`; token and base URL remain undisclosed.

- [ ] **Step 5: Validate plugin against OpenCode without changing global config**

Create a temporary OpenCode config directory, install packed package there, and load built plugin through a temporary local shim:

```bash
tmpdir="$(mktemp -d)"
mkdir -p "$tmpdir/plugins"
npm install --prefix "$tmpdir" ./opencode-databricks-anthropic-0.1.0.tgz
printf '%s\n' 'export { DatabricksAnthropicPlugin } from "opencode-databricks-anthropic"' > "$tmpdir/plugins/databricks-anthropic.js"
OPENCODE_CONFIG_DIR="$tmpdir" opencode models databricks-anthropic
```

Expected: exactly three default model IDs appear under `databricks-anthropic`; no credential value appears.

- [ ] **Step 6: Run minimal Haiku inference in temporary config**

Run:

```bash
OPENCODE_CONFIG_DIR="$tmpdir" opencode run --model databricks-anthropic/system.ai.claude-haiku-4-5 "Reply with exactly: gateway-ok"
```

Expected: response contains `gateway-ok`; command exits `0`; no credential value appears.

- [ ] **Step 7: Commit validation script**

```bash
git add scripts/live-validate.mjs
git commit -m "test: add safe gateway validation preflight"
```

### Task 8: Final Review And Migration Gate

**Files:**
- Review: all tracked files
- Later modify after explicit publication approval: `/home/sf01522/.config/opencode/opencode.json`
- Later delete after direct-launch verification: `/home/sf01522/.local/bin/opencode-anthropic`

- [ ] **Step 1: Run fresh final verification**

Run: `npm ci && npm run check`

Expected: clean install succeeds; all tests pass; typecheck, build, and packed-content validation exit `0`.

- [ ] **Step 2: Review repository changes**

Run: `git status --short && git diff --check && git log --oneline --decorate -8`

Expected: no uncommitted implementation files, no whitespace errors, and task commits visible.

- [ ] **Step 3: Request final code review**

Use `superpowers:requesting-code-review` against full branch diff. Require resolution and re-review of every correctness, security, packaging, or missing-test finding.

- [ ] **Step 4: Stop before npm publication**

Report packed artifact path, automated-check results, model-discovery result, and live Haiku result. Do not run `npm publish`, alter global OpenCode config, remove launcher, push, or create a pull request without explicit user request.

- [ ] **Step 5: After explicit publication request, publish package**

Run: `npm publish --access public`

Expected: npm reports published `opencode-databricks-anthropic@0.1.0`. If name ownership or authentication fails, preserve existing global setup and report exact error.

- [ ] **Step 6: After successful publication, migrate global OpenCode config**

Edit `/home/sf01522/.config/opencode/opencode.json` so unrelated plugins remain and plugin owns provider/defaults:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@ex-machina/opencode-anthropic-auth",
    "@tarquinen/opencode-dcp@latest",
    "superpowers@git+https://github.com/obra/superpowers.git",
    "opencode-databricks-anthropic@0.1.0"
  ]
}
```

Before writing, save current config and launcher to a private temporary directory for rollback. Do not include credentials in backups or command output.

- [ ] **Step 7: Verify standard OpenCode direct launch**

Run:

```bash
opencode models databricks-anthropic
opencode run --model databricks-anthropic/system.ai.claude-haiku-4-5 "Reply with exactly: gateway-ok"
```

Expected: three models listed and inference returns `gateway-ok` without launcher or exported credential environment.

- [ ] **Step 8: Remove launcher only after direct verification passes**

Run: `rm /home/sf01522/.local/bin/opencode-anthropic`

Expected: launcher removed. If direct verification fails, restore original config and retain launcher; do not leave partial migration.
