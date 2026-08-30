# 优化日志：手机端下单页码数一坨根治 + 布局工整化 + 对齐PC批量操作

- 日期：2026-08-30
- 编号：D-246
- 影响面：纯小程序（无后端改动、无 API 改动、无数据库改动）
- 文件：1 新建 + 4 修改 × 4 副本

---

## 一、P0：码数全部堆在一个 chip（用户截图反馈）

### 现象
下单页「下单数量 → 码数」区只有一个超长 chip：
`XS(155/72A)/S(160/76)/M(165/80)/L(170/84)/XL(175/88)/.../8XL(200/120)制码`

### 根因
款式 `t_style_info.size` 为旧 `/`-拼接格式。

| 端 | 实现 | 结果 |
|---|---|---|
| PC | `frontend/src/utils/styleOptions.ts → splitStyleOptions` | 7 个 chip ✅ |
| 小程序 | `pages/order/create/form/index.js` `.split(',')` | 1 个长 chip ❌ |

PC 的实现关键：优先按 `,` / `，` / `、` / 空白 切；
只有当**完全没有**标准分隔符时，才退化按 `/` 切，且只切**括号外**的 `/`
（`L(170/84)` 内部的 `/` 被 `depth` 计数保护）。

小程序侧缺这套逻辑，所以 `/`-拼接的旧数据整段变成一个码数。

### 修复
新建 `miniprogram/utils/styleOptions.js`，ES5 1:1 复刻 PC 的
`splitStyleOptions` + `mergeDistinctOptions`，注释内写明两种分隔符的坑，
防止后人"简化"成 `split(/[/,]/)` 再次踩坑。

### 实测
```
入参: XS(155/72A)/S(160/76)/M(165/80)/L(170/84)/XL(175/88)/XXL(180/92)/XXXL(185/96)
旧实现 split(",")         => 1 个码数   <-- BUG
新实现 splitStyleOptions  => 7 个码数   ✅
```

边界场景全过：

| 场景 | 入参 | 结果 |
|---|---|---|
| 新 `,` 拼接 | `S,M,L,XL,XXL` | 5 项 ✅ |
| 无括号 `/` | `XS/S/M/L` | 4 项 ✅ |
| 中文逗号/顿号 | `黑色，白色、红色` | 3 项 ✅ |
| 排序 | 乱序 7 码 | XS→XXXL 小到大 ✅ |
| 批量去重 | 已有`黑色` + `白色,黑色,红色` | 3 项不重复 ✅ |
| 空值 | `null` / `''` / `undefined` | `[]` ✅ |

---

## 二、P1：批量操作提效（用户："不要一个个输入"）

对齐 PC `MultiColorOrderEditor` 的批量能力，并补上手机端专属的两项：

| 能力 | PC | 小程序（本批） |
|---|---|---|
| 全选颜色 | Button | `onSelectAllColors` ✅ |
| 全选码数 | Button | `onSelectAllSizes` ✅ |
| 清空 | Button | `onClearSelection` ✅ |
| 全部铺量 | Button + InputNumber | `onQuickFill` ✅ |
| **按行铺量**（点颜色名铺整行） | 无 | `onRowFill` ✅ 新增 |
| **按列铺量**（点码数表头铺整列） | 无 | `onColFill` ✅ 新增 |
| 批量粘贴颜色/码数 | Select mode=tags | 输入框可粘贴 `S,M,L` ✅ |

手机屏幕小、逐格输入体验差，行/列铺量是手机端必须有的提效动作。

---

## 三、P1：布局工整化（用户："不要看着一锅粥"）

### 结构
六段分区：款式头 / 订单信息 / 时间与交期 / 业务信息 / 下单数量 / 定价方式。

### 关键改法
1. **并排字段改用块级小标签**：原来 `f-lbl`（行内固定 52px 宽，右对齐）在两列并排时
   标签与输入框挤在一行且宽度不够。新增 `f-lbl-blk` 块级小标题放在控件上方，
   两列等宽，视觉整齐。
2. **控件高度统一 40px**（输入框 / picker / 按钮），原来 36px 与 34px 混用。
3. **统计条**（对齐 PC 的 Tag 组）：开发色 N / 开发码 N / 已选 N色N码 / 组合 N。
4. **矩阵横滑 + 左侧固定**：`scroll-view scroll-x` + 颜色列 `position:sticky; left:0`，
   码数再多也不挤压；左侧列同时显示颜色名与行小计；底部独立「码数合计」行。
5. **底部提交栏加总数量**：下单前即可看到合计。

### WXML 两处刻意规避
- **不用动态数组索引**：行小计用 `row.total`、列小计用 `{size,total}` 对象数组，
  避免 `rowTotals[ridx]` 这类写法的兼容风险。
- **不用 `&&`**：`wx:elif="{{a.length && b.length === 0}}"` 改为 `wx:elif="{{b.length === 0}}"`，
  逻辑等价（此时 `gridRows` 为空必然是色或码有一者为空），可读性更好。

---

## 四、P1：筛选条件对齐 PC

| 字段 | 改前 | 改后 |
|---|---|---|
| 纸样师 | 自由输入 | picker（复用已有 `api.system.listUsers`） |
| 跟单员 | 自由输入 | picker（同上，默认带出当前登录人） |
| 下单类型 | 纯英文 `FOB` | 带中文 `FOB 离岸价` / `ODM 原厂设计` / `OEM 代工生产` / `CMT 来料加工` |
| 品类 | 有资料时被字典首项覆盖 | 保留款式自带品类，仅在为空时兜底 |

**未做（下批）**：客户选择器。PC 用 `CustomerSelect` → `/crm/customers/list`，
小程序无 crm 模块，需先补 `api-modules/crm.js`。本批为控制改动面保留自由输入。

---

## 五、无资料下单链路对齐

- `pages/order/create/index.js`：`onStyleTap` 无论哪种下单都传 `category`
  （原先只有正常下单传，无资料下单会落到字典首项）。
- 无资料下单时款号 / 款名可手填（原先是只读文本且为空）。

---

## 六、变更清单与验证

**文件（5 个 × 4 副本）**
- `utils/styleOptions.js`【新建】
- `pages/order/create/form/index.js`
- `pages/order/create/form/index.wxml`
- `pages/order/create/form/index.wxss`
- `pages/order/create/index.js`

副本：`miniprogram` / `h5-web/source-miniapp` / `h5-web/public/source-miniapp` / `h5-web/dist/source-miniapp`

**验证结果**
- [x] 四副本 `node --check` 全部通过
- [x] 5 文件 MD5 四副本完全一致
- [x] WXML 标签栈校验：329 标签全闭合，四副本一致
- [x] 36 个事件处理器在 JS 中全部有实现
- [x] WXSS 大括号 79/79 配对
- [x] 核心切分逻辑 7 场景实测通过
- [ ] 微信开发者工具真机编译 + 多码数横滑 + 键盘弹出不挤压（待用户验收）

**P0 铁律自查**
- 无后端改动 / 无 Entity 变更 → 无需 Flyway ✅
- 无 API 路径变更 ✅
- 无权限码新增 ✅
- 不改已执行 Flyway 脚本 ✅
- 无 `tenant_id` 相关查询（纯展示层）✅
- 涉及多文件（5×4）→ 已执行四副本全量语法与结构校验 ✅

---

## 七、经验沉淀

1. **PC 修过的解析类 bug，另一端会原样复发**——如果工具函数没有跨端复用。
   凡"字符串解析 / 格式化 / 排序"类逻辑，应抽到共享 utils，而不是各端各写一份。
   本次小程序缺的就是 PC 早在 D-206 就修好的 `splitStyleOptions`。
2. **旧数据的分隔符改造要双向兼容**：新数据用 `,` 写，读的时候必须兼容旧 `/`，
   否则历史数据会静默出错（而且只在特定款式上暴露，很难发现）。
3. **手机端的"批量"要比 PC 更进一步**：PC 的全选 / 全部铺量在手机上不够用，
   行级、列级铺量才是真正省点击的动作。
4. **WXML 模板尽量只用点号访问**，动态索引与 `&&` 虽被支持，但会拖累可读性与工具链校验。
