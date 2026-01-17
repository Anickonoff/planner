FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Копируем исходники
COPY src ./src

# Порт для health/ready
EXPOSE 3000

# Healthcheck контейнера
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Запуск сервиса
CMD ["node", "src/server.js"]
