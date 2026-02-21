#!/bin/sh
# 前端容器启动脚本
# 1. 自动从 /etc/resolv.conf 提取 DNS resolver
# 2. 清理 BACKEND_URL 两端空白
# 3. 生成 nginx 配置并启动

# 提取 DNS（兼容 Docker/K8s/微信云托管）
RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null)
if [ -z "$RESOLVER" ]; then
  RESOLVER="127.0.0.11"
fi

# 清理 BACKEND_URL 前后空白（防止 Dockerfile ENV 或控制台配置混入空格）
BACKEND_URL=$(echo "$BACKEND_URL" | tr -d '[:space:]')
if [ -z "$BACKEND_URL" ]; then
  BACKEND_URL="http://backend:8088"
fi

echo "[startup] RESOLVER=${RESOLVER}"
echo "[startup] BACKEND_URL=${BACKEND_URL}"

# 替换模板变量，生成最终 nginx 配置
export RESOLVER
export BACKEND_URL
envsubst '${BACKEND_URL} ${RESOLVER}' \
  < /etc/nginx/templates/app.conf.template \
  > /etc/nginx/conf.d/app.conf

echo "[startup] Generated nginx config:"
cat /etc/nginx/conf.d/app.conf

# 启动 nginx
exec nginx -g "daemon off;"
