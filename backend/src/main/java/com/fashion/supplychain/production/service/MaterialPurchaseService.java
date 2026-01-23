package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.MaterialPurchase;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public interface MaterialPurchaseService extends IService<MaterialPurchase> {

    class ArrivalStats {
        private int plannedQty;
        private int arrivedQty;
        private int effectiveArrivedQty;
        private BigDecimal plannedAmount;
        private BigDecimal arrivedAmount;
        private int arrivalRate;

        public int getPlannedQty() {
            return plannedQty;
        }

        public void setPlannedQty(int plannedQty) {
            this.plannedQty = plannedQty;
        }

        public int getArrivedQty() {
            return arrivedQty;
        }

        public void setArrivedQty(int arrivedQty) {
            this.arrivedQty = arrivedQty;
        }

        public int getEffectiveArrivedQty() {
            return effectiveArrivedQty;
        }

        public void setEffectiveArrivedQty(int effectiveArrivedQty) {
            this.effectiveArrivedQty = effectiveArrivedQty;
        }

        public BigDecimal getPlannedAmount() {
            return plannedAmount;
        }

        public void setPlannedAmount(BigDecimal plannedAmount) {
            this.plannedAmount = plannedAmount;
        }

        public BigDecimal getArrivedAmount() {
            return arrivedAmount;
        }

        public void setArrivedAmount(BigDecimal arrivedAmount) {
            this.arrivedAmount = arrivedAmount;
        }

        public int getArrivalRate() {
            return arrivalRate;
        }

        public void setArrivalRate(int arrivalRate) {
            this.arrivalRate = arrivalRate;
        }
    }

    IPage<MaterialPurchase> queryPage(Map<String, Object> params);

    boolean deleteById(String id);

    boolean saveBatchPurchases(List<MaterialPurchase> purchases);

    /**
     * 保存物料采购记录并更新生产订单物料到位率
     * 
     * @param materialPurchase 物料采购实体
     * @return 是否保存成功
     */
    boolean savePurchaseAndUpdateOrder(MaterialPurchase materialPurchase);

    /**
     * 更新物料采购记录并更新生产订单物料到位率
     * 
     * @param materialPurchase 物料采购实体
     * @return 是否更新成功
     */
    boolean updatePurchaseAndUpdateOrder(MaterialPurchase materialPurchase);

    /**
     * 更新物料到货数量并更新生产订单物料到位率
     * 
     * @param id              物料采购ID
     * @param arrivedQuantity 到货数量
     * @return 是否更新成功
     */
    boolean updateArrivedQuantity(String id, Integer arrivedQuantity, String remark);

    boolean existsActivePurchaseForOrder(String orderId);

    List<MaterialPurchase> previewDemandByOrderId(String orderId);

    List<MaterialPurchase> generateDemandByOrderId(String orderId, boolean overwrite);

    boolean receivePurchase(String purchaseId, String receiverId, String receiverName);

    boolean confirmReturnPurchase(String purchaseId, String confirmerId, String confirmerName, Integer returnQuantity);

    boolean resetReturnConfirm(String purchaseId, String reason, String operatorId, String operatorName);

    int computeEffectiveArrivedQuantity(int purchaseQty, int arrivedQty);

    ArrivalStats computeArrivalStatsByOrderId(String orderId);

    ArrivalStats computeArrivalStats(List<MaterialPurchase> purchases);

    /**
     * 删除指定生产订单关联的所有采购任务
     * @param orderId 生产订单ID
     * @return 是否成功
     */
    boolean deleteByOrderId(String orderId);

    String resolveMaterialId(MaterialPurchase purchase);
}
