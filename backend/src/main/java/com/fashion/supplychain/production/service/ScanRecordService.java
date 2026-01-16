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
}
