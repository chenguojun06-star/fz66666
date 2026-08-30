# 优化日志：下单页补齐客户选择器 + 基础属性库齿轮

- 日期：2026-08-30
- 编号：D-248
- 影响面：**纯小程序**（零后端改动、零数据库改动、零 API 新增）
- 文件：1 新建 + 4 修改（× 4 副本）

---

## 一、客户选择器（对齐 PC 端 CustomerSelect）

### 接口选型

后端 `CrmController`（`@RequestMapping("/api/crm")`）有两个可选：

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/crm/customers/list` | POST | 分页 + 搜索，PC 端 `CustomerSelect` 用 |
| **`/api/crm/customers/active-list`** | GET | 后端注释即"活跃客户下拉列表（用于订单创建时选择客户）" ✅ 选用 |

选 `active-list` 的理由：
1. 后端注释就写着"用于订单创建时选择客户"，语义完全匹配
2. **已做多租户 + 工厂隔离**：`CustomerOrchestrator.listActive()` 内
   `.eq(Customer::getTenantId, tenantId)` + 工厂账号只返回自己关联的客户，
   前端 zero-effort 满足 P0 铁律 #7
3. 小程序 picker 不支持搜索，用不上 `list` 的 keyword 能力

### 改动

- **新建** `miniprogram/utils/api-modules/crm.js`
  （`listActiveCustomers()` / `listCustomers(params)`）
- `utils/api.js`：引入 + 聚合对象 + named exports 三处同步
- `form/index.js`：`_loadAux` 加载客户；新增 `onCustomerChange`；
  payload 补 `customerId` / `customerName`（**原先这两个字段恒为 null**）
- `form/index.wxml`：客户字段改 picker（`range-key="companyName"`），
  无客户数据时 `wx:else` 回退手输（与纸样师/跟单员同一容错模式）

### 走查补漏：picker 无法清空

小程序 `<picker>` 没有 antd Select 的 `allowClear`，选中后无法回到"未选"。
客户是选填字段，必须能清空。

**解法**：列表首项插入 `{ id: '', companyName: '（不选）' }`，
`onCustomerChange` 中 `item.id` 为空则清空 `customerId` 与 `company`。

---

## 二、基础属性库齿轮（对齐 PC 端 AttributeGroupLibraryModal）

### 关键前提：零后端改动

PC 端组件源码注释明确写着：
> 数据存储复用系统字典（t_dict，dictType=xxx_group，dictValue=JSON 数组），**无独立后端接口**。

所以小程序直接用已有的 `api.system.getDictList(type)` 读
`color_group` / `size_group` 即可，**不需要新增任何后端接口**。
（与 D-246 教训一致：动手前先确认有没有现成体系可复用，别新造轮子。）

### 改动

- `form/index.js`：
  - `onOpenAttrLib(e)` —— 按 `data-target`（color/size）读对应 group
  - `onApplyAttrGroup(e)` —— 按 `data-mode`（replace/append）应用
  - `onCloseAttrLib` / `onSheetTouchMove`
  - data 增 `attrLibOpen` / `attrLibTarget` / `attrLibTitle` / `attrLibGroups`
- `form/index.wxml`：颜色/码数区块标题右侧加「库」按钮；页面底部加半屏弹层
- `form/index.wxss`：`.mask` / `.sheet` / `.gitem` / `.chip.sm` 等

### 解析逻辑与 PC 端一致

```js
try {
  const parsed = JSON.parse(d.dictValue || '[]');
  if (Array.isArray(parsed)) values = parsed.map(...).filter(Boolean);
} catch (err) {
  // 非 JSON 走分隔符兼容（与 PC 端 parseGroupValues 同逻辑）
  values = String(d.dictValue || '').split(/[,，、]/).map(v => v.trim()).filter(Boolean);
}
```
存量数据可能两种格式并存，只支持一种会丢数据。

### 范围控制：只做「使用」，管理留 PC

组合的新增/编辑/删除属管理动作，手机端操作体验差、非高频。
本批只做「覆盖 / 追加」，管理仍走 PC 端。
追加走 `mergeDistinctOptions` 自动去重，与手动添加码数口径一致。

### 弹层两个细节
- `.sheet` 用 `catchtap` —— 否则点弹层内部会冒泡到 `.mask` 触发关闭
- `.mask` / `.sheet` 用 `catchtouchmove` —— 防滚动穿透

---

## 三、验证

- [x] 四副本 `node --check` 全过（api.js / crm.js / form/index.js / create/index.js）
- [x] 5 个文件 MD5 四副本完全一致
- [x] WXML：form 页 **40 个事件处理器全部有 JS 实现**，标签全闭合
- [x] WXSS 括号 **94/94** 配对
- [ ] 真机验收：选客户 → 订单带 customerId；点「库」→ 覆盖/追加生效

**P0 铁律自查**
- 零后端改动 → 无需 Flyway、无需 mvn compile ✅
- 客户接口后端已做 tenantId + 工厂隔离 ✅
- 无 API 路径新增（复用 `/api/crm/customers/active-list` 与 `/api/system/dict/list`）✅
- 无权限码新增 ✅

---

## 四、至此下单页优化闭环

| 编号 | 内容 |
|---|---|
| D-246 | 码数一坨根治 + 布局工整化 + 批量操作（全选/铺量/行列铺量） |
| D-247 | 无资料下单图片丢失根治（P0）+ 开放「从已有款式下单」 |
| D-248 | 客户选择器 + 基础属性库齿轮 |

仅剩**款式批量多选下单**未做（改动面广、非痛点）。

---

## 五、经验沉淀

1. **"下批待办"动手前先核实后端是否已有现成能力**。
   本批两项最终都零后端改动——客户有 `active-list`，属性库复用 `t_dict`。
   若直接新写接口 + 迁移，是多写一堆代码与风险。
2. **后端注释有时直接写明了接口用途**（如"用于订单创建时选择客户"），
   选接口时优先看注释，比只看方法名准。
3. **小程序 picker 缺 antd Select 的 `allowClear`**，
   凡可空的 picker 都应加「（不选）」首项兜底。
4. **弹层必须 catchtap 防冒泡误关、catchtouchmove 防滚动穿透**，
   这是小程序自写弹层的两个固定套路。
5. **解析兼容要两端保持一致**：PC 端 `parseGroupValues` 是
   "先 JSON，失败走分隔符"，小程序必须原样复刻，
   否则存量两种格式的数据会在某一端丢失。
