FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js ./
COPY ana-prompt.js ./
COPY webhook-kapso.js ./
COPY beneficios-vaga.js ./
COPY .env.example ./
EXPOSE 3333
CMD ["node", "index.js"]
