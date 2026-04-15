#!/bin/bash
cd "$(dirname "$0")"
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

# ============================================================
# 安全说明：
# 1. 以下敏感配置从环境变量读取，不应在版本控制中存储密钥
# 2. 首次使用前，请将密钥设置到系统环境变量或 .env 文件中
# 3. .env 文件务必加入 .gitignore，禁止提交到版本库
# 4. 生产环境务必修改所有默认值为强密码/强密钥
# ============================================================

# JWT 密钥：生产环境必须使用强随机密钥（至少32字符），禁止使用默认值
export APP_AUTH_JWT_SECRET="${APP_AUTH_JWT_SECRET:-ThisIsA_LocalJwtSecret_OnlyForDev_0123456789}"

# 数据库连接：生产环境必须使用独立账号和强密码
export SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL:-jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true}"
export SPRING_DATASOURCE_USERNAME="${SPRING_DATASOURCE_USERNAME:-root}"
export SPRING_DATASOURCE_PASSWORD="${SPRING_DATASOURCE_PASSWORD:-changeme}"

# 微信小程序 Mock 模式（开发环境使用，生产环境设为 false）
export WECHAT_MINI_PROGRAM_MOCK_ENABLED="${WECHAT_MINI_PROGRAM_MOCK_ENABLED:-true}"

mvn spring-boot:run -DskipTests -Dmaven.test.skip=true
