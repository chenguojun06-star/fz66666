package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.ProductOutstock;
import java.util.Map;

public interface ProductOutstockService extends IService<ProductOutstock> {

    IPage<ProductOutstock> queryPage(Map<String, Object> params);

    boolean saveOutstockAndValidate(ProductOutstock outstock);

    int sumOutstockByOrderId(String orderId);

    /**
     * 按订单ID软删除所有出库记录（设置deleteFlag=1）
     */
    boolean softDeleteByOrderId(String orderId);
}
