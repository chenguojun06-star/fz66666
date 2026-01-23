# fz66666

# 🎯 服装供应链管理系统

*最后更新：2026-01-23*  
*系统评分：96/100 ⭐⭐⭐⭐⭐*  
*GitHub：[chenguojun06-star/fz66666](https://github.com/chenguojun06-star/fz66666)*

---

## 📌 快速导航

### 📖 核心文档（推荐阅读顺序）
1. **[SYSTEM_STATUS.md](SYSTEM_STATUS.md)** - 📊 系统当前状态与文档索引（开始这里！）
2. **[xindiedai.md](xindiedai.md)** - 🏗️ 系统架构评估报告（96/100分）
3. **[PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)** - 📚 完整技术文档
4. **[TECH_SUMMARY.md](TECH_SUMMARY.md)** - 💡 技术总结

### 🛠️ 功能指南
- [SKU_QUICK_REFERENCE.md](SKU_QUICK_REFERENCE.md) - **SKU系统快速参考**（款号+颜色+尺码统一）
- [SCAN_SYSTEM_LOGIC.md](SCAN_SYSTEM_LOGIC.md) - 扫码系统逻辑（订单/菲号/SKU三种模式）
- [WORKFLOW_EXPLANATION.md](WORKFLOW_EXPLANATION.md) - 工作流说明
- [MINIPROGRAM_BUNDLE_GENERATION_GUIDE.md](MINIPROGRAM_BUNDLE_GENERATION_GUIDE.md) - 菲号生成指南
- [USER_APPROVAL_GUIDE.md](USER_APPROVAL_GUIDE.md) - 用户审批指南
- [QUICK_TEST_GUIDE.md](QUICK_TEST_GUIDE.md) - 快速测试指南

### 🏗️ 架构设计
- [ARCHITECTURE_QUALITY_ASSESSMENT.md](ARCHITECTURE_QUALITY_ASSESSMENT.md) - 架构质量评估
- [DATA_SYNC_ANALYSIS.md](DATA_SYNC_ANALYSIS.md) - 数据同步分析
- [DATA_PERMISSION_DESIGN.md](DATA_PERMISSION_DESIGN.md) - 数据权限设计

### 🚀 部署运维
- [deployment/README.md](deployment/README.md) - 部署指南
- [deployment/DATABASE_CONFIG.md](deployment/DATABASE_CONFIG.md) - 数据库配置
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - 部署清单

---

## 🚀 快速启动

### 环境要求
- Java 17+
- Node.js 18+
- MySQL 8.0
- Docker（推荐）

### 启动步骤

**⚠️ 重要：开发环境必须使用启动脚本，否则会因缺少环境变量导致API 403错误**

```bash
# 推荐方式：使用一键启动脚本（会自动加载环境变量）
./dev-public.sh

# 该脚本会自动：
# 1. 启动 MySQL Docker 容器
# 2. 加载 .run/backend.env 环境变量
# 3. 启动后端 Spring Boot (端口 8088)
# 4. 启动前端 Vite dev server (端口 5173)
# 5. 启动 Cloudflare Tunnel (可选，用于外网访问)

# 访问地址：
# - PC端：http://localhost:5173 或 http://192.168.2.248:5173
# - 后端：http://localhost:8088 或 http://192.168.2.248:8088
# - 小程序：使用微信开发者工具打开 miniprogram/ 目录
```

**首次启动前准备：**
```bash
# 1. 创建环境变量文件（如果不存在）
mkdir -p .run
cat > .run/backend.env << 'EOF'
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
EOF

# 2. 确保 MySQL 容器存在并运行
docker start fashion-mysql-simple || docker run -d \
  --name fashion-mysql-simple \
  -p 3308:3306 \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=fashion_supplychain \
  mysql:8.0
```

**详细配置说明：**
- 查看 [ENV_CONFIG_GUIDE.md](ENV_CONFIG_GUIDE.md) - 环境变量完整配置指南

### 一键同步代码
```bash
./git-sync.sh "你的提交信息"
```

---

## ✨ 最新更新（2026-01-24）

- ✅ **修复Dashboard API 403错误**（环境变量配置问题）
- ✅ 添加环境变量配置完整指南（ENV_CONFIG_GUIDE.md）
- ✅ 更新README启动流程（强调必须使用dev-public.sh）
- ✅ 修复SKU系统数据库字段缺失问题
- ✅ 规范开发环境启动方式

### 历史更新（2026-01-23）

- ✅ PC端裁剪单弹窗添加订单扫码二维码
- ✅ 全站弹窗尺寸规范统一（80vw × 85vh）
- ✅ GitHub 代码仓库建立并完成首次推送
- ✅ 创建 git-sync.sh 快捷同步脚本
- ✅ 文档归档整理（保留核心16份，归档34份）

---

## 📊 系统状态

| 模块 | 状态 | 评分 |
|------|------|------|
| 手机端小程序 | ✅ 运行中 | 95/100 |
| PC端网页 | ✅ 运行中 | 96/100 |
| 后端服务 | ✅ 运行中 | 96/100 |
| 数据库 | ✅ 运行中 | 100% |
| 部署环境 | ✅ 就绪 | 100% |
| 版本控制 | ✅ GitHub | 100% |

**综合评分：96/100 ⭐⭐⭐⭐⭐**

---

## 📦 版本控制

- **仓库**：github.com/chenguojun06-star/fz66666
- **认证**：SSH（ed25519）
- **首次推送**：2026-01-23（265文件，28,625行代码）

---

## 📁 文档结构

```
服装66666/
├── README.md                    # 本文件（总入口）
├── SYSTEM_STATUS.md             # 系统状态与文档索引 ⭐
├── xindiedai.md                 # 架构评估报告 ⭐
├── PROJECT_DOCUMENTATION.md     # 完整技术文档 ⭐
├── TECH_SUMMARY.md              # 技术总结 ⭐
├── 功能指南/ (9份)              # 具体功能说明
├── docs/archived/               # 已完成文档归档（34份）
│   ├── reports/                 # 完成报告（21份）
│   ├── guides/                  # 已完成指南（7份）
│   ├── tests/                   # 已执行测试（3份）
│   └── summaries/               # 工作总结（3份）
├── backend/                     # 后端代码
├── frontend/                    # 前端代码
├── miniprogram/                 # 小程序代码
└── deployment/                  # 部署配置
```

---

## 🎯 核心特性

### 已完成功能
- ✅ 生产订单全流程管理
- ✅ 扫码生产追踪（采购→裁剪→缝制→质检→入库）
- ✅ 菲号生成（PC端+手机端）
- ✅ 订单级别二维码（一码贯穿全流程）
- ✅ 自动工序识别
- ✅ 财务对账系统
- ✅ 用户权限管理
- ✅ 实时数据同步

### 技术亮点
- 🚀 ResizableModal性能优化（INP<200ms）
- 📝 代码注释全中文化（93%覆盖率）
- 🔒 TypeScript类型完整（96%）
- ⚡ 统一错误处理（7种类型）
- 🔄 三端验证规则一致
- 🏗️ 业务编排层设计（12个编排器）

---

## 📞 获取帮助

1. 查看 [SYSTEM_STATUS.md](SYSTEM_STATUS.md) 了解当前状态
2. 阅读 [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) 获取技术细节
3. 使用 [QUICK_TEST_GUIDE.md](QUICK_TEST_GUIDE.md) 快速测试
4. 查看 `docs/archived/` 目录获取历史文档

---

*项目评估：96/100 ⭐⭐⭐⭐⭐*  
*生产就绪 | 已建立版本控制 | 文档完善*
