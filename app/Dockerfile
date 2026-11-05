# Dockerfile para NestJS en Producción
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

RUN npm install -g pnpm && pnpm config set minimum-release-age 0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Generar cliente de Prisma y compilar NestJS
RUN pnpm prisma generate
RUN pnpm run build

# Stage 2: Runtime liviano
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

RUN npm install -g pnpm && pnpm config set minimum-release-age 0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Directorio para base de datos y archivos de salida
RUN mkdir -p /usr/src/app/data

EXPOSE 8000

CMD ["sh", "-c", "pnpm prisma db push && node dist/main.js"]
