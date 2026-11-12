# ---- 1. build the frontend (React + Base UI, bundled with Vite) ----
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 2. runtime: the dependency-free Node server + the built pages ----
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY --from=web /web/dist ./public
# Make the app readable by the non-root user no matter what permissions the files had on the host.
RUN chmod -R a+rX /app && mkdir -p /data && chown node:node /data
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "server.js"]
