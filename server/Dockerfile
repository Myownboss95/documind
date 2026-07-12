# DocuMind API — multi-stage build (Stage 7). Build context = repo root (pnpm workspace).
# --- build stage: full deps + compile TS -> dist ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter server build

# --- prod stage: prod deps only + compiled output (smaller, non-root) ---
FROM node:22-alpine AS prod
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
# All workspace package.json files so pnpm can resolve the workspace, then install
# ONLY the server package's production dependencies.
COPY --from=build /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/server/package.json ./server/package.json
COPY --from=build /repo/client/package.json ./client/package.json
COPY --from=build /repo/nextapp/package.json ./nextapp/package.json
RUN pnpm install --prod --filter server --frozen-lockfile=false
COPY --from=build /repo/server/dist ./server/dist
RUN addgroup -S app && adduser -S app -G app && chown -R app /repo
USER app
WORKDIR /repo/server
EXPOSE 4000
# RUN_MIGRATIONS=true (set in compose) applies pending migrations on boot.
CMD ["node", "dist/main.js"]
