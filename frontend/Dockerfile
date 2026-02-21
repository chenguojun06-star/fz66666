# ===================================================
# 微信云托管 - PC端前端 Dockerfile
# 多阶段构建：Node.js 构建 → Nginx 托管
# ===================================================

# ----------- 阶段一：构建 React 应用 -----------
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制 package 文件（利用 Docker 层缓存）
COPY package.json package-lock.json* ./

RUN npm ci --legacy-peer-deps

# 复制源码并构建
COPY . .

# 构建生产包（去掉 console/debugger，代码分割）
RUN npm run build

# ----------- 阶段二：用 Nginx 托管静态文件 -----------
FROM nginx:1.25-alpine

# 删除默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 安装 envsubst（gettext 工具包，用于替换环境变量）
RUN apk add --no-cache gettext

# 复制 Nginx 配置模板（含 ${BACKEND_URL} 占位符）
COPY nginx.conf.template /etc/nginx/templates/app.conf.template

# 复制启动脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 微信云托管默认监听 80 端口
EXPOSE 80

# 环境变量默认值（可在微信云托管控制台覆盖）
ENV BACKEND_URL=http://backend:8088

CMD ["/docker-entrypoint.sh"]
