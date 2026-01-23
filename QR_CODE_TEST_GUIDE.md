# 裁剪码识别测试指南

## 🚨 紧急问题：订单不存在（404错误）

### 错误信息
```
生产订单不存在
statusCode: 404
url: /api/production/order/detail/PO20260122001
```

### 问题原因
**数据库中没有订单号 `PO20260122001` 的记录**

### 快速解决方案

#### 方案1：创建测试订单（推荐）

**步骤1：连接数据库**
```bash
# 连接Docker MySQL容器
docker exec -it fashion-mysql-simple mysql -uroot -p123456 fashion_supplychain

# 或者使用本地MySQL客户端
mysql -h127.0.0.1 -P3307 -uroot -p123456 fashion_supplychain
```

**步骤2：执行测试数据脚本**
```bash
# 在项目根目录执行
cd /Users/guojunmini4/Documents/服装66666
mysql -h127.0.0.1 -P3307 -uroot -p123456 fashion_supplychain < scripts/create_test_order_PO20260122001.sql
```

**步骤3：验证数据**
```sql
-- 查看订单
SELECT order_no, style_no, order_quantity, status 
FROM t_production_order 
WHERE order_no = 'PO20260122001';

-- 查看裁剪菲号
SELECT bundle_no, color, size, quantity, qr_code 
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001';
```

**步骤4：获取测试二维码**
```sql
-- 获取所有菲号的二维码内容
SELECT CONCAT('菲号', LPAD(bundle_no, 2, '0'), ': ', qr_code) AS 测试二维码
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001'
ORDER BY bundle_no;
```

**测试二维码示例：**
```
菲号01: PO20260122001-ST001-红色-M-20-1
菲号02: PO20260122001-ST001-红色-L-15-2
菲号03: PO20260122001-ST001-蓝色-M-25-3
菲号04: PO20260122001-ST001-蓝色-L-20-4
菲号05: PO20260122001-ST001-白色-M-10-5
菲号06: PO20260122001-ST001-白色-L-10-6
```

#### 方案2：在PC端创建订单

```
1. 登录PC管理端
2. 基础资料 → 下单管理 → 新增订单
3. 填写订单信息：
   - 订单号：PO20260122001
   - 款号：选择已有款号
   - 订单数量：100
   - 交期：30天后
4. 保存订单
5. 生产管理 → 裁剪管理 → 生成裁剪单
```

#### 方案3：使用已存在的订单号

```sql
-- 查询数据库中已有的订单
SELECT order_no, style_no, order_quantity, status
FROM t_production_order
WHERE delete_flag = 0
ORDER BY create_time DESC
LIMIT 10;

-- 使用查询到的订单号进行测试
```

---

## 问题：扫裁剪码无法识别

### 已完成修复 ✅
1. **后端API类型转换** - Controller现在可以接受字符串格式的bundleNo
2. **编译部署** - 新版本已部署到生产环境

---

## 二维码格式要求

### 标准格式（推荐）
```
PO20260122001-ST001-红色-M-20-1
```
**格式说明：**
- `PO20260122001` - 订单号
- `ST001` - 款号（必须以ST开头）
- `红色` - 颜色
- `M` - 尺码
- `20` - 数量
- `1` - 菲号（必须是数字）

**解析规则：**
1. 使用 `-` 分隔各字段
2. 款号以 `ST` 开头
3. 最后两个数字字段分别为：数量、菲号
4. 中间字段为颜色和尺码

---

### JSON格式
```json
{
  "orderNo": "PO20260122001",
  "styleNo": "ST001",
  "color": "红色",
  "size": "M",
  "quantity": 20,
  "bundleNo": 1
}
```
或
```json
{
  "orderNo": "PO20260122001",
  "cuttingBundleNo": "1",
  "quantity": 20
}
```

**字段别名支持：**
- `bundleNo` / `cuttingBundleNo` / `bundle`
- `quantity` / `qty` / `num` / `count`
- `orderNo` / `po` / `order` / `productionOrderNo`
- `styleNo` / `st` / `style` / `styleNumber`

---

## 测试步骤

### 步骤1：验证菲号已生成
在PC端确认已生成裁剪单：
```
PC端 → 生产管理 → 裁剪管理 → 生成裁剪单
```

验证方式：
- 订单号：`PO20260122001`
- 检查是否有菲号：01, 02, 03...
- 每个菲号应有明确的数量

### 步骤2：测试二维码格式
使用以下测试数据生成二维码：

**测试1：完整格式**
```
PO20260122001-ST001-红色-M-20-1
```
预期结果：
- ✅ 识别订单号：PO20260122001
- ✅ 识别款号：ST001
- ✅ 识别颜色：红色
- ✅ 识别尺码：M
- ✅ 识别数量：20
- ✅ 识别菲号：1

**测试2：简化格式**
```json
{"orderNo":"PO20260122001","bundleNo":1,"quantity":20}
```
预期结果：
- ✅ 识别订单号：PO20260122001
- ✅ 识别菲号：1
- ✅ 识别数量：20

**测试3：只有订单号**
```
PO20260122001
```
预期结果：
- ✅ 识别为订单级别二维码
- ⚠️ 需要手动选择工序
- ⚠️ 无菲号信息，无法自动识别车缝工序

### 步骤3：小程序扫码测试
1. 打开小程序扫码页面
2. 确保已选择"裁剪"或"车缝"工序
3. 点击扫码按钮
4. 扫描裁剪码

**成功标志：**
- ✅ 弹出确认对话框
- ✅ 显示订单号、款号、数量
- ✅ 自动填充菲号信息
- ✅ 提示：菲号01：做领（或其他工序）

**失败表现：**
- ❌ 提示"未获取到扫码内容"
- ❌ 提示"裁剪环节需先在PC端生成菲号"
- ❌ 提示"未找到对应的裁剪扎号"

---

## 常见问题排查

### 问题0：扫码后提示"识别失败，请重试"（新增）

**截图说明：**
- 二维码显示：PO202601122001
- 数量显示：null
- 订单显示：PO202601122001
- 环节显示：裁剪

**原因分析：**
1. 二维码**只包含订单号**，缺少菲号信息
2. 数量为null，说明二维码中没有数量信息
3. 这是**订单级别二维码**，不是裁剪菲号二维码

**区别说明：**
- **订单码**：`PO202601122001`（只有订单号）
- **裁剪码**：`PO202601122001-ST001-红色-M-20-1`（完整信息）

**解决方案：**

**方案1：生成正确的裁剪菲号二维码（推荐）**
```
格式：订单号-款号-颜色-尺码-数量-菲号
示例：PO202601122001-ST001-红色-M-20-1
```

**方案2：使用JSON格式二维码**
```json
{
  "orderNo": "PO202601122001",
  "styleNo": "ST001",
  "bundleNo": 1,
  "quantity": 20,
  "color": "红色",
  "size": "M"
}
```

**方案3：PC端生成标准裁剪单**
```
PC端 → 生产管理 → 裁剪管理 → 选择订单 → 生成裁剪单
系统会自动生成：
- 菲号01: PO202601122001-ST001-红色-M-20-1
- 菲号02: PO202601122001-ST001-红色-L-15-2
- ...
```

**验证步骤：**
1. 确认二维码包含完整信息（特别是菲号）
2. 在PC端查看裁剪表，确认菲号已生成
3. 使用正确格式的二维码重新扫描

### 问题1：提示"未找到对应的裁剪扎号"

**原因：**
- 菲号不存在于数据库
- 订单号或菲号不匹配

**解决方案：**
1. 确认PC端已生成裁剪单
2. 检查数据库：
```sql
SELECT * FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001';
```
3. 如果没有记录，需要在PC端生成

### 问题2：提示"裁剪环节需先在PC端生成菲号"

**原因：**
- 扫码类型选择了"裁剪"
- 但菲号未生成

**解决方案：**
1. 先在PC端生成裁剪单
2. 或者将扫码类型改为其他工序

### 问题3：菲号格式错误

**原因：**
- bundleNo不是数字
- 二维码格式不符合规范

**解决方案：**
检查二维码格式：
```javascript
// ❌ 错误格式
"PO20260122001-ST001-红色-M-20-一"  // "一"不是数字
"PO20260122001-ST001-红色-M-20-01A" // "01A"不是纯数字

// ✅ 正确格式  
"PO20260122001-ST001-红色-M-20-1"   // 数字1
"PO20260122001-ST001-红色-M-20-01"  // 字符串"01"会被转换为数字1
```

### 问题4：API调用失败（400错误）

**原因：**
- bundleNo参数类型不匹配（已修复✅）
- 后端版本未更新

**解决方案：**
1. 确认后端已重启（已完成✅）
2. 测试API：
```bash
curl "http://localhost:8088/api/production/cutting/by-no?orderNo=PO20260122001&bundleNo=1"
```

---

## API测试

### 测试裁剪菲号查询接口

**请求：**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8088/api/production/cutting/by-no?orderNo=PO20260122001&bundleNo=1"
```

**预期响应（成功）：**
```json
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "id": "xxx",
    "productionOrderNo": "PO20260122001",
    "bundleNo": 1,
    "quantity": 20,
    "qrCode": "PO20260122001-ST001-红色-M-20-1",
    "status": "created"
  }
}
```

**预期响应（失败）：**
```json
{
  "code": 500,
  "message": "未找到对应的裁剪扎号",
  "data": null
}
```

---

## 下一步操作

### 立即测试（推荐）
1. ✅ 后端已重启，新版本已部署
2. 在PC端生成测试订单的裁剪单
3. 使用上面的测试格式生成二维码
4. 在小程序中扫码测试

### 如果问题仍存在

**收集以下信息：**
1. 扫码的二维码内容（文本）
2. 小程序显示的错误提示
3. 订单号和菲号
4. 数据库中是否存在该菲号记录

**检查数据库：**
```sql
-- 查看裁剪单记录
SELECT * FROM t_cutting_bundle 
WHERE production_order_no = 'YOUR_ORDER_NO';

-- 查看扫码历史
SELECT * FROM t_scan_record
WHERE production_order_no = 'YOUR_ORDER_NO'
  AND bundle_no = 'YOUR_BUNDLE_NO'
ORDER BY scan_time DESC;
```

---

## 技术细节

### 前端解析流程
```
扫码 → parseScanContent()
  ↓
判断格式：JSON / URL参数 / 标准格式
  ↓
调用 parseFeiNo() 解析
  ↓
提取：orderNo, styleNo, color, size, quantity, bundleNo
  ↓
调用API验证菲号：getCuttingBundle(orderNo, bundleNo)
  ↓
成功 → 显示确认对话框
失败 → 显示错误提示
```

### 后端验证流程
```
Controller.getByBundleNo(String orderNo, String bundleNo)
  ↓
转换 bundleNo: String → Integer
  ↓
Service.getByBundleNo(String orderNo, Integer bundleNo)
  ↓
数据库查询：WHERE production_order_no = ? AND bundle_no = ?
  ↓
找到 → 返回菲号详情
未找到 → 抛出异常
```

---

## 总结

**已修复的问题：**
- ✅ 后端API类型转换（bundleNo String → Integer）
- ✅ 编译并重启后端服务

**待验证的点：**
- 📋 PC端是否已生成裁剪单
- 📋 二维码格式是否正确
- 📋 小程序扫码功能是否正常

**下一步：**
请按照上述测试步骤进行验证，如有问题请提供：
1. 实际扫描的二维码内容
2. 错误提示截图
3. 订单号和菲号信息
