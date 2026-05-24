# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

服装MES（Manufacturing Execution System）— 服装加工行业的生产执行系统，三端协同（PC管理后台 + 微信小程序扫码 + H5移动端）。

## Tech Stack

- **Backend**: Spring Boot 3.3.6 + Java 21 + MyBatis-Plus 3.5.7 + Flyway + Redis + MySQL 8.0
- **Frontend**: React 18 + TypeScript + Vite 7 + Ant Design 6 + Zustand
- **Mini Program**: 微信原生小程序
- **AI**: 小云AI智能体（Azure OpenAI + MCP Tools + DAG编排）

## Distributed Lock

`DistributedLockService` (`common.lock` package) provides Redis-based distributed locking via Lua scripts:
- `executeWithLock(key, timeout, unit, supplier)` — lock & auto-release, throws if busy
- `executeWithStrictLock(key, timeout, unit, supplier)` — same but throws immediately on contention
- `executeWithLockOrFallback(key, timeout, unit, supplier)` — retries once, then throws

Already used in 10+ AI jobs and production consistency jobs. Lock key prefix: `fashion:lock:`.
**Do NOT add Redisson** — existing implementation covers all needs.

## Architecture Constraints (P0 Rules)

```
Controller → Orchestrator → Service → Mapper
```

- **Orchestrator layer is mandatory** for cross-service/跨表 logic. 105 business orchestrators + 130 AI orchestrators.
- **Services must NOT call each other** — all cross-service orchestration goes through Orchestrator.
- **Controllers must NOT call multiple services** — delegate to Orchestrator.
- **@Transactional only in Orchestrator layer** — never in Service or Controller.
- **Java unit test sources stay local only** — per P0 policy, Java test sources (*Test.java in src/test/) are gitignored and never committed. Shell integration tests (scripts/test/) and Playwright E2E tests (frontend/e2e/) ARE committed.

## Backend Module Structure (14 modules)

| Module | Orchestrators | Responsibility |
|--------|--------------|----------------|
| production | 31 | 生产订单、扫码、裁剪、质检、进度 |
| finance | 21 | 工资结算、对账、报销、付款、成本 |
| system | 15 | 租户、用户、角色、工厂、配置 |
| style | 9 | 款式信息、BOM、工艺、报价 |
| warehouse | 8 | 物料库存、入库、出库、调拨 |
| intelligence | 130 | 小云AI对话、知识库、异常检测 |
| selection | 4 | 选款审核、批次、候选 |
| integration | 3 | 开放API、电商订单、支付/物流 |
| dashboard | 3 | 数据看板、趋势分析 |
| crm | 3 | 客户管理 |
| template | 2 | 生产模板、款式模板 |
| procurement | 2 | 采购订单、供应商评分 |
| wechat | 2 | H5/小程序授权 |
| datacenter | 1 | 数据同步、质量管理 |
| search | 1 | 全局搜索 |

## Frontend Module Structure (10 modules)

basic, crm, dashboard, finance, integration, intelligence, production, selection, system, warehouse

## Common Commands

```bash
# Backend
cd backend && mvn clean test -DskipTests=false   # 运行Java单元测试
cd backend && mvn spring-boot:run                 # 启动后端 (port 8088)

# Frontend  
cd frontend && npm run dev                        # 启动前端 (port 5173)
cd frontend && npm run lint                       # ESLint
cd frontend && npm run type-check                 # TypeScript 类型检查
cd frontend && npm run check:all                  # 全量检查（lint + type + deps + circular）
cd frontend && npm run test                       # Vitest 单元测试
cd frontend && npm run test:e2e                   # Playwright E2E测试

# Shell集成测试（需先启动后端）
./scripts/test/test-complete-business-flow.sh     # 完整业务流程E2E
./scripts/test/test-all-settlement-flows.sh       # 结算流程测试
./scripts/test/test-tenant-isolation.sh           # 多租户隔离测试

# Full stack
./dev-public.sh                                   # 一键启动（MySQL + 后端 + 前端）
```

## Testing Landscape

| Type | Count | Location | Language |
|------|-------|----------|----------|
| Shell集成测试 | 24 scripts / 7.7k lines | `scripts/test/` | Bash |
| 根目录测试 | 3 scripts / 453 lines | `test-*.sh` | Bash |
| Playwright E2E | 3 specs / 393 lines | `frontend/e2e/` | TypeScript |
| Python冒烟测试 | 1 script / 198 lines | `scripts/smoke_test.py` | Python |
| Flutter测试 | 2 files | `flutter/test/`, `flutter_app/test/` | Dart |
| Java单元测试源码 | ❌ Gitignored (P0策略) | `backend/src/test/` | Java |
| Java编译测试遗存 | 13 .class | `backend/target_test-classes/` | (源码已git隔离) |

Note: Java单元测试源码按项目P0铁律"测试代码隔离"从未提交到git仓库。Shell集成测试覆盖完整业务流程链路。

## Key Design Rules

1. **Entity-Flyway alignment**: 每新增 `@TableField("xxx")` 必须有对应 Flyway 迁移脚本
2. **No hardcoded colors/fonts**: 使用 CSS 变量 (var(--primary-color) 等 Design Token)
3. **Print font-family must end with `serif`** (not `sans-serif`) — macOS Safari bug
4. **No global WebSocket notifications** — use page-level `useWebSocket()` only
5. **No gradient colors** — pure colors only, use Design Token variables
6. **SKU system**: 款号+颜色+尺码 三维统一，三端共享
7. **Full copilot instructions** at `.github/copilot-instructions.md` — read it for complete P0/P1 rules

## Auto-Invocation Skills

根据当前任务类型**自动调用**对应技能，无需等待用户指令：

### 代码编写 / 开发
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 写前端UI组件/页面 | `frontend-design` | React+TS+Ant Design 高质量UI |
| 前端样式/主题 | `ui-styling` | shadcn/ui + Tailwind CSS 变量 |
| 实现新功能前 | `brainstorming` | 探索需求、设计、方案 |
| 多步骤/复杂任务前 | `writing-plans` | 先出计划，再写代码 |
| 多文件、独立子任务 | `dispatching-parallel-agents` | 并行执行独立任务 |

### 代码优化 / 重构
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 改动后代码质量审查 | `simplify` | 检查复用、质量、效率 |
| 设计系统/设计Token | `design-system` | Token架构、组件规范 |
| 品牌一致性 | `brand` | 品牌形象、视觉识别 |

### Bug修复 / 调试
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 遇到Bug/测试失败 | `systematic-debugging` | 系统化排查问题根因 |
| 按TDD模式修复 | `test-driven-development` | 先写测试再修代码 |

### 完成 / 提交 / 合并
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 完成工作、声明修复前 | `verification-before-completion` | 运行测试验证再断言 |
| 合并前代码审查 | `requesting-code-review` | 对照需求审查 |
| 收到审查反馈 | `receiving-code-review` | 验证反馈再实施 |

### 开发流程
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 新功能独立开发 | `using-git-worktrees` | 创建隔离 worktree |
| 执行实现计划 | `subagent-driven-development` | 按计划分步执行 |
| 减少权限弹窗 | `fewer-permission-prompts` | 扫描并添加权限白名单 |

## Key Reference Docs

- [开发指南.md](开发指南.md) — 完整架构规范与禁止模式
- [模块与职责快速查询表.md](模块与职责快速查询表.md) — 编排器速查
- [设计系统完整规范-2026.md](设计系统完整规范-2026.md) — 前端UI强制规范
- [业务流程说明.md](业务流程说明.md) — 完整业务逻辑与数据流向
- [系统状态.md](系统状态.md) — 系统全景与更新日志
