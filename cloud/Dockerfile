FROM node:22-slim AS build

WORKDIR /app

COPY cloud/package.json cloud/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

COPY cloud/tsconfig.json ./
COPY cloud/src/ ./src/
RUN npx tsc

FROM node:22-slim

WORKDIR /app

# Install Claude Code CLI (required by Agent SDK for headless sessions)
RUN apt-get update -qq && apt-get install -y -qq curl && \
    curl -fsSL https://claude.ai/install.sh | bash && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.claude/bin:$PATH"

COPY cloud/package.json cloud/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY --from=build /app/dist ./dist/
COPY remote-ui/ ./remote-ui/

RUN mkdir -p /app/data

EXPOSE 3800

CMD ["node", "dist/cli.js", "start"]
