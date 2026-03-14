FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/package.json ./apps/client/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json

RUN npm ci

FROM deps AS server-builder
COPY tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages/game-core ./packages/game-core

RUN npm run build --workspace @acatgame/game-core
RUN npm run build --workspace @acatgame/server

FROM node:22-bookworm-slim AS server-runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/package.json ./apps/client/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json

RUN npm ci --omit=dev

COPY --from=server-builder /app/packages/game-core/dist ./packages/game-core/dist
COPY --from=server-builder /app/apps/server/dist ./apps/server/dist

EXPOSE 8000

CMD ["node", "apps/server/dist/index.js"]

FROM deps AS client-builder

ARG VITE_SERVER_URL=
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

COPY tsconfig.base.json ./
COPY apps/client ./apps/client
COPY packages/game-core ./packages/game-core

RUN npm run build --workspace @acatgame/game-core
RUN npm run build --workspace @acatgame/client

FROM nginx:1.27-alpine AS client-runtime

COPY docker/nginx.client.conf /etc/nginx/conf.d/default.conf
COPY --from=client-builder /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80
