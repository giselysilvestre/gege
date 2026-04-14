FROM node:20-alpine
WORKDIR /app
COPY whatsapp-bot/package.json ./
RUN npm install --production
COPY whatsapp-bot/ .
EXPOSE 3333
CMD ["node", "index.js"]
