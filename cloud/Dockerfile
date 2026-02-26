FROM node:22-slim AS build

WORKDIR /app

COPY cloud/package.json cloud/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

COPY cloud/tsconfig.json ./
COPY cloud/src/ ./src/
RUN npx tsc

FROM node:22-slim

WORKDIR /app

COPY cloud/package.json cloud/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY --from=build /app/dist ./dist/
COPY remote-ui/ ./remote-ui/

RUN mkdir -p /app/data

EXPOSE 3800

CMD ["node", "dist/cli.js", "start"]
