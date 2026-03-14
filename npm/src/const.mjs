/** @type {readonly string[]} */
export const TOOLS = ["tempo-wallet", "tempo-request"];

/** @type {(tool: string) => string} */
export const binaryName = (tool) =>
  process.platform === "win32" ? `${tool}.exe` : tool;

/**
 * Maps Node.js `process.platform` + `process.arch` to the scoped npm package
 * that contains the prebuilt binary for that platform.
 */
export const BINARY_DISTRIBUTION_PACKAGES =
  /** @type {Record<string, Record<string, string>>} */ ({
    darwin: {
      x64: "@tempoxyz/tempo-darwin-x64",
      arm64: "@tempoxyz/tempo-darwin-arm64",
    },
    linux: {
      x64: "@tempoxyz/tempo-linux-x64",
      arm64: "@tempoxyz/tempo-linux-arm64",
    },
  });

/**
 * Resolves the platform-specific package name for the current OS + arch.
 *
 * @returns {string}
 */
export function platformPackage() {
  const os = process.platform;
  const arch = process.arch;
  const pkg = BINARY_DISTRIBUTION_PACKAGES[os]?.[arch];
  if (!pkg) {
    throw new Error(
      `Unsupported platform: ${os}-${arch}. ` +
        `Supported: ${Object.entries(BINARY_DISTRIBUTION_PACKAGES)
          .flatMap(([o, archs]) => Object.keys(archs).map((a) => `${o}-${a}`))
          .join(", ")}`,
    );
  }
  return pkg;
}
