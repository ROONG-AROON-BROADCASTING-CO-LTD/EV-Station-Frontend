FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /src
COPY package.json ./
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_GOOGLE_MAPS_BROWSER_API_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_MAPS_BROWSER_API_KEY=$VITE_GOOGLE_MAPS_BROWSER_API_KEY
RUN pnpm build

FROM nginx:1.27-alpine
ENV API_UPSTREAM=http://host.docker.internal:8080
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
