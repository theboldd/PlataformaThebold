# THE BOLD OS — serviço contínuo no Railway (Node 22 + ffmpeg para capas e prévias de vídeo).
# A base e os arquivos ficam no volume /data (montado pelo Railway); nada de dado entra na imagem além do snapshot cifrado.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production BOLD_DATA_DIR=/data BOLD_STORAGE_DIR=/data PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
EXPOSE 4000
CMD ["node", "--no-warnings=ExperimentalWarning", "server/boot.js"]
