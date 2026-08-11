# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim AS build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV=local
ENV NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV=$NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace @amanor/admin --workspace @amanor/contracts --include-workspace-root=false
COPY tsconfig.base.json ./
COPY apps/admin apps/admin
COPY packages/contracts packages/contracts
RUN npm run build --workspace @amanor/contracts && npm run build --workspace @amanor/admin

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /workspace
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=node:node /workspace/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/admin/.next/static ./apps/admin/.next/static
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/admin/server.js"]
