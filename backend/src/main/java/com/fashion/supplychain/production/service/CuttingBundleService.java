package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.CuttingBundle;
import java.util.List;
import java.util.Map;

public interface CuttingBundleService extends IService<CuttingBundle> {

    IPage<CuttingBundle> queryPage(Map<String, Object> params);

    List<CuttingBundle> generateBundles(String orderId, List<Map<String, Object>> bundles);

    CuttingBundle getByQrCode(String qrCode);

    CuttingBundle getByBundleNo(String orderNo, Integer bundleNo);

    Map<String, Object> summarize(String orderNo, String orderId);
}
