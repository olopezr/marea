FROM node:25-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public

# Suscripciones a avisos y claves: en un volumen persistente.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:8080/api/health >/dev/null || exit 1
CMD ["node", "server/index.js"]
