#!/usr/bin/env bash


set -euo pipefail

# cleanup all generated artifacts

REPO_ROOT=$(git rev-parse --show-toplevel)

cd "$REPO_ROOT"
rm -rf ./npm/node_modules
rm -rf ./npm/package-lock.json
# remove npm/tempo/{dist,node_modules,bin.mjs,const.mjs}
rm -rf ./npm/tempo/{dist,node_modules,bin.mjs,const.mjs}

# remove tempo-darwin-arm64, tempo-darwin-x64, tempo-linux-arm64, tempo-linux-x64
rm -rf ./npm/tempo-linux-x64
rm -rf ./npm/tempo-darwin-x64
rm -rf ./npm/tempo-linux-arm64
rm -rf ./npm/tempo-darwin-arm64

rm -rf ./npm/package-lock.json

git checkout ./npm/tempo/package.json
