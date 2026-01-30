package com.fashion.supplychain.stock.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;

import java.util.Map;

public interface SampleStockService extends IService<SampleStock> {
    
    IPage<SampleStock> queryPage(Map<String, Object> params);

    /**
     * 样衣入库（新增或增加数量）
     */
    void inbound(SampleStock stock);

    /**
     * 借出样衣
     */
    void loan(SampleLoan loan);

    /**
     * 归还样衣
     */
    void returnSample(String loanId, Integer returnQuantity, String remark);
}
