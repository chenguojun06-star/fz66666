package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ScanRecord;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 扫码记录Mapper接口
 */
@Mapper
public interface ScanRecordMapper extends BaseMapper<ScanRecord> {

        @Select({
                        "<script>",
                        "SELECT",
                        "  v.order_id AS orderId,",
                        "  v.order_start_time AS orderStartTime,",
                        "  v.order_end_time AS orderEndTime,",
                        "  v.order_operator_name AS orderOperatorName,",
                        "  v.procurement_scan_end_time AS procurementScanEndTime,",
                        "  v.procurement_scan_operator_name AS procurementScanOperatorName,",
                        "  v.cutting_start_time AS cuttingStartTime,",
                        "  v.cutting_end_time AS cuttingEndTime,",
                        "  v.cutting_operator_name AS cuttingOperatorName,",
                        "  v.cutting_quantity AS cuttingQuantity,",
                        "  v.sewing_start_time AS sewingStartTime,",
                        "  v.sewing_end_time AS sewingEndTime,",
                        "  v.sewing_operator_name AS sewingOperatorName,",
                        "  v.car_sewing_start_time AS carSewingStartTime,",
                        "  v.car_sewing_end_time AS carSewingEndTime,",
                        "  v.car_sewing_operator_name AS carSewingOperatorName,",
                        "  v.car_sewing_quantity AS carSewingQuantity,",
                        "  v.ironing_start_time AS ironingStartTime,",
                        "  v.ironing_end_time AS ironingEndTime,",
                        "  v.ironing_operator_name AS ironingOperatorName,",
                        "  v.ironing_quantity AS ironingQuantity,",
                        "  v.secondary_process_start_time AS secondaryProcessStartTime,",
                        "  v.secondary_process_end_time AS secondaryProcessEndTime,",
                        "  v.secondary_process_operator_name AS secondaryProcessOperatorName,",
                        "  v.secondary_process_quantity AS secondaryProcessQuantity,",
                        "  v.packaging_start_time AS packagingStartTime,",
                        "  v.packaging_end_time AS packagingEndTime,",
                        "  v.packaging_operator_name AS packagingOperatorName,",
                        "  v.packaging_quantity AS packagingQuantity,",
                        "  v.quality_start_time AS qualityStartTime,",
                        "  v.quality_end_time AS qualityEndTime,",
                        "  v.quality_operator_name AS qualityOperatorName,",
                        "  v.quality_quantity AS qualityQuantity,",
                        "  v.warehousing_start_time AS warehousingStartTime,",
                        "  v.warehousing_end_time AS warehousingEndTime,",
                        "  v.warehousing_operator_name AS warehousingOperatorName,",
                        "  v.warehousing_quantity AS warehousingQuantity",
                        "FROM v_production_order_flow_stage_snapshot v",
                        "WHERE (#{tenantId} IS NULL OR v.tenant_id = #{tenantId})",
                        "  AND v.order_id IN",
                        "<foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
                        "</script>"
        })
        List<Map<String, Object>> selectFlowStageSnapshot(@Param("orderIds") List<String> orderIds, @Param("tenantId") Long tenantId);

        @Select({
                        "<script>",
                        "SELECT",
                        "  v.order_id AS orderId,",
                        "  v.stage_name AS stageName,",
                        "  v.done_quantity AS doneQuantity,",
                        "  v.last_scan_time AS lastScanTime",
                        "FROM v_production_order_stage_done_agg v",
                        "WHERE (#{tenantId} IS NULL OR v.tenant_id = #{tenantId})",
                        "  AND v.order_id IN",
                        "<foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
                        "</script>"
        })
        List<Map<String, Object>> selectStageDoneAgg(@Param("orderIds") List<String> orderIds, @Param("tenantId") Long tenantId);

        @Select({
                        "<script>",
                        "SELECT",
                        "  COUNT(*) AS scanCount,",
                        "  COUNT(DISTINCT sr.order_id) AS orderCount,",
                        "  COALESCE(SUM(sr.quantity), 0) AS totalQuantity,",
                        "  COALESCE(SUM(COALESCE(NULLIF(sr.total_amount, 0), NULLIF(sr.scan_cost, 0), sr.unit_price * sr.quantity, 0)), 0) AS totalAmount",
                        "FROM t_scan_record sr",
                        "WHERE sr.operator_id = #{operatorId}",
                        "  AND sr.scan_result = 'success'",
                        "  AND sr.quantity &gt; 0",
                        "  AND sr.factory_id IS NULL",
                        "  AND (#{tenantId} IS NULL OR sr.tenant_id = #{tenantId})",
                        "<choose>",
                        "  <when test='period != null and period == \"month\"'>",
                        /* 用范围查询替代 YEAR()/MONTH() 函数，允许走 operator_id+scan_time 联合索引 */
                        "    AND sr.scan_time &gt;= DATE_FORMAT(CURDATE(), '%Y-%m-01')",
                        "    AND sr.scan_time &lt;  DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)",
                        "  </when>",
                        "  <otherwise>",
                        /* 用范围查询替代 DATE() 函数，允许走索引 */
                        "    AND sr.scan_time &gt;= CURDATE()",
                        "    AND sr.scan_time &lt;  DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
                        "  </otherwise>",
                        "</choose>",
                        /* 用 NOT EXISTS 替代 NOT IN(subquery)，避免全表子查询导致超时 */
                        "  AND NOT EXISTS (",
                        "    SELECT 1 FROM t_production_order po",
                        "    WHERE po.id = sr.order_id AND (po.status = 'cancelled' OR po.delete_flag = 1)",
                        "  )",
                        "<if test='scanType != null and scanType != \"\"'>",
                        "  AND sr.scan_type = #{scanType}",
                        "</if>",
                        "</script>"
        })
        Map<String, Object> selectPersonalStats(@Param("operatorId") String operatorId,
                        @Param("scanType") String scanType,
                        @Param("period") String period,
                        @Param("tenantId") Long tenantId);

        @Select({
                        "<script>",
                        "SELECT",
                        "  sr.order_id AS orderId,",
                        "  sr.order_no AS orderNo,",
                        "  sr.style_no AS styleNo,",
                        "  sr.operator_id AS operatorId,",
                        "  sr.operator_name AS operatorName,",
                        "  COALESCE(NULLIF(TRIM(sr.process_name), ''), '未知工序') AS processName,",
                        "  sr.scan_type AS scanType,",
                        "  COALESCE(SUM(sr.quantity), 0) AS quantity,",
                        /* 与 selectPersonalStats 保持一致：total_amount → scan_cost → unit_price×quantity 兜底 */
                        "  COALESCE(SUM(COALESCE(NULLIF(sr.total_amount, 0), NULLIF(sr.scan_cost, 0), sr.unit_price * sr.quantity, 0)), 0) AS totalAmount",
                        "FROM t_scan_record sr",
                        "WHERE sr.scan_result = 'success'",
                        "  AND sr.quantity &gt; 0",
                        "  AND sr.factory_id IS NULL",
                        "  AND (#{tenantId} IS NULL OR sr.tenant_id = #{tenantId})",
                        /* 与 selectPersonalStats 保持一致：排除已取消/已删除订单的扫码记录 */
                        "  AND NOT EXISTS (",
                        "    SELECT 1 FROM t_production_order po",
                        "    WHERE po.id = sr.order_id AND (po.status = 'cancelled' OR po.delete_flag = 1)",
                        "  )",
                        "<if test='orderId != null and orderId != \"\"'>",
                        "  AND sr.order_id = #{orderId}",
                        "</if>",
                        "<if test='orderNo != null and orderNo != \"\"'>",
                        "  AND sr.order_no = #{orderNo}",
                        "</if>",
                        "<if test='styleNo != null and styleNo != \"\"'>",
                        "  AND sr.style_no = #{styleNo}",
                        "</if>",
                        "<if test='operatorId != null and operatorId != \"\"'>",
                        "  AND sr.operator_id = #{operatorId}",
                        "</if>",
                        "<if test='operatorName != null and operatorName != \"\"'>",
                        "  AND sr.operator_name = #{operatorName}",
                        "</if>",
                        "<if test='scanType != null and scanType != \"\"'>",
                        "  AND sr.scan_type = #{scanType}",
                        "</if>",
                        "<if test='processName != null and processName != \"\"'>",
                        "  AND sr.process_name = #{processName}",
                        "</if>",
                        "<if test='startTime != null'>",
                        "  AND sr.scan_time &gt;= #{startTime}",
                        "</if>",
                        "<if test='endTime != null'>",
                        "  AND sr.scan_time &lt;= #{endTime}",
                        "</if>",
                        "<if test='includeSettled == false'>",
                        "  AND (sr.payroll_settlement_id IS NULL OR sr.payroll_settlement_id = '')",
                        "  AND (sr.settlement_status IS NULL OR sr.settlement_status &lt;&gt; 'payroll_settled')",
                        "</if>",
                        "GROUP BY",
                        "  sr.order_id,",
                        "  sr.order_no,",
                        "  sr.style_no,",
                        "  sr.operator_id,",
                        "  sr.operator_name,",
                        "  processName,",
                        "  sr.scan_type",
                        "</script>"
        })
        List<Map<String, Object>> selectPayrollAggregation(
                        @Param("orderId") String orderId,
                        @Param("orderNo") String orderNo,
                        @Param("styleNo") String styleNo,
                        @Param("operatorId") String operatorId,
                        @Param("operatorName") String operatorName,
                        @Param("scanType") String scanType,
                        @Param("processName") String processName,
                        @Param("startTime") java.time.LocalDateTime startTime,
                        @Param("endTime") java.time.LocalDateTime endTime,
                        @Param("includeSettled") boolean includeSettled,
                        @Param("tenantId") Long tenantId);

        /**
         * 按菲号聚合扫码类型，统计待质检/待入库的菲号数和数量
         * 仅统计 scan_result='success' 的有效扫码记录
         * 返回: pendingQcBundles, pendingQcQuantity, pendingWarehouseBundles, pendingWarehouseQuantity,
         *       pendingPackagingBundles, pendingPackagingQuantity
         */
        @Select({
                        "SELECT",
                        "  COALESCE(SUM(CASE WHEN has_production = 1 AND has_quality = 0 THEN 1 ELSE 0 END), 0) AS pendingQcBundles,",
                        "  COALESCE(SUM(CASE WHEN has_production = 1 AND has_quality = 0 THEN max_qty ELSE 0 END), 0) AS pendingQcQuantity,",
                        "  COALESCE(SUM(CASE WHEN has_quality_confirmed = 1 AND has_warehouse = 0 AND (has_packaging = 1 OR has_defective_quality = 1) THEN 1 ELSE 0 END), 0) AS pendingWarehouseBundles,",
                        "  COALESCE(SUM(CASE WHEN has_quality_confirmed = 1 AND has_warehouse = 0 AND (has_packaging = 1 OR has_defective_quality = 1) THEN max_qty ELSE 0 END), 0) AS pendingWarehouseQuantity,",
                        "  COALESCE(SUM(CASE WHEN has_quality_confirmed = 1 AND has_packaging = 0 AND has_warehouse = 0 THEN 1 ELSE 0 END), 0) AS pendingPackagingBundles,",
                        "  COALESCE(SUM(CASE WHEN has_quality_confirmed = 1 AND has_packaging = 0 AND has_warehouse = 0 THEN max_qty ELSE 0 END), 0) AS pendingPackagingQuantity",
                        "FROM (",
                        "  SELECT",
                        "    cutting_bundle_id,",
                        "    tenant_id,",
                        "    MAX(CASE WHEN scan_type = 'production' THEN 1 ELSE 0 END) AS has_production,",
                        "    MAX(CASE WHEN scan_type = 'quality' THEN 1 ELSE 0 END) AS has_quality,",
                        "    MAX(CASE WHEN scan_type = 'quality' AND process_code = 'quality_receive' AND confirm_time IS NOT NULL THEN 1 ELSE 0 END) AS has_quality_confirmed,",
                        "    MAX(CASE WHEN scan_type = 'quality' AND process_code = 'quality_receive' AND confirm_time IS NOT NULL AND remark LIKE 'unqualified%' THEN 1 ELSE 0 END) AS has_defective_quality,",
                        "    MAX(CASE WHEN scan_type = 'warehouse' AND (process_code IS NULL OR process_code <> 'warehouse_rollback') THEN 1 ELSE 0 END) AS has_warehouse,",
                        "    MAX(CASE WHEN scan_type = 'production' AND (",
                        "      LOWER(IFNULL(process_code,'')) LIKE '%packaging%'",
                        "      OR process_code IN ('包装','打包','入袋','后整','装箱','封箱','贴标','packing')",
                        "      OR process_name IN ('包装','打包','入袋','后整','装箱','封箱','贴标','packing')",
                        "    ) THEN 1 ELSE 0 END) AS has_packaging,",
                        "    MAX(quantity) AS max_qty",
                        "  FROM t_scan_record",
                        "  WHERE cutting_bundle_id IS NOT NULL",
                        "    AND cutting_bundle_id != ''",
                        "    AND scan_result = 'success'",
                        "    AND (#{tenantId} IS NULL OR tenant_id = #{tenantId})",
                        "  GROUP BY cutting_bundle_id, tenant_id",
                        ") t"
        })
        Map<String, Object> selectBundlePendingStats(@Param("tenantId") Long tenantId);

        /**
         * 批量查询订单最后一次成功扫码时间（用于AI巡检停滞检测）
         */
        @Select({
                "<script>",
                "SELECT sr.order_id AS orderId, MAX(sr.scan_time) AS lastScanTime",
                "FROM t_scan_record sr",
                "WHERE sr.order_id IN",
                "<foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
                "  AND sr.scan_result='success'",
                "  AND (#{tenantId} IS NULL OR sr.tenant_id = #{tenantId})",
                "GROUP BY sr.order_id",
                "</script>"
        })
        List<Map<String, Object>> selectLastScanTimeByOrderIds(@Param("orderIds") List<String> orderIds, @Param("tenantId") Long tenantId);

        /**
         * 按时间段统计各工人扫码产量与金额（用于工资异常检测）
         */
        @Select("SELECT sr.operator_id AS operatorId, sr.operator_name AS operatorName, " +
                "  COUNT(*) AS scanCount, " +
                "  COALESCE(SUM(sr.quantity), 0) AS totalQty, " +
                "  COALESCE(SUM(COALESCE(NULLIF(sr.total_amount,0), NULLIF(sr.scan_cost,0), sr.unit_price*sr.quantity, 0)), 0) AS totalAmount " +
                "FROM t_scan_record sr " +
                "WHERE sr.tenant_id=#{tenantId} AND sr.scan_result='success' AND sr.quantity>0 " +
                "  AND sr.scan_time >= #{startTime} AND sr.scan_time < #{endTime} " +
                "  AND NOT EXISTS (SELECT 1 FROM t_production_order po " +
                "    WHERE po.id=sr.order_id AND (po.status='cancelled' OR po.delete_flag=1)) " +
                "GROUP BY sr.operator_id, sr.operator_name " +
                "ORDER BY totalQty DESC " +
                "LIMIT 200")
        List<Map<String, Object>> selectOperatorStatsBetween(
                @Param("tenantId") Long tenantId,
                @Param("startTime") LocalDateTime startTime,
                @Param("endTime") LocalDateTime endTime);
}
