package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;

/**
 * 扫码记录Service接口
 */
public interface ScanRecordService extends IService<ScanRecord> {

    /**
     * 分页查询扫码记录
     */
    IPage<ScanRecord> queryPage(Map<String, Object> params);

    /**
     * 保存扫码记录
     */
    boolean saveScanRecord(ScanRecord scanRecord);

    /**
     * 根据订单ID查询扫码记录
     */
    IPage<ScanRecord> queryByOrderId(String orderId, int page, int pageSize);

    /**
     * 根据款号查询扫码记录
     */
    IPage<ScanRecord> queryByStyleNo(String styleNo, int page, int pageSize);

    Map<String, Object> getPersonalStats(String operatorId, String scanType);

    /**
     * 根据订单ID删除扫码记录
     * 
     * @param orderId 订单ID
     * @return 删除的记录数
     */
    int deleteByOrderId(String orderId);

    /**
     * 根据订单号删除扫码记录
     * 
     * @param orderNo 订单号
     * @return 删除的记录数
     */
    int deleteByOrderNo(String orderNo);

    /**
     * 获取订单的扫码统计数据
     * 
     * @param orderNo 订单号
     * @return 统计列表 [{color: 'Red', size: 'L', count: 10}, ...]
     */
    java.util.List<Map<String, Object>> getScanStatsByOrder(String orderNo);
}
