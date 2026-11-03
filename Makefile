.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: dependencies
dependencies: .env
	pnpm install --frozen-lockfile

.PHONY: agents
agents: dependencies
	pnpm exec agents-config install

.PHONY: mcp
mcp: dependencies
	node bin/sync-mcp.mjs

.PHONY: setup
setup: agents mcp
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
	pnpm test

.PHONY: dev
dev: dependencies
	sleep infinity
