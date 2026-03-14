#!/usr/bin/env node

/**
 * Full npm install smoke test.
 *
 * Builds binaries, packs tarballs, installs in a temp directory,
 * and verifies the bin shims work. Tests the real install path.
 *
 * Usage:
 *   node scripts/check.mjs
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeChildProcess from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const REPO_ROOT = NodePath.resolve(ROOT, "..");
const PLATFORM = NodeProcess.platform;
const ARCH = NodeProcess.arch;
const PLATFORM_DIR = `tempo-${PLATFORM}-${ARCH}`;
const VERSION = NodeProcess.env.RELEASE_VERSION || "0.0.0-check";

/**
 * @param {string} cmd
 * @param {string} [cwd]
 */
function run(cmd, cwd = ROOT) {
  console.log(`$ ${cmd}`);
  return NodeChildProcess.execSync(cmd, { cwd, stdio: "inherit" });
}

/**
 * @param {string} cmd
 * @param {string} [cwd]
 */
function runCapture(cmd, cwd = ROOT) {
  return NodeChildProcess.execSync(cmd, { cwd, encoding: "utf8" }).trim();
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

// 4. Pack both into tarballs
const tmpDir = NodeFS.mkdtempSync(
  NodePath.join(NodeOS.tmpdir(), "tempo-npm-check-"),
);
console.log(`\n→ Packing to ${tmpDir}...`);

const platformTar = runCapture(
  `npm pack --pack-destination ${tmpDir}`,
  NodePath.join(ROOT, PLATFORM_DIR),
);
const baseTar = runCapture(
  `npm pack --pack-destination ${tmpDir}`,
  NodePath.join(ROOT, "tempo"),
);

// 5. Install from tarballs in temp dir
console.log("\n→ Installing from tarballs...");
run("npm init -y", tmpDir);
run(
  `npm install ${NodePath.join(tmpDir, platformTar)} ${NodePath.join(tmpDir, baseTar)}`,
  tmpDir,
);

// 6. Smoke test
console.log("\n→ Running smoke tests...");
const binDir = NodePath.join(tmpDir, "node_modules", ".bin");

run(`${NodePath.join(binDir, "tempo-wallet")} --help`);
run(`${NodePath.join(binDir, "tempo-request")} --help`);
run(`${NodePath.join(binDir, "tempo")} wallet --help`);
run(`${NodePath.join(binDir, "tempo")} request --help`);

// 7. Cleanup
console.log("\n→ Cleaning up...");
NodeFS.rmSync(tmpDir, { recursive: true, force: true });

console.log("\n✅ npm-check passed");
