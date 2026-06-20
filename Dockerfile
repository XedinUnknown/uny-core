FROM node:22-bookworm-slim AS dev

WORKDIR /workspace

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

CMD ["pnpm", "--version"]
