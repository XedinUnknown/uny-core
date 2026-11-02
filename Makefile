.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: dependencies
dependencies: .env
	pnpm install --frozen-lockfile

.PHONY: agents
agents: dependencies
	pnpm exec agents-config install

.PHONY: setup
setup: agents
	pnpm --version

.PHONY: build
build: dependencies
	pnpm build

.PHONY: test
test: dependencies
	pnpm test

.PHONY: dev
dev: dependencies
	sleep infinity
