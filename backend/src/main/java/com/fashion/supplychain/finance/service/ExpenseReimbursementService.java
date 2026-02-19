package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;

import java.util.Map;

/**
 * 费用报销 Service 接口
 */
public interface ExpenseReimbursementService extends IService<ExpenseReimbursement> {

    /**
     * 分页查询报销单
     */
    IPage<ExpenseReimbursement> queryPage(Map<String, Object> params);

    /**
     * 生成报销单号
     */
    String generateReimbursementNo();
}
