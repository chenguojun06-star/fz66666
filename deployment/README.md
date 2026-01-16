# 生产环境部署指南

如果你准备把项目部署到云服务器（如阿里云/腾讯云/AWS），可以使用本目录下的配置。

## 1. 准备工作

在服务器上安装：

- Docker
- Docker Compose

## 2. 部署步骤

1. **打包代码**（在本地开发机执行）：

   ```bash
   # 1. 打包后端 jar
   cd backend
   mvn clean package -DskipTests
   # 得到 target/supplychain-0.0.1-SNAPSHOT.jar，重命名为 backend.jar 放到 deployment 目录

   # 2. 打包前端 dist
   cd ../frontend
   npm run build
   # 得到 dist 目录，复制到 deployment 目录
   ```

2. **上传文件到服务器**：
   把整个 `deployment` 目录上传到服务器。

   目录结构应该是：

   ```
   deployment/
   ├── backend.jar          (从后端 target 目录复制来)
   ├── dist/                (从前端目录复制来)
   ├── docker-compose.yml
   ├── .env                 (由 .env.example 复制修改)
   └── nginx/
       └── conf.d/
           └── default.conf
   ```

3. **配置环境变量**：

   ```bash
   cp .env.example .env
   vim .env
   ```

   修改里面的密码和密钥，确保安全。

4. **启动服务**：
   ```bash
   docker-compose up -d
   ```

## 3. 验证

访问服务器 IP 或域名（端口 80），应该能看到系统。

## 4. 注意事项

- **数据库数据**：
  Docker Compose 启动的 MySQL 数据会保存在 `mysql_data` 这个 Docker Volume 里，重启不会丢失。
- **HTTPS**：
  如果需要 HTTPS，请修改 `nginx/conf.d/default.conf`，配置 SSL 证书路径。
