package com.fashion.supplychain.stock.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.stock.dto.SampleStockInboundBatchRequest;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;

import java.util.Map;

public interface SampleStockService extends IService<SampleStock> {

    IPage<SampleStock> queryPage(Map<String, Object> params);

    /**
     * 样衣入库（新增或增加数量）
     */
    void inbound(SampleStock stock);

    void inboundBatch(SampleStockInboundBatchRequest request);

    /**
     * 借出样衣
     */
    void loan(SampleLoan loan);

    /**
     * 归还样衣
     */
    void returnSample(String loanId, Integer returnQuantity, String remark);

    void destroy(String stockId, String remark);

    /**
     * 扫码查询 — 根据款号+颜色+尺码查询样衣库存状态及可用操作
     */
    Map<String, Object> scanQuery(String styleNo, String color, String size);

    /**
     * 样衣转成品出库 — 将样衣库存转为成品出库记录
     * @param stockId 样衣库存ID
     * @param quantity 出库数量
     * @param customerName 客户名称
     * @param customerPhone 客户电话
     * @param shippingAddress 收货地址
     * @param trackingNo 快递单号
     * @param expressCompany 快递公司
     * @param remark 备注
     * @return 出库记录ID
     */
    String transferToOutstock(String stockId, Integer quantity, String customerName,
                              String customerPhone, String shippingAddress,
                              String trackingNo, String expressCompany, String remark);
}
