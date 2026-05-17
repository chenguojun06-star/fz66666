# 活跃上下文 — 当前开发状态

> 本文件由 AI 助手在每次会话开始/结束时更新
> 最后更新：2026-05-17

---

## 当前目标

- ✅ 已推送到生产环境（commit 5871be99）

## 最近变更

- 2026-05-17：前端性能优化 — 消除浏览器Violation警告（6项修复）
- 2026-05-17：电商平台/小程序/后端功能增强（前次会话积累变更）
- 2026-05-16：全面更新前质量保障（7大任务全部完成）
- 2026-05-16：修复P0 — 3处金融/计量read-modify-write竞态条件
- 2026-05-16：修复P0 — 前端intelligenceApi.ts调用3个不存在的后端端点
- 2026-05-16：修复P0 — 删除非标准Flyway文件20260423004
- 2026-05-16：修复P1 — h5-web source-miniapp 3处旧式端点同步
- 2026-05-16：修复P1 — IntelligenceExecutionController @Transactional违规
- 2026-05-16：修复P1 — PayrollSettlementOrchestrator 2处read-modify-write竞态
- 2026-05-16：修复P2 — V202705161000 Flyway添加幂等守卫
- 2026-05-16：性能优化 — DATE()函数索引失效修复（19处）
- 2026-05-16：性能优化 — 移除xlsx死依赖（减少3.2MB）

## 当前进行中

- 无进行中任务

## 2026-05-17 前端性能优化成果

### 修复清单

| 类别 | 修复 | 文件 |
|------|------|------|
| Forced reflow | useLayoutEffect → useEffect + ResizeObserver + dimsRef缓存 | OrderScrollPanel.tsx |
| Forced reflow | 500ms setInterval轮询 → 事件订阅 | StyleLinkLines.tsx, StyleLinkContext.tsx |
| Non-passive listener | mouseup/touchend添加passive:true | Cockpit/index.tsx |
| aria-hidden焦点 | 全局MutationObserver自动blur | App.tsx |
| 重型定时器 | 1秒tick → React.memo + CSS动画 | AgentActivityPanel/index.tsx, .css |
| 串行请求 | forEach+setTimeout → 5行/批 | StyleProcessTab.tsx |

### 验证结果

| 指标 | 结果 |
|------|------|
| 前端 tsc --noEmit | 0 errors ✅ |
| 后端 mvn compile | BUILD SUCCESS ✅ |
| P0铁律检查 | 全部通过 ✅ |
| 业务逻辑变更 | 零 ✅ |

### 已知问题（待优化，按优先级）

### P1性能（1项 — 下一迭代）
1. 订单列表查询无缓存（enrichment 8步N+1风险）

### P2（5项 — 2周内）
1. @Version与手写原子SQL混用风险
2. vendor-react-antd chunk过大（建议拆分为3个子chunk）
3. cutting-task/by-style-no 旧式端点
4. platform-connector/save-config 旧式端点
5. 前端硬编码颜色值约555处可安全替换

### P2代码规范
1. BargainPrice/EmployeeAdvance状态流转端点应改为 POST /{id}/stage-action
2. t_bargain_price/t_employee_advance未注册到DbColumnDefinitions/DbTableDefinitions
3. Service层@Transactional违规仍有约20处

### P2数据一致性（审计发现，非紧急）
1. FactoryShipmentDetailServiceImpl退货数量read-modify-write
2. CronSchedulerService计数read-modify-write（synchronized仅单JVM有效）
3. KnowledgeSearchTool浏览量read-modify-write
4. ProductSkuServiceImpl.updateStock使用REQUIRES_NEW（外层回滚时SKU已提交）

## 下一步

- 性能优化P1：订单列表查询添加Redis缓存
- RESTful迁移第二批（cutting-task/by-style-no等）
- vendor-react-antd chunk拆分
- 前端硬编码颜色值分批替换
