# 数据库列完整性与优化分析报告

> **审计时间**: 2026-05-02
> **审计范围**: 20 个核心业务表，4 层防御体系交叉验证
> **审计人**: 小云 (AI Agent)

---

## 一、审计方法论

本次审计采用**四层交叉验证**策略，从不同维度核查每个表的列完整性：

```
Layer 1（定义层）: Entity @TableField → "代码期望有什么列"
Layer 2（建表层）: init.sql + Flyway V*.sql → "数据库实际有什么列"  
Layer 3（修复层）: DbColumnDefinitions.COLUMN_FIXES → "启动时自动补什么列"
Layer 4（监控层）: CoreSchemaPreflightChecker.REQUIRED_COLUMNS → "启动时检查什么列"
```

**缺口优先级定义：**

| 等级 | 定义 | 风险 |
|------|------|------|
| **P0** | Entity 期望有列，但不在 init.sql、不在 COLUMN_FIXES、不在 Preflight | 云端部署 → MyBatis-Plus 映射失败 → 实体字段 null → 500 |
| **P1** | Preflight 监控了，但 COLUMN_FIXES 未覆盖 | 发现缺列但无法自动修复，需人工介入 |
| **P2** | Flyway SET @s 静默失败风险 | 迁移"成功"但列实际不存在 |
| **P3** | Entity 字段声明了但使用了 `exist = false` | 正常虚拟字段，无需关注 |

---

## 二、四层防御体系现状

### 2.1 体系架构

```
应用启动
  ├── → [init.sql] Docker 初始化时执行（CREATE TABLE IF NOT EXISTS）
  ├── → [Flyway V*.sql] 数据库迁移（CREATE/ALTER TABLE）
  ├── → [DbColumnRepairRunner] 运行时自动补列（ALTER TABLE ADD COLUMN）
  │        └── 数据来源: DbColumnDefinitions.COLUMN_FIXES（28个表，~450列定义）
  │        └── 数据来源: DbTableDefinitions.TABLE_FIXES（40+个表建表）
  └── → [CoreSchemaPreflightChecker] 启动校验
           └── 数据来源: REQUIRED_COLUMNS（20个表，~190列检查）
```

### 2.2 各层覆盖统计

| 表名 | init.sql 建表 | COLUMN_FIXES 补列 | Preflight 监控 | Entity 字段总数 |
|------|:--:|:--:|:--:|:--:|
| t_production_order | ✅ (30列) | ✅ (43列定义) | ✅ (21列检查) | 60+ (含虚拟) |
| t_style_info | ✅ (14列) | ✅ (35列定义) | ✅ (4列检查) | 60+ (含虚拟) |
| t_material_purchase | ✅ (35列) | ✅ (27列定义) | ✅ (27列检查) | 42 |
| t_scan_record | ✅ (28列) | ✅ (26列定义) | ✅ (20列检查) | 40 |
| t_product_warehousing | ✅ (33列) | ✅ (42列定义) | ✅ (9列检查) | 42 |
| t_factory | ✅ (10列) | ✅ (32列定义) | ✅ (1列检查) | 36 |
| t_cutting_task | ❌ | ✅ (15列定义) | ✅ (1列检查) | 20 |
| t_shipment_reconciliation | ✅ (8列) | ✅ (22列定义) | ✅ (5列检查) | 34 |
| t_payroll_settlement | ✅ (15列) | ✅ (10列定义) | ✅ (13列检查) | 20 |
| t_pattern_production | ❌ | ✅ (14列定义) | ✅ (5列检查) | 23 |
| t_material_pickup_record | ❌ | ✅ (30列定义) | ✅ (30列检查) | 37 |
| t_bill_aggregation | ❌ | ✅ (27列定义) | ✅ (20列检查) | 30 |
| t_receivable | ❌ | ✅ (10列定义) | ✅ (18列检查) | 22 |
| t_intelligence_signal | ❌ | ✅ (无) | ✅ (7列检查) | 19 |
| t_intelligence_metrics | ❌ | ✅ (5列定义) | ✅ (11列检查) | 20 |
| t_mind_push_rule | ❌ | ✅ (2列定义) | ✅ (2列检查) | 10 |
| t_agent_meeting | ❌ | ✅ (无) | ✅ (16列检查) | 17 |
| t_purchase_order_doc | ❌ | ✅ (无) | ✅ (10列检查) | 10 |
| t_ai_job_run_log | ❌ | ✅ (1列定义) | ✅ (11列检查) | 11 |
| t_sys_notice | ❌ | ✅ (无) | ✅ (10列检查) | 10 |

> 注：❌ 表示 init.sql 中无此表的 CREATE TABLE，但表可能通过 Flyway 迁移创建。

---

## 三、P0 级别问题（高概率导致云端 500）

### 3.1 t_shipment_reconciliation — 表结构严重不匹配

**问题**：init.sql 中创建的 `t_shipment_reconciliation` 仅 8 列，但 Entity 期望 34 列。

**init.sql 原始结构**（8列）：
```
id, reconciliation_no, customer, reconciliation_date, total_amount, 
received_amount, outstanding_amount, status, create_time, update_time
```

**Entity 期望但 init.sql 缺失的列**（26列）：
```
customer_id, customer_name, style_id, style_no, style_name, order_id, order_no,
quantity, unit_price, deduction_amount, final_amount, scan_cost, material_cost,
total_cost, profit_amount, profit_margin, is_own_factory, remark,
reconciliation_operator_id, reconciliation_operator_name, reconciliation_time,
auditor_id, auditor_name, audit_time, verified_at, approved_at, paid_at,
re_review_at, re_review_reason, create_by, update_by, tenant_id, delete_flag
```

**COLUMN_FIXES 覆盖情况**：已覆盖 22 列（✅），但可能遗漏：
- `customer_id` — Entity 有声明，COLUMN_FIXES 无
- `customer` — init.sql 列名是 `customer`（存客户名），但 Entity 有 `customerId` + `customerName`
- `quantity` — Entity 有声明，COLUMN_FIXES 无

**风险**：当前 init.sql 结构太基础。如果云端首次部署执行 init.sql 的 CREATE TABLE，之后 COLUMN_FIXES 需逐列补全。若任一补列失败 → 页面 500。

**建议**：
1. 核对 COLUMN_FIXES 是否完整覆盖所有 Entity 字段
2. 检查 `customer` 与 `customer_id` 的命名不一致（可能需要 Flyway ALTER TABLE RENAME）

---

### 3.2 t_cutting_task — 无 init.sql 建表

**问题**：init.sql 中没有 t_cutting_task 的 CREATE TABLE。表依赖 ProductionTableMigrator 或 Flyway 创建。

**COLUMN_FIXES 覆盖**：已定义 15 列补列。

**风险**：如果 `t_cutting_task` 表本身不存在（且 Flyway 未覆盖），整个裁剪模块不可用。

**建议**：确认 Flyway 中有 `CREATE TABLE t_cutting_task`，或将建表语句加入 init.sql。

---

### 3.3 t_pattern_production — 无 init.sql 建表

**问题**：init.sql 中无建表语句。COLUMN_FIXES 覆盖 14 列。

**建议**：与 t_cutting_task 相同，确认 Flyway 覆盖。

---

### 3.4 智能模块表（t_intelligence_signal、t_intelligence_metrics、t_agent_meeting）

**问题**：这三个表在 init.sql 中不存在。它们通过 Flyway 迁移创建：
- V20260307001 → t_intelligence_signal
- V43 / V20260416001 → t_intelligence_metrics
- V20260417001 / V20260319002 → t_agent_meeting

**COLUMN_FIXES 覆盖**：t_intelligence_signal 和 t_agent_meeting 无 COLUMN_FIXES。

**Preflight 监控**：全部三个表都在 REQUIRED_COLUMNS 中。

**风险**：COLUMN_FIXES 不覆盖这两个表 → 如果 Flyway 静默失败或未来有人删除重建，表无法被自动修复。

**建议**：将 t_intelligence_signal、t_agent_meeting 加入 COLUMN_FIXES。

---

## 四、P1 级别问题（Preflight 监控但 COLUMN_FIXES 未修复）

以下列被 CoreSchemaPreflightChecker 监控（启动时检查），但不在 DbColumnDefinitions.COLUMN_FIXES（启动时不自动修复）：

| 表名 | 列名 | Preflight 会告警 | COLUMN_FIXES 会修复 |
|------|------|:--:|:--:|
| t_material_purchase | tenant_id | ✅ | ✅ |
| t_material_purchase | expected_ship_date | ✅ | ✅ |
| t_material_purchase | source_type | ✅ | ✅ |
| t_material_purchase | pattern_production_id | ✅ | ✅ |
| t_material_purchase | evidence_image_urls | ✅ | ✅ |
| t_material_purchase | fabric_composition | ✅ | ✅ |
| t_material_purchase | invoice_urls | ✅ | ✅ |
| t_material_purchase | audit_status / audit_reason / audit_time / audit_operator_id / audit_operator_name | ✅ | ✅ |
| t_production_order | procurement_confirmed_by / * / * / * | ✅ | ✅ |
| t_product_warehousing | repair_status / repair_operator_name / repair_completed_time | ✅ | ✅ |
| t_product_warehousing | unqualified_quantity | ✅ | ✅ |
| t_product_warehousing | scan_mode | ✅ | ✅ |
| t_product_warehousing | warehousing_start_time / warehousing_end_time | ✅ | ✅ |
| t_product_warehousing | quality_operator_id / quality_operator_name | ✅ | ✅ |
| t_pattern_production | review_status | ✅ | ✅ |
| t_pattern_production | receiver_id / pattern_maker_id | ✅ | ✅ |
| t_pattern_production | tenant_id | ✅ | ✅ |
| t_pattern_production | has_secondary_process | ✅ | ✅ |
| t_style_info | fabric_composition / wash_instructions / u_code / fabric_composition_parts | ✅ | ✅ |
| t_mind_push_rule | notify_time_start / notify_time_end | ✅ | ✅ |
| t_intelligence_signal | tenant_id / signal_type / signal_code / signal_level / status / create_time / delete_flag | ✅ | ❌ 无覆盖 |
| t_intelligence_metrics | tenant_id / scene / provider / model / trace_id / success / latency_ms / prompt_tokens / completion_tokens / create_time / delete_flag | ✅ | ✅ (部分) |
| t_agent_meeting | tenant_id / meeting_type / topic / participants / ... (16列) | ✅ | ❌ 无覆盖 |
| t_purchase_order_doc | tenant_id / order_no / image_url / ... (10列) | ✅ | ❌ 无覆盖 |
| t_factory | supplier_type | ✅ | ✅ |
| t_cutting_task | factory_type | ✅ | ✅ |

**结论**：大部分 P1 级别的 gap 已被 COLUMN_FIXES 覆盖。但仍存在 **3 个表的 COLUMN_FIXES 空白区**：
1. **t_intelligence_signal** — 无 COLUMN_FIXES
2. **t_agent_meeting** — 无 COLUMN_FIXES  
3. **t_purchase_order_doc** — 无 COLUMN_FIXES

---

## 五、P2 级别问题（Flyway SET @s 静默失败风险）

### 5.1 已确认的风险文件

两个文件包含 `SET @s` + `PREPARE` 模式：

1. **V202604171800__fix_silent_failure_billing_and_material_columns.sql**
2. **V202611010000__fix_silent_failure_billing_and_material_columns.sql**

根据项目核心铁律（#7 → Flyway SET @s 陷阱）：
> 动态 SQL 内禁止 `COMMENT 'xxx'` / `DEFAULT 'PENDING'` 等字符串字面量 → Flyway 把 `''` 当边界截断 SQL，静默失败

**需要核实**：这两个文件中的动态 SQL 是否包含以下任一模式：
- `DEFAULT '...'` 
- `COMMENT '...'`
- `PREPARE stmt FROM @s` 中包含 `DEFAULT NULL`（`DEFAULT NULL` 语法在某些 MySQL 版本中可能导致 PREPARE 报错）

**建议**：逐行审查这两个文件的 SQL 内容，确认是否有上述陷阱。

---

## 六、Entity ↔ Flyway ↔ ColumnFix 交叉缺口详表

### 6.1 已完整覆盖的表（✅ 安全）

| 表名 | Entity | init.sql | COLUMN_FIXES | Preflight | 风险 |
|------|:--:|:--:|:--:|:--:|:--:|
| t_production_order | 60+ | ✅ 30列 | ✅ 43列 | ✅ 21列 | **低** |
| t_style_info | 60+ | ✅ 14列 | ✅ 35列 | ✅ 4列 | **低** |
| t_material_purchase | 42 | ✅ 35列 | ✅ 27列 | ✅ 27列 | **低** |
| t_scan_record | 40 | ✅ 28列 | ✅ 26列 | ✅ 20列 | **低** |
| t_product_warehousing | 42 | ✅ 33列 | ✅ 42列 | ✅ 9列 | **低** |
| t_factory | 36 | ✅ 10列 | ✅ 32列 | ✅ 1列 | **低** |
| t_material_pickup_record | 37 | ❌ | ✅ 30列 | ✅ 30列 | **低** |
| t_bill_aggregation | 30 | ❌ | ✅ 27列 | ✅ 20列 | **低** |
| t_receivable | 22 | ❌ | ✅ 10列 | ✅ 18列 | **低** |
| t_payroll_settlement | 20 | ✅ 15列 | ✅ 10列 | ✅ 13列 | **低** |
| t_mind_push_rule | 10 | ❌ | ✅ 2列 | ✅ 2列 | **低** |
| t_ai_job_run_log | 11 | ❌ | ✅ 1列 | ✅ 11列 | **低** |
| t_sys_notice | 10 | ❌ | ❌ | ✅ 10列 | **低** |

### 6.2 需关注的表（⚠️ 中风险）

| 表名 | 问题 | 风险 |
|------|------|:--:|
| t_cutting_task | 无 init.sql，依赖 Flyway/ProductionTableMigrator | **中** |
| t_pattern_production | 无 init.sql，依赖 Flyway | **中** |
| t_shipment_reconciliation | init.sql 仅 8 列，Entity 期望 34 列 | **中** |
| t_intelligence_metrics | init.sql 无，COLUMN_FIXES 仅 5 列 | **中** |

### 6.3 存在缺口的表（🔴 需修复）

| 表名 | 缺口 |
|------|------|
| t_intelligence_signal | 无 COLUMN_FIXES 覆盖，需加入 |
| t_agent_meeting | 无 COLUMN_FIXES 覆盖，需加入 |
| t_purchase_order_doc | 无 COLUMN_FIXES 覆盖，需加入 |

---

## 七、补列优化方案

### 7.1 立即行动（P0）

| 序号 | 行动 | 理由 |
|:--:|------|------|
| 1 | 审查 t_shipment_reconciliation 的 COLUMN_FIXES 完整性 | init.sql 结构太基础，Entity 期望 34 列 |
| 2 | 确认 t_cutting_task 的 Flyway CREATE TABLE 存在 | 裁剪核心表，缺失 → 整个裁剪模块不可用 |
| 3 | 确认 t_pattern_production 的 Flyway CREATE TABLE 存在 | 纸样核心表 |

### 7.2 短期优化（P1）

| 序号 | 行动 | 涉及表 |
|:--:|------|------|
| 4 | 将 t_intelligence_signal 加入 COLUMN_FIXES | 补充 ~19 列定义 |
| 5 | 将 t_agent_meeting 加入 COLUMN_FIXES | 补充 ~17 列定义 |
| 6 | 将 t_purchase_order_doc 加入 COLUMN_FIXES | 补充 ~10 列定义 |

### 7.3 风险排查（P2）

| 序号 | 行动 |
|:--:|------|
| 7 | 审查 V202604171800 和 V202611010000 的 SET @s 动态 SQL 内容 |
| 8 | 确认 Flyway `flyway_schema_history` 中这两个文件的 checksum 状态 |

### 7.4 长期加固

| 序号 | 建议 |
|:--:|------|
| 9 | Entity 新增字段时自动生成 COLUMN_FIXES 条目 + Flyway 迁移 |
| 10 | 建立 GitHub Actions 自动化检查：CI 中对比 Entity @TableField vs COLUMN_FIXES |

---

## 八、核心发现摘要

### 防御体系评价

- **COLUMN_FIXES**（自动修复层）：覆盖 28 表 ~450 列，是当前最强大的防御
- **Preflight**（启动校验层）：覆盖 20 表 ~190 列，告警及时
- **init.sql**（基础建表层）：覆盖 9 核心表，但部分结构老旧（如 t_shipment_reconciliation）
- **Flyway**（迁移层）：100+ 迁移文件，但部分存在的 `SET @s` 风险模式需排查

### 当前最危险的场景

> **云端新建实例 → init.sql 执行 t_shipment_reconciliation 的 8 列版本 → Entity 查询映射到 34 个字段 → 20+ 个字段映射为 null → 利润计算、成本统计全部 500**

### 建议优先级

```
P0 (阻断) → 审查 t_shipment_reconciliation COLUMN_FIXES ← 最紧急
P1 (加固) → 补全 t_intelligence_signal / t_agent_meeting / t_purchase_order_doc 的 COLUMN_FIXES
P2 (排查) → 审查 2 个 SET @s Flyway 文件的 SQL 内容
P3 (自动化) → CI 检查 Entity ↔ COLUMN_FIXES ↔ Flyway 一致性
```

---

## 附录：审计数据来源

| 文件 | 行数 | 作用 |
|------|------|------|
| `init.sql` | ~700 | Docker 初始化建表 |
| `CoreSchemaPreflightChecker.java` | 280 | 启动列校验（20 表 ~190 列） |
| `DbColumnDefinitions.java` | 860 | 自动补列定义（28 表 ~450 列） |
| `DbColumnRepairRunner.java` | 224 | 运行时补列执行器 |
| `DbTableDefinitions.java` | 1143 | 自动建表定义（40+ 表） |
| Flyway `V*.sql` | 200+ 文件 | 数据库迁移脚本 |
| Entity 类 (*.java) | 20 个类 | MyBatis-Plus @TableField 列映射 |
