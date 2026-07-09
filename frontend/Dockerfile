# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx.conf contains ${NGINX_PORT} which is substituted at container start
COPY nginx.conf /etc/nginx/templates/default.conf.template

ENV NGINX_PORT=15766
EXPOSE 15766

# envsubst substitutes only ${NGINX_PORT}; all other nginx $variables are
# passed through unchanged so they are evaluated by nginx at runtime.
CMD ["/bin/sh", "-c", \
  "envsubst '${NGINX_PORT}' < /etc/nginx/templates/default.conf.template \
   > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
