FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY *.js ./
COPY lib/ ./lib/
COPY .env.example ./
EXPOSE 3333
CMD ["node", "index.js"]
