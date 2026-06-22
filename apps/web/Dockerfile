# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL is baked into the bundle at build time.
ARG VITE_API_URL=http://localhost:3333
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Runtime stage (nginx, non-root) ----
# nginx-unprivileged runs as the non-root `nginx` user (uid 101) and listens on
# 8080 by default — no root, no privileged port binding.
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
