# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY shared/ shared/
COPY web/ web/

# Install dependencies
RUN npm ci --workspace=shared --workspace=web

# Build shared package
RUN npm run build -w shared

# Build web frontend
RUN npm run build -w web

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
