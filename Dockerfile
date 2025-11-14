FROM node:22 AS build

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

FROM node:22
WORKDIR /app
COPY --from=build /app /app
EXPOSE 8787
ENV NODE_ENV=production
CMD ["npm", "start"]
