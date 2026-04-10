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
}
