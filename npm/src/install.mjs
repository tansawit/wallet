#!/usr/bin/env node

/**
 * Postinstall fallback: downloads binaries from the npm registry when
 * optionalDependencies were not installed (e.g. --ignore-scripts, Deno, Bun).
 *
 * 1. Check if platform package binaries already exist via require.resolve
 * 2. If yes → skip
 * 3. If no → fetch the package tarball from the npm registry, verify integrity,
 *    extract binaries, and write them to dist/
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeZlib from "node:zlib";
import * as NodeHttps from "node:https";
import * as NodeCrypto from "node:crypto";
import * as NodeModule from "node:module";

import { platformPackage, binaryName, TOOLS } from "./const.mjs";

const require = NodeModule.createRequire(import.meta.url);

const REGISTRY =
  process.env.npm_config_registry || "https://registry.npmjs.org";
const MAX_METADATA_SIZE = 5 * 1024 * 1024; // 5 MiB
const MAX_TARBALL_SIZE = 200 * 1024 * 1024; // 200 MiB
const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 30_000;

/**
 * Check if all binaries are already available via the platform package.
 * @returns {boolean}
 */
function alreadyInstalled() {
  try {
    for (const tool of TOOLS) {
      const pkg = platformPackage();
      const bin = binaryName(tool);
      require.resolve(`${pkg}/bin/${bin}`);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @param {number} maxSize
 * @param {number} redirects
 * @returns {Promise<Buffer>}
 */
function fetch(url, maxSize, redirects = 0) {
  if (redirects > MAX_REDIRECTS) throw new Error("Too many redirects");

  if (url.startsWith("http://") && !url.includes("localhost")) {
    throw new Error(`Refusing insecure HTTP URL: ${url}`);
  }

  return new Promise((resolve, reject) => {
    const request = NodeHttps.get(url, { timeout: TIMEOUT_MS }, (response) => {
      if (
        response?.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        resolve(fetch(response.headers.location, maxSize, redirects + 1));
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} from ${url}`));
        return;
      }
 
     /** @type {Array<Buffer>} */
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxSize) {
          response.destroy();
          reject(new Error(`Response exceeded ${maxSize} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
    });
  });
}

/**
 * Extract files from a tar buffer (uncompressed).
 * Minimal TAR parser — 512-byte block format.
 *
 * @param {Buffer} tar
 * @param {(name: string, content: Buffer) => void} callback
 */
function extractTar(tar, callback) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);

    // End-of-archive: two consecutive zero blocks
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString("utf8").replace(/\0+$/, "");
    const sizeStr = header
      .subarray(124, 136)
      .toString("utf8")
      .replace(/\0+$/, "");
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    if (size > 0) {
      const content = tar.subarray(offset, offset + size);
      callback(name, content);
      // Advance past content, aligned to 512-byte blocks
      offset += Math.ceil(size / 512) * 512;
    }
  }
}

/**
 * Decompress a gzipped buffer.
 * @param {Buffer} buf
 * @returns {Promise<Buffer>}
 */
function gunzip(buf) {
  return new Promise((resolve, reject) => {
     /** @type {Array<Buffer>} */
    const chunks = [];
    const gz = NodeZlib.createGunzip();
    gz.on("data", (chunk) => chunks.push(chunk));
    gz.on("end", () => resolve(Buffer.concat(chunks)));
    gz.on("error", reject);
    gz.end(buf);
  });
}

async function main() {
  if (alreadyInstalled()) {
    console.log(
      "Platform-specific package already installed. Skipping postinstall.",
    );
    return;
  }

  console.log("Platform package not found, downloading from npm registry...");

  // All tools share the same platform package, pick the first to get pkg name
  const pkg = platformPackage();
  const distDir = new URL("../dist", import.meta.url).pathname;

  // Read our own package.json to get the version to download
  const selfPkg = require(new URL("../package.json", import.meta.url).pathname);
  const version = selfPkg.optionalDependencies?.[pkg];
  if (!version) {
    throw new Error(`Could not determine version for ${pkg} from package.json`);
  }

  // Fetch package metadata from registry
  const encodedPkg = encodeURIComponent(pkg).replace("%40", "@");
  const metadataUrl = `${REGISTRY}/${encodedPkg}/${version}`;
  console.log(`Fetching metadata: ${metadataUrl}`);
  const metadata = JSON.parse(
    (await fetch(metadataUrl, MAX_METADATA_SIZE)).toString(),
  );

  const tarballUrl = metadata.dist?.tarball;
  if (!tarballUrl) {
    throw new Error(`No tarball URL in package metadata for ${pkg}@${version}`);
  }

  // Download and extract tarball
  console.log(`Downloading: ${tarballUrl}`);
  const tarballGz = await fetch(tarballUrl, MAX_TARBALL_SIZE);

  // Verify integrity if available
  const integrity = metadata.dist?.integrity;
  const shasum = metadata.dist?.shasum;
  if (integrity) {
    const [algo, expected] = integrity.split("-", 2);
    const actual = NodeCrypto.createHash(algo)
      .update(tarballGz)
      .digest("base64");
    if (actual !== expected) {
      throw new Error(
        `Integrity check failed: expected ${integrity}, got ${algo}-${actual}`,
      );
    }
    console.log(`Integrity verified (${algo})`);
  } else if (shasum) {
    const actual = NodeCrypto.createHash("sha1")
      .update(tarballGz)
      .digest("hex");
    if (actual !== shasum) {
      throw new Error(`Shasum check failed: expected ${shasum}, got ${actual}`);
    }
    console.log("Integrity verified (sha1)");
  } else {
    console.warn("Warning: no integrity information available for tarball");
  }

  const tar = await gunzip(tarballGz);

  // Extract binaries
  NodeFS.mkdirSync(distDir, { recursive: true });

  const expectedBins = new Set(TOOLS.map(binaryName));
  let extracted = 0;

  extractTar(tar, (name, content) => {
    // Tarball paths are prefixed with `package/`
    const parts = name.split("/");
    const fileName = parts[parts.length - 1];
    if (parts.includes("bin") && expectedBins.has(fileName)) {
      const dest = NodePath.join(distDir, fileName);
      NodeFS.writeFileSync(dest, content);
      NodeFS.chmodSync(dest, 0o755);
      console.log(`Extracted: ${fileName}`);
      extracted++;
    }
  });

  if (extracted === 0) throw new Error("No binaries found in tarball");

  console.log(`Successfully installed ${extracted} binaries to ${distDir}`);
}

main().catch((error) => {
  console.error(`Postinstall fallback failed: ${error.message}`);
  console.error("You may need to install the platform package manually.");
  // Don't fail the install — postinstall failures shouldn't block npm install
  process.exit(0);
});
