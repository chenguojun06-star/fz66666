# 服装供应链管理系统 - 部署和运维指南

**文档版本：** v1.0  
**创建日期：** 2026-01-31  
**适用环境：** 生产环境

---

## 目录

1. [环境要求](#1-环境要求)
2. [部署前准备](#2-部署前准备)
3. [应用部署](#3-应用部署)
4. [数据库部署](#4-数据库部署)
5. [性能监控配置](#5-性能监控配置)
6. [日常运维](#6-日常运维)
7. [故障处理](#7-故障处理)
8. [备份与恢复](#8-备份与恢复)

---

## 1. 环境要求

### 1.1 服务器配置

| 组件 | 最低配置 | 推荐配置 | 说明 |
|------|---------|---------|------|
| CPU | 4核 | 8核+ | 生产环境建议8核以上 |
| 内存 | 8GB | 16GB+ | JVM堆内存建议8GB |
| 磁盘 | 100GB | 500GB+ | SSD推荐 |
| 网络 | 100Mbps | 1Gbps | 内网带宽 |

### 1.2 软件环境

| 软件 | 版本 | 说明 |
|------|------|------|
| JDK | 21+ | OpenJDK或Oracle JDK |
| MySQL | 8.0+ | 数据库服务器 |
| Nginx | 1.20+ | 反向代理 |
| Redis | 6.0+ | 缓存（可选） |
| Node.js | 18+ | 前端构建 |

### 1.3 端口要求

| 端口 | 用途 | 说明 |
|------|------|------|
| 8088 | 后端服务 | Spring Boot应用端口 |
| 80/443 | Web服务 | Nginx端口 |
| 3306 | 数据库 | MySQL端口 |
| 6379 | 缓存 | Redis端口（可选） |

---

## 2. 部署前准备

### 2.1 代码准备

```bash
# 克隆代码仓库
git clone <repository-url>
cd 服装66666

# 切换到生产分支
git checkout main

# 拉取最新代码
git pull origin main
```

### 2.2 配置文件准备

#### 后端配置

创建 `application-prod.yml`：

```yaml
server:
  port: 8088
  servlet:
    context-path: /

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai
    username: ${DB_USERNAME:supplychain}
    password: ${DB_PASSWORD:your_password}
    hikari:
      maximum-pool-size: 50
      minimum-idle: 10
      idle-timeout: 600000
      max-lifetime: 1800000
      connection-timeout: 30000
      connection-test-query: SELECT 1

  servlet:
    multipart:
      max-file-size: 100MB
      max-request-size: 100MB

  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: GMT+8

# 日志配置
logging:
  level:
    root: INFO
    com.fashion.supplychain: INFO
  file:
    name: /var/log/supplychain/application.log
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 30

# 性能监控配置
monitor:
  performance:
    enabled: true
    slow-threshold: 1000  # 慢方法阈值(ms)
```

#### 前端配置

创建 `.env.production`：

```env
VITE_API_BASE_URL=http://your-domain.com/api
VITE_UPLOAD_URL=http://your-domain.com/api/common/upload
VITE_DOWNLOAD_URL=http://your-domain.com/api/common/download
```

### 2.3 数据库准备

```sql
-- 创建数据库
CREATE DATABASE IF NOT EXISTS supplychain 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- 创建用户
CREATE USER IF NOT EXISTS 'supplychain'@'%' IDENTIFIED BY 'your_password';

-- 授权
GRANT ALL PRIVILEGES ON supplychain.* TO 'supplychain'@'%';
FLUSH PRIVILEGES;
```

---

## 3. 应用部署

### 3.1 后端部署

#### 方式一：直接部署（推荐开发环境）

```bash
cd backend

# 编译
mvn clean package -DskipTests -P prod

# 运行
java -jar target/supplychain-1.0.0.jar \
  --spring.profiles.active=prod \
  --server.port=8088
```

#### 方式二：Systemd服务部署（推荐生产环境）

创建服务文件 `/etc/systemd/system/supplychain.service`：

```ini
[Unit]
Description=Supply Chain Management System
After=network.target mysql.service

[Service]
Type=simple
User=supplychain
Group=supplychain
WorkingDirectory=/opt/supplychain
Environment="JAVA_OPTS=-Xms4g -Xmx8g -XX:+UseG1GC"
Environment="SPRING_PROFILES_ACTIVE=prod"
Environment="DB_PASSWORD=your_password"
ExecStart=/usr/bin/java $JAVA_OPTS -jar supplychain-1.0.0.jar
ExecStop=/bin/kill -15 $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
# 重新加载systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start supplychain

# 设置开机自启
sudo systemctl enable supplychain

# 查看状态
sudo systemctl status supplychain

# 查看日志
sudo journalctl -u supplychain -f
```

### 3.2 前端部署

```bash
cd frontend

# 安装依赖
npm install

# 构建生产版本
npm run build

# 部署到Nginx
sudo cp -r dist/* /var/www/html/
```

### 3.3 Nginx配置

创建 `/etc/nginx/conf.d/supplychain.conf`：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态资源
    location / {
        root /var/www/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    # API代理
    location /api/ {
        proxy_pass http://localhost:8088/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 文件上传大小限制
    client_max_body_size 100M;
    
    # Gzip压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}

# HTTPS配置（推荐）
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # 其他配置同上
}
```

重启Nginx：

```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4. 数据库部署

### 4.1 执行Flyway迁移

```bash
# 自动执行（应用启动时）
# 或手动执行
mvn flyway:migrate -Dflyway.url=jdbc:mysql://localhost:3306/supplychain \
  -Dflyway.user=supplychain \
  -Dflyway.password=your_password
```

### 4.2 执行性能优化索引

```bash
# 执行索引创建脚本
mysql -u supplychain -p supplychain < backend/src/main/resources/db/migration/V20260131__add_performance_indexes.sql
```

### 4.3 验证索引

```sql
-- 查看所有索引
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    CARDINALITY
FROM 
    INFORMATION_SCHEMA.STATISTICS
WHERE 
    TABLE_SCHEMA = 'supplychain'
    AND INDEX_NAME LIKE 'idx_%'
ORDER BY 
    TABLE_NAME, INDEX_NAME;
```

---

## 5. 性能监控配置

### 5.1 开启性能监控

监控功能默认已开启，可通过以下方式验证：

```bash
# 查看监控接口
curl http://localhost:8088/api/monitor/performance/stats \
  -H "Authorization: Bearer your_token"
```

### 5.2 配置监控告警

创建监控脚本 `/opt/supplychain/monitor.sh`：

```bash
#!/bin/bash

# 检查应用状态
APP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/actuator/health)

if [ "$APP_STATUS" != "200" ]; then
    echo "$(date): Application is down!" >> /var/log/supplychain/monitor.log
    # 发送告警（根据实际情况配置）
    # curl -X POST "https://your-alert-webhook" -d "message=Application is down"
fi

# 检查慢方法
SLOW_METHODS=$(curl -s http://localhost:8088/api/monitor/performance/slow-methods?threshold=2000 \
  -H "Authorization: Bearer your_token" | grep -o '"slowMethodCount":[0-9]*' | cut -d: -f2)

if [ "$SLOW_METHODS" -gt 0 ]; then
    echo "$(date): Found $SLOW_METHODS slow methods!" >> /var/log/supplychain/monitor.log
fi
```

添加定时任务：

```bash
# 编辑crontab
crontab -e

# 添加以下行（每5分钟检查一次）
*/5 * * * * /opt/supplychain/monitor.sh
```

---

## 6. 日常运维

### 6.1 日志管理

```bash
# 查看应用日志
tail -f /var/log/supplychain/application.log

# 查看错误日志
grep ERROR /var/log/supplychain/application.log

# 查看慢方法日志
grep "慢方法警告" /var/log/supplychain/application.log

# 日志轮转
sudo logrotate -f /etc/logrotate.d/supplychain
```

### 6.2 性能检查

```bash
# 查看性能统计
curl http://localhost:8088/api/monitor/performance/stats \
  -H "Authorization: Bearer your_token"

# 打印性能报告
curl -X POST http://localhost:8088/api/monitor/performance/report \
  -H "Authorization: Bearer your_token"

# 清除统计（定期执行）
curl -X POST http://localhost:8088/api/monitor/performance/clear \
  -H "Authorization: Bearer your_token"
```

### 6.3 数据库维护

```sql
-- 查看表大小
SELECT 
    table_name,
    ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM 
    information_schema.tables
WHERE 
    table_schema = 'supplychain'
ORDER BY 
    size_mb DESC;

-- 查看慢查询
SELECT * FROM mysql.slow_log 
WHERE start_time > DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY query_time DESC
LIMIT 20;

-- 更新表统计信息
ANALYZE TABLE t_production_order;
ANALYZE TABLE t_product_warehousing;
ANALYZE TABLE t_product_outstock;
```

---

## 7. 故障处理

### 7.1 应用无法启动

**现象：** 服务启动失败或启动后立即退出

**排查步骤：**

```bash
# 1. 检查日志
sudo journalctl -u supplychain -n 100

# 2. 检查端口占用
sudo netstat -tlnp | grep 8088

# 3. 检查数据库连接
mysql -u supplychain -p -e "SELECT 1"

# 4. 检查配置文件
java -jar supplychain-1.0.0.jar --spring.config.location=/path/to/config/ \
  --spring.profiles.active=prod
```

### 7.2 数据库连接池耗尽

**现象：** 应用响应缓慢，日志中出现连接超时

**解决方案：**

```sql
-- 查看当前连接
SHOW PROCESSLIST;

-- 查看连接数
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';
```

调整连接池配置：

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 100  # 增加连接数
      connection-timeout: 60000  # 增加超时时间
```

### 7.3 内存溢出

**现象：** OutOfMemoryError

**解决方案：**

```bash
# 调整JVM参数
JAVA_OPTS="-Xms8g -Xmx16g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

# 生成堆转储
JAVA_OPTS="$JAVA_OPTS -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/log/supplychain/"
```

### 7.4 性能下降

**现象：** 响应时间增加

**排查步骤：**

```bash
# 1. 查看性能监控
curl http://localhost:8088/api/monitor/performance/slow-methods?threshold=1000

# 2. 查看数据库慢查询
# 参考6.3节

# 3. 查看系统资源
top -p $(pgrep -d',' java)
iostat -x 1 10
```

---

## 8. 备份与恢复

### 8.1 数据库备份

创建备份脚本 `/opt/supplychain/backup.sh`：

```bash
#!/bin/bash

BACKUP_DIR="/backup/supplychain"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="supplychain"
DB_USER="supplychain"
DB_PASS="your_password"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 全量备份
mysqldump -u$DB_USER -p$DB_PASS --single-transaction \
  --routines --triggers $DB_NAME > $BACKUP_DIR/${DB_NAME}_full_$DATE.sql

# 压缩备份
gzip $BACKUP_DIR/${DB_NAME}_full_$DATE.sql

# 删除7天前的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: ${DB_NAME}_full_$DATE.sql.gz"
```

添加定时任务：

```bash
# 每天凌晨2点备份
0 2 * * * /opt/supplychain/backup.sh >> /var/log/supplychain/backup.log 2>&1
```

### 8.2 数据库恢复

```bash
# 解压备份
gunzip supplychain_full_20260131_020000.sql.gz

# 恢复数据
mysql -u supplychain -p supplychain < supplychain_full_20260131_020000.sql
```

### 8.3 应用配置备份

```bash
# 备份配置文件
tar -czf /backup/supplychain/config_$(date +%Y%m%d).tar.gz \
  /opt/supplychain/application-prod.yml \
  /etc/nginx/conf.d/supplychain.conf \
  /etc/systemd/system/supplychain.service
```

---

## 附录

### A. 常用命令速查

```bash
# 应用管理
sudo systemctl start|stop|restart|status supplychain
sudo journalctl -u supplychain -f

# 数据库管理
mysql -u supplychain -p supplychain
mysqldump -u supplychain -p supplychain > backup.sql

# Nginx管理
sudo nginx -t
sudo systemctl reload nginx

# 日志查看
tail -f /var/log/supplychain/application.log
grep ERROR /var/log/supplychain/application.log
```

### B. 性能基准

| 指标 | 目标值 | 告警阈值 |
|------|--------|---------|
| API响应时间 | < 200ms | > 1000ms |
| 数据库查询时间 | < 50ms | > 500ms |
| CPU使用率 | < 70% | > 90% |
| 内存使用率 | < 80% | > 95% |
| 磁盘使用率 | < 80% | > 90% |

### C. 联系信息

| 角色 | 联系人 | 联系方式 |
|------|--------|---------|
| 运维负责人 | [姓名] | [电话/邮箱] |
| 开发负责人 | [姓名] | [电话/邮箱] |
| 数据库管理员 | [姓名] | [电话/邮箱] |

---

**文档维护：** 运维团队  
**最后更新：** 2026-01-31
