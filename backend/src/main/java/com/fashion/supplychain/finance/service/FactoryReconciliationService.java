package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.FactoryReconciliation;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;
import com.fashion.supplychain.finance.entity.DeductionItem;
import java.util.List;

/**
 * 加工厂对账Service接口
 */
public interface FactoryReconciliationService extends IService<FactoryReconciliation> {
    
    /**
     * 分页查询加工厂对账
     */
    IPage<FactoryReconciliation> queryPage(Map<String, Object> params);
    
    /**
     * 根据ID查询加工厂对账详情
     */
    FactoryReconciliation getDetailById(String id);
    
    /**
     * 保存或更新加工厂对账
     */
    boolean saveOrUpdateReconciliation(FactoryReconciliation reconciliation, List<DeductionItem> deductionItems);
    
    /**
     * 根据ID删除加工厂对账
     */
    boolean deleteById(String id);
    
    /**
     * 更新对账状态
     */
    boolean updateStatus(String id, String status);
    
    /**
     * 根据ID查询扣款项列表
     */
    List<DeductionItem> getDeductionItemsById(String reconciliationId);
}
