package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
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
    List<ProductionProcessTracking> selectByOrderId(@Param("productionOrderId") String productionOrderId);

    /**
     * 查询某菲号的所有工序记录
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @return 跟踪记录列表
     */
    List<ProductionProcessTracking> selectByBundleId(@Param("cuttingBundleId") String cuttingBundleId);

    /**
     * 查询某菲号+某工序的跟踪记录
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @param processCode 工序编号
     * @return 跟踪记录（唯一）
     */
    ProductionProcessTracking selectByBundleAndProcess(
        @Param("cuttingBundleId") String cuttingBundleId,
        @Param("processCode") String processCode
    );

    /**
     * 按菲号+工序名称查询（processCode不匹配时的fallback）
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @param processName 工序名称
     * @return 跟踪记录（唯一）
     */
    ProductionProcessTracking selectByBundleAndProcessName(
        @Param("cuttingBundleId") String cuttingBundleId,
        @Param("processName") String processName
    );

    /**
     * 按订单批量查询各工序已扫码数量汇总（用于列表进度条与弹窗保持同源）
     *
     * @param orderIds 订单ID列表
     * @return [{productionOrderId, processName, scannedQty}]
     */
    List<Map<String, Object>> selectScannedQtySummaryByOrderIds(@Param("orderIds") List<String> orderIds);

    /**
     * 删除订单的所有跟踪记录（重新初始化时使用）
     *
     * @param productionOrderId 订单ID
     * @return 删除数量
     */
    int deleteByOrderId(@Param("productionOrderId") String productionOrderId);
}
