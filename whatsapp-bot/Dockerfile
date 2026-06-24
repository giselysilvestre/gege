FROM node:20-alpine
WORKDIR /app
COPY whatsapp-bot/package.json ./
RUN npm install --production
COPY whatsapp-bot/*.js ./
COPY shared/score-final.js /shared/score-final.js
COPY whatsapp-bot/.env.example ./
EXPOSE 3333
CMD ["node", "index.js"]
