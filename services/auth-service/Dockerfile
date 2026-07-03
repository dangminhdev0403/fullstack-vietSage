FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080
CMD ["node", "dist/main.js"]
