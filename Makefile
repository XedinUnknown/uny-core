.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: dependencies
dependencies: .env
	pnpm install --frozen-lockfile

.PHONY: agents
agents: dependencies
	pnpm exec agents-config install

.PHONY: openspec
openspec: dependencies
	pnpm exec openspec update --tools agents

.PHONY: setup
setup: agents openspec
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
