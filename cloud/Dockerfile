FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

RUN mkdir -p /app/data

EXPOSE 3800

CMD ["node", "dist/cli.js", "start"]
