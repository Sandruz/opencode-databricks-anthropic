import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { EXPECTED_FILES, validatePackageFiles } from "../scripts/validate-package.mjs"

const files = EXPECTED_FILES.map((path) => ({ path }))

describe("validatePackageFiles", () => {
  it("exports the root and OpenCode server entries", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

    expect(manifest.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./server": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    })
  })

  it("requires the validated OpenCode loader version", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

    expect(manifest.engines).toEqual({
      node: "^20.19.0 || >=22.12.0",
      opencode: ">=1.3.13",
    })
  })

  it("pins the real OpenCode loader smoke check", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

    expect(manifest.devDependencies["opencode-ai"]).toBe("1.3.13")
    expect(manifest.scripts["smoke:loader"]).toBe("node scripts/smoke-loader.mjs")
    expect(manifest.scripts.check).toContain("npm run smoke:loader")
  })

  it("documents direct package-name loading and supported OpenCode", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")

    expect(readme).toContain("OpenCode `>=1.3.13`")
    expect(readme).toContain('"plugin": ["opencode-databricks-anthropic"]')
    expect(readme).not.toContain("local shim")
  })

  it("accepts the exact release manifest", () => {
    expect(validatePackageFiles(files)).toEqual(EXPECTED_FILES)
  })

  it("rejects unexpected compiler output", () => {
    expect(() => validatePackageFiles([...files, { path: "dist/stale.js" }]))
      .toThrow("packed artifact contains unexpected file dist/stale.js")
  })

  it("rejects development files", () => {
    expect(() => validatePackageFiles([...files, { path: "tests/secret.test.ts" }]))
      .toThrow("packed artifact contains development file tests/secret.test.ts")
  })
})
