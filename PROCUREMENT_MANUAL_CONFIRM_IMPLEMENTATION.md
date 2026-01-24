# 采购手动确认功能实现说明

## 功能概述

实现了采购物料差异容错机制，允许在物料到货率达到50%-99%之间时，通过人工确认的方式完成采购阶段，进入下一生产阶段。

## 业务规则

1. **物料到货率 < 50%**：不允许确认，必须继续采购
2. **物料到货率 ≥ 50%**：允许人工确认"回料完成"（需填写备注说明物料到货情况，至少10个字符）
   - 无论是50%、80%还是100%，都需要人工点击确认
   - 不会自动进入下一阶段，必须人为操作

## 实现内容

### 1. 数据库更改 ✅

**文件**: `scripts/add_procurement_manual_confirm.sql`

添加了5个新字段到 `t_production_order` 表：

```sql
- procurement_manually_completed TINYINT DEFAULT 0  -- 是否手动确认完成（0=未确认, 1=已确认）
- procurement_confirmed_by VARCHAR(50)               -- 确认人ID
- procurement_confirmed_by_name VARCHAR(100)         -- 确认人姓名
- procurement_confirmed_at DATETIME                  -- 确认时间
- procurement_confirm_remark VARCHAR(500)            -- 确认备注（说明原因）
```

**执行状态**: ✅ 已执行成功（已验证字段存在）

### 2. 实体类更新 ✅

**文件**: `backend/src/main/java/com/fashion/supplychain/production/entity/ProductionOrder.java`

在第97行后添加了5个新属性：
- `procurementManuallyCompleted` (Integer)
- `procurementConfirmedBy` (String)
- `procurementConfirmedByName` (String)
- `procurementConfirmedAt` (LocalDateTime)
- `procurementConfirmRemark` (String)

**编译状态**: ✅ 编译成功

### 3. 业务逻辑更新 ✅

#### 3.1 查询服务 (ProductionOrderQueryService.java)

修改了3处业务逻辑：

**位置1 - currentProcessName判断（第725-773行）**：
- 当 `procurementManuallyCompleted=1` 时，即使物料到货率<100%，也允许进入下一阶段
- 条件：`materialArrivalRate >= 50 && procurementManuallyCompleted == 1`

**位置2 - 采购开始时间显示（第1003-1048行）**：
- 只有在 `materialArrivalRate=100` 或 `(materialArrivalRate>=50 && procurementManuallyCompleted==1)` 时才显示采购完成时间
- 如果是手动确认，使用 `procurementConfirmedAt` 作为完成时间

**位置3 - 采购时间戳格式化（第1334-1379行）**：
- 同上逻辑，处理时间戳显示

**编译状态**: ✅ 编译成功

#### 3.2 业务编排服务 (ProductionOrderOrchestrator.java)

**新增方法**: `confirmProcurement(String orderId, String remark)`

功能：
1. 验证订单是否存在
2. 检查物料到货率是否在50%-99%范围内
3. 验证备注长度（至少10个字符）
4. 检查是否已确认过
5. 更新确认信息（设置确认标志、记录操作人、时间、备注）
6. 记录操作日志到扫码记录表
7. 返回更新后的订单详情

**编译状态**: ✅ 编译成功

### 4. API接口 ✅

**文件**: `backend/src/main/java/com/fashion/supplychain/production/controller/ProductionOrderController.java`

**新增端点**: `POST /api/production/order/confirm-procurement`

**请求参数**:
```json
{
  "id": "订单ID",
  "remark": "确认备注（至少10个字符）"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {订单详情}
}
```

**错误响应示例**:
- 400: 物料到货率不足50%
- 400: 物料到货率已达100%（无需确认）
- 400: 备注太短（少于10个字符）
- 400: 已确认过，无需重复确认
- 404: 订单不存在

**编译状态**: ✅ 编译成功

### 5. 测试脚本 ✅

**文件**: `scripts/test-procurement-manual-confirm.sh`

功能：
1. 查询订单详情，检查物料到货率
2. 调用确认API
3. 验证确认状态
4. 检查订单当前工序

**使用方法**:
```bash
# 编辑脚本，设置TOKEN和ORDER_ID
vim scripts/test-procurement-manual-confirm.sh

# 执行测试
./scripts/test-procurement-manual-confirm.sh
```

## 部署步骤

### 1. 数据库迁移
```bash
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < scripts/add_procurement_manual_confirm.sql
```
**状态**: ✅ 已完成

### 2. 后端编译
```bash
cd backend
mvn clean compile -DskipTests
```
**状态**: ✅ 已完成（编译成功）

### 3. 后端重启
```bash
./dev-public.sh
```
**状态**: 🔄 正在启动（等待完全启动）

## 前端集成待办

### PC端（React）

需要在订单列表页面添加"确认采购完成"按钮：

**显示条件**:
- `materialArrivalRate >= 50`
- `procurementManuallyCompleted !== 1`
- `currentProcessName === '采购'`

**交互流程**:
1. 点击按钮弹出Modal对话框
2. 输入确认备注（TextArea，至少10个字符）
3. 调用API：`POST /api/production/order/confirm-procurement`
4. 成功后刷新列表

**建议位置**: 
- `frontend/src/pages/Production/Orders.tsx` （订单列表页）
- 在操作列添加按钮

### 小程序端

需要在工作台页面添加确认功能：

**显示条件**: 同PC端

**交互流程**:
1. 显示"确认采购完成"按钮
2. 点击弹出输入框（wx.showModal）
3. 输入确认备注
4. 调用API：`POST /api/production/order/confirm-procurement`
5. 成功后刷新页面

**建议位置**:
- `miniprogram/pages/work/index.wxml` （工作台）
- 在订单详情卡片中添加按钮

## 测试检查点

### 功能测试
- [ ] 物料到货率<50%时，调用API应返回错误
- [ ] 物料到货率≥50%时（包括100%），调用API应成功
- [ ] 备注少于10个字符时，应返回错误
- [ ] 重复确认应返回错误
- [ ] 确认后，订单应能进入下一阶段（裁剪）
- [ ] 验证100%物料到货率也需要人工确认（不会自动通过）

### 数据验证
- [ ] 确认后，`procurement_manually_completed` 应为1
- [ ] `procurement_confirmed_by` 应记录操作人ID
- [ ] `procurement_confirmed_by_name` 应记录操作人姓名
- [ ] `procurement_confirmed_at` 应记录确认时间
- [ ] `procurement_confirm_remark` 应保存备注内容

### 权限测试
- [ ] 不同角色用户均可确认（当前无角色限制）
- [ ] 确认操作应记录到扫码日志表

## 相关文档

- **业务流程**: `WORKFLOW_EXPLANATION.md`
- **快速测试**: `QUICK_TEST_GUIDE.md`
- **开发指南**: `DEVELOPMENT_GUIDE.md`

## 回滚方案

如需回滚此功能：

```bash
# 1. 删除数据库字段
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain << EOF
ALTER TABLE t_production_order 
  DROP COLUMN procurement_manually_completed,
  DROP COLUMN procurement_confirmed_by,
  DROP COLUMN procurement_confirmed_by_name,
  DROP COLUMN procurement_confirmed_at,
  DROP COLUMN procurement_confirm_remark;
EOF

# 2. 回滚代码
git revert <commit-hash>

# 3. 重启后端
./dev-public.sh
```

## 开发者备注

- **实现日期**: 2026-01-24
- **Git提交**: 待提交
- **代码审查**: 待审查
- **功能测试**: 待测试

---

*最后更新: 2026-01-24 14:10*
