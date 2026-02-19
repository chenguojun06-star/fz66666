package com.fashion.supplychain.integration;

/**
 * 外部电商平台集成服务接口
 * 定义与第三方平台交互的标准行为
 */
public interface ExternalPlatformService {

    /**
     * 获取平台名称 (e.g., "Shopify", "Taobao")
     */
    String getPlatformName();

    /**
     * 同步库存到外部平台
     *
     * @param skuCode  SKU编码
     * @param quantity 当前库存数量
     * @return 是否同步成功
     */
    boolean syncStock(String skuCode, int quantity);
}
