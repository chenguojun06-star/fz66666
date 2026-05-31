# 物料采购购物车功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个通用的物料采购购物车功能，支持侧滑弹窗交互、智能合并、多端同步。

**Architecture:** 
- 后端采用购物车服务 + 编排器模式，与现有的 MaterialPurchase 服务集成
- 前端采用通用 Drawer 组件 + Hook 状态管理，支持多入口集成
- 数据存储在服务端，确保多端同步

**Tech Stack:** 
- 后端：Java Spring Boot, MyBatis-Plus, MySQL
- 前端：React, TypeScript, Ant Design, CSS Variables
- 状态管理：React Hooks (usePurchaseCart)

---

## 一、文件结构概览

```
backend/src/main/
├── resources/db/migration/
│   └── V202705011000__create_purchase_cart_tables.sql    # 购物车表
│
├── java/com/fashion/supplychain/production/
│   ├── entity/
│   │   ├── PurchaseCart.java                              # 购物车主表
│   │   └── PurchaseCartItem.java                          # 购物车明细
│   │
│   ├── mapper/
│   │   ├── PurchaseCartMapper.java
│   │   └── PurchaseCartItemMapper.java
│   │
│   ├── service/
│   │   ├── PurchaseCartService.java
│   │   └── impl/
│   │       └── PurchaseCartServiceImpl.java
│   │
│   ├── controller/
│   │   └── PurchaseCartController.java                   # REST API
│   │
│   └── orchestration/
│       └── PurchaseCartOrchestrator.java                 # 业务编排

frontend/src/
├── components/common/
│   └── PurchaseCartDrawer/
│       ├── index.tsx                                     # 主组件
│       ├── CartHeader.tsx                                # 头部
│       ├── CartSearch.tsx                                # 搜索区域
│       ├── CartList.tsx                                  # 列表
│       ├── CartItem.tsx                                  # 单项
│       ├── MergeSuggestion.tsx                          # 合并推荐
│       ├── CartPreview.tsx                               # 预览弹窗
│       └── CartSummary.tsx                               # 底部汇总
│
├── hooks/
│   └── usePurchaseCart.ts                               # 状态管理
│
├── services/
│   └── purchaseCartApi.ts                               # API 服务
│
└── types/
    └── purchaseCart.d.ts                                 # 类型定义
```

---

## 二、Phase 1：数据库迁移

### Task 1.1: 创建购物车数据库表

**Files:**
- Create: `backend/src/main/resources/db/migration/V202705011000__create_purchase_cart_tables.sql`

- [ ] **Step 1: 创建购物车表迁移脚本**

```sql
-- 创建购物车主表
CREATE TABLE IF NOT EXISTS `t_purchase_cart` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键',
    `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
    `user_id` VARCHAR(36) NOT NULL COMMENT '用户ID',
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT/CONFIRMED/CANCELLED',
    `total_items` INT NOT NULL DEFAULT 0 COMMENT '物料总数',
    `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '预计总金额',
    `remark` TEXT COMMENT '备注',
    `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_tenant_user` (`tenant_id`, `user_id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购购物车';

-- 创建购物车明细表
CREATE TABLE IF NOT EXISTS `t_purchase_cart_item` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键',
    `cart_id` VARCHAR(36) NOT NULL COMMENT '购物车ID',
    `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
    `material_code` VARCHAR(50) NOT NULL COMMENT '物料编码',
    `material_name` VARCHAR(100) NOT NULL COMMENT '物料名称',
    `material_type` VARCHAR(20) NOT NULL COMMENT '物料类型：FABRIC/LINING/ACCESSORY',
    `specifications` VARCHAR(100) COMMENT '规格',
    `unit` VARCHAR(10) NOT NULL COMMENT '单位',
    `quantity` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '采购数量',
    `supplier_id` VARCHAR(36) COMMENT '供应商ID',
    `supplier_name` VARCHAR(100) COMMENT '供应商名称',
    `unit_price` DECIMAL(10,2) COMMENT '单价',
    `total_amount` DECIMAL(12,2) COMMENT '金额',
    `source_type` VARCHAR(20) NOT NULL COMMENT '来源类型：ORDER/SAMPLE/BATCH',
    `source_id` VARCHAR(36) COMMENT '来源ID',
    `source_no` VARCHAR(50) COMMENT '来源编号',
    `source_quantity` DECIMAL(10,2) COMMENT '来源数量',
    `color` VARCHAR(50) COMMENT '颜色',
    `fabric_composition` VARCHAR(100) COMMENT '面料成分',
    `fabric_width` VARCHAR(50) COMMENT '幅宽',
    `fabric_weight` VARCHAR(50) COMMENT '克重',
    `merge_group_id` VARCHAR(36) COMMENT '合并组ID',
    `remark` TEXT COMMENT '备注',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
    `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_cart_id` (`cart_id`),
    INDEX `idx_material` (`material_code`, `specifications`),
    INDEX `idx_merge_group` (`merge_group_id`),
    CONSTRAINT `fk_cart_item_cart` FOREIGN KEY (`cart_id`) REFERENCES `t_purchase_cart` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购购物车明细';
```

- [ ] **Step 2: 提交迁移脚本**

```bash
git add backend/src/main/resources/db/migration/V202705011000__create_purchase_cart_tables.sql
git commit -m "feat(purchase-cart): add purchase cart database tables"
```

---

## 三、Phase 2：后端实体类

### Task 2.1: 创建购物车实体类

**Files:**
- Create: `backend/src/main/java/com/fashion/supplychain/production/entity/PurchaseCart.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/entity/PurchaseCartItem.java`

- [ ] **Step 1: 创建 PurchaseCart 实体**

```java
package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName("t_purchase_cart")
public class PurchaseCart {
    
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
    
    private String userId;
    
    private String status;
    
    private Integer totalItems;
    
    private BigDecimal totalAmount;
    
    private String remark;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
    
    @TableField(exist = false)
    private List<PurchaseCartItem> items;
}
```

- [ ] **Step 2: 创建 PurchaseCartItem 实体**

```java
package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_purchase_cart_item")
public class PurchaseCartItem {
    
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    private String cartId;
    
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
    
    private String materialCode;
    
    private String materialName;
    
    private String materialType;
    
    private String specifications;
    
    private String unit;
    
    private BigDecimal quantity;
    
    private String supplierId;
    
    private String supplierName;
    
    private BigDecimal unitPrice;
    
    private BigDecimal totalAmount;
    
    private String sourceType;
    
    private String sourceId;
    
    private String sourceNo;
    
    private BigDecimal sourceQuantity;
    
    private String color;
    
    private String fabricComposition;
    
    private String fabricWidth;
    
    private String fabricWeight;
    
    private String mergeGroupId;
    
    private String remark;
    
    private Integer sortOrder;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
}
```

- [ ] **Step 3: 创建 DTO 类**

**Files:**
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/AddCartItemRequest.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/UpdateCartItemRequest.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/MergeRequest.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/SplitRequest.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/CartPreviewDto.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/MergeSuggestionDto.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/dto/AddItemResultDto.java`

```java
// AddCartItemRequest.java
@Data
public class AddCartItemRequest {
    private String materialCode;
    private String materialName;
    private String materialType;
    private String specifications;
    private String unit;
    private BigDecimal quantity;
    private String supplierId;
    private String supplierName;
    private BigDecimal unitPrice;
    private String sourceType;
    private String sourceId;
    private String sourceNo;
    private BigDecimal sourceQuantity;
    private String color;
    private String fabricComposition;
    private String fabricWidth;
    private String fabricWeight;
    private String remark;
}
```

```java
// UpdateCartItemRequest.java
@Data
public class UpdateCartItemRequest {
    private BigDecimal quantity;
    private String supplierId;
    private String supplierName;
    private BigDecimal unitPrice;
    private String remark;
}
```

```java
// MergeRequest.java
@Data
public class MergeRequest {
    private List<String> itemIds;
    private BigDecimal targetQuantity;
    private String targetSupplierId;
    private String targetSupplierName;
}
```

```java
// SplitRequest.java
@Data
public class SplitRequest {
    private String itemId;
    private BigDecimal splitQuantity;
}
```

```java
// CartPreviewDto.java
@Data
public class CartPreviewDto {
    private List<PurchaseGroupDto> purchaseGroups;
    private PreviewSummary summary;
    
    @Data
    public static class PurchaseGroupDto {
        private String groupKey;
        private String materialCode;
        private String materialName;
        private String specifications;
        private String supplierId;
        private String supplierName;
        private BigDecimal totalQuantity;
        private BigDecimal unitPrice;
        private BigDecimal totalAmount;
        private List<SourceItemDto> sourceItems;
    }
    
    @Data
    public static class SourceItemDto {
        private String sourceType;
        private String sourceNo;
        private BigDecimal quantity;
    }
    
    @Data
    public static class PreviewSummary {
        private Integer totalGroups;
        private Integer totalItems;
        private BigDecimal totalAmount;
    }
}
```

```java
// MergeSuggestionDto.java
@Data
public class MergeSuggestionDto {
    private String materialCode;
    private String materialName;
    private String specifications;
    private List<MergeableItemDto> items;
    private String suggestion;
    
    @Data
    public static class MergeableItemDto {
        private String id;
        private String supplierName;
        private BigDecimal quantity;
    }
}
```

```java
// AddItemResultDto.java
@Data
public class AddItemResultDto {
    private String itemId;
    private MergeSuggestionDto mergeSuggestion;
}
```

```java
// ConfirmResultDto.java
@Data
public class ConfirmResultDto {
    private List<String> purchaseIds;
    private List<String> purchaseNos;
}
```

- [ ] **Step 4: 提交实体类**

```bash
git add backend/src/main/java/com/fashion/supplychain/production/entity/
git add backend/src/main/java/com/fashion/supplychain/production/dto/
git commit -m "feat(purchase-cart): add entity and DTO classes"
```

---

## 四、Phase 3：后端 Mapper 层

### Task 3.1: 创建购物车 Mapper

**Files:**
- Create: `backend/src/main/java/com/fashion/supplychain/production/mapper/PurchaseCartMapper.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/mapper/PurchaseCartItemMapper.java`

- [ ] **Step 1: 创建 PurchaseCartMapper**

```java
package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.PurchaseCart;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PurchaseCartMapper extends BaseMapper<PurchaseCart> {
}
```

- [ ] **Step 2: 创建 PurchaseCartItemMapper**

```java
package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface PurchaseCartItemMapper extends BaseMapper<PurchaseCartItem> {
    
    List<PurchaseCartItem> selectByCartId(@Param("cartId") String cartId);
    
    void deleteByIds(@Param("ids") List<String> ids);
}
```

- [ ] **Step 3: 创建 Mapper XML**

**Files:**
- Create: `backend/src/main/resources/mapper/PurchaseCartItemMapper.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.fashion.supplychain.production.mapper.PurchaseCartItemMapper">

    <select id="selectByCartId" resultType="com.fashion.supplychain.production.entity.PurchaseCartItem">
        SELECT * FROM t_purchase_cart_item 
        WHERE cart_id = #{cartId} 
        ORDER BY material_type, sort_order
    </select>
    
    <delete id="deleteByIds">
        DELETE FROM t_purchase_cart_item WHERE id IN
        <foreach collection="ids" item="id" open="(" separator="," close=")">
            #{id}
        </foreach>
    </delete>
</mapper>
```

- [ ] **Step 4: 提交 Mapper**

```bash
git add backend/src/main/java/com/fashion/supplychain/production/mapper/
git add backend/src/main/resources/mapper/PurchaseCartItemMapper.xml
git commit -m "feat(purchase-cart): add mapper layer"
```

---

## 五、Phase 4：后端 Service 层

### Task 4.1: 创建购物车 Service

**Files:**
- Create: `backend/src/main/java/com/fashion/supplychain/production/service/PurchaseCartService.java`
- Create: `backend/src/main/java/com/fashion/supplychain/production/service/impl/PurchaseCartServiceImpl.java`

- [ ] **Step 1: 创建 Service 接口**

```java
package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import java.util.List;

public interface PurchaseCartService {
    
    PurchaseCart getOrCreateCart(Long tenantId, String userId);
    
    PurchaseCart getCartWithItems(Long tenantId, String userId);
    
    AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request);
    
    void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request);
    
    void deleteItem(Long tenantId, String itemId);
    
    void mergeItems(Long tenantId, MergeRequest request);
    
    void splitItem(Long tenantId, SplitRequest request);
    
    CartPreviewDto preview(Long tenantId, String userId);
    
    ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds);
    
    void clearCart(Long tenantId, String userId);
    
    List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId);
}
```

- [ ] **Step 2: 创建 Service 实现**

```java
package com.fashion.supplychain.production.service.impl;

@Service
@Slf4j
public class PurchaseCartServiceImpl implements PurchaseCartService {
    
    @Autowired
    private PurchaseCartMapper purchaseCartMapper;
    
    @Autowired
    private PurchaseCartItemMapper purchaseCartItemMapper;
    
    @Autowired
    private PurchaseCartOrchestrator purchaseCartOrchestrator;
    
    @Override
    public PurchaseCart getOrCreateCart(Long tenantId, String userId) {
        LambdaQueryWrapper<PurchaseCart> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCart::getTenantId, tenantId)
               .eq(PurchaseCart::getUserId, userId)
               .eq(PurchaseCart::getStatus, "DRAFT")
               .orderByDesc(PurchaseCart::getUpdatedTime)
               .last("LIMIT 1");
        
        PurchaseCart cart = purchaseCartMapper.selectOne(wrapper);
        if (cart == null) {
            cart = new PurchaseCart();
            cart.setTenantId(tenantId);
            cart.setUserId(userId);
            cart.setStatus("DRAFT");
            cart.setTotalItems(0);
            cart.setTotalAmount(BigDecimal.ZERO);
            purchaseCartMapper.insert(cart);
        }
        return cart;
    }
    
    @Override
    public PurchaseCart getCartWithItems(Long tenantId, String userId) {
        PurchaseCart cart = getOrCreateCart(tenantId, userId);
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cart.getId());
        cart.setItems(items);
        return cart;
    }
    
    @Override
    @Transactional
    public AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request) {
        return purchaseCartOrchestrator.addItem(tenantId, userId, request);
    }
    
    @Override
    @Transactional
    public void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request) {
        purchaseCartOrchestrator.updateItem(tenantId, itemId, request);
    }
    
    @Override
    @Transactional
    public void deleteItem(Long tenantId, String itemId) {
        purchaseCartItemMapper.deleteById(itemId);
        recalculateCartTotal(tenantId);
    }
    
    @Override
    @Transactional
    public void mergeItems(Long tenantId, MergeRequest request) {
        purchaseCartOrchestrator.mergeItems(tenantId, request);
    }
    
    @Override
    @Transactional
    public void splitItem(Long tenantId, SplitRequest request) {
        purchaseCartOrchestrator.splitItem(tenantId, request);
    }
    
    @Override
    public CartPreviewDto preview(Long tenantId, String userId) {
        return purchaseCartOrchestrator.preview(tenantId, userId);
    }
    
    @Override
    @Transactional
    public ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds) {
        return purchaseCartOrchestrator.confirm(tenantId, userId, itemIds);
    }
    
    @Override
    @Transactional
    public void clearCart(Long tenantId, String userId) {
        PurchaseCart cart = getOrCreateCart(tenantId, userId);
        LambdaQueryWrapper<PurchaseCartItem> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCartItem::getCartId, cart.getId());
        purchaseCartItemMapper.delete(wrapper);
        recalculateCartTotal(tenantId);
    }
    
    @Override
    public List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId) {
        return purchaseCartOrchestrator.getMergeSuggestions(tenantId, userId);
    }
    
    private void recalculateCartTotal(Long tenantId) {
        // 实现总额计算逻辑
    }
}
```

- [ ] **Step 3: 提交 Service**

```bash
git add backend/src/main/java/com/fashion/supplychain/production/service/
git commit -m "feat(purchase-cart): add service layer"
```

---

## 六、Phase 5：后端 Orchestrator 编排器

### Task 5.1: 创建购物车编排器

**Files:**
- Create: `backend/src/main/java/com/fashion/supplychain/production/orchestration/PurchaseCartOrchestrator.java`

- [ ] **Step 1: 创建编排器**

```java
package com.fashion.supplychain.production.orchestration;

@Service
@Slf4j
public class PurchaseCartOrchestrator {
    
    @Autowired
    private PurchaseCartService purchaseCartService;
    
    @Autowired
    private PurchaseCartMapper purchaseCartMapper;
    
    @Autowired
    private PurchaseCartItemMapper purchaseCartItemMapper;
    
    @Autowired
    private MaterialPurchaseService materialPurchaseService;
    
    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;
    
    @Autowired
    private TenantAssert tenantAssert;
    
    public AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request) {
        tenantAssert.assertTenantContext();
        
        // 1. 获取或创建购物车
        PurchaseCart cart = purchaseCartService.getOrCreateCart(tenantId, userId);
        
        // 2. 检查是否可合并
        LambdaQueryWrapper<PurchaseCartItem> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getMaterialCode, request.getMaterialCode())
               .eq(PurchaseCartItem::getSpecifications, request.getSpecifications())
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        
        List<PurchaseCartItem> existItems = purchaseCartItemMapper.selectList(wrapper);
        
        AddItemResultDto result = new AddItemResultDto();
        
        if (!existItems.isEmpty()) {
            // 存在可合并的物料，生成合并建议
            MergeSuggestionDto suggestion = buildMergeSuggestion(existItems, request);
            result.setMergeSuggestion(suggestion);
        }
        
        // 3. 添加新物料（如果用户选择不合并）
        PurchaseCartItem newItem = new PurchaseCartItem();
        newItem.setCartId(cart.getId());
        newItem.setTenantId(tenantId);
        newItem.setMaterialCode(request.getMaterialCode());
        newItem.setMaterialName(request.getMaterialName());
        newItem.setMaterialType(request.getMaterialType());
        newItem.setSpecifications(request.getSpecifications());
        newItem.setUnit(request.getUnit());
        newItem.setQuantity(request.getQuantity());
        newItem.setSupplierId(request.getSupplierId());
        newItem.setSupplierName(request.getSupplierName());
        newItem.setUnitPrice(request.getUnitPrice());
        if (request.getUnitPrice() != null && request.getQuantity() != null) {
            newItem.setTotalAmount(request.getUnitPrice().multiply(request.getQuantity()));
        }
        newItem.setSourceType(request.getSourceType());
        newItem.setSourceId(request.getSourceId());
        newItem.setSourceNo(request.getSourceNo());
        newItem.setSourceQuantity(request.getSourceQuantity());
        newItem.setColor(request.getColor());
        newItem.setFabricComposition(request.getFabricComposition());
        newItem.setFabricWidth(request.getFabricWidth());
        newItem.setFabricWeight(request.getFabricWeight());
        newItem.setRemark(request.getRemark());
        newItem.setSortOrder(existItems.size());
        
        purchaseCartItemMapper.insert(newItem);
        result.setItemId(newItem.getId());
        
        // 4. 更新购物车汇总
        recalculateCartTotal(cart.getId());
        
        return result;
    }
    
    public void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request) {
        tenantAssert.assertTenantContext();
        
        PurchaseCartItem item = purchaseCartItemMapper.selectById(itemId);
        if (item == null) {
            throw new RuntimeException("购物车物料不存在");
        }
        
        if (request.getQuantity() != null) {
            item.setQuantity(request.getQuantity());
        }
        if (request.getSupplierId() != null) {
            item.setSupplierId(request.getSupplierId());
        }
        if (request.getSupplierName() != null) {
            item.setSupplierName(request.getSupplierName());
        }
        if (request.getUnitPrice() != null) {
            item.setUnitPrice(request.getUnitPrice());
        }
        if (request.getRemark() != null) {
            item.setRemark(request.getRemark());
        }
        
        // 重新计算金额
        if (item.getQuantity() != null && item.getUnitPrice() != null) {
            item.setTotalAmount(item.getQuantity().multiply(item.getUnitPrice()));
        }
        
        purchaseCartItemMapper.updateById(item);
        recalculateCartTotal(item.getCartId());
    }
    
    @Transactional
    public void mergeItems(Long tenantId, MergeRequest request) {
        tenantAssert.assertTenantContext();
        
        if (request.getItemIds() == null || request.getItemIds().size() < 2) {
            throw new RuntimeException("合并至少需要2个物料");
        }
        
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectBatchIds(request.getItemIds());
        if (items.isEmpty()) {
            throw new RuntimeException("要合并的物料不存在");
        }
        
        // 以第一个物料为基础，合并其他物料
        PurchaseCartItem target = items.get(0);
        
        // 累加数量
        BigDecimal totalQty = request.getTargetQuantity() != null ? 
            request.getTargetQuantity() : target.getQuantity();
        for (PurchaseCartItem item : items) {
            if (!item.getId().equals(target.getId())) {
                totalQty = totalQty.add(item.getQuantity());
                purchaseCartItemMapper.deleteById(item.getId());
            }
        }
        
        target.setQuantity(totalQty);
        if (request.getTargetSupplierId() != null) {
            target.setSupplierId(request.getTargetSupplierId());
        }
        if (request.getTargetSupplierName() != null) {
            target.setSupplierName(request.getTargetSupplierName());
        }
        if (target.getUnitPrice() != null) {
            target.setTotalAmount(target.getUnitPrice().multiply(target.getQuantity()));
        }
        
        purchaseCartItemMapper.updateById(target);
        recalculateCartTotal(target.getCartId());
    }
    
    @Transactional
    public void splitItem(Long tenantId, SplitRequest request) {
        tenantAssert.assertTenantContext();
        
        PurchaseCartItem item = purchaseCartItemMapper.selectById(request.getItemId());
        if (item == null) {
            throw new RuntimeException("要拆分的物料不存在");
        }
        
        BigDecimal splitQty = request.getSplitQuantity();
        if (splitQty == null || splitQty.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("拆分数量必须大于0");
        }
        if (splitQty.compareTo(item.getQuantity()) >= 0) {
            throw new RuntimeException("拆分数量必须小于原数量");
        }
        
        // 更新原物料数量
        item.setQuantity(item.getQuantity().subtract(splitQty));
        if (item.getUnitPrice() != null) {
            item.setTotalAmount(item.getUnitPrice().multiply(item.getQuantity()));
        }
        purchaseCartItemMapper.updateById(item);
        
        // 创建新物料
        PurchaseCartItem newItem = new PurchaseCartItem();
        BeanUtils.copyProperties(item, newItem);
        newItem.setId(null);
        newItem.setSourceQuantity(splitQty);
        newItem.setQuantity(splitQty);
        if (item.getUnitPrice() != null) {
            newItem.setTotalAmount(item.getUnitPrice().multiply(splitQty));
        }
        newItem.setSortOrder(item.getSortOrder() + 1);
        purchaseCartItemMapper.insert(newItem);
    }
    
    public CartPreviewDto preview(Long tenantId, String userId) {
        tenantAssert.assertTenantContext();
        
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        List<PurchaseCartItem> items = cart.getItems();
        
        // 按物料+供应商分组
        Map<String, List<PurchaseCartItem>> groups = items.stream()
            .collect(Collectors.groupingBy(item -> 
                item.getMaterialCode() + "|" + 
                (item.getSpecifications() != null ? item.getSpecifications() : "") + "|" +
                (item.getSupplierId() != null ? item.getSupplierId() : "")
            ));
        
        CartPreviewDto preview = new CartPreviewDto();
        List<CartPreviewDto.PurchaseGroupDto> purchaseGroups = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;
        
        for (Map.Entry<String, List<PurchaseCartItem>> entry : groups.entrySet()) {
            List<PurchaseCartItem> groupItems = entry.getValue();
            PurchaseCartItem first = groupItems.get(0);
            
            CartPreviewDto.PurchaseGroupDto group = new CartPreviewDto.PurchaseGroupDto();
            group.setGroupKey(entry.getKey());
            group.setMaterialCode(first.getMaterialCode());
            group.setMaterialName(first.getMaterialName());
            group.setSpecifications(first.getSpecifications());
            group.setSupplierId(first.getSupplierId());
            group.setSupplierName(first.getSupplierName());
            group.setUnitPrice(first.getUnitPrice());
            
            // 汇总数量
            BigDecimal groupQty = groupItems.stream()
                .map(PurchaseCartItem::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            group.setTotalQuantity(groupQty);
            
            // 计算金额
            if (first.getUnitPrice() != null) {
                BigDecimal groupAmount = first.getUnitPrice().multiply(groupQty);
                group.setTotalAmount(groupAmount);
                totalAmount = totalAmount.add(groupAmount);
            }
            
            // 来源追踪
            List<CartPreviewDto.SourceItemDto> sourceItems = groupItems.stream()
                .map(item -> {
                    CartPreviewDto.SourceItemDto source = new CartPreviewDto.SourceItemDto();
                    source.setSourceType(item.getSourceType());
                    source.setSourceNo(item.getSourceNo());
                    source.setQuantity(item.getSourceQuantity());
                    return source;
                })
                .collect(Collectors.toList());
            group.setSourceItems(sourceItems);
            
            purchaseGroups.add(group);
        }
        
        preview.setPurchaseGroups(purchaseGroups);
        
        CartPreviewDto.PreviewSummary summary = new CartPreviewDto.PreviewSummary();
        summary.setTotalGroups(purchaseGroups.size());
        summary.setTotalItems(items.size());
        summary.setTotalAmount(totalAmount);
        preview.setSummary(summary);
        
        return preview;
    }
    
    @Transactional
    public ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds) {
        tenantAssert.assertTenantContext();
        
        // 1. 获取预览数据
        CartPreviewDto preview = preview(tenantId, userId);
        
        List<String> purchaseIds = new ArrayList<>();
        List<String> purchaseNos = new ArrayList<>();
        
        // 2. 为每个分组创建采购单
        for (CartPreviewDto.PurchaseGroupDto group : preview.getPurchaseGroups()) {
            MaterialPurchase purchase = new MaterialPurchase();
            purchase.setMaterialCode(group.getMaterialCode());
            purchase.setMaterialName(group.getMaterialName());
            purchase.setSpecifications(group.getSpecifications());
            purchase.setSupplierId(group.getSupplierId());
            purchase.setSupplierName(group.getSupplierName());
            purchase.setUnitPrice(group.getUnitPrice());
            purchase.setPurchaseQuantity(group.getTotalQuantity());
            purchase.setTotalAmount(group.getTotalAmount());
            purchase.setStatus("pending");
            purchase.setSourceType("BATCH");  // 批量采购来源
            
            // 来源追踪 JSON
            String sourcesJson = buildSourcesJson(group.getSourceItems());
            purchase.setRemark(sourcesJson);
            
            String purchaseId = materialPurchaseOrchestrator.save(purchase);
            purchaseIds.add(purchaseId);
            purchaseNos.add(purchase.getPurchaseNo());
        }
        
        // 3. 清空已下单的购物车项
        if (itemIds != null && !itemIds.isEmpty()) {
            purchaseCartItemMapper.deleteByIds(itemIds);
        } else {
            purchaseCartService.clearCart(tenantId, userId);
        }
        
        ConfirmResultDto result = new ConfirmResultDto();
        result.setPurchaseIds(purchaseIds);
        result.setPurchaseNos(purchaseNos);
        
        return result;
    }
    
    public List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId) {
        tenantAssert.assertTenantContext();
        
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        List<PurchaseCartItem> items = cart.getItems();
        
        // 按物料编码+规格分组，找出供应商不同的
        Map<String, List<PurchaseCartItem>> groups = items.stream()
            .collect(Collectors.groupingBy(item ->
                item.getMaterialCode() + "|" + 
                (item.getSpecifications() != null ? item.getSpecifications() : "")
            ));
        
        List<MergeSuggestionDto> suggestions = new ArrayList<>();
        
        for (Map.Entry<String, List<PurchaseCartItem>> entry : groups.entrySet()) {
            List<PurchaseCartItem> groupItems = entry.getValue();
            
            // 只有供应商不同的才建议合并
            Set<String> suppliers = groupItems.stream()
                .map(PurchaseCartItem::getSupplierId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
            
            if (suppliers.size() > 1) {
                MergeSuggestionDto suggestion = new MergeSuggestionDto();
                suggestion.setMaterialCode(groupItems.get(0).getMaterialCode());
                suggestion.setMaterialName(groupItems.get(0).getMaterialName());
                suggestion.setSpecifications(groupItems.get(0).getSpecifications());
                
                List<MergeSuggestionDto.MergeableItemDto> mergeableItems = groupItems.stream()
                    .map(item -> {
                        MergeSuggestionDto.MergeableItemDto dto = new MergeSuggestionDto.MergeableItemDto();
                        dto.setId(item.getId());
                        dto.setSupplierName(item.getSupplierName());
                        dto.setQuantity(item.getQuantity());
                        return dto;
                    })
                    .collect(Collectors.toList());
                suggestion.setItems(mergeableItems);
                
                suggestion.setSuggestion("可合并，共" + groupItems.size() + "个供应商");
                suggestions.add(suggestion);
            }
        }
        
        return suggestions;
    }
    
    private MergeSuggestionDto buildMergeSuggestion(List<PurchaseCartItem> existItems, AddCartItemRequest request) {
        MergeSuggestionDto suggestion = new MergeSuggestionDto();
        suggestion.setMaterialCode(request.getMaterialCode());
        suggestion.setMaterialName(request.getMaterialName());
        suggestion.setSpecifications(request.getSpecifications());
        
        List<MergeSuggestionDto.MergeableItemDto> items = existItems.stream()
            .map(item -> {
                MergeSuggestionDto.MergeableItemDto dto = new MergeSuggestionDto.MergeableItemDto();
                dto.setId(item.getId());
                dto.setSupplierName(item.getSupplierName());
                dto.setQuantity(item.getQuantity());
                return dto;
            })
            .collect(Collectors.toList());
        suggestion.setItems(items);
        
        suggestion.setSuggestion("发现相同物料，可选择合并");
        return suggestion;
    }
    
    private void recalculateCartTotal(String cartId) {
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cartId);
        
        PurchaseCart cart = purchaseCartMapper.selectById(cartId);
        cart.setTotalItems(items.size());
        cart.setTotalAmount(items.stream()
            .map(PurchaseCartItem::getTotalAmount)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
        purchaseCartMapper.updateById(cart);
    }
    
    private String buildSourcesJson(List<CartPreviewDto.SourceItemDto> sources) {
        return JSON.toJSONString(sources);
    }
}
```

- [ ] **Step 2: 提交编排器**

```bash
git add backend/src/main/java/com/fashion/supplychain/production/orchestration/PurchaseCartOrchestrator.java
git commit -m "feat(purchase-cart): add orchestrator"
```

---

## 七、Phase 6：后端 Controller 层

### Task 6.1: 创建购物车 Controller

**Files:**
- Create: `backend/src/main/java/com/fashion/supplychain/production/controller/PurchaseCartController.java`

- [ ] **Step 1: 创建 Controller**

```java
package com.fashion.supplychain.production.controller;

@RestController
@RequestMapping("/purchase-cart")
@Slf4j
public class PurchaseCartController {
    
    @Autowired
    private PurchaseCartService purchaseCartService;
    
    @Autowired
    private UserContext userContext;
    
    @GetMapping
    public Result<PurchaseCart> getCart() {
        Long tenantId = userContext.getTenantId();
        String userId = userContext.getUserId();
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        return Result.success(cart);
    }
    
    @PostMapping("/items")
    public Result<AddItemResultDto> addItem(@RequestBody AddCartItemRequest request) {
        Long tenantId = userContext.getTenantId();
        String userId = userContext.getUserId();
        AddItemResultDto result = purchaseCartService.addItem(tenantId, userId, request);
        return Result.success(result);
    }
    
    @PutMapping("/items/{itemId}")
    public Result<Void> updateItem(@PathVariable String itemId, @RequestBody UpdateCartItemRequest request) {
        Long tenantId = userContext.getTenantId();
        purchaseCartService.updateItem(tenantId, itemId, request);
        return Result.success(null);
    }
    
    @DeleteMapping("/items/{itemId}")
    public Result<Void> deleteItem(@PathVariable String itemId) {
        Long tenantId = userContext.getTenantId();
        purchaseCartService.deleteItem(tenantId, itemId);
        return Result.success(null);
    }
    
    @PostMapping("/items/merge")
    public Result<Void> mergeItems(@RequestBody MergeRequest request) {
        Long tenantId = userContext.getTenantId();
        purchaseCartService.mergeItems(tenantId, request);
        return Result.success(null);
    }
    
    @PostMapping("/items/split")
    public Result<Void> splitItem(@RequestBody SplitRequest request) {
        Long tenantId = userContext.getTenantId();
        purchaseCartService.splitItem(tenantId, request);
        return Result.success(null);
    }
    
    @GetMapping("/merge-suggestions")
    public Result<List<MergeSuggestionDto>> getMergeSuggestions() {
        Long tenantId = userContext.getTenantId();
        String userId = userContext.getUserId();
        List<MergeSuggestionDto> suggestions = purchaseCartService.getMergeSuggestions(tenantId, userId);
        return Result.success(suggestions);
    }
    
    @PostMapping("/preview")
    public Result<CartPreviewDto> preview() {
        Long tenantId = userContext.getTenantId();
        String userId = userContext.getUserId();
        CartPreviewDto preview = purchaseCartService.preview(tenantId, userId);
        return Result.success(preview);
    }
    
    @PostMapping("/confirm")
    public Result<ConfirmResultDto> confirm(@RequestBody List<String> itemIds) {
        Long tenantId = userContext.getTenantId();
        String userId = userContext.getUserId();
        ConfirmResultDto result = purchaseCartService.confirm(tenantId, userId, itemIds);
        return Result.success(result);
    }
    
    @DeleteMapping
    public Result<Void> clearCart() {
        Long tenantId = userContext.getTenantId();
        String userId = userContext.getUserId();
        purchaseCartService.clearCart(tenantId, userId);
        return Result.success(null);
    }
}
```

- [ ] **Step 2: 提交 Controller**

```bash
git add backend/src/main/java/com/fashion/supplychain/production/controller/PurchaseCartController.java
git commit -m "feat(purchase-cart): add controller"
```

---

## 八、Phase 7：前端类型定义

### Task 7.1: 创建前端类型定义

**Files:**
- Create: `frontend/src/types/purchaseCart.d.ts`

- [ ] **Step 1: 创建类型定义**

```typescript
// 购物车状态
export type CartStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

// 物料类型
export type MaterialType = 'FABRIC' | 'LINING' | 'ACCESSORY';

// 来源类型
export type SourceType = 'ORDER' | 'SAMPLE' | 'BATCH';

// 购物车
export interface PurchaseCart {
  id: string;
  status: CartStatus;
  totalItems: number;
  totalAmount: number;
  remark?: string;
  items: PurchaseCartItem[];
  createdTime: string;
  updatedTime: string;
}

// 购物车明细
export interface PurchaseCartItem {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialType;
  specifications?: string;
  unit: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  totalAmount?: number;
  sourceType: SourceType;
  sourceId?: string;
  sourceNo?: string;
  sourceQuantity?: number;
  color?: string;
  fabricComposition?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  mergeGroupId?: string;
  remark?: string;
}

// 添加物料请求
export interface AddCartItemRequest {
  materialCode: string;
  materialName: string;
  materialType: MaterialType;
  specifications?: string;
  unit: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  sourceType: SourceType;
  sourceId?: string;
  sourceNo?: string;
  sourceQuantity?: number;
  color?: string;
  fabricComposition?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  remark?: string;
}

// 更新物料请求
export interface UpdateCartItemRequest {
  quantity?: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  remark?: string;
}

// 合并请求
export interface MergeRequest {
  itemIds: string[];
  targetQuantity?: number;
  targetSupplierId?: string;
  targetSupplierName?: string;
}

// 拆分请求
export interface SplitRequest {
  itemId: string;
  splitQuantity: number;
}

// 合并推荐项
export interface MergeableItem {
  id: string;
  supplierName?: string;
  quantity: number;
}

// 合并推荐
export interface MergeSuggestion {
  materialCode: string;
  materialName: string;
  specifications?: string;
  items: MergeableItem[];
  suggestion: string;
}

// 来源项
export interface SourceItem {
  sourceType: SourceType;
  sourceNo?: string;
  quantity: number;
}

// 采购分组预览
export interface PurchaseGroup {
  groupKey: string;
  materialCode: string;
  materialName: string;
  specifications?: string;
  supplierId?: string;
  supplierName?: string;
  totalQuantity: number;
  unitPrice?: number;
  totalAmount?: number;
  sourceItems: SourceItem[];
}

// 预览汇总
export interface PreviewSummary {
  totalGroups: number;
  totalItems: number;
  totalAmount: number;
}

// 预览数据
export interface CartPreview {
  purchaseGroups: PurchaseGroup[];
  summary: PreviewSummary;
}

// 添加结果
export interface AddItemResult {
  itemId: string;
  mergeSuggestion?: MergeSuggestion;
}

// 确认结果
export interface ConfirmResult {
  purchaseIds: string[];
  purchaseNos: string[];
}

// 购物车组件 Props
export interface PurchaseCartDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}
```

- [ ] **Step 2: 提交类型定义**

```bash
git add frontend/src/types/purchaseCart.d.ts
git commit -m "feat(purchase-cart): add TypeScript types"
```

---

## 九、Phase 8：前端 API 服务

### Task 8.1: 创建购物车 API 服务

**Files:**
- Create: `frontend/src/services/purchaseCartApi.ts`

- [ ] **Step 1: 创建 API 服务**

```typescript
import api from '@/utils/api';
import type {
  PurchaseCart,
  AddCartItemRequest,
  UpdateCartItemRequest,
  MergeRequest,
  SplitRequest,
  CartPreview,
  MergeSuggestion,
  AddItemResult,
  ConfirmResult,
} from '@/types/purchaseCart';

export const purchaseCartApi = {
  // 获取购物车
  getCart: (): Promise<PurchaseCart> => {
    return api.get('/purchase-cart');
  },

  // 添加物料
  addItem: (data: AddCartItemRequest): Promise<AddItemResult> => {
    return api.post('/purchase-cart/items', data);
  },

  // 更新物料
  updateItem: (itemId: string, data: UpdateCartItemRequest): Promise<void> => {
    return api.put(`/purchase-cart/items/${itemId}`, data);
  },

  // 删除物料
  deleteItem: (itemId: string): Promise<void> => {
    return api.delete(`/purchase-cart/items/${itemId}`);
  },

  // 合并物料
  mergeItems: (data: MergeRequest): Promise<void> => {
    return api.post('/purchase-cart/items/merge', data);
  },

  // 拆分物料
  splitItem: (data: SplitRequest): Promise<void> => {
    return api.post('/purchase-cart/items/split', data);
  },

  // 获取合并建议
  getMergeSuggestions: (): Promise<MergeSuggestion[]> => {
    return api.get('/purchase-cart/merge-suggestions');
  },

  // 预览购物车
  preview: (): Promise<CartPreview> => {
    return api.post('/purchase-cart/preview');
  },

  // 确认下单
  confirm: (itemIds?: string[]): Promise<ConfirmResult> => {
    return api.post('/purchase-cart/confirm', itemIds || []);
  },

  // 清空购物车
  clearCart: (): Promise<void> => {
    return api.delete('/purchase-cart');
  },
};

export default purchaseCartApi;
```

- [ ] **Step 2: 提交 API 服务**

```bash
git add frontend/src/services/purchaseCartApi.ts
git commit -m "feat(purchase-cart): add API service"
```

---

## 十、Phase 9：前端 Hook 状态管理

### Task 9.1: 创建购物车 Hook

**Files:**
- Create: `frontend/src/hooks/usePurchaseCart.ts`

- [ ] **Step 1: 创建 Hook**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import type {
  PurchaseCart,
  PurchaseCartItem,
  AddCartItemRequest,
  UpdateCartItemRequest,
  MergeRequest,
  SplitRequest,
  CartPreview,
  MergeSuggestion,
  AddItemResult,
  ConfirmResult,
} from '@/types/purchaseCart';

export interface UsePurchaseCartOptions {
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}

export function usePurchaseCart(options?: UsePurchaseCartOptions) {
  const { onConfirmSuccess } = options || {};
  
  const [cart, setCart] = useState<PurchaseCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<CartPreview | null>(null);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 加载购物车
  const loadCart = useCallback(async () => {
    setLoading(true);
    try {
      const data = await purchaseCartApi.getCart();
      setCart(data);
      // 初始化选中状态
      if (data.items) {
        setSelectedItems(new Set(data.items.map(item => item.id)));
      }
    } catch (error) {
      message.error('加载购物车失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载合并建议
  const loadMergeSuggestions = useCallback(async () => {
    try {
      const suggestions = await purchaseCartApi.getMergeSuggestions();
      setMergeSuggestions(suggestions);
    } catch (error) {
      // 忽略错误
    }
  }, []);

  // 添加物料
  const addItem = useCallback(async (request: AddCartItemRequest): Promise<AddItemResult | null> => {
    setSubmitting(true);
    try {
      const result = await purchaseCartApi.addItem(request);
      await loadCart();
      await loadMergeSuggestions();
      return result;
    } catch (error) {
      message.error('添加物料失败');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions]);

  // 更新物料
  const updateItem = useCallback(async (itemId: string, request: UpdateCartItemRequest) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.updateItem(itemId, request);
      await loadCart();
      await loadMergeSuggestions();
      message.success('更新成功');
    } catch (error) {
      message.error('更新失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions]);

  // 删除物料
  const deleteItem = useCallback(async (itemId: string) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.deleteItem(itemId);
      await loadCart();
      await loadMergeSuggestions();
      message.success('删除成功');
    } catch (error) {
      message.error('删除失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions]);

  // 合并物料
  const mergeItems = useCallback(async (request: MergeRequest) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.mergeItems(request);
      await loadCart();
      await loadMergeSuggestions();
      message.success('合并成功');
    } catch (error) {
      message.error('合并失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions]);

  // 拆分物料
  const splitItem = useCallback(async (request: SplitRequest) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.splitItem(request);
      await loadCart();
      await loadMergeSuggestions();
      message.success('拆分成功');
    } catch (error) {
      message.error('拆分失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions]);

  // 预览
  const preview = useCallback(async () => {
    setSubmitting(true);
    try {
      const data = await purchaseCartApi.preview();
      setPreviewData(data);
      setPreviewVisible(true);
    } catch (error) {
      message.error('预览失败');
    } finally {
      setSubmitting(false);
    }
  }, []);

  // 确认下单
  const confirm = useCallback(async (itemIds?: string[]) => {
    setSubmitting(true);
    try {
      const result: ConfirmResult = await purchaseCartApi.confirm(itemIds);
      setPreviewVisible(false);
      setPreviewData(null);
      await loadCart();
      await loadMergeSuggestions();
      message.success('下单成功！');
      if (onConfirmSuccess) {
        onConfirmSuccess(result.purchaseIds);
      }
    } catch (error) {
      message.error('下单失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, onConfirmSuccess]);

  // 清空购物车
  const clearCart = useCallback(async () => {
    setSubmitting(true);
    try {
      await purchaseCartApi.clearCart();
      await loadCart();
      await loadMergeSuggestions();
      message.success('购物车已清空');
    } catch (error) {
      message.error('清空失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions]);

  // 选中/取消选中
  const toggleSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (!cart?.items) return;
    if (selectedItems.size === cart.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cart.items.map(item => item.id)));
    }
  }, [cart?.items, selectedItems.size]);

  // 初始化加载
  useEffect(() => {
    loadCart();
    loadMergeSuggestions();
  }, [loadCart, loadMergeSuggestions]);

  return {
    cart,
    loading,
    submitting,
    previewVisible,
    previewData,
    mergeSuggestions,
    selectedItems,
    loadCart,
    loadMergeSuggestions,
    addItem,
    updateItem,
    deleteItem,
    mergeItems,
    splitItem,
    preview,
    confirm,
    clearCart,
    toggleSelect,
    toggleSelectAll,
    setPreviewVisible,
  };
}
```

- [ ] **Step 2: 提交 Hook**

```bash
git add frontend/src/hooks/usePurchaseCart.ts
git commit -m "feat(purchase-cart): add usePurchaseCart hook"
```

---

## 十一、Phase 10：前端组件

### Task 10.1: 创建购物车侧滑组件

**Files:**
- Create: `frontend/src/components/common/PurchaseCartDrawer/index.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/CartHeader.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/CartSearch.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/CartList.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/CartItem.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/MergeSuggestion.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/CartPreview.tsx`
- Create: `frontend/src/components/common/PurchaseCartDrawer/CartSummary.tsx`

- [ ] **Step 1: 创建主组件 index.tsx**

```tsx
import React from 'react';
import { Drawer } from 'antd';
import { usePurchaseCart } from '@/hooks/usePurchaseCart';
import { CartHeader } from './CartHeader';
import { CartSearch } from './CartSearch';
import { CartList } from './CartList';
import { MergeSuggestion } from './MergeSuggestion';
import { CartPreview } from './CartPreview';
import { CartSummary } from './CartSummary';
import type { PurchaseCartDrawerProps } from '@/types/purchaseCart';

export const PurchaseCartDrawer: React.FC<PurchaseCartDrawerProps> = ({
  open,
  onClose,
  onConfirmSuccess,
}) => {
  const {
    cart,
    loading,
    submitting,
    previewVisible,
    previewData,
    mergeSuggestions,
    selectedItems,
    addItem,
    updateItem,
    deleteItem,
    mergeItems,
    splitItem,
    preview,
    confirm,
    clearCart,
    toggleSelect,
    toggleSelectAll,
    setPreviewVisible,
  } = usePurchaseCart({ onConfirmSuccess });

  return (
    <Drawer
      title={<CartHeader cart={cart} onClear={clearCart} />}
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      maskClosable={false}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <CartSearch onAdd={addItem} submitting={submitting} />
        
        {mergeSuggestions.length > 0 && (
          <MergeSuggestion
            suggestions={mergeSuggestions}
            onMerge={mergeItems}
            submitting={submitting}
          />
        )}
        
        <CartList
          items={cart?.items || []}
          loading={loading}
          selectedItems={selectedItems}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onUpdate={updateItem}
          onDelete={deleteItem}
          onSplit={splitItem}
          submitting={submitting}
        />
      </div>
      
      <CartSummary
        cart={cart}
        selectedCount={selectedItems.size}
        onPreview={preview}
        onConfirm={() => confirm(Array.from(selectedItems))}
        submitting={submitting}
      />
      
      <CartPreview
        visible={previewVisible}
        data={previewData}
        onClose={() => setPreviewVisible(false)}
        onConfirm={() => confirm(Array.from(selectedItems))}
        submitting={submitting}
      />
    </Drawer>
  );
};

export default PurchaseCartDrawer;
```

- [ ] **Step 2: 创建子组件（简略示例）**

**CartHeader.tsx:**
```tsx
import React from 'react';
import { Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { PurchaseCart } from '@/types/purchaseCart';

interface CartHeaderProps {
  cart?: PurchaseCart | null;
  onClear: () => void;
}

export const CartHeader: React.FC<CartHeaderProps> = ({ cart, onClear }) => {
  const itemCount = cart?.totalItems || 0;
  
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>采购购物车 {itemCount > 0 && `(${itemCount}件)`}</span>
      {itemCount > 0 && (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onClear}
          size="small"
        >
          清空
        </Button>
      )}
    </div>
  );
};
```

**CartSearch.tsx:**
```tsx
import React, { useState, useCallback, useRef } from 'react';
import { Input, Button, List, message } from 'antd';
import { PlusOutlined, ScanOutlined } from '@ant-design/icons';
import type { AddCartItemRequest } from '@/types/purchaseCart';

interface CartSearchProps {
  onAdd: (request: AddCartItemRequest) => Promise<any>;
  submitting: boolean;
}

export const CartSearch: React.FC<CartSearchProps> = ({ onAdd, submitting }) => {
  const [keyword, setKeyword] = useState('');
  const [materialOptions, setMaterialOptions] = useState<any[]>([]);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(async (value: string) => {
    if (!value.trim()) return;
    // TODO: 调用物料搜索 API
    // const res = await api.get('/material/database/list', { params: { keyword: value } });
    // setMaterialOptions(res.data.records || []);
  }, []);

  const handleAdd = useCallback(async (material: any) => {
    const request: AddCartItemRequest = {
      materialCode: material.materialCode,
      materialName: material.materialName,
      materialType: material.materialType || 'FABRIC',
      unit: material.unit || '米',
      quantity: 1,
      sourceType: 'BATCH',
    };
    const result = await onAdd(request);
    if (result?.mergeSuggestion) {
      message.info('发现相同物料，可选择合并');
    } else {
      message.success('已添加到购物车');
    }
  }, [onAdd]);

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <Input.Search
        placeholder="搜索物料编码/名称"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onSearch={handleSearch}
        loading={submitting}
        enterButton={<Button type="primary" icon={<PlusOutlined />}>添加</Button>}
      />
    </div>
  );
};
```

**CartList.tsx:**
```tsx
import React from 'react';
import { Checkbox, Empty } from 'antd';
import { CartItem } from './CartItem';
import type { PurchaseCartItem } from '@/types/purchaseCart';

interface CartListProps {
  items: PurchaseCartItem[];
  loading: boolean;
  selectedItems: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onSplit: (data: any) => void;
  submitting: boolean;
}

export const CartList: React.FC<CartListProps> = ({
  items,
  loading,
  selectedItems,
  onToggleSelect,
  onToggleSelectAll,
  onUpdate,
  onDelete,
  onSplit,
  submitting,
}) => {
  if (!loading && items.length === 0) {
    return (
      <Empty
        description="购物车是空的"
        style={{ margin: '40px 0' }}
      />
    );
  }

  const allSelected = items.length > 0 && selectedItems.size === items.length;

  // 按物料类型分组
  const groupedItems = items.reduce((acc, item) => {
    const type = item.materialType || 'OTHER';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, PurchaseCartItem[]>);

  const typeLabels: Record<string, string> = {
    FABRIC: '面料类',
    LINING: '里料类',
    ACCESSORY: '辅料类',
    OTHER: '其他',
  };

  return (
    <div>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-container)' }}>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedItems.size > 0 && !allSelected}
          onChange={onToggleSelectAll}
        >
          全选 ({selectedItems.size}/{items.length})
        </Checkbox>
      </div>
      
      {Object.entries(groupedItems).map(([type, typeItems]) => (
        <div key={type}>
          <div style={{ padding: '8px 16px', fontWeight: 600, background: 'var(--color-bg-highlight)' }}>
            {typeLabels[type]} ({typeItems.length})
          </div>
          {typeItems.map(item => (
            <CartItem
              key={item.id}
              item={item}
              selected={selectedItems.has(item.id)}
              onToggleSelect={() => onToggleSelect(item.id)}
              onUpdate={(data) => onUpdate(item.id, data)}
              onDelete={() => onDelete(item.id)}
              onSplit={(qty) => onSplit({ itemId: item.id, splitQuantity: qty })}
              submitting={submitting}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
```

**CartItem.tsx:**
```tsx
import React, { useState } from 'react';
import { Checkbox, InputNumber, Button, Popconfirm, message } from 'antd';
import { EditOutlined, SplitCellOutlined, DeleteOutlined } from '@ant-design/icons';
import type { PurchaseCartItem, UpdateCartItemRequest } from '@/types/purchaseCart';

interface CartItemProps {
  item: PurchaseCartItem;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (data: UpdateCartItemRequest) => void;
  onDelete: () => void;
  onSplit: (quantity: number) => void;
  submitting: boolean;
}

export const CartItem: React.FC<CartItemProps> = ({
  item,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
  onSplit,
  submitting,
}) => {
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(item.quantity);

  const handleSave = () => {
    onUpdate({ quantity });
    setEditing(false);
  };

  const handleSplit = () => {
    if (quantity >= item.quantity) {
      message.warning('拆分数量必须小于当前数量');
      return;
    }
    onSplit(quantity);
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
        background: selected ? 'var(--color-bg-highlight)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Checkbox checked={selected} onChange={onToggleSelect} />
        
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {item.materialName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {item.materialCode} {item.specifications && `| ${item.specifications}`}
          </div>
          
          {item.sourceNo && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              来源：{item.sourceNo} ({item.sourceQuantity}{item.unit})
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>供应商：{item.supplierName || '-'}</span>
            <span style={{ fontSize: 12 }}>数量：</span>
            {editing ? (
              <>
                <InputNumber
                  size="small"
                  value={quantity}
                  onChange={(v) => setQuantity(v || 0)}
                  min={0.01}
                  precision={2}
                  style={{ width: 80 }}
                />
                <Button size="small" type="primary" onClick={handleSave} loading={submitting}>
                  保存
                </Button>
              </>
            ) : (
              <>
                <span>{item.quantity} {item.unit}</span>
                {item.totalAmount && (
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    | ¥{item.totalAmount.toFixed(2)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(!editing)}
          />
          <Button
            type="text"
            size="small"
            icon={<SplitCellOutlined />}
            onClick={handleSplit}
            disabled={item.quantity <= 1}
          />
          <Popconfirm
            title="确认删除？"
            onConfirm={onDelete}
            okText="确认"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
    </div>
  );
};
```

**MergeSuggestion.tsx:**
```tsx
import React from 'react';
import { Card, Button, List, message } from 'antd';
import type { MergeSuggestion } from '@/types/purchaseCart';

interface MergeSuggestionProps {
  suggestions: MergeSuggestion[];
  onMerge: (request: any) => void;
  submitting: boolean;
}

export const MergeSuggestion: React.FC<MergeSuggestionProps> = ({
  suggestions,
  onMerge,
  submitting,
}) => {
  if (suggestions.length === 0) return null;

  const handleMerge = (suggestion: MergeSuggestion, targetSupplierName?: string) => {
    const targetItem = targetSupplierName
      ? suggestion.items.find(item => item.supplierName === targetSupplierName)
      : suggestion.items[0];
    
    if (!targetItem) return;

    const totalQty = suggestion.items.reduce((sum, item) => sum + item.quantity, 0);
    
    onMerge({
      itemIds: suggestion.items.map(item => item.id),
      targetQuantity: totalQty,
      targetSupplierId: targetItem.id,
      targetSupplierName: targetSupplierName || suggestion.items[0].supplierName,
    });
    message.success('合并成功');
  };

  return (
    <Card
      size="small"
      title={
        <span style={{ color: 'var(--color-warning)' }}>
          🔔 推荐合并 ({suggestions.length})
        </span>
      }
      style={{ margin: 12 }}
    >
      {suggestions.map((suggestion, index) => (
        <div key={index} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {suggestion.materialName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {suggestion.materialCode}
          </div>
          <List
            size="small"
            dataSource={suggestion.items}
            renderItem={(item) => (
              <List.Item style={{ padding: '4px 0' }}>
                <span>{item.supplierName}: {item.quantity}</span>
              </List.Item>
            )}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              size="small"
              type="primary"
              onClick={() => handleMerge(suggestion)}
              loading={submitting}
            >
              合并
            </Button>
            <Button
              size="small"
              style={{ marginLeft: 8 }}
              onClick={() => handleMerge(suggestion, suggestion.items[0].supplierName)}
              loading={submitting}
            >
              保持独立
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
};
```

**CartPreview.tsx:**
```tsx
import React from 'react';
import { Modal, List, Button } from 'antd';
import type { CartPreview } from '@/types/purchaseCart';

interface CartPreviewProps {
  visible: boolean;
  data: CartPreview | null;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

export const CartPreview: React.FC<CartPreviewProps> = ({
  visible,
  data,
  onClose,
  onConfirm,
  submitting,
}) => {
  if (!data) return null;

  return (
    <Modal
      title="采购预览"
      open={visible}
      onCancel={onClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="confirm" type="primary" onClick={onConfirm} loading={submitting}>
          确认下单
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        将生成 <strong>{data.summary.totalGroups}</strong> 张采购单，
        共 <strong>{data.summary.totalItems}</strong> 件物料，
        合计 <strong>¥{data.summary.totalAmount?.toFixed(2)}</strong>
      </div>
      
      <List
        dataSource={data.purchaseGroups}
        renderItem={(group) => (
          <List.Item>
            <div style={{ width: '100%' }}>
              <div style={{ fontWeight: 600 }}>
                {group.materialName} ({group.materialCode})
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {group.supplierName} | {group.totalQuantity} | ¥{group.totalAmount?.toFixed(2)}
              </div>
              {group.sourceItems.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  来源：{group.sourceItems.map(s => `${s.sourceNo}(${s.quantity})`).join(' + ')}
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
    </Modal>
  );
};
```

**CartSummary.tsx:**
```tsx
import React from 'react';
import { Button } from 'antd';
import type { PurchaseCart } from '@/types/purchaseCart';

interface CartSummaryProps {
  cart?: PurchaseCart | null;
  selectedCount: number;
  onPreview: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

export const CartSummary: React.FC<CartSummaryProps> = ({
  cart,
  selectedCount,
  onPreview,
  onConfirm,
  submitting,
}) => {
  const totalItems = cart?.totalItems || 0;
  const totalAmount = cart?.totalAmount || 0;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-container)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          预计生成：<strong>{selectedCount}</strong> 件物料
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          合计：¥{totalAmount.toFixed(2)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={onPreview} disabled={totalItems === 0}>
          预览
        </Button>
        <Button
          type="primary"
          onClick={onConfirm}
          loading={submitting}
          disabled={selectedCount === 0}
        >
          确认下单
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: 导出组件**

**Create: `frontend/src/components/common/PurchaseCartDrawer/index.ts`**

```typescript
export { PurchaseCartDrawer } from './index';
export { usePurchaseCart } from '@/hooks/usePurchaseCart';
```

- [ ] **Step 4: 提交组件**

```bash
git add frontend/src/components/common/PurchaseCartDrawer/
git commit -m "feat(purchase-cart): add PurchaseCartDrawer components"
```

---

## 十二、Phase 11：集成到现有页面

### Task 11.1: 集成到物料采购页面

**Files:**
- Modify: `frontend/src/modules/production/pages/Production/MaterialPurchase/index.tsx`

- [ ] **Step 1: 添加购物车入口和弹窗**

```tsx
import { PurchaseCartDrawer } from '@/components/common/PurchaseCartDrawer';

// 在 MaterialPurchase 组件中添加状态和导入
const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

// 在页面顶部按钮区域添加购物车按钮
<Button 
  type="primary" 
  icon={<ShoppingCartOutlined />}
  onClick={() => setCartDrawerOpen(true)}
>
  采购购物车
</Button>

// 在组件底部添加购物车弹窗
<PurchaseCartDrawer
  open={cartDrawerOpen}
  onClose={() => setCartDrawerOpen(false)}
  onConfirmSuccess={() => {
    fetchMaterialPurchaseList();
    reloadCurrentDetail();
  }}
/>
```

- [ ] **Step 2: 提交集成代码**

```bash
git add frontend/src/modules/production/pages/Production/MaterialPurchase/index.tsx
git commit -m "feat(purchase-cart): integrate cart drawer to MaterialPurchase page"
```

---

## 十三、实现检查清单

### Phase 1: 数据库
- [ ] 迁移脚本创建完成
- [ ] 表结构验证通过

### Phase 2-6: 后端
- [ ] 实体类编译通过
- [ ] Mapper XML 语法正确
- [ ] Service 方法测试通过
- [ ] Orchestrator 业务逻辑正确
- [ ] Controller API 测试通过

### Phase 7-10: 前端
- [ ] TypeScript 类型定义完整
- [ ] API 服务调用正确
- [ ] Hook 状态管理正常
- [ ] 组件渲染正常
- [ ] 样式符合设计规范

### Phase 11: 集成
- [ ] 购物车入口可见
- [ ] 弹窗正常打开/关闭
- [ ] 添加/删除物料正常
- [ ] 合并/拆分功能正常
- [ ] 预览/确认下单正常
- [ ] 购物车持久化正常

---

## 十四、后续迭代建议

1. **智能合并推荐优化**：根据历史采购数据推荐最优供应商
2. **BOM 缺料集成**：从 BOM 缺料直接添加购物车
3. **库存预警**：添加时检查库存，低于安全库存提示
4. **多端同步优化**：小程序/H5 适配
5. **离线支持**：支持离线添加，联网后同步

---

**计划版本历史**

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-05-30 | 初始实现计划 |
