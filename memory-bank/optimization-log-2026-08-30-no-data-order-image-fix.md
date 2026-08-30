# 优化日志：无资料下单图片丢失根治（P0）+ 开放选款（P1）

- 日期：2026-08-30
- 编号：D-247
- 影响面：后端 1 文件 + 小程序 3 文件（× 4 副本）
- 数据库：**零迁移**（复用既有 `t_order_image`）

---

## 一、P0：无资料下单上传的图片 100% 丢失

### 现象
用户在「无资料下单」页拍照/选图 → 跳表单页能看到图 → 提交成功 →
订单列表/详情**看不到任何款式图**，图片彻底消失。

### 根因（四层叠加，缺一不可）

| # | 层 | 事实 |
|---|---|---|
| 1 | 小程序上传 | `wx.chooseImage` 返回**本地临时路径**（`wxfile://tmp_xxx`），非持久 URL |
| 2 | 参数传递 | `goToNoDataOrderForm` 传 `tempImage=`，仅用于表单页显示 |
| 3 | 提交 | `_doSubmit` payload **完全没有图片字段** |
| 4 | 后端 | `ProductionOrder.coverImage` / `styleImage` 是 **`@TableField(exist = false)`**——不入库，靠 `fillStyleCover` 按 **styleNo** 三级回退动态填充（款式 cover → 款式附件 → 模板封面）。无资料订单无款式档案、styleNo 可能为空 → **三级全空** |

第 4 层是根源：这两个字段"看起来像图片字段，实际不是存储字段"，
所以"图片没传"在代码审查时非常容易被忽略。

### 修复方案

**前置发现（关键）**：后端已有完整订单图片体系，无需新建表：
- `OrderImage` 实体（`t_order_image`）+ `OrderImageService`
- `OrderImageOrchestrator.addImage(orderNo, imageUrl, thumbnailUrl)`
- `POST /api/production/order-image`
- 小程序 `api.production.addOrderImage()` 已封装（`api-modules/production.js:440`）
- PC 端 `OrderImageManager` 组件已在用

**小程序** `pages/order/create/form/index.js`
```js
_persistCoverImage: function (orderNo) {
  const cover = this.data.coverImage;
  if (!orderNo || !cover) return;
  // 只有本地临时文件需要上传（wxfile:// 或 http://tmp/ 开头）
  const isLocal = cover.indexOf('wxfile://') === 0 || cover.indexOf('http://tmp/') === 0;
  const uploadTask = isLocal ? api.common.uploadImage(cover) : Promise.resolve(cover);
  uploadTask.then(url => url ? api.production.addOrderImage(orderNo, url, url) : null)
    .catch(() => wx.showToast({ title: '订单已创建，款式图保存失败，可在订单详情补传' }));
}
```
时序：**建单成功后再存图**——图片是附属信息，失败不阻断下单；
且后端 `addImage` 会校验订单存在，顺序上也要求先建单。

**后端** `ProductionOrderQueryService`
- 新增 `fillCoverFromOrderImages(records)`：按 orderNo 批量查 `t_order_image` 回填
- 调用点两处：`fillStyleCover` 末尾（覆盖三级回退）+ `styleNos.isEmpty()` 提前 return 分支
- 显式带 `tenantId`（项目未启用多租户插件）
- fail-safe：异常只 warn 不抛

**覆盖范围**：`fillStyleCover` 共 6 个调用点，因改在方法内部而**全部自动受益**：
1. `ProductionOrderQueryService:279` 订单列表 `enrichOrderList`
2. `ProductionOrderQueryService:385` 订单详情 `fillDetails`
3. `CuttingTaskQueryHelper:223` 裁剪任务
4. `ProductWarehousingPendingHelper:304` 成品入库待办
5. `ProductWarehousingQueryHelper:219` 成品入库查询
6. `ProductionOrderQueryService:385` 另一处列表

---

## 二、P1：无资料下单开放「从已有款式下单」

原 `create/index.js` 在 noData tab 时加载全量款式存进 `_allStyles`，
但 wxml 的 noData 分支**只渲染上传区，列表根本不显示** → 那个 `pageSize:500` 请求白发。

改为两条路径并存：
- **方式一**：上传款式图片（原有）
- **方式二**：从已有款式下单——沿用款式资料，自行填写颜色与码数

现实中"款已在系统里，但这次下单的颜色码数和档案不一样"很常见，
这种情况走无资料下单选款比纯上传图更合理。

布局改 flex：`.page` 竖向 flex → `.list-section` `flex:1` → `.grid-scroll` `flex:1`，
替代原 `calc(100vh - 120px)` 硬编码，上面有无上传区都能自适应高度。

---

## 三、自查发现并修复的引入问题

P1 让无资料下单支持选款式后，`onStyleTap` 会传 `coverImage`（网络图 URL），
但 `form/index.js` 的 isNoData 分支**只读 `tempImage`**：
```js
if (isNoData) {
  coverImage = decodeURIComponent(opts.tempImage || '');   // ❌ 方式二拿不到图
}
```
→ 方式二封面丢失。已改为 `opts.coverImage || opts.tempImage`。

**教训：新增入口路径时，必须回头检查接收方是否覆盖了该入口的参数形态。**

---

## 四、本批刻意未做（风险 > 收益）

| 项 | 原因 |
|---|---|
| 删死页面 `pages/order/no-data-create` | 注册在 `app.json` + `h5-web/generated/route-manifest.json`；改 app.json 出错会导致小程序启动失败，收益（清一个空壳页）远小于风险 |
| 款式批量多选下单 | 改动面广，本批不做 |
| `pageSize: 500` 下调 | 可能导致款式加载不全，保持原值 |
| 款号强制校验 | 无资料下单本就可能没款号，强制校验会阻碍正常场景 |

用户明确要求"不要出现问题"，故本批只做高价值、低风险的改动。

---

## 五、验证

- [x] 后端 `mvn compile` **BUILD SUCCESS**（EXIT=0，2297 源文件，仅 2 个历史 warning）
- [x] 四副本 `node --check` 全过
- [x] 3 个改动文件 MD5 四副本完全一致
- [x] WXML 标签栈全闭合；事件处理器（create 5 / form 36）全部有 JS 实现
- [x] WXSS 括号：create 93/93、form 79/79
- [ ] 真机验收：无资料下单上传图 → 订单列表与详情能看到图

**P0 铁律自查**
- 无 Entity 字段新增/变更（复用既有 `OrderImage`）→ 无需 Flyway ✅
- 新增查询显式带 `tenant_id` ✅（项目未启用多租户插件，必须显式）
- 不改已执行 Flyway 脚本 ✅
- 无 API 路径变更（复用既有 `/api/production/order-image`）✅
- 无权限码新增 ✅
- 后端改动已 `mvn compile` 验证 ✅

---

## 六、经验沉淀

1. **`@TableField(exist = false)` 的"假字段"是审查盲区**。
   `coverImage` / `styleImage` 看着像图片字段，实际不入库、靠 styleNo 动态回填。
   凡遇到"某个字段莫名是空的"，先确认它是不是 `exist = false` 的计算字段。
2. **动手前先搜是否已有现成体系**。本次若直接新建订单图表 + Flyway 迁移，
   是多写一个表、多一次迁移、多一分风险；实际后端早就有 `OrderImage` 全套。
3. **改在被调用的方法内部，而非各个调用点**。
   `fillStyleCover` 有 6 个调用点，改方法内部一处即全覆盖，
   也避免以后新增调用点时漏掉。
4. **装饰性填充逻辑必须 fail-safe**。封面回填失败只应 warn，
   绝不能让订单列表/详情查询整体失败。
5. **本项目未启用 MyBatis-Plus 多租户插件**（`TenantLineInnerInterceptor` 零命中），
   所有 `lambdaQuery()` 都不会自动带 `tenant_id`，新写查询必须显式加。
   取租户上下文用 `UserContext.tenantId()`（静态），不是 `getTenantId()`（实例）。
6. **新增入口路径要回查接收方**。P1 加了"选已有款式"入口，
   差点因为接收方只读 `tempImage` 而丢图。
