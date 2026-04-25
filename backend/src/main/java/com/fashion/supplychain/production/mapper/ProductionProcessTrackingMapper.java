package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 生产工序跟踪记录 Mapper
 */
@Mapper
public interface ProductionProcessTrackingMapper extends BaseMapper<ProductionProcessTracking> {

    /**
     * 批量插入记录（裁剪完成时调用）
     *
     * @param records 跟踪记录列表
     * @return 插入数量
     */
    int batchInsert(@Param("records") List<ProductionProcessTracking> records);

    /**
     * 查询某订单的所有跟踪记录
     *
     * @param productionOrderId 订单ID（String类型）
     * @return 跟踪记录列表
     */
    List<ProductionProcessTracking> selectByOrderId(@Param("productionOrderId") String productionOrderId, @Param("tenantId") Long tenantId);

    List<ProductionProcessTracking> selectByBundleId(@Param("cuttingBundleId") String cuttingBundleId, @Param("tenantId") Long tenantId);

    ProductionProcessTracking selectByBundleAndProcess(
        @Param("cuttingBundleId") String cuttingBundleId,
        @Param("processCode") String processCode,
        @Param("tenantId") Long tenantId
    );

    ProductionProcessTracking selectByBundleAndProcessName(
        @Param("cuttingBundleId") String cuttingBundleId,
        @Param("processName") String processName,
        @Param("tenantId") Long tenantId
    );

    List<Map<String, Object>> selectScannedQtySummaryByOrderIds(@Param("orderIds") List<String> orderIds, @Param("tenantId") Long tenantId);

    List<Map<String, Object>> selectScannedBundleCountByOrderIds(@Param("orderIds") List<String> orderIds, @Param("tenantId") Long tenantId);

    @Delete("DELETE FROM t_production_process_tracking WHERE production_order_no = #{productionOrderNo} AND tenant_id = #{tenantId}")
    int deleteByOrderNo(@Param("productionOrderNo") String productionOrderNo, @Param("tenantId") Long tenantId);
}
