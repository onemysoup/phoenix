# syntax=docker/dockerfile:1
# Build TypeScript with dev dependencies, then ship only runtime dependencies
# and Playwright's browser in the final image.
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PHOENIX_STATE_DIR=/tmp/phoenix-state

WORKDIR /app

# Install only production dependencies in the final image, including Playwright.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npx playwright install --with-deps chromium \
    && groupadd --system phoenix \
    && useradd --system --gid phoenix --create-home phoenix \
    && mkdir -p /tmp/phoenix-state /ms-playwright \
    && chown -R phoenix:phoenix /app /tmp/phoenix-state /ms-playwright

COPY --from=builder /app/dist ./dist

USER phoenix

# MCP uses stdio: stdout is reserved for protocol messages, while operational
# logs are written by the application to stderr.
CMD ["node", "dist/index.js"]
