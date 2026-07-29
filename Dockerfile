# syntax=docker/dockerfile:1
# A single runtime stage keeps the Playwright browser and its OS dependencies in
# the same image as the MCP server. Build with a pinned lockfile using:
#   docker build -t phoenix-mcp:local .
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PHOENIX_STATE_DIR=/tmp/phoenix-state

WORKDIR /app

# Install exactly the JavaScript dependency graph recorded in package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && npx playwright install --with-deps chromium \
    && npm prune --omit=dev \
    && groupadd --system phoenix \
    && useradd --system --gid phoenix --create-home phoenix \
    && mkdir -p /tmp/phoenix-state /ms-playwright \
    && chown -R phoenix:phoenix /app /tmp/phoenix-state /ms-playwright

USER phoenix

# MCP uses stdio: stdout is reserved for protocol messages, while operational
# logs are written by the application to stderr.
CMD ["node", "dist/index.js"]
