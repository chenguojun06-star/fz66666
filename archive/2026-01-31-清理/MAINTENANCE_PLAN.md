# 项目全生命周期维护与架构演进方案 (Project Lifecycle Maintenance & Architecture Evolution Plan)

## 1. 架构维护流程体系 (Architecture Maintenance System)

### 1.1 定期代码审查机制 (Code Review Mechanism)

- **频率**: 每两周一次 (Bi-weekly)，建议定在每个 Sprint 结束后的周五下午。
- **审查对象**:
  - 近期重构的核心模块（如 `MaterialPurchaseServiceImpl`, `WarehousingModal`）。
  - 涉及数据库变更或 API 签名变更的提交。
- **检查清单 (Checklist)**:
  1.  **规范性**: 是否遵循阿里巴巴 Java 开发手册 / Airbnb React 规范。
  2.  **安全性**: 是否存在未授权的接口访问（如 SecurityConfig 中的 permitAll）。
  3.  **性能**: 是否引入了 N+1 查询？大对象是否未分页？
  4.  **业务逻辑**: 扫码逻辑是否兼容旧版二维码？SKU 生成逻辑是否覆盖所有颜色尺码组合？
- **产出**: 《代码审查整改追踪表》，必须在下个 Sprint 开始前完成 Critical 级别问题的修复。

### 1.2 版本控制规范 (Version Control Strategy)

- **分支模型**: 采用 Gitflow。
  - `master`: 生产环境分支，仅接受 `hotfix` 或 `release` 分支的合并。
  - `develop`: 开发主干，所有 `feature` 分支合并至此。
  - `feature/xxx`: 功能开发分支，命名如 `feature/sku-integration-202602`。
  - `hotfix/xxx`: 紧急修复分支，修复后同时合并回 `master` 和 `develop`。
- **Commit Message**: 遵循 Conventional Commits (e.g., `feat: add SKU sync API`, `fix: security vulnerability in dashboard`).
- **发布审批**: 发布生产环境前，需经过 Tech Lead 代码复核及 QA 回归测试签字。

### 1.3 文档同步更新策略 (Documentation Sync)

- **原则**: "Code is Truth, Doc is Guide"。
- **机制**:
  - 在 CI/CD 流程中增加“文档检查”环节（人工或脚本检测 API 文档更新时间）。
  - 任何涉及 `Controller` 或数据库 Schema 的变更，必须同步更新 `docs/api/` 或 `docs/database/` 下的文档。
- **时效**: 变更合并后 24 小时内完成文档更新。

### 1.4 技术债务管理 (Tech Debt Management)

- **识别**: 每季度利用 SonarQube 全量扫描，识别代码异味 (Code Smell) 和重复代码。
- **偿还**:
  - 每个 Sprint 预留 20% 的 Story Points 用于偿还技术债务。
  - 当前已识别债务：
    - 后端 Spring Boot 2.7 -> 3.x 升级。
    - 前端 `any` 类型清理。
    - 补充 `ProductWarehousing` 模块的单元测试。

## 2. 运维保障体系 (Operations & Stability)

### 2.1 性能监控与优化 (Performance Monitoring)

- **工具**: 接入 Prometheus + Grafana 或 SkyWalking。
- **KPI 阈值**:
  - **API 响应时间**: P95 < 500ms (核心扫码接口 < 200ms)。
  - **错误率**: < 0.1%。
  - **JVM 堆内存**: 使用率 > 80% 触发告警。
- **应急**: 设定自动扩容策略（针对云部署）或降级策略（如暂时关闭非核心报表功能）。

### 2.2 安全漏洞扫描与修复 (Security Scanning)

- **自动化**: 每周日凌晨 2:00 自动运行 OWASP ZAP 扫描。
- **SLA**:
  - **Critical (高危)**: 24小时内修复 (如 SQL 注入、越权访问)。
  - **High (中危)**: 72小时内修复。
  - **Medium/Low**: 两周内或随下个版本修复。
- **补丁管理**: 每月检查 Maven/NPM 依赖更新，及时修补 CVE 漏洞。

### 2.3 应急响应预案 (Emergency Response)

- **分级**:
  - **P1 (系统瘫痪)**: 核心业务（扫码、入库）不可用 -> 30分钟内响应，2小时内恢复。
  - **P2 (功能受损)**: 非核心功能（报表、导出）不可用 -> 2小时内响应，8小时内恢复。
- **流程**: 发现告警 -> 值班人员确认 -> 启动 War Room -> 执行回滚/热修 -> 复盘 (Post-mortem)。

## 3. 团队与协作标准 (Team & Collaboration)

### 3.1 团队交接标准 (Handover Standard)

- **文档包**:
  - 《系统架构白皮书》
  - 《核心业务流程图 (扫码/采购/结算)》
  - 《运维操作手册 (含密钥与环境配置)》
- **并行期**: 至少 2 周。
  - Week 1: 接受者 Shadowing (旁听、观察)。
  - Week 2: 接受者 Reverse Shadowing (操作，原负责人观察纠正)。

### 3.2 第三方对接协议 (3rd Party Integration)

- **SLA 要求**: 可用性 > 99.9%。
- **变更通知**: 接口变更需提前 30 天通知。
- **电商对接特别条款**: 针对淘宝/Shopify 等平台，需建立独立的 **Anti-Corruption Layer (防腐层)**，防止外部模型污染内部核心领域模型。

### 3.3 技术演进路线图 (Roadmap)

- **Q1 (Current)**: 夯实基础。完成 SKU 表建设，修复安全漏洞，补充测试。
- **Q2**: 电商联通。实现 SKU 同步接口，对接首个外部渠道。
- **Q3**: 架构升级。升级 Spring Boot 3，引入容器编排 (K8s)。
- **Q4**: 数据智能。引入数据仓库，基于积累的生产数据进行产能预测。

## 4. 特别注意事项验证 (Special Verification)

### 4.1 扫码功能与 SKU 页面核对

- **现状确认**:
  - 扫码逻辑依赖 `ScanRecord` 和 `CuttingBundle`，目前运行稳定。
  - SKU 页面目前主要展示 `StyleInfo` 中的 JSON 数据。
- **风险控制**:
  - 新增的 `t_product_sku` 表是**增量设计**，不修改原有表结构，**物理隔离**了风险。
  - `ProductSkuService` 的生成逻辑是只读 `StyleInfo` 并写入新表，不会反向修改原有款式数据。
  - **验证计划**: 在 Staging 环境执行全量 SKU 生成脚本，验证原有扫码入库流程是否受影响（预期无影响）。

## 5. 资源预算与考核 (Budget & KPI)

### 5.1 考核指标 (KPIs)

- **代码质量**: 单元测试覆盖率 > 60%，SonarQube 异味数 < 50。
- **稳定性**: 系统可用性 > 99.9%。
- **维护效率**: P1 故障平均恢复时间 (MTTR) < 2小时。

### 5.2 资源预算 (Resource Budget)

- **人力**:
  - 维护工程师: 0.5 FTE (全职当量)。
  - 架构师: 0.2 FTE (负责审查与规划)。
- **工具**:
  - CI/CD Server (GitHub Actions/Jenkins): $50/mo。
  - 监控服务 (New Relic/Datadog): $100/mo。

---

**批准签字 (Approval)**:
项目负责人: ********\_\_******** 日期: 2026-01-30
技术负责人: ********\_\_******** 日期: 2026-01-30
