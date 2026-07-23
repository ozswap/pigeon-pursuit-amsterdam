FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript tsx --save-dev && npm run build && cp src/db/schema.sql dist/db/ && npm prune --omit=dev
EXPOSE 3001
CMD ["node", "dist/index.js"]
