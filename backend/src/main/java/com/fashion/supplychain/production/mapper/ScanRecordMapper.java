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
}
