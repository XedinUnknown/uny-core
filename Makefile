.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: dependencies
dependencies: .env
	pnpm install --frozen-lockfile

# Regenerate shared OpenSpec agent skills in .agents/skills/openspec-*/.
# Uses `init` (not `update`) because --tools is an init-only flag.
# Run after upgrading @fission-ai/openspec or changing tool configuration.
.PHONY: openspec
openspec: dependencies
	pnpm exec openspec init --tools agents --no-copilot-cloud

.PHONY: agents
agents: dependencies
	pnpm exec agents-config install

# openspec runs before agents so OpenSpec-generated skills exist in .agents/skills/
# before agents-config runs the claude-interop symlink step.
.PHONY: setup
setup: openspec agents
	pnpm --version

.PHONY: build
build: dependencies
	pnpm build

.PHONY: test
test: dependencies
	pnpm test

.PHONY: validate-specs
validate-specs: dependencies
	@set -e; \
	roots=$$(find . \
	  \( -name node_modules -o -name .git -o -name generated -o -name vendor \) -prune \
	  -o -name config.yaml -path "*/openspec/config.yaml" -print \
	  | sed 's|/openspec/config\.yaml$$||' | sort); \
	for root in $$roots; do \
	  echo "--- openspec validate: $$root ---"; \
	  (cd "$$root" && OPENSPEC_TELEMETRY=0 "$(CURDIR)/node_modules/.bin/openspec" validate --all --strict); \
	done

.PHONY: dev
dev: dependencies
	sleep infinity
