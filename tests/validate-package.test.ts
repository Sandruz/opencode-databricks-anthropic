import { describe, expect, it } from "vitest"
import { EXPECTED_FILES, validatePackageFiles } from "../scripts/validate-package.mjs"

const files = EXPECTED_FILES.map((path) => ({ path }))

describe("validatePackageFiles", () => {
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
