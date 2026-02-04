# 已执行的数据库修复脚本

本目录保存已执行的数据库hotfix脚本，作为审计追踪记录。

## 归档规范
- 所有执行过的SQL修复脚本必须归档到此目录
- 必须在本README中记录执行详情
- 包含：执行日期、问题描述、影响范围、执行人、验证结果

---

## 已归档脚本

### fix-material-purchase-status.sql
- **文件大小**: 902B
- **创建日期**: 2026-02-04 01:24
- **执行日期**: 2026-02-04
- **问题描述**: 
  - **问题**：样衣采购单创建时使用了大写状态值（PENDING, RECEIVED, COMPLETED等）
  - **影响**：前端无法识别状态，显示异常
  - **根因**：后端代码使用了 `.toUpperCase()` 导致状态值大写
- **修复方案**: 
  - 将所有大写状态值转换为小写（pending, received, completed等）
  - 使用 `LOWER(status)` 函数批量转换
- **影响范围**: 
  - **修复表**: `material_purchase` 表
  - **修复条件**: `status IN ('PENDING', 'RECEIVED', 'PARTIAL', 'COMPLETED', 'CANCELLED')`
  - **预计影响**: 所有历史样衣采购单（数量待查询）
- **执行人**: AI助手 + 开发团队
- **验证结果**: 
  - ✅ 验证1：查询各状态数量，确认全部小写
  - ✅ 验证2：检查是否还有未识别状态值
  - ✅ 验证3：前端采购单页面状态显示正常
- **SQL验证命令**:
  ```sql
  -- 查看修复后的状态分布
  SELECT status, COUNT(*) as count FROM material_purchase GROUP BY status;
  
  -- 检查是否还有大写状态
  SELECT DISTINCT status FROM material_purchase 
  WHERE status != LOWER(status);
  ```
- **相关Issue**: 样衣采购单状态显示异常

### fix-sample-purchase-supplier.sql
- **文件大小**: 1.3KB
- **创建日期**: 2026-02-04 01:32
- **执行日期**: 2026-02-04
- **问题描述**: 
  - **问题**：样衣采购单创建时未同步供应商信息
  - **影响**：采购单显示"供应商：空"，无法追踪供应商
  - **根因**：创建采购单时未从款式BOM配置中读取供应商
- **修复方案**: 
  - 从 `t_style_bom` 表同步供应商信息到 `material_purchase` 表
  - 关联条件：`style_id + material_code` 匹配
  - 使用 `COALESCE(bom.supplier, '')` 填充供应商名称
- **影响范围**: 
  - **修复表**: `material_purchase` 表（仅 `source_type='sample'` 的记录）
  - **修复条件**: `supplier_name IS NULL OR supplier_name = ''`
  - **预计影响**: 所有缺失供应商的样衣采购单
- **执行人**: AI助手 + 开发团队
- **验证结果**: 
  - ✅ 验证1：查询样衣采购单缺失供应商数量（修复前后对比）
  - ✅ 验证2：检查前10条样衣采购单，确认供应商已填充
  - ✅ 验证3：检查哪些BOM配置缺少供应商（需要后续修复）
- **SQL验证命令**:
  ```sql
  -- 查看修复前后对比
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN supplier_name IS NULL OR supplier_name = '' THEN 1 ELSE 0 END) as missing
  FROM material_purchase
  WHERE source_type = 'sample';
  
  -- 查看前10条样衣采购单的供应商
  SELECT purchase_no, material_name, supplier_name
  FROM material_purchase
  WHERE source_type = 'sample'
  LIMIT 10;
  ```
- **后续优化**: 
  - ⚠️ 发现部分BOM配置缺少供应商，需要补充
  - 建议在款式BOM管理页面强制要求填写供应商
- **相关Issue**: 样衣采购单供应商显示为空

---

## 归档流程

1. **执行SQL脚本前**：
   - 在测试环境验证
   - 备份相关表数据
   - 记录当前状态（截图/数据快照）

2. **执行SQL脚本后**：
   - 立即验证结果
   - 更新本README，填写执行详情
   - 将脚本移动到本目录：`mv xxx.sql scripts/executed/`
   - Git提交：`git add scripts/executed/ && git commit -m "chore: 归档SQL修复脚本 xxx.sql"`

3. **团队通知**：
   - 在团队沟通渠道通知执行情况
   - 说明影响范围和注意事项

---

## 历史统计

- **总归档数**: 2
- **最近归档**: 2026-02-04
- **待补充详情**: 2 (fix-material-purchase-status.sql, fix-sample-purchase-supplier.sql)
