package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.DeductionItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

/**
 * 扣款项Mapper接口
 */
@Mapper
public interface DeductionItemMapper extends BaseMapper<DeductionItem> {
    
    /**
     * 根据对账ID查询扣款项列表
     */
    List<DeductionItem> selectByReconciliationId(String reconciliationId);
}
