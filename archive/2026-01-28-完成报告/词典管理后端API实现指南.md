# 词典管理后端 API 实现指南

## 📋 API 需求概述

前端已实现**词典自动收录功能**，需要后端提供以下 API 支持。

## 🔌 需要实现的 API

### 1. 查询词典列表（带过滤）

**用途**：检查词汇是否已存在、获取词典数据

```
GET /api/system/dict/list
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dictType | String | 否 | 词典类型（color, size, fabric_type等） |
| dictLabel | String | 否 | 词典标签（用于精确查找） |
| dictCode | String | 否 | 词典编码 |
| page | Integer | 否 | 页码，默认1 |
| pageSize | Integer | 否 | 每页数量，默认10 |
| sortField | String | 否 | 排序字段（sort_order, create_time等） |
| sortOrder | String | 否 | 排序方向（asc, desc） |

**响应示例**：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [
      {
        "id": 1,
        "dictType": "color",
        "dictCode": "BLACK",
        "dictLabel": "黑色",
        "sortOrder": 1,
        "remark": "常用颜色",
        "createTime": "2026-01-28 10:00:00",
        "updateTime": "2026-01-28 10:00:00"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

### 2. 创建词典项

**用途**：自动收录新词汇时调用

```
POST /api/system/dict
Content-Type: application/json
```

**请求体**：

```json
{
  "dictType": "color",
  "dictCode": "COL_ZHZH_123456",
  "dictLabel": "酒红色",
  "sortOrder": 11,
  "remark": "自动收录"
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dictType | String | 是 | 词典类型 |
| dictCode | String | 是 | 词典编码（唯一） |
| dictLabel | String | 是 | 词典标签（显示名称） |
| sortOrder | Integer | 否 | 排序号，默认0 |
| remark | String | 否 | 备注 |

**响应示例**：

```json
{
  "code": 200,
  "message": "创建成功",
  "data": {
    "id": 101,
    "dictType": "color",
    "dictCode": "COL_ZHZH_123456",
    "dictLabel": "酒红色",
    "sortOrder": 11,
    "remark": "自动收录",
    "createTime": "2026-01-28 10:30:00"
  }
}
```

### 3. 更新词典项

**用途**：编辑词典数据

```
PUT /api/system/dict/{id}
Content-Type: application/json
```

**请求体**：同创建接口

**响应示例**：同创建接口

### 4. 删除词典项

**用途**：删除词典数据

```
DELETE /api/system/dict/{id}
```

**响应示例**：

```json
{
  "code": 200,
  "message": "删除成功"
}
```

### 5. 批量导入词典项

**用途**：批量导入预设数据

```
POST /api/system/dict/batch
Content-Type: application/json
```

**请求体**：

```json
{
  "items": [
    {
      "dictType": "color",
      "dictCode": "BLACK",
      "dictLabel": "黑色",
      "sortOrder": 1
    },
    {
      "dictType": "color",
      "dictCode": "WHITE",
      "dictLabel": "白色",
      "sortOrder": 2
    }
  ]
}
```

**响应示例**：

```json
{
  "code": 200,
  "message": "批量导入成功",
  "data": {
    "successCount": 2,
    "failCount": 0
  }
}
```

## 🗄️ 数据库设计

### 表结构：`t_system_dict`

```sql
CREATE TABLE `t_system_dict` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `dict_type` VARCHAR(50) NOT NULL COMMENT '词典类型',
  `dict_code` VARCHAR(100) NOT NULL COMMENT '词典编码',
  `dict_label` VARCHAR(100) NOT NULL COMMENT '词典标签',
  `sort_order` INT DEFAULT 0 COMMENT '排序号',
  `remark` VARCHAR(500) COMMENT '备注',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `create_by` VARCHAR(50) COMMENT '创建人',
  `update_by` VARCHAR(50) COMMENT '更新人',
  `del_flag` TINYINT DEFAULT 0 COMMENT '删除标志（0=正常，1=删除）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dict_type_code` (`dict_type`, `dict_code`),
  KEY `idx_dict_type` (`dict_type`),
  KEY `idx_dict_label` (`dict_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统词典表';
```

### 索引说明

- **主键索引**：`id`
- **唯一索引**：`dict_type + dict_code`（防止重复）
- **普通索引**：`dict_type`（查询优化）
- **普通索引**：`dict_label`（模糊搜索优化）

## 📦 Java 实体类示例

### Entity：`SystemDict.java`

```java
package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_system_dict")
public class SystemDict {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String dictType;
    
    private String dictCode;
    
    private String dictLabel;
    
    private Integer sortOrder;
    
    private String remark;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    private String createBy;
    
    private String updateBy;
    
    @TableLogic
    private Integer delFlag;
}
```

### Mapper：`SystemDictMapper.java`

```java
package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.SystemDict;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SystemDictMapper extends BaseMapper<SystemDict> {
}
```

### Service：`SystemDictService.java`

```java
package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.SystemDict;
import com.fashion.supplychain.system.mapper.SystemDictMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class SystemDictService extends ServiceImpl<SystemDictMapper, SystemDict> {
    
    /**
     * 分页查询词典列表
     */
    public IPage<SystemDict> queryPage(String dictType, String dictLabel, String dictCode,
                                       Integer page, Integer pageSize, 
                                       String sortField, String sortOrder) {
        Page<SystemDict> pageParam = new Page<>(page, pageSize);
        
        LambdaQueryWrapper<SystemDict> wrapper = new LambdaQueryWrapper<>();
        
        // 条件过滤
        if (StringUtils.hasText(dictType)) {
            wrapper.eq(SystemDict::getDictType, dictType);
        }
        if (StringUtils.hasText(dictLabel)) {
            wrapper.eq(SystemDict::getDictLabel, dictLabel);
        }
        if (StringUtils.hasText(dictCode)) {
            wrapper.eq(SystemDict::getDictCode, dictCode);
        }
        
        // 排序
        if (StringUtils.hasText(sortField)) {
            if ("desc".equalsIgnoreCase(sortOrder)) {
                wrapper.orderByDesc(getSortColumn(sortField));
            } else {
                wrapper.orderByAsc(getSortColumn(sortField));
            }
        } else {
            // 默认按 sortOrder 和 createTime 排序
            wrapper.orderByAsc(SystemDict::getSortOrder)
                   .orderByDesc(SystemDict::getCreateTime);
        }
        
        return this.page(pageParam, wrapper);
    }
    
    /**
     * 检查词汇是否已存在
     */
    public boolean exists(String dictType, String dictLabel) {
        LambdaQueryWrapper<SystemDict> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SystemDict::getDictType, dictType)
               .eq(SystemDict::getDictLabel, dictLabel);
        return this.count(wrapper) > 0;
    }
    
    /**
     * 检查编码是否已存在
     */
    public boolean existsByCode(String dictType, String dictCode) {
        LambdaQueryWrapper<SystemDict> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SystemDict::getDictType, dictType)
               .eq(SystemDict::getDictCode, dictCode);
        return this.count(wrapper) > 0;
    }
    
    /**
     * 获取最大排序号
     */
    public Integer getMaxSortOrder(String dictType) {
        LambdaQueryWrapper<SystemDict> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SystemDict::getDictType, dictType)
               .orderByDesc(SystemDict::getSortOrder)
               .last("LIMIT 1");
        
        SystemDict dict = this.getOne(wrapper);
        return dict != null && dict.getSortOrder() != null ? dict.getSortOrder() : 0;
    }
    
    /**
     * 批量导入
     */
    public void batchImport(List<SystemDict> items) {
        this.saveBatch(items);
    }
    
    private SFunction<SystemDict, ?> getSortColumn(String field) {
        switch (field) {
            case "sort_order":
                return SystemDict::getSortOrder;
            case "create_time":
                return SystemDict::getCreateTime;
            case "dict_code":
                return SystemDict::getDictCode;
            default:
                return SystemDict::getSortOrder;
        }
    }
}
```

### Controller：`SystemDictController.java`

```java
package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.vo.Result;
import com.fashion.supplychain.system.entity.SystemDict;
import com.fashion.supplychain.system.service.SystemDictService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system/dict")
@RequiredArgsConstructor
public class SystemDictController {
    
    private final SystemDictService dictService;
    
    /**
     * 分页查询词典列表
     */
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('MENU_DICT')")
    public Result<?> list(
            @RequestParam(required = false) String dictType,
            @RequestParam(required = false) String dictLabel,
            @RequestParam(required = false) String dictCode,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortOrder
    ) {
        IPage<SystemDict> pageResult = dictService.queryPage(
                dictType, dictLabel, dictCode, page, pageSize, sortField, sortOrder
        );
        
        Map<String, Object> result = new HashMap<>();
        result.put("records", pageResult.getRecords());
        result.put("total", pageResult.getTotal());
        result.put("page", pageResult.getCurrent());
        result.put("pageSize", pageResult.getSize());
        
        return Result.success(result);
    }
    
    /**
     * 创建词典项
     */
    @PostMapping
    @PreAuthorize("hasAuthority('MENU_DICT')")
    public Result<?> create(@RequestBody SystemDict dict) {
        // 检查编码是否已存在
        if (dictService.existsByCode(dict.getDictType(), dict.getDictCode())) {
            return Result.error("词典编码已存在");
        }
        
        // 检查标签是否已存在
        if (dictService.exists(dict.getDictType(), dict.getDictLabel())) {
            return Result.error("词典标签已存在");
        }
        
        dictService.save(dict);
        return Result.success(dict);
    }
    
    /**
     * 更新词典项
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('MENU_DICT')")
    public Result<?> update(@PathVariable Long id, @RequestBody SystemDict dict) {
        dict.setId(id);
        dictService.updateById(dict);
        return Result.success(dict);
    }
    
    /**
     * 删除词典项
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('MENU_DICT')")
    public Result<?> delete(@PathVariable Long id) {
        dictService.removeById(id);
        return Result.success("删除成功");
    }
    
    /**
     * 批量导入
     */
    @PostMapping("/batch")
    @PreAuthorize("hasAuthority('MENU_DICT')")
    public Result<?> batchImport(@RequestBody Map<String, List<SystemDict>> request) {
        List<SystemDict> items = request.get("items");
        
        int successCount = 0;
        int failCount = 0;
        
        for (SystemDict item : items) {
            try {
                // 跳过已存在的
                if (dictService.existsByCode(item.getDictType(), item.getDictCode())) {
                    failCount++;
                    continue;
                }
                
                dictService.save(item);
                successCount++;
            } catch (Exception e) {
                failCount++;
            }
        }
        
        Map<String, Integer> result = new HashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        
        return Result.success(result);
    }
}
```

## 🔒 权限配置

### 添加权限码

在 `t_role_permission` 表中添加：

```sql
INSERT INTO t_role_permission (role_id, permission_code, permission_name)
VALUES 
  (1, 'MENU_DICT', '字典管理'),
  (1, 'DICT_VIEW', '字典查看'),
  (1, 'DICT_CREATE', '字典创建'),
  (1, 'DICT_UPDATE', '字典更新'),
  (1, 'DICT_DELETE', '字典删除');
```

## 📊 初始化数据脚本

### SQL：`init_system_dict.sql`

```sql
-- 品类
INSERT INTO t_system_dict (dict_type, dict_code, dict_label, sort_order) VALUES
('category', 'WOMAN', '女装', 1),
('category', 'MAN', '男装', 2),
('category', 'KID', '童装', 3),
('category', 'SPORT', '运动装', 4),
('category', 'UNDERWEAR', '内衣', 5);

-- 季节
INSERT INTO t_system_dict (dict_type, dict_code, dict_label, sort_order) VALUES
('season', 'SPRING', '春季', 1),
('season', 'SUMMER', '夏季', 2),
('season', 'AUTUMN', '秋季', 3),
('season', 'WINTER', '冬季', 4);

-- 颜色
INSERT INTO t_system_dict (dict_type, dict_code, dict_label, sort_order) VALUES
('color', 'BLACK', '黑色', 1),
('color', 'WHITE', '白色', 2),
('color', 'GRAY', '灰色', 3),
('color', 'BLUE', '蓝色', 4),
('color', 'RED', '红色', 5),
('color', 'PINK', '粉色', 6),
('color', 'YELLOW', '黄色', 7),
('color', 'GREEN', '绿色', 8),
('color', 'NAVY', '藏青色', 9),
('color', 'BEIGE', '米色', 10);

-- 尺码
INSERT INTO t_system_dict (dict_type, dict_code, dict_label, sort_order) VALUES
('size', 'XS', 'XS', 1),
('size', 'S', 'S', 2),
('size', 'M', 'M', 3),
('size', 'L', 'L', 4),
('size', 'XL', 'XL', 5),
('size', 'XXL', 'XXL', 6),
('size', '3XL', '3XL', 7);

-- 更多词典类型的初始化数据...
-- (参考词典自动收录功能说明.md中的完整列表)
```

## 🧪 测试用例

### 1. 测试查询词典列表

```bash
curl -X GET "http://localhost:8088/api/system/dict/list?dictType=color&page=1&pageSize=10"
```

### 2. 测试创建词典项

```bash
curl -X POST "http://localhost:8088/api/system/dict" \
  -H "Content-Type: application/json" \
  -d '{
    "dictType": "color",
    "dictCode": "COL_TEST_123456",
    "dictLabel": "测试颜色",
    "sortOrder": 100,
    "remark": "自动收录"
  }'
```

### 3. 测试检查是否存在

```bash
curl -X GET "http://localhost:8088/api/system/dict/list?dictType=color&dictLabel=黑色&pageSize=1"
```

## 📝 注意事项

1. **唯一性约束**：
   - `dictType + dictCode` 必须唯一
   - 创建时需要检查是否已存在

2. **排序号管理**：
   - 自动收录时需要获取当前最大排序号 +1
   - 避免排序号冲突

3. **性能优化**：
   - 为常用查询字段添加索引
   - 使用 MyBatis Plus 的分页插件
   - 避免全表扫描

4. **数据安全**：
   - 所有接口需要权限验证
   - 防止 SQL 注入
   - 输入参数校验

## 🚀 部署步骤

1. **执行数据库脚本**：
   ```bash
   mysql -u root -p fashion_supplychain < init_system_dict.sql
   ```

2. **添加 Java 代码**：
   - Entity、Mapper、Service、Controller

3. **配置权限**：
   - 添加权限码到数据库
   - 配置角色权限

4. **重启后端服务**：
   ```bash
   cd backend
   mvn spring-boot:run
   ```

5. **测试 API**：
   - 使用 Postman 或 curl 测试各个接口

---

*最后更新：2026-01-28*
