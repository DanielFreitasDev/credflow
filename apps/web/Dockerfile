# ---- Build stage ----
FROM node:24-bookworm-slim@sha256:c2d5ade763cacfb03fe9cb8e8af5d1be5041ff331921fa26a9b231ca3a4f780a AS build
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
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:054e14f543eb688809d59ec2ad1644d1a61678e247c87a318ad605977eb37eaf AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
