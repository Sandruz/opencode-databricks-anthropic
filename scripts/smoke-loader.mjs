import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { validateLoaderResult } from "./smoke-loader-validation.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const secret = "synthetic-private-loader-token"
const packageManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
const packageSpec = `${packageManifest.name}@${packageManifest.version}`

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { encoding: "utf8", ...options })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => { stdout += chunk })
    child.stderr?.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolveRun({ code, stdout, stderr }))
  })
}

const temporary = await mkdtemp(join(tmpdir(), "opencode-loader-smoke-"))
try {
  const pack = await run("npm", ["pack", "--json", "--pack-destination", temporary], { cwd: root })
  if (pack.code !== 0) throw new Error(`npm pack failed\n${pack.stderr}`)
  const [{ filename }] = JSON.parse(pack.stdout)
  const tarball = join(temporary, filename)
  const home = join(temporary, "home")
  const cwd = join(temporary, "workspace")
  const config = join(temporary, "config")
  const cache = join(temporary, "cache", "opencode")
  const data = join(temporary, "data")
  const state = join(temporary, "state")
  const claude = join(temporary, "claude")
  const configNodeModules = join(config, "opencode", "node_modules", "@opencode-ai")
  await Promise.all([home, cwd, cache, data, state, claude, configNodeModules].map((path) => mkdir(path, { recursive: true })))

  const install = await run("npm", ["install", "--ignore-scripts", "--prefix", cache, tarball], { cwd })
  if (install.code !== 0) throw new Error(`packed plugin install failed\n${install.stderr}`)
  const cacheManifestPath = join(cache, "package.json")
  const cacheManifest = JSON.parse(await readFile(cacheManifestPath, "utf8"))
  cacheManifest.dependencies[packageManifest.name] = packageManifest.version
  await Promise.all([
    writeFile(cacheManifestPath, `${JSON.stringify(cacheManifest, null, 2)}\n`),
    writeFile(join(cache, "version"), "21"),
    writeFile(join(claude, "settings.json"), JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: "https://private.example/gateway/v1/v1/",
        ANTHROPIC_AUTH_TOKEN: secret,
      },
    }), { mode: 0o600 }),
    writeFile(join(config, "opencode", "package.json"), JSON.stringify({
      dependencies: { "@opencode-ai/plugin": "1.3.13" },
    })),
  ])

  const pluginTypes = resolve(root, "node_modules/@opencode-ai/plugin")
  await symlink(pluginTypes, join(configNodeModules, "plugin"), "junction")

  const settingsPath = join(claude, "settings.json")
  const configPath = join(config, "opencode", "opencode.json")
  await writeFile(configPath, JSON.stringify({
    plugin: [[packageSpec, {
      settingsPath,
      providerId: "private-anthropic",
      defaultModel: "private-large",
      smallModel: "private-small",
      models: {
        "private-large": { name: "Private Large" },
        "private-small": { name: "Private Small" },
      },
    }]],
  }))

  const result = await run(resolve(root, "node_modules/.bin/opencode"), ["debug", "config"], {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: config,
      XDG_CACHE_HOME: dirname(cache),
      XDG_DATA_HOME: data,
      XDG_STATE_HOME: state,
      CLAUDE_CONFIG_DIR: claude,
      OPENCODE_TEST_HOME: home,
      OPENCODE_TEST_MANAGED_CONFIG_DIR: join(temporary, "managed"),
    },
  })
  validateLoaderResult(result, secret)
  console.log("OpenCode 1.3.13 packed npm-spec loader smoke passed: 2 private models")
} finally {
  await rm(temporary, { recursive: true, force: true })
}
