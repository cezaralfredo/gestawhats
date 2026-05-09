FROM node:18-alpine as build-deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY .env* ./
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY vite.config.js ./
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache jq

ENV PUBLIC_HTML=/var/www/public/

COPY .docker/nginx /etc/nginx/
COPY --from=build-deps /usr/src/app/build ${PUBLIC_HTML}
EXPOSE 80

COPY .docker/add-env-vars.sh /docker-entrypoint.d/01-add-env-vars.sh
RUN chmod +x /docker-entrypoint.d/01-add-env-vars.sh
