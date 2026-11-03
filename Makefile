.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: dependencies
dependencies: .env
	pnpm install --frozen-lockfile

.PHONY: agents
agents: dependencies
	pnpm exec agents-config install

# Regenerate shared OpenSpec agent skills in .agents/skills/openspec-*/.
# Uses `init` (not `update`) because --tools is an init-only flag.
# Run after upgrading @fission-ai/openspec or changing tool configuration.
.PHONY: openspec
openspec: dependencies
	pnpm exec openspec init --tools agents --no-copilot-cloud

.PHONY: setup
setup: agents openspec
	pnpm --version

.PHONY: build
build: dependencies
	pnpm build

.PHONY: test
test: dependencies
	pnpm test

# Validate each package root independently with the shared CLI.
.PHONY: validate-specs
validate-specs: dependencies
	@set -e; for pkg in di core cli; do \
		echo "--- openspec validate: packages/$$pkg ---"; \
		(cd packages/$$pkg && OPENSPEC_TELEMETRY=0 ../../node_modules/.bin/openspec validate --all --strict); \
	done

.PHONY: dev
dev: dependencies
	sleep infinity
