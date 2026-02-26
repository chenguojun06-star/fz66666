# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-02-26

### 🚀 Major Release
- **全平台发布**：后端、前端、小程序端版本号统一为 `1.0.0`。
- **云端适配**：修复了前端 Vite 配置中硬编码内网 IP 的问题，现在支持云端容器化部署。

### ✨ Backend (后端)
- **架构升级**：采用 Orchestrator 模式（37个编排器）完全分离 Controller 与 Service。
- **数据一致性**：新增 `ProductionDataConsistencyJob` 定时任务，每 30 分钟自动修复订单进度。
- **安全增强**：移除了部分未使用的 PDF 依赖，优化了日志降级策略。

### 💻 Frontend (前端)
- **网络优化**：移除 `vite.config.ts` 中的硬编码 IP，修复 HMR 热更新与 WebSocket 连接。
- **规范落地**：建立了 `SYSTEM_DEFECT_REPORT.md` 全面缺陷报告。

### 📱 Miniprogram (小程序)
- **扫码重构**：基于 Mixin 机制重构核心扫码逻辑，支持入库强制校验仓库。
- **体验优化**：首页新增“生产进度”快捷入口，支持手动输入工单号。
