# DocuMind React SPA — build with Vite, serve static with nginx (Stage 7).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter client build

FROM nginx:alpine AS prod
COPY --from=build /repo/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
