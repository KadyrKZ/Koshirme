FROM node:22-alpine AS build
WORKDIR /repo
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
COPY packages ./packages
COPY apps/admin-web ./apps/admin-web
COPY apps/chrome-extension/package.json ./apps/chrome-extension/package.json
COPY apps/student-desktop/package.json ./apps/student-desktop/package.json
COPY tsconfig.base.json ./
RUN npm ci --ignore-scripts
RUN npm run build --workspace @koshirme/admin-web
FROM nginx:alpine
COPY --from=build /repo/apps/admin-web/dist /usr/share/nginx/html
COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
