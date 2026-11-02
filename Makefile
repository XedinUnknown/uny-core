.DEFAULT_GOAL := setup

.env:
	test -e .env || cp .env.example .env

.PHONY: image
image: .env
	docker compose config --quiet
	docker compose build dev

.PHONY: dependencies
dependencies: image
	docker compose run --rm dev pnpm install --frozen-lockfile

.PHONY: agents
agents: dependencies
	docker compose run --rm dev pnpm exec agents-config install

.PHONY: setup
setup: agents
	docker compose run --rm dev pnpm --version

.PHONY: build
build: dependencies
	docker compose run --rm dev pnpm build

.PHONY: test
test: dependencies
	docker compose run --rm dev pnpm test

.PHONY: dev
dev: dependencies
	docker compose up -d dev

.PHONY: down
down: .env
	docker compose down
