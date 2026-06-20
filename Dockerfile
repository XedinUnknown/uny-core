FROM node:22-bookworm-slim AS dev

WORKDIR /workspace

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

CMD ["pnpm", "--version"]

# ── builder: compile all packages ──
FROM node:22-bookworm-slim AS builder

WORKDIR /build

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm build

# ── runtime: minimal image with prod deps only ──
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./

COPY --from=builder /build/packages ./packages

# prod-only install — skips devDependencies
RUN pnpm install --frozen-lockfile --prod

ENV UNY_PROJECT_DIR=/project

WORKDIR /project

ENTRYPOINT ["node", "/app/packages/cli/dist/bin/uny.js"]

CMD ["--help"]
