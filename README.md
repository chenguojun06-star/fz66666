# 服装供应链管理系统

三端协同的企业级服装供应链管理系统，支持 PC 管理后台、微信小程序工厂扫码、完整的业务编排后端。

**业务流程**：款式设计 → 采购面料 → 生产订单 → 裁剪分菲 → 工序扫码 → 质检入库 → 财务结算

---

## 🚀 快速启动

**必须使用脚本启动**（否则缺少环境变量导致 403 错误）

```bash
./dev-public.sh
```

该脚本自动完成：启动 MySQL（端口 3308）→ 加载环境变量 → 启动后端（8088）→ 启动前端（5173）

**访问地址**：

- PC 后台：http://localhost:5173
- 后端 API：http://localhost:8088
- 小程序：微信开发者工具打开 `miniprogram/` 目录

**首次启动**，先创建 `.run/backend.env`（参考注释填写）：

```
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
```

---

## 🏗️ 技术栈

| 端 | 技术 |
|----|------|
| 后端 | Spring Boot 2.7 + MyBatis-Plus + Java 21，端口 8088 |
| 前端 | React 18 + TypeScript + Vite + Ant Design，端口 5173 |
| 小程序 | 微信原生框架（JavaScript） |
| 数据库 | MySQL 8.0（Docker，端口 3308）|

---

## 🏛️ 架构约束

```
Controller → Orchestrator → Service → Mapper
```

- 复杂业务逻辑必须在 **Orchestrator** 层编排（**86 个编排器** 跨 11 个领域模块，代码行数 100.2k）
- Service 禁止互相调用
- Controller 禁止直接调用多个 Service
- 事务 `@Transactional` 仅在 Orchestrator 层

---

## 📂 项目结构

```
服装66666/
├── backend/          # Spring Boot 后端
├── frontend/         # React 前端
├── miniprogram/      # 微信小程序
├── deployment/       # 部署文档与脚本
├── docs/             # 技术文档（17 份）
├── dev-public.sh     # 一键启动脚本
└── *.md              # 核心文档
```

---

## 📚 核心文档

| 文档 | 说明 |
|------|------|
| [开发指南.md](开发指南.md) | ⭐ 最重要！架构规范、禁止模式、最佳实践 |
| [系统状态.md](系统状态.md) | 系统全景概览与模块说明 |
| [业务流程说明.md](业务流程说明.md) | 完整业务逻辑与数据流向 |
| [快速测试指南.md](快速测试指南.md) | 40+ 测试脚本使用说明 |
| [设计系统完整规范-2026.md](设计系统完整规范-2026.md) | 前端 UI/UX 强制规范 |
| [INVENTORY_SYSTEM_GUIDE.md](INVENTORY_SYSTEM_GUIDE.md) | 进销存系统操作指南 |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | AI 开发助手参考指令 |
| [docs/小云智能体能力地图-20260325.md](docs/小云智能体能力地图-20260325.md) | 小云已接入能力、指令覆盖、缺口清单与更新记录 |

**技术文档（docs/）**：扫码系统、小程序开发、Modal 组件、日期选择器、多租户配置、工资结算、小云智能体能力地图等

**部署文档（deployment/）**：数据库配置、部署说明、小程序发布指南

---

## 🗄️ 数据库管理

```bash
./deployment/db-manager.sh start     # 启动容器
docker exec fashion-mysql-simple mysqldump -uroot -pchangeme fashion_supplychain > backup.sql
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < backup.sql
```

---

## 🧪 测试

```bash
./check-system-status.sh                            # 健康检查
./test-production-order-creator-tracking.sh         # 订单流程测试
./test-material-inbound.sh                          # 面料入库测试
./test-finished-settlement-approve.sh               # 财务结算测试
cd backend && mvn clean test                        # 后端单元测试
```

---

## 📱 小程序开发

1. 使用微信开发者工具打开 `miniprogram/` 目录
2. 后端须启动并开启 Mock 模式（`WECHAT_MINI_PROGRAM_MOCK_ENABLED=true`）
3. 详见 [docs/小程序开发完整指南.md](docs/小程序开发完整指南.md)

---

## ❓ 常见问题

| 问题 | 解决方案 |
|------|---------|
| 403 错误 | 必须用 `./dev-public.sh` 启动，检查 `.run/backend.env` |
| 数据库连接失败 | 端口为 **3308**，容器名 `fashion-mysql-simple` |
| 动态模块导入失败 | 用 `localhost:5173` 而非内网 IP 访问 |
| 小程序接口 400 | 检查 `miniprogram/config.js` 中的 `DEFAULT_BASE_URL` |
