FROM node:14 as build-deps

RUN apt-get update && apt-get install -y wget dumb-init netcat-openbsd

WORKDIR /usr/src/app
COPY package*.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD /bin/sh -c ' \
  echo "Waiting for MySQL..."; \
  while ! nc -z ${DB_HOST} 3306; do sleep 1; done; \
  echo "MySQL ready!"; \
  npx sequelize db:migrate; \
  node dist/server.js'