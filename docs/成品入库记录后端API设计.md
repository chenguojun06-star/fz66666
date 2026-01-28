# 成品入库记录后端API设计文档

**创建时间**: 2026-01-29  
**模块**: 成品仓库管理  
**版本**: v1.0

---

## 📋 功能概述

为成品仓库添加入库记录查询功能，用户可以查看指定款号或订单的所有入库历史记录，包括入库时间、数量、操作人等详细信息。

---

## 🗄️ 数据库设计

### 表结构：t_finished_inbound_history

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT | 主键ID | PRIMARY |
| inbound_no | VARCHAR(50) | 入库单号 | INDEX |
| quality_inspection_no | VARCHAR(50) | 质检入库号 | INDEX |
| style_no | VARCHAR(100) | 款号 | INDEX |
| order_no | VARCHAR(50) | 订单号 | INDEX |
| color | VARCHAR(50) | 颜色 | - |
| size | VARCHAR(20) | 尺码 | - |
| quantity | INT | 入库数量 | - |
| warehouse_location | VARCHAR(50) | 仓库位置（库位号） | - |
| operator | VARCHAR(100) | 操作人 | - |
| inbound_date | DATETIME | 入库时间 | INDEX |
| remark | TEXT | 备注 | - |
| created_at | DATETIME | 创建时间 | - |
| updated_at | DATETIME | 更新时间 | - |
| delete_flag | TINYINT | 删除标记 | INDEX |

### 与现有表的关联

```sql
-- 关联质检入库表
t_finished_inbound_history.quality_inspection_no → t_quality_inspection.quality_inspection_no

-- 关联订单表
t_finished_inbound_history.order_no → t_production_order.order_no

-- 关联款式表
t_finished_inbound_history.style_no → t_style.style_no
```

---

## 🔌 API 接口设计

### 1. 获取入库历史记录列表

**接口路径**: `GET /api/warehouse/finished/inbound-history`

**请求参数**:
```json
{
  "styleNo": "ST001",           // 可选，款号
  "orderNo": "PO20260120001",   // 可选，订单号
  "color": "黑色",              // 可选，颜色
  "size": "L",                  // 可选，尺码
  "startDate": "2026-01-01",    // 可选，开始日期
  "endDate": "2026-01-31",      // 可选，结束日期
  "pageNum": 1,                 // 页码，默认1
  "pageSize": 10                // 每页条数，默认10
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "records": [
      {
        "id": 1,
        "inboundNo": "IB20260126001",
        "qualityInspectionNo": "QC20260126001",
        "styleNo": "ST001",
        "orderNo": "PO20260120001",
        "color": "黑色",
        "size": "L",
        "quantity": 500,
        "warehouseLocation": "C-01-01",
        "operator": "张三",
        "inboundDate": "2026-01-26 10:30:00",
        "remark": "首次入库"
      }
    ],
    "summary": {
      "totalRecords": 2,
      "totalQuantity": 800
    },
    "total": 2,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

### 2. 获取款号入库汇总统计

**接口路径**: `GET /api/warehouse/finished/inbound-summary`

**请求参数**:
```json
{
  "styleNo": "ST001"  // 必填，款号
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "styleNo": "ST001",
    "totalInboundTimes": 5,
    "totalInboundQuantity": 2500,
    "lastInboundDate": "2026-01-26 10:30:00",
    "warehouseLocations": ["C-01-01", "C-01-02"]
  }
}
```

---

## 🏗️ 后端实现结构

### 1. Entity 实体类

**文件**: `backend/src/main/java/com/fashion/supplychain/warehouse/entity/FinishedInboundHistory.java`

```java
package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_finished_inbound_history")
public class FinishedInboundHistory {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String inboundNo;
    private String qualityInspectionNo;
    private String styleNo;
    private String orderNo;
    private String color;
    private String size;
    private Integer quantity;
    private String warehouseLocation;
    private String operator;
    private LocalDateTime inboundDate;
    private String remark;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
    
    @TableLogic
    private Integer deleteFlag;
}
```

### 2. Mapper 接口

**文件**: `backend/src/main/java/com/fashion/supplychain/warehouse/mapper/FinishedInboundHistoryMapper.java`

```java
package com.fashion.supplychain.warehouse.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.warehouse.entity.FinishedInboundHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.Map;

@Mapper
public interface FinishedInboundHistoryMapper extends BaseMapper<FinishedInboundHistory> {
    
    @Select("SELECT " +
            "COUNT(*) as totalRecords, " +
            "COALESCE(SUM(quantity), 0) as totalQuantity " +
            "FROM t_finished_inbound_history " +
            "WHERE style_no = #{styleNo} AND delete_flag = 0")
    Map<String, Object> getSummaryByStyleNo(String styleNo);
}
```

### 3. Service 服务层

**文件**: `backend/src/main/java/com/fashion/supplychain/warehouse/service/FinishedInboundHistoryService.java`

```java
package com.fashion.supplychain.warehouse.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.warehouse.entity.FinishedInboundHistory;
import java.util.Map;

public interface FinishedInboundHistoryService {
    
    /**
     * 分页查询入库历史记录
     */
    Page<FinishedInboundHistory> listInboundHistory(
        String styleNo, 
        String orderNo, 
        String color, 
        String size,
        String startDate,
        String endDate,
        Integer pageNum, 
        Integer pageSize
    );
    
    /**
     * 获取款号入库汇总统计
     */
    Map<String, Object> getSummaryByStyleNo(String styleNo);
}
```

### 4. Controller 控制器

**文件**: `backend/src/main/java/com/fashion/supplychain/warehouse/controller/FinishedInboundHistoryController.java`

```java
package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.result.Result;
import com.fashion.supplychain.warehouse.entity.FinishedInboundHistory;
import com.fashion.supplychain.warehouse.service.FinishedInboundHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/warehouse/finished")
@RequiredArgsConstructor
public class FinishedInboundHistoryController {
    
    private final FinishedInboundHistoryService inboundHistoryService;
    
    /**
     * 获取入库历史记录
     */
    @GetMapping("/inbound-history")
    public Result<Map<String, Object>> getInboundHistory(
        @RequestParam(required = false) String styleNo,
        @RequestParam(required = false) String orderNo,
        @RequestParam(required = false) String color,
        @RequestParam(required = false) String size,
        @RequestParam(required = false) String startDate,
        @RequestParam(required = false) String endDate,
        @RequestParam(defaultValue = "1") Integer pageNum,
        @RequestParam(defaultValue = "10") Integer pageSize
    ) {
        Page<FinishedInboundHistory> page = inboundHistoryService.listInboundHistory(
            styleNo, orderNo, color, size, startDate, endDate, pageNum, pageSize
        );
        
        Map<String, Object> result = new HashMap<>();
        result.put("records", page.getRecords());
        result.put("total", page.getTotal());
        result.put("pageNum", page.getCurrent());
        result.put("pageSize", page.getSize());
        
        // 添加汇总统计
        if (styleNo != null) {
            result.put("summary", inboundHistoryService.getSummaryByStyleNo(styleNo));
        }
        
        return Result.success(result);
    }
    
    /**
     * 获取款号入库汇总
     */
    @GetMapping("/inbound-summary")
    public Result<Map<String, Object>> getInboundSummary(
        @RequestParam String styleNo
    ) {
        return Result.success(inboundHistoryService.getSummaryByStyleNo(styleNo));
    }
}
```

---

## 🔄 前端集成

### API 调用示例

**文件**: `frontend/src/modules/warehouse/services/inboundHistoryApi.ts`

```typescript
import api from '@/services/api';

// 获取入库历史记录
export const getInboundHistory = (params: {
  styleNo?: string;
  orderNo?: string;
  color?: string;
  size?: string;
  startDate?: string;
  endDate?: string;
  pageNum?: number;
  pageSize?: number;
}) => {
  return api.get('/warehouse/finished/inbound-history', { params });
};

// 获取款号入库汇总
export const getInboundSummary = (styleNo: string) => {
  return api.get('/warehouse/finished/inbound-summary', {
    params: { styleNo }
  });
};
```

### 前端组件更新

更新 `frontend/src/modules/warehouse/pages/FinishedInventory/index.tsx`：

```typescript
// 替换 handleViewInboundHistory 函数
const handleViewInboundHistory = async (record: FinishedInventory) => {
  try {
    const response = await getInboundHistory({
      styleNo: record.styleNo,
      pageNum: 1,
      pageSize: 100
    });
    
    if (response.data) {
      setInboundHistory(response.data.records);
      setInboundHistoryVisible(true);
    }
  } catch (error) {
    message.error('获取入库记录失败');
    console.error('Failed to fetch inbound history:', error);
  }
};
```

---

## ✅ 实施步骤

### Phase 1: 数据库准备（5分钟）
```bash
# 1. 执行SQL脚本创建表
mysql -h localhost -P 3308 -u root -p fashion_supplychain < scripts/create_warehouse_inbound_history_table.sql

# 2. 验证表创建成功
mysql -h localhost -P 3308 -u root -p -e "DESC fashion_supplychain.t_finished_inbound_history;"
```

### Phase 2: 后端开发（30分钟）
1. ✅ 创建 Entity 实体类
2. ✅ 创建 Mapper 接口
3. ✅ 创建 Service 接口及实现类
4. ✅ 创建 Controller 控制器
5. ✅ 添加权限配置（如需要）

### Phase 3: 前端集成（15分钟）
1. ✅ 创建 API 服务文件
2. ✅ 更新 FinishedInventory 组件
3. ✅ 移除模拟数据，连接真实API
4. ✅ 测试功能

### Phase 4: 测试验证（10分钟）
1. ✅ 单元测试
2. ✅ 接口测试（Postman/Swagger）
3. ✅ 前端功能测试
4. ✅ 数据准确性验证

---

## 📊 数据流转图

```
质检入库
   ↓
自动创建入库记录（触发器或Service层）
   ↓
t_finished_inbound_history 表
   ↓
前端查询入库历史
   ↓
显示入库记录列表 + 汇总统计
```

---

## 🔐 权限配置

在 `t_role_permission` 表中添加新权限：

```sql
INSERT INTO t_role_permission (role_id, permission_code, permission_name)
VALUES 
  (1, 'warehouse:finished:inbound:view', '查看成品入库记录'),
  (2, 'warehouse:finished:inbound:view', '查看成品入库记录');
```

Controller 添加权限注解：

```java
@PreAuthorize("hasAuthority('warehouse:finished:inbound:view')")
@GetMapping("/inbound-history")
public Result<Map<String, Object>> getInboundHistory(...) {
    // ...
}
```

---

## 🚀 优化建议

### 1. 性能优化
- 为高频查询字段添加联合索引
- 对历史数据按月分表（如数据量大）
- 添加 Redis 缓存汇总统计数据

### 2. 功能扩展
- 支持入库记录导出（Excel）
- 添加入库趋势图表
- 支持按时间维度统计（日/周/月）
- 入库异常预警（如重复入库）

### 3. 数据完整性
- 添加触发器：质检入库时自动创建入库记录
- 添加定时任务：同步历史质检数据
- 数据校验：防止重复入库

---

**文档维护**: 后续如有接口变更，请及时更新本文档
