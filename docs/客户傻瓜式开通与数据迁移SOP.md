# 客户傻瓜式开通与数据迁移 SOP

## 目标
- 客户不需要懂软件，只要提供 3 份 CSV。
- 你们内部 1 人可在 1 天内完成开通与首批数据迁移。
- 系统默认交付全套功能，第三方对接 App 按需另购。

## 一句话流程
- 客户填模板 → 你们运行校验脚本 → 修正错误 → 导入数据 → 发账号上线。

## 开通后客户可直接调用上传接口
- 批量工厂上传：`POST /openapi/v1/factory/upload`（应用类型 `DATA_IMPORT`）
- 批量员工上传：`POST /openapi/v1/employee/upload`（应用类型 `DATA_IMPORT`）
- 批量款式上传：`POST /openapi/v1/style/upload`（应用类型 `DATA_IMPORT`）
- 批量工序上传：`POST /openapi/v1/process/upload`（应用类型 `DATA_IMPORT`）
- 批量订单上传：`POST /openapi/v1/order/upload`（应用类型 `DATA_IMPORT` 或 `ORDER_SYNC`）
- 批量采购上传：`POST /openapi/v1/material/purchase/upload`（应用类型 `DATA_IMPORT` 或 `MATERIAL_SUPPLY`）
- 返回统一包含：`successCount`、`failedCount`、`failedRecords`（可直接定位失败行）
- 详细调用示例见：[docs/OpenAPI-客户上传接口快速开始.md](docs/OpenAPI-%E5%AE%A2%E6%88%B7%E4%B8%8A%E4%BC%A0%E6%8E%A5%E5%8F%A3%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B.md)

## 客户只需要提交
- [docs/onboarding-templates/01_tenant_and_users.csv](docs/onboarding-templates/01_tenant_and_users.csv)
- [docs/onboarding-templates/04_factories.csv](docs/onboarding-templates/04_factories.csv)
- [docs/onboarding-templates/05_employees.csv](docs/onboarding-templates/05_employees.csv)
- [docs/onboarding-templates/06_styles.csv](docs/onboarding-templates/06_styles.csv)
- [docs/onboarding-templates/02_orders.csv](docs/onboarding-templates/02_orders.csv)
- [docs/onboarding-templates/03_material_purchase.csv](docs/onboarding-templates/03_material_purchase.csv)

## 你们内部 6 步
- 第 1 步：创建租户和主账号（超管后台）
- 第 2 步：创建 `DATA_IMPORT` 应用并发放 `appKey/appSecret`
- 第 3 步：运行校验脚本，修复模板错误（脚本会给出行号）
- 第 4 步：执行数据导入（工厂→员工→款式→工序→订单→采购）
- 第 5 步：处理失败行并补传（建议 `strict=false` 初次导入）
- 第 6 步：验收（租户隔离、关键页面是否可见、订单可扫码）

## 校验命令（傻瓜模式）
- 命令：`python3 scripts/customer_onboarding_validate.py --dir docs/onboarding-templates`
- 输出：
  - `✅ 校验通过`：可导入
  - `❌ 校验失败`：会打印文件名+行号+问题

## 最小导入原则（先跑通再扩展）
- 第一批只导最近 1-3 个月。
- 先导“工厂、人员、款式、工序、订单、采购”，其他历史数据后补。
- 先保证“业务可跑”，再追求“历史全量”。

## 数据隔离验收（必须过）
- A 租户账号登录后，看不到 B 租户订单。
- B 租户账号登录后，看不到 A 租户采购。
- 超管可看到全局，租户管理员只能看本租户。

## 对外话术（销售可直接用）
- 系统开通即交付完整功能。
- 客户只需填模板并调用 6 个上传接口，可直接迁移现有资料上线。
- 第三方对接 App 按需开通，不影响主系统使用。

## 后续增强（可选）
- 做一个“上传 CSV 一键导入”后台页（客户经理用）。
- 增加失败回滚机制（按批次回滚）。
- 增加导入审计日志（谁在什么时候导了什么数据）。
