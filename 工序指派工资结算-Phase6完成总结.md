# 工序指派工资结算 - Phase 6 实施总结

> **完成时间**: 2026-01-31 03:22  
> **状态**: ✅ 数据库迁移完成，后端编译成功

## 🎯 需求背景

**问题**：工序指派给别人后，工资结算应该算给谁？
- 如果指派给**内部有账号的员工** → 工资算给被指派人
- 如果指派给**外部工厂（无账号）** → 不计入内部工资，单独对账

## ✅ 已完成工作

### 1. 数据库迁移 ✅

**新增字段**（5个）：
```sql
delegate_target_type     -- 指派类型: internal/external/none
delegate_target_id       -- 指派目标ID（员工ID或工厂ID）
delegate_target_name     -- 指派目标名称
actual_operator_id       -- 实际操作员ID（谁扫的码）
actual_operator_name     -- 实际操作员名称
```

**迁移结果**：
- ✅ 46条扫码记录成功迁移
- ✅ 所有现有记录标记为 `delegate_target_type = 'none'`
- ✅ 索引创建成功
- ✅ 数据备份：`deployment/backups/before-delegate-migration-20260131_032219.sql`

### 2. 后端实体更新 ✅

**文件**: `backend/src/main/java/com/fashion/supplychain/production/entity/ScanRecord.java`

**新增字段**（Lombok自动生成getter/setter）：
- `private String delegateTargetType;`
- `private String delegateTargetId;`
- `private String delegateTargetName;`
- `private String actualOperatorId;`
- `private String actualOperatorName;`

**编译状态**: ✅ BUILD SUCCESS (2026-01-31 03:22:40)

### 3. 文档资料 ✅

已创建完整方案文档：
- `docs/工序指派工资结算方案.md` - 完整设计文档
- `scripts/migration-add-delegate-fields.sql` - SQL迁移脚本
- `scripts/migrate-delegate-fields.sh` - 便捷执行脚本

## 🚧 待实施功能

### 1. 后端业务逻辑（优先级：P0）

**需要修改的文件**：
- [ ] `ScanRecordOrchestrator.java` - 扫码时记录指派信息
- [ ] `ProductionOrderOrchestrator.java` - 完善 `delegateProcess` 方法
- [ ] `PayrollAggregationOrchestrator.java` - 工资查询过滤外发记录

**核心逻辑**：
```java
// 扫码时判断工序是否被指派
if (delegateInfo != null) {
    if ("internal".equals(delegateInfo.getType())) {
        record.setOperatorId(delegateInfo.getTargetId());  // 工资算给被指派人
    } else if ("external".equals(delegateInfo.getType())) {
        record.setOperatorId(null);  // 不计入内部工资
    }
}
```

### 2. 前端指派界面（优先级：P1）

**需要修改的文件**：
- [ ] `NodeDetailModal.tsx` - 增加指派目标类型选择
- [ ] `Production/List/index.tsx` - 指派API调用
- [ ] `PayrollOperatorSummary/index.tsx` - 显示指派信息列

**UI改造**：
```typescript
// 指派弹窗增加
<Select placeholder="指派类型">
  <Option value="internal">内部员工</Option>
  <Option value="external">外部工厂</Option>
</Select>

// 如果选择internal，显示员工选择器
{delegateType === 'internal' && (
  <Select placeholder="选择员工" showSearch />
)}
```

### 3. 外发对账功能（优先级：P2）

**新增接口**：
- [ ] `GET /finance/external-delegate-summary` - 外发工序对账汇总
- [ ] 按工厂统计外发成本
- [ ] 生成外发对账单

**查询逻辑**：
```sql
SELECT 
    delegate_target_name AS '外发工厂',
    SUM(quantity) AS '总数量',
    SUM(scan_cost) AS '应付金额'
FROM t_scan_record
WHERE delegate_target_type = 'external'
GROUP BY delegate_target_name;
```

## 📊 数据结构示例

### 场景1：内部指派（李四有账号）
```json
{
  "operator_id": "user_123",           // 工资算给李四 ✅
  "operator_name": "李四",
  "delegate_target_type": "internal",
  "delegate_target_id": "user_123",
  "delegate_target_name": "李四",
  "actual_operator_id": "user_123",
  "actual_operator_name": "李四",
  "unit_price": 3.50,
  "quantity": 100,
  "scan_cost": 350.00
}
```

### 场景2：外部指派（佳利工厂无账号）
```json
{
  "operator_id": null,                  // 不计入内部工资 ✅
  "operator_name": "佳利工厂（外发）",
  "delegate_target_type": "external",
  "delegate_target_id": "factory_456",
  "delegate_target_name": "佳利工厂",
  "actual_operator_id": "user_001",     // 张三代扫的
  "actual_operator_name": "张三",
  "unit_price": 5.00,
  "quantity": 100,
  "scan_cost": 500.00                   // 外发成本
}
```

### 场景3：未指派（自己完成）
```json
{
  "operator_id": "user_001",            // 工资算给张三 ✅
  "operator_name": "张三",
  "delegate_target_type": "none",
  "delegate_target_id": null,
  "delegate_target_name": null,
  "actual_operator_id": "user_001",
  "actual_operator_name": "张三",
  "unit_price": 2.00,
  "quantity": 200,
  "scan_cost": 400.00
}
```

## 🔍 验证检查清单

### 数据库验证 ✅
```bash
# 检查字段是否创建
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain \
  -e "SHOW COLUMNS FROM t_scan_record LIKE 'delegate%';"

# 检查现有数据
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain \
  -e "SELECT delegate_target_type, COUNT(*) FROM t_scan_record GROUP BY delegate_target_type;"
```

### 后端验证
```bash
# 启动后端查看日志
cd backend && mvn spring-boot:run

# 检查实体类加载
curl http://localhost:8080/actuator/health
```

### 前端验证（待实施后）
- [ ] 指派弹窗显示内部/外部选项
- [ ] 选择内部员工，扫码后工资算给被指派人
- [ ] 选择外部工厂，工资统计页面不显示该记录
- [ ] 外发对账页面显示外部工厂成本

## 📝 下一步计划

### 立即执行（今天）
1. **重启后端服务**：`./start-backend.sh` 或 `cd backend && mvn spring-boot:run`
2. **实施扫码逻辑**：修改 `ScanRecordOrchestrator.java`
3. **测试数据写入**：创建一条内部指派记录，验证 `operator_id` 正确

### 本周完成
1. **前端指派UI**：修改 `NodeDetailModal.tsx`
2. **工资页面优化**：显示指派信息列
3. **外发对账功能**：新增外发统计接口

### 验收标准
- ✅ 内部指派：工资算给被指派人
- ✅ 外部指派：不计入内部工资，有独立对账单
- ✅ 追溯功能：可以查看谁实际扫的码
- ✅ 数据完整：所有指派记录可追溯

## 🎉 成果

- **数据库字段**：5个新字段 + 3个索引
- **迁移记录**：46条历史记录成功迁移
- **代码编译**：✅ 无错误
- **备份安全**：✅ 自动备份到 `deployment/backups/`

---

**相关文档**：
- 完整方案：`docs/工序指派工资结算方案.md`
- SQL脚本：`scripts/migration-add-delegate-fields.sql`
- 执行脚本：`scripts/migrate-delegate-fields.sh`
