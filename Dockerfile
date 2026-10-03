FROM node:24-alpine AS build
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-alpine AS runtime
RUN npm install -g pnpm@11.19.0 && addgroup -S inboxflow && adduser -S inboxflow -G inboxflow
WORKDIR /app
COPY --from=build --chown=inboxflow:inboxflow /app /app
USER inboxflow
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000 4000
CMD ["pnpm", "start:api"]
