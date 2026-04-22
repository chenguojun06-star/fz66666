# CRM客户端使用指南

## 概述

CRM客户端是一个独立的H5页面，为客户提供订单查询、账款管理等功能。客户可以通过浏览器访问`/crm-client/login`来使用这些功能。

## 功能特性

### 1. 登录页面 (`/crm-client/login`)
- 简洁美观的登录界面
- 渐变背景设计
- 响应式布局，适配各种移动设备

### 2. 首页/仪表板 (`/crm-client/dashboard`)
- 显示客户基本信息
- 订单统计卡片
- 账款统计卡片
- 订单状态概览
- 最近订单列表

### 3. 订单管理 (`/crm-client/orders`)
- 订单列表展示
- 状态筛选（全部、待生产、生产中、质检中、已完成、已入库）
- 订单详情查看
- 显示订单号、款号、数量、工厂、交期等信息

### 4. 订单详情 (`/crm-client/orders/:orderId`)
- 订单基本信息
- 款式信息
- 生产信息
- 关联账款信息

### 5. 账款管理 (`/crm-client/receivables`)
- 账款列表展示
- 状态筛选（全部、待付款、部分付款、已付清、已逾期）
- 账款详情查看
- 显示账款编号、金额、已付金额、到期日等信息

### 6. 账款详情 (`/crm-client/receivables/:receivableId`)
- 账款基本信息
- 金额信息（总金额、已付款、待付款）
- 关联信息
- 付款记录

### 7. 个人中心 (`/crm-client/profile`)
- 客户信息展示
- 联系信息（联系人、电话、邮箱、地址）
- 客户等级
- 行业、来源、备注
- 快捷菜单（我的订单、我的账款）
- 退出登录功能

## 技术实现

### 后端API

CRM客户端通过以下API与后端交互：

```
GET /api/crm-client/dashboard/:customerId
GET /api/crm-client/orders/:customerId
GET /api/crm-client/orders/:customerId/:orderId
GET /api/crm-client/receivables/:customerId
GET /api/crm-client/receivables/:customerId/:receivableId
GET /api/crm-client/profile/:customerId
```

### 数据存储

使用Zustand + localStorage持久化存储：
- 客户ID
- 客户信息
- 登录状态
- 当前页面

### UI设计

- 采用Material Design风格
- 统一的配色方案
- 底部Tab导航
- 卡片式布局
- 响应式设计，支持各种移动设备

## 访问方式

客户可以通过以下URL访问CRM客户端：

```
生产环境: https://your-domain.com/crm-client/login
测试环境: https://test-domain.com/crm-client/login
```

## 权限说明

- CRM客户端有独立的登录认证机制
- 每个客户只能看到自己的订单和账款信息
- 数据已按租户ID隔离，确保数据安全

## 后端实现说明

### 实体类

- `CustomerClientUser`: 客户用户实体（需要创建表）
- 关联到现有的`Customer`、`ProductionOrder`、`Receivable`等实体

### 数据库

需要创建以下表（如果还没有）：

```sql
CREATE TABLE t_customer_client_user (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36),
  tenant_id BIGINT,
  username VARCHAR(100),
  password_hash VARCHAR(255),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  status VARCHAR(20),
  last_login_time DATETIME,
  create_time DATETIME,
  update_time DATETIME,
  delete_flag INT DEFAULT 0
);
```

## 开发说明

### 文件结构

```
h5-web/src/pages/crm-client/
├── CrmLogin.jsx
├── CrmLogin.css
├── CrmDashboard.jsx
├── CrmDashboard.css
├── CrmOrders.jsx
├── CrmOrders.css
├── CrmOrderDetail.jsx
├── CrmOrderDetail.css
├── CrmReceivables.jsx
├── CrmReceivables.css
├── CrmReceivableDetail.jsx
├── CrmReceivableDetail.css
├── CrmProfile.jsx
├── CrmProfile.css
├── CrmClientApp.jsx
├── CrmClientApp.css
├── CrmClientTabBar.jsx
├── CrmClientTabBar.css
└── CrmCommon.css (通用样式)

h5-web/src/stores/
└── crmClientStore.js

h5-web/src/api/
└── crmClient.js

backend/src/main/java/com/fashion/supplychain/crm/
├── controller/CrmClientController.java
└── entity/CustomerClientUser.java
```

## 后续优化建议

1. **登录功能完善**
   - 实现真实的用户名密码认证
   - 添加忘记密码功能
   - 添加验证码

2. **功能增强**
   - 订单进度可视化
   - 账款通知提醒
   - 消息中心
   - 在线对账功能

3. **用户体验优化**
   - 添加骨架屏加载
   - 添加下拉刷新
   - 添加上拉加载更多
   - 添加搜索功能

4. **数据安全**
   - 添加会话超时
   - 添加设备绑定
   - 添加操作日志

## 联系与支持

如有问题，请联系系统管理员获取帮助。
