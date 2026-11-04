FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
# Make the app readable by the non-root user no matter what permissions the files had on the host.
RUN chmod -R a+rX /app && mkdir -p /data && chown node:node /data
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "server.js"]
