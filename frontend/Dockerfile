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

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 微信云托管默认监听 80 端口
EXPOSE 80

# 环境变量默认值（可在微信云托管控制台覆盖）
# BACKEND_URL: 后端 Spring Boot 服务的内网地址
ENV BACKEND_URL=http://backend:8088

# 启动流程：
# 1. 从 /etc/resolv.conf 提取容器 DNS 地址（兼容 Docker/K8s/云托管）
# 2. envsubst 替换 BACKEND_URL 和 RESOLVER 到 nginx 配置
# 3. 打印最终配置到日志（方便在云托管控制台查看）
# 4. 启动 nginx
CMD ["/bin/sh", "-c", "\
  export RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null || echo '127.0.0.11') && \
  echo \"[startup] RESOLVER=$RESOLVER  BACKEND_URL=$BACKEND_URL\" && \
  envsubst '${BACKEND_URL} ${RESOLVER}' < /etc/nginx/templates/app.conf.template > /etc/nginx/conf.d/app.conf && \
  echo '--- Generated nginx config ---' && cat /etc/nginx/conf.d/app.conf && echo '---' && \
  nginx -g 'daemon off;'"]
