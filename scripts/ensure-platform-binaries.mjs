#!/usr/bin/env node
/**
 * Install the native binaries npm left out of the lockfile for THIS platform.
 *
 * Why this exists
 * ---------------
 * package-lock.json is generated on Linux, so it records only the linux variant of every
 * platform-gated native package. npm will not add the win32 sibling on a Windows install
 * (npm/cli#4828 prunes non-matching optional deps when it writes the tree), and `npm ci`
 * installs strictly from the lockfile, so it never adds one either.
 *
 * The result was the same failure three times, each looking like a different bug:
 *   - @rolldown/binding-win32-x64-msvc missing -> ALL 11 vitest suites die at once
 *   - @next/swc-win32-x64-msvc missing         -> `next build` tries to self-patch the
 *                                                 lockfile, hits ENOWORKSPACES, then falls
 *                                                 back to pnpm and fails
 *   - @parcel/watcher-win32-x64 missing        -> next.config.ts cannot load, so BOTH
 *                                                 `next build` and `next dev` are dead
 *
 * Declaring them as optionalDependencies does not fix it, because the prune happens when
 * the lockfile is WRITTEN. So this runs at postinstall, derives each version from the
 * parent that is actually installed (no hardcoded pins to drift), and installs only what
 * is missing with --no-save, leaving the lockfile byte-identical.
 *
 * On Linux/CI/Railway this is a no-op: the lockfile already has what that platform needs.
 * It NEVER fails the install - a broken helper must not break `npm install`.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** parent package -> the platform package name for each supported platform+arch. */
const MATRIX = {
  next: {
    "win32-x64":  "@next/swc-win32-x64-msvc",
    "linux-x64":  "@next/swc-linux-x64-gnu",
    "darwin-arm64": "@next/swc-darwin-arm64",
  },
  rolldown: {
    "win32-x64":  "@rolldown/binding-win32-x64-msvc",
    "linux-x64":  "@rolldown/binding-linux-x64-gnu",
    "darwin-arm64": "@rolldown/binding-darwin-arm64",
  },
  "@parcel/watcher": {
    "win32-x64":  "@parcel/watcher-win32-x64",
    "linux-x64":  "@parcel/watcher-linux-x64-glibc",
    "darwin-arm64": "@parcel/watcher-darwin-arm64",
  },
};

// linux is listed deliberately. Whichever platform the lockfile was last generated on is
// the one that is complete; every OTHER platform is the broken one. Today that is Windows,
// but regenerating the lockfile on Windows would invert it and break Railway instead. This
// heals in both directions.
const TARGETS = Object.entries(MATRIX).map(([parent, byPlatform]) => ({
  parent,
  pick: (p, a) => byPlatform[`${p}-${a}`] ?? null,
}));

function resolves(name) {
  try {
    require.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function versionOf(parent) {
  try {
    return require(`${parent}/package.json`).version;
  } catch {
    return null; // parent not installed in this workspace - nothing to match
  }
}

const { platform, arch } = process;
const missing = [];

for (const { parent, pick } of TARGETS) {
  const pkg = pick(platform, arch);
  if (!pkg) continue;                    // platform we do not build on
  if (resolves(pkg)) continue;           // already present
  const version = versionOf(parent);
  if (!version) continue;                // parent absent; nothing to pin to
  missing.push(`${pkg}@${version}`);
}

if (missing.length === 0) process.exit(0);

console.log(`[platform-binaries] lockfile is missing ${missing.length} native package(s) for ${platform}-${arch}:`);
for (const m of missing) console.log(`  ${m}`);

try {
  // --no-save is load-bearing: the lockfile must stay byte-identical to the one Railway
  // validates with `npm ci`. --force is needed because npm refuses os-mismatched installs.
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", ...missing, "--no-save", "--force", "--no-audit", "--no-fund"],
    { stdio: "inherit" },
  );
  console.log("[platform-binaries] done.");
} catch {
  console.warn(
    "[platform-binaries] could not install them automatically. Run this by hand:\n" +
      `  npm i ${missing.join(" ")} --no-save --force`,
  );
}
// Always succeed. This helper must never be the reason an install fails.
process.exit(0);
