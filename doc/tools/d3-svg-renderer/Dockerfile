FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      fonts-dejavu-core \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/rbc-d3-svg-renderer

COPY doc/tools/d3-svg-renderer/package.json ./package.json
RUN npm install --omit=dev

COPY doc/tools/d3-svg-renderer/render-diagram.mjs ./render-diagram.mjs

ENTRYPOINT ["node", "/opt/rbc-d3-svg-renderer/render-diagram.mjs"]
