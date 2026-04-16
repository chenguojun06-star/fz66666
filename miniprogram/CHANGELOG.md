# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### ✨ 新增
- **WebSocket 实时数据同步**：6 个核心页面（work/dashboard/inbox/scan-history/cutting-task-list/admin）接入 WebSocket 事件监听，任何一端操作后其他端自动刷新
- **轮询降级策略**：websocketManager.js 新增轮询降级，WebSocket 重连 10 次失败后自动切换 30s 轮询，连接恢复后自动停止轮询
- **eventBus 统一引用**：12 个文件从 `getApp().globalData.eventBus` 迁移到 `require` 导入，事件名从 `'DATA_REFRESH'` 统一为 `triggerDataRefresh()` 标准方法

### 🐛 修复
- **图标恢复**：恢复 `line-icons.wxss` 中被误删的 14 个图标定义，新增 icon-bell

## [1.0.0] - 2026-02-26
### ✨ 新增
- **代码规范**：建立了完整的手机端代码规范文档 `MOBILE_DEV_GUIDE.md`。
- **工具库**：
  - `uiHelper.js`: 统一封装了 Toast、Modal 等 UI 交互。
  - `dataTransform.js`: 统一封装了数据转换和归一化逻辑。
  - `validationRules.js`: 统一封装了表单验证规则。

### 🐛 修复
- **扫码入库**：修复了入库模式下未强制校验仓库选择的问题。
- **数据同步**：修复了首页数据刷新机制，确保 `onShow` 时从服务器拉取最新数据。

### ♻️ 重构
- **核心逻辑**：将分散的 UI 交互代码重构为使用 `uiHelper`。
- **数据处理**：将分散的数据判空逻辑重构为使用 `dataTransform`。
