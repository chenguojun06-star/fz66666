package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ScanRecord;
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
                        "  v.ironing_start_time AS ironingStartTime,",
                        "  v.ironing_end_time AS ironingEndTime,",
                        "  v.ironing_operator_name AS ironingOperatorName,",
                        "  v.secondary_process_start_time AS secondaryProcessStartTime,",
                        "  v.secondary_process_end_time AS secondaryProcessEndTime,",
                        "  v.secondary_process_operator_name AS secondaryProcessOperatorName,",
                        "  v.packaging_start_time AS packagingStartTime,",
                        "  v.packaging_end_time AS packagingEndTime,",
                        "  v.packaging_operator_name AS packagingOperatorName,",
                        "  v.quality_start_time AS qualityStartTime,",
                        "  v.quality_end_time AS qualityEndTime,",
                        "  v.quality_operator_name AS qualityOperatorName,",
                        "  v.quality_quantity AS qualityQuantity,",
                        "  v.warehousing_start_time AS warehousingStartTime,",
                        "  v.warehousing_end_time AS warehousingEndTime,",
                        "  v.warehousing_operator_name AS warehousingOperatorName,",
                        "  v.warehousing_quantity AS warehousingQuantity",
                        "FROM v_production_order_flow_stage_snapshot v",
                        "WHERE v.order_id IN",
                        "<foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
                        "</script>"
        })
        List<Map<String, Object>> selectFlowStageSnapshot(@Param("orderIds") List<String> orderIds);

        @Select({
                        "<script>",
                        "SELECT",
                        "  v.order_id AS orderId,",
                        "  v.stage_name AS stageName,",
                        "  v.done_quantity AS doneQuantity,",
                        "  v.last_scan_time AS lastScanTime",
                        "FROM v_production_order_stage_done_agg v",
                        "WHERE v.order_id IN",
                        "<foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
                        "</script>"
        })
        List<Map<String, Object>> selectStageDoneAgg(@Param("orderIds") List<String> orderIds);

        @Select({
                        "<script>",
                        "SELECT",
                        "  COUNT(CASE WHEN DATE(scan_time) = CURDATE() THEN 1 END) AS todayCount,",
                        "  COUNT(DISTINCT CASE WHEN DATE(scan_time) = CURDATE() THEN order_id END) AS orderCount,",
                        "  COALESCE(SUM(CASE WHEN DATE(scan_time) = CURDATE() THEN quantity ELSE 0 END), 0) AS totalQuantity,",
                        "  COALESCE(SUM(CASE WHEN DATE(scan_time) = CURDATE() THEN COALESCE(NULLIF(total_amount, 0), NULLIF(scan_cost, 0), unit_price * quantity, 0) ELSE 0 END), 0) AS totalAmount",
                        "FROM t_scan_record",
                        "WHERE operator_id = #{operatorId}",
                        "  AND scan_result = 'success'",
                        "  AND quantity &gt; 0",
                        "  AND order_id NOT IN (SELECT id FROM t_production_order WHERE status IN ('closed', 'cancelled', 'completed', 'archived') OR delete_flag = 1)",
                        "<if test='scanType != null and scanType != \"\"'>",
                        "  AND scan_type = #{scanType}",
                        "</if>",
                        "</script>"
        })
        Map<String, Object> selectPersonalStats(@Param("operatorId") String operatorId,
                        @Param("scanType") String scanType);

        @Select({
                        "<script>",
                        "SELECT",
                        "  sr.order_id AS orderId,",
                        "  sr.order_no AS orderNo,",
                        "  sr.style_no AS styleNo,",
                        "  sr.operator_id AS operatorId,",
                        "  sr.operator_name AS operatorName,",
                        "  COALESCE(NULLIF(TRIM(sr.process_name), ''), NULLIF(TRIM(sr.progress_stage), ''), '未知环节') AS processName,",
                        "  sr.scan_type AS scanType,",
                        "  COALESCE(SUM(sr.quantity), 0) AS quantity,",
                        "  COALESCE(SUM(sr.total_amount), 0) AS totalAmount",
                        "FROM t_scan_record sr",
                        "WHERE sr.scan_result = 'success'",
                        "  AND sr.quantity &gt; 0",
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
                        "  AND (sr.process_name = #{processName} OR sr.progress_stage = #{processName})",
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
                        @Param("includeSettled") boolean includeSettled);
}
