#!/usr/bin/env node

/**
 * Unified assemble + version-stamp + publish script.
 *
 * Usage:
 *   node scripts/publish.mjs platform --os darwin --arch arm64 --binaries path1,path2
 *   node scripts/publish.mjs base
 *
 * Environment:
 *   RELEASE_VERSION — version to stamp (required)
 *   DRY_RUN=1       — assemble and stamp but skip npm publish
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";

import { platformPackageJson } from "../src/package.json.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

function parseArgs() {
  const args = process.argv.slice(2);
  const [mode] = args

  if (mode === "platform") {
    
    /** @type {{ os?: string; arch?: string; binaries?: string[] }} */
    const flags = {};

    for (let index = 1; index < args.length; index++) {
      if (args[index] === "--os") flags.os = args[++index];
      else if (args[index] === "--arch") flags.arch = args[++index];
      else if (args[index] === "--binaries") flags.binaries = args[++index].split(",");
    }

    if (!flags.os || !flags.arch || !flags.binaries?.length) {
      console.error(
        "Usage: publish.mjs platform --os <os> --arch <arch> --binaries <path1,path2>",
      );
      process.exit(1);
    }
    return { mode, ...flags };
  }

  if (mode === "base") 
    return { mode };
  

  console.error("Usage: publish.mjs <platform|base> [options]");
  process.exit(1);
}

function getVersion() {
  const version = process.env.RELEASE_VERSION;
  if (!version) {
    console.error("RELEASE_VERSION environment variable is required");
    process.exit(1);
  }
  return version;
}

/**
 * Assemble and publish a platform-specific package.
 *
 * Creates: tempo-<os>-<arch>/
 *   ├── package.json   (templated from package.json.tmpl)
 *   └── bin/
 *       ├── tempo-wallet
 *       └── tempo-request
 */

/**
 * @param {{ os?: string; arch?: string; binaries?: string[]; mode: string }} options
 */
function publishPlatform(options) {
  const version = getVersion();
  const dir = NodePath.join(ROOT, `tempo-${options.os}-${options.arch}`);
  const binDir = NodePath.join(dir, "bin");

  // Create directory
  NodeFS.mkdirSync(binDir, { recursive: true });

  // Generate package.json
  NodeFS.writeFileSync(
    NodePath.join(dir, "package.json"),
    platformPackageJson({ os: options.os ?? "", arch: options.arch ?? "", version }),
  );

  // Copy binaries
  for (const src of options.binaries ?? []) {
    const name = NodePath.basename(src);
    const dest = NodePath.join(binDir, name);
    NodeFS.copyFileSync(src, dest);
    NodeFS.chmodSync(dest, 0o755);
    console.log(`Copied: ${src} → ${dest}`);
  }

  stamp(dir, version);
  publish(dir);
}

/**
 * Assemble and publish the base meta package.
 *
 * Copies runtime sources into tempo/:
 *   ├── bin.mjs        (from src/)
 *   ├── const.mjs      (from src/)
 *   └── dist/
 *       ├── postinstall.mjs  (from src/install.mjs)
 *       └── const.mjs        (from src/)
 */
function publishBase() {
  const version = getVersion();
  const tempoDir = NodePath.join(ROOT, "tempo");
  const distDir = NodePath.join(tempoDir, "dist");

  NodeFS.mkdirSync(distDir, { recursive: true });

  // Copy runtime sources into meta package
  NodeFS.copyFileSync(
    NodePath.join(ROOT, "src", "bin.mjs"),
    NodePath.join(tempoDir, "bin.mjs"),
  );
  NodeFS.copyFileSync(
    NodePath.join(ROOT, "src", "const.mjs"),
    NodePath.join(tempoDir, "const.mjs"),
  );

  // Copy postinstall + its dependency into dist/
  NodeFS.copyFileSync(
    NodePath.join(ROOT, "src", "install.mjs"),
    NodePath.join(distDir, "postinstall.mjs"),
  );
  NodeFS.copyFileSync(
    NodePath.join(ROOT, "src", "const.mjs"),
    NodePath.join(distDir, "const.mjs"),
  );

  console.log("Assembled base package");

  stamp(tempoDir, version);
  publish(tempoDir);
}

/**
 * Stamp version into package.json (and optionalDependencies if present).
 * @param {string} dir
 * @param {string} version
 */
function stamp(dir, version) {
  const pkgPath = NodePath.join(dir, "package.json");
  const pkg = JSON.parse(NodeFS.readFileSync(pkgPath, "utf8"));
  pkg.version = version;

  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      pkg.optionalDependencies[dep] = version;
    }
  }

  NodeFS.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Stamped ${pkg.name}@${version}`);
}

/**
 * Publish to npm (skipped if DRY_RUN=1).
 * @param {NodeFS.PathLike} dir
 */
function publish(dir) {
  const dryRun = process.env.DRY_RUN === "1";
  const pkg = JSON.parse(
    NodeFS.readFileSync(NodePath.join(dir.toString(), "package.json"), "utf8"),
  );
  const tag = pkg.version.includes("-") ? "next" : "latest";

  if (dryRun) {
    console.log(
      `DRY RUN: would publish ${pkg.name}@${pkg.version} --tag=${tag}`,
    );
    console.log(`  dir: ${dir}`);
    console.log(
      `  files: ${NodeFS.readdirSync(dir, { recursive: true }).join(", ")}`,
    );
  } else {
    console.log(`Publishing ${pkg.name}@${pkg.version} --tag=${tag}`);
    NodeChildProcess.execSync(`npm publish --access public --tag ${tag}`, {
      stdio: "inherit",
      cwd: dir.toString(),
    });
  }
}

// Main
const opts = parseArgs();
if (opts.mode === "platform") {
  publishPlatform(opts);
} else {
  publishBase();
}
