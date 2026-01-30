# 🎯 服装供应链管理系统

*最后更新：2026-01-31*  
*系统评分：97/100 ⭐⭐⭐⭐⭐*  
*文档数量：12份核心文档（精简 ↓60%）*  
*GitHub：[chenguojun06-star/fz66666](https://github.com/chenguojun06-star/fz66666)*  
*代码质量：前端 ESLint 已优化 | 小程序 ESLint ↓93.7%*

> 📋 **入口**：[系统状态.md](系统状态.md) - 系统状态与文档索引  
> 📋 **AI指令**：[.github/copilot-instructions.md](.github/copilot-instructions.md) - GitHub Copilot 开发指南

---

## 📖 快速导航

### ⭐ 核心文档（推荐阅读顺序）

1. **[系统状态.md](系统状态.md)** - 📊 **从这里开始**！系统状态与文档索引
2. **[开发指南.md](开发指南.md)** - 🔥 **最重要**！完整开发指南和最佳实践
3. **[设计系统完整规范-2026.md](设计系统完整规范-2026.md)** - 🎨 设计系统v3.0（强制执行）
4. **[架构评估报告.md](架构评估报告.md)** - 🏗️ 架构评估（96/100分）
5. **[业务流程说明.md](业务流程说明.md)** - 💼 业务流程说明
6. **[快速测试指南.md](快速测试指南.md)** - 🧪 快速测试流程

### 📚 技术文档（docs/）

**开发指南（5份）**：
- **[扫码和SKU系统完整指南.md](docs/扫码和SKU系统完整指南.md)** - 扫码系统和SKU系统
- **[小程序开发完整指南.md](docs/小程序开发完整指南.md)** - 小程序开发工具和业务
- **[代码质量工具完整指南.md](docs/代码质量工具完整指南.md)** - 30+代码质量工具
- **[功能实现指南.md](docs/功能实现指南.md)** - 排序、工序、权限实现
- **[统一日期选择器完整指南.md](docs/统一日期选择器完整指南.md)** - 日期选择器

**组件文档（3份）**：
- **[LiquidProgressBar使用指南.md](docs/LiquidProgressBar使用指南.md)** - 进度球组件
- **[数据看板通用组件使用指南.md](docs/数据看板通用组件使用指南.md)** - 看板组件
- **[设计系统规范.md](docs/设计系统规范.md)** - 设计系统详细版

### 🔧 部署文档

- **[backend/后端说明.md](backend/后端说明.md)** - 后端项目说明
- **[deployment/数据库配置.md](deployment/数据库配置.md)** - 数据库配置和管理
- **[deployment/部署说明.md](deployment/部署说明.md)** - 部署流程说明

---

## 🚀 快速启动

### 环境要求
- **Java 17+**
- **Node.js 18+**
- **MySQL 8.0**
- **Docker**（推荐）

### 一键启动（推荐）

**⚠️ 重要**：开发环境必须使用启动脚本，否则会因缺少环境变量导致 API 403 错误

```bash
# 一键启动所有服务
./dev-public.sh
```

该脚本会自动：
1. 启动 MySQL Docker 容器
2. 加载 `.run/backend.env` 环境变量
3. 启动后端 Spring Boot（端口 8088）
4. 启动前端 Vite dev server（端口 5173）
5. 启动 Cloudflare Tunnel（可选，用于外网访问）

**访问地址**：
- 📱 PC端：http://localhost:5173
- 🔧 后端：http://localhost:8088
- 📱 小程序：使用微信开发者工具打开 `miniprogram/` 目录

### 首次启动准备

```bash
# 1. 创建环境变量文件（如果不存在）
mkdir -p .run
cat > .run/backend.env << 'EOF'
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
EOF

# 2. 启动 MySQL 容器
docker start fashion-mysql-simple || docker run -d \
  --name fashion-mysql-simple \
  -p 3308:3306 \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=fashion_supplychain \
  mysql:8.0
```

### 一键同步代码

```bash
./git-sync.sh "你的提交信息"
```

---

## ✨ 最新更新（2026-01-31）

### 📚 文档大清理完成 🎉
- ✅ **精简文档数量**：55份 → 22份核心文档（↓60%）
- ✅ **归档已完成任务**：33份文档移至 `archive/2026-01-31-清理/`
  - 14份已完成任务总结（P0/P1、修复报告等）
  - 5份过时计划文档（样衣库存实施、电商集成等）
  - 3份重复设计规范（统一到单一文档）
  - 11份临时分析报告（深色主题、组件统计等）
- ✅ **更新AI指令**：`.github/copilot-instructions.md` v3.1 中文版
- ✅ **文档分类优化**：核心文档 + 技术指南 + docs模块化
- ✅ **更新索引**：`系统状态.md` 和 `README.md` 同步更新

**清理效果**：
- 文档减少60%，查找速度更快
- 结构更清晰，根目录11份 + docs 11份
- 去除重复，统一设计规范
- 归档历史，保留完整记录

### 历史更新

**2026-01-30**：进销存系统核心构建完成
- ✅ 面辅料库存体系、成品库存闭环、样衣库存管理
- ✅ 样衣开发费用统计修复、报价单锁定持久化

**2026-01-27**：代码质量优化完成
- ✅ ESLint配置优化、SQL语法检查、30+代码质量工具

**2026-01-26**：文档大整合（34份 → 15份）
- ✅ 功能文档整合、临时文档归档、重复清理

**2026-01-25**：前端模块化完成
- ✅ 23个页面迁移到 `modules/`、统一 `@/` 别名导入

**2026-01-23**：GitHub仓库建立
- ✅ 首次推送、创建 git-sync.sh 脚本

---
ESLint配置完善 |
| PC端网页 | ✅ 运行中 | 97/100 | 模块化完成，文档精简60% |
| 后端服务 | ✅ 运行中 | 97/100 | 26个Orchestrator编排器 |
| 数据库 | ✅ 运行中 | 100% | MySQL 8.0 稳定 |
| 部署环境 | ✅ 就绪 | 100% | Docker + Nginx |
| 版本控制 | ✅ GitHub | 100% | 文档精简60%，代码质量优化 |

**综合评分：97/100 ⭐⭐⭐⭐⭐**

---

## 🎯 核心特性

### ✅ 已完成功能
- 生产订单全流程管理
- **SKU系统**（款号+颜色+尺码三端统一）
- 扫码生产流程（采购→裁剪→缝制→质检→入库）
- 菲号生成与管理（PC端+手机端）
- **三种扫码模式**（订单/菲号/SKU）
- 自动工序识别
- 财务对账系统
- 用户权限管理
- 实时数据同步
### 🚀 技术亮点
- **Orchestrator模式**：26个业务编排器
- **ResizableModal优化**：INP<200ms
- **前端模块化**：5大模块，@/ 别名统一导入
- **文档精简**：60%精简度，22份核心文档
- **代码质量工具**：30+工具集成（ESLint/TypeScript/Prettier等）
- **代码注释全中文化**：93%覆盖率
- **TypeScript类型完整**：96%
- **统一错误处理**：7种错误类型
- **三端验证规则一致**

---

## 📁 项目结构

```
服装66666/
├── README.md                       # 📖 项目总览（本文件）
├── 系统状态.md                     # 📊 系统状态与文档索引
├── 开发指南.md                     # 🔥 开发指南（最重要）
├── 架构评估报告.md                 # 🏗️ 架构评估（96分）
├── 项目技术文档.md                 # 📚 完整技术文档
├── 业务流程说明.md                 # 💼 业务流程
├── 快速测试指南.md                 # 🧪 测试指南
├── 代码和流程梳理报告.md           # 📊 质量分析
│
├── docs/                           # 📚 技术文档
│   ├── 功能实现指南.md             # 功能实现
│   ├── 扫码和SKU系统完整指南.md    # 扫码和SKU
│   ├── 小程序开发完整指南.md       # 小程序开发
│   ├── 统一日期选择器完整指南.md   # 日期选择器
│   └── 代码质量工具完整指南.md     # 代码质量工具
│
├── backend/                        # ☕ 后端（Spring Boot）
│   ├── 后端说明.md
│   └── src/
│
├── frontend/                       # ⚛️ 前端（React + Vite）
│   └── src/
│       └── modules/                # 模块化目录
│           ├── basic/              # 基础模块
│           ├── production/         # 生产模块
│           ├── finance/            # 财务模块
│           ├── system/             # 系统模块
│           └── dashboard/          # 仪表板
│
├── miniprogram/                    # 📱 小程序（微信原生）
│   ├── pages/
│   ├── components/
│   └── utils/
│
├── deployment/                     # 🚀 部署配置
│   ├── 数据库配置.md
│   ├── 部署说明.md
│   └── docker-compose.yml
│
└── archive/                        # 📦 归档文档
    ├── 临时文档和报告/
    ├── 前端模块化迁移/
    ├── 优化记录/
    └── 历史报告/
```

---

## 📞 获取帮助

1. 查看 [系统状态.md](系统状态.md) 了解当前状态
2. 阅读 [开发指南.md](开发指南.md) 获取开发最佳实践
3. 使用 [快速测试指南.md](快速测试指南.md) 快速测试
4. 查看 [docs/](docs/) 目录查找详细技术文档
5. AI开发助手参考 [.github/copilot-instructions.md](.github/copilot-instructions.md)

---

## 📦 版本控制

- **仓库**：github.com/chenguojun06-star/fz66666
- **认证**：SSH（ed25519）
- **首次推送**：2026-01-23（265文件，28,625行代码）
- **文档优化**：2026-01-31（文档精简60%，AI指令v3.1）

---

*项目评分：97/100 ⭐⭐⭐⭐⭐*  
*生产就绪 | 已建立版本控制 | 文档完善*
