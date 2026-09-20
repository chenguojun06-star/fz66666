package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import java.util.Map;

public interface MaterialStockService extends IService<MaterialStock> {

    /**
     * D-474：统计本月出入库金额。
     * 入库金额取入库单 total_amount；出库单表没有金额字段，
     * 按"出库数量 × 该物料当前库存单价"折算。
     *
     * @return key: monthInAmount / monthOutAmount
     */
    java.util.Map<String, java.math.BigDecimal> getMonthInOutAmount(Long tenantId, java.time.LocalDate today);

    IPage<MaterialStock> queryPage(Map<String, Object> params);

    /**
     * 增加库存 (采购入库)
     */
    void increaseStock(MaterialPurchase purchase, java.math.BigDecimal quantity);

    /**
     * 增加库存 (采购入库 - 带仓位)
     * @param purchase 采购单信息（含单价、供应商）
     * @param quantity 入库数量
     * @param warehouseLocation 入库仓位
     */
    void increaseStock(MaterialPurchase purchase, java.math.BigDecimal quantity, String warehouseLocation);

    /**
     * 扣减库存 (生产领料/退货)
     */
    void decreaseStock(MaterialPurchase purchase, int quantity);

    /**
     * 扣减库存 (通用)
     */
    void decreaseStock(String materialId, String color, String size, int quantity);

    /** D-414：领料/出库数量支持小数（int 版本委托到此方法） */
    void decreaseStock(String materialId, String color, String size, java.math.BigDecimal quantity);

    /**
     * 根据库存ID扣减库存
     */
    void decreaseStockById(String stockId, int quantity);

    /** D-410：库存已是 DECIMAL(12,4)，扣减量支持小数（int 版本委托到此方法） */
    void decreaseStockById(String stockId, java.math.BigDecimal quantity);

    /**
     * 根据物料ID列表批量获取库存
     */
    java.util.List<MaterialStock> getStocksByMaterialIds(java.util.List<String> materialIds);

    /**
     * 查询物料批次明细（用于出库时按批次FIFO）
     * @param materialCode 物料编码
     * @param color 颜色（可选）
     * @param size 尺码（可选）
     * @return 批次明细列表，按入库时间升序排列（先进先出）
     */
    java.util.List<MaterialBatchDetailDto> getBatchDetails(String materialCode, String color, String size);

    /**
     * 更新安全库存
     * @param stockId 库存记录ID
     * @param safetyStock 新的安全库存值
     */
    boolean updateSafetyStock(String stockId, Integer safetyStock);

    void decreaseStockForCancelReceive(MaterialPurchase purchase, int quantity);

    /** D-410：回滚量支持小数（到货量已是 DECIMAL，int 版本委托到此方法） */
    void decreaseStockForCancelReceive(MaterialPurchase purchase, java.math.BigDecimal quantity);

    void lockStock(String stockId, int quantity);

    /**
     * D-414：锁定量走小数入口。t_material_stock.locked_quantity 目前仍是 INT，
     * 故按 CEILING 取整锁定（宁可多锁不可少锁，避免小数领料被超卖）；
     * 解锁走 {@link #unlockStock(String, java.math.BigDecimal)}，释放时按实际量归零，不会残留。
     */
    void lockStock(String stockId, java.math.BigDecimal quantity);

    void unlockStock(String stockId, int quantity);

    /** D-414：解锁量支持小数（领料数量已是 DECIMAL，int 版本委托到此方法） */
    void unlockStock(String stockId, java.math.BigDecimal quantity);

    void decreaseStockAndUnlock(String stockId, int quantity);

    /** D-414：出库扣减+解锁支持小数（领料数量已是 DECIMAL，int 版本委托到此方法） */
    void decreaseStockAndUnlock(String stockId, java.math.BigDecimal quantity);

    void updateStockQuantity(String stockId, int delta);

    /** D-414：库存回写量支持小数（int 版本委托到此方法） */
    void updateStockQuantity(String stockId, java.math.BigDecimal delta);

    /**
     * 入库并更新加权单价（仓库自由入库/扫码入库路径）
     * unitPrice 非空且 > 0 时按加权平均更新库存单价，否则仅累加数量
     */
    void updateStockOnInbound(String stockId, java.math.BigDecimal delta, String location,
            java.math.BigDecimal unitPrice, String supplierName);
}
