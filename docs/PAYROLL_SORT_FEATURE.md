# 工资排序功能说明

## 功能概述
在电脑端和小程序端的工资汇总页面，添加了按总金额排序的功能，方便管理员和员工快速查看工资排行。

## 电脑端实现

### 功能位置
**页面路径**：`frontend/src/pages/Finance/PayrollOperatorSummary.tsx`  
**标签页**：工资汇总

### 使用方法
1. 进入"财务管理 → 员工工序"页面
2. 切换到"工资汇总"标签页
3. 点击表头的"总金额(元)"列，会显示排序图标：
   - 🔽 **降序**（默认）：工资从高到低排列
   - 🔼 **升序**：工资从低到高排列
4. 每次点击切换排序方向

### 视觉效果
- 排序图标使用蓝色三角形
- 列标题可点击，鼠标悬停有手型指针提示
- 实时排序，无需刷新页面

### 代码实现
```typescript
// 状态管理
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

// 列定义中的排序图标
title: (
  <div onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}>
    <span>总金额(元)</span>
    {sortOrder === 'desc' ? <CaretDownOutlined /> : <CaretUpOutlined />}
  </div>
)

// 数据排序逻辑
result.sort((a, b) => {
  if (sortOrder === 'desc') {
    return b.totalAmount - a.totalAmount; // 降序
  } else {
    return a.totalAmount - b.totalAmount; // 升序
  }
});
```

---

## 小程序端实现

### 功能位置
**页面路径**：`miniprogram/pages/payroll/`
**功能标题**：工序明细

### 使用方法
1. 进入小程序"工资"页面
2. 在"【工序明细】"标题右侧，有"按金额"按钮
3. 点击切换排序：
   - **▼ 降序**（默认）：金额从高到低
   - **▲ 升序**：金额从低到高
4. 明细列表实时重新排序

### 视觉效果
- 排序按钮采用浅蓝色背景（`var(--color-primary-light)`）
- 三角形图标根据当前排序状态显示
- 按钮位于明细标题右侧，清晰可见

### 代码实现
```javascript
// 状态管理
data: {
  sortOrder: 'desc', // desc:降序, asc:升序
}

// 切换排序函数
toggleSort() {
  const newSortOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc';
  this.setData({ sortOrder: newSortOrder }, () => {
    let records = [...this.data.records];
    records.sort((a, b) => {
      if (newSortOrder === 'desc') {
        return b.totalAmountNum - a.totalAmountNum;
      } else {
        return a.totalAmountNum - b.totalAmountNum;
      }
    });
    this.setData({ records });
  });
}
```

```xml
<!-- WXML 模板 -->
<view class="section-header">
  <view class="section-title">【工序明细】</view>
  <view class="sort-btn" bindtap="toggleSort">
    <text class="sort-text">按金额</text>
    <text class="sort-icon">{{sortOrder === 'desc' ? '▼' : '▲'}}</text>
  </view>
</view>
```

---

## 管理员权限说明

### 数据权限控制
后端已实现基于角色的数据权限过滤（`DataPermissionHelper`）：

| 角色 | 数据范围 | 说明 |
|-----|---------|------|
| **管理员** | `dataScope=all` | 可查看所有人员的工资数据 |
| **组长** | `dataScope=team` | 可查看团队成员的工资数据 |
| **普通员工** | `dataScope=own` | 只能查看自己的工资数据 |

### 实现位置
**后端代码**：`backend/src/main/java/com/fashion/supplychain/finance/orchestration/PayrollAggregationOrchestrator.java`

```java
// Line 73: 应用数据权限过滤
DataPermissionHelper.applyOperatorFilter(qw, "operator_id", "operator_name");
```

### 应用程序接口
**接口路径**：`POST /finance/payroll-settlement/operator-summary`  
**权限要求**：`MENU_PAYROLL_OPERATOR_SUMMARY`

**请求参数**：
```json
{
  "orderNo": "PO20260122001",      // 可选
  "operatorName": "张三",           // 可选
  "processName": "做领",            // 可选
  "startTime": "2026-01-01 00:00:00",  // 可选
  "endTime": "2026-01-31 23:59:59",    // 可选
  "includeSettled": true           // 默认true
}
```

**返回数据**：
- 管理员：返回所有人员的工资汇总
- 组长：返回团队成员的工资汇总
- 普通员工：只返回自己的工资记录

---

## 测试步骤

### 电脑端测试
1. 使用管理员账号登录
2. 进入"财务管理 → 员工工序"
3. 切换到"工资汇总"Tab
4. 点击"总金额(元)"列头多次，观察排序变化
5. 验证数据从高到低、从低到高正确排序

### 小程序端测试
1. 登录小程序（员工账号或管理员账号）
2. 进入"工资"页面
3. 查看本月工资统计卡片
4. 点击"按金额"按钮多次
5. 验证工序明细按金额正确排序

### 权限测试
1. **管理员账号**：查询时应看到所有人员的工资数据
2. **普通员工账号**：查询时只能看到自己的工资记录
3. 验证PC端和小程序端数据一致

---

## 技术要点

### 排序稳定性
- 使用 JavaScript 原生 `Array.sort()` 方法
- 金额比较采用数值类型（不是字符串）
- 确保排序结果稳定可预测

### 性能优化
- 排序在前端内存中进行，无需重新请求后端
- 使用缓存机制优化排序结果（电脑端）
- 小程序端排序数据量较小，性能良好

### 用户体验
- 默认降序（高到低），符合查看工资排行的习惯
- 点击图标即时响应，无延迟
- 视觉反馈明确（图标方向变化）

---

## 文件变更清单

### 电脑端
- ✅ `frontend/src/pages/Finance/PayrollOperatorSummary.tsx`
  - 新增：`sortOrder` 状态（第32行）
  - 修改：`summaryRows` 排序逻辑（第84-96行）
  - 修改：总金额列添加排序图标（第307-325行）

### 小程序端
- ✅ `miniprogram/pages/payroll/payroll.js`
  - 新增：`sortOrder` 状态（第22行）
  - 修改：`processData` 排序逻辑（第169-178行）
  - 新增：`toggleSort` 方法（第185-199行）

- ✅ `miniprogram/pages/payroll/payroll.wxml`
  - 修改：添加排序按钮（第53-59行）

- ✅ `miniprogram/pages/payroll/payroll.wxss`
  - 新增：`.section-header` 样式（第116-120行）
  - 新增：`.sort-btn` 样式（第128-140行）

---

*最后更新：2026-01-24*  
*实现者：系统*
