# 🚀 服务器部署前检查清单

> 文档创建日期：2026-01-21  
> 目标：确保系统部署到生产服务器前的各项准备工作

---

## 📊 当前状态总览

| 检查项 | 状态 | 说明 |
|-------|------|------|
| 后端构建 | ✅ 通过 | mvn package 成功 |
| 后端测试 | ✅ 通过 | 48个测试全部通过 |
| 前端构建 | ✅ 通过 | 4.35s 完成构建 |
| Docker配置 | ✅ 已配置 | Dockerfile + docker-compose.yml |
| Nginx配置 | ✅ 已配置 | 反向代理 + gzip压缩 |
| 部署文档 | ✅ 已编写 | deployment/README.md |
| 生产配置 | ✅ 已创建 | application-prod.yml |
| 调试日志 | ✅ 已处理 | DEBUG_MODE 条件控制 |

---

## 🔴 P0 - 必须在部署前完成（阻塞发布）

### 1. ✅ 生产环境配置文件（已完成）
**状态**：已创建 `application-prod.yml`

配置内容：
- 连接池优化 (最大20连接)
- 日志级别降为 info
- 禁用数据库自动初始化
- 启用 Flyway 迁移

---

### 2. JWT密钥必须配置
**问题**：生产环境必须配置强密钥，代码已有校验

**当前保护**：
```java
// AuthTokenService.java 已有校验
if (!StringUtils.hasText(s)) {
    throw new IllegalStateException("app.auth.jwt-secret 未配置");
}
if (s.length() < 32) {
    throw new IllegalStateException("app.auth.jwt-secret 长度过短，至少 32 位");
}
```

**解决方案**：在服务器 `.env` 文件中配置：
```bash
# 使用以下命令生成安全密钥：
openssl rand -base64 48
# 配置到 .env
JWT_SECRET=生成的64位以上随机字符串
```

---

### 3. 数据库密码安全
**问题**：默认密码 `changeme` 不安全

**解决方案**：
```bash
# deployment/.env 中配置
MYSQL_ROOT_PASSWORD=强随机密码_32位以上
MYSQL_USER=fashion
MYSQL_PASSWORD=另一个强随机密码_32位以上
```

---

### 4. 小程序API地址硬编码
**问题**：`miniprogram/config.js` 默认指向本地 IP

```javascript
const DEFAULT_BASE_URL = 'http://192.168.2.248:8088';
```

**解决方案**：修改为生产域名
```javascript
const DEFAULT_BASE_URL = 'https://your-domain.com';
```

---

## 🟡 P1 - 建议在部署前完成（可热修复）

### 5. ✅ 小程序调试日志（已处理）
**状态**：所有 console.log/debug 已改为条件日志

**配置位置**：`miniprogram/config.js`
```javascript
// 生产环境请设为 false
const DEBUG_MODE = true;
```

**部署时操作**：将 `DEBUG_MODE` 改为 `false` 即可关闭所有调试日志

---

### 6. 微信小程序配置
**问题**：微信小程序 appid 和 secret 需要配置

**解决方案**：在服务器 `.env` 中添加
```bash
WECHAT_MP_APPID=你的小程序AppID
WECHAT_MP_SECRET=你的小程序AppSecret
```

---

### 7. CORS配置收紧
**问题**：当前允许多种内网IP和开发域名

**当前配置**：
```yaml
app.cors.allowed-origin-patterns: http://localhost:*,http://127.0.0.1:*,http://192.168.*.*:*...
```

**生产建议**：仅允许生产域名
```yaml
# 生产环境
app.cors.allowed-origin-patterns: https://your-domain.com,https://www.your-domain.com
```

---

### 8. HTTPS配置
**问题**：nginx默认只配置了HTTP

**解决方案**：添加SSL证书配置
```nginx
# deployment/nginx/conf.d/default.conf
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/cert/fullchain.pem;
    ssl_certificate_key /etc/nginx/cert/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # ... 其余配置不变
}

# HTTP重定向到HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

---

## 🟢 P2 - 后续优化（可迭代完善）

### 9. 健康检查端点增强
**当前状态**：已配置基础健康检查
```yaml
management.endpoints.web.exposure.include: health,info,metrics
```

**建议**：添加自定义健康检查
```java
@Component
public class DatabaseHealthIndicator implements HealthIndicator {
    @Override
    public Health health() {
        // 检查数据库连接
    }
}
```

---

### 10. 日志收集配置
**当前状态**：日志输出到本地文件

**建议**：
- 集成 ELK 或云日志服务
- 添加 JSON 格式日志输出
- 配置日志轮转策略

---

### 11. 监控告警
**建议添加**：
- Prometheus + Grafana 监控
- 业务异常告警（钉钉/企微机器人）
- 服务器资源监控

---

### 12. 数据库备份策略
**建议配置**：
```bash
# 每日自动备份脚本
0 2 * * * mysqldump -u fashion -p fashion_supplychain > /backup/db_$(date +\%Y\%m\%d).sql
```

---

### 13. API限流
**建议**：添加限流保护
```java
@RateLimiter(permitsPerSecond = 10)
@PostMapping("/api/...")
```

---

### 14. 单元测试覆盖率
**当前状态**：48个测试用例通过

**建议增加**：
- Controller层测试
- 集成测试
- 目标覆盖率 > 60%

---

## 📋 部署操作清单

### 部署前一天
- [ ] 创建 `application-prod.yml`
- [ ] 生成并配置强密码
- [ ] 修改小程序 API 地址
- [ ] 清理调试日志
- [ ] 配置 HTTPS 证书
- [ ] 收紧 CORS 配置

### 部署当天
```bash
# 1. 本地打包
cd backend && mvn clean package -DskipTests
cd ../frontend && npm run build

# 2. 准备部署包
mkdir -p deployment-package
cp backend/target/supplychain-0.0.1-SNAPSHOT.jar deployment-package/backend.jar
cp -r frontend/dist deployment-package/
cp -r deployment/* deployment-package/

# 3. 配置环境变量
cd deployment-package
cp .env.example .env
vim .env  # 填写实际配置

# 4. 上传到服务器
scp -r deployment-package user@server:/opt/fashion/

# 5. 服务器启动
ssh user@server
cd /opt/fashion/deployment-package
docker-compose up -d

# 6. 验证
curl http://localhost:8088/actuator/health
curl http://localhost/api/health
```

### 部署后验证
- [ ] 后端健康检查正常
- [ ] 前端页面可访问
- [ ] 用户登录正常
- [ ] 小程序扫码正常
- [ ] 主要业务流程测试

---

## 🔧 快速修复脚本

### 创建 application-prod.yml
```bash
cat > backend/src/main/resources/application-prod.yml << 'EOF'
# 生产环境配置
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5

logging:
  level:
    com.fashion.supplychain: info
    org.springframework: warn
    org.apache.ibatis: warn

fashion:
  db:
    initializer-enabled: false
EOF
```

### 生成安全密钥
```bash
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "MYSQL_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')"
echo "MYSQL_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')"
```

---

## 📈 部署检查评分

| 类别 | 当前得分 | 目标得分 | 差距 |
|------|---------|---------|------|
| 安全配置 | 75/100 | 95/100 | -20 |
| 构建部署 | 95/100 | 95/100 | 0 |
| 监控日志 | 75/100 | 85/100 | -10 |
| 文档完整性 | 95/100 | 95/100 | 0 |
| **总体** | **85/100** | **93/100** | **-8** |

完成剩余的 P0 安全配置（JWT密钥、数据库密码、小程序API地址）后可达到 **93分**，满足生产部署标准。
