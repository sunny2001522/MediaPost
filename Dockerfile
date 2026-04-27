FROM --platform=linux/amd64 node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

FROM --platform=linux/amd64 node:20-slim AS runtime
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=8080
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
