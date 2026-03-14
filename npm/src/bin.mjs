#!/usr/bin/env node

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeModule from "node:module";
import * as NodeChildProcess from "node:child_process";

import { platformPackage, binaryName, TOOLS } from "./const.mjs";

const require = NodeModule.createRequire(import.meta.url);

/**
 * Resolve which tool to run via a 3-step cascade:
 *
 * 1. If invoked as `tempo-wallet` or `tempo-request` → use that directly
 * 2. If invoked as `tempo` → first arg is the subcommand (`wallet` → `tempo-wallet`)
 * 3. Otherwise → print usage and exit
 *
 * @returns {{ tool: string, args: string[] }}
 */
function resolveTool() {
  const invoked = NodePath.basename(process.argv[1]).replace(/\.mjs$/, "");
  const args = process.argv.slice(2);

  // Direct invocation: `tempo-wallet ...` or `tempo-request ...`
  for (const tool of TOOLS) {
    if (invoked === tool || invoked.endsWith(`/${tool}`)) {
      return { tool, args };
    }
  }

  // Subcommand dispatch: `tempo wallet ...` → `tempo-wallet`
  const sub = args[0];
  if (sub) {
    const candidate = `tempo-${sub}`;
    if (TOOLS.includes(candidate)) {
      return { tool: candidate, args: args.slice(1) };
    }
  }

  console.error("Usage: tempo <wallet|request> [args...]");
  console.error("");
  console.error("Commands:");
  console.error("  wallet    Wallet identity and custody");
  console.error("  request   HTTP client with built-in MPP payments");
  process.exit(1);
}

/**
 * Resolve the binary path. Tries:
 * 1. Platform-specific optionalDependency package
 * 2. Local `dist/` fallback (written by postinstall)
 *
 * @param {string} tool
 * @returns {string}
 */
function resolveBinary(tool) {
  const bin = binaryName(tool);
  const pkg = platformPackage();

  // Try optionalDependency
  try {
    return require.resolve(`${pkg}/bin/${bin}`);
  } catch {}

  // Try postinstall fallback location
  const fallback = new URL(`../dist/${bin}`, import.meta.url).pathname;
  if (NodeFS.existsSync(fallback)) {
    return fallback;
  }

  throw new Error(
    `Could not find the ${tool} binary. ` +
      `The platform package ${pkg} was not installed and the postinstall fallback failed. ` +
      `Try reinstalling @tempoxyz/tempo.`,
  );
}

function run() {
  const { tool, args } = resolveTool();
  const binary = resolveBinary(tool);

  try {
    NodeChildProcess.execFileSync(binary, args, { stdio: "inherit" });
  } catch (/** @type {any} */ error) {
    if (error.status !== null) {
      process.exit(error.status);
    }
    throw error;
  }
}

run();
