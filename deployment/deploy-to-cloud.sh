#!/bin/bash

# 🚀 服装供应链管理系统 - 一键部署到腾讯云脚本
# 服务器要求：2核4GB, TencentOS/CentOS 8+, Docker已安装

set -e

echo "=========================================="
echo "🎯 服装供应链管理系统 - 云服务器部署"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ 请使用 root 用户运行此脚本${NC}"
    echo "请执行: sudo su - 切换到root用户"
    exit 1
fi

# 1. 检查Docker和Docker Compose
echo -e "${YELLOW}📦 步骤1/7: 检查Docker环境...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker未安装${NC}"
    echo "正在安装Docker..."
    yum install -y yum-utils
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    yum install -y docker-ce docker-ce-cli containerd.io
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}✅ Docker安装完成${NC}"
else
    echo -e "${GREEN}✅ Docker已安装: $(docker --version)${NC}"
fi

if ! command -v docker-compose &> /dev/null; then
    echo "正在安装Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose安装完成${NC}"
else
    echo -e "${GREEN}✅ Docker Compose已安装: $(docker-compose --version)${NC}"
fi

# 2. 检查必需文件
echo -e "\n${YELLOW}📂 步骤2/7: 检查部署文件...${NC}"
DEPLOY_DIR="/root/fashion-supplychain"

if [ ! -d "$DEPLOY_DIR" ]; then
    echo -e "${RED}❌ 部署目录不存在: $DEPLOY_DIR${NC}"
    echo "请先上传deployment目录到服务器"
    exit 1
fi

cd $DEPLOY_DIR

if [ ! -f "backend.jar" ]; then
    echo -e "${RED}❌ 缺少 backend.jar${NC}"
    echo "请执行本地打包并上传backend.jar"
    exit 1
fi

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ 缺少 dist 目录${NC}"
    echo "请执行本地前端打包并上传dist目录"
    exit 1
fi

echo -e "${GREEN}✅ 部署文件检查通过${NC}"

# 3. 配置环境变量
echo -e "\n${YELLOW}🔐 步骤3/7: 配置环境变量...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  请编辑 .env 文件，修改以下内容：${NC}"
        echo "  - MYSQL_ROOT_PASSWORD（数据库root密码）"
        echo "  - MYSQL_PASSWORD（应用数据库密码）"
        echo "  - JWT_SECRET（JWT密钥，至少32位）"
        echo ""
        echo "编辑命令: vim .env"
        echo "编辑完成后，再次运行此脚本"
        exit 0
    else
        echo -e "${RED}❌ .env.example 文件不存在${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ .env 文件已存在${NC}"

    # 检查是否修改了默认密码
    if grep -q "your_strong_password_here_change_me" .env; then
        echo -e "${RED}❌ 检测到默认密码未修改${NC}"
        echo "请编辑 .env 文件，修改所有 'change_me' 密码"
        echo "编辑命令: vim .env"
        exit 1
    fi
fi

# 4. 配置防火墙
echo -e "\n${YELLOW}🔥 步骤4/7: 配置防火墙...${NC}"
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=80/tcp || true
    firewall-cmd --permanent --add-port=443/tcp || true
    firewall-cmd --reload || true
    echo -e "${GREEN}✅ 防火墙规则已添加${NC}"
else
    echo -e "${YELLOW}⚠️  firewall未安装，跳过${NC}"
fi

# 5. 创建必需目录
echo -e "\n${YELLOW}📁 步骤5/7: 创建目录结构...${NC}"
mkdir -p logs uploads mysql/init
chmod -R 755 logs uploads
echo -e "${GREEN}✅ 目录创建完成${NC}"

# 6. 停止旧容器（如果存在）
echo -e "\n${YELLOW}🛑 步骤6/7: 清理旧容器...${NC}"
docker-compose down || true
echo -e "${GREEN}✅ 旧容器已停止${NC}"

# 7. 启动服务
echo -e "\n${YELLOW}🚀 步骤7/7: 启动服务...${NC}"
docker-compose up -d

# 等待服务启动
echo "等待服务启动（约30秒）..."
sleep 30

# 检查服务状态
echo -e "\n${YELLOW}📊 检查服务状态...${NC}"
docker-compose ps

# 检查MySQL
if docker exec fashion-mysql-prod mysqladmin ping -h localhost -u root -p$(grep MYSQL_ROOT_PASSWORD .env | cut -d '=' -f2) --silent 2>/dev/null; then
    echo -e "${GREEN}✅ MySQL运行正常${NC}"
else
    echo -e "${RED}❌ MySQL启动失败${NC}"
    echo "查看日志: docker-compose logs mysql"
fi

# 检查后端
if curl -s http://localhost:8088/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 后端服务运行正常${NC}"
else
    echo -e "${YELLOW}⚠️  后端服务可能还在启动中${NC}"
    echo "查看日志: docker-compose logs backend"
fi

# 检查Nginx
if curl -s http://localhost > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Nginx运行正常${NC}"
else
    echo -e "${RED}❌ Nginx启动失败${NC}"
    echo "查看日志: docker-compose logs nginx"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 部署完成！${NC}"
echo "=========================================="
echo ""
echo "📍 访问地址: http://$(curl -s ifconfig.me)"
echo "   或使用内网IP: http://172.16.0.12"
echo ""
echo "📝 常用命令："
echo "  - 查看日志: docker-compose logs -f [服务名]"
echo "  - 重启服务: docker-compose restart [服务名]"
echo "  - 停止服务: docker-compose down"
echo "  - 查看状态: docker-compose ps"
echo ""
echo "⚙️  内存监控（4GB服务器建议）："
echo "  - 查看内存: free -h"
echo "  - 查看容器资源: docker stats"
echo ""
echo "🔐 默认登录信息："
echo "  - 用户名: admin"
echo "  - 密码: admin123"
echo ""
echo -e "${YELLOW}⚠️  首次部署后，请立即修改默认密码！${NC}"
echo ""
