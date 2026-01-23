# 环境变量配置指南

## 问题背景
2026-01-24 修复：后端启动时如果缺少 JWT Secret 环境变量，会导致所有API返回403错误。

## ✅ 正确的启动方式

### 开发环境

**方式一：使用启动脚本（推荐）**
```bash
# 在项目根目录执行
./dev-public.sh
```
这个脚本会自动：
- 启动 MySQL（Docker容器）
- 加载 `.run/backend.env` 中的环境变量
- 启动后端 Spring Boot
- 启动前端 Vite dev server
- 启动 Cloudflare Tunnel（可选，用于外网访问）

**方式二：手动启动（需要先设置环境变量）**
```bash
# 加载环境变量
export $(cat .run/backend.env | xargs)

# 启动后端
cd backend
mvn spring-boot:run
```

### 生产环境

**Docker Compose部署**
```bash
cd deployment

# 1. 创建 .env 文件（如果不存在）
cp .env.example .env

# 2. 编辑 .env 文件，设置必需的环境变量
vim .env
```

`.env` 文件示例：
```env
# MySQL 配置
MYSQL_ROOT_PASSWORD=your_strong_password_here
MYSQL_USER=fashion_user
MYSQL_PASSWORD=your_db_password_here

# JWT 配置（必须至少32位）
JWT_SECRET=YourProductionJwtSecretAtLeast32CharsLong123456789

# 其他配置
WECHAT_MINI_PROGRAM_APP_ID=your_wechat_app_id
WECHAT_MINI_PROGRAM_APP_SECRET=your_wechat_app_secret
```

**启动服务**
```bash
docker-compose up -d
```

## 🔑 必需的环境变量

### 开发环境（.run/backend.env）
```env
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789  # 必须至少32位
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
```

### 生产环境（deployment/.env）
```env
MYSQL_ROOT_PASSWORD=<生产数据库root密码>
MYSQL_USER=fashion_user
MYSQL_PASSWORD=<生产数据库用户密码>
JWT_SECRET=<至少32位的随机字符串>  # ⚠️ 必须修改，不能使用默认值
```

## ⚠️ 常见错误

### 错误1：API返回403 Forbidden
**症状：**
- 登录成功，能获取Token
- 但访问任何需要认证的API都返回403
- 后端日志显示请求被重定向到 `/error`

**原因：**
- 缺少 `APP_AUTH_JWT_SECRET` 环境变量
- JWT Secret 长度不足32位
- JWT Secret 使用了默认占位值 `dev-secret-change-me`

**解决方案：**
1. 使用 `./dev-public.sh` 启动（会自动加载环境变量）
2. 或手动设置环境变量后再启动

### 错误2：Backend启动失败
**症状：**
```
IllegalStateException: app.auth.jwt-secret 未配置
```

**解决方案：**
确保 `APP_AUTH_JWT_SECRET` 环境变量已设置且符合要求：
- 长度 ≥ 32 位
- 不能是 `dev-secret-change-me`
- 不能为空

## 🔒 安全建议

### 开发环境
- `.run/backend.env` 已在 `.gitignore` 中，不会提交到版本库
- 使用简单的JWT Secret即可（如示例中的值）
- 不要在代码中硬编码敏感信息

### 生产环境
- 使用强随机字符串作为JWT Secret
- 定期轮换密钥
- 使用环境变量或密钥管理服务（如 Azure Key Vault, AWS Secrets Manager）
- 确保 `deployment/.env` 文件权限设置为 600（只有所有者可读写）

**生成安全的JWT Secret：**
```bash
# Linux/macOS
openssl rand -base64 32

# 或使用 Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 📝 检查清单

部署前检查：
- [ ] `.run/backend.env` 文件存在且包含所有必需变量
- [ ] `deployment/.env` 文件存在且配置了生产级密钥
- [ ] JWT Secret 长度 ≥ 32 位
- [ ] 数据库密码已修改（不使用默认值）
- [ ] `.env` 文件权限为 600
- [ ] 微信小程序配置已更新为生产环境值

## 🔗 相关文档

- [快速启动指南](./START_TESTING.md)
- [部署指南](./deployment/README.md)
- [数据库配置](./deployment/DATABASE_CONFIG.md)
- [开发指南](./DEVELOPMENT_GUIDE.md)

---

**最后更新：** 2026-01-24  
**修复记录：** 解决了因缺少JWT Secret环境变量导致的403错误
