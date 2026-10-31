# syntax=docker/dockerfile:1

# ---------- Stage 1: cai phu thuoc va build TypeScript ----------
FROM node:20-alpine AS build
WORKDIR /app

# Chi copy file khai bao phu thuoc truoc -> tang npm ci duoc cache
# khi chi sua ma nguon
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- Stage 2: image production ----------
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Chi lay nhung gi can de chay: phu thuoc production + JS da build
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# DATABASE_URL va JWT_SECRET KHONG duoc dat o day.
# Chung duoc truyen vao luc chay: docker run --env-file / secret cua nen tang.

# Chay bang nguoi dung khong co quyen quan tri (co san trong image node)
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Chay truc tiep node (PID 1 nhan SIGTERM), khong dung npm va khong dung che do dev
CMD ["node", "dist/main.js"]
