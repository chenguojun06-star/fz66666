package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.ProductOutstock;
import java.util.Map;

public interface ProductOutstockService extends IService<ProductOutstock> {

    IPage<ProductOutstock> queryPage(Map<String, Object> params);

    boolean saveOutstockAndValidate(ProductOutstock outstock);

    int sumOutstockByOrderId(String orderId);
}
