# 生产订单 customer_id 补偿说明

适用范围：当前系统首页 dashboard 已恢复，但云端 `t_production_order` 仍缺 `customer_id` 列；后续若要启用 CRM 客户关联、应收联动、客户订单透视等功能，需要先补齐该列。

## 需要执行的文件

1. 补偿 SQL：deployment/cloud-db-production-order-customer-id-patch-20260316.sql

## 执行目标

这份脚本只做一件事：如果云端 `t_production_order.customer_id` 不存在，就幂等补上该列。

## 重要说明

1. 这不是当前 dashboard 500 的根因修复。
2. 这份脚本只补结构，不回填历史数据。
3. `company` 字段里存的是公司/客户名称，不是稳定的 CRM 客户 ID，所以这里不做自动回填，避免把名称错误写进 `customer_id`。

## 为什么要补这列

虽然当前 dashboard 不依赖 `customer_id`，但下面这些链路后续会用到它：

1. 生产订单与 CRM 客户绑定
2. 应收/财务联动
3. 客户维度订单透视与 Portal 相关能力

仓库里已经存在对应迁移脚本 [V20260319__add_customer_id_to_production_order.sql](../backend/src/main/resources/db/migration/V20260319__add_customer_id_to_production_order.sql)，但当前云端 `flyway_schema_history` 未体现该版本，因此保留一份单独云端补偿 SQL 更稳妥。

## 执行方法

1. 打开微信云托管数据库控制台。
2. 执行 deployment/cloud-db-production-order-customer-id-patch-20260316.sql。
3. 观察结果：
   - `step-1` 若是 `COLUMN_MISSING`：说明云端确实缺列。
   - `step-3` 返回 `customer_id / VARCHAR(36) / YES`：说明补偿完成。

## 执行后建议

1. 先只补结构，不急着回填历史订单的 `customer_id`。
2. 等 CRM 客户主数据确认稳定后，再按业务规则做历史回填。
3. 如果后续要做回填，优先按明确的 CRM 客户主键映射表处理，不要直接把 `company` 名称写入 `customer_id`。

## 补充说明

- 当前 [backend/src/main/java/com/fashion/supplychain/production/entity/ProductionOrder.java](../backend/src/main/java/com/fashion/supplychain/production/entity/ProductionOrder.java) 里 `customerId` 仍映射到 `company` 列，这是历史兼容状态；本次补偿 SQL 只解决云端物理列缺失，不调整业务映射逻辑。
- 当前 [cloudbaserc.json](../cloudbaserc.json) 中云端配置是 `FLYWAY_ENABLED=true`，这份补偿 SQL 仍属于云端现状修复材料，不替代正式迁移治理。
