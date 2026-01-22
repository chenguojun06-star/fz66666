# 供应商管理重命名说明

## 📋 改动概述

将"加工厂管理"统一改名为"供应商管理"，使其能够同时管理：
1. **加工厂供应商**：负责生产加工的工厂
2. **面辅料供应商**：提供原材料的供应商

## ✅ 已完成修改

### 1. 前端修改

#### 菜单和路由
- ✅ `routeConfig.ts` - 菜单显示名称改为"供应商管理"
- ✅ `Dashboard/index.tsx` - 快捷入口改为"供应商管理"

#### 页面标题和UI
- ✅ `FactoryList.tsx` - 页面标题改为"供应商管理"
- ✅ 表格列标题：加工厂编码/名称 → 供应商编码/名称
- ✅ 搜索框placeholder：加工厂编码/名称 → 供应商编码/名称
- ✅ 弹窗标题：新增/编辑/查看加工厂 → 新增/编辑/查看供应商
- ✅ 表单标签：加工厂编码/名称 → 供应商编码/名称
- ✅ 删除确认框：删除该加工厂 → 删除该供应商
- ✅ 错误提示信息中的"加工厂"改为"供应商"

### 2. 后端修改

#### 实体类
- ✅ `Factory.java` - 类注释改为"供应商实体类（包括加工厂和面辅料供应商）"
- ✅ 添加字段注释说明：factoryCode→供应商编码，factoryName→供应商名称

#### 业务逻辑
- ✅ `FactoryOrchestrator.java` - 错误提示"加工厂不存在"改为"供应商不存在"

#### 配置文件
- ✅ `DataInitializer.java` - 权限初始化改为"供应商管理"

### 3. 数据库说明

**表名保持不变**：`t_factory`（避免破坏现有数据）

**字段含义更新**：
| 字段名 | 原含义 | 新含义 |
|-------|--------|--------|
| factoryCode | 加工厂编码 | 供应商编码 |
| factoryName | 加工厂名称 | 供应商名称 |
| contactPerson | 联系人 | 联系人 |
| contactPhone | 联系电话 | 联系电话 |
| address | 地址 | 地址 |
| status | 状态 | 状态（active/inactive）|

---

## 🔗 数据通用性

### 使用场景

#### 1. 生产管理 - 加工厂选择
在生产订单、裁剪任务等模块中，从供应商列表选择**加工厂类型的供应商**。

#### 2. 物料采购 - 面辅料供应商
在物料采购模块（MaterialPurchase）中：
- 面料采购：从供应商列表选择**面料供应商**
- 辅料采购：从供应商列表选择**辅料供应商**

### 数据复用方式

**前端**：
```tsx
// 获取所有供应商（面辅料+加工厂）
const response = await api.get('/system/factory/list', { 
  params: { status: 'active' } 
});

// 根据类型筛选（可选扩展）
const fabricSuppliers = suppliers.filter(s => s.type === 'fabric');
const factorySuppliers = suppliers.filter(s => s.type === 'factory');
```

**后端**：
- API路径：`/api/system/factory/*`
- 实体类：`Factory`
- 表名：`t_factory`

---

## 💡 未来扩展建议

### 1. 添加供应商类型字段（可选）

如需区分供应商类型，可添加字段：

```sql
ALTER TABLE t_factory ADD COLUMN supplier_type VARCHAR(20) DEFAULT 'factory' 
COMMENT '供应商类型：factory-加工厂, fabric-面料, accessory-辅料';
```

相应的Java实体：
```java
/** 供应商类型：factory-加工厂, fabric-面料, accessory-辅料 */
private String supplierType;
```

### 2. 供应商能力标签（可选）

添加JSON字段存储供应商能力：
```sql
ALTER TABLE t_factory ADD COLUMN capabilities JSON 
COMMENT '供应商能力标签：["加工", "面料", "辅料"]';
```

### 3. 供应商评级（可选）

```sql
ALTER TABLE t_factory ADD COLUMN rating DECIMAL(3,2) COMMENT '供应商评级(0-5)';
ALTER TABLE t_factory ADD COLUMN cooperation_years INT COMMENT '合作年限';
```

---

## 📝 注意事项

### 1. 数据兼容性
- ✅ 表名未改变，现有数据完全兼容
- ✅ 字段名未改变，现有代码继续运行
- ✅ 仅UI显示名称改变

### 2. API路径
- ✅ 路径保持不变：`/api/system/factory/*`
- ✅ 避免前端大量代码修改

### 3. 权限代码
- ✅ 权限代码保持：`MENU_FACTORY`
- ✅ 已有用户权限自动生效

---

## 🎯 改名效果

### 之前
```
系统设置
  ├── 个人中心
  ├── 人员管理
  ├── 角色管理
  └── 加工厂管理  ← 名称局限
```

### 之后
```
系统设置
  ├── 个人中心
  ├── 人员管理
  ├── 角色管理
  └── 供应商管理  ← 涵盖加工厂+面辅料供应商
```

---

## ✅ 验证清单

- [x] 前端菜单显示"供应商管理"
- [x] 页面标题、表头、表单标签全部改为"供应商"
- [x] 后端注释说明供应商概念
- [x] Dashboard快捷入口正确
- [x] 搜索、新增、编辑、删除功能正常
- [x] 错误提示信息准确

---

**修改时间**: 2025-01-21  
**影响范围**: 前后端UI文案 + 后端注释  
**数据影响**: 无（表结构和字段名未变）  
**向后兼容**: ✅ 完全兼容

---

## 🚀 下一步使用

现在可以在"供应商管理"模块中：
1. 添加加工厂信息
2. 添加面料供应商信息  
3. 添加辅料供应商信息

所有供应商共用一个管理入口，数据统一维护！
