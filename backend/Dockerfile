FROM node:18

WORKDIR /usr/src/app
COPY package*.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD /bin/sh -c ' \
  echo "Waiting for MySQL..."; \
  node -e "const n=require(\"net\");const h=process.env.DB_HOST||\"localhost\";(function w(){let c=n.connect(3306,h,()=>{c.destroy();console.log(\"MySQL ready!\");process.exit(0)});c.on(\"error\",()=>{c.destroy();setTimeout(w,1000)})})()"; \
  npx sequelize db:migrate; \
  npx sequelize db:seed:all 2>/dev/null || true; \
  node dist/server.js'
