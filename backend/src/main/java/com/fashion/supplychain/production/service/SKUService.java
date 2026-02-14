package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ScanRecord;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;
import java.util.List;

/**
 * SKU服务接口
 *
 * 功能:
 * 1. SKU数据标准化和验证
 * 2. SKU扫码模式检测 (ORDER/BUNDLE/SKU)
 * 3. SKU进度追踪
 * 4. SKU统计和分析
 */
public interface SKUService {

    /**
     * 检测扫码模式
     *
     * @param scanCode 扫码结果
     * @param color 颜色
     * @param size 尺码
     * @return 扫码模式 (ORDER/BUNDLE/SKU)
     */
    String detectScanMode(String scanCode, String color, String size);

    /**
     * 验证SKU数据
     *
     * @param scanRecord 扫码记录
     * @return 验证结果 (true:成功, false:失败)
     */
    boolean validateSKU(ScanRecord scanRecord);

    /**
     * 标准化SKU数据
     *
     * @param orderNo 订单号
     * @param styleNo 款号
     * @param color 颜色
     * @param size 尺码
     * @return 标准化的SKU key (orderNo:styleNo:color:size)
     */
    String normalizeSKUKey(String orderNo, String styleNo, String color, String size);

    /**
     * 获取订单的SKU列表
     *
     * @param orderNo 订单号
     * @return SKU列表
     */
    List<Map<String, Object>> getSKUListByOrder(String orderNo);

    /**
     * 获取SKU的扫码进度
     *
     * @param orderNo 订单号
     * @param styleNo 款号
     * @param color 颜色
     * @param size 尺码
     * @return 扫码进度信息 (totalCount, completedCount, remainingCount, progress%)
     */
    Map<String, Object> getSKUProgress(String orderNo, String styleNo, String color, String size);

    /**
     * 获取订单的整体SKU进度
     *
     * @param orderNo 订单号
     * @return 订单级别的SKU进度
     */
    Map<String, Object> getOrderSKUProgress(String orderNo);

    /**
     * 更新SKU扫码记录
     *
     * @param scanRecord 扫码记录
     * @return 是否成功
     */
    boolean updateSKUScanRecord(ScanRecord scanRecord);

    /**
     * 统计SKU完成情况
     *
     * @param params 查询参数
     * @return 分页结果
     */
    IPage<Map<String, Object>> querySKUStatistics(Map<String, Object> params);

    /**
     * 检查SKU是否已完成
     *
     * @param orderNo 订单号
     * @param styleNo 款号
     * @param color 颜色
     * @param size 尺码
     * @return 是否已完成
     */
    boolean isSKUCompleted(String orderNo, String styleNo, String color, String size);

    /**
     * 生成SKU报告
     *
     * @param orderNo 订单号
     * @return SKU报告信息
     */
    Map<String, Object> generateSKUReport(String orderNo);

    /**
     * 获取订单的工序单价配置（Phase 5新增）
     *
     * @param orderNo 订单号
     * @return 工序单价列表 [{processName: '做领', unitPrice: 2.50}, ...]
     */
    List<Map<String, Object>> getProcessUnitPrices(String orderNo);

    /**
     * 根据工序名称获取单价（Phase 5新增）
     *
     * @param orderNo 订单号
     * @param processName 工序名称 (如 '做领', '上领')
     * @return 单价 (BigDecimal)
     */
    Map<String, Object> getUnitPriceByProcess(String orderNo, String processName);

    /**
     * 为扫码记录附加工序单价信息（Phase 5新增）
     *
     * @param scanRecord 扫码记录
     * @return 是否成功附加
     */
    boolean attachProcessUnitPrice(ScanRecord scanRecord);

    /**
     * 计算订单总工价（Phase 5新增）
     *
     * @param orderNo 订单号
     * @return {totalUnitPrice: 单件工价合计, totalCost: 订单工价合计, quantity: 订单数量}
     */
    Map<String, Object> calculateOrderTotalCost(String orderNo);
}
