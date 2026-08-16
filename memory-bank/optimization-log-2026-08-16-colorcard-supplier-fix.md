# 优化日志 2026-08-16：色卡本重复入口下线 + 供应商色卡供应商名三连修复（D-100，P0）

## 用户反馈

1. 物料管理又出现独立「色卡本」菜单，与「物料新增」（物料资料库）里的供应商色卡重复
2. 编辑供应商色卡时选择供应商，供应商名字不显示；卡片显示"供应商: -"（联系人却正常显示）

## 根因

### Bug A：supplierName 保存丢失（P0 数据丢失）
`MaterialColorCardDialog.tsx` 中 supplierName 只通过 setFieldsValue 写入，**未注册为 Form.Item name**。
antd `validateFields()` 只返回注册字段 → 保存 payload 不含 supplierName → 后端存 null。
现象完全吻合：卡片"供应商: -" + 联系人"小刘 · 13144401544"有值（联系人是注册字段，存上了）。

### Bug B：选中供应商后联系人被清空
onChange 读取 `option?.contactPerson` / `option?.contactPhone`，但 `SupplierSelect` 的 option 暴露的字段名是
`supplierContactPerson` / `supplierContactPhone` → setFieldsValue(undefined) 把已有联系人清空。

### Bug C：supplierId 写入供应商名字
`option?.supplierId || value`：手动输入新供应商（option=undefined）时把名字字符串塞进 supplierId 字段。

### 架构问题：两套色卡系统并存
- 旧：`/color-card/*` + `pages/ColorCard` +「色卡本」菜单（t_color_card 表）
- 新：`/material-color-card/*` + 物料资料库"供应商色卡"视图（t_material_color_card 表）
- 后果：双入口双数据源；物料列表"查看色卡"查旧表，用户在新视图改的数据永远看不到

## 修复

| 文件 | 动作 |
|---|---|
| `MaterialDatabase/MaterialColorCardDialog.tsx` | supplierName 注册为 name（显示/回显/保存全通）；onChange 用正确 option 字段名；supplierId 只取 option?.supplierId |
| `MaterialColorCardOrchestrator.java` | +`getCardDetailByMaterialId()`：按 item.material_id 反查色卡+全部子项（tenant+deleteFlag 过滤） |
| `MaterialColorCardController.java` | +`GET /by-material/{materialId}` |
| `MaterialDatabase/index.tsx` | "查看色卡"改调 `/material-color-card/by-material/`（从旧表迁到新表） |
| `MaterialDatabase/MaterialColorItemsModal.tsx` | 适配新字段：cardName/cardCode/color/materialName；文案统一"供应商色卡" |
| `routeConfig.ts` | 删「色卡本」菜单项 + colorCard 权限映射 |
| `App.tsx` | `/warehouse/color-card` → Navigate 重定向到物料资料库 |
| `modules/warehouse/index.tsx` | 删 ColorCard lazy 导出 |
| `pages/ColorCard/**`（11 文件） | 整体删除 |
| 后端 ColorCard 6 文件（Controller/Orchestrator/2Mapper/2Entity） | 整体删除（零外部引用已核验；**t_color_card 表保留不动**） |

## 验证

- 前端 `tsc --noEmit`：0 错误
- 后端 `mvn compile`：通过
- 旧 `/color-card` API 前端调用：0 残留（全局搜索）
- 旧 ColorCard 类后端引用：0 残留（全局搜索）
- lint：改动文件全部 0 错误

## 遗留

- 存量旧色卡 supplierName=null：需编辑补选一次供应商保存（代码无法自动回填，supplierId 可能是脏名字）
- 旧表 t_color_card 历史数据无页面入口（数据在库未删，如需迁移再议）
- 部署后需端到端验证：编辑色卡选供应商 → 保存 → 卡片显示供应商名；物料列表"查看色卡"弹窗显示新表数据
