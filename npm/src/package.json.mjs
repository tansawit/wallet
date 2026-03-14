/**
 * Generate a platform-specific package.json.
 *
 * @param {{ os: string, arch: string, version: string }} opts
 * @returns {string}
 */
export function platformPackageJson({ os, arch, version }) {
  return JSON.stringify(
    {
      name: `@tempoxyz/tempo-${os}-${arch}`,
      version,
      description: "Platform-specific binaries for @tempoxyz/tempo",
      license: "(MIT OR Apache-2.0)",
      os: [os],
      cpu: [arch],
      preferUnplugged: true,
      repository: {
        type: "git",
        url: "https://github.com/tempoxyz/wallet",
      },
    },
    null,
    2,
  ) + "\n";
}
