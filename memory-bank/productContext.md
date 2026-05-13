# 产品上下文 — 服装供应链管理系统

> 本文件由 AI 助手自动维护，记录产品的核心架构与业务模型
> 最后更新：2026-05-12

---

## 一、产品定位

服装行业多租户 SaaS 供应链管理平台，覆盖从款式开发→下单→采购→裁剪→二次工艺→车缝→尾部→入库→发货→财务结算的全链路。

## 二、技术栈

| 层 | 技术 |
|----|------|
| 后端 | Spring Boot 3.4.5 + MyBatis-Plus + MySQL 8.0 (Docker 3308) |
| 前端 | React 18 + TypeScript + Ant Design 5.22 + Vite |
| 小程序 | 微信原生 + 共享 `miniprogram/shared/` 模块 |
| H5 | React + Vite（供应商/CRM客户端） |
| Flutter | Flutter App（规划中） |
| 缓存 | Redis (Lettuce) |
| 消息 | WebSocket + STOMP |
| AI | 小云AI（SSE流式对话 + 多Agent编排） |
| 部署 | 腾讯云 CloudBase + GitHub Actions CI/CD |

## 三、核心业务模块

| 模块 | 关键实体 | 核心流程 |
|------|---------|---------|
| 款式管理 | StyleInfo, StyleBom | 款式创建→BOM生成→选品 |
| 生产订单 | ProductionOrder | 下单→工序分配→进度跟踪→完工 |
| 物料管理 | MaterialPurchase, MaterialStock | 采购→入库→领料→退料 |
| 裁剪管理 | CuttingTask, CuttingBundle | 裁剪任务→扎捆→扫码 |
| 扫码系统 | ScanRecord | 生产扫码→质检扫码→入库扫码 |
| 入库管理 | ProductWarehousing | 成品入库→订单联动 |
| 财务管理 | WagePayment, ShipmentReconciliation | 工资结算→发货对账 |
| 智能系统 | AiAgentOrchestrator | 小云AI→工具调用→巡检→自进化 |

## 四、架构分层（铁律）

```
Controller → Orchestrator（事务边界）→ Service → Mapper
                ↓
          Helper/Resolver（无状态工具）
```

- Orchestrator：唯一事务边界，编排多个 Service
- Service：纯业务逻辑，禁止互调，禁止 @Transactional
- Helper/Resolver：无状态工具类，从 Orchestrator/Service 拆薄而来

## 五、6大父进度节点

采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库

子工序映射优先级：模板 `progressStage` > `t_process_parent_mapping` DB > 兜底

## 六、多租户隔离

- 所有查询必须带 tenant_id
- 工厂工人只能看自己工厂数据
- `TenantAssert.requireTenantId()` 关键路径强制调用

## 七、AI 智能体架构

| 组件 | 职责 |
|------|------|
| AiAgentOrchestrator | 主编排器，快速通道 vs Agent循环 |
| AgentLoopEngine | Agent循环引擎，工具调用 |
| SelfCriticService | 5维度自动评分 |
| DataTruthGuard | 5级数据验证 |
| QuickPathQualityGate | 快速通道质量门 |
| RealTimeLearningLoop | 实时学习闭环 |
| DynamicFollowUpEngine | 动态FollowUp建议 |
| SmartRemarkAgent | 巡检备注智能生成 |

## 八、部署架构

- 后端：腾讯云 CloudBase（Docker）
- 前端：腾讯云 CDN + nginx SPA
- 数据库：Docker MySQL 8.0 (端口3308)
- CI/CD：GitHub Actions → 自动部署
