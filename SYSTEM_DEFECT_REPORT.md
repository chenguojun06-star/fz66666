# 云端系统全栈缺陷核查与整改报告

## 1. 概述
本报告针对已部署在云端的“服装供应链管理系统”（后端、前端、小程序端）进行了全面的代码缺陷核查。核查重点涵盖代码迭代管理、逻辑结构混乱、冗余沉积代码及潜在 Bug 风险。

## 2. 核心问题梳理

### 2.1 代码迭代管理缺陷
*   **版本规范缺失**：
    *   **后端**：`pom.xml` 中版本号长期停留在 `0.0.1-SNAPSHOT`，未随功能发布进行语义化版本升级（如 `1.0.0`, `1.1.0`）。
    *   **前端**：`package.json` 版本号为 `0.0.0`，缺乏正式的版本管理机制。
    *   **小程序**：虽已建立 `CHANGELOG.md`，但 `package.json` 版本仍为 `0.0.0`。
*   **发布记录缺失**：
    *   后端与前端缺乏统一的 `CHANGELOG.md`，导致云端部署版本与代码库 commit 难以对应，回滚风险高。
*   **CI/CD 流程断层**：
    *   GitHub Actions (`ci.yml`) 仅包含后端单元测试和前端构建，**缺少自动打 Tag 和 Release 的步骤**，导致发布过程仍依赖人工操作。

### 2.2 逻辑混乱与代码结构问题
*   **后端（Java）**：
    *   **优点**：已采用 `Orchestrator` 模式（37个编排器）分离 Controller 与 Service，架构分层清晰。
    *   **缺陷**：部分 Controller（如 `ProductionOrderController`）仍承担了过多的参数校验逻辑，未完全下沉到 Service 层。
*   **前端（React）**：
    *   **缺陷**：`Dashboard` 等页面组件中包含了大量内联的 API 调用和数据处理逻辑，未完全抽离为 Custom Hooks 或 Service。
*   **小程序**：
    *   **改进**：已通过 `scanCoreMixin.js` 等 Mixin 机制重构了扫码逻辑，但部分旧页面（如 `pages/home/index.js`）仍存在逻辑耦合。

### 2.3 多余沉积代码
*   **后端**：
    *   `pom.xml` 中保留了部分未使用的依赖（如 `openhtmltopdf` 若无导出 PDF 需求可移除）。
    *   日志配置中保留了大量的 `WARN` 级别降级配置，提示部分模块（如 `warehouse`）可能存在频繁的无效日志输出。
*   **前端**：
    *   `vite.config.ts` 中硬编码了内网 IP `192.168.1.17`，这在云端部署环境下是**无效且有害**的，会导致 HMR（热更新）失效或 WebSocket 连接失败。
    *   构建配置中包含 `drop_console: true`，虽然去除了日志，但开发环境的调试代码（console.log）仍残留在源码中。
*   **小程序**：
    *   已执行清理脚本，但 `utils/` 下仍可能存在未引用的工具函数（需配合 `ts-prune` 等工具深度扫描）。

### 2.4 潜在 Bug 与风险
*   **硬编码风险（高危）**：
    *   **前端 Vite 配置**：硬编码的 `192.168.1.17` 在云端容器中无法访问，会导致 WebSocket 断连，影响实时通知功能。
    *   **数据库配置**：`application.yml` 中默认开启了 `createDatabaseIfNotExist=true`，生产环境应禁用此选项以防止意外覆盖。
*   **数据一致性**：
    *   后端已实现 `ProductionDataConsistencyJob`，但前端对于“网络断开重连”后的数据自动刷新机制仍较弱（依赖用户手动刷新或页面切换）。

## 3. 整改建议与行动计划

### 3.1 立即整改（P0 - 影响稳定性）
1.  **修正前端网络配置**：
    *   修改 `vite.config.ts`，移除硬编码的 `host: '192.168.1.17'`，改为动态获取或使用相对路径代理。
2.  **版本号同步**：
    *   将后端、前端、小程序的 `package.json`/`pom.xml` 版本号统一升级为 `1.0.0`，并打上 Git Tag。
3.  **建立后端 Changelog**：
    *   创建 `backend/CHANGELOG.md`，记录每次部署的 API 变更。

### 3.2 架构优化（P1 - 影响维护性）
1.  **前端逻辑抽离**：
    *   对 `Dashboard` 等核心页面进行重构，将 API 调用封装为 `useDashboardStats` 等 Hook。
2.  **后端依赖清理**：
    *   运行 `mvn dependency:analyze`，移除未使用的 Maven 依赖。

### 3.3 流程规范（P2 - 长期治理）
1.  **CI/CD 增强**：
    *   在 GitHub Actions 中增加 `release-please` 或类似步骤，自动生成 Changelog 并打 Tag。
2.  **代码扫描常态化**：
    *   将 `miniprogram/clean-garbage-code.sh` 纳入 pre-commit 钩子，禁止提交包含 `console.log` 的代码。

## 4. 结论
系统整体架构（特别是后端 Orchestrator 模式）设计良好，核心缺陷主要集中在**工程化细节**（版本管理、硬编码配置）和**前端逻辑耦合**上。通过上述整改，可显著提升云端系统的稳定性和可维护性。
