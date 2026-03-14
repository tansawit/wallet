.PHONY: build release clean check test fix install uninstall run coverage npm-dev npm-dev-js npm-check npm-check-js

build:
	cargo build

# make run ARGS="http://localhost:3000/api/data"
run:
	cargo run -q -p tempo-wallet -- $(ARGS)

release:
	cargo build --release

install: release
	mkdir -p $(HOME)/.local/bin
	cp target/release/tempo-wallet $(HOME)/.local/bin/tempo-wallet
	cp target/release/tempo-request $(HOME)/.local/bin/tempo-request
	chmod +x $(HOME)/.local/bin/tempo-wallet $(HOME)/.local/bin/tempo-request

uninstall:
	rm -f $(HOME)/.local/bin/tempo-wallet $(HOME)/.local/bin/tempo-request

clean:
	cargo clean

# Run all tests (uses mocks, no network required)
test:
	cargo test --workspace --all-features --locked

# Full local parity with CI lint+test gates.
# Requires `typos` and `cargo-deny` to be installed.
check:
	cargo +nightly fmt --all -- --check
	cargo +nightly clippy --workspace --all-targets --all-features --locked -- -D warnings
	cargo test --workspace --all-features --locked
	RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps --locked
	typos
	cargo deny check

fix:
	cargo +nightly fmt --all
	cargo clippy --fix --allow-dirty --allow-staged

# Generate coverage locally (requires cargo-llvm-cov and llvm-tools-preview)
# Install once: `rustup component add llvm-tools-preview` and `cargo install cargo-llvm-cov`
coverage:
	cargo llvm-cov --all-features --workspace --fail-under-lines 85 --lcov --output-path lcov.info

# Build and link npm packages locally for development (via script)
npm-dev-js:
	cd npm && DRY_RUN=1 RELEASE_VERSION=0.0.0-dev node scripts/dev.mjs

# Full npm install smoke test (via script)
npm-check-js:
	cd npm && DRY_RUN=1 RELEASE_VERSION=0.0.0-check node scripts/check.mjs

# Build and link npm packages locally for development
npm-dev:
	cargo build --package tempo-wallet --package tempo-request
	cd npm && DRY_RUN=1 RELEASE_VERSION=0.0.0-dev node scripts/publish.mjs platform \
		--os $$(node -e "console.log(process.platform)") \
		--arch $$(node -e "console.log(process.arch)") \
		--binaries ../target/debug/tempo-wallet,../target/debug/tempo-request
	cd npm && DRY_RUN=1 RELEASE_VERSION=0.0.0-dev node scripts/publish.mjs base
	cd npm/tempo-$$(node -e "console.log(process.platform)")-$$(node -e "console.log(process.arch)") && npm link
	cd npm/tempo && npm link @tempoxyz/tempo-$$(node -e "console.log(process.platform)")-$$(node -e "console.log(process.arch)") && npm link
	@echo "\n✅ Linked. Run: tempo wallet --help"

# Full npm install smoke test (pack + install in tmpdir)
npm-check:
	cargo build --package tempo-wallet --package tempo-request
	cd npm && DRY_RUN=1 RELEASE_VERSION=0.0.0-check node scripts/publish.mjs platform \
		--os $$(node -e "console.log(process.platform)") \
		--arch $$(node -e "console.log(process.arch)") \
		--binaries ../target/debug/tempo-wallet,../target/debug/tempo-request
	cd npm && DRY_RUN=1 RELEASE_VERSION=0.0.0-check node scripts/publish.mjs base
	$(eval TMPDIR := $(shell mktemp -d))
	cd npm/tempo-$$(node -e "console.log(process.platform)")-$$(node -e "console.log(process.arch)") && npm pack --pack-destination $(TMPDIR)
	cd npm/tempo && npm pack --pack-destination $(TMPDIR)
	cd $(TMPDIR) && npm init -y && npm install tempoxyz-tempo-$$(node -e "console.log(process.platform)")-$$(node -e "console.log(process.arch)")-0.0.0-check.tgz tempoxyz-tempo-0.0.0-check.tgz
	$(TMPDIR)/node_modules/.bin/tempo-wallet --help
	$(TMPDIR)/node_modules/.bin/tempo-request --help
	rm -rf $(TMPDIR)
	@echo "\n✅ npm-check passed"
