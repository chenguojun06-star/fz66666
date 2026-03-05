# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-03-05

### 🚀 T0 新功能：工序数据库
- **ProcessKnowledgeOrchestrator**（新编排器 #87）：实时聚合全租户所有款式的工序信息，自动同步历史数据到单价维护。
- **工序数据库Tab**：单价维护新增"工序数据库"标签页，展示工序种类/涉及款式/历史记录统计。
- **智能建议价**：基于最近3条=2权重的加权均价算法，自动识别未定价工序。
- **UI完整性**：搜索框、展开详情（最近5款使用记录）、价格趋势标签提示。
- **过滤放宽**：工序名存在即收录（不再要求price>0），未定价显示'-'待补录。

### 🐛 Bugs Fixed
- **工序数据库空数据**（03-04）：放宽QueryWrapper过滤条件，price统计和priceTrend仅用price>0记录防NPE。
- **API双重路径**（03-05）：全局修复4处`/api/style/...`和`/api/ecommerce/...`多余前缀导致/api/api 404。
  - EcommerceOrders: `/ecommerce/orders/list` + `/style/sku/list` + `/style/info/list` + `/style/sku/{id}`
  - UserList: `/wechat/mini-program/invite/generate`
- **登录同步**（03-01）：UserOrchestrator成功分支补充UPDATE t_user.last_login_time/last_login_ip。
- **样板进度显示**（03-01）：COMPLETED卡片改用Object.keys全量设为100%，不依赖硬编码列表。
- **纸样师傅显示**（03-01）：patternMaker为空时fallback到receiver（业务规则：领取人=纸样师傅）。n
### ✨ Others
- **编排器总数**：86 → **87个**（新增ProcessKnowledgeOrchestrator）
- **代码行数**：244.5k → **244.8k行**

## [1.0.0] - 2026-02-26

### 🚀 Major Release
- **全平台发布**：后端、前端、小程序端版本号统一为 `1.0.0`。
- **云端适配**：修复了前端 Vite 配置中硬编码内网 IP 的问题，现在支持云端容器化部署。

### ✨ Backend (后端)
- **架构升级**：采用 Orchestrator 模式（**86个编排器**跨11个领域模块，100.2k行代码）完全分离 Controller 与 Service。
- **数据一致性**：新增 `ProductionDataConsistencyJob` 定时任务，每 30 分钟自动修复订单进度。
- **安全增强**：移除了部分未使用的 PDF 依赖，优化了日志降级策略。

### 💻 Frontend (前端)
- **网络优化**：移除 `vite.config.ts` 中的硬编码 IP，修复 HMR 热更新与 WebSocket 连接。
- **规范落地**：建立了 `SYSTEM_DEFECT_REPORT.md` 全面缺陷报告。

### 📱 Miniprogram (小程序)
- **扫码重构**：基于 Mixin 机制重构核心扫码逻辑，支持入库强制校验仓库。
- **体验优化**：首页新增“生产进度”快捷入口，支持手动输入工单号。
