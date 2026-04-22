# CRM客户端系统实现指南

## 概述

本文档详细说明了服装供应链管理系统中CRM客户端的完整实现，包括租户连接机制、采购对接、用户认证等核心功能。

## 系统架构

### 数据模型关系

```
Tenant (租户)
  └── Customer (客户)
        └── CustomerClientUser (客户用户)
              └── ProductionOrder (生产订单)
                    ├── MaterialPurchase (采购单)
                    └── Receivable (应收账款)
```

## 数据库表结构

### CustomerClientUser 表

```sql
-- 创建客户用户表（如果不存在）
CREATE TABLE IF NOT EXISTS t_customer_client_user (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL COMMENT '关联客户ID',
  tenant_id BIGINT NOT NULL COMMENT '所属租户ID',
  username VARCHAR(100) NOT NULL UNIQUE COMMENT '登录用户名',
  password_hash VARCHAR(255) NOT NULL COMMENT '加密后的密码',
  contact_person VARCHAR(100) COMMENT '联系人姓名',
  contact_phone VARCHAR(50) COMMENT '联系电话',
  contact_email VARCHAR(100) COMMENT '联系邮箱',
  status VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/INACTIVE',
  last_login_time DATETIME COMMENT '最后登录时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  delete_flag INT DEFAULT 0 COMMENT '软删除标志：0正常1已删除',
  INDEX idx_customer_id (customer_id),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户用户表';
```

## 租户连接机制

### 工作原理

1. **用户登录认证**：
   - 客户通过用户名密码登录
   - 后端验证用户名密码是否正确
   - 从数据库中获取该用户关联的 tenant_id 和 customer_id

2. **租户数据隔离**：
   - 所有查询都通过 customer_id 关联
   - 通过 customer 表的 tenant_id 确保租户隔离
   - 采购单查询通过订单关联客户，确保只显示该客户相关采购

3. **登录流程**：
   ```
   用户输入用户名密码 → 验证用户信息 → 获取关联客户和租户 → 返回认证token → 存储到前端状态
   ```

## 采购对接功能

### 后端API接口

#### 1. 获取采购单列表

```
GET /api/crm-client/purchases/{customerId}?status={status}
```

**参数说明**：
- `customerId`: 客户ID（路径参数）
- `status`: 可选，采购状态过滤

**返回数据**：
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "id": "...",
        "purchaseNo": "PO-2024-001",
        "materialName": "棉布",
        "materialCode": "MAT-001",
        "purchaseQuantity": 1000,
        "arrivedQuantity": 500,
        "status": "partial",
        "supplierName": "供应商A",
        "totalAmount": 50000,
        "orderNo": "ORD-2024-001",
        "expectedArrivalDate": "2024-03-01",
        "createTime": "2024-02-01T10:00:00"
      }
    ],
    "total": 1
  }
}
```

#### 2. 获取采购单详情

```
GET /api/crm-client/purchases/{customerId}/{purchaseId}
```

**返回数据**：
```json
{
  "code": 200,
  "data": {
    "purchase": {
      // 完整采购单信息
    },
    "order": {
      // 关联的订单信息（如果有）
    }
  }
}
```

### 前端页面功能

#### 采购单列表页 (CrmPurchases)
- 显示所有采购单
- 支持按状态筛选
- 点击采购单进入详情
- 显示采购进度（已到货/总数量）
- 显示供应商信息

#### 采购单详情页 (CrmPurchaseDetail)
- 显示完整采购信息
- 显示物料规格
- 显示进度条（到货情况）
- 显示关联订单
- 显示预计和实际到货时间
- 显示备注信息

## 订单详情中的采购显示

在订单详情页面，会显示该订单关联的所有采购单：

```
关联采购
└── PO-2024-001: 棉布 (500/1000米) | ¥50000 | 部分到货
    点击进入采购详情
```

## 认证与安全

### 密码加密

使用 BCrypt 算法加密存储密码：

```java
// 注册用户时
String hashedPassword = BCrypt.hashpw(rawPassword, BCrypt.gensalt());

// 登录验证时
if (BCrypt.checkpw(inputPassword, storedHash)) {
  // 验证成功
}
```

### Token生成

```java
// 生成简单的token（实际项目应使用JWT）
String token = Base64.getEncoder().encodeToString(
  (userId + ":" + customerId + ":" + System.currentTimeMillis()).getBytes()
);
```

## 数据初始化示例

### 插入测试数据

```sql
-- 1. 确保存在客户（假设已存在）

-- 2. 创建客户用户
INSERT INTO t_customer_client_user (
  id, 
  customer_id, 
  tenant_id, 
  username, 
  password_hash, 
  contact_person, 
  contact_phone,
  status
) VALUES (
  UUID(), 
  '客户ID', 
  1, 
  'customer001', 
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- 123456的bcrypt
  '张三', 
  '13800138000',
  'ACTIVE'
);
```

**注意**：上述密码 hash 对应密码为 "123456"，实际生产环境应使用更安全的密码。

## 使用流程

### 客户首次使用

1. **联系管理员开通账号**：
   - 管理员在系统中创建客户
   - 为客户创建登录账号
   - 设置初始密码

2. **登录系统**：
   - 访问 /crm-client/login
   - 输入用户名密码
   - 登录成功后进入首页

3. **查看订单**：
   - 点击"订单"标签
   - 查看所有订单
   - 点击订单查看详情

4. **查看采购**：
   - 点击"采购"标签
   - 查看采购进度
   - 查看物料到货情况

5. **查看账款**：
   - 点击"账款"标签
   - 查看待付款和已付款项

## 前端集成说明

### 主路由配置

```javascript
{
  path: '/crm-client',
  element: <CrmClientApp />,
  children: [
    { path: 'dashboard', element: <CrmDashboard /> },
    { path: 'orders', element: <CrmOrders /> },
    { path: 'orders/:orderId', element: <CrmOrderDetail /> },
    { path: 'purchases', element: <CrmPurchases /> },
    { path: 'purchases/:purchaseId', element: <CrmPurchaseDetail /> },
    { path: 'receivables', element: <CrmReceivables /> },
    { path: 'receivables/:receivableId', element: <CrmReceivableDetail /> },
    { path: 'profile', element: <CrmProfile /> },
  ]
}
```

### 状态管理

使用 Zustand 管理 CRM 客户端状态：

```javascript
const useCrmClientStore = create(
  persist(
    (set, get) => ({
      token: null,
      customerId: null,
      tenantId: null,
      customer: null,
      user: null,
      isAuthenticated: false,
      
      setAuth: (data) => set({ ...data, isAuthenticated: true }),
      logout: () => set({ token: null, customerId: null, isAuthenticated: false }),
    }),
    { name: 'crm-client-storage' }
  )
);
```

## 部署说明

### 后端部署

确保以下类已正确创建并部署：
- CustomerClientUser (实体)
- CustomerClientUserMapper (MyBatis Mapper)
- CustomerClientUserService (服务)
- CustomerClientUserServiceImpl (服务实现)
- CrmClientController (控制器)

### 前端部署

确保以下文件已正确创建并部署：
- 所有 CRM 客户端页面组件
- API 封装模块
- 状态管理 Store
- 路由配置

## 注意事项

1. **租户隔离**：
   - 所有查询必须确保不会跨租户获取数据
   - 通过 Customer → Tenant 关系确保数据安全

2. **密码安全**：
   - 永远不存储明文密码
   - 使用强加密算法（BCrypt）
   - 定期提醒用户修改密码

3. **权限控制**：
   - 客户用户只能查看自己的订单、采购和账款
   - 不能访问其他客户数据

4. **性能优化**：
   - 采购单列表分页加载
   - 订单列表分页加载
   - 关联数据按需加载

## 后续优化方向

1. **消息通知**：
   - 采购到货通知
   - 订单进度变更通知
   - 账款到期提醒

2. **数据导出**：
   - 订单列表导出
   - 采购单导出
   - 账单导出

3. **移动端优化**：
   - 更好的触摸反馈
   - 下拉刷新
   - 上拉加载更多

4. **图表分析**：
   - 订单状态分布
   - 采购进度分析
   - 账款统计图表

---

*文档版本：1.0 | 最后更新：2024-02-01*
