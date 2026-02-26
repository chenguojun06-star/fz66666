package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;

public interface ProductWarehousingService extends IService<ProductWarehousing> {

        IPage<ProductWarehousing> queryPage(Map<String, Object> params);

        /**
         * 保存质检入库记录并更新生产订单状态
         *
         * @param productWarehousing 质检入库实体
         * @return 是否保存成功
         */
        boolean saveWarehousingAndUpdateOrder(ProductWarehousing productWarehousing);

        /**
         * 更新质检入库记录并更新生产订单状态
         *
         * @param productWarehousing 质检入库实体
         * @return 是否更新成功
         */
        boolean updateWarehousingAndUpdateOrder(ProductWarehousing productWarehousing);

        boolean saveBatchWarehousingAndUpdateOrder(java.util.List<ProductWarehousing> list);

        int sumQualifiedByOrderId(String orderId);

        /**
         * 校验质检入库的入库数量规则。
         *
         * 规则（按裁剪数量计算）：
         * 1) 每次入库数量必须在裁剪数量的 5%~15% 之间；
         * 2) 末次补齐（本次数量==剩余数量）允许小于 5%；
         * 3) 禁止累计入库数量超过裁剪数量上限；
         *
         * @param orderId                    订单ID
         * @param requestWarehousingQuantity 本次入库数量（warehousingQuantity）
         * @param excludeWarehousingId       更新场景排除的入库单ID（可为空）
         * @return 若违反规则返回提示文案，否则返回 null
         */
        String warehousingQuantityRuleViolationMessage(String orderId, Integer requestWarehousingQuantity,
                        String excludeWarehousingId);

        /**
         * 按订单ID软删除所有质检入库记录（设置deleteFlag=1）
         */
        boolean softDeleteByOrderId(String orderId);

        /**
         * SQL聚合：质检入库页面顶部统计（totalCount/totalOrders/totalQuantity/today/qualified等）
         */
        Map<String, Object> getWarehousingStats();
}
