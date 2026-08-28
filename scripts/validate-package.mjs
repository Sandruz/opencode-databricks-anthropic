import { execFileSync } from "node:child_process"

export const REQUIRED_FILES = [
  "LICENSE",
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "package.json",
]

export function validatePackageFiles(files) {
  const names = files.map(({ path }) => path).sort()

  for (const file of REQUIRED_FILES) {
    if (!names.includes(file)) throw new Error(`packed artifact is missing ${file}`)
  }
  for (const file of names) {
    if (/^(src|tests|docs)\//.test(file)) {
      throw new Error(`packed artifact contains development file ${file}`)
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

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const names = validatePackageFiles(packDryRun())
  console.log(`packed artifact validated: ${names.length} files`)
}
