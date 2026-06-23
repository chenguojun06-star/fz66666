# 5 分钟快速上手指南

> 新加入项目的开发者，或 AI 助手首次工作时的快速入门
> 阅读时间：≈ 5 分钟

---

## 🏗️ 项目一句话介绍

**服装供应链全链路管理系统**：从款式设计 → 生产订单 → 裁剪分菲 → 工序扫码 → 质检入库 → 财务结算的全流程管理，包含 PC 端（React+TypeScript）、小程序端（微信原生）、后端（Spring Boot+MyBatis-Plus+MySQL），并内置 AI 智能运营驾驶舱（小云AI）。

---

## 📂 核心目录结构（一眼看懂）

```
项目根目录/
├── backend/                     # Spring Boot 后端（核心业务）
│   ├── src/main/java/.../
│   │   ├── production/          # 生产模块（订单/扫码/工序/质检）
│   │   ├── finance/             # 财务结算模块
│   │   ├── warehouse/           # 仓库/入库模块
│   │   ├── style/               # 款式管理
│   │   ├── system/              # 系统管理（用户/角色/权限）
│   │   ├── intelligence/        # AI 智能模块（小云AI核心）
│   │   ├── common/              # 公共工具
│   │   └── config/              # 配置类
│   └── src/main/resources/db/migration/   # Flyway 迁移脚本（V*.sql）
│
├── frontend/                    # React + TypeScript PC 端
│   └── src/
│       ├── modules/             # 业务模块页面（每个模块一个文件夹）
│       ├── components/common/   # 通用组件（ResizableModal, RowActions等）
│       ├── services/            # API 调用层
│       ├── stores/              # Zustand 全局状态
│       ├── utils/               # 工具函数（含 validationRules.ts）
│       └── types/               # TypeScript 类型定义
│
├── miniprogram/                 # 微信小程序
│   └── pages/                   # 扫码/首页/工资/缺陷 等页面
│
├── memory-bank/                 # AI 记忆系统（每次对话开头读取）
├── .github/                     # GitHub 配置（CI/Agent/Prompts/Codeowners）
├── .trae/                       # AI Agent 规则和 Skills
│   ├── rules/                   # P0铁律/工作流/优化日志
│   └── skills/                  # 30+ 个 AI 技能（服装领域专用）
└── docs/                        # 开发文档和使用指南
```

---

## 🚀 启动开发环境（3 步）

```bash
# Step 1: 启动数据库 + 后端 + 前端（一键式）
./dev-public.sh

# Step 2: 浏览器打开
# - PC 管理后台：http://localhost:5173
# - 内网访问：http://192.168.2.215:5173

# Step 3（可选）: 微信开发者工具打开 miniprogram/ 目录
```

开发环境会自动：
- 启动 MySQL（端口 **3308**，非标准3306）
- 加载本地环境变量（`.run/backend.env`）
- 启动 Spring Boot（端口 8088）
- 启动 Vite 开发服务器（端口 5173）

---

## 🔴 7 条 P0 铁律（记住这 7 条，90% 的坑能避免）

| # | 铁律 | 后果（违反的话） |
|---|------|----------------|
| 1 | **Controller 禁止直调多个 Service**，复杂业务必须走 Orchestrator + @Transactional | 跨服务数据不一致，无法回滚 |
| 2 | **Entity 字段变更 = 必须有 Flyway 迁移脚本**（ALTER TABLE），反之亦然 | 应用启动失败 / Unknown column 500 |
| 3 | **扫码/工序/质检/入库/多端链路的改动**，必须全链路验证上下游 | 业务断链，数据不一致 |
| 4 | **权限码必须真实存在于 t_permission 表**，禁止凭空造权限码 | 全员 403 无权限 |
| 5 | **禁止修改已执行的 Flyway 脚本**（V*.sql 内容一旦应用过就不能改） | checksum 不匹配 → 应用启动失败 |
| 6 | **所有打印组件的 font-family 必须以 serif 结尾** | 打印中文完全不显示 |
| 7 | **跨租户隔离**：所有查询/操作必须带 tenant_id，防止A厂看B厂数据 | P0安全事故，数据泄露 |

---

## 📖 做事情的标准流程（7 步工作流）

每次接新需求/修 bug，按以下流程走：

1. **读上下文**：先看 `memory-bank/activeContext.md`（当前在做什么）+ `.trae/rules/project_rules.md`（P0铁律）+ 最近2个 `optimization-log-*.md`（最近踩的坑）
2. **选角色**：根据任务类型选择对应的 Agent 角色（全栈编排师/Bug调查员/Orchestrator构建师等）
3. **深度调研**：搜索相关代码 → 检查数据库结构 → 查看历史案例
4. **任务编排**：拆成可执行的子任务（数据库→后端→前端→小程序）
5. **逐层执行**：按顺序写代码，每一层完成后验证
6. **质量门控**：mvn compile ✅ + npx tsc --noEmit ✅ + 业务场景测试
7. **自进化记录**：更新 memory-bank/ 下的文件，记录本次变更

---

## 💡 AI 助手工作时的关键约定

当你跟 AI 助手说需求时，它会自动做以下事情（你可以检查是否执行了）：

| AI 应该做的事 | 检查点 |
|-------------|--------|
| 每次对话开头读取 8 个核心文件 | memory-bank 下文件的内容会被引用 |
| 告诉你改动涉及的 P0 铁律 | 会明确说"这涉及铁律 #3: 全链路扫码验证" |
| 修改前先做影响评估 | 会列出要改的文件清单 |
| 改完后做编译验证 | 会告诉你 `mvn compile ✅` 和 `npx tsc --noEmit ✅` |
| 更新记忆文件 | 会话结束后 activeContext.md/progress.md 会更新 |

---

## 🔍 快速搜索（找什么文件看哪里）

| 我想找... | 去哪里找 |
|----------|---------|
| API 接口定义 | `backend/**/*Controller.java` |
| 前端页面 | `frontend/src/modules/*/pages/` |
| 小程序页面 | `miniprogram/pages/` |
| 数据库表结构 | `backend/src/main/resources/db/migration/V*.sql` |
| 代码规范 | `.github/copilot-instructions.md` |
| P0 铁律 | `.trae/rules/project_rules.md` |
| 工作流步骤 | `.trae/rules/agent-workflow.md` |
| 最近优化/踩坑记录 | `.trae/rules/optimization-log-*.md`（看最新的2个） |
| AI Agent 角色定义 | `.github/agents/*.agent.md` |
| AI 技能 | `.trae/skills/*/SKILL.md` |

---

## ⚡ 常见问题速查

### Q1: 启动后端报 Unknown column 错误怎么办？
**A**: 检查本地数据库 schema 是否与最新 Flyway 脚本同步。执行 `./deployment/db-manager.sh start` 启动数据库后，核对核心表的字段。

### Q2: 用户登录报 403 Forbidden？
**A**: 检查 `.run/backend.env` 是否存在且包含正确的 JWT secret。本地开发会跳过微信登录验证。

### Q3: 前端页面样式错乱/中文不显示？
**A**: 检查 `font-family` 是否以 `serif` 结尾（打印组件专属问题）。

### Q4: 小程序端扫码后PC端看不到数据？
**A**: 检查扫码链路的 `tenant_id` 是否正确传递，以及 Controller → Orchestrator → Service → Mapper 每层是否都带了租户过滤条件。

### Q5: 新增 API 权限码，所有用户报 403？
**A**: 检查 `t_permission` 表中是否真的有这个权限码。权限码必须先入库，不是代码里写个字符串就完事。

### Q6: 修改了 Flyway 脚本，应用启动失败？
**A**: **永远不要改已经执行过的 V*.sql 内容**。如果需要修改，创建一个新的 V*.sql 文件，用 ALTER TABLE 做增量变更。

---

## 📌 下一步建议（学完本指南后）

1. **实际操作**：用 `./dev-public.sh` 启动环境，点点主要页面，感受一下系统
2. **读 copilot-instructions.md**：这是最全面的代码规范文档（虽然很长，但核心的 7条铁律已经在上面提炼了）
3. **看一个小功能的完整代码路径**：比如"扫码"功能，从后端 `ScanRecordOrchestrator.java` → 前端扫码页面 → 小程序 `pages/scan/`，对照理解全链路
4. **读最近的 optimization-log**：看看最近踩了哪些坑，这些坑最容易再踩
