.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: dependencies
dependencies: .env
	pnpm install --frozen-lockfile

.PHONY: agents
agents: openspec
	pnpm exec agents-config install

# Regenerate shared OpenSpec agent skills in .agents/skills/openspec-*/.
# Uses `init` (not `update`) because --tools is an init-only flag.
# Run after upgrading @fission-ai/openspec or changing tool configuration.
.PHONY: openspec
openspec: dependencies
	pnpm exec openspec init --tools agents --no-copilot-cloud

.PHONY: setup
setup: agents
	pnpm --version

# Run from the host (not inside Docker) to verify host prerequisites.
# Checks that uvx is present and executable at $$HOME/.local/bin/uvx.
# JetBrains MCP availability is optional and not checked here.
# Does not invoke any server or install any software.
.PHONY: check-host
check-host:
	@node -e " \
	  const fs = require('fs'); \
	  const home = process.env.HOME; \
	  if (!home) { console.error('ERROR: HOME is not set'); process.exit(1); } \
	  const uvx = home + '/.local/bin/uvx'; \
	  try { fs.accessSync(uvx, fs.constants.X_OK); } \
	  catch { \
	    console.error('ERROR: uvx not found or not executable at ' + uvx); \
	    console.error('Install uv: https://docs.astral.sh/uv/'); \
	    process.exit(1); \
	  } \
	  console.log('OK: uvx executable at ' + uvx); \
	"

.PHONY: build
build: dependencies
	pnpm build

.PHONY: test
test: dependencies
	pnpm test:tooling
	pnpm test

# Validate every openspec root (repo root + packages/*) that contains openspec/config.yaml.
# Discovers roots dynamically; excludes node_modules, .git, generated, and vendor trees.
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
