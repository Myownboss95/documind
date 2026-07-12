# DocuMind Next.js app — build + `next start` (Stage 7).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter nextapp build

FROM node:22-alpine AS prod
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/server/package.json ./server/package.json
COPY --from=build /repo/client/package.json ./client/package.json
COPY --from=build /repo/nextapp/package.json ./nextapp/package.json
RUN pnpm install --prod --filter nextapp --frozen-lockfile=false
COPY --from=build /repo/nextapp/.next ./nextapp/.next
COPY --from=build /repo/nextapp/next.config.mjs ./nextapp/next.config.mjs
WORKDIR /repo/nextapp
EXPOSE 3000
CMD ["pnpm", "start"]
