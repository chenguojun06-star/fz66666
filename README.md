# 服装供应链管理系统

三端协同的企业级服装供应链管理系统，支持 PC 管理后台、微信小程序工厂扫码、H5移动端、完整的业务编排后端。

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
- H5：http://localhost:5173/h5

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
| 后端 | Spring Boot 3.2 + MyBatis-Plus + Java 21，端口 8088 |
| 前端 | React 18 + TypeScript + Vite + Ant Design，端口 5173 |
| 小程序 | 微信原生框架（JavaScript） |
| H5 | 复用小程序代码，通过 `sync-miniprogram.mjs` 同步到 `h5-web/public/source-miniapp` |
| 数据库 | MySQL 8.0（Docker，端口 3308）|
| 缓存 | Redis 7.4（Token认证缓存，<5ms延迟）|
| AI | Qdrant 向量检索 + RAG 混合召回 + 多Agent协同 |

---

## 🏛️ 架构约束

```
Controller → Orchestrator → Service → Mapper
```

- 复杂业务逻辑必须在 **Orchestrator** 层编排（**235 个业务编排器 + AI智能体编排器** 跨 14 个领域模块，后端代码行数 212k）
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
├── h5-web/           # H5移动端（复用小程序代码）
├── deployment/       # 部署文档与脚本
├── docs/             # 技术文档（42 份）
├── memory-bank/      # 开发记忆库（上下文/决策/进度）
├── scripts/          # 35+ 运维脚本（Flyway校验/审计/冒烟测试）
├── dev-public.sh     # 一键启动脚本
└── *.md              # 核心文档
```

---

## 📚 核心文档

| 文档 | 说明 |
|------|------|
| [系统状态.md](系统状态.md) | ⭐ 最重要！系统全景概览与模块说明 |
| [README.md](README.md) | 项目入口，系统概览 |
| [设计系统完整规范-2026.md](设计系统完整规范-2026.md) | 前端 UI/UX 强制规范 |
| [模块与职责快速查询表.md](模块与职责快速查询表.md) | 各模块职责与接口速查 |
| [系统定位与领域说明.md](系统定位与领域说明.md) | 系统定位与业务领域说明 |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | AI 开发助手参考指令 |
| [docs/小云智能体能力地图-20260325.md](docs/小云智能体能力地图-20260325.md) | 小云已接入能力、指令覆盖、缺口清单与更新记录 |

**技术文档（docs/）**：扫码系统、小程序开发、Modal 组件、日期选择器、多租户配置、工资结算、小云智能体能力地图等

**部署文档（deployment/）**：数据库配置、部署说明、小程序发布指南

---

## ✨ 核心功能

### 🔄 操作日志机制
- **全模块覆盖**：21个核心模块（物料、采购、应付账款、费用报销等）已集成操作日志
- **日志与备注合并**：所有操作自动写入实体的备注字段（remark/description）
- **记录内容**：操作人、操作时间、操作类型、操作详情
- **调用方式**：`OperationLogAppendUtil.appendOperation(targetId, service, getter/setter, action, detail, targetType)`

### 🤖 AI 视觉能力
- **BOM表OCR识别**：上传BOM图片自动提取面料/辅料明细，填充到BOM表
- **尺码表OCR识别**：自动识别尺寸数据，填充尺码表
- **工序表OCR识别**：提取生产要求，自动填充工序信息
- **质检视觉识别**：8大类40+疵点检测，ΔE色差分级，10维度款式识别

### 📋 生产订单显示优化
- 默认显示**全部订单**（含已完成），仅"生产中"筛选时过滤终态订单
- 支持订单状态多维度筛选：生产中、已完成、已取消、已报废等
- 小程序仪表盘新增"全部"筛选选项，默认选中

### 🔍 全局搜索
- ⌘K / Ctrl+K 快捷键打开全局搜索
- 支持订单、款式、工人三路并发搜索
- 支持拼音首字母/全拼模糊匹配
- 搜索无结果时一键跳转AI面板

### 💬 AI 助手（小云）
- 多轮对话历史，气泡式UI展示
- 页面上下文感知，自动理解当前场景
- 知识库混合检索（语义+关键词+热度）
- 专业运营报告一键下载（日报/周报/月报）

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
cd frontend && npx tsc --noEmit                    # 前端类型检查
```

---

## 📱 小程序开发

1. 使用微信开发者工具打开 `miniprogram/` 目录
2. 后端须启动并开启 Mock 模式（`WECHAT_MINI_PROGRAM_MOCK_ENABLED=true`）
3. 详见 [docs/小程序开发完整指南.md](docs/小程序开发完整指南.md)

---

## 📱 H5 开发

```bash
cd h5-web
npm install
npm run dev
```

H5 代码通过 `scripts/sync-miniprogram.mjs` 从小程序同步，保持三端一致性。

---

## ❓ 常见问题

| 问题 | 解决方案 |
|------|---------|
| 403 错误 | 必须用 `./dev-public.sh` 启动，检查 `.run/backend.env` |
| 数据库连接失败 | 端口为 **3308**，容器名 `fashion-mysql-simple` |
| 动态模块导入失败 | 用 `localhost:5173` 而非内网 IP 访问 |
| 小程序接口 400 | 检查 `miniprogram/config.js` 中的 `DEFAULT_BASE_URL` |
| 生产订单不显示已完成 | 默认显示全部订单，如需过滤使用状态筛选 |

---

## 📊 系统规模

- **代码行数**：后端 212k + 前端 173k + 小程序 44k = **429k 行**
- **编排器**：235 个（业务编排器 + AI智能体编排器）
- **测试脚本**：Shell集成测试 24 个（7.7k行）+ Python冒烟测试 + Playwright E2E
- **并发能力**：200 VU 并发，0% 错误率，P95 < 1s
- **文档数量**：7份核心文档 + 42份技术指南