#!/bin/bash

# ==============================================
# Flyway Schema 完整性验证测试
# 验证关键业务表的必要列是否已正确添加
# 防止 Flyway Silent Failure（版本号冲突/SET @s陷阱）
# ==============================================

set -e

echo "============================================="
echo "Flyway Schema 完整性验证"
echo "时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

PASS=0
FAIL=0
WARN=0

pass_test() {
    echo "  ✅ PASS: $1"
    ((PASS++))
}

fail_test() {
    echo "  ❌ FAIL: $1"
    ((FAIL++))
}

warn_test() {
    echo "  ⚠️  WARN: $1"
    ((WARN++))
}

check_column() {
    local table=$1
    local column=$2
    local desc=$3

    exists=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e \
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='${column}';" 2>/dev/null || echo "0")

    if [ "$exists" = "1" ]; then
        pass_test "${table}.${column} 存在"
    else
        fail_test "${table}.${column} 不存在 - $desc"
    fi
}

check_index() {
    local table=$1
    local index=$2
    local desc=$3

    exists=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e \
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND INDEX_NAME='${index}';" 2>/dev/null || echo "0")

    if [ "$exists" = "1" ]; then
        pass_test "${table}.${index} 索引存在"
    else
        warn_test "${table}.${index} 索引不存在 - $desc"
    fi
}

echo "============================================="
echo "步骤1：协作任务表字段验证 (t_collaboration_task)"
echo "============================================="

echo "验证 V202705020001 补偿的字段..."

check_column "t_collaboration_task" "task_status" "任务状态"
check_column "t_collaboration_task" "priority" "优先级"
check_column "t_collaboration_task" "assignee_name" "指派人姓名"
check_column "t_collaboration_task" "acceptance_criteria" "验收标准"
check_column "t_collaboration_task" "escalated_at" "升级时间"
check_column "t_collaboration_task" "escalated_to" "升级至"
check_column "t_collaboration_task" "source_type" "来源类型"
check_column "t_collaboration_task" "source_instruction" "来源指令"
check_column "t_collaboration_task" "completion_note" "完成备注"
check_column "t_collaboration_task" "completed_at" "完成时间"

echo ""
echo "验证索引..."
check_index "t_collaboration_task" "idx_collab_status" "任务状态索引"
check_index "t_collaboration_task" "idx_collab_priority_due" "优先级+截止日期索引"
check_index "t_collaboration_task" "idx_collab_assignee" "指派人索引"
check_index "t_collaboration_task" "idx_collab_tenant_status" "租户+状态复合索引"

echo ""
echo "============================================="
echo "步骤2：外发工厂发货明细表字段验证"
echo "============================================="

check_column "t_factory_shipment_detail" "received_quantity" "收货数量"
check_column "t_factory_shipment_detail" "qualified_quantity" "合格数量"
check_column "t_factory_shipment_detail" "defective_quantity" "次品数量"
check_column "t_factory_shipment_detail" "returned_quantity" "退货数量"

echo ""
echo "============================================="
echo "步骤3：生产订单关键字段验证"
echo "============================================="

check_column "t_production_order" "completed_quantity" "已完成数量"
check_column "t_production_order" "production_progress" "生产进度"
check_column "t_production_order" "material_arrival_rate" "物料到货率"
check_column "t_production_order" "planned_end_date" "计划完成日期"

echo ""
echo "============================================="
echo "步骤3.5：completed_quantity与入库合格数一致性验证"
echo "============================================="

INCONSISTENT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "
SELECT COUNT(*) FROM (
    SELECT po.id, po.completed_quantity, COALESCE(pw.qualified_sum, 0) as warehousing_qualified
    FROM t_production_order po
    LEFT JOIN (
        SELECT order_id, SUM(qualified_quantity) as qualified_sum
        FROM t_product_warehousing
        WHERE delete_flag=0 AND warehousing_type NOT IN ('quality_scan','quality_scan_scrap')
        GROUP BY order_id
    ) pw ON po.id = pw.order_id
    WHERE po.delete_flag=0
      AND po.status IN ('production','completed','closed')
      AND po.completed_quantity IS NOT NULL
      AND po.completed_quantity > 0
      AND ABS(po.completed_quantity - COALESCE(pw.qualified_sum, 0)) > 5
) t;
" 2>/dev/null || echo "0")

if [ "$INCONSISTENT" = "0" ]; then
    pass_test "completed_quantity与入库合格数一致"
else
    warn_test "发现 $INCONSISTENT 条订单的completed_quantity与入库合格数差异>5（历史数据，可触发进度重算修复）"
fi

echo ""
echo "============================================="
echo "步骤4：扫码记录关键字段验证"
echo "============================================="

check_column "t_scan_record" "progress_stage" "进度阶段"
check_column "t_scan_record" "process_name" "工序名称"
check_column "t_scan_record" "scan_result" "扫码结果"
check_column "t_scan_record" "quantity" "数量"

echo ""
echo "============================================="
echo "步骤5：AI审计日志字段验证"
echo "============================================="

check_column "t_intelligence_audit_log" "self_consistency_agreement" "自一致性评分"
check_column "t_intelligence_audit_log" "guard_warnings" "防护警告"

echo ""
echo "============================================="
echo "步骤6：Flyway 执行历史检查"
echo "============================================="

echo "最近执行的 Flyway 脚本："
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \
    "SELECT version, description, success, installed_on FROM flyway_schema_history WHERE type='SQL' ORDER BY installed_rank DESC LIMIT 10;" 2>/dev/null | while read line; do
    echo "  $line"
done

echo ""
echo "检查 Flyway 失败记录："
FAILED_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e \
    "SELECT COUNT(*) FROM flyway_schema_history WHERE success=0;" 2>/dev/null || echo "0")

if [ "$FAILED_COUNT" = "0" ]; then
    pass_test "无 Flyway 失败记录"
else
    fail_test "发现 $FAILED_COUNT 条 Flyway 失败记录"
    docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \
        "SELECT version, description, error FROM flyway_schema_history WHERE success=0;" 2>/dev/null | while read line; do
        echo "  ❌ $line"
    done
fi

echo ""
echo "============================================="
echo "步骤7：AI指标快照表验证"
echo "============================================="

table_exists=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e \
    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_metrics_snapshot';" 2>/dev/null || echo "0")

if [ "$table_exists" = "1" ]; then
    pass_test "t_ai_metrics_snapshot 表存在"
    check_column "t_ai_metrics_snapshot" "intent_hit_rate" "意图命中率"
    check_column "t_ai_metrics_snapshot" "tool_call_success_rate" "工具调用成功率"
else
    warn_test "t_ai_metrics_snapshot 表不存在（可能是可选模块）"
fi

echo ""
echo "============================================="
echo "测试总结"
echo "============================================="
echo ""
echo "测试结果："
echo "  ✅ 通过: $PASS 项"
echo "  ❌ 失败: $FAIL 项"
echo "  ⚠️  警告: $WARN 项"
echo ""

if [ $FAIL -gt 0 ]; then
    echo "⚠️ 发现关键字段缺失，可能导致功能异常！"
    echo ""
    echo "建议修复步骤："
    echo "  1. 检查对应的 Flyway 脚本是否已执行"
    echo "  2. 如果 Flyway 记录存在但列缺失，执行手动补偿 SQL"
    echo "  3. 验证 INFORMTION_SCHEMA.COLUMNS 确认列已添加"
    exit 1
elif [ $WARN -gt 0 ]; then
    echo "⚠️ 发现非关键警告，请关注"
    exit 0
else
    echo "🎉 所有关键字段验证通过！"
    exit 0
fi
