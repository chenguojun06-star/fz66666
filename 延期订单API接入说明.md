# 延期订单API接入说明

## ✅ 已完成内容

### 1. 后端API实现
**端点**: `GET /api/dashboard/overdue-orders`

**Controller**: `DashboardController.java`
```java
@GetMapping("/overdue-orders")
@PreAuthorize("hasAuthority('MENU_DASHBOARD_VIEW')")
public Result<?> overdueOrders() {
    return Result.success(dashboardOrchestrator.getOverdueOrders());
}
```

**业务逻辑**: `DashboardOrchestrator.java`
- 查询所有延期订单（交货日期 < 今天 且 未完成）
- 计算延期天数（当前日期 - 计划交货日期）
- 按交货日期升序排序

**数据查询**: `DashboardQueryServiceImpl.java`
```java
public List<ProductionOrder> listAllOverdueOrders() {
    LocalDateTime now = LocalDateTime.now();
    return productionOrderService.lambdaQuery()
            .eq(ProductionOrder::getDeleteFlag, 0)
            .lt(ProductionOrder::getPlannedEndDate, now)
            .ne(ProductionOrder::getStatus, "completed")
            .ne(ProductionOrder::getStatus, "cancelled")
            .orderByAsc(ProductionOrder::getPlannedEndDate)
            .list();
}
```

### 2. 前端组件实现
**组件**: `OverdueOrderTable/index.tsx`

**功能**:
- ✅ 自动加载延期订单数据
- ✅ 支持交货日期排序
- ✅ 支持延期天数排序
- ✅ 分页显示（每页10条）
- ✅ 加载状态显示
- ✅ 错误处理（显示空列表）

**数据结构**:
```typescript
interface OverdueOrder {
  id: number;
  orderNo: string;      // 订单号
  styleNo: string;      // 款号
  quantity: number;     // 数量
  deliveryDate: string; // 交货日期（YYYY-MM-DD）
  overdueDays: number;  // 延期天数
}
```

### 3. API调用逻辑
```typescript
const loadData = async () => {
  setLoading(true);
  try {
    const result = await api.get('/dashboard/overdue-orders');
    if (Array.isArray(result)) {
      setDataSource(result);
    } else {
      setDataSource([]);
    }
  } catch (error) {
    console.error('Failed to load overdue orders:', error);
    setDataSource([]);
  } finally {
    setLoading(false);
  }
};
```

## 🔄 数据流

```
生产订单表 (t_production_order)
    ↓
DashboardQueryService.listAllOverdueOrders()
    ↓ 筛选条件：
    - planned_end_date < NOW()
    - status != 'completed'
    - status != 'cancelled'
    - delete_flag = 0
    ↓
DashboardOrchestrator.getOverdueOrders()
    ↓ 计算：
    - overdueDays = DAYS(NOW() - planned_end_date)
    ↓
Controller /api/dashboard/overdue-orders
    ↓
前端 OverdueOrderTable 组件
    ↓
仪表盘首页展示
```

## 📊 显示逻辑

### 延期天数计算
```java
long days = ChronoUnit.DAYS.between(order.getPlannedEndDate(), now);
dto.setOverdueDays((int) Math.max(0, days));
```

### 排序功能
- **交货日期排序**: 按日期升序/降序
- **延期天数排序**: 按天数升序/降序
- **三态排序**: 升序 → 降序 → 取消排序

## 🎯 权限控制

**所需权限**: `MENU_DASHBOARD_VIEW`

**注解**: 
```java
@PreAuthorize("hasAuthority('MENU_DASHBOARD_VIEW')")
```

## 📝 测试方法

### 1. API测试
```bash
# 运行测试脚本
./test-overdue-orders-api.sh
```

### 2. 前端测试
1. 访问仪表盘首页
2. 查看"延期订单列表"卡片
3. 验证数据加载
4. 测试排序功能
5. 测试分页功能

## 🔍 数据示例

### API响应
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "abc123",
      "orderNo": "PO2026010001",
      "styleNo": "ST095",
      "quantity": 979,
      "deliveryDate": "2026-01-05",
      "overdueDays": 12
    }
  ]
}
```

### 前端展示
| 订单号 | 款号 | 数量 | 交货日期 | 延期天数 |
|--------|------|------|----------|----------|
| PO2026010001 | ST095 | 979 | 2026-01-05 | 12 天 |

## ⚠️ 注意事项

1. **无虚拟数据**: 已移除mock数据逻辑，只使用真实数据
2. **空数据处理**: API返回空数组时正常显示"暂无数据"
3. **错误处理**: 网络错误时显示空列表，不影响用户体验
4. **权限验证**: 需要MENU_DASHBOARD_VIEW权限才能访问
5. **性能优化**: 按交货日期升序排序，最近延期的订单优先显示

## 🚀 部署检查清单

- [x] 后端API实现
- [x] 权限注解添加
- [x] 前端组件实现
- [x] API调用集成
- [x] 错误处理
- [x] 排序功能
- [x] 分页功能
- [x] 移除虚拟数据
- [x] 代码编译通过
- [ ] 后端重启验证
- [ ] 前端界面测试

## 📌 相关文件

### 后端
- `backend/src/main/java/com/fashion/supplychain/dashboard/controller/DashboardController.java`
- `backend/src/main/java/com/fashion/supplychain/dashboard/orchestration/DashboardOrchestrator.java`
- `backend/src/main/java/com/fashion/supplychain/dashboard/service/impl/DashboardQueryServiceImpl.java`

### 前端
- `frontend/src/modules/dashboard/components/OverdueOrderTable/index.tsx`
- `frontend/src/modules/dashboard/pages/Dashboard/index.tsx`

### 测试
- `test-overdue-orders-api.sh`
