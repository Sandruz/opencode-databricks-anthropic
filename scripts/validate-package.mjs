import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

export const EXPECTED_FILES = [
  "LICENSE",
  "README.md",
  "dist/chat-params.d.ts",
  "dist/chat-params.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/options.d.ts",
  "dist/options.js",
  "dist/provider.d.ts",
  "dist/provider.js",
  "dist/settings.d.ts",
  "dist/settings.js",
  "dist/types.d.ts",
  "dist/types.js",
  "package.json",
].sort()

export function validatePackageFiles(files) {
  const names = files.map(({ path }) => path).sort()

  for (const file of EXPECTED_FILES) {
    if (!names.includes(file)) throw new Error(`packed artifact is missing ${file}`)
  }
  for (const file of names) {
    if (/^(src|tests|docs)\//.test(file)) {
      throw new Error(`packed artifact contains development file ${file}`)
    }
    if (!EXPECTED_FILES.includes(file)) {
      throw new Error(`packed artifact contains unexpected file ${file}`)
    }
  }

  return names
}

export function packDryRun() {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })
  const result = JSON.parse(output)
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0]?.files)) {
    throw new Error("npm pack returned an unexpected result")
  }
  return result[0].files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = validatePackageFiles(packDryRun())
  console.log(`packed artifact validated: ${names.length} files`)
}
