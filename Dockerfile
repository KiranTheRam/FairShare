# syntax=docker/dockerfile:1.7
FROM node:22.14.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM node:22.14.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    WRANGLER_WRITE_LOGS=false \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 fairshare \
    && useradd --system --uid 1001 --gid fairshare --home-dir /app fairshare

COPY --from=builder --chown=fairshare:fairshare /app/dist ./dist
COPY --from=builder --chown=fairshare:fairshare /app/server.mjs ./server.mjs

USER fairshare
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.mjs"]
