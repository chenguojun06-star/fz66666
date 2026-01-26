#!/bin/bash

# 🎯 服装供应链管理系统 - 本地打包脚本
# 用途：打包后端和前端，准备上传到云服务器

set -e

echo "=========================================="
echo "📦 服装供应链管理系统 - 本地打包"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deployment"

cd "$PROJECT_ROOT"

echo -e "${BLUE}📂 项目目录: $PROJECT_ROOT${NC}"
echo ""

# 1. 打包后端
echo -e "${YELLOW}☕ 步骤1/3: 打包后端 (Spring Boot)...${NC}"
cd "$PROJECT_ROOT/backend"

if [ ! -f "pom.xml" ]; then
    echo -e "${RED}❌ 后端目录错误: pom.xml 不存在${NC}"
    exit 1
fi

echo "执行: mvn clean package -DskipTests"
mvn clean package -DskipTests

if [ -f "target/supplychain-0.0.1-SNAPSHOT.jar" ]; then
    echo "复制JAR文件到deployment目录..."
    cp target/supplychain-0.0.1-SNAPSHOT.jar "$DEPLOY_DIR/backend.jar"
    JAR_SIZE=$(du -h "$DEPLOY_DIR/backend.jar" | cut -f1)
    echo -e "${GREEN}✅ 后端打包完成: backend.jar ($JAR_SIZE)${NC}"
else
    echo -e "${RED}❌ 打包失败: JAR文件不存在${NC}"
    exit 1
fi

# 2. 打包前端
echo ""
echo -e "${YELLOW}⚛️  步骤2/3: 打包PC前端 (React + Vite)...${NC}"
cd "$PROJECT_ROOT/frontend"

if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 前端目录错误: package.json 不存在${NC}"
    exit 1
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi

echo "执行: npm run build"
npm run build

if [ -d "dist" ]; then
    echo "复制dist目录到deployment目录..."
    rm -rf "$DEPLOY_DIR/dist"
    cp -r dist "$DEPLOY_DIR/"
    DIST_SIZE=$(du -sh "$DEPLOY_DIR/dist" | cut -f1)
    FILE_COUNT=$(find "$DEPLOY_DIR/dist" -type f | wc -l)
    echo -e "${GREEN}✅ PC前端打包完成: dist/ ($DIST_SIZE, $FILE_COUNT files)${NC}"
else
    echo -e "${RED}❌ 打包失败: dist目录不存在${NC}"
    exit 1
fi

# 3. 检查部署文件
echo ""
echo -e "${YELLOW}📋 步骤3/3: 检查部署文件...${NC}"
cd "$DEPLOY_DIR"

REQUIRED_FILES=(
    "backend.jar"
    "dist"
    "docker-compose.yml"
    ".env.example"
    "nginx/conf.d/default.conf"
)

ALL_OK=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -e "$file" ]; then
        echo -e "  ${GREEN}✅${NC} $file"
    else
        echo -e "  ${RED}❌${NC} $file ${RED}(缺失)${NC}"
        ALL_OK=false
    fi
done

if [ "$ALL_OK" = true ]; then
    echo ""
    echo -e "${GREEN}✅ 所有文件检查通过${NC}"
else
    echo ""
    echo -e "${RED}❌ 缺少必需文件${NC}"
    exit 1
fi

# 计算总大小
TOTAL_SIZE=$(du -sh "$DEPLOY_DIR" | cut -f1)

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 打包完成！${NC}"
echo "=========================================="
echo ""
echo "📦 部署包位置: $DEPLOY_DIR"
echo "📊 总大小: $TOTAL_SIZE"
echo ""
echo -e "${BLUE}📝 下一步操作：${NC}"
echo ""
echo "1️⃣  上传到云服务器："
echo "   scp -r deployment root@106.53.5.62:/root/fashion-supplychain/"
echo ""
echo "2️⃣  SSH登录服务器："
echo "   ssh root@106.53.5.62"
echo ""
echo "3️⃣  执行部署脚本："
echo "   cd /root/fashion-supplychain/deployment"
echo "   ./deploy-to-cloud.sh"
echo ""
echo -e "${YELLOW}⚠️  小程序发布说明：${NC}"
echo "   小程序不在云服务器上，需要单独通过微信开发者工具发布"
echo "   详见: deployment/小程序发布指南.md"
echo ""
