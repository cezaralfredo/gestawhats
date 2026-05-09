FROM node:14 as build-deps

RUN apt-get update && apt-get install -y wget dumb-init

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
  node -e "const n=require(\"net\");const h=process.env.DB_HOST||\"localhost\";(function w(){let c=n.connect(3306,h,()=>{c.destroy();console.log(\"MySQL ready!\");process.exit(0)});c.on(\"error\",()=>{c.destroy();setTimeout(w,1000)})})()"; \
  npx sequelize db:migrate; \
  node dist/server.js'