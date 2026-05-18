FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Use --legacy-peer-deps to resolve peer dependency conflicts
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

ENV GENERATE_SOURCEMAP=false
ENV SKIP_PREFLIGHT_CHECK=true

CMD ["npm", "start"]