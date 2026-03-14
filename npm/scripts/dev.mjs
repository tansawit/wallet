#!/usr/bin/env node

/**
 * Build and link npm packages locally for development.
 *
 * Usage:
 *   node scripts/dev.mjs
 *
 * After running, `tempo wallet --help` and `tempo request --help` work globally.
 */

import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeChildProcess from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const REPO_ROOT = NodePath.resolve(ROOT, "..");
const PLATFORM = NodeProcess.platform;
const ARCH = NodeProcess.arch;
const PLATFORM_DIR = `tempo-${PLATFORM}-${ARCH}`;
const PLATFORM_PKG = `@tempoxyz/tempo-${PLATFORM}-${ARCH}`;
const VERSION = NodeProcess.env.RELEASE_VERSION || "0.0.0-dev";

/**
 * @param {string} cmd
 * @param {string} [cwd]
 */
function run(cmd, cwd = ROOT) {
  console.log(`$ ${cmd}`);
  NodeChildProcess.execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Build Rust binaries (debug)
console.log("\n→ Building Rust binaries...");
run("cargo build --package tempo-wallet --package tempo-request", REPO_ROOT);

// 2. Assemble platform package
console.log("\n→ Assembling platform package...");
run(
  `DRY_RUN=1 RELEASE_VERSION=${VERSION} node scripts/publish.mjs platform ` +
    `--os ${PLATFORM} --arch ${ARCH} ` +
    `--binaries ${NodePath.join(REPO_ROOT, "target/debug/tempo-wallet")},${NodePath.join(REPO_ROOT, "target/debug/tempo-request")}`,
  ROOT,
);

// 3. Assemble base package
console.log("\n→ Assembling base package...");
run(`DRY_RUN=1 RELEASE_VERSION=${VERSION} node scripts/publish.mjs base`, ROOT);

// 4. Link platform package
console.log("\n→ Linking platform package...");
run("npm link", NodePath.join(ROOT, PLATFORM_DIR));

// 5. Link base package (with platform dep)
console.log("\n→ Linking base package...");
run(`npm link ${PLATFORM_PKG}`, NodePath.join(ROOT, "tempo"));
run("npm link", NodePath.join(ROOT, "tempo"));

console.log("\n✅ Linked. Run: tempo wallet --help");
