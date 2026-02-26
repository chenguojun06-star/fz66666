# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
