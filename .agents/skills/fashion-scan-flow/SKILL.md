---
name: fashion-scan-flow
description: 服装供应链扫码 MES 系统的核心业务流。当涉及扫码（工序/质检/入库）、进度节点流转、裁剪分菲、SKU 处理、防重复扫码、质检次品处理、物料采购入库时使用。改 ScanRecord/ScanExecutor/stageSupport/质检/入库相关代码前必读。
version: 1.0.0
---

# 扫码 MES 业务流 — 核心铁律

> 本 skill 浓缩自 `业务流程说明.md` + `docs/扫码和SKU系统完整指南.md`。

## 1. 业务主链路（6 大父进度节点）

```
采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库
```

子工序映射优先级：模板 `progressStage` > `t_process_parent_mapping` DB > 兜底默认

**P0 铁律**：跨父节点扫码前，必须完成上一父节点全部子工序；同父节点内可自由流转。

## 2. SKU 三维体系（三端统一）

```
SKU = 款号 + 颜色 + 尺码
```

- 小程序 / H5 / PC **三端共享同一 SKU 定义**
- 二维码内容格式：
  - 飞码格式：`PO订单号-ST款号-颜色-尺码-数量-扎号`（如 `PO123-ST456-红色-M-100-1`）
  - URL 格式：`orderNo?styleNo=xxx&color=xxx&size=xxx&quantity=100`
- 解析入口：小程序 `parseScanContent()` / 后端 `SKUProcessor`

## 3. 扫码主流程（小程序侧）

```
用户点击扫码
  ↓
[启用自动识别?]
  ├─ YES → 查订单详情 → detectNextStage() 自动选下一节点
  └─ NO  → 用手动选的节点
  ↓
wx.scanCode 扫码
  ↓
parseScanContent() 解析二维码（订单号/款号/颜色/尺码/数量/扎号）
  ↓
openScanConfirm() 弹窗 + 15秒倒计时
  ↓
用户确认
  ↓
executeScanConfirm()
  ├─ 采购类型? → receivePurchases() + reminderManager.addReminder()
  └─ 其他      → api.production.executeScan() + [质检? → addReminder()]
```

### 自动识别下一节点（detectNextStage）
```
stages = ['采购','裁剪','缝制','车缝','大烫','质检','包装','入库']
当前 progress → 返回 stages[index + 1]
```
- 当前"缝制" → 自动识别"车缝"
- 当前"车缝" → 自动识别"大烫"

## 4. 扫码执行器（后端侧）

| 执行器 | 职责 | 核心表 |
|--------|------|--------|
| `ProductionScanExecutor` | 工序扫码：工序识别 + 库存回滚 | t_scan_record, t_material_stock |
| `QualityScanExecutor` | 质检扫码 | t_scan_record, t_quality_check |
| `WarehouseScanExecutor` | 入库扫码 | t_scan_record, t_inventory |

### 🚨 P0 铁律：禁止硬编码节点名
```java
// ❌ 禁止：在 Executor/Service 里硬编码
if ("车缝".equals(stage)) { ... }
if ("尾部".equals(stage)) { ... }

// ✅ 正确：统一走 ProductionScanStageSupport
stageSupport.assertStageCompleted(orderId, "SEWING");    // 车缝
stageSupport.assertStageCompleted(orderId, "TAILORING"); // 尾部
```

质检/入库**必须同时校验"车缝"与"尾部"节点已全部完成**，任一未完成则拒绝。

## 5. 防重复扫码

```javascript
// 去重键（小程序 2.5 秒窗口）
dedupKey = [scanCode, scanType, progressStage, processCode, warehouse, remark, quantity].join('|');
if (isRecentDuplicate(dedupKey)) {
  wx.showToast({ title: '已处理', icon: 'none' });
  return;
}
```

## 6. 质检处理流程

```
扫码（scanType='quality'）→ qualityResult='pending'（待质检）
  ↓
扫码记录显示"质检 - 待处理"（橙色标签）
  ↓
用户点"处理" → 质检结果弹窗
  ├─ 合格 → submitQualityResult(qualityResult='qualified')
  └─ 次品 → 填：次品数量/问题类型(多选)/处理方式(返修/报废)/备注
  ↓
reminderManager.removeRemindersByOrder() + 刷新
```

## 7. 物料采购流程

```
扫码（progressStage='采购'）
  ↓
getMaterialPurchases({scanCode, orderNo})
  ↓
弹窗显示所有面辅料（物料名/需求量/采购量/备注）
  ↓
用户确认 → receivePurchases()（领取采购任务）
  ↓
稍后点"处理" → 采购处理弹窗 → 填实际采购量
  ↓
updateArrivedQuantity()（循环更新每个物料）+ 移除提醒
```

## 8. 提醒系统（10 小时间隔）

```javascript
reminderManager.addReminder({orderId, type: '质检'|'采购', timestamp});
// 本地存储 wx.setStorageSync('reminders', list)
// 超过 10 小时未处理 → checkAndShowReminders() 弹窗 + 首页红点
```

## 9. 关键 API

| 端点 | 用途 |
|------|------|
| `POST /api/production/scan/execute` | 提交扫码 |
| `POST /api/production/scan/submit-quality-result` | 提交质检结果 |
| `POST /api/production/purchase/update-arrived-quantity` | 更新采购到货量 |
| `GET /api/production/scan/my-history` | 个人扫码历史（分页）|

## 10. 改扫码代码前自检

- [ ] 涉及节点判断？→ 用 `ProductionScanStageSupport`，禁止硬编码"车缝"/"尾部"
- [ ] 涉及质检/入库？→ 必须校验"车缝"+"尾部"都完成
- [ ] 涉及 SKU？→ 款号+颜色+尺码三维，三端共享
- [ ] 涉及防重？→ 用 dedupKey（2.5 秒窗口）
- [ ] 涉及提醒？→ 质检/采购领取要 addReminder，完成要 removeRemindersByOrder
- [ ] 涉及事务？→ @Transactional 放 Orchestrator（ScanRecordOrchestrator），不放 Executor/Service
