package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.mapper.ProductionProcessTrackingMapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 生产工序跟踪记录 Service
 */
@Service
public class ProductionProcessTrackingService extends ServiceImpl<ProductionProcessTrackingMapper, ProductionProcessTracking> {

    /**
     * 批量插入记录
     *
     * @param records 跟踪记录列表
     * @return 插入数量
     */
    public int batchInsert(List<ProductionProcessTracking> records) {
        if (records == null || records.isEmpty()) {
            return 0;
        }
        return baseMapper.batchInsert(records);
    }

    /**
     * 查询某订单的所有跟踪记录
     *
     * @param productionOrderId 订单ID（String类型）
     * @return 跟踪记录列表
     */
    public List<ProductionProcessTracking> getByOrderId(String productionOrderId) {
        return baseMapper.selectByOrderId(productionOrderId);
    }

    /**
     * 查询某菲号的所有工序记录
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @return 跟踪记录列表
     */
    public List<ProductionProcessTracking> getByBundleId(String cuttingBundleId) {
        return baseMapper.selectByBundleId(cuttingBundleId);
    }

    /**
     * 查询某菲号+某工序的跟踪记录
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @param processCode 工序编号
     * @return 跟踪记录（唯一）
     */
    public ProductionProcessTracking getByBundleAndProcess(String cuttingBundleId, String processCode) {
        return baseMapper.selectByBundleAndProcess(cuttingBundleId, processCode);
    }

    /**
     * 按菲号+工序名称查询（processCode不匹配时的fallback）
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @param processName 工序名称
     * @return 跟踪记录（唯一）
     */
    public ProductionProcessTracking getByBundleAndProcessName(String cuttingBundleId, String processName) {
        return baseMapper.selectByBundleAndProcessName(cuttingBundleId, processName);
    }

    /**
     * 删除订单的所有跟踪记录（重新初始化时使用）
     *
     * @param productionOrderId 订单ID
     * @return 删除数量
     */
    public int deleteByOrderId(String productionOrderId) {
        return baseMapper.deleteByOrderId(productionOrderId);
    }
}
